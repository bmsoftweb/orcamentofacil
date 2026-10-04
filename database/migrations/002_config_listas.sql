-- Preferências das listas (larguras, ordem e colunas visíveis) por usuário, gravadas pela tela.
-- Mesmo padrão do crmweb/b2b admin.
ALTER TABLE usuarios ADD COLUMN config_listas TEXT NULL AFTER ultimo_acesso;
