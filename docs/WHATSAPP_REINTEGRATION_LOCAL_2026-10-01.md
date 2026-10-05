# Reintegração local WhatsApp e correção do total — 2026-10-01

## Estado e limites

- Repositório DEV: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`; worktree ativo `infinitepay-auth-worktree`, conectado ao Git comum desse repositório.
- Branch `feature/infinitepay-customer-auth`; HEAD inicial `1b280da275090b9dc831f690fe616e1606b28095`; origin `https://github.com/antoniopedrocm/projeto-doceria.git`.
- Backup anterior às alterações: branch local `backup/pre-whatsapp-reintegration-20261001`, no mesmo HEAD. Auxiliares não rastreados preexistentes foram preservados.
- Recuperação seletiva de `797c25622b858a1423a71b84e19c54b24559068e`; nenhum cherry-pick, rollback, reset, rebase, push ou deploy.
- A configuração remota da Matriz não foi escrita. O diagnóstico anterior registrou `integrations/whatsapp/stores/matriz` com `enabled`, `automaticEnabled` e `manualEnabled` em `false`; esta execução não habilitou nenhuma dessas flags. Configuração ausente/desabilitada permanece bloqueada pelo código recuperado.
- Nenhum pedido real, cobrança, mensagem Meta ou alteração de dados remotos/produção. Escritas de testes ocorreram somente em memória e nos emuladores locais Auth/Firestore `demo-doceria-checkout`.

## Arquivos

Novos arquivos recuperados:

- `crm/src/components/WhatsAppOrderStatus.js` e `.test.js`.
- `functions/whatsapp-access.js`, `whatsapp-admin.js`, `whatsapp-checkout.js`, `whatsapp-client.js`, `whatsapp-config.js`, `whatsapp-history.js`, `whatsapp-order-summary.js`, `whatsapp-webhook.js`, `whatsapp-worker.js`, `whatsapp.js` e `whatsapp-test-support.js`.
- Testes `functions/whatsapp-{admin,checkout,history,order-summary,webhook,worker}.test.js` e `functions/whatsapp.test.js`.
- `functions/new-order-notifications.js` e `.test.js`: dependência direta da política de acesso recuperada; não substitui a implementação atual de notificações em `index.js`.

Novos arquivos desta correção: `functions/admin-order-total.test.js` e este relatório.

Arquivos modificados: `crm/src/App.js`, `crm/src/utils/orderFreight.js`, `crm/src/utils/orderFreight.test.js`, os três `crm/public/cardapio-{matriz,garavelo,festa}.html`, `functions/index.js`, `functions/package.json`, `functions/freight-checkout.test.js`, `functions/checkout-http.test.js` e `docs/INFINITEPAY_PROJECT_PLAN.md`.

Não foram alterados Rules, índices, dependências, configuração Firebase, autenticação Customer, frete server-side, reservas ou implementação financeira InfinitePay.

## Reconciliação manual

Não houve aplicação de merge nem conflitos textuais. As sobreposições foram reconciliadas por pontos específicos:

- `index.js`: imports/exports das seis Functions preservadas; `whatsappConfirmation` construído server-side e salvo na mesma transação do checkout; retorno de `whatsappPhoneStatus` tanto offline como online.
- Mantidos autenticação/ownership Customer, autorização, idempotência, validação de catálogo, frete, cupom, reserva e valor em centavos da integração atual.
- O código antigo só admitia pedidos criados como `Pendente`. Pedidos online atuais nascem `Aguardando pagamento`. Foi acrescentado **`enqueuePaidWhatsAppConfirmation`**, um trigger independente de atualização, com retry, que admite apenas a transição server-side para `PAID`/`CONFIRMED`, sem revisão financeira. O trigger não substitui nem altera os seis existentes ou `notifyNewOrder`.
- Criação e atualização usam o mesmo `jobIdFor`, evitando duplicação por replay/concorrência. Reenvio e processamento revalidam pagamento; pedidos não pagos, estornados ou em revisão não recebem confirmação. O worker também reconhece o status operacional atual `Em Produção`.
- `App.js`: componente reintegrado nos detalhes reais de Pedidos e no modal da Agenda; status, consulta, histórico e reenvio autenticado usam Cloud API. O botão existente `wa.me` foi mantido e identificado como `Enviar Resumo Cliente (manual)`.
- Cardápios: recuperado consentimento explícito, opcional, inicialmente desmarcado, específico por pedido e versionado; serialização no checkout; limpeza após sucesso/retorno. Nenhum fallback de loja foi adicionado.
- `orderFreight.js`/`App.js`: `total = subtotal - desconto + frete aplicável`, pelo snapshot do pedido. Aplicado em `buildOrderWithTotals`, `reloadOrderCriticalData`, `persistOrderWithTransaction`, abertura de edição e aplicação de desconto manual. Retirada/a combinar zeram somente o componente de frete. Histórico não foi recalculado em massa; o total salvo continua sendo a referência de exibição.
- `package.json`: scripts dos testes recuperados; versões/dependências mantidas. Duas anotações ESLint para `globalThis` e uma para ReactDOM/`act` nos testes, sem mudança funcional.

