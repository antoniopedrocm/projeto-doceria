# WhatsApp — diagnóstico e checkpoint

Atualizado em 2026-09-21. Fase 7 concluída; progresso 80%. Preparação adicional autorizada: somente whatsappWebhook publicado no Firebase DEV crmdoceria-9959e, com envios da loja matriz desativados. Fase 8 não iniciada. Nenhum envio WhatsApp real ou acesso à produção. As fases anteriores abaixo foram preservadas como histórico; o checkpoint atual está na seção final.

## Ambiente e estado inicial

Workspace real: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`.
O pedido e AGENTS.md identificam projeto-doceria-main como DEV, reservado a `crmdoceria-9959e`. Produção é projeto-doceria-multiloja, reservado a `ana-guimaraes`; não foi acessada.
Há divergência literal entre o caminho real (contém `Projeto`) e os caminhos absolutos escritos em AGENTS.md (sem esse segmento). Antes de build/deploy, resolver explicitamente essa divergência; não usar somente .firebaserc como evidência de ambiente.
O .firebaserc aponta default para crmdoceria-9959e; o target de hosting chamado `prod` também aponta para esse projeto DEV. O nome do target não identifica produção.
firebase.json publica crm/build e usa functions como backend. Há diversos worktrees, diretórios de deploy e backups; não são a fonte desta análise.
O Git já apresentava mudanças em App.js, três cardápios, rules, index.js e módulos de caixa/estoque, entre outros. Foram preservadas. Leitura de status usou safe.directory apenas no comando, sem alterar configuração global.

## Arquitetura e fluxo

- Frontend administrativo: React 18, react-scripts 5, Firebase SDK 10, Tailwind, componentes e grande concentração de funcionalidades em crm/src/App.js. Há suporte Android/Capacitor no pacote crm.
- Checkout: crm/public/cardapio-matriz.html, cardapio-garavelo.html e cardapio-festa.html, com JavaScript embutido e firebaseClientConfig.js compartilhado. Fluxos de cliente identificado e visitante; estado transitório em sessionStorage.
- Backend: JavaScript/CommonJS, Node 22 declarado, Cloud Functions v2, Express, firebase-admin. Firestore, Firebase Auth, Storage e FCM existentes.
- Dados: pedidos em lojas/{lojaId}/pedidos/{pedidoId}; clientes centrais em clientes; configurações por loja, incluindo configuracoes/config e compatibilidade com caminhos legados.
- Checkout chama POST /checkout/confirmar (functions/index.js:1716). A transação verifica abertura da loja, produtos/quantidades/estoque e cupom, grava pedido, baixa estoque e incrementa uso do cupom. Só após concluir retorna {ok:true,id}.
- O pedido nasce Pendente. Confirmar a compra não equivale ao status administrativo Finalizado, nem comprova pagamento aprovado.
- O visitante, depois da persistência, ainda abre wa.me para enviar sua mensagem à loja; o fluxo Plataforma mostra confirmação na página. Essa mensagem usa o carrinho, sendo diferente do resumo administrativo enviado ao cliente.
- CRM cria pedidos por addItem/addDoc (App.js:4844 e :13324), com espera de gravação. Existe também POST /pedidos (index.js:1689), mais permissivo, e integrações de marketplace. Não habilitar confirmação indiscriminadamente em todas as origens.
- Autenticação administrativa usa Firebase Auth e users, perfis/papéis, permissões e vínculos de loja. onActiveUserCall valida usuário ativo; reenvio também precisará verificar módulo pedidos e acesso à loja.

## Resumo atual e dados

App.js:13663 implementa Enviar Resumo Cliente. Abre wa.me com texto e depende do funcionário concluir envio. Não há ID Meta, resultado de entrega ou auditoria específica de mensagem.
O texto contém saudação/nome, endereço, itens e quantidades, desconto/cupom, frete, total, pagamento, status e observação. Subtotal é recalculado dos itens. Usa viewingOrder carregado no CRM, com fallback de telefone/endereço para cadastro atual; não relê o pedido no clique. Assim o resumo pode misturar épocas diferentes dos dados.
Há outro botão com handler vazio em App.js:17028; registrar como problema existente e avaliar contexto na fase administrativa, sem correção nesta fase.
Checkout persiste clienteId, clienteNome, clienteEndereco, telefone, formaPagamento, itens (produtoId, nome, quantity, preco), subtotal, desconto, valorFrete, total, cupom, status, origem e createdAt.
Telefone não tem formato único: alguns cadastros removem caracteres; checkout persiste o valor recebido. normalizePhoneNumber (index.js:1397) remove 55 e aceita 10/11 dígitos para busca, sem validar DDD. O botão acrescenta 55 com heurística insuficiente, inclusive para certos números já internacionais. Não reutilizar sem ajustes.
Não foi localizado consentimento transacional WhatsApp persistido nesses fluxos. Recomenda-se opção facultativa desmarcada junto da confirmação, com finalidade explícita, versão do texto, resposta e horário de servidor no pedido. Sem consentimento, pedido continua e WhatsApp é ignorado. Texto final e aviso de privacidade deverão ser revisados antes de habilitar envio real; isto não constitui auditoria jurídica.

## Recursos reutilizáveis e configuração

notifyNewOrder (index.js:3501) já usa onDocumentCreated, retry, chave derivada de loja/pedido e transação com lease em notificationEvents. Serve de referência; não compartilhar seu ledger nem acoplar WhatsApp ao push.
food99.js e ifood.js possuem schedules, locks, classificação de falhas e auditoria. Módulos usam factories com dependências injetáveis, adequadas a mocks.
Secret Manager já está instalado e usado em food99.js, ifood.js e fiscal.js. Reutilizar armazenamento de segredos e referências no backend, com IAM restrito; não copiar funcionalidades de revelar segredo no frontend.
Firebase frontend usa variáveis REACT_APP_* e fallbacks públicos. Estes não são cofre: token Meta, app secret e verify token não podem entrar nesses arquivos. Configurar versão API, phone-number ID, WABA, template, idioma e enabled por ambiente/loja, com segredos em cada projeto Google Cloud correspondente. DEV inicia desabilitado/mock e envio de teste com destinatários permitidos.

## Abordagem recomendada

1. Módulo WhatsApp próprio em functions, cliente HTTP via fetch nativo, timeout e erros sanitizados. Cloud API oficial, template transacional utility sujeito à aprovação, sem WhatsApp Web.
2. Trigger após criação persistida, filtrando elegibilidade/origem/consentimento e configuração, cria registro durável determinístico por loja/pedido/tipo. Nunca chamar Meta dentro da transação de compra ou condicionar resposta do checkout ao WhatsApp.
3. Worker e recuperação agendada usando Functions/Firestore existentes. Claim transacional com token de proprietário, tentativas limitadas, nextAttemptAt e backoff. Snapshot imutável mínimo derivado do pedido salvo para não variar o conteúdo entre tentativas; não copiar conteúdo pessoal para logs.
4. Idempotência automática por evento lógico, não apenas event.id. Manual usa nova solicitação identificada; retries da mesma solicitação manual não geram outra mensagem. Reenvio lê pedido no servidor, valida funcionário/loja, registra operador e resultado.
5. Distinguir rejeição comprovada de resultado incerto. Timeout/conexão interrompida/crash após possível aceitação entram em estado indeterminado para reconciliação, sem reenvio automático cego. Locks não tornam transação Firestore e envio Meta atômicos. Não foi comprovado contrato de idempotência do endpoint de envio; não prometer exactly-once externo. Esta estratégia prioriza evitar duplicações, podendo exigir tratamento manual de tentativas incertas.
6. Webhook HTTPS dedicado: validação GET, assinatura POST sobre bytes originais, validação de conta/número/payload, correlação do ID Meta, eventos duplicados/fora de ordem e falhas. Aceitação pela API não equivale a entrega; UI distingue pendente, aceito/enviado, entregue, falhou e indeterminado. Prever webhook chegando antes do registro da resposta.
7. Ledger/histórico protegido exclusivamente para escrita backend e leitura administrativa por loja; não depender apenas de deny em match específico, pois rules possuem autorização genérica adicional. Índices mínimos para recuperação; retenção definida e expurgo sem apagar prematuramente chave de deduplicação. Sem backfill automático de pedidos antigos.

## Riscos e pendências

- Checkout público possui CORS aberto e não mostrou autenticação/App Check ou rate limit próprio nas rotas de pedido lidas. Origem/status/nome/preços/subtotal/frete vêm do cliente; persistência não prova integridade comercial. Novo disparador pago precisa validar elegibilidade no servidor, controlar abuso e não confiar em marcação arbitrária fornecida pelo navegador. A correção ampla de preços é problema existente separado, não realizada aqui.
- Não há chave de idempotência do checkout observado: repetição pode criar outro pedido. Deduplicar mensagem por ID não deduplica dois pedidos diferentes. Avaliar chave estável de confirmação dentro do escopo de proteção contra retries, sem confundir com ledger WhatsApp.
- No CRM, logs e movimentações de estoque podem ocorrer depois da gravação do pedido; erros posteriores podem produzir falsa impressão de falha. Não reproduzir esse acoplamento no WhatsApp.
- Snapshot de cliente, opções e nomes/preços diferem entre origens. Reutilizar intenção/formatação do resumo, não seus fallbacks mutáveis ou valores inventados. Pedidos longos precisam adaptação aos limites do template, com validação explícita, sem truncar valores silenciosamente.
- Credenciais, habilitação do número oficial, WABA, template aprovado e configuração real da Meta não foram verificados. Não houve acesso a dados remotos, secrets ou produção.
- Necessário verificar texto de consentimento, política de privacidade, retenção e eventual coexistência do número atual antes de ativação real. Mocks permitem continuar trabalho técnico independentemente.

## Arquivos previstos

Existentes: functions/index.js, functions/package.json, firestore.rules, firestore.indexes.json se necessário; crm/src/App.js; três crm/public/cardapio-*.html. Configuração de deploy somente se necessária, mantendo ambiente explícito.
Novos propostos: functions/whatsapp.js, whatsapp-core.js, whatsapp-client.js e testes; crm/src/services/whatsappService.js e componente de status; documentação de template, operação e rollback. Nomes definitivos serão escolhidos na implementação.

## Verificação e checkpoint

- Inspeção estática de fluxo, configuração, permissões, mecanismos de evento/secret e testes existentes; consulta às fontes oficiais abaixo.
- Executado: node --test --experimental-test-isolation=none functions/new-order-notifications.test.js functions/user-status-core.test.js. Resultado: 14 testes aprovados, zero falhas. Primeira execução com isolamento padrão não iniciou testes por spawn EPERM; execução sem isolamento, já usada pelo projeto, resolveu.
- Não executados: build, emuladores, teste de checkout ponta a ponta, integração Meta, deploy, auditoria completa de segurança. Não há homologação de WhatsApp nesta fase.
- Único arquivo criado nesta tarefa: este diagnóstico/checkpoint. Código existente intacto.
- Bloqueios externos: nenhum para iniciar fundação em mock; conta/secrets/template pendentes para teste real.
- Próxima ação exata: conferir git status e este checkpoint; iniciar somente Fase 1, criando serviço/configuração segura e cliente Meta testável em DEV, sem ativar envio ou avançar outras fases em lote.
- Fase 8 exige parada para mudança manual do modelo conforme pedido; Fase 9 exige confirmação; produção exige autorização explícita e plano aprovado.

## Referências consultadas

- https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api — coleção oficial Meta: API, autenticação, ativos, templates e WABA/webhooks.
- https://business.whatsapp.com/policy — política oficial: opt-in, finalidade, templates aprovados e janela de atendimento.
- https://firebase.google.com/docs/functions/firestore-events — triggers Firestore: eventos podem repetir e não possuem ordenação garantida.

FASE 0 CONCLUÍDA — PROJETO 10%.

## Histórico — Fase 1 concluída, 25%

### Conferência antes da retomada

Checkpoint, AGENTS.md, git status, package.json e pontos de checkout/eventos/secrets conferidos no workspace real `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`. Estado consistente com o diagnóstico: nenhum módulo WhatsApp existia, mudanças anteriores permaneciam presentes. Somente a Fase 1 foi executada, conforme pedido. A associação DEV continua sendo `crmdoceria-9959e`; produção não foi acessada. Divergência literal de caminho no AGENTS.md continua pendente antes de build/deploy.

### Último trabalho concluído

- Serviço backend isolado para enviar template via Cloud API oficial, utilizando fetch nativo e Secret Manager existente.
- Configuração privada por loja em `integrations/whatsapp/stores/{lojaId}`, com padrão desabilitado, modo mock sem rede e modo cloud restrito a destinatários de teste. Nenhum documento remoto foi criado.
- Bloqueio de projeto desconhecido, divergente ou diferente de DEV, antes de ler configuração/secret. Host Graph fixo, redirects bloqueados, nomes de recursos de secrets fixos no projeto DEV.
- Token acessado somente no backend sob demanda, sem cache do valor, com erros sanitizados. Configuração e token relidos para permitir desabilitação/rotação.
- Tratamento inicial: aceitação/ID Meta, rejeição 4xx, 429 com indicação de retry posterior e resultado indeterminado para timeout/rede/408/5xx/resposta inválida. Sem retry interno que possa duplicar envio incerto.
- Documentação de configuração, IAM, testes, limites e operação em `docs/whatsapp-fase1-dev.md`.

### Arquivos desta fase

- Novos: `functions/whatsapp-config.js`, `functions/whatsapp-client.js`, `functions/whatsapp.js`, `functions/whatsapp.test.js`, `docs/whatsapp-fase1-dev.md`.
- Alterados: `functions/package.json` (adicionado test:whatsapp e incluído em test:all) e este checkpoint.
- Alteração preexistente no script test de package.json preservada. Nenhuma mudança desta fase em index.js, checkout, frontend, rules ou fluxo de pedidos. Não há trigger/callable/endpoint de envio ligado ao serviço.

### Testes executados

`node --test --experimental-test-isolation=none functions/whatsapp.test.js functions/new-order-notifications.test.js functions/user-status-core.test.js`

Resultado: 33 testes aprovados, zero falhas: 19 de WhatsApp e 14 existentes. Cobertura inclui configuração inválida/ausente, produção bloqueada, mock offline, formato de transporte, allowlist, payload oficial, aceitação, segredos inválidos/indisponíveis, respostas 4xx/429/5xx, rede, timeout de conexão e corpo, rotação de token e desabilitação. HTTP, Firestore e Secret Manager simulados; nenhuma credencial real usada. Verificado diff de package.json e ausência de erros em git diff --check nesse arquivo. Sem novas dependências.

### Pendências e bloqueios externos

- Integração real Meta não homologada: depende de número/conta DEV, token provisionado de forma segura, IAM, versão API e template aprovado. Esses recursos não bloqueiam avanço técnico com mocks.
- Normalização BR completa, consentimento, resumo persistido e template definitivo ainda não implementados (Fases 2 e 3).
- Nenhum retry durável, idempotência de envio, trigger, histórico, webhook ou UI implementado nesta fase; previstos nas Fases 4–7. A camada atual executa uma tentativa por chamada e não deve ser conectada diretamente a eventos repetíveis antes do ledger.
- Testes reais, emuladores, build e regressão completa/E2E permanecem para as fases correspondentes. Os riscos existentes do diagnóstico continuam registrados, sem refatoração fora de escopo.

### Próxima ação exata

Conferir novamente este checkpoint e o estado real do repositório; executar somente a Fase 2 (telefone, consentimento e dados), preservando clientes/pedidos legados e sem ativar envio. Validar em particular os três cardápios, persistência no /checkout/confirmar e o uso atual de telefone na busca de clientes. Não avançar automaticamente para template, trigger ou produção.

FASE 1 CONCLUÍDA — PROJETO 25%.

## Histórico — Fase 2 concluída, 35%

Data: 2026-09-14. Workspace conferido: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`, DEV reservado a `crmdoceria-9959e`. Produção não foi acessada. Permanece a divergência literal dos caminhos no AGENTS.md, a resolver antes de build/deploy.

