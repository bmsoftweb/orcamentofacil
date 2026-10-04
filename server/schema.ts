/**
 * Registro central de metadados das tabelas do banco orcamentofacil.
 *
 * ÚNICA fonte de verdade das telas de manutenção:
 *  - o backend monta o SQL com whitelist de colunas (evita SQL injection);
 *  - o frontend recebe via GET /api/meta/resources e desenha as telas de CRUD.
 *
 * Colunas GENERATED (custo_m2, custo_total, area_m2, metros_fita, variacao_perc) entram
 * sempre como readOnly: nunca vão em INSERT/UPDATE.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'decimal'
  | 'date'
  | 'datetime'
  | 'time'
  | 'enum'
  | 'boolean'
  | 'password'
  /** CPF ou CNPJ (máscara pelo tamanho, dígitos verificadores conferidos); gravado só com dígitos */
  | 'cnpj'
  /** CEP: ao completar 8 dígitos, busca no ViaCEP e preenche logradouro, bairro, cidade e UF */
  | 'cep'
  /** Cor #RRGGBB */
  | 'cor'
  /** Imagem enviada para o storage; a coluna guarda o caminho público (/imagens/...) */
  | 'imagem';

export interface FieldDef {
  /** Nome da coluna no MySQL */
  name: string;
  /** Rótulo exibido na interface */
  label: string;
  type: FieldType;
  /** Não aparece na ficha embaixo da lista (ex.: campos já resumidos em outro, como os de executor) */
  foraDaFicha?: boolean;
  /** Na exibição, o valor de outro campo vai antes deste ("Luis : Implementar..."); não é gravado */
  prefixo?: { campo: string; exceto?: string };
  /** Texto auxiliar exibido abaixo do campo no formulário */
  hint?: string;
  placeholder?: string;
  required?: boolean;
  /** Campo apenas leitura (gerado pelo banco ou pelo sistema): nunca vai em INSERT/UPDATE */
  readOnly?: boolean;
  /** Exibido na grade de listagem */
  listed?: boolean;
  /** Participa da busca textual (LIKE) da barra de busca rápida */
  searchable?: boolean;
  /** Aparece no painel de busca avançada */
  filterable?: boolean;
  /** Opções para type === 'enum' */
  options?: { value: string; label: string }[];
  /** Chave estrangeira: carrega o combo a partir de outro recurso */
  ref?: { resource: string; labelField: string };
  /** Casas decimais para type === 'decimal' */
  scale?: number;
  maxLength?: number;
  /** Desabilita (e zera) o campo quando outro campo tem o valor indicado */
  disabledWhen?: { field: string; equals: string };
  /** Campo numérico que aceita valor negativo (o sinal alterna ao digitar "-") */
  allowNegative?: boolean;
  /** Valor inicial na inclusão */
  default?: string | number | boolean;
  /** Largura sugerida da coluna na grade */
  width?: 'xs' | 'sm' | 'md' | 'lg';
  /** Colunas que o campo ocupa no formulário (de 4); sem isto vale a regra padrão */
  span?: number;
  /**
   * Coluna calculada só da lista: expressão SQL sobre o alias "t" (ex.: subconsulta).
   * Não existe na tabela, não é gravada e não aparece no formulário.
   */
  sql?: string;
  /** Título de seção mostrado no formulário antes do primeiro campo dela */
  secao?: string;
  /** Só aparece (e só é gravado) quando o campo indicado tem um destes valores; fora disso vai NULL */
  quando?: { campo: string; valores: string[] };
  /** Obrigatório quando o campo indicado tem um destes valores */
  obrigatorioQuando?: { campo: string; valores: string[] };
  /** Combo de chave estrangeira só com os registros em que esta coluna do recurso ligado tem o valor */
  refFiltro?: { campo: string; valor: string };
}

/** Grade filha exibida no rodapé da listagem quando uma linha é selecionada (mestre-detalhe) */
export interface DetailDef {
  resource: string;
  foreignKey: string;
  label: string;
  /** Campo decimal do filho totalizado no rodapé do painel */
  totalField?: string;
  /** Painel com incluir, editar e excluir (formulário genérico numa janela), com a chave do pai preenchida */
  editavel?: boolean;
  /** Filtro fixo além da chave (ex.: histórico de preços: tipo_item = 'INSUMO') */
  filtroFixo?: { field: string; op: 'eq'; value: string };
}

export interface ResourceDef {
  /** Identificador usado nas rotas: /api/crud/:resource */
  name: string;
  table: string;
  label: string;
  labelSingular: string;
  description: string;
  /** Ícone lucide-react renderizado na sidebar */
  icon: string;
  /** Agrupamento na sidebar */
  group: 'orcamentos' | 'cadastros' | 'catalogo' | 'regras' | 'acesso';
  /** Não aparece no menu (só como detalhe de outro recurso) */
  oculto?: boolean;
  /** Chave primária */
  pk: string[];
  /** PK numerada pelo MySQL (AUTO_INCREMENT) */
  autoIncrement: boolean;
  /** Campo usado como rótulo em combos de chave estrangeira */
  labelField: string;
  /** SELECT próprio para os combos (colunas value e label), quando o rótulo depende de outra tabela */
  optionsSql?: string;
  /** Filtro fixo sobre o alias "t" aplicado em toda consulta (sem "?") */
  scopeSql?: string;
  defaultSort: { field: string; dir: 'asc' | 'desc' };
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Campo Sim/Não com filtro rápido Todas/Sim/Não na barra da lista (ex.: ativo) */
  filtroRapido?: string;
  /** Valor com que o filtro rápido abre: '1' = Sim, '0' = Não (sem ele: Todas) */
  filtroRapidoPadrao?: '1' | '0';
  details?: DetailDef[];
  /** Ao clicar numa linha, mostra embaixo a ficha com todos os campos (textos longos por inteiro) */
  ficha?: boolean;
  /**
   * Item de catálogo com preço: a coluna do custo, a da data do último preço (atualizada quando
   * o custo muda) e o tipo_item gravado pelos triggers em historico_precos. Habilita o reajuste em lote.
   */
  preco?: { campo: string; data?: string; tipoItem: string };
  fields: FieldDef[];
}

export const PERFIS = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'ORCAMENTISTA', label: 'Orçamentista' },
  { value: 'VENDEDOR', label: 'Vendedor' },
  { value: 'PRODUCAO', label: 'Produção' },
];

const ID: FieldDef = { name: 'id', label: 'ID', type: 'number', readOnly: true, width: 'xs' };
const CRIADO_ATUALIZADO: FieldDef[] = [
  { name: 'created_at', label: 'Criado em', type: 'datetime', readOnly: true },
  { name: 'updated_at', label: 'Atualizado em', type: 'datetime', readOnly: true },
];
const perc = (name: string, label: string, secao?: string): FieldDef => ({ name, label: `${label} (%)`, type: 'decimal', scale: 2, required: true, secao });
const mm = (name: string, label: string, secao?: string): FieldDef => ({ name, label: `${label} (mm)`, type: 'decimal', scale: 2, required: true, secao });

