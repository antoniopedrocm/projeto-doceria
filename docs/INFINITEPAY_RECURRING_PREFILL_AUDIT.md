# Auditoria DEV — comprador recorrente / InfinitePay (29/10/2026)

Ambiente exclusivo: worktree `C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, Firebase `crmdoceria-9959e`. PROD não autorizada. Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%, preservados.

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

**Não foi encontrada divergência relevante de identidade entre estes dois links. A causa do cartão não reaparecer permanece indeterminada.** Não é possível concluir pelo nosso banco se houve consentimento de salvamento, OTP concluído ou ativação do recurso na interface do provedor. Próximo passo: validar esse estado com o cliente/InfinitePay usando os dois IDs, sem enviar dados de cartão ou códigos. Nenhuma mensagem foi enviada ao suporte.

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

Commit, push e deploy necessário somente de functions:api serão registrados após conclusão. O comportamento de cartões salvos do provedor permanece dependente da confirmação de consentimento/OTP; não será criado pagamento real para tentar homologá-lo.
