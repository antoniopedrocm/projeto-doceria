# Readiness interno pré-PROD — 2026-10-21

## Decisão e fronteira

### Atualização — identificação por celular (2026-10-22)

Regressão interna pré-PROD identificada após o fechamento anterior: o lookup
legado rejeitava cadastro vinculado, e o checkout não separava escolha weak da
sessão Firebase ambiente. **Correção local/testes e deploy DEV concluídos;
homologação pela interface A/B/C/D ainda PENDENTE.** Não declarar esta regressão resolvida remotamente
nem afirmar ausência de pendências internas enquanto esse gate não passar.

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
As ferramentas de controle do navegador falharam na inicialização do runtime;
evidência visual remota não foi fabricada. Execução manual A/B/C/D solicitada,
sem finalizar pedido ou cobrança. A dependência externa financeira segue
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

**Resposta técnica oficial da InfinitePay**, detalhada na seção vigente do relatório.
Preparação e testes internos não substituem a resposta nem concedem pontuação.
Quando chegar: conferir fonte/versão, escolher somente o ramo condicional documentado,
implementar/testar o que for necessário e avaliar o quarto marco. Não executar refund
ou iniciar Fase13 automaticamente. Nenhum contato enviado nesta entrega.