const PRECO = 'Formação de preço (markup divisor)';
const CORTE = 'Produção e plano de corte';

const opcoes = (pares: [string, string][]) => pares.map(([value, label]) => ({ value, label }));

/** Cadastro comum: PK numerada pelo MySQL, todas as operações liberadas */
const BASE = { pk: ['id'], autoIncrement: true, canCreate: true, canUpdate: true, canDelete: true };
/** Lista abre só com os ativos (excluir com vínculo é barrado: inativa-se) */
const ATIVOS = { filtroRapido: 'ativo', filtroRapidoPadrao: '1' as const };
const ATIVO: FieldDef = { name: 'ativo', label: 'Ativo', type: 'boolean', listed: true, filterable: true };

const ENDERECO: FieldDef[] = [
  { name: 'cep', label: 'CEP', type: 'cep', secao: 'Endereço' },
  { name: 'logradouro', label: 'Logradouro', type: 'text', maxLength: 150, span: 2, secao: 'Endereço' },
  { name: 'numero', label: 'Número', type: 'text', maxLength: 10, secao: 'Endereço' },
  { name: 'complemento', label: 'Complemento', type: 'text', maxLength: 60, secao: 'Endereço' },
  { name: 'bairro', label: 'Bairro', type: 'text', maxLength: 80, secao: 'Endereço' },
  { name: 'cidade', label: 'Cidade', type: 'text', listed: true, searchable: true, filterable: true, maxLength: 80, secao: 'Endereço' },
  { name: 'uf', label: 'UF', type: 'text', listed: true, filterable: true, maxLength: 2, width: 'xs', secao: 'Endereço' },
];

/** Painel "Histórico de preços" embaixo do item do catálogo */
const historico = (tipoItem: string): DetailDef => ({
  resource: 'historico_precos',
  foreignKey: 'item_id',
  label: 'Histórico de preços',
  filtroFixo: { field: 'tipo_item', op: 'eq', value: tipoItem },
});

const TIPOS_PESSOA = opcoes([['F', 'Física'], ['J', 'Jurídica']]);
const SOFTWARES = opcoes([['SKETCHUP', 'SketchUp'], ['PROMOB', 'Promob'], ['REVIT', 'Revit'], ['ARCHICAD', 'ArchiCAD'], ['AUTOCAD', 'AutoCAD'], ['RHINO', 'Rhino'], ['OUTRO', 'Outro']]);
const MODULOS = opcoes([['MATERIA_PRIMA', 'Matéria-prima'], ['INSUMO', 'Insumo'], ['MATERIAL', 'Ferragem / acessório'], ['SERVICO', 'Serviço']]);
export const TIPOS_MP = opcoes([['CHAPA', 'Chapa'], ['FITA_BORDA', 'Fita de borda'], ['MACICO', 'Maciço'], ['VIDRO', 'Vidro'], ['ESPELHO', 'Espelho'], ['LAMINA', 'Lâmina'], ['OUTRO', 'Outro']]);
const MATERIAIS_BASE = opcoes([['MDF', 'MDF'], ['MDP', 'MDP'], ['COMPENSADO', 'Compensado'], ['OSB', 'OSB'], ['HDF', 'HDF'], ['MADEIRA', 'Madeira'], ['ALUMINIO', 'Alumínio'], ['VIDRO', 'Vidro'], ['OUTRO', 'Outro']]);
export const TIPOS_MATERIAL = opcoes([
  ['PUXADOR', 'Puxador'], ['FECHADURA', 'Fechadura'], ['DOBRADICA', 'Dobradiça'], ['CORREDICA', 'Corrediça'], ['PISTAO', 'Pistão'],
  ['ARTICULADOR', 'Articulador'], ['TRILHO', 'Trilho'], ['ROLDANA', 'Roldana'], ['PE', 'Pé'], ['RODIZIO', 'Rodízio'], ['SUPORTE', 'Suporte'],
  ['CABIDEIRO', 'Cabideiro'], ['ILUMINACAO', 'Iluminação'], ['ACESSORIO_COZINHA', 'Acessório de cozinha'], ['ACESSORIO_CLOSET', 'Acessório de closet'], ['OUTRO', 'Outro'],
]);
const TIPOS_SERVICO = opcoes([
  ['CORTE', 'Corte'], ['FITAGEM', 'Fitagem'], ['USINAGEM', 'Usinagem'], ['MONTAGEM', 'Montagem'], ['PINTURA', 'Pintura'],
  ['INSTALACAO', 'Instalação'], ['FRETE', 'Frete'], ['PROJETO', 'Projeto'], ['TERCEIRIZADO', 'Terceirizado'], ['OUTRO', 'Outro'],
]);
const BASES_COMUNS: [string, string][] = [
  ['POR_M2_PECA', 'Por m² de peça'], ['POR_METRO_FITA', 'Por metro de fita'], ['POR_PECA', 'Por peça'],
  ['POR_CHAPA', 'Por chapa'], ['POR_MOVEL', 'Por móvel'], ['POR_FERRAGEM', 'Por ferragem'],
];
const BASES_SERVICO = opcoes([...BASES_COMUNS, ['POR_HORA', 'Por hora'], ['POR_KM', 'Por km'], ['FIXO_ORCAMENTO', 'Fixo por orçamento']]);
const BASES_INSUMO = opcoes([...BASES_COMUNS, ['POR_ORCAMENTO', 'Por orçamento']]);
const DIMENSOES = opcoes([['NENHUMA', 'Nenhuma (qualquer medida)'], ['COMPRIMENTO', 'Comprimento'], ['LARGURA', 'Largura']]);
const ORIGENS_DAE = opcoes([['MATERIAL', 'Material'], ['COMPONENTE', 'Componente (definição)'], ['NO', 'Nó (instância)']]);
const MODOS_COMPARACAO = opcoes([['CONTEM', 'Contém'], ['EXATO', 'Exato'], ['INICIA', 'Começa com'], ['REGEX', 'Regex']]);
const ACOES_DAE = opcoes([['PECA', 'Peça de chapa'], ['FERRAGEM', 'Ferragem'], ['INSUMO', 'Insumo'], ['IGNORAR', 'Ignorar']]);
const PECA = { campo: 'acao', valores: ['PECA'] };
const STATUS_ORCAMENTO = opcoes([
  ['RASCUNHO', 'Rascunho'], ['EM_REVISAO', 'Em revisão'], ['ENVIADO', 'Enviado'], ['APROVADO', 'Aprovado'], ['REPROVADO', 'Reprovado'],
  ['CANCELADO', 'Cancelado'], ['EXPIRADO', 'Expirado'], ['EM_PRODUCAO', 'Em produção'],
]);
const STATUS_IMPORTACAO = opcoes([['PENDENTE', 'Pendente'], ['PROCESSANDO', 'Processando'], ['REVISAO', 'Em revisão'], ['CONCLUIDA', 'Concluída'], ['ERRO', 'Erro']]);

