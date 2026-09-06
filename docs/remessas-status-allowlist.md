# Remessas: allowlist de visualização por status

## Ambiente e escopo

Workspace: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`.
Firebase autorizado: `crmdoceria-9959e` (DEV).
Branch: `codex/remessas-destinos-autorizados`.
Remote: `https://github.com/antoniopedrocm/projeto-doceria.git`.
Produção `ana-guimaraes` e seu diretório não foram modificados.

## Diagnóstico do código

O login construía as permissões granulares a partir de `customProfiles/{uid}` ou dos padrões do cargo, sem usar a allowlist persistida em `users/{uid}`. A sessão não acompanhava alterações dessa allowlist. A função de sanitização e as Rules também concediam todos os status quando a configuração granular estava ausente/incompleta.

Esses caminhos permitiam permissões antigas ou padrões amplos no frontend. A listagem, o filtro e as somas já possuíam interseção por status no código examinado; o problema estava na origem/atualização da autorização e nos fallbacks. O caso exato das imagens de produção não foi reproduzido nesta tarefa DEV; não se atribui a ele uma causa comprovada sem verificar aquele perfil e versão publicada.

## Fonte de autorização e identificadores

A autorização de remessas passa a usar `users/{uid}.permissionDetails['entre-lojas'].statuses`, a mesma fonte consultada pelas Rules. O cadastro também mantém `customProfiles/{uid}`, preservado para outras permissões. São aceitos os formatos legados `permissionDetails.entreLojas` e a lista `status`, quando o campo canônico não está presente.

Identificadores: `rascunho`, `aguardando_conferencia`, `conferencia_sem_divergencia`, `conferencia_com_divergencia`, `pagamento_informado`, `pagamento_confirmado`, `pagamento_contestado`, `cancelado`, `cancelada`.

`cancelado` e `cancelada` são dois códigos já aceitos pelo projeto; permanecem distintos. Não houve migração ou inspeção de dados de produção.

## Comportamento

- Dono: conserva o bypass administrativo atual.
- Demais perfis: lista ausente, vazia, inválida ou com status desconhecido não concede autorização.
- Todas: reúne somente status autorizados dentro do escopo de lojas.
- Enviadas e Recebidas: filtros adicionais por origem/destino, sem ampliar status ou lojas.
- Aguardando Conferência, Aguardando Pagamento e Histórico: interseção da aba com a autorização.
- Dropdown: somente opções da allowlist; Todos status significa todos os permitidos.
- Origem, destino e período: filtros existentes preservados.
- Cards, contagem, repasse e revenda: continuam sendo calculados exclusivamente de `filteredTransfers`, que valida a autorização.
- Acesso direto: `get` e `list` do Firestore exigem status e vínculo de loja; ação de abrir detalhes também revalida o acesso.
- Transição de status: listeners existentes por loja/status removem registros que saem das consultas autorizadas. Detalhe e edição fecham quando o registro deixa de ser autorizado.
- Alteração de perfil: novo listener de `users/{uid}` atualiza a allowlist da sessão; erro de leitura remove a autorização granular.
- Erro de consulta: registros daquela consulta são descartados, evitando manter conteúdo antigo.
- Multiloja: permissões de status não ampliam origem/destino. Rascunhos continuam ocultos para quem só pertence ao destino.
- Carregamento: consultas já filtravam por loja e status antes do limite de 250; isso foi preservado. Não existe paginação nesta lista. Cards correspondem ao conjunto carregado/filtrado, não a uma contagem ilimitada de todo o banco.

## Arquivos

- `crm/src/App.js`: fonte de permissões, listener e invalidação de conteúdo.
- `crm/src/utils/transferStatusVisibility.js`: leitura estrita da allowlist.
- `crm/src/utils/transferStatusVisibility.test.js`: matriz frontend.
- `firestore.rules`: remoção dos fallbacks amplos na leitura de remessas.
- `functions/transfer-status.rules.test.js`: matriz de get/list, perfis, destino, revogação e transição.
- `functions/firestore.rules.test.js`: fixtures passam a conceder explicitamente os status usados pelas regressões.

Nenhuma Cloud Function foi alterada. Não foram alterados cálculos financeiros, estoque, pagamentos, criação de remessas ou fechamento.

## Validação executada

- Frontend: 27 testes de permissões e allowlist passaram.
- Backend existente de Entre Lojas e relatório: 19 testes passaram.
- Rules da cópia isolada: 9 testes, um por status, passaram; incluem get/list, dois usuários, Dono, isolamento de lojas, destino, módulo desabilitado, revogar/conceder e mudança para status não autorizado.
- Regressões existentes das Rules na cópia isolada: 30 testes passaram.
- Lint inicial: zero erros; 60 avisos existentes no App.js.
- Build da cópia isolada: aprovado; avisos de source maps ausentes da dependência native-audio e base Browserslist desatualizada.
- `git diff --cached --check`: revisão sem erros de whitespace após normalização.

O emulador foi executado apenas em `demo-transfer-status`, localmente, com Java 25 e fallback TCP. O build isolado contém somente o índice Git da correção sobre a base versionada; alterações locais de outras tarefas foram preservadas fora do índice.

## Publicação e validação real

Pendente: a credencial do Firebase expirou (`Authentication Error: Your credentials are no longer valid`). É necessário `firebase login --reauth`.

Antes de publicar, comparar as Rules ativas de DEV com a versão preparada para não remover proteções já publicadas por outras tarefas. O comando deve explicitar `--project crmdoceria-9959e` e `--only hosting:prod,firestore:rules`, usando configuração que aponte o Hosting para o build isolado. O target local `prod` está mapeado ao site `crmdoceria-9959e` dentro do projeto DEV; não é o Firebase de produção.

Nenhum deploy foi realizado até este registro. A validação pós-deploy real com marcar/desmarcar Pagamento confirmado permanece pendente; os testes automatizados não são apresentados como validação de uma sessão real publicada.
