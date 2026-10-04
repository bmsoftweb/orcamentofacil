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

Arquivos enviados (`.dae` importados, malhas do visualizador, imagens do catálogo e anexos) ficam no Vercel Blob
quando há `BLOB_READ_WRITE_TOKEN`; sem ele, em `STORAGE_DIR` (padrão `./storage`, fora do Git). Ver "Vercel".

O servidor (tsx, sem watch) não recarrega sozinho: depois de mexer em `server/` ou `src/lib/`, reinicie.

## Vercel

`api/index.ts` expõe o app Express como função; o `vercel.json` encaminha `/api/*` para ela e agenda a
rotina diária `/api/cron/expirar` (orçamentos enviados e vencidos viram EXPIRADO). Variáveis de ambiente
no projeto da Vercel: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`,
`SESSION_SECRET`, `CRON_SECRET` e `BLOB_READ_WRITE_TOKEN` (criado ao ligar o Blob). Os PDFs usam o Chromium do `@sparticuz/chromium`.

Arquivos (`.dae`, malhas do visualizador 3D, imagens e anexos) ficam no **Vercel Blob** (store
`orcamentofacil`, ligado ao projeto: a Vercel cria `BLOB_READ_WRITE_TOKEN`). `.dae` e anexos vão direto do
navegador para o Blob (sem o limite de 4,5 MB da Vercel; o servidor só libera o envio em `/api/arquivos/upload`).
Para usar o mesmo Blob localmente, copie o `BLOB_READ_WRITE_TOKEN` para o `.env`; sem ele, os arquivos ficam no
disco (`STORAGE_DIR`, servidos em `/arquivos`). Tudo passa por `server/armazenamento.ts`.
