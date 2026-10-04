import { Router, Request, Response } from 'express';
import path from 'path';
import { pool } from './db.js';
import { apagar, enderecoValido, ler } from './armazenamento.js';
import { calcularNoBanco } from './calculo.js';
import { dataLocal } from './orcamentos.js';

const falha = (msg: string, status = 400) => Object.assign(new Error(msg), { status });
const erro = (res: Response, err: any) => res.status(err.status || 400).json({ error: err.message, ...(err.extra ?? {}) });
const EDITAVEIS = ['RASCUNHO', 'EM_REVISAO'];

/** Fluxo de status: de → para (CANCELADO vale de qualquer um, menos EM_PRODUCAO e dele mesmo) */
export const TRANSICOES: Record<string, string[]> = {
  RASCUNHO: ['EM_REVISAO', 'CANCELADO'],
  EM_REVISAO: ['RASCUNHO', 'ENVIADO', 'CANCELADO'],
  ENVIADO: ['APROVADO', 'REPROVADO', 'EXPIRADO', 'CANCELADO'],
  APROVADO: ['EM_PRODUCAO', 'CANCELADO'],
  REPROVADO: ['CANCELADO'],
  EXPIRADO: ['CANCELADO'],
  EM_PRODUCAO: [],
  CANCELADO: [],
};
/** Status a partir dos quais a edição é feita numa revisão (cópia) */
const COM_REVISAO = ['ENVIADO', 'REPROVADO', 'EXPIRADO'];

async function orcamento(id: number | string) {
  const [[o]] = await pool.query<any[]>('SELECT * FROM orcamentos WHERE id = ?', [id]);
  if (!o) throw falha('Orçamento não encontrado.', 404);
  return o;
}
async function editavel(id: number | string) {
  const o = await orcamento(id);
  if (!EDITAVEIS.includes(o.status)) throw falha(`Orçamento ${o.status.toLowerCase().replace('_', ' ')}: ${COM_REVISAO.includes(o.status) ? 'crie uma revisão para editar' : 'não pode mais ser editado'}.`, 409);
  return o;
}

/** Recalcula depois de uma edição; falha no cálculo não desfaz a edição (vai na resposta) */
const recalcular = (id: number) => calcularNoBanco(id).catch((e: Error) => ({ erro: e.message }));

/** Campos graváveis (whitelist) e conversão: '' → null */
function campos(body: any, permitidos: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of permitidos) if (body && k in body) out[k] = body[k] === '' ? null : body[k];
  return out;
}
const SET = (c: Record<string, any>) => Object.keys(c).map((k) => `${k} = ?`).join(', ');

const CAMPOS_MOVEL = ['descricao', 'ambiente_id', 'quantidade', 'largura_mm', 'altura_mm', 'profundidade_mm', 'acabamento_caixa_id', 'acabamento_frente_id', 'observacoes', 'ordem'];
const CAMPOS_PECA = [
  'movel_id',
  'tipo_peca_id',
  'descricao',
  'materia_prima_id',
  'comprimento_mm',
  'largura_mm',
  'espessura_mm',
  'quantidade',
  'respeita_veio',
  'fita_comp1_id',
  'fita_comp2_id',
  'fita_larg1_id',
  'fita_larg2_id',
  'usinagem',
  'observacoes',
];
const CAMPOS_ITEM = ['movel_id', 'descricao', 'quantidade', 'custo_unitario', 'observacoes'];

function validarPeca(c: Record<string, any>, inclusao: boolean) {
  if (inclusao) for (const k of ['movel_id', 'descricao', 'materia_prima_id']) if (c[k] == null) throw falha('Informe móvel, descrição e chapa da peça.');
  for (const k of ['comprimento_mm', 'largura_mm', 'espessura_mm', 'quantidade']) {
    if ((inclusao || k in c) && !(Number(c[k]) > 0)) throw falha('Medidas e quantidade da peça precisam ser maiores que zero.');
  }
}

/** Tipo do anexo pela extensão do arquivo */
function tipoAnexo(nome: string) {
  const ext = path.extname(nome).toLowerCase().slice(1);
  if (ext === 'dae') return 'DAE';
  if (ext === 'skp') return 'SKP';
  if (ext === 'pdf') return 'PDF';
  if (['dwg', 'dxf'].includes(ext)) return 'DWG';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'IMAGEM';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'PLANILHA';
  return 'OUTRO';
}

