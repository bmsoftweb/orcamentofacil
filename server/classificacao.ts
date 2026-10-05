import { vec3 } from 'gl-matrix';
import { pool } from './db.js';
import { classificar, Classificacao, EntradaClassificador } from '../src/lib/dae/classificador.js';
import type { ResultadoDae } from '../src/lib/dae/parser.js';

/** Retrato do catálogo e das regras para o classificador (só os ativos) */
export async function catalogoClassificador(): Promise<Omit<EntradaClassificador, 'objetos' | 'up' | 'arquitetoId'>> {
  const [[cfg], [maps], [mps], [tipos]] = await Promise.all([
    pool.query<any[]>('SELECT tolerancia_espessura_mm FROM configuracoes WHERE id = 1'),
    pool.query<any[]>('SELECT * FROM mapeamentos_dae WHERE ativo = 1'),
    pool.query<any[]>("SELECT id, tipo, espessura_mm, largura_mm, acabamento_id FROM materias_primas WHERE ativo = 1 AND tipo IN ('CHAPA', 'FITA_BORDA') ORDER BY id"),
    pool.query<any[]>('SELECT id, codigo, palavras_chave, respeita_veio, eh_frente FROM tipos_peca WHERE ativo = 1 ORDER BY ordem, id'),
  ]);
  const num = (x: any) => (x == null ? null : Number(x));
  return {
    toleranciaEspessura: Number(cfg[0]?.tolerancia_espessura_mm ?? 0.6),
    mapeamentos: maps.map((m) => ({
      id: m.id,
      origem: m.origem,
      padrao: m.padrao,
      modo: m.modo_comparacao,
      prioridade: m.prioridade,
      acao: m.acao,
      arquitetoId: num(m.arquiteto_id),
      acabamentoId: num(m.acabamento_id),
      materiaPrimaId: num(m.materia_prima_id),
      fitaBordaId: num(m.fita_borda_id),
      tipoPecaId: num(m.tipo_peca_id),
      materialId: num(m.material_id),
      insumoId: num(m.insumo_id),
    })),
    chapas: mps.filter((m) => m.tipo === 'CHAPA').map((m) => ({ id: m.id, espessura: Number(m.espessura_mm), acabamentoId: num(m.acabamento_id) })),
    fitas: mps.filter((m) => m.tipo === 'FITA_BORDA').map((m) => ({ id: m.id, largura: Number(m.largura_mm), acabamentoId: num(m.acabamento_id) })),
    tiposPeca: tipos.map((t) => ({ id: t.id, codigo: t.codigo, palavrasChave: String(t.palavras_chave ?? '').split(',').filter(Boolean), respeitaVeio: Boolean(t.respeita_veio), ehFrente: Boolean(t.eh_frente) })),
  };
}

const UP: Record<string, number[]> = { X_UP: [1, 0, 0], Y_UP: [0, 1, 0], Z_UP: [0, 0, 1] };

/** Classifica o resultado do parser com o catálogo atual; soma os usos em mapeamentos_dae.vezes_aplicado */
export async function classificarImportacao(r: ResultadoDae, arquitetoId: number | null): Promise<Map<number, Classificacao>> {
  const cat = await catalogoClassificador();
  const { resultados, usos } = classificar({ ...cat, objetos: r.objetos, up: vec3.clone(UP[r.meta.eixoUp] as unknown as vec3), arquitetoId });
  for (const [id, n] of usos) await pool.query('UPDATE mapeamentos_dae SET vezes_aplicado = vezes_aplicado + ? WHERE id = ?', [n, id]);
  // Peça só vira peça quando o usuário confirma na revisão: a classificação fica como sugestão (tipo, chapa, fita, medidas)
  for (const c of resultados.values()) {
    if (c.classificacao !== 'PECA') continue;
    c.classificacao = 'DESCONHECIDO';
    c.motivo = `Sugestão de peça: ${c.motivo}`;
  }
  return resultados;
}

/** Totais da importação pela classificação gravada */
export async function atualizarTotais(importacaoId: number | string) {
  await pool.query(
    `UPDATE importacoes_dae i SET
       total_objetos = (SELECT COUNT(*) FROM importacao_objetos o WHERE o.importacao_id = i.id),
       total_pecas = (SELECT COUNT(*) FROM importacao_objetos o WHERE o.importacao_id = i.id AND o.classificacao = 'PECA'),
       total_ferragens = (SELECT COUNT(*) FROM importacao_objetos o WHERE o.importacao_id = i.id AND o.classificacao = 'FERRAGEM'),
       total_ignorados = (SELECT COUNT(*) FROM importacao_objetos o WHERE o.importacao_id = i.id AND o.classificacao = 'IGNORAR'),
       total_desconhecidos = (SELECT COUNT(*) FROM importacao_objetos o WHERE o.importacao_id = i.id AND o.classificacao = 'DESCONHECIDO')
     WHERE i.id = ?`,
    [importacaoId],
  );
}
