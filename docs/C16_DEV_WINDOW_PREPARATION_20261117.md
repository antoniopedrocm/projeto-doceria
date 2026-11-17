# C16 — preparação da janela DEV em 17/11/2026

> SUPERADO PARCIALMENTE: a decisão posterior em C16_VOLUNTARY_LINKING_20261117.md elimina reconciliação manual/em massa como pré-requisito. Preservar diagnóstico e inventário históricos; não executar o plano de semeadura abaixo.

**NÃO PRONTO para publicação.** Inventário autorizado somente leitura confirmou zero vínculos protegidos em ambas as lojas. Publicar o candidato agora ocultaria os clientes canônicos existentes da visão de loja e impediria detalhe/edição, embora os documentos continuassem preservados. Não conceder vínculos a todos para evitar esse efeito.

## Candidato e publicação observada

Worktree C:/Users/anton/Projeto/_worktrees/DEV/c16-medium-relationships-20261116; branch codex/c16-medium-relationships-20261116; HEAD8805a04650423b6dfd78787efd75e6e60b657630. Código d29885fd7f7a0819c79bd5b7792a252605208e75; HEAD posterior somente documentação. Candidato auditado67cf340c e scan04ad2505-eaec-4583-b13c-343e9e7f42f5 preservados. Relatório de aceite anterior permanece untracked, preservado; nenhum código alterado nesta etapa.

APIs oficiais consultadas com autenticação gcloud válida e escopo exclusivamente crmdoceria-9959e. CLI gcloud/functions e Firebase/functions não retornaram em prazo útil e foram interrompidos; leitura REST oficial autenticada funcionou, sem expor token. Metadados capturados em outputs/c16_dev_readonly_20261117.json no workspace da conversa, fora do repositório.

| Componente | Metadado atual | Equivalência com código corrigido |
|---|---|---|
| Functions api | us-central1, ACTIVE,nodejs22,api-00079-xid,atualizada2026-11-12T20:47:44.628028682Z | NÃO COMPROVADA por hash; revisão remota antecede correções locais |
| adminOrderSave | adminordersave-00001-sig,30/10/2026 | NÃO COMPROVADA; novo controle de troca de cliente precisa publicar |
| adminOrderHistory | adminorderhistory-00001-put,30/10/2026 | Módulo compartilhado; avaliar inclusão no pacote seletivo |
| adminOrderReceivePayment | adminorderreceivepayment-00001-maw,12/11/2026 | Módulo manual sem delta; não republicar por implicação |
| Hosting | API respondeu HTTP403 | Versão/release atual NÃO COMPROVADOS |
| Rules | API respondeu HTTP403 | Ruleset/hash atuais NÃO COMPROVADOS |
| Índices | 22 compostos retornados, todos READY,sem próxima página | Não certifica todos os índices automáticos nem substitui consulta exata |

Listagem retornou149 Functions v2; nenhuma equivalência inferida de commit GitHub ou simples timestamp. Não consultados valores de Secrets, variáveis de ambiente, dados PROD ou configs financeiras.

Delta6759aed9→d29885fd: Rules financeiras High, novos módulos de vínculos/dry-run/testes e mudanças index/customer-registry/staff-directory/admin-order-edit. Não houve delta em CRM,package.json/lockfiles,firebase.json,firestore.indexes.json nesse range. Logo Hosting não tem mudança obrigatória demonstrada por estas correções; não reconstruir/publicar frontend indiscriminadamente. Identidade e fontes remotas exatas continuam pendentes de captura da versão/build/source e hashes autorizados.

Comparação de bytes com manifesto histórico446:114 idênticos,309 correspondem após normalizar CRLF→LF,23 ainda diferentes. Zero ausentes. Parte dessas diferenças é anterior ao delta corretivo, inclusive arquivos de config DEV; não significa23novas correções nem perda do candidato original. Não transferir446/446histórico ao novoHEAD. Staging deve ter novo manifesto de bytes exatos, com origem Git distinguida de configs ignoradas, preservando finais de linha e sem credenciais no manifesto público.

