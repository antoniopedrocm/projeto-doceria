# Checkpoint — disponibilidade de entrega e retirada

DEV `crmdoceria-9959e`; workspace `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`. PROD não autorizada. 31/10/2026.

## Estado atual

**IMPLEMENTAÇÃO E VALIDAÇÃO LOCAL CONCLUÍDAS; PUBLICAÇÃO DEV/HOMOLOGAÇÃO PENDENTES.** 22 Node, 29 emulador e 4 React PASS; build/lint/diff-check PASS, sem erro/aviso novo. Capturas locais fictícias desktop/mobile revisadas. Reutiliza `lojas/{storeId}/configuracoes/storefront.delivery.enabled` e `.pickup.enabled`, sem duplicar campos ou copiar frete. Matriz antes: entrega/retirada habilitadas; Garavelo antes: entrega desabilitada/retirada habilitada. Edição é dado da loja; não se modifica configuração DEV real apenas para testar.

- CRM → Configurações → Frete: seção independente de disponibilidade, com save próprio e readiness técnico, sem alterar formulário de tarifa/coordenadas.
- `staffGetFulfillment`/`staffSaveFulfillment`: Staff ativo, permissão existente `configuracoes` e escopo de loja; booleans estritos, revisão/idempotência e auditoria transacional `FULFILLMENT_AVAILABILITY_CHANGED`.
- Rules restringem escrita direta no documento storefront e coleção fulfillmentAudit; demais escritas de frete preservadas. Validar em emulador e publicar apenas após testes.
- Cardápio compartilhado usa disponibilidade efetiva: entrega disponível → sem banner; entrega indisponível com retirada → mensagem atual; ambas indisponíveis → mensagem correta. Checkout mantém horário/readiness e valida flags novamente na transação de criação.
- Não altera tarifa, raio, Maps, provider, Auth, SMS/WhatsApp ou histórico.

## Próximos passos

Não repetir testes/build aprovados sem defeito novo. Concluir commit/push DEV; conferir baseline remoto e publicar apenas API, dois callables, Rules e Hosting necessários com env/secrets preservados. Verificar hashes/fontes e projeções públicas sem criar pedido. Pedir homologação Staff dos controles Matriz/Garavelo e banner, sem salvar dados reais apenas para teste.

## Percentuais

Fase9 **75%**, Fase11/12 **100%**, Global **95,00%**, Fase13 **0%**. Otimização interna pré-PROD; percentuais formais preservados. Mercado Pago futuro. Nenhum pedido/pagamento/nota/SMS/WhatsApp real; PROD intacta.

Observação de auditoria: o DEV atual contém frete do Garavelo que passa na validação técnica existente, diferente do diagnóstico antigo. Não foi homologado operacionalmente nem alterado. Flag de entrega false preservada. [Contrato e limites](FULFILLMENT_AVAILABILITY.md).
