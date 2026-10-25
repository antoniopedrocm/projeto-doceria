// DEV only. No Auth users, orders, payments or PROD APIs are written.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{createHash}=require('node:crypto');
const {buildCustomerMigrationPlan}=require('../functions/customer-migration-plan');
const {fields,buildSafeMigrationWrites,buildReviewedMigrationWrites}=require('../functions/customer-migration-writes');
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];},modes=['--dry-run','--apply-safe','--apply-reviewed','--rollback'].filter(n=>args.includes(n));
const project='crmdoceria-9959e',root=fs.realpathSync(process.cwd()),segments=root.toLowerCase().split(/[\\/]+/),digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
if(modes.length!==1 || !args.includes('--project') || arg('--project')!==project || !segments.includes('projeto-doceria-main') || segments.includes('projeto-doceria-multiloja'))throw Error('One mode and explicit DEV workspace/project required.');
if(cp.execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim()!=='feature/infinitepay-customer-auth')throw Error('Wrong branch.');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')),snapshot=n=>read(path.join(path.resolve(arg('--snapshot')),n+'.json'));
const documents='projects/'+project+'/databases/(default)/documents',base='/v1/'+documents;
const allowed=p=>/^clientes\/[a-zA-Z0-9_-]{1,150}$/.test(p) || /^customerAuthIdentities\/[a-f0-9]{64}$/.test(p) || /^integrations\/customerRegistry(?:\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)?$/.test(p);
async function client(){const lib=arg('--firebase-tools-lib')||path.join(process.env.APPDATA,'npm/node_modules/firebase-tools/lib'),a=require(path.join(lib,'auth')),o={project,projectRoot:root};a.setActiveAccount(o,a.getProjectDefaultAccount(root));await require(path.join(lib,'requireAuth')).requireAuth(o);return new (require(path.join(lib,'apiv2')).Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});}
async function get(c,p){try{return(await c.get(base+'/'+p)).body;}catch(e){if(e.status===404 || e.statusCode===404)return null;throw e;}}
async function apply(c,writes,migrationId){
  if(writes.some(w=>!allowed(w.path)) || new Set(writes.map(w=>w.path)).size!==writes.length)throw Error('Unexpected/duplicate path.');
  const before=await Promise.all(writes.map(w=>get(c,w.path)));
  if(writes.some((w,i)=>w.updateTime && w.updateTime!==before[i]?.updateTime))throw Error('Source changed; repeat audit.');
  const folder=path.join(process.env.TEMP||process.env.TMP,migrationId);fs.mkdirSync(folder,{recursive:true});
  const file=path.join(folder,'typed-backup-'+Date.now()+'.json'),backup={project,migrationId,state:'PREPARED',rows:writes.map((w,i)=>({path:w.path,before:before[i]}))};fs.writeFileSync(file,JSON.stringify(backup));
  const encoded=writes.map((w,i)=>({update:{name:documents+'/'+w.path,fields:w.fields},...(w.updateMask?{updateMask:{fieldPaths:w.updateMask}}:{}),currentDocument:before[i]?{updateTime:before[i].updateTime}:{exists:false}}));
  const result=(await c.post(base+':commit',{writes:encoded})).body;backup.state='APPLIED';backup.rows.forEach((r,i)=>{r.afterUpdateTime=result.writeResults[i].updateTime;});fs.writeFileSync(file,JSON.stringify(backup));
  return {backupFile:file,writes:writes.length};
}
async function main(){
  if(modes[0]==='--rollback'){
    if(!args.includes('--backup'))throw Error('Backup required.');const file=path.resolve(arg('--backup')),b=read(file);
    if(b.project!==project || b.state!=='APPLIED' || !b.rows?.length || b.rows.some(r=>!allowed(r.path)||!r.afterUpdateTime))throw Error('Invalid backup.');
    const c=await client();await c.post(base+':commit',{writes:b.rows.map(r=>r.before?{update:{name:documents+'/'+r.path,fields:r.before.fields||{}},currentDocument:{updateTime:r.afterUpdateTime}}:{delete:documents+'/'+r.path,currentDocument:{updateTime:r.afterUpdateTime}})});
    b.state='ROLLED_BACK';fs.writeFileSync(file,JSON.stringify(b));console.log(JSON.stringify({project,migrationId:b.migrationId,state:b.state,orderWrites:0,authUserWrites:0}));return;
  }
  if(!args.includes('--snapshot') || snapshot('inventory').project!==project)throw Error('Private DEV audit snapshot required.');
  const customers=snapshot('customers'),identities=snapshot('identities'),plan=buildCustomerMigrationPlan({customers,identities,orders:snapshot('orders')}),folder=path.join(process.env.TEMP||process.env.TMP,plan.migrationId);fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'private-plan.json'),JSON.stringify(plan,null,2));
  const ref=id=>createHash('sha256').update(id).digest('hex').slice(0,12),report={project,mode:'DRY_RUN',migrationId:plan.migrationId,summary:plan.summary,groups:plan.groups.map(g=>({phoneMasked:'+55 ** *****-'+g.normalizedPhone.slice(-4),state:g.state,reasons:g.reasons,canonicalRef:g.customerId?ref(g.customerId):null,candidateRefs:g.candidateIds.map(ref),additionalAddressCount:g.additionalAddressCount,orderReferences:g.orderReferences.length})),customerWrites:0,orderWrites:0,identityWrites:0,privatePlanFolder:folder};
  fs.writeFileSync(path.join(folder,'report-sanitized.json'),JSON.stringify(report,null,2));if(modes[0]==='--dry-run'){console.log(JSON.stringify(report));return;}
  if(!args.includes('--ack-guarded-runtime'))throw Error('Guarded writers and Rules must be deployed and verified first.');
  const c=await client(),now=new Date().toISOString();let migrationId=plan.migrationId,proposal;
  if(modes[0]==='--apply-reviewed'){
    if(!args.includes('--proposal-file') || !args.includes('--approval-file'))throw Error('Exact reviewed proposal and human approval required.');proposal=read(path.resolve(arg('--proposal-file')));const approval=read(path.resolve(arg('--approval-file')));
    if(approval.project!==project || approval.approved!==true || approval.keepAllReviewedUids!==true || approval.proposalDigest!==digest(proposal))throw Error('Approval does not match full proposal.');migrationId='reviewed-phone-'+digest(proposal).slice(0,16);
  }
  const marker='integrations/customerRegistry/migrations/'+migrationId,applied=await get(c,marker);
  if(applied?.fields.state?.stringValue==='APPLIED'){console.log(JSON.stringify({project,migrationId,state:'ALREADY_APPLIED',writes:0}));return;}
  let writes;
  if(proposal){
    if((await get(c,'integrations/customerRegistry'))?.fields.state?.stringValue!=='READY')throw Error('Safe coverage must be ready first.');
    const ids=[proposal.canonicalCustomerId,...proposal.legacyCustomerIds],sources=customers.filter(r=>ids.includes(r.path.split('/').at(-1))),raw=await Promise.all(sources.map(r=>get(c,r.path)));
    if(sources.length!==ids.length || raw.some((r,i)=>r?.updateTime!==sources[i].updateTime))throw Error('Proposal source changed.');
    writes=buildReviewedMigrationWrites({proposal,rawCustomers:raw,identities,migrationId,now});
  }else{
    const raw=(await c.post(base+':runQuery',{structuredQuery:{from:[{collectionId:'clientes'}]}})).body.filter(r=>r.document).map(r=>r.document);
    if(raw.length!==customers.length || raw.some(d=>!customers.some(r=>r.path===d.name.split('/documents/')[1] && r.updateTime===d.updateTime)))throw Error('Inventory changed.');
    writes=buildSafeMigrationWrites({plan,rawCustomers:raw,identities,now});writes.push({path:marker,fields:fields({state:'APPLIED',type:'SAFE_COVERAGE',appliedAt:now,orderWrites:0,authUserWrites:0})});
  }
  console.log(JSON.stringify({project,migrationId,state:'APPLIED',...await apply(c,writes,migrationId),orderWrites:0,authUserWrites:0}));
}
main().catch(()=>{console.error(JSON.stringify({project,state:'MIGRATION_ABORTED',reason:'Precondition/authorization/access failed; inspect private audit locally without exposing payloads'}));process.exitCode=1;});
