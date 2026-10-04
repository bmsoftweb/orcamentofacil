-- =============================================================================
--  BMsoft Marcenaria — Sistema de Orçamentos de Móveis Planejados
--  Migration completa · MySQL 8.0.16+ · InnoDB · utf8mb4
--
--  Módulos:
--    1. Base / segurança ........ configuracoes, usuarios, numeradores
--    2. Cadastros gerais ........ unidades, categorias, clientes, arquitetos,
--                                 fornecedores, condicoes_pagamento
--    3. Catálogo ................ acabamentos, materias_primas (chapas, fitas,
--                                 maciço, vidro...), insumos, materiais
--                                 (ferragens/acessórios), servicos
--    4. Regras de construção .... tipos_peca, regras_ferragem, regras_insumo,
--                                 mapeamentos_dae
--    5. Importação .dae ......... importacoes_dae, importacao_objetos
--    6. Orçamento ............... orcamentos, orcamento_ambientes,
--                                 orcamento_moveis, orcamento_pecas,
--                                 orcamento_itens, orcamento_consumos,
--                                 orcamento_planos_corte, orcamento_anexos,
--                                 orcamento_status_historico
--    7. Auditoria ............... historico_precos (+ triggers)
--    8. Views ................... vw_orcamentos_resumo, vw_pecas_corte,
--                                 vw_catalogo_precos
--    9. Seeds ................... dados básicos e exemplos (preços zerados)
--
--  Convenções:
--    - Medidas lineares em milímetros (mm); áreas em m²; metros lineares em m.
--    - Valores monetários: DECIMAL(14,2); custos unitários: DECIMAL(14,4).
--    - Percentuais armazenados como 0–100 (ex.: 12.50 = 12,5%).
--    - Preços dos itens são COPIADOS (snapshot) para o orçamento, para que
--      reajustes no catálogo não alterem orçamentos já emitidos.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Remoção em ordem reversa (permite re-executar em ambiente de desenvolvimento)
DROP VIEW  IF EXISTS vw_catalogo_precos;
DROP VIEW  IF EXISTS vw_pecas_corte;
DROP VIEW  IF EXISTS vw_orcamentos_resumo;
DROP TABLE IF EXISTS historico_precos;
DROP TABLE IF EXISTS orcamento_status_historico;
DROP TABLE IF EXISTS orcamento_anexos;
DROP TABLE IF EXISTS orcamento_planos_corte;
DROP TABLE IF EXISTS orcamento_consumos;
DROP TABLE IF EXISTS orcamento_itens;
DROP TABLE IF EXISTS orcamento_pecas;
DROP TABLE IF EXISTS orcamento_moveis;
DROP TABLE IF EXISTS importacao_objetos;
DROP TABLE IF EXISTS importacoes_dae;
DROP TABLE IF EXISTS orcamento_ambientes;
DROP TABLE IF EXISTS orcamentos;
DROP TABLE IF EXISTS mapeamentos_dae;
DROP TABLE IF EXISTS regras_insumo;
DROP TABLE IF EXISTS regras_ferragem;
DROP TABLE IF EXISTS tipos_peca;
DROP TABLE IF EXISTS servicos;
DROP TABLE IF EXISTS materiais;
DROP TABLE IF EXISTS insumos;
DROP TABLE IF EXISTS materias_primas;
DROP TABLE IF EXISTS acabamentos;
DROP TABLE IF EXISTS condicoes_pagamento;
DROP TABLE IF EXISTS fornecedores;
DROP TABLE IF EXISTS arquitetos;
DROP TABLE IF EXISTS clientes;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS unidades_medida;
DROP TABLE IF EXISTS numeradores;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS configuracoes;

SET FOREIGN_KEY_CHECKS = 1;


-- =============================================================================
-- 1. BASE / SEGURANÇA
-- =============================================================================

