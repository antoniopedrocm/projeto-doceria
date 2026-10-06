# Data de vigência da jornada Horista em DEV

Implementação seletiva da melhoria validada no commit de produção bd4b246f24ade8b85e13c06b72349d7bfc775942. Não houve merge amplo, cópia do projeto ou promoção da correção histórica específica de um usuário de produção.

Ambiente: worktree C:/Users/antonio.pedro/.codex/worktrees/ponto-horista-dev/projeto-doceria-main, branch codex/ponto-horista-dev, repositório origin projeto-doceria.git. Alias local C:/wt/ponto-horista-dev é uma junction para esse mesmo worktree. Projeto Firebase exclusivo crmdoceria-9959e, target Hosting prod -> crmdoceria-9959e. AGENTS.md lido; produção ana-guimaraes não recebe publicação nesta tarefa.

## Uso e comportamento

Em Configurações → Usuários, ao editar uma funcionária e mudar de jornada fixa para Horista, o formulário mostra **Aplicar nova jornada a partir de**. A data pode ser passada ou futura e é inclusiva. Até o dia anterior vale a escala anterior; depois vale Horista. A reabertura mostra a vigência registrada. O campo aparece quando a jornada é alterada envolvendo Horista ou quando o cadastro já tem histórico de escalas; não é um editor independente das datas já gravadas.

O formulário envia dataInicioJornada a updateUser. Cliente e servidor validam datas reais ISO, inclusive datas impossíveis e anos bissextos. A validação do servidor ocorre antes de gravações no Auth/Firestore. Clientes antigos sem o campo continuam usando a data atual de São Paulo. Somente o servidor constrói historicoEscalas, sem aceitar substituição do histórico pelo cliente. Edição de nome/permissões sem mudar a jornada preserva a vigência, inclusive futura.

Dependência necessária em DEV: os snapshots de escala fixa antes tinham prioridade incondicional. resolvePointRecordWorkSchedule agora respeita a escala Horista efetiva ao consultar/PDF e ao registrar uma nova batida, sem usar um snapshot fixo obsoleto depois da vigência. Fora do período Horista, snapshots fixos e regras existentes permanecem preservados. A mudança foi aplicada ao frontend e registerEmployeePoint.

Horas reais e intervalos seguem os cálculos existentes. Na vigência Horista: carga, banco, créditos/débitos automáticos e extras são zero; banco/extras aparecem como não aplicáveis. O totalizador mensal/PDF compartilhado continua sem consultar saldo anterior para resumo Horista. Não há migração, exclusão ou regravação em massa de pontos, saldos ou auditoria. Uma batida nova continua persistindo o ponto e a auditoria normais. Meses anteriores à data escolhida preservam a escala conhecida. Configurações antigas sem snapshot/histórico não podem ser recuperadas automaticamente.

## Arquivos alterados

- crm/src/App.js: estado/campo, envio da data, validação e resolução da escala efetiva do ponto.
- crm/src/meuEspaco/PointWorkScheduleFields.js: seletor e apresentação da vigência salva.
- functions/point-schedule-core.js: política canônica de data, comparação, preservação de vigência e resolução de snapshots.
- crm/src/meuEspaco/pointScheduleCore.js: cópia ESM gerada da política canônica.
- functions/index.js: somente imports, updateUser e resolução da jornada em registerEmployeePoint.
- crm/src/meuEspaco/pointHourly.test.js e functions/point-hourly.test.js: testes da melhoria e dependências.
- Este registro técnico.

## Verificação

Frontend global: 18 suítes, 216 testes aprovados. Backend global: 222 testes aprovados. Cobertura inclui escolha de data, submit real da aplicação, início inclusivo, data futura/passada, reabertura/listAllUsers, edição sem mudança de jornada, datas inválidas sem gravações, snapshots antigos, handler real de registro/persistência de batidas, preservação de auditoria, regras fixas, totalizador mensal e PDF Horista.

Os testes executam componentes/handlers/cálculos reais com I/O simulado. Nenhuma funcionária real foi editada para testar; não há validação manual autenticada de cadastro real. Lint frontend: zero erros e 60 avisos existentes. Lint backend com ambiente ES2021: zero erros e dois avisos de regex já existentes em WhatsApp. Sintaxe, paridade da política gerada e git diff --check aprovados.

O bundle DEV anterior main.0cf72bb7.js foi conferido: todos os 40 módulos locais do source map correspondem à base HEAD do worktree. index.js e a política canônica das duas Functions publicadas também correspondem à base. iFood Hub e 99Food Hub já existem em DEV e devem permanecer. Nenhum código dessas integrações ou de outro módulo foi alterado.

## Publicação

Componentes necessários e exclusivos: hosting:prod, functions:updateUser, functions:registerEmployeePoint. createUser e listAllUsers não foram alterados nem precisam publicação. Build, commit e verificação dos artefatos servidos serão registrados ao concluir a publicação seletiva em crmdoceria-9959e.
