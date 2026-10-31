# Disponibilidade de entrega e retirada por loja — DEV

## Origem e auditoria inicial

O banner vem de `updateStoreAvailabilityUI` no `crm/public/cardapio.html` compartilhado. A origem é a projeção `GET /api/store/public-config`, produzida por `functions/store-config.js`. O contrato já possui `lojas/{storeId}/configuracoes/storefront.delivery.enabled` e `.pickup.enabled`; portanto não se cria mapa fulfillment paralelo. A aba Configurações → Frete editava apenas coordenadas/tarifas/a combinar, sem expor esses dois controles.

A leitura de 31/10/2026 no DEV confirmou versão 1 em Matriz/Garavelo: Matriz entrega/retirada true, Garavelo entrega false/retirada true. O diagnóstico antigo de 15/10 apontava frete ausente no Garavelo; **os dados existentes hoje passam na validação técnica** de coordenadas/tarifas/mínimo. Isso não comprova homologação operacional desses dados nem autoriza liberar a entrega. A flag false é preservada; nenhuma tarifa, coordenada ou configuração é copiada ou alterada durante esta entrega. [Evidência inicial sanitizada](evidence/fulfillment-availability-before-dev.json).

## Contrato e backend

Intenção administrativa: delivery.enabled e pickup.enabled. Prontidão técnica: helper compartilhado `deliveryFreight`, com os mesmos critérios anteriores, incluindo coordenadas, valor por km e mínimo explícito V1; frete a combinar conserva o contrato existente. Leitura de frete consulta somente configuracoes/config.frete → configuracoes/frete → info/dados da própria loja. Nenhuma herança global ou de outra loja.

Entrega efetiva = loja/catálogo válidos AND delivery.enabled AND readiness técnico. Retirada efetiva = loja/catálogo válidos AND pickup.enabled. Horário operacional continua sendo validado separadamente. A UI não transforma checkbox em bypass de readiness.

`staffGetFulfillment` retorna apenas storeId, flags, readiness, disponibilidade efetiva, revisão e editabilidade. `staffSaveFulfillment` aceita somente storeId, dois booleans, expectedRevision e requestId. Autorização reutiliza Staff ativo, permissão `configuracoes`, customProfiles e vínculos de loja existentes; Dono global somente quando sem restrição de lojas. Customer, anônimo, inativo, sem permissão e loja externa são rejeitados. Não cria capability financeira ou nova permissão automática.

Save é transacional, com revisão para concorrência e idempotência por requestId/fingerprint. Atualiza somente os dois campos enabled, revisão e timestamp de disponibilidade. Preserva catálogo, pagamento, config de frete e demais dados. Nenhuma escrita remota é feita apenas para homologar a funcionalidade. Lojas legadas sem contrato storefront V1 continuam no modo de leitura compatível; o painel informa que é necessária configuração V1 válida antes de editar, sem migração implícita.

O middleware existente bloqueia POST /pedidos e /checkout/confirmar, além de cotação de entrega. A transação real do pedido agora relê loja/storefront antes da cotação, impedindo corrida entre checagem HTTP e desativação administrativa. Não altera preços, valores de frete, Maps, raio, estoque, confirmação de pagamento ou histórico. Webhook/payment_check e pagamentos existentes não passam por esta nova guarda de criação.

## CRM, cardápio e atualização

CRM → Configurações → Frete mostra seção Disponibilidade com checkboxes independentes, save próprio, estado de erro/retry, resumo efetivo e readiness. Salvar disponibilidade não depende da validação do formulário de tarifa. Enabled com readiness inválido mostra: “Entrega habilitada, porém a configuração de frete desta loja ainda não está pronta.” Estado/resposta de outra loja não contamina a seleção atual; save duplicado em voo é bloqueado e retry conserva requestId.

O banner de atendimento depende somente da entrega efetiva:

| Entrega efetiva | Retirada efetiva | Banner |
|---|---|---|
| true | true | Nenhum |
| false | true | Entrega indisponível. Retirada disponível. |
| false | false | Entrega e retirada indisponíveis no momento. |
| true | false | Nenhum |

