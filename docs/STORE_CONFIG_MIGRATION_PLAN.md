# Multiloja dinâmica V1 — migração controlada DEV

Estado em 2026-10-15: V1 `d9a1abe2` publicada exclusivamente no DEV, com migração mínima executada e homologação PARCIAL pelo defeito de restauração de carrinho descrito ao final. Workspace DEV `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`; projeto permitido `crmdoceria-9959e`. Produção não participa deste procedimento.

## Contrato por loja

- `lojas/{storeId}`: `nome`, `ativo: true`, `status: ACTIVE`, `storeConfigVersion: 1` após aprovação da configuração. `createStore` inicia com `ativo: false`, `status: DRAFT`, versão 1.
- `lojas/{storeId}/configuracoes/storefront`: `schemaVersion: 1`, `catalog: {enabled, category}`, `pickup: {enabled}`, `delivery: {enabled}`, `onlinePayment: {enabled}`. Nenhuma capacidade é habilitada por `createStore`.
- `lojas/{storeId}/configuracoes/config`: `timezone`, `schedule` por dia (`sun`…`sat`, `enabled`, `open`, `close`) e `manualOverride.mode`. V1 exige agenda/timezone válidos mesmo quando há override. Override não é prova de agenda definitiva homologada.
- Frete próprio no campo `frete` da configuração canônica: coordenadas válidas, `valorPorKm`, `valorMinimoFrete` explícito e `freteACombinar`. O modo a combinar não depende de mínimo calculado. V1 não herda R$2 do código.
- `lojas/{storeId}/produtos/{productId}`: catálogo/preços/estoque próprios, flags de produto ativo e categoria selecionada no contrato público. Não copiar preços/estoques de outra loja.
- `lojas/{storeId}/configuracoesInternas/infinitepay`: configuração própria habilitada e válida somente quando pagamento online desejado. Manter documento privado; sem herança de handle, URLs ou credenciais.
- Profiles compartilhados não foram implementados nesta V1; referências futuras precisarão de validação explícita. Não são fallback automático.

## Projeção pública e navegação

`GET /api/store/public-config?storeId={storeId}` retorna apenas `storeId`, `name`, `active`, `catalog`, `schedule`, `pickup`, `delivery`, `onlinePayment`, `readiness` e canal sanitizado quando solicitado. Não retorna autor, auditoria, handle, URLs financeiras, coordenadas/tarifas administrativas, secrets ou configuração bruta.

`GET /api/store/public-list?cursor={storeId}` descobre lojas ativas e canais publicados. Página física de 20 lojas; cursor permite avançar mesmo quando uma página contém somente drafts/inativas. Canais por loja limitados a 20 na descoberta V1; URL direta continua disponível para canal configurado. Catálogo vazio pode ser apresentado como vazio; readiness de catálogo representa sua configuração, não garantia de estoque vendável.

Entrada única `/cardapio?store={storeId}`, com `&channel={channelId}` opcional. `/cardapio` apresenta escolha de loja por dados. Rotas históricas são cópias geradas do MESMO `cardapio.html` pelo prebuild; não são fontes comerciais independentes. Novas lojas não precisam de HTML ou edição de lista.

Aliases históricos são documentos administrativos (nenhuma Rule pública nova):

| Documento | Dados explícitos |
|---|---|
| `storefrontAliases/cardapio-matriz` | `enabled: true`, `storeId: ana-guimaraes-doceria-matriz` |
| `storefrontAliases/cardapio-garavelo` | `enabled: true`, `storeId: ana-guimaraes-doceria-garavelo` |
| `storefrontAliases/cardapio-festa` | `enabled: true`, `storeId: ana-guimaraes-doceria-matriz`, `channelId: festas` |

Festas é canal explícito: `lojas/ana-guimaraes-doceria-matriz/canais/festas` com `storeId` igual à loja proprietária, `enabled: true`, `listed: true`, `name: Festas`, `catalogCategory` conforme catálogo atual. Os HTMLs anteriores filtravam `Delivery`; conservar esse filtro na primeira migração, sem inventar catálogo independente. Canal inexistente/inativo ou com vínculo divergente é negado. `parentStoreId` não é usado para herdar todos os domínios.

## Dados atuais e ações pendentes

| Loja/canal | Migração necessária antes de ativar V1 |
|---|---|
| Matriz | Conferir dados atuais, manter tarifa/mínimo legítimos já configurados; se mínimo ausente, obter confirmação operacional explícita antes de gravar. Não preencher automaticamente com R$2. Definir flags de catálogo/retirada/entrega/pagamento, categoria e ativação; preservar configuração InfinitePay própria e agenda/override autorizados. |
| Garavelo | Configuração de frete calculado ausente/incompleta no diagnóstico. Declarar entrega desabilitada até cadastro legítimo; preservar catálogo, retirada e pagamento próprios quando aprovados. Não copiar coordenadas/tarifas da Matriz nem liberar `info/dados`. Homologar agenda definitiva separadamente. |
| Festas | Criar somente alias/canal explícitos associados à Matriz, sem loja nova e sem alterar pedidos históricos. |

