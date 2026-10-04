/**
 * Otimizador de plano de corte em guilhotina (cortes de ponta a ponta, como na seccionadora).
 * Função pura e determinística: as heurísticas rodam numa ordem fixa e o desempate é estável.
 *
 * Eixos: X = comprimento da chapa, Y = largura. Coordenadas em mm a partir do canto da área útil
 * (a chapa sem o refilo dos 4 lados). Peça sem rotação: o comprimento dela segue o X (veio da chapa).
 */

export interface PecaCorte {
  id: number;
  comprimento: number;
  largura: number;
  /** Total de unidades (já multiplicado pela quantidade do móvel) */
  quantidade: number;
  respeitaVeio: boolean;
}

export interface ChapaCorte {
  comprimento: number;
  largura: number;
  possuiVeio: boolean;
}

export interface OpcoesCorte {
  /** Espessura da serra (mm), descontada entre as peças */
  kerf: number;
  /** Borda descartada em cada lado da chapa (mm) */
  refilo: number;
  /** Tempo máximo para testar heurísticas (ms); padrão 3000 */
  limiteMs?: number;
}

export interface Retangulo {
  x: number;
  y: number;
  /** Ao longo de X */
  comprimento: number;
  /** Ao longo de Y */
  largura: number;
}

export interface PecaPosicionada {
  pecaId: number;
  x: number;
  y: number;
  /** Medidas da própria peça; rotacionada = a largura dela é que segue o X da chapa */
  comprimento: number;
  largura: number;
  rotacionada: boolean;
}

export interface ChapaPlano {
  numero: number;
  comprimentoUtil: number;
  larguraUtil: number;
  pecas: PecaPosicionada[];
  sobras: Retangulo[];
  areaPecasM2: number;
  /** Área das peças / área útil (%) */
  aproveitamento: number;
}

export interface ResultadoCorte {
  chapas: ChapaPlano[];
  erros: { pecaId: number; quantidade: number; motivo: string }[];
  heuristica: string;
}

type Encaixe = 'BAF' | 'BSSF' | 'BLSF';
type Divisao = 'SAS' | 'LAS' | 'HORIZONTAL' | 'VERTICAL';
interface Instancia {
  pecaId: number;
  c: number;
  l: number;
  podeGirar: boolean;
  ordem: number;
}
interface Folha {
  livres: Retangulo[];
  pecas: PecaPosicionada[];
}

const ORDENACOES: [string, (a: Instancia, b: Instancia) => number][] = [
  ['área', (a, b) => b.c * b.l - a.c * a.l],
  ['maior lado', (a, b) => Math.max(b.c, b.l) - Math.max(a.c, a.l) || Math.min(b.c, b.l) - Math.min(a.c, a.l)],
  ['comprimento', (a, b) => b.c - a.c || b.l - a.l],
  ['perímetro', (a, b) => b.c + b.l - (a.c + a.l)],
];
const ENCAIXES: Encaixe[] = ['BAF', 'BSSF', 'BLSF'];
const DIVISOES: Divisao[] = ['SAS', 'LAS', 'HORIZONTAL', 'VERTICAL'];

/** Pontuação do encaixe (menor é melhor) e o desempate */
function pontuar(f: Retangulo, w: number, h: number, encaixe: Encaixe): [number, number] {
  const sw = f.comprimento - w;
  const sh = f.largura - h;
  if (encaixe === 'BAF') return [f.comprimento * f.largura - w * h, Math.min(sw, sh)];
  if (encaixe === 'BSSF') return [Math.min(sw, sh), Math.max(sw, sh)];
  return [Math.max(sw, sh), Math.min(sw, sh)];
}

/** Coloca w × h no canto do retângulo livre e divide o que sobra em dois (corte de guilhotina) com o kerf */
function dividir(f: Retangulo, w: number, h: number, kerf: number, divisao: Divisao): Retangulo[] {
  const restoX = f.comprimento - w - kerf;
  const restoY = f.largura - h - kerf;
  let horizontal: boolean; // corte paralelo a X: a faixa de cima fica com o comprimento inteiro
  if (divisao === 'HORIZONTAL') horizontal = true;
  else if (divisao === 'VERTICAL') horizontal = false;
  else if (divisao === 'SAS') horizontal = f.comprimento < f.largura;
  else horizontal = f.comprimento >= f.largura;
  const direita: Retangulo = { x: f.x + w + kerf, y: f.y, comprimento: restoX, largura: horizontal ? h : f.largura };
  const cima: Retangulo = { x: f.x, y: f.y + h + kerf, comprimento: horizontal ? f.comprimento : w, largura: restoY };
  return [direita, cima].filter((r) => r.comprimento > 0 && r.largura > 0);
}

