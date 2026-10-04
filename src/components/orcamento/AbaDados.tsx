import React, { useEffect, useState } from 'react';
import { OpcaoRef, ResourceDef } from '../../types';
import { calcularOrcamentoApi, fetchOptions, updateRecord } from '../../services/api';
import { RecordForm } from '../RecordForm';
import { PropsAba } from './OrcamentoView';

/** Dados gerais: o formulário do cadastro de orçamentos; fora de rascunho/revisão fica só leitura */
export const AbaDados: React.FC<PropsAba & { resource: ResourceDef | undefined }> = ({ e, resource, recarregar, aposEditar }) => {
  const [opcoes, setOpcoes] = useState<Record<string, OpcaoRef[]> | null>(null);
  useEffect(() => {
    if (!resource) return;
    const refs = resource.fields.filter((f) => f.ref);
    Promise.all(refs.map((f) => fetchOptions(f.ref!.resource, f.ref!.labelField, f.refFiltro).catch(() => [])))
      .then((l) => setOpcoes(Object.fromEntries(refs.map((f, i) => [f.name, l[i]]))));
  }, [resource]);

  if (!resource || !opcoes) return null;
  return (
    <fieldset disabled={!e.editavel} className="flex-1 min-h-0 flex flex-col border-0 p-0 m-0">
      <RecordForm
        resource={resource}
        record={e.orcamento}
        refOptions={opcoes}
        onCancel={recarregar}
        onSave={async (payload) => {
          await updateRecord('orcamentos', e.orcamento.id, payload);
          // Critério das chapas e modo das ferragens mudam o custo: recalcula
          aposEditar({ calculo: await calcularOrcamentoApi(e.orcamento.id).catch((x) => ({ erro: x.message })) }, 'Dados gravados.');
        }}
      />
    </fieldset>
  );
};
