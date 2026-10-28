# Readiness interno pré-PROD — 2026-10-21

## Decisão e fronteira

### Novo requisito — ações visíveis e perfil básico por SMS (24/10/2026)

Editar Perfil permanece visível no cabeçalho PHONE e chama OTP só no clique;
cards PHONE salvos já tinham Ver/Editar/Excluir/Padrão protegidos e permanecem
visíveis sem grant. Listar/selecionar/retirar/criar/salvar novo endereço não pedem
SMS. Cabeçalho permite quebra de linha em telas estreitas. Strong preservado.

Ampliação autorizada estritamente limitada: endpoint profile read/update permite
nome/aniversário com grant SMS válido do mesmo Customer/contexto/telefone/loja/
revisão. Scopes address_manage/profile_basic, sem acesso geral a perfil/Customer,
e-mail/telefone/security/Staff/Online. Grant anterior sem scopes pode ser ampliado
server-side após todos os bindings, sem estender TTL ou pedir novo SMS; scope
explícito removido não é ampliado. Novos formulários privados são limpos na
expiração/troca/cancel; snapshot recebe só apresentação abreviada após save.

Testes141/141 regressões,96/96 emulados,69/69 CRM; delta final16/16 do backend e
7/7 storefront/ESM sobrepostos. Build/lint/diff-check PASS. Backend ce7537b0,
ajuste mobile4aedfeb6; publicação/evidência no checkpoint. Homologação visual e
prints mobile/desktop/após OTP ainda não são presumidos: controle de browser
falha ao iniciar. SMS real exige autorização específica nova, sem save remoto
de perfil/endereço para testar. O gate Enterprise de envio segue separado.
Fase9=75%, Global95,00%, Fase13=0%; nenhum PROD/WhatsApp/financeiro real.

Publicação confirmada: somente api(us-central1) de ce7537b0 e Hosting58 arquivos
de4aedfeb6 em crmdoceria-9959e. Backend idêntico entre ambos os commits, sem
republicação desnecessária.14/14 hashes/cache PASS; demais Functions/Rules/índices/
Storage não publicados. Perfil read/update e endereço read/update/delete/default
sem grant403, sem dados privados. HTML publicado com resposta/status DEV reais
renderizado em DOM local confirma botões e OTP apenas no clique; não é print de
browser remoto. Sem SMS ou escritas em cadastro para esse smoke. Evidência:
docs/evidence/protected-checkout-actions-dev-2026-10-24.json.

### Correção pontual — apelido do endereço na listagem (24/10/2026)

Runtime9246a950 remove a restrição de quatro apelidos na projeção/backend e
renderer. O nome canônico nickname já estava salvo corretamente e agora pode
ser exibido sem SMS, com fallback só para valor ausente/inválido. Nenhuma migração
ou alteração dos endereços DEV. Máscaras, IDs/ownership, SMS, default e pagamento
preservados. Testes127/127 +94/94 emulados +69/69 CRM, build/lint/diff-check PASS.
Publicados somente api/lookupClientByPhone e Hosting DEV;14/14 hashes/cache PASS.
Dois novos lookups reais agora retornam o nome esperado, sem campos residenciais
privados; renderer de produção com a resposta real PASS em DOM local. Correção
funcional RESOLVIDA/HOMOLOGADA NO DEV: usuário confirmou “PASS — nome correto e
endereço mascarado” após reload normal e nova identificação pelo mesmo telefone
em24/10/2026. Nenhum novo cadastro, SMS ou pagamento exigido para esse aceite.
Essa correção não encerra o gate separado de homologação Enterprise/SMS abaixo,
nem a pendência externa InfinitePay. Fase9=75%, Global95,00%, Fase13=0%.

### Gate atual — SMS sem CAPTCHA manual (24/10/2026)

Runtime bed94bd2 substitui o único widget clássico por Enterprise SCORE e
Identity Platform REST sem sessão Auth OTP no browser. Projeto SMS DEV em
ENFORCE com bot/toll fraud ativos e chave gerenciada pronta; main Auth inalterado.
Nenhum OFF/fallback v2/token falso/manipulação de iframe. API status remoto200
anuncia só projectId/chave pública, sem thresholds/API key/endereço; cinco
operações manage sem grant continuam403. Nenhum SMS enviado por esse smoke.

Toggle adicional SMS defense confirmado pelo usuário em24/10/2026 (“ativado!”).
Ainda pendente: homologação do novo fluxo normal em390×800 e1920×889. Controle automático do
navegador não inicializa; sem capturas ou aceite novos. Não reutilizar o aceite
SMS anterior como prova desta migração. Real SMS exige autorização nova.
Detalhes/antes-depois/fontes/rollback em RECAPTCHA_ENTERPRISE_DEV.md.
Fase9=75%, Global95,00%, Fase13=0%; PROD/WhatsApp/financeiro intactos.

### Novo ajuste — endereço persistente sem SMS (24/10/2026)

Substitui somente a regra de rascunho temporário. LEGACY_PHONE sem grant pode
criar endereço em clientes/{Customer canônico}.enderecos, com origem fraca e
sem default automático. POST /api/checkout/addresses deriva o Customer do
contexto, valida telefone/revisão/loja, deduplica requests/conteúdo e devolve
somente ID opaco/máscaras. Seleção/frete/snapshot usam o registro persistido.
Nenhum Customer ID arbitrário, concessão de leitura completa, edição, exclusão,
padrão ou pagamento. Botão Salvar Endereço; erro backend não vira rascunho local.

