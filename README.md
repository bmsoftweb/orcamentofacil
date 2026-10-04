# OrçamentoFácil

Orçamentos de móveis planejados a partir do projeto do arquiteto (SketchUp → COLLADA `.dae`).
Mesma stack, layout e padrões de tela do crmweb: Express + Vite + React 19 + Tailwind 4 + mysql2,
com as telas de cadastro dirigidas pelos metadados de `server/schema.ts`.

## Como rodar

```bash
npm install
npm run dev
```

Sobe em <http://localhost:3000>. Copie `.env.example` para `.env` (MySQL, `SESSION_SECRET`).
`npm run lint` = `tsc --noEmit`; `npm test` = Vitest.

## Banco

MySQL 8, banco `orcamentofacil`. As migrations ficam em `database/migrations/` e são rodadas à mão,
em ordem (`001_inicial.sql` é o schema base; não alterar — mudanças viram `002_*.sql`, `003_*.sql`…).

- `002_config_listas.sql`: coluna onde cada usuário guarda larguras/ordem das colunas das listas.
- `003_modo_ferragens.sql`: de onde vêm as ferragens do orçamento (modelo, regras ou ambas).

Toda gravação que altere preços usa `comUsuario()` (`server/db.ts`), que faz `SET @usuario_id`
para os triggers de `historico_precos`.

## Login

E-mail + senha (bcrypt). Usuário inicial: `admin@marcenaria.local` / `admin123` (troque no primeiro acesso,
pelo cadeado ao lado do nome no menu). Senha em branco no cadastro = a digitada no primeiro acesso é gravada.
Perfis: ADMIN, ORCAMENTISTA, VENDEDOR, PRODUCAO. Usuários e Configurações só para ADMIN.

## Testes

`npm test` roda os testes do parser .dae, do classificador, do motor de cálculo, do otimizador de corte e dos
documentos. Os arquivos .dae de teste são gerados por `tests/fixtures/dae/gerar-fixtures.ts`
(`npx tsx tests/fixtures/dae/gerar-fixtures.ts` grava os .dae na pasta para abrir no app).

## PDFs

Os documentos são HTML (`src/lib/pdf/`) convertidos em PDF pelo Edge/Chrome instalado no servidor, em modo
headless. Sem o navegador no caminho padrão, informe `NAVEGADOR_PDF` no `.env`.

## Arquivos

Arquivos enviados ficam em `STORAGE_DIR` (padrão `./storage`, fora do Git): `.dae` importados, malhas do
visualizador, imagens do catálogo e anexos dos orçamentos.

O servidor (tsx, sem watch) não recarrega sozinho: depois de mexer em `server/` ou `src/lib/`, reinicie.
