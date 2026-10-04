import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { fetchPainel, Painel as DadosPainel } from '../services/api';
import { formatDateBR } from '../utils/formatters';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const ORDEM = ['RASCUNHO', 'EM_REVISAO', 'ENVIADO', 'APROVADO', 'EM_PRODUCAO', 'REPROVADO', 'EXPIRADO', 'CANCELADO'];
const ROTULO: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  EM_REVISAO: 'Em revisão',
  ENVIADO: 'Enviado',
  APROVADO: 'Aprovado',
  EM_PRODUCAO: 'Em produção',
  REPROVADO: 'Reprovado',
  EXPIRADO: 'Expirado',
  CANCELADO: 'Cancelado',
};

const Indicador: React.FC<{ titulo: string; valor: string; detalhe?: string }> = ({ titulo, valor, detalhe }) => (
  <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
    <div className="text-xs text-stone-500 dark:text-stone-400">{titulo}</div>
    <div className="text-2xl font-bold mt-1 text-stone-900 dark:text-stone-100">{valor}</div>
    {detalhe && <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{detalhe}</div>}
  </div>
);

/** Painel: indicadores dos orçamentos (só a revisão mais recente de cada número) */
export const Painel: React.FC<{ refreshToken: number; onAbrirOrcamento: (id: number) => void }> = ({ refreshToken, onAbrirOrcamento }) => {
  const [d, setD] = useState<DadosPainel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    fetchPainel().then(setD).catch((e) => setErro(e.message));
  }, [refreshToken]);

  if (erro) return <p className="text-sm text-rose-600">{erro}</p>;
  if (!d) {
    return (
      <div className="py-24 text-center text-sm text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando os indicadores…
      </div>
    );
  }

  const status = ORDEM.map((s) => d.porStatus.find((x) => x.status === s) ?? { status: s, quantidade: 0, valor: '0' });
  const maior = Math.max(1, ...status.map((s) => Number(s.quantidade)));
  const decididos = Number(d.conversao.decididos);
  const conversao = decididos ? (Number(d.conversao.aprovados) / decididos) * 100 : null;
  const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Indicador titulo="Valor em aberto" valor={BRL.format(Number(d.aberto.valor))} detalhe={`${d.aberto.quantidade} orçamentos em rascunho, revisão ou enviados`} />
        <Indicador titulo={`Aprovado em ${mesAtual}`} valor={BRL.format(Number(d.mes.valor))} detalhe={`${d.mes.aprovados} orçamentos`} />
        <Indicador
          titulo="Taxa de conversão do mês"
          valor={conversao === null ? '—' : `${conversao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
          detalhe={decididos ? `${d.conversao.aprovados} aprovados de ${decididos} decididos (aprovados, reprovados e expirados)` : 'Nenhum orçamento decidido no mês'}
        />
        <Indicador titulo="Ticket médio do mês" valor={d.mes.ticket ? BRL.format(Number(d.mes.ticket)) : '—'} detalhe="Média dos aprovados no mês" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <h3 className="text-sm font-semibold mb-3">Orçamentos por status</h3>
          <div className="space-y-2" role="table" aria-label="Orçamentos por status">
            {status.map((s) => (
              <div key={s.status} role="row" className="grid grid-cols-[100px_1fr_150px] items-center gap-3 text-xs" title={`${ROTULO[s.status]}: ${s.quantidade} orçamentos · ${BRL.format(Number(s.valor))}`}>
                <span role="cell" className="text-stone-600 dark:text-stone-300">{ROTULO[s.status]}</span>
                <span role="cell" className="h-4 flex items-center">
                  {Number(s.quantidade) > 0 && <span className="h-3 rounded-r bg-blue-500" style={{ width: `${(Number(s.quantidade) / maior) * 100}%`, minWidth: 4 }} />}
                </span>
                <span role="cell" className="text-right text-stone-700 dark:text-stone-200">
                  <b>{s.quantidade}</b> · {BRL.format(Number(s.valor))}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            {d.vencendo.length > 0 && <AlertTriangle className="w-4 h-4 text-amber-500" />} Vencendo nos próximos 3 dias
          </h3>
          {!d.vencendo.length ? (
            <p className="text-xs text-stone-500">Nenhum orçamento em aberto vence nos próximos 3 dias.</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {d.vencendo.map((o) => (
                  <tr key={o.id} onClick={() => onAbrirOrcamento(o.id)} className="border-t border-stone-100 dark:border-stone-800 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="py-1.5 pr-2 font-semibold whitespace-nowrap">
                      {o.numero}
                      {o.revisao ? ` rev. ${o.revisao}` : ''}
                    </td>
                    <td className="py-1.5 px-2">
                      {o.cliente_nome}
                      <div className="text-stone-500">{o.titulo}</div>
                    </td>
                    <td className="py-1.5 px-2 text-stone-500">{ROTULO[o.status]}</td>
                    <td className="py-1.5 px-2 text-center whitespace-nowrap">{formatDateBR(o.data_validade)}</td>
                    <td className="py-1.5 pl-2 text-right whitespace-nowrap">{BRL.format(Number(o.valor_final))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4">
        <h3 className="text-sm font-semibold mb-3">Ranking de arquitetos em {new Date().getFullYear()} (aprovados)</h3>
        {!d.ranking.length ? (
          <p className="text-xs text-stone-500">Nenhum orçamento aprovado com arquiteto neste ano.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="py-1.5 pr-2 font-semibold w-8">#</th>
                <th className="py-1.5 px-2 font-semibold">Arquiteto</th>
                <th className="py-1.5 px-2 font-semibold text-right">Aprovados</th>
                <th className="py-1.5 px-2 font-semibold text-right">Valor aprovado</th>
                <th className="py-1.5 pl-2 font-semibold text-right">RT</th>
              </tr>
            </thead>
            <tbody>
              {d.ranking.map((a, i) => (
                <tr key={a.id} className="border-t border-stone-100 dark:border-stone-800">
                  <td className="py-1.5 pr-2 text-stone-500">{i + 1}</td>
                  <td className="py-1.5 px-2">
                    {a.nome}
                    {a.escritorio && <span className="text-stone-500"> · {a.escritorio}</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right">{a.aprovados}</td>
                  <td className="py-1.5 px-2 text-right">{BRL.format(Number(a.valor))}</td>
                  <td className="py-1.5 pl-2 text-right">{BRL.format(Number(a.rt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};
