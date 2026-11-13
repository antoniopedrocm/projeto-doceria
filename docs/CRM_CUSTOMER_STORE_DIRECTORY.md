# Gestão de Clientes por loja — correção local DEV

## 13/11/2026 — aceite e significado da coluna Status

Dono aprovou a conferência de Clientes por loja, valores, refresh e modal de recebimento; informou depois que o recebimento registrado por ele resolveu a pendência financeira exibida. A dúvida remanescente é cadastral: `Ativo`/`Não informado` não representa pagamento nem autenticação.

Evidências de código: `crm/src/App.js`, componente Clientes, define `defaultClientFormData.status = Ativo`, mas não renderiza campo de edição de status; a coluna apresenta o valor persistido ou Não informado. `functions/staff-customer-directory.js` projeta o campo sem exigir Ativo para incluir o cliente. `functions/customer-registry.js`, `createForStrong`, não inicializa status; `createOrGet` preserva os dados recebidos sem padrão obrigatório. `functions/crm-client-edit.js` permite o campo como texto cadastral. `functions/checkout-auth.js`, `verifiedIdentity`, verifica a conta Firebase desabilitada separadamente, sem usar essa classificação. Não foi identificada regra de bloqueio de Customer por esse campo nos fluxos auditados. VIP possui apenas tratamento visual na tabela, sem benefício automático comprovado.

Conclusão: apresentação informativa funciona; preenchimento entre origens não é uniforme e o CRM atual não oferece gestão explícita desse status. Nenhuma normalização, mudança de acesso ou alteração remota foi realizada. Percentuais preservados: global97,00%, Fase9=100%, Fase10=93,75%, Fase13=0%.

## Fechamento técnico — 12/11/2026: release final d1b23d2507ff6204

Hosting DEV final **d1b23d2507ff6204**, bundle **main.ae7de988.js**, 61/61 hashes e 6 rotas conferidos. API **api-00078-rig** e as outras três Functions do alvo permanecem ACTIVE; 143 Functions fora do alvo, Rules, referências de Secrets e variáveis de ambiente preservadas. Sem commit/push.

Na conferência autenticada do agente, somente leitura: Matriz com 6 clientes (Jéssica R$29,56 pendentes; Fabíola R$1,00 confirmado), Garavelo vazio, Visão Geral com 16 canônicos e 38 ocorrências sem loja comprovada; refresh preservou a lista. O modal de recebimento exibiu R$14,78/Cartão de Crédito, checkbox desmarcado e confirmação desabilitada; nenhum recebimento real foi registrado.

A primeira conferência encontrou fechamento do modal por remontagem de Pedidos durante refresh. Corrigido somente o novo modal: estado e renderização na raiz Staff estável, com fechamento ao trocar usuário/loja/seção. Quatro regressões novas comprovam persistência e limpeza de contexto. Também suprimida a aplicação de respostas idênticas do polling de Clientes: mantém consultas/autorização, mas evita remontar formulários sem mudança real. Três testes novos cobrem igualdade, mudança de métricas/permissões e recuperação após erro; erro continua limpando dados privados.

**650/650 React, 64 suítes PASS** na fonte final; 65 Node de Clientes e 77 integrações previamente aprovados permanecem válidos (backend não alterado após essas execuções). Regressão de taxas: 30 Node/69 integrações por ambiente; PROD local 623 React. Build final passou com 1 worker e heap reduzido após falha de memória; nenhum arquivo pessoal foi apagado ou configuração persistente da máquina alterada. Lint final 0 erros/66 avisos antigos do App; diff-check PASS.

Modal conferido no Chrome DEV em desktop e 390×800, preservado através de atualização/redimensionamento; sem scroll horizontal. Painel de taxas conferido nas duas lojas, padrão STORE e aviso pendente; nenhuma alteração salva. Isso é verificação técnica do agente, não novo aceite do titular nem homologação financeira real. Capturas reais ficaram em Temp, fora do Git, para evitar incluir dados privados da tabela no repositório.

