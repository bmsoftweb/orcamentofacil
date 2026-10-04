import React, { useState } from 'react';
import { Calculator, LayoutGrid, RefreshCcw } from 'lucide-react';
import { RegistroCrud } from '../types';
import { calcularOrcamentoApi, resumoCalculo } from '../services/api';
import { BotaoAcao } from './MenuAcoes';
import { ConfirmDialog } from './ConfirmDialog';
import { PlanoCorteView } from './PlanoCorteView';

/**
 * Ações do orçamento na lista: plano de corte (sempre) e, em rascunho/revisão, recalcular e
 * atualizar os preços pelo catálogo.
 */
export const AcoesOrcamento: React.FC<{ registro: RegistroCrud; onFeito: () => void; onToast: (m: string) => void }> = ({ registro, onFeito, onToast }) => {
  const [carregando, setCarregando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [verPlano, setVerPlano] = useState(false);
  const editavel = ['RASCUNHO', 'EM_REVISAO'].includes(String(registro.status));

  const calcular = async (atualizarPrecos: boolean) => {
    setCarregando(true);
    try {
      const r = await calcularOrcamentoApi(registro.id as number, atualizarPrecos);
      onToast(`${registro.numero}: ${resumoCalculo(r)}`);
      onFeito();
    } catch (e: any) {
      onToast(e.message);
    } finally {
      setCarregando(false);
    }
  };

  return (
    <>
      <BotaoAcao icone={LayoutGrid} titulo="Plano de corte" descricao="Desenho das chapas com as peças e as sobras" onClick={() => setVerPlano(true)} />
      {verPlano && <PlanoCorteView orcamentoId={registro.id as number} onFechar={() => setVerPlano(false)} />}
      {editavel && (
        <>
          <BotaoAcao icone={Calculator} titulo="Calcular" descricao="Recalcula custos, plano de corte e preço com os preços já gravados no orçamento" carregando={carregando} onClick={() => calcular(false)} />
          <BotaoAcao icone={RefreshCcw} titulo="Atualizar preços do catálogo" descricao="Lê de novo os preços do catálogo e recalcula" onClick={() => setAtualizando(true)} />
        </>
      )}
      {atualizando && (
        <ConfirmDialog
          titulo="Atualizar preços do catálogo"
          mensagem={`Os preços de chapas, fitas, ferragens, insumos e serviços de ${registro.numero} passam a ser os do catálogo atual (os itens editados à mão ficam como estão). Continuar?`}
          confirmar="Atualizar e calcular"
          tom="normal"
          onConfirmar={async () => {
            setAtualizando(false);
            await calcular(true);
          }}
          onCancelar={() => setAtualizando(false)}
        />
      )}
    </>
  );
};
