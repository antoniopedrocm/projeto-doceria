# Autenticação de clientes e pagamento online

## Fase 0 — baseline e levantamento (2026-09-08)

- Repositório de trabalho: DEV, `https://github.com/antoniopedrocm/projeto-doceria.git`.
- Workspace original: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`; alterações preexistentes preservadas. Trabalho isolado em `infinitepay-auth-worktree`, dentro desse diretório.
- Branch exclusiva: `feature/infinitepay-customer-auth`. Placeholder remoto verificado em `2df755a1a08ee2e2467fa90b1525d07c881b2ab0`, idêntico a `origin/main`, sem commits próprios.
- Baseline: `production/main`, commit `7751ab46ae63d8cec91b6cd621dac6891a7052d4`, obtido do GitHub Multilojas por fetch. Referência escolhida conforme escopo; não houve verificação de equivalência com o bundle publicado.
- Comparação objetiva: 114 commits exclusivos de DEV e 441 de produção; diferença de 80 arquivos, 23.717 inserções e 9.552 remoções. Históricos divergentes: usar o snapshot de produção, sem merge das mains.
- Publicar somente esta feature no origin DEV, com lease fixado no SHA do placeholder se necessário. Nenhuma alteração nas mains ou no diretório de produção.
- Na execução inicial: somente preparação Git e este documento, commit `c85f57c5`, enviado ao DEV. Sem implementação ou deploy naquela execução.

## Estado preservado e direcionamento vigente — 2026-09-12

Esta atualização altera somente o planejamento. Substitui as decisões anteriores incompatíveis sem descartar código, recriar branch, reverter commits ou implementar fases futuras.

- Estado Git conferido: branch `feature/infinitepay-customer-auth`; último commit do projeto `c85f57c5`, sobre a baseline `7751ab46`. Existem alterações locais de interface, conta, regras, emulação e pagamento ainda não commitadas; todas preservadas.
- Fase atual: implementação parcial e validação local, com reconciliação do desenho de autenticação/Customer (fases 2–4 abaixo). Há trabalho antecipado nas fases 5, 7–9 e 11; isso não significa que estejam concluídas ou homologadas. E-mail/senha e login do cliente pela home ainda não foram implementados.
- Validação anterior registrada: 5 testes unitários de autenticação/pagamento, 4 testes transacionais nos emuladores, 3 testes HTTP do checkout, 30 testes de negócio existentes e 32 testes existentes de regras/caixa passaram nas respectivas execuções. Essas evidências antecedem este direcionamento; não validam os novos fluxos de e-mail ou telefone sem OTP. A validação visual completa permanece pendente.
- Na última tentativa, o seed de dados fictícios foi bloqueado pelo revisor automático por limite de uso. O script foi salvo, mas essa tentativa de execução não foi concluída. Não houve cobrança real nem deploy.
- Próxima tarefa da fase atual: adaptar o rascunho Google/Customer para telefone de contato obrigatório sem OTP, sem consultar/vincular automaticamente o Customer legado, preservando a identificação antiga por celular. Fazer isso em uma execução de implementação, com testes; nesta atualização, somente registrar a mudança.

## Checkpoint de implementação — 2026-09-14

- Branch e remoto DEV conferidos antes da execução: `feature/infinitepay-customer-auth` permanece sem divergência de commits em relação a `origin/feature/infinitepay-customer-auth`; alterações locais anteriores foram preservadas. Nenhum deploy foi realizado.
- Próxima fase planejada executada no rascunho Google/Customer: o primeiro acesso agora solicita somente telefone de contato e salva o número sem OTP, SMS, reCAPTCHA ou Firebase Phone Auth.
- O Customer autenticado é criado de forma idempotente pelo vínculo com o `sub` Google. O backend não consulta telefone legado, não cria identidade de provedor `phone` e grava `phone_verified_at: null`.
- A identificação antiga pelo botão de celular continua chamando `lookupClientByPhone` nos três cardápios, sem nova etapa de autenticação. A separação de privilégios entre esse acesso legado e a conta autenticada permanece explícita.
- Validação desta execução: sintaxe dos módulos alterados aprovada; ESLint direcionado aprovado; 36 testes unitários/de negócio passaram, incluindo três novos testes de autenticação sem Phone Auth. O teste transacional foi atualizado para exigir criação separada do cadastro legado, idempotência concorrente e ausência de identidade por telefone.
- Limitação de ambiente: a suíte transacional não executou neste checkpoint. O Firebase CLI tentou baixar `cloud-firestore-emulator-v1.22.0.jar`, mas a rede recusou o download; o emulador local 1.21.0 exige Java 21, indisponível nesta máquina (Java 17 é antigo e Java 25 falhou ao abrir o loopback). Os três testes HTTP também não abriram o loopback neste ambiente. As aprovações anteriores dessas suítes continuam como histórico, mas não validam esta alteração.
- **Conclusão total estimada do projeto: 37%.** A estimativa considera fases 0 e a reconciliação Google/Customer parcialmente concluídas, além do trabalho antecipado ainda não homologado em conta e pagamento. E-mail/senha, sessão pela home, conclusão dos estados financeiros, recuperação opcional do legado, validação integrada e homologação continuam pendentes.
- Próxima tarefa recomendada: concluir a interface da fase 1 e implementar a fase 3 (e-mail/senha), reutilizando o mesmo Customer autenticado e mantendo o telefone inicial sem validação e sem merge automático.

## Checkpoint de implementação — 2026-09-15

- Estado inicial conferido: branch `feature/infinitepay-customer-auth`, sem divergência de commits em relação ao remoto DEV (`0/0`), com todas as alterações locais dos checkpoints anteriores preservadas. Nenhum deploy foi realizado.
- Fase 1 concluída no rascunho local dos três cardápios: “Entrar com Google” e “Entrar com e-mail” aparecem lado a lado em telas maiores e empilhados em telas pequenas; celular, separador, visitante e cancelamento foram preservados.
- Fase 3 implementada localmente: cadastro com nome, e-mail, telefone, senha e confirmação; login; logout; recuperação de senha; envio nativo de verificação após cadastro sem bloquear a compra; indicação de e-mail verificado/não verificado e reenvio em Minha Conta.
- O backend agora aceita identidades `google` e `email_password`. Para e-mail/senha, a chave estável é o UID do Firebase; o texto do e-mail e o telefone não são usados como chave do Customer e não provocam vínculo com cadastro legado.
- O mesmo fluxo `customerCompleteProfile` cria o Customer isolado para ambos os providers, mantém o telefone como contato não verificado (`phone_verified_at: null`) e permite retomar o checkout depois da autenticação.
- Validação desta execução: sintaxe dos módulos aprovada, ESLint do backend alterado aprovado, `git diff --check` aprovado e 37 testes unitários/de negócio passaram. Foi acrescentado teste unitário da identidade por UID e teste transacional do isolamento do cadastro por e-mail. A limitação do emulador/loopback registrada em 2026-09-14 permanece; portanto, os novos testes transacionais e HTTP continuam pendentes de execução em ambiente compatível.
- **Conclusão total estimada do projeto: 45%.** Interface de autenticação e e-mail/senha avançaram, assim como o modelo Customer multiprovedor. Ainda faltam integração pela home, conclusão funcional de Minha Conta, validação ponta a ponta, estados financeiros, recuperação opcional do legado, homologação DEV e produção.
- Próxima tarefa recomendada: executar a fase 6, criando a Área do Cliente na home, separada do acesso da equipe, e reutilizar a sessão para pular a identificação no checkout sem perder carrinho ou etapa.

## Checkpoint de implementação — 2026-09-15 — fase 6

- Estado inicial reconferido: branch `feature/infinitepay-customer-auth`, remoto DEV sem divergência (`0/0`) e alterações locais anteriores preservadas. Nenhum build ou deploy foi executado.
- A home agora apresenta “Área do Cliente” e “Acesso da Equipe” como entradas distintas. A conta do cliente usa a instância Firebase pública nomeada `cardapioPublic`; o login administrativo continua no Firebase padrão do CRM e recebeu identificação explícita de equipe.
- A Área do Cliente da home reutiliza o mesmo módulo Google/e-mail dos cardápios e força persistência local da sessão. Ao navegar para qualquer cardápio no mesmo domínio, a sessão Customer é restaurada sem compartilhar privilégios ou estado com o acesso da equipe.
- O checkout aguarda a restauração inicial da sessão antes de decidir o fluxo. Customer autenticado e vinculado segue diretamente aos endereços; acesso legado por celular e visitante continuam vendo “Como deseja continuar?”.
- Carrinho, cupom, entrega e etapa são persistidos antes da decisão de identificação. Logout do Customer deixa o carrinho salvo, e a conclusão de um pedido mantém somente a sessão autenticada, descartando identificações legadas temporárias.
- Validação desta execução: sintaxe dos módulos públicos e JSX aprovada, `git diff --check` aprovado, 39 testes Node passaram (incluindo dois novos testes de decisão/retenção de sessão) e as 7 suítes React passaram, totalizando 98 testes React. As limitações de emulador/loopback dos checkpoints anteriores permanecem para os testes transacionais e HTTP.
- **Conclusão total estimada do projeto: 52%.** A autenticação pública, os dois providers, o Customer isolado e a sessão home/checkout estão implementados localmente. Permanecem pendentes a conclusão de Minha Conta, validação integrada/visual, estados financeiros e reservas, recuperação opcional do legado, homologação DEV e produção.
- Próxima tarefa recomendada: concluir a fase 5 de Minha Conta, especialmente gestão autenticada de endereços e histórico, antes de avançar a preparação financeira da fase 7.

## Checkpoint de implementação — 2026-09-15 — fase 5

- Estado inicial reconferido: branch `feature/infinitepay-customer-auth`, remoto DEV sem divergência (`0/0`) e trabalho local anterior preservado. Nenhum build ou deploy foi executado.
- Minha Conta agora permite editar nome e data de nascimento, mostra telefone de contato como não verificado, mantém o estado/reenvio de verificação de e-mail e oferece logout.
- Endereços autenticados são listados e podem ser excluídos na home ou no cardápio. Novos endereços criados no cardápio usam a callable `customerAddAddress`, que resolve o Customer pela identidade autenticada, ignora qualquer `clientId` do navegador, limita campos/coordenadas e aplica limite de 20 endereços.
- O fluxo legado de endereço continua separado. As operações de perfil, inclusão, exclusão e histórico da conta verificam `authOwnerUid`; nenhuma delas autoriza o Customer pelo identificador recebido do cliente.
- O histórico retorna no máximo 50 pedidos do Customer autenticado, com loja, data, total, estados do pedido/pagamento, forma e itens limitados aos campos necessários. A consulta usa o índice `clienteId + createdAt` já preparado.
- Formas de pagamento permanecem no checkout InfinitePay. Minha Conta informa que os dados completos do cartão não são armazenados pela Ana Guimarães; cartão salvo continua condicionado ao suporte real do gateway, sem simulação local.
- Validação desta execução: sintaxe aprovada, `git diff --check` aprovado, 41 testes Node passaram (incluindo validação de endereço/data e sessão) e as 7 suítes React passaram, totalizando 98 testes React. O teste transacional de inclusão/exclusão autenticada foi atualizado, mas segue pendente de execução pela limitação de emulador/loopback já registrada.
- **Conclusão total estimada do projeto: 60%.** Autenticação, Customer, sessão home/checkout e Minha Conta estão implementados localmente. Permanecem estados financeiros/reservas, recuperação opcional do legado, validação integrada e visual, homologação DEV e produção.
- Próxima tarefa recomendada: executar a fase 7, consolidando estados de pedido/pagamento, reservas de estoque e cupom, expiração/liberação e disparo de notificações somente após confirmação adequada.

### Divergências do rascunho a resolver, sem apagar o trabalho

| Componente existente | Ajuste pendente conforme o novo direcionamento |
| --- | --- |
| `crm/public/customer-account.js` e `functions/checkout-auth.js` | O rascunho exige SMS antes de resolver/criar o Customer Google. Retirar essa exigência do primeiro acesso na próxima implementação; OTP fica reservado à recuperação opcional de histórico, na fase 10, quando explicitamente solicitada |
| `functions/index.js`, consulta legada | O rascunho redireciona cadastros vinculados para Google. Reconciliar a experiência legada sem adicionar etapas e sem expor dados exclusivos da conta autenticada |
| `crm/public/checkout-payment-client.js` e endpoint de checkout | O rascunho admite pagamento online com sessão anônima. Isso não constitui decisão aprovada sobre visitantes: não habilitar esse caminho em homologação/publicação até definição futura. Identificação legada não concede os benefícios de uma conta autenticada |
| `crm/public/cardapio-*.html` e módulo de sessão | Preservar carrinho e contexto; futuramente pular identificação para cliente já autenticado. Novo botão de e-mail e ajuste de rótulo Google pertencem à fase de interface, não a esta atualização documental |

### Componentes adicionados durante a implementação local

- Conta compartilhada: `crm/public/customer-account.js`; backend `functions/checkout-auth.js`; callables conectadas em `functions/index.js`.
- Pagamento: `functions/checkout-payment.js`, `crm/public/checkout-payment-client.js`, `crm/public/payment-return.html` e `payment-return.js`; endpoint de confirmação/webhook/status em `functions/index.js`.
- Ambiente local: `crm/public/checkout-environment.js`, `firebase.checkout-local.json`, `scripts/checkout-seed.cjs`; projeto demo `demo-doceria-checkout`, distinto do Firebase DEV.
- Testes: `functions/checkout-auth.test.js`, `checkout-payment.test.js`, `checkout-emulator.test.js` e `checkout-http.test.js`; regras em `firestore.rules` e índice de histórico em `firestore.indexes.json`.
- Configuração por loja: `docs/INFINITEPAY_STORE_CONFIG.example.json`. Matriz: tag `ana_guimare`, conforme última confirmação do usuário. Demais contas aguardam suas tags; nenhuma loja deve herdar automaticamente a conta da Matriz. `cardapio-festa.html` usa a loja Matriz na baseline, não representa por si só uma terceira conta de recebimento.
- Scripts temporários `.checkout-*.cjs`, `.audit-read.cjs` e manifesto local `functions/functions.yaml` estão preservados no worktree; revisar os artefatos de desenvolvimento antes de futuros commits/deploys, sem tratá-los como produto concluído.

## Mapa direcionado da baseline (levantamento histórico)

Os caminhos abaixo são relativos ao worktree; linhas referem-se à baseline acima.

| Área | Arquivos e pontos de entrada |
| --- | --- |
| Cardápios públicos | `crm/public/cardapio-matriz.html`, `cardapio-garavelo.html`, `cardapio-festa.html` |
| Identificação e etapas | Nos três HTMLs: finalizar em 368; modal “Como deseja continuar?” em 376; celular/visitante em 380–382; identificação em 392; endereços em 444; pagamento em 553; confirmar em 587 |
| JavaScript do checkout | Módulo inline a partir de 1219; `handlePhoneSearch` por volta de 2860; `handleGuestOrder`, `handlePlatformOrder`, `finalizeOrder` até 3248 |
| Carrinho | Array `cart`, `renderCart`, totais e cupom nos HTMLs; `persistCheckoutState`, restauração e limpeza via `sessionStorage` (1500–1561) |
| Firebase público | `crm/public/firebaseClientConfig.js`: app nomeado `cardapioPublic`, Auth anônimo persistente, Firestore, Functions em `us-central1` e wrappers de consulta/perfil |
| Firebase CRM | `crm/src/firebaseConfig.js`; `crm/src/App.js` já contém login interno por senha e Google (aprox. 6743–6793). Não confundir identidade de funcionário com customer público |
| Backend | `functions/index.js`: Express exportado como `api` (2505), Admin SDK e Functions; Node 22 em `functions/package.json` |
| Customers | Coleção global `clientes` (1174); normalização/busca por telefone e upsert; POST `/clientes` (1452); callable `lookupClientByPhone` (2000), `updateClientProfile` (2081) |
| Endereços | Array `enderecos` no cliente; callable `addClientAddress` (2142); HTML monta endereço completo, apelido, coordenadas, referência, complemento, sem número e preferência (aprox. 2374) |
| Pedidos | POST `/checkout/confirmar` (1616); gravação transacional em `lojas/{lojaId}/pedidos/{pedidoId}` (1787), com clienteId/nome/endereço/telefone, itens, totais, formaPagamento, status, origem, createdAt |
| Pagamento atual | HTML envia apenas a forma selecionada; backend confirma criação do pedido, sem gateway nesse fluxo. Visitante também recebe envio via WhatsApp após salvar |
| Regras e índices | `firestore.rules`, `firestore.indexes.json`, `storage.rules`; revisar autorização de cliente e leitura de histórico antes da área Minha Conta |
| Hosting | `firebase.json`: publica `crm/build`, cleanUrls e fallback `/index.html`; front CRM React 18/CRA 5/Tailwind, cardápios HTML/JS com Firebase SDK 10.8 via CDN |
| Emuladores | PARCIAL: script `dev` na raiz e scripts em `functions/package.json`; testes de regras/integração em `functions/firestore.rules.test.js` e `caixa-functions.integration.test.js`. `firebase.json` não define seção emulators; inicializadores inspecionados não conectam Auth/Firestore/Functions aos emuladores |

### Comportamento e riscos a preservar no planejamento

- Matriz e festa são idênticos na baseline; garavelo difere somente em duas linhas de STORE_ID. Há forte duplicação. Preferir futuramente um módulo compartilhado de identificação/sessão, parametrizado por loja, com adaptação pequena nos HTMLs; sem refatoração ampla nesta fase.
- Celular atual é consulta cadastral: normaliza número, aplica rate limit/auditoria e retorna cliente; se não encontrado, abre cadastro. Não há OTP nesse fluxo. A sessão anônima não comprova propriedade do telefone ou customer.
- A callable de endereço inspecionada valida loja e cliente, mas não demonstra vínculo autenticado entre solicitante e customer. Antes de expor conta/histórico, revisar também endpoints de cadastro/perfil e regras; não usar clientId enviado pelo navegador como autorização.
- Customers são compartilhados entre lojas e possuem nome, telefone, endereços, lojasVisitadas, contadores de compras e timestamps conforme os handlers. Pedidos ficam por loja. Planejar histórico multiloja com autorização pelo customer estável.
- Checkout atual valida itens/totais e altera estoque/cupom na transação. A fase de pagamento deve decidir reserva, expiração, liberação de estoque/cupom e momento das notificações (`notifyNewOrder`, 3710), evitando anunciar como confirmado um pedido ainda não pago.
- A baseline contém configuração pública e API_BASE_URL de produção e scripts Functions com `--project ana-guimaraes`. O trabalho local posterior iniciou o isolamento do checkout e ajustes nos scripts. Conferir também as configurações do CRM antes de qualquer execução/build; não presumir isolamento completo apenas pelo checkout.
- Projeto Firebase permitido para futuro DEV: `crmdoceria-9959e`. Produção: `ana-guimaraes`, somente no diretório próprio e após homologação/autorização. Confirmar caminho absoluto antes de qualquer build/deploy. Fluxo obrigatório LOCAL → DEV → PRODUÇÃO; sem deploy automático.
- Testes e aplicação não foram executados na auditoria inicial. As verificações posteriores estão registradas acima, sem equivaler a homologação ponta a ponta. Nenhum conteúdo sensível deve ser registrado no plano ou commits futuros.

## Arquitetura e experiência aprovadas

### Identificação e sessão

- Interface futura: **Continuar com celular**; **G Entrar com Google** e **✉ Entrar com e-mail** lado a lado (empilháveis em telas pequenas); separador **ou**; **Continuar como visitante**; **Cancelar**. Escopo de autenticação real: `GOOGLE` e `EMAIL_PASSWORD`, sem outros providers nesta etapa.
- **Celular é acesso legado/identificação por telefone**, não autenticação forte: informar telefone → buscar cadastro → comportamento atual → endereço/retirada. Manter exatamente essa experiência, sem OTP, SMS, WhatsApp de validação, código, Firebase Phone Authentication, senha ou etapa adicional. Isso não elimina os usos de contato/WhatsApp já existentes no pedido.
- O acesso legado não deverá liberar cartão salvo, conta autenticada completa, gestão de credenciais/identidades, recuperação de dados sensíveis adicionais ou pagamentos que exijam conta autenticada. Preservar a experiência atual não autoriza ampliar seus privilégios.
- **Google é autenticação real** pelo Firebase. No primeiro acesso, pedir apenas o telefone de contato se faltar; não exigir validação do número nem usar a coincidência para recuperar dados antigos.
- **E-mail/senha é autenticação real** pelo Firebase: entrada com e-mail e senha, “Esqueci minha senha” e “Criar conta”. Cadastro: nome, e-mail, telefone, senha e confirmação de senha. Autenticar imediatamente após criar a conta e retomar a mesma etapa do checkout, sem código ou confirmação obrigatória antes da compra.
- E-mail não verificado não bloqueia cadastro, login inicial, compra, pagamento online ou área básica. Planejar envio nativo de verificação do Firebase em segundo plano após cadastro, se compatível; falha no envio não interrompe a compra. Usar `emailVerified` do Firebase; permitir reenviar em Minha Conta e atualizar a indicação após validação. Não criar sistema próprio de código numérico por e-mail.
- Cliente também poderá entrar pela home, com **Área do Cliente** (Google/e-mail) separada de **Acesso da Equipe / Entrar como funcionário**. Preservar a autenticação da equipe e impedir privilégios administrativos a clientes.
- Sessão compartilhada do cliente entre home e cardápio, separada do contexto administrativo. Cliente já autenticado não vê novamente “Como deseja continuar?”: segue à próxima etapa adequada. Login/cadastro durante o checkout preserva carrinho, loja, cupom, entrega e etapa de retorno, inclusive em recarregamento/redirect.
- Visitante permanece disponível com a experiência atual. Pagamento online de visitante é decisão futura, nem permitido nem proibido por este plano; nunca haverá cartão persistente associado a uma conta Ana Guimarães nesse modo.

### Customer e identidades

- Modelo genérico: `CUSTOMER → AUTH_IDENTITIES (GOOGLE, EMAIL_PASSWORD) + ADDRESSES + ORDERS`. Customer tem identificador interno estável; usar Firebase UID ou abstração equivalente para o vínculo autenticado. Google usa o identificador imutável do provider (`sub`); e-mail/senha fica sob gestão do Firebase, nunca usando somente o texto do e-mail como chave primária do Customer.
- Preparar múltiplos métodos autenticados no mesmo Customer no futuro, sem implementar a associação nesta atualização. Não fazer vínculo entre contas por mera coincidência de e-mail, nome ou telefone; exigir prova adequada de controle das identidades quando essa fase chegar.
- Telefone obrigatório em contas Google e e-mail, usado para contato do pedido, entrega, WhatsApp e InfinitePay. Telefone informado não é telefone verificado: conceitualmente `phone_number` e `phone_verified_at = null` até comprovação. Ausência de verificação não bloqueia conta, nova compra, pagamento ou novo endereço.
- **Proibido merge/vínculo automático com cadastro legado por telefone.** Um usuário autenticado que informe número já cadastrado não recebe os endereços ou pedidos antigos. Manter Customer autenticado isolado do legado até recuperação segura; essa separação intencional substitui a antiga exigência de reutilizar imediatamente o cadastro telefônico. Garantir idempotência/unicidade pelo vínculo autenticado, não pelo telefone informado.
- Recuperação histórica é opcional e posterior: na área autenticada, oferecer confirmação de posse para recuperar cadastro anterior; somente após prova segura associar histórico/endereços. OTP por SMS ou WhatsApp poderá ser implementado exclusivamente nessa finalidade, na fase 10 mediante pedido explícito, nunca no botão de celular nem no cadastro inicial. Prever tratamento de conflitos e números reciclados sem associação insegura; não revelar dados históricos antes da prova.
- Minha Conta futura: Meus Dados, Meus Endereços, Meus Pedidos, Formas de Pagamento, Segurança da Conta e Sair. Mostrar e-mail verificado/não verificado e reenvio; telefone informado e recuperação opcional de histórico quando aplicável. Endereços e histórico pertencem à aplicação.

### Pagamentos e responsabilidades

- InfinitePay permanece o gateway: Pix, cartão, parcelamento quando suportado, customer, endereço, `order_nsu`, redirect, webhook e confirmação financeira server-side. Clientes autenticados por Google ou e-mail poderão pagar sem verificação inicial obrigatória de telefone/e-mail.
- Ana Guimarães mantém Customer, identidades, perfil, telefone, sessão, endereços, histórico, pedidos e status. InfinitePay mantém processamento financeiro, dados PCI e eventuais mecanismos seguros de cartão salvo. Confirmar o suporte efetivo a cartão salvo antes de implementar/promover essa opção; nunca armazenar número completo/PAN, CVV ou dados sensíveis PCI na aplicação.
- Preservar `PaymentService → InfinitePayProvider`, configuração por loja, idempotência, conciliação de pedido/conta/valor e confirmação pelo backend. Redirect não comprova pagamento; webhook precisa ser validado e reconciliado. Não liberar estoque/confirmar pedidos com base apenas no navegador.
- Separar `order_status`: PENDING, CONFIRMED, PREPARING, READY, DELIVERED, CANCELLED; e `payment_status`: PENDING, PAID, FAILED, EXPIRED, REFUNDED. Garantir compatibilidade com legado. Expiração, falha, estorno, reservas, cupons e notificações ainda exigem validação completa; os testes existentes não demonstram que todos esses estados foram implementados.

## Direcionamento vigente — 2026-09-21 — InfinitePay por loja

Esta seção incorpora integralmente a atualização de configuração financeira. Preserva as demais decisões e implementações e prevalece sobre notas históricas incompatíveis. Execução documental: fase 5 registrada localmente, próxima execução permanece na fase 7; a configuração gráfica abaixo será implementada na fase 8, sem pular etapas. Estimativa anterior de 60% mantida como referência provisória, sem aumento por esta atualização de requisitos e sujeita à reavaliação na validação integrada.

### Conta recebedora e configuração

- Cada loja possui sua própria conta/InfiniteTag InfinitePay. Nenhuma InfiniteTag global hardcoded ou fallback para outra loja é permitido. A tag `ana_guimare` pertence exclusivamente à Matriz.
- Usar o documento existente `lojas/{storeId}/configuracoesInternas/infinitepay` como base. O rascunho de `functions/checkout-payment.js` já consulta esse caminho, exige `enabled` e handle válido e não contém tag recebedora global; isso não significa que a configuração gráfica esteja implementada.
- Criar em Configurações da Loja → Pagamentos Online → InfinitePay: `enabled`, `handle`, `sendCustomerData` (default true) e `sendDeliveryAddress` (default true). Não armazenar nome, e-mail, telefone ou endereço fixos de comprador nessa configuração. URLs operacionais existentes permanecem sob controle do backend/ambiente.
- Exibir: “A InfiniteTag configurada determina a conta que receberá os pagamentos desta loja.”
- Festas, quando representar loja recebedora própria, exige `storeId` e conta próprios. O HTML de festas ainda aponta para Matriz na baseline: resolver esse mapeamento antes de habilitar recebimento independente, sem inventar tag ou tratar o nome do arquivo como loja financeira.

### Permissões e confirmação financeira

- Dono/Administrador autorizado pode visualizar, cadastrar, alterar, ativar/desativar e consultar histórico. Mapear Administrador ao perfil administrativo efetivamente existente; não conceder poder apenas porque o frontend envia role ou um rótulo “admin”.
- Gerente não pode alterar por padrão. Seguir o padrão existente `permissionDetails.configuracoes`, encontrado em `functions/user-status-core.js`, para a permissão específica conceitual `manage_payment_settings`; definir a chave final ao implementar e exigir valor explicitamente true. Nenhuma permissão financeira nova foi criada nesta execução documental.
- Validar perfil ativo, permissão e escopo de loja no backend e nas Rules aplicáveis. Gerente da loja A não altera a loja B sem autorização de escopo existente. Proteger também a concessão dessa permissão contra autoelevação; esconder botões serve apenas à experiência.
- Primeiro cadastro usa confirmação normal. Troca de qualquer handle existente exige modal “Alterar conta de recebimento?”, mostrando valor atual e novo e avisando: “Você está alterando a InfiniteTag desta loja. Os próximos pagamentos online poderão ser direcionados à nova conta.”
- Troca de tag ativa exige digitar `ALTERAR` antes de habilitar a ação final. O backend valida a confirmação e compara a versão/valor anterior para impedir sobrescrita concorrente. Essa confirmação não substitui autorização. Não exigir esse atrito em ajustes triviais sem troca de conta.

### Auditoria e histórico

- Toda alteração relevante gera auditoria server-side com storeId, campo alterado, valor anterior/novo, UID, identificação disponível, role, timestamp do servidor e origem/ação. Reutilizar a arquitetura `auditLogs`, já presente em `functions/fiscal.js`, após conferir suas permissões de leitura.
- Persistir alteração e auditoria de forma atômica; não aceitar mudança financeira sem registro. Identidade, role e horário são obtidos no servidor. InfiniteTag pode constar no histórico; passwords, tokens privados, secrets, dados de cartão e CVV nunca podem constar.
- Mostrar “Última alteração”, data/hora, “Por” e usuário; oferecer histórico com acesso autorizado e escopo por loja. Reutilizar a interface central de auditoria quando compatível.

### Dados dinâmicos e criação do checkout

- Resolver `order.storeId` → configuração dessa loja → `enabled == true` e handle válido → checkout InfinitePay. Ausência, desativação ou configuração inválida bloqueia o checkout com erro seguro e registro apropriado, sem fallback para Matriz ou outra loja.
- Respeitar `sendCustomerData`: preencher dinamicamente nome, e-mail apenas quando disponível e telefone a partir do comprador/pedido. Usar os nomes de campos aceitos pelo contrato real do provider (o rascunho usa `customer.phone_number`); não inventar um contrato por tradução dos nomes conceituais.
- Respeitar `sendDeliveryAddress`: em entrega, mapear CEP, rua, número, bairro e complemento dos campos reais para o contrato do provider. Não tentar inferir campos ausentes de um texto livre nem inventar dados; preparar a preservação dos campos estruturados existentes no formulário de endereço. Retirada não envia endereço residencial fictício.
- Relacionar por `order_nsu` e manter confirmação server-side. Salvar a conta recebedora/configuração usada na tentativa: uma troca posterior de tag afeta próximos checkouts, sem redirecionar ou reconciliar cobranças anteriores na conta nova.
- Situação atual: flags de envio, e-mail e endereço estruturado, tela, permissão, auditoria e confirmação forte ainda pendentes. O rascunho já envia nome/telefone dinamicamente e lê handle por loja; não declarar conformidade completa.

### Critérios de teste da fase 8

- Dono e Administrador autorizado configuram; gerente sem permissão é negado; gerente com permissão altera somente loja autorizada; gerente de outra loja é negado. Validar no backend, incluindo tentativa de escrita direta e autoelevação.
- Primeiro cadastro funciona; troca de tag existente exige confirmação; tag ativa exige `ALTERAR`; alteração concorrente é detectada; auditoria e metadados de última alteração são gerados no servidor.
- Checkout usa exatamente a tag da loja, nunca fallback; configuração ausente/inválida/desativada bloqueia com erro seguro; cobranças antigas mantêm sua conta original após troca.
- Dados variam conforme comprador; ausência de e-mail é aceita; retirada não envia endereço fictício; flags de envio são respeitadas; dados pessoais não são gravados em configurações financeiras nem em sua auditoria.

Checkpoint desta atualização: status e branch verificados antes da edição; trabalho local preservado. Somente este plano foi alterado nesta execução, incluindo os checkpoints anteriores ainda locais. Commit documental na branch atual; nenhum build, deploy, alteração de main ou implementação antecipada. Testes funcionais serão executados quando esta parte for implementada; agora validar apenas o diff documental. Próxima etapa permanece fase 7, seguida da fase 8 com estes requisitos.

## Roadmap vigente (numeração atualizada)

A numeração abaixo substitui a antiga. Trabalho já iniciado permanece preservado; a atualização não autoriza executar automaticamente fases posteriores.

| Fase | Entrega e critério principal |
| --- | --- |
| 0 | Baseline Git e levantamento concluídos; ambiente local iniciado e testado parcialmente; preservar rastreabilidade e isolamento |
| 1 | Interface Google + e-mail + separador implementada nos três cardápios; celular/visitante preservados; validação visual pendente |
| 2 | Google Auth + sessão pública. Primeiro acesso sem OTP reconciliado; validação integrada e de sessão ainda pendente |
| 3 | E-mail/senha: cadastro, login, logout, recuperação e verificação nativa não bloqueante implementados localmente; integração completa pendente |
| 4 | Customer autenticado: telefone obrigatório sem validação inicial; vínculos Google e e-mail por identidade estável, idempotentes e sem merge automático; integração completa pendente |
| 5 | Minha Conta: perfil, endereços autenticados, pedidos, segurança, estado/reenvio de e-mail e política de pagamento implementados localmente; homologação pendente |
| 6 | Área do Cliente na home separada da equipe; sessão pública persistente e checkout pulando identificação para Customer vinculado implementados localmente; validação visual pendente |
| 7 | Núcleo implementado e validado localmente em 2026-09-21: reserva, expiração, cupons, estados operacionais e bloqueio de confirmação indevida. Homologação e entrega real de notificações permanecem nas fases 9/11/12 |
| 8 | InfinitePay: configuração gráfica e conta própria por loja, permissão financeira específica, auditoria, confirmação forte de troca de tag, prefill dinâmico e falha segura conforme direcionamento de 2026-09-21; checkout, Pix/cartão, order_nsu e redirect. Provider iniciado, sem validação financeira real; cartão salvo/parcelamento dependem do suporte efetivo |
| 9 | Webhook: validação, idempotência, reconciliação e confirmação server-side. Parte testada em emulação; completar cenários de recuperação |
| 10 | Recuperação opcional do legado mediante prova de posse do telefone; somente então associar histórico/endereços. Não implementar OTP agora |
| 11 | Testes locais completos: celular inalterado, Google/e-mail sem validação inicial, isolamento de Customer/legado e equipe, sessão home/checkout, endereços/histórico, pagamento e recuperação; preservar os testes já úteis e adaptar os incompatíveis |
| 12 | Firebase DEV `crmdoceria-9959e` e homologação após marco funcional local e autorização. Sem deploy nesta atualização |
| 13 | Produção após homologação e autorização, no repositório/diretório próprio, com plano de retorno. Sem promoção automática |

O checkpoint de 2026-09-14 altera somente o rascunho local da autenticação Google/Customer e sua documentação/testes. Não houve deploy, mudança nas mains ou acesso ao Firebase DEV/produção.


## Checkpoint vigente — 2026-09-21 — fase 7

- Estado inicial consistente: worktree DEV em `C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, HEAD inicial `60c46b2c`. Alterações anteriores preservadas. Esta execução não realizou build, deploy, cobrança real, push ou alteração de main.
- Fase 7 implementada localmente. Na criação online, estoque disponível é debitado como reserva, com snapshot de caminhos/quantidades; cupom incrementa `reservados`, sem incrementar `usos` ou consumir o benefício do cliente antes da confirmação. O limite considera usos + reservas também nas compras offline. Reservas simultâneas do mesmo cupom para o mesmo Customer são bloqueadas.
- Prazo operacional adotado: 30 minutos, definido por `RESERVATION_MS` no backend. Expiração local transacional libera estoque e cupom exatamente uma vez e registra `EXPIRED/CANCELLED`. Consulta e retomada verificam vencimento; função agendada a cada 5 minutos varre páginas de 100 e reporta falhas isoladas. Índice composto adicionado. O agendamento/índice só operarão remotamente após publicação autorizada futura.
- A expiração é da reserva da doceria: não afirma cancelar o link InfinitePay. A documentação oficial consultada (https://www.infinitepay.io/checkout-documentacao) não estabelece esse contrato de cancelamento. Pagamento confirmado após o prazo fica `PAID` com `requiresReview`, pedido cancelado/em conferência, sem consumo de cupom ou confirmação operacional. Nenhum estorno é presumido.
- Confirmação válida consome a reserva/cupom atomicamente com recibo e pedido; retries e concorrência não repetem os efeitos. Rascunhos antigos sem metadados de reserva não sofrem liberação automática: exigem inspeção antes de migração. Recursos removidos/inconsistentes bloqueiam liberação parcial e geram erro de conciliação.
- Estados operacionais online acompanham os rótulos existentes do CRM: Pendente → CONFIRMED; Em Produção → PREPARING; Pronto para Entrega → READY; Finalizado → DELIVERED; Cancelado → CANCELLED. Cancelamento de pedido pago mantém PAID, exige conferência e não repõe estoque consumido nem simula reembolso.
- Rules impedem escrita direta em pagamentos/recibos, confirmação/edição/exclusão de pedido online pendente e alteração dos valores financeiros de pedido pago. Operação legada e metadados não financeiros de pedido pago continuam permitidos. Notificação exige pedido pago e confirmado sem revisão; página de retorno diferencia expiração, revisão e confirmação.
- Validação aprovada nesta execução: **92 testes distintos** — 42 unitários/de negócio, 18 de integração checkout/Auth/Firestore/HTTP/reservas e 32 regressões existentes de regras/caixa. Incluem concorrência, limite de cupom, liberação única, pagamento tardio, status operacional e escrita direta negada. ESLint direcionado sem erros e sem warnings de código; apenas avisos das bases Browserslist desatualizadas. Sintaxe e diff verificados. Os 98 testes React do checkpoint anterior não foram reexecutados, pois esta fase não alterou React.
- Emulação recuperada: Firestore 1.21.0 com Java 25, locale en_US e `-Djdk.net.unixdomain.tmpdir=C:\Users\antonio.pedro\Projeto\projeto-doceria-main\.emulator-tmp\tcp-fallback` (caminho inexistente para fallback TCP do Java), host 127.0.0.1:8080, projeto demo-doceria-checkout. Auth via CLI somente emulador na porta 9099. A combinação evita falha de socket Unix e de mensagens localizadas do Java. Manifesto local Functions regenerado, inclusive novo scheduler; não publicado nem incluído como fonte versionada.
- Comandos de validação: em functions, `node --test --experimental-test-isolation=none checkout-auth.test.js checkout-payment.test.js checkout-reservation.test.js customer-session.test.js caixa-core.test.js user-status-core.test.js entre-lojas.test.js fiscal-permissions.test.js`; com emuladores ativos, suites `checkout-emulator.test.js`, `checkout-http.test.js` e `checkout-reservation-emulator.test.js`. Regras/caixa com FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 e GCLOUD_PROJECT=demo-caixa-rules.
- Commit desta fase inclui os arquivos necessários de backend/checkout que ainda eram rascunhos locais dos checkpoints anteriores, além das reservas e deste registro. As demais alterações locais de home/Minha Conta/cardápios e scripts auxiliares permanecem preservadas fora desse commit. Sem push nesta execução.
- **Conclusão total estimada: 67%**, estimativa de engenharia do escopo obrigatório, sem contar recuperação opcional do legado como entrega autorizada. Avanço sobre os 60% anteriores pela implementação da fase 7 e recuperação da validação transacional, sem equivaler a homologação completa.
- **Próxima fase: 8**, configuração gráfica InfinitePay por loja conforme direcionamento vigente: permissões, auditoria atômica, confirmação forte de troca, flags e prefill dinâmico. Tag da Matriz não é fallback; nenhuma tag global foi introduzida. Resolver storeId próprio de Festas antes de recebimento independente.
- Pendências posteriores: fase 9 (recuperação/conciliação operacional e prova de estados FAILED/REFUNDED, duplicação de entrega de eventos/notificações), fase 11 (UI, sessão, comportamento ponta a ponta e entrega real de push), DEV e produção somente após autorização. Este checkpoint não certifica cobrança real, reembolso, cancelamento remoto de link ou entrega única de push.