### Retomada e último trabalho concluído

A primeira verificação confirmou a Fase 1 e as mudanças preexistentes. Houve interrupção durante a Fase 2: o helper de telefone/consentimento, a persistência no backend e um checkbox no cardápio matriz já estavam aplicados. A segunda verificação conferiu esse estado real e completou somente os trechos restantes, sem duplicar o código aplicado.

- Novo helper `functions/whatsapp-checkout.js`: normalização de telefone brasileiro com DDD válido, fixos de 8 dígitos e celulares de 9 começando em 9. Aceita formato nacional, +55, 55 internacional e 0055; mantém DDD 55 corretamente. Não acrescenta nono dígito por suposição, não interpreta ramais/carrier codes e não converte país estrangeiro para Brasil. A validação é de formato, não prova titularidade, existência da linha ou disponibilidade no WhatsApp.
- POST `/checkout/confirmar` preserva `telefone` e grava metadados adicionais `whatsappConfirmation` junto com o pedido, dentro da transação existente. O servidor constrói os campos; não aceita um snapshot de WhatsApp fornecido pelo navegador.
- Schema adicional: `phoneE164` (com +55 ou null), `phoneStatus`, `phoneReason`, `consent.granted`, `consent.status` (granted/declined/not_provided), `consent.version`, `consent.source=checkout`, `consent.recordedAt` com serverTimestamp. O adaptador futuro deve remover apenas o + do E.164 validado para o transporte da Fase 1, que exige dígitos.
- Consentimento explícito booleano e versão conhecida `order-confirmation-v1`. Payload ausente, malformado ou com versão desconhecida nunca concede autorização. Recusa não bloqueia compra. Telefone inválido gera E.164 null e status invalid, mesmo que haja consentimento: o futuro worker deverá exigir ambas as condições. Nenhum envio é disparado agora.
- Três cardápios receberam checkbox facultativo, desmarcado, em ambos os fluxos (identificado e visitante), próximo da conclusão. Texto: “Quero receber a confirmação e o resumo deste pedido pelo WhatsApp da Ana Guimarães Doceria.” Ajuda esclarece finalidade restrita ao pedido, ausência de promoções e possibilidade de comprar sem marcar.
- Escolha capturada no início de finalizeOrder e enviada ao servidor; não adicionada ao sessionStorage. Limpeza ao iniciar checkout, ao carregar/restaurar página e depois do sucesso. Fluxo visitante mantém a abertura manual de mensagem para a loja, distinguida da autorização para receber confirmação.
- Checkout informa, depois do sucesso, quando o telefone não é válido para confirmação solicitada, sem apresentar o pedido como falho.

### Arquivos envolvidos

Novos: `functions/whatsapp-checkout.js`, `functions/whatsapp-checkout.test.js`.
Alterados nesta fase: `functions/index.js`, `functions/package.json` (test:whatsapp inclui novos testes), `crm/public/cardapio-matriz.html`, `crm/public/cardapio-garavelo.html`, `crm/public/cardapio-festa.html`, este checkpoint. Mudanças anteriores nesses arquivos foram preservadas.

### Compatibilidade, banco e rollback

Sem migration, backfill, novos índices ou mudanças de rules. Apenas novos pedidos pelo endpoint recebem o campo adicional. Pedidos/clientes antigos e a busca por telefone permanecem intactos. Pedidos de outras origens sem consentimento não devem receber envio automático. Não inferir autorização pelo cadastro de telefone, origem ou pelo link wa.me.
Rollback: remover o novo envio do campo nos cardápios e a construção/persistência dos metadados no endpoint; o código anterior ignora esses campos aditivos. Não apagar documentos nem reescrever telefones. Nunca habilitar o disparador antes das fases de segurança/idempotência.

