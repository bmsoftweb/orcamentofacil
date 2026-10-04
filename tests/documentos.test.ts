import { describe, expect, it } from 'vitest';
import { csvListaCorte } from '../src/lib/pdf/documentos';
import { calcularParcelas } from '../src/lib/orcamento/parcelas';
import { miniaturaSvg } from '../src/lib/pdf/miniatura';

describe('lista de corte em CSV', () => {
  it('BOM, separador ";", decimal com vírgula e campos com ";" entre aspas', () => {
    const csv = csvListaCorte([
      { chapa: 'MDF 18', chapa_codigo: 'MDF-18', movel: 'Armário; alto', peca: 'Lateral "E"', tipo_peca: 'Lateral', comprimento_mm: '700.50', largura_mm: '350.00', espessura_mm: '18.00', quantidade_total: 2, respeita_veio: 1, fita_comp1: 'FITA-22', fita_comp2: null, fita_larg1: null, fita_larg2: null, usinagem: null, observacoes: null },
    ]);
    expect(csv.startsWith('﻿Chapa;Código chapa;Móvel;Peça;')).toBe(true);
    const linha = csv.split('\r\n')[1];
    expect(linha).toBe('MDF 18;MDF-18;"Armário; alto";"Lateral ""E""";Lateral;700,5;350;18;2;S;FITA-22;;;;;');
  });
});

describe('parcelas', () => {
  it('entrada + parcelas iguais; a última fecha os centavos', () => {
    const p = calcularParcelas(1000, { perc_entrada: 30, numero_parcelas: 3, intervalo_dias: 30 });
    expect(p).toEqual([
      { rotulo: 'Entrada', valor: 300 },
      { rotulo: '1ª em 30 dias', valor: 233.33 },
      { rotulo: '2ª em 60 dias', valor: 233.33 },
      { rotulo: '3ª em 90 dias', valor: 233.34 },
    ]);
  });
});

describe('miniatura', () => {
  it('desenha os triângulos; sem malha não há miniatura', () => {
    const tri = new Float32Array([0, 0, 0, 100, 0, 0, 0, 0, 100]);
    expect(miniaturaSvg([{ tris: tri, cor: '#ff0000' }], 'Z_UP')).toMatch(/^<svg[^>]+><polygon/);
    expect(miniaturaSvg([], 'Z_UP')).toBeNull();
  });
});
