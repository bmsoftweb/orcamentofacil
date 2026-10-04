import { XMLParser } from 'fast-xml-parser';
import { mat4, vec3 } from 'gl-matrix';
import { medirPeca, MedidaPeca } from './geometria.js';

/**
 * Parser de COLLADA (.dae), pensado para o que o SketchUp exporta.
 * Saída: lista plana de objetos (com `parent`) já com medidas em mm, mais os triângulos de cada
 * instância para o visualizador. Função pura: não toca em banco nem em disco.
 */

export class ErroDae extends Error {}

export type EixoUp = 'X_UP' | 'Y_UP' | 'Z_UP';

export interface MetaDae {
  ferramenta: string | null;
  unidadeNome: string | null;
  unidadeMetros: number;
  eixoUp: EixoUp;
}

export interface ObjetoDae {
  idx: number;
  parent: number | null;
  nivel: number;
  caminho: string;
  nodeIdDae: string | null;
  nome: string;
  nomeDefinicao: string | null;
  materialDae: string | null;
  quantidade: number;
  /** MOVEL = nó de primeiro nível; GRUPO = agrupa outros; DESCONHECIDO = peça candidata (classificada depois) */
  classificacao: 'MOVEL' | 'GRUPO' | 'DESCONHECIDO';
  /** Índice do móvel a que pertence (null para objetos fora de móvel) */
  movel: number | null;
  /** Só nas peças candidatas */
  medida: MedidaPeca | null;
  numVertices: number;
  espelhado: boolean;
  /** Matriz mundo 4×4 (gl-matrix, colunas), nas unidades do arquivo */
  matrizMundo: number[];
}

/** Triângulos de cada instância de peça (antes do agrupamento), para o visualizador 3D */
export interface InstanciaDae {
  objeto: number;
  /** Mundo, em mm, eixos do arquivo (9 números por triângulo) */
  tris: Float32Array;
  cor: string | null;
}

export interface ResultadoDae {
  meta: MetaDae;
  objetos: ObjetoDae[];
  instancias: InstanciaDae[];
  avisos: { caminho: string; mensagem: string }[];
}