Compatibilidade temporária: loja antiga sem marcador V1 e sem documento storefront continua usando seus próprios documentos legados, categoria Delivery e retirada existentes. Frete legado continua consultando somente a própria loja; mínimo legado R$2 permanece apenas nesse modo. Nenhuma migração ocorre em uma leitura. Novas lojas criadas pela API já são V1/DRAFT e não entram nesse modo por configuração incompleta. Não remover o marcador V1 para contornar validação.

## Procedimento de publicação controlada

1. Revisar diff, testes e inventário de dados atuais, com backup/snapshot sanitizado das configurações relevantes.
2. Com autorização específica de escrita DEV, cadastrar aliases e canal acima por Admin SDK/fluxo administrativo confiável. Não cadastrar fixtures de teste remotamente. Não mudar ownership ou permissões de contas.
3. Autorizar separadamente a publicação backend necessária (`api`, `createStore` e callable de recompra afetada), seguida do Hosting DEV. **Não publicar apenas o Hosting novo contra a API antiga.** Não publicar indiscriminadamente todos os triggers/Rules. Validar endpoints e aliases antes de trocar frontend.
4. Publicar as definições V1 de cada loja somente após conferência dos dados legítimos e prontidão por domínio. Configuração incompleta não deve derrubar catálogo/retirada quando esses domínios estão válidos.
5. Homologar visitante/legacy/Customer, URLs antigas e genérica, agenda, retirada e entrega disponível/indisponível. Sem pagamento novo por implicação desta migração. Revalidar autoritativamente frete/estoque/preço no servidor.
6. Rollback: conservar snapshot dos dados e artefatos anteriores; reverter versões coordenadamente. Não apagar pagamentos/pedidos/recibos e não desmarcar V1 silenciosamente para liberar venda.

## Segurança e limites

Rules e autorização Staff/Customer não mudaram. A projeção usa Admin SDK com seleção explícita dos campos retornados. Ela não revoga permissões públicas preexistentes dos documentos legados `configuracoes`; não guardar dados privados nesses documentos. Redução dessas permissões é uma migração de segurança separada.

Readiness é reavaliada por requisição e no backend antes de novas vendas/cotações; preço, estoque, frete e pagamento continuam autoritativos no backend. O mínimo V1 também é validado na transação do pedido. Webhook/reconciliação/consulta de pagamentos existentes não passam pelo novo bloqueio de novas vendas.

As fixtures persistentes de teste estão em `functions/fixtures/stores-v1.cjs`, consumidas pelo emulador `demo-doceria-checkout`; não existe script automático de seed remoto ou hook de deploy. Aprovações visuais oficiais e fechamento do cenário de carrinho permanecem pendentes. Marco 4 PARCIAL; Fase 12 75%; global 92,00%.

## Execução autorizada DEV — 2026-10-15

