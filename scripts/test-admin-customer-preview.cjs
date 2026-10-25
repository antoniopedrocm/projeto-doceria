// Deterministic emulator-only runner: existing suites share fixed phones but must not share data.
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const suites=['admin-customer-preview-emulator.test.js','customer-canonical-history-emulator.test.js','customer-orders-emulator.test.js','customer-profile-emulator.test.js','customer-registry-api-emulator.test.js','legacy-phone-emulator.test.js','address-verification-emulator.test.js'];
async function reset() {
  for(const project of ['demo-doceria-checkout','demo-customer-canonical-history']) {
    const response=await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}/databases/(default)/documents`,{method:'DELETE'});
    if(!response.ok)throw Error('Firestore demo reset failed');
  }
  const response=await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-doceria-checkout/accounts',{method:'DELETE'});
  if(!response.ok)throw Error('Auth demo reset failed');
}
(async()=>{
  let pass=0,fail=0;
  const selected=process.argv.slice(2);if(selected.some(suite=>!suites.includes(suite)))throw Error('Unknown demo suite');
  for(const suite of selected.length?selected:suites) {
    await reset();
    const result=spawnSync(process.execPath,['--test',suite],{cwd:path.join(root,'functions'),encoding:'utf8',timeout:300000,
      env:{...process.env,NO_PROXY:'127.0.0.1,localhost,::1',no_proxy:'127.0.0.1,localhost,::1'}});
    const output=(result.stdout || '')+(result.stderr || '');fs.writeFileSync(path.join(os.tmpdir(),'admin-preview-'+suite+'.log'),output);
    const count=Number(output.match(/^# pass (\d+)/m)?.[1] || 0),failed=Number(output.match(/^# fail (\d+)/m)?.[1] || 0);
    pass+=count;fail+=failed;
    console.log(`${suite}: ${result.status===0?'PASS':'FAIL'} pass=${count} fail=${failed}`);
    if(result.status!==0)throw Error('Suite failed; inspect isolated emulator log: '+suite);
  }
  console.log(`EMULATOR_TOTAL pass=${pass} fail=${fail}`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
