# InfinitePay — continuidade Garavelo e preparação PROD

## 13/11/2026 — estado após consolidação local C16

[C16 atual](PHASE10_C16_CONSOLIDATION.md), [revisão/handoff](C16_ASTRA_REVIEW_HANDOFF.md). C15 integral e aceites complementares preservados. Candidato v2 congelado,164/164 unidades e34/34 públicos finais PASS;655React/147integrações consolidados.61/61HostingDEV e runtime do delta versus stage conferidos; não houve necessidade de deploy novo. Apenas teste de recompra e documentos alterados nesta continuação; sem commit/push. Astra Low documental executada, revisão completa ainda bloqueada antes da análise de fonte por Python3 indisponível/bloqueado; scan preservado para recuperação, sem parecer financeiro/de segurança fictício. **Fase9=100%;Fase10=93,75%(15/16);global97,00%;Fase13=0%;C16PENDENTE;PRODREADY:NÃO.**

GitHubPROD dois workflows disabled_manually, todas as cinco filas consultadas0, hooks0; CIlocal7/7PASS. Outros mecanismos externos/Firebase/CloudBuild NÃO VERIFICADOS, pois FirebasePROD não pode ser acessado. PRODlocal ainda tem13arquivosruntime deste delta a reconciliar, além do terminalAndroid/runtimefiscal/gates de configuração/rollback já identificados. Nenhuma publicação ou credencial PROD alterada. Garavelo taxa/credencial e Matriz básica permanecem como comprovadas anteriormente, sem nova consulta de Secrets nem links/pagamentos. Tags de recebimento confirmadas peloDono anteriormente, a validar operacionalmente na janela final.

## 13/11/2026 — C15 encerrado: primeiro vínculo Google e continuidade aprovados

**C15 PASS; Fase10=93,75% (15/16). C16 permanece PENDENTE. Fase9=100%; global ponderado=97,00%; Fase13=0%; PROD READY:NÃO.** Titular aprovou1endereço/2pedidos/detalhes,refresh,logout/relogin Google sem novoSMS/claim,retornoMatriz e ausência de menus administrativos. Leitura posterior confirmou16pós-condições técnicas, mesmo Customer/20documentos/2pedidos/1endereço,owner Google/mappings corretos e única auditoria, sem duplicidade. E-mail/senha já PASS preservado. [Aceite consolidado do caso](evidence/phase10-c15-google-20261113/acceptance.json).

A trilha preserva2solicitações SMS (10h04 expirada;11h38 solicitada/11h39 consumida). Titular confirmou a solicitação das11h38. O limite inicial era1; diferença registrada, sem autorização retroativa presumida e sem envio/claim por ferramenta. Não reenviar nem refazer vínculo: Customer agora proprietário. C16 não é fechado automaticamente; próximos gates são aceites complementares, consolidação/versionamento DEV e revisão aplicável. Sem novo runtime/build/deploy,commit/push ou acesso PROD para registrar o aceite. Estados anteriores abaixo são históricos.


## Confirmação adicional do Dono e estado atual

Contas de recebimento para a futura publicação: **Matriz ana_guimares; Garavelo antoniopedrocm**, iguais às respectivas DEV, conforme confirmação explícita. Esta decisão substitui a pendência de informar tags no texto histórico abaixo, sem autorizar acesso/configuração PROD ou cópia de chaves.

C15: próprio cadastro do Dono já vinculado ao Google;7candidatos de dados encontrados,2com2pedidos/1endereço cada. Seleção/titular/contaGoogle e autorização específica ainda pendentes. [Escopo](PHASE10_C15_SELECTION_SCOPE.md). Testes desta rodada:42unitários/82integrações/15eventos/19UI por ambiente,82backendCI e7guardPRODlocal. Lint do delta0/0, diff-checkPASS. Sem mudança de runtime, build ou deploy novo. Indicadores formais inalterados.


Conferência DEV em 12/11/2026, noite UTC−3 (13/11 UTC). Firebase PROD não acessado. Esta atualização preserva os aceites e substitui a pendência antiga de cadastrar novamente a chave Garavelo.

