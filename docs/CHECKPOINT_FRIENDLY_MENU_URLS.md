# Checkpoint — URLs amigáveis de cardápios

DEV `crmdoceria-9959e`; branch `feature/infinitepay-customer-auth`; workspace `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. PROD não autorizada.

Implementação e validação local concluídas. Mapping central: Matriz, Garavelo, Festas (canal festas da Matriz) e ApFood (storeId apfood), confirmados na projeção pública DEV. Template único, links compartilhados, compatibilidade por replace, canonical, return path amigável por aba e rewrite do Hosting. Sem mudança de backend ou regra comercial.

77 testes Node + 78 React + 51 regressões direcionadas PASS. Build/lint/diff-check PASS; três avisos de lint preexistentes. Suíte legada catalog-session possui 21 falhas também reproduzidas no baseline; débito descrito no contrato, sem alteração de Auth/checkout para corrigi-lo nesta tarefa.

Próximo passo: commit/push, publicar somente Hosting DEV e conferir hashes/rotas. Depois registrar aceite manual autenticado sem pedido/pagamento/SMS/WhatsApp. Não refazer a implementação aprovada nem confundir esse aceite com a pendência fiscal do pedido e44896d8….

[Contrato e auditoria](FRIENDLY_MENU_URLS.md). Percentuais formais mantidos: Fase9 75%, Fase11/12 100%, Global 95,00%, Fase13 0%.
