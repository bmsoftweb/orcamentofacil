import { describe, expect, it } from 'vitest';
import { vec3 } from 'gl-matrix';
import { parseDae } from '../src/lib/dae/parser';
import { classificar, EntradaClassificador, Mapeamento, TipoPecaCat, ordenarMapeamentos, mapeamentoDo } from '../src/lib/dae/classificador';
import { fixtures } from './fixtures/dae/gerar-fixtures';

const F = fixtures();

// Retrato do catálogo igual ao seed da migration
const TIPOS: TipoPecaCat[] = [
  ['LATERAL', 'lateral,lat,ld,le,lado', true, false],
  ['BASE', 'base,piso,fundo inferior,chao', true, false],
  ['TAMPO', 'tampo,teto,topo,chapeu', true, false],
  ['PRATELEIRA', 'prateleira,prat,divisoria horizontal', true, false],
  ['DIVISORIA', 'divisoria,divisao,montante,meio', true, false],
  ['FUNDO', 'fundo,costas,traseira', false, false],
  ['TRAVESSA', 'travessa,regua,trava,sarrafo,reforco', true, false],
  ['RODAPE', 'rodape,saia,rodateto,testeira,rodameio', true, false],
  ['PORTA', 'porta,pt,folha', true, true],
  ['FRENTE_GAV', 'frente gaveta,frente,fg', true, true],
  ['GAVETA_FD', 'fundo gaveta,fd gaveta', false, false],
  ['OUTRA', '', true, false],
].map(([codigo, p, veio, frente], i) => ({ id: i + 1, codigo: codigo as string, palavrasChave: String(p).split(',').filter(Boolean), respeitaVeio: veio as boolean, ehFrente: frente as boolean }));
const id = (codigo: string) => TIPOS.find((t) => t.codigo === codigo)!.id;

const map = (m: Partial<Mapeamento> & Pick<Mapeamento, 'id' | 'origem' | 'padrao' | 'acao'>): Mapeamento => ({
  modo: 'CONTEM',
  prioridade: 100,
  arquitetoId: null,
  acabamentoId: null,
  materiaPrimaId: null,
  fitaBordaId: null,
  tipoPecaId: null,
  materialId: null,
  insumoId: null,
  ...m,
});
const SEED: Mapeamento[] = [
  map({ id: 2, origem: 'COMPONENTE', padrao: 'puxador', acao: 'FERRAGEM', prioridade: 10, materialId: 3 }),
  map({ id: 4, origem: 'COMPONENTE', padrao: '^(humano|pessoa|escala)', modo: 'REGEX', acao: 'IGNORAR', prioridade: 5 }),
  map({ id: 5, origem: 'MATERIAL', padrao: 'branco', acao: 'PECA', prioridade: 50, acabamentoId: 1, fitaBordaId: 4 }),
];

const rodar = (xml: string, extra: Partial<EntradaClassificador> = {}) => {
  const r = parseDae(xml, { arredondamentoMm: 1 });
  const e: EntradaClassificador = {
    objetos: r.objetos,
    up: vec3.fromValues(0, 0, 1),
    mapeamentos: SEED,
    arquitetoId: null,
    chapas: [6, 15, 18].map((esp, i) => ({ id: i + 1, espessura: esp, acabamentoId: 1 })),
    fitas: [{ id: 4, largura: 22, acabamentoId: 1 }],
    tiposPeca: TIPOS,
    toleranciaEspessura: 0.6,
    ...extra,
  };
  const { resultados, usos } = classificar(e);
  const de = (nome: string) => {
    const o = r.objetos.find((x) => x.nome === nome || x.nomeDefinicao === nome)!;
    return resultados.get(o.idx)!;
  };
  return { r, resultados, usos, de };
};

