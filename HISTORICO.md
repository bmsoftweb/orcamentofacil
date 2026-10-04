# Histórico de versões

## 0.0.6 — 04/10/2026

- Revisão da importação: clicar numa peça do 3D que não está no filtro aberto troca para o filtro da classificação dela e localiza a linha.

## 0.0.5 — 04/10/2026

- Excluir uma importação apaga também o `.dae` e a malha do armazenamento (antes ficavam órfãos no Blob).
- Aviso de arquivo já importado não apaga mais o `.dae` da importação existente quando o mesmo endereço é reenviado.

## 0.0.4 — 04/10/2026

Armazenamento na Vercel Blob (store "orcamentofacil"), no padrão do crmWeb:

- `.dae`, anexos e imagens vão direto do navegador para o Blob (sem o limite de 4,5 MB da Vercel); o servidor só libera o envio, por pasta e tamanho máximo.
- Malhas do visualizador 3D, imagens do catálogo e logo lidos do Blob (também nos PDFs).
- Sem `BLOB_READ_WRITE_TOKEN` (desenvolvimento local), os arquivos ficam no disco (`STORAGE_DIR`).

## 0.0.3 — 04/10/2026

Publicação na Vercel:

- `api/index.ts` + `vercel.json`: o servidor roda como função da Vercel (corrige o "Falha no login (HTTP 404)").
- PDFs na Vercel pelo Chromium do `@sparticuz/chromium`.
- Expiração dos orçamentos como rotina diária da Vercel (`/api/cron/expirar`, protegida por `CRON_SECRET`).
- Envio de arquivos (importar .dae, imagens e anexos) recusado na Vercel com aviso, até haver armazenamento externo.

## 0.0.2 — 04/10/2026

Primeira versão publicada, com as 8 fases do projeto:

1. **Base**: login por e-mail/senha (bcrypt), perfis ADMIN, ORCAMENTISTA, VENDEDOR e PRODUCAO, layout e Configurações (empresa, formação de preço, produção, importação .dae, orçamento, logo).
2. **Cadastros e regras**: clientes, arquitetos, fornecedores, condições de pagamento, unidades, categorias, acabamentos, matérias-primas (campos por tipo), insumos, ferragens, serviços; histórico de preços e reajuste em lote; tipos de peça, regras de ferragem (faixas sem sobreposição), regras de insumo e mapeamentos .dae com "testar padrão". CPF/CNPJ validado e CEP pelo ViaCEP.
3. **Importação .dae**: parser COLLADA (unidades, eixo up, componentes, triangles/polylist/polygons, caixa orientada em duas tentativas, retangularidade, espelho, material por área, móveis e agrupamento), fixtures sintéticas e visualizador 3D.
4. **Classificação e revisão**: mapeamentos (do arquiteto antes dos globais), chapa pela espessura, fita, tipo de peça por palavra-chave ou geometria, exceção de veio; revisão com edição em massa, "lembrar esta regra" e gerar orçamento com diff de reimportação.
5. **Motor de cálculo** (Decimal): chapas inteiras ou por área, fitas, ferragens por faixa, insumos e serviços automáticos, markup divisor, desconto, ajuste de pagamento, RT e margem real; preços congelados no orçamento.
6. **Plano de corte**: otimizador em guilhotina (kerf, refilo, veio, várias heurísticas) e desenho das chapas.
7. **Tela do orçamento** em abas (dados, importar, revisão, peças, itens, plano, resumo/preço, anexos, histórico), fluxo de status com histórico, revisões e expiração automática.
8. **Documentos e painel**: PDFs (cliente, interno, lista de corte, plano de corte, relatório de RT), lista de corte em CSV e painel de indicadores.

Migrations: `001_inicial.sql`, `002_config_listas.sql`, `003_modo_ferragens.sql`.
