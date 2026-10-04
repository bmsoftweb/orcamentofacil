import { mat4, vec3 } from 'gl-matrix';

/**
 * Geometria das peças: caixa orientada (OBB), volume da malha e retangularidade.
 * Entrada: triângulos já no espaço mundo, em mm, 9 números por triângulo (x,y,z dos 3 vértices).
 */

export interface MedidaPeca {
  /** Extensões ao longo dos eixos da caixa, na ordem dos eixos (antes de ordenar) */
  dims: [number, number, number];
  eixos: [vec3, vec3, vec3];
  comprimento: number;
  largura: number;
  espessura: number;
  /** Extensão no eixo da caixa mais alinhado com o "up" do mundo (exceção de veio) */
  dimUp: number;
  /** Centro da caixa no mundo (mm) */
  centro: vec3;
  volumeBbox: number; // mm³
  volumeMalha: number; // mm³
  areaFaces: number; // mm²
  numFaces: number;
  ehRetangular: boolean;
  /** 1 = eixos locais do nó; 2 = normais de face (peça desenhada girada dentro do grupo) */
  tentativa: 1 | 2;
}

const v = (t: ArrayLike<number>, i: number) => vec3.fromValues(t[i], t[i + 1], t[i + 2]);

/** Volume com sinal (soma de tetraedros com a origem); o módulo é o volume de uma malha fechada */
export function volumeMalha(tris: ArrayLike<number>): number {
  let soma = 0;
  const c = vec3.create();
  for (let i = 0; i < tris.length; i += 9) {
    vec3.cross(c, v(tris, i + 3), v(tris, i + 6));
    soma += vec3.dot(v(tris, i), c);
  }
  return Math.abs(soma / 6);
}

/** Normal (não normalizada: módulo = 2 × área) do triângulo que começa em i */
function normalBruta(tris: ArrayLike<number>, i: number): vec3 {
  const a = v(tris, i);
  const e1 = vec3.sub(vec3.create(), v(tris, i + 3), a);
  const e2 = vec3.sub(vec3.create(), v(tris, i + 6), a);
  return vec3.cross(vec3.create(), e1, e2);
}

/** Direção sem sentido (±n vira a mesma chave), arredondada para agrupar faces coplanares/paralelas */
function chaveDirecao(n: vec3): string {
  const s = Math.abs(n[0]) > 1e-6 ? Math.sign(n[0]) : Math.abs(n[1]) > 1e-6 ? Math.sign(n[1]) : Math.sign(n[2]) || 1;
  return [n[0] * s, n[1] * s, n[2] * s].map((x) => (Math.round(x * 100) / 100 || 0).toFixed(2)).join(',');
}

/** Extensões e centro dos vértices projetados em 3 eixos ortonormais */
function caixa(tris: ArrayLike<number>, eixos: [vec3, vec3, vec3]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) {
    const p = v(tris, i);
    for (let k = 0; k < 3; k++) {
      const d = vec3.dot(p, eixos[k]);
      if (d < min[k]) min[k] = d;
      if (d > max[k]) max[k] = d;
    }
  }
  const dims = [0, 1, 2].map((k) => max[k] - min[k]) as [number, number, number];
  const centro = vec3.create();
  for (let k = 0; k < 3; k++) vec3.scaleAndAdd(centro, centro, eixos[k], (min[k] + max[k]) / 2);
  return { dims, centro, volume: dims[0] * dims[1] * dims[2] };
}

/** Tentativa 1: colunas normalizadas do 3×3 da matriz mundo do nó */
export function eixosDaMatriz(m: mat4): [vec3, vec3, vec3] {
  const cols = [0, 1, 2].map((c) => vec3.fromValues(m[c * 4], m[c * 4 + 1], m[c * 4 + 2]));
  const padrao = [vec3.fromValues(1, 0, 0), vec3.fromValues(0, 1, 0), vec3.fromValues(0, 0, 1)];
  return cols.map((c, i) => (vec3.length(c) < 1e-9 ? padrao[i] : vec3.normalize(c, c))) as [vec3, vec3, vec3];
}

