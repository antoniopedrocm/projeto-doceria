# CRM — carregamento de lojas no DEV

## Escopo e estado — 26/10/2026

Branch `feature/infinitepay-customer-auth`, workspace `C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree`, Firebase **crmdoceria-9959e**. Baseline funcional `da795618`. Esta primeira entrega acrescenta somente medição opcional; **não é a otimização concluída**. Nenhuma mudança no carregamento, autorização, cache, timeout, frete ou pagamento foi aplicada antes de colher o baseline de navegador.

Fase 9=75%; Fase 11=100%; Fase 12=100% histórico; Global=95,00%; Fase 13=0%/NÃO INICIADA. Sem PROD, WhatsApp, SMS ou operação financeira.

## Fontes e dependências identificadas no código

| Região | Fonte atual | Dependências e custo observável |
| --- | --- | --- |
| Auth/Staff mínimo | Auth canônico `[DEFAULT]`; `users/{uid}` e `customProfiles/{uid}` via Firestore server | Perfil e custom profile lidos em sequência. O resolver aguarda depois `customerAccount`, mesmo para decidir a entrada Staff. |
| Sessão do shell Staff | Outro observer `onIdTokenChanged` chama `loadCurrentStaffProfile` | Repete as duas leituras após o gate. A medição conta operações lógicas separadamente dos transportes HTTP multiplexados. |
| Seletor Staff | Dono/global: `getDocs(lojas)`; demais: memberships do perfil | Não usa public-list. Efeito depende do objeto `user` inteiro; snapshot de permissões/escala pode dispará-lo novamente. |
| Nomes/detalhes Staff | Para cada ID: `meuEspaco/empresa`, fallback `meuEspaco/ponto`, fallback raiz da loja | Lojas paralelas, fallbacks sequenciais dentro de cada loja; o resultado só entra no mapa após todas. Documentos da descoberta global são descartados, conservando apenas IDs. |
| “Carregando lojas…” na Página Inicial | GET Function API `/store/public-list`, sem token, `cache:no-cache` | Atalhos públicos de cardápio, não diretório Staff. Sem timeout/retry na UI inicial. |
| Servidor public-list | `functions/store-config.js`: `list` chama `publicConfig/resolve` em série para lojas e canais | Resolve configurações completas, frete e pagamento antes de devolver somente IDs/nomes/canais. Raízes são relidas. N+1/waterfall existem no código; contagem real de documentos depende dos dados. |
| Remount da Página Inicial | Componente `PaginaInicial` declarado dentro de `StaffApplication` | Tipo React muda a cada render do pai e pode remontar `StorefrontLinks`; quantidade efetiva será confirmada pela contagem de requests no navegador. |

Essa auditoria identifica trabalho redundante, mas **não substitui** a duração medida de cada trecho. Não atribuir toda a espera ao Auth ou ao Firestore sem o baseline. `Adicionar Loja` já é renderizado após o perfil; o modal usa `canCreateStores` (Dono/Gerente). Não atribuir falsamente sua autorização à resposta public-list.

## Baseline HTTP real — antes de qualquer otimização

Coleta em 26/10/2026 às 04:01:10Z, Node HTTP, cinco GET sequenciais ao endpoint DEV `https://us-central1-crmdoceria-9959e.cloudfunctions.net/api/store/public-list`. Sem login, escrita ou chamada financeira.

| Amostra | HTTP | TTFB (ms) | Total (ms) | Corpo (bytes) | Entradas |
| --- | --- | --- | --- | --- | --- |
| 1 | 200 | 6364 | 6366 | 299 | 4 |
| 2 | 200 | 2634 | 2634 | 299 | 4 |
| 3 | 200 | 2520 | 2520 | 299 | 4 |
| 4 | 200 | 2496 | 2496 | 299 | 4 |
| 5 | 200 | 2503 | 2503 | 299 | 4 |

Todas com `Cache-Control: no-cache, max-age=0, must-revalidate`, sem paginação adicional. Mediana das cinco: **2520 ms**. Mediana das quatro posteriores: **2511,5 ms**. A primeira amostra não comprova cold start da Function; inclui rede/TLS/servidor. Quatro entradas podem incluir canais, não equivalem necessariamente a quatro documentos de lojas.

Esses números são do endpoint; **não são T0–T9 do navegador**, nem tempo de shell interativo ou de lista visível. HTTP menor que 300 bytes com segundos de espera indica que tamanho de resposta não explica sozinho o atraso. Contagem de cinco requests é do probe, não do bootstrap CRM.

