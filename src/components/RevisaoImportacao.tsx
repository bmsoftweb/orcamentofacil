import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Combine, Info, Loader2 } from 'lucide-react';
import { fetchOptions, salvarRevisao, juntarObjetos, ObjetoImportacao, LembrarRegra } from '../services/api';
import { OpcaoRef } from '../types';
import { STATUS_COLORS } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_CLASS } from '../utils/formStyles';
import { SelectBusca } from './SelectBusca';
import { NumberField } from './NumberField';
import { Toggle } from './Toggle';
import { AvisoErro } from './AvisoErro';
import { ConfirmDialog } from './ConfirmDialog';
import { somadoEm } from '../lib/texto';

export const ROTULO_CLASSE: Record<string, string> = {
  MOVEL: 'Móvel',
  GRUPO: 'Grupo',
  PECA: 'Peça',
  FERRAGEM: 'Ferragem',
  INSUMO: 'Insumo',
  IGNORAR: 'Ignorar',
  DESCONHECIDO: 'A classificar',
};
const FILTROS = ['TODOS', 'DESCONHECIDO', 'PECA', 'FERRAGEM', 'INSUMO', 'IGNORAR'] as const;
const ROTULO_FILTRO: Record<string, string> = { TODOS: 'Todos', ...ROTULO_CLASSE };
/** Abaixo disto a confiança aparece em destaque e a linha sobe na lista */
const CONFIANCA_BAIXA = 60;

const mm = (v: string | null) => (v == null ? '' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(v)));
const baixa = (o: ObjetoImportacao) => o.classificacao !== 'IGNORAR' && Number(o.confianca ?? 0) < CONFIANCA_BAIXA;
const nomeDe = (o: ObjetoImportacao) => (o.nome_definicao && /^(group|instance)/i.test(o.nome) ? o.nome_definicao : o.nome);
/** Objetos somados numa peça pela junção ("Somado em "nome" (nº id)"; as primeiras junções só tinham o nome) */
export const juntadosEm = (p: ObjetoImportacao, objetos: ObjetoImportacao[]) => objetos.filter((o) => somadoEm(o, p));
/** No agrupamento, a principal é a peça já existente marcada (recebe os novos); senão, a primeira marcada */
const principalDa = (ids: number[], objetos: ObjetoImportacao[]) => {
  const marcados = ids.map((id) => objetos.find((o) => o.id === id)!).filter(Boolean);
  return marcados.find((o) => o.classificacao === 'PECA') ?? marcados.find((o) => juntadosEm(o, objetos).length) ?? marcados[0];
};
/** Peça: tipo, chapa e fita; a classificar: a sugestão do classificador (vira a peça ao confirmar) */
const detalheDe = (o: ObjetoImportacao) => (o.classificacao === 'PECA' || o.classificacao === 'DESCONHECIDO' ?[o.tipo_peca, o.chapa, o.fita].filter(Boolean).join(' · ') : o.material ?? o.insumo ?? '');

/** Colunas ordenáveis pelo cabeçalho: valor de comparação de cada uma */
const COLUNAS: { chave: string; rotulo: string; direita?: boolean; valor: (o: ObjetoImportacao) => string | number[] }[] = [
  { chave: 'nome', rotulo: 'Objeto', valor: (o) => nomeDe(o) ?? '' },
  { chave: 'classe', rotulo: 'Classificação', valor: (o) => ROTULO_CLASSE[o.classificacao] ?? o.classificacao },
  { chave: 'conf', rotulo: 'Conf.', direita: true, valor: (o) => [Number(o.confianca ?? 0)] },
  { chave: 'detalhe', rotulo: 'Tipo / Chapa / Fita · Item', valor: detalheDe },
  { chave: 'qtd', rotulo: 'Qtd', direita: true, valor: (o) => [Number(o.quantidade)] },
  { chave: 'medidas', rotulo: 'C × L × E (mm)', direita: true, valor: (o) => [Number(o.comprimento_mm ?? 0), Number(o.largura_mm ?? 0), Number(o.espessura_mm ?? 0)] },
];
const comparar = (a: string | number[], b: string | number[]) =>
  typeof a === 'string' ? a.localeCompare(b as string, 'pt-BR', { numeric: true, sensitivity: 'base' }) : a.reduce((r, x, i) => r || x - (b as number[])[i], 0);

