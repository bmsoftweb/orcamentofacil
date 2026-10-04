import { describe, expect, it } from 'vitest';
import { calcularOrcamento, EntradaCalculo, ItemCalc } from '../src/lib/orcamento/calculo';

/**
 * Orçamento conhecido, calculado à mão.
 *
 * Chapa MDF 18 (id 1): 2750 × 1850 = 5,0875 m², R$ 275,00 → R$ 54,054054…/m². Fita (id 2): R$ 1,00/m.
 * Perda chapa 15%, perda fita 10%, sobra de fita 50 mm por borda, refilo 10 mm.
 *
 * Móvel 1 (qtd 1): porta 700 × 400 × 2 (4 bordas) e lateral 700 × 350 × 2 (1 borda).
 * Móvel 2 (qtd 2): prateleira 1000 × 300 × 1 (1 borda).
 *   Áreas: porta 0,56; lateral 0,49; prateleira 0,6 (× 2 móveis) → 1,65 m².
 *   Fita: porta (2×750 + 2×450) × 2 = 4,8 m; lateral 750 × 2 = 1,5 m; prateleira 1050 × 2 = 2,1 m → 8,4 m.
 */
const ITEM = (i: Partial<ItemCalc>): ItemCalc => ({
  id: null,
  movelId: null,
  tipoItem: 'AVULSO',
  refId: null,
  descricao: '',
  unidade: 'UN',
  quantidade: 1,
  custoUnitario: 0,
  origem: 'MANUAL',
  editadoManual: false,
  ...i,
});

const base = (extra: Partial<EntradaCalculo> = {}): EntradaCalculo => ({
  criterio: 'CHAPA_INTEIRA',
  modoFerragens: 'AMBAS',
  percentuais: { custoFixo: 10, impostos: 6, comissao: 4, rt: 10, margem: 30, desconto: 5, valorDescontoDigitado: null, ajustePagamento: -3 },
  config: { percPerdaChapa: 15, percPerdaFita: 10, sobraFitaPorBordaMm: 50, refiloMm: 10 },
  moveis: [
    { id: 1, quantidade: 1 },
    { id: 2, quantidade: 2 },
  ],
  pecas: [
    { id: 11, movelId: 1, tipoPecaId: 9, materiaPrimaId: 1, comprimento: 700, largura: 400, quantidade: 2, fitas: [2, 2, 2, 2] },
    { id: 12, movelId: 1, tipoPecaId: 1, materiaPrimaId: 1, comprimento: 700, largura: 350, quantidade: 2, fitas: [2, null, null, null] },
    { id: 21, movelId: 2, tipoPecaId: 4, materiaPrimaId: 1, comprimento: 1000, largura: 300, quantidade: 1, fitas: [2, null, null, null] },
  ],
  itens: [
    // Puxadores modelados no .dae (2 × R$ 15) e o frete lançado à mão
    ITEM({ id: 100, movelId: 1, tipoItem: 'MATERIAL', refId: 2, descricao: 'Puxador', quantidade: 2, custoUnitario: 15, origem: 'IMPORTACAO' }),
    ITEM({ id: 101, tipoItem: 'AVULSO', descricao: 'Frete', quantidade: 1, custoUnitario: 150, origem: 'MANUAL' }),
    // Item de regra antigo, não editado: é apagado e refeito
    ITEM({ id: 102, movelId: 1, tipoItem: 'MATERIAL', refId: 1, descricao: 'Dobradiça', quantidade: 99, custoUnitario: 10, origem: 'REGRA' }),
  ],
  materiasPrimas: new Map([
    [1, { id: 1, descricao: 'MDF 18', tipo: 'CHAPA', custoUnitario: 275, larguraMm: 1850, comprimentoMm: 2750, percPerda: null, unidade: 'CH' }],
    [2, { id: 2, descricao: 'Fita 22', tipo: 'FITA_BORDA', custoUnitario: 1, larguraMm: 22, comprimentoMm: 20000, percPerda: null, unidade: 'M' }],
  ]),
  materiais: new Map([
    [1, { id: 1, descricao: 'Dobradiça', custoUnitario: 10, unidade: 'UN', tipo: 'DOBRADICA' }],
    [2, { id: 2, descricao: 'Puxador', custoUnitario: 15, unidade: 'UN', tipo: 'PUXADOR' }],
  ]),
  insumos: new Map([
    [1, { id: 1, descricao: 'Cola de borda', custoUnitario: 20, unidade: 'KG' }],
    [2, { id: 2, descricao: 'Caixa de parafusos', custoUnitario: 12, unidade: 'CX' }],
  ]),
  servicosAutomaticos: [
    { id: 1, descricao: 'Montagem', base: 'POR_MOVEL', valorUnitario: 100 },
    { id: 2, descricao: 'Corte', base: 'POR_CHAPA', valorUnitario: 30 },
    { id: 3, descricao: 'Instalação', base: 'POR_HORA', valorUnitario: 80 },
  ],
  tiposPeca: new Map([
    [1, { id: 1, nome: 'Lateral' }],
    [4, { id: 4, nome: 'Prateleira' }],
    [9, { id: 9, nome: 'Porta' }],
  ]),
  regrasFerragem: [
    { id: 1, tipoPecaId: 9, materialId: 1, dimensao: 'COMPRIMENTO', min: 0, max: 900, quantidade: 2 },
    { id: 2, tipoPecaId: 9, materialId: 1, dimensao: 'COMPRIMENTO', min: 900.01, max: 1600, quantidade: 3 },
    { id: 3, tipoPecaId: 9, materialId: 2, dimensao: 'NENHUMA', min: 0, max: 99999, quantidade: 1 },
  ],
  regrasInsumo: [
    { id: 1, insumoId: 1, base: 'POR_METRO_FITA', tipoPecaId: null, tipoMaterial: null, consumo: 0.015, arredondar: false },
    { id: 2, insumoId: 2, base: 'POR_PECA', tipoPecaId: null, tipoMaterial: null, consumo: 0.1, arredondar: true },
  ],
  chapasOtimizador: new Map([[1, { chapas: 1, aproveitamento: 32.43 }]]),
  ...extra,
});