## Instrumentação opt-in de navegador

Abrir **com sessão Staff já válida**: `https://crmdoceria-9959e.web.app/?crmPerf=1`. Sem esse parâmetro, o coletor não ativa. Hosts de produção e outros hosts são recusados mesmo com o parâmetro. A instrumentação não acrescenta request HTTP, não faz upload/storage e não captura UID, tokens, permissões, nomes, documentos, URLs ou seus parâmetros. O painel “Diagnóstico DEV · Lojas” permite **Copiar medição** em JSON sanitizado.

| Marca | Local efetivamente observado |
| --- | --- |
| T0 | Script no início do head HTML; não navigationStart nem término do download HTML. |
| T1 | Entrada do bundle, módulo de instrumentação importado antes de App. |
| T2 | Primeiro callback do observer Auth canônico; pode ser deslogado se a coleta começar sem sessão. |
| T3 | Resolução completa de capabilities no gate. |
| T4 | Início do efeito de diretório Staff com usuário válido. |
| T5 | Envio da query de lojas; para membership local não há request e o par é marcado no mesmo trecho. |
| T6 | Retorno da query; erro não é marcado como sucesso. |
| T7 | IDs normalizados, antes de atualizar o estado. |
| T8 | Commit React da lista não vazia, observado no próximo animation frame. |
| T9 | Mesmo commit com seletor habilitado; nomes completos podem chegar depois. |
| shell-interactive | Shell Staff montado, com navegação fixa; o perfil interno ainda pode estar em validação. |
| staff-shell-ready | Perfil interno Staff disponível. |
| store-names-rendered | Mapa de nomes/detalhes cobre os IDs da lista. |
| home-links-started/rendered | Fetch e commit dos atalhos públicos da Página Inicial. |

Marcas registram a primeira ocorrência; eventos contam repetições, retornos e erros (até200). Intervalos sem conclusão ficam `null`, jamais zero fictício. T8/T9 de lista vazia ficam pendentes porque o seletor atual nem é renderizado; isso não deve ser confundido com rede ainda em andamento.

O relatório inclui os deltas solicitados, eventos lógicos e Resource Timing por categoria, sem URL. Transportes Firestore podem multiplexar leituras: **não somar eventos de documentos como requests HTTP**. Tamanho cross-origin pode ser zero sem Timing-Allow-Origin. Não há detecção automática do perfil de rede. A abertura manual de Página Inicial após dashboard inclui espera humana em `homeLinks_T0`; usar `homeLinks_load_to_render` para comparar esse componente isoladamente.

### Coletas necessárias antes da otimização

1. Na sessão Staff atual, reload normal com opt-in; esperar nomes/atalhos, copiar JSON.
2. Hard reload com a mesma sessão/contexto; copiar outro JSON e rotular a coleta.
3. Quando possível, Fast 3G com o mesmo roteiro e rótulo explícito. Não exportar HAR com credenciais.

O controle automático de navegador não inicia neste ambiente (`kernel assets/path`, OS error3); medição autenticada/Network/console depende da coleta manual. Não houve captura automatizada nem aprovação visual presumida. Baseline T0–T9 e comparação depois: **PENDENTES**.

## Qualidade desta etapa

- 68/68 testes em5 suítes: diagnóstico opt-in/privacidade/intervalos/erros, ApplicationGate, capabilities, CustomerShell e StorefrontLinks. Mais9/9 testes de Auth canônico/cache Hosting PASS.
- Build completo PASS, bundle main434,86kB gzip;4 avisos preexistentes de sourcemaps native-audio e metadados de browsers antigos. Lint0 erros,66 avisos em App, mensagens iguais às do HEAD anterior (desconsideradas apenas linhas deslocadas). Nenhum aviso novo nos arquivos de diagnóstico. Diff-check PASS.
- Commit funcional de medição `d0d1b5f8c377741dedd05b002ae791452e5ddd75`, push exclusivamente branch DEV. Deploy **somente Hosting** com59 arquivos, CLI exit0/release complete. Sem Functions, Rules, índices, Storage ou dados. Staging isolado `.deploy-crm-store-baseline-d0d1b5f8`, cinco fontes conferidas contra sourcemap do build.
- Conferência remota em26/10/2026 às04:23:50Z:59/59 SHA-256 iguais ao staging; rota opt-in retorna mesmo HTML; HTML/bootstrap/worker revalidáveis, main hashado immutable. `main.70654ccd.js` SHA256 `8e0b7d8c8271717e4e098700b4789d4e038f2ac89284b254cdedf4be3138f927`. Evidência sanitizada: `docs/evidence/crm-store-baseline-dev-2026-10-26.json`.
- Cache HTML/SPA/bootstrap/service worker revalidável e assets hashados immutable devem continuar iguais. Nenhum cache de lojas foi introduzido nesta etapa.

