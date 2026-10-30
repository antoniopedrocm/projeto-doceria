# Checkpoint — checkout autenticado / pagamento V1

Workspace: C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree.
Branch: feature/infinitepay-customer-auth. Firebase **crmdoceria-9959e (DEV)**. PROD não autorizada.

## Estado real na retomada e ponto final

**Homologação em andamento: UI PASS; integração fiscal ainda PENDENTE.** O aceite trouxe um bloqueio na atualização operacional do pedido pago. A fila fiscal e o método do pagamento foram auditados; ver correção abaixo. Não iniciar Mercado Pago antes do aceite.

Entrega original: commit funcional **2e5d735bc33c5e866ddbc8883a2d1ced098c51be**, enviado ao origin. Os itens seguintes registram a verificação dessa entrega original; a correção complementar tem registro separado abaixo.

- Testes aprovados: 30 fiscais/unitários, 59 regressões, 28 integração checkout/fiscal, 27 contratos financeiros/Rules e 28 React. São grupos com regressões repetidas, não uma contagem de casos únicos.
- Build PASS (avisos preexistentes native-audio/Browserslist). Lint sem erros: 65 avisos preexistentes de App.js, comparação com baseline sem aviso novo. Diff-check PASS.
- Primeiro lote publicado: api, fiscalIssueInvoice, fiscalValidateOrder. Segundo lote publicado: fiscalIssueDraft, fiscalCheckDraft, fiscalResolveOrderPaymentMethod. **Seis ACTIVE**, 48 fontes de runtime correspondentes por função, configurações de aplicação e bindings de secrets preservados.
- A primeira tentativa do segundo lote falhou antes do upload (descoberta local da CLI em 10 s). Repetição com FUNCTIONS_DISCOVERY_TIMEOUT=60 somente no processo local concluiu com Deploy complete/exit 0. Nenhuma mudança de runtime para esse ajuste de ferramenta.
- Hosting publicado: **60/60 hashes** correspondentes; 51 fontes públicas e 19 fontes de sourcemap verificadas. HTML/módulos/worker com revalidação, assets hash com immutable.
- Novo callable fiscal sem autenticação: **401**, sem gravação. Nenhuma Rule, índice, trigger ou scheduler foi publicado.

## Contrato entregue

STRONG_AUTH: **Pagar Agora — Pix ou Cartão** por padrão, ou **Combinar Pagamento**. Helpers contextuais e bloqueio de envio simultâneo. Guest/LEGACY_PHONE preservados.

ONLINE_NOW conserva o fluxo online atual e payment_status do provider. AGREED_LATER cria pedido offline válido com paymentMethod null e paymentStatus PENDING, sem link ou recebimento pago. Estoque/cupom seguem o caminho offline existente, com idempotência transacional.

Na Nota Fiscal, método ainda não definido exige seleção Staff em Salvar e Validar. Usa mappings existentes, persiste método/data/fonte/UID e audita, sem liquidar pagamento. Provedor confirmado é autoridade e não aceita override manual silencioso. Rascunhos e métodos históricos preservados na base fiscal efetivamente publicada.

## Retorno da homologação e correção complementar

UI das duas opções e padrão aprovados pelo usuário. Não repetir esse aceite. O pedido real `e44896d8…`, Matriz, 29/10/2026 23:04:19 UTC−3, está ONLINE_NOW/PIX/PAID/CONFIRMED, mas operacionalmente Pendente e sem aprovação fiscal. A fila exige Finalizado/Aprovado ou aprovação explícita; não filtra paymentMethod. Data e loja estão corretas.

Ao tentar atualizar o status no CRM, o usuário recebeu permission-denied. O modal de edição completa reconstruía itens e revalidava valores do pedido pago. As Rules corretamente recusam a alteração do snapshot financeiro. Implementada atualização operacional isolada, transacional e auditada no frontend, preservando essas Rules, o estoque já movimentado e o método do provider. [Diagnóstico e testes específicos](FISCAL_ORDER_STATUS_AUDIT.md). Commit funcional **21fbd58d99ac94a9bdbcd8478cab060f1ffb49b5**, push na branch feature/infinitepay-customer-auth e **Hosting DEV publicado** (CLI exit 0). Verificação remota **60/60 hashes**, 23 fontes de sourcemap e 51 fontes públicas; revalidação de HTML e immutable em assets preservados. [Evidência Hosting](evidence/fiscal-order-status-hosting-dev.json). Nenhuma Function ou Rule publicada. Pedido real intacto. **Correção técnica entregue; homologação fiscal manual PENDENTE**.

Próximo aceite: conferir o novo formulário de status do pedido online sem emitir nota. A entrada efetiva na fila depende de o pedido ser legitimamente finalizado/aprovado; não alterar o pedido apenas para teste. Usar fixture local para provar essa passagem sem mutações reais. Seleção fiscal AGREED_LATER segue pendente de exemplo elegível/aceite, sem salvar ou emitir nota real. Capturas e testes fictícios não equivalem a aceite manual remoto.

## Percentuais formais

Fase 9 **75%**; Fases 11/12 **100%**; Global **95,00%**; Fase 13 **0%**. Preservados por se tratar de ajuste interno pré-PROD. Mercado Pago não implementado. PROD intacta; nenhum pagamento, nota fiscal, SMS ou WhatsApp real.

[Contrato e base fiscal](AUTHENTICATED_CHECKOUT_PAYMENT_V1.md). [Evidência local](evidence/authenticated-checkout-payment-v1-local.json). [Entrega DEV](evidence/authenticated-checkout-payment-v1-delivery-dev.json). [Hosting](evidence/authenticated-checkout-payment-v1-hosting-dev.json). [Functions](evidence/authenticated-checkout-payment-v1-functions-dev.json).