const n = (x: { toFixed: (d: number) => string }) => x.toFixed(2);

describe('motor: chapa inteira, fitas, ferragens, insumos, serviços e preço', () => {
  const r = calcularOrcamento(base());
  const peca = (id: number) => r.pecas.find((p) => p.id === id)!;
  const gerado = (descricao: string, movelId: number | null) => r.itensGerados.find((i) => i.descricao === descricao && i.movelId === movelId)!;

  it('áreas e metros de fita (com sobra) por peça', () => {
    expect(n(peca(11).areaM2)).toBe('0.56');
    expect(peca(11).metrosFita.toFixed(1)).toBe('4.8');
    expect(peca(21).metrosFita.toFixed(1)).toBe('2.1');
  });

  it('chapa inteira: 1 chapa do otimizador, R$ 275 rateados pela área', () => {
    const c = r.consumos.find((x) => x.tipo === 'CHAPA')!;
    expect(c.quantidadeCobrada.toNumber()).toBe(1);
    expect(n(c.custoTotal)).toBe('275.00');
    // 275 × 0,56/1,65 = 93,33; 275 × 0,49/1,65 = 81,67; a última fica com o resto
    expect([11, 12, 21].map((id) => n(peca(id).custoChapa))).toEqual(['93.33', '81.67', '100.00']);
  });

  it('fitas: 8,4 m × 1,10 × R$ 1 = R$ 9,24', () => {
    const f = r.consumos.find((x) => x.tipo === 'FITA_BORDA')!;
    expect(f.quantidadeLiquida.toFixed(1)).toBe('8.4');
    expect(n(f.custoTotal)).toBe('9.24');
    expect([11, 12, 21].map((id) => n(peca(id).custoFita))).toEqual(['5.28', '1.65', '2.31']);
  });

  it('dobradiças pela faixa (2 × 2 portas até 900 mm); puxador da regra não duplica o do modelo', () => {
    const dob = gerado('Dobradiça', 1);
    expect(dob.quantidade.toString()).toBe('4');
    expect(dob.regraDescricao).toBe('2 Dobradiça × 2 porta (até 900 mm)');
    expect(r.itensGerados.some((i) => i.descricao === 'Puxador')).toBe(false);
    expect(r.itensGerados.some((i) => Number(i.quantidade) === 99)).toBe(false); // o antigo foi refeito
  });

  it('insumos: cola sem arredondar, parafusos arredondados para cima', () => {
    expect(gerado('Cola de borda', 1).quantidade.toString()).toBe('0.0945'); // 6,3 m × 0,015
    expect(gerado('Cola de borda', 2).quantidade.toString()).toBe('0.0315'); // 2,1 m × 0,015
    expect(gerado('Caixa de parafusos', 1).quantidade.toString()).toBe('1'); // 4 peças × 0,1 → 1
    expect(gerado('Caixa de parafusos', 2).quantidade.toString()).toBe('1'); // 2 peças × 0,1 → 1
  });

  it('serviços automáticos por móvel e por chapa; por hora fica de fora com aviso', () => {
    expect(gerado('Montagem', 1).quantidade.toString()).toBe('1');
    expect(gerado('Montagem', 2).quantidade.toString()).toBe('2');
    expect(gerado('Corte', null).quantidade.toString()).toBe('1');
    expect(r.avisos.some((a) => a.includes('Instalação'))).toBe(true);
  });

  it('custos por móvel e do orçamento', () => {
    const m1 = r.moveis.find((m) => m.id === 1)!.custos;
    const m2 = r.moveis.find((m) => m.id === 2)!.custos;
    // Móvel 1: chapas 175 + fitas 6,93 + ferragens 70 + insumos 13,89 + serviços 100 = 365,82
    expect([m1.chapas, m1.fitas, m1.ferragens, m1.insumos, m1.servicos, m1.total].map(n)).toEqual(['175.00', '6.93', '70.00', '13.89', '100.00', '365.82']);
    // Móvel 2: chapas 100 + fitas 2,31 + insumos 12,63 + serviços 200 = 314,94
    expect(n(m2.total)).toBe('314.94');
    // Geral: corte 30 + frete 150 → orçamento 860,76
    expect([r.orcamento.servicos, r.orcamento.avulsos, r.orcamento.total].map(n)).toEqual(['330.00', '150.00', '860.76']);
  });

  it('preço: markup divisor, desconto, ajuste de pagamento, RT e margem real', () => {
    const o = r.orcamento;
    expect(n(o.valorVendaCalculado)).toBe('2151.90'); // 860,76 / (1 − 60%)
    expect(n(o.valorDesconto)).toBe('107.60'); // 5% de 2.151,90 = 107,595
    expect(n(o.valorAjustePagamento)).toBe('-61.33'); // −3% de 2.044,30
    expect(n(o.valorFinal)).toBe('1982.97');
    expect(n(o.valorRt)).toBe('198.30'); // 10% de 1.982,97
    // (1.982,97 − 860,76 − 1.982,97 × 30%) / 1.982,97 = 26,59%
    expect(n(o.margemRealPerc!)).toBe('26.59');
    expect(r.alertas).toEqual({ margemBaixa: false, margemNegativa: false });
  });

  it('rateio do valor final entre os móveis fecha no total', () => {
    const soma = r.moveis.reduce((s, m) => s + Number(m.valorVenda), 0);
    expect(soma.toFixed(2)).toBe('1982.97');
    expect(n(r.moveis[0].valorVenda)).toBe('1065.59'); // 1.982,97 × 365,82 / 680,76
  });
});