## Próxima etapa após baseline

Confrontar contagens e durações reais com as dependências acima; corrigir somente os gargalos comprovados. Separar diretório Staff de detalhes, eliminar remount/requisições redundantes e custo desnecessário da listagem pública sem usar public-list como autorização Staff. Testar erro/retry/zero/uma/várias lojas, seleção preservada, capabilities e sessão; publicar somente os componentes necessários no DEV e repetir as mesmas medições. A otimização permanece requisito interno pré-PROD **PENDENTE** até essa comparação/homologação.

## Baseline autenticado recebido e correção — 26/10/2026

O usuário forneceu o JSON real do painel na sessão Staff, reload normal, viewport1920×945. Resumo fiel em `docs/evidence/crm-store-browser-before-2026-10-26.json`; sem afirmar hard reload, Fast3G ou console limpo. O início dos atalhos aos16225,6ms ocorreu após navegação manual: não usar26866,6ms como custo puro de bootstrap.

| Intervalo | Antes (ms) |
| --- | --- |
| T1−T0 | 3,1 |
| T2−T1 | 423,7 |
| T3−T2 | 1719,4 |
| T5−T4 | 0,1 |
| T6−T5 | 141,8 |
| T7−T6 | 0,1 |
| T8−T7 | 15,1 |
| T9−T0, seletor habilitado | 2504,3 |
| Shell−T0 | 2148,2 |
| Nomes−T0 | 2953,9 |
| Atalhos: início do carregamento→render | **10641,0** |

Contagens efetivas:2 leituras de users+2 customProfiles,1 customerAccount(**1035ms** na trilha crítica),2 descobertas Staff com3 documentos cada,3 company reads(~452–454ms),**4 GET públicos**(2704,5/4509,6/7056,3/9479,5ms). A resposta inicial do primeiro GET foi descartada por remontagem; o render veio após o último. A sequência de remontagens está corroborada pelo escopo aninhado de PaginaInicial e por teste do componente extraído. Não converter os transportes Firestore do relatório em quantidade exata de leituras faturadas; streams são compartilhados.

### Mudanças funcionais

- `CrmHome`/slider extraídos para tipo React estável; atualizações do pai não reiniciam fetch nem animação. Página Inicial não aguarda o carregamento genérico das coleções CRM, e restauração/token refresh preserva a seção atual; login explícito continua podendo escolher dashboard.
- Resolver emite Staff validado antes de consultar Customer. Gate só usa a emissão para contexto Staff, conserva controles de UID/geração e não concede Customer antecipado. Resultado privado posterior atualiza o botão de contexto sem remontar o shell. Customer-only/onboarding e rotas Customer aguardam a resolução apropriada.
- Gate fornece seu perfil Staff já validado ao shell; observer interno deixa de repetir as duas leituras. Revalidação canônica em token/contexto e observação de inatividade continuam existentes. Não há nova autoridade em cache, Auth extra, troca de UID ou alteração de capability/backend Rules.
- Descoberta Staff depende de UID/role/memberships/escopo estáveis, não do objeto user inteiro; atualizações de jornada/transferência/notificação não repetem diretório. Nomes da raiz da listagem global chegam no mesmo commit dos IDs; detalhes empresa/ponto permanecem em paralelo, preservando dados consumidos pelas outras telas. Membership Staff continua vindo do perfil autorizado; public-list nunca alimenta permissões/seletor Staff.
- Seletor sempre presente, desabilitado quando necessário, erro/retry explícito; Adicionar Loja depende da autorização já existente Dono/Gerente e não da listagem. Backend createStore não foi alterado. Seleção válida é preservada; resposta canônica remove seleção revogada. Resultado de escopo/UID anterior é descartado; seletor não usa estado ready de outro escopo. CreateStore atualiza os nomes/estado imediatamente com resposta autorizada.
- Public-list usa raiz já lida+batch de definições storefront e queries de canais em paralelo, limitadas à página existente de20 lojas/20 canais por loja. Critério catálogo/loja compartilhado com resolve completo: versões/inativos/drafts continuam negados, canais precisam enabled+storeId correto+listed. Ordenação e cursores preservados. **Não carrega schedule, frete, credenciais ou paymentConfig para montar links.** Resolve completo/middleware de vendas mantêm seus contratos.
- Sem cache persistente/TTL de resultados de lojas, permissions ou configs. Somente requests públicos ainda em voo são coalescidos por URL/cursor, sem reuso de resultado concluído; nova montagem/retry revalida a fonte. Rate/autorizações do provider não foram alterados.
- Deadline UI15s com erro e retry, escolhida para dar margem ao baseline isolado de~2,5s/primeira amostra6,4s sem espera indefinida. GET público usa AbortController oficial; deadline Staff não cancela listener Firestore e ignora resposta tardia. Nenhum SLA de rede foi inventado.

