import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, FileText, FlipHorizontal2, Loader2, RefreshCw, X } from 'lucide-react';
import { getRecord, fetchObjetosImportacao, fetchMalhaImportacao, reclassificarImportacao, MalhaImportacao, ObjetoImportacao } from '../services/api';
import { RegistroCrud } from '../types';
import { STATUS_COLORS, formatDateTimeBR } from '../utils/formatters';
import { AvisoErro } from './AvisoErro';
import { Visualizador3D } from './Visualizador3D';
import { RevisaoImportacao, ROTULO_CLASSE, juntadosEm } from './RevisaoImportacao';
import { GerarOrcamento } from './GerarOrcamento';

const mm = (v: string | null) => (v == null ? '' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(v)));
const ROTULO = ROTULO_CLASSE;

/** Importação aberta: revisão/árvore à esquerda, visualizador 3D à direita; a seleção vale nos dois */
export const ImportacaoView: React.FC<{ registro: RegistroCrud; onFechar: () => void; onToast: (m: string) => void }> = ({ registro, onFechar, onToast }) => {
  const id = registro.id as number;
  const [imp, setImp] = useState<RegistroCrud>(registro);
  const [objetos, setObjetos] = useState<ObjetoImportacao[] | null>(null);
  const [malha, setMalha] = useState<MalhaImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [verAvisos, setVerAvisos] = useState(false);
  const [aba, setAba] = useState<'revisao' | 'arvore'>('revisao');
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [gerando, setGerando] = useState(false);
  const [reclassificando, setReclassificando] = useState(false);
  const [temArquiteto, setTemArquiteto] = useState(false);
  const [versao, setVersao] = useState(0);
  const recarregar = () => setVersao((v) => v + 1);

  useEffect(() => {
    if (imp.orcamento_id) getRecord('orcamentos', imp.orcamento_id).then((o) => setTemArquiteto(Boolean(o.arquiteto_id))).catch(() => {});
  }, [imp.orcamento_id]);

  // Objetos (com a classificação) recarregam a cada gravação; a malha só uma vez
  useEffect(() => {
    let vivo = true;
    getRecord('importacoes_dae', id).then((r) => vivo && setImp(r)).catch(() => {});
    fetchObjetosImportacao(id)
      .then((l) => vivo && setObjetos(l))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [id, versao]);

  useEffect(() => {
    let vivo = true;
    fetchObjetosImportacao(id)
      .then((l) => vivo && setAbertos(new Set(l.filter((o) => o.nivel === 0).map((o) => o.id))))
      .catch(() => {});
    if (registro.status !== 'ERRO') fetchMalhaImportacao(id).then((m) => vivo && setMalha(m)).catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [id, registro.status]);

  const filhos = useMemo(() => {
    const m = new Map<number | null, ObjetoImportacao[]>();
    for (const o of objetos ?? []) {
      if (!m.has(o.parent_id)) m.set(o.parent_id, []);
      m.get(o.parent_id)!.push(o);
    }
    return m;
  }, [objetos]);
  const porId = useMemo(() => new Map((objetos ?? []).map((o) => [o.id, o])), [objetos]);

  /** Escolher um móvel/grupo destaca todas as peças dentro dele */
  const destacados = useMemo(() => {
    const s = new Set<number>();
    const juntar = (oid: number) => {
      s.add(oid);
      for (const f of filhos.get(oid) ?? []) juntar(f.id);
    };
    if (selecionado !== null) {
      juntar(selecionado);
      // Peça de uma junção: destaca também os objetos somados nela
      const p = porId.get(selecionado);
      if (p) for (const j of juntadosEm(p, objetos ?? [])) s.add(j.id);
    }
    for (const m of marcados) s.add(m);
    return s;
  }, [selecionado, filhos, marcados, porId, objetos]);

  // Peça escolhida no 3D: abre os grupos acima dela e rola a árvore até a linha
  const arvore = useRef<HTMLDivElement>(null);
  const selecionar = (oid: number | null) => {
    setSelecionado(oid);
    if (oid === null) return;
    setAbertos((a) => {
      const n = new Set(a);
      for (let p = porId.get(oid)?.parent_id ?? null; p !== null; p = porId.get(p)?.parent_id ?? null) n.add(p);
      return n;
    });
    requestAnimationFrame(() => document.querySelector(`[data-objeto="${oid}"]`)?.scrollIntoView({ block: "nearest" }));
  };

  const avisos: { caminho: string; mensagem: string }[] = useMemo(() => {
    try {
      return typeof imp.log === 'string' ? JSON.parse(imp.log) : imp.log ?? [];
    } catch {
      return [];
    }
  }, [imp.log]);

  const linha = (o: ObjetoImportacao): React.ReactNode => {
    const sub = filhos.get(o.id) ?? [];
    const aberto = abertos.has(o.id);
    const sel = selecionado === o.id;
    return (
      <React.Fragment key={o.id}>
        <tr
          data-objeto={o.id}
          onClick={() => selecionar(sel ? null : o.id)}
          className={`cursor-pointer border-b border-stone-100 dark:border-stone-800 ${
            sel ? 'bg-amber-50 dark:bg-amber-950/30' : destacados.has(o.id) ? 'bg-amber-50/40 dark:bg-amber-950/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
          }`}
        >
          <td className="py-1.5 pr-2 whitespace-nowrap" style={{ paddingLeft: 8 + o.nivel * 16 }}>
            <span className="inline-flex items-center gap-1 max-w-[260px]">
              {sub.length ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAbertos((a) => {
                      const n = new Set(a);
                      if (aberto) n.delete(o.id);
                      else n.add(o.id);
                      return n;
                    });
                  }}
                  className="p-0.5 text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  {aberto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              ) : (
                <span className="w-[18px]" />
              )}
              <span className={`truncate ${o.nivel === 0 ? 'font-semibold' : ''}`} title={o.caminho}>
                {o.nome}
              </span>
            </span>
          </td>
          <td className="py-1.5 px-2 truncate max-w-[160px] text-stone-500" title={o.nome_definicao ?? ''}>{o.nome_definicao}</td>
          <td className="py-1.5 px-2 truncate max-w-[140px] text-stone-500" title={o.material_dae ?? ''}>{o.material_dae}</td>
          <td className="py-1.5 px-2 text-right">{o.comprimento_mm != null ? o.quantidade : ''}</td>
          <td className="py-1.5 px-2 text-right whitespace-nowrap font-mono">
            {o.comprimento_mm != null && `${mm(o.comprimento_mm)} × ${mm(o.largura_mm)} × ${mm(o.espessura_mm)}`}
          </td>
          <td className="py-1.5 px-2">
            <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_COLORS[o.classificacao] ?? ''}`}>
              {ROTULO[o.classificacao] ?? o.classificacao}
            </span>
          </td>
          <td className="py-1.5 px-2 whitespace-nowrap text-stone-400">
            {o.eh_retangular === 0 && (
              <span title="Peça com recorte/curva — medida pela caixa externa">
                <AlertTriangle className="w-3.5 h-3.5 inline text-amber-500" />
              </span>
            )}
            {Number(o.espelhado) === 1 && (
              <span title="Espelhada (escala negativa no modelo)">
                <FlipHorizontal2 className="w-3.5 h-3.5 inline ml-1" />
              </span>
            )}
          </td>
        </tr>
        {aberto && sub.map(linha)}
      </React.Fragment>
    );
  };

  const pecas = (objetos ?? []).filter((o) => o.comprimento_mm != null);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {/* Cabeçalho */}
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-semibold text-sm truncate max-w-[320px]" title={imp.arquivo_nome}>{imp.arquivo_nome}</span>
        <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[imp.status] ?? ''}`}>{imp.status}</span>
        <span className="text-stone-500">
          {imp.ferramenta_origem || 'origem desconhecida'} · {imp.unidade_nome || '?'} · {imp.eixo_up || '?'} · {formatDateTimeBR(imp.created_at)}
        </span>
        {objetos && (
          <span className="text-stone-500">
            {objetos.length} objetos · {pecas.length} peças candidatas ({pecas.reduce((s, o) => s + Number(o.quantidade), 0)} unidades)
          </span>
        )}
        {avisos.length > 0 && (
          <button type="button" onClick={() => setVerAvisos((v) => !v)} className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold cursor-pointer">
            <AlertTriangle className="w-3.5 h-3.5" /> {avisos.length} {avisos.length === 1 ? 'aviso' : 'avisos'}
          </button>
        )}
        {imp.status !== 'ERRO' && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={reclassificando}
              onClick={async () => {
                setReclassificando(true);
                try {
                  const r = await reclassificarImportacao(id);
                  onToast(`${r.reclassificados} objetos reclassificados (os já revisados ficaram como estão).`);
                  recarregar();
                } catch (e: any) {
                  setErro(e.message);
                } finally {
                  setReclassificando(false);
                }
              }}
              title="Aplicar de novo as regras e mapeamentos atuais aos objetos ainda não revisados"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reclassificando ? 'animate-spin' : ''}`} /> Reclassificar
            </button>
            <button
              type="button"
              onClick={() => setGerando(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" /> Gerar orçamento
            </button>
          </div>
        )}
        <button type="button" onClick={onFechar} title="Fechar" className={`${imp.status === 'ERRO' ? 'ml-auto ' : ''}p-1 rounded text-stone-400 hover:text-stone-700 cursor-pointer`}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {verAvisos && (
        <ul className="px-4 py-2 border-b border-stone-200 dark:border-stone-800 max-h-32 overflow-y-auto text-xs text-amber-800 dark:text-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          {avisos.map((a, i) => (
            <li key={i}>
              <b>{a.caminho}</b>: {a.mensagem}
            </li>
          ))}
        </ul>
      )}
      {imp.status === 'ERRO' && <AvisoErro mensagem={imp.mensagem_erro || 'A importação falhou.'} onFechar={onFechar} className="m-4" />}
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} className="m-4" />}

      {gerando && (
        <GerarOrcamento
          importacaoId={id}
          orcamentoInicial={imp.orcamento_id ? String(imp.orcamento_id) : ''}
          onFechar={() => setGerando(false)}
          onGerado={(msg) => {
            setGerando(false);
            onToast(msg);
            recarregar();
          }}
        />
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-h-0 flex flex-col border-r border-stone-200 dark:border-stone-800">
          <div className="flex gap-4 px-3 border-b border-stone-200 dark:border-stone-800 text-xs font-semibold">
            {(['revisao', 'arvore'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAba(a)}
                className={`py-2 border-b-2 cursor-pointer ${aba === a ? 'border-blue-600 text-blue-700 dark:text-blue-300' : 'border-transparent text-stone-500 hover:text-stone-800'}`}
              >
                {a === 'revisao' ? 'Revisão' : 'Árvore'}
              </button>
            ))}
          </div>
          {aba === 'revisao' && objetos ? (
            <div className="flex-1 min-h-0">
              <RevisaoImportacao
                importacaoId={id}
                objetos={objetos}
                marcados={marcados}
                onMarcar={setMarcados}
                selecionado={selecionado}
                onSelecionar={selecionar}
                temArquiteto={temArquiteto}
                onGravado={(msg) => {
                  onToast(msg);
                  recarregar();
                }}
              />
            </div>
          ) : (
        <div ref={arvore} className="flex-1 min-h-0 overflow-auto">
          {!objetos ? (
            <div className="p-8 text-center text-stone-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-stone-50 dark:bg-stone-950 text-stone-500 text-left">
                <tr>
                  <th className="py-2 px-2 font-semibold">Objeto</th>
                  <th className="py-2 px-2 font-semibold">Componente</th>
                  <th className="py-2 px-2 font-semibold">Material</th>
                  <th className="py-2 px-2 font-semibold text-right">Qtd</th>
                  <th className="py-2 px-2 font-semibold text-right">C × L × E (mm)</th>
                  <th className="py-2 px-2 font-semibold">Classificação</th>
                  <th />
                </tr>
              </thead>
              <tbody>{(filhos.get(null) ?? []).map(linha)}</tbody>
            </table>
          )}
        </div>
          )}
        </div>
        <div className="min-h-[300px]">
          {malha ? (
            <Visualizador3D malha={malha} destacados={destacados} onSelecionar={selecionar} />
          ) : (
            imp.status !== 'ERRO' && (
              <div className="h-full flex items-center justify-center text-stone-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando o modelo…
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
