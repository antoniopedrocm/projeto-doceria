const {GoogleAuth} = require('google-auth-library');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const forge = require('node-forge');
const {isValidFiscalDocument} = require('./fiscal-core');

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
const counterId = (environment, model, series) => `${environment}_${model}_${series}`;

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

const callFiscalService = async (path, body) => {
  const {serviceUrl, sharedSecret} = getServiceConfig();
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

    const requester = await verifyManagementAccess(uid);
    const profileSnap = await db.collection('users').doc(uid).get();
    const profile = profileSnap.data() || {};
    if (profile.permissions?.['nota-fiscal'] === false || profile.customPermissions?.['nota-fiscal'] === false) {
      throw new HttpsError('permission-denied', 'O módulo Nota Fiscal não está habilitado para este usuário.');
    }
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
    await requireStoreAccess(uid, lojaId);
    return {uid, lojaId};
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
      nfeSeries: Number(settings.nfeSeries || 1),
      nfceSeries: Number(settings.nfceSeries || 1),
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
            origin: fiscal.origin === undefined && fiscal.origem === undefined ? null : Number(fiscal.origin ?? fiscal.origem),
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

  const buildManualPreparedPayload = async ({lojaId, manualInvoice, modelOverride, number = 1, invoiceId, uid, additionalInfo, operationCfop}) => {
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
          cfop: selectedOperationCfop,
          cfopNfe: selectedOperationCfop,
          cfopNfce: selectedOperationCfop,
          unit: item.unit || item.unidade || item.fiscal?.unit || item.fiscal?.unidade || '',
          origin: item.origin === '' ? null : (item.origin === undefined && item.origem === undefined && item.fiscal?.origin === undefined && item.fiscal?.origem === undefined ? null : Number(item.origin ?? item.origem ?? item.fiscal?.origin ?? item.fiscal?.origem)),
          csosn: cleanText(item.csosn || item.fiscal?.csosn),
          cst: cleanText(item.cst || item.fiscal?.cst || ''),
          pisCst: cleanText(item.pisCst || item.fiscal?.pisCst),
          cofinsCst: cleanText(item.cofinsCst || item.fiscal?.cofinsCst),
          cBenef: cleanText(item.cBenef || item.fiscal?.cBenef || ''),
        },
        manualSource: item.source === 'catalog' ? 'catalog' : 'manual',
      };
    });

    const fiscalItems = await Promise.all(normalizedItems.map((item) => loadFiscalProduct(lojaId, item)));
    const productTotal = money(normalizedItems.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1), 0));
    const orderDiscount = money(normalizedItems.reduce((sum, item) => sum + Number(item.discount || 0), 0));
    const invoiceTotal = money(productTotal - orderDiscount);
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
        const quantity = Number(item.quantity || 1);
        const unitPrice = money(item.unitPrice || 0);
        const discount = money(item.discount || 0);
        return {
          productId: item.productId || null,
          source: item.manualSource,
          code: String(fiscal.code || item.code || index + 1),
          description: fiscal.description || item.description || `Item ${index + 1}`,
          ncm: onlyDigits(fiscal.ncm),
          cfop: selectedOperationCfop,
          unit: fiscal.unit || fiscal.unidade || '',
          quantity,
          unitPrice,
          total: money(quantity * unitPrice),
          discount,
          tax: {
            origin: fiscal.origin === undefined && fiscal.origem === undefined ? null : Number(fiscal.origin ?? fiscal.origem),
            csosn: fiscal.csosn || '',
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
        freight: 0,
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
      settings,
      certificate,
      model,
      series,
      paymentResolution,
      manualInvoice,
      errors: [...manualInputErrors, ...validatePreparedPayload(payload)],
    };
  };

  const reserveInvoice = async ({lojaId, orderId, environment, model, series, uid, justification, additionalInfo, operationCfop, paymentResolution}) => {
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
      if (order.fiscal?.authorizedInvoiceId) {
        throw new HttpsError('already-exists', 'Pedido já tem nota autorizada.');
      }
      if (order.fiscal?.invoiceInProgressId) {
        throw new HttpsError('aborted', 'Pedido já tem emissão em andamento.');
      }

      const nextNumber = Number(counterSnap.get('nextNumber') || 1);
      transaction.set(counterRef, {
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

  const updateInvoiceAfterIssue = async ({lojaId, invoiceId, orderId, uid, result}) => {
    const invoiceRef = db.collection('lojas').doc(lojaId).collection('invoices').doc(invoiceId);
    const orderRef = orderId ? db.collection('lojas').doc(lojaId).collection('pedidos').doc(orderId) : null;
    const status = result.status || INVOICE_STATUS.REJECTED;
    const resultReason = fiscalResultReason(result, status);
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
          message: resultReason || 'Retorno recebido do serviço fiscal.',
        }),
      }, {merge: true});

      if (!orderRef) {
        return;
      }

      if (status === INVOICE_STATUS.AUTHORIZED) {
        transaction.update(orderRef, {
          'fiscal.authorizedInvoiceId': invoiceId,
          'fiscal.invoiceInProgressId': FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if ([INVOICE_STATUS.REJECTED, INVOICE_STATUS.DENIED].includes(status)) {
        transaction.update(orderRef, {
          'fiscal.invoiceInProgressId': FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    return callableFiscalResult({result, invoiceId, artifacts, artifactError});
  };

  const previewNextNumber = async (lojaId, environment, model, series) => {
    const counterSnap = await db.collection('lojas').doc(lojaId).collection('fiscalCounters').doc(counterId(environment, model, series)).get();
    return Number(counterSnap.get('nextNumber') || 1);
  };

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
          operationCfop: draft.manualInvoice?.operationCfop});
      errors.push(...prepared.errors);
    } catch (error) {
      errors.push(error?.message || 'Não foi possível preparar a nota.');
    }
    if (!prepared) return {ok: false, errors, warnings: [], preview: null};
    if (!getServiceConfig(prepared.settings).serviceUrl) errors.push('Serviço fiscal não configurado.');
    if (!prepared.certificate.ready) errors.push('Certificado A1 da loja não configurado.');
    if (prepared.model === 65 && (!prepared.certificate.nfceCscSecretVersion || !prepared.certificate.nfceCscIdSecretVersion)) {
      errors.push('CSC e ID CSC da NFC-e não configurados.');
    }
    const environment = prepared.settings.environment || 'homologation';
    const number = await previewNextNumber(lojaId, environment, prepared.model, prepared.series);
    const payload = {...prepared.payload, invoice: {...prepared.payload.invoice, number}};
    let warnings = [];
    if (!errors.length) {
      try {
        const result = await callFiscalService('/validate', payload, prepared.settings);
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

  return {
    fiscalSaveDraft: onCall(async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const selectedModel = Number(request.data?.model);
        const model = [55, 65].includes(selectedModel) ? selectedModel : null;
        const manualInvoice = request.data?.manualInvoice;
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
          const version = Number(current.version || 0) + 1;
          const customer = manualInvoice.customer || {};
          transaction.set(ref, {
            lojaId,
            origin: 'manual',
            manualInvoice: JSON.parse(serialized),
            model,
            status: INVOICE_STATUS.DRAFT,
            version,
            number: null,
            customerName: trimText(customer.name),
            customerDocument: onlyDigits(customer.document),
            total: money((manualInvoice.items || []).reduce((sum, item) => {
              const quantity = Number(item.quantity);
              const unitPrice = Number(item.unitPrice);
              const discount = Number(item.discount || 0);
              return sum + (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0) - (Number.isFinite(discount) ? discount : 0);
            }, 0)),
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
        if (draft.status !== INVOICE_STATUS.DRAFT) return {invoiceId: draftId, status: draft.status, xMotivo: 'Esta nota já iniciou a emissão.'};
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
          const number = Number(counter.get('nextNumber') || 1);
          transaction.set(counterRef, {environment, model: prepared.model, series: prepared.series, nextNumber: number + 1, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
          transaction.set(ref, {
            status: INVOICE_STATUS.VALIDATING,
            environment,
            series: prepared.series,
            number,
            customer: prepared.payload.customer,
            items: prepared.payload.items,
            totals: prepared.payload.totals,
            total: prepared.payload.totals.invoice,
            operationCfop: prepared.payload.invoice.operationCfop,
            additionalInfo: prepared.payload.additionalInfo,
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
          const result = await callFiscalService('/issue', payload, prepared.settings);
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
        const [settings, issuer, certificate] = await Promise.all([loadSettings(lojaId), loadIssuer(lojaId), loadCertificate(lojaId)]);
        if (!getServiceConfig(settings).serviceUrl || !certificate.ready) {
          throw new HttpsError('failed-precondition', 'Configure serviço fiscal e certificado antes de inutilizar numeração.');
        }
        const capabilities = await callFiscalService('/capabilities', {}, settings);
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
          }, settings);
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

        return {
          issuer: issuerSnap.exists ? issuerSnap.data() || {} : null,
          settings: await loadSettings(lojaId),
          certificate: publicCertificateInfo(certificate),
          platformService: requester.role === 'dono' && requester.allStores ? {
            serviceUrl: getServiceConfig().serviceUrl,
            configured: Boolean(getServiceConfig().serviceUrl),
            source: 'FISCAL_SERVICE_URL',
          } : null,
        };
      } catch (error) {
        logger.error('fiscalGetConfiguration failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalSaveConfiguration: onCall(async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const issuer = request.data?.issuer || {};
        const settings = request.data?.settings || {};
        await Promise.all([
          db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('issuer').set({
            ...issuer,
            taxRegime: Number(issuer.taxRegime || 1),
            updatedAt: FieldValue.serverTimestamp(),
            updatedByUid: uid,
          }, {merge: true}),
          db.collection('lojas').doc(lojaId).collection('fiscalConfig').doc('settings').set({
            environment: cleanText(settings.environment || 'homologation'),
            nfeSeries: Number(settings.nfeSeries || 1),
            nfceSeries: Number(settings.nfceSeries || 1),
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
        ]);
        return {ok: true};
      } catch (error) {
        logger.error('fiscalSaveConfiguration failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalValidateOrder: onCall(async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
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

        const readinessErrors = [
          ...(getServiceConfig(prepared.settings).serviceUrl ? [] : ['Serviço fiscal não configurado.']),
          ...(prepared.certificate.ready ? [] : ['Certificado A1 da loja não configurado.']),
          ...(prepared.model === 65 && (!prepared.certificate.nfceCscSecretVersion || !prepared.certificate.nfceCscIdSecretVersion) ? ['CSC e ID CSC da NFC-e não configurados.'] : []),
        ];
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
            model: prepared.model,
            series: prepared.series,
            nextNumber,
            environment,
            issuer: {legalName: payload.issuer.legalName, cnpj: payload.issuer.cnpj},
            customer: payload.customer,
            items: payload.items,
            totals: payload.totals,
            additionalInfo: payload.additionalInfo,
          },
        };

        if (!localResult.ok) return localResult;
        const providerCheck = await callFiscalService('/validate', payload, prepared.settings);
        return {
          ...localResult,
          ok: providerCheck.ok === true && localResult.ok,
          errors: [...localResult.errors, ...(Array.isArray(providerCheck.errors) ? providerCheck.errors : [])],
          warnings: [...localResult.warnings, ...(Array.isArray(providerCheck.warnings) ? providerCheck.warnings : [])],
        };
      } catch (error) {
        logger.error('fiscalValidateOrder failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalUploadCertificate: onCall({timeoutSeconds: 120, memory: '512MiB'}, async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
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

        return {
          ok: true,
          certificate: publicCertificateInfo({
            ...certificate,
            uploadedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        };
      } catch (error) {
        logger.error('fiscalUploadCertificate failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalIssueInvoice: onCall({timeoutSeconds: 540, memory: '1GiB'}, async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
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
        if (!getServiceConfig(prepared.settings).serviceUrl) {
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
          ...prepared.payload,
          invoice: {...prepared.payload.invoice, number: previewNumber},
        }, prepared.settings);
        if (providerCheck.ok !== true) throw new HttpsError('failed-precondition', (providerCheck.errors || []).join(' ') || 'Validação fiscal não aprovada.');

        const environment = prepared.settings.environment || 'homologation';
        const reservation = await reserveInvoice({
          lojaId,
          orderId,
          environment,
          model: prepared.model,
          series: prepared.series,
          uid,
          justification: request.data?.justification,
          additionalInfo: prepared.payload.additionalInfo,
          operationCfop: prepared.payload.invoice.operationCfop,
          paymentResolution: prepared.paymentResolution,
        });
        const payload = {
          ...prepared.payload,
          invoiceId: reservation.invoiceId,
          invoice: {...prepared.payload.invoice, number: reservation.number},
        };

        try {
          const result = await callFiscalService('/issue', payload, prepared.settings);
          return await updateInvoiceAfterIssue({
            lojaId,
            invoiceId: reservation.invoiceId,
            orderId,
            uid,
            result,
          });
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
        const {uid, lojaId} = await requireCallableContext(request);
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
        if (!getServiceConfig(settings).serviceUrl) {
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
          }, settings);
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

        return {...result, status: invoiceStatus, cancellationAccepted};
      } catch (error) {
        logger.error('fiscalCancelInvoice failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalRefreshInvoice: onCall({timeoutSeconds: 240, memory: '1GiB'}, async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const invoiceId = String(request.data?.invoiceId || '').trim();
        if (!invoiceId) throw new HttpsError('invalid-argument', 'invoiceId obrigatório.');

        const invoiceRef = db.collection('lojas').doc(lojaId).collection('invoices').doc(invoiceId);
        const invoiceSnap = await invoiceRef.get();
        if (!invoiceSnap.exists) throw new HttpsError('not-found', 'Nota não encontrada.');
        const invoice = invoiceSnap.data() || {};
        if (invoice.status !== INVOICE_STATUS.PENDING_RETURN) {
          return {id: invoiceSnap.id, ...invoice};
        }
        if (!invoice.receipt) {
          throw new HttpsError(
            'failed-precondition',
            'Esta emissão pendente não tem recibo da SEFAZ. Consulte a situação fiscal antes de qualquer nova emissão.'
          );
        }

        const signedXml = (await loadInvoiceArtifact(invoice.artifacts?.signedXml)).toString('utf8');
        const prepared = invoice.manualInvoice && invoice.origin === 'manual'
          ? await buildManualPreparedPayload({
            lojaId, manualInvoice: invoice.manualInvoice, modelOverride: invoice.model,
            number: invoice.number, invoiceId, uid, additionalInfo: invoice.additionalInfo,
            operationCfop: invoice.operationCfop,
          })
          : await buildPreparedPayload({
            lojaId, orderId: invoice.orderId, modelOverride: invoice.model,
            number: invoice.number, invoiceId, uid, additionalInfo: invoice.additionalInfo,
            operationCfop: invoice.operationCfop,
          });
        const result = await callFiscalService('/receipt', {
          ...prepared.payload,
          receipt: invoice.receipt,
          signedXml,
        }, prepared.settings);
        return await updateInvoiceAfterIssue({
          lojaId,
          invoiceId,
          orderId: invoice.orderId,
          uid,
          result,
        });
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
