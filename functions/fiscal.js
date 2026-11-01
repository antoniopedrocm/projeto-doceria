const {GoogleAuth} = require('google-auth-library');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const forge = require('node-forge');
const {isValidFiscalDocument} = require('./fiscal-core');
const {fiscalCents, allocateFiscalCharges} = require('./fiscal-money');
const {createHash} = require('node:crypto');
const {cloneEditableForm, draftTotals, editableFromXml} = require('./fiscal-clone');
const {explicitFiscalPayment, manualPaymentPatch} = require('./order-payment-method');
const {canAdministerFiscal, canEditPlatformFiscalService, protectedPlatformFieldsIn} = require('./fiscal-permissions');
const {MAX_FISCAL_NUMBER, counterId, counterRevision, nextNumberFrom, isFiscalNumber, sequenceContext, sameSequence, invoiceKnowsNumber, rangeBlocksNumber} = require('./fiscal-numbering');

const secretManager = new SecretManagerServiceClient();
const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;
const MAX_ADDITIONAL_INFO_LENGTH = 5000;

const INVOICE_STATUS = {
  DRAFT: 'draft',
  VALIDATING: 'validating',
  AUTHORIZED: 'authorized',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  DENIED: 'denied',
  PENDING_RETURN: 'pending_return',
};
const DUPLICATE_NFE_CSTATS = new Set([204, 539]);
const BLOCKING_ORDER_INVOICE_STATUSES = new Set([
  INVOICE_STATUS.VALIDATING,
  INVOICE_STATUS.PENDING_RETURN,
  INVOICE_STATUS.AUTHORIZED,
  INVOICE_STATUS.DENIED,
]);

const onlyDigits = (value) => String(value || '').replace(/\D/g, '');
const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const nowIso = () => new Date().toISOString();
const trimText = (value) => String(value || '').trim();
const normalizeLookupText = (value) => trimText(value)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const inferDocumentType = (document) => (onlyDigits(document).length > 11 ? 'CNPJ' : 'CPF');
const environmentCode = (environment) => (environment === 'production' ? 1 : 2);

const normalizePaymentCode = (value) => {
  const digits = onlyDigits(value);
  if (!digits) return '';
  return digits.padStart(2, '0').slice(-2);
};

const fiscalPaymentCodeFromText = (method) => {
  const value = normalizeLookupText(method);
  if (!value) return '';

  const isPix = value.includes('pix');
  const isFixedPix = (
    value.includes('pix fixo')
    || value.includes('qr code fixo')
    || value.includes('qrcode fixo')
    || value.includes('qr-code fixo')
    || value.includes('estatico')
    || value.includes('chave pix')
    || value.includes('chave fixa')
  );
  if (isFixedPix) return '20';

  const isDynamicPix = isPix && (
    value.includes('link')
    || value.includes('dinamico')
    || value.includes('gerado')
    || value.includes('venda')
    || value.includes('copia e cola')
  );
  if (isDynamicPix) return '17';
  if (isPix) return '20';

  if (value.includes('dinheiro') || value.includes('cash') || value.includes('especie')) return '01';
  if (value.includes('debito') || value.includes('debit')) return '04';
  if (value.includes('credito') || value.includes('credit')) return '03';
  if (value.includes('link de pagamento') || value.includes('cartao')) return '03';

  return '';
};

const getPaymentCandidates = (order = {}) => {
  const candidates = [];
  const addCandidate = (candidate, source) => {
    if (candidate === undefined || candidate === null || candidate === '') return;
    if (typeof candidate === 'string') {
      candidates.push({method: candidate, source});
      return;
    }
    if (typeof candidate !== 'object') return;
    candidates.push({
      method: candidate.method || candidate.metodo || candidate.formaPagamento || candidate.type || candidate.tipo || candidate.name || candidate.label || candidate.description || candidate.descricao || '',
      methodCode: candidate.methodCode || candidate.codigoFiscal || candidate.fiscalCode || candidate.tPag || candidate.code || '',
      amount: candidate.amount ?? candidate.valor ?? candidate.value ?? candidate.total ?? null,
      source,
    });
  };

  addCandidate(order.payment, 'order.payment');
  addCandidate(order.formaPagamento, 'order.formaPagamento');
  addCandidate(order.paymentMethod, 'order.paymentMethod');
  addCandidate(order.metodoPagamento, 'order.metodoPagamento');
  addCandidate(order.pagamento, 'order.pagamento');

  [
    ['order.payments', order.payments],
    ['order.pagamentos', order.pagamentos],
    ['order.paymentMethods', order.paymentMethods],
    ['order.formasPagamento', order.formasPagamento],
  ].forEach(([source, list]) => {
    if (!Array.isArray(list)) return;
    list.forEach((item, index) => addCandidate(item, `${source}[${index}]`));
  });

  return candidates;
};

const resolveFiscalPayment = (order = {}, settings = {}, invoiceTotal = 0) => {
  const explicit = explicitFiscalPayment(order);
  if (explicit) return {...explicit,amount:invoiceTotal,fallbackUsed:false,multiplePaymentsDetected:false,selectionRule:'authoritative_order_payment',candidates:[]};
  const fallbackCode = normalizePaymentCode(settings.defaultPaymentMethodCode || '99') || '99';
  const candidates = getPaymentCandidates(order);
  const enriched = candidates.map((candidate) => ({
    ...candidate,
    methodCodeFromText: fiscalPaymentCodeFromText(candidate.method),
    normalizedMethodCode: normalizePaymentCode(candidate.methodCode),
    normalizedMethod: trimText(candidate.method),
    numericAmount: Number(candidate.amount ?? 0),
  }));

  const recognizedByText = enriched.filter((candidate) => candidate.methodCodeFromText);
  const selectedByText = recognizedByText.length > 1
    ? recognizedByText.reduce((selected, candidate) => (
      Number(candidate.numericAmount || 0) > Number(selected.numericAmount || 0) ? candidate : selected
    ), recognizedByText[0])
    : recognizedByText[0];

  if (selectedByText) {
    return {
      methodCode: selectedByText.methodCodeFromText,
      method: selectedByText.normalizedMethod,
      source: selectedByText.source,
      fallbackUsed: false,
      amount: invoiceTotal,
      multiplePaymentsDetected: enriched.length > 1,
      selectionRule: enriched.length > 1 ? 'recognized_payment_with_highest_amount' : 'recognized_order_payment',
      candidates: enriched.map((candidate) => ({
        method: candidate.normalizedMethod || null,
        methodCode: candidate.normalizedMethodCode || null,
        amount: Number.isFinite(candidate.numericAmount) ? candidate.numericAmount : null,
        source: candidate.source,
      })).slice(0, 10),
    };
  }

  const selectedByCode = enriched.find((candidate) => candidate.normalizedMethodCode);
  if (selectedByCode) {
    return {
      methodCode: selectedByCode.normalizedMethodCode,
      method: selectedByCode.normalizedMethod || null,
      source: selectedByCode.source,
      fallbackUsed: false,
      amount: invoiceTotal,
      multiplePaymentsDetected: enriched.length > 1,
      selectionRule: 'explicit_order_payment_code',
      candidates: enriched.map((candidate) => ({
        method: candidate.normalizedMethod || null,
        methodCode: candidate.normalizedMethodCode || null,
        amount: Number.isFinite(candidate.numericAmount) ? candidate.numericAmount : null,
        source: candidate.source,
      })).slice(0, 10),
    };
  }

  return {
    methodCode: fallbackCode,
    method: null,
    source: 'fiscalConfig.settings.defaultPaymentMethodCode',
    fallbackUsed: true,
    amount: invoiceTotal,
    multiplePaymentsDetected: enriched.length > 1,
    selectionRule: 'fallback_default_payment_method',
    candidates: enriched.map((candidate) => ({
      method: candidate.normalizedMethod || null,
      methodCode: candidate.normalizedMethodCode || null,
      amount: Number.isFinite(candidate.numericAmount) ? candidate.numericAmount : null,
      source: candidate.source,
    })).slice(0, 10),
  };
};

const getNested = (obj, paths) => {
  for (const path of paths) {
    const value = path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const parseAddressText = (value) => {
  const text = trimText(value);
  const parts = text.split(',').map((part) => trimText(part)).filter(Boolean);
  const stateMatch = text.match(/(?:^|[\s,/-])([A-Z]{2})\s*(?:,|$)/);
  const zipMatch = text.match(/\b\d{5}[-.\s]?\d{3}\b/);
  const cityPart = parts[3] || '';

  return {
    street: parts[0] || text,
    number: parts[1] || 'S/N',
    district: parts[2] || '',
    city: trimText(cityPart.replace(/\s*-\s*[A-Z]{2}.*/i, '')) || 'Goiania',
    cityCode: '5208707',
    state: stateMatch?.[1] || 'GO',
    zip: onlyDigits(zipMatch?.[0] || ''),
  };
};

const normalizeAddress = (source = {}) => {
  if (typeof source === 'string') {
    return parseAddressText(source);
  }

  const address = source || {};
  return {
    street: address.street || address.logradouro || address.rua || address.endereco || address.enderecoCompleto || '',
    number: address.number || address.numero || 'S/N',
    complement: address.complement || address.complemento || '',
    district: address.district || address.bairro || '',
    city: address.city || address.cidade || 'Goiania',
    cityCode: onlyDigits(address.cityCode || address.codigoMunicipio || address.codigoIbge || '5208707'),
    state: String(address.state || address.uf || 'GO').toUpperCase(),
    zip: onlyDigits(address.zip || address.cep || ''),
    phone: onlyDigits(address.phone || address.telefone || ''),
  };
};

const allocateDiscounts = (items, orderDiscount) => {
  const discounts = items.map((item) => money(item.discount || 0));
  let remaining = money(orderDiscount);

  for (let index = items.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const gross = money(items[index].quantity * items[index].unitPrice);
    const capacity = money(Math.max(0, gross - discounts[index]));
    const applied = money(Math.min(capacity, remaining));
    discounts[index] = money(discounts[index] + applied);
    remaining = money(remaining - applied);
  }

  return discounts;
};

const inferInvoiceModel = (order, customer, issuer, modelOverride) => {
  if (modelOverride === 55 || modelOverride === '55') return 55;
  if (modelOverride === 65 || modelOverride === '65') return 65;

  const documentType = customer.documentType || inferDocumentType(customer.document);
  const customerState = customer.address?.state;
  const issuerState = issuer.address?.state;

  if (customer.requiresNfe || order?.fiscal?.requiresNfe) return 55;
  if (customerState && issuerState && customerState !== issuerState) return 55;
  if (documentType === 'CNPJ' && (customer.stateRegistration || customer.receivesIcmsCredit)) return 55;
  return 65;
};

const validatePreparedPayload = (payload) => {
  const errors = [];

  if (!payload.issuer?.cnpj) errors.push('Emitente sem CNPJ.');
  if (!payload.issuer?.legalName) errors.push('Emitente sem razão social.');
  if (!payload.issuer?.stateRegistration) errors.push('Emitente sem inscrição estadual.');
  if (!payload.issuer?.address?.street) errors.push('Emitente sem endereço fiscal.');
  if (!payload.issuer?.address?.district) errors.push('Emitente sem bairro fiscal.');
  if (!payload.issuer?.address?.city) errors.push('Emitente sem município fiscal.');
  if (!payload.issuer?.address?.cityCode) errors.push('Emitente sem código IBGE fiscal.');
  if (!payload.issuer?.address?.state) errors.push('Emitente sem UF fiscal.');
  if (!payload.issuer?.address?.zip) errors.push('Emitente sem CEP fiscal.');
  const customerDocument = onlyDigits(payload.customer?.document);
  if (!customerDocument) errors.push('Cliente sem CPF/CNPJ.');
  else if (!isValidFiscalDocument(customerDocument)) errors.push('Cliente: CPF/CNPJ inválido. Confira dígitos e formato.');
  if (!payload.customer?.name) errors.push('Cliente: nome ou razão social não informado.');
  if (payload.issuer?.cnpj && !isValidFiscalDocument(payload.issuer.cnpj)) errors.push('Emitente: CNPJ inválido.');
  if (!payload.customer?.address?.street) errors.push('Cliente sem endereço fiscal.');
  if (!payload.customer?.address?.district) errors.push('Cliente sem bairro fiscal.');
  if (!payload.customer?.address?.city) errors.push('Cliente sem município fiscal.');
  if (!payload.customer?.address?.cityCode) errors.push('Cliente sem código IBGE fiscal.');
  if (!payload.customer?.address?.state) errors.push('Cliente sem UF fiscal.');
  if (onlyDigits(payload.customer?.address?.zip).length !== 8) errors.push('Cliente: CEP deve possuir 8 dígitos.');
  if (onlyDigits(payload.issuer?.address?.zip).length !== 8) errors.push('Emitente: CEP deve possuir 8 dígitos.');
  if (!payload.invoice?.number || payload.invoice.number < 1) errors.push('Número fiscal inválido.');
  if (![55, 65].includes(Number(payload.invoice?.model))) errors.push('Documento: modelo fiscal inválido.');
  if (!Number.isInteger(Number(payload.invoice?.series)) || Number(payload.invoice.series) < 0) errors.push('Documento: série inválida.');
  if (!Array.isArray(payload.items) || payload.items.length === 0) errors.push('Produtos: adicione ao menos um item.');

  (payload.items || []).forEach((item, index) => {
    const label = item.description || `Item ${index + 1}`;
    if (!item.description) errors.push(`Item ${index + 1}: descrição não informada.`);
    if (!item.unit) errors.push(`${label}: unidade não informada.`);
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) errors.push(`${label}: quantidade inválida.`);
    if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) < 0) errors.push(`${label}: valor unitário inválido.`);
    if (!item.ncm || item.ncm.length !== 8) errors.push(`${label}: informe um NCM válido com 8 dígitos.`);
    if (!item.cfop || item.cfop.length !== 4) errors.push(`${label}: informe um CFOP válido com 4 dígitos.`);
    if (!item.tax?.csosn && !item.tax?.cst) errors.push(`${label}: informe CSOSN/CST.`);
    if (item.tax?.origin === null || item.tax?.origin === undefined || item.tax?.origin === '') errors.push(`${label}: origem fiscal não informada.`);
    if (!item.tax?.pisCst) errors.push(`${label}: CST de PIS não informado.`);
    if (!item.tax?.cofinsCst) errors.push(`${label}: CST de COFINS não informado.`);
    if (item.discount > item.total) errors.push(`${label}: desconto maior que o total.`);
  });

  const itemDiscounts = money((payload.items || []).reduce((sum, item) => sum + (item.discount || 0), 0));
  if (itemDiscounts !== payload.totals.discount) {
    errors.push('Total de desconto divergente da soma dos descontos dos itens.');
  }
  const expectedTotal = money(payload.totals.products - payload.totals.discount + payload.totals.freight + payload.totals.insurance + payload.totals.other);
  if (expectedTotal !== money(payload.totals.invoice)) errors.push('Totais: valor da nota diverge da soma de produtos, descontos e acréscimos.');
  for (const field of ['freight', 'insurance', 'other']) {
    if (!Number.isFinite(Number(payload.totals[field])) || Number(payload.totals[field]) < 0) errors.push(`Totais: ${field} inválido.`);
    if (payload.items.some((item) => item[field] !== undefined)
      && payload.items.reduce((sum, item) => sum + fiscalCents(item[field]), 0) !== fiscalCents(payload.totals[field])) {
      errors.push(`Totais: ${field === 'freight' ? 'frete da NF-e' : field} não corresponde ao somatório distribuído entre os itens.`);
    }
  }

  if (payload.invoice.payment.methodCode === '90' && payload.invoice.payment.amount > 0) {
    errors.push('Forma de pagamento 90 (sem pagamento) não pode ter valor pago maior que zero.');
  }

  return errors;
};

const collectFiscalItemIssues = (payload) => payload.items.reduce((issues, item, index) => {
  const fields = [];
  if (!item.ncm || item.ncm.length !== 8) fields.push('NCM');
  if (!item.cfop || item.cfop.length !== 4) fields.push('CFOP');
  if (!item.tax?.csosn && !item.tax?.cst) fields.push('CSOSN/CST');
  if (!fields.length) return issues;

  issues.push({
    index,
    productId: item.productId || '',
    code: item.code || '',
    description: item.description || `Item ${index + 1}`,
    ncm: item.ncm || '',
    cfop: item.cfop || '',
    fields,
  });
  return issues;
}, []);

const cleanText = (value) => String(value || '').trim();
const titularCnpjFromAttributes = (attributes = []) => {
  const icpCnpj = onlyDigits(attributes.find((attr) => attr.type === '2.16.76.1.3.3')?.value);
  if (icpCnpj.length === 14) return icpCnpj;

  const commonName = String(attributes.find((attr) => attr.name === 'CN')?.value || '');
  const match = commonName.match(/(?:^|:)(\d{14})(?:$|\D)/);
  return match?.[1] || '';
};

const getProjectId = () => {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GCP_PROJECT) return process.env.GCP_PROJECT;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || '';
  } catch (error) {
    return '';
  }
};

const safeSecretIdPart = (value) => cleanText(value)
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, '_')
  .replace(/_+/g, '_')
  .slice(0, 120);

const secretResourceName = (projectId, secretId) => `projects/${projectId}/secrets/${secretId}`;

const ensureSecret = async (projectId, secretId, labels = {}) => {
  const name = secretResourceName(projectId, secretId);
  try {
    await secretManager.getSecret({name});
    return name;
  } catch (error) {
    if (error?.code !== 5 && error?.code !== 'NOT_FOUND') throw error;
  }

  const [secret] = await secretManager.createSecret({
    parent: `projects/${projectId}`,
    secretId,
    secret: {
      replication: {automatic: {}},
      labels,
    },
  });
  return secret.name;
};

const addSecretVersion = async (projectId, secretId, value) => {
  const [version] = await secretManager.addSecretVersion({
    parent: secretResourceName(projectId, secretId),
    payload: {data: Buffer.from(String(value), 'utf8')},
  });
  return version.name;
};