Status deste delta: implementação/testes/push/publicação DEV concluídos;
criação persistente sem OTP aprovada pelo usuário nesta retomada (“pronto, deu certo”)
para o roteiro de save/seleção/Online bloqueado/refresh/nova identificação/máscara
e seleção sem SMS, com View/Edit solicitando SMS sem envio.
O aceite anterior de SMS permanece
válido historicamente e não comprova o save sem OTP deste novo contrato. Deploy
necessário somente api + Hosting; lookupClientByPhone não mudou. Rules, Auth,
Staff, InfinitePay e WhatsApp não mudaram. Percentuais permanecem95,00% global,
Fase9=75%, Fase13=0%. Risco de inclusão por terceiro que saiba o telefone está
explicitamente limitado por quota/limite20 e não alterar dados existentes/default.

Runtime5ec21a8c: somente api(us-central1), depois Hosting57 arquivos;13/13 hashes
remotos e headers de cache PASS. Backend214/214 unitários/DOM/ESM,94/94 emulados,
CRM69/69, delta final12/12 sobreposto; lint focado/build/diff-check PASS, warnings
externos conhecidos. Emulador teve uma expectativa de fixture de pagamento
corrigida (config explícita e401 sem Auth), e rejeição transitória de token em
fixture Customer preexistente; bateria limpa final94/94, sem alterar Auth/guards.
Smoke remoto sem escrita: lookup/lista com allowlist, criação com Customer/contexto
forjados403, view/edit/delete/default403 sem grant, seleção/frete de endereço
existente200 sem dados completos. Cadastro tinha1 endereço antes do ensaio novo.
Nenhum SMS, pedido, pagamento, endereço ou estoque remoto modificado pelo smoke.
Browser continua sem inicializar por kernel assets/path; solicitado ao usuário
salvar sem SMS, conferir seleção automática/Online bloqueado, refresh e nova
identificação com máscara/seleção. Confirmação recebida nesta retomada: “pronto,
deu certo”. Pendência de save5ec21a8c encerrada por esse aceite; leitura do smoke
seguinte observou2 endereços mascarados, sem revelar conteúdo ou criar dados.

### Extensão OTP de endereços — 2026-10-24

Implementação local de CRUD LEGACY_PHONE por OTP e grant restrito, sem promover
Customer/Staff/pagamento e sem usar produção. Contrato e checklist em
[ADDRESS_VERIFICATION_CONTRACT.md](ADDRESS_VERIFICATION_CONTRACT.md).

**Novo requisito pré-PROD de endereços/SMS: CONCLUÍDO e aceito no DEV.**
Implementação/testes locais, SMS real e aprovação visual manual em390 CSS px e
desktop1920×889 concluídos em24/10/2026. Não reescrever fases já concluídas. Telefone sem SMS
pode listar/selecionar máscaras e usar endereço novo somente no checkout, sem
persistir no Customer ou alterar padrão. Ver completo/escrever na conta exige
grant backend. SMS não autoriza pagamento/Customer privado/Staff.

Projeto exclusivo crmdoceria-sms-dev-2026 criado com autorização; API confirmou
billing na mesma conta DEV, final8193EE, em24/10/2026. Identity Platform Phone
configurado apenas nele, região BR e domínio DEV. Phone principal continua
desligado, subtype FIREBASE_AUTH preservado; nenhum PROD consultado. Template/
WhatsApp continua desligado. Não declarar entrega real por mocks/emuladores.
Telefone autorizado final0290 continua ambíguo; não escolher cadastro/merge.
Alternativo final8602 tinha cadastro único e zero endereços no smoke. Após SMS,
o usuário cadastrou1 endereço; sua criação e leitura protegida foram comprovadas
pela auditoria, sem ler/expor conteúdo na evidência. Não presumir edição existente.

Rollout inicial2501110f: api + lookupClientByPhone + addClientAddress + updateClientProfile,
depois Hosting, já publicado. Delta5cba7ad2: somente api + lookupClientByPhone e
Hosting. Credenciais de outro projectId não passam pela validação Firebase
do projeto da aplicação. Sem mudança de Rules, Staff, índices, Storage Rules ou
58 callables privadas. Rotas legadas de endereço não contornam OTP/ownership.
Storage Rules DEV permissivas preexistentes não guardam dados OTP e não são
copiadas para produção; sua política deve ser avaliada em escopo de segurança.

