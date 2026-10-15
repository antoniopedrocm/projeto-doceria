const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'crm/src/canonicalAuth.mjs'));
const target = path.join(root, 'crm/public/canonical-auth.mjs');
if (!fs.existsSync(target) || !source.equals(fs.readFileSync(target))) fs.writeFileSync(target, source);
// Historical entry URLs are generated compatibility copies, never store-specific code.
const menu = fs.readFileSync(path.join(root,'crm/public/cardapio.html'));
for (const alias of ['cardapio-matriz','cardapio-garavelo','cardapio-festa']) {
  fs.writeFileSync(path.join(root,`crm/public/${alias}.html`),menu);
}
fs.copyFileSync(path.join(root,'crm/src/storefront/storeRoutes.mjs'),path.join(root,'crm/public/store-links.mjs'));
