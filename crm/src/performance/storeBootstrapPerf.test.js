import fs from 'fs';
import path from 'path';
import vm from 'vm';
import {storePerfMark,storePerfEvent,storePerfRequest,storePerfPaint} from './storeBootstrapPerf';
const script=fs.readFileSync(path.join(__dirname,'../../public/index.html'),'utf8').match(/<script id="crm-store-perf-bootstrap">([\s\S]*?)<\/script>/)[1];
function fixture(hostname='crmdoceria-9959e.web.app',search='?crmPerf=1') {
  let now=100;const performance={now:()=>now,mark:jest.fn(),measure:jest.fn(),getEntriesByType:type=>type==='navigation'?[{type:'reload'}]:[
    {name:'https://firestore.googleapis.com/listen?token=DO_NOT_EXPORT&uid=private',startTime:150,duration:200,transferSize:0,encodedBodySize:0},
    {name:'https://us-central1-crmdoceria-9959e.cloudfunctions.net/api/store/public-list?token=DO_NOT_EXPORT',startTime:400,duration:2500,transferSize:0,encodedBodySize:0},
    {name:'https://unrelated.example/private?token=DO_NOT_EXPORT',startTime:1,duration:10},
  ]};
  const document={readyState:'loading',addEventListener:jest.fn()},window={};
  const fetch=jest.fn();const context=vm.createContext({window,location:{hostname,search},performance,document,URL,URLSearchParams,innerWidth:1920,innerHeight:889,fetch});
  vm.runInContext(script,context);return {api:window.__crmStorePerf,performance,document,fetch,time:value=>{now=value;}};
}
afterEach(()=>{delete window.__crmStorePerf;jest.restoreAllMocks();});
test.each([['crmdoceria-9959e.web.app',''],['ana-guimaraes.web.app','?crmPerf=1'],['example.com','?crmPerf=1']])('diagnóstico não inicia fora do opt-in DEV: %s %s',(host,query)=>{
  const f=fixture(host,query);expect(f.api).toBeUndefined();expect(f.performance.mark).not.toHaveBeenCalled();expect(f.document.addEventListener).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled();
});
test('T0–T9 reais, intervalos e marks são únicos mesmo com observer repetido',()=>{
  const f=fixture();for(let i=1;i<=9;i++){f.time(100+i*10);f.api.mark('T'+i);}f.time(9999);f.api.mark('T3');
  const report=f.api.report();expect(report.intervalsMs.T9_T0).toBe(90);expect(report.intervalsMs.T3_T2).toBe(10);expect(report.intervalsMs.T6_T5).toBe(10);expect(report.marksMs.T3).toBe(30);expect(f.fetch).not.toHaveBeenCalled();
});
test('relatório conta operações e tempos sem exportar UID, tokens, permissões ou URLs',()=>{
  const f=fixture();f.api.event('staff-directory-query',{durationMs:52.25,documents:3,uid:'PRIVATE_UID',token:'DO_NOT_EXPORT',permissions:{admin:true}});
  const report=f.api.report(),json=JSON.stringify(report);expect(report.eventCounts['staff-directory-query']).toBe(1);expect(report.events[0].durationMs).toBe(52.3);expect(report.resourceTimings).toHaveLength(2);
  expect(json).not.toContain('DO_NOT_EXPORT');expect(json).not.toContain('PRIVATE_UID');expect(json).not.toContain('permissions');expect(json).not.toContain('https://');
});
test('sem marca concluída o intervalo permanece null, sem inventar medição',()=>{
  const f=fixture();expect(f.api.report().intervalsMs.T9_T0).toBeNull();expect(f.api.report().intervalsMs.homeLinks_load_to_render).toBeNull();
});
test('wrapper preserva resultado/erro e não repete a operação',async()=>{
  const value={docs:[1,2]},operation=jest.fn(async()=>value),error=Error('fixture');window.__crmStorePerf={event:jest.fn(),mark:jest.fn()};
  expect(await storePerfRequest('staff-directory-query',operation)).toBe(value);expect(operation).toHaveBeenCalledTimes(1);
  await expect(storePerfRequest('staff-directory-query',async()=>{throw error;})).rejects.toBe(error);
  expect(window.__crmStorePerf.event).toHaveBeenCalledWith('staff-directory-query',expect.objectContaining({failed:true}));
  storePerfMark('T3');storePerfEvent('staff-directory-start');expect(window.__crmStorePerf.mark).toHaveBeenCalledWith('T3');
});
test('captura de paint fica inerte quando diagnóstico está desligado',()=>{
  const spy=jest.spyOn(window,'requestAnimationFrame');const stop=storePerfPaint('T8');stop();expect(spy).not.toHaveBeenCalled();
});
