# Verificação de telefone para gerenciar endereços — DEV

## Decisão e estado operacional

Workspace autorizado: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`.
Projeto exclusivo desta implementação: **crmdoceria-9959e**. Produção não é usada
para SMS, Auth, secrets, dados ou deploy desta entrega.

Firebase pode entregar SMS. Seu Phone Auth também cria/autentica uma identidade
Firebase e emite tokens; não é uma API neutra de envio de código. A configuração
Phone por tenant não está disponível no contrato administrativo consultado; não
foi confirmada uma forma de usar SMS do tenant com Phone principal desligado.
A proposta inicial de tenant foi corrigida antes de qualquer alteração remota.

A solução preparada usa **projeto Firebase DEV exclusivo de verificação**, separado
do projeto da aplicação e de PROD. As contas de prova não podem recuperar/vincular
Google/e-mail principal, e sua audience/issuer não são aceitos pelo Firebase Auth,
callables ou Rules da aplicação. Não há necessidade de publicar guards globais em
58 funções privadas nem de mudar Rules/Staff para ativar esse isolamento.

Leitura administrativa sanitizada de23/10/2026: DEV da aplicação em
subtype=FIREBASE_AUTH, Phone desligado, sem alteração remota nesta preparação.
O operador recebeu estimativa oficial US$0,02/SMS Brasil, primeiros10/dia sem
cobrança; autorizou ativação em tenant, mas a limitação encontrada impediu essa
ativação. A criação de projeto DEV exclusivo foi autorizada posteriormente pelo usuário,
condicionada à necessidade de isolamento explicada. Configuração real e resultado
da publicação são registrados no checkpoint, sem usar a autorização antiga de
tenant para executar uma alternativa diferente sem esclarecer.

Config ausente resulta em canais vazios; a interface informa indisponibilidade e
oferece Google/e-mail, sem simular envio nem liberar escrita.

Atualização operacional de24/10/2026: projeto `crmdoceria-sms-dev-2026` e app Web
criados com autorização. Usuário corrigiu billing; API confirmou a mesma conta
do DEV, final8193EE. Identity Platform/Phone configurados SOMENTE nesse projeto
isolado: região BR e domínio DEV autorizado. Main DEV continua FIREBASE_AUTH e
Phone desligado. Nenhum recurso PROD consultado. Nenhum SMS real enviado.

## Contrato de identidade

| Contexto | Resumo/seleção existente | Escrita na conta | Pagamento online |
|---|---|---|---|
| LEGACY_PHONE sem prova | Permitidos pela referência opaca já existente | Negada; novo destino só no checkout | Negado |
| LEGACY_PHONE + prova de telefone | Permitidos | Só endereços do cliente/contexto, com grant temporário | Negado |
| STRONG_AUTH Google/e-mail principal | Contrato privado existente | Contrato privado existente, sem OTP adicional | Demais gates existentes |
| GUEST | Nenhum endereço herdado | Negada | Negado |

Nenhum OTP altera `authOwnerUid`, telefone, e-mail, provider, histórico, role,
capability, activeContext, FCM ou identidade do checkout. A prova não é uma
identidade Customer. Contas no projeto exclusivo de verificação ficam separadas do cadastro
global canônico `clientes/{customerId}.enderecos`; não há auto-merge.

### Regra vigente de novo endereço e projeção (24/10/2026)

- Sem SMS: listar/selecionar endereço salvo continua permitido. Projeção backend
  allowlist: id HMAC opaco, nickname seguro, streetMasked (tipo + inicial + ***),
  numberMasked=***, neighborhoodMasked (tipo + inicial + ***), município/UF quando
  estruturados/válidos, summary, protected, isDefault e saved. Sem rua/número
  completos, complemento, referência, CEP, coordenadas ou ID privado. Texto legado
  contribui no máximo com tipo/inicial; não se reconstrói destino no browser.
- Selecionar usa contexto/revisão/Customer/loja e registro estável: cotação e
  snapshot internos usam o destino persistido, mesmo com resumo/coords adulterados.
- Novo endereço sem SMS: formulário/mapa atuais e Usar neste pedido; rascunho
  checkoutOnly=true, saved=false, isDefault=false. Nenhuma escrita no cadastro,
  pending global ou mudança nos endereços históricos. Destino selecionado entra
  no snapshot normal por aba checkoutState_v1; rascunho não selecionado pode ser
  descartado no reload/novo lookup. Grant e detalhe privado nunca entram nele.
- Salvar na minha conta é promoção explícita após grant, via create com formulário
  preenchido. Não há promoção automática. Retirada/carrinho/loja/cupom e algoritmo
  autoritativo de frete continuam independentes.
- Ver endereço completo/Editar pedem SMS e retomam a ação original. read retorna
  o alvo permitido sem coordenadas desnecessárias; expiração/troca de identidade
  remove detalhes da memória. Excluir exige confirmação adicional.
- ADDRESS_MANAGEMENT equivale ao escopo legacy_address_manage. getTrustState()
  distingue a UX verificada, nunca substitui prova backend nem modo financeiro.

## Fonte de verdade e endpoints

`lookupClientByPhone` continua mínimo/mascarado. No servidor o contexto existente
guarda o Customer canônico, telefone identificado, hash e revisão; telefone com
vários cadastros continua recusado. O cliente não escolhe outro telefone ou
Customer no pedido OTP. Não se copiam nem deduplicam cadastros remotos.

POST em `/api/checkout/address-verification/`:

- `status`: canais realmente configurados, final mascarado do telefone e config
  pública Firebase/reCAPTCHA. Nenhum endereço completo.
- `start`: escolhe apenas o canal anunciado, reserva limites transacionalmente,
  associa propósito/contexto/revisão/loja/Customer/telefone e pede envio ao provider.
- `verify`: reserva tentativa com lease/nonce; valida código no backend; consome o
  desafio uma vez e cria grant opaco de uso restrito. Nunca retorna ID/refresh token.
- `manage`: `read`, `create`, `update`, `delete`, `default`; exige grant válido e
  vínculo integral revalidado na transação. `read` libera somente o endereço alvo
  autorizado para leitura/edição. Nenhum Customer ID arbitrário é aceito.
- `revoke`: retira do contexto os ponteiros de desafio/grant dessa revisão.

Todos respondem `Cache-Control: no-store`, campos externos limitados e erros
amigáveis. Excluir exige `confirmed:true` depois de uma confirmação visual.
Selecionar endereço para um pedido não altera o padrão.

Rotas legadas também são protegidas: `/clientes/buscar` completo exige Staff;
PUT `/clientes/:id` e `addClientAddress` exigem Staff autorizado ou Customer
forte proprietário. POST `/clientes` público só cria cadastro novo vazio sob
contexto PHONE correspondente, sem atualizar o encontrado nem devolver perfil;
o frontend relê pelo lookup mínimo para vincular o contexto novo. Perfil legado
não pode ser alterado anonimamente. CRUD por OTP passa exclusivamente por `manage`.

## Provedores reais e armazenamento

SMS: APIs oficiais `accounts:sendVerificationCode` e
`accounts:signInWithPhoneNumber`, ambas no projeto exclusivo. Número deriva
do contexto servidor. reCAPTCHA é resolvido no browser em Auth secundário apenas
para verificação, com persistência em memória; não se modifica o Auth `[DEFAULT]`.
A geração/entrega/validação do código é feita pelo backend Firebase. Armazenamos
somente `sessionInfo` criptografado pelo provider, nunca o código. A resposta é
validada por instância Admin nomeada com projectId de verificação e
`verifyIdToken`, telefone/audience/provider conferidos, tokens descartados no servidor. Não se
envia `idToken` para vincular ou reautenticar a conta principal.

Phone Auth cria/reutiliza um usuário persistente no projeto exclusivo, não uma
conta automaticamente temporária por código. Expirar o grant NÃO apaga esse
usuário. Não guardamos refresh tokens nem iniciamos sessão Phone no browser:
o Auth secundário tem persistência em memória e serve apenas ao reCAPTCHA.
Não há signOut da sessão principal. Usuários de prova podem se acumular por
número; retenção/limpeza precisa de inventário e autorização próprios, nunca
exclusão automática de usuários cuja finalidade exclusiva não esteja comprovada.

WhatsApp: adapter preparado para Cloud API oficial + template **AUTHENTICATION**
aprovado, body/OTP copy-code button correspondente. Código de seis dígitos gerado
por `crypto.randomInt` no backend e guardado apenas como HMAC com pepper no Secret
Manager. Comparação em tempo constante. Não usar template de pedido, mock de envio,
wa.me ou WhatsApp Web. Canal e flags de WhatsApp continuam desligados nesta entrega.

Estado privado sob `integrations/addressVerification/{challenges,grants,limits,audit}`;
config por `integrations/addressVerification/stores/{storeId}`. Rules existentes
negam leitura/escrita client-side, inclusive Staff. Grant armazenado no servidor
somente por SHA-256; token do grant em memória no browser, sem storage persistente.
Auditoria contém operação/Customer/loja/endereço/canal/horário e origem LEGACY_PHONE,
sem código, token completo ou endereço completo.

Expiração é verificada em cada operação, independentemente de limpeza física.
Retenção/expurgo de desafios expirados não é autenticação nem é ativado implicitamente.

## Limites e invalidação

Defaults configuráveis e limites superiores no provider:

- desafio 5 minutos (configurável 1–5);
- grant 10 minutos (1–15);
- reenvio 60 segundos (60–300);
- até 5 tentativas, envios 5/telefone/hora, 10/IP/hora e 50/projeto/dia;
- reserva de tentativa/envio anterior à chamada externa; falha de envio também
  consome orçamento, sem retry automático que duplique SMS;
- cooldown por telefone entre contextos, lease de verificação para concorrência;
- mudança de identidade/telefone/loja/revisão ou mudança do telefone persistido
  invalida o grant; GUEST nunca herda. Logout/pagehide/expiração removem prova e
  formulário da memória e pedem revogação do contexto antigo.

Requisição de revogação na saída é best effort sob falha de rede; revisões e TTL
continuam impostos no servidor. Isso não é revogação garantida instantânea de um
bearer já copiado num browser comprometido. Não há sincronização cross-tab nova.

Limites da aplicação **não são teto universal de cobrança**: as APIs Firebase Auth
são públicas e possuem suas próprias cotas/proteções. Antes do canal real, definir
região SMS Brasil, quotas/monitoramento/budget, restrições de API key compatíveis
e destinatários autorizados DEV. Exibir aviso sobre uso do número pelo Google para
prevenção de abuso e obter consentimento no clique de envio.

## Configuração e ordem de rollout

1. Publicar backend DEV: api, lookupClientByPhone, addClientAddress e
   updateClientProfile. Somente essas funções são necessárias. Rules/índices/
   Storage, triggers, schedules e demais callables não precisam ser publicados.
2. Publicar Hosting; confirmar hashes/cache. Com config ausente, canal continua
   indisponível e não há escrita LEGACY_PHONE.
3. Após autorização operacional/custos: criar/configurar projeto Firebase DEV
   exclusivo de SMS, incluindo billing autorizado, domínios DEV/reCAPTCHA e região
   SMS Brasil. Nenhum código da aplicação é publicado nesse projeto; só Auth.
   Manter Phone desligado em crmdoceria-9959e e não usar ana-guimaraes.
4. Documento privado por loja: enabled, allowedRecipients E.164 autorizados, e
   sms: {enabled, provider:"firebase", verificationOnly:true, projectId, apiKey,
   authDomain}. projectId obrigatoriamente diferente da aplicação/PROD, authDomain
   correspondente. API key Firebase é identificador público, não token Admin.
   Nenhuma service account vai ao browser. Não inventar destinatário/Customer.
5. Testar primeiro no emulador/números fictícios oficiais; declarar entrega real
   somente após SMS recebido e validado em telefone autorizado, com operação de
   endereço também autorizada. Nunca imprimir OTP. Frete recalcula como antes.
6. WhatsApp futuro exige template AUTHENTICATION aprovado, integração oficial
   válida/allowlist, access token existente e secret address-otp-hash-key com
   pepper aleatório forte. Não ativar flags de mensagens de pedidos.

O rollout inicial2501110f (4 Functions + Hosting) já foi publicado; o ajuste de
rascunho/projeção5cba7ad2 foi publicado em api/lookupClientByPhone + Hosting.
12/12 hashes remotos e cache PASS; status SMS200/reenvio60s, WhatsApp ausente e
cinco operações manage sem grant rejeitadas403/OTP_REQUIRED. Configuração privada
habilitada só para2 destinatários DEV autorizados. Nenhum SMS no smoke inicial.
Após autorização de UM SMS real ao final8602, usuário executou o fluxo manual:
auditoria confirmou code_requested/code_sent/phone_verified/address_create/
address_read em24/10/2026. Portanto envio/validação, criação com grant e leitura
autorizada reais PASS. O usuário efetivamente salvou um endereço na conta; leitura
administrativa confirmou1 registro, sem expor seu conteúdo. Não desfazer/excluir
essa ação nem enviar novo SMS automaticamente. Edição/delete/default remotos e
aprovação visual390/1920 não foram comprovados por esse resultado; testes locais
correspondentes permanecem PASS. Verificação real não eleva o modo financeiro.
Config DEV limita-se aos dois destinatários explicitamente autorizados e mantém
2 envios/telefone/hora, 5/IP/hora e 10/dia. Reenvio mínimo agora60 segundos,
5 tentativas, OTP300 segundos e grant600 segundos. SMS tem custo variável;
nenhum orçamento, quota de faturamento ou alertas foram alterados. Os limites
da aplicação não impedem sozinhos abuso direto das APIs públicas do provider.
Não foram cadastrados códigos fixos em telefones reais de clientes. Automação
usa apenas providers injetados e Auth/Firestore Emulator; não comprova entrega
SMS real. A homologação real exige nova autorização explícita de envio e o
usuário deve digitar o OTP somente na interface, nunca no chat.

Identificado anteriormente cadastro DEV ambíguo no telefone fornecido: não resolver
por merge, escolher primeiro registro nem contornar o bloqueio para testar OTP.
Usar identidade canônica inequívoca autorizada ou resolver o dado separadamente.

Storage Rules DEV preexistentes são permissivas e não são usadas para esses
registros. Não foram ampliadas nem copiadas para produção; avaliar sua política
em escopo próprio antes de promoção PROD. O isolamento dos dados deste recurso
é Firestore/Admin e não depende de Storage.

## Fontes e validação

Fontes oficiais consultadas em23/10/2026 e reconferidas em24/10/2026:

- [Phone Auth web](https://firebase.google.com/docs/auth/web/phone-auth)
- [Multi-tenancy](https://docs.cloud.google.com/identity-platform/docs/multi-tenancy-authentication)
- [sendVerificationCode](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/sendVerificationCode)
- [signInWithPhoneNumber](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signInWithPhoneNumber)
- [Preços oficiais: Brasil US$0,02/SMS, dez primeiros/dia sem cobrança](https://cloud.google.com/identity-platform/pricing)
- [Limites Auth](https://firebase.google.com/docs/auth/limits)
- [Workspace oficial Meta](https://www.postman.com/meta/whatsapp-business-platform/overview)

Testes locais usam providers fake por injeção exclusiva dos testes e emuladores
Auth/Firestore demo. Runtime não possui flag que aceite código fictício. Cobrem
os canais/adapters, erro/expiração/replay/rate/cooldown, concorrência/revogação,
CRUD e privacidade, cliente/telefone/loja/revisão, credencial de projeto separado recusada, Rules, pagamento bloqueado, Strong, Guest,
checkout/frete/carrinho/reorder e CRM. Resultado e publicação exatos no checkpoint
do plano; teste de adapter não é evidência de entrega SMS/WhatsApp real.
