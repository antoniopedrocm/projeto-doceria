# Gerenciamento de lojas — exclusivo Dono

DEV `crmdoceria-9959e`, branch `feature/infinitepay-customer-auth`. PROD não autorizada. Implementação complementar pré-PROD, sem mudança dos percentuais formais.

## Autorização

`manage_stores` exige o papel **original** `dono`/`owner`, Staff ativo e ausência de revogação explícita no perfil/custom profile. O alias histórico que normaliza Admin como Dono não concede esta capability. Admin, Gerente, Atendente, Contador e Customer não podem executar mutações, mesmo enviando `manage_stores=true`. Callables retornam `permission-denied`/HTTP 403; anônimo recebe 401. O escopo de lojas do Staff continua obrigatório. Dono sem escopo restrito tem acesso global.

`storeManagementRead` fornece diretório paginado e detalhe mínimo/readiness sob demanda. `storeManagementWrite` executa UPDATE, DEACTIVATE, REACTIVATE e DELETE; `createStore` permanece compatível e delega CREATE ao mesmo serviço. A autorização é server-side em todos os caminhos. Os endpoints Staff impedem Admin de conceder Dono, modificar/excluir uma conta Dono ou redefinir sua senha como caminho indireto de escalada. Criar Admin preserva o papel Admin no documento.

A disponibilidade de entrega/retirada é agora mutação estrutural exclusiva Dono: `staffSaveFulfillment` usa a mesma política. Staff autorizado continua podendo consultar a configuração; a UI informa a restrição. As configurações de tarifa, agenda, credenciais e dados fiscais permanecem em suas seções próprias.

## Interface e dados

Gerenciar lojas reutiliza Modal, Button, Input, cores e espaçamentos do CRM. Dono recebe Nova Loja e menu de ações por card; outros Staff recebem somente seleção das lojas autorizadas. Visão Geral é agregação virtual, sem ações estruturais. Cards distinguem nome público, ID técnico e status ATIVA/INATIVA/RASCUNHO. Nome cadastrado tem prioridade sobre ID; unidades conhecidas podem receber o complemento de apresentação do mapping público existente, sem alteração de dados.

Campos editáveis: nome, nome público, slug, telefone/endereço básicos de exibição e opções de publicação do catálogo/pagamento já configurado. Telefone/endereço reutilizam `info/dados`; objetos/números legados são preservados e não convertidos silenciosamente. Frete/origem Maps e cadastro fiscal não são reescritos por essa edição. ID técnico não é campo editável. Nenhum secret é retornado ou auditado; projeções usam allowlist de campos.

## Criação e readiness

Nova loja recebe ID técnico gerado no servidor e nasce DRAFT/inativa, catálogo/retirada/entrega/pagamento online desabilitados, agenda fechada e documentos básicos mínimos. Não recebe cópia da Matriz. Um Dono com escopo restrito recebe acesso à loja criada.

Checklist: cadastro básico, publicação/categoria do catálogo, agenda válida, ao menos uma modalidade de atendimento, frete válido se entrega habilitada, configuração de pagamento válida se online solicitado e slug válido/disponível. “READY” indica validação técnica da configuração; não substitui homologação operacional de catálogo, frete ou pagamento. Editar uma loja ativa também não pode introduzir configuração incompleta. Os contratos públicos de readiness e checkout continuam sendo autoridade em tempo de execução.

Reativar exige confirmação explícita e checklist obrigatório válido. Ativar não ignora frete, agenda ou configuração do provider. Garavelo não recebe frete da Matriz e sua entrega não é habilitada automaticamente.

## Inativação e histórico

Confirmação: “Esta loja deixará de receber novos pedidos e não aparecerá como opção pública. O histórico será preservado.” A alteração grava `status=INACTIVE`, `ativo=false`. Diretório público e cardápio respeitam o estado; backend rejeita novas vendas/checkout e novos pagamentos. Entrega/retirada deixam de estar efetivamente disponíveis. Configuração não é apagada.

