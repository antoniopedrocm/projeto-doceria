# Checkpoint — disponibilidade de entrega e retirada

DEV crmdoceria-9959e; workspace C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree, branch feature/infinitepay-customer-auth. PROD não autorizada. 31/10/2026.

## Estado real

**IMPLEMENTAÇÃO, TESTES E PUBLICAÇÃO DEV CONCLUÍDOS. HOMOLOGAÇÃO STAFF DOS CONTROLES PENDENTE.** Commit funcional **74a5c73245b7ae48f0b0b1f92a8934dcf4715707**, enviado ao origin. Não repetir implementação/testes/build/deploy sem defeito novo.

Campos existentes preservados: lojas/{storeId}/configuracoes/storefront.delivery.enabled e pickup.enabled. Sem campos paralelos ou migração de dados. Matriz true/true, Garavelo false/true, sem alteração de configuração real. O DEV atual contém dados de frete do Garavelo que passam na validação técnica, diferente do diagnóstico antigo; não foram homologados operacionalmente, copiados ou alterados. Flag false preservada.

CRM → Configurações → Frete apresenta seção Disponibilidade independente do formulário de tarifas, com save próprio, readiness, resumo efetivo, erro/retry e isolamento de estado por loja. Backend valida Staff ativo, permissão configuracoes e escopo de loja, com revisão/idempotência e evento server-side FULFILLMENT_AVAILABILITY_CHANGED na mesma transação. Rules impedem escrita direta no storefront e no audit. Checkout mantém horário/frete técnico e relê flags na transação de criação. Nenhuma alteração financeira/provider/Maps/valores/raio/Auth/histórico.

## Qualidade e publicação verificadas

- 22 Node, 29 emulador (inclui regressão financeira/Rules) e 4 React PASS. Build/lint/diff-check PASS; 65 avisos preexistentes no App.js, nenhum novo. [Evidência local](evidence/fulfillment-availability-local.json).
- Seis capturas locais fictícias do componente real desktop/mobile, sem overflow. Não são sessão Staff DEV. [Relatório local](evidence/fulfillment-availability/local-report.json).
- API **api-00067-lal**, staffGetFulfillment e staffSaveFulfillment ACTIVE; 50 arquivos de runtime conferidos em cada fonte implantada. API env/secrets preservados, **137 funções não relacionadas inalteradas**. Novos callables anônimos retornam 401, sem escrita. Rules publicadas correspondem ao arquivo testado. Compilação das Rules PASS, com avisos preexistentes em helpers não alterados. [Verificação backend/Rules](evidence/fulfillment-availability-functions-dev.json).
- Hosting publicado: **61/61 hashes**, **27 fontes de sourcemap e 52 fontes públicas** conferidas; cache HTML/scripts revalidável e assets hash immutable. Bundle main.66d27a75.js, CSS main.88401a71.css. [Verificação Hosting](evidence/fulfillment-availability-hosting-dev.json).
- Dados consultados antes/depois nas duas lojas permanecem iguais, inclusive frete e flags. Nenhuma escrita de pedido/configuração para homologar. [Verificação dos dados](evidence/fulfillment-availability-data-dev.json).
- Chrome real DEV: /cardapio-matriz e /cardapio-garavelo, desktop 1920×889 e mobile 390×800, abertura direta/refresh/loja correta/banner correto, sem overflow horizontal ou pageerror: **4 casos PASS**. Matriz sem banner; Garavelo com Entrega indisponível. Retirada disponível. Nenhuma requisição de mutação foi necessária ou bloqueada. [Relatório público DEV](evidence/fulfillment-availability/dev-public-report.json).

## Único passo restante

Com Staff autorizado, conferir Configurações → Frete da Matriz (ambos marcados) e Garavelo (entrega desmarcada/retirada marcada), desktop/mobile, sem salvar nem alterar flags/tarifas. Readiness técnica Pronta no Garavelo não equivale a aceite operacional de entrega. Não criar pedido, pagamento, nota, SMS ou WhatsApp reais. Cardápios públicos e refresh já passaram no Chrome; pode confirmar o banner sem repetir outros workstreams. Registrar PASS ou falha antes de encerrar o aceite humano.

## Retomada e limites

Stages .deploy-fulfillment-74a5c732-1/2, .deploy-fulfillment-rules-74a5c732 e .deploy-crm-store-baseline-74a5c732 já publicados. Logs locais %TEMP%/fulfillment-deploy.log, fulfillment-functions-verify.log, fulfillment-hosting-deploy.log, fulfillment-hosting-verify.log e fulfillment-public-browser.log. Configuração sensível fica somente local, fora dos documentos e do Git. [Contrato](FULFILLMENT_AVAILABILITY.md).

Fase9 **75%**, Fase11/12 **100%**, Global **95,00%**, Fase13 **0%** preservados. Mercado Pago futuro. PROD intacta. Sem pedido/pagamento/nota/SMS/WhatsApp real. Pendências fiscais anteriores permanecem separadas.
