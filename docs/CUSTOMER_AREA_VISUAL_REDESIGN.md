# Área do Cliente — redesign visual DEV

Ambiente exclusivo: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree` → `crmdoceria-9959e`, branch `feature/infinitepay-customer-auth`. Produção não autorizada. Percentuais formais permanecem Fase9=75%, Fase11/12=100%, Global=95,00%, Fase13=0%.

## Auditoria e referências reutilizadas

A auditoria anterior à alteração de CSS foi registrada na conversa e no código do CRM (`crm/src/App.js`, componentes Button/Input/Modal e shell/sidebar/topbar; `crm/src/index.css`; `crm/tailwind.config.js`). O CRM usa Tailwind sem tema estendido e Lucide React já instalado. Não foi adicionada biblioteca de UI, fonte ou tema paralelo.

| Elemento | Referência do CRM | Aplicação Customer |
| --- | --- | --- |
| Marca/fonte | `logotipo.png`, system font de index.css | Mesmo asset e herança tipográfica |
| Navegação | Sidebar w-64, topbar h-16, ícones Lucide w-5 | Sidebar256px, topbar64px, mesmos ícones/breakpoint md768px |
| Seleção | bg-pink-100/text-pink-700, hover pink-50 | Mesma paleta e estado aria-current; Pedidos ativo também no detalhe |
| Fundo/cards | gray-100, white, gray-200, rounded-xl/2xl, shadow-sm | Superfícies brancas, bordas neutras, escala8/12/16px, sombras discretas |
| Botões | Primário rosa; secundário branco/cinza; destrutivo vermelho | Mesma hierarquia, contraste do pink-600/700, ações de endereço em botões reais |
| Inputs | Gray-300, largura completa, rótulo e foco pink | Mesma linguagem, telefone readonly preservado, alvo mínimo44px |
| Badges | Status em fundos suaves verde/azul/âmbar/vermelho | Valores/enums existentes; somente apresentação muda |
| Espaçamento | p-4/p-6, gap-4/gap-6 | Escala16/24/32/40px e grade responsiva |

Button/Input do CRM são funções privadas do App.js de mais de21mil linhas; importá-lo no módulo público ESM traria o bootstrap administrativo. Não houve extração ampla ou acoplamento ao CRM. Foram reutilizados seu vocabulário visual, os ícones instalados, CustomerFrame/CustomerHome existentes e o renderer público de pedidos já compartilhado. O CSS de apresentação é único para Customer Self e Admin Preview; não duplica um segundo conjunto de componentes por contexto.

## Telas

- **Página Inicial:** saudação, três atalhos para pedidos/conta/cardápio e nota de boas-vindas. Não consulta nova API para um pedido recente: o contrato inicial não fornece esse dado. No preview, a ação de compra/cardápio é omitida.
- **Minha Conta:** header e módulos Perfil/Endereços/Segurança/Formas de Pagamento. Layout usa toda a área disponível, com duas colunas no desktop e uma no mobile/tablet estreito. Mensagem redundante de saudação removida apenas da página embutida; feedback de erro/sucesso permanece.
- **Endereços:** apelido em destaque, badge Padrão, endereço em linhas e botões de editar/excluir/padrão. Leitura usa nickname/nomeEndereco existentes e fallback apenas sem apelido. Dados dinâmicos continuam em textContent/React, sem HTML do cliente.
- **Pedidos:** cards responsivos com pedido/data/loja/valor, badges de pedido e pagamento e ações existentes. Vazio tem mensagem/CTA, somente Customer; erros mantêm tentativa pelo botão de atualização. Loading usa indicador discreto e aria-busy.
- **Detalhe:** resumo, itens históricos com quantidade/unitário/subtotal, entrega/retirada, pagamento e totais destacados. Recompra e comprovante mantêm seus contratos; URLs de comprovante continuam restritas a HTTPS sem credenciais. O título com ID é limpo ao invalidar a sessão.
- **Topbar/sidebar:** mesma marca do CRM, avatar/iniciais/nome, dropdown, navegação destacada, Sair ao final. Dual-role recebe CRM exclusivamente pelo canOpenStaff atual. Drawer no mobile; desktop mantém sidebar.
- **Scroll:** a página usa o documento. O max-height/overflow do antigo dialog não é aplicado a section embutida. Diálogos reais mantêm seus limites. Sidebar/dropdown podem rolar por necessidade de navegação.

## Fronteiras preservadas

Sem alteração de API, canonicalização, aliases, phone index, Auth DEFAULT/persistência, capabilities/ownership, Firestore Rules, grants/SMS/OTP, checkout, pagamento, InfinitePay, webhook, payment_check ou recompra de negócio. Nenhum pedido, SMS, pagamento ou WhatsApp real executado.

O controlador installCustomerAccount continua responsável por acesso e mutações; os handlers/callables/payloads permanecem. A opção UI onMenu apenas liga o empty state ao destino já derivado do storeId pelo CustomerShell. Nenhuma chamada financeira ou SMS é introduzida pelo redesign.

O preview conserva provider administrativo separado, UID do Staff, capability, leases e eventos STARTED/ORDER_VIEWED/ENDED. Faixa administrativa sticky permanece visível acima da topbar; ações de edição ficam desabilitadas, sem dispatch, e compra/recompra/checkout não são disponibilizados.

Rotas `/area-cliente`, `/minha-conta`, `/meus-pedidos` e detalhe mantidas. Refresh conserva a URL e passa pelo mesmo gate. A tarefa anterior de refresh das seções Staff continua com seu aceite próprio; este redesign não a homologa implicitamente.

## Acessibilidade

Labels reais, telefone readonly, aria-current/expanded/controls, ícones decorativos aria-hidden, skip link, headings, mensagens status/alert, alvos44px, foco visível nos controles, reduced-motion. Drawer fecha por Escape/backdrop/navegação, restaura foco e contém o ciclo Tab entre toggle/itens; dropdown fecha por Escape/clique externo. Headings focados programaticamente continuam anunciáveis sem a borda preta padrão. Não altera overflow do body nem persistência Auth.

## Verificação local e evidências

O Computer Use falhou ao inicializar com `failed to write kernel assets ... (os error 3)`, inclusive após reset/repetição. Não houve controle da sessão autenticada do navegador. As evidências abaixo são **LOCAL**, Chrome headless isolado, componentes/controladores reais e fixtures fictícias. Não são prints autenticados do DEV e não constituem aceite remoto.

O harness `crm/tests/customer-visual-review.cjs` bloqueia requisições fora do servidor loopback e usa runtime de teste sem inicializar Firebase/credenciais. Playwright é ferramenta temporária fora do repositório; não entra no package.json, lockfile ou bundle. Usa o Chrome já instalado, sem perfil pessoal. Para reproduzir: instalar playwright1.56.1 em `%TEMP%\doceria-customer-visual-tools` e executar `node tests/customer-visual-review.cjs` dentro de crm. Fixtures não entram na build de produção.

- 32 combinações:4 telas ×320/375/390/430/768/1024/1366/1920px; sem overflow horizontal e sem scroll interno principal. Refresh de quatro rotas em390px; Customer-only sem CRM, dual-role com ação própria, preview com faixa/sem inputs de escrita. Zero erros JS e zero requests externos no resultado final.
- 11 capturas:4 telas em1920×889 e390×800 (captura full-page pode ter altura maior que viewport), drawer390×800 e preview nas duas larguras. Revisão visual das imagens feita antes do commit; dados são somente demonstração. Resultado reproduzível: [local-review.json](evidence/customer-area-redesign/local-review.json).

| Tela | Desktop local | Mobile local |
| --- | --- | --- |
| Inicial | [Imagem](evidence/customer-area-redesign/desktop-home.png) | [Imagem](evidence/customer-area-redesign/mobile-home.png) |
| Minha Conta | [Imagem](evidence/customer-area-redesign/desktop-account.png) | [Imagem](evidence/customer-area-redesign/mobile-account.png) |
| Pedidos | [Imagem](evidence/customer-area-redesign/desktop-orders.png) | [Imagem](evidence/customer-area-redesign/mobile-orders.png) |
| Detalhe | [Imagem](evidence/customer-area-redesign/desktop-detail.png) | [Imagem](evidence/customer-area-redesign/mobile-detail.png) |
| Admin Preview | [Imagem](evidence/customer-area-redesign/desktop-admin-preview.png) | [Imagem](evidence/customer-area-redesign/mobile-admin-preview.png) |

[Drawer mobile](evidence/customer-area-redesign/mobile-drawer.png).

## Qualidade e entrega

- 122 testes React em10 suítes PASS (CustomerShell/AdminPreview/ApplicationGate/capabilities/navegação Staff/diretório/selector/HTTP/performance).
- 70 testes de controladores públicos PASS (conta, endereços, entrada, ownership por sessão, detalhe, clear privado e recompra).
- 22 testes Auth/cache/FCM/cross-tab e52 de backend perfil/pedidos/preview/recompra PASS.
- Build PASS com quatro avisos conhecidos de sourcemap native-audio e Browserslist antigo. Main9031dc04.js437,70kB gzip: cerca de+1,61kB frente a436,09kB; CSS12,63kB, cerca de+984bytes. Sem dependência runtime nova.
- Lint dos arquivos React alterados PASS, sem erros/avisos de código. Diff-check PASS; entrega Hosting será registrada no checkpoint após conferência.

**Estado atual:** implementação/testes/revisão local/publicação Hosting DEV concluídos. Homologação manual autenticada **PENDENTE**, solicitada ao usuário. Não declarar aceitação visual DEV com base nas fixtures locais. Sem alteração dos percentuais formais.

### Complemento de entrega: CSS público estável

A auditoria do artefato encontrou `customer-area.css` fora do matcher explícito de revalidação (que cobria HTML/JS/MJS/JSON). Foi incluída apenas a extensão CSS de arquivos na raiz na mesma política no-cache/must-revalidate, evitando stylesheet antigo após reload. Assets hashados de static/css permanecem immutable, sem sobreposição de matchers. Teste no middleware real do Hosting confere status200, MIME text/css, corpo CSS e cache; não aceita fallback SPA como stylesheet. Nenhuma alteração de Service Worker, Auth ou API. O frontend compilado não muda por esse ajuste de configuração Hosting.

## Entrega DEV verificada —27/10/2026

- UI: commit **7a57344ba52d16b787b31495202ac2d63ad0d041**; complemento Hosting/cache: **d9085e36a66b823bb909506b939dc8a86ea6d8d8**. Ambos enviados à branch DEV.
- Deploy somente Hosting, projeto explícito crmdoceria-9959e e staging `.deploy-crm-store-baseline-d9085e36`; predeploy confirmou caminho/ambiente, upload/release concluídos, exit0. Nenhuma Function/Rule/índice/Cloud Auth publicada. API continua a23912fc.
- **59/59 hashes remotos PASS**,14 fontes de sourcemap e50 arquivos públicos correspondentes à fonte aprovada. Nenhuma fixture no bundle/artefato. Main9031dc04.js SHA256 `c965a51a8e3fda8cc0ba0b1e8daa8bd1aa1492dbba959a7424232a56e659f74a`; CSSmain.bdc1ecea SHA256 `76b164011025b8eac52482abad62c66824c15aed14029ddf79aac27f43c6b381`.
- Cache remoto PASS: mainJS/CSS hashados immutable; HTML, módulos públicos, worker e customer-area.css revalidáveis. Evidência: [entrega remota](evidence/customer-area-redesign-delivery-dev-2026-10-27.json). Diff-check PASS; fontes/proteções e percentuais preservados.
- Solicitado aceite autenticado em1920×889 e390×800 para4 telas, refresh e readonly/dual-role, sem alteração de dados nem SMS/recompra/pedido/pagamento. Esse aceite continua pendente; não é inferido dos hashes ou das capturas LOCAL.
