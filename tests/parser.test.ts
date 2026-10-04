import { describe, expect, it } from 'vitest';
import { parseDae, ErroDae, ResultadoDae } from '../src/lib/dae/parser';
import { fixtures } from './fixtures/dae/gerar-fixtures';

const F = fixtures();
const ler = (nome: string) => parseDae(F[nome], { arredondamentoMm: 1 });
const objeto = (r: ResultadoDae, nome: string) => {
  const o = r.objetos.find((x) => x.nome === nome || x.nomeDefinicao === nome);
  if (!o) throw new Error(`Objeto "${nome}" não encontrado: ${r.objetos.map((x) => x.nome).join(', ')}`);
  return o;
};
/** comprimento × largura × espessura (± 0,5 mm) e quantidade */
const confere = (r: ResultadoDae, nome: string, [c, l, e]: number[], qtd = 1) => {
  const o = objeto(r, nome);
  expect(o.medida, nome).not.toBeNull();
  expect(Math.abs(o.medida!.comprimento - c), `${nome} comprimento ${o.medida!.comprimento}`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(o.medida!.largura - l), `${nome} largura ${o.medida!.largura}`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(o.medida!.espessura - e), `${nome} espessura ${o.medida!.espessura}`).toBeLessThanOrEqual(0.5);
  expect(o.quantidade, `${nome} quantidade`).toBe(qtd);
  return o;
};

describe('parser .dae: metadados e estrutura', () => {
  it('lê unidade, eixo e ferramenta; desce a raiz "SketchUp"; câmera e arestas saem', () => {
    const r = ler('01-armario-simples');
    expect(r.meta).toMatchObject({ unidadeNome: 'inch', unidadeMetros: 0.0254, eixoUp: 'Z_UP' });
    expect(r.meta.ferramenta).toContain('Gerador');
    const armario = objeto(r, 'Armario');
    expect(armario).toMatchObject({ classificacao: 'MOVEL', nivel: 0, parent: null });
    expect(r.objetos.some((o) => o.nome === 'camera' || o.nome === 'SketchUp')).toBe(false);
  });

  it('arquivo inválido ou sem geometria dá erro em português', () => {
    expect(() => parseDae('<html/>')).toThrow(ErroDae);
    expect(() => parseDae('<COLLADA><library_visual_scenes><visual_scene id="a"><node name="x"/></visual_scene></library_visual_scenes></COLLADA>')).toThrow(/geometria/);
  });
});

describe('parser .dae: cenário 1 (armário simples)', () => {
  const r = ler('01-armario-simples');
  it('medidas das peças', () => {
    confere(r, 'Lateral Esquerda', [700, 350, 18]);
    confere(r, 'Lateral Direita', [700, 350, 18]);
    confere(r, 'Base', [764, 350, 18]);
    confere(r, 'Tampo', [764, 350, 18]);
    confere(r, 'Fundo', [764, 664, 6]);
    confere(r, 'Prateleira', [764, 330, 18]);
    confere(r, 'Porta Esquerda', [700, 400, 18]);
  });
  it('puxadores (componente) agrupados em uma linha com quantidade 2, material do componente', () => {
    const p = confere(r, 'Puxador 160', [160, 25, 20], 2);
    expect(p.materialDae).toBe('Inox');
    expect(objeto(r, 'Base').materialDae).toBe('MDF Branco TX');
  });
  it('peças retangulares, sem espelho, todas dentro do móvel', () => {
    const armario = objeto(r, 'Armario');
    for (const o of r.objetos.filter((x) => x.medida)) {
      expect(o.medida!.ehRetangular, o.nome).toBe(true);
      expect(o.espelhado).toBe(false);
      expect(o.movel).toBe(armario.idx);
      expect(o.parent).toBe(armario.idx);
    }
    expect(r.avisos).toEqual([]);
  });
  it('instâncias para o visualizador: uma por peça desenhada, apontando para a linha agrupada', () => {
    expect(r.instancias).toHaveLength(10);
    const pux = objeto(r, 'Puxador 160').idx;
    expect(r.instancias.filter((i) => i.objeto === pux)).toHaveLength(2);
    expect(r.instancias[0].cor).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('parser .dae: cenários 2 a 6', () => {
  it('2: portas como definição instanciada 2× viram uma linha', () => {
    const r = ler('02-armario-componentes');
    const porta = confere(r, 'Porta 400x700', [700, 400, 18], 2);
    expect(porta.nomeDefinicao).toBe('Porta 400x700');
    confere(r, 'Puxador 160', [160, 25, 20], 2);
  });

  it('3: porta girada 90° mantém as medidas; lateral espelhada é marcada', () => {
    const r = ler('03-girada-espelhada');
    confere(r, 'Porta Lateral', [700, 400, 18]);
    const lat = confere(r, 'Lateral Espelhada', [700, 350, 18]);
    expect(lat.espelhado).toBe(true);
    expect(objeto(r, 'Porta Lateral').espelhado).toBe(false);
  });

  it('4: geometria girada dentro do grupo usa as normais de face (tentativa 2)', () => {
    const r = ler('04-geometria-girada');
    const p = confere(r, 'Prateleira Girada', [600, 300, 18]);
    expect(p.medida!.tentativa).toBe(2);
    expect(p.medida!.ehRetangular).toBe(true);
  });

  it('5: grupos aninhados em 3 níveis e objeto de escala no primeiro nível', () => {
    const r = ler('05-aninhados-humano');
    expect(objeto(r, 'Estante')).toMatchObject({ classificacao: 'MOVEL', nivel: 0 });
    expect(objeto(r, 'Modulo')).toMatchObject({ classificacao: 'GRUPO', nivel: 1 });
    expect(objeto(r, 'Nicho')).toMatchObject({ classificacao: 'GRUPO', nivel: 2 });
    const base = confere(r, 'Base Nicho', [500, 300, 18]);
    expect(base.nivel).toBe(3);
    expect(base.caminho).toBe('Estante/Modulo/Nicho/Base Nicho');
    const humano = confere(r, 'Humano escala', [1750, 450, 250]);
    expect(humano).toMatchObject({ nivel: 0, movel: null, classificacao: 'DESCONHECIDO' });
  });

  it('6: <polylist> e <polygons> dão o mesmo resultado que <triangles>', () => {
    const medidas = (nome: string) =>
      ler(nome)
        .objetos.filter((o) => o.medida && !o.nomeDefinicao)
        .map((o) => [o.nome, o.medida!.comprimento, o.medida!.largura, o.medida!.espessura, o.medida!.numFaces]);
    const tri = medidas('01-armario-simples').filter(([n]) => !String(n).startsWith('Porta'));
    expect(medidas('06-polylist')).toEqual(tri);
    expect(medidas('06-polygons')).toEqual(tri);
  });
});
