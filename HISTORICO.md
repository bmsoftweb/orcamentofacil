# Histórico de versões

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
