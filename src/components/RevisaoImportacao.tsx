import React, { useEffect, useMemo, useState } from 'react';
import { Check, Info, Loader2 } from 'lucide-react';
import { fetchOptions, salvarRevisao, ObjetoImportacao, LembrarRegra } from '../services/api';
import { OpcaoRef } from '../types';
import { STATUS_COLORS } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../utils/formStyles';
import { SelectBusca } from './SelectBusca';
import { NumberField } from './NumberField';
import { Toggle } from './Toggle';
import { AvisoErro } from './AvisoErro';

export const ROTULO_CLASSE: Record<string, string> = {
  MOVEL: 'Móvel',
  GRUPO: 'Grupo',
  PECA: 'Peça',
  FERRAGEM: 'Ferragem',
  INSUMO: 'Insumo',
  IGNORAR: 'Ignorar',
  DESCONHECIDO: 'A classificar',
};
const FILTROS = ['TODOS', 'DESCONHECIDO', 'BAIXA', 'PECA', 'FERRAGEM', 'INSUMO', 'IGNORAR'] as const;
const ROTULO_FILTRO: Record<string, string> = { TODOS: 'Todos', BAIXA: 'Baixa confiança', ...ROTULO_CLASSE };
/** Abaixo disto a linha vai para o topo da lista e entra no filtro "Baixa confiança" */
const CONFIANCA_BAIXA = 60;

const mm = (v: string | null) => (v == null ? '' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(v)));
const baixa = (o: ObjetoImportacao) => o.classificacao !== 'IGNORAR' && Number(o.confianca ?? 0) < CONFIANCA_BAIXA;

interface Props {
  importacaoId: number;
  objetos: ObjetoImportacao[];
  marcados: Set<number>;
  onMarcar: (ids: Set<number>) => void;
  /** Linha clicada (destaque no 3D) */
  selecionado: number | null;
  onSelecionar: (id: number | null) => void;
  onGravado: (msg: string) => void;
  temArquiteto: boolean;
}

/** Lista de revisão: desconhecidos e baixa confiança primeiro, filtros com contadores e edição em massa */
export const RevisaoImportacao: React.FC<Props> = ({ importacaoId, objetos, marcados, onMarcar, selecionado, onSelecionar, onGravado, temArquiteto }) => {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('TODOS');
  const candidatos = useMemo(
    () =>
      objetos
        .filter((o) => o.classificacao !== 'MOVEL' && o.classificacao !== 'GRUPO')
        .sort((a, b) => Number(b.classificacao === 'DESCONHECIDO') - Number(a.classificacao === 'DESCONHECIDO') || Number(baixa(b)) - Number(baixa(a)) || Number(a.confianca ?? 0) - Number(b.confianca ?? 0) || a.id - b.id),
    [objetos],
  );
  const contagem = (f: string) => (f === 'TODOS' ? candidatos.length : f === 'BAIXA' ? candidatos.filter(baixa).length : candidatos.filter((o) => o.classificacao === f).length);
  const visiveis = candidatos.filter((o) => filtro === 'TODOS' || (filtro === 'BAIXA' ? baixa(o) : o.classificacao === filtro));
  const todosMarcados = visiveis.length > 0 && visiveis.every((o) => marcados.has(o.id));

  const alternar = (id: number) => {
    const n = new Set(marcados);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onMarcar(n);
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-stone-200 dark:border-stone-800">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer ${
              filtro === f ? 'bg-blue-600 text-white border-blue-600' : 'border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'
            }`}
          >
            {ROTULO_FILTRO[f]} <span className="opacity-70">{contagem(f)}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-stone-50 dark:bg-stone-950 text-stone-500 text-left z-[1]">
            <tr>
              <th className="py-2 pl-3 w-8">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  onChange={() => onMarcar(todosMarcados ? new Set([...marcados].filter((id) => !visiveis.some((o) => o.id === id))) : new Set([...marcados, ...visiveis.map((o) => o.id)]))}
                  title="Marcar todos os da lista"
                />
              </th>
              <th className="py-2 px-2 font-semibold">Objeto</th>
              <th className="py-2 px-2 font-semibold">Classificação</th>
              <th className="py-2 px-2 font-semibold text-right">Conf.</th>
              <th className="py-2 px-2 font-semibold">Tipo / Chapa / Fita · Item</th>
              <th className="py-2 px-2 font-semibold text-right">Qtd</th>
              <th className="py-2 px-2 font-semibold text-right">C × L × E (mm)</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((o) => {
              const sel = selecionado === o.id;
              return (
                <tr
                  key={o.id}
                  data-objeto={o.id}
                  onClick={() => onSelecionar(sel ? null : o.id)}
                  className={`cursor-pointer border-b border-stone-100 dark:border-stone-800 ${
                    sel ? 'bg-amber-50 dark:bg-amber-950/30' : marcados.has(o.id) ? 'bg-blue-50/60 dark:bg-blue-950/20' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                  }`}
                >
                  <td className="py-1.5 pl-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={marcados.has(o.id)} onChange={() => alternar(o.id)} />
                  </td>
                  <td className="py-1.5 px-2 max-w-[220px]">
                    <div className="truncate font-medium" title={o.caminho}>
                      {o.nome_definicao && /^(group|instance)/i.test(o.nome) ? o.nome_definicao : o.nome}
                      {Number(o.revisado) === 1 && <Check className="w-3 h-3 inline ml-1 text-emerald-600" />}
                    </div>
                    <div className="truncate text-[10px] text-stone-400" title={o.material_dae ?? ''}>{o.material_dae}</div>
                  </td>
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[o.classificacao] ?? ''}`}>{ROTULO_CLASSE[o.classificacao] ?? o.classificacao}</span>
                    {o.motivo_classificacao && (
                      <span title={o.motivo_classificacao}>
                        <Info className="w-3 h-3 inline ml-1 text-stone-400" />
                      </span>
                    )}
                  </td>
                  <td className={`py-1.5 px-2 text-right ${baixa(o) ? 'text-amber-600 font-semibold' : ''}`}>{o.confianca != null ? Math.round(Number(o.confianca)) : ''}</td>
                  <td className="py-1.5 px-2 max-w-[240px] truncate text-stone-600 dark:text-stone-300" title={[o.tipo_peca, o.chapa, o.fita, o.material, o.insumo].filter(Boolean).join(' · ')}>
                    {o.classificacao === 'PECA' ? [o.tipo_peca, o.chapa, o.fita].filter(Boolean).join(' · ') : o.material ?? o.insumo ?? ''}
                  </td>
                  <td className="py-1.5 px-2 text-right">{o.quantidade}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap font-mono">{o.comprimento_mm != null && `${mm(o.comprimento_mm)} × ${mm(o.largura_mm)} × ${mm(o.espessura_mm)}`}</td>
                </tr>
              );
            })}
            {!visiveis.length && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-stone-500">Nada neste filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {marcados.size > 0 && (
        <EdicaoEmMassa
          importacaoId={importacaoId}
          objetos={objetos}
          ids={[...marcados]}
          temArquiteto={temArquiteto}
          onGravado={(msg) => {
            onMarcar(new Set());
            onGravado(msg);
          }}
        />
      )}
    </div>
  );
};