/** Cores das medidas repetidas (lista, bolinha e 3D); sem âmbar, que é a cor da seleção no 3D */
const CORES_MEDIDA = ['#0ea5e9', '#10b981', '#f43f5e', '#8b5cf6', '#84cc16', '#06b6d4', '#d946ef', '#6366f1', '#14b8a6', '#ec4899'];
const chaveMedida = (o: ObjetoImportacao) => (o.comprimento_mm == null ? '' : [o.comprimento_mm, o.largura_mm, o.espessura_mm].map((x) => Math.round(Number(x))).join('x'));

/**
 * Cor de cada objeto cuja medida (C × L × E, ao milímetro) se repete; medida única fica sem cor.
 * Não depende do filtro: as medidas repetidas são coloridas da maior para a menor, então a cor é a mesma na lista e no 3D.
 */
export function coresPorMedida(objetos: ObjetoImportacao[]): Map<number, string> {
  const pecas = objetos.filter((o) => o.classificacao !== 'MOVEL' && o.classificacao !== 'GRUPO' && chaveMedida(o));
  const grupos = new Map<string, ObjetoImportacao[]>();
  for (const o of pecas) grupos.set(chaveMedida(o), [...(grupos.get(chaveMedida(o)) ?? []), o]);
  const repetidas = [...grupos.entries()].filter(([, l]) => l.length > 1).sort(([a], [b]) => comparar(b.split('x').map(Number), a.split('x').map(Number)));
  const cor = new Map<number, string>();
  repetidas.forEach(([, l], i) => l.forEach((o) => cor.set(o.id, CORES_MEDIDA[i % CORES_MEDIDA.length])));
  return cor;
}


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
  /** Avisa o filtro escolhido (o 3D esconde os já classificados em "A classificar") */
  onFiltro?: (filtro: string) => void;
}