### Validação local da correção

| Suíte | Resultado | Escopo |
| --- | --- | --- |
| React,9 suítes | 92 testes PASS | Gate progressivo/UID/contexto/dual-role, Customer, preview, links estáveis, erro/retry,0/1/várias lojas, create-store permitido/negado, timeout/coalescência/seleção. |
| Backend,5 arquivos | 30 testes PASS | Diretório leve, allowlist/ownership de canal/paginação, paridade com catálogo completo, frete/checkout/reorder/multiloja existentes. |
| Auth/cache/cross-tab/FCM | 21 testes PASS | Sessão canônica, logout, carrinho, coordenação e headers. |
| Firestore+HTTP emulados | 1 teste integrado PASS | Demo isolado, createStore draft, aliases/lista/readiness, entrega bloqueada/retirada, ownership histórico/reorder. Sem provider real. Emulador de Admin SDK com Rules abertas apenas localmente; não é novo teste de Rules publicadas. |
| Imports ESM reais | PASS |6 entradas e2 controles negativos. |

O primeiro teste parametrizado do seletor passava string em vez de array; corrigido somente o setup, sem enfraquecer assertions. Reexecução5/5 limpa, diagnóstico8/8 também. Totais acima não somam reexecuções. Novos testes não repetem as fixtures antigas de catálogo/frete conhecidas e fora deste escopo.

Lint direcionado:0 erros,65 avisos anteriores em App (66 no baseline; dependência ausente corrigida no observer), nenhum aviso novo nos componentes/testes/backend. Build final/diff/deploy e medição depois serão registrados pela evidência efetivamente coletada. Percentuais preservados; otimização ainda exige comparação remota/homologação.

### Entrega local e gate de publicação

- Commit funcional **`a23912fccc5f548d3927de0b42ac17da3162112b`**, push concluído na branch DEV, sem divergência com origin.
- Build final PASS: `main.3483dd59.js`,435,84kB gzip (~980bytes a mais que baseline); CSS11,65kB.4 avisos native-audio/metadados de browsers conhecidos. Nenhum refactor amplo de bundle: a coleta normal mostrou bundle em cache e T1−T0=3,1ms, não evidenciou gargalo ali.
- Staging isolado `.deploy-crm-store-baseline-a23912fc`,59 arquivos Hosting e45 runtimes Functions rastreados. Dez fontes conferidas no sourcemap; entre os45 runtimes, somente store-config.js difere da entrega anterior. Sem testes/fixtures/temporários/env/functions.yaml no artefato; node_modules é dependência local excluída do pacote. Nenhum índice/Rules/Storage novo.
- Tentativa **somente functions:api** falhou no precheck com Authentication Error, antes de publicar. Consulta somente leitura hosting:sites:list também falhou. Tentativa **somente hosting** falhou com Authentication Error e erro secundário de resolução do site sem autenticação. Nenhum Deploy complete/Successful update; não afirmar publicação ou hash remoto de a23912fc.
- Firebase CLI15.34.1. Solicitação de liberar firewall/reauth enviada, sem pedir token/código. A entrega de medição d0d1b5f8 é a última publicação desta tarefa comprovada; **tempo depois/contagens depois/cold load/hard reload/Fast3G/console visual continuam PENDENTES**, não inferidos dos mocks.
- Diff-check local e da entrega PASS. Documentação/evidências em commit separado; sem novo pagamento/SMS/WhatsApp ou PROD.

Depois de restabelecer o acesso, publicar sequencialmente no staging já validado (primeiro API; Hosting somente após sucesso):

```powershell
Set-Location -LiteralPath 'C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree\.deploy-crm-store-baseline-a23912fc'
npx -y firebase-tools@15.34.1 deploy --project crmdoceria-9959e --only functions:api --non-interactive
npx -y firebase-tools@15.34.1 deploy --project crmdoceria-9959e --only hosting --non-interactive
```

