import React,{useEffect,useRef,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {functions} from '../firebaseConfig';
import {storeFriendlyName} from './staffDirectory';
const slugFor=name=>'cardapio-'+(name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'loja');
const labels={ACTIVE:'ATIVA',INACTIVE:'INATIVA',DRAFT:'RASCUNHO'};
function StoreManagementSurface({embedded,Modal,children,...props}) {
  if(!embedded)return <Modal {...props}>{children}</Modal>;
  return <section aria-label="Gerenciar Lojas" className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:p-6 space-y-5"><header><h2 className="text-2xl font-bold text-gray-800">Gerenciar Lojas</h2><p className="mt-1 text-sm text-gray-600">Crie e administre as unidades da Ana Guimarães Doceria.</p></header>{children}</section>;
}
const checks={basic:'Cadastro básico',catalog:'Catálogo',schedule:'Agenda',pickup:'Retirada habilitada',delivery:'Entrega habilitada',freight:'Frete quando solicitado',payment:'Pagamento quando solicitado',menu:'Cardápio público / slug'};
export default function StoreManagementModal({isOpen,onClose,Modal,Button,Input,canManage,onSelectStore,onSaved,onConfigure,allowAllOption,allKey,currentStoreId,embedded=false,selectionOnly=false}) {
  const [stores,setStores]=useState([]),[serverOwner,setServerOwner]=useState(false),[cursor,setCursor]=useState(null),[state,setState]=useState('loading'),[error,setError]=useState('');
  const [mode,setMode]=useState('LIST'),[detail,setDetail]=useState(null),[form,setForm]=useState({}),[confirmation,setConfirmation]=useState('');
  const flight=useRef(false),operation=useRef(null),slugDirty=useRef(false),generation=useRef({value:0}),openRequest=useRef(0);
  const owner=canManage && serverOwner && !selectionOnly;
  const load=async(more=false)=>{const token=generation.current.value;setState('loading');try{const {data}=await httpsCallable(functions,'storeManagementRead')({...(more&&cursor?{cursor}:{})});if(token!==generation.current.value)return;setStores(old=>more?[...old,...data.stores]:data.stores);setServerOwner(data.manage_stores===true);setCursor(data.nextCursor);setState('ready');}catch{if(token===generation.current.value){setState('error');setError('Não foi possível carregar as lojas.');}}};
  useEffect(()=>{const scope=generation.current;scope.value++;if(isOpen){setMode('LIST');setError('');setDetail(null);setState('loading');const token=scope.value;httpsCallable(functions,'storeManagementRead')({}).then(({data})=>{if(scope.value===token){setStores(data.stores);setServerOwner(data.manage_stores===true);setCursor(data.nextCursor);setState('ready');}}).catch(()=>{if(scope.value===token){setState('error');setError('Não foi possível carregar as lojas.');}});}return()=>{scope.value++;};},[isOpen]);
  const open=async(row,next='EDIT')=>{const sequence=++openRequest.current,token=generation.current.value;setError('');operation.current=null;setState('loading');try{const {data}=await httpsCallable(functions,'storeManagementRead')({storeId:row.storeId});if(sequence!==openRequest.current||token!==generation.current.value)return;setDetail(data.store);setForm({nome:data.store.legalName,nomePublico:data.store.nomePublico || data.store.nome,publicSlug:data.store.menuSlug || slugFor(data.store.legalName),telefone:data.store.basic?.telefone || '',endereco:data.store.basic?.endereco || '',catalogEnabled:data.store.definition.catalog?.enabled===true,catalogCategory:data.store.definition.catalog?.category || '',onlineEnabled:data.store.definition.onlinePayment?.enabled===true});slugDirty.current=true;setConfirmation('');setMode(next);setState('ready');}catch{if(sequence===openRequest.current&&token===generation.current.value){setError('Não foi possível abrir esta loja.');setState('ready');}}};
  const change=(key,value)=>{operation.current=null;setError('');setForm(old=>({...old,[key]:value}));};
  const save=async action=>{
    if(!owner||flight.current)return;flight.current=true;setState('saving');setError('');const token=generation.current.value;
    operation.current=operation.current || {action,requestId:window.crypto.randomUUID(),...(action==='CREATE'?{patch:form}:{storeId:detail.storeId,expectedRevision:detail.revision,...(action==='UPDATE'?{patch:form}:{confirm:true,...(action==='DELETE'?{confirmName:confirmation}:{})})})};
    try{const {data}=await httpsCallable(functions,action==='CREATE'?'createStore':'storeManagementWrite')(operation.current);if(token!==generation.current.value)return;operation.current=null;await onSaved?.(data);setMode('LIST');await load();if(action==='CREATE')await open({storeId:data.storeId});}
    catch(e){if(token===generation.current.value){setError(e.message?.replace(/^FirebaseError:\s*/,'') || 'Não foi possível salvar a loja.');setState('ready');}}
    finally{flight.current=false;}
  };
  const close=()=>{if(state!=='saving')onClose?.();};
  const select=id=>{onSelectStore(id);if(!embedded)onClose?.();};
  const list=()=>{openRequest.current++;operation.current=null;setError('');setMode('LIST');};
  if(embedded&&!canManage)return null;
  return <StoreManagementSurface embedded={embedded} Modal={Modal} isOpen={isOpen} onClose={close} title={selectionOnly?'Ver lojas':'Gerenciar lojas'} size="lg"><div className="space-y-5">
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {state==='loading'&&<p role="status" className="text-sm text-gray-500">Carregando lojas…</p>}
    {embedded&&state==='ready'&&!serverOwner&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Seu perfil não está autorizado a gerenciar lojas. A seleção continua disponível no seletor superior.</p>}
    {mode==='LIST'?<>
      {owner&&<div className="flex justify-end"><Button disabled={state==='loading'} onClick={()=>{setDetail(null);setForm({nome:'',nomePublico:'',publicSlug:''});slugDirty.current=false;operation.current=null;setError('');setMode('CREATE');}}>+ Nova Loja</Button></div>}
      {allowAllOption&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-gray-50 p-4"><div><strong>Visão Geral</strong><p className="text-sm text-gray-500">Agregação das lojas autorizadas.</p></div><Button variant="secondary" onClick={()=>select(allKey)}>Selecionar</Button></div>}
      <div className={embedded?'grid gap-4 xl:grid-cols-2':'space-y-4'}>{stores.map(row=><div key={row.storeId} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-semibold text-gray-800 break-words">{storeFriendlyName(row.storeId,row)}</h3><p className="text-xs text-gray-500 break-all">ID: {row.storeId}</p>{row.publicSlug&&<p className="text-sm text-gray-500 break-all">/{row.publicSlug}</p>}</div><span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">{labels[row.status] || 'INCOMPLETA'}</span></div>
      {row.kind!=='STORE'&&<p className="text-sm text-amber-800">{row.kind==='CHANNEL'?'Canal/integração':'Legado'} — modelo deve ser validado antes de gerenciar como loja física.</p>}
      <div className="flex items-center justify-between gap-3"><Button variant="secondary" onClick={()=>select(row.storeId)} disabled={row.storeId===currentStoreId}>{row.storeId===currentStoreId?'Selecionada':'Selecionar'}</Button>
      {owner&&row.kind==='STORE'&&<details className="relative"><summary aria-label={'Ações da loja '+row.nome} className="cursor-pointer rounded-lg border px-4 py-2 focus-visible:outline focus-visible:outline-pink-600">⋮</summary><div className="absolute right-0 z-10 mt-1 w-52 rounded-xl border bg-white p-2 shadow-lg space-y-1"><button type="button" className="block w-full rounded p-2 text-left hover:bg-pink-50" onClick={()=>open(row)}>Editar</button><button type="button" className="block w-full rounded p-2 text-left hover:bg-pink-50" onClick={()=>{onConfigure(row.storeId);onClose?.();}}>Configurações</button><button type="button" className="block w-full rounded p-2 text-left hover:bg-pink-50" onClick={()=>open(row,row.status==='ACTIVE'?'DEACTIVATE':'REACTIVATE')}>{row.status==='ACTIVE'?'Inativar':'Reativar'}</button>{row.canDeleteCandidate&&<button type="button" className="block w-full rounded p-2 text-left text-red-700 hover:bg-red-50" onClick={()=>open(row,'DELETE')}>Excluir rascunho</button>}</div></details>}
      </div></div>)}</div>
      {state==='ready'&&!stores.length&&<p className="text-sm text-gray-500">Nenhuma loja autorizada cadastrada.</p>}
      {state==='error'&&<Button variant="secondary" onClick={()=>load()}>Tentar novamente</Button>}
      {cursor&&<Button variant="secondary" disabled={state==='loading'} onClick={()=>load(true)}>Ver mais lojas</Button>}
    </>:<>
      {detail&&<p className="text-sm text-gray-500 break-all">{detail.nome} · ID: {detail.storeId}</p>}
      {['CREATE','EDIT'].includes(mode)?<form className="space-y-4" onSubmit={e=>{e.preventDefault();save(mode==='CREATE'?'CREATE':'UPDATE');}}>
        <Input label="Nome da loja" required maxLength={160} value={form.nome || ''} onChange={e=>{const nome=e.target.value;operation.current=null;setForm(f=>({...f,nome,...(!slugDirty.current?{publicSlug:slugFor(nome)}:{})}));}}/>
        <Input label="Nome público" maxLength={160} value={form.nomePublico || ''} onChange={e=>change('nomePublico',e.target.value)}/>
        <Input label="Telefone da loja" maxLength={300} value={form.telefone || ''} onChange={e=>change('telefone',e.target.value)}/>
        <Input label="Endereço da loja" maxLength={300} value={form.endereco || ''} onChange={e=>change('endereco',e.target.value)}/>
        <p className="text-xs text-gray-500">Dados básicos de exibição. Origem e cálculo de frete, dados fiscais e credenciais continuam em suas configurações próprias.</p>
        <Input label="Slug do cardápio" required value={form.publicSlug || ''} pattern="cardapio-[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} onChange={e=>{slugDirty.current=true;change('publicSlug',e.target.value);}}/>
        <p className="text-xs text-gray-500">O ID técnico é imutável. Slugs antigos publicados permanecem como aliases; o slug do rascunho é confirmado na ativação.</p>
        {mode==='EDIT'&&<fieldset className="space-y-3 rounded-xl border p-4"><legend className="px-2 font-semibold">Publicação do cardápio</legend><label className="flex gap-3 text-sm"><input type="checkbox" checked={form.catalogEnabled} onChange={e=>change('catalogEnabled',e.target.checked)}/>Catálogo habilitado</label><Input label="Categoria do catálogo" value={form.catalogCategory} onChange={e=>change('catalogCategory',e.target.value)}/><label className="flex gap-3 text-sm"><input type="checkbox" checked={form.onlineEnabled} onChange={e=>change('onlineEnabled',e.target.checked)}/>Oferecer pagamento online configurado</label><p className="text-xs text-gray-500">Frete, disponibilidade, agenda, pagamento e dados da empresa continuam nas seções próprias.</p><Button type="button" variant="secondary" onClick={()=>{onConfigure(detail.storeId);onClose?.();}}>Abrir Configurações</Button></fieldset>}
        <div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="secondary" disabled={state==='saving'} onClick={list}>Cancelar</Button><Button type="submit" disabled={state==='saving'}>{state==='saving'?'Salvando…':mode==='CREATE'?'Criar rascunho':'Salvar alterações'}</Button></div>
      </form>:<div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h3 className="font-semibold">{mode==='DELETE'?'Excluir permanentemente':mode==='DEACTIVATE'?'Tem certeza que deseja inativar esta loja?':'Reativar loja'}</h3>
        <p className="text-sm">{mode==='DELETE'?'Esta ação é permanente. Somente um rascunho vazio, nunca publicado e sem dependências pode ser excluído. Se houver histórico, use Inativar.':mode==='DEACTIVATE'?'Esta loja deixará de receber novos pedidos e não aparecerá como opção pública. O histórico será preservado.':'A operação pública depende de todos os requisitos obrigatórios válidos.'}</p>
        {mode==='DELETE'&&<Input label={'Digite o nome da loja: '+detail?.legalName} value={confirmation} onChange={e=>{operation.current=null;setConfirmation(e.target.value);}}/>}
        <div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={state==='saving'} onClick={list}>Cancelar</Button><Button variant={mode==='DELETE'?'danger':'primary'} disabled={state==='saving'||(mode==='DELETE'&&confirmation!==detail?.legalName)||(mode==='REACTIVATE'&&!detail?.ready)} onClick={()=>save(mode)}>{state==='saving'?'Processando…':'Confirmar'}</Button></div>
      </div>}
      {detail?.readiness&&<section className="rounded-xl border p-4"><h3 className="font-semibold">Readiness: {detail.ready?'READY':'INCOMPLETA'}</h3><ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{Object.entries(detail.readiness).map(([key,value])=><li key={key}>{value?'✓':'○'} {checks[key]}</li>)}</ul></section>}
    </>}
  </div></StoreManagementSurface>;
}
