# Cadastro de CFOP em DEV — 07/10/2026

Repositório DEV: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main`.
Worktree do mesmo repositório: `C:/Users/antonio.pedro/.codex/worktrees/fiscal-flow-dev/projeto-doceria-main`.
Branch: `codex/fiscal-cfop-dev`; base: `e9047dad`, correspondente ao frontend DEV com cadastro de NCM já restaurado.
Project ID exclusivo: `crmdoceria-9959e`.

## Comportamento

Na nota manual, `+ Novo CFOP` abre código e descrição no próprio modal. `Salvar CFOP` usa uma Callable autenticada, grava por loja e seleciona o código criado. A lista persiste após sair ou recarregar e alimenta também o seletor de operação dos pedidos.

Os seis códigos iniciais continuam disponíveis. Códigos adicionais são gravados em `lojas/{lojaId}/fiscalConfig/settings.cfopOptions`, com código, descrição, createdAt e createdByUid. A transação preserva as demais configurações e o catálogo de NCM. Duplicatas são bloqueadas no frontend e no backend, inclusive em concorrência.

NCM e CFOP compartilham o componente FiscalCodeOptionForm e a rotina saveFiscalCatalogOption. Cada catálogo tem formato e códigos iniciais próprios. Não há nova coleção nem mudança de Rules.

O formato CFOP de quatro dígitos reproduz a validação existente do provedor em fiscal-service/src/Service/PayloadValidator.php. O cadastro não verifica existência do código na tabela oficial, não escolhe tributação e não garante que o código sirva para determinada operação. Código e descrição devem ser confirmados pelo contador; validações de emissão permanecem no fluxo fiscal.

Cadastrar um CFOP não transmite nota, não reserva numeração e não gera evento fiscal. O formulário do catálogo usa botões type=button e captura Enter nos campos. A emissão fica indisponível enquanto o cadastro inline estiver aberto ou salvando. A resposta de gravação é descartada na interface se a loja ativa mudou.

## Backend e acesso

- fiscalSaveCfopOption: gravação de CFOP com autenticação, acesso de gestão à loja, permissão Nota Fiscal, formato, descrição de 3 a 120 caracteres e transação.
- fiscalListCfopOptions: leitura do catálogo da loja com acesso fiscal e resposta pública limitada a código e descrição.
- fiscalSaveNcmOption: reutiliza a rotina comum. A checagem das flags permissions/customPermissions Nota Fiscal preserva o bloqueio existente na versão NCM publicada.
- Contador pode consultar quando autorizado; não pode cadastrar. Loja agregada não permite operação.

fiscalGetConfiguration não precisa ser republicada. As demais Functions fiscais, provedor, emissão e cancelamento não integram o escopo deste deploy.

## Verificação

- npm run test:fiscal:catalog: oito testes de NCM e CFOP aprovados; persistência, normalização, descrição, multiloja, metadados, preservação dos outros campos, duplicidade concorrente e permissões.
- Lint frontend e dos arquivos fiscais alterados: aprovado.
- Lint geral Functions: dois erros preexistentes globalThis/no-undef no WhatsApp e avisos de regex; esses arquivos não foram alterados.
- Build: aprovado com avisos existentes de Browserslist/Baseline e source maps native-audio.
- Comparação de 40 módulos locais dos source maps anterior e novo: somente App.js mudou. Os outros 39 módulos permanecem iguais, incluindo Ponto, iFood e 99Food.
- Diff revisado; alterações restritas aos catálogos fiscais e seus testes/documentação.

## Deploy seletivo DEV

Comandos previstos:

```text
firebase deploy --project crmdoceria-9959e --only functions:fiscalSaveCfopOption,functions:fiscalListCfopOptions,functions:fiscalSaveNcmOption --non-interactive
firebase deploy --project crmdoceria-9959e --only hosting:prod --non-interactive
```

O target local prod aponta ao site DEV crmdoceria-9959e. Produção ana-guimaraes não recebe deploy.
