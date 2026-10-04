import { describe, expect, it } from 'vitest';
import { normalizar, casaPadrao, normalizarPalavrasChave } from '../src/lib/texto';
import { documentoValido, mascaraDocumento } from '../src/lib/documento';

describe('normalizar', () => {
  it('minúsculas, sem acento, _ e - viram espaço, espaços colapsados', () => {
    expect(normalizar('  Porta_Ésquerda--ALTA  ')).toBe('porta esquerda alta');
    expect(normalizar(null)).toBe('');
  });
  it('palavras-chave CSV', () => {
    expect(normalizarPalavrasChave('Lateral, LAT ,,ld,lat')).toBe('lateral,lat,ld');
  });
});

describe('casaPadrao', () => {
  it('modos', () => {
    expect(casaPadrao('Puxador', 'CONTEM', 'puxador_cava_160')).toBe(true);
    expect(casaPadrao('puxador', 'INICIA', 'cava puxador')).toBe(false);
    expect(casaPadrao('humano', 'EXATO', 'Humano')).toBe(true);
    expect(casaPadrao('^mdf \\d+', 'REGEX', 'MDF_18 Branco')).toBe(true);
    expect(casaPadrao('(', 'REGEX', 'qualquer')).toBe(false);
  });
});

describe('documento', () => {
  it('CPF e CNPJ', () => {
    expect(documentoValido('529.982.247-25')).toBe(true);
    expect(documentoValido('529.982.247-24')).toBe(false);
    expect(documentoValido('11.222.333/0001-81')).toBe(true);
    expect(documentoValido('11.222.333/0001-80')).toBe(false);
    expect(documentoValido('111.111.111-11')).toBe(false);
  });
  it('máscara', () => {
    expect(mascaraDocumento('52998224725')).toBe('529.982.247-25');
    expect(mascaraDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(mascaraDocumento('5299')).toBe('529.9');
  });
});
