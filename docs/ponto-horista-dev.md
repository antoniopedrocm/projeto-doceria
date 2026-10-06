# Investigação antes da implementação — Horista (DEV)

> Correção posterior: a regra deste relatório que carregava banco anterior no resumo de um mês de transição foi substituída. O resumo mensal Horista agora tem banco/carga/extra = 0, apresentados como —, mesmo com dias anteriores de escala fixa. Ver `ponto-horista-correcao-resumo-dev.md`. Os cálculos históricos dos dias anteriores permanecem preservados.

Ambiente: repositório projeto-doceria-main, Firebase crmdoceria-9959e.
Branch isolada: codex/ponto-horista-dev. Nenhuma alteração no worktree fiscal ou em produção.

## Modelo e fontes atuais

- App.js define tipos, normalização de jornada, formulário de usuário, Meu Espaço, faltas virtuais, administração e exportação PDF.
- users/{uid}.jornadaTrabalho persiste a escala; createUser/updateUser normalizam no backend, listAllUsers normaliza na leitura.
- Cada documento lojas/{loja}/pontos guarda jornadaTrabalho como snapshot. Marcações, períodos complementares e correções do gestor são consolidados por dia.
- pointCalculationCore.js calcula no frontend os intervalos reais, irregularidade, banco e extras. functions/index.js possui cálculo separado usado por registerEmployeePoint.
- A carga prevista vem dos dias/cargas da jornada, com fallback de 8h. Dias sem ponto geram faltas virtuais, exceto folgas/feriados e períodos anteriores ao início do banco.
- O PDF soma os movimentos diários e reconstrói o saldo anterior. pointBankBalances é somente lido como marco anterior à janela de reconstrução.
- Não foi encontrado fechamento imutável específico de Ponto nem outro exportador além do PDF. Fechamentos de caixa/remessas são módulos distintos.
- Horários padrão só são utilizados no formulário da jornada. A data de início delimita cálculos de banco, não trabalho real.

## Risco histórico identificado ANTES das mudanças

Os pontos com snapshot preservam a escala, mas dias sem documento e pontos antigos sem jornada usam o cadastro atual. Não há histórico de vigências no cadastro; trocar a escala poderia reconstruir meses anteriores com outra carga. Saldos fechados imutáveis não existem neste fluxo; o PDF é recalculado.

A implementação deve manter os snapshots e registrar vigências no cadastro quando uma mudança envolver Horista, usando a data atual de São Paulo definida no servidor. A configuração anterior será o marco inicial para períodos anteriores. Nenhuma migração, exclusão ou zeragem de pontos/pointBankBalances será feita. Configurações anteriores à primeira vigência que nunca foram armazenadas não podem ser reconstruídas.

## Solução prevista

Valor persistido: horista. A jornada continua armazenando campos fixos para possibilitar retorno a outra escala, mas eles ficam ocultos e não participam da carga prevista do Horista. Horista não calcula irregularidade, débito, crédito de almoço ausente ou distribuição automática de extra. Somente intervalos reais fechados entram no total; pendências continuam sinalizadas. Abonos não inventam trabalho.

Tela principal e PDF mostram Horas trabalhadas no mês (ex.: 87h35). Colunas de banco/irregularidade/extra usam — para dias Horistas. Em mês de transição, dias com snapshot anterior mantêm os cálculos antigos e o resumo identifica a coexistência.

Deploy permitido pelo usuário exclusivamente em DEV: Hosting da aplicação e Functions createUser, updateUser, listAllUsers, registerEmployeePoint. Sem Rules, índices, Storage ou Functions de outros módulos.

## Implementação e arquivos

- `functions/point-schedule-core.js`: modelo de escala, opção Horista, normalização, carga prevista zero para Horista, política de banco não aplicável, total trabalhado e histórico de vigência.
- `crm/src/meuEspaco/pointScheduleCore.js`: cópia ESM gerada da fonte canônica; sem regra independente.
- `scripts/sync-point-schedule.cjs`: geração/conferência de paridade.
- `crm/package.json`: verifica paridade antes do build.
- `functions/index.js`: createUser, updateUser, listAllUsers e registerEmployeePoint usam a política compartilhada. updateUser registra vigência em São Paulo, despreza histórico fornecido pelo cliente e devolve a jornada persistida.
- `crm/src/meuEspaco/pointCalculationCore.js`: Horista não entra na carga prevista, irregularidade, débito, crédito por almoço ausente ou distribuição de extra. Mantém o cálculo de intervalos reais/complementares e as regras anteriores das demais escalas.
- `crm/src/meuEspaco/PointWorkScheduleFields.js`: campo de escala e campos fixos extraídos para teste; os campos fixos/data de início ficam ocultos para Horista, preservando valores.
- `crm/src/App.js`: integração do formulário, jornada no perfil de login/leitura em tempo real, Meu Espaço, faltas virtuais, administração e PDF.
- `crm/src/meuEspaco/pointHourly.test.js`: 16 testes, incluindo formulário montado, remonte de sessão, consolidação e execução do exportador PDF real com saída gráfica simulada.
- `functions/point-hourly.test.js`: 11 testes, incluindo execução dos handlers reais com Auth/Firestore simulados e transação real de registerEmployeePoint com armazenamento simulado.
- `functions/package.json`: integra testes Horista na suíte geral.
- `docs/ponto-horista-dev.md`: investigação, decisões, validação e publicação.

