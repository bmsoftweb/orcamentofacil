import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { RegistroCrud } from '../../types';
import { listRecords, salvarPrecificacao } from '../../services/api';
import { formarPreco } from '../../lib/orcamento/calculo';
import { calcularParcelas, CondicaoPagamento } from '../../lib/orcamento/parcelas';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../../utils/formStyles';
import { NumberField } from '../NumberField';
import { SelectBusca } from '../SelectBusca';
import { BRL, PropsAba } from './OrcamentoView';

const GRUPOS: [string, string, string][] = [
  ['custo_chapas', 'Chapas', '#3b82f6'],
  ['custo_fitas', 'Fitas', '#06b6d4'],
  ['custo_outras_mp', 'Outras matérias-primas', '#8b5cf6'],
  ['custo_insumos', 'Insumos', '#a855f7'],
  ['custo_ferragens', 'Ferragens', '#f59e0b'],
  ['custo_servicos', 'Serviços', '#10b981'],
  ['custo_avulsos', 'Avulsos', '#78716c'],
];
const PERC: [string, string][] = [
  ['perc_custo_fixo', 'Custo fixo'],
  ['perc_impostos', 'Impostos'],
  ['perc_comissao', 'Comissão'],
  ['perc_rt', 'RT do arquiteto'],
  ['perc_margem', 'Margem'],
];
const pct = (x: number) => `${x.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** Resumo e formação de preço: o preço é refeito ao vivo no navegador com a mesma função do servidor */
export const AbaResumo: React.FC<PropsAba> = ({ e, aposEditar, onToast }) => {
  const o = e.orcamento;
  const [v, setV] = useState<Record<string, string>>(() =>
    Object.fromEntries([...PERC.map(([k]) => k), 'perc_desconto', 'valor_desconto', 'condicao_pagamento_id'].map((k) => [k, o[k] == null ? '' : String(o[k])])),
  );
  const [condicoes, setCondicoes] = useState<RegistroCrud[]>([]);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    listRecords('condicoes_pagamento', { limit: 200, sort: 'descricao', dir: 'asc' })
      .then((r) => setCondicoes(r.data))
      .catch(() => {});
  }, []);
  const set = (k: string) => (x: string) => setV((a) => ({ ...a, [k]: x }));
  const cond = condicoes.find((c) => String(c.id) === v.condicao_pagamento_id);
  const custo = Number(o.custo_total);

  // Preço ao vivo
  const preco = useMemo(() => {
    try {
      return formarPreco(custo, {
        custoFixo: v.perc_custo_fixo || 0,
        impostos: v.perc_impostos || 0,
        comissao: v.perc_comissao || 0,
        rt: v.perc_rt || 0,
        margem: v.perc_margem || 0,
        desconto: v.perc_desconto || 0,
        valorDescontoDigitado: v.valor_desconto || 0,
        ajustePagamento: cond?.perc_ajuste ?? 0,
      });
    } catch (x: any) {
      return { erro: x.message as string };
    }
  }, [v, custo, cond]);
  const mudou = Object.keys(v).some((k) => String(o[k] ?? '') !== v[k] && Number(o[k] ?? 0) !== Number(v[k] || 0));

  const gravar = async () => {
    setSalvando(true);
    try {
      aposEditar(await salvarPrecificacao(o.id, v), 'Preço gravado.');
    } catch (x: any) {
      onToast(x.message);
    } finally {
      setSalvando(false);
    }
  };

  const vals = 'erro' in preco ? null : preco.valores;
  const final = vals ? Number(vals.valorFinal) : 0;
  // Composição do preço final: custos por grupo + parcela de cada percentual + o que sobra (margem real)
  const despesas = PERC.slice(0, 4).map(([k, rotulo], i) => [rotulo, (final * Number(v[k] || 0)) / 100, ['#e11d48', '#f97316', '#eab308', '#ec4899'][i]] as [string, number, string]);
  const margemValor = final - custo - despesas.reduce((s, d) => s + d[1], 0);
  const fatias: [string, number, string][] = [
    ...GRUPOS.map(([k, r, cor]): [string, number, string] => [r, Number(o[k]), cor]),
    ...despesas,
    ['Margem', Math.max(0, margemValor), '#16a34a'] as [string, number, string],
  ].filter((f) => f[1] > 0);

  // Parcelas pela condição de pagamento (mesma conta do PDF)
  const parcelas = useMemo(() => (cond ? calcularParcelas(final, cond as unknown as CondicaoPagamento).map((p): [string, number] => [p.rotulo, p.valor]) : []), [cond, final]);

  const margem = vals?.margemRealPerc == null ? null : Number(vals.margemRealPerc);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {/* Custos */}
      <section>
        <h3 className="text-sm font-semibold mb-2">Custos {o.calculado_em ? <span className="font-normal text-stone-500">(cálculo de {new Date(String(o.calculado_em).replace(' ', 'T')).toLocaleString('pt-BR')})</span> : <span className="font-normal text-amber-600">(ainda não calculado)</span>}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {GRUPOS.map(([k, rotulo, cor]) => (
            <div key={k} className="rounded-lg border border-stone-200 dark:border-stone-800 p-2.5" style={{ borderTop: `3px solid ${cor}` }}>
              <div className="text-[10px] text-stone-500">{rotulo}</div>
              <div className="text-sm font-semibold">{BRL.format(Number(o[k]))}</div>
            </div>
          ))}
          <div className="rounded-lg border-2 border-stone-800 dark:border-stone-300 p-2.5">
            <div className="text-[10px] text-stone-500">Custo total</div>
            <div className="text-sm font-bold">{BRL.format(custo)}</div>
          </div>
        </div>
        {e.consumos.length > 0 && (
          <div className="mt-2 text-xs text-stone-500 flex flex-wrap gap-x-4">
            {e.consumos.map((c) => (
              <span key={c.id}>
                {c.descricao}: {Number(c.quantidade_cobrada).toLocaleString('pt-BR')} {c.unidade_sigla}
                {c.aproveitamento_perc != null ? ` (aproveitamento ${pct(Number(c.aproveitamento_perc))})` : ''}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Percentuais */}
        <fieldset disabled={!e.editavel} className="border-0 p-0 m-0 min-w-0 space-y-3">
          <h3 className="text-sm font-semibold">Formação de preço (markup divisor)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {PERC.map(([k, rotulo]) => (
              <div key={k} className={FIELD_CLASS}>
                <label className={LABEL_CLASS}>{rotulo} (%)</label>
                <NumberField value={v[k]} onChange={set(k)} scale={2} required className={`${INPUT_CLASS} w-full`} />
              </div>
            ))}
            <div className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>Desconto (%)</label>
              <NumberField value={v.perc_desconto} onChange={set('perc_desconto')} scale={2} className={`${INPUT_CLASS} w-full`} />
            </div>
            <div className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>Desconto (R$)</label>
              <NumberField value={v.valor_desconto} onChange={set('valor_desconto')} scale={2} disabled={Number(v.perc_desconto) > 0} className={`${INPUT_CLASS} w-full`} />
            </div>
            <div className={`${FIELD_CLASS} sm:col-span-2`}>
              <label className={LABEL_CLASS}>Condição de pagamento</label>
              <SelectBusca
                value={v.condicao_pagamento_id}
                options={condicoes.map((c) => ({ value: String(c.id), label: `${c.descricao}${Number(c.perc_ajuste) ? ` (${Number(c.perc_ajuste) > 0 ? '+' : ''}${pct(Number(c.perc_ajuste))})` : ''}` }))}
                onChange={set('condicao_pagamento_id')}
                vazioLabel="— Nenhuma —"
                className={`${INPUT_CLASS} w-full`}
              />
            </div>
          </div>
          <p className="text-[11px] text-stone-500">Desconto em R$ só vale com o percentual zerado. Os valores ao lado são refeitos enquanto você digita; grave para recalcular o orçamento.</p>
          {e.editavel && (
            <button type="button" onClick={gravar} disabled={salvando || !mudou || 'erro' in preco} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> Gravar preço
            </button>
          )}
        </fieldset>

        {/* Resultado */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Preço {mudou && <span className="font-normal text-amber-600">(simulação, ainda não gravado)</span>}</h3>
          {'erro' in preco ? (
            <p className="text-sm text-rose-600">{preco.erro}</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ['Venda calculada', preco.valores.valorVendaCalculado],
                    ['Desconto', preco.valores.valorDesconto.negated()],
                    ['Ajuste da condição de pagamento', preco.valores.valorAjustePagamento],
                  ].map(([r, x]) => (
                    <tr key={String(r)} className="border-b border-stone-100 dark:border-stone-800">
                      <td className="py-1 text-stone-500">{String(r)}</td>
                      <td className="py-1 text-right">{BRL.format(Number(x))}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1.5 font-bold">Valor final</td>
                    <td className="py-1.5 text-right text-lg font-bold">{BRL.format(final)}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-stone-500">RT do arquiteto</td>
                    <td className="py-1 text-right">{BRL.format(Number(preco.valores.valorRt))}</td>
                  </tr>
                  <tr>
                    <td className="py-1 text-stone-500">Margem real</td>
                    <td className={`py-1 text-right font-semibold ${margem === null ? '' : margem < 0 ? 'text-rose-600' : margem < 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {margem === null ? '—' : pct(margem)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {preco.alertas.margemNegativa ? (
                <p className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-400">
                  <AlertTriangle className="w-4 h-4" /> Margem negativa: o envio ao cliente exige a confirmação de um administrador.
                </p>
              ) : (
                preco.alertas.margemBaixa && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4" /> Margem abaixo de 10%.
                  </p>
                )
              )}
            </>
          )}

          {/* Composição do preço */}
          {final > 0 && (
            <div>
              <div className="flex h-5 rounded overflow-hidden" role="img" aria-label="Composição do preço">
                {fatias.map(([r, x, cor]) => (
                  <div key={r} title={`${r}: ${BRL.format(x)} (${pct((x / final) * 100)})`} style={{ width: `${(x / final) * 100}%`, background: cor }} />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-600 dark:text-stone-300">
                {fatias.map(([r, x, cor]) => (
                  <span key={r} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: cor }} />
                    {r} {pct((x / final) * 100)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {parcelas.length > 0 && (
            <div className="text-xs">
              <div className="font-semibold mb-1">{cond?.descricao}</div>
              {parcelas.map(([r, x]) => (
                <div key={r} className="flex justify-between max-w-xs">
                  <span className="text-stone-500">{r}</span>
                  <span>{BRL.format(x)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {e.moveis.length > 1 && (
        <section>
          <h3 className="text-sm font-semibold mb-1">Valor por móvel (rateio pelo custo, último cálculo)</h3>
          <table className="text-xs">
            <tbody>
              {e.moveis.map((m) => (
                <tr key={m.id}>
                  <td className="pr-6 py-0.5">
                    {m.descricao}
                    {Number(m.quantidade) > 1 ? ` (×${m.quantidade})` : ''}
                  </td>
                  <td className="py-0.5 text-right text-stone-500 pr-6">custo {BRL.format(Number(m.custo_total))}</td>
                  <td className="py-0.5 text-right font-semibold">{BRL.format(Number(m.valor_venda))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
};
