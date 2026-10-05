import { ResourceDef, ListaPaginada, FiltroAvancado, RegistroCrud, OpcaoRef, DbConnectionStatus, Usuario, Id } from '../types';

/** O token da sessão acompanha toda requisição no header Authorization */
let tokenAtual: string | null = null;
let aoExpirar: ((msg: string) => void) | null = null;

export function setTokenSessao(token: string | null) {
  tokenAtual = token;
}

/** Chamado quando o servidor recusa o token (sessão expirada ou usuário desativado) */
export function setAoExpirarSessao(fn: ((msg: string) => void) | null) {
  aoExpirar = fn;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (tokenAtual) h.Authorization = `Bearer ${tokenAtual}`;
  return h;
}

async function parseOrThrow(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `Falha na requisição (HTTP ${res.status}).`;
    if (res.status === 401 && aoExpirar) aoExpirar(msg);
    throw new Error(msg);
  }
  return data;
}

const get = (url: string) => fetch(url, { headers: headers() }).then(parseOrThrow);
const enviar = (method: string, url: string, corpo?: unknown) =>
  fetch(url, {
    method,
    headers: headers({ 'Content-Type': 'application/json' }),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }).then(parseOrThrow);

// ------------------------------------------------------------
// Autenticação e preferências
// ------------------------------------------------------------
export async function login(payload: { email: string; senha: string }): Promise<{
  success: boolean;
  primeiroAcesso?: boolean;
  message?: string;
  token: string;
  usuario: Usuario;
}> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Falha no login (HTTP ${res.status}).`);
  return data;
}

/**
 * Confere se a sessão guardada no navegador ainda vale.
 * Retorna false só quando o servidor recusa; falha de rede ou de banco devolve null,
 * para não deslogar ninguém por instabilidade.
 */
export async function validarSessao(): Promise<{ valida: boolean | null; error?: string }> {
  try {
    const res = await fetch('/api/sessao', { headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) return { valida: false, error: data?.error };
    return { valida: res.ok ? true : null, error: data?.error };
  } catch {
    return { valida: null };
  }
}

/** Troca da própria senha (confere a atual no servidor) */
export const trocarMinhaSenha = (atual: string, nova: string) => enviar('POST', '/api/minha-senha', { atual, nova });

export const fetchConfigListas = (): Promise<Record<string, unknown>> => get('/api/config-listas');

export async function saveConfigListas(config: Record<string, unknown>): Promise<void> {
  await enviar('PUT', '/api/config-listas', config);
}

// ------------------------------------------------------------
// Metadados e painel
// ------------------------------------------------------------
export const fetchResources = (): Promise<ResourceDef[]> => get('/api/meta/resources');

export async function fetchDbStatus(): Promise<DbConnectionStatus> {
  try {
    const res = await fetch('/api/db/status');
    return await res.json();
  } catch (err: any) {
    return { connected: false, latencyMs: 0, error: err.message || 'Falha ao conectar com a API' };
  }
}


// ------------------------------------------------------------
// CRUD genérico
// ------------------------------------------------------------
export function listRecords(
  resource: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    filterField?: string;
    filterValue?: string;
    filters?: FiltroAvancado[];
    /** Recurso em árvore: só as raízes */
    arvore?: 'raizes';
    /** Só as do usuário logado (recurso com filtro "minhas") */
    minhas?: boolean;
  } = {},
): Promise<ListaPaginada> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.sort) qs.set('sort', params.sort);
  if (params.dir) qs.set('dir', params.dir);
  if (params.filterField && params.filterValue) {
    qs.set('filter_field', params.filterField);
    qs.set('filter_value', params.filterValue);
  }
  if (params.filters && params.filters.length) qs.set('filters', JSON.stringify(params.filters));
  if (params.arvore) qs.set('arvore', params.arvore);
  if (params.minhas) qs.set('minhas', '1');
  return get(`/api/crud/${resource}?${qs.toString()}`);
}

export const getRecord = (resource: string, id: Id): Promise<RegistroCrud> =>
  get(`/api/crud/${resource}/${encodeURIComponent(String(id))}`);

export const createRecord = (resource: string, payload: RegistroCrud): Promise<{ success: boolean; id: string }> =>
  enviar('POST', `/api/crud/${resource}`, payload);

export const updateRecord = (resource: string, id: Id, payload: RegistroCrud): Promise<{ success: boolean }> =>
  enviar('PUT', `/api/crud/${resource}/${encodeURIComponent(String(id))}`, payload);

export const deleteRecord = (resource: string, id: Id): Promise<{ success: boolean }> =>
  enviar('DELETE', `/api/crud/${resource}/${encodeURIComponent(String(id))}`);

// ------------------------------------------------------------
// Combos de chave estrangeira, com cache em memória
// ------------------------------------------------------------
const optionsCache = new Map<string, OpcaoRef[]>();

export async function fetchOptions(resource: string, labelField: string, filtro?: { campo: string; valor: string }): Promise<OpcaoRef[]> {
  const key = `${resource}:${labelField}:${filtro ? `${filtro.campo}=${filtro.valor}` : ''}`;
  const cached = optionsCache.get(key);
  if (cached) return cached;
  const qs = new URLSearchParams({ label_field: labelField });
  if (filtro) {
    qs.set('filtro_campo', filtro.campo);
    qs.set('filtro_valor', filtro.valor);
  }
  const data = await get(`/api/options/${resource}?${qs}`);
  optionsCache.set(key, data);
  return data;
}

/** Invalida o cache de combos após gravações que alteram listas de referência */
export function invalidateOptions(resource?: string) {
  if (!resource) {
    optionsCache.clear();
    return;
  }
  for (const key of Array.from(optionsCache.keys())) {
    if (key.startsWith(`${resource}:`)) optionsCache.delete(key);
  }
}

// ------------------------------------------------------------

// ------------------------------------------------------------
// Configurações (linha única da tabela configuracoes)
// ------------------------------------------------------------
// Recurso genérico "configuracoes" (oculto no menu), sempre o id 1
export const fetchConfiguracoes = (): Promise<RegistroCrud> => getRecord('configuracoes', 1);
export const salvarConfiguracoes = (payload: RegistroCrud) => updateRecord('configuracoes', 1, payload);

// ------------------------------------------------------------
// Catálogo e regras
// ------------------------------------------------------------
/** Envia a imagem (data URI já reduzida) e devolve o caminho público /imagens/... */
export const enviarImagem = (dados: string): Promise<{ caminho: string }> => enviar('POST', '/api/imagens', { dados });

export interface Reajuste {
  recurso: string;
  perc: string;
  categoria_id?: string;
  fornecedor_id?: string;
  simular?: boolean;
}
export const reajustarPrecos = (r: Reajuste): Promise<{ itens: number }> => enviar('POST', '/api/reajuste', r);

export interface MapeamentoCasado {
  id: number;
  origem: string;
  padrao: string;
  modo_comparacao: string;
  prioridade: number;
  acao: string;
  arquiteto: string | null;
}
export const testarMapeamentos = (texto: string, origem: string, arquitetoId: string): Promise<MapeamentoCasado[]> =>
  enviar('POST', '/api/mapeamentos/testar', { texto, origem, arquiteto_id: arquitetoId || null });

// ------------------------------------------------------------
// Importação .dae
// ------------------------------------------------------------
export interface ResultadoImportacao {
  id: number;
  objetos?: number;
  avisos?: number;
  /** Arquivo lido mas recusado pelo parser (a importação fica com status ERRO) */
  erro?: string;
}

/** Envia o .dae (corpo binário). 409 = mesmo arquivo já importado: devolve `duplicado` para confirmar */
export async function importarDae(
  arquivo: File,
  forcar = false,
  orcamentoId?: Id | null,
): Promise<ResultadoImportacao | { duplicado: { id: number; arquivo_nome: string; created_at: string } }> {
  // O arquivo vai primeiro para o armazenamento; o servidor lê de lá (sem o limite de 4,5 MB da Vercel)
  const url = await enviarArquivo(`dae/${nomeSeguro(arquivo.name)}`, arquivo);
  const res = await fetch('/api/importacoes', {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ url, nome: arquivo.name, orcamento_id: orcamentoId || null, forcar }),
  });
  if (res.status === 409) return res.json();
  return parseOrThrow(res);
}

export interface ObjetoImportacao {
  id: number;
  parent_id: number | null;
  nivel: number;
  caminho: string;
  node_id_dae: string | null;
  nome: string;
  nome_definicao: string | null;
  material_dae: string | null;
  quantidade: number;
  comprimento_mm: string | null;
  largura_mm: string | null;
  espessura_mm: string | null;
  eh_retangular: number | null;
  espelhado: number;
  classificacao: string;
  confianca: string | null;
  motivo_classificacao: string | null;
  revisado: number;
  tipo_peca_id: number | null;
  materia_prima_id: number | null;
  fita_borda_id: number | null;
  material_id: number | null;
  insumo_id: number | null;
  tipo_peca: string | null;
  chapa: string | null;
  fita: string | null;
  material: string | null;
  insumo: string | null;
}
export const fetchObjetosImportacao = (id: Id): Promise<ObjetoImportacao[]> => get(`/api/importacoes/${id}/objetos`);

export interface MalhaImportacao {
  eixoUp: 'X_UP' | 'Y_UP' | 'Z_UP';
  instancias: { objeto: number; cor: string | null; tris: string }[];
}
/** A malha vem direto do armazenamento (pode passar do limite de resposta da Vercel) */
export async function fetchMalhaImportacao(id: Id): Promise<MalhaImportacao> {
  const { url } = await get(`/api/importacoes/${id}/malha`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Não foi possível carregar o modelo 3D (HTTP ${res.status}).`);
  return res.json();
}