O titular informou **“acredito que 12, mas amanhã eu confirmo”**: hipótese não usada como baseline. Lembrete agendado para **13/11/2026 às 09h**. Confirmação da política, conta compartilhada e credenciais por loja continua pendente. Sem API Key no chat. Global formal **97,00%**, Fase9 **100%**, Fase10 **87,50%**, Fase13 **0%**. PROD permanece bloqueada.


## Estado vigente — 12/11/2026: legado classificado, pendências visíveis e recebimento manual publicado

A homologação anterior NÃO foi aceita. O titular esclareceu que Fabíola apareceu após sua finalização:1 pedido/R$1,00 PAID. Jéssica tem2 pedidos a combinar finalizados, R$29,56 PENDING; definir método não confirma recebimento. Corrigida a separação entre relacionamento comercial e total recebido; Jéssica aparece com pendência destacada, sem fabricar PAID. Adicionada a ação separada autorizada Registrar pagamento recebido, com transação, confirmação explícita, escopo Pedidos+Financeiro, auditoria/idempotência e bloqueio de lançamento duplicado. Nenhum recebimento real foi executado pelo agente.

[Diagnóstico completo e contrato do recebimento](CRM_CUSTOMER_STORE_LEGACY_AUDIT.md).43 casos auditados:32 Customer seguro sem loja,6 sem Customer/loja confiáveis,4 visitantes esperados e1 referência legacy_phone recuperada. As5 Matriz são subconjunto das43. Restam38 para regularização de loja autorizada; não atribuir Matriz por telefone/nome. Status vazio agora Não informado; detalhes técnicos filtrados no backend/UI para Staff administrativo autorizado.

Projeção real somente leitura: **Matriz6 clientes,46 compras confirmadas elegíveis/R$898,23 e2 pedidos pendentes/R$29,56; Garavelo0; Geral16 canônicos**, incluindo cadastros sem compras. [Auditoria](evidence/customer-directory-legacy-dev/readonly-audit.json).643 React,65 Node Clientes,77 integrações de Clientes/recebimento/Rules/fiscal/estoque PASS; regressão financeira30 Node/69 integrações PASS (sobreposição). Build/lint sem erros/diff-check PASS.

DEV API `api-00078-rig`, nova callable `adminOrderReceivePayment`, Hosting `254526a07aba3209`;147 Functions,143 preexistentes fora do alvo inalteradas.61/61 hashes e6 rotas PASS. Rules iguais à release anterior; sem novo deploy de Rules. Fonte/evidências em `docs/evidence/customer-directory-legacy-dev/`. Permanecem revisão antes de commit/push e aceite do titular; publicação técnica não encerra a homologação. DEV permanentemente autorizado; PROD bloqueada. Global97,00%, sem incremento.


## Rechecagem — 12/11/2026: CLI e publicação confirmadas; navegador ainda indisponível

Titular respondeu “tente novamente” às duas solicitações anteriores; **não é PASS manual**. [Evidência da nova tentativa](evidence/customer-directory-dev/retry-20261112.json). CLI com confiança do Windows respondeu HTTP200; API `api-00077-qux`, Hosting `186b142d3703e536` e Rules `eaa8ed3d-0434-41c7-bc5b-587530841fbb` continuam publicados e consistentes. Main bundle conferido pelo hash;145outrasFunctions inalteradas. Navegador falhou em duas inicializações, inclusive após reset: “failed to write kernel assets … os error3”; nenhuma aba DEV acessível por CDP encontrada. Sem novo build/teste/deploy por não haver mudança funcional ou de release. Não repetir SMS, vínculos ou operações reais. **Próximo ponto:** aceite visual autenticado do titular em Clientes (Matriz/Garavelo/Visão Geral/refresh), ou restauração do controle de navegador para leitura; preservar aprovação antes de commit/push quando aplicável e autorização permanente de deploy DEV. **Global97,00%; Fase9 100%; Fase10 87,50%; Fase13 0%; PROD bloqueada.**


## Retomada aprovada — 11/11/2026: publicado no DEV; aceite visual autenticado pendente

