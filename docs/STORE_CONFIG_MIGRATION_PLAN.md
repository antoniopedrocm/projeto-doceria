# Multiloja dinâmica V1 — migração controlada DEV

Estado: implementação LOCAL, sem migração remota ou deploy. Workspace DEV `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`; projeto permitido `crmdoceria-9959e`. Produção não participa deste procedimento.

## Contrato por loja

- `lojas/{storeId}`: `nome`, `ativo: true`, `status: ACTIVE`, `storeConfigVersion: 1` após aprovação da configuração. `createStore` inicia com `ativo: false`, `status: DRAFT`, versão 1.
- `lojas/{storeId}/configuracoes/storefront`: `schemaVersion: 1`, `catalog: {enabled, category}`, `pickup: {enabled}`, `delivery: {enabled}`, `onlinePayment: {enabled}`. Nenhuma capacidade é habilitada por `createStore`.
- `lojas/{storeId}/configuracoes/config`: `timezone`, `schedule` por dia (`sun`…`sat`, `enabled`, `open`, `close`) e `manualOverride.mode`. V1 exige agenda/timezone válidos mesmo quando há override. Override não é prova de agenda definitiva homologada.
- Frete próprio no campo `frete` da configuração canônica: coordenadas válidas, `valorPorKm`, `valorMinimoFrete` explícito e `freteACombinar`. O modo a combinar não depende de mínimo calculado. V1 não herda R$2 do código.
- `lojas/{storeId}/produtos/{productId}`: catálogo/preços/estoque próprios, flags de produto ativo e categoria selecionada no contrato público. Não copiar preços/estoques de outra loja.
- `lojas/{storeId}/configuracoesInternas/infinitepay`: configuração própria habilitada e válida somente quando pagamento online desejado. Manter documento privado; sem herança de handle, URLs ou credenciais.
- Profiles compartilhados não foram implementados nesta V1; referências futuras precisarão de validação explícita. Não são fallback automático.

## Projeção pública e navegação

`GET /api/store/public-config?storeId={storeId}` retorna apenas `storeId`, `name`, `active`, `catalog`, `schedule`, `pickup`, `delivery`, `onlinePayment`, `readiness` e canal sanitizado quando solicitado. Não retorna autor, auditoria, handle, URLs financeiras, coordenadas/tarifas administrativas, secrets ou configuração bruta.

`GET /api/store/public-list?cursor={storeId}` descobre lojas ativas e canais publicados. Página física de 20 lojas; cursor permite avançar mesmo quando uma página contém somente drafts/inativas. Canais por loja limitados a 20 na descoberta V1; URL direta continua disponível para canal configurado. Catálogo vazio pode ser apresentado como vazio; readiness de catálogo representa sua configuração, não garantia de estoque vendável.

Entrada única `/cardapio?store={storeId}`, com `&channel={channelId}` opcional. `/cardapio` apresenta escolha de loja por dados. Rotas históricas são cópias geradas do MESMO `cardapio.html` pelo prebuild; não são fontes comerciais independentes. Novas lojas não precisam de HTML ou edição de lista.

Aliases históricos são documentos administrativos (nenhuma Rule pública nova):

| Documento | Dados explícitos |
|---|---|
| `storefrontAliases/cardapio-matriz` | `enabled: true`, `storeId: ana-guimaraes-doceria-matriz` |
| `storefrontAliases/cardapio-garavelo` | `enabled: true`, `storeId: ana-guimaraes-doceria-garavelo` |
| `storefrontAliases/cardapio-festa` | `enabled: true`, `storeId: ana-guimaraes-doceria-matriz`, `channelId: festas` |

Festas é canal explícito: `lojas/ana-guimaraes-doceria-matriz/canais/festas` com `storeId` igual à loja proprietária, `enabled: true`, `listed: true`, `name: Festas`, `catalogCategory` conforme catálogo atual. Os HTMLs anteriores filtravam `Delivery`; conservar esse filtro na primeira migração, sem inventar catálogo independente. Canal inexistente/inativo ou com vínculo divergente é negado. `parentStoreId` não é usado para herdar todos os domínios.

