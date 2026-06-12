# 99Food Hub - Integracao Operacional

O `99Food Hub` torna a plataforma Ana Guimaraes Doceria a fonte oficial de estoque, catalogo, pedidos, financeiro operacional e auditoria por loja.

## Fonte de Verdade

O saldo oficial permanece em `lojas/{lojaId}/produtos/{productId}.estoque`.

Quando um pedido 99Food entra por webhook, a Function busca o detalhe do pedido na OpenAPI, identifica os itens por `app_item_id`/codigo PDV, baixa o estoque em transacao, grava o pedido interno em `pedidos/food99_{orderId}`, registra movimentacao em `kardex` e atualiza o espelho operacional em `food99Orders`.

Quando uma venda interna, reposicao ou ajuste altera o estoque do produto, o trigger `food99ProductStockChanged` sincroniza a disponibilidade do item na 99Food:

- estoque maior que zero: `status = 1` (disponivel);
- estoque igual a zero: `status = 2` (indisponivel).

A API local de referencia da 99Food nao expoe quantidade por item; por isso a quantidade fica auditada no Firestore e a 99Food reflete a disponibilidade.

## Colecoes

| Caminho | Uso |
|---|---|
| `integrations/food99` | Configuracao global e referencias protegidas de App ID/App Secret/webhook |
| `integrations/food99/audit/{auditId}` | Auditoria de credenciais e configuracao global |
| `lojas/{lojaId}/food99/config` | `app_shop_id`, nome da loja e flags operacionais |
| `lojas/{lojaId}/food99Orders/{orderId}` | Espelho operacional dos pedidos 99Food |
| `lojas/{lojaId}/food99Events/{eventId}` | Idempotencia de webhooks/eventos |
| `lojas/{lojaId}/food99ProductMappings/{productId}` | Vinculo produto interno x `app_item_id` 99Food |
| `lojas/{lojaId}/food99Alerts/{alertId}` | Falhas de API, estoque, catalogo e mapeamento |
| `lojas/{lojaId}/food99Audit/{auditId}` | Trilha operacional |
| `lojas/{lojaId}/food99Health/status` | Status, latencia e ultima consulta |

## Functions

| Function | Tipo | Objetivo |
|---|---|---|
| `food99GetConfiguration` | Callable | Carregar configuracao, permissoes e health |
| `food99SavePlatformConfiguration` | Callable | Salvar App ID/App Secret globais no Secret Manager |
| `food99SaveConfiguration` | Callable | Salvar `app_shop_id` e regras por loja |
| `food99TestConnection` | Callable | Validar autenticacao 99Food |
| `food99LoadMerchants` | Callable | Carregar detalhe da loja configurada |
| `food99PollNow` | Callable | Validar API, reprocessar disponibilidade e opcionalmente importar um `orderId` |
| `food99OrderAction` | Callable | Confirmar, marcar pronto/entregue ou cancelar pedido |
| `food99LoadCatalogProducts` | Callable | Ler catalogo v3 da 99Food |
| `food99ImportCatalogProduct` | Callable | Trazer item 99Food existente para revisao interna |
| `food99PublishProducts` | Callable | Publicar/atualizar produtos via menu v3 |
| `food99SaveProductMapping` | Callable | Vincular produto interno a `app_item_id` |
| `food99SyncStockNow` | Callable | Reconciliar disponibilidade manualmente |
| `food99ScheduledPoll` | Scheduler | Retry periodico de disponibilidade |
| `food99ProductStockChanged` | Trigger | Propagar estoque/preco/catalogo interno |
| `food99Webhook` | HTTP | Receber eventos 99Food e importar pedidos |

## Credenciais

As credenciais globais usam Google Secret Manager:

- `food99_platform_client_id` guarda o App ID;
- `food99_platform_client_secret` guarda o App Secret;
- `food99_platform_webhook_secret` guarda o segredo opcional de webhook.

Somente Dono/Admin Master altera credenciais globais. Gerentes configuram apenas a propria loja e nao veem segredos.

