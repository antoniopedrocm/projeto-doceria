const {createHash}=require('node:crypto');
// Anatel numbering plan: https://www.gov.br/anatel/pt-br/regulado/numeracao/plano-de-numeracao-brasileiro
const DDDS=new Set('11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' '));
const invalid=()=>Object.assign(new Error('Informe um telefone brasileiro válido com DDD.'),{code:'CUSTOMER_PHONE_INVALID',httpStatus:400});
function normalizeCustomerPhone(value) {
  if(typeof value!=='string' && !(typeof value==='number' && Number.isSafeInteger(value))) throw invalid();
  const raw=String(value).trim();if(!/^\+?[\d\s().-]+$/.test(raw)) throw invalid();
  let national=raw.replace(/\D/g,'');
  if(raw.startsWith('+') && (!national.startsWith('55') || ![12,13].includes(national.length))) throw invalid();
  if(national.startsWith('55') && [12,13].includes(national.length)) national=national.slice(2);
  if(!/^\d{10,11}$/.test(national) || !DDDS.has(national.slice(0,2)) ||
    (national.length===11?national[2]!=='9':!/[2-5]/.test(national[2]))) throw invalid();
  const e164='+55'+national;
  return {e164,national,type:national.length===11?'mobile':'fixed',key:createHash('sha256').update(e164).digest('hex')};
}
module.exports={normalizeCustomerPhone};