Guard scripts/assert-dev-deploy.cjs testado somente localmente: RECUSA o worktree atual porque caminho real não contém projeto-doceria-main. Não desabilitar nem simular ambiente GitHub. Preparar, em etapa futura, staging novo sob C:/Users/anton/Projeto/projeto-doceria-main/.deploy-c16-<id>, sem sobrescrever original, com arquivos revisados e manifesto comparado ao candidato. Não arquivar indiscriminadamente todo o Git, que inclui node_modules rastreado. Incluir somente runtime/config necessário por allowlist; dependências do lockfile e configurações DEV ignoradas separadas, sem copiar PROD. O staging e seu pacote ainda não foram criados.

## Inventário autorizado e qualidade das provas

Autorização explícita nesta conversa para IDs/metadados de clientes, aliases,vínculos e referências de pedidos DEV; nenhuma gravação autorizada. Projeções não leram nomes/telefone/e-mail/endereços/Secrets. IDs processados em memória; relatório apenas agregado. Consulta inicial por nome de loja não selecionou lojas porque campo nome não as identificou; corrigida seleção pelos dois IDs já documentados, sem inferir ausência de lojas.

| Medida | Matriz | Garavelo |
|---|---:|---:|
| Vínculos protegidos encontrados |0|0|
| Pares canônicos ACTIVE válidos |0|0|
| Pedidos na subcoleção |67|5|
| Documentos retornados nas duas consultas legadas por loja, espelhos inclusos |0|0|
| Canônicos referenciados por pedidos sem vínculo ACTIVE |7|2|

Total20documentos clientes,16canônicos/4aliases;4registros no índice de aliases sem ambiguidade detectada no teste limitado READY/destino canônico existente. Isso não prova ausência de todo conflito/ciclo/duplicidade por identidade. Não foram lidos telefones ou provas pessoais. Nenhum limite10001atingido. Clientes ACTIVE nas duas lojas:0; quantidade legitimamente multiloja: NÃO COMPROVADA. Não somar7+2como9pessoas distintas, pois não foi calculada interseção.

- **Confiável/verificado:** existência e contagens dos registros protegidos/metadados e resultado zero; aceites C15 específicos anteriores preservados. Nenhuma prova nova de relacionamento legado foi validada externamente.
- **Indícios:** referências de pedidos, lojaId/lojasVisitadas e presença de ownerUid/paymentId. Não autenticam proveniência sozinhos, nem autorizam vincular automaticamente.
- **Insuficientes/ambíguos:** legitimidade e cobertura dos pares de cada loja, compradores reais das duas lojas, cadastros sem prova. Pendentes de revisão independente/manifesto aprovado.

Não foram classificados clientes reais nominalmente nem criados vínculos. Geral autorizado deve continuar apresentando os canônicos conforme código/testes; não foi homologado na aplicação publicada nesta etapa.

## Transição e reconciliação

O CLI dry-run é somente planejador, não validador da prova nem executor apply. Bloqueia fonte pedido, aliases como destino, decisão duplicada/conflitante, REVOKED e prova incompleta; hash e reviewer digitados não constituem aprovação autêntica. Cadastros/endereços/pedidos não são alterados. Aprovação precisa vir de processo externo controlado.

Sequência necessária: revisar provas independentes e pares canônicos; aprovar tratamento dos casos sem prova; implementar/revisar executor Admin separado com manifesto aprovado, CAS por estado anterior, idempotência por par/manifesto, journal de before/after e operador, modo lote pequeno e interrupção. Ausente esse executor, não há aplicação nem rollback de dados comprovados. Rollback deve restaurar somente vínculos criados/alterados pela execução se estado/revisão continuar igual ao after; concorrências vão para revisão, nunca delete cego nem rollback de clientes/pedidos.

