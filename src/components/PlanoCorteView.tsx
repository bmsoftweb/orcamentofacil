import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { fetchPlanoCorte, PlanoCorte, PlanoChapa } from '../services/api';
import { formatDateTimeBR } from '../utils/formatters';
import { svgChapa, CORES_MOVEL as CORES } from '../lib/pdf/planoSvg';


const mm = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v);

interface Props {
  orcamentoId: number;
  onFechar: () => void;
  /** Dentro da aba do orçamento (sem tela cheia nem botão de fechar) */
  embutido?: boolean;
}

/** Plano de corte do orçamento: um desenho por chapa, com cotas, cor por móvel e sobras hachuradas */
export const PlanoCorteView: React.FC<Props> = ({ orcamentoId, onFechar, embutido }) => {
  const [dados, setDados] = useState<PlanoCorte | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetchPlanoCorte(orcamentoId).then(setDados).catch((e) => setErro(e.message));
    if (embutido) return;
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [orcamentoId, onFechar, embutido]);

  const corMovel = useMemo(() => new Map((dados?.moveis ?? []).map((m, i) => [m.id, CORES[i % CORES.length]])), [dados]);
  const pecaPorId = useMemo(() => new Map((dados?.pecas ?? []).map((p) => [p.id, p])), [dados]);
  const total = dados?.chapas.reduce((s, c) => s + c.planos.length, 0) ?? 0;
  const parar = (e: React.SyntheticEvent) => e.stopPropagation();

  const tela = (
    <div
      className={embutido ? 'flex-1 min-h-0 flex flex-col' : 'fixed inset-0 z-[60] bg-white dark:bg-stone-950 flex flex-col'}
      onClick={parar}
      onDoubleClick={parar}
      onMouseDown={embutido ? undefined : parar}
    >
      <div className="px-5 py-3 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="text-base font-bold">Plano de corte {dados && `· ${dados.orcamento.numero}${dados.orcamento.revisao ? ` rev. ${dados.orcamento.revisao}` : ''}`}</h2>
        {dados && (
          <span className="text-xs text-stone-500">
            {total} {total === 1 ? 'chapa' : 'chapas'} · serra {mm(dados.kerf)} mm · refilo {mm(dados.refilo)} mm
            {dados.orcamento.calculado_em && ` · calculado em ${formatDateTimeBR(dados.orcamento.calculado_em)}`}
          </span>
        )}
        <div className="flex flex-wrap gap-3 text-xs">
          {dados?.moveis.map((m) => (
            <span key={m.id} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm border" style={{ background: corMovel.get(m.id)![0], borderColor: corMovel.get(m.id)![1] }} />
              {m.descricao}
              {m.quantidade > 1 && ` (×${m.quantidade})`}
            </span>
          ))}
          {dados && (
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12">
                <rect width="12" height="12" fill="url(#hachura-legenda)" stroke="#a8a29e" />
                <defs>
                  <pattern id="hachura-legenda" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="4" stroke="#a8a29e" strokeWidth="1.5" />
                  </pattern>
                </defs>
              </svg>
              Sobra
            </span>
          )}
        </div>
        {!embutido && (
          <button type="button" onClick={onFechar} title="Fechar (Esc)" className="ml-auto p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-8">
        {erro && <p className="text-sm text-rose-600">{erro}</p>}
        {!dados && !erro && (
          <div className="text-sm text-stone-500">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando…
          </div>
        )}
        {dados && !dados.chapas.length && !dados.erros.length && (
          <p className="text-sm text-stone-500">Sem plano: calcule o orçamento (menu "..." › Calcular) depois de gerar as peças.</p>
        )}
        {dados && dados.erros.length > 0 && (
          <div className="p-3 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs text-rose-800 dark:text-rose-300">
            <div className="font-semibold flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-4 h-4" /> Peças fora do plano (não cabem na chapa)
            </div>
            {dados.erros.map((e) => (
              <div key={e.peca_id}>
                {e.faltam}× {e.descricao} — {e.medidas} mm
              </div>
            ))}
          </div>
        )}

        {dados?.chapas.map((c) => (
          <section key={c.materia_prima_id}>
            <h3 className="text-sm font-semibold mb-1">
              {c.descricao} <span className="font-normal text-stone-500">· {mm(c.comprimento)} × {mm(c.largura)} mm · {c.planos.length} {c.planos.length === 1 ? 'chapa' : 'chapas'}{c.possui_veio ? ' · com veio' : ''}</span>
            </h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {c.planos.map((pl) => (
                <DesenhoChapa key={pl.numero} plano={pl} chapa={c} total={c.planos.length} refilo={dados.refilo} pecaPorId={pecaPorId} corMovel={corMovel} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
  return embutido ? tela : createPortal(tela, document.body);
};

const DesenhoChapa: React.FC<{
  plano: PlanoChapa;
  chapa: { comprimento: number; largura: number; descricao: string; materia_prima_id: number };
  total: number;
  refilo: number;
  pecaPorId: Map<number, PlanoCorte['pecas'][number]>;
  corMovel: Map<number, string[]>;
}> = ({ plano, chapa, total, refilo, pecaPorId, corMovel }) => {
  // Mesmo desenho do PDF (src/lib/pdf/planoSvg.ts)
  const svg = useMemo(
    () => svgChapa(plano, chapa, refilo, pecaPorId as unknown as Map<number, { descricao: string; movel_id: number }>, corMovel, `${chapa.materia_prima_id}-${plano.numero}`),
    [plano, chapa, refilo, pecaPorId, corMovel],
  );
  return (
    <figure className="border border-stone-200 dark:border-stone-800 rounded-lg p-3">
      <figcaption className="text-xs mb-2 flex justify-between">
        <span className="font-semibold">
          Chapa {plano.numero}/{total}
        </span>
        <span className="text-stone-500">
          {plano.pecas.length} peças · {mm(plano.area_pecas_m2)} m² · aproveitamento {mm(plano.aproveitamento)}%
        </span>
      </figcaption>
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </figure>
  );
};
