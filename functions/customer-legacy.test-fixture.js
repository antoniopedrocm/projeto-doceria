// Synthetic, in-memory Firestore double. No SDK client, network or credentials.
const clone=value=>value===undefined?undefined:structuredClone(value);
function memoryFirestore(seed={}) {
  const rows=new Map(Object.entries(seed).map(([path,data])=>[path,clone(data)])),writes=[],queries=[];
  let serial=0,tail=Promise.resolve();
  const snapshot=(path,fields)=>({id:path.split('/').at(-1),ref:doc(path),exists:rows.has(path),
    data:()=>{const data=clone(rows.get(path));return data && fields?Object.fromEntries(fields.filter(key=>key in data).map(key=>[key,data[key]])):data;},
    get:key=>clone(rows.get(path)?.[key])});
  const matches=(data,filter)=>filter.operator==='OR'?filter.filters.some(f=>matches(data,f)):
    filter.operator==='==' && data?.[filter.field]===filter.value;
  function query(path,{group=false,filters=[],fields=null,start=null,limit=Infinity}={}) {
    const options={group,filters,fields,start,limit};
    return {path,select:(...fields)=>query(path,{...options,fields}),limit:limit=>query(path,{...options,limit}),
      where:(field,operator,value)=>query(path,{...options,filters:[...filters,typeof field==='string'?{field,operator,value}:field]}),
      orderBy:()=>query(path,options),startAfter:s=>query(path,{...options,start:s.ref.path}),
      get:async()=>{
        const paths=[...rows.keys()].filter(p=>(group?p.split('/').at(-2)===path:p.startsWith(path+'/')&&p.split('/').length===path.split('/').length+1) &&
          (!start || p>start) && filters.every(filter=>matches(rows.get(p),filter))).sort().slice(0,limit);
        queries.push({path,group,fields,limit,documents:paths.length});
        return {docs:paths.map(p=>snapshot(p,fields)),size:paths.length,empty:paths.length===0};
      },doc:id=>doc(path+'/'+(id || 'synthetic-'+(++serial)))};
  }
  function doc(path) {return {path,id:path.split('/').at(-1),get:async()=>snapshot(path),
    set:async data=>db.runTransaction(async tx=>tx.set(doc(path),data)),
    update:async data=>db.runTransaction(async tx=>tx.update(doc(path),data))};}
  const db={rows,writes,queries,failNextCommit:false,doc,collection:path=>query(path),collectionGroup:path=>query(path,{group:true}),
    getAll:async(...refs)=>Promise.all(refs.map(ref=>ref.get())),
    runTransaction:async fn=>{
      const prior=tail;let release;tail=new Promise(resolve=>{release=resolve;});await prior;
      try {
        const pending=[];
        const tx={get:async ref=>{if(pending.length)throw Error('Read after write');return ref.get();},
          getAll:async(...refs)=>{if(pending.length)throw Error('Read after write');return Promise.all(refs.map(ref=>ref.get()));},
          create:(ref,data)=>pending.push({path:ref.path,data:clone(data),type:'create'}),
          set:(ref,data)=>pending.push({path:ref.path,data:clone(data),type:'set'}),
          update:(ref,data)=>pending.push({path:ref.path,data:clone(data),type:'update'})};
        const result=await fn(tx);
        if(db.failNextCommit){db.failNextCommit=false;throw Error('Synthetic atomic commit failure');}
        const next=new Map(rows);
        for(const op of pending){
          if(op.type==='create'&&next.has(op.path))throw Error('Document already exists');
          if(op.type==='update'&&!next.has(op.path))throw Error('Missing document');
          next.set(op.path,op.type==='update'?{...next.get(op.path),...op.data}:op.data);
        }
        rows.clear();for(const entry of next)rows.set(...entry);writes.push(...pending);return result;
      } finally {release();}
    }};
  return db;
}
module.exports={memoryFirestore};
