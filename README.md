## 🚀 Deploy do Projeto
Siga os passos abaixo para instalar as dependências e realizar o deploy da aplicação no Firebase.
---
### 1️⃣ Instalar dependências do CRM e gerar o build
```bash
# Instalar a CLI do Firebase (caso ainda não tenha)
npm install -g firebase-tools

# Entrar na pasta do CRM
cd crm

# Instalar dependências
npm install

# Gerar build da aplicação
npm run build
```

---
### 2️⃣ Instalar dependências das Functions
```bash
cd ../functions
npm install
```
---

### 3️⃣ Fazer o deploy para o Firebase

Volte para a raiz do projeto:

```bash
cd ..
```
#### 🔸 Deploy completo (Hosting + Functions, etc.)
```bash
firebase deploy
```
#### 🔸 Deploy somente do Hosting
```bash
firebase deploy --only hosting
```
---
### 🧪 Testar localmente

Para testar a aplicação gerada localmente, rode o comando abaixo no **diretório da aplicação** (onde está a pasta `dist` ou equivalente):

```bash
http-server
```

> 💡 Se não tiver o `http-server` instalado globalmente, use:
>
> ```bash
> npm install -g http-server
> ```

---

Quer que eu adapte esse texto para **projetos com múltiplos sites no Firebase Hosting** também? (ex: `hosting:admin`, `hosting:site`)


------------------------------------------------
#publicar no forebase
1. Verificar configuração de usuário
bash
git config user.name
git config user.email

2. Verifique o status atual
bash
git status
Isso mostra quais arquivos foram modificados.

3. Adicione os arquivos para o commit
bash
# Para adicionar todos os arquivos modificados
git add .

# Ou para adicionar arquivos específicos
git add nome_do_arquivo

4. Faça o commit das alterações
bash
git commit -m "Descrição das alterações realizadas"

5. Envie para o repositório remoto
bash
git push origin main
Ou se sua branch principal for chamada "master":

bash
git push origin master

Verifique e altere o remote (se necessário):
No diretório do novo projeto, cheque o remote atual com:

text
git remote -v
Se mostrar o repo antigo (ex: outro URL), remova-o:

text
git remote remove origin
Depois, adicione o novo remote:

text
git remote add origin https://github.com/antoniopedrocm/projeto-doceria-Multilojas.git
Verifique novamente com git remote -v para confirmar. Isso "troca" o repositório remoto sem afetar o antigo (que fica intacto em sua pasta). Se o repo local já foi clonado corretamente, o remote deve estar ok.