Sem publicar outros targets ou projeto. Conferir hashes/headers e repetir probe HTTP e coleta do painel antes de fechar o requisito.

### Limitação de automação nesta retomada

O inventário Chrome voltou a responder, mas leituras DOM falharam com timeout de Emulation.setFocusEmulationEnabled. A alternativa oficial Computer Use nativa foi interrompida pela revisão automática por não conseguir confirmar a URL corrente com segurança. Nenhuma tentativa de contornar essa barreira; nenhuma medição/screenshot do browser foi inventada. Consultas HTTP e deploy por CLI autorizados são independentes desse bloqueio. A comparação do navegador continua dependendo da coleta manual após publicação.

## Publicação DEV e medição HTTP depois — 27/10/2026

- Usuário informou “logado e sem firewall”. Consulta autorizada hosting:sites:list voltou com success para crmdoceria-9959e. Worktree/branch corretos, sem alteração tracked, runtime HEAD idêntico a a23912fc;59 arquivos Hosting e45 runtimes revalidados contra o manifesto. Não repetir build/suítes já aprovados sem mudança de fonte.
- Primeira retomada passou autenticação, mas a descoberta local das Functions excedeu o timeout padrão10s, antes do upload. Repetida com `FUNCTIONS_DISCOVERY_TIMEOUT=60` e NO_PROXY apenas para loopback no processo da CLI. Mecanismo confirmado no CLI15.34.1 e na documentação oficial Firebase, https://firebase.google.com/docs/functions/tips#avoid_deployment_timeouts_during_initialization (versão visível atualizada23/10/2026). Não alterou código, prazo de execução da Function, controles de acesso ou configurações PROD.
- **api(us-central1), Node22/2ndGen: Successful update operation; Deploy complete; exit0.** Só api foi selecionada. Pacote238,57KB,45 runtimes previamente verificados; restante das Functions, Rules, índices e Storage não publicados. Aviso de firebase-functions antigo preservado, sem atualizar dependências nesta entrega.
- **Hosting crmdoceria-9959e: release complete; Deploy complete; exit0**, após API PASS.59 arquivos. Conferência em27/10/2026 às03:14:44Z:59/59 SHA-256 iguais ao staging; rota opt-in também retorna HTML correto;10 fontes do build correspondentes. `main.3483dd59.js` SHA256 `210275f4cddb258967538cbeb932371fc7f0b66cb622b51baa40d5ee73c5338b`. HTML/SPA/bootstrap/worker revalidáveis; asset hashado `public,max-age=31536000,immutable`.
- **Gate de acesso/publicação RESOLVIDO.** Evidências: `docs/evidence/crm-store-delivery-dev-2026-10-27.json` e `docs/evidence/crm-store-api-after-dev-2026-10-27.json`. A publicação contém runtime a23912fc; os commits documentais posteriores não exigem novo deploy.

### Comparação HTTP pelo mesmo método

Cinco GET públicos sequenciais, sem Auth/dados privados/operação financeira. Coleta depois em27/10/2026 às03:12:54Z, antes da conferência Hosting; API já atualizada. Primeira amostra não é classificada como cold start comprovado. Medições em dias diferentes, sem afirmar condições de rede idênticas ou SLA.

| Amostra | Antes total(ms) | Depois total(ms) | Depois HTTP | Corpo/entradas |
| --- | --- | --- | --- | --- |
| 1 | 6366 | 3006 | 200 |299bytes/4 |
| 2 | 2634 | 965 | 200 |299bytes/4 |
| 3 | 2520 | 926 | 200 |299bytes/4 |
| 4 | 2496 | 672 | 200 |299bytes/4 |
| 5 | 2503 | 666 | 200 |299bytes/4 |
| Mediana | **2520** | **926** | — | **redução observada63,25%** |

Todos os cinco corpos depois foram idênticos entre si, SHA256 `658fab925c6b02cbe118acb16279d32d2b00513936d5a147446121d312eacc80`; campos de cada entrada restritos a storeId/name/channelId, sem configuração privada. Mesmo299bytes/4 entradas do baseline; sem afirmar igualdade de hash antes, que não foi registrado naquela coleta. Cache-Control de todas as respostas: `no-cache,max-age=0,must-revalidate`.

### Homologação restante

**PENDENTE somente a comparação/aceite do navegador nesta correção**, incluindo T0–T9 depois, contagens reais de requests depois, cold/hard/normal reload e condições throttled quando disponíveis; não converter teste local ou tempo HTTP em tempo da UI. Solicitado ao usuário um bloco consolidado com JSON normal/hard reload e verificação de Visão Geral↔loja, seleção preservada e controles/atalhos utilizáveis. Variant esperado: `optimized-a87a7072`.

