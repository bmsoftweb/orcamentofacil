/**
 * Miniatura isométrica de um móvel, em SVG, a partir dos triângulos da malha gravada na importação
 * (mm, eixos do arquivo). Visto de frente-direita-cima; pintor por profundidade e sombreamento pela normal.
 */
export interface MalhaMiniatura {
  tris: Float32Array;
  cor: string | null;
}

const COR_PADRAO = '#d6cfc4';

function rgb(hex: string): [number, number, number] {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex)?.[1] ?? 'd6cfc4';
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function miniaturaSvg(malhas: MalhaMiniatura[], eixoUp: string, largura = 260, altura = 200): string | null {
  // Eixos para Z-up (o SketchUp já é Z-up; frente olhando para +Y)
  const paraZ = (x: number, y: number, z: number): [number, number, number] => (eixoUp === 'Y_UP' ? [x, -z, y] : eixoUp === 'X_UP' ? [y, z, x] : [x, y, z]);
  // Câmera em (1, −1, 1) olhando para a origem: vê frente (−Y), lado direito (+X) e topo
  const s3 = Math.sqrt(3);
  const s2 = Math.SQRT2;
  const tela = (p: [number, number, number]) => ({
    x: (p[0] + p[1]) / s2,
    y: -(-p[0] + p[1] + 2 * p[2]) / Math.sqrt(6),
    prof: (p[0] - p[1] + p[2]) / s3,
  });
  const luz = [0.35, -0.65, 0.68];
  const faces: { pts: { x: number; y: number }[]; prof: number; cor: string }[] = [];
  for (const m of malhas) {
    const base = rgb(m.cor ?? COR_PADRAO);
    for (let i = 0; i + 8 < m.tris.length; i += 9) {
      const v = [0, 3, 6].map((k) => paraZ(m.tris[i + k], m.tris[i + k + 1], m.tris[i + k + 2]));
      const e1 = [0, 1, 2].map((k) => v[1][k] - v[0][k]);
      const e2 = [0, 1, 2].map((k) => v[2][k] - v[0][k]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const len = Math.hypot(n[0], n[1], n[2]);
      if (len < 1e-6) continue;
      const brilho = 0.55 + 0.45 * Math.abs((n[0] * luz[0] + n[1] * luz[1] + n[2] * luz[2]) / len);
      const t = v.map(tela);
      const c = base.map((x) => Math.round(Math.min(255, x * brilho)));
      faces.push({ pts: t, prof: (t[0].prof + t[1].prof + t[2].prof) / 3, cor: `rgb(${c.join(',')})` });
    }
  }
  if (!faces.length) return null;
  faces.sort((a, b) => a.prof - b.prof); // mais longe primeiro
  const xs = faces.flatMap((f) => f.pts.map((p) => p.x));
  const ys = faces.flatMap((f) => f.pts.map((p) => p.y));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const folga = Math.max(x1 - x0, y1 - y0) * 0.03;
  const traco = Math.max(x1 - x0, y1 - y0) / 400;
  const poligonos = faces
    .map((f) => `<polygon points="${f.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="${f.cor}" stroke="${f.cor}" stroke-width="${traco.toFixed(2)}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="${(x0 - folga).toFixed(1)} ${(y0 - folga).toFixed(1)} ${(x1 - x0 + 2 * folga).toFixed(1)} ${(y1 - y0 + 2 * folga).toFixed(1)}" preserveAspectRatio="xMidYMid meet">${poligonos}</svg>`;
}
