import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { OpcaoRef, RegistroCrud } from '../../types';
import { editarOrcamento, fetchOptions, listRecords } from '../../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../../utils/formStyles';
import { NumberField } from '../NumberField';
import { SelectBusca } from '../SelectBusca';
import { Toggle } from '../Toggle';
import { ConfirmDialog } from '../ConfirmDialog';
import { FitaBordas } from './FitaBordas';
import { BRL, PropsAba } from './OrcamentoView';

interface Catalogo {
  tipos: OpcaoRef[];
  chapas: OpcaoRef[];
  fitas: OpcaoRef[];
  acabamentos: OpcaoRef[];
  /** Espessura de cada chapa (a peça herda ao trocar de chapa) */
  espessura: Map<string, string>;
}
const CELULA = `${INPUT_CLASS} w-full !py-1 !text-xs`;

/** Peças: móveis agrupados por ambiente; cada móvel com a grade das peças, editável como planilha */
export const AbaPecas: React.FC<PropsAba> = ({ e, aposEditar, onToast }) => {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [excluir, setExcluir] = useState<{ colecao: 'moveis' | 'pecas'; id: number; texto: string } | null>(null);
  const [novaPeca, setNovaPeca] = useState<number | null>(null);
  const [novoMovel, setNovoMovel] = useState(false);
  const id = Number(e.orcamento.id);

  useEffect(() => {
    Promise.all([
      fetchOptions('tipos_peca', 'nome'),
      listRecords('materias_primas', { limit: 200, sort: 'descricao', dir: 'asc', filters: [{ field: 'tipo', op: 'eq', value: 'CHAPA' }, { field: 'ativo', op: 'eq', value: '1' }] }),
      fetchOptions('materias_primas', 'descricao', { campo: 'tipo', valor: 'FITA_BORDA' }),
      fetchOptions('acabamentos', 'nome'),
    ])
      .then(([tipos, chapas, fitas, acabamentos]) =>
        setCat({
          tipos,
          chapas: chapas.data.map((c) => ({ value: String(c.id), label: c.descricao })),
          espessura: new Map(chapas.data.map((c) => [String(c.id), String(c.espessura_mm)])),
          fitas,
          acabamentos,
        }),
      )
      .catch((x) => onToast(x.message));
  }, [onToast]);

  /** Grava uma alteração (o servidor marca como editada à mão e recalcula) */
  const salvar = async (colecao: 'moveis' | 'pecas', subId: number, dados: RegistroCrud) => {
    try {
      aposEditar(await editarOrcamento(id, colecao, subId, dados), colecao === 'pecas' ? 'Peça gravada.' : 'Móvel gravado.');
    } catch (x: any) {
      onToast(x.message);
    }
  };

  const grupos = useMemo(() => {
    const l = [...e.ambientes.map((a) => ({ id: a.id as number | null, nome: a.nome as string })), { id: null, nome: 'Sem ambiente' }];
    return l.map((g) => ({ ...g, moveis: e.moveis.filter((m) => (m.ambiente_id ?? null) === g.id) })).filter((g) => g.moveis.length || g.id !== null);
  }, [e]);

  if (!cat) {
    return (
      <div className="p-6 text-sm text-stone-500">
        <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
      </div>
    );
  }
  const ambientes = e.ambientes.map((a) => ({ value: String(a.id), label: a.nome }));

  return (
    <fieldset disabled={!e.editavel} className="flex-1 overflow-y-auto p-4 space-y-6 border-0 m-0 min-w-0">
      <div className="flex items-center gap-3 text-xs text-stone-500">
        <span>
          {e.moveis.length} móveis · {e.pecas.length} peças. Peças com <Lock className="w-3 h-3 inline" /> foram editadas à mão: a reimportação não mexe nelas.
        </span>
        {e.editavel && (
          <button type="button" onClick={() => setNovoMovel(true)} className="ml-auto flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Novo móvel
          </button>
        )}
      </div>
      {!e.moveis.length && <p className="text-sm text-stone-500">Sem móveis. Importe um .dae e gere o orçamento, ou inclua um móvel.</p>}

      {grupos.map((g) => (
        <section key={String(g.id)} className="space-y-4">
          {(e.ambientes.length > 0 || g.id !== null) && <h3 className="text-sm font-bold text-stone-700 dark:text-stone-200 border-b border-stone-200 dark:border-stone-800 pb-1">{g.nome}</h3>}
          {g.moveis.map((m) => (
            <div key={m.id} className="border border-stone-200 dark:border-stone-800 rounded-lg">
              <CabecalhoMovel movel={m} cat={cat} ambientes={ambientes} onSalvar={(d) => salvar('moveis', m.id, d)} onExcluir={() => setExcluir({ colecao: 'moveis', id: m.id, texto: `o móvel "${m.descricao}" com todas as peças e itens dele` })} editavel={e.editavel} />
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-stone-500 bg-stone-50 dark:bg-stone-950/60">
                    <tr>
                      <th className="py-1.5 px-2 font-semibold min-w-[160px]">Peça</th>
                      <th className="py-1.5 px-2 font-semibold min-w-[120px]">Tipo</th>
                      <th className="py-1.5 px-2 font-semibold min-w-[170px]">Chapa</th>
                      <th className="py-1.5 px-2 font-semibold text-right w-[90px]">Compr.</th>
                      <th className="py-1.5 px-2 font-semibold text-right w-[90px]">Larg.</th>
                      <th className="py-1.5 px-2 font-semibold text-right w-[70px]">Esp.</th>
                      <th className="py-1.5 px-2 font-semibold text-right w-[60px]">Qtd</th>
                      <th className="py-1.5 px-2 font-semibold">Fitas</th>
                      <th className="py-1.5 px-2 font-semibold text-center">Veio</th>
                      <th className="py-1.5 px-2 font-semibold min-w-[120px]">Usinagem</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Custo</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {e.pecas
                      .filter((p) => p.movel_id === m.id)
                      .map((p) => (
                        <LinhaPeca key={`${p.id}-${p.updated_at}`} peca={p} cat={cat} editavel={e.editavel} onSalvar={(d) => salvar('pecas', p.id, d)} onExcluir={() => setExcluir({ colecao: 'pecas', id: p.id, texto: `a peça "${p.descricao}"` })} />
                      ))}
                  </tbody>
                </table>
              </div>
              {e.editavel && (
                <button type="button" onClick={() => setNovaPeca(m.id)} className="m-2 flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline cursor-pointer">
                  <Plus className="w-3.5 h-3.5" /> Nova peça
                </button>
              )}
            </div>
          ))}
        </section>
      ))}

      {excluir && (
        <ConfirmDialog
          titulo="Excluir"
          mensagem={`Excluir ${excluir.texto}?`}
          onConfirmar={async () => {
            const r = await editarOrcamento(id, excluir.colecao, excluir.id, undefined, true);
            setExcluir(null);
            aposEditar(r, 'Excluído.');
          }}
          onCancelar={() => setExcluir(null)}
        />
      )}
      {novaPeca !== null && <NovaPeca movelId={novaPeca} cat={cat} onFechar={() => setNovaPeca(null)} onGravar={async (d) => (aposEditar(await editarOrcamento(id, 'pecas', null, d), 'Peça incluída.'), setNovaPeca(null))} />}
      {novoMovel && <NovoMovel ambientes={ambientes} onFechar={() => setNovoMovel(false)} onGravar={async (d) => (aposEditar(await editarOrcamento(id, 'moveis', null, d), 'Móvel incluído.'), setNovoMovel(false))} />}
    </fieldset>
  );
};

