# C16: correção isolada de segurança — 16/11/2026

Base de correção: 6759aed94eb73915b4bc9437d139eeedccbbe923. Branch codex/c16-two-security-fixes-20261116. Candidato original e scan 3c42172e-5cf1-4802-bafc-c7944b95fa86 preservados. Nenhum scan criado/consultado, deploy ou operação externa.

High: proteção implementada e testada, pendente revisão independente. firestore.rules adiciona receiptServerFields, safeOfflineOrderCreation, orderReceiptProtected e safeOrderFinancialUpdate, aplicados aos pedidos raiz e por loja. Protege aliases de status, receipt, ajuste, timestamps, revisão, provenance, identidade financeira; impede alteração de valor/cliente e exclusão de pedido recebido. Recebimento autorizado segue exclusivamente no callable existente. Histórico offline sem metadados financeiros mantém o contrato anterior de venda; esta mudança não migra o reconhecimento histórico implícito.

Medium: CONFIRMADO/PENDENTE. Reprodução em Firestore Emulator demonstrou criação SDK aceita e vazamento de perfil nos dois sentidos Matriz/Garavelo, alias e cache. Não aplicada uma restrição incompatível com o histórico aprovado. Os testes existentes exigem compras legadas sem lojasVisitadas; as referências graváveis não têm prova de origem confiável. Necessário inventário DEV somente leitura e vínculos revisados para um registro server-side. A autorização para preparar o inventário foi solicitada; nenhuma alteração de dados autorizada ou realizada.

A futura correção deve abranger buildCustomerDirectory/list/detail, uso de storeRelationshipVerified, POST /clientes para existente sem crmStaffUid, e mudança de cliente no admin-order-edit. Não semear registro confiável cegamente de pedidos; não usar só cadastro da loja, pois retiraria clientes legítimos. Antes de ativação, reconciliar vínculos de histórico/aliases/multiloja e cadastro/checkout/atendimento. Nenhum cliente/pedido/endereço alterado nesta etapa.

Validação:
- Antes: 20/20 testes de demonstração confirmaram que as Rules originais aceitavam as operações indevidas; controles de criação offline incluídos. Não representam aprovação de segurança.
- Depois: 54/54 no emulador (novo c16-receipt-boundary, agreed-payment-rules, online-order-status-rules, preprod-store-boundary-rules, manual-order-payment-emulator, staff-customer-directory-emulator).
- 34/34 públicos C16, 47/47 unidades direcionadas, 10/10 React (2 suítes).
- Build CRM DEV concluído com warnings de source maps de dependência Capacitor/browserslist, sem erro. Nenhuma dependência atualizada.
- Lint functions: exit0, 0 erros, 14 warnings; lint específico do teste: 0 erros, 3 warnings no-loop-func. Syntax e diff-check PASS.
- Revisão de bypass/regressão da implementação, somente leitura, concluída; não substitui auditoria independente Astra.

Logs retidos na coleção de artefatos standalone do Codex Security para este worktree, artifacts/c16-fix/. Nenhum aceite canônico do scan original foi registrado. Tentativas intermediárias preservadas: runner Firebase não aguardou prontidão do emulador; iniciada reprodução direta após prontidão. O CLI obteve jar1.19.8 e removeu cache1.22.0 automaticamente. Primeira rodada de Rules teve corrupção de codificação na edição, corrigida e diff conferido; rodada seguinte teve fixtures residuais, eliminadas somente nos projetos demo locais antes da rodada limpa54/54. Build inicial recusou config DEV ausente no worktree: reutilizada configuração local DEV existente, ignorada pelo Git, sem exibir valores.

Novo candidato é parcial (High), ainda impróprio para promoção/aceite. Seu commit e hashes das mudanças serão registrados no relatório de entrega. O 446/446 original permanece evidência histórica intacta; não se transfere automaticamente para novo código. Nova revisão precisa identificar explicitamente o delta corretivo e seus hashes, sem substituir o scan original.

Fase10 93,75%; global97%; Fase13 0%; C16 PENDENTE; PROD READY NÃO. Antes da revisão Astra, avisar usuário para trocar a GPT-6 Astra Low; não executar nesta sessão.
