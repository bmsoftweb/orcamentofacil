import { pool } from './db.js';
import { normalizarPalavrasChave } from '../src/lib/texto.js';
import { prepararNovoOrcamento } from './orcamentos.js';

/** Faixas [min, max] que se tocam (as do seed usam 0–900 e 900,01–1600: não se sobrepõem) */
export const faixasSobrepoem = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];

/**
 * Regras de negócio antes de gravar um registro do CRUD genérico. `payload` já está validado e
 * convertido; pode ser ajustado aqui. `id` null = inclusão. Lança erro com mensagem para o usuário.
 */
export async function antesDeGravar(recurso: string, payload: Record<string, any>, id: string | null, usuarioId: number) {
  // Campos NOT NULL do orçamento deixados em branco no formulário: mantém o que está (ou o padrão na inclusão)
  if (recurso === 'orcamentos') for (const k of ['criterio_cobranca_chapa', 'modo_ferragens', 'data_validade']) if (payload[k] == null) delete payload[k];
  if (recurso === 'orcamentos' && !id) await prepararNovoOrcamento(payload, usuarioId);
  if (recurso === 'orcamentos' && id) await conferirEditavel(id);

  if (recurso === 'tipos_peca' && 'palavras_chave' in payload) {
    payload.palavras_chave = normalizarPalavrasChave(payload.palavras_chave) || null;
  }

  if (recurso === 'mapeamentos_dae' && payload.modo_comparacao === 'REGEX') {
    try {
      new RegExp(String(payload.padrao ?? ''));
    } catch (e: any) {
      throw new Error(`Expressão regular inválida: ${e.message}`);
    }
  }

  if (recurso === 'regras_ferragem') await conferirFaixas(payload, id);
}

/** Regra de ferragem não pode ter faixa sobreposta a outra ativa do mesmo tipo de peça + ferragem */
async function conferirFaixas(payload: Record<string, any>, id: string | null) {
  const [atual] = id ? (await pool.query<any[]>('SELECT * FROM regras_ferragem WHERE id = ?', [id]))[0] : [{}];
  const r = { ...atual, ...payload };
  if (!Number(r.ativo ?? 1)) return;
  // Sem medida de referência a regra vale para qualquer tamanho (faixa inteira)
  const faixa = (x: any): [number, number] =>
    x.dimensao_referencia === 'NENHUMA' || !x.dimensao_referencia ? [0, Infinity] : [Number(x.dimensao_min_mm ?? 0), Number(x.dimensao_max_mm ?? 99999)];
  const minha = faixa(r);
  if (minha[1] < minha[0]) throw new Error('A medida "Até" precisa ser maior ou igual à medida "De".');

  const [outras] = await pool.query<any[]>(
    `SELECT id, dimensao_referencia, dimensao_min_mm, dimensao_max_mm FROM regras_ferragem
      WHERE ativo = 1 AND tipo_peca_id = ? AND material_id = ? AND id <> ?`,
    [r.tipo_peca_id, r.material_id, id ?? 0],
  );
  const conflito = outras.find((o) => faixasSobrepoem(minha, faixa(o)));
  if (conflito) {
    const f = faixa(conflito);
    const texto = f[1] === Infinity ? 'qualquer medida' : `${f[0]} a ${f[1]} mm`;
    throw new Error(`A faixa se sobrepõe à regra nº ${conflito.id} (${texto}) do mesmo tipo de peça e ferragem.`);
  }
}

/** Orçamento só muda em rascunho/revisão (depois de enviado, a edição é numa revisão) */
async function conferirEditavel(id: string) {
  const [[o]] = await pool.query<any[]>('SELECT status FROM orcamentos WHERE id = ?', [id]);
  if (o && !['RASCUNHO', 'EM_REVISAO'].includes(o.status)) {
    throw Object.assign(new Error('Orçamento já enviado: crie uma revisão para editar.'), { status: 409 });
  }
}

/** Antes de excluir pelo CRUD genérico */
/** Devolve os arquivos do armazenamento a apagar depois que a exclusão der certo */
export async function antesDeExcluir(recurso: string, id: string): Promise<string[]> {
  if (recurso === 'importacoes_dae') {
    const [[i]] = await pool.query<any[]>('SELECT arquivo_path FROM importacoes_dae WHERE id = ?', [id]);
    return i ? [i.arquivo_path, `malhas/${Number(id)}.json`] : [];
  }
  if (recurso === 'orcamentos') {
    const [[o]] = await pool.query<any[]>('SELECT status FROM orcamentos WHERE id = ?', [id]);
    if (o && !['RASCUNHO', 'CANCELADO'].includes(o.status)) throw Object.assign(new Error('Só orçamentos em rascunho ou cancelados podem ser excluídos.'), { status: 409 });
  }
  return [];
}

/** Depois de incluir pelo CRUD genérico */
export async function aposIncluir(recurso: string, id: string, usuarioId: number) {
  if (recurso === 'orcamentos') {
    await pool.query("INSERT INTO orcamento_status_historico (orcamento_id, status_anterior, status_novo, usuario_id, observacao) VALUES (?, NULL, 'RASCUNHO', ?, 'Orçamento criado')", [id, usuarioId]);
  }
}
