# Edição completa, status e histórico de pedidos — DEV

Ambiente exclusivo: `crmdoceria-9959e`. Workspace `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`. PROD não autorizada.

## Decisão de produto e interface

**Atualizar Status não substitui Editar Pedido.** O usuário aprovou somente o visual do atalho anterior. A restauração da edição completa é um requisito adicional, ainda dependente de aceite autenticado desta entrega.

Lista e detalhe oferecem **Editar Pedido** e **Atualizar Status** separadamente. O formulário completo conserva cliente, status, categoria, forma de pagamento, observação, produtos, inclusão/remoção, quantidade explícita, desconto e data de entrega quando aplicável. Usa o modal e componentes existentes. Campos de ownership vinculado e método confirmado ficam bloqueados com explicação; a validação também acontece no servidor. Pedidos históricos não têm seus preços substituídos automaticamente pelo catálogo atual. Produto novo usa preço atual validado pelo backend.

O atalho transmite apenas status. O servidor altera status operacional e metadados de versão/data/auditoria, sem alterar itens, valores, método, estoque ou nota. Histórico e divergência aparecem no detalhe/edição. Não altera a Área do Cliente nem Admin Preview.

## Gravação administrativa

Callables `adminOrderSave` e `adminOrderHistory`, região us-central1, mantêm o UID Staff. Reutilizam sessão ativa, permissões do módulo Pedidos e vínculos de loja existentes. Dono global só quando não limitado a lojas; Gerente/Atendente e outros papéis Staff já suportados precisam de vínculo. Customer, Contador gravável, usuário inativo/sem permissão/loja externa e anônimo são rejeitados. Não aceita UID/actorName arbitrários do payload como autor.

FULL/STATUS passam por allowlist de campos, validação de produtos/quantidades/valores, revisão/status esperado e updatedAt. `requestId` identifica a operação e seu fingerprint; retry após commit retorna o resultado sem duplicar evento/estoque. Conflito de revisão exige reabrir o pedido. Não revalida endereço ou preço histórico silenciosamente. Cadastro de novo pedido segue o caminho atual.

## Auditoria

`lojas/{storeId}/pedidos/{orderId}/auditEvents/{requestId}`. Evento criado na mesma transação do pedido e estoque, com schemaVersion, orderId, storeId, actorUid, actorName permitido, actorType STAFF, source CRM_EDIT_ORDER/CRM_UPDATE_STATUS, action, createdAt server-side, revision, changes (field/before/after), stockChanges e eventual diferença financeira. Somente IDs e dados necessários; sem cartão, credenciais ou dados PCI.

O servidor usa create, nunca update/delete do evento. As Rules existentes já impedem escrita cliente nesse caminho aninhado; teste de emulador confirmou que Staff, Customer e anônimo não criam, alteram ou excluem eventos. Nenhuma Rule foi afrouxada/deployada. A leitura pelo callable reautoriza Staff/loja, limita páginas a 25 eventos e omite fingerprint/controle interno de alocação. UI apresenta data, autor, ação e before/after em ordem cronológica, com paginação de eventos anteriores. Não inventa/backfill eventos históricos; logs anteriores e auditorias dos fluxos fiscais existentes permanecem preservados.

## Pagamento e ownership

Pagamento online confirmado continua autoridade do provider: paymentId, provider, captureMethod, payment_status, paidAt e ownerUid não são campos editáveis. Consulta privada checkoutPayments valida vínculo/orderPath/store/PAID/review e fornece o valor original em centavos. Não chama InfinitePay nem altera sua API, payment_check, webhook ou documento de pagamento.

Edição paga recalcula o novo total e grava `adminPaymentAdjustment` com paidCents, orderTotalCents, differenceCents e BALANCED/REVIEW_REQUIRED. Mostra valor pago, novo total e diferença. PAID original não significa que a diferença foi paga. Não cria cobrança, link, estorno, recebimento ou baixa financeira automática. Voltar exatamente ao total original pode restaurar BALANCED; liquidação adicional/estorno real exige fluxo futuro próprio.

