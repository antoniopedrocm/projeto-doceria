# Checkpoint — checkout autenticado / pagamento V1

Workspace: C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree.
Branch: feature/infinitepay-customer-auth. Firebase **crmdoceria-9959e (DEV)**. PROD não autorizada.

## Estado real na retomada e ponto final

**Entrega técnica CONCLUÍDA no DEV. Aceite manual PENDENTE.** Não refazer implementação, testes aprovados ou deploy; não iniciar Mercado Pago antes do aceite.

Commit funcional **2e5d735bc33c5e866ddbc8883a2d1ced098c51be**, enviado ao origin. Nenhuma alteração de runtime após esse commit; a retomada concluiu apenas a publicação que faltava, a verificação remota e a documentação.

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

## Único próximo passo

Aceite manual DEV: confirmar padrão, alternância e helpers no checkout autenticado, sem confirmar pedido/pagamento; conferir o select fiscal em pedido a combinar elegível, caso disponível, sem salvar/emitir nota real. Capturas locais fictícias e testes não devem ser apresentados como aceite autenticado remoto. Registrar PASS/FAIL quando recebido; sem novo deploy na ausência de defeito.

## Percentuais formais

Fase 9 **75%**; Fases 11/12 **100%**; Global **95,00%**; Fase 13 **0%**. Preservados por se tratar de ajuste interno pré-PROD. Mercado Pago não implementado. PROD intacta; nenhum pagamento, nota fiscal, SMS ou WhatsApp real.

[Contrato e base fiscal](AUTHENTICATED_CHECKOUT_PAYMENT_V1.md). [Evidência local](evidence/authenticated-checkout-payment-v1-local.json). [Entrega DEV](evidence/authenticated-checkout-payment-v1-delivery-dev.json). [Hosting](evidence/authenticated-checkout-payment-v1-hosting-dev.json). [Functions](evidence/authenticated-checkout-payment-v1-functions-dev.json).
