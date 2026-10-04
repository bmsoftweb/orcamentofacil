import { mat4, vec3 } from 'gl-matrix';
import { casaPadrao, normalizar, ModoComparacao } from '../texto.js';
import { eixosDaMatriz } from './geometria.js';
import type { ObjetoDae } from './parser.js';

/**
 * Classificador dos objetos importados do .dae (Módulo 3.2 do prompt). Função pura: recebe os
 * objetos do parser e um retrato do catálogo/regras; devolve a classificação de cada objeto.
 */

export type Classe = 'MOVEL' | 'GRUPO' | 'PECA' | 'FERRAGEM' | 'INSUMO' | 'IGNORAR' | 'DESCONHECIDO';

export interface Mapeamento {
  id: number;
  origem: 'MATERIAL' | 'COMPONENTE' | 'NO';
  padrao: string;
  modo: ModoComparacao;
  prioridade: number;
  acao: 'PECA' | 'FERRAGEM' | 'INSUMO' | 'IGNORAR';
  arquitetoId: number | null;
  acabamentoId: number | null;
  materiaPrimaId: number | null;
  fitaBordaId: number | null;
  tipoPecaId: number | null;
  materialId: number | null;
  insumoId: number | null;
}

export interface ChapaCat {
  id: number;
  espessura: number;
  acabamentoId: number | null;
}

export interface FitaCat {
  id: number;
  largura: number;
  acabamentoId: number | null;
}

export interface TipoPecaCat {
  id: number;
  codigo: string;
  /** Já normalizadas */
  palavrasChave: string[];
  respeitaVeio: boolean;
  ehFrente: boolean;
}

export interface EntradaClassificador {
  objetos: ObjetoDae[];
  /** Eixo up do mundo */
  up: vec3;
  mapeamentos: Mapeamento[];
  arquitetoId: number | null;
  chapas: ChapaCat[];
  fitas: FitaCat[];
  tiposPeca: TipoPecaCat[];
  toleranciaEspessura: number;
  /** Acabamento padrão de caixa e de frente por móvel (índice do objeto MOVEL), quando já conhecido */
  acabamentosMovel?: Map<number, { caixa: number | null; frente: number | null }>;
}

export interface Classificacao {
  classificacao: Classe;
  confianca: number;
  motivo: string;
  mapeamentoId: number | null;
  tipoPecaId: number | null;
  materiaPrimaId: number | null;
  fitaBordaId: number | null;
  materialId: number | null;
  insumoId: number | null;
  /** Medidas depois da exceção de veio (peças verticais: comprimento = dimensão no eixo up) */
  comprimento?: number;
  largura?: number;
}

const vazio = (c: Partial<Classificacao>): Classificacao => ({
  classificacao: 'DESCONHECIDO',
  confianca: 0,
  motivo: '',
  mapeamentoId: null,
  tipoPecaId: null,
  materiaPrimaId: null,
  fitaBordaId: null,
  materialId: null,
  insumoId: null,
  ...c,
});

/** Mapeamentos na ordem de avaliação: os do arquiteto primeiro, depois os globais, por prioridade */
export function ordenarMapeamentos(lista: Mapeamento[], arquitetoId: number | null): Mapeamento[] {
  return lista
    .filter((m) => m.arquitetoId === null || m.arquitetoId === arquitetoId)
    .sort((a, b) => Number(a.arquitetoId === null) - Number(b.arquitetoId === null) || a.prioridade - b.prioridade || a.id - b.id);
}

/** Primeiro mapeamento que casa com o objeto (nome do nó, da definição ou do material, conforme a origem) */
export function mapeamentoDo(o: Pick<ObjetoDae, 'nome' | 'nomeDefinicao' | 'materialDae'>, ordenados: Mapeamento[]): Mapeamento | null {
  for (const m of ordenados) {
    const texto = m.origem === 'NO' ? o.nome : m.origem === 'COMPONENTE' ? o.nomeDefinicao : o.materialDae;
    if (casaPadrao(m.padrao, m.modo, texto)) return m;
  }
  return null;
}

