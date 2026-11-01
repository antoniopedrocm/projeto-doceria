# Correção da edição de clientes no DEV

- Firebase: crmdoceria-9959e; origem Git: antoniopedrocm/projeto-doceria.
- Branch: codex/dev-client-edit-auth, base 7afff057 (DEV publicado com melhorias fiscais e correção do build).
- Workspace: C:/Users/antonio.pedro/Projeto/projeto-doceria-main/.fiscal-sync-producao-dev.

## Causa
O callClientApi de App.js enviava PUT /api/clientes/:id sem Authorization. O checkoutToken do backend exige Bearer ID token e retornava 401 com Entre novamente para continuar. A tela da imagem é Editar Cliente.

## Correção
- Helper clientApiRequest usa auth.currentUser da instância Firebase canônica e o ID token do SDK; não usa o objeto de perfil como credencial.
- Uma resposta 401 permite somente uma renovação forçada do token do mesmo UID e uma nova requisição. 403, erros de rede e outros status não repetem alterações automaticamente.
- Sessão anônima, ausente, logout ou troca de conta durante a obtenção do token bloqueiam a requisição.
- Mantidos loja selecionada, método e payload. JSON de erro é transformado em mensagem legível; sessão e permissão têm códigos próprios.
- No erro, o modal de cliente e os valores permanecem abertos, sem promise rejeitada não tratada; fechamento e limpeza acontecem apenas após sucesso.
- Backend, roles, Rules, dados fiscais e cadastros reais não foram alterados. A integração compartilhada também autentica as chamadas de criação/consulta/exclusão de clientes já existentes.

## Validação
- 54 suítes, 575 testes React/Jest aprovados, sendo 19 novos casos de autenticação e handlers reais do App extraídos por AST.
- ESLint: zero erros. Build aprovado com os avisos preexistentes NativeAudio/Browserslist; guard de configuração Web DEV aprovado.
- OPTIONS na API DEV retornou 204, permitindo Authorization e Content-Type para PUT a partir do Hosting DEV, sem alteração de dados.
- Bundle /static/js/main.8d1e1e60.js, SHA256 1b7c4739537d03b96a842d7aff8165a23e5f90e506d7aef7ea42c45a93acf435; sourcemaps conferidos contra App.js/clientApi.js atuais.
- Abertura do candidato em Edge headless no hostname DEV com assets locais: root preenchido, sem erros de JavaScript.
- Módulo fiscal atual, clonagem, numeração, iFood Hub e 99Food Hub preservados no bundle; os 52 arquivos públicos anteriores permanecem byte a byte.
- Não houve login automatizado nem edição de cliente real. O fluxo autenticado foi validado com mocks de token/API e handlers reais.

## Deploy
Somente Hosting DEV; nenhuma Function, Rule ou componente de produção foi publicado nesta correção.

```powershell
firebase deploy --project crmdoceria-9959e --config firebase.fiscal-dev.local.json --only hosting --non-interactive
```

Aguardando registro da verificação pós-deploy.