// ---------------------------------------------------------------------------
// XML (fast-xml-parser com preserveOrder: a ordem de <translate>/<rotate> importa)
// ---------------------------------------------------------------------------
type El = Record<string, any>;
const tagDe = (el: El) => Object.keys(el).find((k) => k !== ':@')!;
const filhosDe = (el: El): El[] => (Array.isArray(el[tagDe(el)]) ? el[tagDe(el)] : []);
const attr = (el: El | undefined, nome: string): string | undefined => el?.[':@']?.[nome];
const filhos = (el: El | undefined, tag: string) => (el ? filhosDe(el).filter((f) => tagDe(f) === tag) : []);
const filho = (el: El | undefined, tag: string) => filhos(el, tag)[0];
const texto = (el: El | undefined): string => (el ? filhosDe(el).filter((f) => '#text' in f).map((f) => String(f['#text'])).join(' ') : '');
const numeros = (el: El | undefined) => {
  const t = texto(el).trim();
  return t ? t.split(/\s+/).map(Number) : [];
};
const semHash = (url: string | undefined) => String(url ?? '').replace(/^#/, '');

/** Primeiro descendente com a tag (busca em profundidade) */
function descendente(el: El | undefined, tag: string): El | undefined {
  if (!el) return undefined;
  for (const f of filhosDe(el)) {
    if (tagDe(f) === tag) return f;
    const d = descendente(f, tag);
    if (d) return d;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Geometria
// ---------------------------------------------------------------------------
interface Geometria {
  /** Posições locais (unidade do arquivo), 3 por vértice */
  pos: number[];
  /** 3 índices de vértice por triângulo */
  tris: number[];
  /** Símbolo de material de cada triângulo */
  simbolos: (string | null)[];
}

function lerGeometria(geo: El, ids: Map<string, El>): Geometria | null {
  const mesh = filho(geo, 'mesh');
  if (!mesh) return null;

  /** <source> → números respeitando o stride do accessor (só as 3 primeiras componentes) */
  const lerFonte = (id: string): number[] | null => {
    let src = ids.get(id);
    // <vertices>: a posição está no input POSITION
    if (src && tagDe(src) === 'vertices') {
      const pos = filhos(src, 'input').find((i) => attr(i, 'semantic') === 'POSITION');
      src = ids.get(semHash(attr(pos, 'source')));
    }
    if (!src || tagDe(src) !== 'source') return null;
    const dados = numeros(filho(src, 'float_array'));
    const acc = descendente(src, 'accessor');
    const stride = Number(attr(acc, 'stride') ?? 3) || 3;
    const out: number[] = [];
    for (let i = 0; i + 2 < dados.length; i += stride) out.push(dados[i], dados[i + 1], dados[i + 2]);
    return out;
  };

  const g: Geometria = { pos: [], tris: [], simbolos: [] };
  const fontes = new Map<string, { base: number }>();

  for (const prim of filhosDe(mesh)) {
    const tipo = tagDe(prim);
    if (tipo !== 'triangles' && tipo !== 'polylist' && tipo !== 'polygons') continue; // <lines> = arestas
    const inputs = filhos(prim, 'input');
    const vertex = inputs.find((i) => attr(i, 'semantic') === 'VERTEX');
    if (!vertex) continue;
    const fonteId = semHash(attr(vertex, 'source'));
    if (!fontes.has(fonteId)) {
      const pos = lerFonte(fonteId);
      if (!pos) continue;
      fontes.set(fonteId, { base: g.pos.length / 3 });
      g.pos.push(...pos);
    }
    const base = fontes.get(fonteId)!.base;
    const stride = Math.max(...inputs.map((i) => Number(attr(i, 'offset') ?? 0))) + 1;
    const off = Number(attr(vertex, 'offset') ?? 0);
    const simbolo = attr(prim, 'material') ?? null;

    /** Polígono (lista de índices de vértice) triangulado em leque */
    const poligono = (idx: number[]) => {
      for (let k = 1; k + 1 < idx.length; k++) {
        g.tris.push(base + idx[0], base + idx[k], base + idx[k + 1]);
        g.simbolos.push(simbolo);
      }
    };
    const vertices = (p: number[]) => {
      const out: number[] = [];
      for (let i = off; i < p.length; i += stride) out.push(p[i]);
      return out;
    };

    if (tipo === 'triangles') {
      const v = vertices(numeros(filho(prim, 'p')));
      for (let i = 0; i + 2 < v.length; i += 3) poligono([v[i], v[i + 1], v[i + 2]]);
    } else if (tipo === 'polylist') {
      const v = vertices(numeros(filho(prim, 'p')));
      let i = 0;
      for (const n of numeros(filho(prim, 'vcount'))) {
        poligono(v.slice(i, i + n));
        i += n;
      }
    } else {
      for (const p of filhos(prim, 'p')) poligono(vertices(numeros(p)));
    }
  }
  return g.tris.length ? g : null;
}

// ---------------------------------------------------------------------------
// Árvore de nós
// ---------------------------------------------------------------------------
interface InstGeo {
  geo: Geometria;
  /** símbolo → id do material */
  binds: Map<string, string>;
}

interface VNo {
  nome: string;
  nodeId: string | null;
  nomeDefinicao: string | null;
  local: mat4;
  geos: InstGeo[];
  filhos: VNo[];
  /** Geometria solta (faces fora de grupo): separada em partes conectadas */
  solta?: boolean;
}

/** <matrix> (linhas, COLLADA) e <translate>/<rotate>/<scale> em sequência */
function matrizLocal(no: El): mat4 {
  const m = mat4.create();
  for (const f of filhosDe(no)) {
    const t = tagDe(f);
    const n = numeros(f);
    if (t === 'matrix' && n.length === 16) {
      const col = mat4.transpose(mat4.create(), mat4.fromValues(...(n as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number])));
      mat4.multiply(m, m, col);
    } else if (t === 'translate' && n.length === 3) {
      mat4.translate(m, m, n as unknown as vec3);
    } else if (t === 'rotate' && n.length === 4) {
      mat4.rotate(m, m, (n[3] * Math.PI) / 180, [n[0], n[1], n[2]]);
    } else if (t === 'scale' && n.length === 3) {
      mat4.scale(m, m, n as unknown as vec3);
    }
  }
  return m;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------
export function parseDae(conteudo: string | Buffer, opcoes: { arredondamentoMm?: number } = {}): ResultadoDae {
  const passo = opcoes.arredondamentoMm ?? 0;
  let doc: El[];
  try {
    doc = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', parseTagValue: false, trimValues: true }).parse(
      typeof conteudo === 'string' ? conteudo : conteudo.toString('utf8'),
    );
  } catch (e: any) {
    throw new ErroDae(`O arquivo não é um XML válido: ${e.message}`);
  }
  const collada = doc.find((e) => tagDe(e) === 'COLLADA');
  if (!collada) throw new ErroDae('O arquivo não é um COLLADA (.dae): falta o elemento <COLLADA>.');

  // Índice por id de todo o documento (geometrias, nós, materiais, efeitos, fontes)
  const ids = new Map<string, El>();
  const indexar = (el: El) => {
    const id = attr(el, 'id');
    if (id) ids.set(id, el);
    for (const f of filhosDe(el)) if (!('#text' in f)) indexar(f);
  };
  indexar(collada);

  // Metadados
  const asset = filho(collada, 'asset');
  const unit = filho(asset, 'unit');
  const upTexto = texto(filho(asset, 'up_axis')).trim();
  const meta: MetaDae = {
    ferramenta: texto(descendente(asset, 'authoring_tool')).trim() || null,
    unidadeNome: attr(unit, 'name') ?? null,
    unidadeMetros: Number(attr(unit, 'meter') ?? 1) || 1,
    eixoUp: (['X_UP', 'Y_UP', 'Z_UP'].includes(upTexto) ? upTexto : 'Y_UP') as EixoUp,
  };
  const paraMm = meta.unidadeMetros * 1000;
  const up = meta.eixoUp === 'Z_UP' ? vec3.fromValues(0, 0, 1) : meta.eixoUp === 'X_UP' ? vec3.fromValues(1, 0, 0) : vec3.fromValues(0, 1, 0);
  const avisos: ResultadoDae['avisos'] = [];

  // Materiais: nome de exibição e cor difusa (para o visualizador)
  const nomeMaterial = (id: string) => attr(ids.get(id), 'name') || id;
  const corMaterial = (id: string): string | null => {
    const efeito = ids.get(semHash(attr(filho(ids.get(id), 'instance_effect'), 'url')));
    const c = numeros(filho(descendente(efeito, 'diffuse'), 'color'));
    if (c.length < 3) return null;
    return `#${c.slice(0, 3).map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('')}`;
  };

  const cacheGeo = new Map<string, Geometria | null>();
  const geometria = (id: string) => {
    if (!cacheGeo.has(id)) {
      const el = ids.get(id);
      cacheGeo.set(id, el && tagDe(el) === 'geometry' ? lerGeometria(el, ids) : null);
    }
    return cacheGeo.get(id)!;
  };

  /** Monta o nó virtual; instâncias de componente (<instance_node>) trazem a definição de library_nodes */
  const montar = (no: El, pilha: Set<string>): VNo => {
    const v: VNo = {
      nome: attr(no, 'name') || attr(no, 'id') || 'sem nome',
      nodeId: attr(no, 'id') ?? null,
      nomeDefinicao: null,
      local: matrizLocal(no),
      geos: [],
      filhos: [],
    };
    for (const ig of filhos(no, 'instance_geometry')) {
      const geo = geometria(semHash(attr(ig, 'url')));
      if (!geo) continue;
      const binds = new Map<string, string>();
      for (const im of filhos(descendente(ig, 'technique_common'), 'instance_material')) {
        binds.set(attr(im, 'symbol') ?? '', semHash(attr(im, 'target')));
      }
      v.geos.push({ geo, binds });
    }
    for (const f of filhos(no, 'node')) v.filhos.push(montar(f, pilha));

    const instancias = filhos(no, 'instance_node');
    for (const inst of instancias) {
      const defId = semHash(attr(inst, 'url'));
      const def = ids.get(defId);
      if (!def) continue;
      if (pilha.has(defId)) {
        avisos.push({ caminho: v.nome, mensagem: `Referência circular ao componente "${attr(def, 'name') || defId}" ignorada.` });
        continue;
      }
      const d = montar(def, new Set([...pilha, defId]));
      d.nomeDefinicao = attr(def, 'name') || defId;
      // Instância pura (caso do SketchUp): o nó vira a própria instância da definição
      if (instancias.length === 1 && !v.geos.length && !v.filhos.length) {
        v.nomeDefinicao = d.nomeDefinicao;
        mat4.multiply(v.local, v.local, d.local);
        v.geos = d.geos;
        v.filhos = d.filhos;
      } else {
        v.filhos.push(d);
      }
    }
    return v;
  };

  const cena = ids.get(semHash(attr(descendente(filho(collada, 'scene'), 'instance_visual_scene'), 'url'))) ?? descendente(collada, 'visual_scene');
  let raizes = filhos(cena, 'node').map((n) => montar(n, new Set()));

  // Poda: nós sem triângulos na subárvore (câmeras, luzes, só arestas) saem
  const temGeo = (v: VNo): boolean => v.geos.length > 0 || v.filhos.some(temGeo);
  const podar = (v: VNo): VNo => ({ ...v, filhos: v.filhos.filter(temGeo).map(podar) });
  raizes = raizes.filter(temGeo).map(podar);
  if (!raizes.length) throw new ErroDae('O arquivo não tem nenhuma geometria com faces (só linhas, câmeras ou luzes).');

  // Um único nó raiz que agrupa outros (o "SketchUp" do exportador): os móveis são os filhos dele.
  // A geometria solta da raiz vira um objeto à parte.
  let base = mat4.create();
  if (raizes.length === 1 && raizes[0].filhos.length) {
    const r = raizes[0];
    base = r.local;
    raizes = [...(r.geos.length ? [{ ...r, nome: `${r.nome} (geometria solta)`, local: mat4.create(), filhos: [], solta: true }] : []), ...r.filhos];
  }

  const objetos: ObjetoDae[] = [];
  const instancias: InstanciaDae[] = [];

  /** Triângulos no mundo (mm) e área por material da geometria própria do nó */
  const triangulosMundo = (v: VNo, mundo: mat4) => {
    const out: number[] = [];
    const areaPorMaterial = new Map<string, number>();
    const p = vec3.create();
    for (const { geo, binds } of v.geos) {
      for (let t = 0; t < geo.tris.length; t += 3) {
        const pts: vec3[] = [];
        for (let k = 0; k < 3; k++) {
          const i = geo.tris[t + k] * 3;
          vec3.transformMat4(p, [geo.pos[i], geo.pos[i + 1], geo.pos[i + 2]], mundo);
          vec3.scale(p, p, paraMm);
          out.push(p[0], p[1], p[2]);
          pts.push(vec3.clone(p));
        }
        const mat = binds.get(geo.simbolos[t / 3] ?? '');
        if (mat) {
          const a = vec3.length(vec3.cross(vec3.create(), vec3.sub(vec3.create(), pts[1], pts[0]), vec3.sub(vec3.create(), pts[2], pts[0]))) / 2;
          areaPorMaterial.set(mat, (areaPorMaterial.get(mat) ?? 0) + a);
        }
      }
    }
    const material = [...areaPorMaterial.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { tris: out, material };
  };

  const contarVertices = (tris: number[]) => {
    const s = new Set<string>();
    for (let i = 0; i < tris.length; i += 3) s.add(`${tris[i].toFixed(2)},${tris[i + 1].toFixed(2)},${tris[i + 2].toFixed(2)}`);
    return s.size;
  };

  const criar = (o: Omit<ObjetoDae, 'idx'>) => {
    const obj = { ...o, idx: objetos.length };
    objetos.push(obj);
    return obj;
  };

  /** Peça candidata: mede e guarda os triângulos para o visualizador */
  const peca = (dados: Omit<ObjetoDae, 'idx' | 'medida' | 'numVertices' | 'classificacao'>, tris: number[], mundo: mat4, matId: string | null) => {
    const medida = medirPeca(tris, mundo, up, passo);
    const obj = criar({ ...dados, classificacao: 'DESCONHECIDO', medida, numVertices: contarVertices(tris) });
    if (!medida.ehRetangular) avisos.push({ caminho: obj.caminho, mensagem: 'Peça com recorte/curva — medida pela caixa externa.' });
    instancias.push({ objeto: obj.idx, tris: Float32Array.from(tris), cor: matId ? corMaterial(matId) : null });
    return obj;
  };

  /** Geometria solta: cada parte conectada (vértices em comum) vira uma peça candidata */
  const soltas = (dados: Parameters<typeof peca>[0], tris: number[], mundo: mat4, matId: string | null) => {
    const partes = partesConectadas(tris);
    partes.forEach((t, i) =>
      // O número vai só no caminho: partes iguais têm o mesmo nome e se agrupam
      peca(partes.length > 1 ? { ...dados, caminho: `${dados.caminho} ${i + 1}` } : dados, t, mundo, matId),
    );
  };

  const visitar = (v: VNo, pai: ObjetoDae | null, mundoPai: mat4, materialHerdado: string | null) => {
    const mundo = mat4.multiply(mat4.create(), mundoPai, v.local);
    const { tris, material } = triangulosMundo(v, mundo);
    const matId = material ?? materialHerdado;
    const nivel = pai ? pai.nivel + 1 : 0;
    const caminho = pai ? `${pai.caminho}/${v.nome}` : v.nome;
    const comum = {
      parent: pai?.idx ?? null,
      nivel,
      caminho,
      nodeIdDae: v.nodeId,
      nome: v.nome,
      nomeDefinicao: v.nomeDefinicao,
      materialDae: matId ? nomeMaterial(matId) : null,
      quantidade: 1,
      espelhado: mat4.determinant(mundo) < 0,
      matrizMundo: Array.from(mundo),
    };

    // Folha com geometria: peça candidata
    if (!v.filhos.length) {
      if (v.solta) soltas({ ...comum, movel: pai?.movel ?? null }, tris, mundo, matId);
      else peca({ ...comum, movel: pai?.movel ?? null }, tris, mundo, matId);
      if (!pai) avisos.push({ caminho, mensagem: 'Peça fora de qualquer móvel (geometria no primeiro nível).' });
      return;
    }

    const obj = criar({ ...comum, classificacao: pai ? 'GRUPO' : 'MOVEL', movel: pai?.movel ?? null, medida: null, numVertices: 0, materialDae: comum.materialDae });
    if (!pai) obj.movel = obj.idx;
    if (tris.length) {
      soltas(
        { ...comum, parent: obj.idx, nivel: nivel + 1, caminho: `${caminho}/${v.nome} (geometria solta)`, nome: `${v.nome} (geometria solta)`, movel: obj.movel },
        tris,
        mundo,
        matId,
      );
      avisos.push({ caminho, mensagem: 'Nó com geometria própria e também com filhos: a geometria solta virou um objeto à parte.' });
    }
    for (const f of v.filhos) visitar(f, obj, mundo, matId);
  };

  for (const r of raizes) visitar(r, null, base, null);

  return agrupar({ meta, objetos, instancias, avisos });
}

/**
 * Dentro do mesmo móvel, peças com a mesma definição (sem definição: o mesmo nome), as mesmas medidas
 * e o mesmo material viram uma linha com a quantidade somada. As instâncias apontam para a linha que ficou.
 */
function agrupar(r: ResultadoDae): ResultadoDae {
  const chaveDe = (o: ObjetoDae) =>
    o.medida && [o.movel, o.nomeDefinicao ?? o.nome, o.medida.comprimento, o.medida.largura, o.medida.espessura, o.materialDae].join('|');
  const primeiro = new Map<string, ObjetoDae>();
  const destino = new Map<number, number>(); // idx removido → idx que ficou
  for (const o of r.objetos) {
    const k = chaveDe(o);
    if (!k) continue;
    const p = primeiro.get(k);
    if (p) {
      p.quantidade += o.quantidade;
      destino.set(o.idx, p.idx);
    } else {
      primeiro.set(k, o);
    }
  }
  if (!destino.size) return r;

  const ficam = r.objetos.filter((o) => !destino.has(o.idx));
  const novo = new Map(ficam.map((o, i) => [o.idx, i]));
  const reidx = (i: number | null) => (i === null ? null : novo.get(destino.get(i) ?? i)!);
  return {
    ...r,
    objetos: ficam.map((o) => ({ ...o, idx: novo.get(o.idx)!, parent: reidx(o.parent), movel: reidx(o.movel) })),
    instancias: r.instancias.map((i) => ({ ...i, objeto: reidx(i.objeto)! })),
  };
}

/** Separa triângulos (mundo, 9 números cada) em partes conectadas por vértices em comum (union-find) */
export function partesConectadas(tris: number[]): number[][] {
  const chave = (i: number) => `${tris[i].toFixed(2)},${tris[i + 1].toFixed(2)},${tris[i + 2].toFixed(2)}`;
  const pai = new Map<string, string>();
  const raiz = (x: string): string => {
    while (pai.get(x) !== x) {
      pai.set(x, pai.get(pai.get(x)!)!);
      x = pai.get(x)!;
    }
    return x;
  };
  for (let i = 0; i < tris.length; i += 3) if (!pai.has(chave(i))) pai.set(chave(i), chave(i));
  for (let i = 0; i < tris.length; i += 9) {
    const a = raiz(chave(i));
    pai.set(raiz(chave(i + 3)), a);
    pai.set(raiz(chave(i + 6)), a);
  }
  const partes = new Map<string, number[]>();
  for (let i = 0; i < tris.length; i += 9) {
    const r = raiz(chave(i));
    if (!partes.has(r)) partes.set(r, []);
    partes.get(r)!.push(...tris.slice(i, i + 9));
  }
  return [...partes.values()];
}