describe('classificador: mapeamentos', () => {
  it('ordem: do arquiteto antes dos globais, depois prioridade', () => {
    const lista = [map({ id: 1, origem: 'NO', padrao: 'x', acao: 'IGNORAR', prioridade: 1 }), map({ id: 2, origem: 'NO', padrao: 'x', acao: 'INSUMO', prioridade: 900, arquitetoId: 7, insumoId: 1 }), map({ id: 3, origem: 'NO', padrao: 'x', acao: 'IGNORAR', arquitetoId: 8 })];
    expect(ordenarMapeamentos(lista, 7).map((m) => m.id)).toEqual([2, 1]);
    expect(ordenarMapeamentos(lista, null).map((m) => m.id)).toEqual([1]);
    expect(mapeamentoDo({ nome: 'X_1', nomeDefinicao: null, materialDae: null }, ordenarMapeamentos(lista, 7))?.id).toBe(2);
  });

  it('ferragem e ignorar resolvem direto (95) e contam o uso', () => {
    const { de, usos } = rodar(F['01-armario-simples']);
    expect(de('Puxador 160')).toMatchObject({ classificacao: 'FERRAGEM', confianca: 95, materialId: 3, mapeamentoId: 2 });
    expect(usos.get(2)).toBe(1); // uma linha (2 unidades agrupadas)
    const h = rodar(F['05-aninhados-humano']).de('Humano escala');
    expect(h).toMatchObject({ classificacao: 'IGNORAR', confianca: 95 });
  });

  it('mapeamento de material PECA: chapa pelo acabamento + espessura, fita do mapeamento', () => {
    const { de } = rodar(F['01-armario-simples']);
    expect(de('Lateral Esquerda')).toMatchObject({ classificacao: 'PECA', materiaPrimaId: 3, fitaBordaId: 4, tipoPecaId: id('LATERAL'), confianca: 80 });
    expect(de('Fundo')).toMatchObject({ classificacao: 'PECA', materiaPrimaId: 1, tipoPecaId: id('FUNDO') });
  });

  it('sem mapeamento: primeira chapa da espessura (confiança 40) e fita do acabamento com largura ≥ esp + 3', () => {
    const { de } = rodar(F['01-armario-simples'], { mapeamentos: [] });
    expect(de('Base')).toMatchObject({ classificacao: 'PECA', materiaPrimaId: 3, fitaBordaId: 4, confianca: 40 });
    expect(de('Puxador 160')).toMatchObject({ classificacao: 'DESCONHECIDO' }); // 20 mm: nenhuma chapa
  });

  it('acabamento padrão do móvel (caixa × frente) entra antes da primeira chapa', () => {
    const chapas = [
      { id: 10, espessura: 18, acabamentoId: 1 },
      { id: 11, espessura: 18, acabamentoId: 2 },
    ];
    const parse = parseDae(F['01-armario-simples'], { arredondamentoMm: 1 });
    const movel = parse.objetos.find((o) => o.classificacao === 'MOVEL')!.idx;
    const { de } = rodar(F['01-armario-simples'], { mapeamentos: [], chapas, acabamentosMovel: new Map([[movel, { caixa: 1, frente: 2 }]]) });
    expect(de('Lateral Esquerda')).toMatchObject({ materiaPrimaId: 10, confianca: 80 });
    expect(de('Porta Esquerda')).toMatchObject({ materiaPrimaId: 11 });
  });
});

describe('classificador: heurística geométrica (nomes genéricos do SketchUp)', () => {
  // Mesmo armário com as peças sem nome significativo
  let n = 0;
  const generico = F['01-armario-simples'].replace(/name="(Lateral|Base|Tampo|Fundo|Prateleira|Porta)[^"]*"/g, () => `name="group_${n++}"`);
  const { r, resultados } = rodar(generico, { mapeamentos: [] });
  const tipoDe = (i: number) => TIPOS.find((t) => t.id === resultados.get(r.objetos.find((o) => o.nome === `group_${i}`)!.idx)!.tipoPecaId)?.codigo;

  it('laterais, base, tampo, fundo, prateleira e portas', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(tipoDe)).toEqual(['LATERAL', 'LATERAL', 'BASE', 'TAMPO', 'FUNDO', 'PRATELEIRA', 'PORTA', 'PORTA']);
    expect(resultados.get(r.objetos.find((o) => o.nome === 'group_0')!.idx)!.confianca).toBe(40); // chapa sem mapeamento
  });
});

describe('classificador: veio', () => {
  it('porta vertical que respeita o veio: comprimento é a altura', () => {
    const { de } = rodar(F['03-girada-espelhada']);
    expect(de('Porta Lateral')).toMatchObject({ comprimento: 700, largura: 400 });
  });
});
