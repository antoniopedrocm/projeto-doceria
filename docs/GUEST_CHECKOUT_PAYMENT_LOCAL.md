# Checkout visitante — implementação local DEV

## Autorização e estado

**07/11/2026.** Dono aprovou **“Autorizar backend seguro + UI local”**, após [diagnóstico da dependência](GUEST_CHECKOUT_PAYMENT_REVIEW.md). Base real `34510679c35d81bbbb1ae6d46dbdcd1306f629ae`, branch `feature/infinitepay-customer-auth`, worktree `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. Patch G1/G2/G3 anterior preservado. Sem commit, push, deploy, dado remoto, cobrança, estorno, SMS, vínculo ou PROD.

## Comportamento entregue

- “Informações para Entrega” tem somente **Pagar Agora — Pix ou Cartão** (padrão) e **Combinar Pagamento**, com os helpers já existentes e independentes do formulário autenticado.
- Convite “Para pagar online, entre com Google ou e-mail” e botões Google/e-mail não são inseridos nessa tela. As opções de autenticação da entrada e o checkout identificado permanecem.
- Nome, telefone e endereço digitados compõem o novo pedido. Botão **Confirmar Pedido** com guarda de duplo clique e liberação após erro; retry reutiliza a tentativa.
- ONLINE_NOW usa o provider já configurado, reservas e `/payment_check`; não abre WhatsApp antes da confirmação online. AGREED_LATER cria pedido pendente, método indefinido, sem gateway, preservando a mensagem para a loja e o consentimento facultativo.
- Backend aceita GUEST somente com contexto aleatório emitido pelo servidor, loja/revisão/TTL válidos e paymentMode explícito. Idempotência tem namespace guest por contexto/loja; replay reaproveita pedido/link sem movimentar estoque novamente.

## Fronteira de segurança

Telefone normalizado com `normalizePhoneNumber`/`normalizeCustomerPhone` existentes; snapshot nacional no pedido e E.164 no prefill InfinitePay. **Telefone digitado não comprova titularidade.** `cliente.id` forjado é descartado; `clienteId`, `ownerUid` e Customer do contexto continuam nulos. Nenhum Customer, alias, mapping ou ownership é criado/alterado, mesmo usando telefone de cadastro existente ou com sessão Staff/Customer ambiente. Nome/e-mail/endereços privados não são carregados para prefill; só os dados informados pelo visitante. Google/e-mail/SMS/grants/recuperação segura de legado não foram alterados.

O token de retorno já existente autoriza somente aquele pagamento e expira; não abre Customer, histórico ou endereço. Outro contexto, outra loja, revisão antiga, contexto demovido/expirado e ausência de token não iniciam link. PAID continua dependendo de consulta server-side; dados financeiros do browser/webhook não são autoridade.

Preço, subtotal, frete, estoque, disponibilidade da loja/fulfillment e cupom continuam validados no servidor. **Cupons por cliente não podem ser herdados para visitante:** a troca explícita limpa o cupom selecionado e o backend recusa cupom nesse novo contrato sem identificação. Nenhuma elegibilidade por Customer é presumida pelo telefone. Identificação/cupom dos fluxos Strong/Phone permanece igual. Pedidos anônimos históricos sem paymentMode mantêm compatibilidade; não foram migrados.

Compra como visitante não concede acesso privado nem vincula automaticamente esse novo pedido ao histórico de um Customer só pelo telefone. A recuperação legítima continua nos mecanismos existentes, fora desta compra. Não foi criada carteira, login anônimo novo, provider ou API de pagamento.

## Arquivos deste complemento

| Arquivo | Alteração |
|---|---|
| `functions/index.js` | Validação Guest restrita ao pedido, telefone/nome, modo/idempotência, bloqueio de cupom sem identificação, snapshot sem Customer. |
| `functions/checkout-payment.js` | Iniciação Guest com prova exata de contexto/revisão/loja, preservando G1 e demais guardas. |
| `crm/public/cardapio.html` | Select/labels/helpers, remoção do convite no formulário visitante, submissão dos modos, guarda de clique e fluxo de confirmação. |
| `crm/public/cardapio-matriz.html`, `cardapio-garavelo.html`, `cardapio-festa.html` | Cópias de compatibilidade geradas pelo sincronizador existente; idênticas ao canônico. |
| `crm/public/checkout-payment-client.js` | Guest não depende de Auth pronto nem envia Auth ambiente; sincroniza duas opções. |
| `crm/public/checkout-payment-choice.mjs` | Reutiliza opções/helpers, distingue variante Guest e preserva variante autenticada. |
| `functions/checkout-http.test.js`, `guest-checkout-emulator.test.js` (novo) | Contratos Guest, isolamento, idempotência, telefone/Customer, erro de provider e regressões HTTP. |
| `functions/whatsapp-checkout.test.js` | Fixture de assertFulfillment e contexto explícito para preservar testes isolados de consentimento/frete. |
| `crm/tests/checkout-payment-choice.test.mjs`, `guest-checkout-payment.test.mjs` (novo) | Headers sem Auth, handlers reais, duas escolhas, consentimento, validação, duplo clique/retry. |
| `crm/tests/guest-checkout-visual-review.cjs` (novo) | Revisão local reproduzível com template/CSS reais e contato fictício, sem serviços. |
| Este documento, checkpoint, diagnóstico anterior e `docs/evidence/guest-checkout-local/` | Estado, resultados, capturas e limites. |

## Testes e qualidade

**182 testes distintos PASS / 0 falhas finais**, incluindo a regressão do patch G1/G2/G3; não somar os 142 da rodada anterior:

| Grupo | Quantidade |
|---|---:|
| Unitários de pagamento/contrato/provider/retorno/reserva (7 arquivos) | 23 |
| Emuladores Auth/Firestore locais (9 arquivos) | 91 |
| Públicos: identidade, endereços, escolhas e handler Guest real (4 arquivos) | 26 |
| WhatsApp checkout/resumo (2 arquivos, mocks) | 24 |
| React conciliação/reconhecimento financeiro (3 arquivos) | 18 |

Integração: checkout-http **31**, guest-checkout-emulator **2**, payment-financial-events-emulator **15**, payment-contract-emulator **20**, checkout-emulator **9**, checkout-reservation-emulator **9**, payment-settings-emulator **3**, agreed-payment-rules **1**, checkout-identity-rules **1**. Só 127.0.0.1:8080/9099, projeto `demo-doceria-checkout`, Rules/contexto adicional `demo-checkout-identity-rules`; Firestore STANDARD. Provider/Maps em mocks. Runner limpa apenas a base demo local própria entre suítes; reexecução inicial sem esse reset expôs estado residual sintético, não regressão de runtime. Fixture HTTP passou a omitir Authorization quando não há bearer (em vez de Bearer null). Teste isolado WhatsApp ganhou o double de fulfillment já exigido pelo helper preexistente e o contexto Guest agora explícito. Nenhuma proteção real foi retirada para passar teste.

Provas principais: telefone novo/existente e três formatos com E.164 consistente, Customer/identidades/quantidade de cadastros inalterados, ID privado ignorado, sem e-mail herdado, retorno sem dados pessoais, rejeição de token cruzado/loja/revisão/endereço salvo/cupom, dois envios sem duplicidade, erro ambíguo sem segunda criação, PAID via consulta oficial e receipt único. Identificado Strong/Phone continua passando nos mesmos testes HTTP e públicos.

Build CRA **PASS** após guard de workspace/Project ID `crmdoceria-9959e`; bundle principal `main.e4b94788.js`, **456,38 kB gzip**, sem aumento em relação ao G1/G2/G3. Alterações públicas não entram nesse bundle: conferidos **6/6 arquivos públicos fonte/build** e aliases idênticos. Parser verificou os **6 scripts inline** do cardápio. Avisos existentes de sourcemaps native-audio e bases Browserslist/baseline permanecem; nenhuma dependência da aplicação foi adicionada.

Lint de 16 arquivos backend/públicos/testes: **0 erros/avisos novos**; `index.js` conserva **6 diagnósticos anteriores**, comparados ao HEAD sob a mesma configuração. React dos dois arquivos G3 preservado com 0 erros/avisos. Política/restrição de loops intencionais existente está no relatório G1/G2/G3. Diff-check **PASS**.

## Revisão visual e limites

[Quatro cenários de apresentação PASS](evidence/guest-checkout-local/visual-review.json): ONLINE_NOW/AGREED_LATER em **1920×889** e **390×800**, mais duas capturas do início do formulário. Template/CSS reais, nomes/endereço/telefone fictícios, zero serviço externo. Sem overflow horizontal ou sobreposição/corte do botão de confirmação. Mantido o scroll existente do modal longo de endereço; não foi criado um scroll adicional. Revisão visual local não é aceite do DEV publicado. Ferramenta playwright-core instalada somente em TEMP, fora do app/bundle.

Capturas: [desktop — combinar](evidence/guest-checkout-local/agreed_later-1920.png), [mobile — pagar agora](evidence/guest-checkout-local/online_now-390.png), [mobile — dados](evidence/guest-checkout-local/contact-390.png).

## Próximo ponto

Revisão do Dono antes de commit/push/deploy. Publicação DEV precisará de API/Functions pertinentes e Hosting em conjunto; **não realizada**. Depois homologar o modal/seleção no DEV sem cobrança real. Não tratar mocks/capturas como compra ou homologação remota. G1/G2/G3 continuam preservados, aguardando o mesmo gate de revisão/publicação. C15/C16 não foram repetidos.

**Fase 9 100% formal histórico; Fase 10 87,50% (14/16); global formal 97,00%; Fase 13 0%; PROD READY: NÃO.** Sem incremento por este complemento local.
