import React, { useEffect, useState } from 'react';
import { Lock, Plus, Search, Trash2 } from 'lucide-react';
import { RegistroCrud } from '../../types';
import { buscarCatalogo, editarOrcamento, ItemCatalogoBusca, listRecords } from '../../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../../utils/formStyles';
import { NumberField } from '../NumberField';
import { SelectBusca } from '../SelectBusca';
import { Toggle } from '../Toggle';
import { ConfirmDialog } from '../ConfirmDialog';
import { BRL, PropsAba } from './OrcamentoView';

const TIPO: Record<string, string> = { MATERIA_PRIMA: 'Matéria-prima', INSUMO: 'Insumo', MATERIAL: 'Ferragem', SERVICO: 'Serviço', AVULSO: 'Avulso' };
const ORIGEM: Record<string, string> = { IMPORTACAO: 'Do modelo', REGRA: 'Regra', AUTOMATICO: 'Automático', MANUAL: 'Manual' };
const CELULA = `${INPUT_CLASS} w-full !py-1 !text-xs text-right`;

/** Itens do orçamento (ferragens, insumos, serviços, outras matérias-primas e avulsos), por móvel e gerais */
export const AbaItens: React.FC<PropsAba> = ({ e, aposEditar, onToast }) => {
  const id = Number(e.orcamento.id);
  const [casas, setCasas] = useState<Map<string, number>>(new Map());
  const [excluir, setExcluir] = useState<RegistroCrud | null>(null);
  const [incluindo, setIncluindo] = useState(false);

  // Casas decimais da quantidade pela unidade (UN: 0, KG: 3...)
  useEffect(() => {
    listRecords('unidades_medida', { limit: 200 })
      .then((r) => setCasas(new Map(r.data.map((u) => [u.sigla, Number(u.casas_decimais)]))))
      .catch(() => {});
  }, []);

  const salvar = async (item: RegistroCrud, dados: RegistroCrud) => {
    try {
      aposEditar(await editarOrcamento(id, 'itens', item.id, dados), 'Item gravado (fica como editado: o recálculo não muda).');
    } catch (x: any) {
      onToast(x.message);
    }
  };

  const grupos = [...e.moveis.map((m) => ({ id: m.id as number | null, nome: m.descricao as string })), { id: null, nome: 'Gerais (orçamento todo)' }]
    .map((g) => ({ ...g, itens: e.itens.filter((i) => (i.movel_id ?? null) === g.id) }))
    .filter((g) => g.itens.length);
  const total = e.itens.reduce((s, i) => s + Number(i.custo_total), 0);

  return (
    <fieldset disabled={!e.editavel} className="flex-1 overflow-y-auto p-4 space-y-5 border-0 m-0 min-w-0">
      <div className="flex items-center gap-3 text-xs text-stone-500">
        <span>
          {e.itens.length} itens · custo {BRL.format(total)}. Itens de regra e automáticos são refeitos a cada cálculo; ao editar um, ele fica <Lock className="w-3 h-3 inline" /> e para de mudar.
        </span>
        {e.editavel && (
          <button type="button" onClick={() => setIncluindo(true)} className="ml-auto flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Incluir item
          </button>
        )}
      </div>
      {!grupos.length && <p className="text-sm text-stone-500">Sem itens.</p>}

      {grupos.map((g) => (
        <section key={String(g.id)}>
          <h3 className="text-sm font-semibold mb-1">{g.nome}</h3>
          <table className="w-full text-xs">
            <thead className="text-left text-stone-500 bg-stone-50 dark:bg-stone-950/60">
              <tr>
                <th className="py-1.5 px-2 font-semibold">Tipo</th>
                <th className="py-1.5 px-2 font-semibold">Descrição</th>
                <th className="py-1.5 px-2 font-semibold">Origem</th>
                <th className="py-1.5 px-2 font-semibold text-center">Un</th>
                <th className="py-1.5 px-2 font-semibold text-right w-[110px]">Quantidade</th>
                <th className="py-1.5 px-2 font-semibold text-right w-[120px]">Custo unit.</th>
                <th className="py-1.5 px-2 font-semibold text-right">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {g.itens.map((i) => (
                <LinhaItem
                  key={`${i.id}-${i.updated_at}`}
                  item={i}
                  casas={casas.get(i.unidade_sigla) ?? 2}
                  editavel={e.editavel}
                  onSalvar={(d) => salvar(i, d)}
                  onExcluir={() => setExcluir(i)}
                />
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {excluir && (
        <ConfirmDialog
          titulo="Excluir item"
          mensagem={`Excluir "${excluir.descricao}" do orçamento?`}
          onConfirmar={async () => {
            const r = await editarOrcamento(id, 'itens', excluir.id, undefined, true);
            setExcluir(null);
            aposEditar(r, 'Item excluído.');
          }}
          onCancelar={() => setExcluir(null)}
        />
      )}
      {incluindo && (
        <IncluirItem
          moveis={e.moveis.map((m) => ({ value: String(m.id), label: m.descricao }))}
          onFechar={() => setIncluindo(false)}
          onGravar={async (d) => {
            aposEditar(await editarOrcamento(id, 'itens', null, d), 'Item incluído.');
            setIncluindo(false);
          }}
        />
      )}
    </fieldset>
  );
};

const LinhaItem: React.FC<{ item: RegistroCrud; casas: number; editavel: boolean; onSalvar: (d: RegistroCrud) => void; onExcluir: () => void }> = ({ item: i, casas, editavel, onSalvar, onExcluir }) => {
  const [q, setQ] = useState(String(i.quantidade));
  const [custo, setCusto] = useState(String(i.custo_unitario));
  const gravar = () => {
    const d: RegistroCrud = {};
    if (Number(q) !== Number(i.quantidade)) d.quantidade = q;
    if (Number(custo) !== Number(i.custo_unitario)) d.custo_unitario = custo;
    if (Object.keys(d).length) onSalvar(d);
  };
  const regra = ['REGRA', 'AUTOMATICO'].includes(i.origem) && !Number(i.editado_manual);
  return (
    <tr className="border-t border-stone-100 dark:border-stone-800">
      <td className="py-1 px-2 whitespace-nowrap text-stone-500">{TIPO[i.tipo_item]}</td>
      <td className="py-1 px-2">
        <div>{i.descricao}</div>
        {i.regra_descricao && <div className="text-[10px] text-stone-400">{i.regra_descricao}</div>}
      </td>
      <td className="py-1 px-2 whitespace-nowrap">
        {ORIGEM[i.origem]}
        {Number(i.editado_manual) === 1 && (
          <span title="Editado à mão: o recálculo não muda">
            <Lock className="w-3 h-3 inline ml-1 text-stone-400" />
          </span>
        )}
      </td>
      <td className="py-1 px-2 text-center">{i.unidade_sigla}</td>
      <td className="py-1 px-2" onBlur={gravar}>
        <NumberField value={q} onChange={setQ} scale={casas} className={CELULA} />
      </td>
      <td className="py-1 px-2" onBlur={gravar}>
        <NumberField value={custo} onChange={setCusto} scale={i.tipo_item === 'INSUMO' ? 4 : 2} className={CELULA} />
      </td>
      <td className="py-1 px-2 text-right whitespace-nowrap">{BRL.format(Number(i.custo_total))}</td>
      <td className="py-1 px-2">
        {editavel && !regra && (
          <button type="button" onClick={onExcluir} title="Excluir o item" className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
};

/** Inclusão: busca no catálogo (vw_catalogo_precos) ou item avulso */
const IncluirItem: React.FC<{ moveis: { value: string; label: string }[]; onFechar: () => void; onGravar: (d: RegistroCrud) => Promise<void> }> = ({ moveis, onFechar, onGravar }) => {
  const [avulso, setAvulso] = useState(false);
  const [busca, setBusca] = useState('');
  const [achados, setAchados] = useState<ItemCatalogoBusca[]>([]);
  const [escolhido, setEscolhido] = useState<ItemCatalogoBusca | null>(null);
  const [v, setV] = useState<Record<string, string>>({ quantidade: '1', unidade_sigla: 'UN' });
  const set = (k: string, x: string) => setV((a) => ({ ...a, [k]: x }));

  useEffect(() => {
    if (avulso || busca.trim().length < 2 || escolhido?.descricao === busca) return setAchados([]);
    const t = setTimeout(() => buscarCatalogo(busca).then(setAchados).catch(() => setAchados([])), 250);
    return () => clearTimeout(t);
  }, [busca, avulso, escolhido]);

  return (
    <ConfirmDialog
      titulo="Incluir item"
      mensagem="Item lançado à mão: o preço vem do catálogo (ou o digitado) e fica gravado no orçamento."
      confirmar="Incluir"
      tom="normal"
      onConfirmar={async () => {
        if (!avulso && !escolhido) throw new Error('Escolha o item no catálogo (ou ligue "Avulso").');
        await onGravar(
          avulso
            ? { tipo_item: 'AVULSO', ...v }
            : { tipo_item: escolhido!.tipo_item, ref_id: escolhido!.id, quantidade: v.quantidade, movel_id: v.movel_id, custo_unitario: v.custo_unitario },
        );
      }}
      onCancelar={onFechar}
    >
      <div className="flex flex-col gap-3">
        <Toggle size="sm" checked={avulso} onChange={(x) => (setAvulso(x), setEscolhido(null))} label="Avulso (fora do catálogo)" />
        {avulso ? (
          <div className="grid grid-cols-3 gap-3">
            <div className={`${FIELD_CLASS} col-span-2`}>
              <label className={LABEL_CLASS}>Descrição</label>
              <input autoFocus value={v.descricao ?? ''} onChange={(x) => set('descricao', x.target.value)} required maxLength={150} className={`${INPUT_CLASS} w-full`} placeholder="Frete, vidro sob medida…" />
            </div>
            <div className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>Unidade</label>
              <input value={v.unidade_sigla} onChange={(x) => set('unidade_sigla', x.target.value.toUpperCase())} required maxLength={6} className={`${INPUT_CLASS} w-full`} />
            </div>
          </div>
        ) : (
          <div className={`${FIELD_CLASS} relative`}>
            <label className={LABEL_CLASS}>Item do catálogo</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                autoFocus
                value={busca}
                onChange={(x) => (setBusca(x.target.value), setEscolhido(null))}
                placeholder="Digite parte da descrição ou do código"
                required
                className={`${INPUT_CLASS} w-full pl-8`}
              />
            </div>
            {achados.length > 0 && (
              <ul className="absolute z-10 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl text-xs">
                {achados.map((a) => (
                  <li key={`${a.tipo_item}-${a.id}`}>
                    <button
                      type="button"
                      onClick={() => (setEscolhido(a), setBusca(a.descricao), setAchados([]), set('custo_unitario', String(a.custo_unitario)))}
                      className="w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer flex justify-between gap-2"
                    >
                      <span>
                        <span className="text-stone-400">{TIPO[a.tipo_item]} · </span>
                        {a.descricao}
                      </span>
                      <span className="text-stone-500 whitespace-nowrap">
                        {a.unidade} · {BRL.format(Number(a.custo_unitario))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div className={FIELD_CLASS}>
            <label className={LABEL_CLASS}>Quantidade</label>
            <NumberField value={v.quantidade} onChange={(x) => set('quantidade', x)} scale={2} required className={`${INPUT_CLASS} w-full`} />
          </div>
          <div className={FIELD_CLASS}>
            <label className={LABEL_CLASS}>Custo unitário (R$)</label>
            <NumberField value={v.custo_unitario ?? ''} onChange={(x) => set('custo_unitario', x)} scale={2} required={avulso} className={`${INPUT_CLASS} w-full`} />
          </div>
          <div className={FIELD_CLASS}>
            <label className={LABEL_CLASS}>Móvel</label>
            <SelectBusca value={v.movel_id ?? ''} options={moveis} onChange={(x) => set('movel_id', x)} vazioLabel="— Geral —" className={`${INPUT_CLASS} w-full`} />
          </div>
        </div>
      </div>
    </ConfirmDialog>
  );
};