// ------------------------------------------------------------
// Revisão da importação
// ------------------------------------------------------------
export interface LembrarRegra {
  origem: 'MATERIAL' | 'COMPONENTE' | 'NO';
  padrao: string;
  escopo: 'GLOBAL' | 'ARQUITETO';
}
export const salvarRevisao = (id: Id, ids: number[], campos: Record<string, unknown>, lembrar?: LembrarRegra): Promise<{ success: boolean; mapeamentoId: number | null }> =>
  enviar('PUT', `/api/importacoes/${id}/objetos`, { ids, campos, lembrar });
export const juntarObjetos = (id: Id, ids: number[], nome: string, peca = false): Promise<{ id: number; quantidade: number }> =>
  enviar('POST', `/api/importacoes/${id}/juntar`, { ids, nome, peca });
export const reiniciarImportacao = (id: Id): Promise<{ objetos: number; calculo: unknown }> => enviar('POST', `/api/importacoes/${id}/reiniciar`);
export const reclassificarImportacao = (id: Id): Promise<{ reclassificados: number }> => enviar('POST', `/api/importacoes/${id}/reclassificar`);

export interface LinhaDiff {
  caminho: string;
  descricao: string;
  medidas: string;
  quantidade: number;
  antes?: string;
}
export interface DiffGeracao {
  adicionadas: LinhaDiff[];
  alteradas: LinhaDiff[];
  removidas: LinhaDiff[];
  protegidas: LinhaDiff[];
  moveis: number;
  ferragens: number;
  insumos: number;
  ignorados: number;
  desconhecidos: number;
  aplicado?: boolean;
  calculo?: ResultadoCalculoApi | { erro: string };
}
export const gerarOrcamento = (id: Id, orcamentoId: string, aplicar: boolean, ambienteId?: string): Promise<DiffGeracao> =>
  enviar('POST', `/api/importacoes/${id}/gerar`, { orcamento_id: orcamentoId, aplicar, ambiente_id: ambienteId || null });

