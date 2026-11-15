# Migração de máquina — estado verificado em 15/11/2026

## Resultado local

| Ambiente | Arquivo em credenciais | Tamanho exato | Integridade 7-Zip |
|---|---|---:|---|
| DEV | DEV-completo-20261113.7z | 629.650.646 bytes | PASS, retorno 0 |
| PROD local | PROD-completo-20261113.7z | 476.959.093 bytes | PASS, retorno 0 em 15/11 |

AES-256 e cabeçalhos criptografados. Senhas definidas e digitadas somente pelo titular no 7-Zip, separadas dos arquivos. Originais preservados. O teste PROD pendente foi retomado após a interrupção; nenhuma recriação foi necessária. A validação local não significa restauração na nova máquina.

SHA256 DEV: 1351c2cb49a3aaebb91cdbaebc98c6ebed804c1fa8ce0fb6c336144c49badee7.

SHA256 PROD: 94d0e11e42e8f09f8d002ab7a98f490d3397692a12e596269e37dee2123d5f02.

## O que copiar

Copiar integralmente, para destinos separados e mídia segura:

- DEV: C:/Users/antonio.pedro/Projeto/projeto-doceria-main/credenciais/
- PROD: C:/Users/antonio.pedro/Projeto/projeto-doceria-multiloja/credenciais/

Manter as senhas separadamente. Nenhum arquivo dessas pastas pode entrar no Git, mesmo criptografado. Arquivos sensíveis da aplicação estão nos arquivos 7z; os complementos externos são ferramentas e metadados sem valores de credenciais. Pacote de auditoria sem credenciais separado: C16-AUDITORIA-SEM-CREDENCIAIS-20261113.zip (2.789.038 bytes).

Backups preservam fontes, Git, branches, worktrees existentes, alterações locais necessárias, documentos, evidências, credenciais locais aplicáveis e helpers Doceria. Não transferem cookies, sessões CLI/Codex ou credenciais protegidas pelo Windows. Não são exportação de Firestore remoto. Caches e dependências reinstaláveis foram excluídos; lockfiles preservados.

## Sequência na nova máquina

1. Comparar tamanho e SHA256 dos dois arquivos recebidos. Executar teste e extração no 7-Zip para duas pastas de staging vazias, digitando senha somente no aplicativo.
2. Antes de mover fontes ou reparar Git, verificar todos os arquivos extraídos pelo manifesto de cada ambiente:

```powershell
node .\migration-tools\doceria-verify-restored.cjs --manifest .\backup-source-manifest.json --extracted 'CAMINHO_STAGING' --expected-manifest-sha256 'HASH_MANIFESTO'
```

Usar o hash de manifesto em archive-integrity.json. DEV: 17.022 arquivos; PROD: 7.502. Resultado exigido: PASS, missing 0, mismatched 0. O verificador teve 3/3 testes sintéticos aprovados; a execução real na nova máquina está PENDENTE.

3. Seguir RESTORE_MACHINE.md e [guia completo](MACHINE_MIGRATION_20261113.md): restaurar fontes/.git e worktrees externos, reparar caminhos sem reset/clean/prune, adaptar somente os paths exatos dos guards mantendo Project ID e bloqueios entre ambientes.
4. Reautenticar oficialmente GitHub, Firebase, Google Cloud e Codex. Não transferir sessões nem recriar chaves remotas existentes. Não acessar Firebase PROD. Instalar ferramentas por método autorizado e dependências pelos lockfiles; executar builds/testes nos dois ambientes e verificar runtimes fiscal/Android separadamente.
5. Restaurar/reinstalar o plugin de segurança oficial e Python aprovado somente na nova máquina. Executar o handoff C16 conforme docs/C16_ASTRA_REVIEW_HANDOFF.md no candidato exato. Não repetir C15, SMS ou vínculos já aprovados.
6. Somente após evidência de restauração integral, acesso legítimo e builds/testes na nova máquina, deliberar a formatação. Nenhuma exclusão ou formatação foi autorizada por esta preparação.

## Git e diferenças documentais posteriores aos snapshots

Na retomada, DEV local/origin: b3a08d7265139b425028fcf3132a85ebf9217155. PROD preparação/main local/origin main: 05d04995c0af48e378005fdd60d1447a0bfb8501. Ambos já publicados como candidatos. Este registro acrescenta somente documentação; os novos hashes do push devem ser confirmados no encerramento e em MIGRATION_CURRENT_STATE.json, fora do Git.

O 7z DEV preserva snapshot b2fe7cd4; o PROD preserva 05d04995. Não sobrescrever manifestos ou arquivos saudáveis para atualizar documentação. Os documentos posteriores e ferramentas suplementares acompanham as pastas de transferência e os GitHubs. Artefatos locais não rastreados permanecem preservados, sem adição indiscriminada.

## Publicação e gates

GitHub PROD workflows merge/PR disabled_manually, arquivos locais somente CI, 67 execuções históricas/nenhuma ativa na conferência de 15/11. Apps conferidos pelo Dono anteriormente; nenhum novo publicador identificado. Push não autoriza Firebase PROD. Nenhum acesso ou deploy Firebase PROD realizado; nenhuma alteração funcional requer novo deploy DEV.

Fase 9: 100%; Fase 10: 93,75% (15/16); C15-E/G: PASS; C16: PENDENTE; global formal: 97,00%; Fase 13: 0%; PROD READY: NÃO. Além da auditoria C16, gates Android, fiscal, logística, configurações e rollback mantêm os estados registrados. O mapa com confirmação repetida permanece pendência complementar independente; não invalida C15. Não inflar percentuais por backups ou commits.
