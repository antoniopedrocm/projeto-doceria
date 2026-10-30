# Voltar ao Cardápio — origem pública por aba

DEV `crmdoceria-9959e`; branch `feature/infinitepay-customer-auth`; workspace `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`. Somente Hosting. PROD não autorizada.

## Causa

Minha Conta apontava apenas para `/area-cliente`. O retorno de CustomerShell lia storeId de `checkoutState_v1` e usava `/cardapio` como fallback. O cleanup canônico pode remover esse snapshot privado ao sair; a referência pública da origem desaparecia junto. `/cardapio` sem loja continua sendo um diretório válido usado por StorefrontLinks e pelo bootstrap público, portanto não foi removido.

## Contrato

- O header público gera `/area-cliente?returnTo=...` contendo somente pathname/search de cardápio permitido. Remove parâmetros não relacionados antes de gerar esse link, sem transportar UID, tokens, e-mail ou fragmentos. O link também permite abrir a área em nova aba com a origem explícita.
- O shell valida a origem e conserva apenas a rota pública normalizada em `sessionStorage.customer-public-return-v1`, por aba. Captura antes da navegação interna; não depende de Customer/Auth. O logout e seu cleanup privado permanecem inalterados.
- Resolução: returnTo válido da entrada → origem pública válida dessa aba → storeId sintaticamente válido do contexto legado existente → `/`, a Página Inicial pública existente (ApplicationGate → public → StaffApplication/CrmHome). Não cria seletor novo.
- O valor é mantido ao retornar, facilitando nova entrada direta na mesma sessão. Uma nova entrada vinda de outro cardápio substitui a origem nessa aba. Não existe localStorage global para essa preferência.
- Apenas navegação pública; nunca autoriza acesso a loja, Customer, pedido, pagamento ou CRM.

## Allowlist

Rotas auditadas: `/cardapio` com store, e aliases existentes `/cardapio-matriz`, `/cardapio-garavelo`, `/cardapio-festa`, incluindo suas variantes `.html`. Os aliases são rotas de compatibilidade, sem mapeamento local inventado para storeId. Lojas/canais futuros continuam usando a rota genérica com IDs válidos.

Parâmetros reconhecidos: store e channel, no máximo uma ocorrência de cada. channel exige store, conforme o contrato público atual; ambos usam IDs restritos ao formato existente, sem espaços/controles. URLs absolutas, protocol-relative, scripts, data, barras invertidas, fragmentos, rotas privadas, parâmetros desconhecidos/duplicados e valores malformados são rejeitados. A rota genérica sem loja não é guardada como origem específica. Em falha/corrupção de storage, o fallback continua interno e seguro.

## Arquivos e fronteiras

`crm/src/storefront/storeRoutes.mjs` é a fonte única dos helpers puros de rota, copiada pelo sync já existente para `crm/public/store-links.mjs`. `customer-account-core.mjs` altera somente o href do header; `customerContext.js` delega o retorno; `CustomerShell.js` conserva o destino público durante montagem/remontagem. Nenhuma mudança em logout canônico, Firebase Auth, APIs, backend, checkout, pagamento, pedidos, SMS/OTP, WhatsApp ou Admin Preview.

## Validação local

- 26 testes Node: entrada real do controlador, Matriz/Garavelo, aliases/canal, origem acima de snapshot de outra loja, logout canônico com falha de cleanup simulado, refresh, duas abas, allowlist/ataques, ausência de dados Auth e fallback.
- 52 regressões Node: controlador Customer, Google/e-mail e entrada inline, limpeza de dados privados, sessão/carrinho canônicos.
- 74 testes React: CustomerShell e ApplicationGate, incluindo clique real no botão após logout/remontagem, login/refresh e acesso direto desautenticado.
- Lint direcionado: sem erros; aviso preexistente no-loop-func no controlador e avisos intencionais do validador de caracteres de controle/fixture de ataque javascript.
- Build/diff-check PASS. Commit **3aad75090a1f7fe72707087171484289e737f20f**, push e Hosting DEV concluídos. Verificação remota **60/60 hashes**, 21 fontes de sourcemap e 51 fontes públicas; cache correto. [Evidência publicada](evidence/customer-menu-return-hosting-dev.json). Nenhum teste cria pagamento, pedido, nota fiscal, SMS ou WhatsApp reais.

## Aceite

Homologação autenticada DEV pendente: Matriz/Garavelo → Minha Conta → voltar; Garavelo → refresh → sair → voltar; acesso direto sem origem em aba limpa → home pública. Sem editar dados, confirmar pedido ou enviar mensagens. Testes simulados não equivalem a aceite manual remoto.

Percentuais formais preservados: Fase 9 75%, Fases 11/12 100%, Global 95,00%, Fase 13 0%. A homologação do pagamento autenticado V1 permanece uma pendência separada; esta tarefa não a encerra nem inicia Mercado Pago.
