# Avaliação SMS transparente — DEV, 24/10/2026

## Escopo e auditoria anterior

Workspace: C:/Users/antonio.pedro/Projeto/projeto-doceria-main/infinitepay-auth-worktree.
Branch feature/infinitepay-customer-auth. Aplicação crmdoceria-9959e;
verificação SMS isolada crmdoceria-sms-dev-2026. Nenhuma leitura/alteração PROD.

Uma implementação funcional visível: RecaptchaVerifier size normal em
address-verification-firebase.mjs, compartilhada pelo cardápio/3 aliases.
address-management.mjs montava seu container no modal. Nenhum CAPTCHA embutido
encontrado nos fluxos Google/e-mail/recuperação/Customer/CRM. O link Staff para
consultaRecaptcha.aspx é um portal fiscal externo; não é CAPTCHA da aplicação,
não foi alterado e não se promete controlar desafios desse serviço externo.

| Configuração anterior | Aplicação DEV | SMS DEV |
|---|---|---|
| Auth | FIREBASE_AUTH | IDENTITY_PLATFORM |
| Phone | Desligado | Ligado, BR |
| Enterprise API | Desabilitada | Desabilitada |
| Phone enforcement | OFF | OFF |
| Bot score / toll fraud | false / false | false / false |
| Chaves gerenciadas | Nenhuma | Nenhuma |

Config anterior completa e backup IAM ficam somente em TEMP privado, fora de
Git/artefatos. Auditoria sanitizada não publica chaves/tokens/dados residenciais.

## Configuração depois e decisão

Somente no projeto SMS: service identity oficial provisionada e vinculada ao
papel roles/identitytoolkit.serviceAgent, Enterprise API habilitada e campos
pontuais atualizados para ENFORCE + useSmsBotScore=true +
useSmsTollFraudProtection=true. Demais configurações preservadas por leitura
prévia/field mask. Primeiro vínculo retornou400 por propagação da identidade;
retry após aguardar a operação oficial e novo IAM etag confirmou sucesso.

Chaves gerenciadas WEB/IOS/ANDROID provisionadas pelo Google; WEB integrationType
SCORE. A chave gerenciada usa allowAllDomains, configuração criada pelo provider
que não alteramos. Firebase Authorized Domains e BR permanecem. Não confundir
chave pública com credencial ou prometer que domínio/quotas locais impedem todo
abuso direto da API do provider.

Regra bot inicial conservadora, bloqueando apenas a menor faixa; toll fraud usa
o ponto inicial recomendado pelo Google. Sem métricas próprias suficientes para
ajuste fino. Nenhum threshold enviado ao cliente. Documentação recomenda AUDIT
inicial; nesta entrega DEV foi escolhido ENFORCE, conforme requisito, para que
falha bloqueie em vez de fallback v2. Nenhum envio real comprova a calibração.

API confirmou ENFORCE/ambas flags/chave pública pronta. A etapa adicional
Console reCAPTCHA → Settings → SMS defense → Enable ainda exige confirmação
do operador: flags Identity Platform não são evidência suficiente desse toggle.
Confirmação solicitada sem envio SMS. Não declarar SMS defense integralmente
homologado antes disso e de evidência do fluxo normal.

Aplicação principal permanece Phone=false e configuração reCAPTCHA anterior
inalterada. Não se habilitou Phone na aplicação nem se consultou PROD.

## Implementação

- sms-enterprise.mjs carrega enterprise.js com chave SCORE e onload oficial;
  execute(siteKey, action sendVerificationCode) gera token fresco a cada clique.
- Nenhum render/RecaptchaVerifier/fallback, iframe manipulado ou token falso.
- Sem Firebase Auth OTP no browser; DEFAULT/UID/FCM/persistência não mudam.
- Backend só anuncia SMS com metadados oficiais ENFORCE/bot/toll/chave válidos;
  falha de metadata/configuração bloqueia, nunca relaxa as proteções.
- Send server-side usa captchaResponse/clientType/recaptchaVersion oficiais;
  código e token financeiro continuam fora do browser. Admin isolado valida
  phone/audience/provider como antes, sem elevar telefone a Strong.
- Erros do envio são genéricos; rate limit tem texto amigável separado.
- Branding textual visível no modal; CSS oficial limitado ao badge informativo.
  Não esconde iframe nem challenge. Este modo score-only não abre puzzle.
- Mantidos allowlist DEV, +55, cooldown60s, OTP300s, grant600s, cinco tentativas,
  quotas de telefone/IP/dia e demais gates de endereço/pagamento existentes.

## Evidência e limitações

219/219 testes gerais e delta final21/21 sobreposto;94/94 integração Auth/Firestore
demo;69/69 CRM. Delta inclui token novo/SDK único/sem widget, erro sem vazamento,
recusa OFF/AUDIT/flags ausentes/config inválida, request Enterprise correto,
branding limitado ao badge. Testes usam mocks/emuladores, não SMS real.
Lint focado sem erros/avisos de código após correção dos parâmetros da ferramenta.
Build completo PASS com quatro sourcemaps native-audio e metadados de navegadores
preexistentes. Fixtures antigas catálogo/WhatsApp não reabertas; sem alegação
de suíte global inteira verde. Diff-check PASS.

Controle do navegador falhou ao iniciar: kernel assets/path não encontrado.
Não há screenshots novos, aceite mobile/desktop ou entrega de SMS novo comprovada.
Homologação normal deve usar390×800 e1920×889. SMS real exige autorização nova
específica; a autorização anterior de um envio já foi consumida.

Rollback não deve restaurar OFF nem widget: em incidente, desabilitar somente
o canal SMS da aplicação e manter proteções Cloud, preservando Google/e-mail.
Mudanças futuras de configuração/thresholds exigem evidência, não suposição.

Fase9=75%; Fase11=100%; Fase12=100%; Global95,00%; Fase13=0%.
Nenhum pagamento/WhatsApp/PROD. Pendência externa InfinitePay preservada.

## Fontes oficiais consultadas em24/10/2026

- [Identity Platform e Enterprise](https://docs.cloud.google.com/identity-platform/docs/recaptcha-enterprise)
- [SMS defense, ENFORCE e bot score](https://docs.cloud.google.com/identity-platform/docs/recaptcha-tfp)
  — página mostra Last updated2026-10-22 UTC; recurso SMS defense em Preview.
- [sendVerificationCode REST](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/sendVerificationCode)
- [getRecaptchaConfig REST](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/TopLevel/getRecaptchaConfig)
- [Integração JavaScript score](https://docs.cloud.google.com/recaptcha/docs/instrument-web-pages)
- [Referência execute](https://docs.cloud.google.com/recaptcha/docs/api-ref-checkbox-keys)
- [Alternativa oficial de branding](https://docs.cloud.google.com/recaptcha/docs/faq)
- [Enum público de ação no código oficial Firebase](https://github.com/firebase/firebase-js-sdk/blob/main/packages/auth/src/api/index.ts)