## Credenciais e aplicação financeira

| Unidade DEV | Situação comprovada | Comportamento |
|---|---|---|
| Garavelo | ACTIVE, InfiniteTag `antoniopedrocm`; Secret `infinitepay-checkout-a1cccade83b8102c97d1`, versão2 ENABLED; binding/loja/merchant/versão coincidentes; revisão registrada | STORE selecionado envia1; CUSTOMER habilitado envia0 nos novos links. Baseline1 mantém cliente responsável por2x+. |
| Matriz | InfiniteTag `ana_guimares`, InfinitePay habilitada, sem binding/Secret; configuração avançada indisponível | Link básico por handle, sem leitura de Secret, X-Api-Key ou options de taxas. Herda política da conta. Ausência de chave não bloqueia o checkout básico. |

A consulta validou oito pós-condições do Garavelo e somente metadados da versão: não leu o valor, não criou/substituiu Secret e não ativou novamente a credencial. As duas provas da operação ativa registram links deR$1,00 aceitos com1/0 e revisão explícita do titular. Os links já expiraram; não foram recriados nem usados para novo teste visual. Aceitação/revisão sem pagamento não prova liquidação ou taxa efetivamente descontada de uma venda. O responsável confirmou a configuração pelo portal nesta conversa.

Nenhum acréscimo local foi implementado. Pix, Combinar Pagamento, valores, frete/desconto, storeId, snapshots históricos, webhook e payment_check continuam com os contratos existentes. Uma credencial ativa indisponível/incompatível falha de forma controlada: não se abandona silenciosamente sua política financeira. Isso é distinto de uma loja nunca configurada com API Key, cujo caminho básico continua permitido.

As contas reais de recebimento de PROD precisam de confirmação própria. Não promover `antoniopedrocm` nem `ana_guimares` para PROD por inferência e não transferir chave/binding DEV. API Key em PROD é opcional para links básicos; somente as opções avançadas dependem dela.

Evidência: [backend somente leitura](evidence/infinitepay-garavelo-active-dev/backend-readonly.json). Leitura feita exclusivamente em `crmdoceria-9959e`; zero escrita/provider request/nova cobrança/estorno/SMS/claim.

## GitHub PROD e publicação automática

Repositório `antoniopedrocm/projeto-doceria-Multilojas` consultado em modo leitura pela CLI autenticada. O conector GitHub não expõe o endpoint necessário de estado dos workflows; leitura de arquivos foi possível pelo conector e o estado foi conferido pela CLI.

- Workflow274898027, Deploy to Firebase Hosting on merge: **disabled_manually**.
- Workflow274898028, Deploy to Firebase Hosting on PR: **disabled_manually**.
- Execuções queued/in_progress/waiting/pending/requested: **0 em cada consulta**.
- Webhooks do repositório: **0**. Nenhum deployment na listagem consultada.
- GitHub Actions continua habilitado no repositório; quem bloqueia essas publicações é o estado dos dois workflows. Não alegar que a plataforma Actions inteira foi desabilitada.
- Fontes remotas ainda contêm as ações antigas de deploy; não foram alteradas/pushadas. A desativação manual é evidência de estado atual, não substitui retirar o deploy dos arquivos.

Preparado somente no PROD local: os dois arquivos de workflow agora executam instalação de dependências, verificações de configuração/sincronização, testes backend/frontend e build, com `contents:read`. Foram retiradas a action Firebase, a referência à conta de serviço e permissões de escrita. Não há preview/live deploy, OIDC, token de publicação ou ação de autenticação Google nesses jobs. `scripts/check-ci-no-deploy.cjs` impede reintrodução dos mecanismos conhecidos e sete testes verificam rejeição de deploy/credencial/permissão/trigger privilegiado e preservação de testes.

O build CI usa o entrypoint CRA depois das verificações específicas, sem executar o guard local de caminho absoluto Windows. O guard de deploy PROD em `firebase.json` continua bloqueando Hosting/Functions/Rules/Storage. Nenhum guard foi removido; nenhum comando Firebase PROD foi executado para testar o bloqueio. O YAML foi validado e os comandos de testes locais passaram; **os novos workflows não foram executados no GitHub**, pois não houve push ou execução de teste remota.