Pedidos antigos continuam disponíveis no CRM, inclusive edição administrativa conforme suas regras; financeiro, fiscal, estoque e auditoria históricos não são modificados. Nenhum cancelamento, estorno ou emissão automática. Reativar restaura somente a disponibilidade estrutural permitida pelo readiness.

## Exclusão conservadora

Somente rascunho criado pelo novo gerenciamento, nunca ativado/publicado, pode ser candidato. Exige confirmação explícita, nome legal exato digitado, revisão atual e precheck no backend. Loja com histórico, alias ou dependência é preservada e a UI orienta usar Inativar. Lojas legadas/canais não são candidatos.

Precheck examina subcoleções próprias, descendentes, referências comuns nas coleções raiz e configurações de outras lojas. Inventário limitado: até 100 coleções/lojas; consultas selecionam somente campos de referência. Limite atingido, índice ausente ou falha de consulta bloqueiam a exclusão. Um lock temporário impede as mutações normais do CRM durante a verificação; a transação final confere revisão/updateTime. Não existe `recursiveDelete`: somente documentos bootstrap conhecidos são apagados. Tombstone reserva o ID e a auditoria global permanece.

Essa verificação cobre os modelos/referências auditados, não garante integridade frente a scripts privilegiados arbitrários que escrevam via Admin SDK fora dos contratos. Novos modelos de dependência devem ser incorporados ao precheck antes de ampliar a exclusão.

## Slugs, canais e compatibilidade

`storefrontAliases` continua sendo o registro canônico público. Slug novo de loja ativa é registrado atomicamente; slugs antigos publicados permanecem aliases da mesma loja e a URL canônica usa o slug atual. Colisão com outra loja/canal é rejeitada. Proposta de slug em DRAFT só é publicada após ativação, com nova validação de disponibilidade.

Frontend aceita a família validada `/cardapio-*`, mas só carrega loja após resolução pública no backend; slug desconhecido não escolhe Matriz. `storeId`, carrinho e checkout continuam os mesmos. Return path Customer preserva origem amigável e bloqueia URLs externas. Links `?store=` antigos continuam compatíveis.

Inventário DEV: Matriz/Garavelo são lojas V1; ApFood é legado, sem autorização automática para mutação estrutural; Festas é canal da Matriz; 99Food é integração, não convertido em loja física. Visão Geral nunca é documento de loja.

## Auditoria e Rules

Eventos globais privados append-only em `storeManagementAudit/{requestId}`: STORE_CREATED, STORE_UPDATED, STORE_DEACTIVATED, STORE_REACTIVATED, STORE_DELETE_ATTEMPTED, STORE_DELETED. Contêm storeId, actorUid, actorRole OWNER, createdAt serverTimestamp, before/after estruturais e diferenças básicas/de publicação permitidas. RequestId/fingerprint preservam idempotência. Não há edição/exclusão normal de evento.

Rules negam escrita direta em raiz/aliases/audit/tombstones, protegem identidade de exibição em `info/dados`, bloqueiam escritores normais sob deletionLock e criação direta de pedido em loja inativa. Escritas históricas autorizadas permanecem. Não foi ampliado acesso público nem alterada a autorização Customer.

## Validação

Emuladores Auth/Firestore com projeto demo, sem mutações no DEV real: ciclo completo, papéis, capability forjada/revogada, escopo, histórico, aliases, readiness, dependências, hard delete, tombstones, auditoria, escalada de contas Staff, Rules e disponibilidade. Regressões cobrem pagamento, edição histórica e contrato fiscal existente. Testes React usam handlers reais com callables fictícios; Node cobre resolução pública e nomes.

Capturas de componentes reais com respostas fictícias: desktop 1920×889 e mobile 390×800, incluindo lista/menu/edição/confirmações/Staff sem gestão. Não representam sessão Staff autenticada. [Relatório visual local](evidence/store-management/local-report.json). Evidências e situação de publicação/aceite no [checkpoint](CHECKPOINT_STORE_MANAGEMENT.md).

