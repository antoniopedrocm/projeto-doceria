# Retorno ao cardápio — complemento C15 DEV

## Complemento 2 — origem explícita nas URLs internas

**Publicado:** commit **`125dad90`**, push concluído, Hosting DEV **`75f46bb8c26f95e6`** em 06/11 às 12:04 UTC−3. [Release](evidence/customer-menu-return-v2-after-dev.json): 61/61 arquivos locais e 2 inicializadores reservados Firebase conferidos; SPA/cache preservados; fingerprint v2 regional/Rules inalterados, sem deploy de backend. [Navegador](evidence/customer-menu-return-v2-browser-dev.json): sessão existente Matriz → conta → perfil → pedidos → refresh → retorno Matriz PASS, `returnTo` presente nas etapas internas. Sem captura de dados privados ou logout da sessão disponível. **Aceite da sessão anônima do titular ainda pendente**, não confundir com este smoke. SMS/claim não repetidos.

O titular **não aprovou `92da223c`**: o retorno passou a `/?public=1`, ainda sem voltar ao cardápio conhecido. Não substituir esse FAIL pelo PASS anterior do navegador automatizado. Foi solicitada somente a URL após Minha Conta e o momento da falha, sem credenciais; causa exata do storage/query da janela anônima ainda não observada.

Nova lacuna reproduzida antes do patch: `CustomerShell` conhecia a origem inicial, mas os links internos removiam `returnTo`; o clique reconsultava apenas query/storage e descartava a origem em memória. Correção mínima: conservar a primeira origem pública válida em memória; transportar `returnTo` validado em perfil, histórico, home e URLs de saída; preservar `store` de detalhe; captura da origem pública antes do cleanup no logout. Sem modificar signOut, resolver de identidade, permissões, SMS ou ownership. Referrer do navegador recupera uma entrada pública quando for mesma origem e passar pela allowlist; páginas privadas, externas, credenciais e parâmetros desconhecidos não viram destino. Sem origem comprovável, fallback público continua seguro; nunca inferir Matriz.

[Validação local v2](evidence/customer-menu-return-v2-local.json): **614 React + 157 públicos = 771 PASS**, 9 cenários novos sem somar retestes. Integração usa gate e shell reais com IO fictício, Customer-only Google/password × Matriz/Garavelo, incluindo navegação interna, refresh, storage limpo e logout/login. Build `main.2eb0fbc5.js` 456,07 kB gzip (+290 B), lint 0 erros/2 avisos existentes, diff-check PASS. Publicação seletiva Hosting DEV a registrar abaixo. O resultado da conta C15-E permanece pendente de aceite real.

## Falha e diagnóstico

Em 06/11/2026, o titular confirmou o claim e-mail/senha, mas informou que **Voltar ao Cardápio** terminava em `/area-cliente`. O vínculo técnico continua PASS; este relato reprova o retorno da interface e não autoriza repetir SMS ou claim.

Duas lacunas comprovadas no código anterior:

1. `customerMenuDestination` usava a loja de `checkoutState_v1`, mas não persistia a origem pública. Logout remove corretamente esse contexto privado; sem `returnTo` ou origem persistida, o destino voltava a `/`. Regressão nova falhou antes do patch (esperado Garavelo, recebido `/`).
2. `/` é também a entrada do gate autenticado. Uma conta Customer-only é corretamente encaminhada dali para `/area-cliente`. Usar `/` como fallback público causava o retorno aparente à conta. Os testes anteriores substituíam `location.assign` e não exercitavam o documento de destino.

Não foi extraído storage, token ou credencial da janela anônima do titular; não afirmar qual das fontes de origem estava presente naquela sessão. A combinação sem origem é reproduzível e compatível com o relato.

## Correção

