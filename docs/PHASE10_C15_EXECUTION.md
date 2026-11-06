# Fase 10 — execução de C15 e fechamento de C16

## Caso indicado após publicação — final 0811

### Retorno atual PASS; delimitação do primeiro cadastro

Titular respondeu **PASS** ao retorno após o vínculo e esclareceu que só a primeira criação a partir do cardápio apresentou falha. [Evidência de aceite/auditoria](evidence/customer-menu-first-registration-review-dev.json). Foram acrescentados 8 testes sintéticos de primeira criação/onboarding/claim/remontagem/origem no código já publicado: 4 Node (password, modal/inline, Matriz/Garavelo) e 4 React (Google/password, Matriz/Garavelo). Todos passaram, sem lacuna adicional comprovada que exija outro runtime/deploy. Não tratar simulação como novo claim real nem refazer a conta/prova já concluída.

C15-E tem claim técnico e retorno pós-vínculo humano PASS; contagem visível de 1 endereço/2 pedidos e refresh/logout/relogin ainda não atestados individualmente. Pedir somente essa confirmação e seleção do caso Google independente; nenhum novo SMS autorizado. C15 geral/C16 pendentes, Fase 10 87,50%, global formal 97,00%.

### Retorno v2 publicado — nenhum novo vínculo/SMS

Titular reprovou o primeiro complemento por cair em `/?public=1`. Segundo patch **`125dad90`**, push/Hosting **`75f46bb8c26f95e6`**, 61 arquivos locais conferidos, backend/Rules preservados. Origem validada acompanha URLs internas e saída, fica em memória e pode ser recuperada de referrer público da mesma origem; sem inferir Matriz. [Relatório](CUSTOMER_MENU_RETURN_FIX.md), [release](evidence/customer-menu-return-v2-after-dev.json), [smoke com sessão existente](evidence/customer-menu-return-v2-browser-dev.json). 771 testes PASS, build/lint/diff PASS. **Aceite do caso C15-E ainda pendente**; foi solicitado caminho após Minha Conta/momento da perda. Não repetir o SMS já consumido/claim confirmado. Não elevar 87,50% nem considerar Google/C16 concluídos por esses testes.

### Complemento de navegação publicado — reteste do titular pendente

Titular informou retorno incorreto para `/area-cliente`, sem aprovar C15-E integralmente. Corrigido em **`92da223c`**, push/Hosting DEV **`16bdcc6a2499d5df`**, 61 hashes locais conferidos, backend/Rules não publicados. [Diagnóstico](CUSTOMER_MENU_RETURN_FIX.md). Origem pública validada/persistida por aba; contexto recuperado sobrevive ao cleanup; fallback público explícito evita o gate. 762 testes PASS, build/lint/diff PASS.

[Navegador real com sessão existente distinta](evidence/customer-menu-return-browser-dev.json): Matriz e Garavelo retornam corretamente, inclusive refresh; home pública desktop/mobile sem loop. Falta somente titular retestar navegação pela conta já vinculada e confirmar os demais checks C15-E anteriormente solicitados. **Não refazer SMS ou vínculo**, limite 1/1 consumido. C15 geral ainda requer caso Google independente; C16 posterior. Percentuais mantidos.

### Pós-vínculo e-mail/senha — técnico PASS, UX pendente

Em 06/11, titular respondeu “vinculado”. [Verificação DEV às 10:17 UTC−3](evidence/phase10-c15-0811-after-claim-dev.json): 15 pós-condições PASS; Customer/UID/mappings canônicos corretos, único owner autorizado, telefone verificado; 1 endereço/referências históricas preservados por fingerprint; 2 pedidos com versões inalteradas; 18 Customers antes/depois, sem novo documento. Único challenge consumido em 1 confirmação e auditoria `identity_claim_verified` registrada. 1 status/start/confirm HTTP 200; **limite de 1 SMS consumido, não reenviar**. Nenhuma escrita/envio adicional na conferência.

Ainda falta aceite do titular na UI: endereço/pedidos visíveis, refresh, logout/relogin pela mesma conta sem novo claim/SMS e retorno Matriz. Não salvar dados nem executar compra/recompra. Após PASS, C15-E pode ser fechado; o claim real Google precisa de outro cadastro sem owner e titular legítimo. Não usar esta conta já vinculada como segunda recuperação independente. C15 completo/C16 continuam pendentes, Fase 10 87,50% e global formal 97,00%.

### Liberação autorizada aplicada — 06/11

Dono autorizou explicitamente **liberação, 1 SMS e vínculo**. [Controle do limite](evidence/phase10-c15-0811-authorization-dev.json), [configuração verificada](evidence/phase10-c15-0811-allowlist-dev.json): revalidação do UID password sem vínculo e do Customer sem owner; atualização condicional somente do array allowedRecipients da Matriz, 2 → 3, todos os demais campos e destinatários preservados. Enterprise obrigatório confirmado, nenhum bypass. Verificação corrigiu comparação sensível à ordem das chaves mediante leitura histórica/igualdade profunda, sem repetir escrita. Não requer deploy.