Nenhuma mutação de Matriz/Garavelo, pedido, pagamento, nota, SMS ou WhatsApp real. InfinitePay/Mercado Pago não são alterados. Fase9=75%, Fase11/12=100%, Global=95,00%, Fase13=0% preservados.


### 2026-10-31 — Gerenciamento exclusivo Dono publicado no DEV

Commit funcional **c3a7bb63cb9210ccd87b383382d7f3fbcadc6612**, push na branch feature/infinitepay-customer-auth e publicação seletiva DEV concluídos: dez exports ACTIVE, 52 arquivos de runtime por fonte, envs/secrets preservados, 132 Functions não relacionadas inalteradas e Rules correspondentes à fonte testada. Callables anônimos rejeitados com 401, sem escrita. Hosting 61/61 hashes, 28 fontes de sourcemap, 52 fontes públicas e cache PASS. Chrome público Matriz/Garavelo direto/refresh, desktop/mobile, sem overflow/pageerror nem requisição de mutação PASS. **Entrega técnica concluída; aceite visual autenticado Dono PENDENTE.** Capturas da gestão são fixtures locais, não sessão Staff DEV. Mutações destrutivas somente em emuladores. [Contrato](STORE_MANAGEMENT.md), [checkpoint](CHECKPOINT_STORE_MANAGEMENT.md).

Inventário real de lojas preservado. Garavelo já teve entrega habilitada por CRM_FREIGHT_SETTINGS em 31/10/2026 16:36 (UTC−3), antes do inventário deste workstream às 17:05; não foi ação desta implementação. A disponibilidade atual das duas lojas permanece intacta. Nenhum pedido/pagamento/nota/SMS/WhatsApp real; PROD intacta. Fase9=75%, Fase11/12=100%, Global=95,00%, Fase13=0% preservados. Mercado Pago futuro; aceite fiscal anterior separado.


### 2026-10-31 — Aceite anterior não aprovado; separação da navegação e correção autorizada de papel

O usuário NÃO aprovou o aceite anterior. Implementada aba **Configurações → Gerenciar Lojas**, exclusiva manage_stores, com + Nova Loja e painel completo reutilizando o mesmo serviço/componente. Seletor superior e modal **Ver lojas** passam a seleção rápida, sem mutações, inclusive para Dono. Entre Lojas permanece separado e sem mudança de finalidade. Visão Geral continua apenas seleção e ApFood legado permanece protegido. Aba restaurada em sessão sem capability não monta o painel. O backend já publicado e as Rules permanecem iguais.

A conta indicada pela correspondência estava com role original admin, apresentado como Dono pelo normalizador legado; por isso a política estrita corretamente ocultava Nova Loja. O usuário autorizou explicitamente a correção dessa conta para dono no DEV. Alterado somente role, com precondition por updateTime e auditoria privada append-only STAFF_OWNER_ROLE_CORRECTED/DEV_ROLE_CORRECTION + timestamp server-side; lojas, permissões e custom profile conferidos intactos. Firebase Auth não alterado. Essa exceção de manutenção autorizada não concede manage_stores a outros Admin/Gerente. Identificadores da conta omitidos nas evidências públicas.

38 testes React em cinco suítes e 18 capturas de componentes reais com respostas fictícias desktop/mobile PASS; nenhum envio de mutação no harness. Build/lint/diff-check PASS, sem aviso novo. Sem biblioteca nova. [Validação local](evidence/store-management-settings/local-validation.json), [correção autorizada](evidence/store-management-settings/owner-correction-dev.json). Publicação do Hosting complementar e novo aceite visual ainda pendentes neste registro. Nenhuma loja real criada/editada/inativada/excluída, pedido, pagamento, nota, SMS/WhatsApp; PROD intacta. Fase9 75%, Fase11/12 100%, Global95,00%, Fase13 0% preservados.
