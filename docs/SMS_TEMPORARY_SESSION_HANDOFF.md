# Sessão privada SMS — navegação e saída temporária

DEV04/11/2026, complemento da missão. **Fase9=100%, Global97,00%; Fase10=87,50%, Fase13=0%; PROD bloqueada.** Não altera backend, OTP/provedor, TTL, grants/ownership, pagamentos, fiscal ou fluxo de logout forte.

## Reprodução real e causa

O Dono autorizou1SMS ao destinatário DEV homologado final0290, somente para sessão temporária. Na Matriz, a UI ofereceu canal SMS, iniciou o cooldown e o titular confirmou o código exclusivamente na aplicação. O perfil protegido abriu. Nenhuma gravação de perfil/endereço ocorreu, nem pedido/pagamento. Garavelo não oferecia canais; essa pré-checagem não enviou SMS nem alterou sua configuração. Ambos os carrinhos locais foram restaurados a vazio.

Ao navegar do cardápio para Área do Cliente, o handler antigo `pagehide` chamava `phoneAddressManager.invalidate()`: apagava a prova por aba e revogava o grant. A Área do Cliente abria o contexto forte existente, sem o aviso de acesso temporário. **Entrega e validação do SMS PASS; handoff temporário FAIL no runtime4e264054.** Não registrar o gate completo como PASS.

A revisão delimitada também encontrou saída/expiração temporária ligada ao logout canônico global. Esse caminho não foi executado na conta real. Uma sessão temporária independente não deve deslogar uma sessão Staff/Customer forte existente; o logout forte explícito continua global conforme contrato homologado.

## Correção

- `address-management.mjs` separa `pageHide/pageShow` de invalidação: só preserva grant que o servidor emitiu com `CUSTOMER_PRIVATE_SESSION`, ainda válido e ligado à mesma identidade/contexto. Fecha UI/timers ao sair e rearma o prazo original no retorno BFCache, sem renovar TTL. Grant antigo só de endereço/WhatsApp, expiração ou troca de identidade continuam revogando e limpando a prova. As quatro entradas HTML usam o mesmo mecanismo, sem storeId hardcoded.
- `endPhoneSession` apaga a prova local imediatamente e tenta revogar somente o grant, coalescendo chamadas e limitando a espera remota a2segundos. Não chama signOut, FCM nem limpa preferências Staff. `logoutCanonicalSession` continua fazendo o logout forte global e chama essa limpeza como etapa inicial.
- ApplicationGate usa um callback próprio para saída/expiração/negação do shell temporário: remove a UI temporária; sem Auth retorna à entrada pública; com Auth existente revalida capabilities e retoma somente o contexto permitido. Nenhuma identidade é criada/promovida pelo SMS.

## Validação

597 React em59suítes PASS, incluindo preservação Staff/Customer/Authnull e logout forte global;164 testes públicos PASS, incluindo travessia pagehide/pageshow, TTL original, identidade alterada e revogação dos grants antigos. A última asserção de preferência Staff foi ampliada e a suíte ApplicationGate41PASS repetida, sem somar essa repetição ao total. Lint dos arquivos alterados e diff-check PASS. Build DEV `main.63105160.js`,455,33kB gzip (+124B); warnings NativeAudio/browser metadata preexistentes. Nenhuma biblioteca nova.

Review do delta: prova continua validada no backend; token não entra em URL/log/Git; cache nunca autoriza sozinho; TTL, finalidade, contexto/Customer/loja/revisão e isolamento permanecem. Não há nova chamada de provider nem mudança nas Rules. Nenhum claim permanente autorizado/executado.

Publicado **somente Hosting DEV**, commit `fb89b0fd`, versão `84e5e496890c3d26`,61/61hashes,146Functions/Rules inalteradas e cache/slugs preservados. [Entrega verificada](evidence/preprod-mission-2026-11-04/sms-handoff-hosting-dev.json). Chrome Staff permaneceu autenticado e cardápio público com carrinho0/retorno Matriz conferido após publicação. Guard do predeploy faltou no primeiro staging: a CLI interrompeu antes do envio; guard copiado intacto e o mesmo artefato publicado com sucesso.

A prova real anterior foi legitimamente revogada; não reconstruí-la, prolongá-la ou reutilizar OTP consumido. Solicitada nova autorização específica de1SMS ao mesmo titular para repetir handoff→histórico/endereço→refresh→saída temporária; **não concedida no ponto deste checkpoint**. **Não reenviar com a autorização já consumida.** C15 claim Google/e-mail e C16 consolidação seguem separados.
