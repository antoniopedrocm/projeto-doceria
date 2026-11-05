# LEGACY_PHONE — pagamento e acesso temporário privado V2

## Estado vigente — sessão temporária SMS PASS

**Fase9=100%; Fase10=87,50% (14/16); Global formal=97,00%; Fase13=0%. PROD READY: NÃO.** Gate SMS Enterprise temporário concluído no DEV:2envios com autorizações específicas separadas, titular confirmou só na aplicação; navegação/grant privado,12endereços, histórico/detalhe, refresh e saída preservando Staff PASS. Nenhum novo pedido/pagamento/NF/WhatsApp, mutação de perfil/endereço ou claim permanente. Carrinhos locais restaurados a0; não há autorização de novo SMS.

Correção de handoff/saída fb89b0fd homologada em conta real; complemento visual restrito a hashes longos a4a5cdfe publicado no Hosting DEV versãof960c57c592945d0,61/61hashes,146Functions/Rules inalteradas/cache/slugs preservados.41testes focados e16cenários visuais do componente real com dados fictícios PASS, buildmain.08ad2156.js455,34kB/CSSa5070aae14,61kB, lint/diffPASS; regressão anterior597React/164públicos preservada sem somar repetições. [Fechamento do gate](evidence/preprod-mission-2026-11-04/sms-temporary-gate-final-dev.json), [causa/correções](SMS_TEMPORARY_SESSION_HANDOFF.md).

**Próximo ponto exato: C15.** Solicitada ao Dono indicação dos cadastros legados sem proprietário e contas DEV legítimas/titulares para cenários Google/e-mail. Não desvincular C02/final0290, falsificar Auth ou conceder ownership para fabricar aceite. Preparar caso concreto e aprovação própria de claim/SMS; a autorização temporária não os abrange. Depois C16 consolidado; não elevar Fase10 por fechar somente SMS. Não refazer Fase9 ou gates já PASS. Registros abaixo são históricos e esta seção prevalece.


Decisão de produto: missão pré-PROD do proprietário, implementada em DEV em 01/11/2026. Este contrato substitui a exigência anterior de Google/e-mail para pagar online com contexto LEGACY_PHONE. Não altera a identidade Firebase, a titularidade permanente, Admin Preview ou a prova de claim.

## Checkout e retorno de pagamento

Contexto de telefone emitido no servidor, vinculado à loja/revisão/Customer canônico e hash do telefone atual, pode criar ONLINE_NOW ou AGREED_LATER. Guest sem identificação válida não ganha esse direito. O servidor ignora Customer ID forjado. Nenhum UID ambiente é herdado pelo pedido LEGACY_PHONE.

ONLINE_NOW preserva preços/frete/cupom/estoque/idempotência, provider da loja e payment_check no servidor. Nome informado e telefone canônico normalizado são enviados ao provider; e-mail privado de outro owner não é exposto por conhecimento do telefone. AGREED_LATER permanece PENDING, método indefinido, sem link financeiro.

`paymentReturnToken` tem finalidade exclusiva de consultar uma tentativa. Derivação HMAC com separação de domínio a partir do contexto aleatório do checkout; somente hash persistido. TTL de 48 horas, sem renovação em cada consulta: cobre retorno/refresh e reconsulta após saída do provider, limitando a duração de um bearer sem identidade. Não dá acesso a Customer, pedidos privados, endereço, carrinho, Auth ou Staff. O retorno limitado não entrega checkoutUrl nem dados privados. Históricos sem capability preservam a consulta pelo UID autenticado original.

O token fica apenas em sessionStorage da aba, fora de URL/referrer/logs. Cada paymentId tem sua chave; uma nova compra não sobrescreve a credencial da tentativa anterior. PAID encerra o identificador de criação, mantendo a credencial limitada para refresh. Falhas/retries não recriam link ambíguo, reserva ou pedido.

## SMS e finalidade privada temporária

Telefone puro continua sem histórico, endereço completo ou edição privada. SMS validado no projeto de verificação separado emite `CUSTOMER_PRIVATE_SESSION`, associado ao grant temporário já ligado a contexto/revisão/loja/Customer/telefone/TTL. WhatsApp e grants antigos somente de endereço não são ampliados silenciosamente para essa finalidade.

TTL usa a política existente da loja (padrão 10 minutos, limite 15), sem renovação automática. Mantidos Enterprise, quotas, cooldown, nonce, lease de verificação, consumo único do desafio e ausência de OTP em logs. Não existe signIn Firebase no navegador com essa prova.

Endpoints `/customer/phone-session/*` revalidam grant no backend. Histórico reutiliza `customerReadContext`/`createCustomerOrders`, owners e aliases revisados, nunca consulta por telefone para atribuir ownership. Pedido órfão/root sem vínculo revisado continua negado. Perfil permitido: somente nome/aniversário; telefone/identity/Auth são imutáveis. CRUD de endereço reutiliza a validação e auditoria existentes e referências opacas.

UI temporária reutiliza CustomerFrame, cards e tokens atuais, com aviso explícito de sessão temporária. A cache não autoriza o shell privado: aguarda resposta do servidor. Refresh mantém a prova por aba; expiração/erro fecha acesso. Logout remove a prova local imediatamente, tenta revogar remotamente com limite de 2 segundos e preserva o contrato canônico de logout. Não altera tokens FCM de outros dispositivos.

Claim permanente continua exigindo Google/e-mail real e desafio próprio `CUSTOMER_IDENTITY_CLAIM`; grant de sessão privada não pode ser usado como identity claim.

## Validação em andamento

Atualização do aceite real04/11:1SMS autorizado ao final0290 entregue e confirmado pelo titular, perfil protegido aberto sem salvar. Handoff para Área do Cliente falhou porque pagehide antigo revogava o grant; corrigido emfb89b0fd, juntamente com a separação do encerramento temporário e logout global.597React/164públicos PASS, buildmain.63105160.js455,33kB, lint/diffPASS. Nenhum backend/Rules/OTP/TTL alterado. Publicação Hosting complementar/reteste devem ser conferidos no checkpoint, sem presumir aceite real do handoff. Autorização anterior de1SMS consumida, sem reenvio; C15/C16 continuam pendentes. [Contrato e causa](SMS_TEMPORARY_SESSION_HANDOFF.md).

Atualização04/11/2026: runtime4e264054 publicado/verificado no DEV (API/Rules/Hosting); regressão consolidada1.120PASS, revisão de segurança do delta concluída e build/lint PASS. Entrada pública temporária desktop1920×889/mobile390×800 e retorno amigável Garavelo conferidos sem envio de SMS, sem shell privado ou overflow horizontal. **Ainda falta aceite real Enterprise/grant e claim Google/e-mail C15**, mediante autorização específica; não é claim concluído. [Evidências atuais](evidence/preprod-mission-2026-11-04/validation.json), [gates/roteiro](PRODUCTION_READINESS_REVIEW.md). O parágrafo abaixo preserva a aferição inicial local.

27 testes HTTP/retorno, 24 emulados de grants/claim/privacidade e 88 React de Customer/logout/preview passaram; 4 testes públicos de escolha/header/redirect passaram. Provider/SMS são simulados em emuladores. Nenhum SMS, pagamento, nota ou WhatsApp real realizado. Build DEV passou (avisos anteriores de sourcemap Native Audio; +3,51 kB gzip nesta aferição); lint focado passou. Publicação, revisão de segurança e aceite desktop/mobile deste novo contrato ainda pendentes; isso não fecha Fase 9/10.