/** Tipo de peça pelas palavras-chave no nome/definição: vence a palavra mais longa (mais específica) */
export function tipoPorPalavra(textos: (string | null)[], tipos: TipoPecaCat[]): { tipo: TipoPecaCat; palavra: string } | null {
  const alvo = ` ${textos.map(normalizar).filter(Boolean).join(' | ')} `;
  let melhor: { tipo: TipoPecaCat; palavra: string } | null = null;
  for (const t of tipos) {
    for (const p of t.palavrasChave) {
      if (p && alvo.includes(` ${p} `) && (!melhor || p.length > melhor.palavra.length)) melhor = { tipo: t, palavra: p };
    }
  }
  return melhor;
}

const RODAPE_MAX = 150; // altura (mm) até onde uma peça horizontal estreita na frente é rodapé
const ESTREITA = 150; // largura (mm) abaixo da qual a horizontal é travessa
const FRENTE_GAVETA_MAX = 300;

/** Retrato geométrico de um móvel: eixos (largura, profundidade, up) e limites das peças nesses eixos */
interface Moldura {
  w: vec3;
  d: vec3;
  u: vec3;
  min: { w: number; d: number; u: number };
  max: { w: number; d: number; u: number };
  /** Sinal da frente no eixo de profundidade: -1 = frente no mínimo, 1 = no máximo */
  frente: -1 | 1;
}

const proj = (p: vec3, e: vec3) => vec3.dot(p, e);
const alinhado = (a: vec3, b: vec3) => Math.abs(vec3.dot(a, b)) > 0.9;
const eixoEspessura = (o: ObjetoDae) => o.medida!.eixos[o.medida!.dims.indexOf(Math.min(...o.medida!.dims))];

function moldura(movel: ObjetoDae, pecas: ObjetoDae[], up: vec3): Moldura | null {
  if (!pecas.length) return null;
  const eixos = eixosDaMatriz(mat4.clone(movel.matrizMundo as unknown as mat4));
  // Eixo do móvel mais alinhado ao up do mundo; os outros dois são horizontais
  const iu = [0, 1, 2].reduce((a, b) => (Math.abs(vec3.dot(eixos[b], up)) > Math.abs(vec3.dot(eixos[a], up)) ? b : a), 0);
  const u = vec3.dot(eixos[iu], up) < 0 ? vec3.negate(vec3.create(), eixos[iu]) : eixos[iu];
  const [h1, h2] = [0, 1, 2].filter((k) => k !== iu).map((k) => eixos[k]);

  const lim = (e: vec3) => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const p of pecas) {
      const c = proj(p.medida!.centro, e);
      const meia = p.medida!.eixos.reduce((s, ei, k) => s + (Math.abs(vec3.dot(ei, e)) * p.medida!.dims[k]) / 2, 0);
      mn = Math.min(mn, c - meia);
      mx = Math.max(mx, c + meia);
    }
    return [mn, mx];
  };
  const [a1, b1] = lim(h1);
  const [a2, b2] = lim(h2);
  // Profundidade = eixo horizontal de menor extensão
  const [w, d, wl, dl] = b1 - a1 >= b2 - a2 ? [h1, h2, [a1, b1], [a2, b2]] : [h2, h1, [a2, b2], [a1, b1]];
  const ul = lim(u);

  // Frente: oposta aos fundos finos; sem fundo, o lado de menor coordenada (no SketchUp, a frente olha para -Y)
  const finos = pecas.filter((p) => p.medida!.espessura <= 6 && alinhado(eixoEspessura(p), d));
  let frente: -1 | 1 = -1;
  if (finos.length) {
    const media = finos.reduce((s, p) => s + proj(p.medida!.centro, d), 0) / finos.length;
    frente = media > (dl[0] + dl[1]) / 2 ? -1 : 1;
  }
  return { w, d, u, min: { w: wl[0], d: dl[0], u: ul[0] }, max: { w: wl[1], d: dl[1], u: ul[1] }, frente };
}

