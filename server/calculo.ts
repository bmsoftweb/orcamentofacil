import { Router, Request, Response } from 'express';
import Decimal from 'decimal.js';
import { pool } from './db.js';
import { calcularOrcamento, CatalogoItem, ItemCalc, MateriaPrimaCalc, ResultadoCalculo } from '../src/lib/orcamento/calculo.js';
import { otimizar, ResultadoCorte } from '../src/lib/corte/otimizador.js';

const falha = (msg: string, status = 400) => Object.assign(new Error(msg), { status });
const num = (x: any) => (x == null ? null : Number(x));
const REF: Record<string, string> = { MATERIA_PRIMA: 'materia_prima_id', INSUMO: 'insumo_id', MATERIAL: 'material_id', SERVICO: 'servico_id' };

/**
 * Recalcula o orçamento: lê o retrato do banco, roda o motor (função pura) e grava tudo numa transação.
 *
 * Preços: o orçamento guarda o preço de cada item quando ele entra (snapshot). Sem `atualizarPrecos`,
 * chapas, fitas e itens refeitos pelas regras usam o preço já gravado no orçamento; com ele, todos voltam
 * a ler o catálogo (botão "Atualizar preços do catálogo").
 */
export async function calcularNoBanco(orcamentoId: number, opcoes: { atualizarPrecos?: boolean } = {}) {
  const atualizar = Boolean(opcoes.atualizarPrecos);
  const [[orc]] = await pool.query<any[]>('SELECT * FROM orcamentos WHERE id = ?', [orcamentoId]);
  if (!orc) throw falha('Orçamento não encontrado.', 404);
  if (!['RASCUNHO', 'EM_REVISAO'].includes(orc.status)) throw falha('Só orçamentos em rascunho ou em revisão são recalculados.');

  const [[[cfg]], [[cond]], [moveis], [pecas], [itens], [mps], [mats], [ins], [servs], [tipos], [rf], [ri], [consumosAntes]] = await Promise.all([
    pool.query<any[]>('SELECT * FROM configuracoes WHERE id = 1'),
    pool.query<any[]>('SELECT perc_ajuste FROM condicoes_pagamento WHERE id = ?', [orc.condicao_pagamento_id ?? 0]),
    pool.query<any[]>('SELECT id, quantidade FROM orcamento_moveis WHERE orcamento_id = ? ORDER BY ordem, id', [orcamentoId]),
    pool.query<any[]>('SELECT p.* FROM orcamento_pecas p JOIN orcamento_moveis m ON m.id = p.movel_id WHERE m.orcamento_id = ? ORDER BY p.id', [orcamentoId]),
    pool.query<any[]>('SELECT * FROM orcamento_itens WHERE orcamento_id = ? ORDER BY id', [orcamentoId]),
    pool.query<any[]>('SELECT mp.*, u.sigla FROM materias_primas mp JOIN unidades_medida u ON u.id = mp.unidade_id'),
    pool.query<any[]>('SELECT m.*, u.sigla FROM materiais m JOIN unidades_medida u ON u.id = m.unidade_id'),
    pool.query<any[]>('SELECT i.*, u.sigla FROM insumos i JOIN unidades_medida u ON u.id = i.unidade_id'),
    pool.query<any[]>('SELECT * FROM servicos WHERE ativo = 1 AND aplicar_automatico = 1 ORDER BY id'),
    pool.query<any[]>('SELECT id, nome FROM tipos_peca'),
    pool.query<any[]>('SELECT * FROM regras_ferragem WHERE ativo = 1 ORDER BY id'),
    pool.query<any[]>('SELECT * FROM regras_insumo WHERE ativo = 1 ORDER BY id'),
    pool.query<any[]>('SELECT * FROM orcamento_consumos WHERE orcamento_id = ?', [orcamentoId]),
  ]);

  // Preços já gravados no orçamento (snapshot), por item do catálogo
  const snapItem = new Map<string, any>();
  if (!atualizar) for (const i of itens) if (i[REF[i.tipo_item]]) snapItem.set(`${i.tipo_item}|${i[REF[i.tipo_item]]}`, i.custo_unitario);
  const snapConsumo = new Map(atualizar ? [] : consumosAntes.map((c) => [Number(c.materia_prima_id), c]));
  const snapM2Peca = new Map<number, any>();
  if (!atualizar) for (const p of pecas) if (Number(p.custo_m2_chapa) > 0) snapM2Peca.set(Number(p.materia_prima_id), p.custo_m2_chapa);

  const materiasPrimas = new Map<number, MateriaPrimaCalc>(
    mps.map((m) => {
      let custo: Decimal.Value = m.custo_unitario;
      const area = new Decimal(m.largura_mm ?? 0).mul(m.comprimento_mm ?? 0).div(1e6);
      const s = snapConsumo.get(Number(m.id));
      if (s) custo = s.unidade_sigla === 'M2' && m.tipo === 'CHAPA' ? new Decimal(s.custo_unitario).mul(area) : s.custo_unitario;
      else if (snapM2Peca.has(Number(m.id)) && area.gt(0)) custo = new Decimal(snapM2Peca.get(Number(m.id))).mul(area);
      return [Number(m.id), { id: Number(m.id), descricao: m.descricao, tipo: m.tipo, custoUnitario: custo, larguraMm: m.largura_mm, comprimentoMm: m.comprimento_mm, percPerda: m.perc_perda, unidade: m.sigla }];
    }),
  );
  const catalogo = (lista: any[], tipoItem: string, campoCusto = 'custo_unitario') =>
    new Map<number, CatalogoItem>(
      lista.map((x) => [Number(x.id), { id: Number(x.id), descricao: x.descricao, unidade: x.sigla, tipo: x.tipo, custoUnitario: snapItem.get(`${tipoItem}|${x.id}`) ?? x[campoCusto] }]),
    );
  const materiais = catalogo(mats, 'MATERIAL');
  const insumos = catalogo(ins, 'INSUMO');
  /** Preço atual do catálogo de um item já lançado (só quando "atualizar preços"; os editados à mão não mudam) */
  const precoNovo = (i: any): Decimal.Value | undefined => {
    if (!atualizar || Number(i.editado_manual)) return undefined;
    if (i.tipo_item === 'MATERIAL') return materiais.get(Number(i.material_id))?.custoUnitario;
    if (i.tipo_item === 'INSUMO') return insumos.get(Number(i.insumo_id))?.custoUnitario;
    if (i.tipo_item === 'MATERIA_PRIMA') return materiasPrimas.get(Number(i.materia_prima_id))?.custoUnitario;
    return undefined;
  };

  // Plano de corte por chapa: o número de chapas entra no custo (critério chapa inteira) e o plano é gravado
  const qtdMovel = new Map(moveis.map((m) => [Number(m.id), Number(m.quantidade)]));
  const planos = new Map<number, ResultadoCorte>();
  const avisosCorte: string[] = [];
  for (const mpId of new Set(pecas.map((p) => Number(p.materia_prima_id)))) {
    const mp = mps.find((m) => Number(m.id) === mpId);
    if (!mp || !(Number(mp.comprimento_mm) > 0 && Number(mp.largura_mm) > 0)) continue;
    const plano = otimizar(
      pecas
        .filter((p) => Number(p.materia_prima_id) === mpId)
        .map((p) => ({
          id: Number(p.id),
          comprimento: Number(p.comprimento_mm),
          largura: Number(p.largura_mm),
          quantidade: Number(p.quantidade) * (qtdMovel.get(Number(p.movel_id)) ?? 1),
          respeitaVeio: Boolean(Number(p.respeita_veio)),
        })),
      { comprimento: Number(mp.comprimento_mm), largura: Number(mp.largura_mm), possuiVeio: Boolean(Number(mp.possui_veio)) },
      { kerf: Number(cfg.espessura_serra_mm), refilo: Number(cfg.refilo_chapa_mm) },
    );
    planos.set(mpId, plano);
    for (const e of plano.erros) {
      const p = pecas.find((x) => Number(x.id) === e.pecaId);
      avisosCorte.push(`Plano de corte: "${p?.descricao ?? e.pecaId}" (${e.quantidade}×) ficou de fora — ${e.motivo}.`);
    }
  }
  const chapasOtimizador = new Map(
    [...planos].map(([mpId, pl]) => {
      const util = pl.chapas.reduce((s, c) => s + (c.comprimentoUtil * c.larguraUtil) / 1e6, 0);
      const area = pl.chapas.reduce((s, c) => s + c.areaPecasM2, 0);
      return [mpId, { chapas: pl.chapas.length, aproveitamento: util > 0 ? Math.round((area / util) * 10000) / 100 : null }];
    }),
  );

  const r: ResultadoCalculo = calcularOrcamento({
    criterio: orc.criterio_cobranca_chapa,
    modoFerragens: orc.modo_ferragens ?? 'AMBAS', // sem a migration 003: ambas
    percentuais: {
      custoFixo: orc.perc_custo_fixo,
      impostos: orc.perc_impostos,
      comissao: orc.perc_comissao,
      rt: orc.perc_rt,
      margem: orc.perc_margem,
      desconto: orc.perc_desconto,
      valorDescontoDigitado: orc.valor_desconto,
      ajustePagamento: cond?.perc_ajuste ?? 0,
    },
    config: { percPerdaChapa: cfg.perc_perda_chapa_padrao, percPerdaFita: cfg.perc_perda_fita_padrao, sobraFitaPorBordaMm: cfg.sobra_fita_por_borda_mm, refiloMm: cfg.refilo_chapa_mm },
    moveis: moveis.map((m) => ({ id: Number(m.id), quantidade: Number(m.quantidade) })),
    pecas: pecas.map((p) => ({
      id: Number(p.id),
      movelId: Number(p.movel_id),
      tipoPecaId: num(p.tipo_peca_id),
      materiaPrimaId: Number(p.materia_prima_id),
      comprimento: p.comprimento_mm,
      largura: p.largura_mm,
      quantidade: Number(p.quantidade),
      fitas: [num(p.fita_comp1_id), num(p.fita_comp2_id), num(p.fita_larg1_id), num(p.fita_larg2_id)],
    })),
    itens: itens.map(
      (i): ItemCalc => ({
        id: Number(i.id),
        movelId: num(i.movel_id),
        tipoItem: i.tipo_item,
        refId: num(i[REF[i.tipo_item]]),
        descricao: i.descricao,
        unidade: i.unidade_sigla,
        custoUnitario: precoNovo(i) ?? i.custo_unitario,
        quantidade: i.quantidade,
        origem: i.origem,
        editadoManual: Boolean(Number(i.editado_manual)),
        regraDescricao: i.regra_descricao,
      }),
    ),
    materiasPrimas,
    materiais,
    insumos,
    servicosAutomaticos: servs.map((s) => ({ id: Number(s.id), descricao: s.descricao, base: s.base_calculo, valorUnitario: snapItem.get(`SERVICO|${s.id}`) ?? s.valor_unitario })),
    tiposPeca: new Map(tipos.map((t) => [Number(t.id), { id: Number(t.id), nome: t.nome }])),
    regrasFerragem: rf.map((x) => ({ id: x.id, tipoPecaId: x.tipo_peca_id, materialId: x.material_id, dimensao: x.dimensao_referencia, min: x.dimensao_min_mm, max: x.dimensao_max_mm, quantidade: x.quantidade })),
    regrasInsumo: ri.map((x) => ({ id: x.id, insumoId: x.insumo_id, base: x.base_calculo, tipoPecaId: num(x.tipo_peca_id), tipoMaterial: x.tipo_material, consumo: x.consumo, arredondar: Boolean(x.arredondar_para_cima) })),
    chapasOtimizador,
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Uma instrução por lote (o cálculo roda a cada edição; uma por linha fica lento com o banco remoto)
    for (let i = 0; i < r.pecas.length; i += 500) {
      const lote = r.pecas.slice(i, i + 500);
      await conn.query(
        `UPDATE orcamento_pecas p JOIN (${lote.map(() => 'SELECT ? AS id, ? AS m2, ? AS chapa, ? AS fita').join(' UNION ALL ')}) v ON v.id = p.id
            SET p.custo_m2_chapa = v.m2, p.custo_chapa = v.chapa, p.custo_fita = v.fita`,
        lote.flatMap((p) => [p.id, p.custoM2Chapa.toFixed(4), p.custoChapa.toFixed(2), p.custoFita.toFixed(2)]),
      );
    }
    await conn.query('DELETE FROM orcamento_planos_corte WHERE orcamento_id = ?', [orcamentoId]);
    const linhasPlano = [...planos].flatMap(([mpId, pl]) =>
      pl.chapas.map((c) => [
        orcamentoId,
        mpId,
        c.numero,
        c.larguraUtil.toFixed(2),
        c.comprimentoUtil.toFixed(2),
        c.areaPecasM2.toFixed(4),
        c.aproveitamento.toFixed(2),
        JSON.stringify({ heuristica: pl.heuristica, pecas: c.pecas, sobras: c.sobras }),
      ]),
    );
    if (linhasPlano.length) {
      await conn.query(
        'INSERT INTO orcamento_planos_corte (orcamento_id, materia_prima_id, numero_chapa, largura_util_mm, comprimento_util_mm, area_pecas_m2, aproveitamento_perc, layout) VALUES ?',
        [linhasPlano],
      );
    }
    await conn.query('DELETE FROM orcamento_consumos WHERE orcamento_id = ?', [orcamentoId]);
    if (r.consumos.length) {
      await conn.query(
        `INSERT INTO orcamento_consumos (orcamento_id, materia_prima_id, tipo, quantidade_liquida, perc_perda, quantidade_cobrada, unidade_sigla, aproveitamento_perc, custo_unitario) VALUES ?`,
        [r.consumos.map((c) => [orcamentoId, c.materiaPrimaId, c.tipo, c.quantidadeLiquida.toFixed(4), c.percPerda.toFixed(2), c.quantidadeCobrada.toFixed(4), c.unidade, c.aproveitamento?.toFixed(2) ?? null, c.custoUnitario.toFixed(4)])],
      );
    }
    await conn.query("DELETE FROM orcamento_itens WHERE orcamento_id = ? AND origem IN ('REGRA', 'AUTOMATICO') AND editado_manual = 0", [orcamentoId]);
    if (r.itensGerados.length) {
      await conn.query(
        `INSERT INTO orcamento_itens (orcamento_id, movel_id, tipo_item, materia_prima_id, insumo_id, material_id, servico_id, descricao, unidade_sigla, quantidade, custo_unitario, origem, regra_descricao) VALUES ?`,
        [
          r.itensGerados.map((i) => [
            orcamentoId,
            i.movelId,
            i.tipoItem,
            i.tipoItem === 'MATERIA_PRIMA' ? i.refId : null,
            i.tipoItem === 'INSUMO' ? i.refId : null,
            i.tipoItem === 'MATERIAL' ? i.refId : null,
            i.tipoItem === 'SERVICO' ? i.refId : null,
            String(i.descricao).slice(0, 150),
            i.unidade,
            new Decimal(i.quantidade).toFixed(4),
            new Decimal(i.custoUnitario).toFixed(4),
            i.origem,
            i.regraDescricao ?? null,
          ]),
        ],
      );
    }
    // Itens que ficam (modelo e manuais) com o preço novo do catálogo
    for (const i of itens) {
      const novo = ['IMPORTACAO', 'MANUAL'].includes(i.origem) ? precoNovo(i) : undefined;
      if (novo !== undefined) await conn.query('UPDATE orcamento_itens SET custo_unitario = ? WHERE id = ?', [new Decimal(novo).toFixed(4), i.id]);
    }
    if (r.moveis.length) {
      await conn.query(
        `UPDATE orcamento_moveis m JOIN (${r.moveis.map(() => 'SELECT ? AS id, ? AS a, ? AS b, ? AS c, ? AS d, ? AS e, ? AS f, ? AS g, ? AS v').join(' UNION ALL ')}) x ON x.id = m.id
            SET m.custo_chapas = x.a, m.custo_fitas = x.b, m.custo_outras_mp = x.c, m.custo_insumos = x.d, m.custo_ferragens = x.e,
                m.custo_servicos = x.f, m.custo_avulsos = x.g, m.valor_venda = x.v`,
        r.moveis.flatMap((m) => {
          const c = m.custos;
          return [m.id, ...[c.chapas, c.fitas, c.outrasMp, c.insumos, c.ferragens, c.servicos, c.avulsos, m.valorVenda].map((x) => x.toFixed(2))];
        }),
      );
    }
    const o = r.orcamento;
    await conn.query(
      `UPDATE orcamentos SET custo_chapas = ?, custo_fitas = ?, custo_outras_mp = ?, custo_insumos = ?, custo_ferragens = ?, custo_servicos = ?, custo_avulsos = ?,
         valor_venda_calculado = ?, valor_desconto = ?, valor_ajuste_pagamento = ?, valor_final = ?, valor_rt = ?, margem_real_perc = ?, calculado_em = NOW() WHERE id = ?`,
      [
        ...[o.chapas, o.fitas, o.outrasMp, o.insumos, o.ferragens, o.servicos, o.avulsos, o.valorVendaCalculado, o.valorDesconto, o.valorAjustePagamento, o.valorFinal, o.valorRt].map((x) => x.toFixed(2)),
        o.margemRealPerc?.toFixed(2) ?? null,
        orcamentoId,
      ],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }

  return {
    custoTotal: r.orcamento.total.toFixed(2),
    valorFinal: r.orcamento.valorFinal.toFixed(2),
    margemRealPerc: r.orcamento.margemRealPerc?.toFixed(2) ?? null,
    alertas: r.alertas,
    avisos: [...avisosCorte, ...r.avisos],
    chapasEstimadas: r.consumos.some((c) => c.estimado),
  };
}

/** Planos gravados no último cálculo, com o que ficou de fora (peça sem lugar em nenhuma chapa) */
export async function dadosPlanoCorte(id: number) {
  const [[[orc]], [[cfg]], [planos], [pecas], [moveis]] = await Promise.all([
    pool.query<any[]>('SELECT numero, revisao, calculado_em FROM orcamentos WHERE id = ?', [id]),
    pool.query<any[]>('SELECT refilo_chapa_mm, espessura_serra_mm FROM configuracoes WHERE id = 1'),
    pool.query<any[]>(
      `SELECT pc.*, mp.descricao, mp.comprimento_mm, mp.largura_mm, mp.possui_veio FROM orcamento_planos_corte pc
         JOIN materias_primas mp ON mp.id = pc.materia_prima_id WHERE pc.orcamento_id = ? ORDER BY pc.materia_prima_id, pc.numero_chapa`,
      [id],
    ),
    pool.query<any[]>(
      `SELECT p.id, p.descricao, p.movel_id, p.materia_prima_id, p.comprimento_mm, p.largura_mm, p.espessura_mm, p.quantidade * m.quantidade AS quantidade_total
         FROM orcamento_pecas p JOIN orcamento_moveis m ON m.id = p.movel_id WHERE m.orcamento_id = ? ORDER BY p.id`,
      [id],
    ),
    pool.query<any[]>('SELECT id, descricao, quantidade FROM orcamento_moveis WHERE orcamento_id = ? ORDER BY ordem, id', [id]),
  ]);
  if (!orc) throw falha('Orçamento não encontrado.', 404);
  const chapas = new Map<number, any>();
  const colocadas = new Map<number, number>();
  for (const pl of planos) {
    const layout = typeof pl.layout === 'string' ? JSON.parse(pl.layout) : pl.layout;
    if (!chapas.has(pl.materia_prima_id)) {
      chapas.set(pl.materia_prima_id, {
        materia_prima_id: pl.materia_prima_id,
        descricao: pl.descricao,
        comprimento: Number(pl.comprimento_mm),
        largura: Number(pl.largura_mm),
        possui_veio: Boolean(Number(pl.possui_veio)),
        heuristica: layout.heuristica,
        planos: [],
      });
    }
    chapas.get(pl.materia_prima_id).planos.push({
      numero: pl.numero_chapa,
      comprimento_util: Number(pl.comprimento_util_mm),
      largura_util: Number(pl.largura_util_mm),
      area_pecas_m2: Number(pl.area_pecas_m2),
      aproveitamento: Number(pl.aproveitamento_perc),
      pecas: layout.pecas,
      sobras: layout.sobras,
    });
    for (const p of layout.pecas) colocadas.set(p.pecaId, (colocadas.get(p.pecaId) ?? 0) + 1);
  }
  const erros = pecas
    .filter((p) => (colocadas.get(Number(p.id)) ?? 0) < Number(p.quantidade_total))
    .map((p) => ({ peca_id: p.id, descricao: p.descricao, medidas: `${Number(p.comprimento_mm)} × ${Number(p.largura_mm)} × ${Number(p.espessura_mm)}`, faltam: Number(p.quantidade_total) - (colocadas.get(Number(p.id)) ?? 0) }));
  return { orcamento: orc, refilo: Number(cfg.refilo_chapa_mm), kerf: Number(cfg.espessura_serra_mm), chapas: [...chapas.values()], pecas, moveis, erros };
}

export function createCalculoRouter() {
  const router = Router();
  router.post('/orcamentos/:id/calcular', async (req: Request, res: Response) => {
    try {
      res.json(await calcularNoBanco(Number(req.params.id), { atualizarPrecos: Boolean(req.body?.atualizarPrecos) }));
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });
  router.get('/orcamentos/:id/plano-corte', async (req: Request, res: Response) => {
    try {
      res.json(await dadosPlanoCorte(Number(req.params.id)));
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  return router;
}