- Origem continua sendo somente pathname/search de cardápio validado na allowlist, em `sessionStorage`, por aba. Nenhum URL externo, UID, token ou dado Customer.
- Bootstrap público guarda a origem somente depois de validar a projeção pública ativa. Entrada Minha Conta também preserva o caminho, e o fallback de contexto o persiste antes da limpeza privada.
- Botões resolvem novamente o destino no clique, incluindo contexto que chegou depois da montagem.
- Sem origem válida, destino explícito `/?public=1` renderiza **a mesma CrmHome pública existente**, por `ApplicationEntry`, sem montar `App`/gate autenticado. Header público dá acesso à conta e à entrada normal do sistema. Nenhuma mudança nas regras de Auth, capacidades ou redirects privados; rotas normais mantêm o fluxo anterior.
- `/cardapio` genérico continua compatível; não há fallback arbitrário para Matriz. Helpers públicos são cópias geradas do módulo canônico por `sync-canonical-auth.cjs`.

## Validação local

- **606 testes React / 60 suítes PASS**, incluindo gate, shell, logout, Admin Preview, fiscal e telas existentes.
- **156 testes públicos PASS**, incluindo Matriz/Garavelo, aliases, canais, origem por aba, cleanup privado, links antigos, carrinho, SMS mocked e allowlist de retorno.
- Total sem somar retestes: **762 PASS**. Testes focados/reprodução são subconjuntos.
- Build PASS: `main.cf5be7ec.js` 455,78 kB gzip (+435 B); CSS `main.e526cf8e.css` 14,61 kB (+4 B). Sem nova dependência.
- Lint de arquivos alterados: 0 erros, 3 avisos preexistentes (`no-loop-func` e regex de controle nas cópias do helper). Build mantém avisos de sourcemaps ausentes do native-audio e metadados antigos de browser.
- Diff-check PASS. Navegador local confirmou `/?public=1` na Página Inicial pública sem shell Customer. Diretório público no localhost falhou por ambiente/origem; verificar links no DEV publicado, não registrar essa consulta como PASS.

## Publicação e aceite

Somente Hosting DEV `crmdoceria-9959e`, a partir de `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, autorizado pelo Dono conforme necessidade. Commit/push, publicação, hashes e smoke remotos a registrar na evidência de release.

Após publicação, retestar com a conta já vinculada: origem Matriz → Minha Conta → voltar, refresh e logout/relogin sem SMS. C15-E só recebe PASS completo depois do aceite; Google independente e C16 continuam pendentes.

## Publicado e verificado no DEV

Commit funcional **`92da223c`**, push concluído; Hosting **`16bdcc6a2499d5df`** publicado em 06/11 às 10:44 UTC−3. [Verificação remota](evidence/customer-menu-return-after-dev.json): **61/61 hashes locais**, incluindo `.well-known/assetlinks.json`; 2 arquivos reservados de inicialização do SDK gerenciados pelo Firebase conferidos como DEV separadamente. Manifesto remoto completo coberto. SPA/HTML revalidáveis e assets hash immutable; rewrites mantidos. Fingerprint das **133 Functions retornadas pela API v2 regional** e ruleset Firestore inalterados; este recorte não é o total entre gerações. Nenhum deploy de backend/Rules.

[Navegador real](evidence/customer-menu-return-browser-dev.json): sessão dual-role existente preservada; Matriz → Minha Conta → voltar PASS; Garavelo → Minha Conta → refresh → voltar PASS. Home pública explícita com links reais carregados e sem loop; desktop 1920×889/mobile 390×800 sem overflow horizontal. [Desktop](evidence/customer-menu-return-public-desktop-dev.jpg), [mobile](evidence/customer-menu-return-public-mobile-dev.jpg). Consulta pública que falhou somente no localhost passou no DEV. Tab temporária fechada, viewport restaurado e preview local encerrado.

O navegador automatizado usou uma sessão existente distinta do caso recém-vinculado. **Aceite C15-E do titular ainda pendente**; não fazer logout dessa sessão para fabricar o teste. Nenhum SMS/claim/perfil/endereço/pedido adicional executado na correção.

Fase 9 = 100%; Fase 10 = 87,50%; global formal = 97,00%; Fase 13 = 0%; PROD READY: NÃO. Não criar pedido/pagamento, alterar perfil/endereço ou reenviar SMS.
