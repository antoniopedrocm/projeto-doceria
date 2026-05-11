const {GoogleAuth} = require('google-auth-library');

const INVOICE_STATUS = {
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

const inferDocumentType = (document) => (onlyDigits(document).length > 11 ? 'CNPJ' : 'CPF');
const environmentCode = (environment) => (environment === 'production' ? 1 : 2);
const counterId = (environment, model, series) => `${environment}_${model}_${series}`;

const paymentMethodToNFeCode = (method) => {
  const value = String(method || '').toLowerCase();
  if (value.includes('pix')) return '17';
  if (value.includes('crédito') || value.includes('credito')) return '03';
  if (value.includes('débito') || value.includes('debito')) return '04';
  if (value.includes('dinheiro')) return '01';
  if (value.includes('boleto')) return '15';
  return '99';
};

const getNested = (obj, paths) => {
  for (const path of paths) {
    const value = path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), obj);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const normalizeAddress = (source = {}) => {
  if (typeof source === 'string') {
    return {
      street: source,
      number: 'S/N',
      district: '',
      city: 'Goiania',
      cityCode: '5208707',
      state: 'GO',
      zip: '',
    };
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
  if (!payload.customer?.document) errors.push('Cliente sem CPF/CNPJ.');
  if (!payload.customer?.address?.street) errors.push('Cliente sem endereço fiscal.');
  if (!payload.customer?.address?.zip) errors.push('Cliente sem CEP fiscal.');
  if (!payload.invoice?.number || payload.invoice.number < 1) errors.push('Número fiscal inválido.');

  payload.items.forEach((item, index) => {
    if (!item.ncm || item.ncm.length !== 8) errors.push(`Item ${index + 1} com NCM inválido.`);
    if (!item.cfop || item.cfop.length !== 4) errors.push(`Item ${index + 1} com CFOP inválido.`);
    if (!item.tax?.csosn && !item.tax?.cst) errors.push(`Item ${index + 1} sem CSOSN/CST.`);
    if (item.discount > item.total) errors.push(`Item ${index + 1} com desconto maior que o total.`);
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

const cleanText = (value) => String(value || '').trim();

const getServiceConfig = (settings = {}) => ({
  serviceUrl: cleanText(process.env.FISCAL_SERVICE_URL || settings.serviceUrl || settings.fiscalServiceUrl),
  sharedSecret: cleanText(process.env.FISCAL_SHARED_SECRET || settings.sharedSecret || settings.fiscalSharedSecret),
});

const callFiscalService = async (path, body, serviceConfig = {}) => {
  const {serviceUrl, sharedSecret} = getServiceConfig(serviceConfig);
  if (!serviceUrl) {
    const error = new Error('Configure a URL do serviço fiscal antes de emitir notas.');
    error.code = 'failed-precondition';
    throw error;
  }

  const url = new URL(path, serviceUrl.endsWith('/') ? serviceUrl : `${serviceUrl}/`).toString();

  if (sharedSecret || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(serviceUrl)) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(sharedSecret ? {'X-Fiscal-Service-Token': sharedSecret} : {}),
      },
      body: JSON.stringify(body),
    });
    const parsed = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(parsed.error || 'Serviço fiscal recusou a requisição.');
      error.details = parsed;
      throw error;
    }
    return parsed;
  }

  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(serviceUrl);
  const response = await client.request({
    url,
    method: 'POST',
    data: body,
    headers: {'Content-Type': 'application/json'},
  });
  return response.data;
};

