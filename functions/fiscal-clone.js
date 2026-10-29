const {XMLParser, XMLValidator} = require('fast-xml-parser');

// Copy by allowlist. No fiscal identity or provider result can enter the new form.
const pick = (value, keys) => Object.fromEntries(keys.filter((key) => value?.[key] !== undefined && (value[key] === null || ['string', 'number', 'boolean'].includes(typeof value[key]))).map((key) => [key, value[key]]));
const taxFields = ['origin', 'csosn', 'cst', 'pisCst', 'cofinsCst', 'ipiCst', 'cBenef', 'cest'];
const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const draftTotals = (form) => {
  const items = form.items || [];
  const products = round(items.reduce((sum, item) => sum + round(finite(item.quantity) * finite(item.unitPrice)), 0));
  const discount = round(items.reduce((sum, item) => sum + round(finite(item.discount)), 0));
  const freight = round(finite(form.freight));
  const insurance = round(finite(form.insurance));
  const other = round(finite(form.other));
  return {products, discount, freight, insurance, other, invoice: round(products - discount + freight + insurance + other)};
};

const cloneEditableForm = (source) => {
  const customer = pick(source.customer, ['id', 'name', 'document', 'stateRegistration', 'email', 'phone', 'isFinalConsumer', 'receivesIcmsCredit', 'requiresNfe']);
  customer.address = pick(source.customer?.address, ['street', 'number', 'complement', 'district', 'city', 'cityCode', 'state', 'zip']);
  const form = pick(source, ['operationCfop', 'operationNature', 'presence', 'freightMode', 'paymentMethodCode', 'additionalInfo', 'freight', 'insurance', 'other']);
  form.customerMode = 'snapshot';
  form.customer = customer;
  // Inventory movement is a new decision, never inherited from the old sale.
  form.stockMovementRequested = false;
  form.items = (source.items || []).map((item) => ({
    ...pick(item, ['productId', 'code', 'description', 'quantity', 'unitPrice', 'discount', 'ncm', 'cfop', 'unit', ...taxFields]),
    ...pick(item.fiscal, taxFields),
    ...pick(item.tax, taxFields),
    source: 'snapshot',
  }));
  return form;
};

// Only editable data is extracted. XML, infNFe@Id, signatures, QR codes and protocols
// remain exclusively in the original invoice's protected artifact.
const editableFromXml = (xml) => {
  if (Buffer.byteLength(xml, 'utf8') > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('XML histórico inválido para clonagem.');
  if (XMLValidator.validate(xml) !== true) throw new Error('XML histórico malformado.');
  const parsed = new XMLParser({removeNSPrefix: true, parseTagValue: false, ignoreAttributes: true}).parse(xml);
  const info = (parsed.nfeProc?.NFe || parsed.NFe)?.infNFe;
  if (!info) throw new Error('XML histórico sem dados de NF-e/NFC-e.');
  const dest = info.dest || {};
  const addr = dest.enderDest || {};
  const firstGroup = (group) => Object.values(group || {}).find((value) => value && typeof value === 'object') || {};
  const details = Array.isArray(info.det) ? info.det : info.det ? [info.det] : [];
  const payments = info.pag?.detPag;
  const payment = Array.isArray(payments) ? payments[0] : payments;
  const totals = info.total?.ICMSTot || {};
  return {
    model: Number(info.ide?.mod),
    operationNature: info.ide?.natOp,
    presence: info.ide?.indPres,
    freightMode: info.transp?.modFrete,
    paymentMethodCode: payment?.tPag,
    additionalInfo: info.infAdic?.infCpl,
    freight: totals.vFrete || 0, insurance: totals.vSeg || 0, other: totals.vOutro || 0,
    customer: {
      name: dest.xNome || '', document: dest.CPF || dest.CNPJ || '', stateRegistration: dest.IE || '', email: dest.email || '', phone: addr.fone || '',
      isFinalConsumer: info.ide?.indFinal !== '0',
      address: {street: addr.xLgr || '', number: addr.nro || '', complement: addr.xCpl || '', district: addr.xBairro || '', city: addr.xMun || '', cityCode: addr.cMun || '', state: addr.UF || '', zip: addr.CEP || ''},
    },
    items: details.map((detail) => {
      const p = detail.prod || {};
      const tax = detail.imposto || {};
      const icms = firstGroup(tax.ICMS);
      return {code: p.cProd, description: p.xProd, ncm: p.NCM, cfop: p.CFOP, unit: p.uCom,
        quantity: Number(p.qCom), unitPrice: Number(p.vUnCom), discount: Number(p.vDesc || 0), cest: p.CEST, cBenef: p.cBenef,
        origin: icms.orig === undefined ? null : Number(icms.orig), csosn: icms.CSOSN || '', cst: icms.CST || '', pisCst: firstGroup(tax.PIS).CST || '', cofinsCst: firstGroup(tax.COFINS).CST || '', ipiCst: firstGroup(tax.IPI).CST || ''};
    }),
  };
};

module.exports = {cloneEditableForm, draftTotals, editableFromXml};
