# InfinitePay G1/G2/G3 — implementação local para revisão

> Atualização posterior: publicação DEV autorizada e concluída no artefato `d87174b6`, juntamente com checkout visitante. [Registro](GUEST_CHECKOUT_DEV_RELEASE.md). Os 142 testes abaixo são a rodada local inicial; a rodada integrada posterior teve 182 testes distintos PASS, sem somá-los. Publicação não equivale a aceite manual ou operação financeira real.

## Estado e limites — 07/11/2026

Base conferida: `34510679c35d81bbbb1ae6d46dbdcd1306f629ae`, branch `feature/infinitepay-customer-auth`, worktree `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. Autorização específica do Dono: código/testes/documentação locais; **parar antes de commit, push e deploy**. Diretório pai e untracked anteriores preservados.

Guard de build confirmou workspace DEV e Project ID `crmdoceria-9959e`. Testes de persistência usaram exclusivamente Auth/Firestore locais `demo-doceria-checkout`, 127.0.0.1:9099/8080, edition STANDARD. Provider HTTP e dados sintéticos; nenhuma cobrança, refund, SMS, vínculo, operação remota ou acesso PROD.

## Antes → depois

| Gap | Antes | Correção local |
|---|---|---|
| G1 | Novos links enviavam `webhook_url`, somente aprovação | Enviam `webhook: {url, events}` com created, paid, settled, canceled, refunded, payment_failed, expired e overdue. Snapshot privado `webhookMode/webhookEvents` na tentativa. URL/merchant/montante persistidos preservados. Link existente é reutilizado sem recriação/backfill. Sem options/API Key nova. |
| G2 | expired/overdue ficavam HOLD/log | Reconhecimento explícito e evento imutável por loja, disposition `INFORMATIONAL_UNVERIFIED`, fingerprint idempotente. Sem cancelar pedido, liberar reserva, alterar cupom, financeiro ou WhatsApp. |
| G3 | Registro genérico de refund podia ser interpretado como integral | UI exige escopo Integral e atesto explícito; backend exige `refundScope: FULL` no registro e no match. Parcial/desconhecido/ausente não produz registro apto a conciliar integralmente. Evento permanece pendente para revisão administrativa. |

Pagamento aprovado continua exigindo `/payment_check` server-side. Payload anônimo, redirect e `paid:false` não viram prova de estorno/cancelamento/liquidação. Nenhuma API de refund foi criada.

Histórico: operações já conciliadas são preservadas e replays não as reescrevem. Operação histórica ainda pendente sem escopo explícito fica bloqueada para match integral; registrar novamente a mesma operação também não a promove. Regularização desses casos exige decisão/fluxo administrativo futuro, sem migração automática nesta entrega.

## Arquivos funcionais e testes

- `functions/checkout-payment.js`: assinatura dos novos links/snapshot.
- `functions/payment-signal-policy.js`: oito eventos documentados.
- `functions/payment-financial-events.js`: atesto integral no registro e conciliação; auditoria/ledger com escopo.
- `crm/src/components/PaymentReconciliation.js`: seleção e confirmação explícita de integral; mudança de escopo/operação retira atesto; dupla submissão continua protegida.
- `functions/payment-webhook-payload.test.js` (novo), `payment-signal-policy.test.js`, `payment-financial-events-emulator.test.js`, `checkout-http.test.js`, `checkout-emulator.test.js` e `crm/src/components/PaymentReconciliation.test.js`: cobertura e fixtures de regressão.

## Verificação local

**142 testes distintos PASS**, sem somar retestes ou os 1.120 históricos:

| Grupo | Arquivos | PASS |
|---|---|---:|
| Unitários Node | payment-webhook-payload, payment-signal-policy, checkout-payment, payment-verification, payment-return-auth, checkout-reservation, infinitepay-diagnostics | 23 |
| Integração local | payment-financial-events-emulator (15), payment-contract-emulator (20), checkout-http (24), checkout-emulator (9), checkout-reservation-emulator (9), payment-settings-emulator (3), agreed-payment-rules (1) | 81 |
| React | PaymentReconciliation (7), crmReconciliation, orderFinancialRecognition | 18 |
| Cardápio público | checkout-payment-choice, checkout-identity, checkout-addresses | 20 |

Cobertura: oito eventos/paid obrigatório, links antigos, duas lojas/merchants, criação ambígua/concorrente, PAID verificado, eventos duplicados/fora de ordem/forjados, expiração local separada de aviso remoto, refund FULL/PARTIAL/UNKNOWN/ausente, histórico matched/unmatched, autorização HTTP (401/403), isolamento por loja, estoque/cupom sem duplicidade e Auth/PHONE/GUEST sem promoção indevida. WhatsApp usa testes/mocks existentes; não enviado.

Duas expectativas de `checkout-emulator.test.js` falharam também com `checkout-payment.js` do commit-base: gerente sintético sem `lojaIds` e exigência de duas consultas apesar da coalescência. Fixtures corrigidas: atribuição explícita de loja e asserção de consulta obrigatória/receipt único/replay sem consulta adicional. Nenhuma alteração de Rules/autorização para fazê-las passar. Reteste final 9/9 PASS. Mock de crypto no teste React ajustado ao JSDOM; runtime não alterado por isso.

Build CRA DEV: **PASS**, `main.e4b94788.js`, 456,38 kB gzip (+313 B). Avisos existentes: quatro sourcemaps ausentes do native-audio e bases Browserslist/baseline antigas; dependências não atualizadas. Lint dos 10 arquivos JS de runtime/teste alterados: **0 erros, 0 avisos**, configuração React existente; backend eslint:recommended/Node ES2022 com loops constantes intencionais permitidos (paginação `while(true)` preexistente). Diff-check PASS.

[Evidência resumida](evidence/infinitepay-g123-local-validation.json). [Auditoria original preservada](INFINITEPAY_CONTRACT_AUDIT_2026-11-06.md).

## Revisão e próximo passo

Deploy DEV de API/Functions pertinentes e Hosting será necessário para disponibilizar backend/UI; **não executado nem autorizado nesta entrega**. Commit e push também não realizados. Payloads reais detalhados dos oito eventos continuam parcialmente documentados pelo provider; a cobertura é sintética, sem alegar homologação real ou autenticação do webhook. Links antigos continuam com a inscrição original.

Separadamente, [checkout de visitante](GUEST_CHECKOUT_PAYMENT_REVIEW.md) tem dependência obrigatória comprovada; nenhuma mudança desse fluxo foi feita sem aprovação da proposta de backend.

Fase 9 **100% formal histórico**, complementos G1/G2/G3 locais aguardando revisão/publicação/aceite; Fase 10 **87,50% (14/16)**, C15/C16 preservados; global formal **97,00%**; Fase 13 **0%**; **PROD READY: NÃO**. Testes locais não aumentam percentuais.
