import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { RegistroCrud } from '../../types';
import { fetchHistoricoOrcamento } from '../../services/api';
import { STATUS_COLORS, formatDateBR, formatDateTimeBR } from '../../utils/formatters';
import { BRL, PropsAba, ROTULO_STATUS } from './OrcamentoView';

/** Histórico: mudanças de status e as revisões do mesmo número (clique abre a revisão) */
export const AbaHistorico: React.FC<PropsAba & { abrir: (id: number) => void }> = ({ e, abrir }) => {
  const [h, setH] = useState<{ status: RegistroCrud[]; revisoes: RegistroCrud[] } | null>(null);
  useEffect(() => {
    fetchHistoricoOrcamento(e.orcamento.id).then(setH).catch(() => setH({ status: [], revisoes: [] }));
  }, [e.orcamento.id, e.orcamento.status]);
  if (!h) return <Loader2 className="w-4 h-4 animate-spin m-6 text-stone-400" />;
  const selo = (s: string | null) =>
    s ? <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[s] ?? ''}`}>{ROTULO_STATUS[s] ?? s}</span> : <span className="text-stone-400">—</span>;
  return (
    <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-2 gap-8">
      <section>
        <h3 className="text-sm font-semibold mb-2">Status</h3>
        <ol className="space-y-2 text-xs">
          {h.status.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 border-l-2 border-stone-200 dark:border-stone-700 pl-3">
              <span className="text-stone-500 w-32">{formatDateTimeBR(s.created_at)}</span>
              {selo(s.status_anterior)} → {selo(s.status_novo)}
              <span className="text-stone-500">{s.usuario_nome ?? 'sistema'}</span>
              {s.observacao && <span className="w-full text-stone-600 dark:text-stone-300">{s.observacao}</span>}
            </li>
          ))}
          {!h.status.length && <li className="text-stone-500">Sem registros.</li>}
        </ol>
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">Revisões de {e.orcamento.numero}</h3>
        <table className="text-xs w-full">
          <tbody>
            {h.revisoes.map((r) => (
              <tr
                key={r.id}
                onClick={() => r.id !== e.orcamento.id && abrir(r.id)}
                className={`border-t border-stone-100 dark:border-stone-800 ${r.id === e.orcamento.id ? 'font-semibold bg-blue-50/60 dark:bg-blue-950/20' : 'cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50'}`}
              >
                <td className="py-1.5 px-2">Rev. {r.revisao}</td>
                <td className="py-1.5 px-2">{selo(r.status)}</td>
                <td className="py-1.5 px-2 text-center">{formatDateBR(r.data_emissao)}</td>
                <td className="py-1.5 px-2 text-right">{BRL.format(Number(r.valor_final))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};
