# Restauração do cadastro de NCM em DEV — 07/10/2026

Repositório DEV: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main`.
Worktree de trabalho: `C:/Users/antonio.pedro/.codex/worktrees/fiscal-flow-dev/projeto-doceria-main`.
Branch: `codex/fiscal-ncm-restore-dev`; base: `64b4e33b`.
Projeto Firebase exclusivo: `crmdoceria-9959e`.

## Causa confirmada

O bundle DEV servido, `main.9dbcb1de.js`, não continha `+ Novo NCM`, `fiscalSaveNcmOption` nem os componentes de cadastro inline. O App.js extraído do source map correspondia exatamente à branch de Ponto Horista publicada em 06/10. O frontend dessa base não incorporava o cadastro de NCM publicado em 01/10 no commit `cb06d4ff`.

As Functions `fiscalGetConfiguration` e `fiscalSaveNcmOption` continuam ACTIVE desde 01/10. O pacote de fonte da Function publicada foi conferido: fiscal.js corresponde ao commit original, e os dois handlers de NCM são idênticos aos restaurados nesta branch. Esta correção precisa publicar somente Hosting.

## Correção

O botão `+ Novo NCM` foi reaplicado sobre a base DEV atualmente publicada, ao lado de `NCM do produto`. Abre campos de código e descrição no próprio modal, valida formato e duplicidade, salva por loja na configuração fiscal existente e seleciona o código criado. O catálogo também é usado nos itens da nota. O cadastro não determina classificação ou tributação; o contador continua responsável por validá-las.

O código dos dois handlers já publicados foi incorporado à nova base para que o repositório contenha a integração chamada pelo frontend. Não foram criadas novas coleções, regras ou integração paralela.

Comparação dos 40 módulos locais do source map anterior com a nova base: somente App.js difere. Os outros 39, incluindo Ponto Horista, iFood Hub e 99Food Hub, permanecem iguais. No diff de App.js, todas as alterações pertencem ao cadastro e seleção de NCM.

## Verificação

- `npm run test:fiscal:ncm`: quatro testes de persistência, preservação de configuração, multiloja, formato, duplicidade concorrente e permissões.
- `npx eslint fiscal.js fiscal-ncm-options.test.js`: aprovado.
- `npx eslint src/App.js --quiet`: aprovado.
- Lint geral das Functions: dois erros preexistentes `globalThis/no-undef` em whatsapp.js e whatsapp-client.js; esses arquivos não foram alterados.
- Verificação da interface autenticada indisponível: as ferramentas de navegação e computer-use falharam ao inicializar, com `failed to write kernel assets`.
- Build aprovado com os avisos existentes de Browserslist/Baseline e source maps de native-audio. Bundle gerado: `main.f12a9d3e.js`; SHA256: `e9a2342adf1229e91186b17fbea8ce5611c5e6e36e62e83a96fb5bc8fc96b820`.
- Comparação entre os 40 módulos locais dos dois source maps compilados: apenas App.js mudou; botão e callable de cadastro presentes no novo bundle.

## Publicação

Comando autorizado: `firebase deploy --project crmdoceria-9959e --only hosting:prod --non-interactive`.
O nome local do target é `prod`, mas seu site neste Project ID é exclusivamente DEV: `crmdoceria-9959e`.

Nas próximas publicações DEV, usar esta base consolidada ou incorporar o cadastro de NCM antes do build. Publicar uma branch anterior sem essa alteração substitui o frontend e remove o botão novamente.
