# Ambientes e deploy Firebase

Estas regras são permanentes para qualquer tarefa relacionada a estes projetos:

- `C:\Users\antonio.pedro\projeto-doceria-main` é o projeto de **desenvolvimento**. Deploys deste diretório devem usar exclusivamente o Firebase Project ID `crmdoceria-9959e`.
- `C:\Users\antonio.pedro\projeto-doceria-multiloja` é o projeto de **produção**. Deploys desse diretório devem usar exclusivamente o Firebase Project ID `ana-guimaraes`.
- Antes de qualquer build ou deploy, confirmar o caminho absoluto do workspace ativo e associá-lo ao Project ID acima.
- Não deduzir o ambiente apenas pelo domínio, `.firebaserc`, configuração compilada ou conteúdo de bundles publicados.
- Nunca fazer deploy do código de um diretório no Firebase Project ID reservado ao outro diretório.
- Se o pedido mencionar "produção", trabalhar em `projeto-doceria-multiloja` e usar `ana-guimaraes`.
- Se o pedido mencionar "desenvolvimento", homologação ou o workspace `projeto-doceria-main`, trabalhar em `projeto-doceria-main` e usar `crmdoceria-9959e`.
- Se o ambiente não estiver explícito e a ação envolver deploy, interromper antes da publicação e pedir confirmação ao usuário.