## Comparação com a fonte e o remoto preservado

O diagnóstico somente leitura anterior comparou os módulos do artefato remoto WhatsApp com `797c2562` e registrou equivalência; o `index.js` remoto completo não era equivalente. Esta execução compara os blobs locais com essa fonte preservada, sem presumir que o backend inteiro remoto corresponda ao HEAD local e sem nova publicação.

| Módulo | Blob em 797c2562 | Blob local | Diferença |
|---|---|---|---|
| whatsapp.js | 60c53d9a9ebf30ec23fa985ee46d4f35e1691298 | 48f8c4c1ec8717f634a7a30a5fc210091266398b | Apenas anotação ESLint |
| whatsapp-client.js | 5e560e7b1d7968d820c38beba46b3a81065fabc0 | 9bb8fe0757edb0cb08f930556563d83c903ba907 | Apenas anotação ESLint |
| whatsapp-config.js | 286ddabb3d035934f98a7fc2b213e5b7a5c71dcb | igual | Nenhuma |
| whatsapp-access.js | 24d8a684c621e4028d7d239625e68810b5029071 | igual | Nenhuma |
| whatsapp-admin.js | 6e402c06cd4a1cdecd78bcd109a2e2309c9a0f41 | igual | Nenhuma |
| whatsapp-checkout.js | 311e91e21d3227797708868ea19b5028ec00192e | igual | Nenhuma |
| whatsapp-history.js | c363ae92a8f32a48b6aedccb834bf492967b8eee | igual | Nenhuma |
| whatsapp-webhook.js | cecc8ca71320b40188859dc686c5931421a43f66 | igual | Nenhuma |
| whatsapp-order-summary.js | 680f29ba51b7509e6a6c3fde69917a9efe81cac8 | 7c99bed57c539544e40c5d4c1d7de55ea5c47db7 | Bloqueio de pagamento não confirmado/em revisão |
| whatsapp-worker.js | 94cd991f4a531e0c69d46d2720e6eccde5b2317a | ae5b10bc48f5a5c3407781d44d986a9d4223e060 | Transição financeira, revalidação e status Em Produção |
| new-order-notifications.js | 7f5a4ba2d29e5c3611972dc7f0091d86e291d56e | igual | Nenhuma |

Matriz continua usando o pedido físico `lojas/ana-guimaraes-doceria-matriz/pedidos/{id}` e a configuração interna WhatsApp `matriz`, conforme o mapeamento preservado. Garavelo não herda essa configuração. Nenhuma Function remota foi removida.

## Testes e resultados

- Backend unitário/rotas com doubles: **199/199 aprovados**, incluindo WhatsApp recuperado, sete casos de criação/edição/finalização administrativa, autenticação, pagamento, reservas, sessão Customer, prefill e frete/cardápios.
- CRM: **132/132 aprovados**, 12 suites, incluindo componente de status/histórico/reenvio e totais/frete. O componente teve também uma repetição direcionada de 4/4 após ajuste exclusivamente do helper de testes para lint.
- Emuladores Auth/Firestore: **28/29 aprovados** nas suites `checkout-http`, `checkout-emulator`, `checkout-reservation-emulator`, `payment-settings-emulator`.
- O cenário novo HTTP confirma produto R$ 12 + frete R$ 4 = pedido R$ 16, `checkoutPayments.amount = 1600`, payload InfinitePay simulado com `price = 1600`, loja correta, consentimento persistido e retry com mesmo pedido.
- **Falha preexistente confirmada:** `checkout-http.test.js`, cenário `HTTP rejeita quantidade duplicada/preço/frete manipulados`, última asserção: entrega com coordenadas alteradas e valor de frete informado zero recebe 200, enquanto o teste espera 409. Quantidade duplicada e preço adulterado são rejeitados corretamente. Reexecutado somente esse cenário usando o `index.js` original do HEAD `1b280da2`, carregado em memória por um loader temporário: mesma falha 200 versus 409. Não foi enfraquecida a asserção nem alterado o cálculo server-side nesta correção. **Não declarar todas as suites verdes.**
- Lint Functions e ESLint direcionado CRM aprovados sem erros; permanecem avisos de regex com caracteres de controle do código recuperado e avisos preexistentes do App/Browserslist.
- Build React aprovado após confirmar workspace DEV/Git comum; avisos conhecidos de source maps do `native-audio` e bases Browserslist antigas. Análise sintática e `git diff --check` aprovados; whitespace dos arquivos novos também conferido.
- Nenhum mock utilizou endpoint Meta real ou realizou cobrança.