-- Parâmetros da empresa (linha única, id = 1)
CREATE TABLE configuracoes (
  id                          TINYINT UNSIGNED NOT NULL DEFAULT 1,
  razao_social                VARCHAR(150) NOT NULL,
  nome_fantasia               VARCHAR(150) NULL,
  cnpj                        VARCHAR(18)  NULL,
  inscricao_estadual          VARCHAR(20)  NULL,
  telefone                    VARCHAR(20)  NULL,
  email                       VARCHAR(150) NULL,
  site                        VARCHAR(150) NULL,
  cep                         VARCHAR(9)   NULL,
  logradouro                  VARCHAR(150) NULL,
  numero                      VARCHAR(10)  NULL,
  complemento                 VARCHAR(60)  NULL,
  bairro                      VARCHAR(80)  NULL,
  cidade                      VARCHAR(80)  NULL,
  uf                          CHAR(2)      NULL,
  logo_path                   VARCHAR(255) NULL,

  -- Formação de preço (markup divisor): preço = custo / (1 - Σ% / 100)
  perc_margem_padrao          DECIMAL(6,2) NOT NULL DEFAULT 30.00,
  perc_impostos_padrao        DECIMAL(6,2) NOT NULL DEFAULT 6.00,
  perc_custo_fixo_padrao      DECIMAL(6,2) NOT NULL DEFAULT 10.00,  -- rateio de despesas fixas
  perc_comissao_padrao        DECIMAL(6,2) NOT NULL DEFAULT 0.00,   -- vendedor
  perc_rt_padrao              DECIMAL(6,2) NOT NULL DEFAULT 10.00,  -- reserva técnica do arquiteto

  -- Parâmetros de produção / plano de corte
  espessura_serra_mm          DECIMAL(5,2) NOT NULL DEFAULT 4.00,   -- kerf
  refilo_chapa_mm             DECIMAL(6,2) NOT NULL DEFAULT 10.00,  -- borda descartada por lado
  perc_perda_chapa_padrao     DECIMAL(6,2) NOT NULL DEFAULT 15.00,  -- usado no critério por área
  perc_perda_fita_padrao      DECIMAL(6,2) NOT NULL DEFAULT 10.00,
  sobra_fita_por_borda_mm     DECIMAL(6,2) NOT NULL DEFAULT 50.00,  -- sobra p/ aparo em cada borda
  criterio_cobranca_chapa     ENUM('AREA_COM_PERDA','CHAPA_INTEIRA') NOT NULL DEFAULT 'CHAPA_INTEIRA',

  -- Importação .dae
  tolerancia_espessura_mm     DECIMAL(5,2) NOT NULL DEFAULT 0.60,   -- casar espessura do modelo com a chapa
  arredondamento_medida_mm    DECIMAL(5,2) NOT NULL DEFAULT 1.00,   -- arredonda medidas extraídas

  -- Orçamento
  validade_orcamento_dias     SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  prazo_entrega_dias          SMALLINT UNSIGNED NOT NULL DEFAULT 45,
  texto_condicoes_gerais      TEXT NULL,
  texto_rodape_orcamento      TEXT NULL,

  created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_config_linha_unica CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Parâmetros gerais da marcenaria (linha única)';

CREATE TABLE usuarios (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome            VARCHAR(100) NOT NULL,
  email           VARCHAR(150) NOT NULL,
  senha_hash      VARCHAR(255) NOT NULL,
  perfil          ENUM('ADMIN','ORCAMENTISTA','VENDEDOR','PRODUCAO') NOT NULL DEFAULT 'ORCAMENTISTA',
  perc_comissao   DECIMAL(6,2) NULL COMMENT 'Sobrepõe a comissão padrão quando for o vendedor',
  ativo           TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acesso   DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Numeração sequencial por ano (ORC-2026-0001). Incrementar com
-- UPDATE ... SET ultimo_numero = LAST_INSERT_ID(ultimo_numero + 1) dentro de transação.
CREATE TABLE numeradores (
  chave           VARCHAR(30) NOT NULL,
  ano             SMALLINT UNSIGNED NOT NULL,
  ultimo_numero   INT UNSIGNED NOT NULL DEFAULT 0,
  prefixo         VARCHAR(10) NOT NULL,
  PRIMARY KEY (chave, ano)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- =============================================================================
-- 2. CADASTROS GERAIS
-- =============================================================================

CREATE TABLE unidades_medida (
  id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sigla           VARCHAR(6)  NOT NULL,
  descricao       VARCHAR(50) NOT NULL,
  casas_decimais  TINYINT UNSIGNED NOT NULL DEFAULT 2,
  PRIMARY KEY (id),
  UNIQUE KEY uk_unidades_sigla (sigla)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE categorias (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  modulo          ENUM('MATERIA_PRIMA','INSUMO','MATERIAL','SERVICO') NOT NULL,
  nome            VARCHAR(80) NOT NULL,
  categoria_pai_id INT UNSIGNED NULL,
  ativo           TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_categorias_modulo_nome (modulo, nome),
  KEY idx_categorias_pai (categoria_pai_id),
  CONSTRAINT fk_categorias_pai FOREIGN KEY (categoria_pai_id) REFERENCES categorias (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE clientes (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_pessoa     ENUM('F','J') NOT NULL DEFAULT 'F',
  nome            VARCHAR(150) NOT NULL COMMENT 'Nome ou razão social',
  nome_fantasia   VARCHAR(150) NULL,
  cpf_cnpj        VARCHAR(18)  NULL,
  rg_ie           VARCHAR(20)  NULL,
  email           VARCHAR(150) NULL,
  telefone        VARCHAR(20)  NULL,
  celular         VARCHAR(20)  NULL,
  cep             VARCHAR(9)   NULL,
  logradouro      VARCHAR(150) NULL,
  numero          VARCHAR(10)  NULL,
  complemento     VARCHAR(60)  NULL,
  bairro          VARCHAR(80)  NULL,
  cidade          VARCHAR(80)  NULL,
  uf              CHAR(2)      NULL,
  observacoes     TEXT NULL,
  ativo           TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_clientes_cpf_cnpj (cpf_cnpj),
  KEY idx_clientes_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Arquitetos / designers que originam os projetos (base da Reserva Técnica - RT)
CREATE TABLE arquitetos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome            VARCHAR(150) NOT NULL,
  escritorio      VARCHAR(150) NULL,
  cpf_cnpj        VARCHAR(18)  NULL,
  registro_cau    VARCHAR(20)  NULL,
  email           VARCHAR(150) NULL,
  telefone        VARCHAR(20)  NULL,
  celular         VARCHAR(20)  NULL,
  perc_rt         DECIMAL(6,2) NULL COMMENT 'RT negociada; NULL = usa padrão da configuração',
  chave_pix       VARCHAR(100) NULL,
  software_padrao ENUM('SKETCHUP','PROMOB','REVIT','ARCHICAD','AUTOCAD','RHINO','OUTRO') NULL,
  observacoes     TEXT NULL,
  ativo           TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_arquitetos_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE fornecedores (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_pessoa     ENUM('F','J') NOT NULL DEFAULT 'J',
  razao_social    VARCHAR(150) NOT NULL,
  nome_fantasia   VARCHAR(150) NULL,
  cpf_cnpj        VARCHAR(18)  NULL,
  inscricao_estadual VARCHAR(20) NULL,
  contato         VARCHAR(100) NULL,
  email           VARCHAR(150) NULL,
  telefone        VARCHAR(20)  NULL,
  celular         VARCHAR(20)  NULL,
  cep             VARCHAR(9)   NULL,
  logradouro      VARCHAR(150) NULL,
  numero          VARCHAR(10)  NULL,
  complemento     VARCHAR(60)  NULL,
  bairro          VARCHAR(80)  NULL,
  cidade          VARCHAR(80)  NULL,
  uf              CHAR(2)      NULL,
  prazo_entrega_dias SMALLINT UNSIGNED NULL,
  observacoes     TEXT NULL,
  ativo           TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_fornecedores_cpf_cnpj (cpf_cnpj),
  KEY idx_fornecedores_razao (razao_social)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE condicoes_pagamento (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  descricao           VARCHAR(80) NOT NULL,
  perc_entrada        DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  numero_parcelas     TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Parcelas após a entrada',
  intervalo_dias      SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  perc_ajuste         DECIMAL(6,2) NOT NULL DEFAULT 0.00 COMMENT 'Negativo = desconto, positivo = acréscimo',
  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- =============================================================================
-- 3. CATÁLOGO
-- =============================================================================

-- Padrões / cores de acabamento (Branco TX, Louro Freijó, Grafite...)
CREATE TABLE acabamentos (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome                VARCHAR(80) NOT NULL,
  fabricante          VARCHAR(80) NULL COMMENT 'Duratex, Arauco, Guararapes, Berneck...',
  codigo_fabricante   VARCHAR(40) NULL,
  textura             VARCHAR(40) NULL COMMENT 'TX, Liso, Matt, Super Matt, Brilho...',
  cor_hex             CHAR(7) NULL COMMENT 'Cor aproximada para o visualizador 3D',
  imagem_path         VARCHAR(255) NULL,
  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_acabamentos_nome_fabricante (nome, fabricante)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Matéria-prima: o que vira peça (chapas) ou é aplicado nela por metro (fita de borda)
CREATE TABLE materias_primas (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo              VARCHAR(30) NULL,
  descricao           VARCHAR(150) NOT NULL,
  tipo                ENUM('CHAPA','FITA_BORDA','MACICO','VIDRO','ESPELHO','LAMINA','OUTRO') NOT NULL,
  material_base       ENUM('MDF','MDP','COMPENSADO','OSB','HDF','MADEIRA','ALUMINIO','VIDRO','OUTRO') NULL,
  categoria_id        INT UNSIGNED NULL,
  fornecedor_id       INT UNSIGNED NULL,
  acabamento_id       INT UNSIGNED NULL,
  unidade_id          SMALLINT UNSIGNED NOT NULL COMMENT 'CH para chapa, M para fita, M2 para vidro...',
  faces_revestidas    TINYINT UNSIGNED NULL COMMENT '0, 1 ou 2 faces (chapas)',

  espessura_mm        DECIMAL(6,2) NULL,
  largura_mm          DECIMAL(8,2) NULL COMMENT 'Chapa: menor lado | Fita: largura (22, 35, 45...)',
  comprimento_mm      DECIMAL(10,2) NULL COMMENT 'Chapa: maior lado | Fita: comprimento do rolo',
  possui_veio         TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Se 1, o otimizador não pode girar peças',

  custo_unitario      DECIMAL(14,4) NOT NULL DEFAULT 0 COMMENT 'Preço por chapa / por metro / por m² conforme unidade',
  custo_m2            DECIMAL(14,4) GENERATED ALWAYS AS (
                        CASE WHEN tipo = 'CHAPA' AND largura_mm > 0 AND comprimento_mm > 0
                             THEN ROUND(custo_unitario / ((largura_mm * comprimento_mm) / 1000000), 4)
                             ELSE NULL END) STORED,
  perc_perda          DECIMAL(6,2) NULL COMMENT 'NULL = usa padrão da configuração',
  data_ultimo_preco   DATE NULL,

  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  observacoes         TEXT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_materias_primas_codigo (codigo),
  KEY idx_mp_tipo_espessura (tipo, espessura_mm),
  KEY idx_mp_acabamento (acabamento_id),
  KEY idx_mp_fornecedor (fornecedor_id),
  KEY idx_mp_categoria (categoria_id),
  CONSTRAINT fk_mp_categoria   FOREIGN KEY (categoria_id)  REFERENCES categorias (id),
  CONSTRAINT fk_mp_fornecedor  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id),
  CONSTRAINT fk_mp_acabamento  FOREIGN KEY (acabamento_id) REFERENCES acabamentos (id),
  CONSTRAINT fk_mp_unidade     FOREIGN KEY (unidade_id)    REFERENCES unidades_medida (id),
  CONSTRAINT chk_mp_chapa_dimensoes CHECK (
    tipo <> 'CHAPA' OR (espessura_mm > 0 AND largura_mm > 0 AND comprimento_mm > 0)),
  CONSTRAINT chk_mp_fita_dimensoes CHECK (
    tipo <> 'FITA_BORDA' OR (espessura_mm > 0 AND largura_mm > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Chapas (MDF/MDP), fitas de borda, maciço, vidro, espelho';

-- Insumos: consumíveis de fabricação (cola, parafuso, cavilha, minifix, lixa, verniz...)
CREATE TABLE insumos (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo              VARCHAR(30) NULL,
  descricao           VARCHAR(150) NOT NULL,
  categoria_id        INT UNSIGNED NULL,
  fornecedor_id       INT UNSIGNED NULL,
  unidade_id          SMALLINT UNSIGNED NOT NULL,
  custo_unitario      DECIMAL(14,4) NOT NULL DEFAULT 0,
  data_ultimo_preco   DATE NULL,
  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  observacoes         TEXT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_insumos_codigo (codigo),
  KEY idx_insumos_categoria (categoria_id),
  KEY idx_insumos_fornecedor (fornecedor_id),
  CONSTRAINT fk_insumos_categoria  FOREIGN KEY (categoria_id)  REFERENCES categorias (id),
  CONSTRAINT fk_insumos_fornecedor FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id),
  CONSTRAINT fk_insumos_unidade    FOREIGN KEY (unidade_id)    REFERENCES unidades_medida (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Materiais: ferragens e acessórios (puxadores, fechaduras, dobradiças, corrediças...)
CREATE TABLE materiais (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo              VARCHAR(30) NULL,
  descricao           VARCHAR(150) NOT NULL,
  tipo                ENUM('PUXADOR','FECHADURA','DOBRADICA','CORREDICA','PISTAO','ARTICULADOR',
                           'TRILHO','ROLDANA','PE','RODIZIO','SUPORTE','CABIDEIRO','ILUMINACAO',
                           'ACESSORIO_COZINHA','ACESSORIO_CLOSET','OUTRO') NOT NULL,
  categoria_id        INT UNSIGNED NULL,
  fornecedor_id       INT UNSIGNED NULL,
  unidade_id          SMALLINT UNSIGNED NOT NULL,
  marca               VARCHAR(60) NULL,
  modelo              VARCHAR(80) NULL,
  acabamento          VARCHAR(60) NULL COMMENT 'Cromado, preto fosco, inox...',
  medida_mm           DECIMAL(8,2) NULL COMMENT 'Corrediça 450, puxador 160 (entre furos)...',
  custo_unitario      DECIMAL(14,4) NOT NULL DEFAULT 0,
  data_ultimo_preco   DATE NULL,
  imagem_path         VARCHAR(255) NULL,
  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  observacoes         TEXT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_materiais_codigo (codigo),
  KEY idx_materiais_tipo (tipo),
  KEY idx_materiais_categoria (categoria_id),
  KEY idx_materiais_fornecedor (fornecedor_id),
  CONSTRAINT fk_materiais_categoria  FOREIGN KEY (categoria_id)  REFERENCES categorias (id),
  CONSTRAINT fk_materiais_fornecedor FOREIGN KEY (fornecedor_id) REFERENCES fornecedores (id),
  CONSTRAINT fk_materiais_unidade    FOREIGN KEY (unidade_id)    REFERENCES unidades_medida (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Ferragens e acessórios';

-- Serviços / mão de obra (corte, fitagem, montagem, instalação, frete...)
CREATE TABLE servicos (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo              VARCHAR(30) NULL,
  descricao           VARCHAR(150) NOT NULL,
  tipo                ENUM('CORTE','FITAGEM','USINAGEM','MONTAGEM','PINTURA','INSTALACAO',
                           'FRETE','PROJETO','TERCEIRIZADO','OUTRO') NOT NULL,
  categoria_id        INT UNSIGNED NULL,
  base_calculo        ENUM('POR_M2_PECA','POR_METRO_FITA','POR_PECA','POR_CHAPA','POR_MOVEL',
                           'POR_FERRAGEM','POR_HORA','POR_KM','FIXO_ORCAMENTO') NOT NULL,
  valor_unitario      DECIMAL(14,4) NOT NULL DEFAULT 0,
  aplicar_automatico  TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Lançado automaticamente em todo orçamento/móvel',
  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  observacoes         TEXT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_servicos_codigo (codigo),
  KEY idx_servicos_categoria (categoria_id),
  CONSTRAINT fk_servicos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- =============================================================================
-- 4. REGRAS DE CONSTRUÇÃO E MAPEAMENTO DO .DAE
-- =============================================================================

-- Tipos de peça: usados para classificar as peças importadas e aplicar regras
CREATE TABLE tipos_peca (
  id                  SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codigo              VARCHAR(20) NOT NULL,
  nome                VARCHAR(60) NOT NULL,
  palavras_chave      VARCHAR(255) NULL COMMENT 'CSV, minúsculas, sem acento: "lateral,lat,ld,le"',
  fita_comp1          TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Fita padrão na 1ª borda do comprimento',
  fita_comp2          TINYINT(1) NOT NULL DEFAULT 0,
  fita_larg1          TINYINT(1) NOT NULL DEFAULT 0,
  fita_larg2          TINYINT(1) NOT NULL DEFAULT 0,
  respeita_veio       TINYINT(1) NOT NULL DEFAULT 1,
  eh_frente           TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Porta/frente de gaveta: usa acabamento de frente',
  ordem               SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tipos_peca_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Ferragens sugeridas automaticamente por tipo de peça, por faixa de medida.
-- Ex.: PORTA com comprimento 0–900 mm → 2 dobradiças; 901–1600 → 3; 1601–2200 → 4.
CREATE TABLE regras_ferragem (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_peca_id        SMALLINT UNSIGNED NOT NULL,
  material_id         INT UNSIGNED NOT NULL,
  dimensao_referencia ENUM('NENHUMA','COMPRIMENTO','LARGURA') NOT NULL DEFAULT 'NENHUMA',
  dimensao_min_mm     DECIMAL(10,2) NOT NULL DEFAULT 0,
  dimensao_max_mm     DECIMAL(10,2) NOT NULL DEFAULT 99999,
  quantidade          DECIMAL(10,3) NOT NULL DEFAULT 1 COMMENT 'Por peça',
  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  observacoes         VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_rf_tipo_peca (tipo_peca_id),
  KEY idx_rf_material (material_id),
  CONSTRAINT fk_rf_tipo_peca FOREIGN KEY (tipo_peca_id) REFERENCES tipos_peca (id),
  CONSTRAINT fk_rf_material  FOREIGN KEY (material_id)  REFERENCES materiais (id),
  CONSTRAINT chk_rf_faixa CHECK (dimensao_max_mm >= dimensao_min_mm)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Consumo automático de insumos (ex.: cola de borda 0,015 kg por metro de fita;
-- 8 parafusos por peça; 4 cavilhas por peça estrutural; 1 tubo de silicone por móvel)
CREATE TABLE regras_insumo (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  insumo_id           INT UNSIGNED NOT NULL,
  base_calculo        ENUM('POR_M2_PECA','POR_METRO_FITA','POR_PECA','POR_CHAPA','POR_MOVEL',
                           'POR_FERRAGEM','POR_ORCAMENTO') NOT NULL,
  tipo_peca_id        SMALLINT UNSIGNED NULL COMMENT 'Restringe POR_PECA/POR_M2_PECA a um tipo; NULL = todas',
  tipo_material       VARCHAR(30) NULL COMMENT 'Restringe POR_FERRAGEM a um tipo de material (DOBRADICA...)',
  consumo             DECIMAL(12,5) NOT NULL COMMENT 'Quantidade do insumo por unidade da base',
  arredondar_para_cima TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Arredonda total para inteiro (caixas, tubos)',
  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_ri_insumo (insumo_id),
  KEY idx_ri_tipo_peca (tipo_peca_id),
  CONSTRAINT fk_ri_insumo    FOREIGN KEY (insumo_id)    REFERENCES insumos (id),
  CONSTRAINT fk_ri_tipo_peca FOREIGN KEY (tipo_peca_id) REFERENCES tipos_peca (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- De-para entre nomes do modelo 3D (material ou componente) e o catálogo.
-- O sistema "aprende": ao revisar uma importação, o usuário pode salvar o de-para.
CREATE TABLE mapeamentos_dae (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  origem              ENUM('MATERIAL','COMPONENTE','NO') NOT NULL
                        COMMENT 'MATERIAL = nome do material; COMPONENTE = nome da definição; NO = nome da instância',
  padrao              VARCHAR(150) NOT NULL COMMENT 'Texto comparado após normalizar (minúsculas, sem acento)',
  modo_comparacao     ENUM('EXATO','CONTEM','INICIA','REGEX') NOT NULL DEFAULT 'CONTEM',
  prioridade          SMALLINT NOT NULL DEFAULT 100 COMMENT 'Menor = avaliado primeiro',
  acao                ENUM('PECA','FERRAGEM','INSUMO','IGNORAR') NOT NULL,
  arquiteto_id        INT UNSIGNED NULL COMMENT 'Regra específica de um arquiteto; NULL = global',
  acabamento_id       INT UNSIGNED NULL COMMENT 'acao = PECA: motor escolhe a chapa deste acabamento pela espessura',
  materia_prima_id    INT UNSIGNED NULL COMMENT 'acao = PECA: chapa fixa (sobrepõe acabamento_id)',
  fita_borda_id       INT UNSIGNED NULL COMMENT 'Fita padrão (acao = PECA)',
  tipo_peca_id        SMALLINT UNSIGNED NULL,
  material_id         INT UNSIGNED NULL COMMENT 'acao = FERRAGEM',
  insumo_id           INT UNSIGNED NULL COMMENT 'acao = INSUMO',
  ativo               TINYINT(1) NOT NULL DEFAULT 1,
  vezes_aplicado      INT UNSIGNED NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_md_origem_prioridade (origem, ativo, prioridade),
  KEY idx_md_arquiteto (arquiteto_id),
  KEY idx_md_acabamento (acabamento_id),
  KEY idx_md_materia_prima (materia_prima_id),
  KEY idx_md_fita (fita_borda_id),
  KEY idx_md_tipo_peca (tipo_peca_id),
  KEY idx_md_material (material_id),
  KEY idx_md_insumo (insumo_id),
  CONSTRAINT fk_md_arquiteto     FOREIGN KEY (arquiteto_id)     REFERENCES arquitetos (id),
  CONSTRAINT fk_md_acabamento    FOREIGN KEY (acabamento_id)    REFERENCES acabamentos (id),
  CONSTRAINT fk_md_materia_prima FOREIGN KEY (materia_prima_id) REFERENCES materias_primas (id),
  CONSTRAINT fk_md_fita          FOREIGN KEY (fita_borda_id)    REFERENCES materias_primas (id),
  CONSTRAINT fk_md_tipo_peca     FOREIGN KEY (tipo_peca_id)     REFERENCES tipos_peca (id),
  CONSTRAINT fk_md_material      FOREIGN KEY (material_id)      REFERENCES materiais (id),
  CONSTRAINT fk_md_insumo        FOREIGN KEY (insumo_id)        REFERENCES insumos (id),
  CONSTRAINT chk_md_acao CHECK (
       (acao = 'FERRAGEM' AND material_id IS NOT NULL)
    OR (acao = 'INSUMO'   AND insumo_id   IS NOT NULL)
    OR (acao IN ('PECA','IGNORAR')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- =============================================================================
-- 5 / 6. ORÇAMENTO E IMPORTAÇÃO .DAE
-- =============================================================================

CREATE TABLE orcamentos (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  numero                  VARCHAR(20) NOT NULL COMMENT 'ORC-2026-0001',
  revisao                 SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  orcamento_origem_id     INT UNSIGNED NULL COMMENT 'Revisão gerada a partir de outro orçamento',
  cliente_id              INT UNSIGNED NOT NULL,
  arquiteto_id            INT UNSIGNED NULL,
  vendedor_id             INT UNSIGNED NULL,
  usuario_id              INT UNSIGNED NOT NULL COMMENT 'Quem criou',
  condicao_pagamento_id   SMALLINT UNSIGNED NULL,

  titulo                  VARCHAR(150) NOT NULL COMMENT 'Ex.: Apartamento 302 — Cozinha e Dormitórios',
  endereco_obra           VARCHAR(255) NULL,
  status                  ENUM('RASCUNHO','EM_REVISAO','ENVIADO','APROVADO','REPROVADO',
                               'CANCELADO','EXPIRADO','EM_PRODUCAO') NOT NULL DEFAULT 'RASCUNHO',
  data_emissao            DATE NOT NULL,
  data_validade           DATE NOT NULL,
  data_aprovacao          DATETIME NULL,
  prazo_entrega_dias      SMALLINT UNSIGNED NULL,
  criterio_cobranca_chapa ENUM('AREA_COM_PERDA','CHAPA_INTEIRA') NOT NULL DEFAULT 'CHAPA_INTEIRA',

  -- Custos diretos (calculados pelo motor de orçamento; soma de todos os móveis + itens gerais)
  custo_chapas            DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_fitas             DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_outras_mp         DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Vidro, espelho, maciço',
  custo_insumos           DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_ferragens         DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_servicos          DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_avulsos           DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_total             DECIMAL(14,2) GENERATED ALWAYS AS (
                            custo_chapas + custo_fitas + custo_outras_mp + custo_insumos
                            + custo_ferragens + custo_servicos + custo_avulsos) STORED,

  -- Formação de preço (snapshot dos percentuais no momento do orçamento)
  perc_custo_fixo         DECIMAL(6,2) NOT NULL DEFAULT 0,
  perc_impostos           DECIMAL(6,2) NOT NULL DEFAULT 0,
  perc_comissao           DECIMAL(6,2) NOT NULL DEFAULT 0,
  perc_rt                 DECIMAL(6,2) NOT NULL DEFAULT 0,
  perc_margem             DECIMAL(6,2) NOT NULL DEFAULT 0,
  valor_venda_calculado   DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'custo_total / (1 - Σ% / 100)',
  perc_desconto           DECIMAL(6,2) NOT NULL DEFAULT 0,
  valor_desconto          DECIMAL(14,2) NOT NULL DEFAULT 0,
  valor_ajuste_pagamento  DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Acréscimo/desconto da condição de pagamento',
  valor_final             DECIMAL(14,2) NOT NULL DEFAULT 0,
  valor_rt                DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'RT devida ao arquiteto sobre o valor final',
  margem_real_perc        DECIMAL(7,2) NULL COMMENT 'Margem efetiva após desconto (para alerta)',

  observacoes             TEXT NULL COMMENT 'Aparece no orçamento impresso',
  observacoes_internas    TEXT NULL,
  condicoes_gerais        TEXT NULL,
  calculado_em            DATETIME NULL COMMENT 'Último recálculo do motor',
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_orcamentos_numero_revisao (numero, revisao),
  KEY idx_orc_cliente (cliente_id),
  KEY idx_orc_arquiteto (arquiteto_id),
  KEY idx_orc_vendedor (vendedor_id),
  KEY idx_orc_usuario (usuario_id),
  KEY idx_orc_status_emissao (status, data_emissao),
  KEY idx_orc_origem (orcamento_origem_id),
  KEY idx_orc_condicao (condicao_pagamento_id),
  CONSTRAINT fk_orc_origem    FOREIGN KEY (orcamento_origem_id)   REFERENCES orcamentos (id),
  CONSTRAINT fk_orc_cliente   FOREIGN KEY (cliente_id)            REFERENCES clientes (id),
  CONSTRAINT fk_orc_arquiteto FOREIGN KEY (arquiteto_id)          REFERENCES arquitetos (id),
  CONSTRAINT fk_orc_vendedor  FOREIGN KEY (vendedor_id)           REFERENCES usuarios (id),
  CONSTRAINT fk_orc_usuario   FOREIGN KEY (usuario_id)            REFERENCES usuarios (id),
  CONSTRAINT fk_orc_condicao  FOREIGN KEY (condicao_pagamento_id) REFERENCES condicoes_pagamento (id),
  CONSTRAINT chk_orc_percentuais CHECK (
    perc_custo_fixo + perc_impostos + perc_comissao + perc_rt + perc_margem < 100),
  CONSTRAINT chk_orc_validade CHECK (data_validade >= data_emissao)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orcamento_ambientes (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  orcamento_id    INT UNSIGNED NOT NULL,
  nome            VARCHAR(80) NOT NULL COMMENT 'Cozinha, Dormitório Casal, Banheiro Social...',
  ordem           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  observacoes     TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_amb_orcamento (orcamento_id, ordem),
  CONSTRAINT fk_amb_orcamento FOREIGN KEY (orcamento_id) REFERENCES orcamentos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cada arquivo .dae enviado
CREATE TABLE importacoes_dae (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  orcamento_id        INT UNSIGNED NULL,
  usuario_id          INT UNSIGNED NOT NULL,
  arquivo_nome        VARCHAR(255) NOT NULL,
  arquivo_path        VARCHAR(500) NOT NULL,
  arquivo_hash        CHAR(64) NOT NULL COMMENT 'SHA-256, detecta reenvio do mesmo arquivo',
  tamanho_bytes       BIGINT UNSIGNED NOT NULL,
  ferramenta_origem   VARCHAR(150) NULL COMMENT '<authoring_tool> do COLLADA (ex.: SketchUp 23.1)',
  unidade_nome        VARCHAR(30) NULL COMMENT '<unit name>: inch, meter...',
  unidade_metros      DECIMAL(14,8) NULL COMMENT '<unit meter>: 0.0254 para polegada',
  eixo_up             ENUM('X_UP','Y_UP','Z_UP') NULL,
  status              ENUM('PENDENTE','PROCESSANDO','REVISAO','CONCLUIDA','ERRO') NOT NULL DEFAULT 'PENDENTE',
  total_objetos       INT UNSIGNED NOT NULL DEFAULT 0,
  total_pecas         INT UNSIGNED NOT NULL DEFAULT 0,
  total_ferragens     INT UNSIGNED NOT NULL DEFAULT 0,
  total_ignorados     INT UNSIGNED NOT NULL DEFAULT 0,
  total_desconhecidos INT UNSIGNED NOT NULL DEFAULT 0,
  mensagem_erro       TEXT NULL,
  log                 JSON NULL COMMENT 'Avisos do parser (geometria não retangular, escala, etc.)',
  processado_em       DATETIME NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_imp_orcamento (orcamento_id),
  KEY idx_imp_hash (arquivo_hash),
  KEY idx_imp_status (status),
  KEY idx_imp_usuario (usuario_id),
  CONSTRAINT fk_imp_orcamento FOREIGN KEY (orcamento_id) REFERENCES orcamentos (id) ON DELETE SET NULL,
  CONSTRAINT fk_imp_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Árvore de nós extraída do .dae (grupos, componentes, peças), com medidas e classificação
CREATE TABLE importacao_objetos (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  importacao_id       INT UNSIGNED NOT NULL,
  parent_id           BIGINT UNSIGNED NULL,
  nivel               SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  caminho             VARCHAR(1000) NOT NULL COMMENT 'Cozinha/Armario Superior/Porta Esq',
  node_id_dae         VARCHAR(150) NULL,
  nome                VARCHAR(255) NULL COMMENT 'Nome da instância',
  nome_definicao      VARCHAR(255) NULL COMMENT 'Nome do componente (library_nodes)',
  material_dae        VARCHAR(255) NULL COMMENT 'Material predominante (por área de face)',
  quantidade          INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Instâncias idênticas agrupadas',

  -- Caixa delimitadora no sistema LOCAL da peça (já com escala aplicada), em mm
  dim_x_mm            DECIMAL(10,2) NULL,
  dim_y_mm            DECIMAL(10,2) NULL,
  dim_z_mm            DECIMAL(10,2) NULL,
  comprimento_mm      DECIMAL(10,2) NULL COMMENT 'Maior dimensão',
  largura_mm          DECIMAL(10,2) NULL COMMENT 'Dimensão intermediária',
  espessura_mm        DECIMAL(10,2) NULL COMMENT 'Menor dimensão',
  area_faces_m2       DECIMAL(12,4) NULL,
  volume_bbox_m3      DECIMAL(14,6) NULL,
  num_vertices        INT UNSIGNED NULL,
  num_faces           INT UNSIGNED NULL,
  eh_retangular       TINYINT(1) NULL COMMENT '1 = caixa (paralelepípedo); 0 = recortes/curvas',
  espelhado           TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Determinante da matriz < 0',
  matriz_mundo        JSON NULL COMMENT 'Matriz 4x4 acumulada (para o visualizador)',

  -- Classificação automática / revisão do usuário
  classificacao       ENUM('MOVEL','GRUPO','PECA','FERRAGEM','INSUMO','IGNORAR','DESCONHECIDO')
                        NOT NULL DEFAULT 'DESCONHECIDO',
  confianca           DECIMAL(5,2) NULL COMMENT '0–100',
  motivo_classificacao VARCHAR(255) NULL,
  mapeamento_id       INT UNSIGNED NULL,
  tipo_peca_id        SMALLINT UNSIGNED NULL,
  materia_prima_id    INT UNSIGNED NULL,
  fita_borda_id       INT UNSIGNED NULL,
  material_id         INT UNSIGNED NULL,
  insumo_id           INT UNSIGNED NULL,
  revisado            TINYINT(1) NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_io_importacao_class (importacao_id, classificacao),
  KEY idx_io_parent (parent_id),
  KEY idx_io_mapeamento (mapeamento_id),
  KEY idx_io_tipo_peca (tipo_peca_id),
  KEY idx_io_mp (materia_prima_id),
  KEY idx_io_fita (fita_borda_id),
  KEY idx_io_material (material_id),
  KEY idx_io_insumo (insumo_id),
  CONSTRAINT fk_io_importacao FOREIGN KEY (importacao_id)    REFERENCES importacoes_dae (id) ON DELETE CASCADE,
  CONSTRAINT fk_io_parent     FOREIGN KEY (parent_id)        REFERENCES importacao_objetos (id) ON DELETE CASCADE,
  CONSTRAINT fk_io_mapeamento FOREIGN KEY (mapeamento_id)    REFERENCES mapeamentos_dae (id) ON DELETE SET NULL,
  CONSTRAINT fk_io_tipo_peca  FOREIGN KEY (tipo_peca_id)     REFERENCES tipos_peca (id),
  CONSTRAINT fk_io_mp         FOREIGN KEY (materia_prima_id) REFERENCES materias_primas (id),
  CONSTRAINT fk_io_fita       FOREIGN KEY (fita_borda_id)    REFERENCES materias_primas (id),
  CONSTRAINT fk_io_material   FOREIGN KEY (material_id)      REFERENCES materiais (id),
  CONSTRAINT fk_io_insumo     FOREIGN KEY (insumo_id)        REFERENCES insumos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Móveis do orçamento (cada um pode vir de uma importação .dae ou ser lançado manualmente)
CREATE TABLE orcamento_moveis (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  orcamento_id        INT UNSIGNED NOT NULL,
  ambiente_id         INT UNSIGNED NULL,
  importacao_id       INT UNSIGNED NULL,
  importacao_objeto_id BIGINT UNSIGNED NULL COMMENT 'Nó do .dae que originou o móvel',
  descricao           VARCHAR(150) NOT NULL COMMENT 'Armário superior, Balcão pia, Guarda-roupa...',
  largura_mm          DECIMAL(10,2) NULL COMMENT 'Medidas externas (informativas)',
  altura_mm           DECIMAL(10,2) NULL,
  profundidade_mm     DECIMAL(10,2) NULL,
  quantidade          SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  acabamento_caixa_id INT UNSIGNED NULL,
  acabamento_frente_id INT UNSIGNED NULL,
  imagem_path         VARCHAR(255) NULL COMMENT 'Miniatura gerada no visualizador',

  -- Subtotais do móvel (já multiplicados pela quantidade)
  custo_chapas        DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Rateio por área (informativo quando CHAPA_INTEIRA)',
  custo_fitas         DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_outras_mp     DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_insumos       DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_ferragens     DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_servicos      DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_avulsos       DECIMAL(14,2) NOT NULL DEFAULT 0,
  custo_total         DECIMAL(14,2) GENERATED ALWAYS AS (
                        custo_chapas + custo_fitas + custo_outras_mp + custo_insumos
                        + custo_ferragens + custo_servicos + custo_avulsos) STORED,
  valor_venda         DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'Rateio do valor final p/ impressão por móvel',
  ordem               SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  observacoes         TEXT NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mov_orcamento (orcamento_id, ordem),
  KEY idx_mov_ambiente (ambiente_id),
  KEY idx_mov_importacao (importacao_id),
  KEY idx_mov_imp_objeto (importacao_objeto_id),
  KEY idx_mov_acab_caixa (acabamento_caixa_id),
  KEY idx_mov_acab_frente (acabamento_frente_id),
  CONSTRAINT fk_mov_orcamento   FOREIGN KEY (orcamento_id)         REFERENCES orcamentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_ambiente    FOREIGN KEY (ambiente_id)          REFERENCES orcamento_ambientes (id) ON DELETE SET NULL,
  CONSTRAINT fk_mov_importacao  FOREIGN KEY (importacao_id)        REFERENCES importacoes_dae (id) ON DELETE SET NULL,
  CONSTRAINT fk_mov_imp_objeto  FOREIGN KEY (importacao_objeto_id) REFERENCES importacao_objetos (id) ON DELETE SET NULL,
  CONSTRAINT fk_mov_acab_caixa  FOREIGN KEY (acabamento_caixa_id)  REFERENCES acabamentos (id),
  CONSTRAINT fk_mov_acab_frente FOREIGN KEY (acabamento_frente_id) REFERENCES acabamentos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Peças de chapa de cada móvel (lista de corte)
CREATE TABLE orcamento_pecas (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  movel_id            INT UNSIGNED NOT NULL,
  importacao_objeto_id BIGINT UNSIGNED NULL,
  tipo_peca_id        SMALLINT UNSIGNED NULL,
  descricao           VARCHAR(150) NOT NULL,
  materia_prima_id    INT UNSIGNED NOT NULL COMMENT 'Chapa',
  comprimento_mm      DECIMAL(10,2) NOT NULL COMMENT 'No sentido do veio',
  largura_mm          DECIMAL(10,2) NOT NULL,
  espessura_mm        DECIMAL(6,2)  NOT NULL,
  quantidade          INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Por unidade do móvel',
  respeita_veio       TINYINT(1) NOT NULL DEFAULT 1,

  -- Fita de borda por lado (NULL = sem fita)
  fita_comp1_id       INT UNSIGNED NULL,
  fita_comp2_id       INT UNSIGNED NULL,
  fita_larg1_id       INT UNSIGNED NULL,
  fita_larg2_id       INT UNSIGNED NULL,

  area_m2             DECIMAL(12,4) GENERATED ALWAYS AS (
                        comprimento_mm * largura_mm * quantidade / 1000000) STORED,
  metros_fita         DECIMAL(12,3) GENERATED ALWAYS AS ((
                          IF(fita_comp1_id IS NULL, 0, comprimento_mm)
                        + IF(fita_comp2_id IS NULL, 0, comprimento_mm)
                        + IF(fita_larg1_id IS NULL, 0, largura_mm)
                        + IF(fita_larg2_id IS NULL, 0, largura_mm)) * quantidade / 1000) STORED,

  -- Snapshot de custos (preenchido pelo motor)
  custo_m2_chapa      DECIMAL(14,4) NOT NULL DEFAULT 0,
  custo_chapa         DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT 'area × custo_m2 × (1 + perda)',
  custo_fita          DECIMAL(14,2) NOT NULL DEFAULT 0,

  usinagem            VARCHAR(255) NULL COMMENT 'Furação, rasgo p/ fundo, rebaixo, canal...',
  editado_manual      TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Protege a peça de ser sobrescrita na reimportação',
  ordem               INT UNSIGNED NOT NULL DEFAULT 0,
  observacoes         VARCHAR(255) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pc_movel (movel_id, ordem),
  KEY idx_pc_mp (materia_prima_id),
  KEY idx_pc_tipo (tipo_peca_id),
  KEY idx_pc_imp_objeto (importacao_objeto_id),
  KEY idx_pc_fc1 (fita_comp1_id),
  KEY idx_pc_fc2 (fita_comp2_id),
  KEY idx_pc_fl1 (fita_larg1_id),
  KEY idx_pc_fl2 (fita_larg2_id),
  CONSTRAINT fk_pc_movel      FOREIGN KEY (movel_id)             REFERENCES orcamento_moveis (id) ON DELETE CASCADE,
  CONSTRAINT fk_pc_imp_objeto FOREIGN KEY (importacao_objeto_id) REFERENCES importacao_objetos (id) ON DELETE SET NULL,
  CONSTRAINT fk_pc_tipo       FOREIGN KEY (tipo_peca_id)         REFERENCES tipos_peca (id),
  CONSTRAINT fk_pc_mp         FOREIGN KEY (materia_prima_id)     REFERENCES materias_primas (id),
  CONSTRAINT fk_pc_fc1        FOREIGN KEY (fita_comp1_id)        REFERENCES materias_primas (id),
  CONSTRAINT fk_pc_fc2        FOREIGN KEY (fita_comp2_id)        REFERENCES materias_primas (id),
  CONSTRAINT fk_pc_fl1        FOREIGN KEY (fita_larg1_id)        REFERENCES materias_primas (id),
  CONSTRAINT fk_pc_fl2        FOREIGN KEY (fita_larg2_id)        REFERENCES materias_primas (id),
  CONSTRAINT chk_pc_medidas CHECK (comprimento_mm > 0 AND largura_mm > 0 AND espessura_mm > 0 AND quantidade > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Itens não-chapa do orçamento: ferragens, insumos, serviços, outras matérias-primas e avulsos.
-- movel_id NULL = item geral do orçamento (frete, instalação, projeto).
CREATE TABLE orcamento_itens (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orcamento_id        INT UNSIGNED NOT NULL,
  movel_id            INT UNSIGNED NULL,
  tipo_item           ENUM('MATERIA_PRIMA','INSUMO','MATERIAL','SERVICO','AVULSO') NOT NULL,
  materia_prima_id    INT UNSIGNED NULL,
  insumo_id           INT UNSIGNED NULL,
  material_id         INT UNSIGNED NULL,
  servico_id          INT UNSIGNED NULL,
  descricao           VARCHAR(150) NOT NULL,
  unidade_sigla       VARCHAR(6) NOT NULL,
  quantidade          DECIMAL(14,4) NOT NULL,
  custo_unitario      DECIMAL(14,4) NOT NULL DEFAULT 0 COMMENT 'Snapshot do catálogo',
  custo_total         DECIMAL(14,2) GENERATED ALWAYS AS (ROUND(quantidade * custo_unitario, 2)) STORED,
  origem              ENUM('IMPORTACAO','REGRA','AUTOMATICO','MANUAL') NOT NULL DEFAULT 'MANUAL',
  regra_descricao     VARCHAR(255) NULL COMMENT 'Ex.: "2 dobradiças × 6 portas (até 900 mm)"',
  importacao_objeto_id BIGINT UNSIGNED NULL,
  editado_manual      TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Recalcular não sobrescreve',
  ordem               INT UNSIGNED NOT NULL DEFAULT 0,
  observacoes         VARCHAR(255) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_it_orcamento (orcamento_id, tipo_item),
  KEY idx_it_movel (movel_id),
  KEY idx_it_mp (materia_prima_id),
  KEY idx_it_insumo (insumo_id),
  KEY idx_it_material (material_id),
  KEY idx_it_servico (servico_id),
  KEY idx_it_imp_objeto (importacao_objeto_id),
  CONSTRAINT fk_it_orcamento  FOREIGN KEY (orcamento_id)         REFERENCES orcamentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_it_movel      FOREIGN KEY (movel_id)             REFERENCES orcamento_moveis (id) ON DELETE CASCADE,
  CONSTRAINT fk_it_mp         FOREIGN KEY (materia_prima_id)     REFERENCES materias_primas (id),
  CONSTRAINT fk_it_insumo     FOREIGN KEY (insumo_id)            REFERENCES insumos (id),
  CONSTRAINT fk_it_material   FOREIGN KEY (material_id)          REFERENCES materiais (id),
  CONSTRAINT fk_it_servico    FOREIGN KEY (servico_id)           REFERENCES servicos (id),
  CONSTRAINT fk_it_imp_objeto FOREIGN KEY (importacao_objeto_id) REFERENCES importacao_objetos (id) ON DELETE SET NULL,
  CONSTRAINT chk_it_referencia CHECK (
       (tipo_item = 'MATERIA_PRIMA' AND materia_prima_id IS NOT NULL AND insumo_id IS NULL AND material_id IS NULL AND servico_id IS NULL)
    OR (tipo_item = 'INSUMO'        AND insumo_id        IS NOT NULL AND materia_prima_id IS NULL AND material_id IS NULL AND servico_id IS NULL)
    OR (tipo_item = 'MATERIAL'      AND material_id      IS NOT NULL AND materia_prima_id IS NULL AND insumo_id IS NULL AND servico_id IS NULL)
    OR (tipo_item = 'SERVICO'       AND servico_id       IS NOT NULL AND materia_prima_id IS NULL AND insumo_id IS NULL AND material_id IS NULL)
    OR (tipo_item = 'AVULSO'        AND materia_prima_id IS NULL AND insumo_id IS NULL AND material_id IS NULL AND servico_id IS NULL)),
  CONSTRAINT chk_it_quantidade CHECK (quantidade >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Consolidação de chapas e fitas do orçamento inteiro (base da cobrança)
CREATE TABLE orcamento_consumos (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  orcamento_id        INT UNSIGNED NOT NULL,
  materia_prima_id    INT UNSIGNED NOT NULL,
  tipo                ENUM('CHAPA','FITA_BORDA') NOT NULL,
  quantidade_liquida  DECIMAL(14,4) NOT NULL COMMENT 'm² de peças ou metros de fita',
  perc_perda          DECIMAL(6,2)  NOT NULL DEFAULT 0,
  quantidade_cobrada  DECIMAL(14,4) NOT NULL COMMENT 'Nº de chapas (inteiro) ou m² com perda; metros com perda',
  unidade_sigla       VARCHAR(6) NOT NULL,
  aproveitamento_perc DECIMAL(6,2) NULL COMMENT 'Do plano de corte',
  custo_unitario      DECIMAL(14,4) NOT NULL,
  custo_total         DECIMAL(14,2) GENERATED ALWAYS AS (ROUND(quantidade_cobrada * custo_unitario, 2)) STORED,
  ajustado_manual     TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cons_orc_mp (orcamento_id, materia_prima_id),
  KEY idx_cons_mp (materia_prima_id),
  CONSTRAINT fk_cons_orcamento FOREIGN KEY (orcamento_id)     REFERENCES orcamentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_cons_mp        FOREIGN KEY (materia_prima_id) REFERENCES materias_primas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Resultado do otimizador: uma linha por chapa usada
CREATE TABLE orcamento_planos_corte (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  orcamento_id        INT UNSIGNED NOT NULL,
  materia_prima_id    INT UNSIGNED NOT NULL,
  numero_chapa        SMALLINT UNSIGNED NOT NULL,
  largura_util_mm     DECIMAL(8,2)  NOT NULL,
  comprimento_util_mm DECIMAL(10,2) NOT NULL,
  area_pecas_m2       DECIMAL(12,4) NOT NULL,
  aproveitamento_perc DECIMAL(6,2)  NOT NULL,
  layout              JSON NOT NULL COMMENT '[{peca_id, x, y, comp, larg, rotacionada}] + sobras',
  gerado_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_plano_orc_mp_num (orcamento_id, materia_prima_id, numero_chapa),
  KEY idx_plano_mp (materia_prima_id),
  CONSTRAINT fk_plano_orcamento FOREIGN KEY (orcamento_id)     REFERENCES orcamentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_plano_mp        FOREIGN KEY (materia_prima_id) REFERENCES materias_primas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orcamento_anexos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  orcamento_id    INT UNSIGNED NOT NULL,
  tipo            ENUM('DAE','SKP','PDF','DWG','IMAGEM','PLANILHA','OUTRO') NOT NULL,
  nome_original   VARCHAR(255) NOT NULL,
  arquivo_path    VARCHAR(500) NOT NULL,
  tamanho_bytes   BIGINT UNSIGNED NULL,
  usuario_id      INT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_anx_orcamento (orcamento_id),
  KEY idx_anx_usuario (usuario_id),
  CONSTRAINT fk_anx_orcamento FOREIGN KEY (orcamento_id) REFERENCES orcamentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_anx_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE orcamento_status_historico (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orcamento_id    INT UNSIGNED NOT NULL,
  status_anterior VARCHAR(20) NULL,
  status_novo     VARCHAR(20) NOT NULL,
  usuario_id      INT UNSIGNED NULL,
  observacao      VARCHAR(500) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_osh_orcamento (orcamento_id, created_at),
  KEY idx_osh_usuario (usuario_id),
  CONSTRAINT fk_osh_orcamento FOREIGN KEY (orcamento_id) REFERENCES orcamentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_osh_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- =============================================================================
-- 7. AUDITORIA DE PREÇOS
-- =============================================================================

CREATE TABLE historico_precos (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tipo_item       ENUM('MATERIA_PRIMA','INSUMO','MATERIAL','SERVICO') NOT NULL,
  item_id         INT UNSIGNED NOT NULL,
  custo_anterior  DECIMAL(14,4) NOT NULL,
  custo_novo      DECIMAL(14,4) NOT NULL,
  variacao_perc   DECIMAL(9,2) GENERATED ALWAYS AS (
                    CASE WHEN custo_anterior = 0 THEN NULL
                         ELSE (custo_novo - custo_anterior) / custo_anterior * 100 END) STORED,
  usuario_id      INT UNSIGNED NULL COMMENT 'Preenchido via variável de sessão @usuario_id',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hp_item (tipo_item, item_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='Registrado automaticamente por triggers. A aplicação deve executar SET @usuario_id = ? na conexão.';

CREATE TRIGGER trg_mp_historico_preco AFTER UPDATE ON materias_primas FOR EACH ROW
  INSERT INTO historico_precos (tipo_item, item_id, custo_anterior, custo_novo, usuario_id)
  SELECT 'MATERIA_PRIMA', NEW.id, OLD.custo_unitario, NEW.custo_unitario, @usuario_id
  FROM DUAL WHERE OLD.custo_unitario <> NEW.custo_unitario;

CREATE TRIGGER trg_insumos_historico_preco AFTER UPDATE ON insumos FOR EACH ROW
  INSERT INTO historico_precos (tipo_item, item_id, custo_anterior, custo_novo, usuario_id)
  SELECT 'INSUMO', NEW.id, OLD.custo_unitario, NEW.custo_unitario, @usuario_id
  FROM DUAL WHERE OLD.custo_unitario <> NEW.custo_unitario;

CREATE TRIGGER trg_materiais_historico_preco AFTER UPDATE ON materiais FOR EACH ROW
  INSERT INTO historico_precos (tipo_item, item_id, custo_anterior, custo_novo, usuario_id)
  SELECT 'MATERIAL', NEW.id, OLD.custo_unitario, NEW.custo_unitario, @usuario_id
  FROM DUAL WHERE OLD.custo_unitario <> NEW.custo_unitario;

CREATE TRIGGER trg_servicos_historico_preco AFTER UPDATE ON servicos FOR EACH ROW
  INSERT INTO historico_precos (tipo_item, item_id, custo_anterior, custo_novo, usuario_id)
  SELECT 'SERVICO', NEW.id, OLD.valor_unitario, NEW.valor_unitario, @usuario_id
  FROM DUAL WHERE OLD.valor_unitario <> NEW.valor_unitario;


-- =============================================================================
-- 8. VIEWS
-- =============================================================================

CREATE VIEW vw_orcamentos_resumo AS
SELECT
  o.id, o.numero, o.revisao, o.titulo, o.status,
  o.data_emissao, o.data_validade,
  (o.status IN ('RASCUNHO','EM_REVISAO','ENVIADO') AND o.data_validade < CURDATE()) AS vencido,
  c.id   AS cliente_id,   c.nome AS cliente_nome, c.celular AS cliente_celular,
  a.id   AS arquiteto_id, a.nome AS arquiteto_nome, a.escritorio AS arquiteto_escritorio,
  v.nome AS vendedor_nome,
  (SELECT COUNT(*) FROM orcamento_moveis m WHERE m.orcamento_id = o.id) AS qtd_moveis,
  o.custo_total, o.valor_venda_calculado, o.valor_desconto, o.valor_final,
  o.valor_rt, o.margem_real_perc, o.updated_at
FROM orcamentos o
JOIN clientes c        ON c.id = o.cliente_id
LEFT JOIN arquitetos a ON a.id = o.arquiteto_id
LEFT JOIN usuarios v   ON v.id = o.vendedor_id;

-- Lista de corte pronta para exportar a otimizadores (Corte Certo, etc.)
CREATE VIEW vw_pecas_corte AS
SELECT
  o.id AS orcamento_id, o.numero,
  m.id AS movel_id, m.descricao AS movel,
  p.id AS peca_id, p.descricao AS peca, tp.nome AS tipo_peca,
  mp.id AS chapa_id, mp.codigo AS chapa_codigo, mp.descricao AS chapa,
  p.espessura_mm, p.comprimento_mm, p.largura_mm,
  p.quantidade * m.quantidade AS quantidade_total,
  p.respeita_veio,
  fc1.codigo AS fita_comp1, fc2.codigo AS fita_comp2,
  fl1.codigo AS fita_larg1, fl2.codigo AS fita_larg2,
  p.usinagem, p.observacoes
FROM orcamento_pecas p
JOIN orcamento_moveis m     ON m.id  = p.movel_id
JOIN orcamentos o           ON o.id  = m.orcamento_id
JOIN materias_primas mp     ON mp.id = p.materia_prima_id
LEFT JOIN tipos_peca tp     ON tp.id = p.tipo_peca_id
LEFT JOIN materias_primas fc1 ON fc1.id = p.fita_comp1_id
LEFT JOIN materias_primas fc2 ON fc2.id = p.fita_comp2_id
LEFT JOIN materias_primas fl1 ON fl1.id = p.fita_larg1_id
LEFT JOIN materias_primas fl2 ON fl2.id = p.fita_larg2_id;

-- Catálogo unificado para busca/autocomplete na tela de itens do orçamento
CREATE VIEW vw_catalogo_precos AS
SELECT 'MATERIA_PRIMA' AS tipo_item, mp.id, mp.codigo, mp.descricao, u.sigla AS unidade,
       mp.custo_unitario, mp.ativo
FROM materias_primas mp JOIN unidades_medida u ON u.id = mp.unidade_id
UNION ALL
SELECT 'INSUMO', i.id, i.codigo, i.descricao, u.sigla, i.custo_unitario, i.ativo
FROM insumos i JOIN unidades_medida u ON u.id = i.unidade_id
UNION ALL
SELECT 'MATERIAL', m.id, m.codigo, m.descricao, u.sigla, m.custo_unitario, m.ativo
FROM materiais m JOIN unidades_medida u ON u.id = m.unidade_id
UNION ALL
SELECT 'SERVICO', s.id, s.codigo, s.descricao, NULL, s.valor_unitario, s.ativo
FROM servicos s;


-- =============================================================================
-- 9. SEEDS
--    Estruturais (unidades, categorias, tipos de peça, configuração) + exemplos
--    de catálogo com PREÇO ZERADO — atualize os custos antes de orçar.
-- =============================================================================

INSERT INTO configuracoes (id, razao_social, nome_fantasia, texto_condicoes_gerais) VALUES
(1, 'Minha Marcenaria Ltda', 'Minha Marcenaria',
 'Orçamento baseado no projeto fornecido. Alterações de medidas, materiais ou acabamentos após a aprovação poderão alterar valores e prazos. Medição final no local antes da produção.');

-- Usuário inicial: troque a senha no primeiro acesso (hash bcrypt de "admin123")
INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES
('Administrador', 'admin@marcenaria.local', '$2b$10$fl77v2MIfVL7TgR8Hu7MOe7rIZLIxoX2JDRwey9TR1wIcTj9BsvdG', 'ADMIN');

INSERT INTO numeradores (chave, ano, ultimo_numero, prefixo) VALUES
('ORCAMENTO', YEAR(CURDATE()), 0, 'ORC');

INSERT INTO unidades_medida (sigla, descricao, casas_decimais) VALUES
('UN',  'Unidade',          0),
('PC',  'Peça',             0),
('PAR', 'Par',              0),
('JG',  'Jogo',             0),
('CX',  'Caixa',            0),
('CH',  'Chapa',            0),
('M',   'Metro linear',     2),
('M2',  'Metro quadrado',   3),
('KG',  'Quilograma',       3),
('L',   'Litro',            3),
('TB',  'Tubo',             0),
('H',   'Hora',             2),
('KM',  'Quilômetro',       1),
('VB',  'Verba',            0);

INSERT INTO categorias (modulo, nome) VALUES
('MATERIA_PRIMA', 'Chapas MDF'),
('MATERIA_PRIMA', 'Chapas MDP'),
('MATERIA_PRIMA', 'Fitas de borda'),
('MATERIA_PRIMA', 'Vidros e espelhos'),
('MATERIA_PRIMA', 'Madeira maciça'),
('INSUMO',        'Fixação'),
('INSUMO',        'Colas e adesivos'),
('INSUMO',        'Acabamento e pintura'),
('INSUMO',        'Abrasivos'),
('MATERIAL',      'Dobradiças'),
('MATERIAL',      'Corrediças'),
('MATERIAL',      'Puxadores'),
('MATERIAL',      'Fechaduras'),
('MATERIAL',      'Pés e suportes'),
('MATERIAL',      'Acessórios'),
('SERVICO',       'Produção'),
('SERVICO',       'Instalação e logística');

INSERT INTO tipos_peca (codigo, nome, palavras_chave, fita_comp1, fita_comp2, fita_larg1, fita_larg2, respeita_veio, eh_frente, ordem) VALUES
('LATERAL',   'Lateral',            'lateral,lat,ld,le,lado',                   1,0,0,0, 1,0, 10),
('BASE',      'Base / Piso',        'base,piso,fundo inferior,chao',           1,0,0,0, 1,0, 20),
('TAMPO',     'Tampo / Teto',       'tampo,teto,topo,chapeu',                  1,0,0,0, 1,0, 30),
('PRATELEIRA','Prateleira',         'prateleira,prat,divisoria horizontal',     1,0,0,0, 1,0, 40),
('DIVISORIA', 'Divisória vertical', 'divisoria,divisao,montante,meio',         1,0,0,0, 1,0, 50),
('FUNDO',     'Fundo',              'fundo,costas,traseira',                   0,0,0,0, 0,0, 60),
('TRAVESSA',  'Travessa / Régua',   'travessa,regua,trava,sarrafo,reforco',    1,0,0,0, 1,0, 70),
('RODAPE',    'Rodapé / Saia',      'rodape,saia,rodateto,testeira,rodameio',  1,0,0,0, 1,0, 80),
('PORTA',     'Porta',              'porta,pt,folha',                          1,1,1,1, 1,1, 90),
('FRENTE_GAV','Frente de gaveta',   'frente gaveta,frente,fg',                 1,1,1,1, 1,1, 100),
('GAVETA_LAT','Lateral de gaveta',  'lateral gaveta,lat gaveta,lg',            1,0,0,0, 1,0, 110),
('GAVETA_FT', 'Fundo/traseira de gaveta','traseira gaveta,contra frente,tg',   1,0,0,0, 1,0, 120),
('GAVETA_FD', 'Fundo de gaveta',    'fundo gaveta,fd gaveta',                  0,0,0,0, 0,0, 130),
('PAINEL',    'Painel',             'painel,ripado,cabeceira,tamponamento',     1,1,1,1, 1,1, 140),
('OUTRA',     'Outra',              NULL,                                      0,0,0,0, 1,0, 999);

INSERT INTO condicoes_pagamento (descricao, perc_entrada, numero_parcelas, intervalo_dias, perc_ajuste) VALUES
('À vista (PIX)',                  100.00, 0, 0,  -5.00),
('50% entrada + 50% na entrega',    50.00, 1, 45,  0.00),
('Entrada 30% + 5x',                30.00, 5, 30,  0.00),
('10x no cartão',                    0.00, 10, 30, 4.00);

INSERT INTO acabamentos (nome, fabricante, textura, cor_hex) VALUES
('Branco',  NULL, 'TX', '#F4F4F2'),
('Preto',   NULL, 'TX', '#1E1E1E'),
('Cinza',   NULL, 'TX', '#8A8C8E'),
('Amadeirado (genérico)', NULL, 'Madeirado', '#B08A5E');

-- Exemplos de matéria-prima (chapas 2750×1850 e fitas). PREÇOS ZERADOS.
INSERT INTO materias_primas (codigo, descricao, tipo, material_base, categoria_id, acabamento_id, unidade_id,
                             faces_revestidas, espessura_mm, largura_mm, comprimento_mm, possui_veio, custo_unitario) VALUES
('MDF-BR-06', 'MDF Branco TX 6 mm 2F',  'CHAPA', 'MDF',
   (SELECT id FROM categorias WHERE modulo='MATERIA_PRIMA' AND nome='Chapas MDF'),
   (SELECT id FROM acabamentos WHERE nome='Branco'), (SELECT id FROM unidades_medida WHERE sigla='CH'),
   2, 6,  1850, 2750, 0, 0),
('MDF-BR-15', 'MDF Branco TX 15 mm 2F', 'CHAPA', 'MDF',
   (SELECT id FROM categorias WHERE modulo='MATERIA_PRIMA' AND nome='Chapas MDF'),
   (SELECT id FROM acabamentos WHERE nome='Branco'), (SELECT id FROM unidades_medida WHERE sigla='CH'),
   2, 15, 1850, 2750, 0, 0),
('MDF-BR-18', 'MDF Branco TX 18 mm 2F', 'CHAPA', 'MDF',
   (SELECT id FROM categorias WHERE modulo='MATERIA_PRIMA' AND nome='Chapas MDF'),
   (SELECT id FROM acabamentos WHERE nome='Branco'), (SELECT id FROM unidades_medida WHERE sigla='CH'),
   2, 18, 1850, 2750, 0, 0),
('FITA-BR-22', 'Fita de borda Branco TX 22 × 0,45 mm', 'FITA_BORDA', NULL,
   (SELECT id FROM categorias WHERE modulo='MATERIA_PRIMA' AND nome='Fitas de borda'),
   (SELECT id FROM acabamentos WHERE nome='Branco'), (SELECT id FROM unidades_medida WHERE sigla='M'),
   NULL, 0.45, 22, 20000, 0, 0),
('FITA-BR-22-1', 'Fita de borda Branco TX 22 × 1 mm', 'FITA_BORDA', NULL,
   (SELECT id FROM categorias WHERE modulo='MATERIA_PRIMA' AND nome='Fitas de borda'),
   (SELECT id FROM acabamentos WHERE nome='Branco'), (SELECT id FROM unidades_medida WHERE sigla='M'),
   NULL, 1.00, 22, 20000, 0, 0);

-- Exemplos de insumos. PREÇOS ZERADOS.
INSERT INTO insumos (codigo, descricao, categoria_id, unidade_id, custo_unitario) VALUES
('PAR-4X40', 'Parafuso chipboard 4,0 × 40 mm', (SELECT id FROM categorias WHERE modulo='INSUMO' AND nome='Fixação'),          (SELECT id FROM unidades_medida WHERE sigla='UN'), 0),
('CAV-8X30', 'Cavilha 8 × 30 mm',              (SELECT id FROM categorias WHERE modulo='INSUMO' AND nome='Fixação'),          (SELECT id FROM unidades_medida WHERE sigla='UN'), 0),
('MINIFIX',  'Minifix 15 mm com tambor',       (SELECT id FROM categorias WHERE modulo='INSUMO' AND nome='Fixação'),          (SELECT id FROM unidades_medida WHERE sigla='UN'), 0),
('COLA-PVA', 'Cola PVA branca',                (SELECT id FROM categorias WHERE modulo='INSUMO' AND nome='Colas e adesivos'), (SELECT id FROM unidades_medida WHERE sigla='KG'), 0),
('COLA-HM',  'Cola hot melt para coladeira',   (SELECT id FROM categorias WHERE modulo='INSUMO' AND nome='Colas e adesivos'), (SELECT id FROM unidades_medida WHERE sigla='KG'), 0),
('SILICONE', 'Silicone incolor 280 g',         (SELECT id FROM categorias WHERE modulo='INSUMO' AND nome='Colas e adesivos'), (SELECT id FROM unidades_medida WHERE sigla='TB'), 0);

-- Exemplos de materiais (ferragens). PREÇOS ZERADOS.
INSERT INTO materiais (codigo, descricao, tipo, categoria_id, unidade_id, medida_mm, custo_unitario) VALUES
('DOB-35-CL',  'Dobradiça 35 mm curva com amortecedor', 'DOBRADICA', (SELECT id FROM categorias WHERE modulo='MATERIAL' AND nome='Dobradiças'), (SELECT id FROM unidades_medida WHERE sigla='UN'),  NULL, 0),
('COR-TEL-450','Corrediça telescópica 450 mm',          'CORREDICA', (SELECT id FROM categorias WHERE modulo='MATERIAL' AND nome='Corrediças'), (SELECT id FROM unidades_medida WHERE sigla='PAR'), 450,  0),
('PUX-160',    'Puxador 160 mm',                        'PUXADOR',   (SELECT id FROM categorias WHERE modulo='MATERIAL' AND nome='Puxadores'),  (SELECT id FROM unidades_medida WHERE sigla='UN'),  160,  0),
('FECH-GAV',   'Fechadura para gaveta',                 'FECHADURA', (SELECT id FROM categorias WHERE modulo='MATERIAL' AND nome='Fechaduras'), (SELECT id FROM unidades_medida WHERE sigla='UN'),  NULL, 0),
('PE-REG-100', 'Pé regulável 100 mm',                   'PE',        (SELECT id FROM categorias WHERE modulo='MATERIAL' AND nome='Pés e suportes'), (SELECT id FROM unidades_medida WHERE sigla='UN'), 100, 0),
('SUP-PRAT',   'Suporte pino para prateleira',          'SUPORTE',   (SELECT id FROM categorias WHERE modulo='MATERIAL' AND nome='Pés e suportes'), (SELECT id FROM unidades_medida WHERE sigla='UN'), NULL, 0);

-- Serviços. VALORES ZERADOS.
INSERT INTO servicos (codigo, descricao, tipo, categoria_id, base_calculo, valor_unitario, aplicar_automatico) VALUES
('SV-CORTE',  'Corte de chapa',             'CORTE',      (SELECT id FROM categorias WHERE modulo='SERVICO' AND nome='Produção'), 'POR_CHAPA',      0, 1),
('SV-FITA',   'Aplicação de fita de borda', 'FITAGEM',    (SELECT id FROM categorias WHERE modulo='SERVICO' AND nome='Produção'), 'POR_METRO_FITA', 0, 1),
('SV-MONT',   'Montagem em fábrica',        'MONTAGEM',   (SELECT id FROM categorias WHERE modulo='SERVICO' AND nome='Produção'), 'POR_M2_PECA',    0, 1),
('SV-INST',   'Instalação no local',        'INSTALACAO', (SELECT id FROM categorias WHERE modulo='SERVICO' AND nome='Instalação e logística'), 'POR_MOVEL', 0, 1),
('SV-FRETE',  'Frete',                      'FRETE',      (SELECT id FROM categorias WHERE modulo='SERVICO' AND nome='Instalação e logística'), 'POR_KM',    0, 0),
('SV-HORA',   'Hora de marceneiro',         'OUTRO',      (SELECT id FROM categorias WHERE modulo='SERVICO' AND nome='Produção'), 'POR_HORA',       0, 0);

-- Regras de ferragem: dobradiças por altura da porta; puxador por porta/frente; suportes por prateleira
INSERT INTO regras_ferragem (tipo_peca_id, material_id, dimensao_referencia, dimensao_min_mm, dimensao_max_mm, quantidade, observacoes)
SELECT tp.id, m.id, 'COMPRIMENTO', f.dmin, f.dmax, f.qtd, f.obs
FROM tipos_peca tp
JOIN materiais m ON m.codigo = 'DOB-35-CL'
JOIN (SELECT 0 AS dmin,     900 AS dmax, 2 AS qtd, 'Porta até 900 mm'      AS obs UNION ALL
      SELECT 900.01,       1600,        3,        'Porta 901 a 1600 mm'          UNION ALL
      SELECT 1600.01,      2200,        4,        'Porta 1601 a 2200 mm'         UNION ALL
      SELECT 2200.01,      2800,        5,        'Porta acima de 2200 mm') f
WHERE tp.codigo = 'PORTA';

INSERT INTO regras_ferragem (tipo_peca_id, material_id, dimensao_referencia, quantidade, observacoes)
SELECT tp.id, m.id, 'NENHUMA', 1, 'Um puxador por porta/frente'
FROM tipos_peca tp JOIN materiais m ON m.codigo = 'PUX-160'
WHERE tp.codigo IN ('PORTA','FRENTE_GAV');

INSERT INTO regras_ferragem (tipo_peca_id, material_id, dimensao_referencia, quantidade, observacoes)
SELECT tp.id, m.id, 'NENHUMA', 1, 'Um par de corrediças por gaveta'
FROM tipos_peca tp JOIN materiais m ON m.codigo = 'COR-TEL-450'
WHERE tp.codigo = 'FRENTE_GAV';

INSERT INTO regras_ferragem (tipo_peca_id, material_id, dimensao_referencia, quantidade, observacoes)
SELECT tp.id, m.id, 'NENHUMA', 4, '4 suportes por prateleira móvel'
FROM tipos_peca tp JOIN materiais m ON m.codigo = 'SUP-PRAT'
WHERE tp.codigo = 'PRATELEIRA';

-- Regras de insumo
INSERT INTO regras_insumo (insumo_id, base_calculo, tipo_peca_id, tipo_material, consumo, arredondar_para_cima)
SELECT id, 'POR_PECA', NULL, NULL, 8, 0 FROM insumos WHERE codigo = 'PAR-4X40';
INSERT INTO regras_insumo (insumo_id, base_calculo, tipo_peca_id, tipo_material, consumo, arredondar_para_cima)
SELECT id, 'POR_METRO_FITA', NULL, NULL, 0.01500, 0 FROM insumos WHERE codigo = 'COLA-HM';
INSERT INTO regras_insumo (insumo_id, base_calculo, tipo_peca_id, tipo_material, consumo, arredondar_para_cima)
SELECT id, 'POR_MOVEL', NULL, NULL, 0.25000, 1 FROM insumos WHERE codigo = 'SILICONE';
INSERT INTO regras_insumo (insumo_id, base_calculo, tipo_peca_id, tipo_material, consumo, arredondar_para_cima)
SELECT i.id, 'POR_PECA', tp.id, NULL, 4, 0
FROM insumos i JOIN tipos_peca tp ON tp.codigo IN ('LATERAL','BASE','TAMPO','DIVISORIA')
WHERE i.codigo = 'MINIFIX';

-- Mapeamentos .dae de exemplo (ajuste aos nomes usados pelos arquitetos)
INSERT INTO mapeamentos_dae (origem, padrao, modo_comparacao, prioridade, acao, material_id)
SELECT 'COMPONENTE', 'dobradica', 'CONTEM', 10, 'FERRAGEM', id FROM materiais WHERE codigo = 'DOB-35-CL';
INSERT INTO mapeamentos_dae (origem, padrao, modo_comparacao, prioridade, acao, material_id)
SELECT 'COMPONENTE', 'puxador', 'CONTEM', 10, 'FERRAGEM', id FROM materiais WHERE codigo = 'PUX-160';
INSERT INTO mapeamentos_dae (origem, padrao, modo_comparacao, prioridade, acao, material_id)
SELECT 'COMPONENTE', 'corredica', 'CONTEM', 10, 'FERRAGEM', id FROM materiais WHERE codigo = 'COR-TEL-450';
INSERT INTO mapeamentos_dae (origem, padrao, modo_comparacao, prioridade, acao) VALUES
('COMPONENTE', '^(humano|pessoa|person|escala|eletro|geladeira|fogao|cooktop|microondas|cuba|torneira|parede|piso|janela)', 'REGEX', 5, 'IGNORAR');
INSERT INTO mapeamentos_dae (origem, padrao, modo_comparacao, prioridade, acao, acabamento_id, fita_borda_id)
SELECT 'MATERIAL', 'branco', 'CONTEM', 50, 'PECA',
       (SELECT id FROM acabamentos WHERE nome = 'Branco'),
       (SELECT id FROM materias_primas WHERE codigo = 'FITA-BR-22');
-- Sem materia_prima_id: o motor escolhe a chapa do acabamento "Branco" casando a ESPESSURA da peça.

-- Fim da migration
