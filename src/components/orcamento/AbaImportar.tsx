import React, { useState } from 'react';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import { editarOrcamento } from '../../services/api';
import { STATUS_COLORS, formatDateTimeBR } from '../../utils/formatters';
import { INPUT_CLASS } from '../../utils/formStyles';
import { BotaoImportarDae } from '../BotaoImportarDae';
import { GerarOrcamento } from '../GerarOrcamento';
import { ConfirmDialog } from '../ConfirmDialog';
import { PropsAba } from './OrcamentoView';

/**
 * Importar .dae: ambientes do orçamento (um .dae por ambiente ou um para tudo), envio do arquivo já
 * ligado ao orçamento e "Gerar" de cada importação (os móveis novos entram no ambiente escolhido).
 */
export const AbaImportar: React.FC<PropsAba & { irParaRevisao: () => void }> = ({ e, recarregar, onToast, aposEditar, irParaRevisao }) => {
  const [novoAmbiente, setNovoAmbiente] = useState('');
  const [gerando, setGerando] = useState<number | null>(null);
  const [excluindo, setExcluindo] = useState<{ id: number; nome: string } | null>(null);
  const id = Number(e.orcamento.id);
  const ambientes = e.ambientes.map((a) => ({ value: String(a.id), label: a.nome }));

  const incluirAmbiente = async () => {
    if (!novoAmbiente.trim()) return;
    try {
      await editarOrcamento(id, 'ambientes', null, { nome: novoAmbiente });
      setNovoAmbiente('');
      recarregar();
    } catch (x: any) {
      onToast(x.message);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-2">Ambientes</h3>
        <div className="flex flex-wrap items-center gap-2">
          {e.ambientes.map((a) => (
            <span key={a.id} className="flex items-center gap-1 pl-3 pr-1 py-1 rounded-full border border-stone-300 dark:border-stone-700 text-xs">
              {a.nome}
              <span className="text-stone-400">({e.moveis.filter((m) => m.ambiente_id === a.id).length})</span>
              {e.editavel && (
                <button type="button" onClick={() => setExcluindo({ id: a.id, nome: a.nome })} title="Excluir o ambiente" className="p-0.5 rounded-full text-stone-400 hover:text-rose-600 cursor-pointer">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
          {!e.ambientes.length && <span className="text-xs text-stone-500">Nenhum ambiente: os móveis ficam juntos.</span>}
          {e.editavel && (
            <span className="flex items-center gap-1">
              <input
                value={novoAmbiente}
                onChange={(x) => setNovoAmbiente(x.target.value)}
                onKeyDown={(x) => x.key === 'Enter' && incluirAmbiente()}
                placeholder="Cozinha, Dormitório casal…"
                maxLength={80}
                className={`${INPUT_CLASS} w-56`}
              />
              <button type="button" onClick={incluirAmbiente} title="Incluir ambiente" className="p-2 rounded-lg border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="text-sm font-semibold">Arquivos .dae deste orçamento</h3>
          {e.editavel && <BotaoImportarDae orcamentoId={id} onImportado={recarregar} onToast={onToast} />}
        </div>
        {!e.importacoes.length ? (
          <p className="text-xs text-stone-500">Nenhum arquivo importado. Os mapeamentos do arquiteto do orçamento valem antes dos globais.</p>
        ) : (
          <table className="w-full text-xs max-w-4xl">
            <thead className="text-left text-stone-500">
              <tr>
                <th className="py-1.5 pr-2 font-semibold">Arquivo</th>
                <th className="py-1.5 px-2 font-semibold">Situação</th>
                <th className="py-1.5 px-2 font-semibold text-right">Peças</th>
                <th className="py-1.5 px-2 font-semibold text-right">A classificar</th>
                <th className="py-1.5 px-2 font-semibold text-center">Importado em</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {e.importacoes.map((i) => (
                <tr key={i.id} className="border-t border-stone-100 dark:border-stone-800">
                  <td className="py-1.5 pr-2">{i.arquivo_nome}</td>
                  <td className="py-1.5 px-2">
                    <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[i.status] ?? ''}`}>{i.status}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right">{i.total_pecas}</td>
                  <td className={`py-1.5 px-2 text-right ${Number(i.total_desconhecidos) ? 'text-amber-600 font-semibold' : ''}`}>{i.total_desconhecidos}</td>
                  <td className="py-1.5 px-2 text-center">{formatDateTimeBR(i.created_at)}</td>
                  <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                    <button type="button" onClick={irParaRevisao} className="inline-flex items-center gap-1 px-2 py-1 rounded text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800 cursor-pointer">
                      <Search className="w-3.5 h-3.5" /> Revisar
                    </button>
                    {e.editavel && i.status !== 'ERRO' && (
                      <button type="button" onClick={() => setGerando(i.id)} className="inline-flex items-center gap-1 px-2 py-1 rounded text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40 cursor-pointer">
                        <FileText className="w-3.5 h-3.5" /> Gerar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {gerando && (
        <GerarOrcamento
          importacaoId={gerando}
          orcamentoInicial={String(id)}
          ambientes={ambientes}
          onFechar={() => setGerando(null)}
          onGerado={(msg) => {
            setGerando(null);
            aposEditar({}, msg);
          }}
        />
      )}
      {excluindo && (
        <ConfirmDialog
          titulo="Excluir ambiente"
          mensagem={`Excluir o ambiente "${excluindo.nome}"? Os móveis dele continuam no orçamento, sem ambiente.`}
          onConfirmar={async () => {
            await editarOrcamento(id, 'ambientes', excluindo.id, undefined, true);
            setExcluindo(null);
            recarregar();
          }}
          onCancelar={() => setExcluindo(null)}
        />
      )}
    </div>
  );
};