const parsePfxCertificate = (certificateBase64, password) => {
  const pfxBuffer = Buffer.from(certificateBase64, 'base64');
  if (!pfxBuffer.length || pfxBuffer.length > MAX_CERTIFICATE_BYTES) {
    const error = new Error('Certificado A1 inválido ou maior que 5 MB.');
    error.code = 'invalid-argument';
    throw error;
  }

  try {
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    const certBags = p12.getBags({bagType: forge.pki.oids.certBag})[forge.pki.oids.certBag] || [];
    const cert = certBags.find((bag) => bag.cert)?.cert;
    if (!cert) throw new Error('Nenhum certificado encontrado no arquivo PFX.');

    const attributes = cert.subject.attributes.map((attr) => ({
      type: attr.type,
      name: attr.shortName || attr.name || attr.type,
      value: String(attr.value || ''),
    }));
    const subjectText = attributes.map((attr) => `${attr.name}=${attr.value}`).join(', ');
    const commonName = attributes.find((attr) => attr.name === 'CN')?.value || '';
    const cnpj = titularCnpjFromAttributes(attributes);

    return {
      cnpj,
      subject: subjectText,
      commonName,
      validFrom: cert.validity.notBefore.toISOString(),
      validUntil: cert.validity.notAfter.toISOString(),
    };
  } catch (error) {
    const wrapped = new Error('Não foi possível abrir o certificado A1. Confira o arquivo .pfx e a senha.');
    wrapped.code = 'invalid-argument';
    wrapped.details = error?.message || null;
    throw wrapped;
  }
};

const publicCertificateInfo = (certificate = {}) => ({
  status: certificate.status || 'missing',
  filename: certificate.filename || '',
  cnpj: certificate.cnpj || '',
  subject: certificate.subject || '',
  commonName: certificate.commonName || '',
  validFrom: certificate.validFrom || null,
  validUntil: certificate.validUntil || null,
  hasCsc: Boolean(certificate.nfceCscSecretVersion),
  hasCscId: Boolean(certificate.nfceCscIdSecretVersion),
  uploadedByUid: certificate.uploadedByUid || '',
  updatedAt: certificate.updatedAt || null,
});

const getServiceConfig = () => ({
  serviceUrl: cleanText(process.env.FISCAL_SERVICE_URL),
  sharedSecret: cleanText(process.env.FISCAL_SHARED_SECRET),
  source: cleanText(process.env.FISCAL_SERVICE_URL) ? 'FISCAL_SERVICE_URL' : '',
});

const fiscalServiceErrorCode = (status) => {
  const code = Number(status || 0);
  if ([400, 422].includes(code)) return 'invalid-argument';
  if ([401, 403].includes(code)) return 'permission-denied';
  if (code === 404) return 'not-found';
  if ([409, 412].includes(code)) return 'failed-precondition';
  return 'internal';
};

const fiscalServiceErrorMessage = (details) => (
  cleanText(details?.detail)
  || cleanText(details?.message)
  || cleanText(details?.error)
  || 'Serviço fiscal recusou a requisição.'
);

const buildFiscalServiceError = (details, status) => {
  const error = new Error(fiscalServiceErrorMessage(details));
  error.code = fiscalServiceErrorCode(status);
  error.details = details || null;
  error.fiscalServiceResponded = Number(status || 0) > 0;
  return error;
};

const parseFiscalServicePayload = (data) => {
  if (typeof data === 'string') {
    const text = data.trim();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (error) {
      return {
        error: 'Serviço fiscal retornou resposta não JSON.',
        detail: text.slice(0, 1000),
      };
    }
  }

  if (data && typeof data === 'object') return data;
  return {};
};

const callFiscalService = async (path, body, serviceConfigOverride = null) => {
  const {serviceUrl, sharedSecret} = serviceConfigOverride || getServiceConfig();
  if (!serviceUrl) {
    const error = new Error('A URL central do serviço fiscal ainda não foi configurada pelo administrador da plataforma.');
    error.code = 'failed-precondition';
    throw error;
  }

  const url = new URL(path, serviceUrl.endsWith('/') ? serviceUrl : `${serviceUrl}/`).toString();

  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(serviceUrl)) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sharedSecret ? {'X-Fiscal-Service-Token': sharedSecret} : {}),
      },
      body: JSON.stringify(body),
    });
    const parsed = parseFiscalServicePayload(await response.text().catch(() => ''));
    if (!response.ok) {
      throw buildFiscalServiceError(parsed, response.status);
    }
    if (parsed?.error) {
      throw buildFiscalServiceError(parsed, response.status);
    }
    return parsed;
  }

  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(serviceUrl);
  try {
    const response = await client.request({
      url,
      method: 'POST',
      data: body,
      headers: {
        'Content-Type': 'application/json',
        ...(sharedSecret ? {'X-Fiscal-Service-Token': sharedSecret} : {}),
      },
    });
    const parsed = parseFiscalServicePayload(response.data);
    if (parsed?.error) {
      throw buildFiscalServiceError(parsed, response.status);
    }
    return parsed;
  } catch (error) {
    if (error?.fiscalServiceResponded) throw error;
    throw buildFiscalServiceError(error?.response?.data || {error: error?.message}, error?.response?.status);
  }
};