[Baseline antes do claim](evidence/phase10-c15-0811-before-claim-dev.json): 18 Customers, 1 endereço, 2 pedidos referenciados (1 root revisado e 1 subcoleção). São contagens atuais; não repetir a fotografia antiga de 1 pedido como dado atual. Handoff reserva a única tentativa autorizada: titular clica Enviar código uma vez no modal da sessão anônima existente, digita/confirmando somente na aplicação. Não reenviar sem nova autorização; antes de retomar qualquer ação, consultar orçamento e resultado real. Envio/claim ainda não comprovados. Depois conferir fingerprints, UID/canônico/auditoria/desafio consumido e UX de refresh/logout. Cenário Google independente e C16 continuam pendentes; Fase 10 87,50%, global formal 97,00%.

### Diagnóstico de envio em 06/11 às 09:53 UTC−3

Cadastro normal/e-mail autorizado pelo Dono e realizado pelo titular: conta agora existe com provider `password`, sem mapping forte e Customer original continua sem owner. [Evidência](evidence/phase10-c15-sms-block-0811-dev.json). Seis POST de `customerPhoneClaimStatus` retornaram 503; nenhuma chamada start/confirm nem challenge criado para esse UID. Causa comprovada: destinatário fora da allowlist SMS DEV Matriz; `address-verification-provider.js:20` não disponibiliza canal, e `customer-phone-claim.js:19` retorna `unavailable` antes de enviar. Não diagnosticar como falha de entrega do provedor ou como erro COOP.

Preparada proposta específica: adicionar só final 0811 à allowlist da Matriz, mantendo política/limites/destinatários existentes; até 1 SMS; confirmação manual na aplicação vincula permanentemente o Customer selecionado à conta indicada. **Ainda aguarda autorização específica de política/claim e limite explícito**; pedido anterior de avisar sobre SMS foi preservado, não interpretado como liberação irrestrita. Prova por telefone não pode ser substituída pela verificação de e-mail. Revalidar dados antes de executar. 5 testes focados PASS, sem mudança de runtime/deploy/envio real. C15 permanece pendente.

### Atualização de 06/11 — conta de destino informada e conferida

Dono informou o e-mail legítimo do cenário e-mail/senha. [Evidência sanitizada](evidence/phase10-c15-destination-0811-dev.json), consulta DEV de 06/11 às 06:31 UTC−3: a conta **ainda não existe no Firebase Auth**, candidato sem owner e índice READY; destinatário fora da allowlist. Não criar via Admin SDK, escolher senha, substituir UID ou usar sessão Customer já existente. A sessão autenticada encontrada no navegador integrado foi preservada. O titular deve confirmar controle do telefone e autorizar/realizar cadastro normal em janela anônima DEV, mantendo senha e eventual verificação de e-mail somente na aplicação. Parar antes de solicitar SMS/claim. Depois do login humano, revalidar identidade/caso e obter aprovação específica para destinatário, limite de envio e vínculo. Nenhuma dessas permissões está implícita na indicação do e-mail ou na autorização geral de deploy DEV.

0 escritas remotas/SMS/claims nesta preparação; nenhum delta de runtime/build/deploy. C15 e C16 continuam pendentes, Fase 10 = 87,50%, global formal = 97,00%. Os parágrafos abaixo descrevem a fotografia anterior e não significam que o e-mail ainda precise ser informado.

Em **06/11/2026**, o Dono selecionou **e-mail/senha** para este candidato, mantendo a exigência de equivalência com Google. Ambos já usam o mesmo registry/claim no runtime publicado e foram testados com mocks e SDK emulado; nenhuma configuração por telefone/provider precisa ser adicionada para essa equivalência. Faltam o e-mail da conta DEV legítima e a confirmação de controle do SMS pelo titular. Indicação não é autorização de envio/vínculo nem aprovação de novo UID sobre Customer que já tenha owner.

Indicação do Dono conferida somente no DEV: caseId `72f99a605f6f471b`, canônico/índice READY, nenhum owner/mapping forte/e-mail de contato; um endereço e um pedido root com referência histórica revisada, sem conflitos encontrados. [Fotografia específica sanitizada](evidence/phase10-c15-candidate-0811-dev.json). Sem inferir loja do pedido ou usar telefone como prova de propriedade.

