import React, { useEffect, useState } from 'react';
import { FlaskConical, Percent } from 'lucide-react';
import { OpcaoRef, ResourceDef } from '../types';
import { fetchOptions, reajustarPrecos, testarMapeamentos, MapeamentoCasado } from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { NumberField } from './NumberField';
import { SelectBusca } from './SelectBusca';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../utils/formStyles';

const BOTAO =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer shrink-0 whitespace-nowrap';

/** Reajuste em lote: percentual sobre o custo dos itens ativos, filtrando por categoria e/ou fornecedor */
export const BotaoReajuste: React.FC<{ resource: ResourceDef; onFeito: () => void; onToast: (m: string) => void }> = ({ resource, onFeito, onToast }) => {
  const [aberto, setAberto] = useState(false);
  const [perc, setPerc] = useState('');
  const [categoria, setCategoria] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [opcoes, setOpcoes] = useState<{ categorias: OpcaoRef[]; fornecedores: OpcaoRef[] }>({ categorias: [], fornecedores: [] });
  const [itens, setItens] = useState<number | null>(null);

  const campo = (nome: string) => resource.fields.find((f) => f.name === nome);
  const fCategoria = campo('categoria_id');
  const fFornecedor = campo('fornecedor_id');

  useEffect(() => {
    if (!aberto) return;
    Promise.all([
      fCategoria ? fetchOptions('categorias', 'nome', fCategoria.refFiltro) : [],
      fFornecedor ? fetchOptions('fornecedores', 'razao_social') : [],
    ]).then(([categorias, fornecedores]) => setOpcoes({ categorias, fornecedores }));
  }, [aberto, fCategoria, fFornecedor]);

  // Quantos itens o reajuste alcança, a cada mudança de filtro
  useEffect(() => {
    if (!aberto) return;
    setItens(null);
    reajustarPrecos({ recurso: resource.name, perc: '1', categoria_id: categoria, fornecedor_id: fornecedor, simular: true })
      .then((r) => setItens(r.itens))
      .catch(() => setItens(null));
  }, [aberto, categoria, fornecedor, resource.name]);

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} title="Aplicar um percentual ao custo de vários itens" className={BOTAO}>
        <Percent className="w-3.5 h-3.5" />
        Reajuste
      </button>
      {aberto && (
        <ConfirmDialog
          titulo={`Reajuste de preços: ${resource.label}`}
          mensagem={
            <>
              Aplica o percentual ao custo dos itens <b>ativos</b> selecionados. Negativo reduz (digite "-" para alternar o sinal).
              Cada alteração fica no histórico de preços do item.
            </>
          }
          confirmar={itens ? `Reajustar ${itens} ${itens === 1 ? 'item' : 'itens'}` : 'Reajustar'}
          tom="normal"
          onConfirmar={async () => {
            if (!Number(perc)) throw new Error('Informe o percentual.');
            const r = await reajustarPrecos({ recurso: resource.name, perc, categoria_id: categoria, fornecedor_id: fornecedor });
            setAberto(false);
            onToast(`${r.itens} ${r.itens === 1 ? 'item reajustado' : 'itens reajustados'}.`);
            onFeito();
          }}
          onCancelar={() => setAberto(false)}
        >
          <div className="flex flex-col gap-3">
            <div className={FIELD_CLASS}>
              <label htmlFor="reajuste-perc" className={LABEL_CLASS}>Percentual (%)</label>
              <NumberField id="reajuste-perc" value={perc} onChange={setPerc} scale={2} allowNegative required className={`${INPUT_CLASS} w-full`} />
            </div>
            {fCategoria && (
              <div className={FIELD_CLASS}>
                <label htmlFor="reajuste-categoria" className={LABEL_CLASS}>Categoria</label>
                <SelectBusca id="reajuste-categoria" value={categoria} options={opcoes.categorias} onChange={setCategoria} vazioLabel="— Todas —" className={`${INPUT_CLASS} w-full`} />
              </div>
            )}
            {fFornecedor && (
              <div className={FIELD_CLASS}>
                <label htmlFor="reajuste-fornecedor" className={LABEL_CLASS}>Fornecedor</label>
                <SelectBusca id="reajuste-fornecedor" value={fornecedor} options={opcoes.fornecedores} onChange={setFornecedor} vazioLabel="— Todos —" className={`${INPUT_CLASS} w-full`} />
              </div>
            )}
            <p className="text-xs text-stone-500">{itens === null ? 'Contando os itens…' : `${itens} ${itens === 1 ? 'item ativo será reajustado' : 'itens ativos serão reajustados'}.`}</p>
          </div>
        </ConfirmDialog>
      )}
    </>
  );
};