Nenhum browser/print novo foi executado nesta retomada, nem login/logout Staff global, cadastro/loja/pedido/SMS/WhatsApp/pagamento/reembolso. PROD intacta. Fase9=75%; Fase11=100%; Fase12=100% histórico; Global=95,00%; Fase13=0%/NÃO INICIADA. **Performance: implementada, testada e publicada DEV; homologação visual/métrica final PENDENTE.**

## Relatórios normal/hard recebidos — contexto Staff não comprovado

Evidência integral fornecida pelo usuário em27/10/2026: `docs/evidence/crm-store-browser-after-reported-2026-10-27.json`, viewport1920×945, variant optimized-a87a7072.

| Coleta | Atalho início→render | GET público | Requisições | T3–T9/Staff |
| --- | --- | --- | --- | --- |
| Normal |753ms |748,3ms/HTTP200 |1 |Ausentes |
| Hard, conforme rótulo do usuário |990,6ms |973,5ms/HTTP200 |1 |Ausentes |

Não há staff-user, staff-custom-profile, customer-capability, staff-directory-start/query nem transportes Firestore. O mark shell-interactive638,3/1594,3ms também é emitido pelo StaffApplication público: **não comprova shell Staff autenticado**. T2 significa callback Auth pronto, não usuário autenticado. Código do gate permite a página pública quando UID é ausente/anônimo ou preparação canônica pede reentrada/conflito; o relatório não distingue esses motivos. Não diagnosticar logout/regressão de Auth sem evidência.

Os números validam somente os atalhos públicos observados. Não publicar comparação “Staff2148→638ms” nem “seletor2504ms→zero”, e não usar1 GET sem atividade Staff como prova remota de ausência de remount sob updates do CRM. Solicitada confirmação se seletor Visão/Loja e menus administrativos estavam visíveis. **Homologação Staff permanece PENDENTE**, inclusive seleção/refresh, erro/retry no contexto e condições throttled.

## Correção complementar: preferência de loja no refresh

Durante a conferência, encontrado problema determinístico separado da ausência de eventos Staff: ApplicationGate limpa a chave compartilhada selectedStoreId ao restaurar UID; usePersistentState lia justamente essa chave. A reconciliação correta com IDs permitidos não recuperava o valor já apagado pelo gate. Isso antecede a otimização e impediria o critério de refresh preservando loja.

Correção mínima: reutilizar usePersistentState com chave `staff-store-selection-v1:{UID canônico Staff}`. Somente ID de navegação, na sessionStorage da aba, sem lista, roles, permissions, configurações ou credenciais. Limpeza de rascunhos compartilhados/privados e guard canônico permanecem iguais. Outro UID usa outra chave, Guest não consulta a preferência Staff, e resposta atual do diretório continua descartando loja fora do escopo. Não migrar a chave global histórica sem dono conhecido; seleção deve ser refeita uma vez na nova versão. Preferência não é autoridade e não concede acesso a loja.

Diagnóstico passa a variant `optimized-store-selection-v2` para diferenciar a versão. APIs/Functions/readiness comercial, Auth DEFAULT, FCM, cart, Customer e percentuais não mudam.94/94 React em9 suítes,21/21 Auth/cache/cross-tab/FCM PASS; lint0 erros/65 avisos anteriores, nenhum novo; diff-check PASS. Regressões backend30 e emulada1 reutilizadas de a23912fc sem alteração backend. Build/publicação Hosting serão registrados após conclusão real; nenhuma API precisa ser republicada.

## Coletas Staff corretas recebidas — comparação técnica PASS

Usuário confirmou explicitamente que as duas primeiras coletas estavam sem autenticação e enviou novas coletas autenticadas, normal/hard, da versão a23912fc. Evidências `docs/evidence/crm-store-browser-after-staff-2026-10-27.json` e `docs/evidence/crm-store-browser-comparison-2026-10-27.json`. Não era evidência de regressão de Auth; não houve alteração de Auth para fazer aparecer Staff.

