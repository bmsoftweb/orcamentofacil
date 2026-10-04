import React, { useState } from 'react';
import { ImportacaoView } from '../ImportacaoView';
import { PropsAba } from './OrcamentoView';

/** Revisão da importação dentro do orçamento (a mais recente; escolhe outra quando houver várias) */
export const AbaRevisao: React.FC<PropsAba> = ({ e, onToast, recarregar }) => {
  const [escolhida, setEscolhida] = useState<number | null>(e.importacoes[0]?.id ?? null);
  const imp = e.importacoes.find((i) => i.id === escolhida);
  if (!e.importacoes.length) return <p className="p-6 text-sm text-stone-500">Nenhum .dae importado neste orçamento: use a aba "Importar .dae".</p>;
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {e.importacoes.length > 1 && (
        <div className="px-4 py-2 border-b border-stone-200 dark:border-stone-800 flex flex-wrap gap-2">
          {e.importacoes.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setEscolhida(i.id)}
              className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${i.id === escolhida ? 'bg-blue-600 text-white border-blue-600' : 'border-stone-300 dark:border-stone-700'}`}
            >
              {i.arquivo_nome} (nº {i.id})
            </button>
          ))}
        </div>
      )}
      {imp && (
        <ImportacaoView
          key={imp.id}
          registro={imp}
          onFechar={() => setEscolhida(null)}
          onToast={(m) => {
            onToast(m);
            recarregar();
          }}
        />
      )}
    </div>
  );
};
