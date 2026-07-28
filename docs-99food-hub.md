# 99Food Hub - Integração Operacional

O `99Food Hub` torna a plataforma Ana Guimarães Doceria a fonte operacional de estoque, catálogo, pedidos e auditoria por loja. Esta documentação descreve o contrato público vigente da 99Food e os limites de segurança para desenvolvimento.

## Alerta crítico: Firebase local não é um ambiente DEV isolado

O arquivo `.firebaserc` deste repositório aponta o projeto padrão para `crmdoceria-9959e`. O alvo de hosting `dev` (`crmdoceria-9959e-dev`) é apenas outro site de Hosting dentro desse mesmo projeto Firebase; ele não cria Firestore, Functions, Secret Manager, filas ou agendadores separados.

Consequências:

- não executar testes vivos de Functions, Firestore, Secret Manager, jobs ou webhooks usando o projeto padrão;
- não salvar credenciais Test da 99Food no namespace produtivo;
- não habilitar polling ou publicação de catálogo no backend produtivo para validar DEV;
- não assumir que publicar apenas no hosting `dev` isola o backend;
- usar um projeto Firebase DEV dedicado ou a Emulator Suite com mocks da 99Food;
- chamadas reais à aplicação Test da 99Food só podem partir de um backend DEV autorizado, com segredos e dados isolados.

Antes de qualquer teste vivo, confirme explicitamente o `projectId`, os emuladores ativos e o namespace de segredos. Na ausência dessa confirmação, o procedimento deve parar antes de qualquer chamada externa ou gravação.

## Contrato vigente de hosts e ambientes

A 99Food documenta atualmente um único host para a OpenAPI:

| Uso | Base URL oficial |
|---|---|
| API de desenvolvimento/teste | `https://openapi.99food.com` |
| API de produção | `https://openapi.99food.com` |
| Autenticação, nos dois ambientes | `https://openapi.99food.com` |

Não há host público separado de desenvolvimento ou autenticação. O ambiente é definido pela aplicação e pelas lojas criadas no portal:

- `T`: Test environment, usado para desenvolvimento e QA;
- `P`: Production environment, usado somente depois da homologação;
- Sandbox: ferramenta do portal para simular notificações; não é uma API base nem substitui uma aplicação `T` e uma test store.

Em 29/04/2026, a 99Food anunciou a migração de todos os endpoints de `openapi.didi-food.com` para `openapi.99food.com`. O domínio legado teve encerramento contratual previsto para 29/05/2026. Mesmo que ainda responda tecnicamente, não deve ser usado em novas chamadas.

Regras internas obrigatórias:

- resolver o host no backend por allowlist; o Dono pode editar o valor, mas somente uma origem previamente aprovada é persistida;
- permitir somente `https://openapi.99food.com` para o contrato atual;
- tratar Desenvolvimento e Produção como namespaces de credenciais, autorizações, tokens, lojas, filas, locks, cache e auditoria distintos, ainda que compartilhem o mesmo host;
- nunca reutilizar App ID, App Secret, `app_shop_id` ou `auth_token` entre ambientes;
- registrar o ambiente efetivo em todos os eventos e estados operacionais, sem registrar segredos.

## Fonte de verdade operacional

O saldo oficial permanece em `lojas/{lojaId}/produtos/{productId}.estoque`.

Quando um pedido 99Food entra por webhook, a Function busca o detalhe do pedido na OpenAPI, identifica os itens por `app_item_id`/código PDV, baixa o estoque em transação, grava o pedido interno em `pedidos/food99_{orderId}`, registra a movimentação em `kardex` e atualiza o espelho operacional em `food99Orders`.

Quando uma venda interna, reposição ou ajuste altera o estoque, a disponibilidade publicada na 99Food deve refletir:

- estoque maior que zero: `status = 1` (disponível);
- estoque igual a zero: `status = 2` (indisponível).

A OpenAPI de disponibilidade não representa o saldo interno completo; a quantidade continua auditada no Firestore e a 99Food recebe a disponibilidade compatível com seu contrato.

## Modelo de dados esperado por ambiente

Os nomes físicos podem evoluir de forma aditiva, mas o modelo lógico precisa garantir os namespaces abaixo.