type Opcoes = Record<'tipos' | 'chapas' | 'fitas' | 'ferragens' | 'insumos', OpcaoRef[]>;

/** Painel de edição dos marcados: campo vazio = não muda */
const EdicaoEmMassa: React.FC<{ importacaoId: number; objetos: ObjetoImportacao[]; ids: number[]; temArquiteto: boolean; onGravado: (msg: string) => void }> = ({
  importacaoId,
  objetos,
  ids,
  temArquiteto,
  onGravado,
}) => {
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [lembrar, setLembrar] = useState(false);
  const [regra, setRegra] = useState<LembrarRegra>({ origem: 'COMPONENTE', padrao: '', escopo: 'GLOBAL' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primeiro = objetos.find((o) => o.id === ids[0])!;
  const moveis = objetos.filter((o) => o.classificacao === 'MOVEL').map((o) => ({ value: String(o.id), label: o.nome }));

  useEffect(() => {
    Promise.all([
      fetchOptions('tipos_peca', 'nome'),
      fetchOptions('materias_primas', 'descricao', { campo: 'tipo', valor: 'CHAPA' }),
      fetchOptions('materias_primas', 'descricao', { campo: 'tipo', valor: 'FITA_BORDA' }),
      fetchOptions('materiais', 'descricao'),
      fetchOptions('insumos', 'descricao'),
    ])
      .then(([tipos, chapas, fitas, ferragens, insumos]) => setOpcoes({ tipos, chapas, fitas, ferragens, insumos }))
      .catch((e) => setErro(e.message));
  }, []);

  // Regra sugerida a partir do primeiro marcado: componente, senão nome do nó
  useEffect(() => {
    setRegra((r) => ({ ...r, origem: primeiro?.nome_definicao ? 'COMPONENTE' : 'NO', padrao: primeiro?.nome_definicao ?? primeiro?.nome ?? '' }));
  }, [primeiro?.id]);
  const textoDaOrigem = (origem: string) => (origem === 'MATERIAL' ? primeiro?.material_dae : origem === 'COMPONENTE' ? primeiro?.nome_definicao : primeiro?.nome) ?? '';

  const classe = v.classificacao || (ids.length === 1 ? primeiro?.classificacao : '');
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  const campo = (rotulo: string, k: string, opts: OpcaoRef[] | undefined) => (
    <div className={FIELD_CLASS}>
      <label className={LABEL_CLASS}>{rotulo}</label>
      <SelectBusca value={v[k] ?? ''} options={opts ?? []} onChange={(x) => set(k, x)} vazioLabel="— Não alterar —" className={`${INPUT_CLASS} w-full`} />
    </div>
  );
  const numero = (rotulo: string, k: string, scale: number) => (
    <div className={FIELD_CLASS}>
      <label className={LABEL_CLASS}>{rotulo}</label>
      <NumberField value={v[k] ?? ''} onChange={(x) => set(k, x)} scale={scale} className={`${INPUT_CLASS} w-full`} />
    </div>
  );

  const aplicar = async () => {
    const campos: Record<string, string> = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x != null));
    // Número zerado no campo bancário = não mexer
    for (const k of ['quantidade', 'comprimento_mm', 'largura_mm', 'espessura_mm']) if (campos[k] !== undefined && !(Number(campos[k]) > 0)) delete campos[k];
    if (!Object.keys(campos).length && !lembrar) return setErro('Nada a alterar: escolha um campo ou ligue "Lembrar esta regra".');
    setSalvando(true);
    setErro(null);
    try {
      const r = await salvarRevisao(importacaoId, ids, campos, lembrar ? regra : undefined);
      setV({});
      setLembrar(false);
      onGravado(`${ids.length} ${ids.length === 1 ? 'objeto revisado' : 'objetos revisados'}${r.mapeamentoId ? `; regra nº ${r.mapeamentoId} criada` : ''}.`);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="border-t-2 border-blue-500 bg-stone-50 dark:bg-stone-950/60 p-3 space-y-3 max-h-[55%] overflow-y-auto">
      <div className="text-xs font-semibold">
        Editar {ids.length} {ids.length === 1 ? 'objeto marcado' : 'objetos marcados'} <span className="font-normal text-stone-500">· campo vazio não muda</span>
      </div>
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}
      {!opcoes ? (
        <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className={FIELD_CLASS}>
            <label className={LABEL_CLASS}>Classificação</label>
            <select value={v.classificacao ?? ''} onChange={(e) => set('classificacao', e.target.value)} className={`${INPUT_CLASS} w-full cursor-pointer`}>
              <option value="">— Não alterar —</option>
              {['PECA', 'FERRAGEM', 'INSUMO', 'IGNORAR', 'DESCONHECIDO'].map((c) => (
                <option key={c} value={c}>{ROTULO_CLASSE[c]}</option>
              ))}
            </select>
          </div>
          {(!classe || classe === 'PECA') && (
            <>
              {campo('Tipo de peça', 'tipo_peca_id', opcoes.tipos)}
              {campo('Chapa', 'materia_prima_id', opcoes.chapas)}
              {campo('Fita', 'fita_borda_id', opcoes.fitas)}
            </>
          )}
          {(!classe || classe === 'FERRAGEM') && campo('Ferragem', 'material_id', opcoes.ferragens)}
          {(!classe || classe === 'INSUMO') && campo('Insumo', 'insumo_id', opcoes.insumos)}
          {moveis.length > 1 && campo('Mover para o móvel', 'parent_id', moveis)}
          {numero('Quantidade', 'quantidade', 0)}
          {ids.length === 1 && (
            <>
              {numero('Comprimento (mm)', 'comprimento_mm', 2)}
              {numero('Largura (mm)', 'largura_mm', 2)}
              {numero('Espessura (mm)', 'espessura_mm', 2)}
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Toggle size="sm" checked={lembrar} onChange={setLembrar} label="Lembrar esta regra" />
        {lembrar && (
          <>
            <div className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>Comparar</label>
              <select
                value={regra.origem}
                onChange={(e) => setRegra({ ...regra, origem: e.target.value as LembrarRegra['origem'], padrao: textoDaOrigem(e.target.value) })}
                className={`${INPUT_CLASS} cursor-pointer`}
              >
                <option value="COMPONENTE">Componente</option>
                <option value="NO">Nome do nó</option>
                <option value="MATERIAL">Material</option>
              </select>
            </div>
            <div className={`${FIELD_CLASS} flex-1 min-w-[160px]`}>
              <label className={LABEL_CLASS}>Texto (igual)</label>
              <input value={regra.padrao} onChange={(e) => setRegra({ ...regra, padrao: e.target.value })} required className={`${INPUT_CLASS} w-full`} />
            </div>
            <div className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>Vale para</label>
              <select value={regra.escopo} onChange={(e) => setRegra({ ...regra, escopo: e.target.value as LembrarRegra['escopo'] })} className={`${INPUT_CLASS} cursor-pointer`}>
                <option value="GLOBAL">Todos os projetos</option>
                {temArquiteto && <option value="ARQUITETO">Só este arquiteto</option>}
              </select>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={aplicar}
          disabled={salvando}
          className="ml-auto flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
        >
          {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Aplicar
        </button>
      </div>
      <p className="text-[11px] text-stone-500">
        A regra é criada a partir do primeiro objeto marcado ({primeiro?.nome}), já com a correção aplicada; a importação seguinte casa pelo texto exato.
      </p>
    </div>
  );
};
