import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pool, comUsuario } from './db.js';
import { getResource } from './schema.js';
import { casaPadrao, ModoComparacao } from '../src/lib/texto.js';

/** Pasta dos arquivos enviados (.env STORAGE_DIR); as imagens do catálogo ficam em <storage>/imagens */
export const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || './storage');
export const PASTA_IMAGENS = path.join(STORAGE_DIR, 'imagens');

const erro = (res: Response, err: any) => res.status(err.status || 400).json({ error: err.message });
const falha = (msg: string, status = 400) => Object.assign(new Error(msg), { status });

/** Rotas do catálogo e das regras: imagens, reajuste de preços em lote, teste dos mapeamentos .dae */
export function createCatalogoRouter() {
  const router = Router();

  // Imagem do catálogo (já reduzida no navegador), em data URI; devolve o caminho público
  router.post('/imagens', async (req: Request, res: Response) => {
    try {
      const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.dados || ''));
      if (!m) throw falha('Envie uma imagem JPEG, PNG ou WebP.');
      const bytes = Buffer.from(m[2], 'base64');
      if (bytes.length > 1_500_000) throw falha('Imagem grande demais (máx. 1,5 MB).');
      const nome = `${crypto.randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
      await fs.promises.mkdir(PASTA_IMAGENS, { recursive: true });
      await fs.promises.writeFile(path.join(PASTA_IMAGENS, nome), bytes);
      res.json({ caminho: `/imagens/${nome}` });
    } catch (err: any) {
      erro(res, err);
    }
  });

  /**
   * Reajuste em lote: aplica um percentual ao custo dos itens ativos do recurso, opcionalmente só de
   * uma categoria e/ou fornecedor. `simular` só conta. Os triggers registram o histórico (@usuario_id).
   */
  router.post('/reajuste', async (req: Request, res: Response) => {
    try {
      if (!['ADMIN', 'ORCAMENTISTA'].includes(res.locals.usuario.perfil)) throw falha('Somente administradores e orçamentistas reajustam preços.', 403);
      const recurso = getResource(String(req.body?.recurso || ''));
      if (!recurso?.preco) throw falha('Este cadastro não tem preço para reajustar.');
      const perc = Number(req.body?.perc);
      if (!Number.isFinite(perc) || perc <= -100 || perc > 1000) throw falha('Informe um percentual entre -99,99% e 1.000%.');

      const cols = recurso.fields.map((f) => f.name);
      const where = ['t.ativo = 1'];
      const params: any[] = [];
      for (const campo of ['categoria_id', 'fornecedor_id']) {
        const v = req.body?.[campo];
        if (v === undefined || v === null || v === '' || !cols.includes(campo)) continue;
        where.push(`t.${campo} = ?`);
        params.push(v);
      }
      const { campo, data } = recurso.preco;
      const filtro = where.join(' AND ');

      if (req.body?.simular) {
        const [[r]] = await pool.query<any[]>(`SELECT COUNT(*) AS n FROM ${recurso.table} t WHERE ${filtro}`, params);
        return res.json({ itens: Number(r.n) });
      }
      const [r] = await comUsuario(res.locals.usuarioId, (conn) =>
        conn.query<any>(
          `UPDATE ${recurso.table} t SET ${data ? `t.${data} = CURDATE(), ` : ''}t.${campo} = ROUND(t.${campo} * (1 + ? / 100), 4) WHERE ${filtro}`,
          [perc, ...params],
        ),
      );
      res.json({ itens: r.affectedRows });
    } catch (err: any) {
      erro(res, err);
    }
  });

  /**
   * "Testar padrão": quais mapeamentos ativos casam com o texto, na ordem em que o classificador
   * os avalia (os do arquiteto primeiro, depois os globais, por prioridade).
   */
  router.post('/mapeamentos/testar', async (req: Request, res: Response) => {
    try {
      const texto = String(req.body?.texto || '');
      if (!texto.trim()) throw falha('Informe o texto a testar.');
      const origem = String(req.body?.origem || '');
      const arquiteto = req.body?.arquiteto_id ? Number(req.body.arquiteto_id) : null;
      const [regras] = await pool.query<any[]>(
        `SELECT m.id, m.origem, m.padrao, m.modo_comparacao, m.prioridade, m.acao, m.arquiteto_id, a.nome AS arquiteto
           FROM mapeamentos_dae m LEFT JOIN arquitetos a ON a.id = m.arquiteto_id
          WHERE m.ativo = 1 AND (m.arquiteto_id IS NULL OR m.arquiteto_id = ?) ${origem ? 'AND m.origem = ?' : ''}
          ORDER BY (m.arquiteto_id IS NULL), m.prioridade, m.id`,
        origem ? [arquiteto, origem] : [arquiteto],
      );
      res.json(regras.filter((m) => casaPadrao(m.padrao, m.modo_comparacao as ModoComparacao, texto)));
    } catch (err: any) {
      erro(res, err);
    }
  });

  return router;
}