Na fotografia de 05/11, o destinatário não está na allowlist da política SMS Matriz; revalidar antes de uma operação autorizada. Ainda faltam conta de destino e confirmação de controle do telefone; nenhum envio, claim ou alteração de política autorizado/executado. Depois da identificação forte legítima, preparar proposta exata e aprovação própria de vínculo/liberação/SMS. Este é candidato para o cenário **e-mail/senha**; não reaproveitar um claim concluído como segunda recuperação Google independente. Runtime `a36d558c` já publicado e verificado; não refazer deploy/testes. Fase 10 permanece 87,50%, global formal 97,00%, C15/C16 pendentes.

## Estado em 05/11/2026

**C15 pendente; C16 pendente. Fase 10 = 87,50% (14/16), global formal = 97,00%, Fase 9 = 100%, Fase 13 = 0%. PROD não autorizada.** Esta preparação não substitui os dois claims reais previstos na rubrica de aceite.

Workspace: `C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree`; branch `feature/infinitepay-customer-auth`; único projeto consultado: `crmdoceria-9959e`. O banco `(default)` é STANDARD. Nenhum acesso a PROD.

O repositório estava em `85aa41f2`, sem alterações tracked pendentes e sincronizado com origin. A conferência remota somente leitura confirmou 146 Functions, API `api-00070-jib`, Rules `19bc50df-ace4-453f-8bce-fae33bce3bcf` e Hosting `f960c57c592945d0`/`main.08ad2156.js`, correspondentes ao fechamento anterior. Não houve novo build ou deploy. [Conferência do ambiente](evidence/preprod-current-dev-2026-11-05.json).

## Pré-checagem real dos dados

Fonte: [evidência sanitizada de 05/11 às 15:09 UTC−3](evidence/phase10-c15-preflight-2026-11-05-dev.json), fingerprint `89f027e8be0dcfcd6543a819fef2f4cdf2381bbbde1f32a51d8e1d735fc126f8`. A consulta projetou apenas os campos necessários para telefone/ownership/índices/política; não leu perfis completos, endereços, pedidos, tokens Auth, OTP ou credenciais do provedor.

| Grupo | Quantidade | Consequência para C15 |
|---|---:|---|
| Documentos Customer | 18 | 4 aliases excluídos da seleção de canônicos |
| Canônicos/não classificados | 14 | Precisam de revisão específica antes de qualquer vínculo |
| Com proprietário | 2 | Ambos já estão na allowlist; não remover proprietários para produzir teste |
| Sem proprietário, celular e índice canônico válidos, sem mapping de identidade | 8 | Nenhum está na allowlist atual de SMS da Matriz |
| Sem proprietário, telefone/índice ausente ou inválido | 4 | Não elegíveis para claim automático |
| Casos prontos na pré-checagem da política atual | **0** | Faltam seleção do titular e aprovações específicas |

Foram consultados também 10 índices de telefone, 4 mappings de UID e 4 mappings de identidade. Política SMS configurada não prova disponibilidade ao vivo do provedor nem autoriza envio. A pré-checagem da política foi feita para a **Matriz explicitamente selecionada**; não pressupõe configuração igual no Garavelo ou em outra loja.

Os oito caseIds bloqueados somente pela allowlist nessa fotografia são:

- `72f99a605f6f471b`, `01a721be8c238c0b`, `55909178172b2298`, `1cddb7d70c104969`;
- `a403670c5b1f4151`, `2d89cd75cca089b0`, `d9ee9b15fc864653`, `69a648e5cabea773`.

CaseId é uma referência opaca da auditoria, não uma prova de titularidade. A correspondência com o cadastro escolhido será conferida privadamente no caso concreto; nomes, telefones completos e UIDs não serão publicados em Git. Esta fotografia não reabre a disposição C14 dos 14 remanescentes aprovada pelo Dono.

## Seleção e autorização necessárias

O Dono deve indicar cadastros legados que tenham titulares legítimos disponíveis e a conta DEV de destino de cada cenário. Precisamos de duas execuções independentes:

| Cenário | Identidade de destino | Prova e pós-condição |
|---|---|---|
| C15-G | Login real Google | Claim específico vincula o Customer legado ao UID Google correto |
| C15-E | Login real e-mail/senha | Claim específico vincula outro caso ainda não vinculado ao UID correto |

Reentrar numa conta já proprietária ou adicionar outro provider a um UID já vinculado não demonstra uma segunda recuperação de legado. Não criar identidade Google artificial, trocar UID, desvincular C02/final 0290, substituir telefone legado ou migrar ownership para fabricar o cenário.

Antes de qualquer envio/mutação, preparar para cada caso uma proposta privada revisável: Customer canônico/aliases, loja explícita, telefone canônico mascarado, identidade de destino verificada pelo login humano, estado de ownership e mappings, quantidade/referências de pedidos e endereços esperados, escopo da alteração e evidência anterior. Usar a trilha e proteções existentes em [LEGACY_MANUAL_REVIEW.md](LEGACY_MANUAL_REVIEW.md), sem aplicar migração genérica.

