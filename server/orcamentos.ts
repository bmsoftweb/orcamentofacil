import { pool } from './db.js';

/** Data local (Brasília) em aaaa-mm-dd, opcionalmente somando dias */
export function dataLocal(somarDias = 0): string {
  const d = new Date(Date.now() + somarDias * 86_400_000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Próximo número ORC-AAAA-NNNN pela tabela numeradores. A conexão é a mesma do UPDATE e do
 * SELECT LAST_INSERT_ID() (o valor é por conexão); a linha do ano é criada se faltar.
 */
export async function proximoNumeroOrcamento(): Promise<string> {
  const ano = Number(dataLocal().slice(0, 4));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("INSERT IGNORE INTO numeradores (chave, ano, ultimo_numero, prefixo) VALUES ('ORCAMENTO', ?, 0, 'ORC')", [ano]);
    await conn.query("UPDATE numeradores SET ultimo_numero = LAST_INSERT_ID(ultimo_numero + 1) WHERE chave = 'ORCAMENTO' AND ano = ?", [ano]);
    const [[r]] = await conn.query<any[]>("SELECT LAST_INSERT_ID() AS n, prefixo FROM numeradores WHERE chave = 'ORCAMENTO' AND ano = ?", [ano]);
    await conn.commit();
    return `${r.prefixo}-${ano}-${String(r.n).padStart(4, '0')}`;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Orçamento novo: número, datas, prazos e percentuais vêm da configuração (RT do arquiteto e
 * comissão do vendedor quando houver). Os percentuais ficam no orçamento (snapshot) e são editáveis.
 */
export async function prepararNovoOrcamento(payload: Record<string, any>, usuarioId: number) {
  const [[cfg]] = await pool.query<any[]>('SELECT * FROM configuracoes WHERE id = 1');
  const [[arq]] = payload.arquiteto_id ? await pool.query<any[]>('SELECT perc_rt FROM arquitetos WHERE id = ?', [payload.arquiteto_id]) : [[null]];
  const [[ven]] = payload.vendedor_id ? await pool.query<any[]>('SELECT perc_comissao FROM usuarios WHERE id = ?', [payload.vendedor_id]) : [[null]];
  Object.assign(payload, {
    numero: await proximoNumeroOrcamento(),
    revisao: 0,
    usuario_id: usuarioId,
    status: 'RASCUNHO',
    data_emissao: dataLocal(),
    data_validade: payload.data_validade ?? dataLocal(Number(cfg.validade_orcamento_dias)),
    prazo_entrega_dias: payload.prazo_entrega_dias ?? cfg.prazo_entrega_dias,
    criterio_cobranca_chapa: payload.criterio_cobranca_chapa ?? cfg.criterio_cobranca_chapa,
    perc_custo_fixo: cfg.perc_custo_fixo_padrao,
    perc_impostos: cfg.perc_impostos_padrao,
    perc_margem: cfg.perc_margem_padrao,
    perc_rt: arq ? (arq.perc_rt ?? cfg.perc_rt_padrao) : 0,
    perc_comissao: ven ? (ven.perc_comissao ?? cfg.perc_comissao_padrao) : 0,
    condicoes_gerais: payload.condicoes_gerais ?? cfg.texto_condicoes_gerais,
  });
}