| Escopo lógico | Conteúdo esperado |
|---|---|
| `integrations/food99` | Índice público/sanitizado da integração, sem segredos ou tokens |
| `integrations/food99/environments/{environment}` | Host permitido, referências de App ID/App Secret, fingerprint mascarado, status e auditoria de `development` ou `production` |
| `lojas/{lojaId}/food99/{environment}` | `app_shop_id`, vínculo da loja, status da autorização, expiração do `auth_token` e flags operacionais daquele ambiente |
| Secret Manager por `environment` | App Secret e `auth_token` protegidos; nunca armazenar valores em claro no Firestore |
| `lojas/{lojaId}/food99Orders/{orderId}` | Espelho de pedidos com `environment`, `appIdFingerprint` e identificadores externos |
| `lojas/{lojaId}/food99Events/{eventId}` | Idempotência de webhooks/eventos, sempre vinculada ao ambiente |
| `lojas/{lojaId}/food99WebhookEvents/{eventId}` | Idempotência e ordenação dos eventos de vínculo por ambiente e timestamp oficial |
| `lojas/{lojaId}/food99ProductMappings/{productId}` | Mapeamento de produto por ambiente e `app_shop_id` |
| `lojas/{lojaId}/food99Alerts/{alertId}` | Alertas ativos/históricos deduplicados por ambiente, endpoint e causa |
| `lojas/{lojaId}/food99Audit/{auditId}` | Auditoria sanitizada com ambiente, host, endpoint, request ID e errno |
| `lojas/{lojaId}/food99Health/{environment}` | Estado da conexão e última comunicação por ambiente |
| Fila/lock de catálogo | Chave contendo ambiente, fingerprint do App ID e endpoint; estado por loja para deduplicação do cardápio |

Compatibilidade com dados existentes:

- o documento legado `lojas/{lojaId}/food99/config` pode ser lido durante uma migração aditiva;
- um registro legado sem ambiente não deve ser presumido como Desenvolvimento;
- qualquer promoção para o novo modelo deve copiar metadados sanitizados e referências protegidas, nunca o valor do segredo;
- mappings legados de Produção permanecem somente leitura; a primeira atualização cria uma cópia aditiva no ID escopado e retries preferem essa cópia sem apagar o histórico;
- leituras e jobs devem exigir ambiente explícito antes de operar.

## Credenciais, autorização e tokens

### Credencial global da aplicação

Cada ambiente possui seu próprio:

- App ID;
- App Secret;
- tipo da aplicação no portal (`T` ou `P`);
- configuração de webhook;
- metadados internos mínimos para isolar o runtime por aplicação.

O App Secret permanece no Secret Manager e não integra respostas gerais. Somente o Dono global pode solicitá-lo explicitamente pela callable dedicada: a resposta usa `no-store`, a visualização é auditada e o frontend remove o valor ao ocultar, trocar de aba ou desmontar. O valor nunca entra em logs, auditoria ou armazenamento persistente do navegador.

O App ID completo também é lido por endpoint protegido e nunca é incluído na resposta entregue a outros perfis. A autoridade reutiliza o perfil normalizado existente em `users/{uid}`: somente `dono` com escopo global (`allStores`) administra a configuração central. Gerentes e demais perfis recebem apenas as URLs em modo leitura e flags sanitizadas.

API base, autenticação e webhook são normalizados antes da transação. API e autenticação aceitam somente `https://openapi.99food.com`; o webhook exige HTTPS público e rejeita credenciais embutidas, fragmentos, localhost, IPs privados/link-local e hosts de metadata. Falhas e requisições sem mudança não alteram o documento nem as referências de secrets.

App ID e App Secret são substituídos separadamente. O backend exige confirmação, compara com a versão ativa, evita versão duplicada, cria a nova versão sem excluir as anteriores e atualiza ponteiro + auditoria em uma transação Firestore. A auditoria registra apenas usuário, UID, contexto, ambiente, nome lógico do secret e número da versão.

O contrato público de webhook usa o App Secret para verificar `didi-header-sign`. Um segredo interno adicional não substitui esse mecanismo, salvo extensão específica formalmente fornecida pela 99Food.

