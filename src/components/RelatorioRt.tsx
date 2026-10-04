import React, { useEffect, useState } from 'react';
import { FileDown, Loader2, Search } from 'lucide-react';
import { OpcaoRef, RegistroCrud } from '../types';
import { baixarRelatorioRt, fetchOptions, fetchRelatorioRt, FiltroRt } from '../services/api';
import { formatDateBR } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../utils/formStyles';
import { DateField } from './DateField';
import { SelectBusca } from './SelectBusca';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/** Relatório de RT por arquiteto e período (orçamentos aprovados), na tela e em PDF */
export const RelatorioRt: React.FC<{ onToast: (m: string) => void }> = ({ onToast }) => {
  const [f, setF] = useState<FiltroRt>(() => ({ inicio: `${hoje().slice(0, 8)}01`, fim: hoje(), arquiteto_id: '' }));
  const [arquitetos, setArquitetos] = useState<OpcaoRef[]>([]);
  const [linhas, setLinhas] = useState<RegistroCrud[] | null>(null);
  const [ocupado, setOcupado] = useState<'ver' | 'pdf' | null>(null);
  useEffect(() => {
    fetchOptions('arquitetos', 'nome').then(setArquitetos).catch(() => {});
  }, []);

  const executar = async (como: 'ver' | 'pdf') => {
    setOcupado(como);
    try {
      if (como === 'ver') setLinhas(await fetchRelatorioRt(f));
      else await baixarRelatorioRt(f);
    } catch (e: any) {
      onToast(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const grupos = [...new Set((linhas ?? []).map((l) => l.arquiteto_id))].map((id) => (linhas ?? []).filter((l) => l.arquiteto_id === id));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className={`${FIELD_CLASS} w-40`}>
          <label className={LABEL_CLASS}>Aprovados de</label>
          <DateField value={f.inicio} onChange={(v) => setF({ ...f, inicio: v })} required className={`${INPUT_CLASS} w-full`} />
        </div>
        <div className={`${FIELD_CLASS} w-40`}>
          <label className={LABEL_CLASS}>até</label>
          <DateField value={f.fim} onChange={(v) => setF({ ...f, fim: v })} required className={`${INPUT_CLASS} w-full`} />
        </div>
        <div className={`${FIELD_CLASS} w-64`}>
          <label className={LABEL_CLASS}>Arquiteto</label>
          <SelectBusca value={f.arquiteto_id ?? ''} options={arquitetos} onChange={(v) => setF({ ...f, arquiteto_id: v })} vazioLabel="— Todos —" className={`${INPUT_CLASS} w-full`} />
        </div>
        <button type="button" onClick={() => executar('ver')} disabled={Boolean(ocupado)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60">
          {ocupado === 'ver' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Ver
        </button>
        <button type="button" onClick={() => executar('pdf')} disabled={Boolean(ocupado)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-60">
          {ocupado === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Baixar PDF
        </button>
      </div>

      {linhas && !linhas.length && <p className="text-sm text-stone-500">Nenhum orçamento aprovado com arquiteto no período.</p>}
      {grupos.map((l) => (
        <section key={l[0].arquiteto_id} className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <h3 className="text-sm font-semibold mb-2">
            {l[0].arquiteto_nome}
            {l[0].escritorio && <span className="font-normal text-stone-500"> · {l[0].escritorio}</span>}
            {l[0].chave_pix && <span className="font-normal text-stone-500 text-xs"> · Pix {l[0].chave_pix}</span>}
          </h3>
          <table className="w-full text-xs">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="py-1.5 pr-2 font-semibold">Orçamento</th>
                <th className="py-1.5 px-2 font-semibold">Cliente</th>
                <th className="py-1.5 px-2 font-semibold text-center">Aprovado em</th>
                <th className="py-1.5 px-2 font-semibold text-right">Valor final</th>
                <th className="py-1.5 px-2 font-semibold text-right">RT %</th>
                <th className="py-1.5 pl-2 font-semibold text-right">RT</th>
              </tr>
            </thead>
            <tbody>
              {l.map((x) => (
                <tr key={x.id} className="border-t border-stone-100 dark:border-stone-800">
                  <td className="py-1.5 pr-2">
                    {x.numero}
                    {x.revisao ? ` rev. ${x.revisao}` : ''} <span className="text-stone-500">· {x.titulo}</span>
                  </td>
                  <td className="py-1.5 px-2">{x.cliente_nome}</td>
                  <td className="py-1.5 px-2 text-center">{formatDateBR(x.data_aprovacao)}</td>
                  <td className="py-1.5 px-2 text-right">{BRL.format(Number(x.valor_final))}</td>
                  <td className="py-1.5 px-2 text-right">{Number(x.perc_rt).toLocaleString('pt-BR')}%</td>
                  <td className="py-1.5 pl-2 text-right font-semibold">{BRL.format(Number(x.valor_rt))}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-stone-300 dark:border-stone-700 font-semibold">
                <td className="py-1.5 pr-2" colSpan={3}>Total</td>
                <td className="py-1.5 px-2 text-right">{BRL.format(l.reduce((s, x) => s + Number(x.valor_final), 0))}</td>
                <td />
                <td className="py-1.5 pl-2 text-right">{BRL.format(l.reduce((s, x) => s + Number(x.valor_rt), 0))}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
};
