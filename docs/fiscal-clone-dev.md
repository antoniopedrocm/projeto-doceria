# Clonar Nota Fiscal — DEV

## Ambiente e arquitetura

- Repositório solicitado: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`.
- Worktree fiscal exclusivo: `C:\Users\antonio.pedro\.codex\worktrees\fiscal-flow-dev\projeto-doceria-main`.
- Branch: `codex/fiscal-clone-dev`; base: `5dba830e`; remote utilizado: `origin` (`antoniopedrocm/projeto-doceria`).
- Firebase: **crmdoceria-9959e**. Produção `ana-guimaraes` não faz parte desta entrega.
- A aplicação usa React em `crm/src/App.js`, callables exportadas por `createFiscalFunctions` e documentos `lojas/{lojaId}/invoices/{id}`. XMLs históricos ficam no Storage protegido. Numeração é controlada por `fiscalCounters`.
- O backend publicado já possuía `fiscalSaveDraft`, `fiscalCheckDraft` e `fiscalIssueDraft`, mas a base mais recente tinha perdido o editor correspondente. A entrega recupera os commits fiscais existentes (4b62eb3b, 9d4ed46b e aafd0cca), preservando os catálogos atuais **+ Novo NCM** e **+ Novo CFOP**, e usa esse mesmo fluxo para o clone.
- A comparação entre os source maps do DEV anterior e o build desta branch encontrou alteração apenas em `App.js` e inclusão de `components/FiscalCloneConfirmation.js` entre os fontes da aplicação; os outros módulos permanecem iguais.

## Interface e fluxo

O ícone de cópia, com tooltip **Clonar Nota Fiscal**, aparece na coluna de ações de **Nota Fiscal > Notas emitidas** para notas autorizadas, rejeitadas e canceladas, respeitando acesso de escrita.

1. O usuário abre a confirmação, que identifica NF-e ou NFC-e e explica que será criado um rascunho não emitido.
2. Cancelar fecha a confirmação sem chamar o backend.
3. Confirmar chama `fiscalCloneInvoice` e abre o novo documento no editor existente.
4. O editor mostra **RASCUNHO — DOCUMENTO NÃO EMITIDO**, identifica discretamente a origem e permite editar cliente, endereço, itens, quantidades, preços, classificação fiscal, CFOP por item, observações e valores adicionais.
5. **Salvar e Validar** persiste mesmo com campos incompletos e informa pendências. Alterações invalidam a checagem anterior.
6. A emissão fica disponível após salvar e validar os dados atuais. A prévia mostra o documento não emitido, permite **Checar requisitos**, e exige confirmação final específica para NF-e ou NFC-e. O backend revalida antes de transmitir.

A seleção intencional de outro cliente/produto preenche os dados do cadastro escolhido. Antes disso, o clone usa o snapshot histórico sem substituir silenciosamente seus dados pelo cadastro atual. Trocar um produto limpa o CFOP individual anterior para herdar a operação e atualiza seus campos fiscais.

## Dados copiados e identidade fiscal

**Copiados por lista explícita:** modelo 55/65; vínculo e dados editáveis do destinatário (documento, inscrição estadual, contato, endereço completo e indicadores existentes); vínculo/código/descrição dos produtos, quantidade, preço, desconto, unidade, NCM, CFOP, origem, CST/CSOSN, PIS/COFINS, CEST, benefício e IPI CST quando presentes; natureza, presença, pagamento, observações, modalidade de frete e despesas existentes.

**Totais:** recalculados dos itens com arredondamento monetário por item, descontos, frete, seguro e outras despesas. O total final histórico não é confiado.

**Não copiados:** ID da nota, número/série fiscal antiga, chave, protocolo de autorização/cancelamento, recibo, identificadores SEFAZ, XML autorizado/assinado, assinatura/digest, QR Code, DANFE, datas fiscais antigas, status antigo, idempotency key, requestId/jobId e dados de retorno/tentativa do provedor. Não há novo movimento de estoque herdado.

A nova nota recebe outro ID interno, `status: draft`, `number: null`, sem vínculo de emissão com o pedido original. Só `fiscalIssueDraft` reserva uma nova numeração na série/configuração vigente; clonar, editar, salvar, checar e visualizar não avançam o contador. Os metadados `clonedFromFiscalDocumentId`, `clonedFromModel` e `clonedFromNumber` são exclusivamente auditoria da origem.

NF-e permanece NF-e e NFC-e permanece NFC-e. O modelo do clone fica bloqueado também no backend. Clones de rejeitadas/canceladas têm estado e operação novos; seus documentos originais e históricos continuam intactos.

## Fontes históricas e limitações

- Prioridade: snapshot fiscal da nota. Se o snapshot estiver incompleto e houver artefato, o backend extrai somente campos editáveis do XML histórico da própria nota/loja. XMLs malformados, maiores que 2 MB ou com DTD/entidades são recusados; nenhum XML é copiado para o rascunho ou impresso em logs.
- Também é suportado snapshot manual anterior. Para notas antigas sem snapshot/XML, o pedido atual pode servir como base **com aviso explícito** de possível divergência; classificações fiscais ausentes ficam pendentes. Sem fonte reutilizável, a clonagem é recusada com mensagem específica.
- O XML builder atual não transmite CEST, código de benefício ou IPI e usa modalidade de frete 9. Clones que dependem desses campos ficam com pendência bloqueante, em vez de perder informação durante a transmissão. A integração e o responsável fiscal devem validar/ampliar o suporte antes de emitir esses casos.
- Não são escolhidos NCM, CFOP, CST/CSOSN ou alíquotas por suposição. As validações existentes de emitente, certificado, destinatário, CPF/CNPJ, CEP, endereço, itens, tributos, totais, modelo e série são reutilizadas.
- Testes de transmissão usam provedor simulado; nenhuma emissão/cancelamento/inutilização real na SEFAZ é necessária para testar a clonagem.

## Backend, auditoria e multiloja

`fiscalCloneInvoice` exige autenticação, usuário ativo com permissão de gestão fiscal e acesso à loja específica. Lê a nota original no backend, valida estado/modelo/loja e ignora dados fiscais arbitrários enviados pelo cliente. Consulta de XML exige caminho da própria nota e loja. O clone permanece no mesmo `lojaId`.

O ID novo é derivado da loja, usuário, nota de origem e token **novo da confirmação**. Uma transação garante um documento por confirmação; clique duplo e retry após timeout retornam o mesmo clone. Uma confirmação nova pode criar outro rascunho independente. A interface também bloqueia chamadas concorrentes e descarta retornos após troca de loja.

O histórico novo registra ação `cloned`, UID, nome disponível, timestamp, modelo, documento de origem e fonte dos dados. Salvar/editar/validar/emitir continuam no histórico fiscal existente. Nenhuma escrita é feita na nota original.

As Rules locais recuperam somente a proteção fiscal já existente nas Rules publicadas: notas, inutilizações, contadores e bloqueios não podem ser escritos diretamente pelo navegador. **Sem deploy de Rules**, índices, Storage, Cloud Run ou outros módulos nesta entrega. Contadores e originais não são alterados ao clonar.

## Verificações

- Backend: `npm run test:fiscal` — **27/27**.
- Frontend: `CI=true npm test -- --watchAll=false --runInBand --testMatch '**/FiscalCloneConfirmation.test.js'` — **4/4**.
- Firestore emulator: `npm run test:fiscal:integration` — **7/7**, incluindo isolamento/permissões de Rules e transação concorrente de clones.
- Cobertura: NF-e/NFC-e autorizadas, rejeitadas/canceladas, novo ID/rascunho, exclusão de identidade fiscal, cópia dos dados editáveis, arredondamentos/totais, edição de cliente/item/quantidade/observação, checagem e correção, preservação do snapshot frente ao cadastro, XML protegido, fallback legado explícito, contador/original intactos, idempotência, modelo, autenticação, permissão e loja.
- Lint dos arquivos alterados: sem erros. O lint geral de Functions tem dois erros preexistentes `globalThis` em `whatsapp-client.js:37` e `whatsapp.js:12`; não foram alterados. App.js conserva avisos existentes de hooks/variáveis.
- Build: aprovado, com avisos existentes de source map de `native-audio` e bases Browserslist/Baseline desatualizadas.
- Build inicial para publicação: `main.668f0ab4.js`; SHA256 `0425a431686f2bcf57c1686145c0a2a3390083447f5f33e878cdc3f6dcf09d9e`.
- `git diff --check`: aprovado. Alterações limitadas ao módulo fiscal, seu componente, testes e documentação; o suporte compartilhado de Table só adiciona flags opcionais de ações.
- Windows/JDK 25: o emulator usa `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=<worktree>/.java-socket-unavailable` somente no processo, acionando o fallback TCP do JDK; não altera configurações do sistema.

## Arquivos

- `crm/src/App.js`
- `crm/src/components/FiscalCloneConfirmation.js`
- `crm/src/components/FiscalCloneConfirmation.test.js`
- `functions/fiscal.js`
- `functions/fiscal-clone.js`
- `functions/fiscal-clone.test.js`
- `functions/fiscal-clone.rules.test.js`
- `functions/fixtures/fiscal-clone.xml` (fixture sintético)
- `functions/fiscal-core.js` e `functions/fiscal-core.test.js`
- `functions/fiscal-flow.test.js` e `functions/fiscal-flow.integration.test.js`
- `functions/package.json` e `functions/package-lock.json` (parser XML direto na versão já presente no lock)
- `firestore.rules` (sincronização da proteção fiscal existente; sem publicação)
- `docs/fiscal-clone-dev.md`

## Publicação DEV

Comandos seletivos executados a partir do worktree desta branch, usando o build gerado nele:

```powershell
firebase deploy --project crmdoceria-9959e --only functions:fiscalCloneInvoice,functions:fiscalSaveDraft,functions:fiscalCheckDraft,functions:fiscalIssueDraft --non-interactive
firebase deploy --project crmdoceria-9959e --only hosting:prod --non-interactive
```

O alias de Hosting `prod` neste projeto aponta para o site **crmdoceria-9959e**, confirmado antes da publicação; não aponta para o projeto de produção. Resultado da publicação, verificação da interface e commits serão registrados após conclusão.
