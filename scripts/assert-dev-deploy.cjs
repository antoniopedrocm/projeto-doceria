const fs = require('node:fs');
const path = require('node:path');

const expectedProject = 'crmdoceria-9959e';
const expectedRepository = 'antoniopedrocm/projeto-doceria';
const workspace = fs.realpathSync(process.env.PROJECT_DIR || path.resolve(__dirname, '..'));
const segments = workspace.toLowerCase().split(/[\\/]+/);
const localDevWorkspace = segments.includes('projeto-doceria-main') &&
  !segments.includes('projeto-doceria-multiloja');
const githubDevWorkspace = process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REPOSITORY?.toLowerCase() === expectedRepository;

if (process.env.GCLOUD_PROJECT !== expectedProject ||
    (!localDevWorkspace && !githubDevWorkspace)) {
  console.error(`Deploy recusado: workspace ${workspace}; Firebase Project ID ${process.env.GCLOUD_PROJECT || '(ausente)'}.`);
  process.exit(1);
}

console.log(`Deploy DEV validado: ${workspace} → ${expectedProject}`);