### Testes executados

`node --test --experimental-test-isolation=none functions/whatsapp.test.js functions/whatsapp-checkout.test.js functions/new-order-notifications.test.js functions/user-status-core.test.js`

Resultado final: 41 testes aprovados, zero falhas (8 novos cenários de Fase 2, 19 de Fase 1, 14 existentes). Novos cenários incluem formatos BR, DDD 55, rejeição de formatos ambíguos/internacionais, consentimento estrito/versão/horário de servidor, rota real extraída e executada com transação simulada, preservação do telefone/total e conclusão do pedido sem consentimento ou com telefone inválido. Os três HTMLs foram carregados com jsdom existente no CRM; seus fluxos finalizeOrder foram executados com DOM/fetch simulados para visitante e identificado, aceite/recusa e limpeza após sucesso. Nenhuma nova dependência instalada. Os testes de DOM exigem as dependências de desenvolvimento de crm instaladas.

`node --check functions/index.js` aprovado. Não executados build, deploy, emuladores, teste visual em navegador ou checkout E2E com Firebase real. A verificação DOM não equivale a homologação visual ou remota; essas verificações continuam pendentes para a Fase 8.

### Pendências e próxima ação exata

Nenhum bloqueio externo para a próxima fase com mocks. Credenciais, número DEV, template Meta aprovado e revisão do aviso de privacidade antes da ativação real continuam pendentes. O texto de consentimento e sua versão ficam registrados aqui para revisão, sem declarar auditoria jurídica.
Próxima ação: conferir este checkpoint e o estado real do código; executar somente a Fase 3 — template, variáveis e conteúdo construído a partir do pedido persistido, com instruções de aprovação na Meta e testes usando mocks. Não iniciar trigger, histórico, webhook ou produção nesta retomada.

Referências de numeração consultadas: https://www.gov.br/anatel/pt-br/regulado/numeracao/plano-de-numeracao-brasileiro e https://www.gov.br/anatel/pt-br/regulado/numeracao/perguntas-frequentes .

FASE 2 CONCLUÍDA — PROJETO 35%.

## Histórico — Fase 3 concluída, 45%

Data: 2026-09-14. Conferidos checkpoint, git status, módulos das Fases 1–2, resumo administrativo existente e AGENTS.md. Estado consistente. Workspace DEV continua `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`, reservado ao projeto `crmdoceria-9959e`. Mudanças locais anteriores preservadas. Produção não acessada; nenhum build/deploy.

### Último trabalho concluído

- `functions/whatsapp-order-summary.js`: template versionado `confirmacao_pedido_v1`, idioma pt_BR, categoria proposta UTILITY. Três variáveis: identificação, resumo e total. Redação informa recebimento do pedido, sem afirmar aprovação de pagamento.
- Preparador backend somente leitura consulta o documento do pedido pela loja/ID, sem usar dados recebidos de carrinho, catálogo ou cadastro atual de cliente. Verifica projeto DEV, loja, consentimento explícito/versionado e consistência do telefone persistido; retorna destinatário normalizado, parâmetros, preview e contrato de template. Não envia, agenda ou grava nada.
- Reaproveitada a composição de campos do resumo administrativo, adaptada a parâmetros textuais: itens/quantidades/preços quando presentes, subtotal persistido, desconto, frete, retirada/endereço, pagamento, status e observações. Não assume quantidade 1, subtotal zero nem dados de cliente ausentes. O botão manual existente permanece intacto até Fase 7.
- Limite conservador de 1024 caracteres no corpo renderizado. Conteúdo grande retorna summary_too_long sem truncamento. Opções desconhecidas em estruturas não usadas pelo checkout atual retornam unsupported_item_options; opções no nome e observações de item são preservadas.
- `functions/whatsapp.js` agora compara expectedTemplate, quando fornecido pelo preparador, com nome/idioma configurados antes de mock ou envio, evitando aplicar os parâmetros ao template errado. Chamadas anteriores da Fase 1 continuam compatíveis.
- `docs/whatsapp-template-fase3.md` contém texto, exemplo fictício, mapeamento de campos, passos para cadastro/aprovação Meta, limites e integração futura. `docs/whatsapp-template-v1.json` é payload de cadastro local, não submetido à Meta. Nenhum segredo incluído.

### Arquivos desta fase

Novos: `functions/whatsapp-order-summary.js`, `functions/whatsapp-order-summary.test.js`, `docs/whatsapp-template-fase3.md`, `docs/whatsapp-template-v1.json`.
Alterados: `functions/whatsapp.js`, `functions/package.json` (test:whatsapp inclui os testes de resumo) e este checkpoint. Sem mudanças no checkout, index.js, frontend, rules ou banco nesta fase. Sem migration, recursos remotos ou nova dependência.

### Testes e verificações

`node --test --experimental-test-isolation=none functions/whatsapp.test.js functions/whatsapp-checkout.test.js functions/whatsapp-order-summary.test.js functions/new-order-notifications.test.js functions/user-status-core.test.js`

52 testes aprovados, zero falhas: 11 novos da Fase 3 e 41 anteriores. Incluem resumo multitem com valores/cupom/frete, retirada, campos ausentes, entradas inválidas, observações, excesso de tamanho, estruturas de opções não mapeadas, leitura exclusiva do pedido, rejeição de conteúdo do carrinho/perfil, isolamento DEV/loja, telefone/consentimento e mock com contrato de template correto/incorreto.
JSON de cadastro conferido contra nome, idioma, categoria, corpo e quantidade de exemplos do contrato no código. git diff --check dos arquivos versionados modificados da fase sem erros. Não houve contato com Meta, Firestore real, teste visual, emulador, build ou deploy. Aprovação do template e homologação remota não foram presumidas.

### Pendências externas e limites

Submeter template no WhatsApp Manager da WABA de testes e aguardar aprovação; seguir exatamente `docs/whatsapp-template-fase3.md`. Se houver recusa/recategorização, adaptar o contrato e testes antes de ativar. Credenciais/conta/número DEV e configuração de versão API permanecem pendentes para envio real, sem bloquear testes com mocks.
Pedidos com resumo excedente ou estruturas desconhecidas exigem contingência manual ou futura versão de conteúdo aprovada; não omitir informação para forçar envio. Revisão de privacidade/observações continua pendente antes de ativação real.
O preparador retorna conteúdo em memória. Ainda não existe snapshot durável, ledger/idempotência, autorização de reenvio manual, filtros de evento, controle de abuso do checkout, retry, histórico ou webhook. O futuro worker deve armazenar a primeira preparação de forma durável para não variar o resumo entre tentativas. Nunca ligar diretamente o transporte ao evento sem essas proteções.

### Próxima ação exata

Conferir este checkpoint e git status; iniciar somente Fase 4 — envio automático assíncrono após persistência, ledger por evento lógico, controle de concorrência, tratamento de falhas/retry seguro e testes de indisponibilidade/duplicação. Resolver as proteções de elegibilidade e abuso registradas na Fase 0 antes de qualquer habilitação real. Usar mocks enquanto Meta estiver pendente. Nenhuma autorização de produção foi concedida.

FASE 3 CONCLUÍDA — PROJETO 45%.

## Histórico — Fase 4 concluída, 60%

Data: 2026-09-14. Checkpoint, git status, AGENTS.md, configuração, serviço e preparador conferidos antes da alteração. Estado consistente com Fase 3. Workspace `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`, associado a DEV `crmdoceria-9959e`; produção não acessada. Nenhum build/deploy realizado. Alterações preexistentes preservadas.

### Último trabalho concluído

- Novo worker em `functions/whatsapp-worker.js`, com três Functions registradas em index.js: enqueueWhatsAppConfirmation (pedido criado), processWhatsAppConfirmation (job criado) e recoverWhatsAppConfirmations (a cada minuto).
- A compra mantém a transação/rota já existente. Nenhuma leitura de config WhatsApp, chamada Meta ou escrita do job foi adicionada ao fechamento do pedido. Enqueue é disparado pelo evento após commit; falha da fila não reverte ou altera o pedido.
- Job privado em integrations/whatsapp/jobs, chave SHA-256 por loja/pedido/tipo/automático. Reentrega do evento e concorrência não recriam nem reiniciam job existente. Inclui snapshot da mensagem preparado a partir do evento persistido de criação, conservado em retries mesmo após edição de preço/itens.
- Claim transacional com owner UUID, prazo de três minutos e validação antes de executar transporte. Resultado só é atualizado pelo proprietário vigente. Prazo vencido vira unknown, sem segundo POST. Falha de persistência após aceitação também termina indeterminada na recuperação, evitando reenvio cego.
- Até quatro tentativas dentro de uma hora; backoff de 60 segundos dobrando e Retry-After quando maior. Somente rate_limited/credential_unavailable/configuration_unavailable permitem retry automático. Timeout/rede/408/5xx ambíguo/exceção não provocam nova tentativa automática.
- Consulta de recuperação limitada a 50 jobs, índice simples de nextRunAt. Logs sanitizados com jobId/status/code; payload removido de jobs terminais, mantendo tombstone e resultado/ID Meta quando disponível.
- Configuração adicional obrigatória: automaticEnabled=true e automaticSince (milissegundos UTC). Eventos anteriores à ativação ou com mais de uma hora são ignorados. Status inicial Pendente, origens Plataforma/Cardapio Online, consentimento e telefone válidos. Pedido/configuração são relidos antes das tentativas; mudança de destinatário/consentimento/cancelamento interrompe fila.
- Modo/remetente vinculados ao job e conferidos também no serviço; jobs mock não viram envios cloud. Cloud DEV mantém allowlist e quotas privadas: 100 admissões/loja/dia, 20 tentativas cloud/loja/dia e um job automático por destinatário/dia, até quatro tentativas. Quotas usam dia UTC e não são estornadas após falha.

### Arquivos envolvidos

