# Checkpoint — edição completa e status do pedido

DEV `crmdoceria-9959e`, branch `feature/infinitepay-customer-auth`, workspace `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. PROD não autorizada. Retomada de 30/10/2026.

## Estado real

**IMPLEMENTAÇÃO E VALIDAÇÃO LOCAL CONCLUÍDAS; PUBLICAÇÃO DEV PENDENTE.** Base Git anterior `3fd12759`; registrar commit após criá-lo. Não refazer implementação ou testes aprovados.

- Status-only anterior: **PASS visual**, conforme usuário; não é aceite final da edição completa.
- Edição completa: formulário preservado como ação própria; endpoint administrativo transacional implementado; ainda precisa conclusão da validação/publicação e aceite.
- `functions/admin-order-edit.js`: gravação FULL/STATUS, autorização Staff por módulo/loja, histórico append-only sob pedido, idempotência/revisão, estoque por delta, proteção de ownership/método pago e divergência de valor.
- `functions/index.js`: dois novos callables `adminOrderSave` e `adminOrderHistory`; nenhum endpoint financeiro/provedor alterado ou publicado.
- `functions/order-payment-method.js` e `functions/fiscal.js`: proteção fiscal contra divergência de valor pago/total; precisa publicar somente os exports fiscais necessários com configuração atual preservada.
- CRM: ações Editar Pedido e Atualizar Status separadas na lista/detalhe; quantidade editável, campos protegidos, histórico e alerta financeiro; não altera Auth/Admin Preview/WhatsApp.
- 39 testes de integração financeira/fiscal/Rules e 13 testes focados finais PASS (grupos com sobreposição). 55 React e 21 Node/seletores/handlers/JSX real PASS. Build/lint/diff-check PASS; 65 avisos preexistentes de App.js, sem novo aviso. Quatro capturas locais fictícias desktop/mobile revisadas, sem overflow horizontal. [Evidência local](evidence/admin-order-full-edit-local.json).
- Pré-check Cloud Functions DEV concluído: baseline das quatro funções fiscais e API salvo localmente; dois novos endpoints ainda ausentes. Configuração sensível não entra nos documentos.

## Próximos passos necessários

1. Concluir guarda de notas históricas, sem reduzir o formulário ou reabrir trabalho já aprovado.
2. Rodar testes específicos afetados e concluir lint/diff; reutilizar o build se fontes continuarem correspondentes.
3. Registrar arquitetura/limites e evidências; commit e push DEV.
4. Publicar dois callables novos e exports fiscais estritamente necessários, preservando env/secrets; não publicar API, provider, Rules ou outros exports.
5. Hosting DEV e verificação dos fontes/hashes; capturas locais fictícias e homologação autenticada sem pagamento/nota/SMS/WhatsApp reais.

Não alterar o pedido real e44896d8… apenas para testar. Não declarar o workstream concluído com o aceite visual do modal de status.

Percentuais formais preservados: **Fase9 75%, Fase11/12 100%, Global 95,00%, Fase13 0%**. Mercado Pago futuro. PROD intacta.