/** Grava o campo quando o valor muda de verdade (ao sair do campo ou escolher no combo) */
function useCampo(original: any, gravar: (v: any) => void) {
  const [v, setV] = useState(original ?? '');
  const commit = (novo = v) => {
    if (String(novo ?? '') !== String(original ?? '')) gravar(novo === '' ? null : novo);
  };
  return [v, setV, commit] as const;
}

const LinhaPeca: React.FC<{ peca: RegistroCrud; cat: Catalogo; editavel: boolean; onSalvar: (d: RegistroCrud) => void; onExcluir: () => void }> = ({ peca: p, cat, editavel, onSalvar, onExcluir }) => {
  const [desc, setDesc, okDesc] = useCampo(p.descricao, (v) => onSalvar({ descricao: v }));
  const [num, setNum] = useState<Record<string, string>>({ comprimento_mm: p.comprimento_mm, largura_mm: p.largura_mm, espessura_mm: p.espessura_mm, quantidade: String(p.quantidade) });
  const setN = (k: string) => (v: string) => setNum((a) => ({ ...a, [k]: v }));
  /** Medidas e quantidade: grava junto o que mudou (comparando o número, não o texto) ao sair de um desses campos */
  const gravarNumeros = () => {
    const mudou = Object.fromEntries(Object.entries(num).filter(([k, v]) => Number(v) !== Number(p[k])));
    if (Object.keys(mudou).length) onSalvar(mudou);
  };
  const [us, setUs, okUs] = useCampo(p.usinagem, (v) => onSalvar({ usinagem: v }));
  const fitas = [p.fita_comp1_id, p.fita_comp2_id, p.fita_larg1_id, p.fita_larg2_id].map((x) => (x ? Number(x) : null)) as [number | null, number | null, number | null, number | null];
  return (
    <tr className="border-t border-stone-100 dark:border-stone-800 align-middle">
      <td className="py-1 px-2">
        <div className="flex items-center gap-1">
          {Number(p.editado_manual) === 1 && (
            <span title="Editada à mão: a reimportação não mexe nela">
              <Lock className="w-3 h-3 text-stone-400 shrink-0" />
            </span>
          )}
          <input value={desc} onChange={(x) => setDesc(x.target.value)} onBlur={() => okDesc()} maxLength={150} required className={CELULA} />
        </div>
      </td>
      <td className="py-1 px-2">
        <SelectBusca value={String(p.tipo_peca_id ?? '')} options={cat.tipos} onChange={(v) => onSalvar({ tipo_peca_id: v || null })} vazioLabel="—" className={CELULA} />
      </td>
      <td className="py-1 px-2">
        <SelectBusca
          value={String(p.materia_prima_id)}
          options={cat.chapas}
          onChange={(v) => v && onSalvar({ materia_prima_id: v, ...(cat.espessura.get(v) ? { espessura_mm: cat.espessura.get(v) } : {}) })}
          required
          vazioLabel="— Selecione —"
          className={CELULA}
        />
      </td>
      {(['comprimento_mm', 'largura_mm', 'espessura_mm', 'quantidade'] as const).map((k) => (
        <td key={k} className="py-1 px-2" onBlur={gravarNumeros}>
          <NumberField value={num[k]} onChange={setN(k)} scale={k === 'quantidade' ? 0 : 1} className={`${CELULA} text-right`} required />
        </td>
      ))}
      <td className="py-1 px-2">
        <FitaBordas
          fitas={fitas}
          opcoes={cat.fitas}
          disabled={!editavel}
          onChange={(f) => onSalvar({ fita_comp1_id: f[0], fita_comp2_id: f[1], fita_larg1_id: f[2], fita_larg2_id: f[3] })}
        />
      </td>
      <td className="py-1 px-2 text-center">
        <Toggle size="sm" checked={Number(p.respeita_veio) === 1} onChange={(v) => onSalvar({ respeita_veio: v ? 1 : 0 })} />
      </td>
      <td className="py-1 px-2">
        <input value={us} onChange={(x) => setUs(x.target.value)} onBlur={() => okUs()} maxLength={255} className={CELULA} placeholder="Furação, rasgo…" />
      </td>
      <td className="py-1 px-2 text-right whitespace-nowrap" title={`Chapa ${BRL.format(Number(p.custo_chapa))} + fita ${BRL.format(Number(p.custo_fita))}`}>
        {BRL.format(Number(p.custo_chapa) + Number(p.custo_fita))}
      </td>
      <td className="py-1 px-2">
        {editavel && (
          <button type="button" onClick={onExcluir} title="Excluir a peça" className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
};

const CabecalhoMovel: React.FC<{ movel: RegistroCrud; cat: Catalogo; ambientes: OpcaoRef[]; editavel: boolean; onSalvar: (d: RegistroCrud) => void; onExcluir: () => void }> = ({
  movel: m,
  cat,
  ambientes,
  editavel,
  onSalvar,
  onExcluir,
}) => {
  const [desc, setDesc, okDesc] = useCampo(m.descricao, (v) => onSalvar({ descricao: v }));
  const [q, setQ] = useState(String(m.quantidade));
  return (
    <div className="flex flex-wrap items-end gap-3 p-2 bg-stone-50/60 dark:bg-stone-950/40 border-b border-stone-200 dark:border-stone-800">
      <div className={`${FIELD_CLASS} min-w-[220px] flex-1`}>
        <label className={LABEL_CLASS}>Móvel</label>
        <input value={desc} onChange={(x) => setDesc(x.target.value)} onBlur={() => okDesc()} required maxLength={150} className={`${INPUT_CLASS} w-full font-semibold`} />
      </div>
      <div className={`${FIELD_CLASS} w-20`} onBlur={() => q !== String(m.quantidade) && Number(q) >= 1 && onSalvar({ quantidade: q })}>
        <label className={LABEL_CLASS}>Qtd</label>
        <NumberField value={q} onChange={setQ} scale={0} required className={`${INPUT_CLASS} w-full text-right`} />
      </div>
      {ambientes.length > 0 && (
        <div className={`${FIELD_CLASS} w-44`}>
          <label className={LABEL_CLASS}>Ambiente</label>
          <SelectBusca value={String(m.ambiente_id ?? '')} options={ambientes} onChange={(v) => onSalvar({ ambiente_id: v || null })} vazioLabel="— Nenhum —" className={`${INPUT_CLASS} w-full`} />
        </div>
      )}
      <div className={`${FIELD_CLASS} w-44`}>
        <label className={LABEL_CLASS}>Acabamento caixa</label>
        <SelectBusca value={String(m.acabamento_caixa_id ?? '')} options={cat.acabamentos} onChange={(v) => onSalvar({ acabamento_caixa_id: v || null })} vazioLabel="—" className={`${INPUT_CLASS} w-full`} />
      </div>
      <div className={`${FIELD_CLASS} w-44`}>
        <label className={LABEL_CLASS}>Acabamento frente</label>
        <SelectBusca value={String(m.acabamento_frente_id ?? '')} options={cat.acabamentos} onChange={(v) => onSalvar({ acabamento_frente_id: v || null })} vazioLabel="—" className={`${INPUT_CLASS} w-full`} />
      </div>
      <div className="text-xs text-stone-500 pb-2">
        {m.largura_mm ? `${Number(m.largura_mm)} × ${Number(m.altura_mm)} × ${Number(m.profundidade_mm)} mm · ` : ''}custo {BRL.format(Number(m.custo_total))} · venda {BRL.format(Number(m.valor_venda))}
      </div>
      {editavel && (
        <button type="button" onClick={onExcluir} title="Excluir o móvel" className="ml-auto mb-1 p-1.5 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

const NovaPeca: React.FC<{ movelId: number; cat: Catalogo; onFechar: () => void; onGravar: (d: RegistroCrud) => Promise<void> }> = ({ movelId, cat, onFechar, onGravar }) => {
  const [v, setV] = useState<Record<string, string>>({ quantidade: '1' });
  const set = (k: string, x: string) => setV((a) => ({ ...a, [k]: x }));
  return (
    <ConfirmDialog
      titulo="Nova peça"
      mensagem="Peça lançada à mão (fica protegida da reimportação). Fitas e veio se ajustam depois, na grade."
      confirmar="Incluir"
      tom="normal"
      onConfirmar={() => onGravar({ ...v, movel_id: movelId, espessura_mm: v.espessura_mm || cat.espessura.get(v.materia_prima_id) })}
      onCancelar={onFechar}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className={`${FIELD_CLASS} col-span-2`}>
          <label className={LABEL_CLASS}>Descrição</label>
          <input autoFocus value={v.descricao ?? ''} onChange={(x) => set('descricao', x.target.value)} required maxLength={150} className={`${INPUT_CLASS} w-full`} />
        </div>
        <div className={FIELD_CLASS}>
          <label className={LABEL_CLASS}>Tipo</label>
          <SelectBusca value={v.tipo_peca_id ?? ''} options={cat.tipos} onChange={(x) => set('tipo_peca_id', x)} vazioLabel="—" className={`${INPUT_CLASS} w-full`} />
        </div>
        <div className={FIELD_CLASS}>
          <label className={LABEL_CLASS}>Chapa</label>
          <SelectBusca value={v.materia_prima_id ?? ''} options={cat.chapas} onChange={(x) => set('materia_prima_id', x)} required vazioLabel="— Selecione —" className={`${INPUT_CLASS} w-full`} />
        </div>
        {(['comprimento_mm', 'largura_mm', 'quantidade'] as const).map((k) => (
          <div key={k} className={FIELD_CLASS}>
            <label className={LABEL_CLASS}>{k === 'comprimento_mm' ? 'Comprimento (mm)' : k === 'largura_mm' ? 'Largura (mm)' : 'Quantidade'}</label>
            <NumberField value={v[k] ?? ''} onChange={(x) => set(k, x)} scale={k === 'quantidade' ? 0 : 1} required className={`${INPUT_CLASS} w-full`} />
          </div>
        ))}
      </div>
    </ConfirmDialog>
  );
};

const NovoMovel: React.FC<{ ambientes: OpcaoRef[]; onFechar: () => void; onGravar: (d: RegistroCrud) => Promise<void> }> = ({ ambientes, onFechar, onGravar }) => {
  const [desc, setDesc] = useState('');
  const [amb, setAmb] = useState('');
  const [q, setQ] = useState('1');
  return (
    <ConfirmDialog titulo="Novo móvel" mensagem="Móvel lançado à mão; as peças entram depois, na grade." confirmar="Incluir" tom="normal" onConfirmar={() => onGravar({ descricao: desc, ambiente_id: amb || null, quantidade: q })} onCancelar={onFechar}>
      <div className="grid grid-cols-2 gap-3">
        <div className={`${FIELD_CLASS} col-span-2`}>
          <label className={LABEL_CLASS}>Descrição</label>
          <input autoFocus value={desc} onChange={(x) => setDesc(x.target.value)} required maxLength={150} className={`${INPUT_CLASS} w-full`} placeholder="Armário superior, balcão pia…" />
        </div>
        {ambientes.length > 0 && (
          <div className={FIELD_CLASS}>
            <label className={LABEL_CLASS}>Ambiente</label>
            <SelectBusca value={amb} options={ambientes} onChange={setAmb} vazioLabel="— Nenhum —" className={`${INPUT_CLASS} w-full`} />
          </div>
        )}
        <div className={FIELD_CLASS}>
          <label className={LABEL_CLASS}>Quantidade</label>
          <NumberField value={q} onChange={setQ} scale={0} required className={`${INPUT_CLASS} w-full`} />
        </div>
      </div>
    </ConfirmDialog>
  );
};