Novos: `functions/whatsapp-worker.js`, `functions/whatsapp-worker.test.js`, `docs/whatsapp-fase4-dev.md`.
Alterados: `functions/index.js` (import/registro das três Functions), `functions/whatsapp.js` (rechecagem de ativação/modo/remetente), `functions/package.json` (test:whatsapp inclui worker), este checkpoint.
Sem mudanças no frontend/rota de checkout, sem novas dependências, migration ou alterações de rules nesta fase. Jobs e quotas ficam na árvore integrations já negada ao cliente inclusive pela regra genérica. Nenhum recurso remoto foi criado.

### Testes executados

- Suíte direcionada: whatsapp.test.js, whatsapp-checkout.test.js, whatsapp-order-summary.test.js, whatsapp-worker.test.js, new-order-notifications.test.js e user-status-core.test.js com node --test --experimental-test-isolation=none. Resultado final: 70 aprovados, zero falhas (18 testes novos de worker).
- npm test em functions: 205 testes, 204 aprovados, 1 marcado skipped, zero falhas. Há sobreposição com os testes direcionados; não somar como cobertura única.
- node --check de index.js e whatsapp-worker.js; git diff --check em index.js/package.json sem erros.
- Cenários novos: oito eventos/consumidores concorrentes, idempotência por evento lógico, recuperação de falha de enqueue/claim, aceitação seguida de falha no commit do resultado, ownership expirado e resposta tardia, snapshot preservado, retry com atraso/limite, 4xx permanente, timeout/503/exceção, desligamento/modo alterado, revogação/cancelamento, limites de destinatário/admissão/tentativas por loja e cliente HTTP integrado via fetch simulado.

### Limites e pendências

Testes usam transações atômicas simuladas, não Firestore real. Emuladores, rules efetivamente publicadas, Scheduler/Eventarc/IAM, comportamento remoto sob reentrega e integração Meta aguardam homologação DEV/Fase 8. Functions estão registradas no código, mas não publicadas. Template, credenciais e número DEV continuam pendentes para envio real.
A proteção implementada é limitada aos testes DEV: allowlist privada de números da equipe e quotas com projeto bloqueado. O checkout continua público; não foi implementada autenticação completa de submissão, proteção comercial de preços ou deduplicação da criação de pedidos. Pedidos com IDs diferentes continuam distintos; a quota DEV evita múltiplas confirmações automáticas para o mesmo destinatário/dia, mas não substitui idempotência do checkout. Antes de produção, resolver esses riscos na auditoria/plano; não remover bloqueios DEV para ativar clientes reais.
Ainda não há histórico detalhado por tentativa/reenvio manual, webhook, status administrativo ou reenvio via API. O ledger mínimo necessário à idempotência pertence a esta fase; a Fase 5 o ampliará para rastreabilidade. Botão manual atual wa.me permanece independente da chave automática.
Não apagar tombstones nem configurar TTL de jobs sem preservar deduplicação. Definir retenção/expurgo de quotas e auditoria nas fases seguintes. Resultado unknown exige reconciliação/contingência e não prova falha de entrega. Não foi prometido exactly-once externo.

### Próxima ação exata

Conferir checkpoint e estado real do repositório; iniciar somente Fase 5 — histórico/rastreabilidade de tentativas e resultados, diferenciando explicitamente automático e manual, preparando operador/data/resultado sem expor dados sensíveis. Reaproveitar o ledger atual, sem criar outro mecanismo de envio ou reiniciar jobs terminais. Preservar o botão manual até o ajuste autorizado na Fase 7. Sem produção ou ativação cloud automática.

FASE 4 CONCLUÍDA — PROJETO 60%.

## Histórico — Fase 5 concluída, 70%

Data: 2026-09-15. Checkpoint, git status e worker real conferidos antes de alterar. Estado consistente com Fase 4; mudanças anteriores preservadas. Workspace permanece `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`, DEV reservado a `crmdoceria-9959e`. Nenhuma ação remota, build, deploy ou acesso à produção.

### Último trabalho concluído

- Novo módulo `functions/whatsapp-history.js`: contrato de eventos e sanitização por whitelist, máscara do destinatário, distinção automatic/manual e operador obrigatório no modo manual.
- Worker grava subcoleção history do job na mesma transação da respectiva transição. Eventos determinísticos: created, attempt_started, attempt_finished, stopped, lease_expired e late_result, por número da tentativa. Histórico mantém resultados anteriores quando um retry termina em sucesso.
- Cada evento guarda loja/pedido/tipo, modo, operador quando manual, destinatário mascarado, versão de template, modo de transporte, horário do servidor, tentativa, outcome e retryScheduled/nextRetryAt quando aplicável. Sem texto da mensagem, endereço, nome do cliente, telefone completo, token, headers ou erro bruto.
- Job mantém máscara/versão após remoção do payload terminal, além de attemptCount/lastResult existentes. Falhas antes do envio e recuperação por prazo vencido são distinguíveis de uma resposta de transporte.
- Resposta tardia pode registrar ID Meta no histórico sem sobrescrever o estado unknown nem reiniciar o envio. Falha de commit não registra parcialmente estado e histórico; tentativa iniciada permanece rastreável para recuperação.
- Contrato manual testado com operador e resultado em chave independente. Ainda NÃO há registro do botão wa.me existente, nem novo endpoint manual: ligação do reenvio autenticado continua na Fase 7. O contrato não substitui autenticação/autorização por loja.

### Arquivos envolvidos

Novos: `functions/whatsapp-history.js`, `functions/whatsapp-history.test.js`, `docs/whatsapp-fase5-historico.md`.
Alterados: `functions/whatsapp-worker.js`, `functions/whatsapp-worker.test.js`, `functions/package.json` e este checkpoint. Sem mudanças no checkout, UI, index.js, regras ou novas dependências. A árvore integrations continua protegida pelas regras existentes, inclusive exclusão do match genérico.

### Testes executados e correções

Suíte final: node --test --experimental-test-isolation=none com whatsapp.test.js, whatsapp-checkout.test.js, whatsapp-order-summary.test.js, whatsapp-worker.test.js, whatsapp-history.test.js, new-order-notifications.test.js e user-status-core.test.js. Resultado: 80 aprovados, zero falhas (10 cenários novos desta fase).
Testes incluem minimização/sanitização, manual com operador obrigatório, resultado Meta, retry com horário seguinte, eventos concorrentes sem duplicação, histórico de cada tentativa, falhas de commit, ID Meta tardio, encerramento sem chamada e job legado sem campos de histórico.
A primeira execução do worker revelou que o contador do double de teste contava documentos de history como jobs (200 em vez de 100). Corrigido o double/contador para considerar apenas documentos diretos da coleção, conforme a consulta Firestore. A suíte final passou após essa correção.
node --check para módulos de histórico/worker e git diff --check de package.json aprovados. Suíte geral npm test não foi repetida nesta fase; o resultado de 204 aprovados/1 skipped pertence à Fase 4.

### Compatibilidade, limites e pendências

Sem migration/backfill. Jobs da Fase 4 recebem eventos apenas ao avançar; não são inventadas tentativas passadas, nem reiniciados terminais. Máscara pode ser null em legado cujo payload já foi apagado. Payload dos jobs continua sendo limpo ao encerrar.
Não há exclusão automática de histórico. Definir retenção/expurgo antes de produção, preservando sempre tombstone de deduplicação; não foi presumido prazo jurídico. Documentação de investigação: docs/whatsapp-fase5-historico.md.
Histórico cobre jobs admitidos. Descartes anteriores à admissão (config desligada, evento antigo, lista/limite) ainda não possuem registro por pedido. Não inferir entrega da ausência de histórico. Não há UI/callable de consulta nesta fase; acesso é backend/Admin autorizado. A Fase 7 deve expor apenas projeção permitida com autorização por loja, sem abrir integrations ao cliente.
Homologação em Firestore/emuladores, regras efetivas, API Meta e auditoria permanecem pendentes. Credenciais/template aprovados necessários para envio real; não bloqueiam avanço técnico local. Proteções e riscos DEV/checkout público da Fase 4 continuam válidos.

### Próxima ação exata

Conferir checkpoint e estado real do repositório; executar somente Fase 6 — webhook Meta, validação/autenticação, payloads inválidos/duplicados/fora de ordem, correlação com ID Meta e atualização segura de status. Integrar ao ledger/histórico atuais, sem criar outra fila ou repetir envios indeterminados. Usar mocks enquanto conta/credenciais estiverem pendentes. Reenvio administrativo permanece Fase 7; produção segue sem autorização.

FASE 5 CONCLUÍDA — PROJETO 70%.

## Histórico — Fase 6 concluída, 75%

Data: 2026-09-15. Conferidos checkpoint e estado real do Git/worker/histórico. Estado consistente com Fase 5; retomada sem refazer fases anteriores e preservando alterações alheias. Workspace `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`, desenvolvimento reservado a `crmdoceria-9959e`. Sem build, deploy, produção, configuração remota ou envio real.

### Último trabalho concluído

- Function HTTP whatsappWebhook registrada, bloqueada fora do projeto DEV e quando webhookEnabled não é true. GET verifica inscrição; POST autentica HMAC SHA-256 do rawBody com App Secret e comparação constante. Secrets por loja, versão latest, sem credenciais no código/frontend.
- Validação completa do lote antes de gravar, limites de tamanho/quantidade, filtro de WABA/remetente, loja/tentativa/destinatário por hash. Mensagens recebidas são ignoradas sem conteúdo nos logs.
- Correlação privada gravada atomicamente antes do POST; UUID enviado em biz_opaque_callback_data. Índice por hash do ID Meta permite recibos posteriores sem callback opaco. Não há outra fila de envio.
- Estados sent/failed/delivered/read e histórico por mensagem/status, transação única para histórico/estado/índice/correlação; duplicação e fora de ordem não rebaixam recibos de entrega/leitura. Falha supera sent, entrega supera falha, leitura supera entrega. Horários do servidor/provedor separados.
- Webhook correlacionado pode reconciliar unknown e interromper agendamento, sem novo envio. Resposta do worker após recibo permanece late_result, sem sobrescrever status. Status comercial do pedido preservado.
- Logs da aplicação contêm somente loja e contadores/código fixo. Eventos armazenam resultado sanitizado e destinatário mascarado, nunca payload bruto, token ou erro textual do provedor.