### Autorização da loja

O fluxo self-service oficial é:

1. chamar `POST /v1/auth/authorizationpage/getUrl` com o `app_id` declarado na documentação atual;
2. receber da 99Food uma URL de autorização com validade de sete dias;
3. abrir ou enviar essa URL ao superadministrador da loja;
4. o superadministrador autentica-se no portal 99Food e escolhe a loja a vincular;
5. aguardar o webhook assinado `shopBindStatus` com `bindStatus` e `appShopIDList`;
6. validar assinatura, App ID, ambiente e `app_shop_id` antes de marcar a loja como autorizada;
7. obter o `auth_token` da loja e só então habilitar operações.

Esse fluxo não é OAuth. O contrato público não descreve `authorization_code`, `state` ou callback de navegador. Não inventar esses parâmetros nem simular um callback OAuth. A correlação interna da solicitação pode ser auditada, mas a confirmação externa deve vir do webhook `shopBindStatus` ou de uma consulta oficial posterior.

O botão **Verificar autorização** reconcilia callbacks históricos, perdidos e também revogações não recebidas usando `POST /v1/shop/shop/list`. O backend assina `app_id`, `page_no`, `page_size` e `timestamp`, compara o `app_shop_id` como string exata e só confirma registros com `bound_flag=1`. A consulta usa cooldown distribuído de 20 segundos por ambiente e aplicação; nenhuma credencial, assinatura ou resposta completa entra em logs/auditoria. Listas com mais de 100 lojas avançam por cursor persistente a cada verificação, sem repetir para sempre a primeira página; o cursor volta à página 1 quando o `app_shop_id` muda. Somente uma varredura completa sem correspondência suspende uma autorização local existente. Se a própria 99Food rejeitar a listagem com `errno 10002` (erro de parâmetro), a reconciliação usa o endpoint oficial `GET /v1/auth/authtoken/get` como alternativa: o vínculo só é confirmado depois que o token retornado também passa em `GET /v1/shop/shop/detail`. `errno 10101` mantém a loja aguardando autorização, enquanto `14105/14106` identifica credenciais inválidas.

Quando a lista confirma o vínculo, o backend obtém o token, consulta `shop/detail` com esse token e somente depois grava autorização, saúde e auditoria em uma única transação. Uma falha de detalhe nunca deixa a loja marcada como autorizada nem publica um ponteiro de token parcial.

Nos webhooks, o `app_id` oficial chega como inteiro JSON de 64 bits. O payload autenticado é lido sem arredondar inteiros maiores que o limite seguro do JavaScript; usar diretamente o número convertido pelo parser padrão poderia rejeitar um evento legítimo como `application mismatch`. Eventos `shopBindStatus` em lote são aplicados loja a loja, com o próprio `bindStatus`, de forma transacional, idempotente e ordenada pelo timestamp oficial. Como o contrato oficial inclui `timestamp` e não oferece outro ID estável para esse evento, um `shopBindStatus` sem timestamp é aceito sem mutação e deve ser reconciliado pela lista oficial; isso impede que um replay antigo reverta um vínculo mais recente.

O endpoint `POST /v3/auth/authorization/shopBind` possui acesso controlado e é explicitamente exclusivo de Produção. Ele não deve ser usado para autorizar uma test store. Em Desenvolvimento, crie uma aplicação `T` e uma test store no portal.

### `auth_token` e renovação

A 99Food usa um `auth_token` próprio para cada loja autorizada:

- não existe `access_token` separado nesse protocolo;
- não existe `refresh_token`;
- a validade é aleatória e vem em `token_expiration_time`;
- lojas diferentes não compartilham token;
- ambientes diferentes nunca compartilham token.

Fluxo correto:

1. chamar `GET /v1/auth/authtoken/get` com `app_id`, `app_secret` e `app_shop_id`;
2. se houver sucesso, proteger o `auth_token` e sua expiração;
3. somente quando `/get` retornar `10102`, chamar `GET /v1/auth/authtoken/refresh`;
4. após refresh bem-sucedido, chamar `/get` novamente para obter o novo token;
5. persistir o novo token e a nova expiração de forma atômica.