/** Tentativa 2: espessura = normal da maior face; comprimento = maior aresta dessa face; terceiro = produto vetorial */
export function eixosDasFaces(tris: ArrayLike<number>): [vec3, vec3, vec3] | null {
  const grupos = new Map<string, { n: vec3; area: number; tris: number[] }>();
  for (let i = 0; i < tris.length; i += 9) {
    const nb = normalBruta(tris, i);
    const area = vec3.length(nb) / 2;
    if (area < 1e-9) continue;
    const n = vec3.normalize(vec3.create(), nb);
    const k = chaveDirecao(n);
    const g = grupos.get(k) ?? { n, area: 0, tris: [] };
    g.area += area;
    g.tris.push(i);
    grupos.set(k, g);
  }
  const maior = [...grupos.values()].sort((a, b) => b.area - a.area)[0];
  if (!maior) return null;
  const n = maior.n;
  // Direções das arestas da maior face, no plano dela. A diagonal de um retângulo triangulado é a
  // maior aresta, então não basta pegar a maior: fica a direção que dá a menor caixa no plano.
  const direcoes = new Map<string, { d: vec3; len: number }>();
  for (const i of maior.tris) {
    for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) {
      const e = vec3.sub(vec3.create(), v(tris, i + b), v(tris, i + a));
      vec3.scaleAndAdd(e, e, n, -vec3.dot(e, n));
      const len = vec3.length(e);
      if (len < 1e-6) continue;
      vec3.normalize(e, e);
      const k = chaveDirecao(e);
      if ((direcoes.get(k)?.len ?? 0) < len) direcoes.set(k, { d: e, len });
    }
  }
  // ponytail: testa até 64 direções (as das maiores arestas) contra todos os vértices
  const candidatas = [...direcoes.values()].sort((a, b) => b.len - a.len).slice(0, 64);
  let melhor: { u: vec3; w: vec3; area: number } | null = null;
  for (const { d } of candidatas) {
    const w = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), n, d));
    const { dims } = caixa(tris, [n, d, w]);
    const area = dims[1] * dims[2];
    // u = o maior dos dois lados no plano (comprimento)
    if (!melhor || area < melhor.area - 1e-6) melhor = dims[1] >= dims[2] ? { u: vec3.clone(d), w, area } : { u: w, w: vec3.clone(d), area };
  }
  if (!melhor) return null;
  return [vec3.clone(n), melhor.u, melhor.w];
}

const arredondar = (x: number, passo: number) => (passo > 0 ? Math.round(x / passo) * passo : x);

/**
 * Mede a peça pela caixa orientada (ver Módulo 3.1, item 6 do prompt).
 * `matriz` = matriz mundo do nó; `up` = eixo up do mundo; `passo` = arredondamento em mm.
 */
export function medirPeca(tris: ArrayLike<number>, matriz: mat4, up: vec3, passo: number): MedidaPeca {
  const volMalha = volumeMalha(tris);
  let eixos = eixosDaMatriz(matriz);
  let cx = caixa(tris, eixos);
  let tentativa: 1 | 2 = 1;

  // Caixa muito maior que a malha: peça desenhada girada dentro do grupo
  if (volMalha < 1e-6 || cx.volume / volMalha > 1.15) {
    const e2 = eixosDasFaces(tris);
    if (e2) {
      const cx2 = caixa(tris, e2);
      if (cx2.volume < cx.volume) {
        eixos = e2;
        cx = cx2;
        tentativa = 2;
      }
    }
  }

  let areaFaces = 0;
  const direcoes = new Set<string>();
  for (let i = 0; i < tris.length; i += 9) {
    const nb = normalBruta(tris, i);
    const a = vec3.length(nb) / 2;
    if (a < 1e-9) continue;
    areaFaces += a;
    direcoes.add(chaveDirecao(vec3.normalize(nb, nb)));
  }

  const ordenadas = [...cx.dims].sort((a, b) => a - b);
  let idxUp = 0;
  for (let k = 1; k < 3; k++) if (Math.abs(vec3.dot(eixos[k], up)) > Math.abs(vec3.dot(eixos[idxUp], up))) idxUp = k;

  return {
    dims: cx.dims.map((d) => arredondar(d, passo)) as [number, number, number],
    eixos,
    espessura: arredondar(ordenadas[0], passo),
    largura: arredondar(ordenadas[1], passo),
    comprimento: arredondar(ordenadas[2], passo),
    dimUp: arredondar(cx.dims[idxUp], passo),
    centro: cx.centro,
    volumeBbox: cx.volume,
    volumeMalha: volMalha,
    areaFaces,
    numFaces: tris.length / 9,
    ehRetangular: cx.volume > 0 && volMalha / cx.volume >= 0.97 && direcoes.size <= 3,
    tentativa,
  };
}
