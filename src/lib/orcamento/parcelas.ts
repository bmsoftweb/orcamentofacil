/** Condição de pagamento: entrada (% do total) + N parcelas iguais a cada X dias */
export interface CondicaoPagamento {
  perc_entrada: number | string;
  numero_parcelas: number | string;
  intervalo_dias: number | string;
}

/** Parcelas do valor final; a última fica com a diferença dos centavos */
export function calcularParcelas(valorFinal: number, c: CondicaoPagamento): { rotulo: string; valor: number }[] {
  if (!(valorFinal > 0)) return [];
  const cent = (x: number) => Math.round(x * 100) / 100;
  const entrada = cent((valorFinal * Number(c.perc_entrada)) / 100);
  const n = Number(c.numero_parcelas);
  const resto = cent(valorFinal - entrada);
  const out = entrada > 0 ? [{ rotulo: 'Entrada', valor: entrada }] : [];
  const parcela = n > 0 ? cent(resto / n) : 0;
  for (let i = 1; i <= n; i++) {
    out.push({ rotulo: `${i}ª em ${i * Number(c.intervalo_dias)} dias`, valor: i === n ? cent(resto - parcela * (n - 1)) : parcela });
  }
  return out;
}
