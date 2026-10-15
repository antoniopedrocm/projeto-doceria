const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'crm/src/canonicalAuth.mjs'));
const target = path.join(root, 'crm/public/canonical-auth.mjs');
if (!fs.existsSync(target) || !source.equals(fs.readFileSync(target))) fs.writeFileSync(target, source);
