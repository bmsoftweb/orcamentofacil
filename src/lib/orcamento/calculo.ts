import Decimal from 'decimal.js';

/**
 * Motor de cálculo do orçamento (Módulo 4 do prompt). Função pura: recebe um retrato do orçamento
 * (móveis, peças, itens, catálogo com os preços já resolvidos, regras, configuração) e devolve tudo o
 * que deve ser gravado. Todo valor passa por Decimal; arredonda em 2 casas por linha e nos totais.
 */

type Valor = Decimal.Value;
const D = (x: Valor | null | undefined) => new Decimal(x ?? 0);
const r2 = (x: Decimal) => x.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const r4 = (x: Decimal) => x.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
const fmt = (x: Decimal) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(x.toNumber());

export type Criterio = 'CHAPA_INTEIRA' | 'AREA_COM_PERDA';
/** Ferragens do modelo × por regra × ambas (a regra não soma onde o modelo já trouxe o mesmo tipo de ferragem no móvel) */
export type ModoFerragens = 'MODELO' | 'REGRA' | 'AMBAS';
export type TipoItem = 'MATERIA_PRIMA' | 'INSUMO' | 'MATERIAL' | 'SERVICO' | 'AVULSO';
export type Origem = 'IMPORTACAO' | 'REGRA' | 'AUTOMATICO' | 'MANUAL';
export type Base = 'POR_M2_PECA' | 'POR_METRO_FITA' | 'POR_PECA' | 'POR_CHAPA' | 'POR_MOVEL' | 'POR_FERRAGEM' | 'POR_ORCAMENTO' | 'POR_HORA' | 'POR_KM' | 'FIXO_ORCAMENTO';

export interface MateriaPrimaCalc {
  id: number;
  descricao: string;
  tipo: string;
  /** Chapa: preço da chapa inteira; fita: preço do metro */
  custoUnitario: Valor;
  larguraMm: Valor | null;
  comprimentoMm: Valor | null;
  /** null = usa a perda padrão da configuração */
  percPerda: Valor | null;
  unidade: string;
}
export interface CatalogoItem {
  id: number;
  descricao: string;
  custoUnitario: Valor;
  unidade: string;
  /** Ferragem: tipo (DOBRADICA, PUXADOR...) */
  tipo?: string;
}
export interface ServicoCalc {
  id: number;
  descricao: string;
  base: Base;
  valorUnitario: Valor;
}
export interface RegraFerragem {
  id: number;
  tipoPecaId: number;
  materialId: number;
  dimensao: 'NENHUMA' | 'COMPRIMENTO' | 'LARGURA';
  min: Valor;
  max: Valor;
  quantidade: Valor;
}
export interface RegraInsumo {
  id: number;
  insumoId: number;
  base: Base;
  tipoPecaId: number | null;
  tipoMaterial: string | null;
  consumo: Valor;
  arredondar: boolean;
}
export interface MovelCalc {
  id: number;
  quantidade: number;
}
export interface PecaCalc {
  id: number;
  movelId: number;
  tipoPecaId: number | null;
  materiaPrimaId: number;
  comprimento: Valor;
  largura: Valor;
  /** Por unidade do móvel */
  quantidade: number;
  /** Fita por borda: comprimento 1, comprimento 2, largura 1, largura 2 (null = sem fita) */
  fitas: [number | null, number | null, number | null, number | null];
}
export interface ItemCalc {
  id: number | null;
  movelId: number | null;
  tipoItem: TipoItem;
  refId: number | null;
  descricao: string;
  unidade: string;
  quantidade: Valor;
  custoUnitario: Valor;
  origem: Origem;
  editadoManual: boolean;
  regraDescricao?: string | null;
}

