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
