# C16 — vinculação voluntária pelo cliente

Decisão explícita do proprietário em17/11/2026: substituir reconciliação antecipada/manual/em massa por identificação voluntária. Não exigir aprovação individual do proprietário para cada cliente. Ausência de vínculo protegido não impede compras permitidas pelo fluxo existente. Este documento prevalece sobre a exigência de semear vínculos dos planos anteriores, sem apagar seu histórico.

## Contratos separados

- Pedido visitante: dados operacionais de contato e entrega daquele pedido, não identidade nem acesso ao Customer global.
- Identidade: UID/provedor validado no Admin. Google usa subject estável; password usa UID. Login password não implica emailVerified. Nenhum e-mail digitado/verificado isoladamente é usado aqui para localizar/unir cadastros antigos.
- Titularidade de legado: fluxo existente encontra telefone normalizado, mas exige a prova específica CUSTOMER_IDENTITY_CLAIM por SMS já implementado, ligada ao UID/provedor/subject/Customer/telefone/loja/nonce/expiração. OTP de endereço, login fraco ou nome/e-mail/telefone informado não bastam.
- Relação cliente–loja: coleção Admin-only, par canônico protegido. Prova voluntária do claim concede somente a loja escolhida e ligada ao desafio. Checkout STRONG já validado continua criando/restabelecendo o par da loja da compra; não extrai relações de pedidos históricos.
- Staff: exige escopo de loja/módulo e vínculo protegido atual para perfil global. Informações operacionais do pedido seguem acesso autorizado à loja, não elevam autoridade sobre cadastro.

## Alterações indispensáveis

customer-registry.createOrGet não concede mais NEW_REGISTRATION com telefone sem prova, nem mesmo se chamado com registrationStoreId. NEW_REGISTRATION removido das fontes válidas do autorizador. O inventárioDEV anterior confirmouzero vínculos: nenhuma remoção/migração real necessária/executada. Qualquer registro dessa fonte em outro ambiente exige avaliação separada; não fazer alteração PROD.

attachVerifiedClaim agora grava VERIFIED_CLAIM na mesma transação de ownership/mappings, consumo do desafio e auditoria. evidenceRef aponta para o desafio; auditoria registraUID,loja,Customer,origem e referência. Prova errada/expirada/reutilizada ou identidade conflitante não produz novo vínculo. Repetição não duplica Customer, vínculo ou auditoria. Não foi criada rota Staff/Admin de concessão.

POST/clientes recém-criado por Staff responde{id,relationshipPending:true}; não consulta/retorna perfil global nem finge autorização após a criação. Dados inseridos não concedem acesso futuro; o cadastro não aparecerá no diretório da loja até vínculo comprovado. Cadastro existente continua exigindo autorização e nunca é sobrescrito pela coincidência de telefone. Não criado novo aviso/frontend nesta etapa: impacto de criação/retorno deve ser homologado na UI do CRM.

Checkout/identity, regras de pagamento, preços, meios, guest e legacy_phone não foram reescritos. Login legacy semOTP continua fraco e não cria vínculo. Guest mantém Combinar; PIX/cartão mantêm as restrições atuais, sem antecipar Pix-only ou WhatsAppOTP. Autenticação password não verificada continua identificando uma contaUID, mas não prova o e-mail/telefone de terceiro: legado correspondente exigeclaim. Cadastro forte realmente novo permanece contrato anterior; informação de telefone é contato não verificado, nunca prova de titularidade de legado alheio.

## Retorno do cliente, conflitos e multiloja

Conta já proprietária resolve o Customer por mappings/UID, sem novoSMS. Seleção de login sozinha não cria relações de todas as lojas históricas: compraSTRONG legítima cria o par atual. Legado sem proprietário retorna claimRequired e usa o fluxo existente de prova voluntária; após sucesso, mantém o mesmoID e cria vínculo da loja do desafio. Não é necessário comprar para o vínculo criado nesse claim.

OutroUID já proprietário, índices conflitantes, aliases ambíguos ou várias correspondências falham fechados e não unem pessoas. Não há novo merge automático universal. Aliases previamente revisados continuam respeitados. Casos ambíguos permanecem preservados/pendentes; cliente pode continuar nos fluxos de compra permitidos, sem exigir que o proprietário aprove individualmente todos os clientes. A resolução segura de um conflito real pode exigir procedimento específico futuro, não concessão administrativa implícita.

