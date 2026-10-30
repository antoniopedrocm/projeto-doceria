# Checkpoint — edição completa e status do pedido

DEV `crmdoceria-9959e`, branch `feature/infinitepay-customer-auth`, workspace `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. PROD não autorizada. Retomada de 30/10/2026.

## Estado real

**CONCLUÍDO E HOMOLOGADO NO DEV.** Usuário respondeu **PASS** à homologação autenticada da edição completa e do atalho separado. Commit funcional **15138ff39c2ae4da01bd3ca3750150a4014123ed**, push concluído. Não refazer implementação, testes ou deploy sem defeito novo.

- Status-only anterior: **PASS visual**, conforme usuário; não é aceite final da edição completa.
- Edição completa: formulário preservado como ação própria; endpoint administrativo transacional publicado e verificado; aceite autenticado **PASS**.
- `functions/admin-order-edit.js`: gravação FULL/STATUS, autorização Staff por módulo/loja, histórico append-only sob pedido, idempotência/revisão, estoque por delta, proteção de ownership/método pago e divergência de valor.
- `functions/index.js`: dois novos callables `adminOrderSave` e `adminOrderHistory`; nenhum endpoint financeiro/provedor alterado ou publicado.
- `functions/order-payment-method.js` e `functions/fiscal.js`: proteção fiscal contra divergência de valor pago/total; publicados somente os quatro exports fiscais necessários, com configuração atual preservada.
- CRM: ações Editar Pedido e Atualizar Status separadas na lista/detalhe; quantidade editável, campos protegidos, histórico e alerta financeiro; não altera Auth/Admin Preview/WhatsApp.
- 39 testes de integração financeira/fiscal/Rules e 13 testes focados finais PASS (grupos com sobreposição). 55 React e 21 Node/seletores/handlers/JSX real PASS. Build/lint/diff-check PASS; 65 avisos preexistentes de App.js, sem novo aviso. Quatro capturas locais fictícias desktop/mobile revisadas, sem overflow horizontal. [Evidência local](evidence/admin-order-full-edit-local.json).
- Baseline Cloud Functions preservado localmente para comparação; configuração sensível não entra nos documentos.

## Publicação DEV verificada

Functions publicadas na ordem fiscalIssueInvoice/fiscalValidateOrder → fiscalIssueDraft/fiscalCheckDraft → adminOrderSave/adminOrderHistory. Seis funções **ACTIVE**, com **49 arquivos de runtime conferidos por hash em cada fonte implantada**, envs fiscais e bindings de secrets preservados. API financeira permaneceu em **api-00066-juj**, inclusive updateTime inalterado. Nenhum deploy de API, provider, Rules, worker ou outros exports. Ambos os novos callables rejeitaram acesso anônimo com **401**, sem escrita. [Verificação Functions](evidence/admin-order-full-edit-functions-dev.json).

Hosting DEV publicado de `.deploy-crm-store-baseline-15138ff3`: **60/60 hashes remotos**, **26 fontes de sourcemap e 51 fontes públicas** conferidas; HTML/scripts estáveis com revalidação e assets hash immutable. Bundle **main.45b40f01.js**, CSS **main.436906ef.css**. [Verificação Hosting](evidence/admin-order-full-edit-hosting-dev.json).

Stages Functions `.deploy-admin-order-edit-15138ff3-1/2/3`; logs locais `%TEMP%/admin-order-edit-functions-deploy.log`, `%TEMP%/admin-order-edit-functions-verify.log`, `%TEMP%/admin-order-edit-hosting-deploy.log`, `%TEMP%/admin-order-edit-hosting-verify.log`. Configuração sensível permanece somente local, fora dos documentos e do Git.

## Homologação autenticada — PASS

Usuário respondeu **PASS** à solicitação consolidada: formulário completo e Histórico de alterações, ações Editar Pedido/Atualizar Status independentes, desktop/mobile 390×800 e proteções de cliente vinculado/método confirmado quando aplicáveis. Verificação somente visual/navegação, com cancelamento, sem solicitar mutações reais. As gravações e seus efeitos continuam comprovados pelos testes com fixtures/emuladores; o aceite humano não equivale a pagamento ou emissão fiscal real. [Aceite registrado](evidence/admin-order-full-edit-manual-acceptance-dev.json).

Histórico pode estar vazio antes da primeira edição pela nova trilha; registros anteriores não são inventados nem migrados. A pendência fiscal/autenticada anterior não é encerrada automaticamente por esta entrega técnica.

Não alterar o pedido real e44896d8… apenas para testar. Este fechamento se baseia no novo PASS autenticado da edição completa, além do PASS visual anterior do modal de status. Não há trabalho pendente neste ajuste; pendências fiscais anteriores permanecem separadas. Fechamento somente documental, sem runtime/build/deploy adicional.

Percentuais formais preservados: **Fase9 75%, Fase11/12 100%, Global 95,00%, Fase13 0%**. Mercado Pago futuro. PROD intacta.
