# Identidade selecionada no checkout — DEV

## Extensão vigente — gerenciamento de endereços com prova de telefone

Listar/selecionar endereço salvo no modo celular NÃO exige SMS: browser recebe
referência opaca/projeção mascarada; backend resolve o destino persistido.
Ver completo e editar/excluir/definir padrão NA CONTA exigem o grant descrito
em [ADDRESS_VERIFICATION_CONTRACT.md](ADDRESS_VERIFICATION_CONTRACT.md).

Regra atualizada em24/10/2026: adicionar endereço NOVO NÃO exige SMS e grava em
`clientes/{id}.enderecos` via POST /api/checkout/addresses. O servidor deriva o
Customer do contexto legado, força não padrão e devolve só ID opaco/máscaras.
Salvar Endereço seleciona esse ID para cotação/snapshot server-side. A lista é
atualizada sem reload e a próxima identificação retorna o endereço persistido.
Isso substitui a regra anterior de rascunho somente no checkout; não altera
histórico/default, não é merge e não concede leitura/edição/pagamento.

Google/e-mail principal continua STRONG_AUTH e dispensa esse OTP adicional.
Firebase SMS usa projeto DEV exclusivo de verificação. Auth secundário em memória
é usado apenas para reCAPTCHA, sem trocar
a sessão principal. ID/refresh tokens ficam no backend e são descartados; audience
separada não autentica nas APIs/Rules da aplicação. Nenhum auto-merge, nova tarifa
ou liberação de pagamento. O checkout permanece LEGACY_PHONE após OTP. GUEST não
herda prova ou endereços. Detalhes e rollout seletivo no contrato acima.

Os quatro estados de confiança são Strong, Phone sem grant, Phone com grant e
Guest. Os dois estados Phone continuam com `mode=legacy_phone` financeiro;
somente o grant validado pelo backend distingue a permissão de endereço. Não há
novo provider/UID principal nem promoção implícita de pagamento.

## Fronteira

Sessão Firebase `[DEFAULT]` e identidade do checkout são independentes. Nenhuma
escolha de celular/visitante executa signOut, cria Auth principal, muda role/capabilities,
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
`found`, contexto, identificador opaco, nome abreviado e a projeção mascarada de
endereços descrita abaixo. Não retorna UID, e-mail, aniversário, endereço completo,
histórico, roles ou metadados de segurança. Não faz upsert,
merge ou vínculo. Ausência retorna `found:false`, sem cadastro privado.

Pedidos weak têm `clienteId:null`, sem ownerUid/paymentId herdados. A referência
legada permanece somente em `checkoutIdentity.legacyClientId`, para rastreio
interno; não dá ownership nem insere o pedido no histórico privado por telefone.
Endereços digitados nesse modo são locais ao checkout; não editam o cadastro
encontrado. Perfil privado exige o fluxo forte já existente.

### Seleção de endereços existentes por celular — 2026-10-23

- Fonte canônica: array `clientes/{customerId}.enderecos`, global do cliente,
  não duplicado por loja. O lookup resolve o cadastro uma vez e guarda seu ID
  somente no contexto servidor existente. Telefone com múltiplos cadastros entre
  os formatos aceitos falha fechado, convidando login forte; não escolhe registro
  arbitrário nem faz merge. Não houve migração/escrita nos cadastros.
- A resposta `client.enderecos` contém somente `id` opaco, `nickname`, `summary`,
  `isDefault` e `saved:true`. Apelidos comuns seguros (Casa/Trabalho/Apartamento/
  Outro) são preservados; texto livre potencialmente residencial vira Endereço N.
  Resumo: tipo de logradouro + até duas letras iniciais + máscara, número sempre oculto e bairro estruturado
  quando seguro. Não se tenta extrair complemento/bairro de texto legado livre.
  CEP, número real, referência, complemento, coordenadas, ID privado e endereço
  completo nunca são retornados, nem depois da seleção.
- Referência HMAC vinculada ao token do contexto, Customer canônico e ID de
  `addressRecords` (o helper existente gera IDs determinísticos para registros
  antigos). Reordenar endereços com ID não muda a seleção; remover o registro
  torna a referência inválida. Nenhum ID novo é persistido na leitura.
- Selecionar envia `checkoutAddressId`, `checkoutAddressRevision` e contexto para
  `/frete/calcular`. O backend valida loja, modo celular, revisão, expiração e
  cadastro; relê o array e usa seu endereço completo exclusivamente no servidor.
  Resposta contém somente a cotação existente. `/checkout/confirmar` repete essa
  resolução dentro da transação e persiste o destino real no pedido interno.
  Texto mascarado/coords enviados pelo browser não substituem o endereço salvo.
  Algoritmo e autoridade de frete permanecem intactos.
- UI: retirada independente primeiro; depois cards compactos, padrão primeiro,
  demais na ordem original e nenhuma seleção automática de endereço existente.
  Novo endereço atualiza a lista em memória sem reload; se marcado padrão, o
  destaque anterior é removido somente da cópia local do checkout weak. O fluxo
  já existente de seleção após cadastrar foi preservado. Isso NÃO autoriza
  gravar/excluir endereços no perfil privado encontrado por telefone.
- Strong mantém APIs privadas, descrição completa e IDs próprios. Guest não
  renderiza endereços herdados. Nenhuma alteração Auth, Rules, FCM ou pagamento.
- Referência/resumo selecionados persistem no snapshot por aba já existente.
  Reabrir o modal mantém a lista; um novo lookup após refresh obtém a projeção
  atual sem novo cadastro. Checkout restaurado revalida referência/revisão no
  servidor, sem guardar o endereço privado completo no browser. Mudança de modo,
  cliente/loja, expiração ou exclusão exige nova seleção. Respostas atrasadas não
  substituem retirada ou uma identidade mais recente.
- Rate limit/auditoria do lookup preservados. Reconhecimento de apelido/bairro,
  quantidade de endereços e valor do frete ainda revelam informação mínima;
  telefone continua sem prova de posse e sujeito a enumeração distribuída.

Publicação desta extensão, quando possível: somente `api` e
`lookupClientByPhone` em us-central1, depois Hosting DEV. Frontend não deve ser
publicado antes do backend. Metadados remotos não puderam ser consultados nesta
execução por credencial CLI expirada; nenhuma edição de banco, schema ou Rule.
Validação atual local/emulada, sem afirmar homologação remota dessa extensão.

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

### Ajuste visual constatado em homologação (2026-10-22)

O controle Editar Perfil tinha `hidden=true` no modo celular, mas a classe de
display `flex` do Tailwind sobrepunha o estilo padrão do atributo e o mantinha
visível. A homologação demonstrou `getComputedStyle(...).display=flex`; não houve
acesso a perfil privado nem tentativa de edição. O template agora também aplica
a classe `hidden` e o handler recusa execução nesse modo. Teste com CSS realista
confere display `none` no modo celular e restauração em modo forte; controle
negativo no checkpoint anterior reproduz display `flex`. Backend/Rules inalterados.

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
