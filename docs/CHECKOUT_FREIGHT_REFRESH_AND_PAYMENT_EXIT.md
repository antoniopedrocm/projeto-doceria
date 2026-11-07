# Checkout visitante — cotação após refresh e saída da tentativa online

> **Atualização posterior:** Dono determinou a finalização normal do checkout e início de nova compra do zero. A proposta de encerramento local abaixo foi substituída e não será implementada. Ver [ciclo de finalização](CHECKOUT_COMPLETION_LIFECYCLE.md), que incorpora a correção do frete; números/estado local abaixo são o registro histórico anterior à nova orientação.

## Estado — 07/11/2026

Base conferida `0112003a`, worktree DEV `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, projeto permitido `crmdoceria-9959e`. Alteração anterior local do checkpoint preservada. Último código publicado ainda `4a19dba2`; **aceite funcional/UX FAIL**, sem encerrar o workstream.

Titular forneceu duas imagens: modal Combinar bloqueado pelo aviso de tentativa online e carrinho com frete R$ 11,48/total R$ 12,48 após reload normal/hard. As imagens não são evidência de implementação nova. Sem nova consulta remota, pedido, pagamento, SMS, vínculo ou alteração de dados reais nesta execução.

## Causa do frete

`cardapio.html::persistCheckoutState` gravava `valorFrete` e `distanciaFreteKm` em `checkoutState_v1` da aba. `restoreCheckoutState` recuperava o preço e renderizava os resumos antes de uma cotação atual. Reload e hard reload mantêm sessionStorage; cache HTTP/Service Worker não é a autoridade desse preço. O teste anterior ao patch reproduziu **11,48 em vez de 0** após restauração. `updateGuestSummary` ainda priorizava valor positivo antes de validar o local, e requisições concorrentes podiam reaplicar preço antigo.

## Correção local delimitada

- Rascunho/carrinho/endereço continuam preservados por loja; cotação numérica/distância deixam de ser persistidas e valores antigos salvos são ignorados.
- Validade da cotação existe somente em memória. Resumos mostram **A calcular / Calculando / confirmar local** e total parcial **+ frete** até validação; não afirmam frete grátis por falha de cálculo.
- Retomar endereço confirmado recalcula uma vez usando o fluxo existente. Removida inicialização duplicada de mapa no modal; mapa oculto não deve sobrescrever o resumo confirmado.
- Troca de contexto, fechamento do modal e mudança de campos de entrega invalidam o preço; apelido/dados pessoais não o invalidam. Carrinho, chave idempotente e prova de retorno não são apagados.
- Geração da requisição impede preço/erro atrasado de substituir a cotação atual. Guarda também a revalidação anterior à submissão. Zero válido continua sendo aceito; null/string/negativo/falha não viram cotação confirmada.
- Mesmo handler e cálculo de frete do servidor, valores/raio/Maps e modalidades preservados. Sem alteração de backend, provider, Auth, permissão ou consentimento. Telas Phone/Strong continuam usando o mesmo formulário/opções e revalidação, com indicadores de cotação atualizados.
- Fonte canônica e três aliases gerados continuam idênticos. Nenhuma cópia por storeId ou dependência nova.

## Pagamento — proposta não implementada

O aviso foi observado, mas o Dono o rejeitou como saída final de UX. `inspectGuestPaymentAttempt` continua bloqueando Combinar se a tentativa conhecida está PENDING. Não apagar chave e criar novo pedido sem resolver o anterior.

Dependência real: não há API InfinitePay documentada para cancelar o link. **Encerramento local não equivale a cancelamento financeiro no provider.** A arquitetura atual já envia pagamento tardio após encerramento da reserva para conferência; isso não autoriza criar uma nova ação de encerramento antecipado sem definir a regra.

Proposta enviada ao Dono, **aguardando resposta**:

1. Ação explícita **Encerrar tentativa online e continuar**, com confirmação clara de que o pedido/reserva local serão encerrados, que o link externo não foi cancelado e não deve ser utilizado.
2. Endpoint restrito a checkout Guest, validando prova da tentativa, contexto/loja e estado atual no servidor; telefone informado e IDs isolados não concedem autoridade. Sem cancelar pagamentos de outro contexto/loja.
3. Transação idempotente apenas para tentativa local PENDING, sem review, com pedido/reserva consistentes; preservar pedido, associação ao provider/merchant, histórico e prova. Bloquear PAID, estado desconhecido/revisão e corrida com confirmação. Reserva liberada uma única vez e evento administrativo/operacional mínimo append-only, sem secrets.
4. Somente depois de confirmação server-side do encerramento retirar a chave antiga e permitir novo pedido Combinar. Sem nova cobrança automática nem conversão financeira fictícia. Nenhum pedido existente de Matriz/Garavelo será encerrado pelo agente na homologação.
5. Aprovação tardia permanece sujeita a `/payment_check`, idempotência e conferência; não confirmar pedido cancelado, consumir estoque/financeiro duplicado ou tratar como quitado o pedido novo. Confirmar por testes também se o late-paid precisa de ajustes mínimos na rastreabilidade do motivo.

Arquivos previstos somente após autorização: serviço de tentativa/reserva e endpoint `functions/index.js`, helper/aviso do visitante e testes. Sem API de cancelamento inventada, estorno automático, alteração retroativa de links ou operação real. Casos obrigatórios: prova inválida/outra loja/Customer não autorizado; double-click/retry; corrida com PAID/expiração; late paid; review; falha de rede; ordem de eventos; estoque/cupom sem duplicidade; nova compra posterior e fluxo autenticado preservado. Não implementado neste delta.

## Qualidade e limites

Rodada atual **71 testes distintos PASS**: **58 públicos** (6 arquivos, incluindo **17 novos** cenários de frete) e **13 backend** de frete/pagamento/reserva. Não somar os 198 da entrega anterior nem retestes a esta contagem. Fontes de testes usam mocks/dados sintéticos e funções reais extraídas do cardápio. Teste de seleção de endereço existente passou usando os novos helpers reais, sem eliminar asserts.

Lint de 3 arquivos de testes e 6 scripts inline sem novos diagnósticos; débitos históricos dos scripts não foram tratados como novos erros. Lint anterior backend/público 18 arquivos sem novos diagnósticos. Build DEV e diff-check registrados na [evidência local](evidence/checkout-freight-refresh-local/validation.json). Bundle React sem nova dependência; avisos conhecidos de sourcemap/Browserslist preservados.

Chrome isolado, fixture sintética com markup/CSS/funções atuais: reload normal e hard reload em 1920×889 e 390×800, **4 verificações PASS**, mantendo carrinho/chave idempotente, ignorando cotação salva; quatro capturas, sem serviço externo. [Relatório](evidence/checkout-freight-refresh-local/browser-review.json), [carrinho desktop](evidence/checkout-freight-refresh-local/cart-1920.png), [modal mobile](evidence/checkout-freight-refresh-local/guest-390.png). Não são capturas DEV autenticadas ou homologação do titular.

**Commit/push/deploy novos: não executados.** Patch do frete local; regra nova de encerramento pendente de decisão. Deploy Hosting será necessário para aplicar o frete; backend adicional só se a proposta for autorizada e implementada/testada. Não pedir limpeza manual de storage para disfarçar o problema.

**Fase 9 100%; Fase 10 87,50%; global formal 97,00%; Fase 13 0%; PROD READY NÃO.** Nenhuma evolução percentual por este patch ou teste sintético.
