const {GoogleAuth} = require('google-auth-library');
const {SecretManagerServiceClient} = require('@google-cloud/secret-manager');
const forge = require('node-forge');
const {canAdministerFiscal, canEditPlatformFiscalService, protectedPlatformFieldsIn} = require('./fiscal-permissions');

const secretManager = new SecretManagerServiceClient();
const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;
const MAX_ADDITIONAL_INFO_LENGTH = 5000;
const DEFAULT_NCM_PRODUCT = '19059090';

const INVOICE_STATUS = {
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
const MAX_DUPLICATE_NUMBER_RETRIES = Math.max(0, Number(process.env.FISCAL_DUPLICATE_NUMBER_RETRIES || 20));

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
  if (!payload.issuer?.stateRegistration) errors.push('Emitente sem inscrição estadual.');
  if (!payload.issuer?.address?.street) errors.push('Emitente sem endereço fiscal.');
  if (!payload.issuer?.address?.district) errors.push('Emitente sem bairro fiscal.');
  if (!payload.issuer?.address?.city) errors.push('Emitente sem município fiscal.');
  if (!payload.issuer?.address?.cityCode) errors.push('Emitente sem código IBGE fiscal.');
  if (!payload.issuer?.address?.state) errors.push('Emitente sem UF fiscal.');
  if (!payload.issuer?.address?.zip) errors.push('Emitente sem CEP fiscal.');
  if (!payload.customer?.document) errors.push('Cliente sem CPF/CNPJ.');
  if (!payload.customer?.address?.street) errors.push('Cliente sem endereço fiscal.');
  if (!payload.customer?.address?.district) errors.push('Cliente sem bairro fiscal.');
  if (!payload.customer?.address?.city) errors.push('Cliente sem município fiscal.');
  if (!payload.customer?.address?.cityCode) errors.push('Cliente sem código IBGE fiscal.');
  if (!payload.customer?.address?.state) errors.push('Cliente sem UF fiscal.');
  if (!payload.customer?.address?.zip) errors.push('Cliente sem CEP fiscal.');
  if (!payload.invoice?.number || payload.invoice.number < 1) errors.push('Número fiscal inválido.');

  payload.items.forEach((item, index) => {
    const label = item.description || `Item ${index + 1}`;
    if (!item.ncm || item.ncm.length !== 8) errors.push(`${label}: informe um NCM válido com 8 dígitos.`);
    if (!item.cfop || item.cfop.length !== 4) errors.push(`${label}: informe um CFOP válido com 4 dígitos.`);
    if (!item.tax?.csosn && !item.tax?.cst) errors.push(`${label}: informe CSOSN/CST.`);
    if (item.discount > item.total) errors.push(`${label}: desconto maior que o total.`);
  });

  const itemDiscounts = money(payload.items.reduce((sum, item) => sum + (item.discount || 0), 0));
  if (itemDiscounts !== payload.totals.discount) {
    errors.push('Total de desconto divergente da soma dos descontos dos itens.');
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
      nfeSeries: Number(settings.nfeSeries || 1),
      nfceSeries: Number(settings.nfceSeries || 1),
      operationNature: cleanText(settings.operationNature),
      defaultPaymentMethodCode: cleanText(settings.defaultPaymentMethodCode),
      defaultPresence: Number(settings.defaultPresence || 2),
    },
  });

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
    const selectedOperationCfop = onlyDigits(operationCfop || '5101');
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
          unit: fiscal.unit || fiscal.unidade || 'un',
          quantity,
          unitPrice,
          total: money(quantity * unitPrice),
          discount: discounts[index] || 0,
          tax: {
            origin: Number(fiscal.origin ?? fiscal.origem ?? 0),
            csosn: fiscal.csosn || '102',
            cst: fiscal.cst || '',
            pisCst: fiscal.pisCst || '49',
            cofinsCst: fiscal.cofinsCst || '49',
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
      name: cleanText(customer.name || customer.nome || customer.razaoSocial || 'Consumidor'),
      document,
      documentType: document ? inferDocumentType(document) : '',
      stateRegistration: onlyDigits(customer.stateRegistration || customer.inscricaoEstadual || ''),
      email: cleanText(customer.email),
      phone: onlyDigits(customer.phone || customer.telefone || ''),
      isFinalConsumer: customer.isFinalConsumer !== false,
      receivesIcmsCredit: Boolean(customer.receivesIcmsCredit || customer.recebeCreditoIcms),
      requiresNfe: Boolean(customer.requiresNfe || customer.requerNfe),
      address,
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
    const selectedOperationCfop = onlyDigits(operationCfop || manualInvoice.operationCfop || '5101');
    if (selectedOperationCfop.length !== 4) {
      throw new HttpsError('invalid-argument', 'Selecione um CFOP válido para a operação fiscal.');
    }

    const rawItems = Array.isArray(manualInvoice.items) ? manualInvoice.items : [];
    if (!rawItems.length) {
      throw new HttpsError('invalid-argument', 'Adicione ao menos um item à nota fiscal manual.');
    }

    const normalizedItems = rawItems.map((item, index) => {
      const quantity = Number(item.quantity || item.quantidade || 1);
      const unitPrice = Number(item.unitPrice ?? item.preco ?? item.valorUnitario ?? 0);
      const discount = Number(item.discount ?? item.desconto ?? 0);
      const description = cleanText(item.description || item.nome || item.produto || '');
      if (!description) {
        throw new HttpsError('invalid-argument', `Informe a descrição do item ${index + 1}.`);
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new HttpsError('invalid-argument', `${description}: informe quantidade maior que zero.`);
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new HttpsError('invalid-argument', `${description}: informe valor unitário igual ou maior que zero.`);
      }
      if (!Number.isFinite(discount) || discount < 0) {
        throw new HttpsError('invalid-argument', `${description}: informe desconto igual ou maior que zero.`);
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
        quantity,
        quantidade: quantity,
        unitPrice,
        preco: unitPrice,
        discount,
        desconto: discount,
        fiscal: {
          ...(item.fiscal || {}),
          ncm: onlyDigits(item.ncm || item.fiscal?.ncm || DEFAULT_NCM_PRODUCT),
          cfop: selectedOperationCfop,
          cfopNfe: selectedOperationCfop,
          cfopNfce: selectedOperationCfop,
          unit: item.unit || item.unidade || item.fiscal?.unit || item.fiscal?.unidade || 'un',
          origin: Number(item.origin ?? item.origem ?? item.fiscal?.origin ?? item.fiscal?.origem ?? 0),
          csosn: cleanText(item.csosn || item.fiscal?.csosn || '102'),
          cst: cleanText(item.cst || item.fiscal?.cst || ''),
          pisCst: cleanText(item.pisCst || item.fiscal?.pisCst || '49'),
          cofinsCst: cleanText(item.cofinsCst || item.fiscal?.cofinsCst || '49'),
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
          unit: fiscal.unit || fiscal.unidade || 'un',
          quantity,
          unitPrice,
          total: money(quantity * unitPrice),
          discount,
          tax: {
            origin: Number(fiscal.origin ?? fiscal.origem ?? 0),
            csosn: fiscal.csosn || '102',
            cst: fiscal.cst || '',
            pisCst: fiscal.pisCst || '49',
            cofinsCst: fiscal.cofinsCst || '49',
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
      errors: validatePreparedPayload(payload),
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
      if (order.fiscal?.lastInvoiceStatus === INVOICE_STATUS.AUTHORIZED) {
        throw new HttpsError('already-exists', 'Pedido já tem nota autorizada.');
      }
      if (order.fiscal?.lastInvoiceStatus === INVOICE_STATUS.PENDING_RETURN) {
        throw new HttpsError('already-exists', 'Pedido já tem emissão pendente. Consulte o retorno da SEFAZ antes de reemitir.');
      }
      if (order.fiscal?.lastInvoiceDuplicate) {
        throw new HttpsError('already-exists', 'Pedido já tem nota rejeitada por duplicidade. Consulte/atualize essa nota antes de tentar emitir outra.');
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

  const reserveManualInvoice = async ({lojaId, environment, model, series, uid, justification, additionalInfo, operationCfop, paymentResolution, prepared}) => {
    const storeRef = db.collection('lojas').doc(lojaId);
    const counterRef = storeRef.collection('fiscalCounters').doc(counterId(environment, model, series));
    const invoiceRef = storeRef.collection('invoices').doc();

    return db.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const nextNumber = Number(counterSnap.get('nextNumber') || 1);
      const payload = prepared.payload || {};
      transaction.set(counterRef, {
        environment,
        model,
        series,
        nextNumber: nextNumber + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.set(invoiceRef, {
        orderId: null,
        origin: 'manual',
        manualInvoice: true,
        lojaId,
        model,
        series,
        number: nextNumber,
        environment,
        status: INVOICE_STATUS.VALIDATING,
        justification: justification || 'Emissão manual avulsa pelo painel Nota Fiscal',
        additionalInfo: additionalInfo || '',
        operationCfop: operationCfop || null,
        customerName: payload.customer?.name || null,
        customerDocument: payload.customer?.document || null,
        customer: payload.customer || null,
        items: (payload.items || []).map((item) => ({
          productId: item.productId || null,
          source: item.source || 'manual',
          code: item.code || '',
          description: item.description || '',
          ncm: item.ncm || '',
          cfop: item.cfop || '',
          unit: item.unit || 'un',
          quantity: item.quantity || 0,
          unitPrice: item.unitPrice || 0,
          total: item.total || 0,
          discount: item.discount || 0,
        })),
        totals: payload.totals || null,
        total: payload.totals?.invoice || 0,
        discount: payload.totals?.discount || 0,
        payment: paymentResolution ? {
          methodCode: paymentResolution.methodCode,
          amount: paymentResolution.amount,
          method: paymentResolution.method || null,
          source: paymentResolution.source,
          fallbackUsed: paymentResolution.fallbackUsed,
          multiplePaymentsDetected: false,
          selectionRule: paymentResolution.selectionRule,
          candidates: [],
        } : null,
        paymentMethodCode: paymentResolution?.methodCode || null,
        paymentMethodSource: paymentResolution?.source || null,
        paymentFallbackUsed: Boolean(paymentResolution?.fallbackUsed),
        stockMovementRequested: Boolean(prepared.manualInvoice?.stockMovementRequested),
        stockMovementApplied: false,
        requestedByUid: uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        history: [{
          status: INVOICE_STATUS.VALIDATING,
          at: admin.firestore.Timestamp.now(),
          by: uid,
          message: 'Nota manual/avulsa criada sem vínculo com pedido e emissão iniciada.',
        }],
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
      return {
        ...consultResult,
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

  const shouldRetryDuplicateNumber = (result = {}) => {
    if (!isDuplicateNfeResult(result)) {
      return false;
    }
    if (result.status && result.status !== INVOICE_STATUS.REJECTED) {
      return false;
    }
    const consultFailureText = [
      result.duplicateConsultError,
      result.duplicateConsultMessage,
      result.detail,
      result.message,
      result.error,
    ].map((value) => cleanText(value)).filter(Boolean).join(' ');
    return Boolean(result.duplicateConsultFailed)
      && /(digest|diferentes objetos|documentos se referem a diferentes objetos|different objects)/i.test(consultFailureText);
  };

  const updateInvoiceAfterIssue = async ({lojaId, invoiceId, orderId, uid, result, orderUpdateMode = 'final', historyMessage = null}) => {
    const invoiceRef = db.collection('lojas').doc(lojaId).collection('invoices').doc(invoiceId);
    const orderRef = orderId ? db.collection('lojas').doc(lojaId).collection('pedidos').doc(orderId) : null;
    const status = result.status || INVOICE_STATUS.REJECTED;
    const resultReason = fiscalResultReason(result, status);
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
        }),
      }, {merge: true});

      if (!orderRef) {
        return;
      }

      if (orderUpdateMode === 'retrying_duplicate_number') {
        transaction.update(orderRef, {
          'fiscal.invoiceInProgressId': FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
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
    return Number(counterSnap.get('nextNumber') || 1);
  };

  return {
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

    fiscalSaveConfiguration: onCall(async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        const issuer = request.data?.issuer || {};
        const settings = request.data?.settings || {};
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

        const localResult = {
          ok: prepared.errors.length === 0,
          errors: prepared.errors,
          itemIssues: collectFiscalItemIssues(payload),
          warnings: [
            ...(serviceConfig.serviceUrl ? [] : ['Serviço fiscal ainda não configurado; validação feita apenas localmente.']),
            ...(prepared.certificate.ready ? [] : ['Certificado A1 da loja ainda não foi enviado.']),
            ...(prepared.model === 65 && (!prepared.certificate.nfceCscSecretVersion || !prepared.certificate.nfceCscIdSecretVersion) ? ['CSC e ID CSC da NFC-e ainda não foram cadastrados.'] : []),
          ],
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
        };

        const validationResult = prepared.errors.length || !serviceConfig.serviceUrl
          ? localResult
          : await callFiscalService('/validate', payload, serviceConfig);
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

        const environment = prepared.settings.environment || 'homologation';
        await assertCanIssueOrderInvoice({
          lojaId,
          orderId,
          environment,
          model: prepared.model,
          series: prepared.series,
        });
        for (let attempt = 0; attempt <= MAX_DUPLICATE_NUMBER_RETRIES; attempt += 1) {
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
            const issueResult = await callFiscalService('/issue', payload, serviceConfig);
            const result = await consultDuplicateIfNeeded({payload, result: issueResult, serviceConfig});
            if (shouldRetryDuplicateNumber(result) && attempt < MAX_DUPLICATE_NUMBER_RETRIES) {
              const reason = fiscalResultReason(result, INVOICE_STATUS.REJECTED) || 'Rejeição por duplicidade de NF-e.';
              logger.warn('fiscal duplicate number collision; retrying with next number', {
                lojaId,
                orderId,
                model: prepared.model,
                series: prepared.series,
                number: reservation.number,
                attempt: attempt + 1,
                maxAttempts: MAX_DUPLICATE_NUMBER_RETRIES + 1,
                cStat: result.cStat ?? null,
                duplicateConsultError: result.duplicateConsultError || null,
              });
              await updateInvoiceAfterIssue({
                lojaId,
                invoiceId: reservation.invoiceId,
                orderId,
                uid,
                result,
                orderUpdateMode: 'retrying_duplicate_number',
                historyMessage: `${reason} Numero fiscal ja usado por outro documento; tentando proxima numeracao automaticamente.`,
              });
              continue;
            }
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
        throw new HttpsError('aborted', 'Nao foi possivel encontrar uma numeracao fiscal livre automaticamente. Verifique o ultimo numero autorizado na SEFAZ e ajuste o contador fiscal.');
      } catch (error) {
        logger.error('fiscalIssueInvoice failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalIssueManualInvoice: onCall({timeoutSeconds: 540, memory: '1GiB'}, async (request) => {
      try {
        const {uid, lojaId, requester} = await requireCallableContext(request);
        const manualInvoice = request.data?.manualInvoice || {};

        const prepared = await buildManualPreparedPayload({
          lojaId,
          manualInvoice,
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

        const environment = prepared.settings.environment || 'homologation';
        for (let attempt = 0; attempt <= MAX_DUPLICATE_NUMBER_RETRIES; attempt += 1) {
          const reservation = await reserveManualInvoice({
            lojaId,
            environment,
            model: prepared.model,
            series: prepared.series,
            uid,
            justification: request.data?.justification,
            additionalInfo: prepared.payload.additionalInfo,
            operationCfop: prepared.payload.invoice.operationCfop,
            paymentResolution: prepared.paymentResolution,
            prepared,
          });
          const payload = {
            ...prepared.payload,
            invoiceId: reservation.invoiceId,
            invoice: {...prepared.payload.invoice, number: reservation.number},
          };

          try {
            const issueResult = await callFiscalService('/issue', payload, serviceConfig);
            const result = await consultDuplicateIfNeeded({payload, result: issueResult, serviceConfig});
            if (shouldRetryDuplicateNumber(result) && attempt < MAX_DUPLICATE_NUMBER_RETRIES) {
              const reason = fiscalResultReason(result, INVOICE_STATUS.REJECTED) || 'Rejeição por duplicidade de NF-e.';
              logger.warn('manual fiscal duplicate number collision; retrying with next number', {
                lojaId,
                model: prepared.model,
                series: prepared.series,
                number: reservation.number,
                attempt: attempt + 1,
                maxAttempts: MAX_DUPLICATE_NUMBER_RETRIES + 1,
                cStat: result.cStat ?? null,
                duplicateConsultError: result.duplicateConsultError || null,
              });
              await updateInvoiceAfterIssue({
                lojaId,
                invoiceId: reservation.invoiceId,
                orderId: null,
                uid,
                result,
                historyMessage: `${reason} Numero fiscal ja usado por outro documento; tentando proxima numeracao automaticamente.`,
              });
              continue;
            }
            const issued = await updateInvoiceAfterIssue({
              lojaId,
              invoiceId: reservation.invoiceId,
              orderId: null,
              uid,
              result,
            });
            await auditFiscalAction({
              uid,
              lojaId,
              requester,
              action: 'fiscal_manual_invoice_issued',
              documentId: reservation.invoiceId,
              result: issued.status || result.status || 'success',
              details: {model: prepared.model, series: prepared.series, number: reservation.number, key: issued.key || result.key || null},
            });
            return issued;
          } catch (error) {
            const statusAfterError = error?.fiscalServiceResponded ? INVOICE_STATUS.REJECTED : INVOICE_STATUS.PENDING_RETURN;
            const messageAfterError = statusAfterError === INVOICE_STATUS.PENDING_RETURN
              ? 'Falha sem retorno conclusivo; consulte a SEFAZ antes de reemitir a nota manual.'
              : (error?.message || 'Falha antes do envio para a SEFAZ.');
            await db.collection('lojas').doc(lojaId).collection('invoices').doc(reservation.invoiceId).set({
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
            throw error;
          }
        }
        throw new HttpsError('aborted', 'Nao foi possivel encontrar uma numeracao fiscal livre automaticamente. Verifique o ultimo numero autorizado na SEFAZ e ajuste o contador fiscal.');
      } catch (error) {
        logger.error('fiscalIssueManualInvoice failed', error);
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

        const result = await callFiscalService('/cancel', {
          invoiceId,
          model: invoice.model,
          key: invoice.key,
          protocol: invoice.protocol,
          reason,
          environment: environmentCode(settings.environment),
          issuer,
          fiscalSecrets: certificate.fiscalSecrets,
        }, serviceConfig);

        const cancellationAccepted = result.status === INVOICE_STATUS.CANCELLED;
        const invoiceStatus = cancellationAccepted ? INVOICE_STATUS.CANCELLED : INVOICE_STATUS.AUTHORIZED;
        await invoiceRef.set({
          status: invoiceStatus,
          cancelReason: reason,
          cancelRequestedByUid: uid,
          cancelRequestStatus: result.status || INVOICE_STATUS.REJECTED,
          cancelCStat: result.cStat || null,
          cancelMotivo: result.xMotivo || null,
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
        if (invoice.status !== INVOICE_STATUS.PENDING_RETURN && !shouldConsultDuplicate) {
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