const ORIGENS = [
  ['', 'Todas'],
  ['MATERIAL', 'Material'],
  ['COMPONENTE', 'Componente'],
  ['NO', 'Nó'],
];

/** "Testar padrão": digita um nome como viria do .dae e vê quais mapeamentos casam, na ordem de avaliação */
export const BotaoTestarPadrao: React.FC = () => {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [origem, setOrigem] = useState('');
  const [arquiteto, setArquiteto] = useState('');
  const [arquitetos, setArquitetos] = useState<OpcaoRef[]>([]);
  const [resultado, setResultado] = useState<MapeamentoCasado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (aberto) fetchOptions('arquitetos', 'nome').then(setArquitetos).catch(() => {});
  }, [aberto]);

  useEffect(() => {
    if (!aberto || !texto.trim()) return setResultado(null);
    const t = setTimeout(() => {
      testarMapeamentos(texto, origem, arquiteto)
        .then((r) => (setResultado(r), setErro(null)))
        .catch((e) => setErro(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [aberto, texto, origem, arquiteto]);

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} title="Testar um nome do modelo 3D contra os mapeamentos" className={BOTAO}>
        <FlaskConical className="w-3.5 h-3.5" />
        Testar padrão
      </button>
      {aberto && (
        <ConfirmDialog
          titulo="Testar padrão"
          mensagem="Digite um nome como vem no .dae (material, componente ou nó). Aparecem os mapeamentos ativos que casam, na ordem em que a importação os aplica: vale o primeiro."
          confirmar="Fechar"
          tom="normal"
          onConfirmar={() => setAberto(false)}
          onCancelar={() => setAberto(false)}
        >
          <div className="flex flex-col gap-3">
            <div className={FIELD_CLASS}>
              <label htmlFor="testar-texto" className={LABEL_CLASS}>Texto</label>
              <input id="testar-texto" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} className={`${INPUT_CLASS} w-full`} placeholder="Ex.: Puxador_Cava_160" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={FIELD_CLASS}>
                <label htmlFor="testar-origem" className={LABEL_CLASS}>Origem</label>
                <select id="testar-origem" value={origem} onChange={(e) => setOrigem(e.target.value)} className={`${INPUT_CLASS} w-full cursor-pointer`}>
                  {ORIGENS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className={FIELD_CLASS}>
                <label htmlFor="testar-arquiteto" className={LABEL_CLASS}>Arquiteto</label>
                <SelectBusca id="testar-arquiteto" value={arquiteto} options={arquitetos} onChange={setArquiteto} vazioLabel="— Só globais —" className={`${INPUT_CLASS} w-full`} />
              </div>
            </div>
            {erro && <p className="text-xs text-rose-600">{erro}</p>}
            {resultado && (
              <div className="max-h-56 overflow-y-auto text-xs border-t border-stone-200 dark:border-stone-800 pt-2">
                {resultado.length === 0 ? (
                  <p className="text-stone-500">Nenhum mapeamento casa: o classificador segue para espessura e palavras-chave.</p>
                ) : (
                  resultado.map((m, i) => (
                    <div key={m.id} className={`py-1 flex gap-2 ${i ? 'text-stone-400' : 'font-semibold text-emerald-700 dark:text-emerald-400'}`}>
                      <span className="w-6 text-right">{m.prioridade}</span>
                      <span className="flex-1 truncate">
                        nº {m.id} · {m.origem} · {m.modo_comparacao} "{m.padrao}" → {m.acao}
                        {m.arquiteto ? ` (${m.arquiteto})` : ''}
                      </span>
                      {i === 0 && <span>aplicado</span>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </ConfirmDialog>
      )}
    </>
  );
};
