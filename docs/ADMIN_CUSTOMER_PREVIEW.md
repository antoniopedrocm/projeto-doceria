# Visualizar como Cliente — somente leitura

Requisito interno pré-PROD, exclusivamente DEV (`crmdoceria-9959e`). Fase9=75%,
Fase11=100%, Fase12=100% histórico, Global=95,00%, Fase13=0%/NÃO INICIADA.

## Contrato e não impersonação

O administrador abre o ícone de olho em CRM → Clientes. A rota separada
`/admin/customer-preview/{customerId}` oferece Página Inicial, Minha Conta,
endereços, histórico consolidado e detalhe. `/profile` e `/orders` permanecem
rotas administrativas; refresh reautoriza o administrador e recarrega o alvo.

O contexto é `ADMIN_CUSTOMER_PREVIEW`, separado de `CUSTOMER_SELF`. A sessão
Firebase `[DEFAULT]`, UID, login, activeContext e capacidades Customer não são
substituídos. Não há custom token, ID token ou sessão em nome do Customer.
O ID token enviado é exclusivamente o do administrador já autenticado.

CustomerFrame/CustomerHome compartilham a apresentação do shell Customer; o
renderer público customer-orders-view.mjs é o mesmo para lista/detalhe. O data
provider administrativo é separado: não instala customer-account-core, editor,
reorder, cart bridge, OTP, SDK de segurança ou qualquer operação financeira.
Uma faixa persistente identifica o modo/cliente e oferece Sair da visualização.
Título da aba identifica o preview. Sair retorna a Clientes sem logout do admin.

## Capability, revogação e multiloja

`permissionDetails.clientes.view_customer_as_readonly`, com módulo Clientes
habilitado. Dono/Admin normalizado tem default SIM, mas `false` explícito revoga.
Gerente requer `true` explícito e loja atribuída. Demais roles não têm acesso,
mesmo com flag forjada. Somente Dono concede a nova capability no gerenciamento
de usuários; o backend impede escalada pelo gerente. Não há nomes hardcoded.

Cada leitura consulta users/customProfiles atuais usando verifyManagementAccess:
Staff ativo, role, capability e escopo. Token Firebase é verificado com revogação.
Sem autenticação:401; sem capacidade:403. Alvo inválido/inexistente:404 sem PII.

Dono sem lojas atribuídas mantém escopo global. Staff com escopo restrito precisa
de relacionamento comprovado do Customer com loja permitida (lojasVisitadas
persistida pelo servidor ou pedido elegível). Perfil/endereços são globais do
Customer conforme modelo existente, acessíveis apenas após esse gate. Pedidos
são filtrados pela loja física do documento. Histórico root sem loja comprovada
fica restrito ao admin global; cursor/detalhe não contornam o filtro de loja.

## APIs e sessões

Base real: Cloud Function `api`, sem alterar rewrites do Hosting.

| Método/rota relativa | Finalidade |
|---|---|
| POST /admin/customer-preview/sessions | Autorizar alvo e iniciar sessão auditada |
| GET /admin/customer-preview/profile | Projeção de perfil |
| GET /admin/customer-preview/addresses | Endereços canônicos, allowlist completa de atendimento |
| GET /admin/customer-preview/orders?cursor=… | Histórico paginado existente |
| GET /admin/customer-preview/order?storeId=…&orderId=… | Detalhe próprio do alvo |
| GET /admin/customer-preview/order?source=legacy&orderId=… | Histórico root aprovado, global apenas |
| POST /admin/customer-preview/end | Encerrar/auditar a sessão do próprio admin |

Todos exigem Bearer Firebase do admin. Após start, exigem também
`X-Customer-Preview` opaco aleatório de256 bits, armazenado somente em memória no
browser. No servidor fica somente seu hash, UID admin, Customer canônico,
expiração e estado. Expira em30 minutos (constante SESSION_MS). Reautoriza alvo,
capacidade e loja em cada GET, não confia em query string como autorização.
Cache-Control:no-store; nenhum perfil/endereço/pedido é armazenado pelo preview
em localStorage/sessionStorage. UI limpa dados após erro de acesso/expiração.