export interface EntradaCalculo {
  criterio: Criterio;
  modoFerragens: ModoFerragens;
  percentuais: {
    custoFixo: Valor;
    impostos: Valor;
    comissao: Valor;
    rt: Valor;
    margem: Valor;
    desconto: Valor;
    /** Desconto em R$ digitado (vale quando o percentual de desconto é zero) */
    valorDescontoDigitado: Valor | null;
    /** Da condição de pagamento: negativo = desconto, positivo = acréscimo */
    ajustePagamento: Valor;
  };
  config: { percPerdaChapa: Valor; percPerdaFita: Valor; sobraFitaPorBordaMm: Valor; refiloMm: Valor };
  moveis: MovelCalc[];
  pecas: PecaCalc[];
  itens: ItemCalc[];
  materiasPrimas: Map<number, MateriaPrimaCalc>;
  materiais: Map<number, CatalogoItem>;
  insumos: Map<number, CatalogoItem>;
  servicosAutomaticos: ServicoCalc[];
  tiposPeca: Map<number, { id: number; nome: string }>;
  regrasFerragem: RegraFerragem[];
  regrasInsumo: RegraInsumo[];
  /** Chapas usadas por matéria-prima, vindas do otimizador de corte (critério chapa inteira) */
  chapasOtimizador?: Map<number, { chapas: number; aproveitamento: Valor | null }>;
}

export interface PecaResultado {
  id: number;
  areaM2: Decimal;
  metrosFita: Decimal;
  custoM2Chapa: Decimal;
  custoChapa: Decimal;
  custoFita: Decimal;
}
export interface ConsumoResultado {
  materiaPrimaId: number;
  tipo: 'CHAPA' | 'FITA_BORDA';
  quantidadeLiquida: Decimal;
  percPerda: Decimal;
  quantidadeCobrada: Decimal;
  unidade: string;
  aproveitamento: Decimal | null;
  custoUnitario: Decimal;
  custoTotal: Decimal;
  /** Número de chapas estimado pela área (sem o otimizador) */
  estimado?: boolean;
}
export interface Custos {
  chapas: Decimal;
  fitas: Decimal;
  outrasMp: Decimal;
  insumos: Decimal;
  ferragens: Decimal;
  servicos: Decimal;
  avulsos: Decimal;
  total: Decimal;
}
export interface MovelResultado {
  id: number;
  custos: Custos;
  valorVenda: Decimal;
}
export interface ResultadoCalculo {
  pecas: PecaResultado[];
  consumos: ConsumoResultado[];
  /** Itens REGRA/AUTOMATICO novos (os antigos não editados são apagados) */
  itensGerados: ItemCalc[];
  /** Itens que ficam mas não entram no custo (ferragens do modelo no modo "por regra") */
  itensFora: number[];
  moveis: MovelResultado[];
  orcamento: Custos & {
    valorVendaCalculado: Decimal;
    valorDesconto: Decimal;
    valorAjustePagamento: Decimal;
    valorFinal: Decimal;
    valorRt: Decimal;
    margemRealPerc: Decimal | null;
  };
  alertas: { margemBaixa: boolean; margemNegativa: boolean };
  avisos: string[];
}

const UNIDADE_BASE: Record<string, string> = { POR_M2_PECA: 'M2', POR_METRO_FITA: 'M', POR_PECA: 'PC', POR_CHAPA: 'CH', POR_MOVEL: 'UN', POR_FERRAGEM: 'UN', POR_ORCAMENTO: 'UN' };
const NOME_BASE: Record<string, string> = { POR_M2_PECA: 'm² de peça', POR_METRO_FITA: 'm de fita', POR_PECA: 'peças', POR_CHAPA: 'chapas', POR_MOVEL: 'móveis', POR_FERRAGEM: 'ferragens', POR_ORCAMENTO: 'orçamento' };
/** Bases que valem para o orçamento todo (item sem móvel) */
const GERAIS = ['POR_CHAPA', 'POR_ORCAMENTO'];