### Arquivos envolvidos

Novos: functions/whatsapp-webhook.js, functions/whatsapp-webhook.test.js, functions/whatsapp-test-support.js (double transacional extraído sem mudar comportamento), docs/whatsapp-fase6-webhook.md.
Alterados: functions/whatsapp.js, functions/whatsapp-worker.js, functions/whatsapp-history.js, functions/index.js, functions/package.json, functions/whatsapp.test.js, functions/whatsapp-worker.test.js e este checkpoint. Sem mudanças no frontend, checkout, rules ou dependências nesta fase.

### Validação

- Suíte direcionada com seis arquivos whatsapp e new-order-notifications/user-status-core: 92 testes aprovados, zero falhas, incluindo 12 cenários novos da Fase 6.
- Depois de ajustar o parser para ignorar identificadores opacos de outras aplicações sem rejeitar o lote inteiro, a suíte webhook foi repetida: 9 aprovados, zero falhas.
- npm test em functions: 205 testes, 204 aprovados, 1 skipped, zero falhas. Há sobreposição com a suíte direcionada; não somar os números como cobertura única.
- node --check em webhook/worker/index e git diff --check de index/package aprovados. Apenas aviso Git de normalização futura LF/CRLF, sem erro.
- Cobertos: challenge, assinatura incorreta/ausente, rawBody adulterado, projeto bloqueado, configuração/secret indisponíveis, limites, JSON inválido, lote parcialmente inválido, eventos concorrentes, fora de ordem, erro sanitizado, correlação incorreta, ID Meta sem callback após indexação, commit falho/reentrega e webhook antes da resposta HTTP do worker.

### Limites e pendências

Validação local com doubles e fixtures; API Meta real, inscrição por conta/número, callback opaco inclusive falhas, Secret Manager/IAM, Firestore/emuladores e logging de infraestrutura ficam para homologação DEV/Fase 8. Nenhum recurso foi publicado ou ativado. Referências consultadas e contrato operacional em docs/whatsapp-fase6-webhook.md; a página atual de messages da Meta não pôde ser carregada.
Evento sem callback opaco e sem índice Meta previamente salvo permanece unmatched (200, contabilizado), assim como legado/tentativa antiga sem vínculo seguro. Não inventar confirmação nem retry; investigar manualmente esses casos. Não há backfill ou inbox adicional. Definir retenção dos índices/correlações/histórico antes de produção, preservando deduplicação.
Fase 7 ainda deve expor consulta por projeção autorizada por loja e conectar o reenvio manual autenticado. Botão wa.me existente permanece inalterado, fora da auditoria de envio real. Demais riscos do checkout público e limites DEV das fases anteriores continuam vigentes.

### Próxima ação exata

Conferir este checkpoint e o estado real; executar somente Fase 7 — visualização administrativa de status/histórico e reenvio manual conforme o plano, reutilizando serviço, consentimento e rastreabilidade, com autenticação, autorização por loja, operador e proteção contra duplicação. Não abrir integrations ao cliente nem reiniciar jobs automáticos. Alvo ao concluir Fase 7: 80%. Fase 8 continua reservada a testes DEV até 90% e parada obrigatória para troca manual de modelo; produção continua sem autorização.

FASE 6 CONCLUÍDA — PROJETO 75%.

## Histórico — Fase 7 concluída, 80%

Data: 2026-09-15. Checkpoint, Git, worker, serviço, histórico, política de perfis e modais reais conferidos. Estado consistente com Fase 6; retomada sem refazer fases anteriores. Alterações preexistentes preservadas. Workspace `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`, DEV reservado a `crmdoceria-9959e`. Nenhum build, deploy, ativação remota, envio real ou acesso à produção.

### Último trabalho concluído

- Callables getWhatsAppOrderStatus e requestWhatsAppOrderResend, região southamerica-east1, com autenticação, consulta de conta Auth ativa e política de pedidos/loja/perfis existente. Dados de autorização e operador nunca vêm do payload cliente.
- Projeção administrativa sanitizada, até um job automático e 20 manuais por pedido; histórico sob demanda limitado aos 20 eventos mais recentes por job. Sem liberar integrations ao frontend ou retornar telefone completo/conteúdo/secrets/correlações.
- Reenvio cria job manual na mesma fila e histórico, com operador, UUID idempotente próprio, dados do pedido persistido, consentimento e telefone revalidados. Não reinicia ou modifica job automático e funciona com automaticEnabled false quando manualEnabled/enabled são true.
- Proteções DEV: uma solicitação manual pendente por pedido, intervalo mínimo de 60 segundos, teto de 20 solicitações/pedido, allowlist cloud, quota manual de quatro tentativas/destinatário/dia UTC e quota compartilhada total de 20 tentativas/loja/dia. Manual faz uma tentativa, sem retry automático de transporte.
- Worker revalida permissão/conta/loja/consentimento/configuração antes de enviar. Manual aceita pedido finalizado, recusando cancelado; automático mantém seleção anterior. Recibos da Meta atualizam também jobs manuais preservando operador/histórico.
- Componente WhatsAppOrderStatus nos detalhes de pedido: status, atualizar, histórico, reenvio com confirmação e feedback. Não confunde solicitado/aceito/simulado com entregue. UUID de intenção no sessionStorage por usuário/loja/pedido permite repetir chamada perdida com mesma chave. Região explícita sem alterar demais Functions do CRM. Componente desativado fora de DEV.
- Botão wa.me funcional anterior preservado e identificado como Abrir resumo no WhatsApp; não é registrado como envio confirmado. O modal secundário já tinha handlers vazios de impressão/WhatsApp; problema preexistente registrado sem refatoração fora de escopo.

### Arquivos principais

Novos: functions/whatsapp-access.js, functions/whatsapp-admin.js, functions/whatsapp-admin.test.js, crm/src/components/WhatsAppOrderStatus.js, crm/src/components/WhatsAppOrderStatus.test.js, docs/whatsapp-fase7-admin.md.
Alterados: functions/whatsapp-worker.js, functions/whatsapp.js, functions/whatsapp-history.js, functions/whatsapp-test-support.js, functions/index.js, functions/package.json, crm/src/App.js e este checkpoint. Sem nova dependência, migration, alteração de rules, checkout ou dados remotos.

### Testes e verificações

- Suíte direcionada Node com sete arquivos whatsapp e new-order-notifications/user-status-core: 104 aprovados, zero falhas. Inclui 12 testes administrativos novos com autorização negada, concorrência, replay, sucesso/falha automática, consentimento, configuração, quota cloud, recibo manual e minimização de dados.
- Após paralelizar leituras independentes da consulta, repetida suíte administrativa: 12 aprovados, zero falhas.
- Frontend: quatro testes de DOM para referência enviada, confirmação cancelada, falha de rede/reutilização da intenção, bloqueio enquanto pendente, histórico sob demanda, erro de consulta e proteção DEV. Primeira execução falhou por ausência de crypto no JSDOM; mock corrigido. Também ajustado act para exportação da versão React instalada.
- Execução final do frontend, incluindo remontagem após falha de rede: 4 aprovados, zero falhas. Aviso preexistente de baseline-browser-mapping desatualizado, sem atualização de dependências.
- Sintaxe de App.js e componente validada por Babel parser instalado na raiz; node --check de index/admin/access/worker aprovados. git diff --check de App/index/package sem erros, apenas aviso de normalização LF/CRLF.
- Duas tentativas de tooling foram corrigidas sem alteração indevida: package.json inicialmente buscado a partir de crm (caminho inexistente) e Babel parser inicialmente buscado em crm/node_modules, embora esteja instalado na raiz. Nenhuma dependência foi instalada.
- Suíte geral de 204 aprovados/1 skipped pertence à Fase 6 e não foi repetida nesta fase. Não somar testes repetidos como cobertura única.

### Pendências e limites

Fase concluída tecnicamente em código/local. Auth/Firestore/Meta dos testes são simulados; faltam emuladores, rules efetivas, homologação visual autenticada em navegador/dispositivo e integração remota DEV na Fase 8. Não houve build de aplicação ou deploy nesta fase. Referência operacional: docs/whatsapp-fase7-admin.md.
manualEnabled é opt-in privado e não foi ativado. Template, secrets, conta/número e inscrição do webhook permanecem dependências externas para envio real. Faltas de consentimento em pedidos antigos não foram preenchidas artificialmente. Status é atualizado ao abrir/consultar, sem polling. Histórico visual é uma janela limitada; dados completos permanecem no backend.
Reenvio intencional após unknown ou enquanto automático está pendente pode produzir outra mensagem: UI informa essa possibilidade. UUID protege reentrega da mesma solicitação, não impede reenvio deliberado. Limites/retencão e casos unmatched do webhook das fases anteriores permanecem registrados para homologação/auditoria.

### Próxima ação exata

Conferir checkpoint e estado real; executar somente Fase 8 — testes abrangentes e homologação DEV conforme os 20 cenários do plano, incluindo fluxo administrativo atual, reenvio após sucesso/falha automática, comportamento sob falhas e comparação com dados persistidos. Resolver divergência literal de caminho em AGENTS.md antes de qualquer build/deploy, mantendo workspace DEV associado exclusivamente a crmdoceria-9959e. Não declarar DEV homologado sem evidência correspondente; registrar bloqueios externos se necessários.
Ao concluir Fase 8, alvo 90% e parada obrigatória para usuário alterar manualmente para GPT-6 Astra High/Alto, conforme plano. Não iniciar auditoria Fase 9 sem confirmação do usuário nem produção sem autorização explícita/plano aprovado.

FASE 7 CONCLUÍDA — PROJETO 80%.

