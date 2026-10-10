# Reconciliação do CRM DEV com a Área do Cliente

## Evidência e preservação

- Workspace: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`; Git common dir no repositório DEV `projeto-doceria-main`; origin `antoniopedrocm/projeto-doceria`.
- Branch: `feature/infinitepay-customer-auth`, ponto de partida `7c5323eb`. Backup Git: `backup/customer-shell-before-crm-reconcile-20261010`.
- Firebase permitido: **crmdoceria-9959e**, exclusivamente Hosting. Produção não participa da reconciliação.
- Release DEV consultada antes da alteração: `47b33c46827a6155`, publicada em `2026-10-09T18:12:22.044Z`. Bundle Staff: `main.66cc25bb.js`.
- Os 42 módulos JavaScript próprios do source map publicado correspondem, após normalizar quebras de linha, às fontes Git de `codex/fiscal-emit-actions-dev` (`1b3b554b`). O Service Worker publicado também corresponde a essa branch. O source map foi usado para comparar; as fontes recuperadas vieram do Git. Nenhum bundle minificado foi editado.

## Reconciliação seletiva

- Preservados os componentes Staff publicados: iFood Hub, 99Food Hub, ações fiscais (edição/exclusão/clonagem, NCM e CFOP), jornada horista e data efetiva de escala, consolidação do ponto, caixa pós-fechamento, produção/vitrine, remessas/destinos, relatório Entre Lojas, pesquisa de clientes, corridas e filtros de data.
- Preservados alarmes e notificações publicados: deduplicação, pausa persistida/native e Service Worker com uma notificação por pedido, sem duplicação de som em página visível. A configuração pública Firebase do Service Worker continua fornecida pelo Hosting, com guarda do projectId DEV/demo; não se reintroduziu configuração fixa de outro ambiente.
- `App.js` reconciliado a partir da fonte Staff identificada. A entrada continua usando `ApplicationGate` e `StaffApplication` vinculada ao UID autorizado. Nenhum bootstrap de Customer como funcionário. Staff tem prioridade em rotas administrativas; rotas Customer explícitas permitem o contexto Customer de um mesmo UID sem converter permissões.
- Mantidos os módulos Customer de `7c5323eb` e a implementação compartilhada 6A/6B/6C. Não se criaram APIs privadas paralelas nem carteira de cartões.
- Mantidos a tela **Configurações → Pagamentos Online → InfinitePay**, a permissão explícita `manage_payment_settings` e os controles por loja.
- Reincorporadas as validações/transações administrativas aprovadas de preço, cupom, estoque e totais. Preservados o seletor pesquisável de clientes e as ações de corrida publicadas. Frete continua em `calculateOrderTotal`; os caminhos de criação, edição, revalidação e finalização não voltam a calcular apenas subtotal menos desconto.
- Mantidos sem alteração os helpers aprovados `firebaseConfig`, `stockService`, `freightConfigService` e `entreLojasPermissions`, além de `orderFreight`, backend Customer, checkout, InfinitePay e WhatsApp. O bloco WhatsApp continua presente em ambos os detalhes administrativos; wa.me fica explicitamente manual.
- Não houve alteração de Functions, Rules, índices, configurações financeiras ou dados remotos. As fontes locais de Functions não foram reconciliadas com evoluções administrativas remotas nesta tarefa; não devem ser publicadas em lote com este Hosting.

## Validação local

- Backend: **334/334**; integração Auth/Firestore apenas no projeto emulado `demo-doceria-checkout`: **47/47**.
- CRM: **323/323**, 29 suítes. Inclui testes recuperados dos módulos Staff e cinco testes novos que executam o observador de UID e a transação real extraída de `App.js` com Firebase simulado (frete, desconto, retirada e a combinar).
- Lint runtime CRM: zero erros, 75 warnings; lint Functions: zero erros, dois warnings preexistentes de regex WhatsApp. O lint amplo de testes encontra cinco erros preexistentes em `InfinitePaySettings.test.js`; esse arquivo não foi alterado. Build oficial aprovado, sem atualizar dependências; `git diff --check` aprovado.
- Artefato gerado: `main.7aba9077.js`; os sources de App, Gate, CustomerShell, InfinitePaySettings, iFood, 99Food e ações fiscais foram comparados ao source map gerado e coincidem com o workspace. Todos os arquivos públicos não-bundle da release anterior estão presentes no build, desconsiderando endpoints reservados `/__/`.
- Leitura DEV antes da publicação: WhatsApp Matriz `enabled=false`, `automaticEnabled=false`, `manualEnabled=false`. Function `api` sem env/Secret `GOOGLE_MAPS_SERVER_API_KEY`; documentos `lojas/{storeId}/configuracoesInternas/infinitepay` ausentes para Matriz e Garavelo. Não houve habilitação nem alteração dessas configurações.

## Publicação e homologação

- Commit funcional publicado/push: `9b2e0698c3b4c912c5ffc9ade20bb46dde8d1c1f`. Hosting DEV publicado em `2026-10-10T05:04:50.647Z`, versão `d162d3a799df96b8`, via `deploy --only hosting --project crmdoceria-9959e --non-interactive`.
- Hashes dos 46 arquivos enviados (gzip nível 9 da CLI) coincidem com a release; index/main também foram comparados diretamente. Firebase init remoto confirma o projectId DEV. SHA-256 descomprimido do main: `ca6c490a7d2ccfb734eef5b8e2d9a5de07c8cc294ed079f3d82b32851b029f54`.
- Smoke remoto: catálogos/carrinhos Matriz, Garavelo e Festas; shell de login/drawer/menu em 320, 375, 390 e 1440px sem overflow/erro JS/menu administrativo; rotas privadas exigem login. CORS: 30 preflights e dez negações 401 sem autenticação. Não houve criação de usuário/Customer ou mutação de negócio nesses testes.
- Testes autenticados reais do novo shell continuam pendentes: ferramenta interativa não inicializa (Windows error 3). A rota foi solicitada ao painel e o usuário consultado para confirmação manual. Não se substituiu OAuth por impersonação. Perfis, endereços, pedidos, IDOR A/B, recompra e visual privado não foram classificados como homologados remotamente.
- Ressalva baixa observada: após resolução sem sessão, o shell conserva o texto externo “Carregando sua conta…” junto dos controles de login. Não impede login e não foi corrigida silenciosamente. Mantém-se a dívida de escala de 1.000 candidatos por requisição e os bloqueios Maps/InfinitePay.
- Publicação e cobertura local não equivalem a homologação autenticada. Fase 12 permanece 25%; global permanece 88,50%. Produção, Functions, Rules, índices, configurações financeiras e WhatsApp não foram alterados. Não iniciar produção.