## Pendências, riscos e próxima publicação

1. Revisar este diff antes de publicar; a implementação está somente local, sem homologação remota do fluxo reintegrado.
2. Investigar/corrigir separadamente a falha preexistente de validação de frete antes de considerar a bateria de checkout plenamente aprovada. Não ampliar automaticamente o escopo atual.
3. O novo trigger financeiro requer verificação de Eventarc/IAM e teste de reentrega na homologação autorizada. Os seis triggers/funções existentes mantêm nomes e tipos.
4. Confirmar por leitura, imediatamente antes de uma futura publicação, que as três flags da configuração WhatsApp da Matriz continuam desabilitadas. Não habilitar, reprocessar o pedido histórico ou enviar mensagens sem autorização específica.
5. Pedidos antigos sem consentimento continuam sem envio/reenvio pela API. Nenhum backfill inventa tentativa, consentimento ou total histórico.

Artefatos necessários em um futuro deploy DEV autorizado:

- Hosting: CRM compilado e os três cardápios públicos.
- Functions: `api`, `enqueueWhatsAppConfirmation`, **`enqueuePaidWhatsAppConfirmation` (nova)**, `processWhatsAppConfirmation`, `recoverWhatsAppConfirmations`, `getWhatsAppOrderStatus`, `requestWhatsAppOrderResend`, `whatsappWebhook`.
- Nenhuma alteração necessária em Rules, índices, Storage, demais Functions ou produção.

Comando seletivo proposto, **não executado**, após resolver as pendências e obter autorização:

```powershell
firebase deploy --config firebase.json --project crmdoceria-9959e --only "hosting,functions:api,functions:enqueueWhatsAppConfirmation,functions:enqueuePaidWhatsAppConfirmation,functions:processWhatsAppConfirmation,functions:recoverWhatsAppConfirmations,functions:getWhatsAppOrderStatus,functions:requestWhatsAppOrderResend,functions:whatsappWebhook"
```

**Progresso InfinitePay: 91% antes e 91% depois (+0 ponto percentual).** Esta é uma correção paralela, não o avanço do shell/rotas da fase 6. Fase 11 permanece 100%; percentuais das demais fases permanecem os registrados no plano principal.

## Atualização LOCAL — validação server-side de frete — 2026-10-05

- O resultado histórico 28/29 acima corresponde à reintegração de `554ef5c7`; a falha preexistente de frete foi corrigida separadamente, preservando esse commit e a navegação posterior de `993dac14`. Não houve rollback/cherry-pick, alteração de módulo WhatsApp ou nova publicação.
- Causa: `quoteOrderFreight` aceitava distância/valor financeiro do navegador sem comparação com rota confiável. A cotação final passa a usar origem/configuração da própria loja e endereço canônico efetivamente salvo no pedido, com rota rodoviária resolvida no servidor. Valores/aliases/distâncias adulterados retornam 409; retry valida o snapshot existente. Retirada e frete a combinar conservam suas regras.
- `whatsapp-checkout.test.js` recebeu apenas adaptação do helper/fixture: mock de distância server-side, endereço de entrega e valor correto no cenário positivo. Asserções de consentimento, status, metadados e envio não foram removidas/enfraquecidas. Nenhum código de WhatsApp, export, worker, webhook, configuração ou fluxo manual foi modificado.
- Resultados atuais: cenário HTTP falho original 1/1 aprovado; quatro suites de integração **30/30** (um novo teste HTTP); revalidação final HTTP **9/9**; backend **219/219**; CRM **132/132**. Pedido 12 + frete 4 continua total 16, pagamento 1600 centavos e payload InfinitePay simulado 1600. Lint Functions, lint dos scripts públicos, build e diff check aprovados, com os avisos preexistentes documentados.
- A pendência 2 acima está encerrada **no código local**, mas antes de homologação/deploy é obrigatório disponibilizar e validar privadamente `GOOGLE_MAPS_SERVER_API_KEY` para `api`. Sem a credencial ou com falha do provedor, entrega calculada retorna 503 de forma segura, sem fallback ao payload; retirada/a combinar não dependem do provedor. Nesta execução o serviço de rotas e InfinitePay foram simulados; apenas emuladores locais receberam fixtures.
- Permanecem revisão conjunta, homologação autorizada, verificação de Eventarc/IAM e leitura das flags WhatsApp antes de publicação. Nenhuma Function remota foi removida, nenhum dado remoto alterado, nenhum envio/ativação/cobrança realizado. **Sem push e sem deploy.** O percentual real do checkpoint principal, após a navegação posterior, permanece **92% → 92% (+0 p.p.)**; esta correção não avança fase.
