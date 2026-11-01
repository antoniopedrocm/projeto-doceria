const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/fiscal-money.js'), 'utf8');
const target = path.join(root, 'crm/src/utils/fiscalMoney.js');
const expected = source.replace('module.exports = {', 'export {');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== expected.replace(/\r\n/g, '\n')) {
    throw new Error('Cálculos fiscais divergentes. Execute node scripts/sync-fiscal-money.cjs.');
  }
} else fs.writeFileSync(target, expected);
