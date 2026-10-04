import React, { useRef, useState } from 'react';
import { Download, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { RegistroCrud } from '../../types';
import { baixarAnexo, enviarAnexo, excluirAnexo } from '../../services/api';
import { formatDateTimeBR } from '../../utils/formatters';
import { ConfirmDialog } from '../ConfirmDialog';
import { PropsAba } from './OrcamentoView';

const tamanho = (b: number) => (b > 1e6 ? `${(b / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

/** Anexos do orçamento (projeto .skp/.dae, PDF, imagens, planilhas): em qualquer status */
export const AbaAnexos: React.FC<PropsAba> = ({ e, recarregar, onToast }) => {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [excluir, setExcluir] = useState<RegistroCrud | null>(null);
  const id = Number(e.orcamento.id);

  const enviar = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    setEnviando(true);
    try {
      for (const a of Array.from(arquivos)) await enviarAnexo(id, a);
      onToast(`${arquivos.length} ${arquivos.length === 1 ? 'anexo enviado' : 'anexos enviados'}.`);
      recarregar();
    } catch (x: any) {
      onToast(x.message);
    } finally {
      setEnviando(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      <button type="button" onClick={() => input.current?.click()} disabled={enviando} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60">
        {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />} Anexar arquivos
      </button>
      <input ref={input} type="file" multiple className="hidden" onChange={(x) => enviar(x.target.files)} />
      {!e.anexos.length ? (
        <p className="text-sm text-stone-500">Sem anexos.</p>
      ) : (
        <table className="w-full text-xs max-w-4xl">
          <thead className="text-left text-stone-500">
            <tr>
              <th className="py-1.5 pr-2 font-semibold">Arquivo</th>
              <th className="py-1.5 px-2 font-semibold">Tipo</th>
              <th className="py-1.5 px-2 font-semibold text-right">Tamanho</th>
              <th className="py-1.5 px-2 font-semibold">Enviado por</th>
              <th className="py-1.5 px-2 font-semibold text-center">Em</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {e.anexos.map((a) => (
              <tr key={a.id} className="border-t border-stone-100 dark:border-stone-800">
                <td className="py-1.5 pr-2">{a.nome_original}</td>
                <td className="py-1.5 px-2 text-stone-500">{a.tipo}</td>
                <td className="py-1.5 px-2 text-right">{a.tamanho_bytes ? tamanho(Number(a.tamanho_bytes)) : ''}</td>
                <td className="py-1.5 px-2">{a.usuario_nome}</td>
                <td className="py-1.5 px-2 text-center">{formatDateTimeBR(a.created_at)}</td>
                <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                  <button type="button" onClick={() => baixarAnexo(id, { id: a.id, nome_original: a.nome_original, arquivo_path: a.arquivo_path }).catch((x) => onToast(x.message))} title="Baixar" className="p-1 rounded text-stone-400 hover:text-blue-600 cursor-pointer">
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => setExcluir(a)} title="Excluir o anexo" className="p-1 rounded text-stone-400 hover:text-rose-600 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {excluir && (
        <ConfirmDialog
          titulo="Excluir anexo"
          mensagem={`Excluir "${excluir.nome_original}"?`}
          onConfirmar={async () => {
            await excluirAnexo(id, excluir.id);
            setExcluir(null);
            recarregar();
          }}
          onCancelar={() => setExcluir(null)}
        />
      )}
    </div>
  );
};
