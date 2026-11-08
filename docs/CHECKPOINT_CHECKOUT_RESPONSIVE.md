# Checkout responsivo — DEV e PROD local

08/11/2026. Origem DEV: `infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, HEAD inicial `65974d50`. PROD local: branch de preparação `codex/dev-to-prod-preparation-20261108`, HEAD inicial `398a89cc`. Diretório principal DEV está em branch de backup e não foi usado como fonte funcional.

## Implementação

- Os dois modais de confirmação (visitante e autenticado/celular) compartilham CSS e suporte de viewport/foco. Cabeçalho e rodapé não encolhem; conteúdo flexível tem `min-height: 0` e rolagem própria. O botão original permanece no rodapé, com os mesmos IDs e handlers.
- Limite pela área visível, fallback `vh`, `dvh`, VisualViewport com resize/offset e safe area. Inputs com fonte mínima de 16px, alvos de botão de 44px, foco visível, Tab contido, Escape/retorno de foco e mensagens de validação espelhadas com textContent no rodapé.
- Nenhum script original do cardápio foi alterado, comprovado por comparação das tags de script com HEAD. Nenhuma mudança em preço, frete, cupom, Auth, pagamento, sessão, pedido, Functions ou Rules. Os aliases HTML continuam cópias do cardápio canônico.
- Guest continua com Combinar Pagamento e Pix online indisponível; Strong/celular preservados. Pix-only continua dependência externa.

## Evidências locais

- DEV: **73/73** regressões de checkout/endereço/frete/finalização/identidade e visitante PASS.
- DEV: **39/39 cenários em Chrome e 39/39 em Edge**, usando o template real, Tailwind compilado offline a partir dele e os novos assets. Visitante/Strong/celular, 320×568, 390×800, 360×740, 800×360, 768×1024, 1920×889 e janela reduzida. Cupom, frete/endereço sintéticos, conteúdo longo, erro, disabled/loading, clique, foco, Tab/Escape e retorno de foco PASS. Zero requisições externas e zero pedidos.
- Zoom 100/125/150/200% coberto por viewport CSS equivalente (1366×768 dividido pelo fator), **não por certificação de zoom nativo**. Teclado coberto por eventos de resize/scroll de VisualViewport com altura reduzida e offset, **não por teclado físico iOS/Android**.
- Evidência/screenhots: `docs/evidence/checkout-modal-responsive/`. Capturas são fixtures locais, não sessões reais.
- Lint dos dois arquivos JavaScript novos: **0 erros, 0 avisos**. Sintaxe e diff-check PASS. Build DEV PASS, projeto explicitamente `crmdoceria-9959e`.
- PROD local: patch HTML aplicado por diff, sem substituir arquivos/configurações do ambiente. CSS/JS iguais ao DEV; **73/73** regressões PASS. Build e revisão de layout locais em conclusão.

## Publicação e próximo ponto

Publicação autorizada exclusivamente em Hosting DEV; registrar release e hashes depois da verificação remota. Nenhum deploy PROD autorizado. Guard `block-production-deploy.cjs` preservado. Configurações, secrets, dados e usuários PROD não consultados nem alterados.

Homologação física pendente: iPhone Safari/Chrome com teclado aberto e orientação; Android com teclado; zoom nativo 125/150/200% nos navegadores do usuário. Firefox/Safari não disponíveis neste Windows. Conferir rolagem e botão sem confirmar pedido. Não declarar aprovação universal dos dispositivos com base nas fixtures Chromium.

Percentuais formais preservados: **Fase 9 100%; Fase 10 87,50%; global 97,00%; Fase 13 0%**. Preparação PROD local anterior continua 90% (9/10 gates), com pendências fiscal/nativa anteriores; esta correção não encerra esses gates.
