# Fase 9 — reavaliação documental dos eventos InfinitePay

Consulta em 2026-10-20 (America/Sao_Paulo), base `89b1e1da`, branch DEV
`feature/infinitepay-customer-auth`. Sem operação financeira, acesso à conta do
provider, engenharia reversa, escrita remota ou publicação.

## Fontes e versão observável

| Fonte oficial aberta diretamente | Versão/data visível |
|---|---|
| [Checkout Integrado, artigo 10766888](https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay) | “Atualizado hoje”; sem revisão técnica numerada |
| [Documentação principal de Checkout](https://www.infinitepay.io/checkout-documentacao) | Sem data de revisão técnica visível |
| [Contrato de Afiliação](https://www.infinitepay.io/legal/contrato-de-afiliacao) | Sem data de revisão visível; copyright não é versão contratual |
| [Regras de cancelamento, 7153679](https://ajuda.infinitepay.io/pt-BR/articles/7153679-como-posso-cancelar-uma-venda) | 12 de maio de 2026 |
| [Cancelamento no App, 6088742](https://ajuda.infinitepay.io/pt-BR/articles/6088742-como-cancelar-uma-venda-no-app-infinitepay) | 12 de maio de 2026 |
| [Cancelamento no navegador, 8400203](https://ajuda.infinitepay.io/pt-BR/articles/8400203-como-cancelar-uma-venda-no-navegador) | 12 de maio de 2026 |

O artigo 10766888 confirma seleção em `webhook.events`, destino HTTPS e resposta 200
após processamento, com possibilidade de reentrega em erro. Documenta `payment_check`
com `X-Api-Key`, referências handle/order_nsu/transaction_nsu/slug e dados de aprovação,
valores, parcelas e método. A chave é de saída servidor→API, não prova da origem do POST recebido.

O contrato jurídico trata contestação/cancelamento na cláusula12 e PIX separadamente
na cláusula8; 8.4.4 exclui PIX da cláusula12. As ajudas descrevem operações no
App/Conta/maquininha, sujeitas a condições. Não constituem contrato técnico de API.

Pesquisa restrita a InfinitePay/CloudWalk: webhook signature, assinatura webhook,
HMAC, webhook secret, authentication webhook, X-Signature, refund API, cancel API,
estorno API, transaction status, refunded, canceled e payment_failed. Não localizado
mecanismo documentado de autenticação de origem, consulta dos três estados não pagos
ou API pública de refund/cancelamento. Não é prova de inexistência. Não foram usados
endpoints internos, SDKs de terceiros ou canais financeiros autenticados.

## Matriz contratual antes da implementação

Legenda: **A** assinatura/origem criptograficamente autenticada; **B** POST sem
prova de origem; **C** confirmação independente por API autenticada com credencial.

| Evento | Oficial / semântica | Evidência disponível | Autenticidade | Consulta específica documentada | Ação segura atual |
|---|---|---|---|---|---|
| created | Sim; criado, não pago | Artigo | A não demonstrada; B | Não localizada | Não confirmar |
| paid | Sim; aprovado | Artigo e ensaios DEV anteriores | B; C descrita com API Key, não implementada neste cliente | Aprovação via payment_check | Conciliar por consulta server-side |
| settled | Sim; liquidado | Artigo | A não demonstrada; B | Não localizada para liquidação | Nenhum novo efeito operacional |
| canceled | Sim; cobrança cancelada antes de pagar | Artigo | A não demonstrada; B | Não localizada | Não cancelar pedido pelo rótulo |
| refunded | Sim; estorno de aprovado | Artigo | A não demonstrada; B | Não localizada | Não estornar/restaurar estoque pelo rótulo |
| payment_failed | Sim; tentativa recusada | Artigo | A não demonstrada; B | Não localizada | Não promover automaticamente a FAILED |

Existência e significado dos eventos estão confirmados. Faltam schema do envelope,
autenticação verificável e confirmação dos eventos não pagos. `paid:false` não
distingue os estados excepcionais. Um resultado histórico `paid:true` também não
comprova ausência de estorno posterior.

## Implementação real e diferenças de contrato

- `functions/checkout-payment.js`: `start` envia `handle`, itens agregados em centavos,
  `order_nsu=paymentId`, redirect e **webhook_url**. Não envia objeto `webhook` nem
  lista `events`; não solicitamos explicitamente os seis eventos. Esse modo legado
  continua descrito na documentação principal. Não presumir assinatura de todos eles.
- `InfinitePayProvider.post`: HTTPS, JSON, prazo15s; **não envia X-Api-Key**.
  É consulta server-side no modo por handle, não C por credencial. A alternativa com
  API Key do artigo novo exigirá configuração privada e adaptação/testes separados;
  não foi criada chave, nem inferida a partir de handle.
- `functions/index.js`: `/checkout/webhook` público chama `reconcile` e devolve200
  em sucesso; erros recebem status do serviço e corpo sanitizado. Não há verificador
  de assinatura nem dispatcher de tipos; não há acknowledgement confiável dos eventos
  novos. `/checkout/payment-status` exige sessão própria antes de consultar/reconciliar.
- `reconcile` reconhece referências, **não reconhece semanticamente nenhum nome de
  evento**. Campos adicionais são ignorados como autoridade. Exige retorno positivo
  de `provider.check`; não usa valor/status alegado no webhook para confirmar.
- Loja/conta/valor/vínculo vêm do registro persistido e são revalidados na transação.
  Recibo por conta/transação impede associação da mesma transação a outro pedido.
  A resposta pública documentada não ecoa todos os IDs: não alegar validação adicional
  de transaction_nsu retornado que o contrato não promete. Referências falsas só
  podem confirmar se a API responder positivamente à consulta correlacionada; isso
  não autentica quem enviou o sinal.
- Apenas aprovação conciliada pode confirmar pedido, consumir reserva e criar recibo
  financeiro CONFIRMED. Divergência gera REVIEW; atraso após liberação preserva pedido
  cancelado e exige conferência. Efeitos são transacionais e repetição não consome
  estoque de novo. Nenhum evento é autoridade financeira exclusivamente pelo payload.
- Reservar estoque já reduz o disponível; consumir reserva não reduz novamente.
  Expiração libera uma vez e não cancela cobrança remota. WhatsApp não foi alterado.

## Evento → estado interno → pedido → efeitos

| Entrada/evidência | Pagamento interno | Pedido operacional | Efeitos |
|---|---|---|---|
| created ou tentativa recusada, sem prova independente | Preservar | Preservar | Sem recibo/consumo; não inventar falha definitiva |
| Aprovação consultada, valor/vínculo/reserva elegíveis | PAID | CONFIRMED | Consumir reserva/recibo único |
| Aprovação tardia, pedido/reserva encerrados | PAID + requiresReview | Continua CANCELLED | Não reabrir nem consumir novamente |
| settled apenas como sinal | Preservar | Preservar | Fulfillment depende de PAID, não de liquidação; sem segundo efeito |
| canceled apenas como sinal | Preservar | Preservar | Não equivale a CANCELLED local ou EXPIRED |
| refunded apenas como sinal | Preservar | Preservar | Sem escrita financeira/estoque confiando no POST |
| REFUNDED interno já comprovado por processo externo | Preservar REFUNDED | Preservar fulfillment | Evidência antiga não volta a PAID; não restaurar estoque |

Uma futura entrada verificada de refund deve preservar o recibo original de aprovação
e acrescentar histórico próprio idempotente. Não se implementou um gravador manual,
nem política de estorno parcial ou reposição automática sem contrato de negócio.
`payment_failed` representa tentativa; não se deve fechar o pedido nem impedir retry
legítimo automaticamente. Autenticidade, granularidade e ordenação precisam ser
resolvidas antes de habilitar transições adicionais.

## Testes e limite da evidência

Estendida `payment-contract-emulator.test.js`, com provider sintético e transações
Firestore locais. Os nomes são oficiais; o campo extra `event` é propositalmente
um **hint de teste**, não uma afirmação de schema real. Testamos o serviço existente,
não uma integração fictícia com o envelope do provider.

- Seis nomes isolados e repetidos sem confirmação não alteram pagamento/pedido,
  reserva/estoque ou recibos.
- created → payment_failed → retry → aprovação: só a aprovação independente produz
  PAID/CONFIRMED, reserva consumida e recibo único.
- paid → settled/refunded/canceled/created/payment_failed: rótulos e resposta antiga
  não promovem estorno/liquidação nem regridem PAID; confirmação repetida sem novos efeitos.
- REFUNDED interno → refunded duplicado e aprovações antigas: permanece terminal,
  pedido DELIVERED preservado, sem reposição automática.
- Referências ausentes/pedido desconhecido são negados; recibo de uma transação
  não pode confirmar outro pedido.
- Reutilizados guards de loja/pedido/valor, segunda transação, pagamento tardio,
  reserva/cupom, HTTP webhook↔consulta, duplicidade e criação ambígua.

Não certificamos assinatura, recebimento de eventos reais nem transição real de
FAILED/REFUNDED/CANCELED/SETTLED. Nenhuma mudança runtime é justificada enquanto
o contrato de confiança estiver incompleto. Migrar o modo legado cegamente para
webhook.events/API Key exigiria assumir configuração e envelope ainda não comprovados.

Resultado desta execução: **50/50 PASS** na coorte emulada (contrato financeiro,
checkout, reservas, payment settings/Rules e checkout HTTP), incluindo 12 verificações
adicionais neste delta (seis subtestes e seis testes agregadores/cenários). Unitários
checkout-payment/infinitepay-diagnostics **9/9 PASS**. Lint do arquivo alterado:
**0 erros/0 avisos**; aviso externo de base Browserslist/baseline desatualizada,
sem atualização de dependências. `git diff --check` PASS. Emulator CLI encerrou
Auth/Firestore normalmente; projeto usado exclusivamente `demo-doceria-checkout`.
Sem runtime/frontend alterado, build e bateria completa da Fase 11 não foram repetidos;
evidências e preexistências em PREPRODUCTION_VALIDATION.md continuam válidas.

## Resultado formal e pergunta preparada (não enviada)

Fase 9 **75%**, Fase 11 **100%**, Fase 12 **100%**, Global **95,00%**.
Fase 13 **NÃO INICIADA/0%**. O quarto marco está parcialmente esclarecido, não concluído;
não há subpontuação nova. Os 2,00 p.p. restantes só entram quando contrato e tratamento
operacional verificável estiverem implementados/testados. Sem deploy ou ação financeira.

Pergunta ao suporte, somente preparada:

> Para o Checkout Integrado, os eventos de webhook payment_failed, refunded e canceled
> estão documentados oficialmente. Qual é o mecanismo oficial para autenticar a origem
> desses webhooks — assinatura, HMAC, header secreto ou outro método?
>
> Existe endpoint oficial que permita consultar e confirmar posteriormente os estados
> refunded, canceled e payment_failed usando order_nsu, transaction_nsu ou slug?
>
> Existe API pública suportada para cancelamento/refund, ou essas operações são
> exclusivamente realizadas pelo App/Conta InfinitePay?

Solicitar também schema de cada evento, identificador/ordenação para deduplicação e
compatibilidade entre webhook_url legado e webhook.events/API Key. Nenhuma mensagem enviada.