**DEV publicado5cba7ad2:** api/lookupClientByPhone us-central1 e Hosting56 arquivos;
12/12 hashes e cache PASS. Config SMS habilitada somente para2 destinatários
autorizados; reenvio60s, 2/telefone/hora, 5/IP/hora, 10/dia, OTP300s/grant600s.
Smoke: lookup único final8602 (sem endereços), status SMS200 e cinco operações
manage403 sem grant. Testes210/210 unitários/DOM/ESM,90/90 emulados,69/69 CRM,
delta final11/11 sobreposto; lint sem erros/avisos de código, build PASS com
warnings conhecidos, diff-check PASS. No smoke inicial não houve SMS real;
nenhum pagamento/WhatsApp real foi executado em toda a extensão.
Browser não inicializou (kernel assets/path não encontrado): a aprovação visual
390/1920 foi fornecida diretamente pelo usuário, sem screenshot automático
inventado. Usuário autorizou UM SMS ao final8602 e executou
manualmente: code_sent/phone_verified/address_create/address_read comprovados.
Leitura administrativa apenas, sem novos envios ou alterações. Nenhum código,
token ou endereço completo integra a documentação. A instrução inicial era
cancelar o formulário, mas o usuário informou cadastro e a auditoria confirmou
a gravação por ele: preservar esse registro, sem limpeza automática. Edição/
delete/default reais não foram executados; cobertura emulada permanece válida.

Aceite manual consolidado: campos/botões acessíveis e ausência de corte ou
sobreposição nas duas larguras. Não repetir SMS, testes ou deploy para registrar
esse aceite. A pendência interna desta extensão foi encerrada; a ambiguidade do
telefone final0290 continua registrada como dado DEV separado, sem merge ou
escolha arbitrária, e não foi necessária à homologação com cadastro único.

Esse trabalho não fecha o contrato InfinitePay não-PAID, não reabre aprovações
visuais anteriores e não pontua automaticamente. Fase9=75%, Fase11=100%,
Fase12=100%, Global=95,00%, Fase13=0%/NÃO INICIADA. PROD permanece intacta.

### Extensão de endereços no checkout celular — 2026-10-23

Implementada e validada localmente: reconhecimento de endereços persistidos por
projeção mascarada e seleção por referência opaca, com resolução completa somente
no backend. Fonte global `clientes/{customerId}.enderecos`, loja/contexto/revisão
validados e cadastro ambíguo recusado. Nenhum merge, escrita de endereço privado,
nova tarifa ou permissão; STRONG_AUTH, LEGACY_PHONE e GUEST continuam separados.
Contrato e limites em [CHECKOUT_IDENTITY_CONTRACT.md](CHECKOUT_IDENTITY_CONTRACT.md).

**Publicação DEV: CONCLUÍDA em 2026-10-23, código funcional125f0dbe.**
Somente api e lookupClientByPhone (us-central1), depois Hosting54 arquivos, em
crmdoceria-9959e. A nova tentativa após liberação do firewall aceitou autenticação,
concluiu ambas as Functions e o Hosting. Doze artefatos200/SHA-256 iguais ao build;
HTML/SPA/bootstrap/worker revalidáveis e main hashado immutable preservados.

**Homologação positiva do telefone de teste: PENDENTE POR AMBIGUIDADE DE DADOS.**
O lookup remoto retornou FAILED_PRECONDITION/cadastro não único: mais de um
cadastro corresponde aos formatos aceitos do telefone já autorizado. Nenhum
cadastro foi escolhido arbitrariamente, mesclado ou alterado. Configuração pública
Matriz200, contexto canônico guest200 e bloqueio de endereço salvo para guest409
PASS. Nenhum payload de endereço privado foi exposto. Projeção/lista/seleção/frete
positivos continuam comprovados localmente/emulados; não foram declarados PASS
nesse cadastro remoto. Auditar os registros canônicos e sua associação autorizada
antes de resolver a duplicidade; não deduzir ownership pelo telefone nem fazer
merge automático. Esta dependência de dados DEV é distinta do contrato externo
InfinitePay. Rules/índices/Storage Rules e PROD intactos; nenhum pedido, pagamento,
estoque ou endereço remoto alterado. Somente contextos/rate limit normais do smoke.

Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%/NÃO INICIADA.
Nenhuma ação PROD ou operação financeira/WhatsApp autorizada por esta extensão.

### Atualização — identificação por celular (2026-10-22)

Regressão interna pré-PROD identificada após o fechamento anterior: o lookup
legado rejeitava cadastro vinculado, e o checkout não separava escolha weak da
sessão Firebase ambiente. **Correção local/testes, deploy DEV e homologação pela
interface A/B/C/D concluídos em 2026-10-22. Regressão de identificação legada por
telefone após strong auth — RESOLVIDA.** O gate abaixo substitui a pendência do
checkpoint 0a6ac2aa, sem alterar o contrato externo ou percentuais.

Contrato e provas locais em [CHECKOUT_IDENTITY_CONTRACT.md](CHECKOUT_IDENTITY_CONTRACT.md).
Modo servidor por contexto/loja/revisão, resposta mínima no lookup, ausência de
merge e de privilégios herdados, pagamento weak negado mesmo com ID token válido.
Guard Customer privado, sessão Firebase/Staff/FCM e carrinho preservados.
Rules e contrato externo InfinitePay inalterados. Publicação necessária somente
`api`, `lookupClientByPhone` e Hosting DEV: publicados em `crmdoceria-9959e`,
commit funcional `c97a2c4d`, após reautenticação da CLI. Ambas as Functions
us-central1 tiveram update bem-sucedido. Lookup remoto sem Auth encontrou o
cadastro, com somente nome abreviado e referência opaca; seleção forte sem
Auth foi negada401. Nenhum endpoint de criação de pedido/pagamento foi chamado.
Onze arquivos Hosting conferidos por SHA-256 contra o build, incluindo cardápio,
aliases, helper de identidade, controlador e bundle. Cache de bootstrap/HTML/worker
revalidável e bundle immutable preservados.
As ferramentas de navegador voltaram a funcionar nesta retomada. A sem strong Auth
em sessão isolada e B após login manual e-mail em conta DEV autorizada localizaram
o cadastro com nome abreviado, sem perfil/endereços privados. Em C, Online ausente
e convite Google/e-mail visível; sessão de e-mail continuava válida em Área do
Cliente, sem CRM. Em D, login manual explícito da mesma conta restaurou elegibilidade
Online e seu próprio Customer; carrinho idêntico de1 Docinho/R$1,00/Matriz.
Nenhum botão de confirmar pedido foi acionado, nem endpoint de criação de
pedido/pagamento ou reconciliação chamado.