/** Lista de revisão: desconhecidos e baixa confiança primeiro, filtros com contadores e edição em massa */
export const RevisaoImportacao: React.FC<Props> = ({ importacaoId, objetos, marcados, onMarcar, selecionado, onSelecionar, onGravado, temArquiteto, onFiltro }) => {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('TODOS');
  useEffect(() => onFiltro?.(filtro), [filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  // Abre ordenada pelas medidas (maiores primeiro): objetos iguais ficam lado a lado
  const [ordem, setOrdem] = useState<{ chave: string; desc: boolean } | null>({ chave: 'medidas', desc: true });
  const candidatos = useMemo(
    () =>
      objetos
        .filter((o) => o.classificacao !== 'MOVEL' && o.classificacao !== 'GRUPO')
        .sort((a, b) => Number(b.classificacao === 'DESCONHECIDO') - Number(a.classificacao === 'DESCONHECIDO') || Number(baixa(b)) - Number(baixa(a)) || Number(a.confianca ?? 0) - Number(b.confianca ?? 0) || a.id - b.id),
    [objetos],
  );
  const contagem = (f: string) => (f === 'TODOS' ? candidatos.length : candidatos.filter((o) => o.classificacao === f).length);
  const filtrados = candidatos.filter((o) => filtro === 'TODOS' || o.classificacao === filtro);
  const coluna = COLUNAS.find((c) => c.chave === ordem?.chave);
  const visiveis = coluna ? [...filtrados].sort((a, b) => comparar(coluna.valor(a), coluna.valor(b)) * (ordem!.desc ? -1 : 1) || a.id - b.id) : filtrados;
  const corDe = useMemo(() => coresPorMedida(objetos), [objetos]);
  // Painel de edição: os marcados; sem marcados, a linha clicada (ex.: a peça agrupada, para dar tipo, chapa, fita…)
  const emEdicao = marcados.size ? [...marcados] : candidatos.some((o) => o.id === selecionado) ? [selecionado!] : [];
  // Clique no cabeçalho: crescente, decrescente e volta à ordem padrão (a classificar e baixa confiança primeiro)
  const ordenar = (chave: string) => setOrdem((o) => (o?.chave !== chave ? { chave, desc: false } : !o.desc ? { chave, desc: true } : null));
  const todosMarcados = visiveis.length > 0 && visiveis.every((o) => marcados.has(o.id));

  // Peça clicada no 3D fora do filtro atual: vai para o filtro da classificação dela e localiza a linha
  useEffect(() => {
    const o = candidatos.find((c) => c.id === selecionado);
    if (!o) return;
    if (!visiveis.includes(o)) setFiltro(o.classificacao as (typeof FILTROS)[number]);
    // Dois quadros: o primeiro desenha a lista do filtro novo
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(`[data-objeto="${o.id}"]`)?.scrollIntoView({ block: 'nearest' })));
  }, [selecionado]); // eslint-disable-line react-hooks/exhaustive-deps

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
              <th className="py-2 pl-3 w-8 whitespace-nowrap">
                <span className="inline-block w-2.5 mr-1.5" />
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  onChange={() => onMarcar(todosMarcados ? new Set([...marcados].filter((id) => !visiveis.some((o) => o.id === id))) : new Set([...marcados, ...visiveis.map((o) => o.id)]))}
                  title="Marcar todos os da lista"
                />
              </th>
              {COLUNAS.map((c) => (
                <th key={c.chave} className={`py-2 px-2 font-semibold ${c.direita ? 'text-right' : ''}`}>
                  <button
                    type="button"
                    onClick={() => ordenar(c.chave)}
                    title="Ordenar por esta coluna"
                    className={`inline-flex items-center gap-1 cursor-pointer hover:text-stone-800 dark:hover:text-stone-100 ${ordem?.chave === c.chave ? 'text-blue-600' : ''}`}
                  >
                    {c.rotulo}
                    {ordem?.chave === c.chave && (ordem.desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((o) => {
              const sel = selecionado === o.id;
              const juntados = sel ? juntadosEm(o, objetos) : [];
              return (
                <React.Fragment key={o.id}>
                <tr
                  data-objeto={o.id}
                  onClick={() => onSelecionar(sel ? null : o.id)}
                  className={`cursor-pointer border-b border-stone-100 dark:border-stone-800 ${
                    sel ? 'bg-amber-50 dark:bg-amber-950/30' : marcados.has(o.id) ? 'bg-blue-50/60 dark:bg-blue-950/20' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                  }`}
                >
                  <td className="py-1.5 pl-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                      style={{ backgroundColor: corDe.get(o.id) ?? 'transparent' }}
                      title={corDe.has(o.id) ? 'Mesma cor = mesma medida (C × L × E)' : undefined}
                    />
                    <input type="checkbox" checked={marcados.has(o.id)} onChange={() => alternar(o.id)} />
                  </td>
                  <td className="py-1.5 px-2 max-w-[220px]">
                    <div className="truncate font-medium" title={o.caminho}>
                      {nomeDe(o)}
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
                    {detalheDe(o)}
                  </td>
                  <td className="py-1.5 px-2 text-right">{o.quantidade}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap font-mono">
                    {o.comprimento_mm != null && (
                      <span className="px-1.5 py-0.5 rounded" style={corDe.has(o.id) ? { backgroundColor: `${corDe.get(o.id)}40` } : undefined}>{`${mm(o.comprimento_mm)} × ${mm(o.largura_mm)} × ${mm(o.espessura_mm)}`}</span>
                    )}
                  </td>
                </tr>
                {/* Peça agrupada clicada: os objetos somados nela, logo abaixo */}
                {(juntados.length
                  ? [
                      // A própria peça também é um dos objetos agrupados: nome original (do caminho) e a quantidade dela
                      { ...o, nome: o.caminho.split('/').pop() ?? o.nome, nome_definicao: null, quantidade: o.quantidade - juntados.reduce((s, x) => s + Number(x.quantidade), 0) },
                      ...juntados,
                    ]
                  : []
                ).map((x) => (
                  <tr key={x.id} className="bg-amber-50/50 dark:bg-amber-950/15 border-b border-stone-100 dark:border-stone-800 text-stone-500">
                    <td />
                    <td className="py-1 px-2 pl-5 max-w-[220px] truncate" title={x.caminho}>↳ {nomeDe(x)}</td>
                    <td className="py-1 px-2 text-[10px]">agrupado</td>
                    <td />
                    <td className="py-1 px-2 truncate text-[10px]">{x.material_dae}</td>
                    <td className="py-1 px-2 text-right">{x.quantidade}</td>
                    <td className="py-1 px-2 text-right whitespace-nowrap font-mono">{x.comprimento_mm != null && `${mm(x.comprimento_mm)} × ${mm(x.largura_mm)} × ${mm(x.espessura_mm)}`}</td>
                  </tr>
                ))}
                </React.Fragment>
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

      {emEdicao.length > 0 && (
        <EdicaoEmMassa
          key={emEdicao.join(',')}
          importacaoId={importacaoId}
          objetos={objetos}
          ids={emEdicao}
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
  // Um objeto só: os campos abrem com os valores atuais dele; vários: vazios ("não alterar")
  const [v, setV] = useState<Record<string, string>>(() => {
    const o = ids.length === 1 ? objetos.find((x) => x.id === ids[0]) : undefined;
    if (!o) return {};
    const k = ['classificacao', 'tipo_peca_id', 'materia_prima_id', 'fita_borda_id', 'material_id', 'insumo_id', 'quantidade', 'comprimento_mm', 'largura_mm', 'espessura_mm'] as const;
    return Object.fromEntries(k.filter((c) => o[c] != null && o[c] !== '').map((c) => [c, String(o[c])]));
  });
  const [lembrar, setLembrar] = useState(false);
  const [regra, setRegra] = useState<LembrarRegra>({ origem: 'COMPONENTE', padrao: '', escopo: 'GLOBAL' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [juntando, setJuntando] = useState<string | null>(null);
  const primeiro = objetos.find((o) => o.id === ids[0])!;
  const principal = principalDa(ids, objetos);
  const somaQtd = ids.reduce((s, id) => s + Number(objetos.find((o) => o.id === id)?.quantidade ?? 0), 0);
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

  const aplicar = async (extra: Record<string, string> = {}) => {
    const campos: Record<string, string> = { ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x != null)), ...extra };
    // Número zerado no campo bancário = não mexer
    for (const k of ['quantidade', 'comprimento_mm', 'largura_mm', 'espessura_mm']) if (campos[k] !== undefined && !(Number(campos[k]) > 0)) delete campos[k];
    if (!Object.keys(campos).length && !lembrar) return setErro('Nada a alterar: escolha um campo ou ligue "Lembrar esta regra".');
    setSalvando(true);
    setErro(null);
    try {
      const r = await salvarRevisao(importacaoId, ids, campos, lembrar ? regra : undefined);
      // Um objeto: os campos continuam com o que acabou de ser gravado
      setLembrar(false);
      onGravado(`${ids.length} ${ids.length === 1 ? 'objeto revisado' : 'objetos revisados'}${r.mapeamentoId ? `; regra nº ${r.mapeamentoId} criada` : ''}.`);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  // Vira peça com a sugestão gravada (ou o que foi escolhido acima); sem chapa não dá para cortar
  // Entram só objetos "A classificar" e no máximo uma peça já existente (o servidor confere de novo)
  const abrirJuntar = () => {
    const fora = objetos.filter((o) => ids.includes(o.id) && o.classificacao !== 'DESCONHECIDO');
    const invalidos = fora.filter((o) => o.classificacao !== 'PECA');
    if (invalidos.length) return setErro(`Só dá para agrupar objetos que estão em "A classificar". Desmarque: ${invalidos.map(nomeDe).join(', ')}.`);
    if (fora.length > 1) return setErro(`Marque no máximo uma peça já existente (${fora.map(nomeDe).join(', ')}).`);
    setErro(null);
    setJuntando(nomeDe(principal) ?? '');
  };

  const confirmarPeca = () => {
    const semChapa = v.materia_prima_id ? [] : objetos.filter((o) => ids.includes(o.id) && !o.materia_prima_id);
    if (semChapa.length) return setErro(`Sem chapa sugerida: ${semChapa.map(nomeDe).join(', ')}. Escolha a chapa acima antes de confirmar.`);
    aplicar({ classificacao: 'PECA' });
  };

  // Vários marcados: só "Agrupar para Peça" (vira uma peça confirmada; os demais vão para Ignorar)
  if (ids.length > 1) {
    return (
      <div className="border-t-2 border-blue-500 bg-stone-50 dark:bg-stone-950/60 p-3 space-y-3">
        {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs">
            <span className="font-semibold">{ids.length} objetos marcados</span>
            <span className="text-stone-500"> · quantidade total {somaQtd}</span>
          </div>
          <button
            type="button"
            onClick={abrirJuntar}
            title="Os marcados viram uma peça só, com a soma das quantidades; a peça vai para Peça e os demais para Ignorar"
            className="ml-auto flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
          >
            <Combine className="w-3.5 h-3.5" />
            Agrupar para Peça
          </button>
        </div>

        {juntando !== null && (
          <ConfirmDialog
            titulo="Agrupar para Peça"
            mensagem={
              <>
                Os {ids.length} objetos marcados viram uma peça só, com quantidade {somaQtd}
                {juntadosEm(principal, objetos).length ? ` ("${nomeDe(principal)}" já é uma junção e recebe os demais)` : ''}. A peça vai para a aba
                "Peça" e os outros objetos para "Ignorar" (continuam visíveis no 3D).
                {!principal?.materia_prima_id && ' Sem chapa sugerida: escolha a chapa depois, na aba "Peça".'}
              </>
            }
            confirmar="Agrupar"
            tom="normal"
            onCancelar={() => setJuntando(null)}
            onConfirmar={async () => {
              if (!juntando.trim()) throw new Error('Informe o nome da peça.');
              const r = await juntarObjetos(importacaoId, ids, juntando, true);
              setJuntando(null);
              onGravado(`${ids.length} objetos agrupados na peça "${juntando.trim()}" (quantidade ${r.quantidade}).`);
            }}
          >
            <div className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>Nome da peça</label>
              <input value={juntando} onChange={(e) => setJuntando(e.target.value)} onFocus={(e) => e.target.select()} autoFocus required maxLength={255} className={`${INPUT_CLASS} w-full`} />
            </div>
          </ConfirmDialog>
        )}
      </div>
    );
  }

  return (
    <div className="border-t-2 border-blue-500 bg-stone-50 dark:bg-stone-950/60 p-3 space-y-3 max-h-[55%] overflow-y-auto">
      <div className="text-xs font-semibold">
        {ids.length === 1 ? `Editar "${nomeDe(primeiro)}"` : `Editar ${ids.length} objetos marcados`} <span className="font-normal text-stone-500">· campo vazio não muda</span>
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
          {(!classe || classe === 'PECA' || classe === 'DESCONHECIDO') && (
            <>
              {campo('Tipo de peça', 'tipo_peca_id', opcoes.tipos)}
              {campo('Chapa', 'materia_prima_id', opcoes.chapas)}
              {campo('Fita', 'fita_borda_id', opcoes.fitas)}
            </>
          )}
          {(!classe || classe === 'FERRAGEM') && campo('Ferragem', 'material_id', opcoes.ferragens)}
          {(!classe || classe === 'INSUMO') && campo('Insumo', 'insumo_id', opcoes.insumos)}
          {moveis.length > 1 && !juntadosEm(primeiro, objetos).length && campo('Mover para o móvel', 'parent_id', moveis)}
          {numero('Quantidade', 'quantidade', 0)}
          {ids.length === 1 && (
            // Medidas sempre juntas, numa linha própria
            <div className="col-span-full grid grid-cols-3 gap-3">
              {numero('Comprimento (mm)', 'comprimento_mm', 2)}
              {numero('Largura (mm)', 'largura_mm', 2)}
              {numero('Espessura (mm)', 'espessura_mm', 2)}
            </div>
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
          onClick={confirmarPeca}
          disabled={salvando}
          title="Vira peça com o tipo, a chapa e a fita sugeridos (ou escolhidos acima)"
          className="ml-auto flex items-center gap-1.5 border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
        >
          <Check className="w-3.5 h-3.5" />
          Confirmar como peça
        </button>
        <button
          type="button"
          onClick={() => aplicar()}
          disabled={salvando}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-60"
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