**Destino exclusivo: Firebase DEV `crmdoceria-9959e`.** Publicação concluída a partir de artefato isolado no workspace DEV, sem commit/push e sem incluir a alteração de taxas de cartão ainda em revisão. HEAD mantido `7e7d7b69`. [Manifesto](evidence/customer-directory-dev/artifact.json), [verificação remota](evidence/customer-directory-dev/remote-after.json), [conferência independente](evidence/customer-directory-dev/independent-reconciliation.json).

O Dono aprovou a correção de Clientes para homologação e autorizou leitura autenticada dos dados reais DEV. **Deploy DEV permanentemente autorizado nesta execução e próximas fases**, após validação técnica e confirmação de workspace/projeto; não pedir novamente autorização de publicação DEV. Revisão antes de commit/push continua preservada quando aplicável. Essa autorização não abrange PROD, migrações, mutações de dados de negócio, SMS, cobranças ou vínculos permanentes.

### Leitura real e conferência

Firestore `(default)`, STANDARD / FIRESTORE_NATIVE. Inventário por contagem e snapshot limitado: **20 documentos Customer (16 canônicos + 4 aliases), 4 índices de alias, 38 pedidos raiz e 70 pedidos nas lojas**. Não foram persistidos nomes, telefones, e-mails ou endereços reais nas evidências; Staff/Customers usam caseIds pseudonimizados. Os caminhos técnicos de pedidos com problema foram mantidos para regularização controlada. Nenhum documento de negócio foi alterado.

| Escopo | Customers na tabela | Compras elegíveis | Valor | Última compra (UTC) |
|---|---:|---:|---:|---|
| Matriz | 4 | 44 | R$ 892,23 | 2026-10-30T02:04:19.115Z |
| Garavelo | 0 | 0 | R$ 0,00 | — |
| Visão Geral | 16 | 44 | R$ 892,23 | 2026-10-30T02:04:19.115Z |

Matriz também conserva 7 perfis operacionais para formulários; Garavelo conserva 2. Isso não os transforma em compradores na tabela: a exibição usa `hasStorePurchases`. O horário acima corresponde a 29/10/2026 23:04:19 em São Paulo. A última compra foi conferida **por Customer/loja**, além do resumo agregado. IDs canônicos, aliases, referências e históricos permanecem íntegros.

Não há no snapshot comprador finalizado elegível de Garavelo, comprador nas duas lojas ou comprador recuperado por metadado de loja desatualizado. **Esses cenários passaram em fixtures sintéticas, não foram inventados como prova real.** Pendentes/com pagamento não confirmado, cancelados, reembolsados ou em revisão não somam compras. Mantido o contrato histórico offline finalizado, sem fabricar PAID. Uma segunda conferência independente, sem chamar o builder do diretório, validou membership, total, contagem e datas dos 132 documentos; usou o resolver existente do registry somente em memória.

### Legado e permissões

**43 ocorrências para análise, sem reparo automático:** 38 pedidos raiz sem identificação confiável/consistente de loja e 5 pedidos da Matriz com Customer ausente/não resolvido/conflitante. Relação em [readonly-audit.json](evidence/customer-directory-dev/readonly-audit.json). Nenhuma atribuição à Matriz por suposição. Isso não é uma nova decisão de migração nem reabre os 14 débitos já preservados na Fase10; eventual regularização exige aprovação e evidência específica.

Doze perfis Staff ativos reais foram avaliados pelo código atual de autorização, via diagnóstico somente leitura: atendentes restritos à Matriz, gestores à respectiva unidade, contador no escopo fiscal e administradores/Dono conforme lojas/capabilities existentes. O contrato legado `admin → dono` de normalização já existente foi preservado; Admin com escopo explícito continua restrito, comprovado também em emulador. Não houve alteração de papéis/claims ou criação de sessão em nome de outro usuário. Esses checks não equivalem a login manual no navegador de cada Staff.

### Volume, custo e desempenho