## Histórico — Preparação Meta DEV: webhook publicado, 80%

Data: 2026-09-21. Usuário autorizou expressamente somente a publicação de whatsappWebhook no projeto crmdoceria-9959e para loja interna matriz, sem iniciar Fase 8, sem envio real e sem produção. A solicitação genérica de continuação foi tratada como retomada dessa preparação restrita, preservando as restrições específicas. Nenhum avanço de percentual.

### Verificações e configuração

- Workspace absoluto confirmado: C:\Users\antonio.pedro\Projeto\projeto-doceria-main. Associação a DEV confirmada pelo pedido explícito desta etapa, resolvendo operacionalmente a divergência literal do caminho legado em AGENTS.md para este deploy. AGENTS.md não foi alterado.
- Google Cloud confirmou projectId crmdoceria-9959e, projectNumber 389481198252, lifecycleState ACTIVE e billingEnabled true. APIs Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Secret Manager e Firestore já habilitadas. Nenhuma consulta ao projeto de produção.
- Dependências npm de runtime presentes, Node.js 22 configurado, sintaxe do webhook válida e nove testes locais do webhook aprovados. Não houve instalação/atualização de dependências nem início da homologação Fase 8.
- Documento DEV integrations/whatsapp/stores/matriz atualizado com máscara restrita aos campos enabled=false, automaticEnabled=false e manualEnabled=false; leitura posterior confirmou os três valores. Outros campos foram preservados. Nenhum ID Meta ou secret foi inventado/criado/lido.
- Secrets não são necessários para publicar: o webhook os lê somente durante requisições após conferir sua configuração. Não foi feita configuração na Meta, inscrição, verificação de token ou envio WhatsApp.

### Deploy e validação técnica

Comando executado no workspace confirmado: firebase deploy --project crmdoceria-9959e --only functions:whatsappWebhook --non-interactive.
Primeira tentativa parou antes de publicar por timeout de descoberta local de 10 segundos. Segunda tentativa usou FUNCTIONS_DISCOVERY_TIMEOUT=60 e concluiu. Timeout HTTP da Function permanece 60 segundos, maxInstances 2, região southamerica-east1, Node.js 22, geração 2. Nenhuma alteração no código da aplicação nesta etapa.

Problema local de TLS foi resolvido mantendo validação de certificado: NODE_OPTIONS=--use-system-ca no Firebase; Google Cloud CLI usou Python disponível e bundle temporário de CAs públicas confiáveis do Windows/Node via CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE. Não foi desabilitada validação SSL. O teste inicial com isolamento de processo encontrou spawn EPERM; executado com --experimental-test-isolation=none, conforme padrão já usado no projeto, passou. CLI avisou sobre versão mais nova do firebase-functions; dependências mantidas.

Resultado Firebase: Successful create operation / Deploy complete.
URL efetivamente retornada: https://southamerica-east1-crmdoceria-9959e.cloudfunctions.net/whatsappWebhook
Callback matriz: https://southamerica-east1-crmdoceria-9959e.cloudfunctions.net/whatsappWebhook/matriz

Inventário DEV anterior: 104 Functions. Posterior: 105. Única adição: whatsappWebhook, ACTIVE. Comparação estrutural dos metadados das 104 preexistentes: nenhuma alteração; nenhuma remoção. Comparação inicial por string JSON acusou diferenças apenas pela ordem das propriedades, corrigida com ordenação recursiva para comparação estrutural. Nenhum Hosting, rules, checkout, worker, callable ou outra Function foi publicado.

GET público sem autenticação/token no callback matriz retornou HTTP 403 com corpo exato Disabled, emitido pelo handler. Isso confirma alcance público e bloqueio de configuração; não significa webhook conectado/validado pela Meta. Nenhum POST de mensagem foi feito.

### Pendências e próxima ação exata

Projeto continua 80%, Fase 7 concluída, Fase 8 NÃO iniciada. Não repetir deploy por rotina. Aguardar orientação do usuário para fornecer/configurar WABA ID e Phone Number ID DEV, webhookEnabled e os secrets whatsapp-dev-matriz-verify-token / whatsapp-dev-matriz-app-secret. Access token whatsapp-dev-matriz-access-token será necessário para futuros envios, não para disponibilizar o endpoint. Não consultar payload de secrets nem pedir credenciais no chat; preparar orientação segura quando solicitado.
As permissões de leitura dos secrets pelo runtime e a inscrição Meta ainda não foram configuradas/validadas. Manter enabled, automaticEnabled e manualEnabled false até autorização específica de teste. Não declarar Fase 8 concluída nem avançar auditoria/produção. Demais limitações de código/homologação das fases anteriores continuam válidas.

## CHECKPOINT ATUAL — Template Meta DEV cadastrado, 80%

Data: 2026-09-22. Preparação Meta DEV autorizada, sem iniciar Fase 8. Checkpoint, estado real do Git e contrato docs/whatsapp-template-v1.json conferidos antes das consultas. Nenhuma alteração de frontend/backend ou deploy nesta etapa.

- Webhook DEV validado pela Meta conforme informado pelo usuário nesta solicitação. Evidência técnica diretamente observada na etapa anterior: GET de inscrição com Verify Token retornou HTTP 200 e corpo exato 123456. Não foi inspecionada a tela da Meta nesta etapa.
- Verify Token, App Secret e Access Token DEV configurados no Secret Manager: whatsapp-dev-matriz-verify-token, whatsapp-dev-matriz-app-secret e whatsapp-dev-matriz-access-token, versões 1 criadas nas etapas anteriores. IAM de leitura concedido nos secrets à identidade 389481198252-compute@developer.gserviceaccount.com. Nenhum valor de secret registrado neste documento.
- Aplicativo 3009076999435341 inscrito com sucesso na WABA DEV 1180911957843371: POST anterior HTTP 200/success=true e GET posterior HTTP 200 confirmando inscrição. WABA retornou Test WhatsApp Business Account; número 1345803455282426 retornou Test Number (account_mode=LIVE). Nenhuma troca de WABA/número.
- Nesta etapa, Access Token lido apenas em memória do Secret Manager e validado na Graph API com app_id esperado. WABA de teste reconfirmada. Duas consultas de ausência precederam o POST; nenhum template homônimo existente foi editado ou excluído.
- Criado somente confirmacao_pedido_v1 via POST /v25.0/1180911957843371/message_templates. HTTP 200; ID 1051903707844583; categoria UTILITY; status PENDING. Idioma pt_BR; parameter_format POSITIONAL; somente BODY, com três parâmetros e exemplos exatos do JSON aprovado pelo usuário.
- Consulta posterior HTTP 200 retornou um template: ID 1051903707844583, nome confirmacao_pedido_v1, idioma pt_BR, categoria UTILITY, status PENDING. Comparação de nome, idioma, categoria, formato posicional, texto exato e componentes: nenhuma divergência. Nenhum cabeçalho, rodapé, botão ou mídia adicionado. Aprovação da Meta ainda pendente; não adaptar automaticamente se houver rejeição/recategorização posterior.
- Confirmados enabled=false, automaticEnabled=false e manualEnabled=false na configuração DEV de matriz. Nenhum campo de configuração foi alterado nesta etapa.
- Nenhuma mensagem enviada, nenhum acesso à produção, nenhum cadastro de número oficial ou forma de pagamento. Fase 8 NÃO iniciada; projeto permanece 80%.

Próxima ação: aguardar resultado de análise da Meta; consultar novamente o status quando solicitado. Não enviar mensagens nem habilitar os controles de envio sem autorização específica. Se o token expirar, solicitar renovação, sem substituir credenciais automaticamente. Os registros anteriores são históricos; as pendências de criação dos três secrets, IDs, inscrição e cadastro do template foram resolvidas conforme esta atualização, mas aprovação do template e homologação Fase 8 permanecem pendentes.

## CHECKPOINT ATUAL — Fase 8 iniciada; primeiro envio bloqueado nos pré-requisitos, 80%

Data: 2026-09-23. Usuário autorizou iniciar oficialmente a homologação DEV e realizar somente um primeiro envio manual controlado, condicionado aos pré-requisitos, sem produção e sem automático. Checkpoint e Git conferidos antes das ações; alterações preexistentes preservadas. Workspace C:\Users\antonio.pedro\Projeto\projeto-doceria-main associado exclusivamente a crmdoceria-9959e.

- Projeto ativo do gcloud confirmado como crmdoceria-9959e; Cloud Resource Manager confirmou o mesmo ID e estado ACTIVE. Consultas remotas restritas ao DEV e à conta Meta autorizada.
- Access Token versão 2 lido em memória; debug_token retornou HTTP 200, is_valid=true e app_id=3009076999435341 às 12:40:37 UTC. Expiração informada: 2026-09-23 11:00:00 -03:00. Nenhum segredo registrado; validade precisa ser reconfirmada na retomada.
- Template 1051903707844583 / confirmacao_pedido_v1 retornou APPROVED, UTILITY e pt_BR. Corpo comparado ao JSON local: igualdade exata; um componente retornado.
- WABA 1180911957843371 retornou Test WhatsApp Business Account; lista de números confirmou 1345803455282426 / Test Number. Consulta subscribed_apps confirmou 3009076999435341 inscrito.
- Configuração remota matriz: enabled=false, automaticEnabled=false, manualEnabled=false, webhookEnabled=true; IDs WABA/remetente corretos. Bloqueio: sem destinatário string preenchido em allowedRecipients e sem valores string para mode, apiVersion, templateName e templateLanguage. Não inventar destinatário nem remover allowlist para prosseguir.
- Inventário Cloud Functions v2 DEV consultado sem paginação restante: somente whatsappWebhook ACTIVE entre as Functions WhatsApp. Ainda não publicadas: enqueueWhatsAppConfirmation, processWhatsAppConfirmation, recoverWhatsAppConfirmations, getWhatsAppOrderStatus e requestWhatsAppOrderResend. O caminho manual depende de requestWhatsAppOrderResend e processWhatsAppConfirmation; implantação/validação final do conjunto mínimo não executada devido ao bloqueio anterior.
- Interrompido antes de qualquer deploy, habilitação ou envio, conforme condição explícita do usuário. Operacionalidade atual de App Secret/assinatura e challenge ainda não retestada nesta etapa. Pedido controlado, consentimento, destinatário autorizado na Meta, operador autenticado/autorizado e quotas ainda precisam de validação; não foram presumidos.
- Nenhum pedido/job criado ou usado; nenhum message ID, recibo ou histórico de envio gerado por esta etapa. Nenhuma evidência nova de entrega, assinatura de recibo real ou ausência de duplicação/logs do fluxo completo. Nenhum acesso à produção; nenhum frontend/backend alterado. Apenas este checkpoint atualizado.

