# Minha Conta — ajuste visual pontual (28/10/2026)

Escopo exclusivo Customer Self `/minha-conta`, DEV crmdoceria-9959e, branch feature/infinitepay-customer-auth, worktree C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree. Percentuais formais inalterados: Fase9=75%, Global=95,00%, Fase13=0%.

## Aceite anterior preservado

O usuário aprovou Página Inicial, Meus Pedidos, detalhe, sidebar/topbar e identidade com CRM. Confirmou Ctrl+R em `/minha-conta` e `/meus-pedidos`. Essas superfícies não foram redesenhadas nem tiveram seus fluxos alterados neste ajuste. O conteúdo interno de Minha Conta foi reprovado e continua com gate próprio de homologação.

## Investigação e limite da conclusão

A tela já continha markup de cards e classes, mas a apresentação interna dependia da folha pública carregada separadamente por installCustomerAccount. A URL ainda era `customer-area.css?v=20261006-customer-reorder`, e a instalação de stylesheet considerava a presença de data-customer-area-style, sem acoplar sua revisão ao bundle.

O probe HTTP DEV de28/10 retornou CSS atual em ambas as URLs, status200, MIME text/css e cache no-cache/must-revalidate, SHA256488e2b8585b5a25725029a1ff4d784d69e4cdd29fd700dfca06352b4573e3002. Portanto, não foi alegado defeito atual do servidor nem confirmado cache local no browser do usuário. A captura desse browser não está disponível.

Foi reproduzido localmente o mesmo conjunto de sintomas com o controlador atual e a folha pública antiga: fundo transparente, radius/padding zero, Salvar transparente, gap de ações ausente, badge sem fundo; texto contíguo EditarExcluirDefinir como padrão. O teste visual de card branco falhou antes da correção (controle negativo), sem erro JS ou rede externa. Isso comprova a fragilidade da dependência de estilo, não a origem exata da folha carregada no navegador relatado.

## Correção e limites

Somente duas fontes de runtime:

- `CustomerShell.js`: import da folha local de Minha Conta e className do host somente quando a tela atual é profile. Sem alteração de efeitos, navegação, URL, controlador, UID, permissões ou handlers.
- `customerAccount.css`: estilos essenciais entram no CSS hashado do bundle. Seletores exigem customer-self-account e a seção data-profile; a exceção de feedback vazio também exige o host de Minha Conta. Não atingem Admin Preview, home, pedidos, detalhe, sidebar ou topbar.

Não mudou customer-area.css público, seu carregador, headers, APIs, SMS/OTP, backend, regras de endereço, canonicalização, InfinitePay ou qualquer arquivo do Admin Preview. A folha pública atual e a antiga podem coexistir com a apresentação essencial de Minha Conta; a tela não depende delas para os cards/botões.

Mesma linguagem do redesign aprovado: paleta gray/pink, cards brancos16px, borda gray-200, sombra leve, controles44px e ícones decorativos com strokes Lucide já adotados. Não há biblioteca ou design system novo.

## Resultado visual

- Módulos empilhados com limite1280px, sem largura fixa; campos de perfil limitados a900px. Header com ícone, título e descrição, espaçamento de labels/campos e helper readonly do telefone.
- Salvar é botão primário rosa; alinhado à direita dentro da largura dos campos no desktop e largo no mobile. Dados e ação permanecem os mesmos.
- Endereços em card separado, Novo endereço outline e heading com ícone. Cards em duas colunas quando há espaço e uma em tela estreita/mobile. Apelido preservado, badge Padrão com apresentação em maiúsculas; ação de padrão só aparece quando o renderer existente já a permite.
- Ações separadas por12px, com flex-wrap e exclusão discreta em vermelho. Campos/formulários existentes mantidos. Scroll continua no documento, sem painel principal com overflow/altura fixa.

## Testes e evidências

- 83 React em4 suítes PASS: CustomerShell, AdminCustomerPreview, ApplicationGate e capabilities. Inclui refresh já aprovado e teste de que o marcador de apresentação só existe em Minha Conta sem reinstalar o controlador.
- 70 testes existentes de conta/endereço/entrada/recompra PASS; handlers de salvar perfil/adicionar/editar/excluir/padrão preservados.1 teste de isolamento CSS PASS, validando todos os seletores, inclusive dentro de media queries. Total71.
- 9 testes Auth/cache PASS. Lint React alterado sem erros/avisos de código. Build/diff-check PASS. Mainc09d57a9.js437,72kB gzip (+15bytes sobre versão anterior), CSSfe3e7680 de13,86kB (+cerca de1,23kB). Quatro avisos conhecidos de native-audio/Browserslist; fonte customerAccount.css conferida exatamente no sourcemap do CSS compilado.
- Chrome local isolado com fixtures fictícias, sem Firebase/rede externa:8 larguras320/375/390/430/768/1024/1366/1920 PASS, com folha pública antiga simulada. Computed styles verificam card branco, radius/padding, primário rosa, alvos44px, gap de ações, campos≤900px, borda dos cards e fundo do badge. Sem overflow horizontal/scroll interno. Refresh em390px permanece em Minha Conta.

Evidências LOCAL (não são aceite autenticado DEV): [desktop](evidence/customer-account-polish/desktop-account.png), [mobile](evidence/customer-account-polish/mobile-account.png), [controle negativo antes](evidence/customer-account-polish/before-legacy-css.png), [resultado](evidence/customer-account-polish/local-review.json), [probe servidor DEV](evidence/customer-account-polish/server-css-probe.json).

Reprodução: `node tests/customer-visual-review.cjs --account-only --legacy-css`, dentro de crm, com a ferramenta temporária Playwright documentada no relatório anterior. O modo padrão do harness permanece disponível, mas neste ajuste não regrava imagens das telas já aprovadas.

## Estado

Implementação e revisão local de Minha Conta concluídas. Entrega Hosting DEV e novo aceite pontual ainda pendentes de registro. Solicitar somente Minha Conta em1920×889 e390×800 +Ctrl+R; não pedir novamente home/pedidos/detalhe/preview. Na homologação não salvar/editar/excluir dados reais, não enviar SMS nem fazer pedido/pagamento. PROD intacta.