- Ordem executada: precheck remoto somente leitura → Functions seletivas → migração mínima → smoke API → Hosting → homologação. Commit funcional publicado `d9a1abe2`. Nenhum deploy de Rules, índices, Storage ou produção.
- Functions Gen2/Node22 em `us-central1`: `api` (projeção/readiness e novas vendas/cotações), `createStore` (novas lojas DRAFT sem capacidades herdadas), `customerReorderPreview` (readiness/catálogo atual na recompra). Comparação estrutural dos labels/hashes antes/depois confirmou somente essas três alteradas, dentre 132 Functions existentes. Nenhum webhook/worker foi publicado.
- Pacote backend gerado somente com arquivos tracked do commit em staging DEV local, excluindo `functions.yaml` temporário de emulador, testes/fixtures e node_modules do upload. Temporários originais preservados. Hosting utilizou `crm/build`, 52 arquivos, sem temporários.
- Criados seis documentos: `lojas/{Matriz}/configuracoes/storefront`, `lojas/{Garavelo}/configuracoes/storefront`, `storefrontAliases/cardapio-matriz`, `storefrontAliases/cardapio-garavelo`, `storefrontAliases/cardapio-festa` e `lojas/{Matriz}/canais/festas`. Os identificadores completos das lojas são os da tabela de aliases acima.
- Atualizadas somente as duas raízes Matriz/Garavelo, adicionando `storeConfigVersion: 1`, `ativo: true`, `status: ACTIVE`. Storefronts: schemaVersion 1, catálogo Delivery, retirada e pagamento online habilitados; entrega Matriz true/Garavelo false. Canal Festas: vínculo Matriz explícito, enabled/listed true, categoria Delivery, nome Festas. Commit Firestore atômico em `2026-10-15T19:48:19.282940Z` (16:48:19 de Brasília), com precondições de inexistência/updateTime e verificação dos documentos de agenda/pagamento; snapshot sanitizado local fora do Git.
- Não alterados nome das lojas, agenda, timezone, override force_open vigente, produtos, estoque, cupons, frete, InfinitePay, pedidos ou dados financeiros. Mínimo Matriz já era explicitamente R$4,00 em sua própria configuração; não foi inferido nem gravado R$2,00. Garavelo continuou sem frete; nenhum endereço, coordenada, tarifa ou mínimo foi inventado ou copiado.
- API remota PASS: public-config Matriz com seis domínios READY; Garavelo com store/catalog/schedule/pickup/payment READY e delivery BLOCKED. Projeção de agenda mantém todos os dias atualmente desabilitados com override force_open preexistente; isso não homologa uma agenda operacional definitiva. Payment readiness por documento próprio, sem divulgar handle. Alias Festas resolve Matriz/canal festas; public-list retorna somente allowlist pública. Config de loja inexistente retorna 404/STORE_NOT_FOUND. Tentativa vazia de cotação Garavelo retorna 409/DELIVERY_UNAVAILABLE antes de Maps; sem permission-denied ou fallback. Não foi feita nova cotação Matriz com endereço nem compra.
- Public-list também anuncia ApFood legado: raiz sem flags explícitas, nenhum marcador V1 e agenda ausente; contrato de compatibilidade interpreta store/catalog/pickup READY, schedule/delivery/payment BLOCKED. Nova venda continua bloqueada. Nenhum dado ApFood foi alterado; decidir sua publicação ou DRAFT por configuração autorizada em tarefa separada. Nomes públicos Matriz/Garavelo são iguais nos dados atuais, preservados nesta migração.
- Hash remoto igual ao build: `main.ae1316a6.js` SHA256 `e0599abc90d1bac08eaa3f35b0595494563318b355cbe1663d9ba9a95e0e6e28`; HTML genérico/três aliases SHA256 `c00b6e05f71dda402105a864f566bc0a6b50ce2d6334fba84c8d041e59f1b9a6`. Índice, bootstrap, worker e helpers também conferidos. HTML/rotas/JS estável/worker revalidáveis; bundle hashado immutable. Chrome recebeu bundle novo com reload normal, sem limpeza de cache/hard reload.
- UI remota PASS: Matriz/Garavelo via alias e rota genérica, catálogo/filtro atual; Garavelo mostra entrega indisponível/retirada disponível; Festas identifica o canal e mantém Delivery; home usa public-list; loja inexistente mostra Loja não encontrada, sem fallback. Nenhum erro ESM ou JS bloqueante da aplicação nas leituras; um erro da extensão Chrome foi separado do código da aplicação.
- Customer Google A: Staff → Customer → Staff sem novo login passou; lista própria preservou pedidos pagos Matriz/Garavelo e expirados, status Confirmado/Pago separados. Detalhe Garavelo `23ebede2…49b1b03d` mostrou item Pastelzinho Ninho com Nutella, subtotal/total R$9,90 e frete zero. Reorder preview remoto resolveu produto atual Garavelo `csAPcI8ttDi7xcHojbAD`, R$9,90, estoque 9 (consulta somente leitura); Matriz Achadinho R$12/estoque25. Sem whitelist ou fallback de loja observado.
- **MÉDIO funcional — carrinho/restauração, cenário não aprovado:** na mesma aba, um Achadinho Matriz foi adicionado somente ao carrinho; Meus Pedidos → recomprar Garavelo detectou loja diferente e ofereceu Substituir e continuar/Cancelar. Após Cancelar → Voltar ao Cardápio, voltou à rota genérica Matriz, porém carrinho ficou vazio. Leitura do código aponta `onSession` persistindo cart inicial vazio antes de `customerAccount.ready`; restauração diferida compara snapshot alterado e não restaura. Trechos já existiam no pai do commit; a cronologia remota dos callbacks não foi instrumentada nesta execução, portanto não atribuir causalidade exclusiva ao delta V1. Cancelamento não escreve carrinho em customer-reorder-view; falha está no retorno/bootstrap. Não foi realizada substituição final Garavelo nem declarada recompra completa PASS. Correção mínima proposta separadamente: coordenar restauração com publicação inicial de sessão, sem persistir vazio antes de restaurar snapshot validado por UID. Não remover ownership/guards.
- Sem correção de código durante homologação. Sem novo pedido, reserva, checkout, cobrança, pagamento ou WhatsApp. Flags WhatsApp Matriz disabled/automatic false e Garavelo sem configuração; não foi disparado fluxo gerador de jobs. Loja futura/inativa reutilizam testes emulados; nenhuma fixture remota criada. V1 publicada, homologação PARCIAL pelo carrinho; Marco4 PARCIAL, Fase12 75%, global92,00%.
