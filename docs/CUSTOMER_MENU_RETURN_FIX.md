# Retorno ao cardápio — complemento C15 DEV

## Falha e diagnóstico

Em 06/11/2026, o titular confirmou o claim e-mail/senha, mas informou que **Voltar ao Cardápio** terminava em `/area-cliente`. O vínculo técnico continua PASS; este relato reprova o retorno da interface e não autoriza repetir SMS ou claim.

Duas lacunas comprovadas no código anterior:

1. `customerMenuDestination` usava a loja de `checkoutState_v1`, mas não persistia a origem pública. Logout remove corretamente esse contexto privado; sem `returnTo` ou origem persistida, o destino voltava a `/`. Regressão nova falhou antes do patch (esperado Garavelo, recebido `/`).
2. `/` é também a entrada do gate autenticado. Uma conta Customer-only é corretamente encaminhada dali para `/area-cliente`. Usar `/` como fallback público causava o retorno aparente à conta. Os testes anteriores substituíam `location.assign` e não exercitavam o documento de destino.

Não foi extraído storage, token ou credencial da janela anônima do titular; não afirmar qual das fontes de origem estava presente naquela sessão. A combinação sem origem é reproduzível e compatível com o relato.

## Correção

- Origem continua sendo somente pathname/search de cardápio validado na allowlist, em `sessionStorage`, por aba. Nenhum URL externo, UID, token ou dado Customer.
- Bootstrap público guarda a origem somente depois de validar a projeção pública ativa. Entrada Minha Conta também preserva o caminho, e o fallback de contexto o persiste antes da limpeza privada.
- Botões resolvem novamente o destino no clique, incluindo contexto que chegou depois da montagem.
- Sem origem válida, destino explícito `/?public=1` renderiza **a mesma CrmHome pública existente**, por `ApplicationEntry`, sem montar `App`/gate autenticado. Header público dá acesso à conta e à entrada normal do sistema. Nenhuma mudança nas regras de Auth, capacidades ou redirects privados; rotas normais mantêm o fluxo anterior.
- `/cardapio` genérico continua compatível; não há fallback arbitrário para Matriz. Helpers públicos são cópias geradas do módulo canônico por `sync-canonical-auth.cjs`.

## Validação local

- **606 testes React / 60 suítes PASS**, incluindo gate, shell, logout, Admin Preview, fiscal e telas existentes.
- **156 testes públicos PASS**, incluindo Matriz/Garavelo, aliases, canais, origem por aba, cleanup privado, links antigos, carrinho, SMS mocked e allowlist de retorno.
- Total sem somar retestes: **762 PASS**. Testes focados/reprodução são subconjuntos.
- Build PASS: `main.cf5be7ec.js` 455,78 kB gzip (+435 B); CSS `main.e526cf8e.css` 14,61 kB (+4 B). Sem nova dependência.
- Lint de arquivos alterados: 0 erros, 3 avisos preexistentes (`no-loop-func` e regex de controle nas cópias do helper). Build mantém avisos de sourcemaps ausentes do native-audio e metadados antigos de browser.
- Diff-check PASS. Navegador local confirmou `/?public=1` na Página Inicial pública sem shell Customer. Diretório público no localhost falhou por ambiente/origem; verificar links no DEV publicado, não registrar essa consulta como PASS.

## Publicação e aceite

Somente Hosting DEV `crmdoceria-9959e`, a partir de `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, autorizado pelo Dono conforme necessidade. Commit/push, publicação, hashes e smoke remotos a registrar na evidência de release.

Após publicação, retestar com a conta já vinculada: origem Matriz → Minha Conta → voltar, refresh e logout/relogin sem SMS. C15-E só recebe PASS completo depois do aceite; Google independente e C16 continuam pendentes.

Fase 9 = 100%; Fase 10 = 87,50%; global formal = 97,00%; Fase 13 = 0%; PROD READY: NÃO. Não criar pedido/pagamento, alterar perfil/endereço ou reenviar SMS.
