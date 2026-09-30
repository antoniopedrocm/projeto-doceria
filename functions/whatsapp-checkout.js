// Version identifies the exact transactional consent text shown in all menus.
const CONSENT_VERSION = 'order-confirmation-v1';
const CONSENT_TEXT = 'Quero receber a confirmação e o resumo deste pedido pelo WhatsApp da Ana Guimarães Doceria.';
const BRAZIL_DDDS = new Set((
  '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 ' +
  '41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 ' +
  '71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'
).split(' '));

const normalizeBrazilPhone = (value) => {
  const invalid = (reason) => ({status: 'invalid', reason, e164: null});
  // Do not reinterpret numbers, extension labels or arbitrary non-digit text.
  if (typeof value !== 'string' || value.length > 64) return invalid('invalid_format');
  const text = value.trim();
  if (!text || !/^\+?[0-9 ()\-.]+$/.test(text)) return invalid('invalid_format');
  let digits = text.replace(/\D/g, '');
  if (text.startsWith('+') || digits.startsWith('00')) {
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (!digits.startsWith('55')) return invalid('unsupported_country');
    digits = digits.slice(2);
  } else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  // DDD 55 with 10/11 national digits must NOT lose its area code.
  if (digits.length !== 10 && digits.length !== 11) return invalid('invalid_length');
  if (!BRAZIL_DDDS.has(digits.slice(0, 2))) return invalid('invalid_area_code');
  const subscriber = digits.slice(2);
  if (!/^(?:9[0-9]{8}|[2-5][0-9]{7})$/.test(subscriber)) return invalid('invalid_subscriber');
  return {status: 'valid', reason: null, e164: `+55${digits}`};
};

// Additional metadata only: never changes the order's existing telefone field.
// Missing consent on old clients is explicitly NOT permission to send.
const buildCheckoutWhatsApp = ({phone, consent, serverTimestamp}) => {
  const phoneResult = normalizeBrazilPhone(phone);
  const currentVersion = consent?.version === CONSENT_VERSION;
  const provided = currentVersion && typeof consent?.accepted === 'boolean';
  return {
    phoneE164: phoneResult.e164,
    phoneStatus: phoneResult.status,
    phoneReason: phoneResult.reason,
    consent: {
      granted: provided && consent.accepted === true,
      status: provided ? (consent.accepted ? 'granted' : 'declined') : 'not_provided',
      version: provided ? CONSENT_VERSION : null,
      source: 'checkout',
      recordedAt: serverTimestamp(),
    },
  };
};

module.exports = {CONSENT_VERSION, CONSENT_TEXT, normalizeBrazilPhone, buildCheckoutWhatsApp};
