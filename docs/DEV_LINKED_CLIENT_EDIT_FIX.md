# Edição de cliente vinculado a conta — DEV

## Causa confirmada
O frontend já enviava o ID token após o commit 642d7938. A API ainda recusava toda atualização de cliente com authOwnerUid, com Use Minha Conta para alterar este cadastro, mesmo depois de autorizar o funcionário do CRM. O perfil da sessão do print foi conferido por leitura no DEV e é Dono. O index.js da API publicada foi conferido e correspondia à base local antes da alteração.

## Alteração cirúrgica
- Firebase exclusivo: crmdoceria-9959e. Nenhuma alteração em produção.
- Branch: codex/dev-owned-client-edit, base 13f07ac6. Workspace dentro de projeto-doceria-main/.fiscal-sync-producao-dev.
- Mantida a rota PUT /api/clientes/:id e a transação existentes; nenhum módulo paralelo ou nova permissão concedida ao perfil.
- UID administrativo provém somente do token verificado e da autorização de equipe, nunca do corpo da requisição. Perfil, estado ativo, loja e permissão explícita de Clientes são revalidados na transação.
- Mesmos perfis CRM já autorizados (Dono, gerente/atendente na loja) podem editar somente campos cadastrais permitidos em cliente vinculado. Perfis de loja também precisam de vínculo entre cliente e loja; Dono mantém escopo global existente.
- Campos: nome, e-mail de contato, CPF/documento, nascimento, status cadastral, endereço fiscal e seus componentes. E-mail de login Firebase Auth não muda.
- Preservados UID/vínculos de login, identidade canônica, telefone e comprovação, endereços de entrega salvos/verificados, compras, cupons, métricas e lojas visitadas. Alteração de telefone continua exigindo fluxo próprio.
- Auditoria CRM_CLIENT_PROFILE_UPDATED na mesma transação registra responsável, loja, cliente, campos e timestamp; não copia valores pessoais para a auditoria.
- Minha Conta, preview somente leitura, criação e exclusão mantêm as proteções existentes.

## Testes e revisão
- 27 testes unitários aprovados (5 novos + regressões de perfil e segurança da conta).
- API HTTP real com Auth e Firestore emulados em Linux/Java21: 6 testes aprovados. Incluem a reprodução do erro no cadastro vinculado, resposta 200, autenticação ausente, corpo forjando autorização, bloqueio por loja/perfil/módulo e telefone imutável. Somente dados sintéticos demo.
- Cloud Build de teste d0b88341-075c-4b29-b405-4939cac6dcce, SUCCESS.
- ESLint sem erros; Node --check nos arquivos do backend e git diff --check aprovados.
- Nenhum cadastro real editado, nenhum documento fiscal/evento emitido. Sem mudanças de frontend, Rules, índices, Storage ou outras Functions.

## Deploy
Somente API DEV, preservando os parâmetros de ambiente e vínculos de secrets que a API já possuía. As referências são preservadas; nenhum valor de secret é lido ou publicado. O .env local temporário do deploy é restaurado após a execução.

```powershell
firebase deploy --project crmdoceria-9959e --only functions:api --non-interactive
```

Deploy concluído. API ACTIVE, atualização em 2026-11-01T02:15:13Z. Código publicado index.js/crm-client-edit.js conferido contra o source atual; ambiente e referências de secrets idênticos antes/depois; .env local restaurado byte a byte. PUT sem autenticação continua retornando 401, sem gravação. Hosting HTTP 200 preserva main.8d1e1e60.js; frontend/Rules não foram republicados. Commit de implementação df3dce3c enviado ao remoto DEV.

As gravações de teste foram realizadas exclusivamente nos emuladores com dados sintéticos, não no cadastro real.