Sessões/leases/auditoria ficam em `integrations/adminCustomerPreview`, namespace
privado já bloqueado pelas Rules para qualquer SDK cliente, inclusive Dono.
Máximo10 sessões simultâneas por UID; expiradas não mantêm bloqueio. Auditoria e
metadados expirados não são apagados automaticamente; futura política de retenção
deve preservar trilha necessária e não implica exclusão de usuários Firebase.

## Canonicalização e ownership

resolveId do customerRegistry resolve aliases explícitos até o canônico, sem
buscar primeiro por telefone. O leitor comum de pedidos recebe contexto de
leitura autorizado; não recebe UID Customer fabricado. Usa customerId e aliases
reviewed (`identityRegistryVersion=1`), ownerUids aprovados e legacyOrderPaths
explícitos. Não copia pedidos, altera ownership, soma valores ou infere loja.
Phone-only/root não revisado/owner conflitante ficam fora. Endereços são somente
enderecos do canônico; não importam órfãos de campos root nesta visualização.

Perfil expõe id/nome/e-mail armazenado/telefone/aniversário. Endereços usam
allowlist de campos de atendimento, sem coordenadas/UID/grants/metadados. O
histórico mantém snapshots de itens/preço/quantidades/subtotal/desconto/frete/
total/loja/data/status/endereço e método de pagamento normalizado. Sem senha,
tokens, dados de cartão ou links externos bearer de recibos no detalhe do preview.
Segurança e operações financeiras aparecem somente como informação indisponível.

## Somente leitura e defesa server-side

A API de preview não tem operações de negócio de escrita: verbos/recursos de
mutação retornam403. POST start/end só gravam controle e auditoria. Marcador de
preview em outra rota da API é rejeitado. Provider frontend só despacha duas
leituras de histórico; formulários não são montados. Reorder/checkout/pagamento/
OTP/cupom não existem na UI; botão de cardápio e edição são desabilitados.

Uma lease privada por UID admin bloqueia também as mutações Customer-self e
entradas de checkout/cupom/pagamento autenticadas durante sessões ativas, mesmo
se removerem o header. Isso cobre admin dual-role tentando usar seu token Firebase
normal. Não altera o contrato financeiro, provider ou webhook. O webhook real não
usa a lease de navegação. End encerra somente a sessão correspondente e libera o
bloqueio quando não restam outras sessões ativas. Expiração também libera.

Se o browser fechar sem completar end, a lease vence em até30 minutos. UI tenta
end ao sair/desmontar/pagehide (keepalive); END é best-effort nesses casos. Refresh
inicia nova autorização. Não transformar a sessão opaca em credencial Customer.
Um navegador pode iniciar um fluxo público independente sem essas credenciais;
isso não é autoridade derivada do preview e segue os gates legado/ownership/
pagamento existentes. CRUD administrativo do CRM permanece separado do preview.

## Auditoria e privacidade

- ADMIN_CUSTOMER_PREVIEW_STARTED: UID admin, Customer canônico, lojas/escopo, timestamp.
- ADMIN_CUSTOMER_PREVIEW_ENDED: UID admin, Customer canônico, timestamp; idempotente.
- ADMIN_CUSTOMER_ORDER_VIEWED: mesmos IDs/contexto mais ID/loja/source do pedido.

Sem nome/e-mail/telefone/endereço/itens/OTP/token em logs de auditoria. Não registra
scroll, troca de aba ou cada interação visual. Abrir detalhe é evento de acesso
sensível. O propósito é atendimento/suporte, com acesso revogável por capability.

## Validação e entrega

