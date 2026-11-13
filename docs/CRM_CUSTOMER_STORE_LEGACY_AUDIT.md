# Clientes por loja — esclarecimento de legado e recebimento manual

## Fechamento técnico — 12/11/2026: release final d1b23d2507ff6204

Hosting DEV final **d1b23d2507ff6204**, bundle **main.ae7de988.js**, 61/61 hashes e 6 rotas conferidos. API **api-00078-rig** e as outras três Functions do alvo permanecem ACTIVE; 143 Functions fora do alvo, Rules, referências de Secrets e variáveis de ambiente preservadas. Sem commit/push.

Na conferência autenticada do agente, somente leitura: Matriz com 6 clientes (Jéssica R$29,56 pendentes; Fabíola R$1,00 confirmado), Garavelo vazio, Visão Geral com 16 canônicos e 38 ocorrências sem loja comprovada; refresh preservou a lista. O modal de recebimento exibiu R$14,78/Cartão de Crédito, checkbox desmarcado e confirmação desabilitada; nenhum recebimento real foi registrado.

A primeira conferência encontrou fechamento do modal por remontagem de Pedidos durante refresh. Corrigido somente o novo modal: estado e renderização na raiz Staff estável, com fechamento ao trocar usuário/loja/seção. Quatro regressões novas comprovam persistência e limpeza de contexto. Também suprimida a aplicação de respostas idênticas do polling de Clientes: mantém consultas/autorização, mas evita remontar formulários sem mudança real. Três testes novos cobrem igualdade, mudança de métricas/permissões e recuperação após erro; erro continua limpando dados privados.

**650/650 React, 64 suítes PASS** na fonte final; 65 Node de Clientes e 77 integrações previamente aprovados permanecem válidos (backend não alterado após essas execuções). Regressão de taxas: 30 Node/69 integrações por ambiente; PROD local 623 React. Build final passou com 1 worker e heap reduzido após falha de memória; nenhum arquivo pessoal foi apagado ou configuração persistente da máquina alterada. Lint final 0 erros/66 avisos antigos do App; diff-check PASS.

Modal conferido no Chrome DEV em desktop e 390×800, preservado através de atualização/redimensionamento; sem scroll horizontal. Painel de taxas conferido nas duas lojas, padrão STORE e aviso pendente; nenhuma alteração salva. Isso é verificação técnica do agente, não novo aceite do titular nem homologação financeira real. Capturas reais ficaram em Temp, fora do Git, para evitar incluir dados privados da tabela no repositório.

O titular informou **“acredito que 12, mas amanhã eu confirmo”**: hipótese não usada como baseline. Lembrete agendado para **13/11/2026 às 09h**. Confirmação da política, conta compartilhada e credenciais por loja continua pendente. Sem API Key no chat. Global formal **97,00%**, Fase9 **100%**, Fase10 **87,50%**, Fase13 **0%**. PROD permanece bloqueada.


12/11/2026. DEV `crmdoceria-9959e`. Homologação anterior **FAIL**, preservada; Fabíola foi posteriormente finalizada pelo titular, não pelo agente. Não tratar a publicação técnica como aceite visual.

## Causa e dados comprovados

- Fabíola: Customer original `rsYCWdHy8twgP90VKg9M`; pedido Matriz `28a87b2bb042e1c2a5a0df14e5db47bc4250bc1bc7ff34b9a44706f8b7af6ad1`, R$1,00, criado em 08/11/2026, finalizado/entregue e PAID. Depois da finalização, o diretório existente passou a incluí-la. Nenhum pedido adicional foi fabricado, nenhum Customer foi substituído.
- Jéssica: Customer original `DAd99GMGS1jYt4EtAuq0`; pedidos Matriz `28be1f452f5abf9f99b24800968ed2eb29112b5da2d21d7593cdde700e1a1105` e `a3ad83d78b1b2e0ab7ec186779208931c433c1e976d07252c68ffa7d5e6e1249`, ambos R$14,78, criados em 08/11/2026. Estão Finalizado, AGREED_LATER e PENDING. Selecionar método no editor não comprova recebimento. A regra anterior excluía completamente esses pedidos da tabela, confundindo relacionamento comercial com valor recebido.

Agora pedidos a combinar finalizados e pendentes tornam o cliente visível na unidade, com **R$29,56 pendentes e R$0,00 confirmados**, sem fabricar PAID. Valores e datas pendentes têm apresentação própria; não substituem “Última Compra” confirmada. Finalizados offline históricos sem campo financeiro continuam sob a regra histórica; não se exige InfinitePay anterior à sua adoção. Cancelados/reembolsados/em revisão continuam excluídos.

## Todas as 43 ocorrências

As 5 da Matriz são subconjunto das 43 da Visão Geral, não 48. [Classificação pseudonimizada completa](evidence/customer-directory-legacy-dev/legacy-classification.json).