Próxima ação: obter/confirmar o destinatário de teste autorizado e completar a configuração DEV preservando as proteções; revalidar token e demais pré-requisitos antes de qualquer envio. Escolher pedido DEV controlado e elegível e operador com sessão autenticada, sem fabricar consentimento/autorização. Só então publicar o mínimo necessário e executar uma única solicitação manual. Fase 8 iniciada, mas nenhum cenário real de envio concluído: projeto permanece 80%, sem declarar homologação concluída.

### Atualização — deploy mínimo manual DEV concluído em 2026-09-23

Após autorização específica do usuário, publicadas somente requestWhatsAppOrderResend e processWhatsAppConfirmation em crmdoceria-9959e, região southamerica-east1, Node.js 22 / geração 2. Workspace absoluto reconfirmado e associado ao DEV pelo pedido explícito. Sintaxe válida e suíte WhatsApp: 90 testes aprovados, zero falhas.

Comando: firebase deploy --project crmdoceria-9959e --only "functions:requestWhatsAppOrderResend,functions:processWhatsAppConfirmation" --non-interactive --force. A primeira tentativa sem --force foi interrompida pelo CLI antes da criação, por exigir aceitação da política retry já implementada no worker. A segunda concluiu com Successful create operation para ambas e Deploy complete. Usados FUNCTIONS_DISCOVERY_TIMEOUT=60 e NODE_OPTIONS=--use-system-ca; nenhuma dependência alterada.

Leitura posterior da API Cloud Functions confirmou ambas ACTIVE. Inventário passou de 105 para 107 Functions; nenhuma Function preexistente removida ou com updateTime alterado. Webhook existente preservado; nenhum Hosting, regra, enfileirador automático, scheduler de recuperação ou callable de consulta publicado.

Leitura posterior do Firestore confirmou enabled=false, automaticEnabled=false e manualEnabled=false. Nenhum envio ou pedido/job de teste criado nesta etapa; produção não acessada. Bloqueios da configuração/allowlist e validações pendentes do primeiro cenário continuam conforme registro anterior. Fase 8 em andamento, não concluída; projeto permanece 80%.

### Fase 8 — primeiro cenário real bloqueado por ausência de pedido DEV (2026-09-23)

Nova verificação autorizada antes de habilitar envios: projeto ativo crmdoceria-9959e confirmado. Access Token versão 3 validado pela Graph API (HTTP 200, is_valid=true, App ID 3009076999435341). Template confirmacao_pedido_v1 retornou APPROVED / pt_BR. WABA 1180911957843371 retornou Test WhatsApp Business Account; consulta dos números confirmou 1345803455282426 e subscribed_apps confirmou o aplicativo esperado.

whatsappWebhook, requestWhatsAppOrderResend e processWhatsAppConfirmation confirmadas ACTIVE por leitura individual na API Cloud Functions DEV. Configuração privada validada pelo parser implementado: mode=cloud, apiVersion=v25.0, templateName=confirmacao_pedido_v1, templateLanguage=pt_BR, IDs corretos e allowlist com um destinatário. Telefone completo não registrado. enabled=false, manualEnabled=false e automaticEnabled=false confirmados; nenhum controle alterado.

Consulta REST à coleção lojas/matriz/pedidos retornou zero documentos, sem próxima página: nenhum pedido elegível disponível nesse caminho exigido pelo callable. Interrompido antes de habilitar ou invocar o reenvio. Usuário precisa criar um novo pedido DEV pelo checkout, com o destinatário autorizado e consentimento WhatsApp explícito (versão order-confirmation-v1). Nenhum pedido antigo alterado e nenhum job criado diretamente.

Resultado do primeiro cenário: BLOQUEADO, não passou nem foi executado. Nenhuma tentativa de envio, Meta Message ID, recibo real ou auditoria de envio gerada nesta etapa; validações de operador autenticado, assinatura/correlação de recibos, status, duplicação e logs permanecem pendentes. Nenhum deploy, acesso à produção ou mensagem enviada. Controles permanecem false. Fase 8 em andamento, projeto 80%.

### Fase 8 — validação read-only do pedido DEV criado no checkout (2026-09-24)

Pedido mais recente consultado no projeto DEV crmdoceria-9959e: ID mascarado 91xl…8aaT, criado em 24/09/2026 15:40:39 (Brasília), status Pendente. `lojas/matriz/pedidos` não retornou pedido com createdAt; o pedido foi localizado em `lojas/ana-guimaraes-doceria-matriz/pedidos`, caminho que o checkout matriz local usa. O campo lojaId persistido também é `ana-guimaraes-doceria-matriz`. O callable manual configurado para `matriz` exige documento em `lojas/matriz/pedidos` e lojaId=`matriz`.

Telefone normalizado válido, correspondente ao único número da allowlist DEV (mascarado ***0290). Resumo gerado pelo formatter implementado: 350 caracteres, dentro de 1024; template confirmacao_pedido_v1 / pt_BR correto. Configuração mode=cloud, apiVersion=v25.0, WABA e Phone Number ID DEV corretos. Status Pendente é aceito pelo fluxo manual. `enabled`, `manualEnabled` e `automaticEnabled` permanecem false.

Bloqueios adicionais observados no pedido persistido: `whatsappConfirmation.consent.granted` não é true, `consent.status` e versão esperada `order-confirmation-v1` ausentes; telefone metadado não corresponde à normalização esperada. Não tratar o consentimento visual informado pelo usuário como consentimento persistido. Pedido não elegível e ainda não pronto para gerar novo Access Token com finalidade de envio. Não foram feitas alterações no pedido, controles, código ou recursos remotos; sem chamada à Meta e sem envio. Projeto segue em 80%, Fase 8 em andamento.

## CHECKPOINT ATUAL — Fase 8: divergência de loja e consentimento corrigidos no DEV, 80%

Data: 2026-09-25. Checkpoint, Git sujo preexistente e código real conferidos antes das mudanças; nada anterior foi revertido. Workspace absoluto C:\Users\antonio.pedro\Projeto\projeto-doceria-main vinculado explicitamente ao Firebase DEV crmdoceria-9959e. Nenhum acesso ao projeto de produção.

### Causas confirmadas

- O cardápio matriz publicado no Hosting DEV usa `ana-guimaraes-doceria-matriz` como ID canônico do checkout. Produto, configuração da loja, pedido e campo `lojaId` usam esse mesmo ID. O CRM passa o `lojaId` real do pedido para o componente WhatsApp. O WhatsApp foi implementado com ID interno `matriz` para configuração, secrets, webhook e jobs, mas seus callables/worker tentavam localizar o pedido no caminho interno `lojas/matriz/pedidos`. Alterar o checkout para `matriz` quebraria os caminhos existentes; não foi feito.
- O HTML publicado no Hosting DEV já possui ambos os checkboxes opcionais, lê `checked === true` antes do submit e envia `whatsappConsent: {accepted, version: 'order-confirmation-v1'}` em JSON para `/checkout/confirmar`. O backend local já lia esse campo e gravava `whatsappConfirmation` na mesma transação do pedido, mas a Function `api` efetivamente publicada ainda era a revisão de 2026-08-21, cujo código fonte não importava `buildCheckoutWhatsApp`, não lia `whatsappConsent` e não persistia `whatsappConfirmation`. O pedido real anterior foi gravado por essa revisão antiga. Nenhum consentimento foi inferido ou preenchido retroativamente.

### Correção e deploy restrito

- Implementado mapeamento explícito e restrito `ana-guimaraes-doceria-matriz` -> `matriz` em `functions/whatsapp-config.js`. O caminho/autorização do pedido continua usando o ID canônico do checkout; configuração privada, quotas, job, secret, correlação e webhook mantêm o ID interno. `functions/whatsapp-order-summary.js`, `functions/whatsapp-admin.js` e `functions/whatsapp-worker.js` separam `orderStoreId` físico de `storeId` interno; worker revalida operador e pedido no caminho físico. Nada duplica pedido em Firestore. `functions/whatsapp-admin.test.js` e `functions/whatsapp-worker.test.js` receberam cenários de alias, autorização e ausência de duplicação.
- Para evitar publicar alterações locais não relacionadas em `functions/index.js`, o pacote fonte da revisão `api` publicada foi lido do Cloud Storage DEV e corrigido em staging temporário com somente import do helper existente `whatsapp-checkout.js`, leitura estrita do payload, gravação de `whatsappConfirmation` na transação e retorno de `whatsappPhoneStatus`. O staging preservou os demais arquivos/rotas e o `.env` da revisão existente; foi removido após o deploy, incluindo o arquivo temporário de origem. O código local `functions/index.js` já continha a mesma lógica correta e não foi alterado nesta etapa.
- Deploy explícito `--project crmdoceria-9959e`: somente `api` atualizada em us-central1; `requestWhatsAppOrderResend` e `processWhatsAppConfirmation` atualizadas e `getWhatsAppOrderStatus` criada em southamerica-east1. Firebase reportou sucesso; Cloud Functions API confirmou as quatro ACTIVE e `whatsappWebhook` existente ACTIVE. Nenhum Hosting, regra, enqueue automático ou scheduler publicado.
- Teste da rota `api` staged contra doubles de transação e checkboxes HTML: 8/8 aprovados. Suíte direcionada WhatsApp/admin/worker/resumo/webhook: 58/58 aprovados antes do cenário automático adicional; teste isolado do worker após esse cenário: 26/26 aprovados. Números sobrepostos, não somar. Sintaxe da `api` staged validada. O primeiro deploy staged falhou antes da publicação por falta de resolução local de dependências; corrigido com junction temporária de `node_modules`, removida depois. Deploy final concluiu.
- Firestore DEV relido após deploy: `enabled=false`, `manualEnabled=false`, `automaticEnabled=false`; `mode=cloud`, WABA/Phone Number ID DEV preservados. Nenhum token gerado/trocado, nenhum pedido alterado/migrado/copied, nenhum WhatsApp enviado, nenhum controle habilitado. Produção não acessada.

