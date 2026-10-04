import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { pool } from './db.js';
import { apagar, enderecoValido, gravar, ler, urlDe } from './armazenamento.js';
import { parseDae, ErroDae, ResultadoDae } from '../src/lib/dae/parser.js';
import type { Classificacao } from '../src/lib/dae/classificador.js';
import { classificarImportacao, atualizarTotais } from './classificacao.js';

const LOTE = 500;

const n2 = (x: number | undefined) => (x === undefined ? null : x.toFixed(2));

/** Grava a árvore nível a nível: cada nível em lotes de INSERT; os ids voltam na ordem de inserção */
async function gravarObjetos(conn: any, importacaoId: number, r: ResultadoDae, cls: Map<number, Classificacao>): Promise<number[]> {
  const idDb: number[] = [];
  const maxNivel = Math.max(...r.objetos.map((o) => o.nivel));
  for (let nivel = 0; nivel <= maxNivel; nivel++) {
    const doNivel = r.objetos.filter((o) => o.nivel === nivel);
    for (let i = 0; i < doNivel.length; i += LOTE) {
      const linhas = doNivel.slice(i, i + LOTE).map((o) => {
        const m = o.medida;
        const c = cls.get(o.idx);
        return [
          importacaoId,
          o.parent === null ? null : idDb[o.parent],
          o.nivel,
          o.caminho.slice(0, 1000),
          o.nodeIdDae?.slice(0, 150) ?? null,
          o.nome.slice(0, 255),
          o.nomeDefinicao?.slice(0, 255) ?? null,
          o.materialDae?.slice(0, 255) ?? null,
          o.quantidade,
          n2(m?.dims[0]),
          n2(m?.dims[1]),
          n2(m?.dims[2]),
          n2(c?.comprimento ?? m?.comprimento),
          n2(c?.largura ?? m?.largura),
          n2(m?.espessura),
          m ? (m.areaFaces / 1e6).toFixed(4) : null,
          m ? (m.volumeBbox / 1e9).toFixed(6) : null,
          m ? o.numVertices : null,
          m ? m.numFaces : null,
          m ? Number(m.ehRetangular) : null,
          Number(o.espelhado),
          JSON.stringify(o.matrizMundo.map((x) => +x.toFixed(6))),
          c?.classificacao ?? o.classificacao,
          c?.confianca ?? null,
          c?.motivo.slice(0, 255) ?? null,
          c?.mapeamentoId ?? null,
          c?.tipoPecaId ?? null,
          c?.materiaPrimaId ?? null,
          c?.fitaBordaId ?? null,
          c?.materialId ?? null,
          c?.insumoId ?? null,
        ];
      });
      await conn.query(
        `INSERT INTO importacao_objetos (importacao_id, parent_id, nivel, caminho, node_id_dae, nome, nome_definicao, material_dae, quantidade,
           dim_x_mm, dim_y_mm, dim_z_mm, comprimento_mm, largura_mm, espessura_mm, area_faces_m2, volume_bbox_m3, num_vertices, num_faces,
           eh_retangular, espelhado, matriz_mundo, classificacao, confianca, motivo_classificacao, mapeamento_id, tipo_peca_id,
           materia_prima_id, fita_borda_id, material_id, insumo_id) VALUES ?`,
        [linhas],
      );
    }
    // Ids do nível, na ordem em que entraram (auto_increment crescente)
    const [ids] = await conn.query('SELECT id FROM importacao_objetos WHERE importacao_id = ? AND nivel = ? ORDER BY id', [importacaoId, nivel]);
    doNivel.forEach((o, k) => (idDb[o.idx] = Number(ids[k].id)));
  }
  return idDb;
}

/** Malha do visualizador: triângulos de cada instância (Float32 em base64), já com o id do objeto no banco */
async function gravarMalha(importacaoId: number, r: ResultadoDae, idDb: number[]) {
  const malha = {
    eixoUp: r.meta.eixoUp,
    instancias: r.instancias.map((i) => ({ objeto: idDb[i.objeto], cor: i.cor, tris: Buffer.from(i.tris.buffer, i.tris.byteOffset, i.tris.byteLength).toString('base64') })),
  };
  await gravar(`malhas/${importacaoId}.json`, JSON.stringify(malha), 'application/json');
}

/** Arquiteto do orçamento (os mapeamentos dele valem antes dos globais) */
export async function arquitetoDoOrcamento(orcamentoId: number | null): Promise<number | null> {
  if (!orcamentoId) return null;
  const [[o]] = await pool.query<any[]>('SELECT arquiteto_id FROM orcamentos WHERE id = ?', [orcamentoId]);
  return o?.arquiteto_id ?? null;
}