/** Colunas que podem ir num INSERT (sem id, geradas e carimbos de data) */
async function colunasCopiaveis(tabela: string): Promise<string[]> {
  const [cols] = await pool.query<any[]>(
    `SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
       AND EXTRA NOT LIKE '%GENERATED%' AND COLUMN_NAME NOT IN ('id', 'created_at', 'updated_at') ORDER BY ORDINAL_POSITION`,
    [tabela],
  );
  return cols.map((x) => x.c);
}

/** Vencidos: ENVIADO com a validade passada vira EXPIRADO (rotina do servidor, a cada hora) */
export async function expirarVencidos(): Promise<number> {
  const [vencidos] = await pool.query<any[]>("SELECT id FROM orcamentos WHERE status = 'ENVIADO' AND data_validade < CURDATE()");
  for (const o of vencidos) {
    await pool.query("UPDATE orcamentos SET status = 'EXPIRADO' WHERE id = ? AND status = 'ENVIADO'", [o.id]);
    await pool.query("INSERT INTO orcamento_status_historico (orcamento_id, status_anterior, status_novo, observacao) VALUES (?, 'ENVIADO', 'EXPIRADO', 'Validade vencida')", [o.id]);
  }
  return vencidos.length;
}

export function createOrcamentoEdicaoRouter() {
  const router = Router();

  // -------------------------------------------------------------------------
  // Estrutura completa da tela do orçamento
  // -------------------------------------------------------------------------
  router.get('/orcamentos/:id/estrutura', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const [[[o]], [ambientes], [moveis], [pecas], [itens], [importacoes], [anexos], [consumos]] = await Promise.all([
        pool.query<any[]>(
          `SELECT o.*, c.nome AS cliente_nome, a.nome AS arquiteto_nome, v.nome AS vendedor_nome, cp.descricao AS condicao_descricao,
                  cp.perc_entrada, cp.numero_parcelas, cp.intervalo_dias, cp.perc_ajuste
             FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id LEFT JOIN arquitetos a ON a.id = o.arquiteto_id
             LEFT JOIN usuarios v ON v.id = o.vendedor_id LEFT JOIN condicoes_pagamento cp ON cp.id = o.condicao_pagamento_id WHERE o.id = ?`,
          [id],
        ),
        pool.query<any[]>('SELECT * FROM orcamento_ambientes WHERE orcamento_id = ? ORDER BY ordem, id', [id]),
        pool.query<any[]>('SELECT * FROM orcamento_moveis WHERE orcamento_id = ? ORDER BY ordem, id', [id]),
        pool.query<any[]>(
          `SELECT p.*, tp.nome AS tipo_nome, mp.descricao AS chapa_descricao FROM orcamento_pecas p JOIN orcamento_moveis m ON m.id = p.movel_id
             LEFT JOIN tipos_peca tp ON tp.id = p.tipo_peca_id LEFT JOIN materias_primas mp ON mp.id = p.materia_prima_id
            WHERE m.orcamento_id = ? ORDER BY p.movel_id, p.ordem, p.id`,
          [id],
        ),
        pool.query<any[]>('SELECT * FROM orcamento_itens WHERE orcamento_id = ? ORDER BY movel_id IS NULL, movel_id, tipo_item, id', [id]),
        pool.query<any[]>('SELECT id, arquivo_nome, status, total_pecas, total_desconhecidos, created_at FROM importacoes_dae WHERE orcamento_id = ? ORDER BY id DESC', [id]),
        pool.query<any[]>('SELECT a.*, u.nome AS usuario_nome FROM orcamento_anexos a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE a.orcamento_id = ? ORDER BY a.id DESC', [id]),
        pool.query<any[]>('SELECT c.*, mp.descricao FROM orcamento_consumos c JOIN materias_primas mp ON mp.id = c.materia_prima_id WHERE c.orcamento_id = ? ORDER BY c.tipo, mp.descricao', [id]),
      ]);
      if (!o) throw falha('Orçamento não encontrado.', 404);
      res.json({ orcamento: o, editavel: EDITAVEIS.includes(o.status), transicoes: TRANSICOES[o.status] ?? [], podeRevisar: COM_REVISAO.includes(o.status), ambientes, moveis, pecas, itens, importacoes, anexos, consumos });
    } catch (err: any) {
      erro(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Ambientes, móveis, peças e itens (só em rascunho/revisão; cada edição recalcula)
  // -------------------------------------------------------------------------
  router.post('/orcamentos/:id/ambientes', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      const nome = String(req.body?.nome ?? '').trim();
      if (!nome) throw falha('Informe o nome do ambiente.');
      const [r] = await pool.query<any>('INSERT INTO orcamento_ambientes (orcamento_id, nome, ordem) SELECT ?, ?, COALESCE(MAX(ordem), 0) + 1 FROM orcamento_ambientes WHERE orcamento_id = ?', [o.id, nome.slice(0, 80), o.id]);
      res.json({ id: r.insertId });
    } catch (err: any) {
      erro(res, err);
    }
  });
  router.put('/orcamentos/:id/ambientes/:aid', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      const c = campos(req.body, ['nome', 'ordem', 'observacoes']);
      if (!Object.keys(c).length) throw falha('Nada a alterar.');
      await pool.query(`UPDATE orcamento_ambientes SET ${SET(c)} WHERE id = ? AND orcamento_id = ?`, [...Object.values(c), req.params.aid, o.id]);
      res.json({ success: true });
    } catch (err: any) {
      erro(res, err);
    }
  });
  router.delete('/orcamentos/:id/ambientes/:aid', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      // Os móveis ficam, sem ambiente (ON DELETE SET NULL)
      await pool.query('DELETE FROM orcamento_ambientes WHERE id = ? AND orcamento_id = ?', [req.params.aid, o.id]);
      res.json({ success: true });
    } catch (err: any) {
      erro(res, err);
    }
  });

  router.post('/orcamentos/:id/moveis', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      const c = campos(req.body, CAMPOS_MOVEL);
      if (!c.descricao) throw falha('Informe a descrição do móvel.');
      c.quantidade = Number(c.quantidade) || 1;
      const [r] = await pool.query<any>(`INSERT INTO orcamento_moveis (orcamento_id, ${Object.keys(c).join(', ')}) VALUES (?)`, [[o.id, ...Object.values(c)]]);
      res.json({ id: r.insertId, calculo: await recalcular(o.id) });
    } catch (err: any) {
      erro(res, err);
    }
  });
  router.put('/orcamentos/:id/moveis/:mid', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      const c = campos(req.body, CAMPOS_MOVEL);
      if ('quantidade' in c && !(Number(c.quantidade) >= 1)) throw falha('A quantidade do móvel precisa ser pelo menos 1.');
      if (!Object.keys(c).length) throw falha('Nada a alterar.');
      await pool.query(`UPDATE orcamento_moveis SET ${SET(c)} WHERE id = ? AND orcamento_id = ?`, [...Object.values(c), req.params.mid, o.id]);
      res.json({ success: true, calculo: await recalcular(o.id) });
    } catch (err: any) {
      erro(res, err);
    }
  });
  router.delete('/orcamentos/:id/moveis/:mid', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      await pool.query('DELETE FROM orcamento_moveis WHERE id = ? AND orcamento_id = ?', [req.params.mid, o.id]); // peças e itens vão junto
      res.json({ success: true, calculo: await recalcular(o.id) });
    } catch (err: any) {
      erro(res, err);
    }
  });

  /** Móvel do orçamento (a peça só entra num móvel dele) */
  const conferirMovel = async (orcamentoId: number, movelId: any) => {
    const [[m]] = await pool.query<any[]>('SELECT id FROM orcamento_moveis WHERE id = ? AND orcamento_id = ?', [movelId, orcamentoId]);
    if (!m) throw falha('Móvel não encontrado neste orçamento.');
  };

  router.post('/orcamentos/:id/pecas', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      const c = campos(req.body, CAMPOS_PECA);
      validarPeca(c, true);
      await conferirMovel(o.id, c.movel_id);
      // Peça lançada à mão: protegida da reimportação
      const [r] = await pool.query<any>(`INSERT INTO orcamento_pecas (${Object.keys(c).join(', ')}, editado_manual) VALUES (?, 1)`, [Object.values(c)]);
      res.json({ id: r.insertId, calculo: await recalcular(o.id) });
    } catch (err: any) {
      erro(res, err);
    }
  });
  router.put('/orcamentos/:id/pecas/:pid', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      const c = campos(req.body, CAMPOS_PECA);
      validarPeca(c, false);
      if (c.movel_id) await conferirMovel(o.id, c.movel_id);
      if (!Object.keys(c).length) throw falha('Nada a alterar.');
      const [r] = await pool.query<any>(
        `UPDATE orcamento_pecas p JOIN orcamento_moveis m ON m.id = p.movel_id SET ${Object.keys(c).map((k) => `p.${k} = ?`).join(', ')}, p.editado_manual = 1
          WHERE p.id = ? AND m.orcamento_id = ?`,
        [...Object.values(c), req.params.pid, o.id],
      );
      if (!r.affectedRows) throw falha('Peça não encontrada.', 404);
      res.json({ success: true, calculo: await recalcular(o.id) });
    } catch (err: any) {
      erro(res, err);
    }
  });
  router.delete('/orcamentos/:id/pecas/:pid', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      await pool.query('DELETE p FROM orcamento_pecas p JOIN orcamento_moveis m ON m.id = p.movel_id WHERE p.id = ? AND m.orcamento_id = ?', [req.params.pid, o.id]);
      res.json({ success: true, calculo: await recalcular(o.id) });
    } catch (err: any) {
      erro(res, err);
    }
  });

  // Busca no catálogo unificado (vw_catalogo_precos) para lançar itens
  router.get('/catalogo/busca', async (req: Request, res: Response) => {
    try {
      const q = `%${String(req.query.q ?? '').trim()}%`;
      const [rows] = await pool.query<any[]>(
        "SELECT tipo_item, id, codigo, descricao, COALESCE(unidade, 'SV') AS unidade, custo_unitario FROM vw_catalogo_precos WHERE ativo = 1 AND (descricao LIKE ? OR codigo LIKE ?) ORDER BY descricao LIMIT 30",
        [q, q],
      );
      res.json(rows);
    } catch (err: any) {
      erro(res, err);
    }
  });

  router.post('/orcamentos/:id/itens', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      const b = req.body ?? {};
      const tipo = String(b.tipo_item ?? 'AVULSO');
      if (!['MATERIA_PRIMA', 'INSUMO', 'MATERIAL', 'SERVICO', 'AVULSO'].includes(tipo)) throw falha('Tipo de item inválido.');
      if (b.movel_id) await conferirMovel(o.id, b.movel_id);
      if (!(Number(b.quantidade) > 0)) throw falha('Informe a quantidade.');
      let descricao = String(b.descricao ?? '').trim();
      let unidade = String(b.unidade_sigla ?? '').trim();
      let custo = b.custo_unitario;
      const ref = { MATERIA_PRIMA: null, INSUMO: null, MATERIAL: null, SERVICO: null } as Record<string, any>;
      if (tipo !== 'AVULSO') {
        // Do catálogo: descrição, unidade e preço (snapshot) vêm de lá, salvo o preço digitado
        const [[cat]] = await pool.query<any[]>("SELECT descricao, COALESCE(unidade, 'SV') AS unidade, custo_unitario FROM vw_catalogo_precos WHERE tipo_item = ? AND id = ?", [tipo, b.ref_id]);
        if (!cat) throw falha('Item do catálogo não encontrado.');
        ref[tipo] = b.ref_id;
        descricao ||= cat.descricao;
        unidade ||= cat.unidade;
        custo = custo === undefined || custo === '' || custo === null ? cat.custo_unitario : custo;
      }
      if (!descricao || !unidade) throw falha('Informe descrição e unidade do item avulso.');
      const [r] = await pool.query<any>(
        `INSERT INTO orcamento_itens (orcamento_id, movel_id, tipo_item, materia_prima_id, insumo_id, material_id, servico_id, descricao, unidade_sigla, quantidade, custo_unitario, origem, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?)`,
        [o.id, b.movel_id || null, tipo, ref.MATERIA_PRIMA, ref.INSUMO, ref.MATERIAL, ref.SERVICO, descricao.slice(0, 150), unidade.slice(0, 6), b.quantidade, custo ?? 0, b.observacoes ?? null],
      );
      res.json({ id: r.insertId, calculo: await recalcular(o.id) });
    } catch (err: any) {
      erro(res, err);
    }
  });
  router.put('/orcamentos/:id/itens/:iid', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      const c = campos(req.body, CAMPOS_ITEM);
      if ('quantidade' in c && !(Number(c.quantidade) >= 0)) throw falha('Quantidade inválida.');
      if (c.movel_id) await conferirMovel(o.id, c.movel_id);
      if (!Object.keys(c).length) throw falha('Nada a alterar.');
      // Editado à mão: o recálculo não sobrescreve
      await pool.query(`UPDATE orcamento_itens SET ${SET(c)}, editado_manual = 1 WHERE id = ? AND orcamento_id = ?`, [...Object.values(c), req.params.iid, o.id]);
      res.json({ success: true, calculo: await recalcular(o.id) });
    } catch (err: any) {
      erro(res, err);
    }
  });
  router.delete('/orcamentos/:id/itens/:iid', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      const [[i]] = await pool.query<any[]>('SELECT origem, editado_manual FROM orcamento_itens WHERE id = ? AND orcamento_id = ?', [req.params.iid, o.id]);
      if (!i) throw falha('Item não encontrado.', 404);
      if (['REGRA', 'AUTOMATICO'].includes(i.origem) && !Number(i.editado_manual)) {
        throw falha('Item de regra volta a cada cálculo: para tirá-lo, zere a quantidade (fica como editado) ou desative a regra.');
      }
      await pool.query('DELETE FROM orcamento_itens WHERE id = ?', [req.params.iid]);
      res.json({ success: true, calculo: await recalcular(o.id) });
    } catch (err: any) {
      erro(res, err);
    }
  });

  // Percentuais, desconto, condição de pagamento, critério das chapas e das ferragens
  router.put('/orcamentos/:id/precificacao', async (req: Request, res: Response) => {
    try {
      const o = await editavel(req.params.id);
      const c = campos(req.body, ['perc_custo_fixo', 'perc_impostos', 'perc_comissao', 'perc_rt', 'perc_margem', 'perc_desconto', 'valor_desconto', 'condicao_pagamento_id', 'criterio_cobranca_chapa', 'modo_ferragens']);
      const v = { ...o, ...c };
      const soma = ['perc_custo_fixo', 'perc_impostos', 'perc_comissao', 'perc_rt', 'perc_margem'].reduce((s, k) => s + Number(v[k] ?? 0), 0);
      if (soma >= 100) throw falha('A soma de custo fixo, impostos, comissão, RT e margem precisa ser menor que 100%.');
      for (const k of Object.keys(c)) if (k.startsWith('perc_') && (Number(c[k]) < 0 || Number(c[k]) >= 100)) throw falha('Percentuais entre 0 e 100.');
      if (!Object.keys(c).length) throw falha('Nada a alterar.');
      await pool.query(`UPDATE orcamentos SET ${SET(c)} WHERE id = ?`, [...Object.values(c), o.id]);
      res.json({ success: true, calculo: await recalcular(o.id) });
    } catch (err: any) {
      erro(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Status e revisões
  // -------------------------------------------------------------------------
  router.post('/orcamentos/:id/status', async (req: Request, res: Response) => {
    try {
      const o = await orcamento(req.params.id);
      const novo = String(req.body?.status ?? '');
      if (!(TRANSICOES[o.status] ?? []).includes(novo)) throw falha(`Não é possível passar de ${o.status} para ${novo}.`);
      if (novo === 'ENVIADO') {
        // Envia com os números atualizados; margem negativa só com a confirmação de um administrador
        const calc: any = await calcularNoBanco(o.id);
        if (calc.alertas.margemNegativa) {
          if (res.locals.usuario.perfil !== 'ADMIN') throw Object.assign(falha('Margem real negativa: só um administrador pode enviar este orçamento.', 409), { extra: { margemNegativa: true } });
          if (!req.body?.confirmarMargem) throw Object.assign(falha(`Margem real negativa (${calc.margemRealPerc}%). Confirme para enviar assim mesmo.`, 409), { extra: { margemNegativa: true } });
        }
      }
      await pool.query(`UPDATE orcamentos SET status = ?${novo === 'APROVADO' ? ', data_aprovacao = NOW()' : ''} WHERE id = ?`, [novo, o.id]);
      await pool.query('INSERT INTO orcamento_status_historico (orcamento_id, status_anterior, status_novo, usuario_id, observacao) VALUES (?, ?, ?, ?, ?)', [
        o.id,
        o.status,
        novo,
        res.locals.usuarioId,
        String(req.body?.observacao ?? '').slice(0, 500) || null,
      ]);
      res.json({ success: true });
    } catch (err: any) {
      erro(res, err);
    }
  });

  /** Revisão: cópia completa (móveis, peças, itens, consumos, anexos) com revisao + 1, em rascunho */
  router.post('/orcamentos/:id/revisao', async (req: Request, res: Response) => {
    const conn = await pool.getConnection();
    try {
      const o = await orcamento(req.params.id);
      if (!COM_REVISAO.includes(o.status)) throw falha('Revisão só de orçamento enviado, reprovado ou expirado; em rascunho, edite direto.');
      const [[cfg]] = await conn.query<any[]>('SELECT validade_orcamento_dias FROM configuracoes WHERE id = 1');
      const [[{ rev }]] = await conn.query<any[]>('SELECT MAX(revisao) + 1 AS rev FROM orcamentos WHERE numero = ?', [o.numero]);
      const tabelas = ['orcamentos', 'orcamento_ambientes', 'orcamento_moveis', 'orcamento_pecas', 'orcamento_itens', 'orcamento_consumos', 'orcamento_anexos'];
      const cols = Object.fromEntries(await Promise.all(tabelas.map(async (t) => [t, await colunasCopiaveis(t)])));
      const inserir = async (tabela: string, linhas: any[], ajustar: (l: any) => any) => {
        const ids: number[] = [];
        for (const l of linhas) {
          const novo = ajustar({ ...l });
          const [r] = await conn.query<any>(`INSERT INTO ${tabela} (${cols[tabela].join(', ')}) VALUES (?)`, [cols[tabela].map((c: string) => novo[c])]);
          ids.push(Number(r.insertId));
        }
        return ids;
      };

      await conn.beginTransaction();
      const [novoId] = await inserir('orcamentos', [o], (l) => ({
        ...l,
        revisao: rev,
        orcamento_origem_id: o.id,
        status: 'RASCUNHO',
        usuario_id: res.locals.usuarioId,
        data_emissao: dataLocal(),
        data_validade: dataLocal(Number(cfg.validade_orcamento_dias)),
        data_aprovacao: null,
        calculado_em: null,
      }));
      const mapa = async (tabela: string, onde: string) => {
        const [linhas] = await conn.query<any[]>(`SELECT * FROM ${tabela} WHERE ${onde} ORDER BY id`, [o.id]);
        return linhas;
      };
      const ambientes = await mapa('orcamento_ambientes', 'orcamento_id = ?');
      const novosAmb = await inserir('orcamento_ambientes', ambientes, (l) => ({ ...l, orcamento_id: novoId }));
      const idAmb = new Map(ambientes.map((a, i) => [a.id, novosAmb[i]]));
      const moveis = await mapa('orcamento_moveis', 'orcamento_id = ?');
      const novosMov = await inserir('orcamento_moveis', moveis, (l) => ({ ...l, orcamento_id: novoId, ambiente_id: l.ambiente_id ? idAmb.get(l.ambiente_id) : null }));
      const idMov = new Map(moveis.map((m, i) => [m.id, novosMov[i]]));
      const pecas = await mapa('orcamento_pecas', 'movel_id IN (SELECT id FROM orcamento_moveis WHERE orcamento_id = ?)');
      await inserir('orcamento_pecas', pecas, (l) => ({ ...l, movel_id: idMov.get(l.movel_id) }));
      await inserir('orcamento_itens', await mapa('orcamento_itens', 'orcamento_id = ?'), (l) => ({ ...l, orcamento_id: novoId, movel_id: l.movel_id ? idMov.get(l.movel_id) : null }));
      await inserir('orcamento_consumos', await mapa('orcamento_consumos', 'orcamento_id = ?'), (l) => ({ ...l, orcamento_id: novoId }));
      await inserir('orcamento_anexos', await mapa('orcamento_anexos', 'orcamento_id = ?'), (l) => ({ ...l, orcamento_id: novoId }));
      await conn.query("INSERT INTO orcamento_status_historico (orcamento_id, status_anterior, status_novo, usuario_id, observacao) VALUES (?, NULL, 'RASCUNHO', ?, ?)", [
        novoId,
        res.locals.usuarioId,
        `Revisão ${rev} criada a partir de ${o.numero}${o.revisao ? ` rev. ${o.revisao}` : ''} (${o.status.toLowerCase()})`,
      ]);
      await conn.commit();
      // O plano de corte é refeito pelo cálculo (os ids das peças mudaram)
      res.json({ id: novoId, revisao: rev, calculo: await recalcular(novoId) });
    } catch (err: any) {
      await conn.rollback().catch(() => {});
      erro(res, err);
    } finally {
      conn.release();
    }
  });

  router.get('/orcamentos/:id/historico', async (req: Request, res: Response) => {
    try {
      const o = await orcamento(req.params.id);
      const [[status], [revisoes]] = await Promise.all([
        pool.query<any[]>('SELECT h.*, u.nome AS usuario_nome FROM orcamento_status_historico h LEFT JOIN usuarios u ON u.id = h.usuario_id WHERE h.orcamento_id = ? ORDER BY h.id DESC', [o.id]),
        pool.query<any[]>('SELECT id, numero, revisao, status, data_emissao, valor_final FROM orcamentos WHERE numero = ? ORDER BY revisao DESC', [o.numero]),
      ]);
      res.json({ status, revisoes });
    } catch (err: any) {
      erro(res, err);
    }
  });

  // -------------------------------------------------------------------------
  // Anexos (em qualquer status)
  // -------------------------------------------------------------------------
  /** Grava o anexo já enviado ao armazenamento (direto do navegador para o Blob, ou pelo servidor sem Blob) */
  router.post('/orcamentos/:id/anexos', async (req: Request, res: Response) => {
    try {
      const o = await orcamento(req.params.id);
      const url = String(req.body?.url ?? '');
      if (!enderecoValido(url) || !decodeURIComponent(url).includes(`/anexos/${o.id}/`)) throw falha('Endereço do anexo inválido.');
      const nome = String(req.body?.nome || 'arquivo').slice(0, 255);
      const [r] = await pool.query<any>('INSERT INTO orcamento_anexos (orcamento_id, tipo, nome_original, arquivo_path, tamanho_bytes, usuario_id) VALUES (?, ?, ?, ?, ?, ?)', [
        o.id,
        tipoAnexo(nome),
        nome,
        url.slice(0, 500),
        Math.max(0, Math.trunc(Number(req.body?.tamanho) || 0)) || null,
        res.locals.usuarioId,
      ]);
      res.json({ id: r.insertId });
    } catch (err: any) {
      erro(res, err);
    }
  });
  // Download pelo servidor dos anexos no disco (os do Blob o navegador abre direto pela URL)
  router.get('/orcamentos/:id/anexos/:aid', async (req: Request, res: Response) => {
    try {
      const [[a]] = await pool.query<any[]>('SELECT * FROM orcamento_anexos WHERE id = ? AND orcamento_id = ?', [req.params.aid, req.params.id]);
      if (!a) throw falha('Anexo não encontrado.', 404);
      const dados = await ler(a.arquivo_path).catch(() => {
        throw falha('Arquivo do anexo não encontrado no armazenamento.', 404);
      });
      res.attachment(a.nome_original).send(dados);
    } catch (err: any) {
      erro(res, err);
    }
  });
  router.delete('/orcamentos/:id/anexos/:aid', async (req: Request, res: Response) => {
    try {
      const [[a]] = await pool.query<any[]>('SELECT * FROM orcamento_anexos WHERE id = ? AND orcamento_id = ?', [req.params.aid, req.params.id]);
      if (!a) throw falha('Anexo não encontrado.', 404);
      await pool.query('DELETE FROM orcamento_anexos WHERE id = ?', [a.id]);
      // As revisões copiam a linha e apontam para o mesmo arquivo: só apaga quando ninguém mais usa
      const [[uso]] = await pool.query<any[]>('SELECT COUNT(*) AS n FROM orcamento_anexos WHERE arquivo_path = ?', [a.arquivo_path]);
      if (!Number(uso.n)) await apagar(a.arquivo_path);
      res.json({ success: true });
    } catch (err: any) {
      erro(res, err);
    }
  });

  return router;
}