function empacotar(insts: Instancia[], util: { c: number; l: number }, kerf: number, encaixe: Encaixe, divisao: Divisao): Folha[] {
  const folhas: Folha[] = [];
  for (const p of insts) {
    const orientacoes: [number, number, boolean][] = [[p.c, p.l, false]];
    if (p.podeGirar && p.c !== p.l) orientacoes.push([p.l, p.c, true]);
    let melhor: { folha: Folha; livre: number; w: number; h: number; girada: boolean; nota: [number, number] } | null = null;
    for (const folha of folhas) {
      folha.livres.forEach((f, i) => {
        for (const [w, h, girada] of orientacoes) {
          if (w > f.comprimento || h > f.largura) continue;
          const nota = pontuar(f, w, h, encaixe);
          if (!melhor || nota[0] < melhor.nota[0] || (nota[0] === melhor.nota[0] && nota[1] < melhor.nota[1])) melhor = { folha, livre: i, w, h, girada, nota };
        }
      });
    }
    if (!melhor) {
      // Chapa nova; a peça cabe na área útil (conferido antes)
      const folha: Folha = { livres: [{ x: 0, y: 0, comprimento: util.c, largura: util.l }], pecas: [] };
      folhas.push(folha);
      const [w, h, girada] = orientacoes.find(([w, h]) => w <= util.c && h <= util.l)!;
      melhor = { folha, livre: 0, w, h, girada, nota: [0, 0] };
    }
    const m = melhor as NonNullable<typeof melhor>;
    const f = m.folha.livres[m.livre];
    m.folha.livres.splice(m.livre, 1, ...dividir(f, m.w, m.h, kerf, divisao));
    m.folha.pecas.push({ pecaId: p.pecaId, x: f.x, y: f.y, comprimento: p.c, largura: p.l, rotacionada: m.girada });
  }
  return folhas;
}

const maiorSobra = (f: Folha) => Math.max(0, ...f.livres.map((r) => r.comprimento * r.largura));

export function otimizar(pecas: PecaCorte[], chapa: ChapaCorte, opcoes: OpcoesCorte): ResultadoCorte {
  const util = { c: chapa.comprimento - 2 * opcoes.refilo, l: chapa.largura - 2 * opcoes.refilo };
  const erros: ResultadoCorte['erros'] = [];
  const insts: Instancia[] = [];
  for (const p of pecas) {
    const podeGirar = !(p.respeitaVeio && chapa.possuiVeio);
    const cabe = (p.comprimento <= util.c && p.largura <= util.l) || (podeGirar && p.largura <= util.c && p.comprimento <= util.l);
    if (!(p.comprimento > 0 && p.largura > 0)) {
      erros.push({ pecaId: p.id, quantidade: p.quantidade, motivo: 'medida zerada' });
      continue;
    }
    if (!cabe) {
      erros.push({
        pecaId: p.id,
        quantidade: p.quantidade,
        motivo: `${p.comprimento} × ${p.largura} mm não cabe na área útil ${util.c} × ${util.l} mm${podeGirar ? '' : ' (veio: sem girar)'}`,
      });
      continue;
    }
    for (let k = 0; k < p.quantidade; k++) insts.push({ pecaId: p.id, c: p.comprimento, l: p.largura, podeGirar, ordem: insts.length });
  }
  if (!insts.length) return { chapas: [], erros, heuristica: '' };

  const inicio = Date.now();
  const limite = opcoes.limiteMs ?? 3000;
  let melhor: { folhas: Folha[]; nome: string } | null = null;
  fora: for (const [nomeOrd, ord] of ORDENACOES) {
    const ordenadas = [...insts].sort((a, b) => ord(a, b) || a.pecaId - b.pecaId || a.ordem - b.ordem);
    for (const encaixe of ENCAIXES) {
      for (const divisao of DIVISOES) {
        const folhas = empacotar(ordenadas, util, opcoes.kerf, encaixe, divisao);
        // Menos chapas; empate: a maior sobra contínua na última chapa (mais reaproveitável)
        if (!melhor || folhas.length < melhor.folhas.length || (folhas.length === melhor.folhas.length && maiorSobra(folhas.at(-1)!) > maiorSobra(melhor.folhas.at(-1)!))) {
          melhor = { folhas, nome: `${nomeOrd} · ${encaixe} · ${divisao}` };
        }
        if (Date.now() - inicio > limite) break fora;
      }
    }
  }

  const areaUtil = util.c * util.l;
  return {
    chapas: melhor!.folhas.map((f, i) => {
      const area = f.pecas.reduce((s, p) => s + p.comprimento * p.largura, 0);
      return {
        numero: i + 1,
        comprimentoUtil: util.c,
        larguraUtil: util.l,
        pecas: f.pecas,
        sobras: f.livres,
        areaPecasM2: area / 1e6,
        aproveitamento: Math.round((area / areaUtil) * 10000) / 100,
      };
    }),
    erros,
    heuristica: melhor!.nome,
  };
}