/** Importação de .dae: arquivo, hash, parser, árvore de objetos e malha do visualizador */
export function createImportacoesRouter() {
  const router = Router();

  /**
   * Importa um .dae já enviado ao armazenamento (direto do navegador para o Blob, ou pelo servidor sem Blob):
   * corpo { url, nome, orcamento_id?, forcar? }. Mesmo arquivo já importado: 409, e o envio repetido é apagado.
   */
  router.post('/importacoes', async (req: Request, res: Response) => {
    try {
      const url = String(req.body?.url ?? '');
      if (!enderecoValido(url) || !/\/dae\//.test(url)) return res.status(400).json({ error: 'Envie o arquivo .dae.' });
      const arquivo = await ler(url);
      const nome = String(req.body?.nome || 'modelo.dae').slice(0, 255);
      if (!arquivo.length) return res.status(400).json({ error: 'O arquivo .dae está vazio.' });
      const orcamentoId = req.body?.orcamento_id ? Number(req.body.orcamento_id) : null;
      const hash = crypto.createHash('sha256').update(arquivo).digest('hex');

      // Mesmo arquivo já importado (no mesmo orçamento, ou também sem orçamento): avisa e só reimporta se pedirem
      if (!req.body?.forcar) {
        const [dup] = await pool.query<any[]>(
          'SELECT id, arquivo_nome, created_at, arquivo_path FROM importacoes_dae WHERE arquivo_hash = ? AND orcamento_id <=> ? ORDER BY id DESC LIMIT 1',
          [hash, orcamentoId],
        );
        if (dup.length) {
          const { arquivo_path, ...duplicado } = dup[0];
          if (arquivo_path !== url) await apagar(url);
          dup[0] = duplicado;
          return res.status(409).json({ duplicado: dup[0], error: `Este arquivo já foi importado (importação nº ${dup[0].id}).` });
        }
      }

      const [ins] = await pool.query<any>(
        `INSERT INTO importacoes_dae (orcamento_id, usuario_id, arquivo_nome, arquivo_path, arquivo_hash, tamanho_bytes, status)
         VALUES (?, ?, ?, ?, ?, ?, 'PROCESSANDO')`,
        [orcamentoId, res.locals.usuarioId, nome, url, hash, arquivo.length],
      );
      const id = Number(ins.insertId);

      let r: ResultadoDae;
      let cls: Map<number, Classificacao>;
      try {
        const [[cfg]] = await pool.query<any[]>('SELECT arredondamento_medida_mm FROM configuracoes WHERE id = 1');
        r = parseDae(arquivo, { arredondamentoMm: Number(cfg?.arredondamento_medida_mm ?? 1) });
        cls = await classificarImportacao(r, await arquitetoDoOrcamento(orcamentoId));
      } catch (e: any) {
        const msg = e instanceof ErroDae ? e.message : `Falha ao ler o arquivo: ${e.message}`;
        await pool.query("UPDATE importacoes_dae SET status = 'ERRO', mensagem_erro = ?, processado_em = NOW() WHERE id = ?", [msg, id]);
        return res.json({ id, erro: msg });
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const idDb = await gravarObjetos(conn, id, r, cls);
        await conn.query(
          `UPDATE importacoes_dae SET ferramenta_origem = ?, unidade_nome = ?, unidade_metros = ?, eixo_up = ?, status = 'REVISAO',
             log = ?, processado_em = NOW() WHERE id = ?`,
          [r.meta.ferramenta?.slice(0, 150) ?? null, r.meta.unidadeNome?.slice(0, 30) ?? null, r.meta.unidadeMetros, r.meta.eixoUp, JSON.stringify(r.avisos), id],
        );
        await conn.commit();
        await gravarMalha(id, r, idDb);
        await atualizarTotais(id);
      } catch (e) {
        await conn.rollback().catch(() => {});
        await pool.query("UPDATE importacoes_dae SET status = 'ERRO', mensagem_erro = ? WHERE id = ?", [String((e as Error).message).slice(0, 2000), id]);
        throw e;
      } finally {
        conn.release();
      }
      res.json({ id, objetos: r.objetos.length, avisos: r.avisos.length });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Árvore completa (a lista genérica pagina em 200; uma importação pode ter milhares de nós)
  router.get('/importacoes/:id/objetos', async (req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<any[]>(
        `SELECT o.id, o.parent_id, o.nivel, o.caminho, o.node_id_dae, o.nome, o.nome_definicao, o.material_dae, o.quantidade,
                o.comprimento_mm, o.largura_mm, o.espessura_mm, o.eh_retangular, o.espelhado, o.classificacao, o.confianca,
                o.motivo_classificacao, o.revisado, o.tipo_peca_id, o.materia_prima_id, o.fita_borda_id, o.material_id, o.insumo_id,
                tp.nome AS tipo_peca, mp.descricao AS chapa, fb.descricao AS fita, ma.descricao AS material, ins.descricao AS insumo
           FROM importacao_objetos o
           LEFT JOIN tipos_peca tp ON tp.id = o.tipo_peca_id
           LEFT JOIN materias_primas mp ON mp.id = o.materia_prima_id
           LEFT JOIN materias_primas fb ON fb.id = o.fita_borda_id
           LEFT JOIN materiais ma ON ma.id = o.material_id
           LEFT JOIN insumos ins ON ins.id = o.insumo_id
          WHERE o.importacao_id = ? ORDER BY o.id`,
        [req.params.id],
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Endereço da malha do visualizador: o navegador baixa direto do armazenamento (pode passar de 4,5 MB)
  router.get('/importacoes/:id/malha', async (req: Request, res: Response) => {
    try {
      res.json({ url: await urlDe(`malhas/${Number(req.params.id) || 0}.json`) });
    } catch (err: any) {
      res.status(err.status || 500).json({ error: err.status === 404 ? 'Esta importação não tem malha para o visualizador.' : err.message });
    }
  });

  return router;
}
