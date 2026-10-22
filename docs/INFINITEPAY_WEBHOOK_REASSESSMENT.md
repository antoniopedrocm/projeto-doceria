# Fase 9 — reavaliação documental dos eventos InfinitePay

**Revisão vigente:** [fechamento interno de 2026-10-21](#fechamento-interno--2026-10-21),
commit funcional `8ea926a8`, posterior à auditoria profunda da base `9bda18bd`.
A seção inicial preserva a investigação de 2026-10-20; a nova
rodada amplia fontes, distingue modos compatíveis de conflitos ainda não resolvidos
e substitui a lista anterior de perguntas externas pela lista consolidada ao final.

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

## Auditoria documental profunda — 2026-10-21

### 1. Resumo executivo

**Fase 9: 75% → 75%; Global: 95,00% → 95,00%.** Fases 11/12 permanecem100%;
Fase13 NÃO INICIADA/0%. Pesquisa ampliada para fontes oficiais, sitemaps, busca
pública do Help Center, GitHub e pistas da comunidade. Sem alteração runtime.

Novidades: contato técnico confirmado; texto oficial de status mais amplo que o
schema publicado; API Key explicitamente opcional no modo por InfiniteTag; devolução
Pix parcial/total documentada no App; divergência entre data visível e JSON-LD do blog.
Não foi localizado contrato suficiente de autenticidade/schema/consulta dos eventos
não pagos. Documentação ainda insuficiente e divergência de interface pendente.
**Decisão C: esclarecer o contrato oficial antes de alterar runtime.**

### 2. Escopo, método e limite da pesquisa

Somente páginas públicas, HTML/metadata, XML de sitemap e GitHub REST público, sem
autenticação. Não foram chamados endpoints financeiros, disparados webhooks, usados
segredos, sondados caminhos privados ou executadas operações no App. Não houve
engenharia reversa, teste de credencial ou contato externo. Nenhum código/teste alterado.

Domínios oficiais pesquisados: infinitepay.io/www, ajuda.infinitepay.io, cloudwalk.io/www;
avaliados também developers.cloudwalk.io e docs.cloudwalk.io sem presumir existência.
Termos em português/inglês agrupados por assinatura/autenticação/HMAC/secret/token,
X-Signature/X-Webhook/callback, eventos/estados/declined/refused/processing, IDs/lookup,
refund/cancel endpoints, API Key/Bearer/OAuth, retry/idempotência/replay e especificações.
Resultados sem relação com Checkout foram descartados; buscas não equivalem a inventário
absoluto do provider nem demonstram inexistência de documentação privada.

Descoberta verificável:

- [Sitemap InfinitePay](https://www.infinitepay.io/sitemap.xml):200, **897 URLs**;
  filtradas por checkout/API/integração/desenvolvedor/webhook/cancelamento/estorno.
- [Sitemap Help Center](https://ajuda.infinitepay.io/sitemap.xml):200, **329 URLs**;
  localizados artigo técnico e ajudas adicionais de cancelamento/Pix.
- [Sitemap CloudWalk](https://www.cloudwalk.io/sitemap.xml):200, **141 URLs**;
  referências de marca/notícias/Stratus, sem nova especificação Checkout encontrada.
- Busca pública `https://ajuda.infinitepay.io/pt-BR/?q=webhook`, `?q=payment_check`
  e `?q=refund`:200; páginas de resultado apontaram ao artigo10766888, sem novo
  contrato técnico recuperado. Usada página pública, não API interna do Intercom.
- `developers.cloudwalk.io`: DNS ENOTFOUND neste ambiente. `docs.cloudwalk.io` resolve
  e a navegação pública redireciona para `https://www.cloudwalk.io/`; não é um portal
  separado de Checkout nesta observação. Falha TLS inicial do cliente Node foi
  superada pela leitura normal do PowerShell, sem desabilitar verificação de certificado.
- Seguidos links desenvolvedores→Checkout/InfiniteTap e blog→checkout-documentacao.
  InfiniteTap é outra integração, não contrato de webhook de Checkout.

### 3. Registro das fontes oficiais

Todas consultadas em **2026-10-21, America/Sao_Paulo**. URLs são integrais; resumos
curtos, sem cópia de artigos. Códigos F1–F12 são usados nas matrizes seguintes.

| ID / título | URL completa | Domínio | Data/versão visível | Evidência / classificação |
|---|---|---|---|---|
| F1 — Como usar o Checkout Integrado da InfinitePay? | https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-integrado-da-infinitepay | ajuda.infinitepay.io | Atualizado ontem; metadata updated_at2026-10-20T19:14:26Z | Modos de identificação, eventos e opções; confirmado com limites de schema |
| F2 — Documentação do Checkout | https://www.infinitepay.io/checkout-documentacao | www.infinitepay.io | Sem revisão técnica visível | Exemplos legados de criação, aprovação e consulta |
| F3 — Integração InfinitePay: Vendas Ágeis Com Checkout Gratuito | https://www.infinitepay.io/blog/integracao-infinitepay | www.infinitepay.io | Visível20/10/2026; JSON-LD26/08/2026 | Consulta de estados descrita sem campo/enum; indicado, incompleto |
| F4 — Integração para desenvolvedores e InfiniteTap | https://www.infinitepay.io/desenvolvedores | www.infinitepay.io | Sem revisão técnica visível | Links de produto e contato para dúvidas; confirmado |
| F5 — Checkout Integrado para Vendas no Seu Site | https://www.infinitepay.io/checkout | www.infinitepay.io | Sem revisão técnica visível | Reitera modo webhook_url e exemplo de aprovação |
| F6 — Checkout Tap | https://www.infinitepay.io/checkout-tap | www.infinitepay.io | Sem revisão técnica visível | Outra integração; não transportar seu callback para Checkout online |
| F7 — Contrato de Afiliação | https://www.infinitepay.io/legal/contrato-de-afiliacao | www.infinitepay.io | Sem revisão identificada; copyright não é versão | Contexto jurídico, separado de schema técnico |
| F8 — Como posso cancelar uma venda? | https://ajuda.infinitepay.io/pt-BR/articles/7153679-como-posso-cancelar-uma-venda | ajuda.infinitepay.io | 12/05/2026 | Regras operacionais de cancelamento |
| F9 — Como cancelar uma venda no App InfinitePay? | https://ajuda.infinitepay.io/pt-BR/articles/6088742-como-cancelar-uma-venda-no-app-infinitepay | ajuda.infinitepay.io | 12/05/2026 | Procedimento no App; não API pública |
| F10 — Como cancelar uma venda no navegador? | https://ajuda.infinitepay.io/pt-BR/articles/8400203-como-cancelar-uma-venda-no-navegador | ajuda.infinitepay.io | 12/05/2026 | Procedimento na Conta Inteligente; não API pública |
| F11 — Como funciona o cancelamento de vendas? | https://ajuda.infinitepay.io/pt-BR/articles/6097686-como-funciona-o-cancelamento-de-vendas | ajuda.infinitepay.io | Sem data capturada nesta leitura | Ajuda operacional adicional, sem schema Checkout |
| F12 — Como cancelar uma transação Pix? | https://ajuda.infinitepay.io/pt-BR/articles/10572395-como-cancelar-uma-transacao-pix | ajuda.infinitepay.io | 22/07/2026 | Devolução parcial/total no App; não garante payload de refund Checkout |

### 4. Linha do tempo e controle de versão

- 20/10: auditoria anterior baseada em89b1e1da, entregue em9bda18bd; eventos confirmados,
  testes conservadores50/50+9/9. Esta rodada não os executou novamente.
- 21/10: F1 passou de “Atualizado hoje” para “Atualizado ontem”, com metadata indicando
  20/10 às19:14:26Z. Nomes/formas principais reconsultados permanecem os mesmos; não
  declarar equivalência binária entre duas páginas que não tiveram snapshots pareados.
- A URL antiga do mesmo artigo, `https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-link-integrado-da-infinitepay`,
  **redireciona para F1**. Snippet de busca ainda mostra host antigo
  api.infinitepay.io/invoices/public/checkout; é índice histórico, não nova versão ativa.
- F3 mostra20/10/2026, mas JSON-LD datePublished/dateModified mostram26/08/2026.
  Registrar conflito de metadata; nenhuma dessas datas certifica versão de API.
- Hashes HTML integrais da coleta pública atual (incluem markup dinâmico, não versões de API):
  F1`19b6b32d462fbaaced23a2210fba328826a0e113c81275a6d63b9230d11cd9dc`;
  F2`d6e6427fc104b867e619b9172a72122e6f157f580bef62af50e06ad40ceb0904`;
  F3`2d1363aeafd8c06484a6ed541734d38925ec1b7829e6a313ec920b6b4ed9f2f1`.

### 5. Matriz de contrato e confronto entre fontes

Categorias: **CONFIRMADO OFICIALMENTE**; **INDICADO OFICIALMENTE, MAS CONTRATO
INCOMPLETO**; **CONFLITO ENTRE FONTES OFICIAIS**; **NÃO LOCALIZADO EM DOCUMENTAÇÃO
PÚBLICA**; **INFERÊNCIA**. Diferença entre modos não é automaticamente incompatibilidade.

| Assunto | Help Center F1 | Referência F2 / landing F5 | Blog F3 / outras oficiais | Conclusão |
|---|---|---|---|---|
| /links, identificação, X-Api-Key | API Key; permite InfiniteTag sem chave para modo básico | handle no body | Credenciais sem especificação | Confirmado: ausência de chave não invalida por si o modo atual; opções avançadas exigem esclarecimento de escopo |
| Criação e campos | items; order_nsu opcional | Playground usa items; há trecho escrito itens | POST genérico | Confirmado para formato adotado; não alterar por erro editorial isolado |
| webhook_url | Não é o formato exemplificado | String de URL | Blog usa linguagem genérica | Diferença de interface; compatibilidade/depreciação não documentada |
| webhook.url / webhook.events | Objeto e seleção | Não descritos | Não acrescenta schema | Contrato incompleto entre versões/modos; não substituir cegamente |
| Lista de eventos | Seis nomes | Aprovação | Aprovação genérica | Extensão em F1; envelope de cada evento não definido |
| payment_check / paid | Consulta de aprovação e campos | success/paid/valores/método | Diz aprovada/recusada/em processamento | Conflito de descrição pública/schema: campo/enum não localizado; não derivar recusada de paid:false |
| refunded / canceled / payment_failed | Nomes/semântica | Sem contrato de estados excepcionais | Cancelamento jurídico/operacional F7–F12 | Existência confirmada; confiança/consulta não resolvidas |
| refund API / cancel API | Não localizados | Não localizados | App/Conta confirmados | Não concluir exclusividade dos canais por ausência de API localizada |
| Autenticação webhook | Não localizada | Não localizada | Antifraude comercial não autentica callback | Não inventar assinatura, IP ou header |

### 6. Matriz de eventos

A=origem assinada verificável; B=payload sem prova de origem; C=consulta independente
autenticada por credencial. Não confundir TLS da API/handle com assinatura do remetente.

| Evento | Oficial | Schema público | Autenticidade | Consultável especificamente depois? | Pode alterar estado hoje? |
|---|---|---|---|---|---|
| created | Sim | Envelope não localizado | B; A não localizada | Não localizado para o evento | Não pelo rótulo |
| paid | Sim | Exemplo de aprovação legado, não schema universal | B; API Key de saída descrita, não implementada | Aprovação consultável | Somente prova server-side conciliada |
| settled | Sim | Não localizado | B; A não localizada | Liquidação específica não localizada | Sem novo efeito operacional |
| canceled | Sim | Não localizado | B; A não localizada | Não localizado | Não pelo rótulo |
| refunded | Sim | Não localizado | B; A não localizada | Não localizado | Não pelo rótulo |
| payment_failed | Sim | Não localizado | B; A não localizada | Blog sugere recusa, sem campo técnico | Não pelo rótulo |

### 7. Autenticação e auditoria específica do webhook

Nenhuma das pistas comunitárias foi promovida a contrato de segurança.

| Pergunta | Resultado observado | Fonte / limite |
|---|---|---|
| 1. Endpoint nosso informado | Config por loja; histórico DEV: https://us-central1-crmdoceria-9959e.cloudfunctions.net/api/checkout/webhook | Código e checkpoint840; dado remoto não relido nesta rodada |
| 2. Seleção de eventos | F1 descreve events; código não envia seleção | F1 + HEAD |
| 3. Eventos possíveis | Seis nomes confirmados | F1; não comprova assinatura ativa em cada modo |
| 4. Schema POST | Exemplo de aprovação; schema completo dos seis não localizado | F2/F5 |
| 5. event/type/status/data/transaction | Campos de envelope não localizados | Não adotar campo event de fixture como fato |
| 5b. order_nsu/transaction_nsu/slug | order_nsu, transaction_nsu, invoice_slug no exemplo; slug no retorno/consulta | F1/F2/F5; não universalizar para refund/falha |
| 6. Payload completo | Exemplo demonstrativo de aprovação disponível | Não lista required/optional ou todas as variantes |
| 7–11. Header, assinatura, secret, HMAC, timestamp assinado | Não localizados | X-Api-Key da chamada à API não é header de webhook documentado |
| 12. Replay protection provider | Não localizada | Recibo local idempotente não é autenticação provider |
| 13. IP allowlist | Não localizada | Não usar IP/UA como prova financeira |
| 14. Retry | Confirmado que pode haver reentrega em erro | F1/F2/F5 |
| 15. Política retry | Quantidade, intervalos e duração não localizados | Não importar cronograma de outro provider |
| 16. HTTP esperado |200 em sucesso; F2/F5 indicam400 para reentrega | Não inferir contrato para todos os4xx/5xx |
| 17. Timeout | F2 recomenda resposta preferencialmente abaixo de1s | Recomendação, não limite contratual garantido |
| 18. Ordenação | Não localizada | Testes locais não demonstram garantia do provider |
| 19. Entrega garantida | Não localizada | Possibilidade de retry não garante entrega |
| 20. Duplicados | Reentrega documentada; ausência de duplicados não garantida | Deduplicar é decisão defensiva local |
| 21–22. event ID e versão | Não localizados | transaction_nsu identifica transação, não necessariamente evento |

### 8. payment_check: achados específicos

Método/URL e quatro referências já registrados na seção anterior permanecem.
F1 descreve X-Api-Key; F2 exemplifica consulta por handle. Request de quatro campos
não vem acompanhado de tabela normativa required/optional. F1 diz que não é preciso
InfiniteTag com API Key em sua explicação geral, mas ainda inclui handle no exemplo
da consulta: escopo exato da substituição não deve ser inferido.

Resposta demonstrativa F2: success, paid, amount, paid_amount, installments,
capture_method. O exemplo não limita todos os campos futuros nem define um enum
status. Valores fora do exemplo e resposta a refund/cancel/falha não foram localizados.
Códigos HTTP/erros da consulta, rate limit e consulta sem transaction_nsu/slug não
têm contrato suficiente nas fontes consultadas. Não descobrir isso com chamada real.

F3 indica oficialmente três situações, porém não fornece endpoint novo, schema,
campo ou valores computáveis; seu link leva a F2. Classificação: **INDICADO
OFICIALMENTE, MAS CONTRATO INCOMPLETO**, com divergência entre a promessa descritiva
e a referência vinculada. Não equivale a provar que a API só tem um booleano; equivale
a não possuir base suficiente para implementar outro discriminador.

Conclusão segura para nosso código: interpretar apenas a aprovação conciliada já
documentada/testada. paid:false não comprova FAILED; paid:true histórico não comprova
que nunca houve refund. Consultar por API não autentica o emissor do webhook.

### 9. payment_failed: stress test

| Questão | Resultado |
|---|---|
| Gatilho e granularidade | F1 fala em tentativa não aprovada; motivos/códigos concretos não definidos |
| Estado de cobrança / terminal / retry / depois paid | Não localizados; não concluir que a cobrança inteira terminou |
| order_nsu / transaction_nsu no evento | Envelope específico não localizado; exemplo de aprovação não basta |
| Motivo/código de recusa | Não localizado |
| Consulta posterior | F3 menciona recusa; contrato técnico não especificado |
| Recusada = payment_failed? Campo/valores? | Mapeamento explícito não localizado |

Não marcar FAILED definitivo nem cancelar operação a partir de uma tentativa ou POST
não autenticado. Retry preservado em teste local é política conservadora nossa, não
garantia do ciclo de vida do provider.

### 10. refunded: stress test

Evento oficial confirmado. Schema/IDs do evento, valor de refund, timestamp, motivo,
refund ID, eventos intermediários e consulta posterior: **não localizados para Checkout**.
Não está definido se payment_check muda nem como representa estorno parcial.

F12 confirma devolução Pix total/parcial pelo App, com saldo e retorno à conta de
origem; não transporta essa política para schema de Checkout. F8–F10 descrevem
restrições/prazos de cartão; F7 separa PIX da cláusula12. Há diferenças operacionais,
não um único contrato universal de refund. Não dizer que refund parcial do Checkout
está documentado apenas porque a devolução Pix existe no App.

Pagamento e fulfillment permanecem separados. Não restaurar estoque nem mudar
DELIVERED automaticamente. Preservar recibo original e exigir histórico auditável
de devolução, total/parcial e associação inequívoca antes de implementar nova transição.

### 11. canceled: stress test

F1 distingue cancelamento de cobrança antes do pagamento. Não localizados no contrato
técnico: atores autorizados a gerar esse evento, associação com expiração, flags de
cancelamento manual, estado terminal e regras de eventos fora de ordem.
Cancelamentos pelo cliente/provider no contrato jurídico não definem campo/ator no
payload. Não mapear canceled para EXPIRED/FAILED/CANCELLED local automaticamente.
O nome não autoriza PAID→cancelado; refund após aprovação é conceito distinto.
API pública de consulta/solicitação não localizada.

### 12. settled: stress test

F1 descreve liquidação. Relação temporal precisa com paid, repetição, consulta e
schema não localizados. Não foi encontrada exigência de settled para fulfillment.
Isso não é prova de que tal exigência nunca exista; a decisão da aplicação continua
usar PAID verificado, como já homologado. Persistência informativa futura só após
contrato de confiança e evento definido, sem segundo consumo/recibo de aprovação.

### 13. Refund/cancel API pública

Não localizada especificação pública suportada de request/response/autenticação
para solicitar ou consultar refund/cancelamento Checkout. Fluxos App/navegador
existem, mas sua existência não prova exclusividade nem autoriza usar suas chamadas
internas. Nenhuma sondagem de endpoint financeiro, operação real ou leitura autenticada.
Operação manual externa e atualização confiável do nosso registro continuam problemas
distintos. Automação de refund não foi introduzida como novo requisito da Fase9.

### 14. Fontes comunitárias, GitHub e especificações excluídas como contrato

Pesquisa incluiu fóruns/comunidades n8n, Stack Overflow, Reddit, relatos públicos,
GitHub, SDKs e catálogos OpenAPI. Não localizada resposta técnica oficial nesses fóruns
que resolva os pontos. Resultado negativo é limitado à busca, não prova inexistência.

| Pista pública | Procedência / versão observada | Verificação e uso |
|---|---|---|
| https://github.com/cloudwalk | Perfil liga a cloudwalk.io; API pública listou10 repos | Não localizado SDK/spec de Checkout na lista; Stratus é EVM, outro produto |
| https://api.github.com/orgs/cloudwalk/repos?per_page=100&type=public&sort=updated | GitHub REST público | Repositórios listados integralmente; não clonar/procurar conteúdo privado |
| https://github.com/infinitepay | Perfil com0 repos públicos | Vínculo oficial não certificado só pelo nome; nenhuma especificação utilizável |
| https://api.github.com/repos/cloudwalk/infinitepay-woocommerce-plugin | Referido por índice de terceiros |404 nesta leitura; não prova remoção nem inexistência histórica |
| https://github.com/api-evangelist/cloudwalk | README.md; commit45fc903c5bb1a94541940258ad7e72622db25f69,20/10/2026 | Declara perfil independente, sem afiliação/endosso; OpenAPI/AsyncAPI gerados não são spec oficial |
| https://github.com/odinizfilho/infinitepay-php | README.md; commit04c96f8a54112a59724d83f3a2fb8633f21cd0ef,13/07/2026 | SDK de terceiro; links voltam a F1/F2. Não adotar suas afirmações como contrato |
| https://packagist.org/packages/odinizfilho/infinitepay-php | Catálogo do SDK anterior | Pista de reconciliação; não fonte normativa |
| https://github.com/ecomplus/app-infinitepay | README.md; commit034837555ec8753810eae6725210dbc5a88c2a86,08/01/2024 | Integração de terceiro; seção webhook inclui notificações E-Com Plus, não confundir com assinatura InfinitePay |
| https://www.reclameaqui.com.br/infinite-pay/dificuldade-de-contato-via-whatsapp-e-duvidas-sobre-funcionalidade-de-webhook-no-site-infinitepay-checkout_xQ9lYbF2H_eSqXnf/ | Relato indexado; não adotado como contrato | Não trouxe especificação pública oficial adicional; não emitir juízo sobre serviço |
| https://infinitypay.me/developers/webhooks e https://developer.infini.money/docs/en/7-webhook | Nomes/produtos distintos, sem vínculo demonstrado a Checkout InfinitePay | Excluir HMAC, headers, retry e APIs desses resultados; não transferir ao projeto |

Datas de commit são das revisões lidas do README, não garantias de atualização
normativa. Não foi localizado OpenAPI/Swagger/Postman oficial do Checkout nas
superfícies públicas examinadas. Não foram reproduzidas sondagens de caminhos
privados descritas pelo catálogo de terceiros. Alegações de HMAC em sites comerciais
sem fonte oficial não validam um segredo do provider.

### 15. Confronto com o HEAD real

Inspeção em9bda18bd, `functions/checkout-payment.js`, `functions/index.js` e
`functions/checkout-reservation.js`. Sem alteração. Não foi apenas reutilizada a memória.

| Assunto | Contrato atual localizado | HEAD | Gap / decisão |
|---|---|---|---|
| Criação | F2/F5 modo handle, F1 também key/opções | POST/links, handle/items/order_nsu | Modo básico continua respaldado; não exigir key sem distinguir opções |
| Autenticação | API Key opcional para básico | Content-Type JSON, sem X-Api-Key | Não alegar origem/consulta por credencial; migração avançada depende contrato/config |
| Webhook | String F2/F5; objeto/events F1 | webhook_url persistida por loja | Compatibilidade dos modos e seis eventos pendente |
| Dispatcher | Nomes F1, envelope ausente | Nenhum dispatcher; event/type não autoriza | Não implementar parser especulativo |
| Consulta | Aprovação F1/F2; F3 mais amplo sem schema | provider.check com referências e conta persistidas | Não inferir recusada/processando/refund |
| Estado financeiro | Interno separado do provider | PENDING/PAID/EXPIRED; preserva REFUNDED histórico | FAILED/REFUNDED automáticos não implementados |
| Estado operacional | Regra nossa | CONFIRMED só com pagamento/reserva elegíveis | Cancelar pedido pago exige revisão, não é refund |
| Reserva/estoque | Regra nossa | HELD→CONSUMED ou RELEASED, transacional | Não restaurar por rótulo de refund |
| Recibos | Regra nossa | Conta/transação, CONFIRMED ou REVIEW, idempotente | Não há histórico validado de evento de refund |
| Reconciliation | Referências oficiais + validação nossa | Vínculo/loja/pedido/proprietário/valor/método | Sem afirmar resposta ecoa IDs que não publica |
| Criação ambígua | Provider idempotency/lookup não localizado | CREATING→RECONCILIATION_REQUIRED, sem retry cego | Proteção local mantida; não alegar idempotência remota por order_nsu |
| Retry/HTTP |200 sucesso/400 retry em F2; preferência<1s | JSON200 ou status de erro; timeout de saída15s | Prazo15s não equivale à recomendação<1s; política/cutoff do provider não publicada |

### 16. Implicações de segurança

API Key de saída e HTTPS não autenticam remetente do webhook; handle é identificador,
não segredo. Reconsulta pode confirmar aprovação, mas não comprova todos os eventos.
Um paid:true antigo pode continuar positivo após refund: não tratá-lo como prova de
que refund não ocorreu. IP/UA/campos JSON e HMAC inventado não resolvem o problema.

Guardas locais/idempotência limitam efeitos; não certificam proveniência ou schema
que faltam. Recebimento de sinal deve ser separado de evidência financeira e de
transição operacional. Quaisquer mudanças futuras precisam incluir correlação,
deduplicação de evento/transação, não regressão, isolamento e auditabilidade.

### 17. Impacto nos critérios oficiais da Fase 9

| Critério oficial, peso interno25% | Evidência antiga | Nova evidência | Status / bloqueio |
|---|---|---|---|
| Verificação server-side/correlação | Código/testes + PAID DEV homologado | F1/F2/F5 continuam descrevendo consulta | Concluído no escopo de aprovação; não amplia para todos os estados |
| Idempotência/conferência | Recibo/estoque único, duplicidade/out-of-order emulados | Retry público confirmado, garantia/ID universal ausentes | Concluído localmente; não inventar garantia do provider |
| Recuperação/tentativas | Criação ambígua bloqueada, retomada e expiração | Lookup/idempotência remota adicionais não localizados | Concluído conforme critério vigente; limites externos explícitos |
| Contrato/tratamento estados financeiros restantes | Dependência documental + transições não implementadas | Nomes confirmados; autenticidade/schema/consulta sem contrato suficiente | PENDENTE; exige esclarecimento antes da implementação |

Nenhum marco novo completo: Fase9 **75%**, Global **95,00%**. Restam8×25%=**2,00p.p.**
para97,00%; sem crédito por descoberta isolada. Fases11/12=100%; Fase13=0%.
Não exigir refund API automatizada se o contrato oficial permitir outro mecanismo
operacional verificável. Nesta rodada ele não foi estabelecido nem implementado.

### 18. Perguntas externas consolidadas — somente o não respondido

Estas cinco substituem a pergunta preliminar da rodada anterior. Nenhuma foi enviada.

#### Pergunta 1 — CRÍTICA — autenticidade

**PERGUNTA:** Qual mecanismo suportado comprova a origem dos webhooks do Checkout
Integrado? Enviem a especificação de validação (headers, assinatura/secret, conteúdo
assinado, rotação e replay), ou o procedimento oficial alternativo quando não houver
assinatura, principalmente para eventos não confirmáveis por payment_check.

**POR QUE:** não conceder autoridade a um POST arbitrário. **JÁ SABEMOS:** HTTPS e
eventos existem. **FALTA:** prova verificável de origem. **IMPACTO:** bloqueia transições
automáticas não pagas. **FONTES:** F1/F2/F5; nenhum mecanismo nelas localizado.

#### Pergunta 2 — ALTA — consulta e estados

**PERGUNTA:** O blog de integração descreve consulta aprovada/recusada/em processamento,
mas a referência vinculada mostra paid. Qual endpoint, autenticação, campo e enum
distinguem esses estados? Como confirmar posteriormente refunded, canceled e
payment_failed, inclusive refund parcial e aprovação histórica seguida de estorno?
Informem IDs requeridos e como a consulta vincula conta, pedido, transação e valor.

**POR QUE:** uma negativa booleana não distingue falha de processamento. **JÁ SABEMOS:**
consulta de aprovação. **FALTA:** contrato normativo dos estados adicionais. **IMPACTO:**
conciliação segura. **FONTES:** F1/F2/F3.

#### Pergunta 3 — ALTA — schema e ciclo dos eventos

**PERGUNTA:** Disponibilizem schemas versionados dos seis eventos e regras de entrega:
envelope/discriminador, IDs/valores/timestamps, refund parcial, identificação única,
duplicidade/ordenação e política de retry/timeout/HTTP. payment_failed encerra somente
a tentativa ou também a cobrança, permite retry e pode preceder paid? Quais atores
e situações geram canceled, e qual a relação de settled com paid?

**POR QUE:** parser e máquina de estados não podem ser adivinhados. **JÁ SABEMOS:** nomes
e definições gerais, reentrega em erro. **FALTA:** estrutura/lifecycle normativos.
**IMPACTO:** dispatcher, auditoria e não regressão. **FONTES:** F1/F2/F5.

#### Pergunta 4 — MÉDIA — modos/versões de integração

**PERGUNTA:** webhook_url por handle e webhook:{url,events} com opções avançadas são
modos compatíveis? Quais recursos exigem X-Api-Key, quais parâmetros ela substitui
em links/payment_check e como migrar links existentes? Há versão/depreciação e
contrato de idempotência ou recuperação de criação ambígua por order_nsu?

**POR QUE:** não quebrar a integração básica já homologada. **JÁ SABEMOS:** API Key
opcional no básico; dois formatos publicados. **FALTA:** matriz de compatibilidade e
limites normativos. **IMPACTO:** mudança futura controlada. **FONTES:** F1/F2/F4/F5.

#### Pergunta 5 — MÉDIA — operação de devolução/cancelamento

**PERGUNTA:** Há API pública suportada para solicitar refund/cancelamento no Checkout
Integrado? Se houver, forneçam sua documentação. Se o procedimento suportado for
App/Conta, como obter comprovante/identificadores e atualizar nossa conciliação de
forma verificável, inclusive devolução parcial e diferenças Pix/cartão?

**POR QUE:** fechar tratamento operacional sem endpoint privado. **JÁ SABEMOS:** App e
navegador permitem operações, e há devolução Pix parcial. **FALTA:** interface de
integração e prova associável. **IMPACTO:** rastreabilidade; não implica executar refund
nem exigir sua automação. **FONTES:** F7–F12 e ausência de API nas referências técnicas.

### 19. Canal recomendado e próximo passo

**parcerias@cloudwalk.io**, confirmado na FAQ “Onde encontro a documentação técnica?”
de F4, é o canal publicado para dúvidas de integração. Alternativa de atendimento:
ajuda@infinitepay.io/chat oficial do App. Não usar canal de segurança/vulnerabilidade
para dúvida contratual comum. Nenhum e-mail, ticket, chat ou mensagem foi enviado.

**CONTRATO CONFLITANTE/INCOMPLETO:** obter resposta oficial às cinco perguntas e
referências normativas; depois planejar implementação/testes mínimos. Preservar modo
básico e PAID homologado. Somente após contrato + implementação + testes avaliar
fechamento do quarto marco. Sem novo pagamento/refund, deploy DEV/PROD ou WhatsApp.

## Fechamento interno — 2026-10-21

Base f78fb9e7; correção funcional **8ea926a8**. A auditoria pública acima continua
válida como evidência documental/histórica. Esta seção atualiza apenas a implementação
local e a preparação interna, sem alegar novo contrato ou evento real.

### Pendências resolvidas independentemente do provider

1. Política defensiva `functions/payment-signal-policy.js`: enums conhecidos e
   inspeção pura. Não declara envelope oficial. Hints event/type/status desconhecidos,
   conflitantes, malformados ou diferentes de paid são retidos, não autorizadores.
2. `checkout-payment.js`: retenção ocorre antes de consulta ou escrita; auditoria
   operacional sanitizada e aguardada; resposta UNVERIFIED não é estado financeiro.
   Falha de auditoria recebe503 sem efeitos. Corpo/referências inválidos recebem400,
   sem coerção de objetos. Referências válidas copiadas antes de awaits.
3. Fluxo básico sem hint, ou com indicação paid, continua dependendo da mesma consulta
   server-side e transação de conciliação. Nenhum nome de evento confirma pagamento.
   Não foi implementada transição automática FAILED/CANCELED/REFUNDED/SETTLED.
4. Incompatibilidade histórica H (checkpoint de10/10) resolvida: permitir host exato
   checkout.infinitepay.com.br documentado em F2/F5, sem liberar domínios similares,
   HTTP, userinfo ou portas alternativas. Criação ambígua continua sem retry cego.
5. Inventário do plano, matriz dos20 cenários, plano de promoção/retorno e perguntas
   consolidados em [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

Auditoria usa Cloud Logging/logger, não nova coleção Firestore nem recibo financeiro.
Campos: outcome, reason, eventHint de allowlist e hash abreviado de referência válida;
sem payload, credenciais, UID, handle ou NSU integral. Log não prova origem e não
garante persistência remota exatamente uma vez. Retenção não implica replay automático
posterior; payload bruto não é armazenado para esse propósito.

### Resultado da bateria final

| Coorte desta execução | Resultado | Limites |
|---|---|---|
| Financeiro/HTTP/reservas/config/Rules + Customer pedidos + multiloja |65/65 PASS |7 arquivos, Auth/Firestore demo; provider/Maps sintéticos |
| Política/financeiro/diagnósticos/reservas/prefill/frete/auth unitários |31/31 PASS |Inclui a primeira rodada13/13; não somar novamente |
| CRM ApplicationGate/InfinitePaySettings/OrderPaymentStatus |36/36 PASS |3 suítes focadas; não alegar411 testes repetidos |
| Lint dos5 arquivos do delta |0 erros/0 avisos |Avisos externos de base de navegador antiga; não esconder lint ampliado preexistente |
| Sintaxe Node e diff-check |PASS |Frontend, Rules e dependências inalterados |

Build/ESM frontend e homologação remota das Fases11/12 aproveitados, sem repetir
por mudança exclusivamente backend. Não há etapa de build de Functions no package;
os módulos reais foram carregados pelos testes HTTP/Firestore. Nada publicado.
Novos casos HTTP exercitam PENDING e PAID com provider configurado para responder
positivo, mas comprovam que hints retidos não o consultam, não alteram snapshots e
não criam recibos. Aprovação repetida produz um único CONFIRMED; uma transação
adicional realmente confirmada continua exigindo REVIEW, não segundo consumo.

### Inventário final de pendências obrigatórias atuais

| Pendência | Interna/externa | Status | Bloqueia Fase9? | Ação |
|---|---|---|---|---|
| Política/parser/auditoria conservadora | Interna | CONCLUÍDA localmente | Não | Código/testes versionados |
| Allowlist do checkout documentado | Interna | CONCLUÍDA localmente | Não | Casos positivos e negativos, sem nova cobrança |
|20 cenários e regressão de ownership/multiloja/CRM | Interna | CONCLUÍDA | Não |65+31+36 testes atuais |
| Inventário/readiness/rollback/smoke e plano condicional | Interna/documental | CONCLUÍDA como preparação | Não | Execução PROD pertence à Fase13 autorizada |
| Triagem de histórico, opcionais e backlog aceito | Interna/documental | CONCLUÍDA como triagem | Não | Não confundir com correção das dívidas D/E |
| CONTRATO EXTERNO INFINITEPAY | Externa | PENDENTE | SIM | Resposta oficial e posterior implementação/testes condicionais |

**Todas as pendências internas pré-PROD obrigatórias e solucionáveis agora foram
concluídas. A única dependência restante para a conclusão da Fase9 é resposta técnica
oficial da InfinitePay sobre o contrato dos eventos não-PAID.** Isso não declara zero
backlog, produto publicado com este delta ou prontidão real de PROD. Mantidos no
readiness os itens D/E e tarefas futuras da Fase13, sem apagá-los ou marcá-los corrigidos.

### PENDÊNCIA EXTERNA — INFINITEPAY

Somente lacunas da seção18, agrupadas em uma dependência, sem contato enviado:

- Mecanismo verificável de origem, incluindo proteção contra replay quando aplicável.
- Endpoint/campo/enum de confirmação de payment_failed/canceled/refunded e relação
  com o texto aprovado/recusado/processando; aprovação histórica versus refund posterior.
- Schema/IDs/valores/timestamps e ciclo dos seis eventos, retry/ordenação/duplicidade.
- Compatibilidade webhook_url versus objeto/events; quais recursos avançados exigem
  API Key e quais campos ela substitui. **Não perguntar se a key é opcional no básico:**
  isso já está documentado. Manter a parte não respondida sobre migração/idempotência.
- API pública suportada de refund/cancelamento, ou evidência verificável das operações
  App/Conta; confirmação de parcial/Pix/cartão na integração. **Não perguntar se App,
  navegador ou devolução Pix parcial existem:** já documentados.

### IMPLEMENTAÇÃO PENDENTE APÓS RESPOSTA DA INFINITEPAY

| Resposta oficial | Implementação/teste condicionado, ainda não ativado |
|---|---|
| HMAC/assinatura oficialmente especificada | Validar bytes/headers/algoritmo/rotação/timestamp/replay conforme contrato; testar inválido/ausente/repetido. Não basta assinatura para ignorar ownership/valor/estado |
| Consulta autenticada de estados | Webhook continua sinal; consultar conta/referências persistidas, validar resposta/correlação e só então aplicar transição permitida, com idempotência e auditabilidade |
| Nenhuma autenticação nem consulta suficiente | Preservar retenção; definir procedimento manual com prova externa verificável, Staff autorizado/backend/auditoria e associação inequívoca. Não criar gravador financeiro pelo navegador |
| API pública de refund existe | Documentar autorização, parcial/total, idempotência e evidência; não habilitar ou operar sem autorização financeira específica |
| API pública de refund não existe | App/Conta continuam procedimento externo; definir como comprovar e conciliar, sem engenharia reversa |
| Esclarecimento insuficiente/conflitante | Não ativar transições nem fechar Fase9; perguntar somente a lacuna remanescente |

Receber resposta não aplica automaticamente estado financeiro nem muda percentual.
Separar refund de fulfillment; não restaurar estoque sem regra de negócio autorizada.
Provider pode exigir alteração ainda não conhecida; prontidão significa poder retomar
imediatamente o trabalho, não prometer implementação antecipada de contrato desconhecido.

Fase9 **75%**, Fase11 **100%**, Fase12 **100%**, Global **95,00%**, Fase13 **0%**.
Sem deploy DEV/PROD, Rules, dados remotos, pagamento/refund/cancelamento real ou WhatsApp.