Persistência: `users/{uid}.jornadaTrabalho.tipoEscala = 'horista'`. Pontos novos guardam a jornada como já acontecia. Histórico novo: `jornadaTrabalho.historicoEscalas`, entradas com `inicio` e `jornadaTrabalho`; a entrada inicial com início vazio preserva a configuração anterior. Registros existentes continuam usando seu snapshot. Mudanças de tipos fixos que nunca envolveram Horista mantêm o comportamento anterior.

O total mensal soma `summary.workedMinutes` dos dias consolidados e ativos, excluindo inconsistências. Desconta almoço e saídas particulares conforme intervalos existentes; inclui trabalho externo registrado; abonos não criam horas reais. Períodos abertos contam apenas intervalos já fechados e permanecem em andamento. Almoço incompleto com saída final/período inválido fica pendente de ajuste e não entra no total.

Não há `Math.max(0, saldo)` na exceção. Horista sai explicitamente dos cálculos de carga/banco; os campos numéricos de movimento têm zero por não aplicabilidade, e a apresentação mostra o total real e “—”. O PDF puro Horista usa “Não se aplica”; em mês de transição, conserva o banco de dias fixos/saldo anterior e informa a coexistência.

## Validação

- Frontend Ponto: 4 suítes, **83 testes aprovados**, zero falhas.
- Backend geral: **216 testes aprovados**, zero falhas.
- Cobertos os 14 cenários pedidos: cadastro, reabertura, 5h, ausência de débito de 3h, dia vazio, 87h35, almoço, incompletude, três escalas anteriores, PDF/resumo, nova sessão/leitura e histórico.
- Lint frontend: zero erros; 60 avisos existentes no App.js.
- Lint Functions com ambiente ES2021 (Node 22): zero erros; 2 avisos existentes de regex no módulo WhatsApp.
- Build DEV: aprovado, com avisos existentes de lint/Browserslist e source maps do pacote native-audio.
- `git diff --check`: aprovado; revisão limitada aos 12 arquivos acima.

Comandos reproduzíveis no worktree DEV:

```powershell
$env:CI='true'
npm test --prefix crm -- --watchAll=false --runInBand --testMatch '**/*.test.js' --testPathPattern=meuEspaco
npm test --prefix functions
$env:NODE_PATH=(Get-Location).Path+'/crm/node_modules'
npm run lint --prefix functions -- --env es2021
# Lint frontend executado pelo ESLint instalado em crm/node_modules, sobre os arquivos alterados.
$env:CI='false'
npm run build --prefix crm
node scripts/sync-point-schedule.cjs --check
git diff --check
```

Os testes de persistência e sessão usam serviços simulados; não criam funcionários de teste nem modificam usuários/marcações de DEV. A autenticação interativa em navegador com um funcionário real não faz parte destes testes. Não foi executada migração de dados.

## Limitações históricas

Não existe fechamento imutável de Ponto no modelo atual. Não foram alterados documentos antigos, saldos gravados ou marcações. A nova vigência protege períodos anteriores com a configuração conhecida no momento da primeira mudança. Configurações antigas que nunca tiveram snapshot/histórico não podem ser recuperadas retroativamente. Em um mesmo dia, pontos já existentes conservam sua jornada; os novos usam a configuração vigente.

## Publicação DEV — 06/10/2026

Deploy concluído com sucesso no Firebase **crmdoceria-9959e**:

```powershell
$env:NODE_USE_SYSTEM_CA='1'
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'
firebase deploy --project crmdoceria-9959e --only 'hosting:prod,functions:createUser,functions:updateUser,functions:listAllUsers,functions:registerEmployeePoint' --non-interactive
```

O target `hosting:prod` deste repositório aponta ao site **DEV crmdoceria-9959e**, conforme `.firebaserc`; não aponta a ana-guimaraes. As quatro Functions Node 22 (2ª geração, us-central1) retornaram Successful update operation. Hosting retornou release complete e Deploy complete.

URL DEV: https://crmdoceria-9959e.web.app. O ambiente de produção ana-guimaraes não recebeu deploy. Nenhuma Rule, índice, Storage ou Function de outro módulo foi publicada.

A verificação HTTP do asset-manifest e do JavaScript principal confirmou o mesmo bundle SHA-256 gerado no build local, contendo Horista e o resumo de horas trabalhadas.