**Estabelecer previamente vínculos aprovados, depois ativar leitura protegida.** Coleção é aditiva e ignorada pelo runtime antigo; Rules devem impedir SDK antes de semear. Contudo runtime antigo mantém os achados conhecidos enquanto estiver ativo: manter intervalo mínimo e supervisão, sem alegar remediação antes da troca. Capturar delta de cadastros/checkout entre inventário e ativação, pois escritor antigo não gera vínculos. Se não for possível reconciliar esse delta sem risco, combinar pausa breve dos fluxos de atendimento cadastral afetados e janela supervisionada; não garantir indisponibilidade zero. Não enfraquecer leitura protegida ou gerar prova de pedidos manipuláveis para contornar a transição.

## Desempenho

Consultas limitadas: vínculos por loja; perfis por IDs IN em lotes10; todos os aliases; todos os pedidos da subcoleção; pedidos root por lojaId e por storeId. Geral acrescenta lojas/perfis globais/pedidos root globais. read usa páginas400, mas acumula um orçamento global10000: paginação interna não resolve volume nem fornece cursor HTTP.

Inventário atual por loja não sugere volume perto do limite: comzero vínculos, leitura principal aproximada71documentos Matriz e9Garavelo (aliases+pedidos); mesmo cenário hipotético16pares/16perfis por loja ficaria em103/41, sem autorizar esses pares. Leituras faturadas incluem consultas vazias e outros metadados; esses números não são custo faturado ou latência cloud. Geral/root sem loja não tem limite real calculado neste inventário.

503 continua possível com crescimento/abuso de pedidos,aliases ou vínculos. Testes anteriores confirmam fail-closed no limite e amostras locais309/135/134ms com600perfis alheios; não repetir ou chamar isso de prova cloud. Índices compostos22READY não certificam consultas novas documentId IN e filtrostoreId com ordenaçãoID; validar exatamente essas consultas/índices automáticos antes da janela. Nenhuma correção adicional de desempenho é obrigatória com base no volume observado. Se escala exigir, propor projeção server-owned incremental/paginação com contrato de totais/revogação, em novo delta revisado antes de alterar código; nunca remover orçamento ou devolver totais parciais silenciosamente.

## Roteiro exato de janela futura — não executado

1. Fixar HEAD e pacote; obter metadados atuais Hosting/Rules com identidade/permissões adequadas, fontes/build de api e callables afetados, revisão anterior e manifesto; resolver divergências, inclusive defaults/config DEV. Não inventar commit publicado.
2. Confirmar inventário/provas, aprovar manifesto por loja e tratamento seguro dos casos sem prova. Cobertura deve preservar compradores legítimos e multiloja, sem duplicar ou refazer C15.
3. Revisar executor/rollback; autorizar separadamente backup e escrita dos vínculos. Guardar antes/after criptografados e hashes; backups antigos não representam snapshot da janela atual. Não exportar Secrets.
4. Staging allowlist sob caminho DEV permitido; verificar guard, runtimeNode22, npm/lockfile, configurações DEV e ausência de Secrets em artefatos públicos. Não preparar deploy geral de149Functions.
5. Confirmar Rules públicas versus pacote. Publicar primeiro Rules financeiras protetoras SE houver diferença confirmada, após verificar compatibilidade de criação offline e callable manual; integrations já deve negar SDK. Nunca afrouxar Rules ou depender só do backend.
6. Aplicar apenas vínculos aprovados por executor autorizado e conferir cobertura/revogações, estado de cada lote e delta concorrente. Se não houver prova/cobertura aprovada: ABORTAR antes de ativar leitura.
7. Publicar seletivamente Functions api e adminOrderSave; incluir adminOrderHistory apenas se necessário pelo artefato/módulo compartilhado e configuração. Revisar source/entryPoints antes de formar o --only. Hooks/schedulers/financeiro/Secrets não alterados por implicação. Functions não trocam atomicamente: cobertura e compatibilidade devem preceder ambas; confirmar revisões ativas individualmente.
8. Hosting somente se comparação demonstrar delta necessário, com build do pacote certo. Nenhuma obrigação de republicar Hosting por estes patches backend. Capturar versão/release e hashes relevantes mesmo se permanecer intacto.
9. Smoke e homologação abaixo; registrar pacote revisado versus publicado, versões, resultados e aceite do responsável. Somente então C16 pode ser proposto PASS; não autoriza PROD.