## Dados atuais e ações pendentes

| Loja/canal | Migração necessária antes de ativar V1 |
|---|---|
| Matriz | Conferir dados atuais, manter tarifa/mínimo legítimos já configurados; se mínimo ausente, obter confirmação operacional explícita antes de gravar. Não preencher automaticamente com R$2. Definir flags de catálogo/retirada/entrega/pagamento, categoria e ativação; preservar configuração InfinitePay própria e agenda/override autorizados. |
| Garavelo | Configuração de frete calculado ausente/incompleta no diagnóstico. Declarar entrega desabilitada até cadastro legítimo; preservar catálogo, retirada e pagamento próprios quando aprovados. Não copiar coordenadas/tarifas da Matriz nem liberar `info/dados`. Homologar agenda definitiva separadamente. |
| Festas | Criar somente alias/canal explícitos associados à Matriz, sem loja nova e sem alterar pedidos históricos. |

Compatibilidade temporária: loja antiga sem marcador V1 e sem documento storefront continua usando seus próprios documentos legados, categoria Delivery e retirada existentes. Frete legado continua consultando somente a própria loja; mínimo legado R$2 permanece apenas nesse modo. Nenhuma migração ocorre em uma leitura. Novas lojas criadas pela API já são V1/DRAFT e não entram nesse modo por configuração incompleta. Não remover o marcador V1 para contornar validação.

## Publicação futura — depende de autorização separada

1. Revisar diff, testes e inventário de dados atuais, com backup/snapshot sanitizado das configurações relevantes.
2. Com autorização específica de escrita DEV, cadastrar aliases e canal acima por Admin SDK/fluxo administrativo confiável. Não cadastrar fixtures de teste remotamente. Não mudar ownership ou permissões de contas.
3. Autorizar separadamente a publicação backend necessária (`api`, `createStore` e callable de recompra afetada), seguida do Hosting DEV. **Não publicar apenas o Hosting novo contra a API antiga.** Não publicar indiscriminadamente todos os triggers/Rules. Validar endpoints e aliases antes de trocar frontend.
4. Publicar as definições V1 de cada loja somente após conferência dos dados legítimos e prontidão por domínio. Configuração incompleta não deve derrubar catálogo/retirada quando esses domínios estão válidos.
5. Homologar visitante/legacy/Customer, URLs antigas e genérica, agenda, retirada e entrega disponível/indisponível. Sem pagamento novo por implicação desta migração. Revalidar autoritativamente frete/estoque/preço no servidor.
6. Rollback: conservar snapshot dos dados e artefatos anteriores; reverter versões coordenadamente. Não apagar pagamentos/pedidos/recibos e não desmarcar V1 silenciosamente para liberar venda.

## Segurança e limites

Rules e autorização Staff/Customer não mudaram. A projeção usa Admin SDK com seleção explícita dos campos retornados. Ela não revoga permissões públicas preexistentes dos documentos legados `configuracoes`; não guardar dados privados nesses documentos. Redução dessas permissões é uma migração de segurança separada.

Readiness é reavaliada por requisição e no backend antes de novas vendas/cotações; preço, estoque, frete e pagamento continuam autoritativos no backend. O mínimo V1 também é validado na transação do pedido. Webhook/reconciliação/consulta de pagamentos existentes não passam pelo novo bloqueio de novas vendas.

As fixtures persistentes de teste estão em `functions/fixtures/stores-v1.cjs`, consumidas pelo emulador `demo-doceria-checkout`; não existe script automático de seed remoto ou hook de deploy. Homologação remota e aprovação visual desta V1 ainda pendentes. Marco 4 PARCIAL; Fase 12 75%; global 92,00%.