| Métrica | Antes normal(ms) | Depois normal(ms) | Depois hard(ms) | Redução normal |
| --- | --- | --- | --- | --- |
| T1−T0 |3,1 |7,4 |1754,7 | — |
| T2−T1 |423,7 |467,9 |411,4 | — |
| T3−T2 |1719,4 |1086,7 |987,9 |36,80% |
| T5−T4 |0,1 |0 |0,1 | — |
| T6−T5 |141,8 |208,7 |215,9 | — |
| T7−T6 |0,1 |0,2 |0,3 | — |
| T8−T7 |15,1 |14,2 |18,8 | — |
| T9−T0: seletor habilitado |2504,3 |1843,1 |3438,1 |**26,40%** |
| Shell−T0 |2148,2 |1574,1 |3166,8 |**26,72%** |
| Nomes−T0 |2953,9 |1843,1 |3438,1 |**37,60%** |
| Atalhos: início→render |10641 |942,5 |1129,9 |**91,14%** |

Comparação normal com normal, sem alegar rede idêntica ou baseline hard anterior. Query Firestore em si passou de141,8 para208,7ms: não ficou mais rápida; a melhora vem da retirada de dependências, duplicações e uso antecipado dos nomes. Hard reload contém download main1742,9ms; não comparar seu total com o baseline normal em cache como regressão de Auth. T0 continua o script no head, não início da navegação.

Nos dois relatórios Staff: **users2→1; customProfiles2→1; diretório2→1; GET público4→1**. Company3→3, mantidos em paralelo para detalhes, sem bloquear os nomes. No normal, nomes/seletor1843,1ms e shell1574,1ms antecedem company2373,6–2375,5ms e Customer2762,1ms; no hard, nomes3438,1ms e shell3166,8ms antecedem company4286,6–4288,2ms e Customer4438,8ms. A conclusão posterior de Customer não reiniciou o diretório/atalhos. Isso confirma remotamente o desacoplamento, sem interpretar transportes multiplexados como fatura de reads.

**Performance a23912fc: comparação técnica normal/hard PASS.** Preferência por UID8f6dbdb4 é correção complementar ainda em entrega; esses relatórios anteriores não homologam seu refresh. Não pedir repetição das duas coletas de performance já válidas. Restam aceite funcional de Geral↔loja/refresh/controles na nova versão e teste remoto throttled, se disponível. Console livre de erro e screenshots não foram fornecidos/não são presumidos.

### Entrega complementar8f6dbdb4 — Hosting DEV publicado e conferido

- Commit funcional **8f6dbdb4ab45aed06d3d9c0f6fa273f823252a27**, push DEV concluído. Apenas App/chave de preferência/helper/testes e rótulo de diagnóstico alterados. Não muda capabilities, Auth/persistência Firebase ou APIs/backend. Primeira seleção deve ser refeita após upgrade porque não se migra preferência global sem dono conhecido.
- Build completo PASS, main.dcc5c4ad.js435,88kB gzip (+36bytes),4 avisos native-audio/metadados conhecidos.94/94 React,21/21 sessão/cache/FCM/cross-tab, lint0 erros/65 avisos anteriores, diff-check PASS. Nenhum teste/backend/provider financeiro repetido sem necessidade. Staging `.deploy-crm-store-baseline-8f6dbdb4`,59 arquivos;10 fontes do sourcemap conferidas localmente, incluindo App e helper de preferência. Verificação remota será executada após publicação, sem confundir fonte do build com arquivo já publicado.
- **Tentativa somente Hosting falhou antes de upload/release**, Authentication Error e erro secundário de resolução de site; nova consulta hosting:sites:list também falhou. Diagnóstico confirmou mesma conta configurada no worktree/staging e ausência de override FIREBASE_TOKEN, sem imprimir identidade/credenciais. A mensagem genérica não prova se é expiração ou bloqueio de rede; não apresentar FirebaseError.status como status HTTP real do provider. Nenhuma nova Function/Rule/índice/Storage/PROD foi publicada.
- Antes da retomada, o runtime remoto comprovado era a23912fc (API+Hosting,59/59 hashes), com melhoria técnica Staff já comprovada.8f6dbdb4 aguardava publicação/aceite de seleção após refresh. Foi solicitado acesso CLI/firewall/reauth, sem nova autorização financeira/SMS e sem repetir a coleta Staff já aprovada tecnicamente.

Comando da publicação Hosting DEV executada após restabelecer o acesso:

```powershell
Set-Location -LiteralPath 'C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree\.deploy-crm-store-baseline-8f6dbdb4'
npx -y firebase-tools@15.34.1 deploy --project crmdoceria-9959e --only hosting --non-interactive
```

