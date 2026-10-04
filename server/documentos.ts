import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from './db.js';
import { STORAGE_DIR, PASTA_IMAGENS } from './catalogo.js';
import { gerarPdf } from './pdf.js';
import { dadosPlanoCorte } from './calculo.js';
import { Empresa } from '../src/lib/pdf/comum.js';
import { csvListaCorte, htmlListaCorte, htmlOrcamentoCliente, htmlPlanoCorte, htmlRelatorioInterno, htmlRelatorioRt } from '../src/lib/pdf/documentos.js';
import { miniaturaSvg } from '../src/lib/pdf/miniatura.js';
import { CORES_MOVEL } from '../src/lib/pdf/planoSvg.js';
import { calcularParcelas } from '../src/lib/orcamento/parcelas.js';

const falha = (msg: string, status = 400) => Object.assign(new Error(msg), { status });
const erro = (res: Response, err: any) => res.status(err.status || 400).json({ error: err.message });
/** Só a revisão mais recente de cada número entra nos indicadores */
const ULTIMA = 'NOT EXISTS (SELECT 1 FROM orcamentos o2 WHERE o2.numero = o.numero AND o2.revisao > o.revisao)';
const ABERTOS = "('RASCUNHO', 'EM_REVISAO', 'ENVIADO')";

/** Dados da empresa para o cabeçalho, com a logo embutida (o PDF é gerado de um arquivo local) */
async function empresa(): Promise<Empresa> {
  const [[c]] = await pool.query<any[]>('SELECT * FROM configuracoes WHERE id = 1');
  let logo: string | null = null;
  const nome = /^\/imagens\/([\w-]+\.(jpg|png|webp))$/.exec(String(c.logo_path ?? ''));
  if (nome) {
    const arquivo = path.join(PASTA_IMAGENS, nome[1]);
    if (fs.existsSync(arquivo)) logo = `data:image/${nome[2] === 'jpg' ? 'jpeg' : nome[2]};base64,${(await fs.promises.readFile(arquivo)).toString('base64')}`;
  }
  return { ...c, logo };
}

async function orcamento(id: number) {
  const [[o]] = await pool.query<any[]>('SELECT * FROM orcamentos WHERE id = ?', [id]);
  if (!o) throw falha('Orçamento não encontrado.', 404);
  return o;
}

/** Miniatura isométrica de cada móvel vindo de importação (malha gravada + nós descendentes do móvel) */
async function miniaturas(moveis: any[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const porImportacao = new Map<number, any[]>();
  for (const m of moveis) if (m.importacao_id && m.importacao_objeto_id) porImportacao.set(m.importacao_id, [...(porImportacao.get(m.importacao_id) ?? []), m]);
  for (const [imp, lista] of porImportacao) {
    let malha: { eixoUp: string; instancias: { objeto: number; cor: string | null; tris: string }[] };
    try {
      malha = JSON.parse(await fs.promises.readFile(path.join(STORAGE_DIR, 'malhas', `${imp}.json`), 'utf8'));
    } catch {
      continue;
    }
    const [objs] = await pool.query<any[]>('SELECT id, parent_id, classificacao FROM importacao_objetos WHERE importacao_id = ?', [imp]);
    const pai = new Map(objs.map((o) => [Number(o.id), o.parent_id == null ? null : Number(o.parent_id)]));
    const ignorado = new Set(objs.filter((o) => o.classificacao === 'IGNORAR' || o.classificacao === 'DESCONHECIDO').map((o) => Number(o.id)));
    for (const m of lista) {
      const dentro = (id: number) => {
        for (let p: number | null = id; p !== null && p !== undefined; p = pai.get(p) ?? null) if (p === Number(m.importacao_objeto_id)) return true;
        return false;
      };
      const malhas = malha.instancias
        .filter((i) => !ignorado.has(i.objeto) && dentro(i.objeto))
        .map((i) => {
          const b = Buffer.from(i.tris, 'base64');
          return { tris: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), cor: i.cor };
        });
      const svg = miniaturaSvg(malhas, malha.eixoUp, 220, 150);
      if (svg) out.set(Number(m.id), svg);
    }
  }
  return out;
}

const nomeArquivo = (o: any, doc: string) => `${o.numero}${Number(o.revisao) ? `-rev${o.revisao}` : ''}-${doc}`;

