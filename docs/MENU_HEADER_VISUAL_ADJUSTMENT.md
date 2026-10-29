# Cardápios públicos — nome central do header (29/10/2026)

DEV exclusivamente: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main\infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, Firebase `crmdoceria-9959e`. PROD não autorizada. Percentuais mantidos: Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%.

## Origem e alteração

`bootstrapPublicStore` em `crm/public/store-public-config.mjs` criava um parágrafo com `config.channel.name || config.name` e o acrescentava ao header depois de resolver a loja. Essa era a origem da linha central redundante mostrada no relato. Foram removidas as duas linhas que criavam/inseriam esse elemento; não se trata de esconder o texto por CSS. O retorno da configuração e seus nomes/IDs permanecem intactos.

O template canônico `crm/public/cardapio.html` recebeu apenas classes e CSS de header: conta/carrinho alinhados à direita com gap12, remoção do padding vertical duplicado do container desktop e bloco de marca compacto no mobile. Arquivo/link do logo e texto Nosso Cardápio preservados; apenas dimensionamento/alinhamento responsivo do bloco da marca. Nenhuma regra por storeId ou nome de loja.

`scripts/sync-canonical-auth.cjs` já gera os três aliases Matriz/Garavelo/Festa a partir do mesmo template; foi executado, sem alteração do gerador. Os quatro HTML têm os mesmos bytes. Lojas futuras usando `/cardapio?store=...` recebem o mesmo comportamento. Nome da loja continua disponível em publicStoreConfig; não muda `?store=`, channel, catálogo ou seleção de loja.

## Limites

Sem alteração de scripts de carrinho, checkout, Customer Auth, Área do Cliente, produtos, frete, estoque, InfinitePay, SMS, WhatsApp, backend, Rules ou Hosting config. Carrinho e conta continuam com os mesmos IDs, handlers e destino. Última API permanece na correção de prefill465f0040; esta entrega será somente Hosting.

## Validação

-25 testes existentes PASS: storefront/loja futura/aliases, disponibilidade, entrada Customer pelo cardápio e cache real do Hosting. A expectativa anterior de nome no header foi atualizada para preservar o nome no config e não inseri-lo no DOM.
-12 revisões locais em Chrome isolado: genérico Matriz, genérico Garavelo, loja futura e aliases Matriz/Garavelo/Festa, em1920×889 e390×800. Sem linha central, overlap ou overflow horizontal; logo e Nosso Cardápio visíveis. Header74px desktop e72px mobile, sem row vazio.
-Navegação real da âncora Minha Conta para `/area-cliente` manteve storeId/carrinho fictícios; listeners reais de abrir/fechar carrinho extraídos sem mudança do template. Nenhuma ação de checkout executada.
-Capturas **LOCAIS** com dados fictícios: [desktop Matriz](evidence/menu-header/desktop-matriz.png), [desktop Garavelo](evidence/menu-header/desktop-garavelo.png), [mobile Matriz](evidence/menu-header/mobile-matriz.png), [mobile Garavelo](evidence/menu-header/mobile-garavelo.png), [relatório](evidence/menu-header/local-review.json). Fixture usa fonte de fallback e SVG de carrinho local; logo original e HTML/CSS do header reais. Font Awesome/Poppins publicados não foram trocados. Sem Firebase/Maps/rede externa nessa revisão.
-Lint PASS, zero erros/warnings de código. Build PASS, saída0, com quatro avisos preexistentes de sourcemaps native-audio e bases de compatibilidade desatualizadas. Bundles JS/CSS continuam main.b8798881.js/main.8e951c91.css; diff-check PASS. Nenhuma captura local é alegada como homologação autenticada/remota DEV.

## Entrega

Commit/push/Hosting DEV concluídos e hashes conferidos, conforme entrega abaixo. Aceite visual DEV específico **PENDENTE**: Matriz/Garavelo em desktop e390×800; ausência do nome central, logo/título/conta/carrinho/categorias preservados, conta/carrinho e `?store=` corretos. Não criar pedido, pagamento, SMS ou alterar dados reais. Não reabrir aceites de outras páginas.


### Entrega técnica —29/10/2026, header dos cardápios

Commit funcional **0f4154a7f3b90284697dc13ac15272eb664085b6**, push DEV concluído. Deploy somente Hosting crmdoceria-9959e, predeploy/workspace absolutos conferidos, release/Deploy complete/exit0.59/59 hashes remotos PASS,17 fontes de sourcemap e50 públicos conferidos.5 rotas públicas (genéricos Matriz/Garavelo e3 aliases) retornam HTML canônico correto e revalidável; duas leituras públicas de configuração DEV retornam os storeIds solicitados. Cache immutable dos bundles hashados preservado; JS/CSS principais inalterados. [Evidência](evidence/menu-header-delivery-dev-2026-10-29.json).

25 testes PASS,12 revisões locais PASS,4 capturas fictícias; comparação DOM confirmou7 scripts e todo markup fora do header intactos, aliases idênticos. Build/lint/diff PASS (build com avisos preexistentes). Sem Functions/Rules/backend/Auth/checkout/financeiro, dados ou mensagens alterados. **Aceite visual DEV específico PENDENTE** para Matriz/Garavelo, desktop/mobile390×800, conta/carrinho e preservação de loja. Demais gates/percentuais preservados: Fase9=75%, Fase11=100%, Fase12=100%, Global=95,00%, Fase13=0%. PROD intacta.
