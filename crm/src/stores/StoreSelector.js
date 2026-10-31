import React from 'react';
import {Plus} from 'lucide-react';
export default function StoreSelector({owner,allKey,stores,names,selected,status,onChange,onRetry,canCreate,onCreate,onManage}) {
  const disabled=status!=='ready' || !stores.length;
  return <div className="flex items-center gap-3 flex-wrap">
    <label className="flex items-center gap-2"><span className="text-sm text-gray-500 hidden sm:block">{owner?'Visão:':'Loja:'}</span>
      <select aria-label={owner?'Visão':'Loja'} disabled={disabled} value={disabled?'':selected || ''} onChange={onChange} className="text-sm max-w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-500 disabled:bg-gray-100">
        {disabled?<option value="">{status==='error'?'Lojas indisponíveis':status==='loading'?'Carregando…':'Nenhuma loja cadastrada'}</option>:<>
          {owner && <option value={allKey}>Visão Geral</option>}
          {stores.map(id=><option key={id} value={id}>{names[id] || id}</option>)}
        </>}
      </select>
    </label>
    {status==='error' && <div role="alert" className="text-sm"><span>Não foi possível carregar as lojas. </span><button type="button" className="underline text-pink-600" onClick={onRetry}>Tentar novamente</button></div>}
    {canCreate && <button type="button" onClick={onCreate} title="Adicionar Loja" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-pink-50"><Plus className="w-4 h-4"/><span className="hidden sm:inline">Adicionar Loja</span><span className="sr-only sm:hidden">Adicionar Loja</span></button>}
    {onManage&&<button type="button" onClick={onManage} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-pink-50">{canCreate?'Gerenciar lojas':'Ver lojas'}</button>}
  </div>;
}