O refresh retorna confirmação, não o novo token. O limite publicado é 1 chamada a cada 30 segundos e a documentação informa cooldown funcional de dois minutos para gerar outro token. Aplicar single-flight por ambiente, App ID e loja.

Na implementação, o lock distribuído cobre a sequência completa `get/refresh -> get -> Secret Manager -> Firestore`, com lease de dois minutos. Um `10102` (ou rejeição HTTP 401) vindo de uma operação de negócio invalida o cache e grava uma solicitação de recuperação no documento de autorização, inclusive quando o endpoint original permite somente uma tentativa. A recuperação é limitada a três ciclos consecutivos e só é zerada após uma operação autenticada bem-sucedida, evitando tanto rajadas quanto loop infinito.

Tratamento mínimo de erros:

| Errno | Significado contratual | Ação segura |
|---|---|---|
| `10101` | A loja não possui `auth_token` | Marcar “Aguardando autorização”, suspender polling e catálogo; não chamar refresh em loop |
| `10102` | `auth_token` expirado | Executar uma única sequência `refresh -> get`, respeitando cooldown |
| `14106` | App Secret incorreto para o App ID | Marcar credencial inválida, suspender jobs e revisar aplicação/ambiente; o endpoint de token não usa `sign` |

## Assinaturas

### Endpoints que declaram `sign`

A assinatura MD5 aplica-se aos endpoints que declaram os campos `app_id`, `timestamp` e `sign`, como a listagem de lojas vinculadas. Não adicionar `sign` indiscriminadamente a endpoints que declaram apenas `auth_token` ou aos endpoints de token que recebem `app_secret` diretamente.

Algoritmo oficial:

1. coletar os parâmetros assináveis, excluindo bytes/arquivos, o próprio `sign` e valores vazios;
2. ordenar os nomes das chaves por ASCII crescente;
3. serializar cada entrada como `chave=valor`;
4. unir as entradas com `&`;
5. anexar o App Secret diretamente ao fim, sem separador;
6. calcular MD5 sobre os bytes UTF-8;
7. enviar o hexadecimal minúsculo no campo `sign`.

O `timestamp` é Unix time em segundos. Nenhum `nonce` é documentado. Os exemplos oficiais tratam listas/objetos como o literal `Array` durante a composição; siga o contrato específico do endpoint. Preserve App IDs e outros inteiros de 64 bits como strings em JavaScript para evitar perda de precisão.

### Webhooks

Para webhooks, a assinatura é diferente:

1. obter o corpo HTTP bruto, sem reserializar JSON;
2. concatenar `rawBody + App Secret`;
3. calcular MD5 em UTF-8;
4. comparar em tempo constante com o header exato `didi-header-sign`;
5. rejeitar a requisição antes de processar qualquer evento se a assinatura for inválida.

A resposta esperada para um webhook aceito é JSON com `errno: 0`. O timeout publicado para callbacks é de seis segundos; processamento pesado deve ser enfileirado depois da validação e da persistência idempotente.

## Teste de conexão

Não há endpoint público dedicado de health check nem endpoint que revele se um App ID pertence a Test ou Production.

Comportamento seguro do botão “Testar conexão”:

1. validar ambiente explícito e projeto Firebase DEV/emuladores;
2. resolver o host pela allowlist do backend;
3. verificar a presença das referências protegidas de App ID/App Secret do ambiente;
4. validar localmente a composição MD5 com fixture não secreta;
5. se a loja ainda não estiver vinculada, informar “Aguardando autorização” sem chamar refresh;
6. quando houver vínculo, executar `/authtoken/get`;
7. somente em `10102`, executar `refresh -> get`;
8. com token válido, chamar `GET /v1/shop/shop/detail` para validar a integração completa da loja.

Para validar apenas App ID e assinatura, `POST /v1/shop/shop/list` é o candidato público mais próximo: usa `app_id`, `timestamp` e `sign`, sem token da loja, e possui limite de 1 chamada a cada 20 segundos. A documentação não o denomina health check; seu uso deve respeitar o limite e não substitui a validação da loja.

## Publicação de catálogo

`POST /v3/item/item/upload` é um upload consolidado e assíncrono:

- recebe `auth_token`, `menus`, `categories`, `items` e `modifier_groups`;
- suporta um menu lógico e sobrescreve o menu existente da loja;
- retorna `taskID`;
- conclui em background;
- deve ser acompanhado por `POST /v1/item/item/getMenuTaskInfo` ou pelo webhook `uploadMenuTaskStatus`.

O limite oficial é `1req/1min` por aplicação. Como várias lojas podem compartilhar o mesmo App ID, o limitador efetivo precisa ser global por ambiente + App ID + endpoint, e não apenas por loja. A fila pode deduplicar e manter estado por loja, mas o dispatcher deve serializar todas as chamadas daquele App ID.

Regras da fila:

- consolidar todas as alterações pendentes da loja em um cardápio completo;
- manter no máximo um job pendente por versão de cardápio/loja;
- usar lock distribuído e estado persistente;
- calcular `nextAllowedAt` com pelo menos 60 segundos e margem de segurança;
- reagendar sem bloquear a thread;
- não executar retry imediato após limite;
- só remover o job depois de persistir o `taskID` e o estado da tentativa.

Callables e triggers apenas consolidam e gravam o job. Somente o dispatcher do scheduler executa `item/upload`; portanto uma alteração de produto nunca realiza upload externo dentro do trigger.

O errno `10005` é contextual:

- como erro top-level com mensagem de frequência, significa rate limit;
- dentro do resultado assíncrono de menu, pode significar item inexistente.

Classifique por endpoint, nível do erro e `errmsg`; nunca apenas pelo número globalmente.

## Polling e jobs

Polling, catálogo e sincronizações só podem executar quando todos os critérios forem verdadeiros:

- ambiente explícito;
- integração habilitada naquele ambiente;
- App ID/App Secret do mesmo ambiente;
- loja autorizada para o mesmo App ID e ambiente;
- `app_shop_id` válido;
- `auth_token` válido ou renovável por `10102`;
- projeto Firebase DEV/emulador confirmado durante desenvolvimento.

`10101` e `14106` são falhas definitivas até intervenção humana. Não aplicar retry contínuo. Timeout, HTTP 5xx e falhas transitórias podem usar backoff exponencial com jitter e limite de tentativas.

## Checklist manual seguro de Desenvolvimento

1. Confirmar que Functions, Firestore, Secret Manager e filas apontam para um projeto Firebase DEV dedicado ou para emuladores. Não continuar usando o projeto padrão `crmdoceria-9959e`.
2. No portal 99Food, criar ou selecionar uma aplicação do tipo `T` e uma test store.
3. Na aplicação, selecionar `Desenvolvimento` — não “Produção” e não um host “Sandbox”.
4. Confirmar que o backend resolveu `https://openapi.99food.com` pela allowlist.
5. Cadastrar somente o App ID/App Secret da aplicação `T` no namespace protegido de Desenvolvimento.
6. Iniciar a autorização por `/v1/auth/authorizationpage/getUrl` ou usar a test store já criada/vinculada no portal.
7. Concluir a autorização com o superadministrador e aguardar `shopBindStatus` assinado.
8. Confirmar `app_shop_id`, App ID e ambiente antes de persistir o vínculo.
9. Executar “Testar conexão”: `/get`; apenas em `10102`, `refresh -> get`; depois `/shop/shop/detail`.
10. Habilitar polling somente após o estado “Conectada”.
11. Montar um cardápio consolidado e enfileirar uma única chamada `/v3/item/item/upload`.
12. Respeitar o limitador global do App ID por 60 segundos e acompanhar o `taskID` até conclusão.
13. Conferir logs sanitizados e garantir que nenhum App Secret, `auth_token`, string de assinatura ou corpo sensível foi registrado.

## Functions da integração