Na homologação foi constatado um defeito de interface: display:flex sobrepunha
hidden=true em Editar Perfil weak. Corrigido por classe hidden e guarda no handler,
commit 6b50d893, publicado somente Hosting DEV após64/64 testes focados, lint sem
erros, build e diff-check PASS. Controle negativo do baseline reproduziu display:flex;
correção/DOM remoto demonstram display:none. Nenhum acesso privado foi liberado.
Onze hashes remotos correspondem ao build; HTML/aliases atuais SHA-256
435135603e806949b5725ea93dd0e874dc728384d3fc2c827be10d5f677b2b02.
Backend permanece c97a2c4d; Functions/Rules não foram republicadas nesta retomada.
Testes gerais anteriores185/185,76/76 emulados e69/69 CRM continuam aproveitados;
o delta posterior foi somente UI/guard e teste correspondente. Zero erros JS
observados nas duas sessões. Evidências externas sanitizadas preservadas.

A pendência interna de telefone foi encerrada. A dependência externa financeira segue
separada: resposta técnica oficial da InfinitePay. Fase9=75%, Global=95,00%,
Fase13=0%; produção intacta, sem transação financeira/WhatsApp.

**Preparação interna disponível: READY após as verificações desta entrega.**
**Liberação/publicação PROD: NÃO READY / NÃO AUTORIZADA.** Fase 13 não iniciada.
Este documento é plano executável futuro, não evidência de inspeção ou validação
do projeto remoto de produção. A única dependência externa do quarto marco da
Fase 9 é o contrato verificável InfinitePay. Sua resposta poderá exigir implementação
e testes condicionais; esse trabalho não está antecipadamente certificado.

