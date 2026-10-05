import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { ler } from './armazenamento.js';
import { arquitetoDoOrcamento } from './importacoes.js';
import { classificarImportacao, atualizarTotais } from './classificacao.js';
import { parseDae } from '../src/lib/dae/parser.js';
import { calcularNoBanco } from './calculo.js';
import { motivoSomado, somadoEm } from '../src/lib/texto.js';

const falha = (msg: string, status = 400) => Object.assign(new Error(msg), { status });
const CLASSES = ['PECA', 'FERRAGEM', 'INSUMO', 'IGNORAR', 'DESCONHECIDO'];
/** Campos que a revisão pode alterar (whitelist) */
const CAMPOS = ['classificacao', 'tipo_peca_id', 'materia_prima_id', 'fita_borda_id', 'material_id', 'insumo_id', 'quantidade', 'comprimento_mm', 'largura_mm', 'espessura_mm', 'parent_id'];
/** Nomes que o SketchUp dá a grupos e instâncias sem nome: na peça, vale o nome do tipo */
const GENERICO = /^(group|instance|grupo|componente|component)[ _#-]?\d*$/i;

async function importacao(id: string | number) {
  const [[imp]] = await pool.query<any[]>('SELECT * FROM importacoes_dae WHERE id = ?', [id]);
  if (!imp) throw falha('Importação não encontrada.', 404);
  return imp;
}

export function createRevisaoRouter() {
  const router = Router();

  /**
   * Edição em massa na revisão. Marca os objetos como revisados (a reclassificação não mexe mais neles)
   * e, com `lembrar`, cria o mapeamento a partir do primeiro objeto (global ou do arquiteto do orçamento).
   */
  router.put('/importacoes/:id/objetos', async (req: Request, res: Response) => {
    try {
      const imp = await importacao(req.params.id);
      const ids: number[] = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean);
      if (!ids.length) throw falha('Escolha ao menos um objeto.');
      const campos: Record<string, any> = {};
      for (const [k, v] of Object.entries(req.body?.campos ?? {})) {
        if (!CAMPOS.includes(k)) throw falha(`Campo "${k}" não pode ser alterado na revisão.`);
        campos[k] = v === '' ? null : v;
      }
      if (campos.classificacao && !CLASSES.includes(campos.classificacao)) throw falha('Classificação inválida.');
      if (campos.quantidade !== undefined && !(Number(campos.quantidade) >= 1)) throw falha('A quantidade precisa ser pelo menos 1.');
      for (const m of ['comprimento_mm', 'largura_mm', 'espessura_mm']) if (campos[m] !== undefined && !(Number(campos[m]) > 0)) throw falha('As medidas precisam ser maiores que zero.');
      if (campos.parent_id) {
        const [[mv]] = await pool.query<any[]>("SELECT id FROM importacao_objetos WHERE id = ? AND importacao_id = ? AND classificacao = 'MOVEL'", [campos.parent_id, imp.id]);
        if (!mv) throw falha('O móvel escolhido não é desta importação.');
      }

      const cols = Object.keys(campos);
      await pool.query(
        `UPDATE importacao_objetos SET ${cols.map((c) => `${c} = ?, `).join('')}revisado = 1, confianca = 100,
           motivo_classificacao = 'Revisado manualmente' WHERE importacao_id = ? AND id IN (?) AND classificacao NOT IN ('MOVEL', 'GRUPO')`,
        [...cols.map((c) => campos[c]), imp.id, ids],
      );

      // "Lembrar esta regra": mapeamento a partir do objeto já corrigido
      const l = req.body?.lembrar;
      let mapeamentoId: number | null = null;
      if (l) {
        if (!['MATERIAL', 'COMPONENTE', 'NO'].includes(l.origem)) throw falha('Origem da regra inválida.');
        const padrao = String(l.padrao ?? '').trim();
        if (!padrao) throw falha('Informe o texto da regra.');
        const [[o]] = await pool.query<any[]>('SELECT * FROM importacao_objetos WHERE id = ? AND importacao_id = ?', [ids[0], imp.id]);
        const acao = o.classificacao === 'DESCONHECIDO' ? null : o.classificacao;
        if (!acao) throw falha('Classifique o objeto antes de lembrar a regra.');
        if (acao === 'FERRAGEM' && !o.material_id) throw falha('Escolha a ferragem antes de lembrar a regra.');
        if (acao === 'INSUMO' && !o.insumo_id) throw falha('Escolha o insumo antes de lembrar a regra.');
        const arquiteto = l.escopo === 'ARQUITETO' ? await arquitetoDoOrcamento(imp.orcamento_id) : null;
        if (l.escopo === 'ARQUITETO' && !arquiteto) throw falha('A importação não está num orçamento com arquiteto: a regra só pode ser global.');
        const peca = acao === 'PECA';
        const [r] = await pool.query<any>(
          `INSERT INTO mapeamentos_dae (origem, padrao, modo_comparacao, prioridade, acao, arquiteto_id, materia_prima_id, fita_borda_id, tipo_peca_id, material_id, insumo_id)
           VALUES (?, ?, 'EXATO', 20, ?, ?, ?, ?, ?, ?, ?)`,
          [l.origem, padrao.slice(0, 150), acao, arquiteto, peca ? o.materia_prima_id : null, peca ? o.fita_borda_id : null, peca ? o.tipo_peca_id : null, acao === 'FERRAGEM' ? o.material_id : null, acao === 'INSUMO' ? o.insumo_id : null],
        );
        mapeamentoId = Number(r.insertId);
        await pool.query('UPDATE importacao_objetos SET mapeamento_id = ? WHERE importacao_id = ? AND id IN (?)', [mapeamentoId, imp.id, ids]);
      }
      await atualizarTotais(imp.id);
      res.json({ success: true, mapeamentoId });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  /**
   * Junta os marcados num objeto só, com a soma das quantidades; os demais viram "Ignorar" (continuam no 3D e na
   * árvore, mas não entram no orçamento). Se uma das marcadas já é uma junção, ela é a principal e só recebe
   * objetos "A classificar"; senão, a principal é a primeira marcada. Todos ficam revisados.
   */
  router.post('/importacoes/:id/juntar', async (req: Request, res: Response) => {
    try {
      const imp = await importacao(req.params.id);
      const ids: number[] = [...new Set<number>((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Boolean))];
      const nome = String(req.body?.nome ?? '').trim().slice(0, 255);
      if (ids.length < 2) throw falha('Marque ao menos dois objetos para juntar.');
      if (!nome) throw falha('Informe o nome do objeto.');
      const [objs] = await pool.query<any[]>(
        "SELECT id, nome, quantidade, classificacao FROM importacao_objetos WHERE importacao_id = ? AND id IN (?) AND classificacao NOT IN ('MOVEL', 'GRUPO')",
        [imp.id, ids],
      );
      if (objs.length !== ids.length) throw falha('Há objetos marcados que não são desta importação ou são móveis/grupos.');
      const marcados = ids.map((id) => objs.find((o) => Number(o.id) === id)!);
      // Objetos já somados em alguma das marcadas (de junções anteriores): passam a apontar para a principal
      const [somados] = await pool.query<any[]>(
        "SELECT id, classificacao, motivo_classificacao FROM importacao_objetos WHERE importacao_id = ? AND classificacao = 'IGNORAR' AND motivo_classificacao LIKE 'Somado em %'",
        [imp.id],
      );
      const anteriores = somados.filter((s) => !ids.includes(Number(s.id)) && marcados.some((m) => somadoEm(s, m)));
      const juncoes = marcados.filter((m) => anteriores.some((s) => somadoEm(s, m)));
      // Numa peça já juntada só entram objetos ainda a classificar
      if (juncoes.length > 1) throw falha('Marque só uma peça já juntada: as outras peças marcadas também são junções.');
      if (juncoes.length && marcados.some((m) => m !== juncoes[0] && m.classificacao !== 'DESCONHECIDO')) {
        throw falha('Numa peça já juntada só entram objetos que estão em "A classificar".');
      }
      const principal = Number((juncoes[0] ?? marcados[0]).id);
      const total = marcados.reduce((s, o) => s + Number(o.quantidade), 0);
      const ignorar = [...ids.filter((id) => id !== principal), ...anteriores.map((s) => Number(s.id))];

      await pool.query(
        `UPDATE importacao_objetos SET nome = ?, nome_definicao = ?, quantidade = ?, revisado = 1, confianca = 100,
           motivo_classificacao = ? WHERE id = ?`,
        [nome, nome, total, `Junção de ${ignorar.length + 1} objetos`, principal],
      );
      await pool.query(
        `UPDATE importacao_objetos SET classificacao = 'IGNORAR', revisado = 1, confianca = 100, motivo_classificacao = ?
          WHERE importacao_id = ? AND id IN (?)`,
        // O "(nº id)" no fim liga o objeto à peça principal (a tela usa para mostrar os objetos juntados)
        [motivoSomado(nome, principal), imp.id, ignorar],
      );
      await atualizarTotais(imp.id);
      res.json({ id: principal, quantidade: total });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  /**
   * Reiniciar: volta a importação ao estado de recém-importada, lendo o .dae de novo (mesmos objetos, campos originais). Apaga do orçamento os móveis
   * gerados por ela (com as peças e os itens deles) e o que mais veio dos objetos; desfaz revisões, junções e edições.
   * Os mapeamentos criados com "Lembrar esta regra" ficam (são cadastros).
   */
  router.post('/importacoes/:id/reiniciar', async (req: Request, res: Response) => {
    const conn = await pool.getConnection();
    try {
      const imp = await importacao(req.params.id);
      if (imp.status === 'ERRO') throw falha('Importação com erro: importe o arquivo de novo.');
      const orcamentoId = imp.orcamento_id ? Number(imp.orcamento_id) : null;
      if (orcamentoId) {
        const [[orc]] = await pool.query<any[]>('SELECT status FROM orcamentos WHERE id = ?', [orcamentoId]);
        if (orc && !['RASCUNHO', 'EM_REVISAO'].includes(orc.status)) throw falha('Só dá para reiniciar a importação de orçamento em rascunho ou em revisão.', 409);
      }
      // Lê e classifica antes de apagar: se o arquivo falhar, nada muda
      const [[cfg]] = await pool.query<any[]>('SELECT arredondamento_medida_mm FROM configuracoes WHERE id = 1');
      const r = parseDae(await ler(imp.arquivo_path), { arredondamentoMm: Number(cfg?.arredondamento_medida_mm ?? 1) });
      const cls = await classificarImportacao(r, await arquitetoDoOrcamento(orcamentoId));

      // Os mesmos objetos (mesmos ids, que a malha do 3D usa), casados com o arquivo como no Reclassificar
      const [linhas] = await pool.query<any[]>('SELECT id, caminho FROM importacao_objetos WHERE importacao_id = ? ORDER BY nivel, id', [imp.id]);
      const ordem = [...r.objetos].sort((a, b) => a.nivel - b.nivel || a.idx - b.idx);
      if (ordem.length !== linhas.length || ordem.some((o, i) => o.caminho.slice(0, 1000) !== linhas[i].caminho)) {
        throw falha('O arquivo guardado não corresponde mais aos objetos desta importação: importe de novo.');
      }
      const idDb: number[] = [];
      ordem.forEach((o, i) => (idDb[o.idx] = Number(linhas[i].id)));
      const n2 = (x: number | undefined) => (x === undefined ? null : x.toFixed(2));

      await conn.beginTransaction();
      const objs = '(SELECT id FROM (SELECT id FROM importacao_objetos WHERE importacao_id = ?) x)';
      await conn.query(`DELETE FROM orcamento_itens WHERE importacao_objeto_id IN ${objs}`, [imp.id]);
      await conn.query(`DELETE FROM orcamento_pecas WHERE importacao_objeto_id IN ${objs}`, [imp.id]);
      // Móveis gerados por esta importação: as peças e os itens deles saem em cascata
      await conn.query('DELETE FROM orcamento_moveis WHERE importacao_id = ?', [imp.id]);
      for (const o of ordem) {
        const c = cls.get(o.idx);
        await conn.query(
          `UPDATE importacao_objetos SET parent_id = ?, nome = ?, nome_definicao = ?, quantidade = ?, comprimento_mm = ?, largura_mm = ?,
             espessura_mm = ?, classificacao = ?, confianca = ?, motivo_classificacao = ?, mapeamento_id = ?, tipo_peca_id = ?,
             materia_prima_id = ?, fita_borda_id = ?, material_id = ?, insumo_id = ?, revisado = 0 WHERE id = ?`,
          [
            o.parent === null ? null : idDb[o.parent],
            o.nome.slice(0, 255),
            o.nomeDefinicao?.slice(0, 255) ?? null,
            o.quantidade,
            n2(c?.comprimento ?? o.medida?.comprimento),
            n2(c?.largura ?? o.medida?.largura),
            n2(o.medida?.espessura),
            c?.classificacao ?? o.classificacao,
            c?.confianca ?? null,
            c?.motivo.slice(0, 255) ?? null,
            c?.mapeamentoId ?? null,
            c?.tipoPecaId ?? null,
            c?.materiaPrimaId ?? null,
            c?.fitaBordaId ?? null,
            c?.materialId ?? null,
            c?.insumoId ?? null,
            idDb[o.idx],
          ],
        );
      }
      await conn.query("UPDATE importacoes_dae SET status = 'REVISAO' WHERE id = ?", [imp.id]);
      await conn.commit();
      await atualizarTotais(imp.id);
      const calculo = orcamentoId ? await calcularNoBanco(orcamentoId).catch((e: Error) => ({ erro: e.message })) : null;
      res.json({ objetos: r.objetos.length, calculo });
    } catch (err: any) {
      await conn.rollback().catch(() => {});
      res.status(err.status || 400).json({ error: err.message });
    } finally {
      conn.release();
    }
  });

  /** Reclassifica com as regras atuais (ex.: depois de criar mapeamentos); objetos já revisados ficam como estão */
  router.post('/importacoes/:id/reclassificar', async (req: Request, res: Response) => {
    try {
      const imp = await importacao(req.params.id);
      if (imp.status === 'ERRO') throw falha('Importação com erro: importe o arquivo de novo.');
      const [[cfg]] = await pool.query<any[]>('SELECT arredondamento_medida_mm FROM configuracoes WHERE id = 1');
      const r = parseDae(await ler(imp.arquivo_path), { arredondamentoMm: Number(cfg?.arredondamento_medida_mm ?? 1) });
      const cls = await classificarImportacao(r, await arquitetoDoOrcamento(imp.orcamento_id));

      // Mesma ordem da gravação: nível a nível, na ordem do parser (ids crescentes)
      const [linhas] = await pool.query<any[]>('SELECT id, caminho, revisado FROM importacao_objetos WHERE importacao_id = ? ORDER BY nivel, id', [imp.id]);
      const ordem = [...r.objetos].sort((a, b) => a.nivel - b.nivel || a.idx - b.idx);
      if (ordem.length !== linhas.length || ordem.some((o, i) => o.caminho.slice(0, 1000) !== linhas[i].caminho)) {
        throw falha('O arquivo guardado não corresponde mais aos objetos desta importação: importe de novo.');
      }
      let n = 0;
      for (let i = 0; i < ordem.length; i++) {
        const c = cls.get(ordem[i].idx);
        if (!c || Number(linhas[i].revisado)) continue;
        await pool.query(
          `UPDATE importacao_objetos SET classificacao = ?, confianca = ?, motivo_classificacao = ?, mapeamento_id = ?, tipo_peca_id = ?,
             materia_prima_id = ?, fita_borda_id = ?, material_id = ?, insumo_id = ?, comprimento_mm = COALESCE(?, comprimento_mm),
             largura_mm = COALESCE(?, largura_mm) WHERE id = ?`,
          [c.classificacao, c.confianca, c.motivo.slice(0, 255), c.mapeamentoId, c.tipoPecaId, c.materiaPrimaId, c.fitaBordaId, c.materialId, c.insumoId, c.comprimento?.toFixed(2) ?? null, c.largura?.toFixed(2) ?? null, linhas[i].id],
        );
        n++;
      }
      await atualizarTotais(imp.id);
      res.json({ reclassificados: n });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  /**
   * Gerar orçamento: móveis, peças (com as fitas padrão do tipo) e itens de ferragem/insumo do modelo.
   * Reimportação: casa as peças já no orçamento por caminho + definição; só mexe nas não editadas à mão.
   * `aplicar` falso devolve só o diff (adicionadas / alteradas / removidas).
   */
  router.post('/importacoes/:id/gerar', async (req: Request, res: Response) => {
    const conn = await pool.getConnection();
    try {
      const imp = await importacao(req.params.id);
      const orcamentoId = Number(req.body?.orcamento_id || imp.orcamento_id);
      if (!orcamentoId) throw falha('Escolha o orçamento.');
      const [[orc]] = await conn.query<any[]>('SELECT id, status FROM orcamentos WHERE id = ?', [orcamentoId]);
      if (!orc) throw falha('Orçamento não encontrado.', 404);
      if (!['RASCUNHO', 'EM_REVISAO'].includes(orc.status)) throw falha('Só orçamentos em rascunho ou em revisão recebem importação.');

      const [objs] = await conn.query<any[]>(
        `SELECT o.*, tp.nome AS tipo_nome, tp.respeita_veio, tp.fita_comp1, tp.fita_comp2, tp.fita_larg1, tp.fita_larg2
           FROM importacao_objetos o LEFT JOIN tipos_peca tp ON tp.id = o.tipo_peca_id
          WHERE o.importacao_id = ? ORDER BY o.id`,
        [imp.id],
      );
      const porId = new Map(objs.map((o) => [Number(o.id), o]));
      const movelDe = (o: any): any | null => {
        for (let p = o.parent_id; p != null; p = porId.get(Number(p))?.parent_id) if (porId.get(Number(p))?.classificacao === 'MOVEL') return porId.get(Number(p));
        return null;
      };

      // Pendências que impedem gerar
      const erros: string[] = [];
      for (const o of objs) {
        if (o.classificacao === 'PECA' && !o.materia_prima_id) erros.push(`${o.caminho}: peça sem chapa`);
        if (o.classificacao === 'PECA' && !(Number(o.comprimento_mm) > 0 && Number(o.largura_mm) > 0 && Number(o.espessura_mm) > 0)) erros.push(`${o.caminho}: peça com medida zerada`);
        if (o.classificacao === 'FERRAGEM' && !o.material_id) erros.push(`${o.caminho}: ferragem sem item do catálogo`);
        if (o.classificacao === 'INSUMO' && !o.insumo_id) erros.push(`${o.caminho}: insumo sem item do catálogo`);
      }
      if (erros.length) return res.status(400).json({ error: `Corrija antes de gerar:\n${erros.slice(0, 20).join('\n')}${erros.length > 20 ? `\n… e mais ${erros.length - 20}` : ''}`, pendencias: erros });

      const uteis = objs.filter((o) => ['PECA', 'FERRAGEM', 'INSUMO'].includes(o.classificacao));
      if (!uteis.length) throw falha('Nenhuma peça, ferragem ou insumo classificado: nada para gerar.');
      const moveisUsados = new Map<string, any>(); // caminho do móvel ('' = avulsos) → objeto MOVEL
      for (const o of uteis) {
        const m = movelDe(o);
        moveisUsados.set(m?.caminho ?? '', m);
      }

      // Móveis importados que já estão no orçamento, pelo caminho do nó de origem
      const [existentes] = await conn.query<any[]>(
        `SELECT m.id, COALESCE(io.caminho, '') AS caminho FROM orcamento_moveis m
           LEFT JOIN importacao_objetos io ON io.id = m.importacao_objeto_id
          WHERE m.orcamento_id = ? AND m.importacao_id IS NOT NULL`,
        [orcamentoId],
      );
      const movelExistente = new Map(existentes.filter((m) => moveisUsados.has(m.caminho)).map((m) => [m.caminho, Number(m.id)]));
      const idsMoveis = [...movelExistente.values()];
      const [pecasAntes] = idsMoveis.length
        ? await conn.query<any[]>(
            `SELECT p.*, COALESCE(io.caminho, '') AS caminho, COALESCE(io.nome_definicao, '') AS definicao FROM orcamento_pecas p
               LEFT JOIN importacao_objetos io ON io.id = p.importacao_objeto_id WHERE p.movel_id IN (?) AND p.importacao_objeto_id IS NOT NULL`,
            [idsMoveis],
          )
        : [[]];
      const chave = (caminho: string, definicao: string | null) => `${caminho}|${definicao ?? ''}`;
      const antes = new Map(pecasAntes.map((p) => [chave(p.caminho, p.definicao), p]));

      const novaPeca = (o: any) => {
        const fita = (lado: string) => (Number(o[lado]) ? o.fita_borda_id : null);
        return {
          tipo_peca_id: o.tipo_peca_id,
          descricao: String(GENERICO.test(o.nome_definicao ?? o.nome) ? o.tipo_nome ?? o.nome : o.nome_definicao ?? o.nome).slice(0, 150),
          materia_prima_id: o.materia_prima_id,
          comprimento_mm: Number(o.comprimento_mm).toFixed(2),
          largura_mm: Number(o.largura_mm).toFixed(2),
          espessura_mm: Number(o.espessura_mm).toFixed(2),
          quantidade: Number(o.quantidade),
          respeita_veio: o.respeita_veio == null ? 1 : Number(o.respeita_veio),
          fita_comp1_id: fita('fita_comp1'),
          fita_comp2_id: fita('fita_comp2'),
          fita_larg1_id: fita('fita_larg1'),
          fita_larg2_id: fita('fita_larg2'),
          importacao_objeto_id: o.id,
        };
      };
      const COMPARAR = ['tipo_peca_id', 'materia_prima_id', 'comprimento_mm', 'largura_mm', 'espessura_mm', 'quantidade', 'fita_comp1_id', 'fita_comp2_id', 'fita_larg1_id', 'fita_larg2_id'] as const;
      const igual = (a: any, b: any) => (a == null && b == null) || String(Number(a)) === String(Number(b));

      const diff = { adicionadas: [] as any[], alteradas: [] as any[], removidas: [] as any[], protegidas: [] as any[] };
      const plano: { o: any; peca: any; antiga: any | null }[] = [];
      const vistas = new Set<string>();
      for (const o of uteis.filter((x) => x.classificacao === 'PECA')) {
        const k = chave(o.caminho, o.nome_definicao);
        vistas.add(k);
        const antiga = antes.get(k) ?? null;
        const peca = novaPeca(o);
        const resumo = { caminho: o.caminho, descricao: peca.descricao, medidas: `${Number(peca.comprimento_mm)} × ${Number(peca.largura_mm)} × ${Number(peca.espessura_mm)}`, quantidade: peca.quantidade };
        if (!antiga) diff.adicionadas.push(resumo);
        else if (Number(antiga.editado_manual)) diff.protegidas.push(resumo);
        else if (COMPARAR.some((c) => !igual(antiga[c], peca[c]))) diff.alteradas.push({ ...resumo, antes: `${Number(antiga.comprimento_mm)} × ${Number(antiga.largura_mm)} × ${Number(antiga.espessura_mm)} (${antiga.quantidade})` });
        plano.push({ o, peca, antiga });
      }
      for (const [k, p] of antes) {
        if (vistas.has(k)) continue;
        (Number(p.editado_manual) ? diff.protegidas : diff.removidas).push({ caminho: p.caminho, descricao: p.descricao, medidas: `${Number(p.comprimento_mm)} × ${Number(p.largura_mm)} × ${Number(p.espessura_mm)}`, quantidade: p.quantidade });
      }
      const resumo = {
        ...diff,
        moveis: moveisUsados.size,
        ferragens: uteis.filter((o) => o.classificacao === 'FERRAGEM').length,
        insumos: uteis.filter((o) => o.classificacao === 'INSUMO').length,
        ignorados: objs.filter((o) => o.classificacao === 'IGNORAR').length,
        desconhecidos: objs.filter((o) => o.classificacao === 'DESCONHECIDO').length,
      };
      if (!req.body?.aplicar) return res.json(resumo);

      // Medidas externas dos móveis pela malha do visualizador (caixa das peças, nos eixos do arquivo)
      const caixas = await caixasDosMoveis(imp.id, objs, movelDe, imp.eixo_up);

      await conn.beginTransaction();
      const idMovel = new Map<string, number>();
      let ordem = 0;
      for (const [caminho, m] of moveisUsados) {
        const cx = caixas.get(caminho);
        const dados = [m?.id ?? null, cx?.largura ?? null, cx?.altura ?? null, cx?.profundidade ?? null];
        if (movelExistente.has(caminho)) {
          const id = movelExistente.get(caminho)!;
          await conn.query('UPDATE orcamento_moveis SET importacao_id = ?, importacao_objeto_id = ?, largura_mm = ?, altura_mm = ?, profundidade_mm = ? WHERE id = ?', [imp.id, ...dados, id]);
          idMovel.set(caminho, id);
        } else {
          const [r] = await conn.query<any>(
            `INSERT INTO orcamento_moveis (orcamento_id, ambiente_id, importacao_id, importacao_objeto_id, descricao, largura_mm, altura_mm, profundidade_mm, ordem)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [orcamentoId, req.body?.ambiente_id || null, imp.id, dados[0], String(m ? (GENERICO.test(m.nome) ? m.nome_definicao ?? m.nome : m.nome) : 'Peças avulsas do modelo').slice(0, 150), ...dados.slice(1), ordem++],
          );
          idMovel.set(caminho, Number(r.insertId));
        }
      }

      for (const { o, peca, antiga } of plano) {
        const movel = idMovel.get(movelDe(o)?.caminho ?? '')!;
        if (antiga && Number(antiga.editado_manual)) {
          await conn.query('UPDATE orcamento_pecas SET importacao_objeto_id = ? WHERE id = ?', [o.id, antiga.id]);
        } else if (antiga) {
          const cols = Object.keys(peca);
          await conn.query(`UPDATE orcamento_pecas SET movel_id = ?, ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [movel, ...cols.map((c) => (peca as any)[c]), antiga.id]);
        } else {
          const cols = ['movel_id', ...Object.keys(peca)];
          await conn.query(`INSERT INTO orcamento_pecas (${cols.join(', ')}) VALUES (?)`, [[movel, ...Object.values(peca)]]);
        }
      }
      const removidas = pecasAntes.filter((p) => !vistas.has(chave(p.caminho, p.definicao)) && !Number(p.editado_manual)).map((p) => p.id);
      if (removidas.length) await conn.query('DELETE FROM orcamento_pecas WHERE id IN (?)', [removidas]);

      // Itens do modelo (ferragens e insumos): os não editados destes móveis são refeitos
      const moveisIds = [...idMovel.values()];
      await conn.query("DELETE FROM orcamento_itens WHERE orcamento_id = ? AND origem = 'IMPORTACAO' AND editado_manual = 0 AND movel_id IN (?)", [orcamentoId, moveisIds]);
      for (const o of uteis.filter((x) => x.classificacao !== 'PECA')) {
        const ferragem = o.classificacao === 'FERRAGEM';
        const [[cat]] = await conn.query<any[]>(
          ferragem
            ? 'SELECT m.descricao, m.custo_unitario, u.sigla FROM materiais m JOIN unidades_medida u ON u.id = m.unidade_id WHERE m.id = ?'
            : 'SELECT i.descricao, i.custo_unitario, u.sigla FROM insumos i JOIN unidades_medida u ON u.id = i.unidade_id WHERE i.id = ?',
          [ferragem ? o.material_id : o.insumo_id],
        );
        await conn.query(
          `INSERT INTO orcamento_itens (orcamento_id, movel_id, tipo_item, material_id, insumo_id, descricao, unidade_sigla, quantidade, custo_unitario, origem, importacao_objeto_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'IMPORTACAO', ?)`,
          [orcamentoId, idMovel.get(movelDe(o)?.caminho ?? ''), ferragem ? 'MATERIAL' : 'INSUMO', ferragem ? o.material_id : null, ferragem ? null : o.insumo_id, cat.descricao, cat.sigla, o.quantidade, cat.custo_unitario, o.id],
        );
      }

      await conn.query('UPDATE importacao_objetos SET revisado = 1 WHERE importacao_id = ?', [imp.id]);
      await conn.query("UPDATE importacoes_dae SET orcamento_id = ?, status = 'CONCLUIDA' WHERE id = ?", [orcamentoId, imp.id]);
      // Móveis importados que ficaram sem nada (tudo saiu do modelo)
      await conn.query(
        `DELETE m FROM orcamento_moveis m WHERE m.orcamento_id = ? AND m.importacao_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM orcamento_pecas p WHERE p.movel_id = m.id) AND NOT EXISTS (SELECT 1 FROM orcamento_itens i WHERE i.movel_id = m.id)`,
        [orcamentoId],
      );
      await conn.commit();
      // Dispara o motor; falha no cálculo não desfaz a geração (o orçamento pode ser recalculado depois)
      const calculo = await calcularNoBanco(orcamentoId).catch((e: Error) => ({ erro: e.message }));
      res.json({ ...resumo, aplicado: true, calculo });
    } catch (err: any) {
      await conn.rollback().catch(() => {});
      res.status(err.status || 400).json({ error: err.message });
    } finally {
      conn.release();
    }
  });

  return router;
}

/** Largura × altura × profundidade (mm) de cada móvel, pela caixa das instâncias na malha gravada */
async function caixasDosMoveis(importacaoId: number, objs: any[], movelDe: (o: any) => any, eixoUp: string) {
  const out = new Map<string, { largura: string; altura: string; profundidade: string }>();
  let malha: { instancias: { objeto: number; tris: string }[] };
  try {
    malha = JSON.parse((await ler(`malhas/${importacaoId}.json`)).toString('utf8'));
  } catch {
    return out;
  }
  const porId = new Map(objs.map((o) => [Number(o.id), o]));
  const lim = new Map<string, number[]>();
  for (const inst of malha.instancias) {
    const o = porId.get(inst.objeto);
    if (!o || !['PECA', 'FERRAGEM', 'INSUMO'].includes(o.classificacao)) continue;
    const k = movelDe(o)?.caminho ?? '';
    const b = lim.get(k) ?? [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const buf = Buffer.from(inst.tris, 'base64');
    const t = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    for (let i = 0; i < t.length; i += 3) for (let d = 0; d < 3; d++) {
      b[d] = Math.min(b[d], t[i + d]);
      b[d + 3] = Math.max(b[d + 3], t[i + d]);
    }
    lim.set(k, b);
  }
  const iUp = eixoUp === 'X_UP' ? 0 : eixoUp === 'Y_UP' ? 1 : 2;
  for (const [k, b] of lim) {
    const ext = [0, 1, 2].map((d) => b[d + 3] - b[d]);
    const horiz = [0, 1, 2].filter((d) => d !== iUp).map((d) => ext[d]).sort((a, c) => c - a);
    out.set(k, { largura: horiz[0].toFixed(2), altura: ext[iUp].toFixed(2), profundidade: horiz[1].toFixed(2) });
  }
  return out;
}