/** Heurística geométrica do tipo de peça dentro do móvel (código do tipo e o motivo) */
function tipoPorGeometria(p: ObjetoDae, m: Moldura, irmaos: ObjetoDae[], dentroDeGaveta: boolean): { codigo: string; motivo: string } {
  const med = p.medida!;
  const esp = med.espessura;
  const e = eixoEspessura(p);
  const c = { w: proj(med.centro, m.w), d: proj(med.centro, m.d), u: proj(med.centro, m.u) };
  const ext = (eixo: vec3) => med.eixos.reduce((s, ei, k) => s + Math.abs(vec3.dot(ei, eixo)) * med.dims[k], 0);
  const naFrente = (folga: number) => (m.frente < 0 ? c.d - m.min.d : m.max.d - c.d) <= esp / 2 + folga;
  const noFundo = (folga: number) => (m.frente < 0 ? m.max.d - c.d : c.d - m.min.d) <= esp / 2 + folga;

  if (alinhado(e, m.d)) {
    if (esp <= 6) return dentroDeGaveta ? { codigo: 'GAVETA_FD', motivo: 'chapa fina dentro de gaveta' } : { codigo: 'FUNDO', motivo: 'chapa fina paralela ao fundo' };
    if (naFrente(30)) {
      const altura = ext(m.u);
      const largura = ext(m.w);
      const empilhadas = irmaos.some(
        (o) => o !== p && o.medida && alinhado(eixoEspessura(o), m.d) && Math.abs(ext2(o, m.w) - largura) <= 2 && Math.abs(proj(o.medida.centro, m.u) - c.u) > altura / 2,
      );
      if (altura < FRENTE_GAVETA_MAX && empilhadas) return { codigo: 'FRENTE_GAV', motivo: 'frente baixa com outras iguais empilhadas' };
      return { codigo: 'PORTA', motivo: 'vertical na face frontal' };
    }
    if (noFundo(10)) return { codigo: 'FUNDO', motivo: 'vertical na face de trás' };
    return { codigo: 'OUTRA', motivo: 'vertical paralela à frente, no meio do móvel' };
  }
  if (alinhado(e, m.w)) {
    const extremo = c.w - m.min.w <= esp / 2 + 2 || m.max.w - c.w <= esp / 2 + 2;
    return extremo ? { codigo: 'LATERAL', motivo: 'vertical na extremidade do móvel' } : { codigo: 'DIVISORIA', motivo: 'vertical entre as laterais' };
  }
  if (alinhado(e, m.u)) {
    if (esp <= 6 && dentroDeGaveta) return { codigo: 'GAVETA_FD', motivo: 'chapa fina horizontal dentro de gaveta' };
    if (med.largura < ESTREITA) {
      const naBase = c.u - m.min.u <= RODAPE_MAX;
      return naBase && naFrente(60) ? { codigo: 'RODAPE', motivo: 'horizontal estreita na base frontal' } : { codigo: 'TRAVESSA', motivo: 'horizontal estreita' };
    }
    const horizontais = irmaos.filter((o) => o.medida && alinhado(eixoEspessura(o), m.u) && o.medida.largura >= ESTREITA);
    const alturas = horizontais.map((o) => proj(o.medida!.centro, m.u));
    const [baixo, alto] = [Math.min(...alturas), Math.max(...alturas)];
    if (horizontais.length === 1) {
      return c.u < (m.min.u + m.max.u) / 2 ? { codigo: 'BASE', motivo: 'única horizontal, na metade de baixo' } : { codigo: 'TAMPO', motivo: 'única horizontal, na metade de cima' };
    }
    if (c.u <= baixo + 1) return { codigo: 'BASE', motivo: 'horizontal mais baixa' };
    if (c.u >= alto - 1) return { codigo: 'TAMPO', motivo: 'horizontal mais alta' };
    return { codigo: 'PRATELEIRA', motivo: 'horizontal entre a base e o tampo' };
  }
  return { codigo: 'OUTRA', motivo: 'inclinada em relação ao móvel' };
}
const ext2 = (o: ObjetoDae, eixo: vec3) => o.medida!.eixos.reduce((s, ei, k) => s + Math.abs(vec3.dot(ei, eixo)) * o.medida!.dims[k], 0);