| Casos | Evidência | Tratamento |
|---:|---|---|
| 32 | Pedido raiz com Customer canônico/alias seguro, mas sem loja comprovada | Preservar e solicitar evidência administrativa de loja; não presumir Matriz |
| 6 | Pedido raiz com Customer ausente/não confiável e loja ausente | Regularização administrativa controlada; sem associação automática |
| 4 | Visitantes Matriz sem Customer (2 pendentes, 2 reservas expiradas) | Situação esperada: não associar por telefone, retirar do diagnóstico de corrupção |
| 1 | Pedido legado Matriz com `checkoutIdentity.mode=legacy_phone` e `legacyClientId` válido | Recuperado na projeção, sem modificar documento |

O último é `lojas/ana-guimaraes-doceria-matriz/pedidos/cqYbjNSHtLVrkV7Mr2CL`, R$5,00. A referência autenticada existente resolve para o Customer original. Todos os identificadores presentes precisam convergir; nome/telefone isolados não são chave de junção. Dos 32 pedidos raiz com Customer seguro, 31 estão Finalizado e 1 Pendente. `legacyOrderPaths` comprova acesso privado ao histórico, mas **não comprova loja**; essas referências não foram usadas para inventar Matriz. Os 38 permanecem fora dos totais comerciais por unidade até comprovação de loja; o mecanismo de histórico privado por caminhos aprovados foi preservado.

## Recebimento manual autorizado

O titular autorizou ampliar o escopo para **“Registrar pagamento recebido”** em DEV. Ação separada de editar/finalizar pedido; exige permissão de Pedidos **e** Financeiro na loja, confirmação explícita do valor integral e método real. Somente pedido AGREED_LATER finalizado sem cobrança/provider online, sem cancelamento/revisão/estorno. O método já resolvido é preservado; proteção fiscal impede divergência quando necessário.

Callable `adminOrderReceivePayment`: transação verifica revisão, total server-side, loja, estados e vínculo financeiro. Grava PAID, recibo administrativo e evento append-only `ORDER_PAYMENT_RECEIVED` na trilha existente. Duplo clique/retry/concorrência não duplicam recebimento/auditoria. Se já existe conta a receber vinculada, bloqueia e solicita conciliação, em vez de criar segundo lançamento. Relatórios existentes reconhecem o recebimento pelo pedido; não se cria receita duplicada. Estoque, cupom, nota, provider e valor original não são movimentados por essa ação. Mudança posterior de total/cliente de pedido com recibo manual exige conciliação específica; não se reconcilia silenciosamente.

**Nenhum pedido real foi marcado PAID pelo agente.** A eventual confirmação dos recebimentos da Jéssica cabe ao Staff autorizado após conferir que a loja recebeu de fato.

## Projeção real DEV após a correção

Leitura autorizada, sem writes, usando autorização Staff e projeção atual contra snapshot bounded. [Resultado](evidence/customer-directory-legacy-dev/readonly-audit.json).

| Escopo | Clientes exibidos | Compras confirmadas elegíveis | Confirmado | Pendentes concluídos |
|---|---:|---:|---:|---:|
| Matriz | 6 | 46 | R$898,23 | 2 / R$29,56 |
| Garavelo | 0 | 0 | R$0,00 | 0 |
| Visão Geral | 16 canônicos | 46 | R$898,23 | 2 / R$29,56 |

Os 16 incluem cadastros sem compras; aliases não duplicam clientes. Matriz: 0 ocorrências de regularização restantes; Visão Geral: 38 sem loja confiável. Datas retornadas como Timestamp real; snapshot JSON não foi tratado incorretamente como data nula. Dados reais podem mudar por atuação legítima posterior do titular.

## Segurança, apresentação e desempenho

Status cadastral vazio aparece como “Não informado”. Pendência não é rotulada como recebimento. Diagnósticos técnicos são filtrados no backend conforme papel/capability e também na UI; cache aquecido por Dono não revela caminhos a atendente/gerente. Permissões por loja revalidadas a cada chamada. Nenhuma regra de Auth/ownership mudou.

O orçamento 10.000 continua fail-closed: nunca apresentar soma truncada. Nesta leitura: Matriz91, Garavelo31, Geral139 documentos retornados incluindo autorização; cache quente2 documentos de autorização. Sem N+1 por cliente; custo continua proporcional a cadastros/aliases/pedidos em cache frio. Não se apresenta isso como medição da fatura. Sem migração/agregação nova.

## Validação

**643/643 React, 65/65 Node de Clientes, 77/77 integrações Clientes/recebimento/Rules/fiscal/estoque PASS**. Regressões de pagamento adicionais: 30 Node e69 integrações PASS. Grupos sobrepostos. Mocks/emuladores somente para mutações. Build e diff-check PASS; lint combinado0 erros/66 avisos antigos. Correção de lint declarativa de `globalThis`, sem alteração funcional posterior aos testes.

DEPLOY técnico DEV não equivale a aceite visual: conferir Jéssica pendente, Fabíola, valores/status, isolamento e abrir/cancelar o modal de recebimento, **sem registrar dados reais durante homologação automática**. Não encerrar homologação enquanto houver divergência comprovada; os38 casos sem loja exigem regularização autorizada separada.

Global formal97,00%; Fase9 100%; Fase10 87,50%; Fase13 0%. Sem acesso PROD, migração, alteração histórica, SMS, vínculo, cobrança, estorno ou WhatsApp real. Sem commit/push.