- Projeção de dados: Matriz 89 documentos; Garavelo 29; Visão Geral 137. Cada consulta real auditada somou mais 2 documentos de autorização, totalizando **91 / 31 / 139**, com latências observadas de **668 / 661 / 769 ms** na execução local autenticada contra DEV. Não são SLA nem medição de renderização/cold start da API publicada.
- Cache aquecido: apenas 2 leituras de autorização por chamada, sem novo scan do histórico. Não se pulou a revalidação de permissão para economizar leituras.
- O orçamento de 10.000 é da construção da projeção, incluindo lojas/Customers/aliases/pedidos e consultas em lotes; não representa teto de toda a fatura nem substitui leituras de autorização. Fronteira exata e excesso de 1 documento passaram em teste, com 503 sem cache/retorno parcial e retry seguro. A base atual está abaixo desse orçamento.
- **Correção mínima adicional desta retomada:** polling/refresh agrupado não inicia scans quando a aba está oculta; ao voltar, atualiza imediatamente. Listeners e timers são removidos na troca de escopo/desmontagem. Dois testes novos cobrem pausa/retomada e dispose com aba inicialmente oculta. A navegação entre seções do CRM continua usando a projeção compartilhada para formulários, sem consultas por linha.
- O custo ainda cresce com Customers/aliases globais e pedidos do escopo a cada cache frio. O cache de 5 s é por instância, não distribuído; polling ativo de 30 s pode expirar o cache, portanto não é leitura grátis. Lotes/cursors evitam offset/releitura de páginas; select reduz payload, não deve ser vendido como redução automática da cobrança por documento.
- As contagens acima são documentos retornados, não uma medição de faturamento. Há mínimos por consulta vazia, leituras de índices/agregações, transferência e Functions conforme uso. Não foi estimado preço em reais sem fatura/SKU/região. Fonte: [cobrança oficial Firestore](https://firebase.google.com/docs/firestore/pricing). Não houve migração/agregação materializada; se o volume/tráfego exigir, apresentar proposta separada antes do limite, sem ampliar silenciosamente o scan.

### Testes e publicação comprovada

- **631/631 React, 62 suítes; 60/60 Node; 63/63 integração HTTP/Firestore/Rules PASS**. Grupos sobrepostos; não somar como testes distintos. Incluem financeiro, fiscal, estoque, cadastro/histórico, atualização, alias/legado, permissões e limites. Somente mocks/emuladores para mutações. Emuladores encerrados.
- Build do artefato DEV PASS: `static/js/main.52d9bfdb.js`; CSS `static/css/main.95884c12.css`. Lint dos arquivos do delta: 0 erros, 66 avisos do App já existentes no HEAD. Build e compilação de Rules mantêm avisos de código legado/funções não utilizadas, registrados nos logs; não foram ocultados como lint global zero.
- **API → Hosting → Rules**, nessa ordem. API `api-00077-qux` ACTIVE; **145 outras Functions inalteradas**, sem mudança nos fingerprints de environment/secret references da API. Versão Hosting `sites/crmdoceria-9959e/versions/186b142d3703e536`, release `2026-11-12T01:32:02.114Z`. **61/61 hashes e 6/6 rotas HTTP PASS**. Seis GETs com ausência/token forjado retornaram 401 e nenhum Customer, com no-store.
- Rules anteriores correspondiam ao HEAD antes da publicação. A release nova `projects/crmdoceria-9959e/rulesets/eaa8ed3d-0434-41c7-bc5b-587530841fbb` foi lida de volta e corresponde às Rules testadas; não houve alteração de índices, Storage ou de outras Functions. Logs/manifestos identificam o patch local aprovado, sem afirmar que haja commit funcional novo.
- O erro inicial “Authentication Error” foi diagnosticado como SELF_SIGNED_CERT_IN_CHAIN. Resolveu-se com `--use-system-ca` nos processos Node, sem desligar TLS, alterar confiança persistente, exportar secrets ou exigir novo login. A solicitação de reauth ficou superada pela solução técnica.

### Próximo ponto exato

**Publicação e validação técnica DEV PASS; aceite visual autenticado PENDENTE.** Controle de navegador não inicializou e não havia Chrome CDP com sessão DEV disponível. O titular foi solicitado a recarregar e conferir Matriz/Garavelo/Visão Geral, totais/última compra, troca de loja e refresh sem editar dados. Não registrar PASS manual antes da resposta. Não repetir deploy, SMS/vínculos ou criar compradores/pedidos só para preencher cenários ausentes.

Somente DEV nesta retomada; PROD local/publicada não acessada. Nenhuma cobrança, pagamento, mensagem WhatsApp, SMS, nota, migração ou dado de negócio foi criado/alterado. A preferência de taxas em 1x e demais trabalhos locais foram preservados **fora da publicação**. Sem commit/push, aguardando revisão aplicável. **Fase9 100%; Fase10 87,50%; global formal97,00%; Fase13 0%.**

---

## Implementação inicial e evidências anteriores (histórico preservado)


11/11/2026. Registro inicial local, anterior à publicação descrita acima.

Workspace funcional: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, HEAD preservado `7e7d7b69`. O diretório principal continua sendo uma branch de backup; não foi usado como fonte funcional. Alterações documentais locais anteriores foram preservadas.

## Auditoria e causa

No HEAD inicial, `App.js` consultava Clientes usando `lojasVisitadas array-contains` (linhas 4293–4314), depois filtrava novamente por `lojasVisitadas`, `lojaId` ou `lojaAtual` (3643–3667). O GET `/clientes` repetia o mesmo filtro. Um pedido legítimo com referência válida ao Customer e à loja não corrigia essa exclusão quando o cadastro tinha metadados ausentes/desatualizados.

A tabela usava `metricasComprasPorLoja`/campos globais gravados no Customer. A rotina `ensureCustomerPurchaseMetrics`, chamada pela tela, não existe no backend rastreado atual. A correção remove essa chamada, sem executar recomposição/migração ao abrir a tela.

As Rules também permitiam ler documentos globais de Clientes a Staff de loja única. Restringir somente o match específico não bastava: o catch-all liberava a leitura novamente. Um teste de acesso negado falhou antes dessa exclusão e passou depois. Os documentos podem conter métricas globais e metadados de identidade, incompatíveis com devolução direta a Staff restrito.

A única leitura remota desta execução foi de **metadados do Firebase DEV**: `(default)`, `databaseEdition=STANDARD`, `type=FIRESTORE_NATIVE`. Não foi feito inventário de dados de clientes/pedidos reais. PROD não foi acessada.

## Contrato corrigido

- O Customer continua único. IDs, telefone, aliases e dados originais não são regravados para corrigir listagem.
- O backend deriva vínculos de `lojas/{storeId}/pedidos/{id}` e `/pedidos/{id}` com loja explícita e consistente. Nunca atribui uma loja pela ausência de campo ou pelo nome da unidade.
- Aceita `clienteId`, `customerId` e `clientId`, exigindo convergência de todas as referências presentes. Usa aliases READY do registry e famílias legadas revisadas (`identityRegistryVersion=1`). Não usa coincidência de nome/telefone para associar pedidos. `ownerUid` conflitante também impede associação.
- Espelhos raiz/loja e referências repetidas de pagamento não duplicam valores. Conflitos ficam fora da classificação financeira e são sinalizados.
- **Compras realizadas:** preserva o critério de venda finalizada do CRM (`Finalizado`, ou equivalente operacional `DELIVERED`), excluindo status financeiro explicitamente não pago, cancelamento, reembolso, revisão e dados monetários inválidos. Histórico offline finalizado sem estado financeiro explícito continua aceito; não se inventa confirmação online.
- Valor acumulado usa centavos e somente pedidos válidos do escopo; última compra usa os aliases de data já reconhecidos pelo histórico (`createdAt`, `dataPedido`, `data`), sem usar data de entrega.
- Na loja, a tabela mostra compradores válidos. Na Visão Geral autorizada, mostra também cadastrados sem compras, uma linha por Customer canônico.
- **Compatibilidade operacional:** um pedido pendente permite consultar seu cadastro para atendimento, sem classificá-lo como compra. A projeção `usage=crm` conserva esses cadastros e registros explicitamente cadastrados na unidade para seletores/formulários; a tabela e o diretório padrão excluem os que não têm compras válidas. As duas consultas críticas do pedido usam o perfil protegido, mantendo total/estoque/cupom sob os contratos existentes.
- Os campos fiscais/de contato e os formatos de endereço são preservados na projeção; metadados de Auth/identidades, campos de histórico não autorizados e métricas de outras unidades não são devolvidos.

### Exemplo sintético comprovado

| Customer | Matriz | Garavelo | Visão Geral |
|---|---:|---:|---:|
| A, somente Matriz | R$ 10,00 | ausente | R$ 10,00 |
| B, somente Garavelo | ausente | R$ 20,00 | R$ 20,00 |
| Customer nas duas | R$ 30,00 | R$ 40,00 | R$ 70,00 |
| Cadastro sem compras | ausente | ausente | R$ 0,00 |

Não são dados de clientes reais. Matriz/associações completas em `docs/evidence/customer-directory-local/association-matrix.json`.

## Segurança e permissões

GET `/clientes/diretorio`, `/clientes/:id` e compatibilidade `/clientes` usam Auth e perfil/capabilities/lojas verificados no backend. Cliente sem Auth recebe 401; Customer, Staff inativo, módulo não autorizado ou loja fora do escopo recebem 403. Um ID conhecido não autoriza perfil de outra loja. O parâmetro `usage=crm` não amplia escopo.

Visão Geral exige papel administrativo multiloja do contrato atual e autorização para todas as unidades existentes. Dono com atribuição restrita não ganha escopo global por enviar `__all__`. Permissões são verificadas antes de cada hit de cache. O contador conserva a consulta fiscal do perfil pela API filtrada. Admin Preview e autenticação Customer não foram alterados.

Rules bloqueiam a leitura bruta de Clientes para Staff limitado, incluindo o catch-all; apenas o papel administrativo com escopo global irrestrito mantém a leitura bruta. Escritas continuam exclusivamente via backend. A edição cadastral aceita relacionamento comprovado por pedidos quando falta `lojasVisitadas`; essa prova é interna, não aceita do corpo da requisição.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for store-scoped customer reads by preventing raw global customer documents from bypassing the authenticated projection API. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

Estas regras são um protótipo **local**, validado em emulador, para revisão junto com API e frontend antes de qualquer publicação.

## Atualização e desempenho

- Sem consultas por linha/Customer e sem novas bibliotecas ou índices. Leituras projetam apenas campos necessários e usam lotes físicos de até 400 documentos.
- Cache de 5 segundos, até 8 escopos, com compartilhamento de consulta em andamento; autorização é revalidada antes do cache.
- Eventos dos pedidos agrupam atualização em 5,25 segundos; polling de 30 segundos cobre alterações legadas/outras sessões. Alterações cadastrais locais também solicitam atualização. Respostas atrasadas após troca de loja/usuário são descartadas.
- **Limite e risco residual:** a projeção de leitura ainda tem custo O(cadastros + aliases + pedidos do escopo) quando o cache expira. O orçamento é de 10.000 documentos lidos por construção, contando todos os lotes/consultas, não apenas pedidos. Ao exceder, devolve erro controlado 503 e não exibe soma parcial como completa. Antes de publicar, validar o volume real da base DEV; para volumes acima desse orçamento, propor agregação incremental/materialização com autorização específica, sem migração em massa nesta tarefa.
- No erro, a lista é limpa e aparece opção de tentar novamente, sem reutilizar dados de outro escopo. Não há fallback para acesso bruto/global.

## Regularização de legado

Casos sem loja confiável, referências conflitantes/órfãs, ownership incompatível ou duplicidade financeira duvidosa não são reparados automaticamente. A resposta traz caminhos e motivos (até 100 ocorrências por resultado), exibidos em uma seção recolhível no CRM. Exemplos sintéticos: `pedidos/missing` sem loja; `lojas/matriz/pedidos/store-conflict` com loja divergente; referência a dois Customers distintos.

**Não se trata de um inventário dos casos reais.** Esse inventário somente-leitura e a homologação autenticada DEV ficam pendentes para a etapa aprovada pelo titular. Os 14 remanescentes já preservados pela Fase 10 não foram alterados/reabertos.

## Arquivos do ajuste

- `crm/src/App.js`: sincronização projetada, tabela/métricas, erros/diagnóstico e consultas cadastrais de atendimento.
- `crm/src/utils/clientApi.js`: evento após mutação administrativa já concluída.
- `crm/src/utils/customerDirectorySync.js`: controle de atualização, concorrência e descarte de respostas tardias.
- `functions/staff-customer-directory.js`: associação, métricas, paginação física, cache, autorização e projeções.
- `functions/index.js`: montagem das rotas protegidas e prova de relacionamento na edição.
- `functions/crm-client-edit.js`: prova interna de vínculo sem alterar identidade/telefone/histórico.
- `firestore.rules`: leitura bruta restrita e exclusão no catch-all.
- Testes novos: `crm/src/customerDirectoryView.test.js`, `crm/src/utils/customerDirectorySync.test.js`, `functions/staff-customer-directory.test.js`, `functions/staff-customer-directory-emulator.test.js`.
- Regressões adaptadas: `crm/src/crmReconciliation.test.js` (mock da leitura protegida, mantendo asserts financeiros/estoque), `functions/crm-client-edit.test.js`, `functions/firestore.rules.test.js` (contador consulta perfil fiscal por API, não documento global bruto).

## Validação final

Ver `docs/evidence/customer-directory-local/validation.json` e logs associados. Os grupos têm sobreposição de testes; não somar como total único.

- React completo: **629/629 PASS**, 62 suítes; inclui componente Clientes real, histórico/contatos/rotas, financeiro, fiscal, estoque e sincronização.
- Node unitário/regressão: **59/59 PASS**.
- HTTP/Firestore/Rules e regressões de pedido/fiscal em emulador: **62/62 PASS**.
- Build DEV: PASS, workspace/projeto explicitamente confirmados; `main.db2c1cbc.js`, 456,8 kB gzip. Nenhuma dependência adicionada.
- Lint do delta: **0 erros; 66 avisos do App já presentes no HEAD inicial**. Os arquivos novos não têm avisos.
- Diff-check e sintaxe: PASS. HEAD e índice Git preservados. Execuções intermediárias com falha de infraestrutura/fixtures não foram contadas como aprovação.

O emulador precisou de ajuste somente no processo Java de teste: JDK 21 e fallback TCP em vez do socket AF_UNIX que falhava no Windows. O comportamento de fallback foi conferido no [código oficial OpenJDK PipeImpl](https://raw.githubusercontent.com/openjdk/jdk21u/master/src/java.base/windows/classes/sun/nio/ch/PipeImpl.java) e a propriedade temporária no [UnixDomainSocketsUtil](https://raw.githubusercontent.com/openjdk/jdk21u/master/src/java.base/windows/classes/sun/nio/ch/UnixDomainSocketsUtil.java). Sem alterar Java/firewall/configuração persistente do usuário. Reexecuções usaram namespaces `demo-*` exclusivos, limpando apenas fixtures no loopback; recibos idempotentes de teste de uma rodada anterior não foram tratados como regressão do produto.

## Próximo ponto

**Parar para revisão antes de commit/push/deploy**, conforme solicitado. Se aprovado, a futura publicação DEV depende de API + Hosting + Rules coordenados: API compatível primeiro, frontend em seguida, Rules depois de atualizar os consumidores antigos. Não publicar Rules isoladamente sobre o CRM antigo. Homologar Matriz/Garavelo/Visão Geral com Staff autorizado e casos reais sem editar cadastros/pedidos apenas para teste.

Nenhuma migração, alteração de Customer/pedido remoto, pagamento, SMS, vínculo ou WhatsApp real. PROD e diretório PROD local não acessados nesta tarefa. **Fase 9 100%; Fase 10 87,50%; global formal 97,00%; Fase 13 0%.**