// ------------------------------------------------------------
// Motor de cálculo
// ------------------------------------------------------------
export interface ResultadoCalculoApi {
  custoTotal: string;
  valorFinal: string;
  margemRealPerc: string | null;
  alertas: { margemBaixa: boolean; margemNegativa: boolean };
  avisos: string[];
  chapasEstimadas: boolean;
}
export const calcularOrcamentoApi = (id: Id, atualizarPrecos = false): Promise<ResultadoCalculoApi> =>
  enviar('POST', `/api/orcamentos/${id}/calcular`, { atualizarPrecos });

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
/** Resumo do cálculo para aviso na tela */
export const resumoCalculo = (r: ResultadoCalculoApi) =>
  `Valor final ${BRL.format(Number(r.valorFinal))} · custo ${BRL.format(Number(r.custoTotal))}` +
  (r.margemRealPerc != null ? ` · margem real ${Number(r.margemRealPerc).toLocaleString('pt-BR')}%` : '') +
  (r.alertas.margemNegativa ? ' · MARGEM NEGATIVA' : r.alertas.margemBaixa ? ' · margem abaixo de 10%' : '') +
  (r.chapasEstimadas ? ' · chapas estimadas pela área (sem o plano de corte)' : '');

// ------------------------------------------------------------
// Plano de corte
// ------------------------------------------------------------
export interface PecaNoPlano {
  pecaId: number;
  x: number;
  y: number;
  comprimento: number;
  largura: number;
  rotacionada: boolean;
}
export interface PlanoChapa {
  numero: number;
  comprimento_util: number;
  largura_util: number;
  area_pecas_m2: number;
  aproveitamento: number;
  pecas: PecaNoPlano[];
  sobras: { x: number; y: number; comprimento: number; largura: number }[];
}
export interface PlanoCorte {
  orcamento: { numero: string; revisao: number; calculado_em: string | null };
  refilo: number;
  kerf: number;
  chapas: { materia_prima_id: number; descricao: string; comprimento: number; largura: number; possui_veio: boolean; heuristica: string; planos: PlanoChapa[] }[];
  pecas: { id: number; descricao: string; movel_id: number; comprimento_mm: string; largura_mm: string; espessura_mm: string; quantidade_total: number }[];
  moveis: { id: number; descricao: string; quantidade: number }[];
  erros: { peca_id: number; descricao: string; medidas: string; faltam: number }[];
}
export const fetchPlanoCorte = (orcamentoId: Id): Promise<PlanoCorte> => get(`/api/orcamentos/${orcamentoId}/plano-corte`);

