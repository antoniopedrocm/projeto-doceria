# Checkout por modalidade de acesso — implementação local DEV

> Autorização posterior de 08/11/2026: o Dono solicitou publicar no DEV para testar. Preparação de commit/push e deploy limitado a API+Hosting `crmdoceria-9959e`, reutilizando os testes/build e hashes validados abaixo. O estado local anterior é histórico; nenhuma cobrança real foi autorizada.

08/11/2026. Base `dec8cff6`, branch `feature/infinitepay-customer-auth`, worktree `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. O checkpoint e o tracked limpo foram conferidos antes de modificar. Artefatos untracked antigos preservados. Esta missão autoriza código/testes/documentação locais; **não autoriza commit, push, deploy, credenciais ou dados remotos**.

## Compatibilidade oficial: bloqueio comprovado

Consultados em 08/11/2026: [documentação oficial do Checkout](https://www.infinitepay.io/checkout-documentacao), seções `payment_methods_enabled` e “Posso aceitar só Pix ou desativar o cartão?”, e [Central de Ajuda oficial](https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay).

A documentação afirma: “O cartão fica sempre ligado. Só o Pix pode ser ligado ou desligado.” Os valores são `credit_card` e `pix`; `options` exige `X-Api-Key` server-side. **Não é documentado suporte Pix-only nesse produto. Enviar `['pix']` não comprova desativação de cartão.** A confirmação de 06/11 sobre existência de options/API Key não prometia essa restrição. Não foi feito POST ao provider para experimentá-la: não existe sandbox documentado.

Consequência: foi implementado o fallback seguro expressamente solicitado, sem simular Pix-only. Ter uma chave `inchk_` não resolve a limitação. Nenhuma chave real foi consultada, criada ou provisionada; não foi adicionado armazenamento, header ou campo de segredo ao cliente. Se o provider documentar mudança futura, será necessária nova revisão do contrato e da configuração privada por merchant/loja; não há flag local que libere isso hoje.

## Antes e depois

| Acesso efetivamente selecionado | Antes | Código local novo |
|---|---|---|
| Visitante (`guest`) | Online Pix/cartão + Combinar | “Pagar Agora — Pix” visível, desabilitado; aviso explícito; Combinar selecionado e funcional. Cobrança online nova negada. |
| Google/e-mail (`strong_auth`) | Online Pix/cartão + Combinar | Preservado, inclusive padrão online e conta/Customer autorizados. |
| Continuar com celular (`legacy_phone`) | Após lookup válido: Online Pix/cartão + Combinar | Preservado. Associação comercial por contexto de telefone continua separada de Auth/acesso privado. |

O visitante continua preenchendo nome/telefone/endereço, sem convite ou botões Google/e-mail no formulário de entrega. Combinar não chama gateway, não marca PAID e mantém método indefinido/pendente, consentimento e resumo WhatsApp existentes. O banner de indisponibilidade permanece visível com Combinar selecionado. O padrão mudou para Combinar somente no Guest, para não selecionar uma alternativa inexequível.

## Enforcement e preservação

- `functions/checkout-payment-access.js`: política central `assertOnlinePaymentAccess`, baseada no modo estabelecido pelo servidor; Guest recebe HTTP403 + `GUEST_PIX_ONLY_UNAVAILABLE`.
- `/checkout/confirmar`: usa contexto persistido/token/loja/revisão existentes, não `mode` ou `options` declarados pelo browser. Aplica o bloqueio antes de config financeira, transação de pedido, estoque, reserva e link. Login Strong ambiente não promove uma compra explicitamente Guest. Após rejeição, a mesma chave pode concluir Combinar.
- `createPaymentService.start`: valida novamente prova/contexto/loja/revisão e bloqueia criação de link Guest sem URL já registrada. Nenhum `linkState=CREATING` é gravado nesse bloqueio.
- Links históricos já emitidos, PAID, receipts e capabilities de consulta/reconciliação mantêm o contrato anterior. **Links antigos podem continuar oferecendo cartão**; não há cancelamento por API e não foram alterados ou recriados. A nova política protege novas cobranças; não finge restringir URLs antigas no provider.
- Frontend distingue o label Guest no helper compartilhado e mantém a opção online desabilitada, mesmo quando a loja possui pagamento online habilitado. Um DOM adulterado não é autoridade: o backend nega. O erro controlado não vira bloqueio permanente do pedido.
- Merchant persistido, storeId, valores/frete/cupom/estoque e mapeamentos não foram alterados. Webhooks, `/payment_check`, conciliação e guardas de idempotência permanecem. Nenhuma modificação em Auth, Customer canônico, aliases, SMS, C15/C16, Rules ou histórico.

## Arquivos

Runtime:

- `functions/checkout-payment-access.js` (novo).
- `functions/index.js`, `functions/checkout-payment.js`.
- `crm/public/checkout-payment-choice.mjs`, `crm/public/cardapio.html`.
- `crm/public/cardapio-matriz.html`, `cardapio-garavelo.html`, `cardapio-festa.html`: aliases gerados pelo sincronizador existente, sem lógica específica de loja.

Testes/revisão:

- `functions/checkout-payment-access.test.js` (novo), `checkout-http.test.js`, `guest-checkout-emulator.test.js`.
- `crm/tests/checkout-payment-choice.test.mjs`, `guest-checkout-payment.test.mjs`, `guest-checkout-visual-review.cjs`.
- Este relatório, contrato técnico, checkpoint e `docs/evidence/auth-payment-access-local/`.

Testes antigos que criavam cobrança Guest nova foram ajustados ao requisito novo. A preservação de pagamento Guest antigo é validada com fixture histórica sintética, explicitamente sem caminho alternativo de runtime. Os mocks não são utilizados como prova de suporte Pix-only no provider.

## Qualidade e próximos passos

[Evidência local e hashes](evidence/auth-payment-access-local/validation.json): **261 testes distintos PASS / 0 falhas finais** — 110 públicos/navegação, 54 unitários/telefone/WhatsApp/Auth, 97 emulados (9 suítes). HTTP 37, Guest service 2, financeiros 15, contrato 20, checkout 9, reserva 9, configurações 3, regras AGREED 1 e regras de identidade 1. Não somar rodadas anteriores nem reexecuções. Quatro falhas iniciais de preparação de fixtures históricas/frete/segunda loja foram corrigidas nos testes, preservando as guardas; a rodada completa posterior passou.

Provas: Auth Google simulado pelo emulador e e-mail/senha mantêm online; Auth ambiente não promove Guest; parâmetros forjados/flags/chave sintética/opções por outra loja não liberam cartão; a rejeição não grava pedido/pagamento/link nem baixa estoque; Combinar permite retry/concorrência sem duplicidade e sem associação privada pelo telefone; consulta/PAID histórico continua exigindo `/payment_check`. Mocks de provider/Maps, dados sintéticos, somente localhost/projetos demo. Emuladores encerrados.

Build DEV **PASS** após confirmar workspace físico/`crmdoceria-9959e`, serial (2 workers/heap 2048 MB, sem desabilitar checks). Bundle `main.e4b94788.js` **456,38 kB gzip**, inalterado; sem novas dependências. 5/5 públicos alterados fonte/build conferidos e aliases idênticos. Avisos preexistentes native-audio/Browserslist/baseline preservados. Lint do delta **PASS**: 10 arquivos/6 scripts inline, zero diagnósticos novos; 6 diagnósticos anteriores de `index.js` permanecem. Diff-check **PASS**.

[Revisão visual sintética](evidence/auth-payment-access-local/visual-review.json): **1920×889 e 390×800 PASS**, 4 capturas, sem serviço externo, overflow horizontal ou botão cortado. Mantido o scroll do modal longo existente. [Desktop](evidence/auth-payment-access-local/agreed_later-1920.png), [mobile](evidence/auth-payment-access-local/agreed_later-390.png).

O cenário de sucesso Pix-only real permanece **BLOQUEADO POR CONTRATO**, não PASS e não simulado como implementado. Homologação de DEV publicado também pendente.

Para publicar este fallback após revisão: API e Hosting DEV em conjunto, incluindo o novo módulo backend. Nenhum deploy executado nesta missão. Não há necessidade de provisionar chave apenas para este bloqueio. Antes de prometer Pix-only ao visitante será necessária capacidade oficial que efetivamente exclua cartão, ou nova decisão de produto/provedor fora desta tarefa.

**Fase 9 100% formal histórico; Fase 10 87,50%; global formal 97,00%; Fase 13 0%; PROD READY NÃO.** Sem acréscimo por código/testes locais. Nenhuma cobrança, pedido real, SMS, vínculo, WhatsApp ou acesso PROD.
