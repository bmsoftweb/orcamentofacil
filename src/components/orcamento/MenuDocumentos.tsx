import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileDown, FileSpreadsheet, FileText, LayoutGrid, Loader2, Receipt, Scissors } from 'lucide-react';
import { baixarDocumento, baixarListaCorteCsv } from '../../services/api';

type Opcao = { rotulo: string; descricao: string; icone: React.ElementType; baixar: () => Promise<unknown> };

/** Documentos do orçamento: PDFs (cliente, interno, lista e plano de corte) e a lista de corte em CSV */
export const MenuDocumentos: React.FC<{ orcamentoId: number; onToast: (m: string) => void }> = ({ orcamentoId, onToast }) => {
  const [aberto, setAberto] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const opcoes: Opcao[] = [
    { rotulo: 'Orçamento para o cliente', descricao: 'PDF sem custos internos, com o valor total', icone: FileText, baixar: () => baixarDocumento(orcamentoId, 'cliente') },
    { rotulo: 'Orçamento com valor por móvel', descricao: 'PDF para o cliente, com o valor de cada móvel', icone: Receipt, baixar: () => baixarDocumento(orcamentoId, 'cliente', true) },
    { rotulo: 'Relatório interno', descricao: 'Custos, consumos, itens, formação de preço e margem', icone: FileDown, baixar: () => baixarDocumento(orcamentoId, 'interno') },
    { rotulo: 'Lista de corte (PDF)', descricao: 'Peças por chapa e por móvel', icone: Scissors, baixar: () => baixarDocumento(orcamentoId, 'lista-corte') },
    { rotulo: 'Lista de corte (CSV)', descricao: 'Para importar no otimizador (separador ";")', icone: FileSpreadsheet, baixar: () => baixarListaCorteCsv(orcamentoId) },
    { rotulo: 'Plano de corte (PDF)', descricao: 'Desenho de cada chapa, em paisagem', icone: LayoutGrid, baixar: () => baixarDocumento(orcamentoId, 'plano-corte') },
  ];

  const baixar = async (o: Opcao) => {
    setAberto(false);
    setBaixando(o.rotulo);
    try {
      await o.baixar();
    } catch (e: any) {
      onToast(e.message);
    } finally {
      setBaixando(null);
    }
  };

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        disabled={Boolean(baixando)}
        title={baixando ? `Gerando: ${baixando}` : 'PDFs e exportações do orçamento'}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-60"
      >
        {baixando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} Documentos <ChevronDown className="w-3 h-3" />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-[60] min-w-64 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl">
          {opcoes.map((o) => (
            <button key={o.rotulo} role="menuitem" type="button" onClick={() => baixar(o)} title={o.descricao} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
              <o.icone className="w-4 h-4 shrink-0 text-stone-500" />
              <span className="text-xs font-medium whitespace-nowrap">{o.rotulo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