// ------------------------------------------------------------
// Tela do orçamento
// ------------------------------------------------------------
export interface EstruturaOrcamento {
  orcamento: RegistroCrud;
  editavel: boolean;
  transicoes: string[];
  podeRevisar: boolean;
  ambientes: RegistroCrud[];
  moveis: RegistroCrud[];
  pecas: RegistroCrud[];
  itens: RegistroCrud[];
  importacoes: RegistroCrud[];
  anexos: RegistroCrud[];
  consumos: RegistroCrud[];
}
export interface RespostaEdicao {
  id?: number;
  calculo?: ResultadoCalculoApi | { erro: string };
}
export const fetchEstrutura = (id: Id): Promise<EstruturaOrcamento> => get(`/api/orcamentos/${id}/estrutura`);
/** Inclui, altera ou exclui ambiente, móvel, peça ou item do orçamento (o servidor recalcula) */
export const editarOrcamento = (id: Id, colecao: 'ambientes' | 'moveis' | 'pecas' | 'itens', subId: Id | null, dados?: RegistroCrud, excluir = false): Promise<RespostaEdicao> =>
  enviar(excluir ? 'DELETE' : subId ? 'PUT' : 'POST', `/api/orcamentos/${id}/${colecao}${subId ? `/${subId}` : ''}`, excluir ? undefined : dados);
export const salvarPrecificacao = (id: Id, dados: RegistroCrud): Promise<RespostaEdicao> => enviar('PUT', `/api/orcamentos/${id}/precificacao`, dados);
export const mudarStatusOrcamento = (id: Id, status: string, observacao = '', confirmarMargem = false) =>
  enviar('POST', `/api/orcamentos/${id}/status`, { status, observacao, confirmarMargem });
export const criarRevisao = (id: Id): Promise<{ id: number; revisao: number }> => enviar('POST', `/api/orcamentos/${id}/revisao`);
export const fetchHistoricoOrcamento = (id: Id): Promise<{ status: RegistroCrud[]; revisoes: RegistroCrud[] }> => get(`/api/orcamentos/${id}/historico`);

export interface ItemCatalogoBusca {
  tipo_item: 'MATERIA_PRIMA' | 'INSUMO' | 'MATERIAL' | 'SERVICO';
  id: number;
  codigo: string | null;
  descricao: string;
  unidade: string;
  custo_unitario: string;
}
export const buscarCatalogo = (q: string): Promise<ItemCatalogoBusca[]> => get(`/api/catalogo/busca?q=${encodeURIComponent(q)}`);

export async function enviarAnexo(orcamentoId: Id, arquivo: File): Promise<{ id: number }> {
  const url = await enviarArquivo(`anexos/${orcamentoId}/${nomeSeguro(arquivo.name)}`, arquivo);
  return enviar('POST', `/api/orcamentos/${orcamentoId}/anexos`, { url, nome: arquivo.name, tamanho: arquivo.size });
}
/**
 * Abre o anexo: no Blob, direto pela URL pública (nova aba); no disco, pela rota do servidor (exige o token,
 * então vem como blob e é salvo pelo navegador).
 */
