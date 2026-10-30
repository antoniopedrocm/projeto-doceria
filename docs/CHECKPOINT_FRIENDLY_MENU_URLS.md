# Checkpoint — URLs amigáveis de cardápios

DEV `crmdoceria-9959e`; branch `feature/infinitepay-customer-auth`; workspace `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. PROD não autorizada.

Implementação e validação local concluídas. Mapping central: Matriz, Garavelo, Festas (canal festas da Matriz) e ApFood (storeId apfood), confirmados na projeção pública DEV. Template único, links compartilhados, compatibilidade por replace, canonical, return path amigável por aba e rewrite do Hosting. Sem mudança de backend ou regra comercial.

77 testes Node + 78 React + 51 regressões direcionadas PASS. Build/lint/diff-check PASS; três avisos de lint preexistentes. Suíte legada catalog-session possui 21 falhas também reproduzidas no baseline; débito descrito no contrato, sem alteração de Auth/checkout para corrigi-lo nesta tarefa.

**Entrega técnica publicada e verificada no DEV.** Commit funcional **bacb754c450557af4ed6f91cef1a63861b12a2de**, push na branch feature/infinitepay-customer-auth e deploy somente Hosting concluídos. **60/60 hashes**, 23 fontes de sourcemap e 51 fontes públicas correspondentes; cache correto. Oito URLs HTTP retornaram 200 com o mesmo template e revalidação, incluindo slugs novos, inválido, links antigos e diretório genérico.

Chrome automatizado real no DEV, sem sessão autenticada: Matriz/Garavelo em **1920×889 e 390×800**, abertura direta, refresh, substituição de URL antiga, Minha Conta → entrada pública → Voltar ao Cardápio e ausência de scroll horizontal PASS, sem pageerror. Festas e ApFood resolveram IDs/canal corretos; slug inexistente mostrou Loja não encontrada sem store fallback. Nenhuma mutação de aplicação foi enviada. [Hosting](evidence/friendly-menu-hosting-dev.json), [HTTP](evidence/friendly-menu-http-dev.json), [navegador](evidence/friendly-menu-browser-dev.json).

A gravação inicial dos relatórios falhou por ENOSPC. A verificação HTTP/hashes foi repetida em memória com sucesso e preservada nos arquivos de evidência; o navegador concluiu os sete cenários e liberou espaço ao encerrar. Não houve alteração adicional de runtime, novo deploy ou limpeza de dados do usuário por esse incidente.

Única pendência desta entrega: aceite humano autenticado Matriz/Garavelo → Minha Conta → login/logout quando aplicável → Voltar, sem pedido/pagamento/SMS/WhatsApp. Fluxo autenticado/grants continua coberto por testes simulados, sem alegar sessão real nesse teste Chrome. Não refazer a implementação nem o deploy sem defeito. A pendência fiscal do pedido e44896d8… permanece separada.

[Contrato e auditoria](FRIENDLY_MENU_URLS.md). Percentuais formais mantidos: Fase9 75%, Fase11/12 100%, Global 95,00%, Fase13 0%.
