# Auditoria DEV — comprador recorrente / InfinitePay (29/10/2026)

Ambiente exclusivo: worktree `C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, Firebase `crmdoceria-9959e`. PROD não autorizada. Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%, preservados.

## Decisão atual — resposta do suporte e aprovação do usuário

**Caso encerrado como limitação do Checkout Integrado**, conforme resposta do suporte InfinitePay encaminhada pelo usuário em29/10/2026. O suporte informou que salvamento/preenchimento automático de cartão não está disponível no produto `api.checkout.infinitepay.io/links`, não há toggle ou campo de payload para habilitá-lo e a ausência da opção é o comportamento esperado. Essa confirmação é atribuída ao e-mail fornecido pelo usuário; não é resultado de consulta privada automatizada ao provedor.

O usuário aprovou manter a integração atual, retirar a promessa de cartões salvos da Área do Cliente, preservar o prefill canônico e adiar a funcionalidade para uma melhoria futura. Não criar wallet/tokenização/proxy PCI, não migrar para outro produto/provedor e não enviar feedback/mensagem automaticamente. O artigo genérico de Link de Pagamento não é contrato de disponibilidade desse recurso no Checkout Integrado. As etapas abaixo preservam o histórico técnico da investigação.

## Resultado do caso informado

Foram encontrados os dois pedidos exatos:

- Anterior: `f8b651b1c6259ba3509af7883b1473df5f6c895aa2b56ea709b5c6ad7c320760`.
- Novo: `436a7309fab910935aec0e5025be26764a547db326a7334e871ace8dbec6a7c4`.

| Campo | Comparação |
|---|---|
| Customer de origem e canônico | Mesmos IDs; ambos C02, sem escolher alias pela ordem dos documentos |
| storeId | `ana-guimaraes-doceria-matriz` nos dois |
| ownerUid | Ownership aprovado para o Customer canônico nos dois; valores não publicados |
| customer.phone_number | Presente, byte a byte igual e correspondente ao telefone canônico nos dois |
| Formato | E.164, `+55` + DDD + número; não houve alternância para formato nacional |
| customer.name / customer.email | Ambos presentes e exatamente iguais entre os dois; valores omitidos |
| handle | Mesmo valor persistido; não publicado |
| API Key | O provider implantado usa Content-Type e handle; não envia X-Api-Key, não consulta nem publica secrets |
| Endpoint | `POST https://api.checkout.infinitepay.io/links` nos dois, conforme código de criação conferido |
| order_nsu | Diferente por pedido, igual ao paymentId/orderId de cada registro; esperado |
| items | Mesma quantidade/valor (1 item agregado de100 centavos); descrição contém o ID de cada pedido e por isso difere |
| Configuração | sendCustomerData=true e sendDeliveryAddress=true nos dois; flags internas, não opções de salvar cartão |
| address | Ausente nos dois |
| redirect_url / webhook_url | Mesmos valores; URLs não publicadas |
| Transação / slug | Anterior possui ambos, correspondentes ao recibo; novo ainda sem ambos e PENDING |

Anterior: payment_status=PAID, recibo outcome=CONFIRMED, captureMethod=credit_card, amount=100 e paidAmount=105, transactionNsu/slug do recibo iguais aos do pagamento. A reconciliação existente só produz CONFIRMED após a resposta verificada com success=true/paid=true, valor e método válidos. A resposta bruta paid=true não é persistida: essa conclusão vem do contrato de reconciliação e recibo local, não de nova consulta ao provedor. Novo: PENDING/linkState=READY, sem recibo de aprovação. A falta de transação/slug enquanto ainda não aprovado não prova defeito de reconhecimento.

**Não foi encontrada divergência relevante de identidade entre estes dois links. O suporte esclareceu que o recurso não existe no Checkout Integrado usado nesses pedidos.** O relato de ausência do botão é coerente com essa limitação; não atribuir o problema ao cliente por recusar ou não confirmar salvamento. Nosso banco não expõe o estado de outros produtos do provedor. A dúvida específica de disponibilidade está encerrada pela resposta recebida, sem novo pagamento ou envio automático de mensagem ao suporte.

## Base oficial e limites

