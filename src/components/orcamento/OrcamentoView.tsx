import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Copy, Loader2, X } from 'lucide-react';
import { EstruturaOrcamento, RespostaEdicao, criarRevisao, fetchEstrutura, mudarStatusOrcamento, resumoCalculo } from '../../services/api';
import { RegistroCrud, ResourceDef, Usuario } from '../../types';
import { STATUS_COLORS } from '../../utils/formatters';
import { ConfirmDialog } from '../ConfirmDialog';
import { Toggle } from '../Toggle';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../../utils/formStyles';
import { AbaDados } from './AbaDados';
import { AbaImportar } from './AbaImportar';
import { AbaRevisao } from './AbaRevisao';
import { AbaPecas } from './AbaPecas';
import { AbaItens } from './AbaItens';
import { AbaResumo } from './AbaResumo';
import { AbaAnexos } from './AbaAnexos';
import { AbaHistorico } from './AbaHistorico';
import { PlanoCorteView } from '../PlanoCorteView';
import { MenuDocumentos } from './MenuDocumentos';

export const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  EM_REVISAO: 'Em revisão',
  ENVIADO: 'Enviado',
  APROVADO: 'Aprovado',
  REPROVADO: 'Reprovado',
  CANCELADO: 'Cancelado',
  EXPIRADO: 'Expirado',
  EM_PRODUCAO: 'Em produção',
};
const ACAO_STATUS: Record<string, string> = {
  EM_REVISAO: 'Enviar para revisão',
  RASCUNHO: 'Voltar para rascunho',
  ENVIADO: 'Marcar como enviado',
  APROVADO: 'Aprovar',
  REPROVADO: 'Reprovar',
  EXPIRADO: 'Marcar como expirado',
  EM_PRODUCAO: 'Enviar para produção',
  CANCELADO: 'Cancelar orçamento',
};
const ABAS = [
  ['dados', 'Dados gerais'],
  ['importar', 'Importar .dae'],
  ['revisao', 'Revisão'],
  ['pecas', 'Peças'],
  ['itens', 'Itens'],
  ['plano', 'Plano de corte'],
  ['resumo', 'Resumo / Preço'],
  ['anexos', 'Anexos'],
  ['historico', 'Histórico'],
] as const;
export type Aba = (typeof ABAS)[number][0];

/** O que toda aba recebe: a estrutura atual, se pode editar e como recarregar/avisar */
export interface PropsAba {
  e: EstruturaOrcamento;
  recarregar: () => void;
  onToast: (m: string) => void;
  /** Avisa o resultado do recálculo que o servidor faz depois de cada edição */
  aposEditar: (r: RespostaEdicao, msg?: string) => void;
}