Rollback: não retornar cegamente ao código vulnerável67cf340c/ao Rules permissivo. Preferir correção/redeploy do pacote seguro conhecido e interromper funções cadastrais afetadas sob decisão humana se necessário. Se precisar retornar versão anterior por incidente, decisão explícita sobre reabertura dos achados, acesso restrito e mitigação; manter proteção financeira e vínculos existentes. Hosting rollback isolado não reverte Functions/Rules/dados. Recuperação de vínculos via journal/CAS independente. Preparar e validar esses artefatos antes da janela; atualmente rollback executável completo NÃO COMPROVADO.

## Homologação mínima no DEV publicado

Usar sessão Staff legítima existente, sem novo Google claim/SMS; só leitura de clientes reais especificamente autorizados. Para mutações/revogação/edição/negativas SDK usar exclusivamente fixtures sintéticas DEV previamente autorizadas e isoladas. Criar fixtures também é escrita e exige autorização futura; não foi feito nesta etapa.

- Matriz/Garavelo: listagem e detalhe permitidos somente para pares aprovados; nenhum nome/PII em evidência compartilhada.
- Sintéticos: par só Matriz, sóGaravelo,duaslojas,alias,semprova. Testar leitura e edição cruzada negadas nos dois sentidos; Geral somente dono com autorização total.
- Revogar fixture: próximas leituras/detalhe/alias/edição negadas; autorização obsoleta entre leitura e transação também negada. CheckoutSTRONG pode reativar conforme decisão, mas não gerar cobrança; não criar pedido que dispareSMS/WhatsApp sem isolamento prévio dos efeitos. Se isolamento não estiver comprovado, não executar checkout no publicado; manter teste local e registrar a limitação.
- SDK de fixture não cria/altera/exclui vínculo. Edição legítima preserva dono,identidade,telefone,histórico,endereços e métricas não editáveis. Teste HTTP com Auth real Staff sem refazer C15.
- Financeiro: negativas de escrita SDK e fluxo server-side apenas com fixtures sem cobranças/notificações; não alterar pedido/pagamento real. Verificar configuração de efeitos antes de executar qualquer mutação; otherwise usar evidência local e registrar cobertura pendente.
- Comparar contagens/fingerprints autorizados de dados preservados; nenhum novoCustomer duplicado, nenhum claim repetido; capturar latência, respostas503 e erros deíndice. Evidência sintética não comprova coberturalegada real.

Interromper em vazamento cruzado,clientelegítimo perdido sem tratamento aprovado,duplicidade,prova inválida,SDKpermitido,erro403/índiceinesperado,503emfluxoalvo,efeito financeiro/notificação inesperado ou versão divergente. Não reverter autorização para fazer teste passar. Registrar resultado, revisar causa e replanejar.

## Resultado

Prontos: código revisado,testes locais anteriores,metadadosFunctions/índices,inventário agregado,plano e checklist. Pendentes: prova/coberturalegada,executorapply/rollbackrevisado,aprovação dosdados,metadadosRules/Hosting,stagingguarded e futuraspublicação/homologação. Candidato NÃO PRONTO para janelaDEV pela falta comprovada de vínculos. Nenhuma alteração adicional no runtime é atualmente demonstrada como obrigatória; ferramentaapply/CAS e evidências operacionais ainda faltam. Não houve deploy,push,scannovo,alteração declientes/Secrets/PROD,pagamento,SMSouWhatsApp.

Fase10 93,75%;global97%;Fase13 0%;C16PENDENTE;PRODREADY NÃO.