Horário/readiness de loja continuam bloqueando checkout e fornecendo a mensagem contextual no botão/fluxo. O banner de entrega não é usado para indicar horário. Opção de retirada e endereço de entrega já usam a projeção; o caminho guest existente é de entrega e fica indisponível quando não há entrega. O backend permanece autoridade em qualquer tentativa forjada.

O cliente lê novamente public-config sem cache autoritativo, no refresh, foco e polling de 60 segundos já existentes. A mudança de dado é refletida sem deploy. URLs amigáveis, aliases e canais continuam usando o mesmo template gerado; nenhuma lógica por storeId foi adicionada.

## Auditoria e Rules

Evento server-side em `lojas/{storeId}/fulfillmentAudit/{requestId}`: action FULFILLMENT_AVAILABILITY_CHANGED, storeId, staffUid, before/after dos dois booleans, revisão, source CRM_FREIGHT_SETTINGS, createdAt serverTimestamp e fingerprint interno. Evento e alteração são atômicos; no-op não gera evento. Sem endereço, telefone, e-mail ou dados financeiros. Não há edição/exclusão normal de eventos pelo CRM.

Rules existentes foram restringidas somente para escrita direta no documento storefront e acesso à nova coleção fulfillmentAudit, incluindo o wildcard recursivo que poderia reabrir a escrita. Configurações de tarifa e demais documentos mantêm seu caminho anterior. Escrita de disponibilidade e audit é exclusiva do servidor autorizado. Testes com Rules reais confirmam rejeição a Staff/Customer/anônimo e preservação das escritas de frete. Nenhum relaxamento de Rules, permissão de Auth ou dado Customer.

## Validação e entrega

22 casos Node (resolver/diretório/frete real/handler do banner), 29 casos em emuladores (incluindo regressão financeira, autorização, isolamento, auditoria/Rules e concorrência de disponibilidade) e 4 React PASS. Build PASS; lint zero erros, 65 avisos App.js preexistentes e nenhum novo. Bundle main.66d27a75.js, CSS main.88401a71.css, aumento aproximado de 1,31 KB gzip no JS frente à entrega anterior. Diff-check PASS.

Seis capturas locais do componente real com respostas fictícias: Matriz/Garavelo/readiness pendente, desktop 1920×889 e mobile 390×800, sem overflow horizontal nem pageerror. Não representam uma sessão Staff autenticada no DEV. [Relatório local](evidence/fulfillment-availability/local-report.json). Publicação, evidências remotas e aceite no [checkpoint](CHECKPOINT_FULFILLMENT_AVAILABILITY.md).

DEV crmdoceria-9959e exclusivamente. PROD não autorizada. Nenhum pedido, pagamento, nota, SMS ou WhatsApp real. Percentuais formais: Fase9 75%, Fase11/12 100%, Global 95,00%, Fase13 0%. Mercado Pago futuro.

## Entrega DEV verificada — 31/10/2026

Commit funcional **74a5c732** enviado e publicado no DEV: API + dois callables ACTIVE, 50 arquivos de runtime por fonte, env/secrets preservados, 137 funções não relacionadas inalteradas e Rules correspondentes ao arquivo testado. Hosting 61/61 hashes, 27 fontes de sourcemap e 52 fontes públicas, cache PASS. Dados de ambas as lojas inalterados. Chrome real público Matriz/Garavelo desktop/mobile, URL direta/refresh/banner/sem overflow ou pageerror PASS. **Falta somente homologação Staff dos controles**, sem alterar configuração real para testar. [Backend/Rules](evidence/fulfillment-availability-functions-dev.json), [Hosting](evidence/fulfillment-availability-hosting-dev.json), [dados preservados](evidence/fulfillment-availability-data-dev.json), [Chrome público](evidence/fulfillment-availability/dev-public-report.json). Sem novo deploy para este registro documental.