/** Tela do orçamento: cabeçalho com status e as abas */
export const OrcamentoView: React.FC<{ registro: RegistroCrud; resources: ResourceDef[]; usuario: Usuario; onFechar: () => void; onGravado: () => void; onToast: (m: string) => void }> = ({
  registro,
  resources,
  usuario,
  onFechar,
  onGravado,
  onToast,
}) => {
  const [id, setId] = useState<number>(Number(registro.id));
  const [e, setE] = useState<EstruturaOrcamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('dados');
  const [versao, setVersao] = useState(0);
  const [mudando, setMudando] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  useEffect(() => {
    fetchEstrutura(id)
      .then(setE)
      .catch((x) => setErro(x.message));
  }, [id, versao]);

  const aposEditar = useCallback(
    (r: RespostaEdicao, msg?: string) => {
      const c = r.calculo;
      const antes = msg ? `${msg} ` : '';
      if (!c) {
        if (msg) onToast(msg);
      } else if ('erro' in c) onToast(`${antes}Cálculo: ${c.erro}`);
      else onToast(`${antes}${resumoCalculo(c)}`);
      recarregar();
      onGravado();
    },
    [onToast, recarregar, onGravado],
  );

  if (erro) return <div className="p-6 text-sm text-rose-600">{erro}</div>;
  if (!e) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando o orçamento…
      </div>
    );
  }
  const o = e.orcamento;
  const margem = o.margem_real_perc == null ? null : Number(o.margem_real_perc);
  const props: PropsAba = { e, recarregar, onToast, aposEditar };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-bold">
          {o.numero}
          {Number(o.revisao) > 0 && <span className="text-stone-500 font-semibold"> rev. {o.revisao}</span>}
        </span>
        <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[o.status] ?? ''}`}>{ROTULO_STATUS[o.status]}</span>
        <span className="text-xs text-stone-500 truncate max-w-[280px]">
          {o.titulo} · {o.cliente_nome}
          {o.arquiteto_nome ? ` · arq. ${o.arquiteto_nome}` : ''}
        </span>
        <span className="text-sm font-semibold">{BRL.format(Number(o.valor_final))}</span>
        {margem !== null && (
          <span className={`text-xs font-semibold flex items-center gap-1 ${margem < 0 ? 'text-rose-600' : margem < 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {margem < 10 && <AlertTriangle className="w-3.5 h-3.5" />} margem real {margem.toLocaleString('pt-BR')}%
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <MenuDocumentos orcamentoId={id} onToast={onToast} />
          {e.transicoes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setMudando(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                s === 'CANCELADO'
                  ? 'border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40'
                  : 'border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800'
              }`}
            >
              {ACAO_STATUS[s]}
            </button>
          ))}
          {e.podeRevisar && (
            <button type="button" onClick={() => setRevisando(true)} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer">
              <Copy className="w-3.5 h-3.5" /> Criar revisão para editar
            </button>
          )}
          <button type="button" onClick={onFechar} title="Fechar" className="p-1 rounded text-stone-400 hover:text-stone-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-4 px-4 border-b border-stone-200 dark:border-stone-800 text-xs font-semibold overflow-x-auto">
        {ABAS.map(([k, rotulo]) => (
          <button
            key={k}
            type="button"
            onClick={() => setAba(k)}
            className={`py-2 border-b-2 whitespace-nowrap cursor-pointer ${aba === k ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'}`}
          >
            {rotulo}
            {k === 'pecas' && ` (${e.pecas.length})`}
            {k === 'itens' && ` (${e.itens.length})`}
            {k === 'anexos' && e.anexos.length > 0 && ` (${e.anexos.length})`}
          </button>
        ))}
      </div>
      {!e.editavel && (
        <div className="px-4 py-1.5 text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
          {ROTULO_STATUS[o.status]}: somente leitura.{e.podeRevisar ? ' Para alterar, crie uma revisão.' : ''}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {aba === 'dados' && <AbaDados {...props} resource={resources.find((r) => r.name === 'orcamentos')} />}
        {aba === 'importar' && <AbaImportar {...props} irParaRevisao={() => setAba('revisao')} />}
        {aba === 'revisao' && <AbaRevisao {...props} />}
        {aba === 'pecas' && <AbaPecas {...props} />}
        {aba === 'itens' && <AbaItens {...props} />}
        {aba === 'plano' && <PlanoCorteView key={versao} orcamentoId={id} embutido onFechar={() => setAba('dados')} />}
        {aba === 'resumo' && <AbaResumo {...props} />}
        {aba === 'anexos' && <AbaAnexos {...props} />}
        {aba === 'historico' && <AbaHistorico {...props} abrir={(novo) => setId(novo)} />}
      </div>

      {mudando && <MudarStatus orcamento={o} status={mudando} admin={usuario.perfil === 'ADMIN'} onFechar={() => setMudando(null)} onFeito={(msg) => (setMudando(null), onToast(msg), recarregar(), onGravado())} />}
      {revisando && (
        <ConfirmDialog
          titulo="Criar revisão"
          mensagem={`Copia ${o.numero} inteiro (móveis, peças, itens, preços e anexos) numa revisão ${Number(o.revisao) + 1} em rascunho, para editar. O orçamento atual fica como está.`}
          confirmar="Criar revisão"
          tom="normal"
          onConfirmar={async () => {
            const r = await criarRevisao(id);
            setRevisando(false);
            onToast(`Revisão ${r.revisao} criada; você está nela agora.`);
            onGravado();
            setAba('dados');
            setId(r.id);
          }}
          onCancelar={() => setRevisando(false)}
        />
      )}
    </div>
  );
};

/** Troca de status com observação; margem negativa ao enviar pede a confirmação de um administrador */
const MudarStatus: React.FC<{ orcamento: RegistroCrud; status: string; admin: boolean; onFechar: () => void; onFeito: (msg: string) => void }> = ({ orcamento, status, admin, onFechar, onFeito }) => {
  const [obs, setObs] = useState('');
  const [margemNegativa, setMargemNegativa] = useState(false);
  const [confirmo, setConfirmo] = useState(false);
  return (
    <ConfirmDialog
      titulo={ACAO_STATUS[status]}
      mensagem={`${orcamento.numero}: ${ROTULO_STATUS[orcamento.status]} → ${ROTULO_STATUS[status]}.${status === 'ENVIADO' ? ' O orçamento é recalculado antes e deixa de ser editável.' : ''}`}
      confirmar={ACAO_STATUS[status]}
      tom={status === 'CANCELADO' || status === 'REPROVADO' ? 'perigo' : 'normal'}
      onConfirmar={async () => {
        try {
          await mudarStatusOrcamento(orcamento.id, status, obs, confirmo);
          onFeito(`${orcamento.numero}: ${ROTULO_STATUS[status]}.`);
        } catch (x: any) {
          if (/margem real negativa/i.test(x.message)) setMargemNegativa(true);
          throw x;
        }
      }}
      onCancelar={onFechar}
    >
      <div className="flex flex-col gap-3">
        <div className={FIELD_CLASS}>
          <label htmlFor="status-obs" className={LABEL_CLASS}>Observação</label>
          <textarea id="status-obs" rows={2} value={obs} onChange={(x) => setObs(x.target.value)} className={`${INPUT_CLASS} w-full`} />
        </div>
        {margemNegativa && admin && <Toggle size="sm" checked={confirmo} onChange={setConfirmo} label="Confirmo enviar com a margem negativa" />}
      </div>
    </ConfirmDialog>
  );
};