export async function baixarAnexo(orcamentoId: Id, anexo: { id: Id; nome_original: string; arquivo_path?: string }) {
  if (/^https:\/\//i.test(anexo.arquivo_path ?? '')) {
    window.open(anexo.arquivo_path, '_blank', 'noopener');
    return;
  }
  const res = await fetch(`/api/orcamentos/${orcamentoId}/anexos/${anexo.id}`, { headers: headers() });
  if (!res.ok) return parseOrThrow(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = anexo.nome_original;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export const excluirAnexo = (orcamentoId: Id, anexoId: Id) => enviar('DELETE', `/api/orcamentos/${orcamentoId}/anexos/${anexoId}`);

// ------------------------------------------------------------
// Documentos, relatórios e painel
// ------------------------------------------------------------
/** Baixa um arquivo de rota autenticada (PDF, CSV) com o nome que o servidor mandar */
export async function baixarArquivo(url: string, nomePadrao: string) {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return parseOrThrow(res);
  const nome = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? nomePadrao;
  const link = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = link;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(link), 10_000);
}
export const baixarDocumento = (orcamentoId: Id, doc: 'cliente' | 'interno' | 'lista-corte' | 'plano-corte', porMovel = false) =>
  baixarArquivo(`/api/orcamentos/${orcamentoId}/documentos/${doc}${porMovel ? '?porMovel=1' : ''}`, `${doc}.pdf`);
export const baixarListaCorteCsv = (orcamentoId: Id) => baixarArquivo(`/api/orcamentos/${orcamentoId}/lista-corte.csv`, 'lista-corte.csv');

export interface FiltroRt {
  inicio: string;
  fim: string;
  arquiteto_id?: string;
}
const qsRt = (f: FiltroRt) => new URLSearchParams({ inicio: f.inicio, fim: f.fim, ...(f.arquiteto_id ? { arquiteto_id: f.arquiteto_id } : {}) });
export const fetchRelatorioRt = (f: FiltroRt): Promise<RegistroCrud[]> => get(`/api/relatorios/rt?${qsRt(f)}`);
export const baixarRelatorioRt = (f: FiltroRt) => baixarArquivo(`/api/relatorios/rt?${qsRt(f)}&formato=pdf`, 'relatorio-rt.pdf');

export interface Painel {
  porStatus: { status: string; quantidade: number; valor: string }[];
  aberto: { quantidade: number; valor: string };
  conversao: { aprovados: number | string; decididos: number };
  mes: { aprovados: number; valor: string; ticket: string | null };
  ranking: { id: number; nome: string; escritorio: string | null; aprovados: number; valor: string; rt: string }[];
  vencendo: { id: number; numero: string; revisao: number; titulo: string; status: string; data_validade: string; valor_final: string; cliente_nome: string }[];
}
export const fetchPainel = (): Promise<Painel> => get('/api/dashboard');

// ------------------------------------------------------------
// Armazenamento de arquivos (Vercel Blob ou disco do servidor)
// ------------------------------------------------------------
/** Nome seguro para o caminho do arquivo (mesma regra do servidor) */
export const nomeSeguro = (nome: string) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '_').slice(-120) || 'arquivo';

let modoArmazenamento: Promise<{ blob: boolean; configurado: boolean }> | null = null;

/**
 * Envia um arquivo do navegador para o armazenamento e devolve o endereço. Com Vercel Blob, vai direto
 * para o Blob (o servidor só libera o envio, como no crmweb); sem ele, vai para o servidor.
 */
export async function enviarArquivo(caminho: string, arquivo: File): Promise<string> {
  modoArmazenamento ??= get('/api/armazenamento').catch((e) => {
    modoArmazenamento = null;
    throw e;
  });
  const modo = await modoArmazenamento!;
  if (!modo.configurado) throw new Error('Armazenamento de arquivos não configurado no servidor (Vercel Blob).');
  if (modo.blob) {
    const { upload } = await import('@vercel/blob/client');
    const blob = await upload(caminho, arquivo, {
      access: 'public',
      handleUploadUrl: '/api/arquivos/upload',
      headers: headers(),
      multipart: arquivo.size > 5 * 1024 * 1024,
    });
    return blob.url;
  }
  const qs = new URLSearchParams({ caminho, tipo: arquivo.type || 'application/octet-stream' });
  const res = await fetch(`/api/arquivos?${qs}`, { method: 'POST', headers: headers({ 'Content-Type': 'application/octet-stream' }), body: arquivo });
  return (await parseOrThrow(res)).url;
}
