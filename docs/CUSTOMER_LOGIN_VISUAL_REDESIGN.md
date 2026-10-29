# Entrada da Área do Cliente — ajuste visual DEV, 29/10/2026

Workspace `C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, Firebase **crmdoceria-9959e**. PROD não autorizada. Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%, sem alteração.

## Referência e decisão

Referência: login principal de `crm/src/App.js` (modal Login): inputs Email/Senha, recuperação, botão primário, divisor e Google com o mesmo SVG multicolorido. Reutilizados vocabulário gray/pink, bordas suaves, superfícies brancas, radius12/16/20, sombra leve e biblioteca/fontes existentes. Nenhuma dependência nova.

A entrada Customer mostrava botões Google/e-mail e abria um segundo modal para digitar credenciais. A instrução de acesso aparecia tanto no shell quanto no controlador. O novo layout expõe diretamente o **mesmo formulário** do controlador, sem implementar outro serviço ou regra de autenticação.

## Implementação e escopo

- `CustomerShell.js`: opt-in `inlineLogin` somente quando não há UID; título Área do Cliente, descrição única e retorno ao cardápio. Shell privado, navegação autenticada, logout e gate permanecem com seus contratos.
- `customerLogin.css`: card central de até448px, campos48px/16px, botão rosa, divisor ou, Google secundário e retorno discreto. Estilos limitados à entrada pública; sem altura fixa ou overflow interno.
- `customer-account-core.mjs`: opção visual `inlineLogin` requer host e vem desativada por padrão. O formulário existente é inserido como section no card, com os mesmos campos/handlers; helpers de abrir/fechar distinguem section de dialog. Não usa diálogo modal para o login inline. As entradas/modais não opt-in seguem o comportamento existente. Criar conta continua disponível como ação discreta, sem mudança no cadastro.
- Nenhuma mudança em SDK/configuração/persistência Auth, ApplicationGate, redirect/capabilities, backend, SMS/OTP, canonicalização, carrinho, checkout, pagamentos, InfinitePay ou Admin Preview. O link do cardápio continua conduzindo à rota `/area-cliente`; Minha Conta/Meus Pedidos desautenticados usam o mesmo componente de entrada.

## Fluxos preservados

Login e-mail/senha continua usando signInWithEmailAndPassword com o Auth canônico e refresh existente. Google mantém signInWithPopup e refresh existentes. Esqueci a senha usa sendPasswordResetEmail existente, com o Email preenchido; ausência do Email produz instrução, e o retorno usa o mesmo status acessível. Não há envio de recuperação real nos testes. Customer-only, dual-role e redirects continuam no gate/capabilities já existentes. O logout homologado não volta a montar sidebar privada para Auth null.

## Testes e revisão

- **96 testes React /5 suítes PASS**: shell, gate, logout integrado, Admin Preview e capabilities; Customer-only/dual-role, restauração de rotas e Auth null.
- **102 testes Node PASS**: controladores, oito novos casos do formulário inline, entrada pelo cardápio/aliases, endereço/ownership, carrinho, recompra e logout canônico. Os novos testes executam handlers reais do controlador com SDK/HTTP simulados: e-mail, Google, recuperação, erro seguro/re-enable, navegação de cadastro e preservação dos dialogs não opt-in.
- **9 testes Auth/cache PASS**. Total **207 testes PASS**. Ajustes finais de classes/espaçamento revalidados pelos8 testes inline e revisão visual.
- Chrome isolado local, controlador e componentes reais com runtime fictício, sem inicializar Firebase ou acessar redes externas: **8 larguras PASS** (320/375/390/430/768/1024/1366/1920). Inputs/ações visíveis, foco Email→Senha, refresh, nenhum overflow horizontal ou scroll interno. Retorno real via botão para cardápio fictício manteve storeId e quantidade do carrinho.
- Capturas **LOCAIS**, não são evidência autenticada do DEV: [desktop1920×889](evidence/customer-login-redesign/desktop-login.png), [mobile390×800](evidence/customer-login-redesign/mobile-login.png), [relatório](evidence/customer-login-redesign/local-review.json). Ambas revisadas visualmente.
- Lint: zero erros; um aviso preexistente no-loop-func em handler de endereços do controlador compartilhado, fora do ajuste. Não houve supressão nem alteração dessa lógica.

## Entrega

Build final **PASS**, saída0, com quatro avisos preexistentes de sourcemaps native-audio e bases de compatibilidade desatualizadas. JS principal438,26kB gzip e CSS14,46kB gzip; sem nova biblioteca. Diff-check **PASS**. Commit/push e Hosting DEV concluídos e verificados, conforme entrega abaixo. Aceite visual/funcional no DEV **PASS**, declarado pelo usuário em29/10/2026 ao roteiro da entrada: desktop1920×889 e mobile390×800, formulário direto, orientação de recuperação sem Email, login existente com redirecionamento habitual e retorno ao cardápio. O método de login não foi especificado; não atribuir o aceite manual aos dois providers nem ao envio real de recuperação. Nenhuma credencial deve ser enviada no chat; não realizar compra, pagamento, SMS ou WhatsApp. Não refazer o redesign das páginas autenticadas já aprovadas, nem fechar implicitamente os gates visuais independentes.


### Entrega técnica —29/10/2026, entrada visual Customer

Commit funcional **f4d92c1a25eeedc299e9441cd02851475093400f**, push DEV concluído. Deploy **somente Hosting crmdoceria-9959e**, com workspace/predeploy conferidos, release/Deploy complete e saída0.59/59 hashes remotos PASS,17 fontes de sourcemap e50 públicos conferidos; o controlador público é o único arquivo público de runtime alterado, com opt-in visual. Cache revalidável nas entradas estáveis e immutable nos assets hashados, PASS. [Evidência](evidence/customer-login-delivery-dev-2026-10-29.json). Build/lint/diff-check PASS;207 testes e8 larguras locais PASS,2 capturas fictícias desktop1920×889/mobile390×800 revisadas. Lint sem erros e com1 aviso preexistente no-loop-func no handler de endereços; build mantém avisos preexistentes native-audio/Browserslist.

A CLI15.34.1 anteriormente usada estava incompleta no cache e falhou antes de iniciar publicação. A CLI15.32.0 já instalada foi validada e concluiu o deploy com --use-system-ca; sem nova dependência do projeto, alteração de credenciais ou bypass TLS. Gates de publicação e aceite específico da entrada no DEV **CONCLUÍDOS**, conforme PASS manual do usuário em29/10/2026. Login real/recuperação não foram executados automaticamente. Sem backend/Auth config/SMS/pagamento/WhatsApp ou PROD. Percentuais e outros gates independentes preservados.


### Fechamento do aceite —29/10/2026

Usuário confirmou **PASS** ao roteiro solicitado, sem informar qual provider utilizou. Layout desktop/mobile, entrada direta, retorno e login/redirecionamento habitual aceitos manualmente. Google e e-mail/senha têm cobertura automatizada com SDK simulado; não foi declarado teste manual de ambos. Orientação de recuperação conferida sem envio real conforme roteiro. Sem captura autenticada automatizada ou nova operação no ambiente. Atualização somente documental, sem build/deploy/runtime; outros gates e percentuais preservados.
