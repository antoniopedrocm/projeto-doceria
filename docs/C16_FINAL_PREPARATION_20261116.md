# C16 — preparação após correções Medium

Base desta etapa: cc69693f5f4636f434b5c09a8ece2493f9259ccd, preservada no histórico. Branch codex/c16-medium-relationships-20261116. Scan concluído 04ad2505-eaec-4583-b13c-343e9e7f42f5 permanece inalterado. Nenhum scan novo ou revisão Astra executado.

## Reconciliação: pronta somente para dry-run offline

functions/customer-relationship-reconciliation.js é planejador/CLI sem Firebase, rede, aplicação ou credenciais. Executar `node customer-relationship-reconciliation.js <inventario-offline.json>` produz JSON em stdout, nunca grava vínculos. Não foi executado sobre dados reais.

Entrada: customers com id canônico e canonicalStatus; stores com IDs existentes; decisions com storeId, customerId, approved, reviewer, evidenceKind, evidenceRef, evidenceDigest e currentState quando existente. Fontes aceitas: independent_admin_record ou documented_owner_review. Digest no formato sha256:<64 hex>. Saída: DRY_RUN, hash do inventário, propostas e pendências. Não incluir perfis completos/endereços no inventário operacional: apenas IDs e metadados necessários. Fixtures são sintéticas.

Pedidos, metadados ou flags não bastam. Aliases não são convertidos automaticamente; revisar com o índice protegido antes de fornecer o ID canônico. Par duplicado/conflitante, evidência ausente, revogação, estado desconhecido ou vínculo já ativo não gera proposta. Um cliente pode ter proposta revisada por loja, mantendo um único cadastro. O planejador não valida autenticidade externa da evidência nem confere estado vivo: entrada aprovada não equivale a autorização. Nenhum executor apply foi exposto. O planejador não declara cobertura de clientes ausentes do inventário.

Antes de qualquer aplicação: autorização explícita para inventário real somente leitura; reconciliação de aliases; identificação de clientes legítimos sem decisão; prova independente/revisão humana; cobertura por loja, inclusive multiloja; aprovação externa do manifesto/hash e das revogações. Um futuro executor Admin deve exigir manifesto aprovado, destino explícito, transações que releiam estado/prova, idempotência, auditoria do operador e proibição de sobrescrever revogações/conflitos. Depende de implementação/revisão e autorização separadas. Nunca importar pedidos como prova. Dados sem prova permanecem preservados e ocultos para a loja; Geral mantém autorização existente.

## HTTP de edição: PASS com autenticação sintética

Teste acrescentado no arquivo customer-store-relationship-emulator.test.js extrai do index.js a rota PUT real, sanitizeClientPayload, requireStoreId e upsertClientDocument. Usa Express HTTP loopback e Firestore Emulator reais; injeção de usuário Staff sintético no limite de autenticação, sem validar emissão/assinatura de ID token Firebase. Sem vínculo: HTTP 404 e documento intacto; autorizado: 200 e nome atualizado; revogado: 404; revogação após detail e antes da transação: 403 e nome intacto. As negativas 404 evitam confirmar existência. Não houve acesso cloud.

## Otimização e desempenho

Antes: cada consulta da loja carregava todos os perfis globais. Agora: ler vínculos atuais por loja, validar chave/estado/fonte e consultar somente IDs canônicos autorizados em lotes de dez usando documentId IN. Geral conserva inventário global autorizado. Nenhum cache de autorização reintroduzido. Aliases, pedidos e limites monetários continuam preservados; páginas internas de 400 e orçamento agregado de 10 mil documentos permanecem fail-closed. A resposta HTTP não oferece cursor externo: não confundir páginas de leitura internas com paginação do produto.

Medição loopback com 600 perfis sem vínculo e dois autorizados: três amostras 309/135/134 ms, cinco documentos retornados por seis queries, dois perfis por chamada. Antes a fase de perfis teria retornado pelo menos 604 documentos nesse fixture; a comparação antiga é estimativa por estrutura da consulta, não benchmark antigo executado. Leituras faturadas podem incluir custo mínimo de consultas vazias/índices e não equivalem à contagem de documentos retornados. Não representa latência cloud, concorrência ou escala real.

Custo aproximado por loja: vínculos da loja + perfis autorizados + todos os aliases + pedidos da loja + consultas legadas por lojaId/storeId (possíveis espelhos duplicados lidos). Geral mantém perfis globais. Risco de 503 persiste com histórico/aliases/vínculos acima do orçamento; não retornar totais parciais. Próxima evolução, se volume real exigir: projeção server-owned ou agregados/paginação contratual com autorização fresca, mantendo exatidão e revisão própria. Não implementado implicitamente.

Consultas novas usam documentId IN; vínculos já usam storeId == com ordenação por ID. Nenhuma nova configuração de índice composto adicionada. Emulador não certifica índices cloud: antes do rollout conferir índices automáticos e plano de consultas no DEV, com autorização e sem dados reais nesta etapa.

## Revogação

Comportamento preservado: REVOKED nega próximas leituras/edições; novo checkout STRONG legítimo pode reativar a relação. Não é bloqueio administrativo permanente. O dry-run não propõe reativar REVOKED. Decisão explícita do usuário nesta conversa: "Manter revogação atual". Pendência de decisão encerrada; nenhum bloqueio permanente será implementado nesta etapa. Código e resultados dos testes permanecem os mesmos do candidato d29885fd7f7a0819c79bd5b7792a252605208e75.

## Evidências desta etapa

- Emulador das duas suítes diretamente afetadas: 20/20 PASS, incluindo HTTP PUT real.
- Medição/perfis filtrados no emulador: 1/1 PASS, três amostras.
- Unitários diretório + planejador: 33/33 PASS. Primeiro limite de contagem do mock precisou considerar a consulta de lojas da visão Geral; corrigida expectativa, sem remover asserção de 503/limite.
- CLI dry-run sintético: PASS, DRY_RUN e uma proposta sem gravação.
- Lint functions: 0 erros, 15 warnings (inclui warning preexistente no teste de emulador).
- Syntax e diff-check: PASS. Busca limitada por padrões conhecidos de credenciais no delta: nenhuma ocorrência; não equivale a auditoria integral de Secrets.
- Build CRM anterior reaproveitado: nenhum arquivo frontend/dependência alterado. Públicos C16 34/34, regressões 37/37 e proteção financeira anteriores preservados, sem reexecução alheia ao delta.

Logs suplementares retidos via Codex Security em artifacts/c16-final-preparation/, sem alterar o scan concluído. Testes rodados sequencialmente pelo agente principal. Emulador encerrado. Sem dados reais, push, deploy, pagamentos, SMS ou WhatsApp.

## Gates restantes

Código apto a ser submetido à revisão final Astra Low deste novo delta; parar antes de executá-la. Reconciliação real e sua cobertura permanecem PENDENTES, assim como aceite formal C16 e demais gates do projeto. verify-fix anterior não cobre as alterações novas. Produção bloqueada até revisão, reconciliação autorizada, validação de escala aplicável e aceite final.

Fase 10 93,75%; global 97%; Fase 13 0%; PROD READY NÃO.