Outros repositórios, apps instaladas e triggers Firebase/Cloud Build/Hosting PROD não foram inspecionados por exigirem escopo/acesso de produção não autorizado. Não é possível afirmar bloqueio universal de mecanismos externos a este repositório. Conferência desse inventário fica para a revisão final autorizada, antes de qualquer publicação.

Evidência: [GitHub somente leitura](evidence/infinitepay-garavelo-active-dev/github-prod-readonly.json).

## Fase9 e complementos contratuais

Fase9 permanece formalmente100%. G1/G2/G3 não estão ausentes no runtime atual: foram implementados, testados e publicados anteriormente, conforme INFINITEPAY_G123_LOCAL_FIXES.md e GUEST_CHECKOUT_DEV_RELEASE.md. Os registros antigos do plano que dizem “não implementados” são históricos.

Preservar: oito eventos nos novos links, aprovação independente por payment_check, expired/overdue informativos, estorno integral somente com FULL/atesto/execução externa compatível, parcial/desconhecido pendente, isolamento/recibos/auditoria/idempotência. Regressão financeira desta retomada usa somente emuladores/mocks; não é autorização de estorno nem nova homologação real. O aceite consolidado final deve incluir a proteção de escopo integral, sem registrar operação financeira real só para teste.

## Bloqueios restantes para produção

1. **C15-G:** primeiro vínculo real Google de Customer legado ainda sem proprietário. C15-E já PASS; login Google existente da Ana, endereços/pedido/refresh/relogin/dual-role já PASS. Não repetir esses checks, remover owner, inventar vínculo ou enviar SMS automaticamente. Seleção de caso/titular e aprovação específica continuam necessárias.
2. **C16:** consolidação e aceite formal de C01–C15 no pacote final. Matriz e evidências já preparadas; não contar preparação como100%.
3. Confirmar contas reais de recebimento por unidade e configurações operacionais PROD na janela autorizada. API Key não é pré-requisito para checkout básico.
4. Revisar/selar o delta final destinado ao PROD local, manter funcionalidades exclusivas e concluir o inventário de publicação externa. Redução dos papéis amplos antigos da conta compartilhada da API é risco registrado, separado do novo serviço restrito.
5. Backup/rollback e revisão de segurança/regressão do pacote final, preservando gates Nota Fiscal/SMS Enterprise temporário/Refresh/Admin Preview já aceitos. Não reabrir mutações reais sem evidência de regressão.
6. Autorização explícita da janela final: commit/push GitHub PROD e deploy Firebase PROD manual juntos, somente depois da revisão100%. Nenhum deles autorizado agora.

Mercado Pago: segundo provedor futuro, depois da publicação/homologação InfinitePay em PROD. Código por WhatsApp: backlog posterior a Mercado Pago. Pix-only visitante continua dependência externa, sem implementação alternativa ou bloqueio artificial da entrega do comportamento atual.

## Alterações e validações desta retomada

- DEV/PROD local: uma regressão em `functions/card-1x-fee-settings-emulator.test.js` comprova loja sem chave + outra loja com chave/merchant próprios, sem compartilhamento nem bloqueio indevido.
- Somente PROD local: dois workflows ajustados; novo guard CI e respectivos testes. Nenhuma mudança de runtime de pagamento, credencial ou configuração remota pelo agente.
- Testes atuais e limites estão em `evidence/infinitepay-garavelo-active-dev/validation.json`. Grupos sobrepostos não devem ser somados a baterias históricas. Builds anteriores do mesmo runtime continuam preservados; sem necessidade de reconstruir/publicar código inalterado.

**Indicadores: Fase9 100%; Fase10 87,50% (14/16); global formal97,00%; Fase13 0%. PROD READY: NÃO.** Sem incremento por documentação, teste sintético ou configuração opcional. Nenhum commit/push, Firebase PROD, pagamento/estorno/SMS/WhatsApp real nesta retomada.