Worktree atual DEV: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`,
branch `feature/infinitepay-customer-auth`, projeto reservado `crmdoceria-9959e`.
Produção usa exclusivamente o workspace próprio `projeto-doceria-multiloja` e
projeto `ana-guimaraes`, somente após autorização. Nenhuma ação executada ali.

## Inventário integral do plano e classificação

Varredura de todas as1851 linhas da base f78fb9e7, com345 referências candidatas a
pendência/backlog/limite; leitura dos critérios, checkpoints de resolução e contratos
associados. Registros históricos não foram apagados nem tratados como pendências
novas quando resolvidos posteriormente. A contagem inclui menções repetidas.

| Grupo | Classe | Destinação vigente | Bloqueia Fase 9? |
|---|---|---|---|
| Origem/schema/consulta de eventos não pagos | A, externa | Pendente, bloco único InfinitePay | SIM |
| Enum/política conservadora e auditoria de sinais não verificáveis/desconhecidos | B, interna | Implementada localmente nesta entrega | Não, após testes |
| Host oficial de checkout .com.br antes rejeitado | B, interna | Corrigido por host exato, com negativas de segurança | Não, após testes |
| Matriz dos20 cenários financeiros e ownership/store/IDs/valor | B, interna | Consolidada nos testes atuais e mapa abaixo | Não |
| Readiness, inventário de execução, perguntas e plano após resposta | C, documental | Este documento e relatório atualizados | Não |
| Antigos bloqueios Auth/OAuth/e-mail/push/Maps/handle/shell/multiloja/hydration/visuais | C, histórico | Resolvidos pelos checkpoints posteriores e Fases11/12 concluídas; evidência reutilizada | Não |
| Recuperação OTP do legado, associação de providers e perfis compartilhados | D, opcionais | Fora do escopo; nenhuma implementação implícita | Não |
| Limite de1000 candidatos de histórico/escala;20 canais na descoberta V1 | E, futura | Limites defensivos explícitos; URL direta e paginação conforme contrato | Não |
| Preview sem preço repetido; menu superior desktop sem outside/Escape; UUIDs longos; feedback de carregamento | D/E, UX aceita | Backlog preservado, sem reabrir Marco4 | Não |
| Duplicidade aparente de endereço DEV | D, massa de dados | Observação aceita; não deduplicar automaticamente | Não |
| Fixtures antigas catálogo21 e WhatsApp2; lint ampliado22 erros/79 avisos | E, tooling preexistente | Demonstrados no baseline; não declarados corrigidos; delta atual tem lint próprio | Não |
| Source maps native-audio e bases de navegador antigas | E, tooling | Warnings conhecidos; sem atualizar dependências por consequência | Não |
| Tokens FCM históricos e indisponibilidade de rede no cleanup | E, residual | Dívida/risco conhecidos; T1 atual e isolamento previamente homologados | Não |
| Garavelo sem frete; agenda definitiva/force_open; publicação ApFood legado | E, configuração operacional | Dados legítimos, sem inventar tarifas/horários. Entrega Garavelo continua bloqueada; catálogo/retirada próprios preservados | Não |
| Endereço da loja na retirada e comprovante provider ausente em alguns históricos | D/E | Melhorias/limites de dado; não fabricar informação | Não |
| Comparar e configurar PROD, artefato próprio, secrets, CORS, migração e smoke | Fase13, futura | Plano preparado abaixo; executar só com autorização, não é tarefa esquecida desta Fase9 | Não nesta fase |

As linhas D/E **não foram corrigidas nem convertidas em CONCLUÍDAS como produto**.
O que está concluído é sua classificação/aceite de não bloqueio. Não se pode declarar
“zero dívidas no repositório”. A declaração de fechamento interno é restrita aos
critérios obrigatórios atuais anteriores à Fase13, independentes da resposta externa.

## Política financeira implementada

`payment-signal-policy.js` é uma política nossa, não um schema inventado do provider.
Nomes conhecidos são constantes; event/type/status são somente hints defensivos.
Qualquer hint diferente de paid, desconhecido, malformado ou conflitante interrompe
processamento automático antes de consulta/Firestore. Dados inválidos recebem400.
Uma indicação paid apenas permite continuar à consulta independente; nunca confirma.
Referências são copiadas/validadas antes de await, sem aceitar coerção de objetos.

Sinais retidos recebem `eventDisposition: UNVERIFIED`, sem recibo financeiro,
mudança de pedido, reserva, estoque ou cupom. Auditoria operacional via logger do
servidor contém apenas outcome/reason/eventHint de allowlist e hash abreviado da
referência válida. Nenhum body, UID, handle, NSU integral, token ou PII é registrado.
O processamento aguarda o logger; falha recebe503 e não autoriza efeitos. Esse log
não certifica origem nem é recibo financeiro/registro de reembolso. Não há promessa
de entrega remota exatamente uma vez pelo sistema de logs.

O200 significa recepção/auditoria do sinal, não confirmação financeira. Não garante
replay financeiro automático no futuro: quando o contrato chegar, auditoria servirá
à investigação e será necessária consulta oficial/processo autorizado. O payload
inteiro não é guardado para replay, por privacidade e ausência de schema confiável.
Formato legado de aprovação sem hint mantém a mesma consulta e transação existentes.
Sinais sem marcador reconhecível nunca concedem autoridade por campos soltos: somente
uma resposta de aprovação conciliada pode produzir PAID.

Allowlist agora aceita também **somente** `checkout.infinitepay.com.br`, além dos
domínios .io já admitidos. HTTPS obrigatório; userinfo e porta alternativa negados;
host semelhante não é aceito. Link inválido mantém criação ambígua bloqueada, sem
segunda chamada de criação.

## Mapa dos20 cenários obrigatórios

Execução atual, commit funcional **8ea926a8**: **65/65 integração**, **31/31 unitários**
e **36/36 CRM focado**, todos PASS. Lint dos5 arquivos de código/teste alterados:
**0 erros/0 avisos**. Sintaxe Node e diff-check PASS. Não somar a primeira execução
13/13 unitária novamente, pois está incluída nos31. Provider/Maps sintéticos; emuladores
Auth/Firestore encerrados normalmente. Sem novo build frontend ou deploy: fontes
frontend/Rules/dependências não mudaram; evidências de build/ESM da Fase11 reutilizadas.

| # | Cenário | Evidência automatizada |
|---|---|---|
|1–6 | PAID normal/duplicado/fora de ordem, checks repetidos e ambas as ordens webhook↔check | checkout-emulator e checkout-http, recibo único/estoque único |
|7 | transaction_nsu divergente/reutilizado | payment-contract-emulator e segunda transação em checkout-emulator: negação/revisão, sem novo consumo |
|8 | order_nsu divergente/inexistente/vínculo contraditório | payment-contract-emulator:404/409 ou revisão, sem mutar pedido alheio |
|9 | amount divergente | checkout-emulator + assertPaid: revisão, sem confirmação |
|10 | storeId divergente | payment-contract-emulator: negar antes da consulta; conta persistida, sem fallback |
|11–12 | Evento desconhecido/duplicado | política + HTTP, retido/auditado sem query ou escrita financeira |
|13–16 | Antigo após PAID e regressão para PENDING/FAILED/CANCELED | HTTP em PENDING/PAID e testes de contrato, snapshots idênticos |
|17–19 | Refund/canceled/payment_failed não verificados | política/contrato/HTTP: sem provider query, recibo, cancelamento ou estoque |
|20 | settled sem efeito operacional duplicado | política/contrato/HTTP, PAID preservado |

Também cobertos: late paid após release/cancelamento, reserva/cupom, concorrência,
retomada/criação ambígua, propriedade Customer e catálogo/config multiloja. Provider e
Maps exclusivamente sintéticos; Auth/Firestore somente no emulador demo. Isso não
simula autenticação nem inventa payload oficial de estorno.

## Inventário preparado para execução futura da Fase13

| Domínio | Preparação local concluída | Gate na futura execução autorizada |
|---|---|---|
| Functions | Delta desta entrega afeta somente runtime da export api (us-central1). Inventário completo inclui Customer, paymentSettingsGet/Save, createStore, expiry e triggers existentes | Comparar manifesto/diff com PROD real; não publicar todos os132 targets por conveniência. Não remover funções ausentes no pacote |
| Hosting | Fonte, prebuild, cache HTML/SPA/bootstrap/worker revalidável e assets hashados immutable identificados | Build próprio no workspace PROD; nunca promover crm/build DEV diretamente |
| Ambiente | checkout-environment e assert-dev-deploy rejeitam promoção direta | Adaptar ambiente no workspace próprio sem neutralizar guardas DEV; confirmar caminho+project antes de build/deploy |
| Rules | Arquivo versionado, ownership/financeiro testados; nenhuma alteração nesta entrega | Comparar com PROD, revisão e publicação específicas; não abrir config interna |
| Índices | Pedidos clienteId/createdAt e checkoutPayments payment_status/expiresAt versionados | Conferir necessidade/estado remoto; sem publicar índices indiscriminados |
| Secrets | Nome GOOGLE_MAPS_SERVER_API_KEY e vínculo api identificados; nenhum valor lido/copied | Provisionar/validar no projeto correto. API Key InfinitePay somente se contrato/implementação futura exigir |
| Config DEV | Estado anterior homologado: aliases/canal, config própria, pagamento por loja e entrega Garavelo bloqueada | Não extrapolar dados DEV a PROD; esta entrega não releu nem alterou dados remotos |
| Config PROD | Contrato V1 e migration plan preparados | Levantamento autorizado por loja, backup/precondições e valores legítimos; sem defaults financeiros |
| Multiloja | Public-config/public-list, readiness por domínio, aliases e Festas/canal explícito | Backend compatível antes de Hosting; migração própria antes de ativar capacidades |
| Maps | Cotação autoritativa backend e anti-adulteração previamente homologados | Restrições/quota/serviço de rotas próprios; não reutilizar chave browser no servidor |
| CORS/Auth | Callables usam allowlist; API pública usa cors origin:true, autorização continua server-side | Conferir origens, OAuth, redirects, provedores e URLs do projeto próprio; CORS não é autorização |
| InfinitePay | Conta/config por loja e registro da tentativa; sem fallback; PAID homologado | Resolver dependência externa e homologar mudanças que ela exigir; ação real financeira só por autorização separada |
| Flags/WhatsApp | Worker exige config explícita; trilha atual permanece desligada | Não habilitar enabled/automaticEnabled nem publicar WhatsApp como consequência da promoção |
| Artefatos | Temporários não rastreados preservados fora de staging/build | Empacotar apenas arquivos aprovados; excluir funções/tests/fixtures/manifesto temporário do upload |
| Observabilidade | Diagnósticos sanitizados e sinais retidos; sem payload/credencial | Conferir acesso/retenção/logs sem dados privados; não confundir log com prova provider |

### Rollback preparado

1. Antes da futura publicação: registrar release Hosting, revisões seletivas das Functions,
   versões de configuração e hashes do pacote aprovado; snapshot privado autorizado.
2. Publicar backend compatível primeiro e validar endpoints; depois frontend. Sem mistura
   de contratos que quebre versões abertas. Não executar comandos nesta preparação.
3. Em falha de frontend: retornar release Hosting compatível. Em backend: revisar versão
   anterior para não retirar guards financeiros e redeploy seletivo autorizado.
4. Dados só voltam por alteração validada com precondições, nunca restauração cega.
   Não apagar recibos, pagamentos, pedidos, auditoria nem repor estoque em massa.
5. Não rebaixar estado financeiro terminal para fazer rollback. Se houver dúvida,
   suspender novas vendas por capacidade/config autorizada e reconciliar existentes.

### Smoke e checklist pós-deploy preparados

- Conferir hashes/cache e versão real em navegação normal, sem depender de hard reload.
- Projeção pública com allowlist e readiness; aliases, Festas/canal e loja inexistente;
  catálogo/retirada/entrega habilitados somente pela configuração própria.
- Customer/Staff e ownership com contas autorizadas, rotas diretas, contexto, logout,
  Back e FCM T1/T2 conforme alteração efetiva; não repetir toda a história por padrão.
- Reorder/carrinho na mesma aba e cancelamento seguro, sem pedido/checkout financeiro.
- Logs sem erro bloqueante ou PII; WhatsApp continua off, nenhum job disparado por smoke.
- Nenhum pagamento/refund/Pix/cartão/cancelamento financeiro por implicação do deploy.
  Qualquer ação real terá pedido/loja/valor/efeito e autorização separados.
- Registrar resultados, delta publicado, rollback disponível e gate manual. Não avançar
  percentuais automaticamente por deploy.

## Dependência única e retomada

Para o último marco FINANCEIRO: **resposta técnica oficial da InfinitePay**,
detalhada na seção vigente do relatório. O requisito de endereços/SMS e o save
persistente sem OTP já possuem aceite DEV. A nova migração de CAPTCHA visível
para Enterprise SCORE é gate interno separado até confirmação do Console SMS
defense e homologação normal mobile/desktop; não infla percentuais.
Preparação e testes internos não substituem a resposta nem concedem pontuação.
Quando chegar: conferir fonte/versão, escolher somente o ramo condicional documentado,
implementar/testar o que for necessário e avaliar o quarto marco. Não executar refund
ou iniciar Fase13 automaticamente. Nenhum contato enviado nesta entrega.

### Tentativa de publicação DEV — 2026-10-23

Preferência operacional do usuário: tentar sempre a publicação DEV autorizada;
se rede/firewall/autenticação impedir, registrar resultado e deixar o comando
para execução manual posterior. Não pedir códigos, tokens ou credenciais.

Tentativa real executada com staging novo `.deploy-checkout-addresses-125f0dbe`,
36 arquivos runtime tracked idênticos às fontes, sem `functions.yaml` antigo ou
fixtures. Predeploy confirmou caminho absoluto DEV e projeto crmdoceria-9959e.
CLI encerrou com código1/Authentication Error (credencial expirada), além de aviso
sobre falha de rede na obtenção de MOTD/config. Não foi possível atribuir a falha
somente ao firewall. Nenhuma atualização de Function confirmada; Hosting não foi
executado porque depende do backend novo. Rules, índices, Storage e PROD intactos.

Comandos PowerShell para este código (125f0dbe), no mesmo computador/workspace:

```powershell
Set-Location 'C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree'
firebase login --reauth
$env:FUNCTIONS_DISCOVERY_TIMEOUT = '60'
firebase deploy --project crmdoceria-9959e --config .deploy-checkout-addresses-125f0dbe/firebase.json --only 'functions:api,functions:lookupClientByPhone'
```

Somente após backend concluído e API validada, executar separadamente:

```powershell
firebase deploy --project crmdoceria-9959e --only hosting
```

O staging e o build atuais já estão preparados e fora do Git. Se as fontes
mudarem antes da execução, renovar o staging e o build e revalidar os testes;
não reaproveitar snapshot antigo inadvertidamente. Conferir artefatos/hash remoto
e homologação específica após publicar. Não usar deploy global ou projeto PROD.

### 2026-10-25 — Gate interno adicional: Customer canônico por telefone

PENDENTE: implementação local e consolidação ainda não publicadas. Proposta final0290 em CUSTOMER_PHONE_CONSOLIDATION_0290_PROPOSAL.md aguarda aprovação de canônico/aliases/3 UIDs/acesso a64 pedidos; o usuário pediu o caminho para leitura. Primeiro cadastro forte de telefone livre permanece sem SMS por decisão expressa. Disco C: sem espaço bloqueia build/commit; limpeza de cache foi rejeitada pela revisão automática. Arquivo novo afetado recuperado e testes9/9+diff-check PASS, sem migração/alteração remota. Retomar suites/Rules/tooling após liberar espaço. Não declarar readiness final nem única pendência total; InfinitePay continua pendência financeira externa. Fase9=75%, Global=95%, Fase13=0%, PROD intacta.

### 2026-10-25 — Entrega técnica Customer por telefone concluída no DEV

Backend/Rules/Hosting publicados, migração segura e consolidação0290 aprovadas e aplicadas. Commits f7466d4a+c6993f9f;18/18 hashes remotos,91/91 pedidos inalterados,12 endereços/1 padrão/3 UIDs no grupo, Thiago com endereço histórico mascarado. Índice privado/transactions, UID/alias resolver, claim específico, bloqueio de troca simples de telefone, reserva/uso de cupons por família e isolamento de grants implementados.134 casos emulados e60 CRM; build/lint/diff/ESM PASS, preexistências documentadas. Veja CUSTOMER_PHONE_CANONICALIZATION.md e evidence/customer-phone-delivery-dev-2026-10-25.json.

O bloqueio de disco anterior está RESOLVIDO. Gate desta extensão ENCERRADO: usuário respondeu PASS ao aceite manual consolidado pós-deploy em390/1920 (lista/histórico/ações protegidas). Customer phone canonicalization CONCLUÍDA E HOMOLOGADA no DEV; evidência manual, sem print automatizado. A extensão anterior de edição de perfil/Enterprise após OTP mantém seu gate próprio e nenhum SMS adicional foi enviado.4 cadastros sem telefone válido,3 endereços sem owner e1 pedido apenas por telefone permanecem preservados como revisão histórica, sem invenção/merge indevido.

Readiness final ainda NÃO liberada: aceites internos remanescentes e resposta técnica oficial InfinitePay. Fase9=75%, Fase11/12=100% histórico, Global95,00%, Fase13=0%. Nenhum recurso PROD, usuário Auth, SMS, pagamento/reembolso/cancelamento financeiro ou WhatsApp alterado/executado por esta entrega. Rollback lógico preparado com backups tipados e precondições; não sobrescrever alterações posteriores nem apagar histórico.


### 2026-10-25 — Fechamento manual da canonicalização por telefone

PASS recebido para todo o roteiro consolidado em390 CSS px e1920x889. Esta extensão está CONCLUÍDA E HOMOLOGADA NO DEV; a pendência visual anterior desta entrega foi encerrada. Atualização exclusivamente documental, sem novo deploy ou operação remota. Permanecem separados o gate anterior de Editar Perfil/Enterprise após OTP, as revisões históricas de dados sem prova e a resposta técnica InfinitePay. Não declarar readiness global final nem iniciar produção. Fase9=75%, Fase11/12=100%, Global95,00%, Fase13=0%.
## 2026-10-25 — Gate interno: Visualizar como Cliente — somente leitura

**CONCLUÍDO E HOMOLOGADO MANUALMENTE NO DEV.** Requisito novo, sem reescrever a
conclusão histórica das fases11/12. Funcional `c75a24ea`,19 Functions necessárias
e Hosting DEV publicados;59/59 hashes/cache PASS.106 unitários,66 CRM,59 emulados,
ESM6 entradas/2 controles negativos, build, lint sem erros novos e diff-check PASS.

Capability específica/revogável, Staff ativo/loja conferidos no backend, Customer
canônico/aliases/histórico revisado, projection allowlists e sessão administrativa
opaca. Não impersona Customer, não altera Firebase Auth canônico, não cria token
Customer e não executa edição/reorder/SMS/checkout/pagamento. Lease por UID bloqueia
também mutações Customer com token válido quando o header de preview é removido.
Controle/auditoria são privados; não constituem alteração do cadastro/pedido.

Usuário aprovou390×800 e1920×889: faixa/título, home, perfil/12 endereços/1 padrão,
histórico consolidado/detalhe, saída com admin conectado e ações somente leitura.
Auditoria inicial STARTED/ENDED confirmada,0 sessões ativas naquele encerramento.
Complemento: usuário confirmou “detalhe abriu”;2 ORDER_VIEWED reais no DEV, para
C03 e C07,4 STARTED/3 ENDED. C02 sem evento de detalhe nessa consulta; sua projeção
canônica e aceite anterior são evidências separadas. Havia1 preview ativo, sem
encerramento forçado; saída pelo botão ou TTL30min. Nenhum novo gate ou alteração
no aceite consolidado.

Contrato/limites/endpoints/testes em ADMIN_CUSTOMER_PREVIEW.md e evidências em
evidence/admin-customer-preview-dev-2026-10-25.json. Este aceite não fecha por
implicação os gates anteriores de outras funcionalidades. Nenhuma produção,
secret/config PROD, migração PROD, pagamento/SMS/WhatsApp real ou novo deploy após
o fechamento documental. Fase9=75%, Fase11/12=100%, Global=95,00%, Fase13=0%.

## Requisito adicional — performance de lojas CRM (26/10/2026)

- Correção interna `a23912fc` commitada/enviada ao DEV, com baseline autenticado recebido e testes/build/lint/diff PASS. Relatório: `CRM_STORE_LOADING_PERFORMANCE.md`.
- **Publicado no DEV em27/10/2026:** api(us-central1) e Hosting, exit0;59/59 hashes e política de cache conferidos. Authentication Error anterior resolvido após confirmação de login/firewall do usuário. Descoberta local repetida com variável oficial FUNCTIONS_DISCOVERY_TIMEOUT=60 após limite10s; nenhuma mudança de runtime para publicar. Mediana HTTP public-list2520→926ms, redução observada63,25%; resposta299bytes/4 entradas, sem campos privados.
- **Comparação técnica Staff normal/hard recebida e PASS em27/10/2026:** seletor2504,3→1843,1ms, nomes2953,9→1843,1ms, atalhos10641→942,5ms após início; diretório2→1/GET4→1, Customer e company não bloqueiam shell/nomes. Primeiras coletas públicas descartadas da comparação Staff após confirmação do usuário. Evidências after-staff/comparison em docs/evidence, sem presumir console/visual de todos os controles.
- **Publicado ajuste complementar8f6dbdb4 em27/10/2026:** preferência só de ID por UID corrige refresh, mesma limpeza privada/capabilities,94 React+21 sessão PASS, build/lint/diff PASS. Após liberação CLI, somente Hosting publicado com exit0;59/59 hashes remotos,10 fontes e cache PASS. API permanece a23912fc. Evidência: evidence/crm-store-preference-delivery-dev-2026-10-27.json. **PENDENTE somente aceite funcional v2:** Geral↔loja/refresh/controles; escolher loja após carregar v2, sem migrar preferência global antiga sem dono. Teste throttled pode ser agrupado. Sem repetir normal/hard completos já validados.
- Não declarar readiness interna final enquanto esse gate estiver pendente. Não altera fases históricas nem autoriza produção: Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%/NÃO INICIADA. Nenhum SMS/WhatsApp/pagamento real ou PROD.

Atualização de aceite: usuário confirmou loja preservada após refresh (PASS), mas seção atual retornava à Página Inicial (FAIL). Correção complementar local usa staff-section-v1:{UID}, ID sem dados/permissões, valida catálogo/permissão atual antes de renderizar e só reconcilia após Auth pronto. Chave global sem dono não é migrada; diretório, limpeza privada e preview administrativo permanecem separados.115 testes React PASS e lint0/65 anteriores; build/publicação/aceite de Nota Fiscal, Clientes, Financeiro e Página Inicial ainda em andamento. **Requisito interno permanece PENDENTE de entrega/homologação desta correção.** Percentuais e bloqueios pré-PROD inalterados.

Qualidade complementar concluída:22 testes Auth/cache/FCM/cross-tab PASS, build PASS (main.f0e6572f.js436,09kB gzip, quatro avisos conhecidos), diff-check PASS. Somente Hosting DEV necessário; publicação/aceite remoto serão registrados separadamente. Não altera a API, regras de acesso ou percentuais.
