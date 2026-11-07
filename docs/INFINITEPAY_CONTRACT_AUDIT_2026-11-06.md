# Auditoria de impacto — contrato InfinitePay de 06/11/2026

## Resultado e escopo

**A arquitetura de confirmação de pagamentos permanece compatível; não há motivo para reescrever a integração.** Há duas lacunas comprovadas na entrega/registro dos eventos e uma proteção operacional incompleta para estorno parcial. As correções propostas abaixo não foram implementadas nem homologadas.

Base **`e55b09ef`**, branch `feature/infinitepay-customer-auth`, worktree DEV `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. Repositório sem delta tracked inicial e sincronizado com origin. O diretório pai está em outra branch de backup; foi preservado. Único ambiente autorizado: Firebase **`crmdoceria-9959e`**, sem chamadas ao Firebase nesta auditoria. Não houve build, deploy, compra, consulta real de pagamento, estorno, SMS, WhatsApp ou acesso PROD.

Fonte: [confirmação técnica de 06/11](INFINITEPAY_SUPPORT_CONTRACT_2026-11-06.md). Revisão manual delimitada de contrato/fluxos e testes locais com mocks; não é um novo scan integral de segurança do repositório. Hashes de 11 fontes vinculam o diagnóstico à revisão, sem afirmar leitura integral de todos os módulos grandes. [Evidência reproduzível](evidence/infinitepay-contract-2026-11-06-audit-dev.json).

## Controles já atendidos — preservar

| Requisito | Evidência no código atual | Diagnóstico |
|---|---|---|
| Webhook sem assinatura não autoriza pagamento | `functions/index.js:1313–1315`; `payment-signal-policy.js:6–40`; `checkout-payment.js:120–188` | Endpoint é público por necessidade, mas só verifica referências/consulta oficial. Falta de assinatura no provider não é uma regressão local nem justificativa para aceitar `paid:true` do POST. |
| `/payment_check` server-side | `checkout-payment.js:26–56,131–147` | URL fixa HTTPS oficial, timeout 15 s, merchant e montante persistidos, referências completas, `success/paid` verdadeiros, moeda em centavos e método suportado. Não confundir consulta oficial no backend com webhook autenticado por chave. |
| Valores do pagamento | `checkout-payment.js:12–15` | `amount` deve coincidir com o pedido; `paid_amount` pode ser maior. Divergência vira revisão, sem baixa automática. Não exige igualdade indevida. |
| Eventos não pagos não comprovados pela consulta | `payment-financial-events.js:25–33,77–109` | `payment_failed` pode corroborar ausência de aprovação; não confirma a causa da falha. `canceled/refunded` só conciliam com operação interna de execução externa. Não foi inventada API de refund. |
| Liquidação | `payment-financial-events.js:21–33,61–67` | `created/settled` são informativos não verificados; não duplicam receita, estoque, cupom ou recebimento. Não afirmar liquidação financeira verificada. |
| Estorno/cancelamento sem origem confiável | `payment-financial-events.js:35–76` | Sem operação Staff compatível ficam `PENDING_RECONCILIATION`; o ledger identifica `STAFF_RECORDED_EXTERNAL_EXECUTION`, não uma confirmação criptográfica do provider. |
| Idempotência e concorrência | `payment-signal-policy.js:23–25`; `checkout-payment.js:135–188`; `payment-financial-events.js:34–75` | Receipt por merchant/transação, fingerprint separado por evento, operação/match/ledger determinísticos e transações Firestore. Replay de aprovação antiga não desfaz REFUNDED. |
| Abuso e retries | `payment-verification.js:3–21`; `payment-financial-events.js:56–60`; `index.js:1315` | Coalescência, lease 20 s, limite local 30 consultas/pedido/min e 100 notificações distintas/pedido/hora. São políticas locais, não SLA/retry do provider. Respostas 4xx/5xx mantêm reenvio possível. Preferência por 400 não obriga apagar a distinção de falhas transitórias. |
| Falha de criação ambígua | `checkout-payment.js:74–118` | Não repete cegamente `/links`: grava `RECONCILIATION_REQUIRED`. Reabrir o mesmo pagamento com link pronto reutiliza a URL. |
| Isolamento por loja | `checkout-payment.js:17–24,65–72,151–160`; `index.js:2111` | Loja/pedido derivam do caminho persistido, conferidos contra IDs e owner; merchant é snapshot da tentativa. Sem fallback Matriz/global. Mudança de configuração não troca o merchant de pagamento antigo. |
| Conciliação Staff e Preview | `index.js:388–429,1317–1331`; `payment-financial-events.js:115–146`; `firestore.rules:892` | Staff ativo, papel de gestão, financeiro e loja explícita; Preview não autoriza mutação; leitura direta de integrations negada inclusive a Staff. Customer/grant não autoriza esses endpoints. |
| Estoque/cupom/financeiro | `checkout-reservation.js:15–44`; `checkout-payment.js:173–211`; `crm/src/orderFinancialRecognition.js:3–11` | Reserva liquidada uma vez; refund não repõe estoque consumido nem cancela NF. Estados pendentes/refund/cancelamento não são recebimento; pagamento tardio após reserva exige revisão. |
| Credenciais e options | `checkout-payment.js:38,102–105`; `payment-settings.js:3–5` | Fluxo usa handle e não envia `options` nem API Key: **compatível com criação simples**. Não é necessário adicionar chave só para webhook ou seleção de eventos. Se options forem aprovadas futuramente, chave por merchant somente backend/secrets, nunca no frontend. |

O HMAC de `payment-return-auth.js` é uma credencial local de retorno de checkout, não uma suposta assinatura InfinitePay. Não removê-lo por confundir os dois contratos.

## Lacunas reais e riscos

### G1 — seleção de eventos não está no payload de criação

**Risco funcional alto para a cobertura de conciliação não paga; não é bypass de PAID.** Em `checkout-payment.js:102–105`, o link recebe exclusivamente `webhook_url`. Pelo contrato de 06/11, isso entrega somente aprovações. Ter handlers para falha/cancelamento/refund/settled não faz o provider enviá-los. A fila pode permanecer vazia desses avisos e as operações esperadas não encontrar evento correspondente.

O probe local executou `start` duas vezes com Firestore em memória e provider totalmente simulado: uma criação, `webhook_url` presente, `webhook` ausente, `options` ausente. Portanto a lacuna é comprovada no código que cria links, não presumida a partir de uma tela vazia. **G1 já afeta os seis eventos anteriores; não é uma regressão introduzida pelo contrato de 06/11.** O aceite anterior da UI de conciliação e os testes que injetam eventos continuam válidos, mas não demonstram assinatura upstream de todos os eventos.

**Correção mínima proposta:** usar o objeto `webhook:{url,events}` nos novos links que devem receber o conjunto financeiro; lista explícita com `paid` obrigatório e eventos suportados. Preservar a URL atual e o processamento de links antigos; não enviar simultaneamente os dois formatos sem contrato que defina precedência. Persistir modo/lista de assinatura na tentativa se necessário para auditoria, sem alterar merchant/ID/valor ou tentar atualizar links já emitidos. Essa escolha, sem options, não exige API Key segundo a confirmação.

### G2 — `expired` e `overdue` não entram no registro durável por loja

**Risco médio de observabilidade/conciliação; efeito financeiro atual é conservador.** `payment-signal-policy.js:2` enumera seis eventos. Ambos os nomes novos chegam como `HOLD/UNKNOWN_PROVIDER_EVENT`; `checkout-payment.js:123–129` registra warning sanitizado e responde sucesso, sem criar o evento na fila da loja. Um warning de logging não equivale ao documento imutável de reconciliação.

**Correção mínima proposta:** reconhecer os dois nomes e armazená-los como informação não verificada, com correlação/limites/deduplicação existentes. Não mapear automaticamente aviso `expired` para expiração da reserva local, cancelamento, devolução de estoque ou recebimento. Não tentar confirmar esses estados por `/payment_check`. Envelope incompleto/contraditório continua em tratamento conservador; payloads detalhados exigem exemplos sanitizados, sem inventar schema do provider.

### G3 — formulário de estorno não distingue integral de parcial

**Risco médio operacional/financeiro, condicionado a ação Staff autorizada.** `payment-financial-events.js:80–103` registra `amount` igual ao total persistido, sem montante de execução fornecido/conferido; `process:44–75` aplica REFUNDED e ledger pelo valor integral. Em `crm/src/components/PaymentReconciliation.js`, no formulário de registro de execução externa, rótulo e atesto dizem genericamente estorno/operação concluída. Não há opção/validação explícita que exclua estorno parcial.

Isso não prova um estorno real incorreto ocorrido no DEV; demonstra que um Staff pode registrar a referência de uma execução parcial como se fosse integral. Um webhook anônimo sozinho continua insuficiente para alterar o pagamento. O novo contrato não fornece consulta ou envelope detalhado para reparar essa ambiguidade automaticamente.

**Correção mínima proposta:** delimitar o fluxo suportado como estorno **integral**, exigir indicação/atesto explícito desse escopo e validar essa condição no backend. Se houver registro do montante executado, sua fonte e sua relação com o valor da venda devem ser explícitas: `amount` e `paid_amount` podem diferir por encargos, e o contrato não define a devolução desses encargos. Não inventar igualdade entre valores ou semântica de taxas. Operação parcial/inconclusiva não deve produzir operação apta a match integral, `REFUNDED` integral ou ledger integral; deve seguir revisão manual sem inventar novos enums fiscais/financeiros. Não implementar motor de estorno parcial, cobrança, refund remoto ou API privada nesta correção.

## Não são lacunas que justifiquem reescrita

- Ausência de HMAC/header/IP no provider: limitação confirmada e já compensada pela verificação server-side/correlação; não há assinatura para habilitar.
- `/payment_check` sem consulta de refund/falha/settlement: preserva-se a autoridade limitada da consulta e a reconciliação Staff.
- API Key ausente no fluxo simples: contrato permite. Não adicionar secret/novo fluxo financeiro sem options aprovadas.
- HTTP 404/409/503/500 em erros: todos são não 2xx; a preferência por 400 não torna o retry atual incompatível. Não retornar 200 para consulta inconclusiva só para silenciar reenvio.
- API granular/MCP beta: anúncios futuros, sem trabalho obrigatório ou dependência de readiness atual.
- “Sem homologação separada” no provider: não elimina o aceite DEV do projeto.

## Verificação executada e evidências preservadas

**18/18 testes locais existentes PASS**, em seis arquivos: `checkout-payment.test.js`, `payment-signal-policy.test.js`, `payment-verification.test.js`, `payment-return-auth.test.js`, `infinitepay-diagnostics.test.js`, `checkout-reservation.test.js`. Nenhum teste novo foi contado como critério formal. Provider, persistência e relógio pertinentes são mocks; zero chamada a Firebase/provedor real. Probe adicional dos oito nomes mostrou seis dispatches financeiros e dois HOLD; criação em memória mostrou assinatura apenas de aprovação. Isso reproduz lacunas, não homologa correções.

Preservados, sem repetir ou somar às 18 execuções: [regressão final anterior de 1.120 execuções](evidence/preprod-mission-2026-11-04/validation.json), suítes de `payment-financial-events-emulator.test.js`, `payment-contract-emulator.test.js` e `checkout-http.test.js`, e [aceite Staff de 04/11](evidence/preprod-mission-2026-11-04/phase9-staff-acceptance-dev.json). Não alegar que todos os payloads reais dos oito eventos foram homologados. Não houve consulta nova do runtime remoto; o escopo é HEAD/evidências publicadas anteriormente.

## Plano mínimo após autorização funcional

1. G1/G2 em conjunto: selecionar eventos nos novos links e reconhecer/registrar `expired/overdue` sem efeitos financeiros. Testar inclusão obrigatória de paid, modo legado, URLs persistidas, dois merchants/lojas, dados parciais/contraditórios, duplicatas, ordem adversa, retry e limites.
2. G3: atesto/montante de refund integral no backend/UI; rejeitar parcial/inconclusivo sem alterar PAID, reserva, cupom, NF ou ledger. Preservar registros históricos, auditando a origem Staff das novas operações.
3. Reexecutar integração emulada financeira/HTTP e UI pertinentes, build/lint/diff do delta. Preservar todos os testes já PASS; não repetir fases inteiras sem causa.
4. Publicar somente DEV se a correção for autorizada e necessária. Homologação Staff somente leitura/fixtures, sem executar refund/cancelamento/pagamento reais. Registrar os limites de payload/sinais não autenticados; exemplos do suporte podem ampliar cobertura sem gerar transações.
5. Fechar os complementos antes da Production Readiness Review e continuar C15/C16 no ponto já registrado. Não usar esta auditoria para fabricar aceite de Customer ou autorizar PROD.

## Impacto nas fases

**Fase 9 = 100% formal, conforme implementação e aceite de 04/11 preservados.** Esta auditoria não apaga esse histórico nem repete a fase. Entretanto, G1 é uma lacuna concreta entre o payload real e a cobertura de eventos pretendida; G2/G3 são complementos reais de contrato/segurança operacional. **Compatibilidade ampliada com a confirmação de 06/11 não está integralmente homologada** e deve constar como pendência pré-PROD. Não apresentar o 100% histórico como prova de que esses complementos já foram corrigidos.

Fase 10 **87,50%**: C15-E integral PASS, acesso Google existente PASS, claim inicial Google/C16 ainda não encerrados. Nenhum impacto funcional novo em Auth/Customer. Global formal **97,00%**, Fase 13 **0%**, pesos preservados. Não recalcular percentuais nem marcar revisão de produção PASS por documentação/testes simulados.

**Recomendação:** autorizar apenas o patch G1/G2/G3 delimitado, depois retomar C15/C16 e a revisão final. Nesta execução: **somente documentação/evidências; PROD READY: NÃO.**
