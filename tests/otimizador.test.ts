import { describe, expect, it } from 'vitest';
import { otimizar, PecaCorte, ResultadoCorte } from '../src/lib/corte/otimizador';

const CHAPA = { comprimento: 2750, largura: 1850, possuiVeio: false };
const OPC = { kerf: 4, refilo: 10 };
const peca = (id: number, comprimento: number, largura: number, quantidade = 1, respeitaVeio = false): PecaCorte => ({ id, comprimento, largura, quantidade, respeitaVeio });

/** Retângulo ocupado na chapa (eixos da chapa) */
const ocupado = (p: ResultadoCorte['chapas'][number]['pecas'][number]) => ({ x: p.x, y: p.y, w: p.rotacionada ? p.largura : p.comprimento, h: p.rotacionada ? p.comprimento : p.largura });

/** Confere: dentro da área útil, sem sobreposição e com pelo menos o kerf entre peças vizinhas */
function confereGeometria(r: ResultadoCorte, kerf: number) {
  for (const ch of r.chapas) {
    const rets = ch.pecas.map(ocupado);
    for (const a of rets) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w).toBeLessThanOrEqual(ch.comprimentoUtil);
      expect(a.y + a.h).toBeLessThanOrEqual(ch.larguraUtil);
    }
    for (let i = 0; i < rets.length; i++) {
      for (let j = i + 1; j < rets.length; j++) {
        const a = rets[i];
        const b = rets[j];
        const folgaX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
        const folgaY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
        // Separadas em pelo menos um eixo, com o kerf
        expect(Math.max(folgaX, folgaY), `peças ${i} e ${j} da chapa ${ch.numero}`).toBeGreaterThanOrEqual(kerf);
      }
    }
  }
}

describe('otimizador de corte', () => {
  const armario = [peca(1, 700, 350, 4), peca(2, 764, 350, 3), peca(3, 700, 400, 2), peca(4, 764, 664, 1), peca(5, 2000, 600, 2), peca(6, 450, 120, 10)];

  it('sem sobreposição, dentro da área útil e com o kerf entre as peças', () => {
    const r = otimizar(armario, CHAPA, OPC);
    expect(r.erros).toEqual([]);
    expect(r.chapas.flatMap((c) => c.pecas)).toHaveLength(22);
    confereGeometria(r, OPC.kerf);
  });

  it('área útil desconta o refilo; aproveitamento pela área útil', () => {
    const r = otimizar([peca(1, 1000, 500)], CHAPA, OPC);
    expect(r.chapas[0]).toMatchObject({ comprimentoUtil: 2730, larguraUtil: 1830 });
    expect(r.chapas[0].aproveitamento).toBeCloseTo((1000 * 500 * 100) / (2730 * 1830), 2);
  });

  it('kerf conta: 2 peças que somam a área útil exata não cabem na mesma chapa', () => {
    expect(otimizar([peca(1, 2730, 915, 2)], CHAPA, { kerf: 0, refilo: 10 }).chapas).toHaveLength(1);
    expect(otimizar([peca(1, 2730, 915, 2)], CHAPA, OPC).chapas).toHaveLength(2);
  });

  it('veio: com peça e chapa de veio, nada gira e o comprimento segue o da chapa', () => {
    const r = otimizar([peca(1, 1800, 300, 6, true), peca(2, 900, 1500, 1, true)], { ...CHAPA, possuiVeio: true }, OPC);
    expect(r.chapas.flatMap((c) => c.pecas).every((p) => !p.rotacionada)).toBe(true);
    confereGeometria(r, OPC.kerf);
    // Peça que só caberia girada vira erro
    const e = otimizar([peca(9, 1000, 2000, 1, true)], { ...CHAPA, possuiVeio: true }, OPC);
    expect(e.erros[0]).toMatchObject({ pecaId: 9, quantidade: 1 });
    expect(e.erros[0].motivo).toContain('veio');
    // Sem veio na chapa, a mesma peça gira e entra
    expect(otimizar([peca(9, 1000, 2000, 1, true)], CHAPA, OPC).chapas[0].pecas[0].rotacionada).toBe(true);
  });

  it('peça maior que a chapa: erro listado, as outras seguem no plano', () => {
    const r = otimizar([peca(1, 3000, 500, 2), peca(2, 500, 500, 3)], CHAPA, OPC);
    expect(r.erros).toEqual([expect.objectContaining({ pecaId: 1, quantidade: 2 })]);
    expect(r.chapas.flatMap((c) => c.pecas)).toHaveLength(3);
  });

  it('menos chapas: 8 peças de ~1/8 da chapa cabem em uma', () => {
    // 4 colunas × 2 linhas: (2730 − 3 × 4) / 4 = 679,5 → 679; (1830 − 4) / 2 = 913
    expect(otimizar([peca(1, 679, 913, 8)], CHAPA, OPC).chapas).toHaveLength(1);
  });

  it('determinístico: mesma entrada, mesmo plano', () => {
    expect(JSON.stringify(otimizar(armario, CHAPA, OPC))).toBe(JSON.stringify(otimizar(armario, CHAPA, OPC)));
  });
});
