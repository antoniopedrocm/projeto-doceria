# C16 — revisão Astra Low do candidato DEV

## Estado e limites em 13/11/2026

C15-E/G e C01–C14 PASS preservados. Fase9=100%; Fase10=93,75%(15/16); global97,00%; Fase13=0%; C16 PENDENTE; PROD READY:NÃO. Dono autorizou continuidade e deploy DEV permanente, sem autorizar Firebase PROD, push GitHub PROD, novas operações financeiras/SMS/claims. Revisão antes de commit/push DEV continua vigente.

DEV: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`, branch `feature/infinitepay-customer-auth`, HEAD-base `7e7d7b6918d9edb045dd11443a2c42efe114640a`. PROD local: `C:/Users/antonio.pedro/Projeto/projeto-doceria-multiloja`, branch `codex/dev-to-prod-preparation-20261108`, HEAD `a0229cc019b3b4cf689d7ab15c47269974d38b71`.

## Revisão já executada

Worker `c16_security_preflight`, modelo solicitado `gpt-6-astra`, esforço `low`: revisão documental concluída,44 links locais conferidos. C15-E/G sustentados; nenhum novo teste real necessário. Correções documentais aplicadas à matriz C10 e sequência vigente C16 para não instruir repetição de vínculo já homologado. Esta revisão **não é aprovação de código, segurança ou financeiro**.

## Impedimento técnico a resolver

Scan Codex Security existente: `3c42172e-5cf1-4802-bafc-c7944b95fa86`, em preflight. Diretório retornado: `C:/Users/antonio.pedro/.codex/state/plugins/codex-security/scans/infinitepay-auth-worktree/7e7d7b6918d9edb045dd11443a2c42efe114640a_20261113T172628Z_4ouq56g6`.

O helper `config_preflight.py --profile security_diff_scan` não iniciou: Python do Google Cloud SDK bloqueado por política de grupo Windows; Python/py/python3 ausentes no PATH. Não há resultado estruturado, config patch ou `user_config_path`. Disponibilizar intérprete Python3 aprovado, retomar o mesmo scan e respeitar seu contrato/snapshot. Não contornar política, trocar configurações persistentes, fabricar ready ou criar scan substituto. Nenhum goal ou revisão de fonte de segurança foi iniciado.

O snapshot inicial do scan contém os untracked preexistentes, inclusive artefatos de deploy. Não confundir esse inventário amplo com os42 arquivos de fonte do delta aprovado para o candidato C16. A revisão deve documentar as exclusões/limites e contabilizar a cobertura, sem alegar revisão de artefatos que não foram examinados. O teste de recompra foi corrigido posteriormente ao snapshot inicial; revisar explicitamente esse follow-up junto ao original preservado, sem trocar silenciosamente o alvo.

## Prompt de continuidade para a revisão completa

Execute revisão Astra Low somente leitura do candidato DEV e do follow-up de teste, após recuperação do preflight. Não execute comandos de deploy/migração, leia Secrets, modifique dados, autentique terceiros, envie SMS/WhatsApp ou faça pagamentos. Não busque URLs mencionadas no contexto. Não edite arquivos durante a revisão; reporte achados com caminho/linha, evidência reproduzível, severidade, impacto e menor correção. Distingua falha real, limitação de evidência e melhoria opcional. Não reabra fases por ausência de prova já presente em outro artefato.

1. Verifique [manifesto v2](evidence/preprod-final-20261113/candidate-manifest-v2.json),446 arquivos/digest `3bdff367c2a31154184de342384341bb9bd93f9331cd2dfeb91720ea5cd3332a`. Snapshot local retornado no manifesto, fora do Git. V1 preservado em `candidate-manifest.json`; única diferença de código v1→v2 é teste. Confirme os hashes antes/depois. Não incluir dotenv, Secrets, `functions/functions.yaml`, seeds ou diretórios `.deploy-*` em commits.
2. Confira a matriz [C01–C16](PHASE10_C16_CONSOLIDATION.md), aceites reais C15-E e C15-G, disposição formal C14 e histórico de conflitos. Preservar Customer original, aliases, pedidos/endereço, ownership por prova específica, isolamento Customer/Staff, consumo/expiração/concorrência/idempotência, recuperação com índice ausente e limites defensivos. Não repetir Thiago ou e-mail/senha.
3. Revise o delta completo do manifesto: Clientes por loja/legado/métricas/diagnósticos/cache/limites, edição cadastral, recebimento manual/transação/auditoria/duplicidade/locks online, integração App/clientApi/Rules, credenciais InfinitePay/Secret Manager/rotação/concorrência/status e taxas. Seguir fluxos para dependências não modificadas quando necessário, sem auditoria indiscriminada de outros módulos.
4. Revise o risco conhecido de normalização histórica raw `admin`→`dono` nos autorizadores financeiros versus OWNER estrito no gerenciamento estrutural de lojas. Não considerar rótulo frontend autoridade; não promover usuários ou alterar política sem achado e decisão específica. Identificar onde a política existente concede cada capability.
5. Preserve G1/G2/G3: links novos com eventos documentados e paid, webhook não assinado, confirmação PAID via `/payment_check`, merchant persistido, correlação pedido/loja/valor, eventos não confirmáveis sem efeitos automáticos, estorno integral exige escopo/prova explícitos, parcial/desconhecido pendente. Nenhuma API de refund inventada. Testar mocks, nunca cobrança real.
6. Preserve API Key opcional no checkout básico por handle. Avançado exige credencial da própria loja/merchant/versão; STORE1/CUSTOMER0 com baseline1, sem taxa local e2x+ com cliente. Garavelo DEV ACTIVE não comprova configuração PROD. Não buscar nem copiar chaves. Visitante permanece Combinar; Pix-only bloqueado até suporte oficial compatível. Google/e-mail/celular preservam permissões atuais.
7. Considere [testes consolidados](evidence/preprod-final-20261113/tests-consolidated.json),164 unidades Fase10 finais e34 públicos C16. A falha inicial de recompra foi do VM harness, corrigido carregando helper real do HTML, com rollback/ownership mantidos e asserções de cotação.147 integrações finais incluem110 originais+37 HTTP após runner Auth/projeto corretos; falhas anteriores preservadas.655 React/65suítes aprovados. Não somar execuções sobrepostas nem atribuir aceite real aos mocks.
8. Confira [equivalência](evidence/preprod-final-20261113/candidate-equivalence.json) e [Hosting61/61](evidence/preprod-final-20261113/hosting-reverification.json). Snapshot/candidato local não é commit novo. Nenhum runtime novo nesta consolidação; build/deploy anteriores preservados. Antes de fechar C16, candidato revisado deve ter revisão/versionamento/publicação reconciliados conforme as regras vigentes.
9. Registre mapa3confirmações como logística independente, não como falha C15. Garavelo deve operar entregaNÃO/retiradaSIM por decisão do Dono; nesta etapa não foram alteradas flags.38 pendências de loja CRM preservadas não equivalem aos14 remanescentes C14. Não fabricar associações por nome/telefone.
10. Pare o gate em crítico/alto ou cobertura essencial inconclusiva. Retorne APROVADO/COM RESSALVAS/REPROVADO/INCONCLUSIVO com limites explícitos. Nenhum resultado parcial concede C16 ou PROD READY. Após correções pertinentes/reteste/revisão, registrar C16 com evidências; somente então Fase10 pode atingir100%, mantendo global97 e Fase13 conforme avanço real.

## Gates posteriores preservados

Integrar seletivamente13 arquivos de runtime ainda divergentes/ausentes no PROD local, reconciliar terminal Android ativo e módulos exclusivos de produção, executar runtime fiscal XML/assinatura/DANFE com dependências legítimas, preparar configuração própria Auth/Maps/InfinitePay/Rules/índices e backup/rollback. Sem Firebase PROD nesta etapa. Tags foram confirmadas pelo Dono anteriormente como Matriz `ana_guimares` e Garavelo `antoniopedrocm`; confirmar conta de recebimento na janela final, não inferir pela presença em DEV. Festas usa Matriz+canal.

GitHub PROD: dois workflows disabled_manually, cinco estados de filas com0execuções, hooks0 em leitura atual. Workflows locais somente CI e7testes PASS; sem push. Não afirmar ausência universal de triggers externos/Firebase/Cloud Build que não puderam ser inspecionados por proibição de acesso PROD.