Cliente comprovado em duas lojas mantém um único Customer e dois pares independentes. Não reconstruir lojas antigas de pedidosSDK. Revogação comum preservada: nega leitura/edição; checkoutSTRONG legítimo pode restabelecer. Nova prova voluntária de claim para a mesma loja também pode estabelecer relação, coerente com ausência de bloqueio permanente; deve constar explicitamente na revisão do novo delta.

## Impacto CRM e operação

Zero vínculos observado significa diretórios de loja inicialmente vazios para os perfis antigos: agora é consequência da política aprovada, não motivo para conceder relações em massa. Geral mantém autorização própria. Não houve exclusão nem migração de clientes,pedidos,endereços ou GoogleUIDs. Staff atende pedidos por sua loja e pelos dados registrados no pedido; isso não garante disponibilidade de informações que só existam no perfil global. Revisar na homologação UI de pedido, entrega/retirada e troca de cliente: o editor exige vínculo para reassociar perfil global, por segurança.

Planejador dry-run anterior fica como histórico/ferramenta offline não utilizada. Não preparar executorapply ou solicitar manifesto porcliente. Os relatórios C16_DEV_WINDOW_PREPARATION e C16_ACCEPTANCE_DECISION são históricos: sua conclusão de semeadura obrigatória foi substituída; versão publicada,guard,Rules/Hosting403 e homologação permanecem pendências válidas.

## Testes sintéticos desta etapa

Somente agente principal, execuções sequenciais. Firestore e Auth em loopback/projetosdemo; provedorSMS simulado, nenhuma mensagem externa ou pagamento. Corridas dentro de testes de segurança são intencionais para provar idempotência, não análises/agentes paralelos.

- Primeira seleção emulador:17/17PASS (claim,controlesSDK/lista/detalhe/alias/revogação/edição,guest).
- Claim final com teste multiloja e negativa explícita password não verificado:9/9PASS em namespace limpo. Google/password reivindicam legado somente com prova de telefone; pedidos/endereços intactos, disputa deUID serializada.
- HTTP primeira seleção:9/9PASS, guestCombinar/idempotência eGoogle noAuthEmulator preservados.
- HTTP adicional:3/4PASS, falha weak por índice/Customer sintético residual da execução anterior. Após limpar somente demo-doceria-checkout no emulador, repetição exclusiva weak:1/1PASS, compra sem Authorization, sem ownership e sem alteração doCustomer. Não remover asserções para passar.
- As3passagens adicionais incluem fonteSTRONG_CHECKOUT confirmada no par e guest com telefone novo sem criarCustomer; bloqueioonlineguest preservado.
- Unitários checkout-auth/diretório:37/37PASS. Lint seisarquivos0erros/1warningpreexistente. Syntax/diff-checkPASS; padrões conhecidos deSecrets no delta:0ocorrências.
- BuildCRM anterior reaproveitado: nenhumfrontend/lockfile foi alterado. Não repetir auditoria41/41,C15,buildfrontend ou suítes não afetadas.

Logs em outputs/C16_VOLUNTARY_*_20261117.log no workspace da conversa. Duas execuções intermediárias com resíduos preservadas (claim7falhas eHTTP1falha), seguidas de execuções limpas específicas. Emuladores encerrados ao final. Não alegar que soma de testes sobrepostos é cobertura nova única.

## Próximo gate

Código local preparado para revisão independente deste delta e posterior homologaçãoDEV. Não equivale a pronto para deploy imediato: novo comportamento de fontes/claim deve ser revisado; versõesRules/Hosting eguard/staging continuam pendentes. Publicação seletiva deverá incluir customerPhoneClaimConfirm além deapi/adminOrderSave conforme dependências; garantir mesma allowlist de fontes nas Functions afetadas, sem janela em que escritorVERIFIED_CLAIM não é reconhecido pelo diretório. Não ativar fonte antiga insegura para compatibilidade. Nenhuma publicação nesta etapa.

HomologaçãoDEV futura somente após autorização: comprasguest/legacy,clientevoltando com conta já comprovada/claim existente sem repetirC15, atendimento porpedido semperfilglobal, negativasStaff/alias,ediçãoautorizada,multiloja,revogação/reaquisição e nãoduplicidade. Claims reais/SMS não autorizados por este documento; manterprova local e combinar testepublicado seguro se necessário. Aceite consolidado depende do publicado e do responsável, não desta preparação.

C16PENDENTE;Fase10 93,75%;global97%;Fase13 0%;PRODREADY NÃO. Candidatos e scans anteriores preservados. Sem dados reais,push,deploy,pagamento,SMS/WhatsApp ou açãoPROD.
