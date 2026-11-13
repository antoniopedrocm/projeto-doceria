# Migração de máquina — DEV e PROD local

## Estado e limite de conclusão

13/11/2026. Fase9=100%; Fase10=93,75%(15/16), C15-E/G PASS, C16 pendente de auditoria completa e aceite consolidado; global97,00%; Fase13=0%; PROD READY:NÃO. Não repetir vínculo Google, SMS ou testes reais já homologados. Não instalar Python nesta máquina. A migração somente será concluída após restauração e testes na nova máquina; não formatar, apagar ou revogar nada antes disso.

A autorização desta missão permite commit/push DEV e PROD após os gates de segurança; substitui a restrição anterior da janela conjunta para push PROD. **Firebase PROD continua bloqueado**, inclusive para consultas de configuração/Secrets/IAM. Push não autoriza deploy. GitHub Apps/publicadores externos inconclusivos impedem push PROD até comprovar o bloqueio.

## Inventário confirmado

- DEV funcional: `projeto-doceria-main/infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, base `7e7d7b69`. Diretório principal está na branch de backup antiga `797c2562`, não é a origem funcional. Há11 worktrees existentes e13 referências prunable preservadas; não executar prune/reset/clean.
- PROD local: `projeto-doceria-multiloja`, branch `codex/dev-to-prod-preparation-20261108`, base `a0229cc0`;6 worktrees existentes, incluindo terminal Android/ponto/fiscal. GitHub main consultado em `7751ab46`;31 commits de preparação locais acima dessa referência. Não assumir que main representa todas as Functions publicadas.
- GitHub DEV e PROD são públicos. `crm/.env` rastreado em ambos contém somente flag de build, não credencial. Deve deixar de ser rastreado preservando o arquivo local. `.env.production.local` e demais arquivos reais locais ficam apenas no backup criptografado. Ignorar `credenciais/` em Gitignore e info/exclude compartilhado; nenhum arquivo dessa pasta será publicado, mesmo criptografado.
-7-Zip26.02 disponível; Node22.19.0/npm11.19.1/Git2.52.0/GitHubCLI2.83.2; FirebaseCLI15.34.1; Java21.0.11 para emuladores. Lockfiles de cada projeto preservados. Docker/PHP/Composer/vendor/lockfile fiscal e toolchain Android exigem validação própria na nova máquina; não declarar esses runtimes aprovados pelo build React.
- Nesta missão,25 arquivos de Clientes/recebimento/Rules/conexões/testes foram integrados seletivamente no PROD local por três vias;17 arquivos já equivalentes preservados. Diferenças legítimas de ambiente preservadas, inclusive ProjectID no teste. PROD local651/651React,161/161integrações em emuladores, build local e diff-checkPASS; não equivalem a homologação PROD. DEV runtime homologado preservado; última conferência61/61Hosting/655React/164unidadesFase10/34públicos e147integrações únicas anteriores desta retomada, sem somar grupos.

## Conteúdo dos backups criptografados

Destinos locais exclusivos: `projeto-doceria-main/credenciais/` e `projeto-doceria-multiloja/credenciais/`. Arquivos7z comAES-256 e cabeçalhos criptografados; senha digitada somente pelo titular no7-Zip, mantida separadamente. Não colocar senha em argumento, script, variável de ambiente, log, Git ou chat. Nenhuma chave real será exportada de Secret Manager.

Incluir código completo/alterações/untracked necessários, `.git` completo com branches e refs, worktrees existentes, dotenv/certificados/chaves locais da aplicação que existirem, documentos/evidências e arquivos externos estritamente Doceria. DEV inclui baseline privada dos testes, candidato limpo C16 e estado do scan correspondente; histórico desta conversa do Codex pode ser preservado como referência criptografada, não como sessão de autenticação. Artefatos globais de outros projetos não serão copiados.

Excluir caches/reinstaláveis (`node_modules`,build,.gradle,.firebase,vendor gerado,logs de execução reproduzíveis) quando não houver alteração local relevante. Preservar fontes/lockfiles/manifestos e registrar exclusões. Não copiar perfis/cookies de navegador, Windows Credential Manager/DPAPI, `auth.json`, tokens FirebaseCLI/GitHub/GoogleCloud/Codex, contas corporativas nem bancos globais de conversas. Reautenticar oficialmente.

Manifesto local registra cada arquivo de origem, tamanho eSHA256; listas de origem e relatórios sem valores de credenciais. Após criar o7z, calcularSHA256/tamanho e executar teste de integridade com senha somente no aplicativo. Verificação definitiva inclui extração e comparação de arquivos na nova máquina. Não tratar jobs/listas ou arquivo vazio como backup concluído.

## Credenciais remotas: recuperar acesso, não exportar valores

| Serviço | Ambiente | Referência / situação | Nova máquina |
|---|---|---|---|
| InfinitePay Matriz | DEV | Secret derivado `infinitepay-checkout-0ac34f0f9345e914f3f3` NOT_FOUND; loja opera por handle básico sem APIKey | Reautenticar; preservar modo básico, não criar credencial por suposição |
| InfinitePay Garavelo | DEV | `infinitepay-checkout-a1cccade83b8102c97d1`, bindingACTIVE versão2 anteriormente validado; metadados acessíveis nesta missão | Usar referência/versão existentes; não ler/substituir a chave |
| Maps backend | DEV | `GOOGLE_MAPS_SERVER_API_KEY`, versão1 anteriormente vinculada; metadados acessíveis | Verificar permissão/binding oficiais após login, sem exibir valor |
| Firebase service account | GitHubDEV | Secret `FIREBASE_SERVICE_ACCOUNT_CRMDOCERIA_9959E` | Permanece noGitHub; não exportar valor |
| Firebase service accounts | GitHubPROD | Secrets `FIREBASE_SERVICE_ACCOUNT` e `FIREBASE_SERVICE_ACCOUNT_ANA_GUIMARAES` | Permanecem noGitHub; workflows de publicação desativados; não exportar valor |
| Auth/SMS/WhatsApp/fiscal/InfinitePay/Maps | FirebasePROD | Não consultados por proibição de acesso; referências conhecidas nos relatórios anteriores não são validação atual | Validar somente quando houver autorização específica de acesso; não copiar DEV |

Configurações de contas, Auth/domínios, coleções, índices, policies SMS e WhatsApp permanecem nos serviços. Backup de código não é backup remoto de Firestore. Não executar migrações/exportações de dados reais ou reutilizar allowlistDEV emPROD. Contas de recebimento devem ser confirmadas na janela final; tagsDEV não são prova independente de destinoPROD.

## Restauração — ordem obrigatória

1. Copiar os dois diretórios `credenciais` com os arquivos criptografados, relatórios de integridade e este roteiro para mídia segura/nova máquina. Guardar a senha em local separado e fazer cópia adicional segura fora do disco que será formatado. O pacote de auditoria limpo fica separado dos arquivos de credenciais.
2. Validar tamanho/SHA256 dos arquivos recebidos. Pelo7-Zip local, testar e extrair cada arquivo em pasta de staging vazia. Não extrair com caminhos absolutos nem substituir checkout já existente. O formato de arquivo usa caminhos completos sem letra da unidade (`-spf2`); são relativos ao staging. O manifesto faz o mapeamento antigo→novo.
3. Escolher `NovoRoot/Projeto`. Restaurar `projeto-doceria-main` e `projeto-doceria-multiloja` separadamente, incluindo `.git`. Worktrees externos podem ir em `NovoRoot/Projeto/_worktrees/dev/...` e `_worktrees/prod/...`. Não copiar credenciais de um ambiente para outro. Não exigir presença da máquina antiga.
4. No Git principal restaurado, usar `git worktree repair --relative-paths <caminhos-novos-dos-worktrees-existentes>` e conferir `git worktree list --porcelain`, branches,HEAD,alterações e remotes contra o manifesto. Não fazer prune/clean/reset ou recriar worktree por cima de arquivos existentes. Referências de worktrees que já não existiam continuam documentadas como tais.
5. Conferir os guards de build/deploy: alguns scripts usam caminhos absolutos desta máquina. Adaptar somente as comparações de caminhos para os **novos caminhos exatos DEV/PROD aprovados**, preservando todas as verificações de ProjectID e bloqueio cruzado. Não remover/desativar guards nem deduzir ambiente só por `.firebaserc`/bundles. Nenhum deploy até validar a nova associação de paths.
6. Instalar versões compatíveis Node22/Git/7-Zip/Java21 e FirebaseCLI15.34.1 por meios oficiais autorizados. Executar `npm ci --prefix crm` e `npm ci --prefix functions` em cada ambiente, respeitando seus próprios lockfiles. Reconfigurar Android SDK/local.properties e demais ferramentas somente na nova máquina. Não copiar caches para substituir teste de reconstrução.
7. Fazer login interativo oficial: `gh auth login`; `npx -y firebase-tools@15.34.1 login --reauth`; `gcloud auth login` eADC somente se necessário aos scripts autorizados; entrar noCodex pela conta oficial. Não copiar arquivos de sessão ou usar `login:ci` para fabricar token de transferência. Não trocar usuário/permissões remotas.
8. Conferir acesso somenteDEV `crmdoceria-9959e`, referências de Secrets e ambientes, sem exibir valores. Configurar variáveis locais recuperadas nos ambientes correspondentes. NÃO acessar FirebasePROD nem enviar SMS/pagamentos/WhatsApp/claims para testar login.
9. Executar guards, testes de fontes/React/backend/Rules em emuladores com projeto`demo-*` e rede externa bloqueada nos processos de teste, lint,build e diff-check. Conferir serviços fiscais/Android separadamente. BuildPROD é local, não deploy. Refazer somente o que a mudança de máquina/candidato justificar, não os vínculos reais aprovados.
10. Preparar Python3.11+ somente na nova máquina, por instalador oficial/gestão da organização. Validar a execução do intérprete; não contornar políticaWindows. Reinstalar a skill/plugin CodexSecurity pelo mecanismo oficial; backup do plugin0.1.32 é referência de versão/código, não autenticação. O helper `scripts/config_preflight.py` usa biblioteca padrão Python e módulos irmãos do plugin; copiar um único arquivo isolado não basta.
11. Ler `docs/C16_ASTRA_REVIEW_HANDOFF.md` e a matriz C16. Retomar o scan existente pelo mecanismo oficial; preservar scanId/contrato/artefatos. Se a nova conversa não tiver ownership do scan, usar recuperação/handoff oficial, sem inventar resultados ou apagar o anterior. Atualizar contexto dos caminhos/candidato de forma rastreável. Não executar nem copiar configuração global doCodex que contenha outros projetos/credenciais.
12. Executar preflight com oPython aprovado e os fatos reais da sessão, depois revisão AstraLow completa de ownership/legado/Rules/financeiro/credenciais/G1G2G3/multiloja e correções/retestes pertinentes. C16 só viraPASS após parecer e aceite consolidado; Fase10 então100%, global continua97%. Produção depende dos demais gates e autorização explícita.

Configuração e autenticação doCodex são separadas: preferências pessoais ficam em `~/.codex/config.toml` e overrides confiáveis podem ser por projeto. Revisar referências de paths e providers, sem importar credenciais nem alterar políticas gerenciadas. Fontes oficiais consultadas: [configuração](https://learn.chatgpt.com/docs/config-file/config-reference), [autenticação](https://learn.chatgpt.com/docs/auth).

## Comando de preflight na nova máquina — executar apenas lá

```powershell
# Substituir por caminhos reais aprovados após instalar o plugin oficialmente.
$pythonAprovado = 'CAMINHO_APROVADO/python.exe'
$pluginSecurity = 'CAMINHO_DO_PLUGIN_CODEX_SECURITY'
$devCheckout = 'NOVO_ROOT/Projeto/projeto-doceria-main/infinitepay-auth-worktree'
& $pythonAprovado "$pluginSecurity/scripts/config_preflight.py" --profile security_diff_scan --cwd $devCheckout --runtime-check delegation_available=true --runtime-check goal_tools_available=true --multi-agent-runtime-owner native --multi-agent-runtime-provenance tool-surface
```

Os flags de runtime são exemplos correspondentes à sessão atual: conferir a superfície real de ferramentas na nova sessão e fornecer somente fatos verificados; não fabricar protocolo/capacidade. Seguir a skill atual caso exija argumentos adicionais. Não alterar configuração persistente para satisfazer o helper sem a decisão aplicável do usuário.

## Prompt de continuidade no Codex da nova máquina

> Retome a migração Doceria pelo roteiro `docs/MACHINE_MIGRATION_20261113.md`, checkpointsDEV/PRODlocal e manifesto privado dos backups. Primeiro valide tamanho/SHA256, extração/restauração dos dois ambientes, Git/worktrees/alterações e isolamento de credenciais. Não acesse FirebasePROD. Não considere restauração completa antes de executar testes e builds nesta máquina. Reautentique oficialmente; não importe sessões protegidas. Reconfigure somente paths exatos dos guards após confirmar DEV→crmdoceria-9959e e PRODlocal→ana-guimaraes, mantendo bloqueio cruzado. Não publique backups/credenciais. Verifique os commits/pushes efetivamente registrados no checkpoint, sem presumir que foram concluídos. GitHubPROD main só pode receber push após bloqueio de todo mecanismo de deploy comprovado; Apps estavam inconclusivos por403. Instale/valide Python aprovado somente nesta máquina, retome o mecanismo AstraLow/scan e o candidato congelado conforme `C16_ASTRA_REVIEW_HANDOFF.md`. Preserve C15-E/G PASS, não repetir Thiago/SMS/claim. Fase9=100%,Fase10=93,75%(15/16),global97%,Fase13=0%,C16pendente,PRODREADY:NÃO até novas evidências. Feche C16 com revisão/aceite; depois preserve a ordem InfinitePayPROD→MercadoPago→códigoWhatsApp. PreparaçãoPRODlocal inclui Clientes/recebimento mas ainda requer Android/fiscal/configuração/rollback/revisão final. DeployDEV permanentemente autorizado com --project crmdoceria-9959e; FirebasePROD, dados remotos, mensagens, pagamentos e vínculos continuam bloqueados sem autorização específica. Não formatar ou apagar a máquina antiga até comprovar restauração integral.

## Checklist antes de formatar — todos precisam estar comprovados

- [ ] Dois backupsAES-256 criados, cabeçalhos protegidos e senhas guardadas separadamente pelo titular.
- [ ] Arquivos recebidos na nova máquina comSHA256/tamanho iguais; teste7-Zip, extração e comparação ao manifesto aprovados.
- [ ] HistóricoGit/branches/worktrees/uncommitted/untracked relevantes, credenciais locais e evidências privadas recuperados.
- [ ] Scripts externos e estado de auditoria recuperados; nenhum dado indispensável ficou só na máquina antiga.
- [ ] Credenciais remotas permanecem nos serviços e acesso legítimo está recuperado; sessões reautenticadas.
- [ ] Revisão de Secrets/PII/staged/commits feita; backups e dotenv reais fora doGit.
- [ ] Commits/pushes realmente executados e confirmados emDEV ePROD, ou bloqueios expressamente registrados sem alegar sincronização.
- [ ] Build/testes dos dois ambientes e guards da nova máquina aprovados; limitações fiscais/Android registradas e tratadas.
- [ ] C16/auditoria preparados e pendências claras; FirebasePROD intacto.
- [ ] Dono conferiu recuperação e autorizou posteriormente a formatação. Esta missão não autoriza apagar ou formatar.
