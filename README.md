# Ana Guimarães Doceria — desenvolvimento

Este checkout pertence ao Firebase **DEV** `crmdoceria-9959e`. Produção (`ana-guimaraes`) pertence ao diretório `projeto-doceria-multiloja`. O `firebase.json` verifica o workspace e o Project ID antes de publicar Hosting, Functions ou regras.

## Prévia e testes locais

Na raiz deste checkout, instale as dependências de `crm` e `functions`. Para o checkout público com dados fictícios, use `firebase.checkout-local.json` e o projeto demo `demo-doceria-checkout`. As instruções e o checkpoint do projeto estão em [docs/INFINITEPAY_PROJECT_PLAN.md](docs/INFINITEPAY_PROJECT_PLAN.md).

## Preparar homologação DEV

1. Confirme o caminho absoluto do checkout e o projeto `crmdoceria-9959e`.
2. Obtenha a configuração Web do aplicativo Firebase DEV: `firebase apps:list --project crmdoceria-9959e` e `firebase apps:sdkconfig WEB <APP_ID> --project crmdoceria-9959e`.
3. Preencha `crm/.env.production.local` conforme `crm/.env.example`. Esse arquivo é ignorado pelo Git; nunca use credenciais do projeto `ana-guimaraes` aqui. Configure separadamente a chave VAPID Web Push DEV para validar notificações.
4. Execute `npm ci --prefix crm`, `npm ci --prefix functions`, os testes e `npm run build --prefix crm`.
5. Valide a publicação proposta com `firebase deploy --dry-run --only hosting,functions,firestore,storage --project crmdoceria-9959e`. Revise mudanças de funções existentes e de regras antes de publicar.

O deploy DEV deve sempre incluir `--project crmdoceria-9959e` e pode ser dividido por recurso, por exemplo `firebase deploy --only hosting --project crmdoceria-9959e`. O workflow de Hosting DEV é manual; pull requests executam apenas testes. Não há promoção automática para produção.
