import React, { useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { importarDae } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';

/** Envia um .dae; se o mesmo arquivo já foi importado, pergunta antes de importar de novo */
export const BotaoImportarDae: React.FC<{ onImportado: () => void; onToast: (m: string) => void; orcamentoId?: number }> = ({ onImportado, onToast, orcamentoId }) => {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [repetido, setRepetido] = useState<{ arquivo: File; id: number; quando: string } | null>(null);

  const enviar = async (arquivo: File, forcar = false) => {
    setEnviando(true);
    try {
      const r = await importarDae(arquivo, forcar, orcamentoId);
      if ('duplicado' in r) return setRepetido({ arquivo, id: r.duplicado.id, quando: String(r.duplicado.created_at) });
      onToast(r.erro ? `Importação nº ${r.id} com erro: ${r.erro}` : `Importação nº ${r.id}: ${r.objetos} objetos${r.avisos ? `, ${r.avisos} avisos` : ''}.`);
      onImportado();
    } catch (e: any) {
      onToast(e.message || 'Falha ao importar o arquivo.');
    } finally {
      setEnviando(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={enviando}
        onClick={() => input.current?.click()}
        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer shrink-0 whitespace-nowrap disabled:opacity-60"
      >
        {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {enviando ? 'Importando…' : 'Importar .dae'}
      </button>
      <input ref={input} type="file" accept=".dae" className="hidden" onChange={(e) => e.target.files?.[0] && enviar(e.target.files[0])} />
      {repetido && (
        <ConfirmDialog
          titulo="Arquivo já importado"
          mensagem={`"${repetido.arquivo.name}" já foi importado (importação nº ${repetido.id}). Importar de novo?`}
          confirmar="Reimportar"
          tom="normal"
          onConfirmar={async () => {
            const a = repetido.arquivo;
            setRepetido(null);
            await enviar(a, true);
          }}
          onCancelar={() => setRepetido(null)}
        />
      )}
    </>
  );
};