Testes de política/projeção, API real Express com Auth/Firestore emuladores,
Rules privadas, HTTP401/403, aliases,64 pedidos/12 endereços sintéticos,
ownership/store/cursor, revogação/expiração, bloqueio de mutações com e sem
marcador, auditoria/idempotência/end; regressões Customer-self e UI compartilhada.
Não há SMS/pagamento real nos testes. Resultado local:106 testes unitários,
66 testes CRM (59 existentes+7 novos) e59 emulados (19 preview+40 regressões)
PASS, sem contar reexecuções como cobertura adicional. O runner limpa somente
dados dos emuladores demo antes de cada suíte: telefones fixos/UIDs de execuções
anteriores não podem contaminar uma nova fixture. A fixture antiga legacy-phone
agora inicializa o registry canônico já exigido pelo runtime; não mudou o lookup.

Lint:0 erros;66 avisos CRM idênticos ao baseline por regra/mensagem (ignorando
somente deslocamento de linhas),6 avisos backend anteriores. Helper block-scoped
antigo de frete recebeu anotação de compatibilidade ES2015/Node22 para a regra
estilística no-inner-declarations, sem mudar o cálculo. Build PASS,4 sourcemaps
native-audio e metadados de browsers antigos conhecidos. Sourcemap conferido:
as6 fontes JS alteradas correspondem byte a byte ao código compilado, com
normalização de EOL. ESM público:6 entradas e2 controles negativos PASS. Diff-check
PASS. Resultados remotos/commit serão registrados no checkpoint agrupado.

## Entrega DEV e aceite — 2026-10-25

Commit funcional `c75a24ea`, push na feature/infinitepay-customer-auth. Publicadas
somente19 Functions necessárias (api,13 Customer-self,2 legadas de perfil/endereço
e3 de gerenciamento de usuários) e Hosting DEV. Runtime:45 arquivos versionados,
grafo local41 módulos, sem testes/fixtures/functions.yaml/env/temporários no pacote.
Rules, índices, Storage, SMS/provider e PROD não foram publicados/alterados.

Hosting:59/59 hashes correspondentes; main.cb34a812.js SHA256
`81eb8582db79031180769b5d45bad972fbcb0c31b3afcd5af1514c2b97f27a63`.
HTML/bootstrap/worker revalidáveis e assets hashados immutable preservados.
Rota administrativa SPA PASS. API remota sem Auth/token inválido:401/no-store.
Autorização positiva/negativa e bloqueios exercitados integralmente nos emuladores.

Leitura técnica DEV do alvo C02:12 endereços/1 padrão,5 IDs canônicos+aliases,
3 UIDs aprovados,64 pedidos elegíveis (41 loja+23 root aprovados), aliases privados
resolvendo corretamente. Nenhum vínculo por telefone foi inventado. Metadado de
última alteração do Customer anterior ao deploy; hashes de objetos usam ordenação
canônica das chaves, pois a ordem dos campos JSON REST não é contrato de dados.

Usuário respondeu **“PASS — homologação consolidada”** para390×800 e1920×889:
faixa/título, home, conta/endereços, histórico/detalhe, somente leitura e saída
mantendo o administrador conectado. Aceite manual; nenhuma captura automatizada
inventada. O controlador de navegador falhou ao inicializar (OS error3).

Auditoria real confirmou STARTED e ENDED no aceite inicial, com escopo global e
nenhuma sessão ativa naquele encerramento. Na conferência complementar, usuário
respondeu **“detalhe abriu”**. Consulta DEV confirmou2 eventos
ADMIN_CUSTOMER_ORDER_VIEWED, referentes a C03 e C07, além de4 STARTED/3 ENDED.
C02 ainda não possui evento de detalhe nessa consulta; não atribuir a ele os
acessos de outros Customers. Sua projeção canônica12 endereços/64 pedidos e o
aceite consolidado anterior permanecem evidências separadas.

Havia1 sessão ativa na consulta complementar; não foi encerrada administrativamente.
O usuário pode sair pelo botão da visualização; a expiração server-side de30min
continua aplicável. Nenhum dado Customer/pedido foi alterado por esta conferência.

**ADMIN CUSTOMER PREVIEW = CONCLUÍDO E HOMOLOGADO MANUALMENTE NO DEV.**
Registro agrupado final em INFINITEPAY_PROJECT_PLAN.md e
evidence/admin-customer-preview-dev-2026-10-25.json.
