# Restauração das ações — Nota Fiscal > Emitir

## Ambiente e entrega

- Data: 07/10/2026.
- Repositório DEV: `C:\Users\antonio.pedro\Projeto\projeto-doceria-main`.
- Worktree fiscal reutilizado: `C:\Users\antonio.pedro\.codex\worktrees\fiscal-flow-dev\projeto-doceria-main`.
- Branch exclusiva: `codex/fiscal-emit-actions-dev`, criada a partir de `f7a15b1f` (clonagem aprovada).
- Origin: `https://github.com/antoniopedrocm/projeto-doceria.git`.
- Commit da correção: `408a0911`, enviado para origin.
- Firebase DEV: `crmdoceria-9959e`. Produção `ana-guimaraes` não foi alterada.

## Investigação Git e causa

Foram consultados `git log --all`, `git blame`, `git show` e o diff dos commits fiscais.

O commit `aafd0cca` (`fix(fiscal): save and validate before enabling issue`) fez a substituição original da ação de validação pelo salvamento seguido de validação. Essa alteração foi incorporada na base publicada de DEV pelo commit `3a116fa2` (`feat(fiscal): clonar notas em rascunhos independentes`). A causa está no array `orderActions`: `RefreshCw / Validar` foi substituído por `Save / Salvar e Validar`.

Editar e o ícone de impressora permaneceram no código. A impressora ganhou texto e critérios de habilitação do novo fluxo. Portanto, não houve remoção dos três handlers nem falha de CSS; houve substituição da checagem independente e mudança na apresentação da emissão.

### Funções reais anteriores

| Ícone | Handler anterior | Comportamento comprovado |
| --- | --- | --- |
| Editar | `handleOpenPreInvoiceOrderEdit`, `handleSavePreInvoiceOrderEdit` | Abre o modal do pedido selecionado, carrega cliente, contato/endereço, pagamento, produtos, quantidades, preços, desconto, frete e observações. Salva alterações em `pedidos` da loja selecionada. |
| Setas circulares | `handleValidateOrder` → `requestOrderValidation` → `fiscalValidateOrder` | Valida dados fiscais e apresenta resultado/prévia sem criar rascunho nem emitir. Não era sincronização ou reprocessamento. |
| Impressora | `handleIssueOrder` → `handleConfirmIssue` | **Era a ação Emitir**, com validação e confirmação. O download do DANFE acontecia somente depois de autorização, se o PDF estivesse disponível. Não era impressão de prévia. |

Os handlers de edição e emissão continuam reutilizados. O handler atual `handleValidateOrder` continua dedicado a **Salvar e Validar**. A checagem independente foi restaurada em `handleCheckOrderRequirements`, utilizando os callables fiscais existentes.

## Correção e convivência

A coluna Ações da aba Emitir agora oferece:

1. **Editar pedido / rascunho**: abre o pedido correto. Se houver rascunho, carrega seu modelo, CFOP e observações e identifica o registro como DOCUMENTO NÃO EMITIDO. Como o rascunho de pedido referencia o pedido original, os itens continuam no editor histórico do pedido. Salvar atualiza o pedido e o mesmo rascunho, pelas chaves determinísticas já usadas pelo backend. Sem rascunho, mantém o salvamento histórico do pedido.
2. **Setas — Checar requisitos (sem salvar ou emitir)**: usa `fiscalValidateOrder` para pedido ainda sem rascunho ou `fiscalCheckDraft` para o ID do rascunho existente. A checagem de rascunho mantém o registro de validação existente no backend; não chama `fiscalSaveDraft`, emissão ou contador de numeração.
3. **Salvar e Validar**: continua salvando o rascunho antes da checagem, inclusive quando há pendências. Rascunho de modelo já definido não é convertido nem duplicado por seleção diferente; o usuário recebe orientação para abrir Editar e continuar no modelo existente.
4. **Impressora — Emitir Nota Fiscal, NF-e ou NFC-e**: continua exigindo rascunho, validação válida, modelo explícito e CFOP correspondente. Revalida e abre confirmação; somente a confirmação envia emissão.

Editar invalida a checagem anterior. Checar um rascunho com CFOP diferente no seletor não atribui esse novo CFOP ao registro ainda não salvo, nem libera emissão com dados divergentes.

As ações de preparação ficam indisponíveis para documento autorizado, cancelado ou em processamento, segundo o bloqueio existente. As operações ficam desabilitadas enquanto outra operação fiscal está em andamento. O perfil contador continua sem ações de alteração/emissão. As permissões e o isolamento por loja continuam no backend existente.

Não foram criados novos estados, coleções, regras tributárias, funções Firebase ou serviços fiscais.

## Área preservada

A comparação do código por AST com `f7a15b1f`, normalizando apenas CRLF/LF, confirmou igualdade de:

- JSX completo da aba Notas emitidas;
- `invoiceColumns`, `invoiceActions` e `handleViewOrderDraft`;
- `handleOpenCloneInvoice` e `handleConfirmCloneInvoice`;
- `handleIssueOrder` e `handleConfirmIssue`;
- handlers de cancelamento;
- código anterior ao componente fiscal, exceto o import do helper exclusivo de Emitir.

O diff não altera backend, Firestore Rules, componente de confirmação da clonagem, cancelamento ou inutilização. O componente Table compartilhado também não foi alterado.

