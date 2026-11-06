import React,{useState} from 'react';
import CrmHome from './CrmHome';
import {isPublicHomeLocation} from './storeRoutes.mjs';

// The explicit public fallback renders the existing public home, without mounting
// the authenticated gate or changing its Auth/context redirect rules.
export default function ApplicationEntry({Application}) {
  const [image,setImage]=useState(null);
  if(!isPublicHomeLocation(window.location)) return <Application/>;
  return <div className="min-h-screen bg-gray-50">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b bg-white p-4">
      <img src="/logotipo.png" alt="Ana Guimarães Doceria" className="h-10"/>
      <nav aria-label="Navegação pública" className="flex flex-wrap gap-4"><a href="/area-cliente" className="text-pink-700">Minha Conta</a><a href="/" className="text-gray-700">Acessar o sistema</a></nav>
    </header>
    <main><CrmHome onImageClick={setImage}/></main>
    {image && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Imagem ampliada">
      <button autoFocus type="button" onClick={()=>setImage(null)} className="absolute right-4 top-4 rounded bg-white p-3">Fechar imagem</button>
      <img src={image} alt="Destaque da doceria" className="max-h-full max-w-full"/>
    </div>}
  </div>;
}