async function htmlDocumento(id: number, doc: string, porMovel: boolean): Promise<string> {
  const o = await orcamento(id);
  const emp = await empresa();
  if (doc === 'cliente') {
    const [[[cliente]], [arquitetos], [ambientes], [moveis], [condicoes]] = await Promise.all([
      pool.query<any[]>('SELECT * FROM clientes WHERE id = ?', [o.cliente_id]),
      pool.query<any[]>('SELECT * FROM arquitetos WHERE id = ?', [o.arquiteto_id ?? 0]),
      pool.query<any[]>('SELECT * FROM orcamento_ambientes WHERE orcamento_id = ? ORDER BY ordem, id', [id]),
      pool.query<any[]>(
        `SELECT m.*, ac.nome AS acabamento_caixa, af.nome AS acabamento_frente FROM orcamento_moveis m
           LEFT JOIN acabamentos ac ON ac.id = m.acabamento_caixa_id LEFT JOIN acabamentos af ON af.id = m.acabamento_frente_id
          WHERE m.orcamento_id = ? ORDER BY m.ordem, m.id`,
        [id],
      ),
      pool.query<any[]>('SELECT * FROM condicoes_pagamento WHERE id = ?', [o.condicao_pagamento_id ?? 0]),
    ]);
    const minis = await miniaturas(moveis);
    const cond = condicoes[0] ?? null;
    return htmlOrcamentoCliente({
      empresa: emp,
      orcamento: o,
      cliente,
      arquiteto: arquitetos[0] ?? null,
      ambientes,
      moveis: moveis.map((m) => ({ ...m, miniatura: minis.get(Number(m.id)) ?? null })),
      condicao: cond,
      parcelas: cond ? calcularParcelas(Number(o.valor_final), cond) : [],
      porMovel,
    });
  }
  if (doc === 'interno') {
    const [[moveis], [consumos], [itens]] = await Promise.all([
      pool.query<any[]>('SELECT * FROM orcamento_moveis WHERE orcamento_id = ? ORDER BY ordem, id', [id]),
      pool.query<any[]>('SELECT c.*, mp.descricao FROM orcamento_consumos c JOIN materias_primas mp ON mp.id = c.materia_prima_id WHERE c.orcamento_id = ? ORDER BY c.tipo, mp.descricao', [id]),
      pool.query<any[]>('SELECT * FROM orcamento_itens WHERE orcamento_id = ? ORDER BY tipo_item, movel_id, id', [id]),
    ]);
    return htmlRelatorioInterno({ empresa: emp, orcamento: o, moveis, consumos, itens, nomeMovel: new Map(moveis.map((m) => [Number(m.id), m.descricao])) });
  }
  if (doc === 'lista-corte') {
    return htmlListaCorte({ empresa: emp, orcamento: o, linhas: await linhasCorte(id) });
  }
  if (doc === 'plano-corte') {
    const p = await dadosPlanoCorte(id);
    return htmlPlanoCorte({
      empresa: emp,
      orcamento: o,
      refilo: p.refilo,
      kerf: p.kerf,
      chapas: p.chapas,
      pecas: new Map(p.pecas.map((x: any) => [Number(x.id), { descricao: x.descricao, movel_id: Number(x.movel_id) }])),
      cores: new Map(p.moveis.map((m: any, i: number) => [Number(m.id), CORES_MOVEL[i % CORES_MOVEL.length]])),
      moveis: p.moveis,
    });
  }
  throw falha('Documento desconhecido.', 404);
}

const linhasCorte = async (id: number) =>
  (await pool.query<any[]>('SELECT * FROM vw_pecas_corte WHERE orcamento_id = ? ORDER BY chapa, movel_id, peca_id', [id]))[0];