export const RESOURCES: ResourceDef[] = [
  {
    name: 'usuarios',
    table: 'usuarios',
    label: 'Usuários',
    labelSingular: 'Usuário',
    description: 'Quem acessa o sistema e o perfil de cada um',
    icon: 'KeyRound',
    group: 'acesso',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    filtroRapido: 'ativo',
    filtroRapidoPadrao: '1',
    fields: [
      ID,
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 100, width: 'lg' },
      { name: 'email', label: 'E-mail', type: 'text', required: true, listed: true, searchable: true, maxLength: 150, width: 'lg' },
      { name: 'senha_hash', label: 'Senha', type: 'password', hint: 'Em branco na inclusão: a senha digitada no primeiro acesso é gravada' },
      { name: 'perfil', label: 'Perfil', type: 'enum', required: true, listed: true, filterable: true, options: PERFIS, default: 'ORCAMENTISTA' },
      { name: 'perc_comissao', label: 'Comissão (%)', type: 'decimal', scale: 2, listed: true, hint: 'Vendedor: sobrepõe a comissão padrão das Configurações' },
      { name: 'ativo', label: 'Ativo', type: 'boolean', listed: true, filterable: true },
      { name: 'ultimo_acesso', label: 'Último acesso', type: 'datetime', readOnly: true, listed: true },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    // Linha única (id = 1): editada na tela Configurações, não aparece no menu
    name: 'configuracoes',
    table: 'configuracoes',
    label: 'Configurações',
    labelSingular: 'Configuração',
    description: 'Dados da empresa e parâmetros de cálculo',
    icon: 'Settings',
    group: 'acesso',
    oculto: true,
    pk: ['id'],
    autoIncrement: true,
    labelField: 'razao_social',
    defaultSort: { field: 'id', dir: 'asc' },
    canCreate: false,
    canUpdate: true,
    canDelete: false,
    fields: [
      ID,
      { name: 'razao_social', label: 'Razão social', type: 'text', required: true, maxLength: 150, span: 2, secao: 'Empresa' },
      { name: 'nome_fantasia', label: 'Nome fantasia', type: 'text', maxLength: 150, span: 2, secao: 'Empresa' },
      { name: 'cnpj', label: 'CNPJ', type: 'cnpj', secao: 'Empresa' },
      { name: 'inscricao_estadual', label: 'Inscrição estadual', type: 'text', maxLength: 20, secao: 'Empresa' },
      { name: 'telefone', label: 'Telefone', type: 'text', maxLength: 20, secao: 'Empresa' },
      { name: 'email', label: 'E-mail', type: 'text', maxLength: 150, secao: 'Empresa' },
      { name: 'site', label: 'Site', type: 'text', maxLength: 150, span: 2, secao: 'Empresa' },
      { name: 'cep', label: 'CEP', type: 'text', maxLength: 9, secao: 'Empresa' },
      { name: 'logradouro', label: 'Logradouro', type: 'text', maxLength: 150, secao: 'Empresa' },
      { name: 'numero', label: 'Número', type: 'text', maxLength: 10, secao: 'Empresa' },
      { name: 'complemento', label: 'Complemento', type: 'text', maxLength: 60, secao: 'Empresa' },
      { name: 'bairro', label: 'Bairro', type: 'text', maxLength: 80, secao: 'Empresa' },
      { name: 'cidade', label: 'Cidade', type: 'text', maxLength: 80, secao: 'Empresa' },
      { name: 'uf', label: 'UF', type: 'text', maxLength: 2, secao: 'Empresa' },
      { name: 'logo_path', label: 'Logo (impressa nos orçamentos)', type: 'imagem', secao: 'Empresa' },

      perc('perc_margem_padrao', 'Margem', PRECO),
      perc('perc_impostos_padrao', 'Impostos', PRECO),
      perc('perc_custo_fixo_padrao', 'Custo fixo', PRECO),
      perc('perc_comissao_padrao', 'Comissão do vendedor', PRECO),
      perc('perc_rt_padrao', 'RT do arquiteto', PRECO),

      mm('espessura_serra_mm', 'Espessura da serra', CORTE),
      mm('refilo_chapa_mm', 'Refilo por lado', CORTE),
      mm('sobra_fita_por_borda_mm', 'Sobra de fita por borda', CORTE),
      perc('perc_perda_chapa_padrao', 'Perda de chapa', CORTE),
      perc('perc_perda_fita_padrao', 'Perda de fita', CORTE),
      {
        name: 'criterio_cobranca_chapa',
        label: 'Cobrança da chapa',
        type: 'enum',
        required: true,
        secao: CORTE,
        options: [
          { value: 'CHAPA_INTEIRA', label: 'Chapa inteira (plano de corte)' },
          { value: 'AREA_COM_PERDA', label: 'Área com perda' },
        ],
      },

      mm('tolerancia_espessura_mm', 'Tolerância de espessura', 'Importação .dae'),
      mm('arredondamento_medida_mm', 'Arredondamento das medidas', 'Importação .dae'),

      { name: 'validade_orcamento_dias', label: 'Validade (dias)', type: 'number', required: true, secao: 'Orçamento' },
      { name: 'prazo_entrega_dias', label: 'Prazo de entrega (dias)', type: 'number', required: true, secao: 'Orçamento' },
      { name: 'texto_condicoes_gerais', label: 'Condições gerais', type: 'textarea', secao: 'Orçamento' },
      { name: 'texto_rodape_orcamento', label: 'Rodapé do orçamento', type: 'textarea', secao: 'Orçamento' },
      ...CRIADO_ATUALIZADO,
    ],
  },
  // ===========================================================================
  // ORÇAMENTOS
  // ===========================================================================
  {
    // Cadastro básico (fase 4): número, datas e percentuais preenchidos pelo servidor na inclusão.
    // As abas completas do orçamento (peças, itens, plano de corte, preço) chegam na fase 7.
    name: 'orcamentos',
    table: 'orcamentos',
    label: 'Orçamentos',
    labelSingular: 'Orçamento',
    description: 'Orçamentos de móveis planejados',
    icon: 'FileText',
    group: 'orcamentos',
    ...BASE,
    labelField: 'numero',
    optionsSql: "SELECT t.id AS value, CONCAT(t.numero, IF(t.revisao > 0, CONCAT(' rev. ', t.revisao), ''), ' · ', t.titulo) AS label FROM orcamentos t ORDER BY t.id DESC LIMIT 5000",
    defaultSort: { field: 'id', dir: 'desc' },
    fields: [
      ID,
      { name: 'numero', label: 'Número', type: 'text', readOnly: true, listed: true, searchable: true, width: 'sm' },
      { name: 'revisao', label: 'Rev.', type: 'number', readOnly: true, listed: true, width: 'xs' },
      { name: 'titulo', label: 'Título', type: 'text', required: true, listed: true, searchable: true, maxLength: 150, span: 2, width: 'lg', placeholder: 'Apartamento 302 — Cozinha e Dormitórios' },
      { name: 'cliente_id', label: 'Cliente', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'clientes', labelField: 'nome' } },
      { name: 'arquiteto_id', label: 'Arquiteto', type: 'number', listed: true, filterable: true, ref: { resource: 'arquitetos', labelField: 'nome' } },
      { name: 'vendedor_id', label: 'Vendedor', type: 'number', filterable: true, ref: { resource: 'usuarios', labelField: 'nome' } },
      { name: 'condicao_pagamento_id', label: 'Condição de pagamento', type: 'number', ref: { resource: 'condicoes_pagamento', labelField: 'descricao' } },
      { name: 'endereco_obra', label: 'Endereço da obra', type: 'text', maxLength: 255, span: 2 },
      { name: 'status', label: 'Situação', type: 'enum', readOnly: true, listed: true, filterable: true, options: STATUS_ORCAMENTO },
      { name: 'data_emissao', label: 'Emissão', type: 'date', readOnly: true, listed: true },
      { name: 'data_validade', label: 'Validade', type: 'date', listed: true, hint: 'Na inclusão: emissão + validade das Configurações' },
      { name: 'prazo_entrega_dias', label: 'Prazo de entrega (dias)', type: 'number' },
      {
        name: 'criterio_cobranca_chapa',
        label: 'Cobrança da chapa',
        type: 'enum',
        options: [
          { value: 'CHAPA_INTEIRA', label: 'Chapa inteira (plano de corte)' },
          { value: 'AREA_COM_PERDA', label: 'Área com perda' },
        ],
        hint: 'Na inclusão vem das Configurações',
      },
      {
        name: 'modo_ferragens',
        label: 'Ferragens',
        type: 'enum',
        options: [
          { value: 'AMBAS', label: 'Do modelo e por regra (sem duplicar)' },
          { value: 'MODELO', label: 'Só as do modelo (.dae)' },
          { value: 'REGRA', label: 'Só as das regras de ferragem' },
        ],
        default: 'AMBAS',
      },
      { name: 'valor_final', label: 'Valor final (R$)', type: 'decimal', scale: 2, readOnly: true, listed: true },
      { name: 'observacoes', label: 'Observações (aparecem no orçamento)', type: 'textarea' },
      { name: 'observacoes_internas', label: 'Observações internas', type: 'textarea' },
      { name: 'condicoes_gerais', label: 'Condições gerais (aparecem no orçamento)', type: 'textarea', hint: 'Na inclusão vem das Configurações' },
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    // Inclusão pelo botão "Importar .dae" (upload); abrir mostra a árvore e o visualizador 3D
    name: 'importacoes_dae',
    table: 'importacoes_dae',
    label: 'Importações .dae',
    labelSingular: 'Importação',
    description: 'Arquivos COLLADA (.dae) dos projetos: árvore de peças e visualizador 3D',
    icon: 'Box',
    group: 'orcamentos',
    pk: ['id'],
    autoIncrement: true,
    labelField: 'arquivo_nome',
    defaultSort: { field: 'id', dir: 'desc' },
    canCreate: false,
    canUpdate: false,
    canDelete: true,
    fields: [
      { ...ID, listed: true },
      { name: 'arquivo_nome', label: 'Arquivo', type: 'text', readOnly: true, listed: true, searchable: true, width: 'lg' },
      { name: 'status', label: 'Situação', type: 'enum', readOnly: true, listed: true, filterable: true, options: STATUS_IMPORTACAO },
      { name: 'orcamento_id', label: 'Orçamento', type: 'number', readOnly: true, listed: true },
      { name: 'total_objetos', label: 'Objetos', type: 'number', readOnly: true, listed: true },
      { name: 'total_desconhecidos', label: 'Peças a classificar', type: 'number', readOnly: true, listed: true },
      { name: 'ferramenta_origem', label: 'Origem', type: 'text', readOnly: true, listed: true },
      { name: 'unidade_nome', label: 'Unidade', type: 'text', readOnly: true },
      { name: 'eixo_up', label: 'Eixo up', type: 'text', readOnly: true },
      { name: 'tamanho_bytes', label: 'Tamanho (bytes)', type: 'number', readOnly: true },
      { name: 'mensagem_erro', label: 'Erro', type: 'text', readOnly: true, listed: true },
      { name: 'usuario_id', label: 'Usuário', type: 'number', readOnly: true, listed: true, ref: { resource: 'usuarios', labelField: 'nome' } },
      { name: 'created_at', label: 'Importado em', type: 'datetime', readOnly: true, listed: true },
    ],
  },

  // ===========================================================================
  // CADASTROS
  // ===========================================================================
  {
    name: 'clientes',
    table: 'clientes',
    label: 'Clientes',
    labelSingular: 'Cliente',
    description: 'Clientes dos orçamentos',
    icon: 'Users',
    group: 'cadastros',
    ...BASE,
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    ...ATIVOS,
    fields: [
      ID,
      { name: 'tipo_pessoa', label: 'Pessoa', type: 'enum', required: true, listed: true, filterable: true, options: TIPOS_PESSOA, default: 'F', width: 'sm' },
      { name: 'nome', label: 'Nome / razão social', type: 'text', required: true, listed: true, searchable: true, maxLength: 150, span: 2, width: 'lg' },
      { name: 'nome_fantasia', label: 'Nome fantasia', type: 'text', searchable: true, maxLength: 150, quando: { campo: 'tipo_pessoa', valores: ['J'] } },
      { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'cnpj', listed: true, searchable: true },
      { name: 'rg_ie', label: 'RG / IE', type: 'text', maxLength: 20 },
      { name: 'email', label: 'E-mail', type: 'text', listed: true, searchable: true, maxLength: 150 },
      { name: 'telefone', label: 'Telefone', type: 'text', maxLength: 20 },
      { name: 'celular', label: 'Celular', type: 'text', listed: true, maxLength: 20 },
      ...ENDERECO,
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ATIVO,
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'arquitetos',
    table: 'arquitetos',
    label: 'Arquitetos',
    labelSingular: 'Arquiteto',
    description: 'Arquitetos e designers que originam os projetos (base da RT)',
    icon: 'PencilRuler',
    group: 'cadastros',
    ...BASE,
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    ...ATIVOS,
    fields: [
      ID,
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 150, span: 2, width: 'lg' },
      { name: 'escritorio', label: 'Escritório', type: 'text', listed: true, searchable: true, maxLength: 150, span: 2 },
      { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'cnpj', searchable: true },
      { name: 'registro_cau', label: 'Registro CAU', type: 'text', maxLength: 20 },
      { name: 'email', label: 'E-mail', type: 'text', listed: true, searchable: true, maxLength: 150 },
      { name: 'telefone', label: 'Telefone', type: 'text', maxLength: 20 },
      { name: 'celular', label: 'Celular', type: 'text', listed: true, maxLength: 20 },
      { name: 'perc_rt', label: 'RT (%)', type: 'decimal', scale: 2, listed: true, hint: 'Em branco: usa a RT padrão das Configurações' },
      { name: 'chave_pix', label: 'Chave Pix', type: 'text', maxLength: 100 },
      { name: 'software_padrao', label: 'Software', type: 'enum', listed: true, filterable: true, options: SOFTWARES },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ATIVO,
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'fornecedores',
    table: 'fornecedores',
    label: 'Fornecedores',
    labelSingular: 'Fornecedor',
    description: 'Fornecedores de chapas, ferragens e insumos',
    icon: 'Truck',
    group: 'cadastros',
    ...BASE,
    labelField: 'razao_social',
    defaultSort: { field: 'razao_social', dir: 'asc' },
    ...ATIVOS,
    fields: [
      ID,
      { name: 'tipo_pessoa', label: 'Pessoa', type: 'enum', required: true, options: TIPOS_PESSOA, default: 'J', width: 'sm' },
      { name: 'razao_social', label: 'Razão social', type: 'text', required: true, listed: true, searchable: true, maxLength: 150, span: 2, width: 'lg' },
      { name: 'nome_fantasia', label: 'Nome fantasia', type: 'text', listed: true, searchable: true, maxLength: 150 },
      { name: 'cpf_cnpj', label: 'CPF/CNPJ', type: 'cnpj', listed: true, searchable: true },
      { name: 'inscricao_estadual', label: 'Inscrição estadual', type: 'text', maxLength: 20 },
      { name: 'contato', label: 'Contato', type: 'text', listed: true, maxLength: 100 },
      { name: 'email', label: 'E-mail', type: 'text', searchable: true, maxLength: 150 },
      { name: 'telefone', label: 'Telefone', type: 'text', listed: true, maxLength: 20 },
      { name: 'celular', label: 'Celular', type: 'text', maxLength: 20 },
      ...ENDERECO,
      { name: 'prazo_entrega_dias', label: 'Prazo de entrega (dias)', type: 'number' },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ATIVO,
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'condicoes_pagamento',
    table: 'condicoes_pagamento',
    label: 'Condições de Pagamento',
    labelSingular: 'Condição de Pagamento',
    description: 'Entrada, parcelas e ajuste (desconto ou acréscimo) sobre o valor',
    icon: 'CreditCard',
    group: 'cadastros',
    ...BASE,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    ...ATIVOS,
    fields: [
      ID,
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, maxLength: 80, span: 2, width: 'lg' },
      { name: 'perc_entrada', label: 'Entrada (%)', type: 'decimal', scale: 2, required: true, listed: true },
      { name: 'numero_parcelas', label: 'Parcelas após a entrada', type: 'number', required: true, listed: true, default: '1' },
      { name: 'intervalo_dias', label: 'Intervalo (dias)', type: 'number', required: true, listed: true, default: '30' },
      { name: 'perc_ajuste', label: 'Ajuste (%)', type: 'decimal', scale: 2, required: true, listed: true, allowNegative: true, hint: 'Negativo = desconto; positivo = acréscimo (digite "-" para alternar o sinal)' },
      ATIVO,
    ],
  },

  // ===========================================================================
  // CATÁLOGO
  // ===========================================================================
  {
    name: 'unidades_medida',
    table: 'unidades_medida',
    label: 'Unidades',
    labelSingular: 'Unidade',
    description: 'Unidades de medida do catálogo',
    icon: 'Ruler',
    group: 'catalogo',
    ...BASE,
    labelField: 'sigla',
    defaultSort: { field: 'sigla', dir: 'asc' },
    fields: [
      ID,
      { name: 'sigla', label: 'Sigla', type: 'text', required: true, listed: true, searchable: true, maxLength: 6, width: 'sm' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, maxLength: 50, span: 2 },
      { name: 'casas_decimais', label: 'Casas decimais', type: 'number', required: true, listed: true, default: '2' },
    ],
  },
  {
    name: 'categorias',
    table: 'categorias',
    label: 'Categorias',
    labelSingular: 'Categoria',
    description: 'Categorias de matéria-prima, insumo, material e serviço',
    icon: 'Tags',
    group: 'catalogo',
    ...BASE,
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    ...ATIVOS,
    fields: [
      ID,
      { name: 'modulo', label: 'Módulo', type: 'enum', required: true, listed: true, filterable: true, options: MODULOS },
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 80, span: 2, width: 'lg' },
      { name: 'categoria_pai_id', label: 'Categoria pai', type: 'number', listed: true, ref: { resource: 'categorias', labelField: 'nome' } },
      ATIVO,
    ],
  },
  {
    name: 'acabamentos',
    table: 'acabamentos',
    label: 'Acabamentos',
    labelSingular: 'Acabamento',
    description: 'Padrões e cores (Branco TX, Louro Freijó, Grafite...)',
    icon: 'Palette',
    group: 'catalogo',
    ...BASE,
    labelField: 'nome',
    defaultSort: { field: 'nome', dir: 'asc' },
    ...ATIVOS,
    fields: [
      ID,
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 80, span: 2, width: 'lg' },
      { name: 'fabricante', label: 'Fabricante', type: 'text', listed: true, searchable: true, filterable: true, maxLength: 80, placeholder: 'Duratex, Arauco, Guararapes...' },
      { name: 'codigo_fabricante', label: 'Código no fabricante', type: 'text', searchable: true, maxLength: 40 },
      { name: 'textura', label: 'Textura', type: 'text', listed: true, maxLength: 40, placeholder: 'TX, Liso, Matt...' },
      { name: 'cor_hex', label: 'Cor no 3D', type: 'cor', listed: true },
      { name: 'imagem_path', label: 'Imagem', type: 'imagem' },
      ATIVO,
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'materias_primas',
    table: 'materias_primas',
    label: 'Matérias-primas',
    labelSingular: 'Matéria-prima',
    description: 'Chapas, fitas de borda, maciço, vidro e espelho',
    icon: 'Layers',
    group: 'catalogo',
    ...BASE,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    ...ATIVOS,
    preco: { campo: 'custo_unitario', data: 'data_ultimo_preco', tipoItem: 'MATERIA_PRIMA' },
    details: [historico('MATERIA_PRIMA')],
    fields: [
      ID,
      { name: 'codigo', label: 'Código', type: 'text', listed: true, searchable: true, maxLength: 30, width: 'sm' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, maxLength: 150, span: 2, width: 'lg' },
      { name: 'tipo', label: 'Tipo', type: 'enum', required: true, listed: true, filterable: true, options: TIPOS_MP },
      { name: 'material_base', label: 'Material', type: 'enum', listed: true, filterable: true, options: MATERIAIS_BASE },
      { name: 'acabamento_id', label: 'Acabamento', type: 'number', listed: true, filterable: true, ref: { resource: 'acabamentos', labelField: 'nome' } },
      { name: 'categoria_id', label: 'Categoria', type: 'number', filterable: true, ref: { resource: 'categorias', labelField: 'nome' }, refFiltro: { campo: 'modulo', valor: 'MATERIA_PRIMA' } },
      { name: 'fornecedor_id', label: 'Fornecedor', type: 'number', filterable: true, ref: { resource: 'fornecedores', labelField: 'razao_social' } },
      { name: 'unidade_id', label: 'Unidade', type: 'number', required: true, ref: { resource: 'unidades_medida', labelField: 'sigla' }, hint: 'CH para chapa, M para fita, M2 para vidro' },
      { name: 'espessura_mm', label: 'Espessura (mm)', type: 'decimal', scale: 2, listed: true, filterable: true, secao: 'Medidas', obrigatorioQuando: { campo: 'tipo', valores: ['CHAPA', 'FITA_BORDA'] } },
      { name: 'largura_mm', label: 'Largura (mm)', type: 'decimal', scale: 2, listed: true, secao: 'Medidas', obrigatorioQuando: { campo: 'tipo', valores: ['CHAPA', 'FITA_BORDA'] }, hint: 'Chapa: menor lado; fita: largura' },
      { name: 'comprimento_mm', label: 'Comprimento (mm)', type: 'decimal', scale: 2, listed: true, secao: 'Medidas', obrigatorioQuando: { campo: 'tipo', valores: ['CHAPA'] }, hint: 'Chapa: maior lado; fita: rolo' },
      { name: 'faces_revestidas', label: 'Faces revestidas', type: 'number', secao: 'Medidas', quando: { campo: 'tipo', valores: ['CHAPA'] }, hint: '0, 1 ou 2' },
      { name: 'possui_veio', label: 'Possui veio', type: 'boolean', secao: 'Medidas', quando: { campo: 'tipo', valores: ['CHAPA', 'LAMINA', 'MACICO'] }, hint: 'Ligado: o plano de corte não gira as peças' },
      { name: 'custo_unitario', label: 'Custo unitário (R$)', type: 'decimal', scale: 2, required: true, listed: true, secao: 'Custo', hint: 'Por chapa, por metro ou por m², conforme a unidade' },
      { name: 'custo_m2', label: 'Custo por m² (R$)', type: 'decimal', scale: 2, readOnly: true, listed: true },
      { name: 'perc_perda', label: 'Perda (%)', type: 'decimal', scale: 2, secao: 'Custo', hint: 'Em branco: usa a perda padrão das Configurações' },
      { name: 'data_ultimo_preco', label: 'Último preço', type: 'date', readOnly: true, listed: true },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ATIVO,
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'insumos',
    table: 'insumos',
    label: 'Insumos',
    labelSingular: 'Insumo',
    description: 'Consumíveis de fabricação: cola, parafuso, cavilha, minifix, lixa...',
    icon: 'Package',
    group: 'catalogo',
    ...BASE,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    ...ATIVOS,
    preco: { campo: 'custo_unitario', data: 'data_ultimo_preco', tipoItem: 'INSUMO' },
    details: [historico('INSUMO')],
    fields: [
      ID,
      { name: 'codigo', label: 'Código', type: 'text', listed: true, searchable: true, maxLength: 30, width: 'sm' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, maxLength: 150, span: 2, width: 'lg' },
      { name: 'categoria_id', label: 'Categoria', type: 'number', listed: true, filterable: true, ref: { resource: 'categorias', labelField: 'nome' }, refFiltro: { campo: 'modulo', valor: 'INSUMO' } },
      { name: 'fornecedor_id', label: 'Fornecedor', type: 'number', filterable: true, ref: { resource: 'fornecedores', labelField: 'razao_social' } },
      { name: 'unidade_id', label: 'Unidade', type: 'number', required: true, listed: true, ref: { resource: 'unidades_medida', labelField: 'sigla' } },
      { name: 'custo_unitario', label: 'Custo unitário (R$)', type: 'decimal', scale: 4, required: true, listed: true },
      { name: 'data_ultimo_preco', label: 'Último preço', type: 'date', readOnly: true, listed: true },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ATIVO,
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'materiais',
    table: 'materiais',
    label: 'Ferragens e Acessórios',
    labelSingular: 'Ferragem',
    description: 'Puxadores, dobradiças, corrediças, pistões e acessórios',
    icon: 'Wrench',
    group: 'catalogo',
    ...BASE,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    ...ATIVOS,
    preco: { campo: 'custo_unitario', data: 'data_ultimo_preco', tipoItem: 'MATERIAL' },
    details: [historico('MATERIAL')],
    fields: [
      ID,
      { name: 'codigo', label: 'Código', type: 'text', listed: true, searchable: true, maxLength: 30, width: 'sm' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, maxLength: 150, span: 2, width: 'lg' },
      { name: 'tipo', label: 'Tipo', type: 'enum', required: true, listed: true, filterable: true, options: TIPOS_MATERIAL },
      { name: 'categoria_id', label: 'Categoria', type: 'number', filterable: true, ref: { resource: 'categorias', labelField: 'nome' }, refFiltro: { campo: 'modulo', valor: 'MATERIAL' } },
      { name: 'fornecedor_id', label: 'Fornecedor', type: 'number', filterable: true, ref: { resource: 'fornecedores', labelField: 'razao_social' } },
      { name: 'unidade_id', label: 'Unidade', type: 'number', required: true, ref: { resource: 'unidades_medida', labelField: 'sigla' } },
      { name: 'marca', label: 'Marca', type: 'text', listed: true, searchable: true, filterable: true, maxLength: 60 },
      { name: 'modelo', label: 'Modelo', type: 'text', searchable: true, maxLength: 80 },
      { name: 'acabamento', label: 'Acabamento', type: 'text', maxLength: 60, placeholder: 'Cromado, preto fosco, inox...' },
      { name: 'medida_mm', label: 'Medida (mm)', type: 'decimal', scale: 2, listed: true, hint: 'Corrediça 450, puxador 160 (entre furos)...' },
      { name: 'custo_unitario', label: 'Custo unitário (R$)', type: 'decimal', scale: 2, required: true, listed: true },
      { name: 'data_ultimo_preco', label: 'Último preço', type: 'date', readOnly: true, listed: true },
      { name: 'imagem_path', label: 'Foto', type: 'imagem' },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ATIVO,
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    name: 'servicos',
    table: 'servicos',
    label: 'Serviços',
    labelSingular: 'Serviço',
    description: 'Mão de obra: corte, fitagem, montagem, instalação, frete...',
    icon: 'Hammer',
    group: 'catalogo',
    ...BASE,
    labelField: 'descricao',
    defaultSort: { field: 'descricao', dir: 'asc' },
    ...ATIVOS,
    preco: { campo: 'valor_unitario', tipoItem: 'SERVICO' },
    details: [historico('SERVICO')],
    fields: [
      ID,
      { name: 'codigo', label: 'Código', type: 'text', listed: true, searchable: true, maxLength: 30, width: 'sm' },
      { name: 'descricao', label: 'Descrição', type: 'text', required: true, listed: true, searchable: true, maxLength: 150, span: 2, width: 'lg' },
      { name: 'tipo', label: 'Tipo', type: 'enum', required: true, listed: true, filterable: true, options: TIPOS_SERVICO },
      { name: 'categoria_id', label: 'Categoria', type: 'number', filterable: true, ref: { resource: 'categorias', labelField: 'nome' }, refFiltro: { campo: 'modulo', valor: 'SERVICO' } },
      { name: 'base_calculo', label: 'Base de cálculo', type: 'enum', required: true, listed: true, filterable: true, options: BASES_SERVICO, hint: 'Por hora, por km e fixo entram manualmente no orçamento' },
      { name: 'valor_unitario', label: 'Valor unitário (R$)', type: 'decimal', scale: 2, required: true, listed: true },
      { name: 'aplicar_automatico', label: 'Aplicar automaticamente', type: 'boolean', listed: true, filterable: true, hint: 'Lançado pelo cálculo em todo orçamento' },
      { name: 'observacoes', label: 'Observações', type: 'textarea' },
      ATIVO,
      ...CRIADO_ATUALIZADO,
    ],
  },
  {
    // Gravado pelos triggers do banco; só leitura, aparece embaixo de cada item do catálogo
    name: 'historico_precos',
    table: 'historico_precos',
    label: 'Histórico de preços',
    labelSingular: 'Alteração de preço',
    description: 'Alterações de custo registradas pelo banco',
    icon: 'History',
    group: 'catalogo',
    oculto: true,
    pk: ['id'],
    autoIncrement: true,
    labelField: 'id',
    defaultSort: { field: 'created_at', dir: 'desc' },
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    fields: [
      { name: 'created_at', label: 'Data', type: 'datetime', readOnly: true, listed: true },
      { name: 'tipo_item', label: 'Item', type: 'enum', readOnly: true, options: MODULOS },
      { name: 'item_id', label: 'Id do item', type: 'number', readOnly: true },
      { name: 'custo_anterior', label: 'Anterior (R$)', type: 'decimal', scale: 4, readOnly: true, listed: true },
      { name: 'custo_novo', label: 'Novo (R$)', type: 'decimal', scale: 4, readOnly: true, listed: true },
      { name: 'variacao_perc', label: 'Variação (%)', type: 'decimal', scale: 2, readOnly: true, listed: true },
      { name: 'usuario_id', label: 'Usuário', type: 'number', readOnly: true, listed: true, ref: { resource: 'usuarios', labelField: 'nome' } },
    ],
  },

  // ===========================================================================
  // REGRAS DE CONSTRUÇÃO
  // ===========================================================================
  {
    name: 'tipos_peca',
    table: 'tipos_peca',
    label: 'Tipos de Peça',
    labelSingular: 'Tipo de Peça',
    description: 'Classificação das peças importadas: palavras-chave, fitas padrão, veio e frente',
    icon: 'Shapes',
    group: 'regras',
    ...BASE,
    labelField: 'nome',
    defaultSort: { field: 'ordem', dir: 'asc' },
    ...ATIVOS,
    fields: [
      ID,
      { name: 'codigo', label: 'Código', type: 'text', required: true, listed: true, searchable: true, maxLength: 20, width: 'sm' },
      { name: 'nome', label: 'Nome', type: 'text', required: true, listed: true, searchable: true, maxLength: 60 },
      { name: 'ordem', label: 'Ordem', type: 'number', required: true, listed: true, default: '0' },
      { name: 'palavras_chave', label: 'Palavras-chave', type: 'text', listed: true, searchable: true, maxLength: 255, hint: 'Separadas por vírgula; gravadas em minúsculas e sem acento: lateral,lat,ld,le' },
      { name: 'fita_comp1', label: 'Fita C1', type: 'boolean', listed: true, secao: 'Fita padrão por borda' },
      { name: 'fita_comp2', label: 'Fita C2', type: 'boolean', listed: true, secao: 'Fita padrão por borda' },
      { name: 'fita_larg1', label: 'Fita L1', type: 'boolean', listed: true, secao: 'Fita padrão por borda' },
      { name: 'fita_larg2', label: 'Fita L2', type: 'boolean', listed: true, secao: 'Fita padrão por borda' },
      { name: 'respeita_veio', label: 'Respeita veio', type: 'boolean', listed: true, default: true, secao: 'Comportamento' },
      { name: 'eh_frente', label: 'É frente', type: 'boolean', listed: true, secao: 'Comportamento', hint: 'Porta/frente de gaveta: usa o acabamento de frente do móvel' },
      ATIVO,
    ],
  },
  {
    name: 'regras_ferragem',
    table: 'regras_ferragem',
    label: 'Regras de Ferragem',
    labelSingular: 'Regra de Ferragem',
    description: 'Ferragens por tipo de peça e faixa de medida (ex.: porta até 900 mm = 2 dobradiças)',
    icon: 'ListChecks',
    group: 'regras',
    ...BASE,
    labelField: 'id',
    defaultSort: { field: 'tipo_peca_id', dir: 'asc' },
    ...ATIVOS,
    fields: [
      ID,
      { name: 'tipo_peca_id', label: 'Tipo de peça', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'tipos_peca', labelField: 'nome' } },
      { name: 'material_id', label: 'Ferragem', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'materiais', labelField: 'descricao' }, span: 2 },
      { name: 'quantidade', label: 'Quantidade por peça', type: 'number', required: true, listed: true, default: '1' },
      { name: 'dimensao_referencia', label: 'Medida de referência', type: 'enum', required: true, listed: true, options: DIMENSOES, default: 'NENHUMA' },
      { name: 'dimensao_min_mm', label: 'De (mm)', type: 'decimal', scale: 2, listed: true, quando: { campo: 'dimensao_referencia', valores: ['COMPRIMENTO', 'LARGURA'] }, obrigatorioQuando: { campo: 'dimensao_referencia', valores: ['COMPRIMENTO', 'LARGURA'] } },
      { name: 'dimensao_max_mm', label: 'Até (mm)', type: 'decimal', scale: 2, listed: true, quando: { campo: 'dimensao_referencia', valores: ['COMPRIMENTO', 'LARGURA'] }, obrigatorioQuando: { campo: 'dimensao_referencia', valores: ['COMPRIMENTO', 'LARGURA'] } },
      { name: 'observacoes', label: 'Observações', type: 'text', listed: true, maxLength: 255, span: 2 },
      ATIVO,
    ],
  },
  {
    name: 'regras_insumo',
    table: 'regras_insumo',
    label: 'Regras de Insumo',
    labelSingular: 'Regra de Insumo',
    description: 'Consumo automático de insumos por m², metro de fita, peça, chapa, móvel, ferragem ou orçamento',
    icon: 'FlaskConical',
    group: 'regras',
    ...BASE,
    labelField: 'id',
    defaultSort: { field: 'insumo_id', dir: 'asc' },
    ...ATIVOS,
    fields: [
      ID,
      { name: 'insumo_id', label: 'Insumo', type: 'number', required: true, listed: true, filterable: true, ref: { resource: 'insumos', labelField: 'descricao' }, span: 2 },
      { name: 'base_calculo', label: 'Base de cálculo', type: 'enum', required: true, listed: true, filterable: true, options: BASES_INSUMO },
      { name: 'consumo', label: 'Consumo por unidade da base', type: 'decimal', scale: 5, required: true, listed: true },
      { name: 'tipo_peca_id', label: 'Só no tipo de peça', type: 'number', listed: true, ref: { resource: 'tipos_peca', labelField: 'nome' }, quando: { campo: 'base_calculo', valores: ['POR_PECA', 'POR_M2_PECA'] }, hint: 'Em branco: todas as peças' },
      { name: 'tipo_material', label: 'Só no tipo de ferragem', type: 'enum', listed: true, options: TIPOS_MATERIAL, quando: { campo: 'base_calculo', valores: ['POR_FERRAGEM'] }, hint: 'Em branco: todas as ferragens' },
      { name: 'arredondar_para_cima', label: 'Arredondar para cima', type: 'boolean', listed: true, hint: 'Total inteiro (caixas, tubos)' },
      ATIVO,
    ],
  },
  {
    name: 'mapeamentos_dae',
    table: 'mapeamentos_dae',
    label: 'Mapeamentos .dae',
    labelSingular: 'Mapeamento',
    description: 'De-para entre nomes do modelo 3D (material, componente, nó) e o catálogo',
    icon: 'Waypoints',
    group: 'regras',
    ...BASE,
    labelField: 'padrao',
    defaultSort: { field: 'prioridade', dir: 'asc' },
    ...ATIVOS,
    fields: [
      ID,
      { name: 'origem', label: 'Compara com', type: 'enum', required: true, listed: true, filterable: true, options: ORIGENS_DAE },
      { name: 'modo_comparacao', label: 'Modo', type: 'enum', required: true, listed: true, options: MODOS_COMPARACAO, default: 'CONTEM' },
      { name: 'padrao', label: 'Padrão', type: 'text', required: true, listed: true, searchable: true, maxLength: 150, hint: 'Comparado em minúsculas e sem acento; no modo Regex vale a expressão como escrita' },
      { name: 'prioridade', label: 'Prioridade', type: 'number', required: true, listed: true, allowNegative: true, default: '100', hint: 'Menor = avaliado primeiro' },
      { name: 'acao', label: 'Ação', type: 'enum', required: true, listed: true, filterable: true, options: ACOES_DAE },
      { name: 'arquiteto_id', label: 'Só do arquiteto', type: 'number', listed: true, filterable: true, ref: { resource: 'arquitetos', labelField: 'nome' }, hint: 'Em branco: regra global' },
      { name: 'acabamento_id', label: 'Acabamento', type: 'number', listed: true, ref: { resource: 'acabamentos', labelField: 'nome' }, quando: PECA, hint: 'A chapa é escolhida pela espessura da peça' },
      { name: 'materia_prima_id', label: 'Chapa fixa', type: 'number', ref: { resource: 'materias_primas', labelField: 'descricao' }, refFiltro: { campo: 'tipo', valor: 'CHAPA' }, quando: PECA, hint: 'Sobrepõe o acabamento' },
      { name: 'fita_borda_id', label: 'Fita', type: 'number', ref: { resource: 'materias_primas', labelField: 'descricao' }, refFiltro: { campo: 'tipo', valor: 'FITA_BORDA' }, quando: PECA },
      { name: 'tipo_peca_id', label: 'Tipo de peça', type: 'number', ref: { resource: 'tipos_peca', labelField: 'nome' }, quando: PECA },
      { name: 'material_id', label: 'Ferragem', type: 'number', listed: true, ref: { resource: 'materiais', labelField: 'descricao' }, quando: { campo: 'acao', valores: ['FERRAGEM'] }, obrigatorioQuando: { campo: 'acao', valores: ['FERRAGEM'] } },
      { name: 'insumo_id', label: 'Insumo', type: 'number', listed: true, ref: { resource: 'insumos', labelField: 'descricao' }, quando: { campo: 'acao', valores: ['INSUMO'] }, obrigatorioQuando: { campo: 'acao', valores: ['INSUMO'] } },
      { name: 'vezes_aplicado', label: 'Vezes aplicado', type: 'number', readOnly: true, listed: true },
      ATIVO,
      ...CRIADO_ATUALIZADO,
    ],
  },
];

export const RESOURCE_MAP: Record<string, ResourceDef> = Object.fromEntries(
  RESOURCES.map((r) => [r.name, r]),
);

export function getResource(name: string): ResourceDef | null {
  return Object.prototype.hasOwnProperty.call(RESOURCE_MAP, name) ? RESOURCE_MAP[name] : null;
}

/** Colunas graváveis: exclui readOnly e a PK */
export function writableFields(resource: ResourceDef): FieldDef[] {
  return resource.fields.filter((f) => !f.readOnly && !resource.pk.includes(f.name));
}

/** Expressão SQL da coluna: a própria coluna da tabela ou a expressão da coluna calculada */
export function colunaSql(resource: ResourceDef, nome: string): string {
  return resource.fields.find((f) => f.name === nome)?.sql ?? `t.${nome}`;
}

/** Todas as colunas conhecidas — whitelist de ordenação e filtros */
export function columnNames(resource: ResourceDef): string[] {
  return resource.fields.map((f) => f.name);
}
