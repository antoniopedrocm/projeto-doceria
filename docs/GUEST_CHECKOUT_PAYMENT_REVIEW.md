# Checkout “Continuar como visitante” — dependência e proposta local

> **Estado posterior em 07/11/2026:** Dono respondeu “Autorizar backend seguro + UI local”. [Implementação local e testes concluídos](GUEST_CHECKOUT_PAYMENT_LOCAL.md), sem commit/push/deploy. O diagnóstico e a solicitação de autorização abaixo são históricos; o bloqueio foi alterado somente no escopo Guest aprovado, com prova por contexto e sem acesso Customer por telefone.

## Diagnóstico somente leitura — 07/11/2026

Base `34510679`, com patch local G1/G2/G3 separado. Nenhum componente/validação de visitante alterado nesta análise. Pedido do Dono exige apresentar qualquer bloqueio obrigatório antes de mudar backend.

| Camada | Evidência atual | Consequência |
|---|---|---|
| Entrada | `crm/public/cardapio.html`, handler `continueGuestButton` seleciona `CHECKOUT_MODES.GUEST`; aliases gerados reutilizam o cardápio | Visitante é escolha explícita, independente de Auth ambiente. |
| Formulário | `guest-payment-method` mantém métodos antigos; `handleGuestOrder` envia somente `formaPagamento`, sem novo paymentMode | Trocar apenas rótulos não estabelece os dois fluxos corretamente. |
| Convite | Inicializador cria `data-checkout-strong-invitation` em ambos os formulários | Texto de exigência e botões Google/e-mail aparecem na etapa visitante. |
| Frontend | `checkout-payment-client.js::checkoutHeaders` e `cardapio.html::finalizeOrder` permitem online apenas Strong ou Phone identificado | Remover visualmente o convite não permite finalizar online. |
| Backend | `functions/index.js`, `/checkout/confirmar`: online **ou paymentMode explícito** exige Strong validado ou Phone com ID/hash persistidos | GUEST recebe 403 inclusive ao enviar o novo AGREED_LATER. IDs/mode forjados e token Auth ambiente não substituem a seleção. |
| Serviço de link | `functions/checkout-payment.js::start` aceita strong_auth/legacy_phone e confere contexto/revisão/loja | Não basta retirar um único if no endpoint. |
| Identidade | `functions/checkout-identity.js::select/read` guarda token aleatório por loja, modo/revisão/TTL; GUEST não tem Customer/owner | Não converter silenciosamente visitante em usuário ou usar telefone digitado como prova de titularidade. |

**Bloqueio obrigatório confirmado.** O fluxo Phone existente permite online sem Google/e-mail, porém inclui resolução própria de cadastro. Não reutilizá-lo silenciosamente para revelar/preencher dados privados no formulário de visitante. Cadastro legado/ownership/SMS/grants não devem ser alterados para liberar checkout.

## Proposta mínima sujeita à autorização

1. UI visitante com somente ONLINE_NOW (“Pagar Agora — Pix ou Cartão”) e AGREED_LATER (“Combinar Pagamento”), helper contextual, sem convite de autenticação nessa etapa. Checkout autenticado e escolha inicial Google/e-mail/celular preservados.
2. Tornar GUEST um contexto válido para **criar seu próprio pedido/pagamento**, com token opaco servidor por loja/sessão, revisão, TTL e chave de idempotência; nunca um direito de consultar Customer/histórico. Revisar endpoint, serviço de iniciação e retorno conjuntamente, preservando a validação server-side e isolamento entre contextos.
3. Telefone normalizado e nome/endereço digitados pertencem ao snapshot do novo pedido. Não aceitar Customer ID/owner do browser; não vincular identidade, ler histórico/endereço, fundir/criar Customer duplicado ou promover STRONG apenas com telefone. A associação de legado permanece subordinada aos mecanismos existentes de prova/autorização; compra como visitante não os substitui. Validar impacto de cupom por Customer sem inventar elegibilidade por ausência de identificação.
4. Online segue provider configurado/merchant persistido, reservas e confirmação `/payment_check`; AGREED_LATER não chama provider, método indefinido e pagamento pendente. Frete/preço/cupom/estoque/loja aberta continuam calculados e validados no servidor. WhatsApp e finalização preservam o contrato de consentimento/pagamento.
5. Testes sintéticos antes de entrega: ambos os modos de visitante, telefone novo/existente/conflitante, nenhuma leitura/vínculo privado por telefone, troca de loja/contexto, replay/duplo clique, retorno limitado ao pagamento, erro/retry e regressão Strong/Phone/WhatsApp.

Alcance mínimo previsto: cardápio canônico/aliases gerados, helper/client de pagamento público, handler `/checkout/confirmar`, guarda de iniciação/retorno apenas onde necessário e testes correspondentes. Sem mudança de Firebase Auth, Rules ou provider. O diff exato depende da aprovação e dos testes; não fazer bypass global da proteção atual.

Solicitada aprovação específica da mudança pontual local de backend/UI. **Ainda pendente; não implementar enquanto não houver resposta.** Sem commit/push/deploy ou operações reais. A restrição atual permanece; esta análise não atende ainda ao aceite funcional/visual desejado. Os 20 testes públicos e a suíte HTTP existente passaram preservando o contrato atual, não comprovando um novo checkout visitante online.

Indicadores mantidos: Fase 9 100%, Fase 10 87,50%, global formal 97,00%, Fase 13 0%. PROD não acessada.
