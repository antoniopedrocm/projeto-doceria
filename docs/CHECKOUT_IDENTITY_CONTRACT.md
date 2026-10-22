# Identidade selecionada no checkout — DEV

## Fronteira

Sessão Firebase `[DEFAULT]` e identidade do checkout são independentes. Nenhuma
escolha de celular/visitante executa signOut, cria Auth, muda role/capabilities,
activeContext ou associação FCM. A seleção é por aba e loja, sem whitelist.

| Modo | Evidência | Perfil/histórico privado | Iniciação InfinitePay |
|---|---|---|---|
| `strong_auth` | Seleção explícita + ID token Google/password verificado + Customer próprio | Pelos guards Customer existentes | Somente com ownership, contexto e demais validações |
| `legacy_phone` | Celular digitado, sem OTP | NÃO; telefone não comprova posse | BLOQUEADA, mesmo com ID token válido no browser |
| `guest` | Escolha visitante/ausência de contexto | NÃO; sessão antiga não promove checkout | BLOQUEADA |

Uma sessão forte ainda válida pode continuar acessando a Área do Cliente por seus
guards próprios; escolher celular não revoga essa sessão, e a identificação por
telefone nunca concede acesso à conta encontrada.

## Causa e prova anterior

`lookupClientByPhone` rejeitava `found.data.authOwnerUid` com permission-denied.
O frontend substituía a mensagem pelo erro genérico de acesso não autorizado.
Teste novo em Auth/Firestore emulados reproduziu essa recusa **sem Auth** antes
da alteração. O guard não era requireAuth, Rules, App Check ou capability Staff.
Removê-lo mantendo `buildSafeClientPayload` teria exposto aniversário/endereços.

Além disso, publicação passiva de Customer sobrescrevia `currentClient`, e
`checkoutHeaders` anexava token antigo a qualquer pedido. O backend validava
token/Customer/ownership, mas não a escolha de identificação daquele checkout.

## Contrato servidor

`POST /checkout/identity`, dentro da Function existente `api`, estabelece a
seleção. Forte exige token verificado e `customerAccounts.account`; weak ignora
sessão ambiente. A resposta contém modo, revisão e referência aleatória de 256
bits. A referência não é um token Firebase e não concede APIs privadas.

O servidor grava somente seu SHA-256 como chave em
`checkoutPayments/_identity/contexts/{hash}`. Rules existentes impedem leitura
Customer/visitante e escrita de clientes, inclusive Staff, nesse caminho. Leitura
Staff segue a política já existente do root; nenhum acesso Staff foi ampliado.
O documento guarda modo, loja, revisão, expiração de 24h, UID/Customer apenas no
modo forte e referência legada/hash de telefone apenas no modo celular.
Tokens completos não são auditados nem documentados.

`lookupClientByPhone` continua global em `clientes`, com loja válida explícita e
rate limit; não copia dados de outra loja nem usa Matriz como fallback. Retorna
`found`, contexto, identificador opaco e nome abreviado. Não retorna UID, e-mail,
aniversário, endereços, histórico, roles ou metadados de segurança. Não faz upsert,
merge ou vínculo. Ausência retorna `found:false`, sem cadastro privado.

Pedidos weak têm `clienteId:null`, sem ownerUid/paymentId herdados. A referência
legada permanece somente em `checkoutIdentity.legacyClientId`, para rastreio
interno; não dá ownership nem insere o pedido no histórico privado por telefone.
Endereços digitados nesse modo são locais ao checkout; não editam o cadastro
encontrado. Perfil privado exige o fluxo forte já existente.

`POST /checkout/confirmar` exige contexto servidor forte + UID + Customer + loja
para Online. Ignorar contexto ou forjar `identityMode` não promove assurance.
A transação relê modo/revisão antes de reservar estoque/criar pagamento.
Pedido e payment recebem snapshot servidor da identidade; `start` verifica o
contexto novamente antes da reivindicação de criação do link. Retry autorizado
reutiliza o pagamento existente, com fingerprint/ownership, sem nova cobrança.
Pagamentos históricos anteriores ao marcador mantêm recuperação existente; não
há rota pública de start que permita criar pagamento weak histórico.

Demover a seleção não cancela cobranças previamente criadas de forma autorizada
nem modifica reconciliação de pagamentos reais anteriores. Transições financeiras
continuam sob confirmação server-side do provider.

## Frontend e persistência

`checkout-identity.mjs` guarda seleção por aba em
`sessionStorage[checkoutIdentity_v1:{storeId}]`. Cache é UX, nunca autoridade.
Escolha weak demove imediatamente e é serializada no servidor. Publicação passiva
de Auth não promove esse modo. Respostas antigas usam revisão/generation guards.
Refresh conserva a escolha; troca de UID invalida eligibility forte. Seleção
explícita pode renovar contexto expirado sem limpar storage manualmente.

Carrinho segue `checkoutState_v1`, hydration e ownership existentes. Seleção não
limpa itens, quantidades, cupom ou loja. Promoção preserva o snapshot e reapresenta
endereços autorizados. Logout/troca de UID continuam limpando carrinho privado
pelos guards existentes. Não existe sincronização nova entre abas.

Modo weak remove a opção de iniciação Online e mostra “Para pagar online, entre
com Google ou e-mail”, com as duas ações reais do controlador existente.
O guard server-side permanece mesmo se o browser for adulterado.

## Abuso e limites

Rate limit existente: 8 buscas/10 minutos por hash do IP observado, independentemente
de trocar UID, com auditoria sanitizada. Seleção HTTP possui bucket separado com
o mesmo limite, para limitar criação de contextos. Continua sujeito a rede/proxy
compartilhado e enumeração distribuída; `found` e nome abreviado revelam existência
mínima, deliberada neste fluxo, nunca autenticação. Não há proteção absoluta contra
enumeração nem serviço externo novo. Contextos expirados são inutilizáveis, mas
remoção física/retention operacional pode ser programada separadamente; nenhum
TTL, índice, Rule ou infraestrutura foi publicado por esta correção.

## Validação e entrega

Testes de regressão cobrem ausência de Auth, sessão própria/alheia, Staff/dual-role,
mode weak + token válido, campo forjado/contexto omitido, promoção/demissão, revisão
atrasada, expiração, UID/loja divergentes, Rules, ausência de merge/escrita de perfil,
carrinho/hydration/refresh, Customer privado, FCM e fluxo forte com provider mock.
Nenhuma chamada real à InfinitePay é necessária.

Deploy DEV: somente `api`, `lookupClientByPhone` e Hosting, backend antes do novo
frontend. A API nova falha fechada para Online de frontend antigo sem contexto;
abas antigas devem fazer navegação/reload normal após o Hosting. Não limpar Auth
ou storage como condição do teste. Rules e demais Functions não devem ser publicadas.

Homologação remota obrigatória A/B/C/D: busca sem login, busca após sessão forte,
bloqueio Online no modo celular com sessão ainda válida e promoção explícita
preservando carrinho/loja, sem confirmar pedido/cobrança. Somente depois dessa
evidência a regressão pode ser declarada RESOLVIDA remotamente.
