import React from 'react';
import { OpcaoRef } from '../../types';

type Fitas = [number | null, number | null, number | null, number | null];

/**
 * Desenho da peça com as 4 bordas clicáveis: em cima e embaixo as do comprimento (C1, C2), à esquerda
 * e à direita as da largura (L1, L2). Clicar liga/desliga a fita naquela borda; o combo troca a fita de todas.
 */
export const FitaBordas: React.FC<{ fitas: Fitas; opcoes: OpcaoRef[]; disabled?: boolean; onChange: (f: Fitas) => void }> = ({ fitas, opcoes, disabled, onChange }) => {
  const atual = fitas.find((f) => f) ?? (opcoes[0] ? Number(opcoes[0].value) : null);
  const alternar = (i: number) => {
    if (disabled) return;
    const n = [...fitas] as Fitas;
    n[i] = n[i] ? null : atual;
    onChange(n);
  };
  const lado = (i: number) => ({
    stroke: fitas[i] ? '#2563eb' : '#a8a29e',
    strokeWidth: fitas[i] ? 5 : 1.5,
    strokeDasharray: fitas[i] ? undefined : '3 3',
  });
  const nome = (i: number) => (fitas[i] ? opcoes.find((o) => Number(o.value) === fitas[i])?.label ?? `fita nº ${fitas[i]}` : 'sem fita');
  const ROTULOS = ['C1 (comprimento, em cima)', 'C2 (comprimento, embaixo)', 'L1 (largura, à esquerda)', 'L2 (largura, à direita)'];
  // Retângulo 60 × 28; cada borda tem uma faixa invisível larga para o clique
  const bordas: [number, number, number, number][] = [
    [6, 4, 66, 4],
    [6, 32, 66, 32],
    [6, 4, 6, 32],
    [66, 4, 66, 32],
  ];
  return (
    <div className="flex items-center gap-1.5">
      <svg width="72" height="36" className={disabled ? 'opacity-60' : 'cursor-pointer'} role="group" aria-label="Fitas por borda">
        <rect x="6" y="4" width="60" height="28" fill="#f5f5f4" />
        {bordas.map(([x1, y1, x2, y2], i) => (
          <g key={i} onClick={() => alternar(i)}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} {...lado(i)} />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12}>
              <title>{`${ROTULOS[i]}: ${nome(i)}${disabled ? '' : ' — clique para alternar'}`}</title>
            </line>
          </g>
        ))}
      </svg>
      {!disabled && fitas.some((f) => f) && opcoes.length > 1 && (
        <select
          value={String(atual ?? '')}
          onChange={(e) => onChange(fitas.map((f) => (f ? Number(e.target.value) : null)) as Fitas)}
          title="Fita aplicada nas bordas marcadas"
          className="text-[11px] max-w-[110px] bg-transparent cursor-pointer"
        >
          {opcoes.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};