## Testes e resultados

### Automatizados

- **25/25 testes frontend**, três suites: ações de Emitir, handlers reais extraídos do App.js com Firebase simulado e confirmação de clonagem existente.
- **27/27 testes backend fiscal**, incluindo rascunhos, pendências, pedidos antigos, NF-e/NFC-e, permissões/multiloja, clonagem, cancelamento e inutilização.
- ESLint dos arquivos frontend alterados: **sem erros**.
- `git diff --check` e revisão do diff: aprovados.
- Build: aprovado, com avisos existentes de source maps do pacote native-audio e bases de navegadores desatualizadas.

Comandos:

```powershell
# No diretório crm do worktree fiscal:
$env:CI='true'
npm test -- --watchAll=false --runInBand --testMatch '**/fiscalOrderActions.test.js' '**/fiscalEmitHandlers.test.js' '**/FiscalCloneConfirmation.test.js'
npx eslint src/App.js src/fiscalOrderActions.js src/fiscalOrderActions.test.js src/fiscalEmitHandlers.test.js --quiet

# No diretório functions do mesmo worktree:
npm run test:fiscal

# Na raiz do worktree, após confirmar caminho, branch e Project ID DEV:
$env:CI='true'
npm --prefix crm run build
git diff --check
```

### Cobertura dos cenários solicitados

| Cenário | Evidência |
| --- | --- |
| Emitir carrega; pedidos sem/com rascunho exibem ações | Conferência no DEV publicado e testes das ações. |
| Editar abre o registro correto e reutiliza rascunho | Handlers reais testados; no DEV abriu editor histórico sem rascunho e editor identificado com o ID do rascunho já existente. Ambos fechados sem alterar dados. |
| Setas executam validação histórica | Teste dos callables e execução real no DEV: pedido permaneceu Pendente; resultado e prévia retornados; emissão continuou desabilitada por ausência de rascunho. |
| Impressora preserva emissão/confirmar/DANFE | Testes dos handlers reais: antes de confirmar chama apenas checagem; após confirmar chama emissão; só baixa DANFE se autorizado. |
| Prévia não é DANFE autorizado | Conferência real de PRÉVIA — DOCUMENTO NÃO EMITIDO e testes do gate de download. |
| Salvar e Validar e Checar requisitos | Testes de salvamento anterior à checagem, pendências preservadas, checagem sem salvamento e reutilização de ID. |
| Emissão e modelos separados | Testes de handlers para modelos 55 e 65 e bloqueios por modelo/CFOP/rascunho. |
| Confirmação e cancelamento da confirmação | Testes dos handlers: só a confirmação emite; confirmação encerrada não envia operação. |
| Notas emitidas e Clonar Nota Fiscal | Código protegido igual à base aprovada; suites de clonagem frontend/backend passaram. |
| Cancelamento e inutilização | Código inalterado; testes fiscais existentes passaram. |

## Build e deploy DEV

Antes da publicação, a versão disponível ainda era `main.45d18dd7.js`, a base aprovada. O source map do build novo foi comparado com o App.js e o helper atuais. Os **outros 501 módulos de código** existentes no build publicado foram preservados.

O bundle novo contém **iFood Hub**, **99Food Hub**, **Clonar Nota Fiscal** e a checagem restaurada. Os dois Hubs também foram observados no menu do DEV publicado.

Comando exato do deploy, executado na raiz do worktree fiscal:

```powershell
firebase deploy --project crmdoceria-9959e --only hosting:prod
```

`prod` é o nome do target Hosting já existente dentro do projeto **DEV crmdoceria-9959e**, associado ao site `crmdoceria-9959e`. Não aponta para o Firebase de produção `ana-guimaraes`.

- Deploy Hosting DEV: concluído.
- URL: https://crmdoceria-9959e.web.app
- Bundle: `/static/js/main.66cc25bb.js`.
- SHA-256 local e publicado, verificados iguais: `CF484A8E98B5F9E6916E31D44BBE2AF932764ED14DFF85865753C1D1E29B4271`.
- Functions, Rules, índices, serviço fiscal e produção: sem publicação nesta tarefa.

## Arquivos alterados

- `crm/src/App.js`: integração das ações e edição do rascunho de pedido, exclusivamente Emitir.
- `crm/src/fiscalOrderActions.js`: helper de seleção/checagem e definição das ações de Emitir.
- `crm/src/fiscalOrderActions.test.js`: testes de callables, estado e separação de modelos.
- `crm/src/fiscalEmitHandlers.test.js`: testes dos handlers reais de edição e confirmação/download.
- `docs/fiscal-emit-actions-dev.md`: este relatório.
- `docs/screenshots/fiscal-emit-actions-dev.jpg`: evidência recortada dos controles, sem dados pessoais.

## Limitações da validação

A configuração fiscal da loja dentro do Firebase DEV indica ambiente SEFAZ **production**. A execução real foi limitada à checagem sem emissão e à abertura/fechamento dos editores. Emissão, cancelamento e inutilização foram validados com serviços simulados; não houve transmissão real desses eventos durante os testes. A clonagem aprovada não foi executada novamente no banco do usuário; seu código permaneceu intacto e os testes existentes passaram.

Não se alteraram parâmetros contábeis nem se interpretaram NCM/CFOP por suposição. Não há nova regra tributária para aprovação nesta correção.
