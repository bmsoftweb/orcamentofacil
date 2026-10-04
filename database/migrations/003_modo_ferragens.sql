-- Ferragens do orçamento: só as do modelo (.dae), só as das regras de ferragem, ou ambas
-- (padrão: a regra não soma onde o modelo já trouxe ferragem do mesmo tipo no móvel).
ALTER TABLE orcamentos
  ADD COLUMN modo_ferragens ENUM('MODELO','REGRA','AMBAS') NOT NULL DEFAULT 'AMBAS' AFTER criterio_cobranca_chapa;