### Validação seguinte

Abrir `https://crmdoceria-9959e.web.app/cardapio-matriz.html` sem parâmetro `store` alternativo (ou com `store=ana-guimaraes-doceria-matriz`) e criar novo pedido DEV pelo checkout normal, com telefone da allowlist e checkbox WhatsApp marcado. O novo pedido deve aparecer apenas em `lojas/ana-guimaraes-doceria-matriz/pedidos/{pedidoId}`, com `lojaId` igual ao ID físico, `whatsappConfirmation.phoneStatus='valid'`, `phoneE164` correspondente ao telefone normalizado e `consent` contendo `granted=true`, `status='granted'`, `version='order-confirmation-v1'`, `source='checkout'` e `recordedAt` do servidor. Confirmar status não Cancelado, resumo <=1024 caracteres e parâmetros do template antes de qualquer envio.

Ainda não foi criado um pedido após a correção; persistência real e fluxo manual ponta a ponta permanecem para a próxima validação DEV. Projeto permanece 80%; Fase 8 em andamento, sem conclusão/homologação declarada.

### Fase 8 — primeiro envio real controlado bloqueado na confirmação do CRM (2026-09-26)

- Escopo restrito ao projeto DEV `crmdoceria-9959e`; Git preexistente sujo preservado, sem deploy nem acesso à produção. Secret Manager `whatsapp-dev-matriz-access-token` versão 4 lido apenas em memória. Meta `debug_token` confirmou token válido, App ID `3009076999435341`, expiração em 26/09/2026 às 17h de Brasília. Template `confirmacao_pedido_v1` (`pt_BR`, `UTILITY`) permaneceu `APPROVED` com corpo e componentes exatos. WABA de teste `1180911957843371`, Phone Number ID `1345803455282426` e inscrição do app confirmados; `subscribed_apps` retorna o App ID em `whatsapp_business_api_data.id`.
- `whatsappWebhook`, `requestWhatsAppOrderResend` e `processWhatsAppConfirmation` estavam `ACTIVE`. Pedido mais recente pós-deploy `bWVu…P0HA`, em `lojas/ana-guimaraes-doceria-matriz/pedidos`, permaneceu pendente e elegível: loja física mapeada para `matriz`, telefone normalizado correspondente à única entrada da allowlist (máscara `***0290`), consentimento `granted=true`, `status=granted`, `version=order-confirmation-v1`, `source=checkout`, `recordedAt` válido. Resumo do documento persistido: 372 caracteres; modo `cloud`, API `v25.0`, template e idioma corretos. Índice de reenvios manuais tinha zero jobs antes da tentativa.
- A sessão autenticada do CRM DEV consultou `getWhatsAppOrderStatus` com sucesso para esse pedido, demonstrando acesso de leitura autorizado à loja. Somente `enabled=true` e `manualEnabled=true` foram habilitados temporariamente; `automaticEnabled=false` foi mantido. O botão de reenvio apareceu e foi acionado uma vez, mas a automação da interface expirou ao tentar confirmar o diálogo JavaScript; o resultado do diálogo ficou incerto. Não foi repetido o clique nem usado outro caminho para invocar o callable.
- Para conter qualquer execução tardia, `enabled`, `manualEnabled` e `automaticEnabled` foram restaurados a `false`. Leitura remota posterior confirmou os três `false` e zero jobs manuais para o pedido. Nenhuma tentativa no worker, resposta da Cloud API, Meta Message ID, webhook ou histórico de envio foi observada. Nenhum segundo envio foi tentado. Resultado do cenário: **BLOQUEADO antes do envio**. É necessária uma nova janela supervisionada para habilitar apenas o manual e o operador confirmar uma vez no CRM DEV; então acompanhar e desabilitar novamente. Fase 8 segue em andamento, projeto em 80%.

### Fase 8 — primeiro envio real manual: Cloud API aceitou, webhook sem correlação (2026-09-26)

- O usuário autorizou uma janela supervisionada no DEV `crmdoceria-9959e`. Antes de habilitar, Access Token versão 4 foi validado em memória pela Meta (`is_valid=true`, App ID esperado, expiração 26/09/2026 às 17h de Brasília); o pedido `bWVu…P0HA` continuava elegível, com resumo de 372 caracteres, telefone na allowlist e nenhum job manual anterior. Configuração `mode=cloud`, `apiVersion=v25.0`, WABA/número de teste, template `confirmacao_pedido_v1` / `pt_BR` preservados. Somente `enabled=true` e `manualEnabled=true` foram habilitados; `automaticEnabled=false` permaneceu. O operador informou que confirmou **uma vez** no CRM DEV. Codex não acionou o CRM nem fez outro envio.
- Firestore DEV registrou **um** job manual para o pedido, ID mascarado `4b2f2e…8bd462`, com `operatorId` presente (máscara `TCNs…ovH2`) e `attemptCount=1`. Histórico contém `created`, `attempt_started` e `attempt_finished`, uma ocorrência de cada. Resultado sanitizado da Cloud API: `accepted` / `meta_accepted`, com Meta Message ID mascarado `wamid.HBgM…M3AA==`; status HTTP da chamada de envio não foi persistido no resultado seguro. Mensagem única foi aceita pela Meta; não houve retry nem duplicação de job.
- Cloud Logging DEV mostrou um POST real no `whatsappWebhook` com HTTP 200 em 26/09/2026 18:51:26 UTC; o logger posterior registrou `{unmatched:1}`. Pelo fluxo do handler publicado, HTTP 200 e esse log só ocorrem depois da validação de `X-Hub-Signature-256`, portanto a assinatura passou. O evento não foi correlacionado ao job, não gerou entrada `webhook` no histórico e não avançou o status do job, que permanecia `accepted` na releitura cerca de cinco minutos depois. O documento de correlação do envio e o mapeamento do Meta Message ID existem; o motivo específico do `unmatched` ainda não está demonstrado. Não inferir `sent`, `delivered` ou `read` a partir de `accepted`.
- Os três controles foram restaurados imediatamente após observar `accepted`; leituras posteriores confirmaram `enabled=false`, `manualEnabled=false`, `automaticEnabled=false`. Auditoria sanitizada de 13 entradas de logs das três Functions envolvidas, no intervalo do teste, não encontrou o Access Token versão 4, o App Secret nem o telefone completo. Não foi feito segundo envio, novo deploy ou acesso à produção. **Resultado ponta a ponta: FALHOU na correlação do webhook**, apesar da aceitação pela Cloud API. Investigar a divergência de correlação sem repetir mensagem; Fase 8 permanece em andamento e projeto em 80%.

### Fase 8 — causa exata do `unmatched` no primeiro webhook (2026-09-26)

- Consulta somente de leitura ao payload real do evento de teste no painel Meta para a WABA DEV, combinada com registros Firestore DEV e Cloud Logging; nenhum telefone completo, token ou payload bruto copiado para o checkpoint. Evento único com `statuses[].status=failed`, `statuses[].timestamp=1790448685` (18:51:25 UTC), `errors[0].code=130497` e título/mensagem/detalhe: `Business account is restricted from messaging users in this country.` Isto é a evidência principal da não entrega; `accepted` indicava somente aceitação da chamada de envio, não entrega ao destinatário.
- `statuses[].id` corresponde ao Meta Message ID retornado pelo POST: hashes SHA-256 iguais e índice `messages/{hash(wamid)}` existente. `biz_opaque_callback_data` estava presente e seu hash coincide com o correlation ID pré-criado. WABA `1180911957843371`, Phone Number ID `1345803455282426`, loja `matriz`, job e tentativa 1 conferem. Não houve divergência nesses vínculos.
- Falha exata na regra `correlation.recipientHash !== event.recipientHash` de `applyStatus`: o destinatário permitido/persistido tem 13 dígitos; `statuses[].recipient_id` chegou com 12, mantendo os quatro finais mascarados `***0290` e omitindo precisamente o dígito `9` imediatamente após o DDD. O handler classificou `unmatched` por essa desigualdade de hashes, apesar de `wamid` e callback opaco corresponderem ao job. Não atribuir esta divergência a corrida temporal ou ausência de callback.
- Linha do tempo UTC: job criado 18:51:12.334; tentativa iniciada 18:51:15.936; correlation record persistido 18:51:16.551; POST à Meta ocorreu após esse commit e antes do resultado `accepted` registrado às 18:51:18.244 (instante exato do POST não persistido); índice do Meta Message ID persistido 18:51:18.302; status `failed` produzido pela Meta 18:51:25.000; webhook POST recebido 18:51:26.661 (HTTP 200, assinatura validada) e log `unmatched:1` às 18:51:31.299. O índice precedeu o webhook em mais de oito segundos, descartando a hipótese webhook-before-index neste caso.
- Nenhuma correção, deploy, reprocessamento ou novo envio nesta consulta. O job permanece `accepted` porque o recibo `failed` não foi correlacionado; não inventar `sent`, `delivered` ou `read`. Configuração confirmada `enabled=false`, `manualEnabled=false`, `automaticEnabled=false`. Produção não acessada. Fase 8 em andamento, projeto 80%.