/** Chapa da peça (cadeia de resolução do prompt) e a confiança dessa escolha */
function resolverChapa(
  esp: number,
  map: Mapeamento | null,
  tipo: TipoPecaCat | null,
  acabMovel: { caixa: number | null; frente: number | null } | undefined,
  e: EntradaClassificador,
): { chapa: ChapaCat; confianca: number; motivo: string } | null {
  const comEsp = e.chapas.filter((c) => Math.abs(c.espessura - esp) <= e.toleranciaEspessura);
  if (map?.materiaPrimaId) {
    const c = e.chapas.find((x) => x.id === map.materiaPrimaId);
    if (c) return { chapa: c, confianca: 95, motivo: 'chapa do mapeamento' };
  }
  if (map?.acabamentoId) {
    const c = comEsp.find((x) => x.acabamentoId === map.acabamentoId);
    if (c) return { chapa: c, confianca: 90, motivo: 'acabamento do mapeamento + espessura' };
  }
  const acab = tipo?.ehFrente ? acabMovel?.frente : acabMovel?.caixa;
  if (acab) {
    const c = comEsp.find((x) => x.acabamentoId === acab);
    if (c) return { chapa: c, confianca: 80, motivo: `acabamento de ${tipo?.ehFrente ? 'frente' : 'caixa'} do móvel + espessura` };
  }
  if (comEsp.length) return { chapa: comEsp[0], confianca: 40, motivo: 'primeira chapa ativa com a espessura' };
  return null;
}

/** Fita: a do mapeamento; senão a do mesmo acabamento com largura ≥ espessura + 3 mm (a mais estreita) */
function resolverFita(esp: number, chapa: ChapaCat, map: Mapeamento | null, fitas: FitaCat[]): number | null {
  if (map?.fitaBordaId) return map.fitaBordaId;
  const ok = fitas.filter((f) => f.acabamentoId === chapa.acabamentoId && f.largura >= esp + 3).sort((a, b) => a.largura - b.largura);
  return ok[0]?.id ?? null;
}

