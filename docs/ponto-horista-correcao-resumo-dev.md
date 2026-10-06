# Correção do resumo Horista — DEV, 06/10/2026

Workspace: `C:/Users/antonio.pedro/.codex/worktrees/ponto-horista-dev/projeto-doceria-main`.
Repositório Git: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/.git`.
Branch: `codex/ponto-horista-dev`. Base: `5cfc3fdf`.
`git status --short` estava vazio antes da investigação. Nenhuma alteração no worktree fiscal ou de produção.

## Origem do -213:00

O defeito era no frontend, em `crm/src/App.js`, função `handleExportPointSheet`:

```js
const previousBankMinutes = hourlyMonth && !hasFixedDays ? 0 : await getPreviousBankHoursBalance(...);
const finalBankMinutes = previousBankMinutes + bankMovementMinutes;
// Resumo Horista:
['Banco de horas', hasFixedDays ? formatMinutesForPointSheet(finalBankMinutes, ...) : 'Não se aplica']
```

`hasFixedDays` ficava verdadeiro por qualquer dia com snapshot/vigência de escala fixa, inclusive dia sem marcação anterior à mudança. Isso reativava a reconstrução do saldo anterior no resumo Horista. `getPreviousBankHoursBalance` lê um marco antigo de `pointBankBalances` e reconstrói até 60 meses anteriores (120 com data de início), usando `calculatePointBankMovementForMonth`. Essa função cria dias sem registro conforme a escala histórica. O saldo acumulado era somado aos movimentos fixos do mês e apresentado como banco do Horista.

Portanto, não se tratava do cálculo dos intervalos reais, nem de uma Function calculando -213h para um novo ponto Horista. O erro era aplicar saldo histórico/fixo ao resumo operacional Horista. A data de início também não impedia o carregamento em meses de transição.

A reprodução executou o exportador real de `App.js`, com somente Firestore/PDF I/O substituídos: mês com transição, 240 minutos trabalhados e saldo anterior -12.780 minutos. Antes da correção, o PDF recebia 4h00 e -213h; após, o totalizador retorna 240 minutos trabalhados, banco 0 e extras 0 e nem consulta o saldo anterior. O print não identifica funcionário/competência, portanto não foi possível decompor os -12.780 minutos daquele usuário entre marco armazenado, reconstrução anterior e dias fixos do mês. Nenhum dado real foi modificado para investigar.

Confirmado antes de editar o cálculo: o bundle publicado em DEV era `/static/js/main.2b2e936f.js`, SHA-256 `f8b6caaa9d477f25dc5010ec28077c4c1f3038b379ac626643ca72d63b6aaa5e`, igual ao build da implementação anterior e contendo a mensagem da exceção de transição. Também continha iFood Hub e 99Food Hub.

## Correção

- Novo `crm/src/meuEspaco/pointMonthSummary.js`: `summarizePointMonth` usa `isHourlyWorkSchedule`, `getHourlyPointBalance` e `sumPointWorkedMinutes` da política canônica existente. Para Horista retorna explicitamente carga, créditos, débitos, movimento, saldo anterior, banco final e extras = 0. Horas trabalhadas continuam sendo os intervalos reais, descontando almoço e excluindo inconsistências.
- PDF e total mensal do Meu Espaço reutilizam esse totalizador. No PDF Horista: horas trabalhadas reais, banco —, horas extras —. Nenhum saldo anterior é consultado/reconstruído para esse resumo, mesmo no mês de transição.
- O algoritmo fixo de créditos/débitos, movimento, extras e saldo anterior foi extraído sem mudança de fórmula. As três escalas fixas mantêm saldo positivo/negativo e distribuição existente.
- Não há clamp genérico, alteração de documentos, migração, zeragem de `pointBankBalances` ou mudança nas marcações.
- A escala da competência é resolvida pela vigência no último dia do mês. Relatórios de meses anteriores de escala fixa continuam usando a regra anterior. No mês de transição, as linhas dos dias fixos preservam seus cálculos; os dias Horistas não geram carga, falta virtual, débito ou extra. O resumo Horista não carrega esses saldos históricos como obrigação atual.
- O backend já tem `getExpectedPointMinutesForDay`, `calculatePointSummary` e `calculatePointBalanceDistribution` com exceção explícita de Horista. Testes dos handlers reais confirmam 4h/10h sem carga, banco ou extras. Não há totalizador mensal backend neste fluxo. Nenhuma Function precisa de atualização nesta correção.

## Testes e limites

Testes ampliados em `crm/src/meuEspaco/pointHourly.test.js` e `functions/point-hourly.test.js`: 4h, 0h, 87h35, 10h sem extra automática, dia vazio sem débito, totalizador com saldo histórico negativo e campos teóricos obsoletos, PDF real com saldo -213h/transição, dias fixos preservados, mês anterior fixo, regressão das três escalas, almoço, pendências, persistência e sessão.

Os testes de PDF capturam chamadas do exportador real com saída gráfica simulada. Persistência/Auth usam serviços simulados, sem gravações de usuários de teste. Nenhum fechamento imutável de Ponto existe no modelo atual; PDFs são recalculados. Configurações históricas que nunca foram armazenadas não podem ser recuperadas; snapshots e vigências existentes permanecem intactos.

## Validação e publicação

- Frontend Ponto: 4 suítes, **96 testes aprovados**, zero falhas.
- Backend geral: **217 testes aprovados**, zero falhas.
- Lint frontend: zero erros; permanecem 60 avisos existentes em `App.js`. Lint Functions: zero erros, 2 avisos existentes de regex WhatsApp.
- Build: aprovado; avisos existentes de Browserslist/dependência native-audio sem source maps. Paridade da política canônica e `git diff --check`: aprovados.
- Revisão restrita a 6 arquivos: `crm/src/App.js`, `crm/src/meuEspaco/pointMonthSummary.js`, `crm/src/meuEspaco/pointHourly.test.js`, `functions/point-hourly.test.js`, `docs/ponto-horista-dev.md`, este relatório.
- Antes da publicação, confirmado no bundle `main.0cf72bb7.js`: iFood Hub, 99Food Hub, política mensal Horista e ausência da antiga exceção que carregava saldo. Imports/componentes e rotas de ambos os Hubs também conferidos em `App.js`.

Escopo de deploy autorizado e necessário: somente Hosting DEV, `firebase deploy --project crmdoceria-9959e --only hosting:prod --non-interactive`. O target chamado `prod` deste repositório aponta exclusivamente ao site DEV `crmdoceria-9959e`, conforme `.firebaserc`; ambiente de produção é outro projeto, `ana-guimaraes`. Nenhuma Function, regra, índice ou dado do Firestore precisa de publicação/alteração nesta correção.

Publicação concluída: Firebase CLI retornou `hosting[crmdoceria-9959e]: release complete` e `Deploy complete!`. URL: https://crmdoceria-9959e.web.app.

Verificação HTTP posterior do asset-manifest e do bundle publicado: `main.0cf72bb7.js`, SHA-256 `1a75c4059fc06bd9b49553bad93f1b13912dfb922eea2dc3e2317f5e52a39a04`, idêntico ao build local. iFood Hub e 99Food Hub presentes também no JavaScript servido. Política mensal não aplicável confirmada; antiga mensagem de carregamento de banco de transição ausente. Produção `ana-guimaraes` não recebeu deploy.
