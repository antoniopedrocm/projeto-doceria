Projeto Doceria - CRM e Cardápio Online no Firebase
Este projeto foi reestruturado para rodar inteiramente no Firebase (Hosting, Firestore e Functions), contendo um cardápio público e um painel de administração (CRM) em React.

Estrutura de Pastas Final
.
├── public/                  # Raiz do Firebase Hosting
│   ├── admin/               # Destino do build do CRM (não versionar, é gerado)
│   │   └── .gitkeep
│   ├── index.html           # Cardápio público (antigo cardapio.html)
│   ├── logotipo.png         # IMPORTANTE: Coloque seu arquivo de logo aqui
│   └── firebaseClientConfig.js # Config do Firebase para o cardápio
│
├── crm/                     # Código fonte do Painel de Admin (React)
│   ├── public/
│   ├── src/
│   │   ├── App.js
│   │   └── firebaseConfig.js  # Config do Firebase para o CRM
│   ├── .env.example         # Exemplo de variáveis de ambiente
│   └── package.json
│
├── functions/               # Backend com Cloud Functions (Node.js)
│   ├── index.js
│   └── package.json
│
├── .firebaserc
├── firebase.json
├── firestore.indexes.json
└── firestore.rules

1. Configuração do Ambiente
a. Configuração do Cardápio Público (public/)
API do Google Maps:

Acesse o Google Cloud Console.

No seu projeto, habilite as APIs "Maps JavaScript API" e "Places API".

Vá para "Credenciais", crie uma "Chave de API" e restrinja-a para ser usada apenas pelo seu domínio (seudominio.com/*) para segurança.

Abra o arquivo public/index.html.

Localize a linha próximo ao final do arquivo:

<script src="[https://maps.googleapis.com/maps/api/js?key=COLE_SUA_CHAVE_API_GOOGLE_MAPS_AQUI&libraries=places](https://maps.googleapis.com/maps/api/js?key=COLE_SUA_CHAVE_API_GOOGLE_MAPS_AQUI&libraries=places)"></script>

Substitua COLE_SUA_CHAVE_API_GOOGLE_MAPS_AQUI pela sua chave de API.

Configuração do Firebase:

O arquivo public/firebaseClientConfig.js já está configurado. Verifique se os valores correspondem ao seu projeto Firebase.

b. Configuração do Painel de Admin (crm/)
Navegue até a pasta do CRM:

cd crm

Instale as dependências:

npm install

Crie o arquivo de variáveis de ambiente:

Renomeie (ou copie) crm/.env.example para crm/.env.

Acesse seu projeto no Console do Firebase > "Configurações do Projeto" > "Geral".

Em "Seus apps", selecione seu app da Web e copie os valores de firebaseConfig.

Preencha o arquivo crm/.env com esses valores.

> Importante: use uma chave de API liberada para o domínio de produção. Chaves
> restritas ou de outro projeto fazem o Firebase Auth retornar 403 no login
> ("requests to this API are blocked"). O aplicativo agora lê os valores do
> arquivo .env e só recorre aos valores de exemplo se algum campo não estiver
> definido.

c. Configuração do Backend (functions/)
Navegue até a pasta de functions:

cd functions

Instale as dependências:

npm install

2. Como Rodar Localmente com Emuladores
Inicie os Emuladores do Firebase:

Na raiz do projeto, execute:

firebase emulators:start

O cardápio estará acessível em http://localhost:5000.

A UI dos emuladores estará em http://localhost:4000.

Inicie o CRM em modo de desenvolvimento:

Em um novo terminal, navegue até a pasta crm:

cd crm
npm start

O painel de admin estará acessível em http://localhost:3000.

3. Build e Deploy
Faça o build do CRM:

Dentro da pasta crm/, execute:

npm run build

Prepare os arquivos para deploy:

Copie o conteúdo da pasta crm/build para a pasta public/admin.

No macOS/Linux: cp -R crm/build/* public/admin/

No Windows (PowerShell): Copy-Item -Path "crm/build/*" -Destination "public/admin/" -Recurse

Faça o deploy de TUDO (Hosting, Firestore, Functions):

Na raiz do projeto, execute:

firebase deploy

Para fazer deploy apenas do hosting: firebase deploy --only hosting

Para fazer deploy apenas das functions: firebase deploy --only functions

Após o deploy, seu cardápio estará no domínio principal e seu CRM em https://seudominio.com/admin.