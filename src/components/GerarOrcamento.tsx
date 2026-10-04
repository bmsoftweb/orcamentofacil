import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchOptions, gerarOrcamento, resumoCalculo, DiffGeracao, LinhaDiff } from '../services/api';
import { OpcaoRef } from '../types';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../utils/formStyles';
import { ConfirmDialog } from './ConfirmDialog';
import { SelectBusca } from './SelectBusca';

const Lista: React.FC<{ titulo: string; cor: string; linhas: LinhaDiff[] }> = ({ titulo, cor, linhas }) =>
  linhas.length ? (
    <div>
      <div className={`text-xs font-semibold ${cor}`}>
        {titulo} ({linhas.length})
      </div>
      <ul className="text-[11px] text-stone-600 dark:text-stone-300 max-h-28 overflow-y-auto">
        {linhas.map((l, i) => (
          <li key={i} className="truncate" title={l.caminho}>
            {l.quantidade}× {l.descricao} — {l.medidas}
            {l.antes ? ` (antes ${l.antes})` : ''}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

/**
 * Gerar orçamento a partir da importação: escolhe o orçamento, mostra o que muda (peças adicionadas,
 * alteradas, removidas; as editadas à mão ficam como estão) e só grava ao confirmar.
 */
export const GerarOrcamento: React.FC<{
  importacaoId: number;
  orcamentoInicial: string;
  /** Ambientes do orçamento (os móveis novos entram no escolhido) */
  ambientes?: OpcaoRef[];
  onFechar: () => void;
  onGerado: (msg: string) => void;
}> = ({
  importacaoId,
  orcamentoInicial,
  ambientes,
  onFechar,
  onGerado,
}) => {
  const [orcamentos, setOrcamentos] = useState<OpcaoRef[]>([]);
  const [orcamento, setOrcamento] = useState(orcamentoInicial);
  const [ambiente, setAmbiente] = useState('');
  const [diff, setDiff] = useState<DiffGeracao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    fetchOptions('orcamentos', 'numero').then(setOrcamentos).catch(() => {});
  }, []);

  useEffect(() => {
    setDiff(null);
    setErro(null);
    if (!orcamento) return;
    setCarregando(true);
    gerarOrcamento(importacaoId, orcamento, false)
      .then(setDiff)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [orcamento, importacaoId]);

  return (
    <ConfirmDialog
      titulo="Gerar orçamento"
      mensagem="Cria os móveis, as peças (com as fitas padrão de cada tipo) e os itens de ferragem e insumo do modelo no orçamento escolhido."
      confirmar="Gerar orçamento"
      tom="normal"
      onConfirmar={async () => {
        if (!orcamento) throw new Error('Escolha o orçamento.');
        if (!diff) throw new Error(erro || 'Aguarde a conferência das diferenças.');
        const r = await gerarOrcamento(importacaoId, orcamento, true, ambiente);
        const c = r.calculo;
        onGerado(
          `Orçamento atualizado: ${r.adicionadas.length} peças novas, ${r.alteradas.length} alteradas, ${r.removidas.length} removidas. ` +
            (!c ? '' : 'erro' in c ? `Cálculo não rodou: ${c.erro}` : resumoCalculo(c)),
        );
      }}
      onCancelar={onFechar}
    >
      <div className="flex flex-col gap-3">
        <div className={FIELD_CLASS}>
          <label className={LABEL_CLASS}>Orçamento</label>
          <SelectBusca value={orcamento} options={orcamentos} onChange={setOrcamento} required vazioLabel="— Selecione —" className={`${INPUT_CLASS} w-full`} />
          <p className="text-[11px] text-stone-500">Só orçamentos em rascunho ou em revisão. Crie o orçamento no menu Orçamentos, se ainda não existir.</p>
        </div>
        {ambientes && ambientes.length > 0 && (
          <div className={FIELD_CLASS}>
            <label className={LABEL_CLASS}>Ambiente dos móveis novos</label>
            <SelectBusca value={ambiente} options={ambientes} onChange={setAmbiente} vazioLabel="— Sem ambiente —" className={`${INPUT_CLASS} w-full`} />
          </div>
        )}
        {carregando && (
          <div className="text-xs text-stone-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> Conferindo as diferenças…
          </div>
        )}
        {erro && <p className="text-xs text-rose-600 whitespace-pre-wrap max-h-40 overflow-y-auto">{erro}</p>}
        {diff && (
          <div className="space-y-2">
            <p className="text-xs text-stone-600 dark:text-stone-300">
              {diff.moveis} {diff.moveis === 1 ? 'móvel' : 'móveis'} · {diff.ferragens} ferragens · {diff.insumos} insumos · {diff.ignorados} ignorados
              {diff.desconhecidos > 0 && <b className="text-amber-600"> · {diff.desconhecidos} sem classificação ficam de fora</b>}
            </p>
            <Lista titulo="Peças adicionadas" cor="text-emerald-700 dark:text-emerald-400" linhas={diff.adicionadas} />
            <Lista titulo="Peças alteradas" cor="text-blue-700 dark:text-blue-400" linhas={diff.alteradas} />
            <Lista titulo="Peças removidas" cor="text-rose-700 dark:text-rose-400" linhas={diff.removidas} />
            <Lista titulo="Editadas à mão (não mudam)" cor="text-stone-500" linhas={diff.protegidas} />
            {!diff.adicionadas.length && !diff.alteradas.length && !diff.removidas.length && <p className="text-xs text-stone-500">Nenhuma peça muda; os itens de ferragem e insumo são refeitos.</p>}
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
};