AGREED_LATER sem método confirmado permite selecionar os métodos fiscais existentes, persistindo paymentMethod/fiscalPaymentCode/source crm/manual e data, sem virar PAID. Cupom original não é trocado por outro código nem consumido novamente; desconto manual retira o vínculo do cupom quando escolhido, preservando os contadores existentes.

Troca de cliente em pedido manual sem ownership vinculado preserva originalCustomerId e before/after. Pedido com ownerUid, paymentId ou vínculo canônico mantém cliente original; aliases de destino manual são resolvidos explicitamente para o canônico. Não modifica cadastro Customer nem Auth.

## Estoque

Checkout público já movimenta estoque na criação/reserva; pagamento confirmado consome a reserva. A edição completa aplica somente delta de quantidades, sem nova baixa integral. Manual mantém o contrato de alocação na finalização completa. O atalho nunca baixa/restitui estoque, inclusive na finalização: a auditoria guarda a alocação real anterior para que uma edição completa posterior possa aplicar o delta correto.

Leituras, atualização do pedido, ajustes de estoque e evento são uma transação. Falha/conflito/estoque insuficiente não deixa efeitos parciais. Cancelamento de pedido pago não é prova de estorno e não restitui automaticamente estoque consumido.

## Nota fiscal

Edição completa confere ponte fiscal do pedido e documentos invoices por orderId. Nota autorizada/cancelada/em processamento bloqueia mudança material; status e observação interna podem mudar sem reescrever a nota. Nenhum cancelamento/inutilização é automático. Sem nota emitida, preparação/revalidação fiscal lê o pedido atualizado, conforme fluxo existente.

Emissão/validação de pedido pago recusa diferença entre total e valor privado confirmado, mesmo que alguém forge/remova o marcador da UI. O caminho direto de reserva também revalida o valor preparado; rascunhos mantêm a verificação de updatedAt/revisão existente. Proteção publicada apenas nos exports fiscais necessários, preservando configurações e secrets.

## Validação e limites

Testes com Firestore/Auth emuladores cobrem observação/status FULL, atalho isolado, produtos/remoção/quantidade, desconto, método a combinar, pagamento confirmado e divergência, dois autores, idempotência/concorrência, ownership, permissão/loja, regras append-only e proteção de nota. Integração fiscal usa provedor fictício, sem emissão ou pagamento real. Node testa o JSX real dos dois formulários e handlers; React testa histórico, campos bloqueados e alerta.

Capturas locais [desktop completo](evidence/admin-order-full-edit/full-1920.png), [mobile completo](evidence/admin-order-full-edit/full-390.png), [atalho desktop](evidence/admin-order-full-edit/status-1920.png), [atalho mobile](evidence/admin-order-full-edit/status-390.png) usam o JSX/controles reais com pedido fictício e exibição de cliente/histórico simulada. Não são sessão autenticada do DEV. Sem overflow horizontal. O scroll do modal original é preservado.

Entrega/commit/hashes e aceite: registrar no [checkpoint](CHECKPOINT_ADMIN_ORDER_FULL_EDIT.md). Não declarar conclusão pelo PASS visual anterior do status-only. Sem mutação do pedido real para teste, pagamento/nota/SMS/WhatsApp reais, Mercado Pago ou PROD. Percentuais formais preservados: Fase9 75%, Fase11/12 100%, Global 95,00%, Fase13 0%.

Publicação DEV verificada em 30/10/2026: commit funcional **15138ff3** enviado e publicado; seis funções ACTIVE, 49 arquivos de runtime conferidos por fonte, configuração fiscal preservada e API financeira inalterada. Hosting com 60/60 hashes, cache correto e fontes correspondentes. Evidências sanitizadas no checkpoint. **Homologação Staff da edição completa ainda pendente**; o PASS visual anterior continua restrito ao atalho de status.
