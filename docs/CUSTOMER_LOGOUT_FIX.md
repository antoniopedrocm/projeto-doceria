# Logout da Área do Cliente — DEV, 28/10/2026

Workspace: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, Firebase **crmdoceria-9959e**. PROD não autorizada.

## Causa e estado preso

ApplicationGate já distinguia `customer-login` de `customer`, mas ambos montavam CustomerShell com a mesma apresentação privada. No estado sem UID, CustomerShell inicializava a mensagem externa `Carregando sua conta…` e continuava mostrando CustomerFrame, sidebar, Minha Conta, Meus Pedidos e Sair. O controlador público renderizava seu próprio prompt de login; seu primeiro evento Auth null não publicava uma sessão Customer capaz de encerrar aquela mensagem externa. Resultado: loading externo e login interno simultâneos, sem saída visual.

Além disso, a conclusão do logout voltava a executar o resolver assíncrono (retirada da sessão legada e sincronização de carrinho) para chegar à apresentação pública. Auth null não deve depender dessa hidratação para remover dados privados.

## Correção

- Auth null aplica imediatamente a entrada pública correspondente à rota antes de aguardar qualquer preparação assíncrona. Não resolve capabilities Customer para conceder acesso sem UID.
- CustomerShell sem UID apresenta logo, título, login Google/e-mail do controlador existente e Voltar ao Cardápio. Não monta CustomerFrame nem navegação privada, menu de conta ou Sair. Mensagem inicial sem UID é vazia.
- Sair remove o controlador/dados e ações privadas imediatamente, bloqueia solicitações concorrentes e descarta import/callbacks tardios do controlador aposentado. Durante o encerramento há somente o estado transitório de saída.
- Após signOut, o gate verifica o Auth real e termina em `/area-cliente` com `customer-login`, sem esperar a resolução Customer/legada. Não declara sucesso se uma identidade autenticada ainda estiver presente; nesse caso mostra erro e permite tentar sair novamente.
- `customerLogin.css` contém somente a apresentação da entrada pública. O design aprovado das páginas autenticadas e Admin Preview é preservado.

## Contratos preservados

Nenhuma alteração em SDK/configuração/persistência Auth, backend, Rules, SMS/OTP, canonical Customer, aliases, APIs, checkout ou InfinitePay. Sair continua encerrando a sessão canônica conforme contrato existente, inclusive para dual-role; alternar entre CRM e Customer continua sem logout. Admin Preview permanece com provider, auditoria, leases e saída próprios.

O logout canônico e o unregister de FCM não foram modificados. A remoção continua limitada ao token/dispositivo atual, antes do signOut, com timeout existente de **5 segundos**, AbortController e tratamento de falha remota que permite concluir o logout local. Não remove tokens de outros dispositivos. O carrinho segue as regras existentes de propriedade/limpeza, sem novo apagamento global de storage.

## Verificação local

- **101 testes React, 5 suítes PASS**: shell, gate, integração real gate+shell (IO simulado), notificações/FCM e Admin Preview. Incluem três rotas de saída, refresh/Voltar, null Auth com hidratação que não termina, falha de signOut, clique repetido, import tardio e dual-role/cross-tab.
- **94 testes Node PASS**: logout canônico com cleanup correto/falha/timeout, token do dispositivo atual, controladores Customer, endereço/ownership, carrinho e recompra.
- **9 testes Auth/cache PASS**: persistência canônica e headers reais do Hosting.
- As verificações automatizadas usam fixtures; não realizam logout de uma sessão do usuário, escrita DEV, pedido, pagamento ou SMS real.

## Entrega e aceite

Build **PASS**, lint **PASS** (zero erros/warnings de código nos arquivos alterados) e diff-check **PASS**. Total: **204 testes PASS**. Build com os quatro avisos preexistentes de sourcemaps native-audio e bases Browserslist/Baseline desatualizadas; saída0. Bundle principal438,2kB gzip, CSS14kB gzip; sem nova biblioteca.

Commit/push e publicação Hosting DEV concluídos e verificados, conforme entrega abaixo. A homologação autenticada DEV ainda está **PENDENTE**: Customer → Minha Conta → Sair e Customer → Meus Pedidos → Sair; confirmar entrada pública sem shell privado/loading infinito e refresh desautenticado. Não salvar dados, comprar, pagar ou enviar SMS.

Percentuais preservados: Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%. O aceite visual pontual de Minha Conta e o aceite independente do refresh das seções Staff não são concluídos implicitamente por este bugfix.


### Entrega técnica —28/10/2026, logout Customer

Commit funcional **b5457075740f9b8ed703c3a0e80d295213dc977b**, push DEV concluído. Deploy somente Hosting crmdoceria-9959e, com workspace absoluto/predeploy conferidos; release e saída0.59/59 hashes remotos PASS,16 fontes de sourcemap e50 públicos conferidos. Cache de HTML/bootstrap revalidável e assets hashados immutable, PASS. [Evidência](evidence/customer-logout-delivery-dev-2026-10-28.json). Build/lint/diff-check e204 testes PASS; sem deploy backend/Rules/Auth. A primeira tentativa falhou antes de upload por erro da CLI; probe identificou SELF_SIGNED_CERT_IN_CHAIN. A publicação foi concluída com --use-system-ca (trust store do Windows), mantendo TLS validado, sem alterar firewall, credenciais ou segurança da aplicação.

Gate técnico de publicação resolvido; homologação autenticada específica Minha Conta → Sair e Meus Pedidos → Sair **PENDENTE**, sem real-data mutations/SMS/pagamento. Outros aceites visuais/Staff permanecem com os estados anteriores. Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%. PROD intacta.