export function classificar(e: EntradaClassificador): { resultados: Map<number, Classificacao>; usos: Map<number, number> } {
  const ordenados = ordenarMapeamentos(e.mapeamentos, e.arquitetoId);
  const resultados = new Map<number, Classificacao>();
  const usos = new Map<number, number>();
  const usar = (m: Mapeamento) => usos.set(m.id, (usos.get(m.id) ?? 0) + 1);
  const porCodigo = new Map(e.tiposPeca.map((t) => [t.codigo, t]));
  const filhos = new Map<number | null, ObjetoDae[]>();
  for (const o of e.objetos) {
    if (!filhos.has(o.parent)) filhos.set(o.parent, []);
    filhos.get(o.parent)!.push(o);
  }
  const pecasDoMovel = (mi: number) => e.objetos.filter((o) => o.movel === mi && o.medida);
  const molduras = new Map<number, Moldura | null>();
  const molduraDe = (mi: number) => {
    if (!molduras.has(mi)) molduras.set(mi, moldura(e.objetos[mi], pecasDoMovel(mi), e.up));
    return molduras.get(mi)!;
  };
  const ancestrais = (o: ObjetoDae) => {
    const l: ObjetoDae[] = [];
    for (let p = o.parent; p !== null; p = e.objetos[p].parent) l.push(e.objetos[p]);
    return l;
  };

  /** Grupo resolvido por mapeamento (ferragem/insumo/ignorar): os descendentes são parte dele */
  const cobrirDescendentes = (o: ObjetoDae, motivo: string) => {
    for (const f of filhos.get(o.idx) ?? []) {
      resultados.set(f.idx, vazio({ classificacao: 'IGNORAR', confianca: 95, motivo }));
      cobrirDescendentes(f, motivo);
    }
  };

  const visitar = (o: ObjetoDae) => {
    if (resultados.has(o.idx)) return; // já coberto por um grupo acima
    const map = mapeamentoDo(o, ordenados);

    if (map && map.acao !== 'PECA') {
      usar(map);
      const classe: Classe = map.acao === 'IGNORAR' ? 'IGNORAR' : map.acao;
      resultados.set(
        o.idx,
        vazio({ classificacao: classe, confianca: 95, motivo: `Mapeamento nº ${map.id} (${map.origem.toLowerCase()} "${map.padrao}")`, mapeamentoId: map.id, materialId: map.materialId, insumoId: map.insumoId }),
      );
      cobrirDescendentes(o, `Parte de "${o.nome}" (${classe.toLowerCase()})`);
      return;
    }

    if (!o.medida) {
      // Móvel ou grupo: continua estrutural; os filhos são classificados um a um
      resultados.set(o.idx, vazio({ classificacao: o.classificacao, confianca: 100, motivo: o.classificacao === 'MOVEL' ? 'Primeiro nível da cena' : 'Agrupa outros objetos' }));
      for (const f of filhos.get(o.idx) ?? []) visitar(f);
      return;
    }

    const med = o.medida;
    // Tipo de peça: mapeamento → palavra-chave → geometria → OUTRA
    let tipo: TipoPecaCat | null = null;
    let confTipo = 30;
    let motivoTipo = 'nenhuma regra: Outra';
    if (map?.tipoPecaId) {
      tipo = e.tiposPeca.find((t) => t.id === map.tipoPecaId) ?? null;
      if (tipo) [confTipo, motivoTipo] = [95, 'tipo do mapeamento'];
    }
    if (!tipo) {
      const p = tipoPorPalavra([o.nome, o.nomeDefinicao], e.tiposPeca);
      if (p) [tipo, confTipo, motivoTipo] = [p.tipo, 80, `palavra-chave "${p.palavra}"`];
    }
    if (!tipo && o.movel !== null) {
      const m = molduraDe(o.movel);
      if (m) {
        const g = tipoPorGeometria(o, m, pecasDoMovel(o.movel), ancestrais(o).some((a) => /gaveta/.test(normalizar(a.nome))));
        tipo = porCodigo.get(g.codigo) ?? null;
        if (tipo) [confTipo, motivoTipo] = [60, `geometria: ${g.motivo}`];
      }
    }
    tipo ??= porCodigo.get('OUTRA') ?? null;

    const chapa = resolverChapa(med.espessura, map, tipo, o.movel !== null ? e.acabamentosMovel?.get(o.movel) : undefined, e);
    if (!chapa) {
      resultados.set(
        o.idx,
        vazio({ classificacao: 'DESCONHECIDO', confianca: 0, motivo: `Espessura ${med.espessura} mm sem chapa ativa cadastrada`, tipoPecaId: tipo?.id ?? null, mapeamentoId: map?.id ?? null }),
      );
      if (map) usar(map);
      return;
    }
    if (map) usar(map);

    // Exceção de veio: em peça vertical que respeita o veio, o comprimento segue o eixo up
    let comprimento = med.comprimento;
    let largura = med.largura;
    const eEsp = eixoEspessura(o);
    if (tipo?.respeitaVeio && Math.abs(vec3.dot(eEsp, e.up)) < 0.5 && Math.abs(med.dimUp - med.espessura) > 0.01) {
      comprimento = med.dimUp;
      largura = Math.abs(med.comprimento - med.dimUp) < 0.01 ? med.largura : med.comprimento;
    }

    resultados.set(
      o.idx,
      vazio({
        classificacao: 'PECA',
        confianca: Math.min(chapa.confianca, confTipo),
        motivo: `${map ? `Mapeamento nº ${map.id}; ` : ''}${motivoTipo}; ${chapa.motivo}`,
        mapeamentoId: map?.id ?? null,
        tipoPecaId: tipo?.id ?? null,
        materiaPrimaId: chapa.chapa.id,
        fitaBordaId: resolverFita(med.espessura, chapa.chapa, map, e.fitas),
        comprimento,
        largura,
      }),
    );
  };

  for (const o of filhos.get(null) ?? []) visitar(o);
  return { resultados, usos };
}
