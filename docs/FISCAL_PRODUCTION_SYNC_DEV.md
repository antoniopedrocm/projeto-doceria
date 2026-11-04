# Sincronização fiscal de produção para DEV — 2026-10-31

## Escopo e base
- Workspace: C:/Users/antonio.pedro/Projeto/projeto-doceria-main/.fiscal-sync-producao-dev.
- Branch: codex/fiscal-sync-production-dev. Firebase: crmdoceria-9959e.
- Base DEV: 0142aad0, mesmo código funcional da release DEV 9959c630 (bundle main.8b290d13.js), verificado contra Hosting e fonte da Function publicada.
- Referência somente leitura de produção: codex/fiscal-numbering-controls-producao, 1c36ce68/6b353495; melhorias fiscais desde 662de0c2.
- Nenhuma publicação, escrita de dados ou mudança de configuração em ana-guimaraes.

## Melhorias incorporadas
- Frete manual/avulso editável, persistente, totais compartilhados frontend/backend em centavos, rateio determinístico e XML com soma dos itens igual ao frete total; modalidade explícita; sem produto fictício.
- Rejeição original preservada; consulta 217 como informação adicional. Histórico visual começa na transmissão, mantendo auditoria armazenada e sem copiar identidade fiscal na clonagem.
- Próximo número de NF-e 55/NFC-e 65 na configuração, confirmação, revisão otimista, idempotência, bloqueio de números conhecidos e auditoria server-only.
- Contadores por loja/CNPJ, ambiente, modelo e série; reserva transacional no início da emissão; rascunho/prévia/checagem não reservam números.
- Administração fiscal e operações auxiliares do Contador autorizado alinhadas à produção, mantendo as permissões existentes e validação no backend.
- Rules: isolamento de leitura de notas/inutilizações e negação de mutações diretas de notas, contadores, reservas e recibos de alteração manual.

## Preservação do DEV
- App.js fora do componente NotaFiscal e três imports fiscais novos permaneceu idêntico, confirmado por AST.
- Mantidos os adaptadores fiscais de pagamento online/forma de pagamento combinada e frete a combinar do DEV, com testes de regressão. Nenhum módulo de pagamento alterado.
- iFood Hub, 99Food Hub, Clonar Nota Fiscal e Salvar e Validar permanecem no build.
- 52 arquivos públicos da release DEV mantidos byte a byte; novo JS/CSS/index/manifest da branch desta tarefa.
- Ambiente fiscal DEV homologation (tpAmb=2), séries 1/1; não copiar contadores, certificado, secrets, documentos ou configuração fiscal de produção.
- Runtime PHP/NFePHP preservado a partir do digest DEV 20cd32576a6823dc79053f7062883b9ee5482aeb92d103af485cafc5d9104e60; extensão bcmath para rateio exato.

## Validação
- Backend: 60 testes aprovados (incluindo 2 regressões específicas dos adaptadores DEV).
- Frontend: 52 suítes, 556 testes aprovados; reexecução final aprovada.
- Firestore real em emulador Linux/Java21: 8 testes aprovados, sem transmissão; Cloud Build 4e7b643c-f915-44df-a828-7594ecf594b5.
- PHP: lint, 12 verificações de payload, XML/esquema/assinatura local, centavos, DANFE, pedido legado e NFC-e aprovados; Cloud Build 4b5f18e5-fe50-4b67-8ff0-33024cda1fc8.
- ESLint frontend/backend sem erros. Build aprovado com avisos preexistentes de sourcemaps NativeAudio/Browserslist, sem atualizar dependências.
- git diff --check aprovado. Rules publicadas anteriores iguais à base DEV antes da alteração.
- Build main.a41f437e.js, SHA256 25547659874bb15d929a2b87049478a8d402c8e95eb8f072e480f9d9ad6724fc; sourcemap confirma App.js atual.
- Jest executado com testRegex em lugar de testMatch para contornar expansão de caminho Windows do diretório .fiscal-sync-producao-dev. Não foi alterada a configuração de testes da aplicação.

## Publicação
Somente serviço fiscal Cloud Run DEV, callables fiscais, firestore:rules e Hosting DEV; nenhum índice/Storage/Function não fiscal.
Publicação concluída: 24 Functions fiscais ACTIVE, Rules conferidas via API, Cloud Run revisão ana-guimaraes-fiscal-service-00021-n2j com 100% do tráfego, Hosting com 66 arquivos.

Comandos exatos, executados exclusivamente no workspace DEV acima:

