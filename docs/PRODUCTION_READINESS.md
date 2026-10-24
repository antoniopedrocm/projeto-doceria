# Readiness interno pré-PROD — 2026-10-21

## Decisão e fronteira

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
detalhada na seção vigente do relatório. O novo requisito de endereços/SMS é uma
pendência interna separada até homologação, sem inflar percentuais.
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