Pedir aprovação específica do Dono/titular para o vínculo permanente daquele cadastro àquela conta e, se necessário, a liberação daquele destinatário na política DEV. Obter limite explícito de SMS para cada execução antes de enviar. As duas autorizações anteriores foram consumidas em sessões temporárias; não autorizam novo envio nem claim permanente. Não ampliar automaticamente a allowlist.

## Execução pela interface existente

1. Revalidar somente o caso escolhido: índice READY, telefone canônico consistente, ausência de owner incompatível/mapping conflitante e loja explícita. Se houver divergência desde a fotografia, interromper esse caso para revisão; não sobrescrever dados.
2. Titular faz o login Google ou e-mail/senha normalmente. Senha, token, código e sessão privada ficam na aplicação; o agente não extrai credenciais do navegador.
3. Conferir o estado `claimRequired` no preenchimento do perfil. O fluxo deve usar o propósito `CUSTOMER_IDENTITY_CLAIM`, vinculado a UID/provider/subject/Customer/phoneKey/storeId. Grant de endereço ou sessão temporária não serve como prova de ownership.
4. Com aprovação do caso e limite de envio registrados, solicitar o código uma única vez pelo fluxo existente. Titular confirma o código somente na aplicação. Não reenviar automaticamente em caso de expiração/falha.
5. Após sucesso, verificar por leitura autorizada: mesmo Customer canônico; alias e referências históricas preservados; UID/identidade corretos; desafio consumido; auditoria existente registrada; nenhum Customer duplicado ou owner indevido.
6. Conferir histórico e endereços esperados, refresh e retorno à loja de origem sem salvar perfil/endereço, criar pedido ou pagar. Se a identidade também for Staff, manter o mesmo UID e suas capabilities. Conferir isolamento de outra identidade com os testes negativos existentes; não conceder acesso a órfãos ou dados privados sem vínculo comprovado.
7. Registrar por caso somente provider, caseId opaco, tempos/status, quantidades, hashes de comparação e resultado. Não registrar telefone completo, nome/e-mail, UID bruto, OTP, grant ou token. Não desfazer claim válido automaticamente ao encerrar a sessão.

O backend existente revalida o escopo durante a transação, aplica cooldown/limites compartilhados de SMS e consome a prova uma vez. Não é necessário reimplementar `customer-phone-claim.js` ou `customer-registry.js` para executar o aceite.

## C16 e percentuais

C15 só recebe PASS depois dos dois cenários reais aprovados e das respectivas pós-condições. Depois consolidar C01–C15, disposição dos remanescentes, evidências de publicação, regressão pertinente e aceite final da Fase 10. Não repetir os gates já aprovados sem mudança ou falha nova. Se surgir correção de runtime, aplicar testes/build/lint/diff, commit/push e deploy DEV somente do necessário antes do novo aceite.

Somente C15 PASS: 15/16 = 93,75% da Fase 10. C15 e C16 PASS: 16/16 = 100%. O global formal permanece 97,00% porque a Fase 10 continua fora da ponderação histórica. Nenhum desses marcos autoriza PROD; revisão final, configurações/backup autorizados e decisão explícita do proprietário continuam necessários.

## Ferramenta de pré-checagem

`scripts/phase10-claim-preflight.cjs` é somente leitura, com guard do workspace/Project ID DEV, loja obrigatória e saída sanitizada nova dentro de `docs/evidence`. Usa a autenticação existente da CLI, sem ler sessão do navegador. Recusa flags de aplicação, envio, claim ou migração; consultas acima de 1.000 documentos falham sem truncar silenciosamente.

Exemplo de comando a partir do workspace acima; substituir o caminho da biblioteca CLI pela instalação local disponível e escolher **novo** nome de saída, preservando evidências anteriores:

```text
node --use-system-ca scripts/phase10-claim-preflight.cjs --project crmdoceria-9959e --store ana-guimaraes-doceria-matriz --firebase-tools-lib <firebase-tools/lib> --out docs/evidence/phase10-c15-preflight-<data>-dev.json
node --test scripts/phase10-claim-preflight.test.cjs
```

O resultado `DATA_PRECHECK_READY` não concede permissão, não valida disponibilidade Enterprise ao vivo e não autoriza claim ou envio. Nesta retomada: **0 escritas remotas, 0 claims, 0 SMS**. Ferramenta e roteiro não entram no bundle da aplicação e não requerem deploy.

[Validação local](evidence/phase10-c15-preparation-local.json): 8/8 testes, sintaxe PASS, lint dos scripts sem erros/avisos e diff-check PASS. Os testes cobrem mascaramento/ausência de aprovação implícita, owners existentes, índice contraditório, mappings conflitantes, aliases/telefone inválido/fixo, política/allowlist, guards DEV e decodificação de projeções Firestore. Não são contabilizados como aceite real de C15.