- [Documentação de integração InfinitePay](https://www.infinitepay.io/checkout-documentacao): customer opcional com name/email/phone_number e exemplo internacional +55. Sem parâmetro local documentado saveCard ou carteira de cartão nesta integração.
- [Ajuda oficial sobre preenchimento automático](https://ajuda.infinitepay.io/pt-BR/articles/15503348-como-ativar-o-preenchimento-automatico-de-dados-no-link-de-pagamento): salvamento é opcional e depende da confirmação do cliente; compras seguintes usam o mesmo telefone e código do próprio provedor. Os cartões permanecem sob gerenciamento da InfinitePay.

Leitura Firestore com máscaras de campos, sem PAN/CVV/validade/token de cartão. Comparação de nome/e-mail/telefone/handle feita em memória, saída somente igualdade/presença/formato. A evidência é uma reconstrução a partir dos snapshots persistidos e do código implantado, não captura dos requests HTTP brutos. A fonte da API foi lida do artefato Cloud e conferida contra o baseline a23912fc, revisão api-00064-xux, atualizado em27/10 antes das duas compras. Nenhuma requisição foi feita à InfinitePay, nem mesmo payment_check, durante a auditoria.

Inventário limitado e completo no limite consultado (250):18 Customers e10 checkoutPayments. Todos os10 resolvem para C02 e têm telefone igual ao canônico em E.164, nome/e-mail presentes;9 linkState READY e1 RECONCILIATION_REQUIRED. Não afirmar que a tentativa ambígua chegou ao provedor. Flags atuais de Matriz/Garavelo permitem envio de dados; terceira loja sem configuração de pagamento. [Auditoria sanitizada](evidence/infinitepay-prefill-audit-dev-2026-10-29.json), [comparação](evidence/infinitepay-recurring-comparison-dev-2026-10-29.json).

## Fragilidade independente encontrada e correção restrita

Antes: `/checkout/confirmar` validava o Customer canônico/ownership, mas chamava paymentPrefill com nome e telefone do objeto recebido do navegador; o helper duplicava a normalização por regex. Isso permitia variação futura mesmo com identidade autorizada. **Não ocorreu nos dois snapshots analisados e não é apresentado como causa deste caso.**

Depois: a chamada usa `clienteSnap.data()` já lido/autorizado na transação; paymentPrefill usa normalizeCustomerPhone existente, priorizando normalizedPhone, depois phone_number e telefone. O e-mail válido do Auth permanece preferencial; o e-mail canônico disponível é fallback de contato. Nenhum dado extra do Customer é copiado: customer continua restrito a name/email/phone_number. sendCustomerData=false continua sendo respeitado. Não reescreve pedidos, pagamentos ou links históricos; só afeta prefill de novas criações futuras.

Runtime alterado apenas em `functions/index.js` (uma linha de origem do prefill) e `functions/payment-prefill.js`. Não há mudança em payment_check, webhook, máquina de estados, estoque, cupom, Auth, SMS/OTP, Rules ou frontend. Não há wallet/coleção cards, campos de cartão, tokenização ou proxy PCI. A Área do Cliente já contém somente texto informativo e não lista cartões.

## Verificação

- Controle negativo: antes da correção, novo teste HTTP de recorrência por alias falhou ao comparar nome/telefone com o canônico (19 PASS/1 FAIL esperado).
- Depois:20 testes HTTP de integração PASS em Auth/Firestore locais demo-doceria-checkout. Duas compras fictícias com dados diferentes no browser resultam no mesmo telefone canônico e nome do banco no request interceptado; alias é resolvido para o mesmo Customer. Sentinelas PCI falsas não entram no payload/registro de pagamento/pedido. Gateway externo é substituído apenas no processo de teste.
-26 testes unitários PASS: formatos nacionais/internacionais, prioridade canônica, e-mail/opt-out, normalização inválida, autenticação, provider e diagnóstico sem PII. Total46 PASS.
- CommonJS sem etapa de compilação: node --check dos dois arquivos de runtime PASS. Lint dos quatro arquivos alterados PASS; diff-check PASS. Não foi necessário rebuild/Hosting do frontend.
- Zero pagamentos/links/OTP/SMS/WhatsApp reais criados pela auditoria; zero escritas nos documentos DEV. Testes escrevem somente nos emuladores demo.

Commit, push e deploy necessário somente de functions:api concluídos e conferidos, conforme entrega abaixo. O comportamento de cartões salvos do provedor permanece dependente da confirmação de consentimento/OTP; não será criado pagamento real para tentar homologá-lo.


### Entrega técnica —29/10/2026, prefill canônico

Commit **465f0040e584d666304ee62b98d233698e054352**, push DEV concluído. Deploy somente **functions:api(us-central1)** em crmdoceria-9959e, predeploy/workspace conferidos, atualização/Deploy complete/exit0. Fonte do artefato Cloud lida após publicação:45/45 arquivos de runtime iguais ao staging, estado ACTIVE, revisão api-00065-vey. Apenas index.js/payment-prefill.js diferem do baseline; checkout-payment.js/payment_check/webhook/estados/reservas/cupom/Auth permanecem com a mesma fonte. [Evidência](evidence/infinitepay-prefill-delivery-dev-2026-10-29.json).46 testes PASS, controle negativo comprovado, syntax/lint/diff PASS. Sem rebuild/deploy Hosting, Rules ou outras Functions; sem reescrever pedidos/links existentes e sem teste financeiro real.

**Auditoria e correção da origem do prefill CONCLUÍDAS.** O caso dos dois pedidos continua sem divergência de identidade: ambos C02/Matriz, mesmo telefone E.164/nome/e-mail/handle e flags. Falta validar com cliente/InfinitePay o salvamento/OTP do cartão; isso não é inferível do banco e não foi simulado como concluído. OTP do provedor não concede Auth, histórico ou pagamento na nossa aplicação. Sem contato externo com suporte ou envio de mensagens. Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%, PROD intacta.


### Complemento do usuário —29/10/2026: opção de salvamento não apresentada

Relato: “não tinha o botão/opção de salvar o cartão”. Evidência declarada pelo usuário, não captura automatizada da interface da InfinitePay. Não se conclui que o cartão foi salvo, nem que o cliente recusou salvar. O estado interno do provedor continua desconhecido; permanece comprovada somente a consistência da identidade nos nossos registros.

A ajuda oficial descreve oferta de salvamento no Link de Pagamento e diz que não exige ativação pelo lojista. Isso não explica a ausência relatada no checkout específico e não constitui confirmação de disponibilidade/eligibilidade para esta transação do Checkout Integrado. A documentação pública da API consultada não fornece contrato para listar cartões ou forçar a oferta via parâmetro saveCard. Não adicionar flags não documentadas, carteira ou tokenização própria.

Roteiro técnico para validação com o provedor (preparado, não enviado):

1. O salvamento nativo documentado para Link de Pagamento está disponível para links desta conta gerados por POST /links no Checkout Integrado?
2. No pedido f8b651b1…, aprovado com cartão, por que a opção não foi apresentada? Há condição de elegibilidade/interface aplicável a esse pagamento ou ao prefill customer? Não afirmar antecipadamente nenhuma dessas hipóteses.
3. Existe registro interno de oferta/consentimento/ativação para a transação anterior e qual fluxo deveria ser mostrado no link436a7309…? Resposta somente sobre estado do recurso, sem PAN/CVV/validade ou códigos.

Fechamento deste complemento somente documental: sem novo teste financeiro, consulta ao provedor privado, contato com suporte, alteração de runtime, build ou deploy. Correção anterior da origem do prefill permanece implantada; sua homologação local não equivale a resolver a oferta de cartões salvos da InfinitePay. Percentuais/PROD preservados.


## Implementação da decisão aprovada —29/10/2026

Estado atual substitui as hipóteses e o roteiro de consulta das etapas históricas acima: limitação do produto confirmada pelo suporte, decisão aprovada pelo usuário. Mantido Checkout Integrado atual e prefill canônico de465f0040; nenhuma mudança de Auth, pagamento, webhook/payment_check/estoque/cupom ou provider. Texto de Formas de Pagamento alterado para: “Seus pagamentos online são realizados no ambiente seguro da InfinitePay. Não armazenamos os dados do seu cartão.” Removida a promessa de salvar/selecionar/adicionar/remover cartões. Layout e handlers intactos.

**Backlog: cartão salvo — ADIADO / melhoria futura dependente de suporte oficial no Checkout Integrado.** Não é bug aberto nem requisito de implementação local nesta entrega. Uma futura avaliação de troca de produto/provedor exige escopo e decisão próprios, com revalidação de pedidos/idempotência/webhooks/conciliação. A correção de prefill permanece útil para contato/preenchimento de dados e não habilita cartões salvos.

A resposta sobre cartões não encerra pendências de eventos/reembolso da Fase9 nem autoriza PROD. Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%. Não houve submissão ao canal de feedback, contato com suporte, pagamento, SMS ou WhatsApp por ferramentas. A entrega de texto será somente Hosting DEV, com validação DOM e conferência do arquivo publicado; não requer repetir homologação visual completa das páginas já aprovadas.


### Entrega da decisão —29/10/2026: informação de pagamento corrigida

Commit **c1f594c377135f6a83bf4dea6493ee4a419d965a**, push DEV concluído. Deploy somente Hosting crmdoceria-9959e, predeploy/workspace conferidos, release/Deploy complete/exit0.59/59 hashes remotos,17 fontes de sourcemap e50 públicos conferidos; JS/CSS principais, header e outras páginas preservados. Verificação de fronteira confirmou que o controlador difere apenas pela substituição do parágrafo aprovado. Novo texto publicado: “Seus pagamentos online são realizados no ambiente seguro da InfinitePay. Não armazenamos os dados do seu cartão.” [Evidência](evidence/infinitepay-saved-card-policy-dev-2026-10-29.json).

54 testes PASS; build/diff PASS e lint sem erros (1 aviso preexistente no-loop-func no controlador; build mantém avisos native-audio/Browserslist). Teste DOM real com SDK simulado confirma informação e ausência de promessa de gerenciamento de cartões. Não alegar captura visual autenticada; esta alteração textual foi validada pelo DOM e bytes do módulo publicado, sem repetir aceite das páginas aprovadas.

**Decisão aprovada CONCLUÍDA no DEV:** integração mantida, prefill canônico mantido, expectativa de cartão salvo removida e investigação encerrada como limitação informada pelo suporte. Cartão salvo fica adiado no backlog; nenhuma carteira local, migração ou mensagem/feedback ao provedor. Pendências financeiras da Fase9 seguem abertas. Sem Functions/Rules/Auth/backend, dados, pagamento, SMS ou WhatsApp alterados; PROD intacta. Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%.
