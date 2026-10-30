# URLs amigáveis dos cardápios — DEV

Projeto `crmdoceria-9959e`, branch `feature/infinitepay-customer-auth`, workspace `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. PROD não autorizada.

## Origem e mapping único

O módulo canônico `crm/src/storefront/storeRoutes.mjs`, sincronizado para `crm/public/store-links.mjs`, resolve os slugs antes da consulta de catálogo/configuração. Não altera IDs no Firestore.

| Rota | storeId canônico | channelId |
| --- | --- | --- |
| /cardapio-matriz | ana-guimaraes-doceria-matriz | — |
| /cardapio-garavelo | ana-guimaraes-doceria-garavelo | — |
| /cardapio-festa | ana-guimaraes-doceria-matriz | festas |
| /cardapio-apfood | apfood | — |

A auditoria GET da projeção pública DEV confirmou os quatro destinos ativos. Festas é um canal da Matriz, confirmado pelo alias existente e pela listagem pública; não é uma loja inventada. ApFood aparece na listagem e `public-config?storeId=apfood` retorna 200. Não existe documento de alias backend `cardapio-apfood`; o novo slug usa o mapping frontend e a mesma projeção pública por storeId, sem criar documentos ou mudar backend. [Evidência](evidence/friendly-menu-public-audit.json).

## Mesmo cardápio e compatibilidade

Todos usam `cardapio.html`. Os três arquivos de alias antigos permanecem cópias de compatibilidade geradas pelo sync existente, sem edição independente ou lógica por loja. ApFood não ganha cópia HTML: o Hosting encaminha `/cardapio-*` ao mesmo template. O fallback SPA `** → /index.html` continua depois desse rewrite. O diretório `/cardapio` e os aliases `.html` continuam compatíveis.

`/cardapio?store=...` continua resolvendo a mesma loja/canal. Após resposta pública válida, usa `history.replaceState` para a URL amigável, conservando o estado do histórico e sem reload, push, limpeza de carrinho ou mudança de Auth. A tag canonical aponta para o destino amigável no domínio atual, sem domínio de produção hardcoded. O JS faz a normalização; não foi introduzido redirecionamento HTTP permanente.

Home e diretório usam o helper compartilhado para os quatro destinos. Uma loja futura sem slug aprovado conserva o caminho genérico compatível; cadastrar um novo slug exige mapping explícito, não derivação de nome nem escolha por ordem de documentos. Canal ainda sem slug usa a rota amigável da loja com channel reconhecido, quando possível.

## Retorno e segurança

O retorno da Área do Cliente normaliza a origem antiga para amigável e guarda somente pathname/search público em sessionStorage por aba. Login, logout e refresh conservam a referência pública existente. Snapshot legado com storeId também gera URL amigável. Não depende de Customer/UID, não usa localStorage global nem dados privados na URL.

Slug desconhecido, conflito slug/store, IDs inválidos e parâmetros de identidade duplicados falham sem consultar configuração de outra loja. Slug inválido recebe o template com mensagem **Loja não encontrada**, sem fallback Matriz. É um estado de não encontrado na UI, não um HTTP 404 do Hosting. A projeção pública atual continua validando existência, canal, atividade e catálogo; slug nunca concede autorização ou leitura de configuração privada. ReturnTo continua com allowlist interna, sem URLs externas ou parâmetros de credenciais.

Carrinho, catálogo, preços, estoque, frete, Auth, checkout, provider, SMS/WhatsApp e Admin Preview não tiveram código de negócio alterado. A recompra já reutilizava storeMenuUrl e apenas passa a navegar pelo novo caminho, com os mesmos dados de carrinho.

## Verificação local

- 77 testes Node de rotas, bootstrap público, normalização, canonical, origem/login/logout, carrinho real/restauração/recompra e isolamento por loja/aba.
- 78 testes React de home, links, CustomerShell e ApplicationGate, incluindo retorno amigável, sessão e guardas.
- 51 regressões de grafo ESM, Auth canônico, controlador Customer, resolver público e middleware real do Hosting/cache. O teste do Hosting foi atualizado para fornecer o template reescrito e conferir os slugs novos/inválidos.
- Build PASS; bundle principal `main.add8e33e.js`, 440,19 kB gzip (aproximadamente +263 B). Avisos preexistentes de native-audio/source maps e metadados de navegadores. Após o build, o comentário de globals do módulo público foi sincronizado como asset estático, sem mudança de lógica.
- Lint sem erros; três avisos já existentes: dois do regex de controle da allowlist (fonte/cópia) e um da fixture de URL javascript rejeitada. Diff-check PASS.

### Débito de teste preexistente, fora da alteração de rotas

`functions/catalog-session.test.js` apresentou 21 falhas. A execução com os templates do commit anterior `78067024` reproduziu as mesmas 21 falhas; os templates atuais e anteriores têm conteúdo normalizado idêntico. A suíte ainda extrai um callback de uma linha que hoje é multilinha e seu mock Auth não implementa authStateReady, usado pelo bootstrap atual. Também espera restauração por resposta Customer anterior ao contrato atual. Não se alterou Auth/checkout para satisfazer esse harness antigo, nem se apagaram testes. Os testes atuais de carrinho/hydration e sessão listados acima passaram. O débito permanece explícito; não declarar a suíte inteira verde.

## Entrega e aceite

Commit, push, Hosting DEV e verificação remota: registrar no checkpoint após publicação. Abertura direta/refresh/URL antiga e estado inválido serão conferidos no DEV. Aceite humano autenticado Matriz/Garavelo → Minha Conta → Voltar continua pendente até resposta do usuário; testes simulados não equivalem a esse aceite. Não é necessário criar pedido, pagamento ou enviar SMS/WhatsApp.

Percentuais preservados: Fase 9 75%; Fases 11/12 100%; Global 95,00%; Fase 13 0%. Mercado Pago não implementado. Pendência fiscal anterior continua separada.
