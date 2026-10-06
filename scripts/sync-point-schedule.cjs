const fs = require('node:fs');
const path = require('node:path');

const generateBrowserSource = (canonical) => canonical.replace('module.exports = {', 'export {');

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'functions/point-schedule-core.js'), 'utf8');
  const target = path.join(root, 'crm/src/meuEspaco/pointScheduleCore.js');
  const expected = generateBrowserSource(source);
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(target, 'utf8') !== expected) {
      throw new Error('Política de escala divergente. Execute node scripts/sync-point-schedule.cjs.');
    }
  } else {
    fs.writeFileSync(target, expected);
  }
}

module.exports = {generateBrowserSource};