const custosZerados = (): Custos => ({ chapas: D(0), fitas: D(0), outrasMp: D(0), insumos: D(0), ferragens: D(0), servicos: D(0), avulsos: D(0), total: D(0) });
const GRUPO: Record<TipoItem, keyof Custos> = { MATERIA_PRIMA: 'outrasMp', INSUMO: 'insumos', MATERIAL: 'ferragens', SERVICO: 'servicos', AVULSO: 'avulsos' };

/** Área da chapa (m²), inteira e útil (sem o refilo dos 4 lados) */
function areasChapa(mp: MateriaPrimaCalc, refilo: Decimal) {
  const c = D(mp.comprimentoMm);
  const l = D(mp.larguraMm);
  return {
    inteira: c.mul(l).div(1e6),
    util: Decimal.max(0, c.minus(refilo.mul(2))).mul(Decimal.max(0, l.minus(refilo.mul(2)))).div(1e6),
  };
}

export function calcularOrcamento(e: EntradaCalculo): ResultadoCalculo {
  const avisos: string[] = [];
  const qtdMovel = new Map(e.moveis.map((m) => [m.id, m.quantidade]));
  const sobra = D(e.config.sobraFitaPorBordaMm);
  const refilo = D(e.config.refiloMm);
  const perdaDe = (mp: MateriaPrimaCalc, padrao: Valor) => D(mp.percPerda ?? padrao);

  // -------------------------------------------------------------------------
  // 1. Peças: área e metros de fita por fita (cada borda com fita soma o lado + a sobra)
  // -------------------------------------------------------------------------
  const pecas = e.pecas.map((p) => {
    const n = D(p.quantidade).mul(qtdMovel.get(p.movelId) ?? 1);
    const area = D(p.comprimento).mul(p.largura).div(1e6).mul(n);
    const metros = new Map<number, Decimal>();
    p.fitas.forEach((f, i) => {
      if (!f) return;
      const lado = i < 2 ? D(p.comprimento) : D(p.largura);
      metros.set(f, (metros.get(f) ?? D(0)).plus(lado.plus(sobra).div(1000).mul(n)));
    });
    return { p, n, area, metros };
  });

  // -------------------------------------------------------------------------
  // 2. Chapas, agrupadas por chapa
  // -------------------------------------------------------------------------
  const consumos: ConsumoResultado[] = [];
  const custoChapaPeca = new Map<number, Decimal>();
  const custoM2Peca = new Map<number, Decimal>();
  let totalChapas = D(0); // para a base POR_CHAPA
  const porChapa = new Map<number, typeof pecas>();
  for (const x of pecas) {
    if (!porChapa.has(x.p.materiaPrimaId)) porChapa.set(x.p.materiaPrimaId, []);
    porChapa.get(x.p.materiaPrimaId)!.push(x);
  }
  for (const [mpId, lista] of porChapa) {
    const mp = e.materiasPrimas.get(mpId);
    if (!mp) {
      avisos.push(`Chapa nº ${mpId} não encontrada no catálogo: peças sem custo.`);
      continue;
    }
    const areas = areasChapa(mp, refilo);
    if (areas.inteira.lte(0)) {
      avisos.push(`"${mp.descricao}" sem medidas cadastradas: peças sem custo.`);
      continue;
    }
    const custoM2 = D(mp.custoUnitario).div(areas.inteira);
    const area = lista.reduce((s, x) => s.plus(x.area), D(0));
    const perda = perdaDe(mp, e.config.percPerdaChapa);
    for (const x of lista) custoM2Peca.set(x.p.id, r4(custoM2));

    if (e.criterio === 'CHAPA_INTEIRA') {
      const otim = e.chapasOtimizador?.get(mpId);
      // ponytail: sem o otimizador, estimativa pela área útil (limite inferior); a fase 6 traz o plano de corte
      const n = otim ? D(otim.chapas) : areas.util.gt(0) ? area.div(areas.util).ceil() : D(0);
      const total = r2(n.mul(mp.custoUnitario));
      // Rateio do custo das chapas entre as peças pela área; a última fica com a diferença do arredondamento
      let resto = total;
      lista.forEach((x, i) => {
        const parte = i === lista.length - 1 ? resto : area.gt(0) ? r2(total.mul(x.area).div(area)) : D(0);
        custoChapaPeca.set(x.p.id, parte);
        resto = resto.minus(parte);
      });
      totalChapas = totalChapas.plus(n);
      consumos.push({
        materiaPrimaId: mpId,
        tipo: 'CHAPA',
        quantidadeLiquida: r4(area),
        percPerda: D(0),
        quantidadeCobrada: n,
        unidade: mp.unidade,
        aproveitamento: otim?.aproveitamento != null ? D(otim.aproveitamento) : areas.inteira.gt(0) && n.gt(0) ? r2(area.div(n.mul(areas.inteira)).mul(100)) : null,
        custoUnitario: r4(D(mp.custoUnitario)),
        custoTotal: total,
        estimado: !otim,
      });
    } else {
      for (const x of lista) custoChapaPeca.set(x.p.id, r2(x.area.mul(perda.div(100).plus(1)).mul(custoM2)));
      const cobrada = r4(area.mul(perda.div(100).plus(1)));
      totalChapas = totalChapas.plus(area.mul(perda.div(100).plus(1)).div(areas.inteira).ceil());
      consumos.push({
        materiaPrimaId: mpId,
        tipo: 'CHAPA',
        quantidadeLiquida: r4(area),
        percPerda: perda,
        quantidadeCobrada: cobrada,
        unidade: 'M2',
        aproveitamento: null,
        custoUnitario: r4(custoM2),
        custoTotal: r2(cobrada.mul(r4(custoM2))),
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Fitas: metros × (1 + perda) × custo do metro
  // -------------------------------------------------------------------------
  const metrosPorFita = new Map<number, Decimal>();
  for (const x of pecas) for (const [f, m] of x.metros) metrosPorFita.set(f, (metrosPorFita.get(f) ?? D(0)).plus(m));
  const custoFitaPeca = new Map<number, Decimal>();
  for (const x of pecas) {
    let c = D(0);
    for (const [f, m] of x.metros) {
      const fita = e.materiasPrimas.get(f);
      if (fita) c = c.plus(m.mul(perdaDe(fita, e.config.percPerdaFita).div(100).plus(1)).mul(fita.custoUnitario));
    }
    custoFitaPeca.set(x.p.id, r2(c));
  }
  for (const [f, m] of metrosPorFita) {
    const fita = e.materiasPrimas.get(f);
    if (!fita) {
      avisos.push(`Fita nº ${f} não encontrada no catálogo: sem custo.`);
      continue;
    }
    const perda = perdaDe(fita, e.config.percPerdaFita);
    const cobrada = r4(m.mul(perda.div(100).plus(1)));
    consumos.push({
      materiaPrimaId: f,
      tipo: 'FITA_BORDA',
      quantidadeLiquida: r4(m),
      percPerda: perda,
      quantidadeCobrada: cobrada,
      unidade: fita.unidade,
      aproveitamento: null,
      custoUnitario: r4(D(fita.custoUnitario)),
      custoTotal: r2(cobrada.mul(r4(D(fita.custoUnitario)))),
    });
  }

  // -------------------------------------------------------------------------
  // Itens que ficam: manuais, da importação e os editados à mão
  // -------------------------------------------------------------------------
  const ficam = e.itens.filter((i) => i.editadoManual || i.origem === 'MANUAL' || i.origem === 'IMPORTACAO');
  const chaveItem = (i: Pick<ItemCalc, 'movelId' | 'tipoItem' | 'refId' | 'origem'>) => `${i.movelId}|${i.tipoItem}|${i.refId}|${i.origem}`;
  const editados = new Set(ficam.filter((i) => i.editadoManual && (i.origem === 'REGRA' || i.origem === 'AUTOMATICO')).map(chaveItem));
  const itensFora = e.modoFerragens === 'REGRA' ? ficam.filter((i) => i.origem === 'IMPORTACAO' && i.tipoItem === 'MATERIAL').map((i) => i.id!) : [];
  if (itensFora.length) avisos.push(`${itensFora.length} ferragens do modelo ficam fora do custo (orçamento em "ferragens por regra").`);
  const gerados: ItemCalc[] = [];
  const gerar = (i: ItemCalc) => {
    if (editados.has(chaveItem(i))) return; // a versão editada à mão vale no lugar da regra
    gerados.push(i);
  };
  const tipoMaterial = (id: number | null) => (id ? e.materiais.get(id)?.tipo : undefined);

  // -------------------------------------------------------------------------
  // 4. Ferragens por regra de faixa
  // -------------------------------------------------------------------------
  if (e.modoFerragens !== 'MODELO') {
    // Tipos de ferragem que o modelo já trouxe em cada móvel (modo "ambas": a regra não duplica)
    const doModelo = new Set(ficam.filter((i) => i.origem === 'IMPORTACAO' && i.tipoItem === 'MATERIAL').map((i) => `${i.movelId}|${tipoMaterial(i.refId)}`));
    const acumulado = new Map<string, { regra: RegraFerragem; movelId: number; pecas: Decimal }>();
    for (const x of pecas) {
      if (!x.p.tipoPecaId) continue;
      for (const r of e.regrasFerragem.filter((r) => r.tipoPecaId === x.p.tipoPecaId)) {
        const medida = r.dimensao === 'COMPRIMENTO' ? D(x.p.comprimento) : r.dimensao === 'LARGURA' ? D(x.p.largura) : null;
        if (medida && (medida.lt(r.min) || medida.gt(r.max))) continue;
        if (e.modoFerragens === 'AMBAS' && doModelo.has(`${x.p.movelId}|${tipoMaterial(r.materialId)}`)) continue;
        const k = `${x.p.movelId}|${r.id}`;
        const a = acumulado.get(k) ?? { regra: r, movelId: x.p.movelId, pecas: D(0) };
        a.pecas = a.pecas.plus(x.n);
        acumulado.set(k, a);
      }
    }
    for (const { regra, movelId, pecas: n } of acumulado.values()) {
      const mat = e.materiais.get(regra.materialId);
      if (!mat) continue;
      const tipo = e.tiposPeca.get(regra.tipoPecaId)?.nome.toLowerCase() ?? 'peças';
      const faixa =
        regra.dimensao === 'NENHUMA' ? '' : D(regra.min).lte(0) ? ` (até ${fmt(D(regra.max))} mm)` : ` (${fmt(D(regra.min))} a ${fmt(D(regra.max))} mm)`;
      gerar({
        id: null,
        movelId,
        tipoItem: 'MATERIAL',
        refId: mat.id,
        descricao: mat.descricao,
        unidade: mat.unidade,
        quantidade: r4(D(regra.quantidade).mul(n)),
        custoUnitario: mat.custoUnitario,
        origem: 'REGRA',
        editadoManual: false,
        regraDescricao: `${fmt(D(regra.quantidade))} ${mat.descricao} × ${fmt(n)} ${tipo}${faixa}`.slice(0, 255),
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5 e 6. Insumos por regra e serviços automáticos, pela base de cálculo
  // -------------------------------------------------------------------------
  const ferragensContadas = () => [...ficam.filter((i) => !itensFora.includes(i.id!)), ...gerados].filter((i) => i.tipoItem === 'MATERIAL');
  const base = (b: Base, movelId: number | null, tipoPecaId: number | null = null, tipoMat: string | null = null): Decimal => {
    const doMovel = pecas.filter((x) => movelId === null || x.p.movelId === movelId);
    const filtradas = doMovel.filter((x) => !tipoPecaId || x.p.tipoPecaId === tipoPecaId);
    switch (b) {
      case 'POR_M2_PECA':
        return filtradas.reduce((s, x) => s.plus(x.area), D(0));
      case 'POR_METRO_FITA':
        return doMovel.reduce((s, x) => [...x.metros.values()].reduce((t, m) => t.plus(m), s), D(0));
      case 'POR_PECA':
        return filtradas.reduce((s, x) => s.plus(x.n), D(0));
      case 'POR_MOVEL':
        return D(movelId === null ? e.moveis.reduce((s, m) => s + m.quantidade, 0) : qtdMovel.get(movelId) ?? 1);
      case 'POR_FERRAGEM':
        return ferragensContadas()
          .filter((i) => (movelId === null || i.movelId === movelId) && (!tipoMat || tipoMaterial(i.refId) === tipoMat))
          .reduce((s, i) => s.plus(i.quantidade), D(0));
      case 'POR_CHAPA':
        return totalChapas;
      case 'POR_ORCAMENTO':
        return D(1);
      default:
        return D(0);
    }
  };
  const alvos = (b: Base): (number | null)[] => (GERAIS.includes(b) ? [null] : e.moveis.map((m) => m.id));

  for (const r of e.regrasInsumo) {
    const ins = e.insumos.get(r.insumoId);
    if (!ins) continue;
    for (const movelId of alvos(r.base)) {
      const b = base(r.base, movelId, r.tipoPecaId, r.tipoMaterial);
      if (b.lte(0)) continue;
      let q = b.mul(r.consumo);
      if (r.arredondar) q = q.ceil();
      gerar({
        id: null,
        movelId,
        tipoItem: 'INSUMO',
        refId: ins.id,
        descricao: ins.descricao,
        unidade: ins.unidade,
        quantidade: r4(q),
        custoUnitario: ins.custoUnitario,
        origem: 'REGRA',
        editadoManual: false,
        regraDescricao: `${fmt(D(r.consumo))} ${ins.unidade} × ${fmt(b)} ${NOME_BASE[r.base]}${
          r.tipoPecaId ? ` (${e.tiposPeca.get(r.tipoPecaId)?.nome.toLowerCase() ?? 'tipo nº ' + r.tipoPecaId})` : r.tipoMaterial ? ` (${r.tipoMaterial.toLowerCase()})` : ''
        }${r.arredondar ? ', arredondado para cima' : ''}`.slice(0, 255),
      });
    }
  }

  for (const s of e.servicosAutomaticos) {
    if (!UNIDADE_BASE[s.base] || s.base === 'POR_ORCAMENTO') {
      avisos.push(`Serviço "${s.descricao}" (${s.base.toLowerCase()}) entra manualmente no orçamento.`);
      continue;
    }
    for (const movelId of alvos(s.base)) {
      const b = base(s.base, movelId);
      if (b.lte(0)) continue;
      gerar({
        id: null,
        movelId,
        tipoItem: 'SERVICO',
        refId: s.id,
        descricao: s.descricao,
        unidade: UNIDADE_BASE[s.base],
        quantidade: r4(b),
        custoUnitario: s.valorUnitario,
        origem: 'AUTOMATICO',
        editadoManual: false,
        regraDescricao: `${fmt(b)} ${NOME_BASE[s.base]}`,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Custos por móvel e do orçamento
  // -------------------------------------------------------------------------
  const custosMovel = new Map(e.moveis.map((m) => [m.id, custosZerados()]));
  const gerais = custosZerados();
  const somar = (c: Custos, k: keyof Custos, v: Decimal) => {
    c[k] = c[k].plus(v);
    c.total = c.total.plus(v);
  };
  const pecasRes: PecaResultado[] = pecas.map((x) => {
    const custoChapa = custoChapaPeca.get(x.p.id) ?? D(0);
    const custoFita = custoFitaPeca.get(x.p.id) ?? D(0);
    const c = custosMovel.get(x.p.movelId);
    if (c) {
      somar(c, 'chapas', custoChapa);
      somar(c, 'fitas', custoFita);
    }
    return {
      id: x.p.id,
      areaM2: r4(x.area),
      metrosFita: r4([...x.metros.values()].reduce((s, m) => s.plus(m), D(0))),
      custoM2Chapa: custoM2Peca.get(x.p.id) ?? D(0),
      custoChapa,
      custoFita,
    };
  });
  for (const i of [...ficam.filter((i) => !itensFora.includes(i.id!)), ...gerados]) {
    const v = r2(r4(D(i.quantidade)).mul(r4(D(i.custoUnitario))));
    somar(i.movelId !== null ? custosMovel.get(i.movelId) ?? gerais : gerais, GRUPO[i.tipoItem], v);
  }
  const orc = custosZerados();
  for (const c of [...custosMovel.values(), gerais]) for (const k of Object.keys(orc) as (keyof Custos)[]) orc[k] = orc[k].plus(c[k]);

  // 8. Formação de preço (markup divisor)
  const preco = formarPreco(orc.total, e.percentuais);
  const { valorFinal } = preco.valores;

  // -------------------------------------------------------------------------
  // 9. Rateio do valor final entre os móveis, proporcional ao custo
  // -------------------------------------------------------------------------
  const pesoTotal = [...custosMovel.values()].reduce((s, c) => s.plus(c.total), D(0));
  let resto = valorFinal;
  const moveis: MovelResultado[] = e.moveis.map((m, i) => {
    const c = custosMovel.get(m.id)!;
    const valor =
      i === e.moveis.length - 1 ? resto : pesoTotal.gt(0) ? r2(valorFinal.mul(c.total).div(pesoTotal)) : r2(valorFinal.div(e.moveis.length));
    resto = resto.minus(valor);
    return { id: m.id, custos: c, valorVenda: valor };
  });

  return {
    pecas: pecasRes,
    consumos,
    itensGerados: gerados,
    itensFora,
    moveis,
    orcamento: { ...orc, ...preco.valores },
    alertas: preco.alertas,
    avisos,
  };
}

/**
 * Formação de preço por markup divisor, a partir do custo total (Módulo 4, item 8):
 *   venda = custo / (1 − Σ% / 100); desconto (% ou R$); ajuste da condição de pagamento; RT; margem real.
 * Usada pelo motor e pela aba Resumo (recálculo ao vivo no navegador).
 */
export function formarPreco(custoTotal: Valor, p: EntradaCalculo['percentuais']) {
  const custo = D(custoTotal);
  const soma = D(p.custoFixo).plus(p.impostos).plus(p.comissao).plus(p.rt).plus(p.margem);
  if (soma.gte(100)) throw new Error('A soma de custo fixo, impostos, comissão, RT e margem precisa ser menor que 100%.');
  const valorVendaCalculado = r2(custo.div(D(1).minus(soma.div(100))));
  const valorDesconto = D(p.desconto).gt(0) ? r2(valorVendaCalculado.mul(p.desconto).div(100)) : r2(D(p.valorDescontoDigitado));
  const valorAjustePagamento = r2(valorVendaCalculado.minus(valorDesconto).mul(p.ajustePagamento).div(100));
  const valorFinal = valorVendaCalculado.minus(valorDesconto).plus(valorAjustePagamento);
  const valorRt = r2(valorFinal.mul(p.rt).div(100));
  const despesas = D(p.custoFixo).plus(p.impostos).plus(p.comissao).plus(p.rt).div(100);
  const margemRealPerc = valorFinal.gt(0) ? r2(valorFinal.minus(custo).minus(valorFinal.mul(despesas)).div(valorFinal).mul(100)) : null;
  return {
    valores: { valorVendaCalculado, valorDesconto, valorAjustePagamento, valorFinal, valorRt, margemRealPerc },
    alertas: { margemBaixa: margemRealPerc !== null && margemRealPerc.lt(10), margemNegativa: margemRealPerc !== null && margemRealPerc.lt(0) },
  };
}