export function createDocumentosRouter() {
  const router = Router();

  // PDFs do orçamento: cliente (sem custos), interno, lista de corte e plano de corte
  router.get('/orcamentos/:id/documentos/:doc', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const html = await htmlDocumento(id, req.params.doc, req.query.porMovel === '1');
      if (req.query.formato === 'html') return res.type('html').send(html);
      const pdf = await gerarPdf(html);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo(await orcamento(id), req.params.doc)}.pdf"`);
      res.send(pdf);
    } catch (err: any) {
      erro(res, err);
    }
  });

  router.get('/orcamentos/:id/lista-corte.csv', async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const o = await orcamento(id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo(o, 'lista-corte')}.csv"`);
      res.send(csvListaCorte(await linhasCorte(id)));
    } catch (err: any) {
      erro(res, err);
    }
  });

  // Relatório de RT: orçamentos aprovados (ou já em produção) com arquiteto, pela data de aprovação
  router.get('/relatorios/rt', async (req: Request, res: Response) => {
    try {
      const inicio = String(req.query.inicio ?? '');
      const fim = String(req.query.fim ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) throw falha('Informe o período (início e fim).');
      const arquiteto = Number(req.query.arquiteto_id) || null;
      const [linhas] = await pool.query<any[]>(
        `SELECT o.id, o.numero, o.revisao, o.titulo, o.data_aprovacao, o.valor_final, o.perc_rt, o.valor_rt, o.arquiteto_id,
                a.nome AS arquiteto_nome, a.escritorio, a.chave_pix, c.nome AS cliente_nome
           FROM orcamentos o JOIN arquitetos a ON a.id = o.arquiteto_id JOIN clientes c ON c.id = o.cliente_id
          WHERE o.status IN ('APROVADO', 'EM_PRODUCAO') AND DATE(o.data_aprovacao) BETWEEN ? AND ?${arquiteto ? ' AND o.arquiteto_id = ?' : ''}
          ORDER BY a.nome, o.data_aprovacao`,
        arquiteto ? [inicio, fim, arquiteto] : [inicio, fim],
      );
      if (req.query.formato !== 'pdf') return res.json(linhas);
      const pdf = await gerarPdf(htmlRelatorioRt({ empresa: await empresa(), inicio, fim, linhas }));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="relatorio-rt-${inicio}-a-${fim}.pdf"`);
      res.send(pdf);
    } catch (err: any) {
      erro(res, err);
    }
  });

  // Painel: só a revisão mais recente de cada número
  router.get('/dashboard', async (_req: Request, res: Response) => {
    try {
      const [[porStatus], [[aberto]], [[decisoes]], [[mes]], [ranking], [vencendo]] = await Promise.all([
        pool.query<any[]>(`SELECT o.status, COUNT(*) AS quantidade, COALESCE(SUM(o.valor_final), 0) AS valor FROM orcamentos o WHERE ${ULTIMA} GROUP BY o.status`),
        pool.query<any[]>(`SELECT COUNT(*) AS quantidade, COALESCE(SUM(o.valor_final), 0) AS valor FROM orcamentos o WHERE o.status IN ${ABERTOS} AND ${ULTIMA}`),
        // Conversão do mês: aprovados ÷ decididos (aprovados, reprovados e expirados) no mês
        pool.query<any[]>(
          `SELECT COALESCE(SUM(h.status_novo = 'APROVADO'), 0) AS aprovados, COUNT(*) AS decididos FROM orcamento_status_historico h
            WHERE h.status_novo IN ('APROVADO', 'REPROVADO', 'EXPIRADO') AND h.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
        ),
        pool.query<any[]>(
          `SELECT COUNT(*) AS aprovados, COALESCE(SUM(o.valor_final), 0) AS valor, AVG(o.valor_final) AS ticket FROM orcamentos o
            WHERE o.status IN ('APROVADO', 'EM_PRODUCAO') AND o.data_aprovacao >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
        ),
        pool.query<any[]>(
          `SELECT a.id, a.nome, a.escritorio, COUNT(*) AS aprovados, SUM(o.valor_final) AS valor, SUM(o.valor_rt) AS rt FROM orcamentos o
             JOIN arquitetos a ON a.id = o.arquiteto_id WHERE o.status IN ('APROVADO', 'EM_PRODUCAO') AND YEAR(o.data_aprovacao) = YEAR(CURDATE())
            GROUP BY a.id, a.nome, a.escritorio ORDER BY valor DESC LIMIT 10`,
        ),
        pool.query<any[]>(
          `SELECT o.id, o.numero, o.revisao, o.titulo, o.status, o.data_validade, o.valor_final, c.nome AS cliente_nome FROM orcamentos o
             JOIN clientes c ON c.id = o.cliente_id WHERE o.status IN ${ABERTOS} AND ${ULTIMA}
              AND o.data_validade BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY) ORDER BY o.data_validade, o.numero`,
        ),
      ]);
      res.json({ porStatus, aberto, conversao: decisoes, mes, ranking, vencendo });
    } catch (err: any) {
      erro(res, err);
    }
  });

  return router;
}