const createFiscalFunctions = ({
  admin,
  db,
  onCall,
  HttpsError,
  logger,
  verifyManagementAccess,
  userHasAccessToStores,
  STORE_ALL_KEY,
}) => {
  const FieldValue = admin.firestore.FieldValue;

  const normalizeHttpsError = (error) => {
    if (error instanceof HttpsError) return error;
    if (error?.code === 'failed-precondition') {
      return new HttpsError('failed-precondition', error.message);
    }
    return new HttpsError('internal', error?.message || 'Falha fiscal inesperada.', error?.details || null);
  };

  const requireStoreAccess = async (uid, lojaId) => {
    if (!lojaId || lojaId === STORE_ALL_KEY) {
      throw new HttpsError('failed-precondition', 'Selecione uma loja específica para emitir nota fiscal.');
    }

    const requester = await verifyManagementAccess(uid);
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
      processVersion: settings.processVersion || 'ana-guimaraes-fiscal-1.0.0',
      serviceUrl: settings.serviceUrl || settings.fiscalServiceUrl || '',
      sharedSecret: settings.sharedSecret || settings.fiscalSharedSecret || '',
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
    const selectedAddress = order.clienteEnderecoFiscal
      || order.clienteEndereco
      || order.enderecoEntrega
      || (Array.isArray(clientData.enderecos) ? clientData.enderecos[0] : null)
      || clientData.endereco
      || {};
    const customerZip = onlyDigits(
      order.clienteCep
      || getNested(order, ['clienteCEP', 'customer.address.zip', 'fiscal.customerZip'])
      || clientData.cep
      || getNested(clientData, ['address.zip', 'endereco.cep'])
    );
    const customerAddress = normalizeAddress(selectedAddress);
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
    const productId = item.produtoId || item.productId || item.id;
    let productData = {};
    let fiscalData = {};

    if (productId) {
      const [productSnap, fiscalSnap] = await Promise.all([
        db.collection('lojas').doc(lojaId).collection('produtos').doc(productId).get(),
        db.collection('lojas').doc(lojaId).collection('fiscalProducts').doc(productId).get(),
      ]);
      productData = productSnap.exists ? productSnap.data() || {} : {};
      fiscalData = fiscalSnap.exists ? fiscalSnap.data() || {} : {};
    }

    return {
      ...productData.fiscal,
      ...fiscalData,
      ...item.fiscal,
      code: fiscalData.code || item.codigo || item.sku || productId || item.id,
      description: item.nome || item.description || productData.nome || fiscalData.description || 'Produto',
    };
  };

  const buildPreparedPayload = async ({lojaId, orderId, modelOverride, number = 1, invoiceId, uid}) => {
    const orderRef = db.collection('lojas').doc(lojaId).collection('pedidos').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', 'Pedido não encontrado.');
    }

    const order = {id: orderSnap.id, ...orderSnap.data()};
    if (!['Finalizado', 'Aprovado', 'ready_for_invoice', 'approved'].includes(order.status) && !order.approvedForInvoice) {
      throw new HttpsError('failed-precondition', 'A nota só pode ser emitida para pedido finalizado ou aprovado.');
    }

    const [issuer, settings, customer] = await Promise.all([
      loadIssuer(lojaId),
      loadSettings(lojaId),
      loadCustomer(order),
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
    const paymentCode = order.payment?.methodCode || paymentMethodToNFeCode(order.formaPagamento);

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
        processVersion: settings.processVersion,
        payment: {
          methodCode: paymentCode || settings.defaultPaymentMethodCode,
          amount: invoiceTotal,
          dueDate: order.payment?.dueDate || null,
        },
      },
      issuer,
      customer,
      items: rawItems.map((item, index) => {
        const fiscal = fiscalItems[index] || {};
        const quantity = Number(item.quantity || item.quantidade || 1);
        const unitPrice = money(item.preco || item.unitPrice || 0);
        const cfop = fiscal.cfop || (model === 55 ? fiscal.cfopNfe : fiscal.cfopNfce);

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
      additionalInfo: order.observacao || order.additionalInfo || '',
      requestedByUid: uid,
    };

    return {
      payload,
      order,
      settings,
      model,
      series,
      errors: validatePreparedPayload(payload),
    };
  };

  const reserveInvoice = async ({lojaId, orderId, environment, model, series, uid, justification}) => {
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
    const orderRef = db.collection('lojas').doc(lojaId).collection('pedidos').doc(orderId);
    const status = result.status || INVOICE_STATUS.REJECTED;

    await db.runTransaction(async (transaction) => {
      transaction.set(invoiceRef, {
        status,
        key: result.key || null,
        protocol: result.protocol || null,
        cStat: result.cStat || null,
        xMotivo: result.xMotivo || null,
        errors: result.errors || null,
        updatedAt: FieldValue.serverTimestamp(),
        serviceResult: {
          ...result,
          authorizedXml: result.authorizedXml ? '[stored-by-fiscal-service-or-inline]' : null,
          signedXml: result.signedXml ? '[stored-by-fiscal-service-or-inline]' : null,
          danfePdfBase64: result.danfePdfBase64 ? '[stored-by-fiscal-service-or-inline]' : null,
        },
        history: FieldValue.arrayUnion({
          status,
          at: admin.firestore.Timestamp.now(),
          by: uid,
          message: result.xMotivo || 'Retorno recebido do serviço fiscal.',
        }),
      }, {merge: true});

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

    return result;
  };

  const previewNextNumber = async (lojaId, environment, model, series) => {
    const counterSnap = await db.collection('lojas').doc(lojaId).collection('fiscalCounters').doc(counterId(environment, model, series)).get();
    return Number(counterSnap.get('nextNumber') || 1);
  };

  return {
    fiscalValidateOrder: onCall(async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const orderId = String(request.data?.orderId || '').trim();
        if (!orderId) throw new HttpsError('invalid-argument', 'orderId obrigatório.');
        const prepared = await buildPreparedPayload({
          lojaId,
          orderId,
          modelOverride: request.data?.modelOverride,
          uid,
        });
        const environment = prepared.settings.environment || 'homologation';
        const nextNumber = await previewNextNumber(lojaId, environment, prepared.model, prepared.series);
        const payload = {
          ...prepared.payload,
          invoice: {...prepared.payload.invoice, number: nextNumber},
        };

        const localResult = {
          ok: prepared.errors.length === 0,
          errors: prepared.errors,
          warnings: getServiceConfig(prepared.settings).serviceUrl ? [] : ['Serviço fiscal ainda não configurado; validação feita apenas localmente.'],
          model: prepared.model,
          series: prepared.series,
          number: nextNumber,
          totals: payload.totals,
        };

        if (prepared.errors.length || !getServiceConfig(prepared.settings).serviceUrl) return localResult;
        return await callFiscalService('/validate', payload, prepared.settings);
      } catch (error) {
        logger.error('fiscalValidateOrder failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalIssueInvoice: onCall({timeoutSeconds: 540, memory: '1GiB'}, async (request) => {
      try {
        const {uid, lojaId} = await requireCallableContext(request);
        const orderId = String(request.data?.orderId || '').trim();
        if (!orderId) throw new HttpsError('invalid-argument', 'orderId obrigatório.');

        const prepared = await buildPreparedPayload({
          lojaId,
          orderId,
          modelOverride: request.data?.modelOverride,
          uid,
        });
        if (prepared.errors.length) {
          throw new HttpsError('failed-precondition', prepared.errors.join(' '));
        }
        if (!getServiceConfig(prepared.settings).serviceUrl) {
          throw new HttpsError('failed-precondition', 'Configure a URL do serviço fiscal na aba Configuração antes de emitir notas.');
        }

        const environment = prepared.settings.environment || 'homologation';
        const reservation = await reserveInvoice({
          lojaId,
          orderId,
          environment,
          model: prepared.model,
          series: prepared.series,
          uid,
          justification: request.data?.justification,
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
          await db.collection('lojas').doc(lojaId).collection('invoices').doc(reservation.invoiceId).set({
            status: INVOICE_STATUS.PENDING_RETURN,
            error: error?.message || String(error),
            updatedAt: FieldValue.serverTimestamp(),
            history: FieldValue.arrayUnion({
              status: INVOICE_STATUS.PENDING_RETURN,
              at: admin.firestore.Timestamp.now(),
              by: uid,
              message: 'Falha sem retorno conclusivo; consulte a SEFAZ antes de reemitir.',
            }),
          }, {merge: true});
          throw error;
        }
      } catch (error) {
        logger.error('fiscalIssueInvoice failed', error);
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

        const invoiceRef = db.collection('lojas').doc(lojaId).collection('invoices').doc(invoiceId);
        const invoiceSnap = await invoiceRef.get();
        if (!invoiceSnap.exists) throw new HttpsError('not-found', 'Nota não encontrada.');
        const invoice = invoiceSnap.data() || {};
        if (invoice.status !== INVOICE_STATUS.AUTHORIZED) {
          throw new HttpsError('failed-precondition', 'Somente notas autorizadas podem ser canceladas.');
        }
        const settings = await loadSettings(lojaId);
        if (!getServiceConfig(settings).serviceUrl) {
          throw new HttpsError('failed-precondition', 'Configure a URL do serviço fiscal na aba Configuração antes de cancelar notas.');
        }

        const result = await callFiscalService('/cancel', {
          invoiceId,
          model: invoice.model,
          key: invoice.key,
          protocol: invoice.protocol,
          reason,
        }, settings);

        await invoiceRef.set({
          status: result.status || INVOICE_STATUS.REJECTED,
          cancelReason: reason,
          cancelRequestedByUid: uid,
          cancelCStat: result.cStat || null,
          cancelMotivo: result.xMotivo || null,
          updatedAt: FieldValue.serverTimestamp(),
          history: FieldValue.arrayUnion({
            status: result.status || INVOICE_STATUS.REJECTED,
            at: admin.firestore.Timestamp.now(),
            by: uid,
            message: result.xMotivo || 'Cancelamento solicitado.',
          }),
        }, {merge: true});

        return result;
      } catch (error) {
        logger.error('fiscalCancelInvoice failed', error);
        throw normalizeHttpsError(error);
      }
    }),

    fiscalGetInvoice: onCall(async (request) => {
      try {
        await requireCallableContext(request);
        const lojaId = String(request.data?.lojaId || '').trim();
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
  };
};

module.exports = {createFiscalFunctions};
