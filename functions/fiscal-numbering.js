const MAX_FISCAL_NUMBER = 999999999;
const counterId = (environment, model, series) => `${environment}_${model}_${series}`;
const counterRevision = (snapshot) => snapshot.exists ? `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}` : 'missing';
const nextNumberFrom = (snapshot) => snapshot.exists ? Number(snapshot.get('nextNumber')) : 1;
const isFiscalNumber = (number) => typeof number === 'number' && Number.isInteger(number) && number >= 1 && number <= MAX_FISCAL_NUMBER;
const digits = (value) => String(value || '').replace(/\D/g, '');

const sequenceContext = (issuer, settings, model, overrideEnvironment) => ({
  issuerCnpj: digits(issuer.cnpj), model,
  environment: overrideEnvironment || settings.environment || 'homologation',
  series: Number((model === 55 ? settings.nfeSeries : settings.nfceSeries) ?? 1),
});

const sameSequence = (record, context) => Number(record.model) === context.model &&
  Number(record.series) === context.series && (!record.environment || record.environment === context.environment);

// Inspect recorded identities and attempts, including keys referenced by rejection 539.
// Never derive a supposedly available next number from the local maximum.
const invoiceKnowsNumber = (invoice, context, number) => {
  const key = digits(invoice.key);
  const inferred = key.length === 44 ? {model: Number(key.slice(20, 22)), series: Number(key.slice(22, 25))} : {};
  const base = {...inferred, ...invoice};
  if (sameSequence(base, context) && Number(invoice.number ?? invoice.nNF) === number) return true;
  for (const entry of invoice.history || []) {
    if (sameSequence({...base, ...entry}, context) && Number(entry.number ?? entry.nNF) === number) return true;
  }
  if (invoice.environment && invoice.environment !== context.environment) return false;
  const text = [invoice.key, invoice.xMotivo, invoice.issuanceRejection?.xMotivo,
    invoice.serviceResult?.duplicateIssueResult?.xMotivo, ...(invoice.history || []).map((entry) => entry.message || entry.xMotivo || '')].join(' ');
  return [...text.matchAll(/\b\d{44}\b/g)].some(([accessKey]) => accessKey.slice(6, 20) === context.issuerCnpj &&
    Number(accessKey.slice(20, 22)) === context.model && Number(accessKey.slice(22, 25)) === context.series &&
    Number(accessKey.slice(25, 34)) === number);
};

const rangeBlocksNumber = (operation, context, number) => sameSequence(operation, context) &&
  ['processing', 'pending_return', 'inutilized'].includes(operation.status) && Number(operation.start) <= number && Number(operation.end) >= number;

module.exports = {MAX_FISCAL_NUMBER, counterId, counterRevision, nextNumberFrom, isFiscalNumber, sequenceContext, sameSequence, invoiceKnowsNumber, rangeBlocksNumber};
