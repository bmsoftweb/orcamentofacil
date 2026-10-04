import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { RegistroCrud, ResourceDef } from '../types';
import { fetchConfiguracoes, salvarConfiguracoes } from '../services/api';
import { RecordForm } from './RecordForm';
import { AvisoErro } from './AvisoErro';

/**
 * Configurações: a linha única da tabela configuracoes (id = 1), no formulário genérico,
 * separada em seções (Empresa, Formação de preço, Produção, Importação .dae, Orçamento).
 */
export const ConfiguracoesView: React.FC<{ resource: ResourceDef | undefined; onToast: (msg: string) => void }> = ({ resource, onToast }) => {
  const [registro, setRegistro] = useState<RegistroCrud | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    setRegistro(null);
    fetchConfiguracoes()
      .then((r) => vivo && setRegistro(r))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [versao]);

  if (erro) return <AvisoErro mensagem={erro} onFechar={() => setErro(null)} className="m-4" />;
  if (!resource || !registro) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando…
      </div>
    );
  }

  return (
    <RecordForm
      resource={resource}
      record={registro}
      refOptions={{}}
      onCancel={() => setVersao((v) => v + 1)}
      onSave={async (payload) => {
        await salvarConfiguracoes(payload);
        onToast('Configurações gravadas.');
        setVersao((v) => v + 1);
      }}
    />
  );
};