```powershell
gcloud run services update ana-guimaraes-fiscal-service --project crmdoceria-9959e --region us-central1 --image us-central1-docker.pkg.dev/crmdoceria-9959e/cloud-run-source-deploy/fiscal-sync-production-dev@sha256:3dd8087dd1ef2b33315203e9ab9c84580151149795b49b3d7ad0255e9a30e1f2 --quiet
firebase deploy --project crmdoceria-9959e --only 'functions:fiscalResolveOrderPaymentMethod,functions:fiscalGetNumbering,functions:fiscalSetNextNumber,functions:fiscalCloneInvoice,functions:fiscalSaveDraft,functions:fiscalCheckDraft,functions:fiscalIssueDraft,functions:fiscalInutilizeNumbering,functions:fiscalGetConfiguration,functions:fiscalSaveNcmOption,functions:fiscalSaveCfopOption,functions:fiscalListCfopOptions,functions:fiscalSaveConfiguration,functions:fiscalSaveProducts,functions:fiscalDeleteProduct,functions:fiscalUpdatePreInvoiceOrder,functions:fiscalValidateOrder,functions:fiscalUploadCertificate,functions:fiscalIssueInvoice,functions:fiscalIssueManualInvoice,functions:fiscalCancelInvoice,functions:fiscalRefreshInvoice,functions:fiscalGetInvoice,functions:fiscalGetInvoiceArtifact,firestore:rules' --non-interactive
firebase deploy --project crmdoceria-9959e --config firebase.fiscal-dev.local.json --only hosting --non-interactive
```

O config local de Hosting aponta para .fiscal-dev-release/hosting e reutiliza integralmente guard/headers/rewrites da base DEV. A pasta contém os 52 arquivos públicos inalterados da release DEV anterior, index/manifest e static gerados nesta branch; os assets estáticos anteriores foram conservados para abas já abertas.

Pós-deploy: HTTP 200 com main.a41f437e.js e SHA256 conferido; 52/52 arquivos públicos online idênticos; configurações/revisão e ambos os documentos de contadores DEV idênticos antes/depois; URL fiscal DEV preservada e sem override de ambiente; fiscalGetNumbering/fiscalSetNextNumber retornam 401 UNAUTHENTICATED sem login.

Commit de implementação: 48655bc1, enviado para origin/codex/fiscal-sync-production-dev. Evidências resumidas: docs/evidence/fiscal-production-sync-dev/validation.json.

## Limites
Não foram executadas emissão, cancelamento ou inutilização reais, nem alterada a próxima numeração. Funcionalidade fiscal foi alinhada; ambientes conservam seus próprios dados, credenciais, séries e configurações.

Não houve aceite visual autenticado nesta tarefa. A confirmação da interface está coberta pelos testes React, presença no bundle e verificação do artefato publicado.

## Correção da inicialização em branco
A verificação anterior de hash/HTTP e testes de componentes não detectou que o worktree novo não tinha crm/.env.production.local (ignorado pelo Git). O bundle main.a41f437e.js interrompia a inicialização com a mensagem Configuração Firebase DEV incompleta ou vinculada a outro projeto, por ausência de API Key Web e App ID.

Foi reutilizada exclusivamente a configuração pública Web de crmdoceria-9959e da base DEV anterior, mantendo-a no arquivo local ignorado. Nenhuma configuração fiscal, contador ou secret de servidor foi copiado. Adicionado scripts/assert-dev-client-config.cjs ao prebuild, usando o mesmo carregador/precedência do react-scripts; cinco testes validam configuração completa, ausência de campos, placeholders, projeto errado e identidades incompatíveis. O runtime guard foi preservado.

Build corrigido: main.5a33d589.js, SHA256 3c64b1dd18adbeb01bfcb467cd442e807ffd671f6d4537b17f040171df1fd0b2. Candidato aberto em Edge headless com o hostname DEV e os assets locais interceptados: página inicial renderizada, 570 caracteres, root com conteúdo, zero pageerrors. Sem login, alterações de dados ou transmissão fiscal. ESLint sem erros e git diff --check aprovado.

Publicação desta correção: somente Hosting DEV com o mesmo comando seletivo e pacote público preservado. Pós-deploy validado em Edge headless no endereço real do DEV: primeira abertura e recarga com conteúdo renderizado (570 caracteres, root preenchido), zero erros de JavaScript e main.5a33d589.js. SHA256 online igual ao build local. Commit da correção a5463506, enviado ao remoto DEV. Nenhuma Function/Rule republicada e nenhuma configuração fiscal alterada nesta correção.