| Function | Tipo | Objetivo |
|---|---|---|
| `food99GetConfiguration` | Callable | Carregar configuração, permissões e health |
| `food99GetPlatformConfiguration` | Callable | Retornar configuração protegida e App ID somente ao Dono, sem carregar App Secret |
| `food99RevealPlatformAppSecret` | Callable | Revelar sob demanda somente o App Secret ao Dono, com `no-store` e auditoria |
| `food99AuditPlatformAppSecretCopy` | Callable | Auditar a cópia concluída do App Secret sem receber o valor |
| `food99ReplacePlatformSecret` | Callable | Substituir App ID ou App Secret de forma independente e idempotente |
| `food99SavePlatformConfiguration` | Callable | Salvar URLs e opções globais validadas em transação |
| `food99SaveConfiguration` | Callable | Salvar `app_shop_id`, autorização e regras por loja/ambiente |
| `food99StartAuthorization` | Callable | Gerar a URL oficial e registrar a solicitação interna de autorização |
| `food99CheckAuthorization` | Callable | Confirmar por `shopBindStatus` ou reconciliar pela lista oficial de lojas vinculadas; depois validar token e loja |
| `food99TestConnection` | Callable | Validar configuração sem refresh indevido |
| `food99LoadMerchants` | Callable | Carregar detalhe da loja autorizada |
| `food99PollNow` | Callable | Executar polling somente com autorização válida |
| `food99OrderAction` | Callable | Confirmar, marcar pronto/entregue ou cancelar pedido |
| `food99LoadCatalogProducts` | Callable | Ler catálogo v3 da 99Food |
| `food99ImportCatalogProduct` | Callable | Trazer item existente para revisão interna |
| `food99PublishProducts` | Callable | Consolidar e enfileirar publicação de menu v3 |
| `food99SaveProductMapping` | Callable | Vincular produto interno a `app_item_id` por ambiente |
| `food99SyncStockNow` | Callable | Reconciliar disponibilidade manualmente |
| `food99ScheduledPoll` | Scheduler | Executar polling elegível com backoff |
| `food99ProductStockChanged` | Trigger | Consolidar mudanças antes de sincronizar |
| `food99Webhook` | HTTP | Validar `didi-header-sign` sobre o corpo bruto, preservar App ID de 64 bits, persistir e enfileirar eventos |
| `food99HubApi` | Cloud Run/HTTP | API própria do projeto: `GET /health` sem segredos e `POST /webhook` reutilizando integralmente a validação oficial do webhook |

`API base efetiva` e `Autenticação efetiva` permanecem em `https://openapi.99food.com`, pois esse é o host oficial publicado pela 99Food para os endpoints OpenAPI. A API `food99HubApi` pertence ao projeto Google da doceria e deve ser usada como URL pública de callback no formato `https://<serviço>.a.run.app/webhook?environment=<ambiente>`; ela não substitui o host do provedor.

## Fontes oficiais

- [99Food Open Platform](https://developer-food.99app.com/pt-BR/openapi)
- [Changelog — migração do domínio, node 2077](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=2077&lang=pt-BR)
- [Tools Introduction — aplicações Test/Production e Sandbox, node 1879](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1879&lang=pt-BR)
- [Basic Process Overview — fluxo de desenvolvimento e test store, node 1883](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1883&lang=pt-BR)
- [Authorization Testing — validade e renovação de token, node 1895](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1895&lang=pt-BR)
- [Webhooks — assinatura e resposta, node 1921](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1921&lang=pt-BR)
- [API Rate Limit, node 1923](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1923&lang=pt-BR)
- [Authentication & Signature Mechanism, node 1925](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1925&lang=pt-BR)
- [Get Authtoken, node 1929](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1929&lang=pt-BR)
- [Refresh Authtoken, node 1931](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1931&lang=pt-BR)
- [Get Authorization Web Page, node 1935](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1935&lang=pt-BR)
- [Bind Store — restrição a Produção, node 1937](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1937&lang=pt-BR)
- [Get Store Details, node 1943](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1943&lang=pt-BR)
- [List Bind Stores — validação assinada, node 1953](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1953&lang=pt-BR)
- [Store Webhooks — `shopBindStatus`, node 1957](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1957&lang=pt-BR)
- [Upload Store Menu Details, node 1963](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1963&lang=pt-BR)
- [Get Menu Upload Task Info, node 1965](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1965&lang=pt-BR)

Os links `nodedataget` são fontes JSON oficiais consumidas pela própria SPA do portal e podem exigir `Origin`/`Referer` de `developer-food.99app.com` quando acessados diretamente.