O bloqueio acima é histórico e foi superado em27/10/2026 após o usuário confirmar acesso CLI liberado. A consulta de sites voltou a funcionar; o deploy **somente Hosting** concluiu upload/finalização/release com exit0 no staging DEV associado explicitamente a crmdoceria-9959e. API permanece em a23912fc; nenhuma Function/Rule/índice foi republicada.

Verificação remota **59/59 hashes PASS**,10 fontes de sourcemap conferidas. Main `static/js/main.dcc5c4ad.js`, SHA256 `2482087868adb8b0aa942fdc1f2d8212305a232f0a02af380b048ad4ead8cc8c`, cache immutable; HTML/entradas estáveis revalidáveis. Evidência: `evidence/crm-store-preference-delivery-dev-2026-10-27.json`. Runtime atual: Hosting8f6dbdb4/APIa23912fc. Nenhum novo build foi necessário: o artefato previamente validado foi publicado sem alteração.

**Gate de publicação RESOLVIDO; aceite funcional v2 PENDENTE.** Validar apenas seleção Geral↔loja e refresh na variant optimized-store-selection-v2; escolher a loja uma vez depois de carregar v2 porque a preferência antiga sem UID não é migrada. Teste throttled pode ser agrupado, sem novo cadastro/loja/pedido/SMS/pagamento. Não repetir normal/hard completos só por preferência de loja. Fase9=75%, Global=95,00%, Fase13=0%/NÃO INICIADA.

### Aceite v2 recebido — loja PASS; seção após refresh FAIL

O usuário confirmou que a loja permanece após Ctrl+R, mas Nota Fiscal volta à Página Inicial. A causa é independente do diretório: `currentPage` usava a chave global que `ApplicationGate.clearStaffUiState` remove na restauração inicial do UID, antes de montar StaffApplication. O CRM usa IDs de seção no estado React na rota raiz; não existe rota URL por seção a restaurar. Não foi identificado handler de store hydration sobrescrevendo a seção. Redirecionamentos de acesso perdido/logout continuam necessários; entradas de login explícito mantêm o comportamento atual.

Correção complementar: `useStaffSection` persiste somente o ID de seção em `sessionStorage`, chave `staff-section-v1:{UID Staff canônico}`. Não migra o antigo `currentPage` sem dono, não armazena dados/rascunhos/permissões e não mexe na preferência de loja. A limpeza compartilhada continua removendo filtros e rascunhos privados. Sem UID Staff, nenhuma preferência Staff é lida. Troca de UID usa outra chave. Armazenamento indisponível permite navegação em memória.

Antes de montar a página, `reconcileStaffSection` valida o ID no catálogo existente `MENU_PERMISSION_KEYS` e usa o avaliador atual `userHasPermission`. ID inválido ou acesso revogado recebe Página Inicial imediatamente; o efeito reconcilia a preferência somente após a hidratação Auth. A lista de lojas e a conclusão tardia de Customer não são dependências da preferência. O caminho `/admin/customer-preview/...` e seu controle de acesso continuam separados; nenhum target de preview é persistido como seção.

Testes locais: **115/115 React em10 suítes PASS**, incluindo51 testes de navegação/gate/diretório e64 regressões de Customer/preview/capabilities/selector/HTTP/performance. Cobrem Nota Fiscal, Clientes, Financeiro, Página Inicial, Pedidos e Produtos após remount/limpeza real do gate; loja permanece; capability tardia não sobrescreve seção; seção desconhecida/revogada, UID diferente, Guest e storage inválido/bloqueado falham com segurança. Variant desta correção: `optimized-staff-navigation-v3`. Build/publicação/aceite remoto serão registrados após conclusão; nenhum aceite visual presumido.

Auth/cache/FCM/cross-tab: **22/22 PASS** (9 testes canonical-auth/hosting-cache +13 public-auth/canonical-session/cross-tab). Lint:0 erros,65 avisos preexistentes de App, nenhum aviso nos novos módulos/testes. Não foi necessária atualização de SDK/dependências nem novo teste financeiro real.

Build completo PASS, exit0; main.f0e6572f.js436,09kB gzip (+209bytes), quatro avisos conhecidos de sourcemap native-audio e metadados Browserslist antigos. Workspace absoluto confirmado como C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree, associado exclusivamente a crmdoceria-9959e. Diff-check PASS. Entrega preparada somente Hosting; API permanece a23912fc. Após publicação, conferir hashes/cache e pedir aceite de Ctrl+R em Nota Fiscal/Clientes/Financeiro/Página Inicial mantendo a loja. As medições de performance Staff anteriores continuam válidas; nenhum novo JSON normal/hard exigido.
