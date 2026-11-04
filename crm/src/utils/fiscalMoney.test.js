import fs from 'fs';
import path from 'path';
import {draftTotals, allocateFiscalCharge} from './fiscalMoney';

test('frontend uses the same canonical backend money policy', () => {
  const canonical = fs.readFileSync(path.resolve(__dirname, '../../../functions/fiscal-money.js'), 'utf8').replace(/\r\n/g, '\n');
  const generated = fs.readFileSync(path.resolve(__dirname, 'fiscalMoney.js'), 'utf8').replace(/\r\n/g, '\n');
  expect(generated).toBe(canonical.replace('module.exports = {', 'export {'));
});
test('manual preview adds entered freight once, supports cents and editing back to zero', () => {
  const form = {items: [{quantity: 1, unitPrice: 2025}], freight: '300.00'};
  expect(draftTotals(form)).toMatchObject({products: 2025, freight: 300, invoice: 2325});
  expect(draftTotals({...form, freight: '0'}).invoice).toBe(2025);
  expect(allocateFiscalCharge([{total: 1}, {total: 1}, {total: 1}], .02)).toEqual([0, 0, .02]);
});