const createFiscalFunctions = ({
  admin,
  db,
  onCall,
  HttpsError,
  logger,
  verifyManagementAccess,
  verifyStoreReadAccess,
  userHasAccessToStores,
  STORE_ALL_KEY,
}) => {
  const FieldValue = admin.firestore.FieldValue;
  const isPlatformFiscalAdmin = canEditPlatformFiscalService;

  const loadPlatformServiceConfig = async () => {
    const envConfig = getServiceConfig();
    const snap = await db.collection('integrations').doc('fiscal').get();
    const data = snap.exists ? snap.data() || {} : {};
    const storedServiceUrl = cleanText(data.serviceUrl || data.fiscalServiceUrl);
    const storedSharedSecret = cleanText(data.sharedSecret || data.fiscalSharedSecret);
    const serviceUrl = storedServiceUrl || envConfig.serviceUrl;
    const sharedSecret = storedSharedSecret || envConfig.sharedSecret;
    return {
      serviceUrl,
      sharedSecret,
      configured: Boolean(serviceUrl),
      source: storedServiceUrl ? 'integrations/fiscal' : envConfig.source,
    };
  };

  const normalizeHttpsError = (error) => {
    if (error instanceof HttpsError) return error;
    if (['invalid-argument', 'failed-precondition', 'permission-denied', 'not-found', 'already-exists', 'aborted'].includes(error?.code)) {
      return new HttpsError(error.code, error.message, error.details || null);
    }
    return new HttpsError('internal', error?.message || 'Falha fiscal inesperada.', error?.details || null);
  };

  const requireStoreAccess = async (uid, lojaId) => {
    if (!lojaId || lojaId === STORE_ALL_KEY) {
      throw new HttpsError('failed-precondition', 'Selecione uma loja específica para emitir nota fiscal.');
    }

    const requester = await verifyStoreReadAccess(uid);
    if (!canAdministerFiscal(requester)) {
      throw new HttpsError('permission-denied', 'Você não tem permissão para administrar o módulo Nota Fiscal.');
    }
    await requireFiscalCatalogPermission(uid);
    if (requester.role === 'dono' && requester.allStores) return requester;
    if (!userHasAccessToStores(requester.stores, [lojaId])) {
      throw new HttpsError('permission-denied', 'Você não tem acesso fiscal a esta loja.');
    }
    return requester;
  };

  const requireStoreReadAccess = async (uid, lojaId) => {
    if (!lojaId || lojaId === STORE_ALL_KEY) {
      throw new HttpsError('failed-precondition', 'Selecione uma loja específica para consultar dados fiscais.');
    }

    const requester = await verifyStoreReadAccess(uid);
    const profileSnap = await db.collection('users').doc(uid).get();
    const profile = profileSnap.data() || {};
    if (profile.permissions?.['nota-fiscal'] === false || profile.customPermissions?.['nota-fiscal'] === false) {
      throw new HttpsError('permission-denied', 'O módulo Nota Fiscal não está habilitado para este usuário.');
    }
    if (requester.role === 'contador' && !requester.permissions?.['nota-fiscal']) {
      throw new HttpsError('permission-denied', 'O perfil Contador não possui acesso ao módulo Nota Fiscal.');
    }
    if (requester.role === 'dono' && requester.allStores) return requester;
    if (!userHasAccessToStores(requester.stores, [lojaId])) {
      throw new HttpsError('permission-denied', 'Você não tem acesso fiscal a esta loja.');
    }
    return requester;
  };

  const requireCallableContext = async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
    }
    const lojaId = String(request.data?.lojaId || '').trim();
    const requester = await requireStoreAccess(uid, lojaId);
    return {uid, lojaId, requester};
  };

  const requireReadContext = async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Você precisa estar autenticado.');
    }
    const lojaId = String(request.data?.lojaId || '').trim();
    const requester = await requireStoreReadAccess(uid, lojaId);
    return {uid, lojaId, requester};
  };

  const auditFiscalAction = async ({uid, lojaId, requester, action, documentId = null, before = null, after = null, result = 'success', details = null}) => {
    const profile = requester?.profile || {};
    const payload = {
      uid,
      usuario: cleanText(profile.nome || profile.displayName || profile.email || uid),
      email: cleanText(profile.email),
      perfil: requester?.role || null,
      lojaId,
      modulo: 'nota-fiscal',
      action,
      documentId,
      before,
      after,
      result,
      details,
      createdAt: FieldValue.serverTimestamp(),
    };
    try {
      await db.collection('auditLogs').add(payload);
    } catch (error) {
      logger.error('fiscal audit log failed', {action, lojaId, uid, message: error?.message || String(error)});
    }
  };

  const numberingContextInTransaction = async (transaction, storeRef, model) => {
    const [issuer, settings] = await Promise.all([
      transaction.get(storeRef.collection('fiscalConfig').doc('issuer')),
      transaction.get(storeRef.collection('fiscalConfig').doc('settings')),
    ]);
    const context = sequenceContext(issuer.data() || {}, settings.data() || {}, model, process.env.FISCAL_ENVIRONMENT);
    if (!['production', 'homologation'].includes(context.environment) || context.issuerCnpj.length !== 14 ||
      !Number.isInteger(context.series) || context.series < 0 || context.series > 999) {
      throw new HttpsError('failed-precondition', 'Confira CNPJ, ambiente fiscal e série na configuração salva.');
    }
    return context;
  };

  const assertCounterIssuer = (snapshot, context) => {
    if (snapshot.get('issuerCnpj') && snapshot.get('issuerCnpj') !== context.issuerCnpj) {
      throw new HttpsError('failed-precondition', 'O contador pertence a outro emitente. Confira a loja e o CNPJ antes de ajustar a sequência.');
    }
  };

  const assertNumberAvailable = async (transaction, storeRef, context, number, manual = false) => {
    if (!isFiscalNumber(number)) throw new HttpsError('failed-precondition', 'Numeração fiscal inválida ou esgotada. Configure o próximo número antes de emitir.');
    const blockRef = storeRef.collection('fiscalNumberBlocks').doc(counterId(context.environment, context.model, context.series) + `_${number}`);
    const [invoices, block, operations] = await Promise.all([
      transaction.get(storeRef.collection('invoices').select('number', 'nNF', 'model', 'series', 'environment', 'status', 'key', 'history', 'xMotivo', 'issuanceRejection', 'serviceResult.duplicateIssueResult')),
      transaction.get(blockRef),
      transaction.get(storeRef.collection('fiscalInutilizations').select('model', 'series', 'environment', 'status', 'start', 'end')),
    ]);
    if (manual && invoices.docs.some((snap) => sameSequence(snap.data(), context) && ['validating', 'pending_return'].includes(snap.get('status')))) {
      throw new HttpsError('failed-precondition', 'Há emissão em andamento nesta sequência. Aguarde ou consulte o retorno antes de alterar a numeração.');
    }
    if (block.exists || operations.docs.some((snap) => rangeBlocksNumber(snap.data(), context, number)) ||
      invoices.docs.some((snap) => invoiceKnowsNumber(snap.data(), context, number))) {
      throw new HttpsError('failed-precondition', `Número ${number} já conhecido como usado, reservado ou inutilizado nesta sequência. Revise a numeração configurada.`);
    }
    return blockRef;
  };

  const fiscalConfigurationAuditView = (issuer = {}, settings = {}) => ({
    issuer: {
      cnpj: cleanText(issuer.cnpj),
      stateRegistration: cleanText(issuer.stateRegistration || issuer.ie),
      legalName: cleanText(issuer.legalName || issuer.razaoSocial),
      tradeName: cleanText(issuer.tradeName || issuer.nomeFantasia),
      taxRegime: Number(issuer.taxRegime || 1),
      address: issuer.address || null,
    },
    settings: {
      environment: cleanText(settings.environment),
      nfeSeries: Number(settings.nfeSeries ?? 1),
      nfceSeries: Number(settings.nfceSeries ?? 1),
      operationNature: cleanText(settings.operationNature),
      defaultPaymentMethodCode: cleanText(settings.defaultPaymentMethodCode),
      defaultPresence: Number(settings.defaultPresence || 2),
    },
  });

  const fiscalCatalogs = {
    NCM: {field: 'ncmOptions', pattern: /^(?:\d{8}|\d{4}\.\d{2}\.\d{2})$/, defaults: ['19059090', '17049090', '18069000'], format: '8 dígitos, com ou sem pontos'},
    CFOP: {field: 'cfopOptions', pattern: /^\d{4}$/, defaults: ['5101', '5102', '6101', '6107', '6102', '6108'], format: '4 dígitos'},
  };

  const requireFiscalCatalogPermission = async (uid) => {
    const profile = (await db.collection('users').doc(uid).get()).data() || {};
    if (profile.permissions?.['nota-fiscal'] === false || profile.customPermissions?.['nota-fiscal'] === false) {
      throw new HttpsError('permission-denied', 'O módulo Nota Fiscal não está habilitado para este usuário.');
    }
  };

  const saveFiscalCatalogOption = async (request, kind) => {
    const {uid, lojaId} = await requireCallableContext(request);
    await requireFiscalCatalogPermission(uid);
    const catalog = fiscalCatalogs[kind];
    const inputCode = trimText(request.data?.code);
    const code = onlyDigits(inputCode);
    const description = trimText(request.data?.description);
    if (!catalog.pattern.test(inputCode)) {
      throw new HttpsError('invalid-argument', `Informe o ${kind} com ${catalog.format}.`);
    }
    if (description.length < 3 || description.length > 120) {
      throw new HttpsError('invalid-argument', `Informe uma descrição de 3 a 120 caracteres para identificar o ${kind}.`);
    }
    if (catalog.defaults.includes(code)) {
      throw new HttpsError('already-exists', `Este ${kind} já está disponível na lista inicial.`);
    }
    const settingsRef = db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('settings');
    const option = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(settingsRef);
      const options = Array.isArray(snap.get(catalog.field)) ? snap.get(catalog.field) : [];
      if (options.some((item) => item?.code === code)) {
        throw new HttpsError('already-exists', `Este ${kind} já está cadastrado para esta loja.`);
      }
      if (options.length >= 500) {
        throw new HttpsError('resource-exhausted', `Limite de ${kind}s cadastrados nesta configuração fiscal atingido.`);
      }
      transaction.set(settingsRef, {
        [catalog.field]: [...options, {code, description, createdAt: admin.firestore.Timestamp.now(), createdByUid: uid}],
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: uid,
      }, {merge: true});
      return {code, description};
    });
    return {option};
  };

  const artifactPath = (lojaId, invoiceId, filename) => `fiscal/${lojaId}/invoices/${invoiceId}/${filename}`;

  const saveInvoiceArtifact = async ({lojaId, invoiceId, filename, contentType, content, encoding = 'utf8'}) => {
    if (!content) return null;
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), encoding);
    const path = artifactPath(lojaId, invoiceId, filename);
    await admin.storage().bucket().file(path).save(buffer, {
      metadata: {
        contentType,
        cacheControl: 'private, max-age=0, no-cache',
      },
      resumable: false,
    });
    return {path, contentType, size: buffer.length, updatedAt: admin.firestore.Timestamp.now()};
  };

  const storeInvoiceArtifacts = async ({lojaId, invoiceId, result}) => {
    const artifacts = {};
    const signedXml = await saveInvoiceArtifact({
      lojaId,
      invoiceId,
      filename: 'signed.xml',
      contentType: 'application/xml; charset=utf-8',
      content: result.signedXml,
    });
    if (signedXml) artifacts.signedXml = signedXml;

    const authorizedXml = await saveInvoiceArtifact({
      lojaId,
      invoiceId,
      filename: 'authorized.xml',
      contentType: 'application/xml; charset=utf-8',
      content: result.authorizedXml,
    });
    if (authorizedXml) artifacts.authorizedXml = authorizedXml;

    const danfePdf = await saveInvoiceArtifact({
      lojaId,
      invoiceId,
      filename: 'danfe.pdf',
      contentType: 'application/pdf',
      content: result.danfePdfBase64,
      encoding: 'base64',
    });
    if (danfePdf) artifacts.danfePdf = danfePdf;

    return artifacts;
  };

  const compactFiscalErrors = (errors) => (
    Array.isArray(errors)
      ? errors.map((error) => cleanText(error)).filter(Boolean).slice(0, 20)
      : null
  );

  const compactFiscalServiceResult = (result = {}, artifacts = {}) => ({
    status: result.status || null,
    key: result.key || null,
    protocol: result.protocol || null,
    receipt: result.receipt || null,
    cStat: result.cStat ?? null,
    xMotivo: cleanText(result.xMotivo).slice(0, 1000) || null,
    message: cleanText(result.message).slice(0, 1000) || null,
    error: cleanText(result.error).slice(0, 1000) || null,
    detail: cleanText(result.detail).slice(0, 1000) || null,
    errors: compactFiscalErrors(result.errors),
    hasSignedXml: Boolean(result.signedXml),
    hasAuthorizedXml: Boolean(result.authorizedXml),
    hasDanfePdf: Boolean(result.danfePdfBase64),
    signedXmlPath: artifacts.signedXml?.path || null,
    authorizedXmlPath: artifacts.authorizedXml?.path || null,
    danfePdfPath: artifacts.danfePdf?.path || null,
    duplicateIssueResult: result.duplicateIssueResult || null,
    consultationResult: result.consultationResult || null,
    duplicateConsultFailed: Boolean(result.duplicateConsultFailed),
    duplicateConsultSkipped: Boolean(result.duplicateConsultSkipped),
    duplicateConsultError: cleanText(result.duplicateConsultError).slice(0, 1000) || null,
    duplicateConsultMessage: cleanText(result.duplicateConsultMessage).slice(0, 1000) || null,
  });

  const fiscalResultReason = (result = {}, status = '') => (
    cleanText(result.xMotivo)
    || cleanText(result.message)
    || cleanText(result.error)
    || cleanText(result.detail)
    || (Array.isArray(result.errors) ? cleanText(result.errors.join(' ')) : '')
    || (status === INVOICE_STATUS.REJECTED ? 'Serviço fiscal retornou rejeição sem motivo detalhado. Tente emitir novamente; se repetir, consulte o suporte técnico.' : '')
  );

  const callableFiscalResult = ({result = {}, invoiceId, artifacts = {}, artifactError = ''}) => ({
    invoiceId,
    status: result.status || INVOICE_STATUS.REJECTED,
    key: result.key || null,
    protocol: result.protocol || null,
    receipt: result.receipt || null,
    cStat: result.cStat ?? null,
    xMotivo: fiscalResultReason(result, result.status || INVOICE_STATUS.REJECTED) || null,
    errors: compactFiscalErrors(result.errors),
    danfePdfReady: Boolean(artifacts.danfePdf),
    artifactError: artifactError || null,
  });

  const isDuplicateNfeResult = (result = {}) => {
    const cStat = Number(result.cStat ?? result.serviceResult?.cStat ?? 0);
    const reason = [
      result.xMotivo,
      result.message,
      result.error,
      result.detail,
      result.serviceResult?.xMotivo,
      result.serviceResult?.message,
      result.serviceResult?.error,
      result.serviceResult?.detail,
    ].map((value) => cleanText(value)).filter(Boolean).join(' ');
    return DUPLICATE_NFE_CSTATS.has(cStat) || /duplicidade\s+de\s+nf-?e/i.test(reason);
  };

  const isDuplicateInvoiceRecord = (invoice = {}) => isDuplicateNfeResult({
    cStat: invoice.cStat,
    xMotivo: invoice.xMotivo || invoice.error,
    message: invoice.message,
    detail: invoice.detail,
    serviceResult: invoice.serviceResult,
  });

  const blockingInvoiceMessage = (invoiceId, invoice = {}) => {
    const number = invoice.number ? ` ${String(invoice.number).padStart(8, '0')}` : '';
    const series = invoice.series ? ` série ${String(invoice.series).padStart(3, '0')}` : '';
    const status = invoice.status || 'em processamento';
    if (isDuplicateInvoiceRecord(invoice)) {
      return `Este pedido já possui uma nota fiscal${number}${series} com rejeição por duplicidade. Consulte/atualize essa nota antes de tentar emitir outra.`;
    }
    if (status === INVOICE_STATUS.AUTHORIZED) {
      return `Este pedido já possui uma nota fiscal autorizada${number}${series}.`;
    }
    if (status === INVOICE_STATUS.PENDING_RETURN) {
      return `Este pedido já possui uma emissão pendente${number}${series}. Consulte o retorno da SEFAZ antes de reemitir.`;
    }
    if (status === INVOICE_STATUS.VALIDATING) {
      return `Este pedido já possui uma emissão em andamento${number}${series}. Aguarde a finalização antes de tentar novamente.`;
    }
    if (status === INVOICE_STATUS.DENIED) {
      return `Este pedido já possui uma nota denegada${number}${series}; não é permitido emitir outra para a mesma operação.`;
    }
    return `Este pedido já possui uma nota fiscal vinculada (${invoiceId}).`;
  };

  const loadInvoiceArtifact = async (artifact) => {
    if (!artifact?.path) {
      throw new HttpsError('failed-precondition', 'Arquivo fiscal ainda não está disponível para esta nota.');
    }
    const [buffer] = await admin.storage().bucket().file(artifact.path).download();
    return buffer;
  };

  const loadIssuer = async (lojaId) => {
    const snap = await db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('issuer').get();
    if (!snap.exists) {
      throw new HttpsError('failed-precondition', 'Cadastre os dados fiscais do emitente antes de emitir.');
    }
    const issuer = snap.data() || {};
    return {
      cnpj: onlyDigits(issuer.cnpj),
      legalName: issuer.legalName || issuer.razaoSocial || issuer.nome || 'ANA GUIMARAES DOCERIA LTDA',
      tradeName: issuer.tradeName || issuer.nomeFantasia || 'ANA GUIMARAES DOCERIA',
      stateRegistration: onlyDigits(issuer.stateRegistration || issuer.inscricaoEstadual),
      taxRegime: Number(issuer.taxRegime || issuer.crt || 1),
      address: normalizeAddress(issuer.address || issuer.endereco || issuer),
    };
  };

  const loadSettings = async (lojaId) => {
    const snap = await db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('settings').get();
    const settings = snap.exists ? snap.data() || {} : {};
    return {
      environment: process.env.FISCAL_ENVIRONMENT || settings.environment || 'homologation',
      nfeSeries: Number(settings.nfeSeries ?? 1),
      nfceSeries: Number(settings.nfceSeries ?? 1),
      operationNature: settings.operationNature || 'Venda de producao do estabelecimento',
      defaultPresence: Number(settings.defaultPresence || 2),
      defaultPaymentMethodCode: settings.defaultPaymentMethodCode || '99',
      processVersion: settings.processVersion || 'ana-doceria-1.0',
    };
  };

  const loadCertificate = async (lojaId) => {
    const snap = await db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('certificate').get();
    const certificate = snap.exists ? snap.data() || {} : {};
    const ready = certificate.status === 'active'
      && Boolean(certificate.certPfxSecretVersion)
      && Boolean(certificate.certPasswordSecretVersion);

    return {
      ...certificate,
      ready,
      fiscalSecrets: ready ? {
        certPfxSecretVersion: certificate.certPfxSecretVersion,
        certPasswordSecretVersion: certificate.certPasswordSecretVersion,
        nfceCscSecretVersion: certificate.nfceCscSecretVersion || null,
        nfceCscIdSecretVersion: certificate.nfceCscIdSecretVersion || null,
      } : null,
    };
  };

  const loadCustomer = async (order) => {
    let clientData = {};
    if (order.clienteId) {
      const clientSnap = await db.collection('clientes').doc(order.clienteId).get();
      clientData = clientSnap.exists ? clientSnap.data() || {} : {};
    }

    const document = onlyDigits(
      getNested(order, ['clienteDocumento', 'customer.document', 'fiscal.customerDocument'])
      || getNested(clientData, ['documento', 'cpfCnpj', 'cpf_cnpj', 'cnpjCpf', 'cnpj_cpf', 'cpf', 'cnpj'])
    );
    const firstClientAddress = Array.isArray(clientData.enderecos) ? clientData.enderecos[0] : null;
    const selectedAddress = order.clienteEnderecoFiscal
      || order.fiscal?.customerAddress
      || order.customer?.address
      || order.enderecoEntrega
      || order.clienteEndereco
      || clientData.address
      || firstClientAddress
      || clientData.endereco
      || {};
    const addressSources = [
      order.clienteEnderecoFiscal,
      order.fiscal?.customerAddress,
      order.customer?.address,
      order.enderecoEntrega,
      order.clienteEndereco,
      clientData.address,
      firstClientAddress,
      clientData.endereco,
      clientData,
      order,
    ].filter(Boolean);
    const getAddressValue = (paths) => {
      for (const source of addressSources) {
        if (typeof source === 'string') continue;
        const value = getNested(source, paths);
        if (value !== undefined && value !== null && value !== '') return value;
      }
      return undefined;
    };
    const customerZip = onlyDigits(
      order.clienteCep
      || getNested(order, ['clienteCEP', 'customer.address.zip', 'customer.address.cep', 'fiscal.customerZip', 'enderecoEntrega.cep', 'clienteEndereco.cep'])
      || clientData.cep
      || getNested(clientData, ['address.zip', 'address.cep', 'endereco.cep', 'enderecos.0.cep'])
    );
    const customerAddress = normalizeAddress(selectedAddress);
    customerAddress.street = customerAddress.street || getAddressValue(['street', 'logradouro', 'rua', 'endereco', 'enderecoCompleto']) || '';
    customerAddress.number = customerAddress.number || getAddressValue(['number', 'numero']) || 'S/N';
    customerAddress.complement = customerAddress.complement || getAddressValue(['complement', 'complemento']) || '';
    customerAddress.district = customerAddress.district || getAddressValue(['district', 'bairro', 'bairroFiscal', 'neighborhood']) || '';
    customerAddress.city = customerAddress.city || getAddressValue(['city', 'cidade', 'municipio']) || 'Goiania';
    customerAddress.cityCode = onlyDigits(customerAddress.cityCode || getAddressValue(['cityCode', 'codigoMunicipio', 'codigoIbge', 'ibge']) || '5208707');
    customerAddress.state = String(customerAddress.state || getAddressValue(['state', 'uf']) || 'GO').toUpperCase();
    if (customerZip && !customerAddress.zip) {
      customerAddress.zip = customerZip;
    }

    return {
      name: order.clienteNome || clientData.nome || 'Consumidor',
      document,
      documentType: document ? inferDocumentType(document) : undefined,
      stateRegistration: onlyDigits(order.clienteInscricaoEstadual || clientData.inscricaoEstadual || ''),
      email: order.email || clientData.email || '',
      phone: onlyDigits(order.telefone || clientData.telefone || ''),
      isFinalConsumer: order.consumidorFinal !== false,
      receivesIcmsCredit: Boolean(order.clienteRecebeCreditoIcms || clientData.receivesIcmsCredit),
      requiresNfe: Boolean(order.requerNfe || clientData.requiresNfe),
      address: customerAddress,
    };
  };

  const loadFiscalProduct = async (lojaId, item) => {
    const productId = cleanText(item.produtoId || item.productId || item.id);
    const fiscalLookupIds = [...new Set(
      [productId, item.codigo, item.sku]
        .map((value) => cleanText(value))
        .filter((value) => value && !value.includes('/'))
    )];
    let productData = {};
    let fiscalData = {};

    if (productId && !productId.includes('/')) {
      const productSnap = await db.collection('lojas').doc(lojaId).collection('produtos').doc(productId).get();
      productData = productSnap.exists ? productSnap.data() || {} : {};
    }
    if (fiscalLookupIds.length) {
      const fiscalSnaps = await Promise.all([
        ...fiscalLookupIds.map((id) => db.collection('lojas').doc(lojaId).collection('fiscalProducts').doc(id).get()),
      ]);
      const fiscalSnap = fiscalSnaps.find((snapshot) => snapshot.exists);
      fiscalData = fiscalSnap ? fiscalSnap.data() || {} : {};
    }

    return {
      ...productData.fiscal,
      ...fiscalData,
      ...item.fiscal,
      code: fiscalData.code || item.codigo || item.sku || productId || item.id,
      description: item.nome || item.description || productData.nome || fiscalData.description || 'Produto',
    };
  };

  const buildPreparedPayload = async ({lojaId, orderId, modelOverride, number = 1, invoiceId, uid, additionalInfo, operationCfop}) => {
    const orderRef = db.collection('lojas').doc(lojaId).collection('pedidos').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Pedido não encontrado.');
    }

    const order = {id: orderSnap.id, ...orderSnap.data()};
    if (order.paymentId && order.payment_status === 'PAID') {
      const payment = (await db.collection('checkoutPayments').doc(order.paymentId).get()).data();
      if (!payment || payment.orderPath !== orderRef.path || payment.storeId !== lojaId || payment.payment_status !== 'PAID' || payment.requiresReview) {
        throw new HttpsError('failed-precondition','Concilie o pagamento online antes de emitir a nota.');
      }
      if (!Number.isSafeInteger(payment.amount) || Math.round(Number(order.total)*100) !== payment.amount) {
        throw new HttpsError('failed-precondition','Pedido alterado após pagamento confirmado. Concilie a diferença de valor antes de emitir a nota.');
      }
      // Legacy paid records did not store captureMethod; their protected order label is retained.
      const capture = payment.captureMethod || ({'Pix online':'pix','Cartão online':'credit_card'}[order.formaPagamento]);
      order.paymentMethod = {pix:'PIX',credit_card:'CREDIT_CARD'}[capture] || null;
      order.paymentMethodSource = 'provider/infinitepay';
    }
    if (!['Finalizado', 'Aprovado', 'ready_for_invoice', 'approved'].includes(order.status) && !order.approvedForInvoice) {
      throw new HttpsError('failed-precondition', 'A nota só pode ser emitida para pedido finalizado ou aprovado.');
    }

    const [issuer, settings, customer, certificate] = await Promise.all([
      loadIssuer(lojaId),
      loadSettings(lojaId),
      loadCustomer(order),
      loadCertificate(lojaId),
    ]);

    const model = inferInvoiceModel(order, customer, issuer, modelOverride);
    const series = model === 55 ? settings.nfeSeries : settings.nfceSeries;
    const rawItems = Array.isArray(order.itens) ? order.itens : [];
    const fiscalItems = await Promise.all(rawItems.map((item) => loadFiscalProduct(lojaId, item)));

    const productTotal = money(rawItems.reduce((sum, item) => sum + Number(item.preco || item.unitPrice || 0) * Number(item.quantity || item.quantidade || 1), 0));
    const orderDiscount = money(order.desconto || order.cupom?.valorDesconto || 0);
    const itemsForDiscount = rawItems.map((item) => ({
      quantity: Number(item.quantity || item.quantidade || 1),
      unitPrice: Number(item.preco || item.unitPrice || 0),
      discount: Number(item.desconto || 0),
    }));
    const discounts = allocateDiscounts(itemsForDiscount, orderDiscount);
    const freight = money(order.valorFrete || order.frete || 0);
    const invoiceTotal = money(productTotal - orderDiscount + freight);
    const paymentResolution = resolveFiscalPayment(order, settings, invoiceTotal);
    const selectedOperationCfop = onlyDigits(operationCfop);
    if (selectedOperationCfop.length !== 4) {
      throw new HttpsError('invalid-argument', 'Selecione um CFOP válido para a operação fiscal.');
    }

    const invoiceAdditionalInfo = cleanText(
      additionalInfo === undefined ? (order.observacao || order.additionalInfo || '') : additionalInfo
    );
    if (invoiceAdditionalInfo.length > MAX_ADDITIONAL_INFO_LENGTH) {
      throw new HttpsError('invalid-argument', 'A observação da nota fiscal deve ter no máximo 5000 caracteres.');
    }

    const payload = {
      invoiceId,
      orderId,
      lojaId,
      environment: environmentCode(settings.environment),
      invoice: {
        model,
        series,
        number,
        operationNature: settings.operationNature,
        issueDate: nowIso(),
        presence: settings.defaultPresence,
        finalConsumer: customer.isFinalConsumer,
        destinationType: issuer.address.state === customer.address.state ? 1 : 2,
        operationCfop: selectedOperationCfop,
        processVersion: settings.processVersion,
        payment: {
          methodCode: paymentResolution.methodCode,
          amount: invoiceTotal,
          dueDate: order.payment?.dueDate || null,
          source: paymentResolution.source,
          fallbackUsed: paymentResolution.fallbackUsed,
          originalMethod: paymentResolution.method,
          selectionRule: paymentResolution.selectionRule,
        },
      },
      issuer,
      customer,
      items: rawItems.map((item, index) => {
        const fiscal = fiscalItems[index] || {};
        const quantity = Number(item.quantity || item.quantidade || 1);
        const unitPrice = money(item.preco || item.unitPrice || 0);
        const cfop = selectedOperationCfop || fiscal.cfop || (model === 55 ? fiscal.cfopNfe : fiscal.cfopNfce);

        return {
          productId: item.produtoId || item.productId || item.id || null,
          code: String(fiscal.code || item.codigo || item.id || index + 1),
          description: fiscal.description || item.nome || item.description || `Item ${index + 1}`,
          ncm: onlyDigits(fiscal.ncm),
          cfop: String(cfop || ''),
          unit: fiscal.unit || fiscal.unidade || '',
          quantity,
          unitPrice,
          total: money(quantity * unitPrice),
          discount: discounts[index] || 0,
          tax: {
            origin: (fiscal.origin ?? fiscal.origem) === undefined || (fiscal.origin ?? fiscal.origem) === null ? null : Number(fiscal.origin ?? fiscal.origem),
            csosn: fiscal.csosn || '102',
            cst: fiscal.cst || '',
            pisCst: fiscal.pisCst || '',
            cofinsCst: fiscal.cofinsCst || '',
            ipiCst: fiscal.ipiCst || '',
            cBenef: fiscal.cBenef || '',
          },
        };
      }),
      totals: {
        products: productTotal,
        discount: orderDiscount,
        freight,
        insurance: 0,
        other: 0,
        invoice: invoiceTotal,
      },
      additionalInfo: invoiceAdditionalInfo,
      requestedByUid: uid,
      fiscalSecrets: certificate.fiscalSecrets,
    };

    return {
      payload,
      order,
      settings,
      certificate,
      model,
      series,
      paymentResolution,
      errors: validatePreparedPayload(payload),
    };
  };

  const buildManualCustomer = (customer = {}) => {
    const document = onlyDigits(customer.document || customer.cpfCnpj || customer.cpf || customer.cnpj);
    const address = normalizeAddress(customer.address || customer.endereco || customer);
    return {
      id: cleanText(customer.id),
      name: cleanText(customer.name || customer.nome || customer.razaoSocial),
      document,
      documentType: document ? inferDocumentType(document) : '',
      stateRegistration: onlyDigits(customer.stateRegistration || customer.inscricaoEstadual || ''),
      email: cleanText(customer.email),
      phone: onlyDigits(customer.phone || customer.telefone || ''),
      isFinalConsumer: customer.isFinalConsumer !== false,
      receivesIcmsCredit: Boolean(customer.receivesIcmsCredit || customer.recebeCreditoIcms),
      requiresNfe: Boolean(customer.requiresNfe || customer.requerNfe),
      address: {
        ...address,
        number: cleanText(customer.address?.number || customer.address?.numero),
        city: cleanText(customer.address?.city || customer.address?.cidade),
        cityCode: onlyDigits(customer.address?.cityCode || customer.address?.codigoIbge),
        state: cleanText(customer.address?.state || customer.address?.uf).toUpperCase(),
      },
    };
  };

  const buildManualPreparedPayload = async ({lojaId, manualInvoice, modelOverride, number = 1, invoiceId, uid, additionalInfo, operationCfop, snapshotOnly = false}) => {
    const [issuer, settings, certificate] = await Promise.all([
      loadIssuer(lojaId),
      loadSettings(lojaId),
      loadCertificate(lojaId),
    ]);

    const customer = buildManualCustomer(manualInvoice.customer || {});
    const model = inferInvoiceModel({fiscal: {requiresNfe: customer.requiresNfe}}, customer, issuer, modelOverride);
    const series = model === 55 ? settings.nfeSeries : settings.nfceSeries;
    const selectedOperationCfop = onlyDigits(operationCfop || manualInvoice.operationCfop);
    const manualInputErrors = [];
    if (selectedOperationCfop.length !== 4) manualInputErrors.push('Documento: selecione CFOP válido com 4 dígitos.');
    for (const field of ['freight', 'insurance', 'other']) {
      const value = manualInvoice[field] ?? 0;
      if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value)) || Number(value) < 0) {
        manualInputErrors.push(`Totais: ${field === 'freight' ? 'frete' : field === 'insurance' ? 'seguro' : 'outras despesas'} inválido.`);
      }
    }
    const freightMode = String(manualInvoice.freightMode ?? '9');
    if (!['0', '1', '2', '3', '4', '9'].includes(freightMode)) manualInputErrors.push('Transporte: modalidade de frete inválida (0, 1, 2, 3, 4 ou 9).');
    if (model === 65 && freightMode !== '9') manualInputErrors.push('Transporte: o fluxo NFC-e atual suporta somente modalidade 9.');

    const rawItems = Array.isArray(manualInvoice.items) ? manualInvoice.items : [];
    if (!rawItems.length) manualInputErrors.push('Produtos: adicione ao menos um item.');

    const normalizedItems = rawItems.map((item, index) => {
      const quantity = Number(item.quantity ?? item.quantidade ?? 0);
      const unitPrice = Number(item.unitPrice ?? item.preco ?? item.valorUnitario ?? 0);
      const discount = Number(item.discount ?? item.desconto ?? 0);
      const description = cleanText(item.description || item.nome || item.produto || '');
      const label = description || `Item ${index + 1}`;
      if (!description) manualInputErrors.push(`${label}: descrição não informada.`);
      if (!Number.isFinite(quantity) || quantity <= 0) manualInputErrors.push(`${label}: quantidade deve ser maior que zero.`);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) manualInputErrors.push(`${label}: valor unitário inválido.`);
      if (!Number.isFinite(discount) || discount < 0 || discount > quantity * unitPrice) manualInputErrors.push(`${label}: desconto inválido.`);
      // These editable historical fields are preserved but the current XML builder
      // has no tags for them. Never silently transmit a clone that drops them.
      if (snapshotOnly) {
        for (const field of ['cest', 'cBenef', 'ipiCst']) {
          if (item[field]) manualInputErrors.push(`${label}: ${field} informado; o serviço fiscal atual não transmite este campo. Revise a integração com o responsável fiscal.`);
        }
      }
      return {
        ...item,
        id: cleanText(item.id || item.productId || item.produtoId || item.code || `manual-${index + 1}`),
        produtoId: cleanText(item.productId || item.produtoId || ''),
        productId: cleanText(item.productId || item.produtoId || ''),
        codigo: cleanText(item.code || item.codigo || item.productId || item.produtoId || `MANUAL-${index + 1}`),
        code: cleanText(item.code || item.codigo || item.productId || item.produtoId || `MANUAL-${index + 1}`),
        nome: description,
        description,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        quantidade: Number.isFinite(quantity) ? quantity : 0,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        preco: Number.isFinite(unitPrice) ? unitPrice : 0,
        discount: Number.isFinite(discount) ? discount : 0,
        desconto: Number.isFinite(discount) ? discount : 0,
        fiscal: {
          ...(item.fiscal || {}),
          ncm: onlyDigits(item.ncm || item.fiscal?.ncm),
          cfop: onlyDigits(item.cfop || selectedOperationCfop),
          cfopNfe: onlyDigits(item.cfop || selectedOperationCfop),
          cfopNfce: onlyDigits(item.cfop || selectedOperationCfop),
          unit: item.unit || item.unidade || item.fiscal?.unit || item.fiscal?.unidade || '',
          origin: item.origin === '' || item.origin === null ? null : (item.origin === undefined && item.origem === undefined && item.fiscal?.origin === undefined && item.fiscal?.origem === undefined ? null : Number(item.origin ?? item.origem ?? item.fiscal?.origin ?? item.fiscal?.origem)),
          csosn: cleanText(item.csosn || item.fiscal?.csosn),
          cst: cleanText(item.cst || item.fiscal?.cst || ''),
          pisCst: cleanText(item.pisCst || item.fiscal?.pisCst),
          cofinsCst: cleanText(item.cofinsCst || item.fiscal?.cofinsCst),
          cBenef: cleanText(item.cBenef || item.fiscal?.cBenef || ''),
          cest: cleanText(item.cest || item.fiscal?.cest || ''),
          ipiCst: cleanText(item.ipiCst || item.fiscal?.ipiCst || ''),
        },
        manualSource: item.source === 'catalog' ? 'catalog' : 'manual',
      };
    });

    const fiscalItems = snapshotOnly ? normalizedItems.map((item) => ({...item.fiscal, code: item.code, description: item.description}))
      : await Promise.all(normalizedItems.map((item) => loadFiscalProduct(lojaId, item)));
    const totals = draftTotals({...manualInvoice, items: normalizedItems});
    const invoiceTotal = totals.invoice;
    const paymentMethodCode = normalizePaymentCode(manualInvoice.paymentMethodCode || settings.defaultPaymentMethodCode || '99') || '99';
    const paymentResolution = {
      methodCode: paymentMethodCode,
      method: cleanText(manualInvoice.paymentMethod || ''),
      source: manualInvoice.paymentMethodCode ? 'manualInvoice.paymentMethodCode' : 'fiscalConfig.settings.defaultPaymentMethodCode',
      fallbackUsed: !manualInvoice.paymentMethodCode,
      amount: invoiceTotal,
      multiplePaymentsDetected: false,
      selectionRule: manualInvoice.paymentMethodCode ? 'manual_invoice_payment_code' : 'fallback_default_payment_method',
      candidates: [],
    };

    const invoiceAdditionalInfo = cleanText(
      additionalInfo === undefined ? (manualInvoice.additionalInfo || manualInvoice.observacao || '') : additionalInfo
    );
    if (invoiceAdditionalInfo.length > MAX_ADDITIONAL_INFO_LENGTH) {
      throw new HttpsError('invalid-argument', 'A observação da nota fiscal deve ter no máximo 5000 caracteres.');
    }

    const payload = {
      invoiceId,
      orderId: null,
      lojaId,
      origin: 'manual',
      manualInvoice: true,
      transport: {freightMode},
      environment: environmentCode(settings.environment),
      invoice: {
        model,
        series,
        number,
        operationNature: cleanText(manualInvoice.operationNature || settings.operationNature),
        issueDate: nowIso(),
        presence: manualInvoice.presence ?? settings.defaultPresence,
        finalConsumer: customer.isFinalConsumer,
        destinationType: issuer.address.state === customer.address.state ? 1 : 2,
        operationCfop: selectedOperationCfop,
        processVersion: settings.processVersion,
        payment: {
          methodCode: paymentResolution.methodCode,
          amount: invoiceTotal,
          dueDate: manualInvoice.paymentDueDate || null,
          source: paymentResolution.source,
          fallbackUsed: paymentResolution.fallbackUsed,
          originalMethod: paymentResolution.method,
          selectionRule: paymentResolution.selectionRule,
        },
      },
      issuer,
      customer,
      items: normalizedItems.map((item, index) => {
        const fiscal = fiscalItems[index] || {};
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        const discount = money(item.discount || 0);
        return {
          productId: item.productId || null,
          source: item.manualSource,
          code: String(fiscal.code || item.code || index + 1),
          description: fiscal.description || item.description || `Item ${index + 1}`,
          ncm: onlyDigits(fiscal.ncm),
          cfop: onlyDigits(item.cfop || selectedOperationCfop),
          unit: fiscal.unit || fiscal.unidade || '',
          quantity,
          unitPrice,
          total: money(quantity * unitPrice),
          discount,
          tax: {
            origin: (fiscal.origin ?? fiscal.origem) === undefined || (fiscal.origin ?? fiscal.origem) === null ? null : Number(fiscal.origin ?? fiscal.origem),
            csosn: fiscal.csosn || '',
            cst: fiscal.cst || '',
            pisCst: fiscal.pisCst || '',
            cofinsCst: fiscal.cofinsCst || '',
            ipiCst: fiscal.ipiCst || '',
            cBenef: fiscal.cBenef || '',
            cest: fiscal.cest || '',
          },
        };
      }),
      totals,
      additionalInfo: invoiceAdditionalInfo,
      requestedByUid: uid,
      fiscalSecrets: certificate.fiscalSecrets,
    };

    try {
      payload.items = allocateFiscalCharges(payload.items, totals);
    } catch (error) {
      manualInputErrors.push(error.message);
    }
    return {
      payload,
      settings,
      certificate,
      model,
      series,
      paymentResolution,
      manualInvoice,
      errors: [...manualInputErrors, ...validatePreparedPayload(payload)],
    };
  };

  const findBlockingInvoiceForOrder = async ({lojaId, orderId, environment, model, series}) => {
    const snap = await db.collection('lojas').doc(lojaId).collection('invoices')
      .where('orderId', '==', orderId)
      .limit(30)
      .get();
    const candidates = [];
    snap.forEach((doc) => {
      const invoice = doc.data() || {};
      if (invoice.environment !== environment) return;
      if (Number(invoice.model || 0) !== Number(model || 0)) return;
      if (Number(invoice.series || 0) !== Number(series || 0)) return;
      if (invoice.status === INVOICE_STATUS.CANCELLED) return;
      if (BLOCKING_ORDER_INVOICE_STATUSES.has(invoice.status) || isDuplicateInvoiceRecord(invoice)) {
        candidates.push({id: doc.id, invoice});
      }
    });
    candidates.sort((a, b) => {
      const aTime = a.invoice.updatedAt?.toMillis?.() || a.invoice.createdAt?.toMillis?.() || 0;
      const bTime = b.invoice.updatedAt?.toMillis?.() || b.invoice.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    return candidates[0] || null;
  };

  const assertCanIssueOrderInvoice = async ({lojaId, orderId, environment, model, series}) => {
    const blocking = await findBlockingInvoiceForOrder({lojaId, orderId, environment, model, series});
    if (!blocking) return;
    throw new HttpsError('already-exists', blockingInvoiceMessage(blocking.id, blocking.invoice), {
      invoiceId: blocking.id,
      status: blocking.invoice.status || null,
      number: blocking.invoice.number || null,
      series: blocking.invoice.series || null,
      duplicate: isDuplicateInvoiceRecord(blocking.invoice),
    });
  };

  const reserveInvoice = async ({lojaId, orderId, environment, model, series, issuerCnpj, uid, justification, additionalInfo, operationCfop, paymentResolution}) => {
    const storeRef = db.collection('lojas').doc(lojaId);
    const orderRef = storeRef.collection('pedidos').doc(orderId);
    const counterRef = storeRef.collection('fiscalCounters').doc(counterId(environment, model, series));
    const invoiceRef = storeRef.collection('invoices').doc();

    return db.runTransaction(async (transaction) => {
      const [orderSnap, counterSnap] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(counterRef),
      ]);
      const order = orderSnap.data() || {};
      if (order.paymentId && order.payment_status === 'PAID' && Math.round(Number(order.total)*100) !== Math.round(Number(paymentResolution?.amount)*100)) throw new HttpsError('aborted','Total do pedido alterado durante a validação. Valide novamente.');
      const latestPayment = explicitFiscalPayment(order);
      if (latestPayment && latestPayment.methodCode !== paymentResolution?.methodCode) throw new HttpsError('aborted','Pagamento alterado durante a validação. Valide novamente.');
      const previousId = order.fiscal?.lastInvoiceId;
      if (previousId) {
        const previous = await transaction.get(storeRef.collection('invoices').doc(previousId));
        const invoice = previous.data() || {};
        if (previous.exists && invoice.status !== INVOICE_STATUS.CANCELLED && sameSequence(invoice, {model, series, environment})) {
          return {invoiceId: previousId, number: invoice.number, repeated: true,
            response: callableFiscalResult({result: invoice, invoiceId: previousId, artifacts: invoice.artifacts || {}})};
        }
      }
      if (order.fiscal?.authorizedInvoiceId) {
        throw new HttpsError('already-exists', 'Pedido já tem nota autorizada.');
      }
      if (order.fiscal?.invoiceInProgressId) {
        throw new HttpsError('aborted', 'Pedido já tem emissão em andamento.');
      }
      if (order.fiscal?.lastInvoiceStatus === INVOICE_STATUS.AUTHORIZED) {
        throw new HttpsError('already-exists', 'Pedido já tem nota autorizada.');
      }
      if (order.fiscal?.lastInvoiceStatus === INVOICE_STATUS.PENDING_RETURN) {
        throw new HttpsError('already-exists', 'Pedido já tem emissão pendente. Consulte o retorno da SEFAZ antes de reemitir.');
      }
      if (order.fiscal?.lastInvoiceDuplicate) {
        throw new HttpsError('already-exists', 'Pedido já tem nota rejeitada por duplicidade. Consulte/atualize essa nota antes de tentar emitir outra.');
      }

      const context = await numberingContextInTransaction(transaction, storeRef, model);
      if (context.environment !== environment || context.series !== series || context.issuerCnpj !== issuerCnpj) throw new HttpsError('aborted', 'Configuração fiscal alterada. Confira novamente antes de emitir.');
      assertCounterIssuer(counterSnap, context);
      const nextNumber = nextNumberFrom(counterSnap);
      const blockRef = await assertNumberAvailable(transaction, storeRef, context, nextNumber);
      transaction.set(blockRef, {environment, model, series, number: nextNumber, issuerCnpj: context.issuerCnpj,
        status: 'reserved', invoiceId: invoiceRef.id, at: FieldValue.serverTimestamp(), by: uid});
      transaction.set(counterRef, {
        issuerCnpj: context.issuerCnpj,
        environment,
        model,
        series,
        nextNumber: nextNumber + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.set(invoiceRef, {
        orderId,
        lojaId,
        model,
        series,
        number: nextNumber,
        environment,
        status: INVOICE_STATUS.VALIDATING,
        justification: justification || null,
        additionalInfo: additionalInfo || '',
        operationCfop: operationCfop || null,
        payment: paymentResolution ? {
          methodCode: paymentResolution.methodCode,
          amount: paymentResolution.amount,
          method: paymentResolution.method || null,
          source: paymentResolution.source,
          fallbackUsed: paymentResolution.fallbackUsed,
          multiplePaymentsDetected: paymentResolution.multiplePaymentsDetected,
          selectionRule: paymentResolution.selectionRule,
          candidates: paymentResolution.candidates || [],
        } : null,
        paymentMethodCode: paymentResolution?.methodCode || null,
        paymentMethodSource: paymentResolution?.source || null,
        paymentFallbackUsed: Boolean(paymentResolution?.fallbackUsed),
        requestedByUid: uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        history: [{
          status: INVOICE_STATUS.VALIDATING,
          at: admin.firestore.Timestamp.now(),
          by: uid,
          message: 'Numeração reservada e emissão iniciada.',
        }],
      });
      transaction.update(orderRef, {
        'fiscal.invoiceInProgressId': invoiceRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {invoiceId: invoiceRef.id, number: nextNumber};
    });
  };


  const consultDuplicateIfNeeded = async ({payload, result, serviceConfig}) => {
    if (!isDuplicateNfeResult(result)) {
      return result;
    }
    if (!result.signedXml && !result.key) {
      return {
        ...result,
        duplicateConsultSkipped: true,
        duplicateConsultMessage: 'Duplicidade detectada sem XML assinado ou chave de acesso para consulta.',
      };
    }

    try {
      const consultResult = await callFiscalService('/consult', {
        ...payload,
        key: result.key || null,
        signedXml: result.signedXml || null,
      }, serviceConfig);
      const confirmed = [INVOICE_STATUS.AUTHORIZED, INVOICE_STATUS.CANCELLED].includes(consultResult.status);
      return {
        ...(confirmed ? consultResult : result),
        ...(!confirmed ? {consultationResult: {
          status: consultResult.status || null, cStat: consultResult.cStat ?? null,
          xMotivo: fiscalResultReason(consultResult, consultResult.status),
        }} : {}),
        signedXml: consultResult.signedXml || result.signedXml || null,
        duplicateIssueResult: {
          status: result.status || null,
          cStat: result.cStat ?? null,
          xMotivo: fiscalResultReason(result, result.status || INVOICE_STATUS.REJECTED) || null,
        },
      };
    } catch (error) {
      logger.warn('fiscal duplicate consult failed', {
        message: error?.message || String(error),
        cStat: result.cStat ?? null,
      });
      return {
        ...result,
        duplicateConsultFailed: true,
        duplicateConsultError: error?.message || String(error),
      };
    }
  };

  const updateInvoiceAfterIssue = async ({lojaId, invoiceId, orderId, uid, result, historyMessage = null}) => {
    const invoiceRef = db.collection('lojas').doc(lojaId).collection('invoices').doc(invoiceId);
    const orderRef = orderId ? db.collection('lojas').doc(lojaId).collection('pedidos').doc(orderId) : null;
    const status = result.status || INVOICE_STATUS.REJECTED;
    const resultReason = fiscalResultReason(result, status);
    const consultation = result.consultationResult ? {...result.consultationResult, at: admin.firestore.Timestamp.now(), by: uid} : null;
    const duplicateRejected = status === INVOICE_STATUS.REJECTED && isDuplicateNfeResult({
      ...result,
      xMotivo: resultReason,
    });
    let artifacts = {};
    let artifactError = '';
    try {
      artifacts = await storeInvoiceArtifacts({lojaId, invoiceId, result});
    } catch (error) {
      artifactError = error?.message || String(error);
      logger.error('storeInvoiceArtifacts failed', error);
    }

    await db.runTransaction(async (transaction) => {
      transaction.set(invoiceRef, {
        status,
        key: result.key || null,
        protocol: result.protocol || null,
        receipt: result.receipt || null,
        cStat: result.cStat || null,
        xMotivo: resultReason || null,
        ...(consultation ? {lastConsultation: consultation} : {}),
        ...(status === INVOICE_STATUS.REJECTED ? {issuanceRejection: {
          cStat: result.cStat ?? null, xMotivo: resultReason || null,
          at: admin.firestore.Timestamp.now(), by: uid, attemptId: invoiceId,
        }} : {}),
        errors: compactFiscalErrors(result.errors),
        artifacts: Object.keys(artifacts).length ? artifacts : FieldValue.delete(),
        artifactError: artifactError || FieldValue.delete(),
        danfePdfReady: Boolean(artifacts.danfePdf),
        updatedAt: FieldValue.serverTimestamp(),
        serviceResult: compactFiscalServiceResult(result, artifacts),
        history: FieldValue.arrayUnion({
          status,
          at: admin.firestore.Timestamp.now(),
          by: uid,
          message: historyMessage || resultReason || 'Retorno recebido do serviço fiscal.',
          cStat: result.cStat ?? null,
        }, ...(consultation ? [{...consultation, action: 'consultation', status}] : [])),
      }, {merge: true});

      if (!orderRef) {
        return;
      }

      const lastInvoicePatch = {
        'fiscal.lastInvoiceId': invoiceId,
        'fiscal.lastInvoiceStatus': status,
        'fiscal.lastInvoiceReason': resultReason || null,
        'fiscal.lastInvoiceKey': result.key || null,
        'fiscal.lastInvoiceProtocol': result.protocol || null,
        'fiscal.lastInvoiceCStat': result.cStat ?? null,
        'fiscal.lastInvoiceDuplicate': duplicateRejected ? true : FieldValue.delete(),
      };

      if (status === INVOICE_STATUS.AUTHORIZED) {
        transaction.update(orderRef, {
          ...lastInvoicePatch,
          'fiscal.authorizedInvoiceId': invoiceId,
          'fiscal.invoiceInProgressId': FieldValue.delete(),
          'fiscal.lastInvoiceDuplicate': FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if ([INVOICE_STATUS.REJECTED, INVOICE_STATUS.DENIED].includes(status)) {
        transaction.update(orderRef, {
          ...lastInvoicePatch,
          'fiscal.invoiceInProgressId': FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (status === INVOICE_STATUS.PENDING_RETURN) {
        transaction.update(orderRef, {
          ...lastInvoicePatch,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return callableFiscalResult({result, invoiceId, artifacts, artifactError});
  };

  const previewNextNumber = async (lojaId, environment, model, series) => {
    const counterSnap = await db.collection('lojas').doc(lojaId).collection('fiscalCounters').doc(counterId(environment, model, series)).get();
    return nextNumberFrom(counterSnap);
  };

  const checkedPreviewNumber = async (lojaId, expected) => db.runTransaction(async (transaction) => {
    const storeRef = db.collection('lojas').doc(lojaId);
    const context = await numberingContextInTransaction(transaction, storeRef, expected.model);
    if (context.environment !== expected.environment || context.series !== expected.series || context.issuerCnpj !== expected.issuerCnpj) {
      throw new HttpsError('aborted', 'Configuração fiscal alterada. Confira novamente antes de emitir.');
    }
    const counter = await transaction.get(storeRef.collection('fiscalCounters').doc(counterId(context.environment, context.model, context.series)));
    assertCounterIssuer(counter, context);
    const number = nextNumberFrom(counter);
    await assertNumberAvailable(transaction, storeRef, context, number);
    return number;
  });

  const draftRefFor = (lojaId, draftId) => {
    if (!draftId || draftId.includes('/')) throw new HttpsError('invalid-argument', 'Identificador de rascunho inválido.');
    return db.collection('lojas').doc(lojaId).collection('invoices').doc(draftId);
  };

  const checkDraft = async ({lojaId, draftId, draft, uid}) => {
    if (![55, 65].includes(Number(draft.model))) {
      return {ok: false, errors: ['Documento: selecione NF-e ou NFC-e.'], warnings: [], preview: null};
    }
    const errors = [];
    let prepared;
    try {
      prepared = draft.orderId
        ? await buildPreparedPayload({lojaId, orderId: draft.orderId, modelOverride: draft.model,
          invoiceId: draftId, uid, additionalInfo: draft.additionalInfo, operationCfop: draft.operationCfop})
        : await buildManualPreparedPayload({lojaId, manualInvoice: draft.manualInvoice, modelOverride: draft.model,
          invoiceId: draftId, uid, additionalInfo: draft.manualInvoice?.additionalInfo,
          operationCfop: draft.manualInvoice?.operationCfop, snapshotOnly: Boolean(draft.clonedFromFiscalDocumentId)});
      errors.push(...prepared.errors);
    } catch (error) {
      errors.push(error?.message || 'Não foi possível preparar a nota.');
    }
    if (!prepared) return {ok: false, errors, warnings: [], preview: null};
    const serviceConfig = await loadPlatformServiceConfig();
    prepared.serviceConfig = serviceConfig;
    if (!serviceConfig.serviceUrl) errors.push('Serviço fiscal não configurado.');
    if (!prepared.certificate.ready) errors.push('Certificado A1 da loja não configurado.');
    if (prepared.model === 65 && (!prepared.certificate.nfceCscSecretVersion || !prepared.certificate.nfceCscIdSecretVersion)) {
      errors.push('CSC e ID CSC da NFC-e não configurados.');
    }
    const environment = prepared.settings.environment || 'homologation';
    let number = await previewNextNumber(lojaId, environment, prepared.model, prepared.series);
    if (!errors.length) {
      try { number = await checkedPreviewNumber(lojaId, {environment, model: prepared.model, series: prepared.series, issuerCnpj: prepared.payload.issuer.cnpj}); }
      catch (error) { errors.push(error.message); }
    }
    const payload = {...prepared.payload, invoice: {...prepared.payload.invoice, number}};
    let warnings = [];
    if (!errors.length) {
      try {
        const result = await callFiscalService('/validate', payload, serviceConfig);
        errors.push(...(Array.isArray(result.errors) ? result.errors : []));
        warnings = Array.isArray(result.warnings) ? result.warnings : [];
        if (result.ok === false && !errors.length) errors.push('Validação fiscal não aprovada pelo serviço.');
      } catch (error) {
        errors.push(error?.message || 'Serviço fiscal indisponível para validação.');
      }
    }
    return {
      ok: errors.length === 0,
      errors: [...new Set(errors)],
      warnings,
      preview: {
        model: prepared.model,
        series: prepared.series,
        number: null,
        nextNumber: number,
        environment,
        issuer: {legalName: payload.issuer.legalName, cnpj: payload.issuer.cnpj},
        customer: payload.customer,
        items: payload.items,
        totals: payload.totals,
        additionalInfo: payload.additionalInfo,
      },
      prepared,
    };
  };

  const publicDraftCheck = (checked) => ({
    ok: checked.ok,
    errors: checked.errors,
    warnings: checked.warnings,
    preview: checked.preview,
  });

  const cloneSource = async (lojaId, invoiceId, invoice) => {
    const manual = invoice.manualInvoice && typeof invoice.manualInvoice === 'object' ? invoice.manualInvoice : null;
    const artifact = invoice.artifacts?.authorizedXml || invoice.artifacts?.signedXml;
    const hasSnapshot = invoice.customer && Array.isArray(invoice.items) && invoice.items.length;
    const completeTaxSnapshot = hasSnapshot && invoice.items.every((item) => (item.tax?.csosn || item.tax?.cst || item.csosn || item.cst) && (item.tax?.pisCst || item.pisCst) && (item.tax?.cofinsCst || item.cofinsCst));
    if (hasSnapshot && (completeTaxSnapshot || !artifact?.path)) {
      return {data: {...manual, customer: invoice.customer, items: invoice.items,
        operationCfop: invoice.operationCfop || invoice.items[0]?.cfop,
        operationNature: invoice.operationNature ?? manual?.operationNature,
        presence: invoice.presence ?? manual?.presence,
        freightMode: manual?.freightMode,
        additionalInfo: invoice.additionalInfo ?? manual?.additionalInfo ?? '',
        paymentMethodCode: invoice.paymentMethodCode || invoice.payment?.methodCode || manual?.paymentMethodCode || '',
        freight: invoice.totals?.freight ?? manual?.freight ?? 0,
        insurance: invoice.totals?.insurance ?? manual?.insurance ?? 0,
        other: invoice.totals?.other ?? manual?.other ?? 0}, source: 'invoice_snapshot', warnings: []};
    }
    if (artifact?.path) {
      if (!artifact.path.startsWith(`fiscal/${lojaId}/invoices/${invoiceId}/`)) throw new HttpsError('failed-precondition', 'Arquivo histórico não pertence a esta nota e loja.');
      const data = editableFromXml((await loadInvoiceArtifact(artifact)).toString('utf8'));
      if (data.model !== Number(invoice.model)) throw new HttpsError('failed-precondition', 'Modelo do XML histórico difere da nota.');
      // Preserve a catalog link only when the historical product code matches.
      data.items = data.items.map((item) => ({...item, productId: (invoice.items || []).find((prior) => prior.code === item.code)?.productId || ''}));
      return {data: {...data, operationCfop: data.items[0]?.cfop || ''}, source: 'historical_xml', warnings: []};
    }
    if (manual && Array.isArray(manual.items) && manual.items.length) return {data: manual, source: 'manual_snapshot', warnings: []};
    if (invoice.orderId && !String(invoice.orderId).includes('/')) {
      const snap = await db.collection('lojas').doc(lojaId).collection('pedidos').doc(invoice.orderId).get();
      if (snap.exists) {
        const order = snap.data();
        const items = (order.itens || []).map((item) => ({...item.fiscal,
          productId: item.produtoId || item.productId || '', code: item.codigo || item.sku || '', description: item.nome || item.description || '',
          quantity: item.quantity ?? item.quantidade ?? 0, unitPrice: item.preco ?? item.unitPrice ?? 0, discount: item.desconto || 0,
          ncm: item.ncm || item.fiscal?.ncm || '', cfop: item.cfop || item.fiscal?.cfop || invoice.operationCfop || '', unit: item.unit || item.fiscal?.unit || ''}));
        const allocated = allocateDiscounts(items, Number(order.desconto || order.cupom?.valorDesconto || 0));
        items.forEach((item, index) => { item.discount = allocated[index]; });
        return {data: {customer: await loadCustomer(order), items, operationCfop: invoice.operationCfop || items[0]?.cfop || '',
          paymentMethodCode: invoice.paymentMethodCode || '', additionalInfo: invoice.additionalInfo ?? order.observacao ?? '', freight: order.valorFrete || order.frete || 0},
        source: 'current_order', warnings: ['Nota antiga sem snapshot ou XML histórico disponível: os dados foram preenchidos a partir do pedido atual e podem diferir da nota original. Confira cliente, itens, valores e tributação. Campos fiscais ausentes permanecem pendentes.']};
      }
    }
    throw new HttpsError('failed-precondition', 'Esta nota não possui dados reutilizáveis ou XML histórico para clonagem.');
  };

  return {
    fiscalResolveOrderPaymentMethod: onCall(async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const orderId = trimText(request.data?.orderId);
        if (!orderId || orderId.includes('/')) throw new HttpsError('invalid-argument','Pedido inválido.');
        const ref = db.collection('lojas').doc(lojaId).collection('pedidos').doc(orderId);
        await db.runTransaction(async (transaction) => {
          const snap = await transaction.get(ref);
          if (!snap.exists) throw new HttpsError('not-found','Pedido não encontrado.');
          const order = snap.data();
          if (order.fiscal?.authorizedInvoiceId || order.fiscal?.invoiceInProgressId) throw new HttpsError('failed-precondition','Pedido já possui nota autorizada ou emissão em andamento.');
          const patch = manualPaymentPatch(order,request.data?.paymentMethodLabel);
          if (!patch) return;
          transaction.update(ref,{...patch,paymentMethodResolvedAt:FieldValue.serverTimestamp(),paymentMethodResolvedBy:uid,updatedAt:FieldValue.serverTimestamp()});
          transaction.create(db.collection('auditLogs').doc(),{action:'ORDER_PAYMENT_METHOD_RESOLVED',adminUid:uid,actor:{uid},storeId:lojaId,orderId,paymentMethod:patch.paymentMethod,fiscalPaymentCode:patch.fiscalPaymentCode,source:'fiscalResolveOrderPaymentMethod',timestamp:FieldValue.serverTimestamp()});
        });
        return {ok:true};
      } catch (error) {throw normalizeHttpsError(error);}
    }),
    fiscalGetNumbering: onCall(async (request) => {
      try {
        const {lojaId, requester} = await requireReadContext(request);
        const storeRef = db.collection('lojas').doc(lojaId);
        const sequences = await db.runTransaction(async (transaction) => {
          return Promise.all([55, 65].map(async (model) => {
            const context = await numberingContextInTransaction(transaction, storeRef, model);
            const counter = await transaction.get(storeRef.collection('fiscalCounters').doc(counterId(context.environment, model, context.series)));
            assertCounterIssuer(counter, context);
            return {...context, nextNumber: nextNumberFrom(counter), revision: counterRevision(counter), configured: counter.exists};
          }));
        });
        return {lojaId, canManage: canAdministerFiscal(requester), sequences};
      } catch (error) {
        logger.error('fiscalGetNumbering failed', {code: error?.code || 'internal'});
        throw normalizeHttpsError(error);
      }
    }),
    fiscalSetNextNumber: onCall(async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        const data = request.data || {};
        if (data.confirmed !== true || ![55, 65].includes(data.model) || !isFiscalNumber(data.nextNumber) ||
          !['production', 'homologation'].includes(data.environment) || !Number.isInteger(data.series) || data.series < 0 || data.series > 999 ||
          !Number.isInteger(data.expectedNextNumber) || data.expectedNextNumber < 1 || data.expectedNextNumber > MAX_FISCAL_NUMBER + 1 ||
          typeof data.expectedRevision !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(data.changeRequestId || '')) {
          throw new HttpsError('invalid-argument', 'Confirme a alteração e informe um próximo número inteiro entre 1 e 999999999.');
        }
        const fingerprint = JSON.stringify([data.model, data.series, data.environment, data.issuerCnpj, data.nextNumber, data.expectedNextNumber, data.expectedRevision]);
        const id = createHash('sha256').update(JSON.stringify([lojaId, uid, data.environment, data.model, data.series, data.changeRequestId])).digest('hex');
        const auditRef = db.collection('auditLogs').doc(`manual_numbering_${id}`);
        const storeRef = db.collection('lojas').doc(lojaId);
        // Authoritative receipt stays under the existing server-only counter path.
        // auditLogs retains the familiar audit mirror, but is never trusted for retries.
        const receiptRef = storeRef.collection('fiscalCounters').doc(counterId(data.environment, data.model, data.series)).collection('manualChanges').doc(id);
        return await db.runTransaction(async (transaction) => {
          const previous = await transaction.get(receiptRef);
          if (previous.exists) {
            if (previous.get('fingerprint') !== fingerprint) throw new HttpsError('invalid-argument', 'Identificador já utilizado para outra alteração.');
            return {...previous.get('numbering'), repeated: true};
          }
          const context = await numberingContextInTransaction(transaction, storeRef, data.model);
          if (data.series !== context.series || data.environment !== context.environment || data.issuerCnpj !== context.issuerCnpj) {
            throw new HttpsError('aborted', 'Emitente, ambiente ou série mudou. Atualize a numeração e confirme novamente.');
          }
          const ref = storeRef.collection('fiscalCounters').doc(counterId(context.environment, context.model, context.series));
          const counter = await transaction.get(ref);
          assertCounterIssuer(counter, context);
          const current = nextNumberFrom(counter);
          if (current !== data.expectedNextNumber || counterRevision(counter) !== data.expectedRevision) {
            throw new HttpsError('aborted', 'A numeração mudou durante a conferência. Atualize e confirme novamente.');
          }
          if (current === data.nextNumber) throw new HttpsError('invalid-argument', 'O próximo número já possui esse valor.');
          await assertNumberAvailable(transaction, storeRef, context, data.nextNumber, true);
          const numbering = {...context, previousNumber: current, nextNumber: data.nextNumber};
          const profile = requester.profile || {};
          transaction.set(ref, {...context, nextNumber: data.nextNumber, updatedAt: FieldValue.serverTimestamp(), updatedByUid: uid}, {merge: true});
          const audit = {
            uid, usuario: cleanText(profile.nome || profile.displayName || profile.email || uid), email: cleanText(profile.email),
            perfil: requester.role, lojaId, modulo: 'nota-fiscal', action: 'fiscal_numbering_manually_changed',
            documentId: ref.id, before: {...context, nextNumber: current}, after: {...context, nextNumber: data.nextNumber},
            numbering, fingerprint, result: 'success', createdAt: FieldValue.serverTimestamp(),
            details: {direction: data.nextNumber < current ? 'decrease' : 'increase', availabilityConfirmedBySefaz: false},
          };
          transaction.set(receiptRef, audit);
          transaction.set(auditRef, {...audit, authoritativePath: receiptRef.path});
          return numbering;
        });
      } catch (error) {
        logger.error('fiscalSetNextNumber failed', {code: error?.code || 'internal'});
        throw normalizeHttpsError(error);
      }
    }),
    fiscalCloneInvoice: onCall(async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const invoiceId = trimText(request.data?.invoiceId);
        const token = trimText(request.data?.cloneRequestId);
        if (!invoiceId || invoiceId.includes('/') || !/^[A-Za-z0-9_-]{16,100}$/.test(token)) throw new HttpsError('invalid-argument', 'Nota ou identificador da clonagem inválido.');
        const sourceRef = draftRefFor(lojaId, invoiceId);
        // A new confirmation has a new token. Retries of that confirmation address one new document.
        const id = createHash('sha256').update(JSON.stringify([lojaId, uid, invoiceId, token])).digest('hex');
        const cloneRef = draftRefFor(lojaId, `clone_${id}`);
        const existing = await cloneRef.get();
        if (existing.exists) return {draftId: cloneRef.id, ...existing.data()};
        const originalSnap = await sourceRef.get();
        if (!originalSnap.exists) throw new HttpsError('not-found', 'Nota original não encontrada nesta loja.');
        const original = originalSnap.data();
        if (original.lojaId && original.lojaId !== lojaId) throw new HttpsError('permission-denied', 'A nota pertence a outra loja.');
        if (!['authorized', 'rejected', 'cancelled'].includes(original.status)) throw new HttpsError('failed-precondition', 'Clonagem disponível para notas autorizadas, rejeitadas ou canceladas.');
        const model = Number(original.model);
        if (![55, 65].includes(model)) throw new HttpsError('failed-precondition', 'Modelo fiscal histórico não identificado.');
        const base = await cloneSource(lojaId, invoiceId, original);
        const manualInvoice = cloneEditableForm(base.data);
        if (JSON.stringify(manualInvoice).length > 200000) throw new HttpsError('failed-precondition', 'Dados da nota excedem o tamanho permitido para rascunho.');
        const totals = draftTotals(manualInvoice);
        const profile = (await db.collection('users').doc(uid).get()).data() || {};
        const fingerprint = JSON.stringify(original);
        await db.runTransaction(async (transaction) => {
          const [latest, prior] = await Promise.all([transaction.get(sourceRef), transaction.get(cloneRef)]);
          if (prior.exists) return;
          if (!latest.exists || JSON.stringify(latest.data()) !== fingerprint) throw new HttpsError('aborted', 'Nota original atualizada durante a clonagem. Tente novamente.');
          transaction.set(cloneRef, {
            lojaId, origin: 'manual', orderId: null, model, status: INVOICE_STATUS.DRAFT, version: 1, number: null,
            manualInvoice, totals, total: totals.invoice, customerName: manualInvoice.customer.name || '', customerDocument: manualInvoice.customer.document || '',
            clonedFromFiscalDocumentId: invoiceId, clonedFromModel: model, clonedFromNumber: original.number ?? null,
            cloneDataSource: base.source, cloneWarnings: base.warnings,
            createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdByUid: uid,
            history: [{action: 'cloned', status: INVOICE_STATUS.DRAFT, at: admin.firestore.Timestamp.now(), by: uid,
              userName: trimText(profile.name || profile.nome || ''), sourceInvoiceId: invoiceId, model,
              message: `Rascunho criado por clonagem da ${model === 55 ? 'NF-e' : 'NFC-e'} ${original.number ?? invoiceId}.`, dataSource: base.source}],
          });
        });
        const saved = await cloneRef.get();
        return {draftId: cloneRef.id, ...saved.data()};
      } catch (error) {
        // Do not include source documents, XML or personal data in logs.
        logger.error('fiscalCloneInvoice failed', {code: error?.code || 'internal'});
        throw normalizeHttpsError(error);
      }
    }),
    fiscalSaveDraft: onCall(async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const selectedModel = Number(request.data?.model);
        const model = [55, 65].includes(selectedModel) ? selectedModel : null;
        let manualInvoice = request.data?.manualInvoice;
        const orderId = trimText(request.data?.orderId);
        if (orderId) {
          if (orderId.includes('/')) throw new HttpsError('invalid-argument', 'Pedido inválido.');
          const orderSnap = await db.collection('lojas').doc(lojaId).collection('pedidos').doc(orderId).get();
          if (!orderSnap.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
          const order = orderSnap.data() || {};
          if (order.fiscal?.authorizedInvoiceId || order.fiscal?.invoiceInProgressId) {
            throw new HttpsError('failed-precondition', 'Pedido já tem nota autorizada ou emissão em andamento.');
          }
          if (!['Finalizado', 'Aprovado', 'ready_for_invoice', 'approved'].includes(order.status) && !order.approvedForInvoice) {
            throw new HttpsError('failed-precondition', 'Pedido ainda não está aprovado para nota fiscal.');
          }
          const pendingRef = draftRefFor(lojaId, `draft_${orderId}_pending`);
          const pendingSnap = model ? await pendingRef.get() : null;
          const ref = pendingSnap?.exists ? pendingRef : draftRefFor(lojaId, `draft_${orderId}_${model || 'pending'}`);
          const result = await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(ref);
            if (snap.exists && snap.get('status') !== INVOICE_STATUS.DRAFT) throw new HttpsError('failed-precondition', 'A nota deste pedido já iniciou emissão.');
            const version = Number(snap.get('version') || 0) + 1;
            transaction.set(ref, {
              lojaId, orderId, origin: 'order', model, status: INVOICE_STATUS.DRAFT, version, number: null,
              additionalInfo: trimText(request.data?.additionalInfo || order.observacao || order.additionalInfo),
              operationCfop: onlyDigits(request.data?.operationCfop),
              customerName: trimText(order.clienteNome), total: money(Number(order.total) || 0),
              updatedAt: FieldValue.serverTimestamp(),
              ...(!snap.exists ? {createdAt: FieldValue.serverTimestamp(), createdByUid: uid} : {}),
              history: FieldValue.arrayUnion({status: INVOICE_STATUS.DRAFT, action: snap.exists ? 'edited' : 'created', at: admin.firestore.Timestamp.now(), by: uid}),
            }, {merge: true});
            return {draftId: ref.id, status: INVOICE_STATUS.DRAFT, version};
          });
          return result;
        }
        if (!manualInvoice || typeof manualInvoice !== 'object' || Array.isArray(manualInvoice)) {
          throw new HttpsError('invalid-argument', 'Dados do rascunho inválidos.');
        }
        if (manualInvoice.items !== undefined && !Array.isArray(manualInvoice.items)) throw new HttpsError('invalid-argument', 'Itens do rascunho inválidos.');
        const serialized = JSON.stringify(manualInvoice);
        if (serialized.length > 200000) throw new HttpsError('invalid-argument', 'Rascunho excede o tamanho permitido.');
        const draftId = String(request.data?.draftId || '').trim();
        const ref = draftId ? draftRefFor(lojaId, draftId) : db.collection('lojas').doc(lojaId).collection('invoices').doc();
        const timestamp = admin.firestore.Timestamp.now();
        const result = await db.runTransaction(async (transaction) => {
          const snap = await transaction.get(ref);
          const current = snap.exists ? snap.data() || {} : {};
          if (snap.exists && current.status !== INVOICE_STATUS.DRAFT) {
            throw new HttpsError('failed-precondition', 'Somente rascunhos podem ser editados.');
          }
          if (snap.exists && current.origin !== 'manual') {
            throw new HttpsError('failed-precondition', 'Rascunho de pedido deve ser editado pelo fluxo do pedido.');
          }
          if (current.clonedFromFiscalDocumentId) {
            if (model !== current.model) throw new HttpsError('failed-precondition', 'O modelo da nota clonada deve ser preservado.');
            manualInvoice = cloneEditableForm(manualInvoice);
            manualInvoice.stockMovementRequested = request.data?.manualInvoice?.stockMovementRequested === true;
          }
          const version = Number(current.version || 0) + 1;
          const customer = manualInvoice.customer || {};
          const totals = draftTotals(manualInvoice);
          transaction.set(ref, {
            lojaId,
            origin: 'manual',
            manualInvoice: JSON.parse(JSON.stringify(manualInvoice)),
            model,
            status: INVOICE_STATUS.DRAFT,
            version,
            number: null,
            customerName: trimText(customer.name),
            customerDocument: onlyDigits(customer.document),
            totals, total: totals.invoice,
            lastCheck: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
            ...(!snap.exists ? {createdAt: FieldValue.serverTimestamp(), createdByUid: uid} : {}),
            history: FieldValue.arrayUnion({status: INVOICE_STATUS.DRAFT, action: snap.exists ? 'edited' : 'created', at: timestamp, by: uid}),
          }, {merge: true});
          return {draftId: ref.id, status: INVOICE_STATUS.DRAFT, version};
        });
        return result;
      } catch (error) {
        logger.error('fiscalSaveDraft failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalCheckDraft: onCall(async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const draftId = String(request.data?.draftId || '').trim();
        const ref = draftRefFor(lojaId, draftId);
        const snap = await ref.get();
        if (!snap.exists) throw new HttpsError('not-found', 'Rascunho não encontrado.');
        const draft = snap.data() || {};
        if (draft.status !== INVOICE_STATUS.DRAFT) throw new HttpsError('failed-precondition', 'A checagem é permitida apenas para rascunhos.');
        const checked = await checkDraft({lojaId, draftId, draft, uid});
        await ref.set({
          lastCheck: {ok: checked.ok, errors: checked.errors, warnings: checked.warnings, at: FieldValue.serverTimestamp(), version: draft.version},
          history: FieldValue.arrayUnion({status: INVOICE_STATUS.DRAFT, action: 'validated', at: admin.firestore.Timestamp.now(), by: uid, ok: checked.ok}),
        }, {merge: true});
        return publicDraftCheck(checked);
      } catch (error) {
        logger.error('fiscalCheckDraft failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalIssueDraft: onCall({timeoutSeconds: 540, memory: '1GiB'}, async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const draftId = String(request.data?.draftId || '').trim();
        const ref = draftRefFor(lojaId, draftId);
        const snap = await ref.get();
        if (!snap.exists) throw new HttpsError('not-found', 'Rascunho não encontrado.');
        const draft = snap.data() || {};
        if (draft.status !== INVOICE_STATUS.DRAFT) return {...callableFiscalResult({result: draft, invoiceId: draftId, artifacts: draft.artifacts || {}}),
          number: draft.number ?? null, model: draft.model, series: draft.series ?? null, xMotivo: draft.xMotivo || 'Esta nota já iniciou a emissão.'};
        if (Number(request.data?.model) !== Number(draft.model)) throw new HttpsError('invalid-argument', 'Modelo da confirmação difere do rascunho.');
        const checked = await checkDraft({lojaId, draftId, draft, uid});
        if (!checked.ok) throw new HttpsError('failed-precondition', checked.errors.join(' '), {errors: checked.errors});
        const prepared = checked.prepared;
        const environment = prepared.settings.environment || 'homologation';
        const counterRef = db.collection('lojas').doc(lojaId).collection('fiscalCounters').doc(counterId(environment, prepared.model, prepared.series));
        const reservation = await db.runTransaction(async (transaction) => {
          const orderRef = draft.orderId ? db.collection('lojas').doc(lojaId).collection('pedidos').doc(draft.orderId) : null;
          const [latest, counter, orderSnap] = await Promise.all([transaction.get(ref), transaction.get(counterRef), orderRef ? transaction.get(orderRef) : Promise.resolve(null)]);
          if (latest.get('status') !== INVOICE_STATUS.DRAFT) return null;
          if (Number(latest.get('version')) !== Number(draft.version)) throw new HttpsError('aborted', 'Rascunho alterado durante a validação. Cheque novamente.');
          if (orderSnap && (orderSnap.get('fiscal.authorizedInvoiceId') || orderSnap.get('fiscal.invoiceInProgressId'))) {
            throw new HttpsError('failed-precondition', 'Pedido já tem nota autorizada ou emissão em andamento.');
          }
          if (orderSnap && Number(orderSnap.get('updatedAt')?.toMillis?.() || 0) !== Number(prepared.order?.updatedAt?.toMillis?.() || 0)) {
            throw new HttpsError('aborted', 'Pedido alterado durante a validação. Cheque novamente.');
          }
          if (orderSnap) {
            const latestPayment = explicitFiscalPayment(orderSnap.data());
            if (latestPayment && latestPayment.methodCode !== prepared.payload.invoice.payment.methodCode) throw new HttpsError('aborted','Pagamento alterado durante a validação. Valide novamente.');
          }
          const storeRef = db.collection('lojas').doc(lojaId);
          const context = await numberingContextInTransaction(transaction, storeRef, prepared.model);
          if (context.environment !== environment || context.series !== prepared.series || context.issuerCnpj !== prepared.payload.issuer.cnpj) {
            throw new HttpsError('aborted', 'Configuração fiscal alterada. Confira novamente antes de emitir.');
          }
          assertCounterIssuer(counter, context);
          const number = nextNumberFrom(counter);
          const blockRef = await assertNumberAvailable(transaction, storeRef, context, number);
          transaction.set(blockRef, {environment, model: prepared.model, series: prepared.series, number, issuerCnpj: context.issuerCnpj,
            status: 'reserved', invoiceId: draftId, at: FieldValue.serverTimestamp(), by: uid});
          transaction.set(counterRef, {environment, model: prepared.model, series: prepared.series, issuerCnpj: context.issuerCnpj, nextNumber: number + 1, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
          transaction.set(ref, {
            status: INVOICE_STATUS.VALIDATING,
            environment,
            series: prepared.series,
            issuerCnpj: prepared.payload.issuer.cnpj,
            number,
            customer: prepared.payload.customer,
            items: prepared.payload.items,
            totals: prepared.payload.totals,
            ...(prepared.payload.transport ? {transport: prepared.payload.transport} : {}),
            total: prepared.payload.totals.invoice,
            operationCfop: prepared.payload.invoice.operationCfop,
            additionalInfo: prepared.payload.additionalInfo,
            operationNature: prepared.payload.invoice.operationNature,
            presence: prepared.payload.invoice.presence,
            paymentMethodCode: prepared.payload.invoice.payment.methodCode,
            requestedByUid: uid,
            issuedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            history: FieldValue.arrayUnion({status: INVOICE_STATUS.VALIDATING, action: 'issued', at: admin.firestore.Timestamp.now(), by: uid, message: 'Numeração reservada; transmissão iniciada.'}),
          }, {merge: true});
          if (orderRef) transaction.update(orderRef, {'fiscal.invoiceInProgressId': draftId, updatedAt: FieldValue.serverTimestamp()});
          return {number};
        });
        if (!reservation) return {invoiceId: draftId, status: INVOICE_STATUS.VALIDATING, xMotivo: 'Emissão já iniciada.'};
        const payload = {...prepared.payload, invoiceId: draftId, invoice: {...prepared.payload.invoice, number: reservation.number}};
        try {
          const issueResult = await callFiscalService('/issue', payload, prepared.serviceConfig);
          const result = await consultDuplicateIfNeeded({payload, result: issueResult, serviceConfig: prepared.serviceConfig});
          return await updateInvoiceAfterIssue({lojaId, invoiceId: draftId, orderId: draft.orderId || null, uid, result});
        } catch (error) {
          const status = error?.fiscalServiceResponded ? INVOICE_STATUS.REJECTED : INVOICE_STATUS.PENDING_RETURN;
          await ref.set({
            status,
            error: error?.message || String(error),
            updatedAt: FieldValue.serverTimestamp(),
            history: FieldValue.arrayUnion({status, at: admin.firestore.Timestamp.now(), by: uid, message: error?.message || 'Retorno fiscal inconclusivo.'}),
          }, {merge: true});
          if (draft.orderId && status !== INVOICE_STATUS.PENDING_RETURN) {
            await db.collection('lojas').doc(lojaId).collection('pedidos').doc(draft.orderId).update({
              'fiscal.invoiceInProgressId': FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
            });
          }
          throw error;
        }
      } catch (error) {
        logger.error('fiscalIssueDraft failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalInutilizeNumbering: onCall({timeoutSeconds: 180, memory: '512MiB'}, async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const model = Number(request.data?.model);
        const series = Number(request.data?.series);
        const start = Number(request.data?.start);
        const end = Number(request.data?.end);
        const year = Number(request.data?.year);
        const reason = trimText(request.data?.reason);
        if (![55, 65].includes(model) || !Number.isInteger(series) || series < 0 || series > 999
          || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > 999999999) {
          throw new HttpsError('invalid-argument', 'Modelo, série ou faixa de numeração inválida.');
        }
        if (end - start + 1 > 100) throw new HttpsError('invalid-argument', 'Envie faixas de até 100 números por operação.');
        if (year !== new Date().getUTCFullYear()) throw new HttpsError('invalid-argument', 'Informe o ano corrente da integração fiscal.');
        if (reason.length < 15 || reason.length > 255) throw new HttpsError('invalid-argument', 'Justificativa deve ter entre 15 e 255 caracteres.');
        const [settings, issuer, certificate, serviceConfig] = await Promise.all([loadSettings(lojaId), loadIssuer(lojaId), loadCertificate(lojaId), loadPlatformServiceConfig()]);
        if (!serviceConfig.serviceUrl || !certificate.ready) {
          throw new HttpsError('failed-precondition', 'Configure serviço fiscal e certificado antes de inutilizar numeração.');
        }
        const capabilities = await callFiscalService('/capabilities', {}, serviceConfig);
        if (capabilities.inutilize !== true || Number(capabilities.year) !== year) {
          throw new HttpsError('failed-precondition', 'O serviço fiscal ainda não suporta inutilização neste ano.');
        }
        const configuredSeries = model === 55 ? settings.nfeSeries : settings.nfceSeries;
        if (series !== configuredSeries) throw new HttpsError('failed-precondition', 'A série deve corresponder à configuração fiscal da loja.');
        const environment = settings.environment || 'homologation';
        const storeRef = db.collection('lojas').doc(lojaId);
        const invoicesRef = storeRef.collection('invoices');
        const counterRef = storeRef.collection('fiscalCounters').doc(counterId(environment, model, series));
        const counterBefore = await counterRef.get();
        const expectedNextNumber = Number(counterBefore.get('nextNumber') || 1);
        const numberRows = await invoicesRef.where('number', '>=', start).where('number', '<=', end).get();
        if (numberRows.docs.some((snap) => {
          const invoice = snap.data() || {};
          return Number(invoice.model) === model && Number(invoice.series) === series && invoice.environment === environment;
        })) throw new HttpsError('failed-precondition', 'A faixa contém numeração já usada ou reservada por nota fiscal.');
        const operationId = `${environment}_${model}_${series}_${year}_${start}_${end}`;
        const operationRef = storeRef.collection('fiscalInutilizations').doc(operationId);
        const numberRefs = Array.from({length: end - start + 1}, (_, index) => (
          storeRef.collection('fiscalNumberBlocks').doc(`${environment}_${model}_${series}_${start + index}`)
        ));
        const reserved = await db.runTransaction(async (transaction) => {
          const [operationSnap, counterSnap, ...numberSnaps] = await Promise.all([
            transaction.get(operationRef), transaction.get(counterRef), ...numberRefs.map((ref) => transaction.get(ref)),
          ]);
          if (operationSnap.exists) return false;
          if (numberSnaps.some((snap) => snap.exists)) throw new HttpsError('failed-precondition', 'A faixa contém numeração já inutilizada ou em processamento.');
          const nextNumber = Number(counterSnap.get('nextNumber') || 1);
          if (nextNumber !== expectedNextNumber) throw new HttpsError('aborted', 'A numeração mudou durante a conferência. Tente novamente.');
          if (nextNumber < start) throw new HttpsError('failed-precondition', 'A faixa começa após o próximo número disponível; confirme a sequência antes de inutilizar.');
          const timestamp = admin.firestore.Timestamp.now();
          if (end >= nextNumber) transaction.set(counterRef, {environment, model, series, nextNumber: end + 1, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
          numberRefs.forEach((ref) => transaction.set(ref, {operationId, model, series, environment, status: 'processing', at: timestamp}));
          transaction.set(operationRef, {
            lojaId, model, series, start, end, year, environment, reason,
            status: 'processing', requestedByUid: uid, createdAt: FieldValue.serverTimestamp(),
            history: [{status: 'processing', at: timestamp, by: uid, message: 'Faixa reservada; inutilização iniciada.'}],
          });
          return true;
        });
        if (!reserved) {
          const existing = (await operationRef.get()).data() || {};
          return {operationId, status: existing.status, protocol: existing.protocol || null, xMotivo: existing.xMotivo || null};
        }
        try {
          const result = await callFiscalService('/inutilize', {
            model, series, start, end, year, reason,
            environment: environmentCode(environment), issuer, fiscalSecrets: certificate.fiscalSecrets,
          }, serviceConfig);
          let responseArtifact = null;
          let artifactError = null;
          if (result.responseXml) {
            try {
              responseArtifact = await saveInvoiceArtifact({lojaId, invoiceId: `inutilizations/${operationId}`, filename: 'response.xml', contentType: 'application/xml', content: result.responseXml});
            } catch (error) {
              artifactError = error?.message || String(error);
              logger.error('inutilization response artifact failed', error);
            }
          }
          const status = result.status === 'inutilized' ? 'inutilized' : 'rejected';
          const compact = {status, protocol: result.protocol || null, cStat: result.cStat ?? null, xMotivo: result.xMotivo || null};
          await operationRef.set({
            ...compact, response: compact, responseArtifact, artifactError,
            completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
            history: FieldValue.arrayUnion({status, at: admin.firestore.Timestamp.now(), by: uid, protocol: compact.protocol, message: compact.xMotivo}),
          }, {merge: true});
          return {operationId, ...compact};
        } catch (error) {
          await operationRef.set({
            status: 'pending_return', xMotivo: error?.message || 'Retorno fiscal inconclusivo.',
            updatedAt: FieldValue.serverTimestamp(),
            history: FieldValue.arrayUnion({status: 'pending_return', at: admin.firestore.Timestamp.now(), by: uid, message: 'Retorno fiscal inconclusivo; não retransmitir sem consulta.'}),
          }, {merge: true});
          throw error;
        }
      } catch (error) {
        logger.error('fiscalInutilizeNumbering failed', error);
        throw normalizeHttpsError(error);
      }
    }),
    fiscalGetConfiguration: onCall(async (request) => {
      try {
        const {lojaId, requester} = await requireReadContext(request);
        const [issuerSnap, settingsSnap, certificate] = await Promise.all([
          db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('issuer').get(),
          db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('settings').get(),
          loadCertificate(lojaId),
        ]);
        const rawSettings = settingsSnap.exists ? settingsSnap.data() || {} : {};

        if (rawSettings.serviceUrl || rawSettings.fiscalServiceUrl || rawSettings.sharedSecret || rawSettings.fiscalSharedSecret) {
          await db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('settings').set({
            serviceUrl: FieldValue.delete(),
            fiscalServiceUrl: FieldValue.delete(),
            sharedSecret: FieldValue.delete(),
            fiscalSharedSecret: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        }
        const canViewPlatformService = isPlatformFiscalAdmin(requester) || requester.role === 'contador';
        const platformConfig = canViewPlatformService ? await loadPlatformServiceConfig() : null;

        return {
          issuer: issuerSnap.exists ? issuerSnap.data() || {} : null,
          settings: await loadSettings(lojaId),
          ncmOptions: Array.isArray(rawSettings.ncmOptions)
            ? rawSettings.ncmOptions.filter((item) => /^\d{8}$/.test(String(item?.code || '')))
              .map((item) => ({code: item.code, description: cleanText(item.description).slice(0, 120)}))
            : [],
          certificate: publicCertificateInfo(certificate),
          platformService: platformConfig ? {
            serviceUrl: platformConfig.serviceUrl,
            configured: platformConfig.configured,
            source: platformConfig.source,
          } : null,
        };
      } catch (error) {
        logger.error('fiscalGetConfiguration failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalSaveNcmOption: onCall(async (request) => {
      try {
        return await saveFiscalCatalogOption(request, 'NCM');
      } catch (error) {
        logger.error('fiscalSaveNcmOption failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalSaveCfopOption: onCall(async (request) => {
      try {
        return await saveFiscalCatalogOption(request, 'CFOP');
      } catch (error) {
        logger.error('fiscalSaveCfopOption failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalListCfopOptions: onCall(async (request) => {
      try {
        const {uid, lojaId} = await requireReadContext(request);
        await requireFiscalCatalogPermission(uid);
        const snap = await db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('settings').get();
        const options = snap.get('cfopOptions');
        return {options: Array.isArray(options) ? options.filter((item) => /^\d{4}$/.test(String(item?.code || '')))
          .map((item) => ({code: item.code, description: cleanText(item.description).slice(0, 120)})) : []};
      } catch (error) {
        logger.error('fiscalListCfopOptions failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalSaveConfiguration: onCall(async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        const issuer = request.data?.issuer || {};
        const settings = request.data?.settings || {};
        for (const key of ['nfeSeries', 'nfceSeries']) {
          const value = settings[key] ?? 1;
          if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 999) {
            throw new HttpsError('invalid-argument', 'Informe séries fiscais inteiras entre 0 e 999.');
          }
        }
        const protectedPlatformFields = protectedPlatformFieldsIn(settings);
        const shouldUpdatePlatformService = protectedPlatformFields.length > 0;
        if (shouldUpdatePlatformService && !isPlatformFiscalAdmin(requester)) {
          await auditFiscalAction({
            uid,
            lojaId,
            requester,
            action: 'fiscal_platform_service_update_denied',
            result: 'denied',
            details: {fields: protectedPlatformFields},
          });
          throw new HttpsError('permission-denied', 'Somente o dono pode alterar a URL global do serviço fiscal.');
        }
        const [previousIssuerSnap, previousSettingsSnap] = await Promise.all([
          db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('issuer').get(),
          db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('settings').get(),
        ]);
        const writes = [
          db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('issuer').set({
            ...issuer,
            taxRegime: Number(issuer.taxRegime || 1),
            updatedAt: FieldValue.serverTimestamp(),
            updatedByUid: uid,
          }, {merge: true}),
          db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('settings').set({
            environment: cleanText(settings.environment || 'homologation'),
            nfeSeries: Number(settings.nfeSeries ?? 1),
            nfceSeries: Number(settings.nfceSeries ?? 1),
            operationNature: cleanText(settings.operationNature),
            defaultPaymentMethodCode: cleanText(settings.defaultPaymentMethodCode || '99'),
            defaultPresence: Number(settings.defaultPresence || 2),
            serviceUrl: FieldValue.delete(),
            fiscalServiceUrl: FieldValue.delete(),
            sharedSecret: FieldValue.delete(),
            fiscalSharedSecret: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
            updatedByUid: uid,
          }, {merge: true}),
        ];
        if (shouldUpdatePlatformService) {
          const serviceUrl = cleanText(settings.serviceUrl || settings.fiscalServiceUrl);
          const sharedSecret = cleanText(settings.sharedSecret || settings.fiscalSharedSecret);
          writes.push(db.collection('integrations').doc('fiscal').set({
            serviceUrl: serviceUrl || FieldValue.delete(),
            sharedSecret: sharedSecret || FieldValue.delete(),
            configured: Boolean(serviceUrl),
            updatedAt: FieldValue.serverTimestamp(),
            updatedByUid: uid,
          }, {merge: true}));
        }
        await Promise.all(writes);
        await auditFiscalAction({
          uid,
          lojaId,
          requester,
          action: 'fiscal_configuration_updated',
          documentId: 'issuer/settings',
          before: fiscalConfigurationAuditView(previousIssuerSnap.data(), previousSettingsSnap.data()),
          after: fiscalConfigurationAuditView(issuer, settings),
        });
        return {ok: true};
      } catch (error) {
        logger.error('fiscalSaveConfiguration failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalSaveProducts: onCall(async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        const products = Array.isArray(request.data?.products) ? request.data.products : [];
        if (!products.length || products.length > 450) {
          throw new HttpsError('invalid-argument', 'Envie entre 1 e 450 produtos fiscais por operação.');
        }
        const allowedFields = ['productId', 'code', 'description', 'ncm', 'cfop', 'cfopNfe', 'cfopNfce', 'unit', 'origin', 'csosn', 'cst', 'pisCst', 'cofinsCst', 'ipiCst', 'cest', 'cBenef'];
        const batch = db.batch();
        const ids = [];
        products.forEach((entry) => {
          const id = cleanText(entry?.id || entry?.productId);
          if (!id || id.includes('/')) throw new HttpsError('invalid-argument', 'Produto fiscal com identificador inválido.');
          const payload = {};
          allowedFields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(entry || {}, field)) payload[field] = entry[field];
          });
          payload.productId = cleanText(payload.productId || id);
          payload.updatedAt = FieldValue.serverTimestamp();
          payload.updatedByUid = uid;
          batch.set(db.collection('lojas').doc(lojaId).collection('fiscalProducts').doc(id), payload, {merge: true});
          ids.push(id);
        });
        await batch.commit();
        await auditFiscalAction({uid, lojaId, requester, action: 'fiscal_products_updated', details: {count: ids.length, ids}});
        return {ok: true, count: ids.length};
      } catch (error) {
        logger.error('fiscalSaveProducts failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalDeleteProduct: onCall(async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        const productId = cleanText(request.data?.productId);
        if (!productId || productId.includes('/')) throw new HttpsError('invalid-argument', 'productId obrigatório.');
        const ref = db.collection('lojas').doc(lojaId).collection('fiscalProducts').doc(productId);
        const snap = await ref.get();
        if (!snap.exists) throw new HttpsError('not-found', 'Produto fiscal não encontrado.');
        const product = snap.data() || {};
        await ref.delete();
        await auditFiscalAction({
          uid,
          lojaId,
          requester,
          action: 'fiscal_product_deleted',
          documentId: productId,
          before: {productId, code: product.code || null, description: product.description || null, ncm: product.ncm || null},
        });
        return {ok: true};
      } catch (error) {
        logger.error('fiscalDeleteProduct failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalUpdatePreInvoiceOrder: onCall(async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        const orderId = cleanText(request.data?.orderId);
        const input = request.data?.order || {};
        if (!orderId || orderId.includes('/')) throw new HttpsError('invalid-argument', 'orderId obrigatório.');
        if (!cleanText(input.clienteNome)) throw new HttpsError('invalid-argument', 'Informe o nome do cliente.');
        if (!Array.isArray(input.itens) || !input.itens.length) throw new HttpsError('invalid-argument', 'Adicione ao menos um produto ao pedido.');
        const invalidItem = input.itens.find((item) => !cleanText(item?.produtoId || item?.productId || item?.id)
          || !cleanText(item?.nome || item?.description)
          || Number(item?.quantity || item?.quantidade || 0) <= 0
          || Number(item?.preco ?? item?.unitPrice ?? -1) < 0);
        if (invalidItem) throw new HttpsError('invalid-argument', 'Revise os produtos e valores do pedido.');

        const ref = db.collection('lojas').doc(lojaId).collection('pedidos').doc(orderId);
        const [snap, invoiceSnaps] = await Promise.all([
          ref.get(),
          db.collection('lojas').doc(lojaId).collection('invoices').where('orderId', '==', orderId).get(),
        ]);
        if (!snap.exists) throw new HttpsError('not-found', 'Pedido não encontrado.');
        const previous = snap.data() || {};
        const lockedInvoice = invoiceSnaps.docs.map((item) => item.data() || {}).find((invoice) => (
          [INVOICE_STATUS.AUTHORIZED, INVOICE_STATUS.CANCELLED, INVOICE_STATUS.VALIDATING, INVOICE_STATUS.PENDING_RETURN].includes(invoice.status)
          || isDuplicateInvoiceRecord(invoice)
        ));
        if (lockedInvoice) throw new HttpsError('failed-precondition', 'Este pedido possui nota fiscal que impede alterações antes da emissão.');

        const allowedFields = ['clienteId', 'clienteNome', 'telefone', 'clienteEndereco', 'formaPagamento', 'observacao', 'additionalInfo', 'itens', 'subtotal', 'desconto', 'valorFrete', 'frete', 'total', 'cupom'];
        const payload = {};
        allowedFields.forEach((field) => {
          if (Object.prototype.hasOwnProperty.call(input, field)) payload[field] = input[field];
        });
        payload.updatedAt = FieldValue.serverTimestamp();
        payload.updatedByUid = uid;
        await ref.set(payload, {merge: true});
        await auditFiscalAction({
          uid,
          lojaId,
          requester,
          action: 'fiscal_pre_invoice_order_updated',
          documentId: orderId,
          before: {clienteNome: previous.clienteNome || null, itemCount: previous.itens?.length || 0, total: previous.total || 0},
          after: {clienteNome: payload.clienteNome || null, itemCount: payload.itens?.length || 0, total: payload.total || 0},
        });
        return {ok: true};
      } catch (error) {
        logger.error('fiscalUpdatePreInvoiceOrder failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalValidateOrder: onCall(async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        if (![55, 65].includes(Number(request.data?.modelOverride))) throw new HttpsError('invalid-argument', 'Selecione explicitamente NF-e ou NFC-e.');
        const orderId = String(request.data?.orderId || '').trim();
        if (!orderId) throw new HttpsError('invalid-argument', 'orderId obrigatório.');
        const prepared = await buildPreparedPayload({
          lojaId,
          orderId,
          modelOverride: request.data?.modelOverride,
          uid,
          operationCfop: request.data?.operationCfop,
        });
        const environment = prepared.settings.environment || 'homologation';
        const nextNumber = await previewNextNumber(lojaId, environment, prepared.model, prepared.series);
        const payload = {
          ...prepared.payload,
          invoice: {...prepared.payload.invoice, number: nextNumber},
        };
        const serviceConfig = await loadPlatformServiceConfig();

        const readinessErrors = [
          ...(serviceConfig.serviceUrl ? [] : ['Serviço fiscal não configurado.']),
          ...(prepared.certificate.ready ? [] : ['Certificado A1 da loja não configurado.']),
          ...(prepared.model === 65 && (!prepared.certificate.nfceCscSecretVersion || !prepared.certificate.nfceCscIdSecretVersion) ? ['CSC e ID CSC da NFC-e não configurados.'] : []),
        ];
        if (!prepared.errors.length && !readinessErrors.length) {
          try { await checkedPreviewNumber(lojaId, {environment, model: prepared.model, series: prepared.series, issuerCnpj: prepared.payload.issuer.cnpj}); }
          catch (error) { readinessErrors.push(error.message); }
        }
        const localResult = {
          ok: prepared.errors.length === 0 && readinessErrors.length === 0,
          errors: [...prepared.errors, ...readinessErrors],
          itemIssues: collectFiscalItemIssues(payload),
          warnings: [],
          model: prepared.model,
          series: prepared.series,
          number: nextNumber,
          operationCfop: payload.invoice.operationCfop,
          payment: {
            methodCode: payload.invoice.payment.methodCode,
            source: payload.invoice.payment.source,
            fallbackUsed: payload.invoice.payment.fallbackUsed,
            originalMethod: payload.invoice.payment.originalMethod || null,
            selectionRule: payload.invoice.payment.selectionRule,
          },
          totals: payload.totals,
          preview: {
            model: prepared.model, series: prepared.series, nextNumber, environment,
            issuer: {legalName: payload.issuer.legalName, cnpj: payload.issuer.cnpj},
            customer: payload.customer, items: payload.items, totals: payload.totals,
            additionalInfo: payload.additionalInfo,
          },
        };

        const providerCheck = localResult.ok ? await callFiscalService('/validate', payload, serviceConfig) : null;
        const validationResult = providerCheck ? {
          ...localResult, ok: providerCheck.ok === true,
          errors: [...localResult.errors, ...(Array.isArray(providerCheck.errors) ? providerCheck.errors : [])],
          warnings: Array.isArray(providerCheck.warnings) ? providerCheck.warnings : [],
        } : localResult;
        await auditFiscalAction({
          uid,
          lojaId,
          requester,
          action: 'fiscal_order_validated',
          documentId: orderId,
          result: validationResult.ok === false ? 'validation_failed' : 'success',
          details: {model: prepared.model, series: prepared.series, number: nextNumber, errorCount: validationResult.errors?.length || 0},
        });
        return validationResult;
      } catch (error) {
        logger.error('fiscalValidateOrder failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalUploadCertificate: onCall({timeoutSeconds: 120, memory: '512MiB'}, async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        const certificateBase64 = cleanText(request.data?.certificateBase64).replace(/^data:.*;base64,/, '');
        const password = String(request.data?.password || '');
        const filename = cleanText(request.data?.filename || 'certificado-a1.pfx');
        const csc = cleanText(request.data?.csc);
        const cscId = cleanText(request.data?.cscId);

        if (!certificateBase64) {
          throw new HttpsError('invalid-argument', 'Envie o arquivo do certificado A1 em formato .pfx.');
        }
        if (!password) {
          throw new HttpsError('invalid-argument', 'Informe a senha do certificado A1.');
        }

        const issuer = await loadIssuer(lojaId);
        const metadata = parsePfxCertificate(certificateBase64, password);
        if (!metadata.cnpj) {
          throw new HttpsError(
            'failed-precondition',
            'Não foi possível identificar com segurança o CNPJ titular do certificado A1.'
          );
        }
        if (metadata.cnpj && issuer.cnpj && metadata.cnpj !== issuer.cnpj) {
          throw new HttpsError(
            'failed-precondition',
            `O CNPJ do certificado (${metadata.cnpj}) é diferente do CNPJ do emitente (${issuer.cnpj}).`
          );
        }

        const projectId = getProjectId();
        if (!projectId) {
          throw new HttpsError('failed-precondition', 'Não foi possível identificar o projeto Google Cloud para criar secrets.');
        }

        const safeLojaId = safeSecretIdPart(lojaId);
        const labels = {
          app: 'doceria',
          module: 'fiscal',
          loja: safeLojaId.slice(0, 63),
        };
        const secretIds = {
          certPfx: `fiscal_${safeLojaId}_cert_pfx_base64`,
          certPassword: `fiscal_${safeLojaId}_cert_password`,
          nfceCsc: `fiscal_${safeLojaId}_nfce_csc`,
          nfceCscId: `fiscal_${safeLojaId}_nfce_csc_id`,
        };

        await Promise.all([
          ensureSecret(projectId, secretIds.certPfx, labels),
          ensureSecret(projectId, secretIds.certPassword, labels),
          csc ? ensureSecret(projectId, secretIds.nfceCsc, labels) : Promise.resolve(),
          cscId ? ensureSecret(projectId, secretIds.nfceCscId, labels) : Promise.resolve(),
        ]);

        const previousSnap = await db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('certificate').get();
        const previous = previousSnap.exists ? previousSnap.data() || {} : {};
        const [certPfxSecretVersion, certPasswordSecretVersion, nfceCscSecretVersion, nfceCscIdSecretVersion] = await Promise.all([
          addSecretVersion(projectId, secretIds.certPfx, certificateBase64),
          addSecretVersion(projectId, secretIds.certPassword, password),
          csc ? addSecretVersion(projectId, secretIds.nfceCsc, csc) : Promise.resolve(previous.nfceCscSecretVersion || null),
          cscId ? addSecretVersion(projectId, secretIds.nfceCscId, cscId) : Promise.resolve(previous.nfceCscIdSecretVersion || null),
        ]);

        const certificate = {
          status: 'active',
          filename,
          cnpj: metadata.cnpj || issuer.cnpj,
          subject: metadata.subject,
          commonName: metadata.commonName,
          validFrom: metadata.validFrom,
          validUntil: metadata.validUntil,
          certPfxSecretName: secretResourceName(projectId, secretIds.certPfx),
          certPfxSecretVersion,
          certPasswordSecretName: secretResourceName(projectId, secretIds.certPassword),
          certPasswordSecretVersion,
          nfceCscSecretName: nfceCscSecretVersion ? secretResourceName(projectId, secretIds.nfceCsc) : previous.nfceCscSecretName || null,
          nfceCscSecretVersion,
          nfceCscIdSecretName: nfceCscIdSecretVersion ? secretResourceName(projectId, secretIds.nfceCscId) : previous.nfceCscIdSecretName || null,
          nfceCscIdSecretVersion,
          uploadedByUid: uid,
          uploadedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        await db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('certificate').set(certificate, {merge: true});
        await db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('settings').set({
          certificateReady: true,
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});

        const publicCertificate = publicCertificateInfo({
          ...certificate,
          uploadedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        await auditFiscalAction({
          uid,
          lojaId,
          requester,
          action: previousSnap.exists ? 'fiscal_certificate_replaced' : 'fiscal_certificate_added',
          documentId: 'certificate',
          before: publicCertificateInfo(previous),
          after: publicCertificate,
        });

        return {
          ok: true,
          certificate: publicCertificate,
        };
      } catch (error) {
        logger.error('fiscalUploadCertificate failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalIssueInvoice: onCall({timeoutSeconds: 540, memory: '1GiB'}, async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        if (![55, 65].includes(Number(request.data?.modelOverride))) throw new HttpsError('invalid-argument', 'Selecione explicitamente NF-e ou NFC-e.');
        const orderId = String(request.data?.orderId || '').trim();
        if (!orderId) throw new HttpsError('invalid-argument', 'orderId obrigatório.');

        const prepared = await buildPreparedPayload({
          lojaId,
          orderId,
          modelOverride: request.data?.modelOverride,
          uid,
          additionalInfo: request.data?.additionalInfo,
          operationCfop: request.data?.operationCfop,
        });
        if (prepared.errors.length) {
          throw new HttpsError('failed-precondition', prepared.errors.join(' '));
        }
        const serviceConfig = await loadPlatformServiceConfig();
        if (!serviceConfig.serviceUrl) {
          throw new HttpsError('failed-precondition', 'A URL central do serviço fiscal ainda não foi configurada pelo administrador da plataforma.');
        }
        if (!prepared.certificate.ready) {
          throw new HttpsError('failed-precondition', 'Faça upload do certificado digital A1 da loja antes de emitir notas.');
        }
        if (prepared.model === 65 && (!prepared.certificate.nfceCscSecretVersion || !prepared.certificate.nfceCscIdSecretVersion)) {
          throw new HttpsError('failed-precondition', 'Cadastre o CSC e o ID CSC da NFC-e junto com o certificado para emitir NFC-e.');
        }

        const previewNumber = await previewNextNumber(lojaId, prepared.settings.environment || 'homologation', prepared.model, prepared.series);
        const providerCheck = await callFiscalService('/validate', {
          ...prepared.payload, invoice: {...prepared.payload.invoice, number: previewNumber},
        }, serviceConfig);
        if (providerCheck.ok !== true) throw new HttpsError('failed-precondition', (providerCheck.errors || []).join(' ') || 'Validação fiscal não aprovada.');
        const environment = prepared.settings.environment || 'homologation';
        await assertCanIssueOrderInvoice({
          lojaId,
          orderId,
          environment,
          model: prepared.model,
          series: prepared.series,
        });
        {
          const reservation = await reserveInvoice({
            lojaId,
            orderId,
            environment,
            model: prepared.model,
            series: prepared.series,
            issuerCnpj: prepared.payload.issuer.cnpj,
            uid,
            justification: request.data?.justification,
            additionalInfo: prepared.payload.additionalInfo,
            operationCfop: prepared.payload.invoice.operationCfop,
            paymentResolution: prepared.paymentResolution,
          });
          if (reservation.repeated) return reservation.response;
          const payload = {
            ...prepared.payload,
            invoiceId: reservation.invoiceId,
            invoice: {...prepared.payload.invoice, number: reservation.number},
          };

          try {
            const issueResult = await callFiscalService('/issue', payload, serviceConfig);
            const result = await consultDuplicateIfNeeded({payload, result: issueResult, serviceConfig});
            const issued = await updateInvoiceAfterIssue({
              lojaId,
              invoiceId: reservation.invoiceId,
              orderId,
              uid,
              result,
            });
            await auditFiscalAction({
              uid,
              lojaId,
              requester,
              action: 'fiscal_invoice_issued',
              documentId: reservation.invoiceId,
              result: issued.status || result.status || 'success',
              details: {orderId, model: prepared.model, series: prepared.series, number: reservation.number, key: issued.key || result.key || null},
            });
            return issued;
          } catch (error) {
            const statusAfterError = error?.fiscalServiceResponded ? INVOICE_STATUS.REJECTED : INVOICE_STATUS.PENDING_RETURN;
            const messageAfterError = statusAfterError === INVOICE_STATUS.PENDING_RETURN
              ? 'Falha sem retorno conclusivo; consulte a SEFAZ antes de reemitir.'
              : (error?.message || 'Falha antes do envio para a SEFAZ.');
            await db.runTransaction(async (transaction) => {
              transaction.set(db.collection('lojas').doc(lojaId).collection('invoices').doc(reservation.invoiceId), {
                status: statusAfterError,
                error: error?.message || String(error),
                updatedAt: FieldValue.serverTimestamp(),
                history: FieldValue.arrayUnion({
                  status: statusAfterError,
                  at: admin.firestore.Timestamp.now(),
                  by: uid,
                  message: messageAfterError,
                }),
              }, {merge: true});
              if (statusAfterError !== INVOICE_STATUS.PENDING_RETURN) {
                transaction.update(db.collection('lojas').doc(lojaId).collection('pedidos').doc(orderId), {
                  'fiscal.invoiceInProgressId': FieldValue.delete(),
                  updatedAt: FieldValue.serverTimestamp(),
                });
              }
            });
            throw error;
          }
        }
      } catch (error) {
        logger.error('fiscalIssueInvoice failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalIssueManualInvoice: onCall(async (request) => {
      try {
        await requireCallableContext(request);
        throw new HttpsError('failed-precondition', 'Salve um rascunho, cheque os requisitos e confirme a emissão para transmitir a nota manual.');
      } catch (error) {
        throw normalizeHttpsError(error);
      }
    }),

    fiscalCancelInvoice: onCall({timeoutSeconds: 180, memory: '512MiB'}, async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        const invoiceId = String(request.data?.invoiceId || '').trim();
        const reason = String(request.data?.reason || '').trim();
        if (!invoiceId) throw new HttpsError('invalid-argument', 'invoiceId obrigatório.');
        if (reason.length < 15) {
          throw new HttpsError('invalid-argument', 'A justificativa de cancelamento precisa ter ao menos 15 caracteres.');
        }
        if (reason.length > 255) {
          throw new HttpsError('invalid-argument', 'A justificativa de cancelamento deve ter no máximo 255 caracteres.');
        }

        const invoiceRef = db.collection('lojas').doc(lojaId).collection('invoices').doc(invoiceId);
        const invoiceSnap = await invoiceRef.get();
        if (!invoiceSnap.exists) throw new HttpsError('not-found', 'Nota não encontrada.');
        const invoice = invoiceSnap.data() || {};
        if (invoice.status !== INVOICE_STATUS.AUTHORIZED) {
          throw new HttpsError('failed-precondition', 'Somente notas autorizadas podem ser canceladas.');
        }
        const [settings, issuer] = await Promise.all([
          loadSettings(lojaId),
          loadIssuer(lojaId),
        ]);
        const serviceConfig = await loadPlatformServiceConfig();
        if (!serviceConfig.serviceUrl) {
          throw new HttpsError('failed-precondition', 'A URL central do serviço fiscal ainda não foi configurada pelo administrador da plataforma.');
        }
        const certificate = await loadCertificate(lojaId);
        if (!certificate.ready) {
          throw new HttpsError('failed-precondition', 'Faça upload do certificado digital A1 da loja antes de cancelar notas.');
        }

        const lockedInvoice = await db.runTransaction(async (transaction) => {
          const latest = await transaction.get(invoiceRef);
          const current = latest.data() || {};
          if (current.status !== INVOICE_STATUS.AUTHORIZED || ['processing', 'pending_return'].includes(current.cancelRequestStatus)) {
            throw new HttpsError('failed-precondition', 'Cancelamento já iniciado ou nota não autorizada.');
          }
          transaction.set(invoiceRef, {
            cancelRequestStatus: 'processing',
            cancelReason: reason,
            cancelRequestedByUid: uid,
            cancelRequestedAt: FieldValue.serverTimestamp(),
            history: FieldValue.arrayUnion({status: 'cancel_processing', at: admin.firestore.Timestamp.now(), by: uid, message: 'Evento fiscal de cancelamento iniciado.'}),
          }, {merge: true});
          return current;
        });
        let result;
        try {
          result = await callFiscalService('/cancel', {
          invoiceId,
          model: lockedInvoice.model,
          key: lockedInvoice.key,
          protocol: lockedInvoice.protocol,
          reason,
          environment: environmentCode(settings.environment),
          issuer,
          fiscalSecrets: certificate.fiscalSecrets,
          }, serviceConfig);
        } catch (error) {
          await invoiceRef.set({
            cancelRequestStatus: 'pending_return',
            cancelError: error?.message || String(error),
            updatedAt: FieldValue.serverTimestamp(),
            history: FieldValue.arrayUnion({status: 'cancel_pending_return', at: admin.firestore.Timestamp.now(), by: uid, message: 'Retorno do cancelamento inconclusivo; consulte antes de repetir.'}),
          }, {merge: true});
          throw error;
        }

        const cancellationAccepted = result.status === INVOICE_STATUS.CANCELLED;
        const invoiceStatus = cancellationAccepted ? INVOICE_STATUS.CANCELLED : INVOICE_STATUS.AUTHORIZED;
        let cancelArtifact = null;
        if (result.cancelXml) {
          try {
            cancelArtifact = await saveInvoiceArtifact({lojaId, invoiceId, filename: 'cancel-response.xml', contentType: 'application/xml', content: result.cancelXml});
          } catch (artifactError) {
            logger.error('cancel response artifact failed', artifactError);
          }
        }
        await invoiceRef.set({
          status: invoiceStatus,
          cancelReason: reason,
          cancelRequestedByUid: uid,
          cancelRequestStatus: result.status || INVOICE_STATUS.REJECTED,
          cancelCStat: result.cStat || null,
          cancelMotivo: result.xMotivo || null,
          cancelProtocol: result.cancelProtocol || null,
          cancelledAt: cancellationAccepted ? (result.cancelledAt || FieldValue.serverTimestamp()) : null,
          cancelResponse: {status: result.status || null, cStat: result.cStat || null, xMotivo: result.xMotivo || null, protocol: result.cancelProtocol || null},
          cancelArtifact,
          updatedAt: FieldValue.serverTimestamp(),
          history: FieldValue.arrayUnion({
            status: cancellationAccepted ? INVOICE_STATUS.CANCELLED : 'cancel_rejected',
            at: admin.firestore.Timestamp.now(),
            by: uid,
            message: result.xMotivo || 'Cancelamento solicitado.',
          }),
        }, {merge: true});

        await auditFiscalAction({
          uid,
          lojaId,
          requester,
          action: 'fiscal_invoice_cancelled',
          documentId: invoiceId,
          before: {status: invoice.status, number: invoice.number || null, series: invoice.series || null, key: invoice.key || null},
          after: {status: invoiceStatus, cancellationAccepted, cStat: result.cStat || null},
          result: cancellationAccepted ? 'success' : 'rejected',
        });

        return {...result, status: invoiceStatus, cancellationAccepted};
      } catch (error) {
        logger.error('fiscalCancelInvoice failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalRefreshInvoice: onCall({timeoutSeconds: 240, memory: '1GiB'}, async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        const invoiceId = String(request.data?.invoiceId || '').trim();
        if (!invoiceId) throw new HttpsError('invalid-argument', 'invoiceId obrigatório.');

        const invoiceRef = db.collection('lojas').doc(lojaId).collection('invoices').doc(invoiceId);
        const invoiceSnap = await invoiceRef.get();
        if (!invoiceSnap.exists) throw new HttpsError('not-found', 'Nota não encontrada.');
        const invoice = invoiceSnap.data() || {};
        const shouldConsultDuplicate = invoice.status === INVOICE_STATUS.REJECTED && isDuplicateInvoiceRecord(invoice);
        const shouldConsultRejected = invoice.status === INVOICE_STATUS.REJECTED && Boolean(invoice.key);
        if (invoice.status !== INVOICE_STATUS.PENDING_RETURN && !shouldConsultDuplicate && !shouldConsultRejected) {
          return {id: invoiceSnap.id, ...invoice};
        }
        if (invoice.status === INVOICE_STATUS.PENDING_RETURN && !invoice.receipt) {
          throw new HttpsError(
            'failed-precondition',
            'Esta emissão pendente não tem recibo da SEFAZ. Como a falha aconteceu antes do envio, emita novamente.'
          );
        }

        const signedXml = (await loadInvoiceArtifact(invoice.artifacts?.signedXml)).toString('utf8');
        const [settings, issuer, certificate, serviceConfig] = await Promise.all([
          loadSettings(lojaId),
          loadIssuer(lojaId),
          loadCertificate(lojaId),
          loadPlatformServiceConfig(),
        ]);
        const consultPayload = {
          invoiceId,
          invoice: {
            model: Number(invoice.model || 0),
            series: Number(invoice.series || 0),
            number: Number(invoice.number || 0),
          },
          environment: environmentCode(invoice.environment || settings.environment || 'homologation'),
          issuer,
          fiscalSecrets: certificate.fiscalSecrets,
          key: invoice.key || null,
          signedXml,
        };
        const result = invoice.status === INVOICE_STATUS.PENDING_RETURN
          ? await callFiscalService('/receipt', {...consultPayload, receipt: invoice.receipt}, serviceConfig)
          : await callFiscalService('/consult', consultPayload, serviceConfig);
        if (invoice.status === INVOICE_STATUS.REJECTED && result.status !== INVOICE_STATUS.AUTHORIZED && result.status !== INVOICE_STATUS.CANCELLED) {
          const consultation = {cStat: result.cStat ?? null, xMotivo: fiscalResultReason(result, result.status),
            status: result.status || null, at: admin.firestore.Timestamp.now(), by: uid};
          await db.collection('lojas').doc(lojaId).collection('invoices').doc(invoiceId).set({
            lastConsultation: consultation,
            history: FieldValue.arrayUnion({...consultation, status: invoice.status, action: 'consultation'}),
          }, {merge: true});
          await auditFiscalAction({uid, lojaId, requester, action: 'fiscal_invoice_refreshed', documentId: invoiceId,
            before: {status: invoice.status, cStat: invoice.cStat ?? null},
            after: {status: invoice.status, consultationCStat: consultation.cStat}});
          return {id: invoiceId, ...invoice, lastConsultation: consultation};
        }
        const refreshed = await updateInvoiceAfterIssue({
          lojaId,
          invoiceId,
          orderId: invoice.orderId || null,
          uid,
          result,
        });
        await auditFiscalAction({
          uid,
          lojaId,
          requester,
          action: 'fiscal_invoice_refreshed',
          documentId: invoiceId,
          before: {status: invoice.status, number: invoice.number || null, series: invoice.series || null},
          after: {status: refreshed.status || result.status || null, key: refreshed.key || result.key || null},
        });
        return refreshed;
      } catch (error) {
        logger.error('fiscalRefreshInvoice failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalGetInvoice: onCall(async (request) => {
      try {
        const {lojaId} = await requireReadContext(request);
        const invoiceId = String(request.data?.invoiceId || '').trim();
        if (!invoiceId) throw new HttpsError('invalid-argument', 'invoiceId obrigatório.');
        const snap = await db.collection('lojas').doc(lojaId).collection('invoices').doc(invoiceId).get();
        if (!snap.exists) throw new HttpsError('not-found', 'Nota não encontrada.');
        return {id: snap.id, ...snap.data()};
      } catch (error) {
        logger.error('fiscalGetInvoice failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalGetInvoiceArtifact: onCall({timeoutSeconds: 120, memory: '512MiB'}, async (request) => {
      try {
        const {lojaId} = await requireReadContext(request);
        const invoiceId = String(request.data?.invoiceId || '').trim();
        const type = String(request.data?.type || 'danfePdf').trim();
        const artifactKey = {
          danfePdf: 'danfePdf',
          authorizedXml: 'authorizedXml',
          signedXml: 'signedXml',
        }[type];
        if (!invoiceId) throw new HttpsError('invalid-argument', 'invoiceId obrigatório.');
        if (!artifactKey) throw new HttpsError('invalid-argument', 'Tipo de arquivo fiscal inválido.');

        const snap = await db.collection('lojas').doc(lojaId).collection('invoices').doc(invoiceId).get();
        if (!snap.exists) throw new HttpsError('not-found', 'Nota não encontrada.');
        const invoice = snap.data() || {};
        const artifact = invoice.artifacts?.[artifactKey];
        const buffer = await loadInvoiceArtifact(artifact);
        const extension = artifactKey === 'danfePdf' ? 'pdf' : 'xml';
        const filename = `nota-fiscal-${invoice.model || 'nfe'}-${invoice.series || 's'}-${invoice.number || snap.id}.${extension}`;

        return {
          filename,
          contentType: artifact.contentType || (artifactKey === 'danfePdf' ? 'application/pdf' : 'application/xml'),
          base64: buffer.toString('base64'),
        };
      } catch (error) {
        logger.error('fiscalGetInvoiceArtifact failed', error);
        throw normalizeHttpsError(error);
      }
    }),
  };
};

module.exports = {createFiscalFunctions};