describe('motor: variações', () => {
  it('área com perda: m² × 1,15 × custo do m²', () => {
    const r = calcularOrcamento(base({ criterio: 'AREA_COM_PERDA' }));
    expect(r.pecas.map((p) => n(p.custoChapa))).toEqual(['34.81', '30.46', '37.30']);
    const c = r.consumos.find((x) => x.tipo === 'CHAPA')!;
    expect(c.quantidadeCobrada.toString()).toBe('1.8975');
    expect(n(c.custoTotal)).toBe('102.57');
  });

  it('sem otimizador: estimativa pela área útil da chapa', () => {
    const r = calcularOrcamento(base({ chapasOtimizador: undefined }));
    const c = r.consumos.find((x) => x.tipo === 'CHAPA')!;
    expect(c.quantidadeCobrada.toNumber()).toBe(1);
    expect(c.estimado).toBe(true);
  });

  it('faixa de 901 a 1600 mm: 3 dobradiças por porta', () => {
    const e = base();
    e.pecas[0] = { ...e.pecas[0], comprimento: 1200 };
    const dob = calcularOrcamento(e).itensGerados.find((i) => i.descricao === 'Dobradiça')!;
    expect(dob.quantidade.toString()).toBe('6');
    expect(dob.regraDescricao).toContain('(900,01 a 1.600 mm)');
  });

  it('modo "ferragens por regra": o puxador da regra entra e o do modelo sai do custo', () => {
    const r = calcularOrcamento(base({ modoFerragens: 'REGRA' }));
    expect(r.itensGerados.find((i) => i.descricao === 'Puxador')!.quantidade.toString()).toBe('2');
    expect(r.itensFora).toEqual([100]);
  });

  it('modo "ferragens do modelo": nenhuma ferragem por regra', () => {
    const r = calcularOrcamento(base({ modoFerragens: 'MODELO' }));
    expect(r.itensGerados.some((i) => i.tipoItem === 'MATERIAL')).toBe(false);
  });

  it('item de regra editado à mão fica e a regra não gera outro igual', () => {
    const e = base();
    e.itens[2] = { ...e.itens[2], quantidade: 5, editadoManual: true };
    const r = calcularOrcamento(e);
    expect(r.itensGerados.some((i) => i.descricao === 'Dobradiça')).toBe(false);
    expect(n(r.moveis[0].custos.ferragens)).toBe('80.00'); // 5 × 10 editadas + 30 do modelo
  });

  it('desconto em reais quando o percentual é zero; margem negativa sinalizada', () => {
    const e = base();
    e.percentuais = { ...e.percentuais, desconto: 0, valorDescontoDigitado: 1500, ajustePagamento: 0 };
    const r = calcularOrcamento(e);
    expect(n(r.orcamento.valorDesconto)).toBe('1500.00');
    expect(r.alertas.margemNegativa).toBe(true);
  });

  it('soma dos percentuais ≥ 100% é recusada', () => {
    const e = base();
    e.percentuais = { ...e.percentuais, margem: 70 };
    expect(() => calcularOrcamento(e)).toThrow(/menor que 100%/);
  });
});
