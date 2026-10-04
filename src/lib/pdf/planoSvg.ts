import { esc } from './comum.js';

/** Cores por móvel (preenchimento claro + contorno escuro), na ordem dos móveis do orçamento */
export const CORES_MOVEL = [
  ['#bfdbfe', '#1d4ed8'],
  ['#bbf7d0', '#15803d'],
  ['#fde68a', '#b45309'],
  ['#fbcfe8', '#be185d'],
  ['#ddd6fe', '#6d28d9'],
  ['#a5f3fc', '#0e7490'],
  ['#fed7aa', '#c2410c'],
  ['#e7e5e4', '#44403c'],
];

export interface PlanoDesenho {
  numero: number;
  pecas: { pecaId: number; x: number; y: number; comprimento: number; largura: number; rotacionada: boolean }[];
  sobras: { x: number; y: number; comprimento: number; largura: number }[];
}

const mm = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v);

/**
 * Desenho SVG de uma chapa do plano de corte: chapa e refilo, peças com a cor do móvel (descrição e medidas),
 * sobras hachuradas e as cotas da chapa. Usado na tela e no PDF.
 */
export function svgChapa(
  plano: PlanoDesenho,
  chapa: { comprimento: number; largura: number },
  refilo: number,
  pecas: Map<number, { descricao: string; movel_id: number }>,
  cores: Map<number, string[]>,
  id: string,
): string {
  const C = chapa.comprimento;
  const L = chapa.largura;
  const margem = 90; // espaço das cotas
  const fonte = Math.max(30, Math.round(C / 55));
  const hachura = `hachura-${id}`;
  const sobras = plano.sobras
    .map((s) => `<rect x="${s.x}" y="${s.y}" width="${s.comprimento}" height="${s.largura}" fill="url(#${hachura})" stroke="#d6d3d1" stroke-width="2"><title>Sobra ${mm(s.comprimento)} × ${mm(s.largura)} mm</title></rect>`)
    .join('');
  const desenhoPecas = plano.pecas
    .map((p) => {
      const peca = pecas.get(p.pecaId);
      const [fundo, linha] = cores.get(peca?.movel_id ?? 0) ?? ['#e7e5e4', '#44403c'];
      const w = p.rotacionada ? p.largura : p.comprimento;
      const h = p.rotacionada ? p.comprimento : p.largura;
      const f = Math.min(fonte, h / 3.2, w / 5);
      const nome = String(peca?.descricao ?? '').slice(0, Math.max(4, Math.floor(w / (f * 0.6))));
      const cx = p.x + w / 2;
      const rotulo =
        f >= 10
          ? `<text x="${cx}" y="${p.y + h / 2}" font-size="${f}" text-anchor="middle" dominant-baseline="middle" fill="${linha}" font-family="Jost, 'Segoe UI', Arial, sans-serif">` +
            `<tspan x="${cx}" dy="${-f * 0.6}">${esc(nome)}</tspan><tspan x="${cx}" dy="${f * 1.2}">${mm(p.comprimento)} × ${mm(p.largura)}${p.rotacionada ? ' ↻' : ''}</tspan></text>`
          : '';
      return `<g><rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" fill="${fundo}" stroke="${linha}" stroke-width="3"/><title>${esc(peca?.descricao ?? 'Peça')} — ${mm(p.comprimento)} × ${mm(p.largura)} mm${p.rotacionada ? ' (girada)' : ''}</title>${rotulo}</g>`;
    })
    .join('');
  const m2 = margem / 2;
  const cota = `<g stroke="#78716c" stroke-width="2" fill="#57534e" font-size="${fonte * 1.2}" font-family="Jost, 'Segoe UI', Arial, sans-serif">
    <line x1="0" y1="${-m2}" x2="${C}" y2="${-m2}"/><line x1="0" y1="${-m2 - 15}" x2="0" y2="${-m2 + 15}"/><line x1="${C}" y1="${-m2 - 15}" x2="${C}" y2="${-m2 + 15}"/>
    <text x="${C / 2}" y="${-m2 - 12}" text-anchor="middle" stroke="none">${mm(C)} mm</text>
    <line x1="${-m2}" y1="0" x2="${-m2}" y2="${L}"/><line x1="${-m2 - 15}" y1="0" x2="${-m2 + 15}" y2="0"/><line x1="${-m2 - 15}" y1="${L}" x2="${-m2 + 15}" y2="${L}"/>
    <text x="${-m2 - 12}" y="${L / 2}" text-anchor="middle" stroke="none" transform="rotate(-90 ${-m2 - 12} ${L / 2})">${mm(L)} mm</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margem} ${-margem} ${C + margem + 20} ${L + margem + 20}" width="100%" role="img" aria-label="Chapa ${plano.numero}">
  <defs><pattern id="${hachura}" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="30" stroke="#a8a29e" stroke-width="5"/></pattern></defs>
  <rect x="0" y="0" width="${C}" height="${L}" fill="#f5f5f4" stroke="#78716c" stroke-width="3"/>
  <g transform="translate(${refilo} ${refilo})">${sobras}${desenhoPecas}</g>${cota}</svg>`;
}
