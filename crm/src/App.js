import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  LayoutDashboard, Users, ShoppingCart, Package, Calendar, Truck, DollarSign, BarChart3,
  Search, Bell, Menu, User as UserIcon, Settings, LogOut, Plus, Heart,
  Clock, Edit, Trash2, Eye, X, Save, MessageCircle, Cake, Gift, ChevronLeft, ChevronRight, Printer, Home, BookOpen, Instagram, MapPin, Image as ImageIcon, MessageSquare, VolumeX, ArrowUpCircle, ArrowDownCircle, Banknote, PackagePlus, Ticket,
  Key // Ícone adicionado
} from 'lucide-react';

// --- CORREÇÃO ---
// Importando 'functions' do seu arquivo de configuração do Firebase.
import { auth, db, storage, functions } from './firebaseConfig.js';
//import { firebaseConfig } from './firebaseConfig.js';

// --- CORREÇÃO ---
// Importando 'httpsCallable' para poder chamar suas Cloud Functions.
import { httpsCallable } from "firebase/functions";

// Importações do Firebase SDK
// ATUALIZADO: Adicionado GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from "firebase/auth";
// CORRIGIDO: Adicionado 'getDocs' à importação
import { collection, onSnapshot, query, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, where, getDocs, serverTimestamp, arrayUnion } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- CORREÇÃO: Importa o novo AudioManager ---
import { audioManager } from './utils/AudioManager.js';
import { registerDeviceForPush, listenForForegroundMessages, subscribeToServiceWorkerMessages } from './utils/notifications.js';

// --- importação para Android
import { NativeAudio } from '@capacitor-community/native-audio';
import { Capacitor } from '@capacitor/core';

// ✅ CORREÇÃO: URL alterada para o Firebase Storage para evitar erro de CORS
const ALARM_SOUND_URL = "https://firebasestorage.googleapis.com/v0/b/crmdoceria-9959e.firebasestorage.app/o/audio%2Fmixkit-vintage-warning-alarm-990.wav?alt=media&token=6277f61e-51ab-413e-88d8-afef7835e465"; // <-- URL de exemplo, troque pela sua

const DEFAULT_FORNECEDOR_CATEGORIES = [
  'Insumos',
  'Embalagens',
  'Bebidas',
  'Entregador',
  'Decoração',
  'Serviços'
];

const DEFAULT_SUBCATEGORIES = {
  Delivery: [
    'Queridinhos',
    'Mousse',
    'Palha Italiana',
    'Bolo no pote',
    'Copo da felicidade',
    'Bombom aberto',
    'Pipoca',
    'Cone recheado',
    'Bolo gelado',
    'Bombom recheado'
  ],
  Festa: [
    'Bolo',
    'Docinhos',
    'Bombom',
    'Doces finos',
    'Bem casados',
    'Cupcakes'
  ]
};


// Hook customizado para estado persistente na sessão
const usePersistentState = (key, defaultValue) => {
  // Inicializa o estado apenas uma vez com o valor do sessionStorage
  const [state, setState] = useState(() => {
    try {
      const storedValue = sessionStorage.getItem(key);
      return storedValue ? JSON.parse(storedValue) : defaultValue;
    } catch (error) {
      console.error('Erro ao ler do sessionStorage', error);
      return defaultValue;
    }
  });

  // Referência para evitar salvar no primeiro render
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Pula o primeiro render
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error('Erro ao salvar no sessionStorage', error);
    }
  }, [key, state]);

  return [state, setState];
};


// Componentes de UI
const Modal = ({ isOpen, onClose, title, children, size = "md" }) => {
  if (!isOpen) return null;
  const sizeClasses = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return ( <div className="fixed inset-0 z-50 flex items-center justify-center p-4"> <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} /> <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizeClasses[size]} max-h-[90vh] flex flex-col`}> <div className="flex items-center justify-between p-6 border-b border-gray-100"> <h2 className="text-xl font-semibold text-gray-800">{title}</h2> <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"> <X className="w-5 h-5" /> </button> </div> <div className="p-6 overflow-y-auto"> {children} </div> </div> </div> );
};
const Button = ({ children, variant = "primary", size = "md", onClick, className = "", disabled = false, type = "button" }) => {
  const baseClasses = "font-medium rounded-xl transition-all flex items-center gap-2 justify-center";
  const variants = { primary: "bg-gradient-to-r from-pink-500 to-rose-600 text-white hover:from-pink-600 hover:to-rose-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5", secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 shadow-md hover:shadow-lg", danger: "bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl" };
  const sizes = { sm: "px-4 py-2 text-sm", md: "px-6 py-3", lg: "px-8 py-4 text-lg" };
  return (<button type={type} onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>{children}</button>);
};
const Input = ({ label, error, className = "", ...props }) => (<div className="space-y-1 w-full">{label && <label className="block text-sm font-medium text-gray-700">{label}</label>}<input {...props} className={`w-full px-4 py-3 border rounded-xl transition-all focus:ring-2 focus:ring-pink-500 focus:border-transparent ${error ? 'border-red-300' : 'border-gray-300'} ${className}`} />{error && <p className="text-sm text-red-600">{error}</p>}</div>);
const Textarea = ({ label, error, className = "", ...props }) => (<div className="space-y-1">{label && <label className="block text-sm font-medium text-gray-700">{label}</label>}<textarea {...props} className={`w-full px-4 py-3 border rounded-xl transition-all focus:ring-2 focus:ring-pink-500 focus:border-transparent ${error ? 'border-red-300' : 'border-gray-300'} ${className}`} />{error && <p className="text-sm text-red-600">{error}</p>}</div>);
const Select = ({ label, error, className = "", children, ...props }) => (<div className="space-y-1 w-full">{label && <label className="block text-sm font-medium text-gray-700">{label}</label>}<select {...props} className={`w-full px-4 py-3 border rounded-xl transition-all focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white ${error ? 'border-red-300' : 'border-gray-300'} ${className}`}>{children}</select>{error && <p className="text-sm text-red-600">{error}</p>}</div>);

// Componente de Tabela Responsiva
const Table = ({ columns, data, actions = [] }) => (
    <>
        {/* Visualização de Tabela para Desktop */}
        <div className="hidden md:block print:block bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden print:shadow-none print:border print:border-gray-200">
            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                        <tr>
                            {columns.map((col, index) => (<th key={index} className="px-6 py-4 text-left text-sm font-semibold text-gray-700">{col.header}</th>))}
                            {actions.length > 0 && <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">Ações</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {(data || []).map((row, rowIndex) => (
                            <tr key={row.id || row.uid || rowIndex} className="hover:bg-gradient-to-r hover:from-pink-50/50 hover:to-rose-50/50 transition-all">
                                {columns.map((col, colIndex) => (
                                    <td key={colIndex} className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">{col.render ? col.render(row) : row[col.key]}</td>
                                ))}
                                {actions.length > 0 && (
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {actions.map((action, actionIndex) => (
                                                <button key={actionIndex} onClick={() => action.onClick(row)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title={action.label}>
                                                    <action.icon className="w-4 h-4 text-gray-600" />
                                                </button>
                                            ))}
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Visualização de Cards para Celular */}
        <div className="block md:hidden space-y-4 print:hidden">
            {(data || []).map((row, rowIndex) => (
                <div key={row.id || row.uid || rowIndex} className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 space-y-2">
                    {columns.map((col, colIndex) => {
                        const content = col.render ? col.render(row) : row[col.key];
                        if (content === '-' || content === null || content === undefined) return null;

                        return (
                             <div key={colIndex} className={`text-sm ${colIndex === 0 ? 'font-bold text-lg text-pink-600' : ''}`}>
                                {colIndex > 0 && <p className="text-xs text-gray-500">{col.header}</p>}
                                <div className={colIndex === 0 ? 'mt-0' : 'mt-1'}>{content}</div>
                             </div>
                        )
                    })}
                    {actions.length > 0 && (
                        <div className="flex justify-end gap-2 pt-3 mt-2 border-t border-gray-100">
                            {actions.map((action, actionIndex) => (
                                <button key={actionIndex} onClick={() => action.onClick(row)} className="flex items-center gap-2 p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm text-gray-700" title={action.label}>
                                    <action.icon className="w-4 h-4" />
                                    <span>{action.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    </>
);


// Helper function
const getJSDate = (firestoreTimestamp) => {
  if (!firestoreTimestamp) return null;
  if (typeof firestoreTimestamp.toDate === 'function') {
    return firestoreTimestamp.toDate();
  }
  const date = new Date(firestoreTimestamp);
  return isNaN(date.getTime()) ? null : date;
};

// --- NOVOS COMPONENTES ---

const Fornecedores = ({ data, addItem, updateItem, deleteItem, setConfirmDelete }) => {
    const [activeTab, setActiveTab] = usePersistentState('fornecedores_activeTab', 'fornecedores');

    // States
    const [searchTerm, setSearchTerm] = usePersistentState('fornecedores_searchTerm', '');

    const [showFornecedorModal, setShowFornecedorModal] = useState(false);

    const [editingFornecedor, setEditingFornecedor] = useState(null);
    const [fornecedorFormData, setFornecedorFormData] = useState({});

    const [showPedidoModal, setShowPedidoModal] = useState(false);
    const [editingPedido, setEditingPedido] = useState(null);
    const [pedidoFormData, setPedidoFormData] = useState({ fornecedorId: '', itens: [], valorTotal: 0, dataPedido: new Date().toISOString().split('T')[0], dataPrevistaEntrega: '', status: 'Pendente' });

    const [showEstoqueModal, setShowEstoqueModal] = useState(false);
    const [editingEstoque, setEditingEstoque] = useState(null);
    const [estoqueFormData, setEstoqueFormData] = useState({});
	
	const [showCategoriaModal, setShowCategoriaModal] = useState(false);
    const [novaCategoria, setNovaCategoria] = useState('');

    const fornecedorCategorias = useMemo(() => {
        const categoriasFromDb = (data.fornecedorCategorias || [])
            .map(categoria => categoria.nome)
            .filter(Boolean);
        const categoriasFromFornecedores = (data.fornecedores || [])
            .map(fornecedor => fornecedor.categoria)
            .filter(Boolean);
        const categoriasFromEstoque = (data.estoque || [])
            .map(item => item.categoria)
            .filter(Boolean);
        const combined = [
            ...DEFAULT_FORNECEDOR_CATEGORIES,
            ...categoriasFromDb,
            ...categoriasFromFornecedores,
            ...categoriasFromEstoque
        ];
        return Array.from(new Set(combined.map(categoria => categoria.trim())))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }, [data.fornecedorCategorias, data.fornecedores, data.estoque]);

    const resetFornecedorForm = useCallback(() => setFornecedorFormData({ nome: '', cnpj_cpf: '', contato_telefone: '', contato_email: '', contato_whatsapp: '', endereco_completo: '', endereco_cep: '', categoria: fornecedorCategorias[0] || '', dados_bancarios: '', observacoes: '', status: 'Ativo' }), [fornecedorCategorias]);
    const resetPedidoForm = () => setPedidoFormData({ fornecedorId: '', itens: [], valorTotal: 0, dataPedido: new Date().toISOString().split('T')[0], dataPrevistaEntrega: '', status: 'Pendente' });
    const resetEstoqueForm = useCallback(() => setEstoqueFormData({ nome: '', categoria: fornecedorCategorias[0] || '', fornecedorId: '', quantidade: '', unidade: 'un', custoUnitario: '', nivelMinimo: '' }), [fornecedorCategorias]);

    const handleAddCategoria = async (e) => {
        e.preventDefault();
        const categoriaNome = (novaCategoria || '').trim();
        if (!categoriaNome) {
            return;
        }

        const categoriaJaExiste = fornecedorCategorias.some(
            categoria => categoria.toLowerCase() === categoriaNome.toLowerCase()
        );

        if (categoriaJaExiste) {
            setFornecedorFormData(prev => ({ ...prev, categoria: categoriaNome }));
            setNovaCategoria('');
            setShowCategoriaModal(false);
            return;
        }

        await addItem('fornecedorCategorias', { nome: categoriaNome });
        setFornecedorFormData(prev => ({ ...prev, categoria: categoriaNome }));
        setNovaCategoria('');
        setShowCategoriaModal(false);
    };
    
	useEffect(() => {
		const total = (pedidoFormData.itens || []).reduce((sum, item) => 
			sum + ((item.quantidade || 0) * (item.custoUnitario || 0)), 0
		);
		
		// Só atualiza se mudou para evitar loop
		if (total !== pedidoFormData.valorTotal) {
			setPedidoFormData(prev => ({ ...prev, valorTotal: total }));
		}
	}, [pedidoFormData.itens, pedidoFormData.valorTotal]);

    // Memoized Filters
    const filteredFornecedores = useMemo(() => (data.fornecedores || []).filter(f => (f.nome && f.nome.toLowerCase().includes(searchTerm.toLowerCase())) || (f.categoria && f.categoria.toLowerCase().includes(searchTerm.toLowerCase()))), [data.fornecedores, searchTerm]);
    const pedidosComNomes = useMemo(() => (data.pedidosCompra || []).map(pedido => ({ ...pedido, fornecedorNome: data.fornecedores.find(f => f.id === pedido.fornecedorId)?.nome || 'N/A' })), [data.pedidosCompra, data.fornecedores]);
    const estoqueComNomes = useMemo(() => (data.estoque || []).map(item => ({ ...item, fornecedorNome: data.fornecedores.find(f => f.id === item.fornecedorId)?.nome || 'N/A' })), [data.estoque, data.fornecedores]);


    // Handlers Fornecedores
    const handleNewFornecedor = () => { setEditingFornecedor(null); resetFornecedorForm(); setShowFornecedorModal(true); };
    const handleEditFornecedor = (fornecedor) => { setEditingFornecedor(fornecedor); setFornecedorFormData(fornecedor); setShowFornecedorModal(true); };
    const handleFornecedorSubmit = async (e) => { e.preventDefault(); if (editingFornecedor) { await updateItem('fornecedores', editingFornecedor.id, fornecedorFormData); } else { await addItem('fornecedores', fornecedorFormData); } setShowFornecedorModal(false); };

    // Handlers Pedidos de Compra
    const handleNewPedido = () => { setEditingPedido(null); resetPedidoForm(); setShowPedidoModal(true); };
    const handleEditPedido = (pedido) => { setEditingPedido(pedido); setPedidoFormData({ ...pedido, dataPedido: pedido.dataPedido?.split('T')[0] || '', dataPrevistaEntrega: pedido.dataPrevistaEntrega?.split('T')[0] || '' }); setShowPedidoModal(true); };
    const handlePedidoSubmit = async (e) => { e.preventDefault(); if (editingPedido) { await updateItem('pedidosCompra', editingPedido.id, pedidoFormData); } else { await addItem('pedidosCompra', pedidoFormData); } setShowPedidoModal(false); };
    const handleUpdatePedidoStatus = async (pedido, status) => { await updateItem('pedidosCompra', pedido.id, { ...pedido, status }); if (status === 'Recebido') { const conta = { descricao: `Compra de ${pedido.fornecedorNome}`, valor: pedido.valorTotal, dataVencimento: new Date().toISOString().split('T')[0], status: 'Pendente', categoria: 'Fornecedores', pedidoCompraId: pedido.id }; await addItem('contas_a_pagar', conta); alert('Conta a pagar gerada no financeiro!'); } };
    const handleAddItemToPedido = (item) => { setPedidoFormData(prev => ({...prev, itens: [...(prev.itens || []), {...item, quantidade: 1, custoUnitario: item.custoUnitario || 0}]}))};
    const handleUpdateItemInPedido = (index, field, value) => { const newItens = [...pedidoFormData.itens]; newItens[index][field] = value; setPedidoFormData(prev => ({...prev, itens: newItens})) };
    const handleRemoveItemFromPedido = (index) => { const newItens = pedidoFormData.itens.filter((_, i) => i !== index); setPedidoFormData(prev => ({...prev, itens: newItens}));};

    // Handlers Estoque
    const handleNewEstoque = () => { setEditingEstoque(null); resetEstoqueForm(); setShowEstoqueModal(true); };
    const handleEditEstoque = (item) => { setEditingEstoque(item); setEstoqueFormData(item); setShowEstoqueModal(true); };
    const handleEstoqueSubmit = async (e) => { e.preventDefault(); const dataToSave = { ...estoqueFormData, quantidade: parseFloat(estoqueFormData.quantidade || 0), custoUnitario: parseFloat(estoqueFormData.custoUnitario || 0), nivelMinimo: parseFloat(estoqueFormData.nivelMinimo || 0) }; if (editingEstoque) { await updateItem('estoque', editingEstoque.id, dataToSave); } else { await addItem('estoque', dataToSave); } setShowEstoqueModal(false); };

    // UI Rendering
    return (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
            <div><h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Gestão de Fornecedores/Estoque</h1><p className="text-gray-600 mt-1">Organize seus parceiros, compras e insumos</p></div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-2"><div className="flex space-x-2">
                {['fornecedores', 'pedidos', 'estoque'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        {tab === 'fornecedores' && 'Fornecedores'}{tab === 'pedidos' && 'Pedidos de Compra'}{tab === 'estoque' && 'Estoque'}
                    </button>
                ))}
            </div></div>
            
            {activeTab === 'fornecedores' && (
                <div>
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
                        <div className="relative max-w-md w-full"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Buscar por nome ou categoria..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500" /></div>
                        <Button onClick={handleNewFornecedor} className="w-full md:w-auto"><Plus className="w-4 h-4" /> Novo Fornecedor</Button>
                    </div>
                    <Table columns={[{ header: 'Fornecedor', key: 'nome' }, { header: 'Telefone', key: 'contato_telefone' }, { header: 'Categoria', key: 'categoria' }, { header: "Status", render: (row) => (<span className={`px-3 py-1 rounded-full text-xs font-medium ${row.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{row.status}</span>) }]} data={filteredFornecedores} actions={[{ icon: Edit, label: "Editar", onClick: handleEditFornecedor }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('fornecedores', row.id) }) }]} />
                </div>
            )}
            {activeTab === 'pedidos' && (
                 <div>
                    <div className="flex justify-end mb-6"><Button onClick={handleNewPedido}><Plus className="w-4 h-4" /> Novo Pedido de Compra</Button></div>
                    <Table columns={[{ header: 'Fornecedor', key: 'fornecedorNome' }, { header: 'Data do Pedido', render: (row) => getJSDate(row.dataPedido)?.toLocaleDateString('pt-BR') || '-' }, { header: 'Previsão de Entrega', render: (row) => getJSDate(row.dataPrevistaEntrega)?.toLocaleDateString('pt-BR') || '-' }, { header: 'Valor Total', render: (row) => `R$ ${(row.valorTotal || 0).toFixed(2)}`}, { header: 'Status', render: (row) => <span className={`px-3 py-1 rounded-full text-xs font-medium ${row.status === 'Recebido' ? 'bg-green-100 text-green-800' : row.status === 'Pendente' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>{row.status}</span> }]} data={pedidosComNomes} actions={[{ icon: Edit, label: "Editar", onClick: handleEditPedido }, { icon: Truck, label: "Receber", onClick: (row) => handleUpdatePedidoStatus(row, 'Recebido') }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('pedidosCompra', row.id) }) }]} />
                </div>
            )}
             {activeTab === 'estoque' && (
                 <div>
                    <div className="flex justify-end mb-6"><Button onClick={handleNewEstoque}><PackagePlus className="w-4 h-4" /> Novo Item de Estoque</Button></div>
                    <Table 
                        columns={[
                            { header: 'Item', key: 'nome' },
                            { header: 'Fornecedor', key: 'fornecedorNome' },
                            { header: 'Quantidade', render: (row) => `${row.quantidade || 0} ${row.unidade}` },
                            { header: 'Custo Unitário', render: (row) => `R$ ${(row.custoUnitario || 0).toFixed(2)}` },
                            { header: 'Status', render: (row) => {
                                const nivel = row.quantidade; const min = row.nivelMinimo;
                                let status = { text: 'OK', className: 'bg-green-100 text-green-800' };
                                if(nivel <= min) status = { text: 'Baixo', className: 'bg-yellow-100 text-yellow-800' };
                                if(nivel <= 0) status = { text: 'Crítico', className: 'bg-red-100 text-red-800' };
                                return <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.className}`}>{status.text}</span>;
                            }}
                        ]}
                        data={estoqueComNomes}
                        actions={[ { icon: Edit, label: "Editar", onClick: handleEditEstoque }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('estoque', row.id) }) } ]}
                    />
                </div>
            )}

            <Modal isOpen={showFornecedorModal} onClose={() => setShowFornecedorModal(false)} title={editingFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'} size="lg">
                <form onSubmit={handleFornecedorSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Input label="Nome/Razão Social" value={fornecedorFormData.nome || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, nome: e.target.value})} required/><Input label="CNPJ/CPF" value={fornecedorFormData.cnpj_cpf || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, cnpj_cpf: e.target.value})}/><Input label="Telefone" value={fornecedorFormData.contato_telefone || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, contato_telefone: e.target.value})}/><Input label="Email" type="email" value={fornecedorFormData.contato_email || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, contato_email: e.target.value})}/><Input label="Endereço Completo" value={fornecedorFormData.endereco_completo || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, endereco_completo: e.target.value})}/><div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label><div className="flex flex-col md:flex-row md:items-end gap-3"><div className="flex-1"><select className="w-full px-4 py-3 border rounded-xl transition-all focus:ring-2 focus:ring-pink-500 focus:border-transparent bg-white border-gray-300" value={fornecedorFormData.categoria || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, categoria: e.target.value})}><option value="">Selecione...</option>{fornecedorCategorias.map(categoria => (<option key={categoria} value={categoria}>{categoria}</option>))}</select></div><Button type="button" variant="secondary" size="sm" className="h-[52px]" onClick={() => { setNovaCategoria(''); setShowCategoriaModal(true); }}><Plus className="w-4 h-4" /> Nova Categoria</Button></div></div></div>
                    <Textarea label="Dados Bancários" rows="2" value={fornecedorFormData.dados_bancarios || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, dados_bancarios: e.target.value})}/>
                    <Textarea label="Observações" rows="2" value={fornecedorFormData.observacoes || ''} onChange={e => setFornecedorFormData({...fornecedorFormData, observacoes: e.target.value})}/>
                    <div className="flex justify-end gap-3 pt-4"><Button variant="secondary" type="button" onClick={() => setShowFornecedorModal(false)}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4"/> Salvar</Button></div>
                </form>
            </Modal>
			<Modal isOpen={showCategoriaModal} onClose={() => { setShowCategoriaModal(false); setNovaCategoria(''); }} title="Nova Categoria de Fornecedor">
                <form onSubmit={handleAddCategoria} className="space-y-4">
                    <Input label="Nome da Categoria" value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} required autoFocus />
                    <div className="flex justify-end gap-3 pt-2"><Button variant="secondary" type="button" onClick={() => { setShowCategoriaModal(false); setNovaCategoria(''); }}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4"/> Salvar</Button></div>
                </form>
            </Modal>
            <Modal isOpen={showPedidoModal} onClose={() => setShowPedidoModal(false)} title={editingPedido ? 'Editar Pedido de Compra' : 'Novo Pedido de Compra'} size="xl">
                <form onSubmit={handlePedidoSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select label="Fornecedor" value={pedidoFormData.fornecedorId || ''} onChange={e => setPedidoFormData({...pedidoFormData, fornecedorId: e.target.value, fornecedorNome: e.target.selectedOptions[0].text })} required><option value="">Selecione...</option>{data.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</Select>
                        <Input label="Data do Pedido" type="date" value={pedidoFormData.dataPedido || ''} onChange={e => setPedidoFormData({...pedidoFormData, dataPedido: e.target.value})} required/>
                        <Input label="Previsão de Entrega" type="date" value={pedidoFormData.dataPrevistaEntrega || ''} onChange={e => setPedidoFormData({...pedidoFormData, dataPrevistaEntrega: e.target.value})} />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <h3 className="font-semibold">Adicionar Itens do Estoque</h3>
                            <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                                {data.estoque.map(item => (<div key={item.id} className="flex justify-between items-center p-2 rounded hover:bg-gray-50"><span>{item.nome}</span><Button size="sm" variant="secondary" onClick={() => handleAddItemToPedido(item)}>+</Button></div>))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-semibold">Itens no Pedido</h3>
                            <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                                {(pedidoFormData.itens || []).length === 0 ? <p className="text-sm text-gray-500 text-center p-4">Nenhum item</p> : 
                                (pedidoFormData.itens || []).map((item, index) => (
                                    <div key={index} className="grid grid-cols-4 gap-2 items-center p-1">
                                        <span className="col-span-2 text-sm">{item.nome}</span>
                                        <Input type="number" placeholder="Qtd" value={item.quantidade} onChange={e => handleUpdateItemInPedido(index, 'quantidade', parseFloat(e.target.value || 0))} className="py-1"/>
                                        <div className="flex items-center gap-1">
                                        <Input type="number" step="0.01" placeholder="Custo" value={item.custoUnitario} onChange={e => handleUpdateItemInPedido(index, 'custoUnitario', parseFloat(e.target.value || 0))} className="py-1"/>
                                        <button type="button" onClick={() => handleRemoveItemFromPedido(index)} className="text-red-500"><Trash2 size={14}/></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="text-right font-bold text-lg mt-2">Total: R$ {(pedidoFormData.valorTotal || 0).toFixed(2)}</div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4"><Button variant="secondary" type="button" onClick={() => setShowPedidoModal(false)}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4"/> Salvar Pedido</Button></div>
                </form>
            </Modal>
            <Modal isOpen={showEstoqueModal} onClose={() => setShowEstoqueModal(false)} title={editingEstoque ? 'Editar Item de Estoque' : 'Novo Item de Estoque'} size="lg">
                <form onSubmit={handleEstoqueSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Nome do Item" value={estoqueFormData.nome || ''} onChange={e => setEstoqueFormData({...estoqueFormData, nome: e.target.value})} required/>
                        <Select label="Categoria" value={estoqueFormData.categoria || ''} onChange={e => setEstoqueFormData({...estoqueFormData, categoria: e.target.value})}>
                            <option value="">Selecione...</option>
                            {fornecedorCategorias.map(categoria => (
                                <option key={categoria} value={categoria}>{categoria}</option>
                            ))}
                        </Select>
                        <Select label="Fornecedor Principal" value={estoqueFormData.fornecedorId || ''} onChange={e => setEstoqueFormData({...estoqueFormData, fornecedorId: e.target.value})}><option value="">Nenhum</option>{data.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</Select>
                        <Input label="Custo por Unidade (R$)" type="number" step="0.01" value={estoqueFormData.custoUnitario || ''} onChange={e => setEstoqueFormData({...estoqueFormData, custoUnitario: e.target.value})} />
                        <Input label="Quantidade Atual" type="number" value={estoqueFormData.quantidade || ''} onChange={e => setEstoqueFormData({...estoqueFormData, quantidade: e.target.value})} required/>
                        <Select label="Unidade de Medida" value={estoqueFormData.unidade || ''} onChange={e => setEstoqueFormData({...estoqueFormData, unidade: e.target.value})}><option>un</option><option>kg</option><option>g</option><option>L</option><option>ml</option></Select>
                        <Input label="Nível Mínimo de Estoque" type="number" value={estoqueFormData.nivelMinimo || ''} onChange={e => setEstoqueFormData({...estoqueFormData, nivelMinimo: e.target.value})} />
                    </div>
                    <div className="flex justify-end gap-3 pt-4"><Button variant="secondary" type="button" onClick={() => setShowEstoqueModal(false)}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4"/> Salvar Item</Button></div>
                </form>
            </Modal>
        </div>
    );
};


const Financeiro = ({ data, addItem, updateItem, deleteItem, setConfirmDelete }) => {
    const [activeTab, setActiveTab] = usePersistentState('financeiro_activeTab', 'dashboard');
    const [modalConfig, setModalConfig] = useState({ isOpen: false, type: null, item: null });
    const [formData, setFormData] = useState({});
    const chartsRef = useRef({});
    const [startDate, setStartDate] = usePersistentState('financeiro_startDate', '');
    const [endDate, setEndDate] = usePersistentState('financeiro_endDate', '');
    const [despesaFilter, setDespesaFilter] = usePersistentState('financeiro_despesaFilter', 'Todas');

    const monthlyChartRef = useRef(null);
    const categoryChartRef = useRef(null);
    
	useEffect(() => {
		if (activeTab !== 'dashboard' || !monthlyChartRef.current || !categoryChartRef.current || typeof window.Chart === 'undefined') {
			return;
		}

		// Destrói gráficos existentes
        const existingCharts = Object.values(chartsRef.current);
		existingCharts.forEach(chart => {
			if (chart && typeof chart.destroy === 'function') {
				chart.destroy();
			}
		});

		const monthlyCtx = monthlyChartRef.current.getContext('2d');
		const monthlyData = {
			labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
			datasets: [
				{ label: 'Receitas', data: Array(12).fill(0), backgroundColor: 'rgba(34, 197, 94, 0.6)' },
				{ label: 'Despesas', data: Array(12).fill(0), backgroundColor: 'rgba(239, 68, 68, 0.6)' }
			]
		};
		
		const allReceitas = [
			...(data.pedidos || []).filter(p => p.status === 'Finalizado'),
			...(data.contas_a_receber || []).filter(r => r.status === 'Recebido')
		];

		allReceitas.forEach(item => {
			const date = getJSDate(item.createdAt || item.dataRecebimento);
			if (date) monthlyData.datasets[0].data[date.getMonth()] += (item.total || item.valor || 0);
		});

		(data.contas_a_pagar || []).forEach(item => {
			if (item.status === 'Pago') {
				const date = getJSDate(item.dataVencimento);
				if (date) monthlyData.datasets[1].data[date.getMonth()] += item.valor;
			}
		});
		
		const monthlyChart = new window.Chart(monthlyCtx, { 
			type: 'bar', 
			data: monthlyData, 
			options: { 
				responsive: true, 
				plugins: { 
					title: { display: true, text: 'Fluxo de Caixa Mensal' } 
				} 
			} 
		});

		const categoryCtx = categoryChartRef.current.getContext('2d');
		const categoryData = (data.contas_a_pagar || [])
			.filter(i => i.status === 'Pago')
			.reduce((acc, item) => {
				acc[item.categoria] = (acc[item.categoria] || 0) + item.valor;
				return acc;
			}, {});
			
		const pieChart = new window.Chart(categoryCtx, { 
			type: 'pie', 
			data: { 
				labels: Object.keys(categoryData), 
				datasets: [{ 
					data: Object.values(categoryData), 
					backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'] 
				}] 
			}, 
			options: { 
				responsive: true, 
				plugins: { 
					title: { display: true, text: 'Despesas por Categoria' } 
				} 
			} 
		});

        chartsRef.current = { monthlyChart, pieChart };

		return () => {
			if (monthlyChart) monthlyChart.destroy();
			if (pieChart) pieChart.destroy();
		};
	}, [activeTab, data.pedidos, data.contas_a_receber, data.contas_a_pagar]);

    const financialSummary = useMemo(() => {
        const receitas = (data.contas_a_receber || []).filter(r => r.status === 'Recebido');
        const despesas = (data.contas_a_pagar || []).filter(p => p.status === 'Pago');

        const totalReceitas = receitas.reduce((sum, item) => sum + (item.valor || 0), 0);
        const totalDespesas = despesas.reduce((sum, item) => sum + (item.valor || 0), 0);
        const lucroLiquido = totalReceitas - totalDespesas;
        
        const aReceber = (data.contas_a_receber || []).filter(r => r.status === 'Pendente').reduce((sum, item) => sum + (item.valor || 0), 0);
        const aPagar = (data.contas_a_pagar || []).filter(p => p.status === 'Pendente').reduce((sum, item) => sum + (item.valor || 0), 0);

        return { totalReceitas, totalDespesas, lucroLiquido, aReceber, aPagar };
    }, [data.contas_a_receber, data.contas_a_pagar]);

    const handleNew = (type) => {
        const baseData = type === 'pagar' ? 
            { descricao: '', valor: '', dataVencimento: '', status: 'Pendente', categoria: 'Fornecedores' } :
            { descricao: '', valor: '', dataRecebimento: '', status: 'Pendente', metodo: 'Pix' };

        if (type === 'pagar' && despesaFilter !== 'Todas') {
            baseData.categoria = despesaFilter;
        }

        setFormData(baseData);
        setModalConfig({ isOpen: true, type, item: null });
    };

    const handleEdit = (type, item) => {
        const itemData = { ...item, valor: String(item.valor) };
        if(type === 'pagar' && item.dataVencimento) itemData.dataVencimento = getJSDate(item.dataVencimento)?.toISOString().split('T')[0];
        if(type === 'receber' && item.dataRecebimento) itemData.dataRecebimento = getJSDate(item.dataRecebimento)?.toISOString().split('T')[0];
        setFormData(itemData);
        setModalConfig({ isOpen: true, type, item });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const collection = modalConfig.type === 'pagar' ? 'contas_a_pagar' : 'contas_a_receber';
        const dataToSave = { ...formData, valor: parseFloat(formData.valor || 0) };
        
        if (modalConfig.item) {
            await updateItem(collection, modalConfig.item.id, dataToSave);
        } else {
            await addItem(collection, dataToSave);
        }
        setModalConfig({ isOpen: false, type: null, item: null });
    };

    const handleStatusChange = async (type, item, newStatus) => {
        const collection = type === 'pagar' ? 'contas_a_pagar' : 'contas_a_receber';
        await updateItem(collection, item.id, { status: newStatus });
    };

    const renderDashboard = () => (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg"><ArrowUpCircle className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Receita Total (Pago)</p><h2 className="text-2xl font-bold text-gray-800">R$ {financialSummary.totalReceitas.toFixed(2)}</h2></div></div></div>
                <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg"><ArrowDownCircle className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Despesa Total (Pago)</p><h2 className="text-2xl font-bold text-gray-800">R$ {financialSummary.totalDespesas.toFixed(2)}</h2></div></div></div>
                <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg"><DollarSign className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Lucro Líquido</p><h2 className="text-2xl font-bold text-gray-800">R$ {financialSummary.lucroLiquido.toFixed(2)}</h2></div></div></div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 bg-white p-6 rounded-2xl shadow-lg">
                    <canvas ref={monthlyChartRef}></canvas>
                </div>
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg">
                     <canvas ref={categoryChartRef}></canvas>
                </div>
            </div>
        </div>
    );
    
    const getStatusClass = (status) => {
        switch (status) {
            case 'Pendente': return 'bg-yellow-100 text-yellow-800';
            case 'Pago':
            case 'Recebido': return 'bg-green-100 text-green-800';
            case 'Atrasado': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const renderContas = (type) => {
        const collection = type === 'pagar' ? 'contas_a_pagar' : 'contas_a_receber';
        let title = type === 'pagar' ? 'Despesas' : 'Contas a Receber';
        let items = data[collection] || [];

        if (type === 'pagar' && despesaFilter !== 'Todas') {
            items = items.filter(item => item.categoria === despesaFilter);
        }

        const columns = [
            { header: 'Descrição', key: 'descricao' },
            { header: 'Valor', render: (row) => <span className="font-semibold text-gray-800">R$ {(row.valor || 0).toFixed(2)}</span> },
            { header: type === 'pagar' ? 'Vencimento' : 'Data', render: (row) => { const date = getJSDate(type === 'pagar' ? row.dataVencimento : row.dataRecebimento); return date ? date.toLocaleDateString('pt-BR') : '-'; } },
            { header: 'Categoria', key: 'categoria', visible: type === 'pagar' },
            { header: 'Método', key: 'metodo', visible: type === 'receber' },
            { header: 'Status', render: (row) => <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusClass(row.status)}`}>{row.status}</span> }
        ].filter(c => c.visible !== false);
        
        const actions = [
            { icon: Edit, label: "Editar", onClick: (row) => handleEdit(type, row) },
            { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem(collection, row.id) }) }
        ];

        if (type === 'pagar') {
            actions.unshift({ icon: Banknote, label: "Marcar como Pago", onClick: (row) => handleStatusChange(type, row, 'Pago') });
        } else {
            actions.unshift({ icon: Banknote, label: "Marcar como Recebido", onClick: (row) => handleStatusChange(type, row, 'Recebido') });
        }

        return (
            <div>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-700">{title}</h2>
                    <Button onClick={() => handleNew(type)}><Plus className="w-4 h-4"/> Novo Lançamento</Button>
                </div>
                {type === 'pagar' && (
                    <div className="mb-4 flex space-x-2 border-b">
                        {['Todas', 'Despesa Fixa', 'Despesa Variável', 'Fornecedores'].map(filter => (
                            <button
                                key={filter}
                                onClick={() => setDespesaFilter(filter)}
                                className={`px-3 py-2 text-sm font-medium ${despesaFilter === filter ? 'border-b-2 border-pink-600 text-pink-600' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {filter.replace('Despesa ', '')}
                            </button>
                        ))}
                    </div>
                )}
                <Table columns={columns} data={items} actions={actions} />
            </div>
        );
    };
    
    const renderFluxoCaixa = () => {
        const filteredPedidos = (data.pedidos || [])
            .filter(p => p.status === 'Finalizado')
            .filter(p => {
                if(!p.createdAt) return false;
                const itemDate = getJSDate(p.createdAt);
                if (!itemDate) return false;
                const start = startDate ? new Date(startDate) : null;
                const end = endDate ? new Date(endDate) : null;
                if(start) start.setHours(0,0,0,0);
                if(end) end.setHours(23,59,59,999);
                if (start && itemDate < start) return false;
                if (end && itemDate > end) return false;
                return true;
            });

        const outrasEntradasFiltradas = (data.contas_a_receber || [])
            .filter(i => i.status === 'Recebido')
            .filter(item => {
                if(!item.dataRecebimento) return false;
                const itemDate = getJSDate(item.dataRecebimento);
                if (!itemDate) return false;
                const start = startDate ? new Date(startDate) : null;
                const end = endDate ? new Date(endDate) : null;
                if(start) start.setHours(0,0,0,0);
                if(end) end.setHours(23,59,59,999);
                if (start && itemDate < start) return false;
                if (end && itemDate > end) return false;
                return true;
            });
        
        const saidasFiltradas = (data.contas_a_pagar || [])
            .filter(i => i.status === 'Pago')
            .filter(item => {
                if(!item.dataVencimento) return false;
                const itemDate = getJSDate(item.dataVencimento);
                if (!itemDate) return false;
                const start = startDate ? new Date(startDate) : null;
                const end = endDate ? new Date(endDate) : null;
                if(start) start.setHours(0,0,0,0);
                if(end) end.setHours(23,59,59,999);
                if (start && itemDate < start) return false;
                if (end && itemDate > end) return false;
                return true;
            });
            
        // Breakdown by sales channel from Pedidos
        const totalVendasPresencial = filteredPedidos.filter(p => p.origem === 'Manual' && p.categoria !== 'Festa').reduce((sum, p) => sum + p.total, 0);
        const totalVendasOnline = filteredPedidos.filter(p => ['Cardapio Online', 'Plataforma'].includes(p.origem)).reduce((sum, p) => sum + p.total, 0);
        const totalVendasFesta = filteredPedidos.filter(p => p.categoria === 'Festa').reduce((sum, p) => sum + p.total, 0);
            
        // Breakdown by payment method from Pedidos
        const totaisPorPagamento = filteredPedidos.reduce((acc, pedido) => {
            const metodo = pedido.formaPagamento || 'Não informado';
            acc[metodo] = (acc[metodo] || 0) + pedido.total;
            return acc;
        }, {});
        
        const totalOutrasEntradas = outrasEntradasFiltradas.reduce((sum, t) => sum + t.valor, 0);
        const totalSaidas = saidasFiltradas.reduce((sum, t) => sum + t.valor, 0);
        
        const totalEntradas = totalVendasPresencial + totalVendasOnline + totalVendasFesta + totalOutrasEntradas;
        const saldo = totalEntradas - totalSaidas;
        
        return (
            <div>
                 <div className="p-4 bg-white rounded-2xl shadow-lg border border-gray-100 space-y-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Data Inicial" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <Input label="Data Final" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                     <div className="bg-green-100 p-4 rounded-xl"><p className="text-sm text-green-800">Total de Entradas</p><p className="text-xl font-bold text-green-900">R$ {totalEntradas.toFixed(2)}</p></div>
                     <div className="bg-red-100 p-4 rounded-xl"><p className="text-sm text-red-800">Total de Saídas</p><p className="text-xl font-bold text-red-900">R$ {totalSaidas.toFixed(2)}</p></div>
                     <div className="bg-blue-100 p-4 rounded-xl"><p className="text-sm text-blue-800">Saldo do Período</p><p className="text-xl font-bold text-blue-900">R$ {saldo.toFixed(2)}</p></div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="bg-white p-6 rounded-2xl shadow-lg">
                        <h3 className="font-bold text-lg mb-4">Entradas por Canal de Venda</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between border-b pb-1"><span className="text-gray-600">Vendas Presenciais:</span> <span className="font-semibold">R$ {totalVendasPresencial.toFixed(2)}</span></div>
                            <div className="flex justify-between border-b pb-1"><span className="text-gray-600">Delivery (Online):</span> <span className="font-semibold">R$ {totalVendasOnline.toFixed(2)}</span></div>
                            <div className="flex justify-between border-b pb-1"><span className="text-gray-600">Festas:</span> <span className="font-semibold">R$ {totalVendasFesta.toFixed(2)}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Outras Entradas:</span> <span className="font-semibold">R$ {totalOutrasEntradas.toFixed(2)}</span></div>
                        </div>
                    </div>
                     <div className="bg-white p-6 rounded-2xl shadow-lg">
                        <h3 className="font-bold text-lg mb-4">Entradas por Forma de Pagamento</h3>
                        <div className="space-y-2 text-sm">
                            {Object.entries(totaisPorPagamento).map(([metodo, total]) => (
                                <div key={metodo} className="flex justify-between border-b pb-1"><span className="text-gray-600">{metodo}:</span> <span className="font-semibold">R$ {total.toFixed(2)}</span></div>
                            ))}
                        </div>
                    </div>
                 </div>
            </div>
        )
    };

    return (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
            <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Financeiro</h1>
                <p className="text-gray-600 mt-1">Gerencie as finanças da sua doceria</p>
            </div>
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-2">
                <div className="flex space-x-2">
                    {['dashboard', 'pagar', 'receber', 'fluxo'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === tab ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                            {tab === 'dashboard' && 'Dashboard'}
                            {tab === 'pagar' && 'Despesas'}
                            {tab === 'receber' && 'Contas a Receber'}
                            {tab === 'fluxo' && 'Fluxo de Caixa'}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="mt-6">
                {activeTab === 'dashboard' && renderDashboard()}
                {activeTab === 'pagar' && renderContas('pagar')}
                {activeTab === 'receber' && renderContas('receber')}
                {activeTab === 'fluxo' && renderFluxoCaixa()}
            </div>
            
            <Modal isOpen={modalConfig.isOpen} onClose={() => setModalConfig({isOpen: false, type: null, item: null})} title={modalConfig.item ? 'Editar Lançamento' : 'Novo Lançamento'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input label="Descrição" value={formData.descricao || ''} onChange={(e) => setFormData({...formData, descricao: e.target.value})} required/>
                    <Input label="Valor (R$)" type="number" step="0.01" value={formData.valor || ''} onChange={(e) => setFormData({...formData, valor: e.target.value})} required/>
                    {modalConfig.type === 'pagar' && (
                        <>
                            <Input label="Data de Vencimento" type="date" value={formData.dataVencimento || ''} onChange={(e) => setFormData({...formData, dataVencimento: e.target.value})} required/>
                            <Select label="Categoria" value={formData.categoria || ''} onChange={(e) => setFormData({...formData, categoria: e.target.value})} required>
                                <option>Fornecedores</option>
                                <option>Despesa Fixa</option>
                                <option>Despesa Variável</option>
                            </Select>
                        </>
                    )}
                     {modalConfig.type === 'receber' && (
                        <>
                            <Input label="Data de Recebimento" type="date" value={formData.dataRecebimento || ''} onChange={(e) => setFormData({...formData, dataRecebimento: e.target.value})} required/>
                             <Select label="Método de Pagamento" value={formData.metodo || ''} onChange={(e) => setFormData({...formData, metodo: e.target.value})} required>
                                <option>Pix</option>
                                <option>Cartão</option>
                                <option>Dinheiro</option>
                                <option>Outro</option>
                            </Select>
                        </>
                    )}
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setModalConfig({isOpen: false, type: null, item: null})}>Cancelar</Button>
                        <Button type="submit"><Save className="w-4 h-4"/> Salvar</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};


// --- FIM DOS NOVOS COMPONENTES ---

// Componente Relatorios adicionado no mesmo arquivo App.js para correção do erro
const Relatorios = ({ data }) => {
  const getInitialDateRange = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return {
        start: formatDate(firstDay),
        end: formatDate(today)
    };
  };

  const [reportType, setReportType] = usePersistentState('relatorios_reportType', 'vendasPorPeriodo');
  const [startDate, setStartDate] = usePersistentState('relatorios_startDate', getInitialDateRange().start);
  const [endDate, setEndDate] = usePersistentState('relatorios_endDate', getInitialDateRange().end);
  const [reportData, setReportData] = useState([]);
  const [reportColumns, setReportColumns] = useState([]);

  const handleGenerateReport = () => {
    let columns = [];
    let processedData = [];
    
    const filterByDate = (items, dateField) => {
        let filtered = items;
        if (startDate) filtered = filtered.filter(p => {
            const itemDate = getJSDate(p[dateField]);
            return itemDate && itemDate >= new Date(startDate + 'T00:00:00');
        });
        if (endDate) filtered = filtered.filter(p => {
            const itemDate = getJSDate(p[dateField]);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            return itemDate && itemDate <= end;
        });
        return filtered;
    }


    switch (reportType) {
        case 'vendasPorPeriodo': {
            const filtered = filterByDate(data.pedidos.filter(p => p.status === 'Finalizado'), 'createdAt');
            columns = [{ header: 'Data', key: 'date' }, { header: 'Nº de Vendas', key: 'count' }, { header: 'Total (R$)', key: 'total' }];
            const salesByDay = filtered.reduce((acc, pedido) => {
                const date = getJSDate(pedido.createdAt).toLocaleDateString('pt-BR');
                if (!acc[date]) acc[date] = { date, count: 0, total: 0 };
                acc[date].count++;
                acc[date].total += pedido.total;
                return acc;
            }, {});
            processedData = Object.values(salesByDay).map(d => ({...d, total: `R$ ${d.total.toFixed(2)}`}));
            break;
        }
        case 'produtosMaisVendidos': {
            const filtered = filterByDate(data.pedidos.filter(p => p.status === 'Finalizado'), 'createdAt');
            columns = [{ header: 'Produto', key: 'nome' }, { header: 'Quantidade Vendida', key: 'quantidade' }];
            const productSales = filtered.flatMap(p => p.itens).reduce((acc, item) => {
                if (!acc[item.id]) acc[item.id] = { nome: item.nome, quantidade: 0 };
                acc[item.id].quantidade += item.quantity;
                return acc;
            }, {});
            processedData = Object.values(productSales).sort((a, b) => b.quantidade - a.quantidade);
            break;
        }
        case 'clientesMaisCompram': {
             const filtered = filterByDate(data.pedidos.filter(p => p.status === 'Finalizado'), 'createdAt');
             columns = [{ header: 'Cliente', key: 'nome' }, {header: 'Total Gasto (R$)', key: 'total'}, {header: 'Nº de Pedidos', key: 'pedidos'}];
             const customerSales = filtered.reduce((acc, pedido) => {
                if(!acc[pedido.clienteId]) acc[pedido.clienteId] = { nome: pedido.clienteNome, total: 0, pedidos: 0};
                acc[pedido.clienteId].total += pedido.total;
                acc[pedido.clienteId].pedidos += 1;
                return acc;
             }, {});
             processedData = Object.values(customerSales).sort((a,b) => b.total - a.total).map(c => ({...c, total: `R$ ${c.total.toFixed(2)}`}));
             break;
        }
        case 'usoCupons': {
            const filtered = filterByDate(data.pedidos.filter(p => p.cupom), 'createdAt');
            columns = [{ header: 'Cupom', key: 'codigo' }, { header: 'Usos', key: 'usos' }, { header: 'Total Descontado (R$)', key: 'totalDesconto' }];
            const couponUsage = filtered.reduce((acc, pedido) => {
                const codigo = pedido.cupom.codigo;
                if (!acc[codigo]) acc[codigo] = { codigo, usos: 0, totalDesconto: 0 };
                acc[codigo].usos++;
                acc[codigo].totalDesconto += pedido.cupom.valorDesconto || 0;
                return acc;
            }, {});
            processedData = Object.values(couponUsage).map(c => ({ ...c, totalDesconto: `R$ ${c.totalDesconto.toFixed(2)}` })).sort((a,b) => b.usos - a.usos);
            break;
        }
        case 'estoqueBaixo': {
             columns = [{ header: 'Produto', key: 'nome' }, { header: 'Estoque Atual', key: 'estoque' }];
             processedData = data.produtos.filter(p => p.estoque < 10).sort((a,b) => a.estoque - b.estoque);
             break;
        }
        case 'comprasInsumos': {
            const filtered = filterByDate(data.pedidosCompra.filter(p => p.status === 'Recebido'), 'dataPedido');
            columns = [{ header: 'Insumo', key: 'nome' }, { header: 'Quantidade Comprada', key: 'quantidade' }];
            const insumoSales = filtered.flatMap(p => p.itens || []).reduce((acc, item) => {
                if (!acc[item.id]) acc[item.id] = { nome: item.nome, quantidade: 0 };
                acc[item.id].quantidade += item.quantidade;
                return acc;
            }, {});
            processedData = Object.values(insumoSales).sort((a, b) => b.quantidade - a.quantidade);
            break;
        }
        case 'receitaPorPagamento': {
            const filtered = filterByDate(data.pedidos.filter(p => p.status === 'Finalizado'), 'createdAt');
            columns = [{ header: 'Forma de Pagamento', key: 'metodo' }, { header: 'Total Recebido (R$)', key: 'total' }];
            const paymentMethodSales = filtered.reduce((acc, pedido) => {
                const metodo = pedido.formaPagamento || 'Não informado';
                if (!acc[metodo]) acc[metodo] = { metodo, total: 0 };
                acc[metodo].total += pedido.total;
                return acc;
            }, {});
            processedData = Object.values(paymentMethodSales).map(d => ({...d, total: `R$ ${d.total.toFixed(2)}`})).sort((a,b) => b.total - a.total);
            break;
        }
        default:
            break;
    }

    setReportColumns(columns);
    setReportData(processedData);
  };

  const exportPDF = () => {
    if (typeof window.jspdf === 'undefined') return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text(document.getElementById('report-select').selectedOptions[0].text, 14, 15);
    doc.autoTable({
        head: [reportColumns.map(c => c.header)],
        body: reportData.map(row => reportColumns.map(col => row[col.key])),
    });
    doc.save('relatorio.pdf');
  };

  const exportExcel = () => {
    if (typeof window.XLSX === 'undefined') return;
    const ws = window.XLSX.utils.json_to_sheet(reportData);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
    window.XLSX.writeFile(wb, "relatorio.xlsx");
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Relatórios</h1>
            <p className="text-gray-600 mt-1">Analise o desempenho da sua doceria</p>
        </div>

        <div className="p-4 bg-white rounded-2xl shadow-lg border border-gray-100 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Input label="Data Inicial" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                <Input label="Data Final" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                <Select id="report-select" label="Tipo de Relatório" value={reportType} onChange={e => setReportType(e.target.value)}>
                    <option value="vendasPorPeriodo">Vendas por Período</option>
                    <option value="produtosMaisVendidos">Produtos Mais Vendidos</option>
                    <option value="clientesMaisCompram">Clientes que Mais Compram</option>
                    <option value="usoCupons">Uso de Cupons</option>
                    <option value="estoqueBaixo">Estoque Baixo (Produtos Finais)</option>
                    <option value="comprasInsumos">Compras de Insumos</option>
                    <option value="receitaPorPagamento">Receita por Forma de Pagamento</option>
                </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handleGenerateReport} className="w-full sm:w-auto">Gerar Relatório</Button>
                <Button variant="secondary" onClick={() => { setStartDate(getInitialDateRange().start); setEndDate(getInitialDateRange().end); }} className="w-full sm:w-auto">Limpar Datas</Button>
                <Button onClick={exportPDF} variant="secondary" className="w-full sm:w-auto" disabled={reportData.length === 0}>Exportar PDF</Button>
                <Button onClick={exportExcel} variant="secondary" className="w-full sm:w-auto" disabled={reportData.length === 0}>Exportar Excel</Button>
            </div>
        </div>
        
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
             <Table columns={reportColumns} data={reportData} />
        </div>
    </div>
  );
};

const MeuEspaco = ({ user, data = {} }) => {
  const isGestor = user?.role === 'admin';
  const [registroFeedback, setRegistroFeedback] = useState(null);
  const [registroLoading, setRegistroLoading] = useState(false);
  const [selectedPeriodo, setSelectedPeriodo] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedFuncionario, setSelectedFuncionario] = useState(() => (isGestor ? '' : user?.auth?.uid || ''));
  const [editingPonto, setEditingPonto] = useState(null);
  const [pontoForm, setPontoForm] = useState({ horaEntrada: '', horaSaida: '', irregularidade: '', qtde: '', justificativa: '' });
  const [salvandoPonto, setSalvandoPonto] = useState(false);
  const competenciaAtual = useMemo(() => {
    const now = new Date();
    return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }, []);
  const [empresaForm, setEmpresaForm] = useState({
    nomeEmpresa: '',
    endereco: '',
    cnpj: '',
    atividadeEconomica: '',
    horarioTrabalho: '',
    competencia: competenciaAtual,
    gestorResponsavel: user?.auth?.displayName || user?.auth?.email || ''
  });
  const [empresaFeedback, setEmpresaFeedback] = useState(null);
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);
  const funcionarioNome = useMemo(() => user?.auth?.displayName || user?.auth?.email || 'Funcionário', [user]);
  const periodoFormatado = useMemo(() => {
    if (!selectedPeriodo) return '';
    const [ano, mes] = selectedPeriodo.split('-');
    if (!ano || !mes) return selectedPeriodo;
    return `${mes}/${ano}`;
  }, [selectedPeriodo]);
  const handlePrint = useCallback(() => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }, []);

  useEffect(() => {
    if (!isGestor && user?.auth?.uid) {
      setSelectedFuncionario(user.auth.uid);
    }
  }, [isGestor, user]);

  const empresaInfoDoc = useMemo(() => (data.empresaInfo || [])[0] || null, [data.empresaInfo]);

  useEffect(() => {
    if (empresaInfoDoc) {
      setEmpresaForm({
        nomeEmpresa: empresaInfoDoc.nomeEmpresa || '',
        endereco: empresaInfoDoc.endereco || '',
        cnpj: empresaInfoDoc.cnpj || '',
        atividadeEconomica: empresaInfoDoc.atividadeEconomica || '',
        horarioTrabalho: empresaInfoDoc.horarioTrabalho || '',
        competencia: empresaInfoDoc.competencia || competenciaAtual,
        gestorResponsavel: empresaInfoDoc.gestorResponsavel || user?.auth?.displayName || user?.auth?.email || ''
      });
    } else {
      setEmpresaForm({
        nomeEmpresa: '',
        endereco: '',
        cnpj: '',
        atividadeEconomica: '',
        horarioTrabalho: '',
        competencia: competenciaAtual,
        gestorResponsavel: user?.auth?.displayName || user?.auth?.email || ''
      });
    }
  }, [empresaInfoDoc, competenciaAtual, user]);

  const funcionarios = useMemo(() => {
    return (data.users || [])
      .map((func) => ({
        id: func.id || func.uid,
        nome: func.nome || func.displayName || func.email || 'Funcionário'
      }))
      .filter((func) => !!func.id);
  }, [data.users]);
  const funcionarioSelecionadoNome = useMemo(() => {
    if (isGestor) {
      if (!selectedFuncionario) return 'Todos os funcionários';
      const encontrado = funcionarios.find((func) => func.id === selectedFuncionario);
      return encontrado?.nome || 'Funcionário';
    }
    return funcionarioNome;
  }, [isGestor, selectedFuncionario, funcionarios, funcionarioNome]);

  const parseEntryDate = (entry) => {
    if (!entry) return null;
    if (entry.data?.toDate) return entry.data.toDate();
    if (entry.dataRegistro?.toDate) return entry.dataRegistro.toDate();
    if (typeof entry.data === 'string') return new Date(`${entry.data}T00:00:00`);
    if (entry.dataRegistro) return new Date(entry.dataRegistro);
    return null;
  };

  const filteredPontos = useMemo(() => {
    const [anoStr, mesStr] = selectedPeriodo.split('-');
    const ano = parseInt(anoStr, 10);
    const mes = parseInt(mesStr, 10) - 1;
    const usuarioAtual = user?.auth?.uid;

    return (data.pontos || [])
      .filter((entry) => {
        const entryDate = parseEntryDate(entry);
        if (!entryDate || Number.isNaN(entryDate.getTime())) return false;
        if (entryDate.getFullYear() !== ano || entryDate.getMonth() !== mes) return false;

        if (isGestor) {
          if (!selectedFuncionario) return true;
          return entry.funcionarioId === selectedFuncionario;
        }

        return entry.funcionarioId === usuarioAtual;
      })
      .sort((a, b) => {
        const dateA = parseEntryDate(a) || new Date(0);
        const dateB = parseEntryDate(b) || new Date(0);
        return dateA.getTime() - dateB.getTime();
      });
  }, [data.pontos, selectedPeriodo, isGestor, selectedFuncionario, user]);

  const formatLocation = useCallback((location) => {
    if (!location) return null;

    const lat = location.latitude ?? location.lat;
    const lng = location.longitude ?? location.lng;

    const latNum = lat !== undefined ? Number(lat) : undefined;
    const lngNum = lng !== undefined ? Number(lng) : undefined;

    const hasLatLng =
      latNum !== undefined &&
      lngNum !== undefined &&
      !Number.isNaN(latNum) &&
      !Number.isNaN(lngNum);

    const coordinateText = hasLatLng ? `${latNum.toFixed(5)}, ${lngNum.toFixed(5)}` : null;
    const addressText = location.endereco || location.address || location.formattedAddress || null;

    if (coordinateText && addressText) {
      return `${coordinateText} | ${addressText}`;
    }

    return coordinateText || addressText || null;
  }, []);

  const tableRows = useMemo(() => {
    return filteredPontos.map((entry) => {
      const entryDate = parseEntryDate(entry);
      const diaSemana = entry.diaSemana || (entryDate ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(entryDate) : '-');
      const diaMes = entryDate ? String(entryDate.getDate()).padStart(2, '0') : '-';
      return {
        ...entry,
        funcionarioNome: entry.funcionarioNome || 'Funcionário',
        diaSemanaFormatado: diaSemana,
        diaMes,
        horaEntrada: entry.horaEntrada || '',
        horaSaida: entry.horaSaida || '',
        irregularidade: entry.irregularidade || '',
        qtde: entry.qtde || '',
        justificativa: entry.justificativa || '',
        localizacaoEntrada: entry.localizacaoEntrada || entry.localizacao?.entrada || null,
        localizacaoSaida: entry.localizacaoSaida || entry.localizacao?.saida || null
      };
    });
  }, [filteredPontos]);

  const pontoColumns = useMemo(() => {
    const baseColumns = [
      {
        header: 'Dia da Semana',
        render: (row) => <span className="capitalize">{row.diaSemanaFormatado}</span>
      },
      {
        header: 'Dia do Mês',
        key: 'diaMes'
      },
      {
        header: 'Entrada',
        render: (row) => row.horaEntrada || '--'
      },
      {
        header: 'Saída',
        render: (row) => row.horaSaida || '--'
      },
      {
        header: 'Irregularidade',
        render: (row) => row.irregularidade || '--'
      },
      {
        header: 'QTDE',
        render: (row) => row.qtde || '--'
      },
      {
        header: 'Justificativa',
        render: (row) => row.justificativa || '--'
      }
    ];

    if (isGestor) {
      baseColumns.unshift({
        header: 'Funcionário',
        render: (row) => row.funcionarioNome || 'Funcionário'
      });
    }

    if (isGestor) {
      baseColumns.push({
        header: 'Localização',
        render: (row) => (
          <div className="flex flex-col text-xs text-gray-600 gap-1">
            {row.localizacaoEntrada ? (
              <a
                href={`https://www.google.com/maps?q=${row.localizacaoEntrada.latitude},${row.localizacaoEntrada.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-600 hover:underline"
              >
                Entrada: {formatLocation(row.localizacaoEntrada)}
              </a>
            ) : (
              <span className="text-gray-400">Entrada não registrada</span>
            )}
            {row.localizacaoSaida ? (
              <a
                href={`https://www.google.com/maps?q=${row.localizacaoSaida.latitude},${row.localizacaoSaida.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-600 hover:underline"
              >
                Saída: {formatLocation(row.localizacaoSaida)}
              </a>
            ) : (
              <span className="text-gray-400">Saída não registrada</span>
            )}
          </div>
        )
      });
    }

    return baseColumns;
  }, [formatLocation, isGestor]);
  
  const tableActions = useMemo(() => (
    isGestor
      ? [{
          label: 'Editar',
          icon: Edit,
          onClick: (row) => {
            setEditingPonto(row);
            setPontoForm({
              horaEntrada: row.horaEntrada || '',
              horaSaida: row.horaSaida || '',
              irregularidade: row.irregularidade || '',
              qtde: row.qtde || '',
              justificativa: row.justificativa || ''
            });
          }
        }]
      : []
  ), [isGestor]);

  const obterLocalizacao = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não é suportada neste dispositivo.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
    });
  };

  const handleRegisterPonto = async (tipo) => {
    if (!user?.auth?.uid) return;
    setRegistroLoading(true);
    setRegistroFeedback(null);

    try {
      const position = await obterLocalizacao();
      const { latitude, longitude } = position.coords;
      const now = new Date();
      const dataStr = now.toISOString().split('T')[0];
      const horaStr = now.toTimeString().slice(0, 5);
      const diaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(now);

      const pontosRef = collection(db, 'pontos');
      const pontoQuery = query(
        pontosRef,
        where('funcionarioId', '==', user.auth.uid),
        where('data', '==', dataStr)
      );

      const pontoSnapshot = await getDocs(pontoQuery);

      if (pontoSnapshot.empty) {
        await addDoc(pontosRef, {
          funcionarioId: user.auth.uid,
          funcionarioNome: user.auth.displayName || user.auth.email || 'Funcionário',
          data: dataStr,
          diaSemana,
          horaEntrada: tipo === 'entrada' ? horaStr : '',
          horaSaida: tipo === 'saida' ? horaStr : '',
          irregularidade: '',
          qtde: '',
          justificativa: '',
          localizacaoEntrada: tipo === 'entrada' ? { latitude, longitude } : null,
          localizacaoSaida: tipo === 'saida' ? { latitude, longitude } : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          historicoAlteracoes: []
        });
      } else {
        const pontoDoc = pontoSnapshot.docs[0];
        const updateData = {
          updatedAt: serverTimestamp()
        };

        if (tipo === 'entrada') {
          updateData.horaEntrada = horaStr;
          updateData.localizacaoEntrada = { latitude, longitude };
        } else {
          updateData.horaSaida = horaStr;
          updateData.localizacaoSaida = { latitude, longitude };
        }

        await updateDoc(pontoDoc.ref, updateData);
      }

      setRegistroFeedback({
        type: 'success',
        message: `Ponto de ${tipo === 'entrada' ? 'entrada' : 'saída'} registrado com sucesso!`
      });
    } catch (error) {
      console.error('Erro ao registrar ponto:', error);
      let message = 'Não foi possível registrar o ponto. Tente novamente.';

      if (typeof error?.code === 'number' && error.code === 1) {
        message = 'Permita o acesso à localização para registrar o ponto.';
      } else if (error?.message) {
        message = error.message;
      }

      setRegistroFeedback({ type: 'error', message });
    } finally {
      setRegistroLoading(false);
    }
  };

  const handleSaveEmpresa = async (event) => {
    event.preventDefault();
    setSalvandoEmpresa(true);
    setEmpresaFeedback(null);

    try {
      const empresaRef = doc(db, 'empresaInfo', 'principal');
      await setDoc(empresaRef, {
        ...empresaForm,
        competencia: competenciaAtual,
        gestorResponsavel: empresaForm.gestorResponsavel || user?.auth?.displayName || user?.auth?.email || '',
        updatedAt: serverTimestamp()
      }, { merge: true });

      setEmpresaFeedback({ type: 'success', message: 'Informações da empresa atualizadas com sucesso!' });
    } catch (error) {
      console.error('Erro ao salvar informações da empresa:', error);
      setEmpresaFeedback({ type: 'error', message: 'Não foi possível salvar as informações. Tente novamente.' });
    } finally {
      setSalvandoEmpresa(false);
    }
  };

  const handleSavePonto = async (event) => {
    event.preventDefault();
    if (!editingPonto) return;

    setSalvandoPonto(true);
    try {
      const pontoRef = doc(db, 'pontos', editingPonto.id);
      const campos = ['horaEntrada', 'horaSaida', 'irregularidade', 'qtde', 'justificativa'];
      const updates = campos.reduce((acc, campo) => ({
        ...acc,
        [campo]: (pontoForm[campo] || '').trim()
      }), {});

      const changes = campos.reduce((acc, campo) => {
        const antigo = (editingPonto[campo] || '').trim();
        const novo = (pontoForm[campo] || '').trim();
        if (antigo !== novo) {
          const labelMap = {
            horaEntrada: 'Entrada',
            horaSaida: 'Saída',
            irregularidade: 'Irregularidade',
            qtde: 'QTDE',
            justificativa: 'Justificativa'
          };
          acc.push(`${labelMap[campo]}: ${antigo || 'vazio'} → ${novo || 'vazio'}`);
        }
        return acc;
      }, []);

      const descricaoAlteracao = changes.length > 0
        ? changes.join(' | ')
        : 'Registro atualizado pelo gestor.';

      await updateDoc(pontoRef, {
        ...updates,
        gestorId: user?.auth?.uid || null,
        dataAjuste: serverTimestamp(),
        updatedAt: serverTimestamp(),
        historicoAlteracoes: arrayUnion({
          timestamp: serverTimestamp(),
          gestorId: user?.auth?.uid || null,
          gestorNome: user?.auth?.displayName || user?.auth?.email || 'Gestor',
          descricao: descricaoAlteracao
        })
      });

      setRegistroFeedback({ type: 'success', message: 'Registro de ponto atualizado com sucesso.' });
      setEditingPonto(null);
    } catch (error) {
      console.error('Erro ao atualizar ponto:', error);
      setRegistroFeedback({ type: 'error', message: 'Não foi possível salvar as alterações do ponto.' });
    } finally {
      setSalvandoPonto(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Meu Espaço</h1>
          <p className="text-gray-600 mt-1">Gerencie seus registros de ponto e informações da empresa</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 print:hidden">
          <Input
            label="Competência"
            type="month"
            value={selectedPeriodo}
            onChange={(event) => setSelectedPeriodo(event.target.value)}
            className="sm:w-48"
          />
          {isGestor && (
            <Select
              label="Funcionário"
              value={selectedFuncionario}
              onChange={(event) => setSelectedFuncionario(event.target.value)}
              className="sm:w-56"
            >
              <option value="">Todos</option>
              {funcionarios.map((func) => (
                <option key={func.id} value={func.id}>{func.nome}</option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {(!isGestor || selectedFuncionario) && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 print:hidden">
          <p className="text-xs uppercase text-gray-500">Funcionário</p>
          <p className="text-lg font-semibold text-gray-800">{funcionarioSelecionadoNome}</p>
        </div>
      )}

      <div className="hidden print:block bg-white rounded-2xl border border-gray-200 p-4 text-sm text-gray-700">
        <p><span className="font-semibold">Competência:</span> {periodoFormatado || '—'}</p>
        <p className="mt-1"><span className="font-semibold">Funcionário:</span> {funcionarioSelecionadoNome}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex-1 space-y-2">
            <h2 className="text-xl font-semibold text-gray-800">Informações da Empresa</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-600">
              <div>
                <p className="text-gray-500 text-xs uppercase">Nome da Empresa</p>
                <p className="font-medium text-gray-800">{empresaForm.nomeEmpresa || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase">CNPJ</p>
                <p className="font-medium text-gray-800">{empresaForm.cnpj || '—'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-gray-500 text-xs uppercase">Endereço</p>
                <p className="font-medium text-gray-800">{empresaForm.endereco || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase">Atividade Econômica</p>
                <p className="font-medium text-gray-800">{empresaForm.atividadeEconomica || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase">Horário de Trabalho</p>
                <p className="font-medium text-gray-800">{empresaForm.horarioTrabalho || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase">Competência</p>
                <p className="font-medium text-gray-800">{empresaForm.competencia || competenciaAtual}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs uppercase">Gestor Responsável</p>
                <p className="font-medium text-gray-800">{empresaForm.gestorResponsavel || '—'}</p>
              </div>
            </div>
          </div>

          {isGestor && (
            <form onSubmit={handleSaveEmpresa} className="w-full md:w-1/2 space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Atualizar informações</h3>
              <Input
                label="Nome da Empresa"
                value={empresaForm.nomeEmpresa}
                onChange={(event) => setEmpresaForm((prev) => ({ ...prev, nomeEmpresa: event.target.value }))}
              />
              <Input
                label="Endereço"
                value={empresaForm.endereco}
                onChange={(event) => setEmpresaForm((prev) => ({ ...prev, endereco: event.target.value }))}
              />
              <Input
                label="CNPJ"
                value={empresaForm.cnpj}
                onChange={(event) => setEmpresaForm((prev) => ({ ...prev, cnpj: event.target.value }))}
                placeholder="00.000.000/0000-00"
              />
              <Input
                label="Atividade Econômica"
                value={empresaForm.atividadeEconomica}
                onChange={(event) => setEmpresaForm((prev) => ({ ...prev, atividadeEconomica: event.target.value }))}
              />
              <Input
                label="Horário de Trabalho"
                value={empresaForm.horarioTrabalho}
                onChange={(event) => setEmpresaForm((prev) => ({ ...prev, horarioTrabalho: event.target.value }))}
                placeholder="08:00 às 17:00 (intervalo 12:00 às 13:00)"
              />
              <Input
                label="Competência"
                value={empresaForm.competencia || competenciaAtual}
                readOnly
                disabled
              />
              <Input
                label="Gestor Responsável"
                value={empresaForm.gestorResponsavel}
                onChange={(event) => setEmpresaForm((prev) => ({ ...prev, gestorResponsavel: event.target.value }))}
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={salvandoEmpresa}>
                  {salvandoEmpresa ? 'Salvando...' : 'Salvar Informações'}
                </Button>
              </div>
              {empresaFeedback && (
                <p className={`text-sm ${empresaFeedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {empresaFeedback.message}
                </p>
              )}
            </form>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Registro de Ponto</h2>
            <p className="text-gray-500 text-sm">Registre sua entrada e saída com validação de localização</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 print:hidden">
            <Button
              onClick={() => handleRegisterPonto('entrada')}
              disabled={registroLoading}
            >
              <Clock className="w-4 h-4" /> Registrar Entrada
            </Button>
            <Button
              onClick={() => handleRegisterPonto('saida')}
              disabled={registroLoading}
              className="bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700"
            >
              <Clock className="w-4 h-4" /> Registrar Saída
            </Button>
            {!isGestor && (
              <Button
                onClick={handlePrint}
                variant="secondary"
                className="sm:w-auto"
              >
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
            )}
          </div>
        </div>
        {registroFeedback && (
          <div className={`rounded-xl px-4 py-3 text-sm ${registroFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {registroFeedback.message}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Registros do mês</h2>
            <p className="text-gray-500 text-sm">Visualize os registros de ponto do período selecionado</p>
          </div>
          <div className="text-sm text-gray-500">
            {tableRows.length} registro(s) encontrado(s)
          </div>
        </div>
        <Table columns={pontoColumns} data={tableRows} actions={tableActions} />
      </div>

      <Modal
        isOpen={!!editingPonto}
        onClose={() => setEditingPonto(null)}
        title="Editar registro de ponto"
        size="lg"
      >
        {editingPonto && (
          <form onSubmit={handleSavePonto} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Hora de Entrada"
                type="time"
                value={pontoForm.horaEntrada}
                onChange={(event) => setPontoForm((prev) => ({ ...prev, horaEntrada: event.target.value }))}
              />
              <Input
                label="Hora de Saída"
                type="time"
                value={pontoForm.horaSaida}
                onChange={(event) => setPontoForm((prev) => ({ ...prev, horaSaida: event.target.value }))}
              />
              <Input
                label="Irregularidade"
                value={pontoForm.irregularidade}
                onChange={(event) => setPontoForm((prev) => ({ ...prev, irregularidade: event.target.value }))}
                placeholder="Atraso, falta, banco de horas..."
              />
              <Input
                label="QTDE"
                value={pontoForm.qtde}
                onChange={(event) => setPontoForm((prev) => ({ ...prev, qtde: event.target.value }))}
                placeholder="Horas a compensar"
              />
              <Textarea
                label="Justificativa"
                rows={3}
                value={pontoForm.justificativa}
                onChange={(event) => setPontoForm((prev) => ({ ...prev, justificativa: event.target.value }))}
              />
            </div>

            {isGestor && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                <div>
                  <p className="font-medium text-gray-700">Localização da entrada</p>
                  {editingPonto.localizacaoEntrada ? (
                    <a
                      href={`https://www.google.com/maps?q=${editingPonto.localizacaoEntrada.latitude},${editingPonto.localizacaoEntrada.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pink-600 hover:underline"
                    >
                      {formatLocation(editingPonto.localizacaoEntrada)}
                    </a>
                  ) : (
                    <p className="text-gray-400">Não registrado</p>
                  )}
                </div>
                <div>
                  <p className="font-medium text-gray-700">Localização da saída</p>
                  {editingPonto.localizacaoSaida ? (
                    <a
                      href={`https://www.google.com/maps?q=${editingPonto.localizacaoSaida.latitude},${editingPonto.localizacaoSaida.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pink-600 hover:underline"
                    >
                      {formatLocation(editingPonto.localizacaoSaida)}
                    </a>
                  ) : (
                    <p className="text-gray-400">Não registrado</p>
                  )}
                </div>
              </div>
            )}

            {editingPonto.historicoAlteracoes && editingPonto.historicoAlteracoes.length > 0 && (
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Histórico de ajustes</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                  {editingPonto.historicoAlteracoes
                    .slice()
                    .sort((a, b) => {
                      const dataA = getJSDate(a.timestamp) || new Date(0);
                      const dataB = getJSDate(b.timestamp) || new Date(0);
                      return dataB.getTime() - dataA.getTime();
                    })
                    .map((hist, index) => {
                      const dataHist = getJSDate(hist.timestamp);
                      return (
                        <div key={index} className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3">
                          <p className="font-medium text-gray-700">{hist.gestorNome || 'Gestor'}</p>
                          <p>{hist.descricao || 'Ajuste registrado.'}</p>
                          <p className="text-gray-400 mt-1">{dataHist ? dataHist.toLocaleString('pt-BR') : 'Data não disponível'}</p>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="secondary" onClick={() => setEditingPonto(null)}>Cancelar</Button>
              <Button type="submit" disabled={salvandoPonto}>
                {salvandoPonto ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

// Componente principal
function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  const [currentPage, setCurrentPage] = usePersistentState('currentPage', 'pagina-inicial');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [passwordResetEmail, setPasswordResetEmail] = useState("");
  const [passwordResetMessage, setPasswordResetMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [stopAlarmFn, setStopAlarmFn] = useState(null);
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);
  const [hasNewPendingOrders, setHasNewPendingOrders] = useState(false);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [isAlarmSnoozed, setIsAlarmSnoozed] = useState(false);
  const [snoozeEndTime, setSnoozeEndTime] = useState(null);
  // --- Estado audioUnlocked agora é derivado do AudioManager ---
  // const [audioUnlocked, setAudioUnlocked] = useState(...);


  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, onConfirm: () => {} });
  // ... (outros estados: showLogin, email, password, etc.) ...
    const [lightboxImage, setLightboxImage] = useState(null);
  
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  // ... (outros estados: passwordResetEmail, passwordResetMessage) ...

  // --- REVISADO: Refs de Áudio ---
  const stopAlarmRef = useRef(null); // Guarda a função de parar o som
  const stopAlarmFnRef = useRef(null);
  const snoozeTimerRef = useRef(null);
  const isSnoozedRef = useRef(false);
  const initialDataLoaded = useRef(false);
  const pushTokenRef = useRef(null);
  // --- REMOVIDO: audioRef e alarmIntervalRef ---

  
  const [data, setData] = useState({ clientes: [], pedidos: [], produtos: [], contas_a_pagar: [], contas_a_receber: [], fornecedores: [], pedidosCompra: [], estoque: [], logs: [], cupons: [], users: [], subcategorias: [], fornecedorCategorias: [], pontos: [], empresaInfo: [] });
  const [loading, setLoading] = useState(true);

	const userId = user?.uid || null;

  // --- SUBSTITUÍDO: Nova função stopAlarm ---
	const stopAlarm = useCallback(() => {
		console.log("[App.js] Parando alarme...");
		if (stopAlarmRef.current) {
		  stopAlarmRef.current(); // Chama a função de parada
		  stopAlarmRef.current = null; // Limpa a referência
		}
		if (stopAlarmFn) {
		  stopAlarmFn(); // Também chama a função do estado se existir
		  setStopAlarmFn(null); // Limpa o estado
		}
		setIsAlarmPlaying(false); // Atualiza o estado da UI
	}, [stopAlarmFn]);

  // --- REMOVIDO: Antiga função unlockAudio ---

  // --- SUBSTITUÍDO: Nova função playAlarm ---
  const playAlarm = useCallback(async () => {
		// Só toca se não estiver em modo soneca
		if (isSnoozedRef.current) {
			console.log("[App.js] Alarme em soneca, não tocando.");
			return;
		}
		
		// Se já está tocando, não faz nada
		if (isAlarmPlaying) {
			console.log("[App.js] Alarme já está tocando, ignorando nova chamada.");
			return;
		}

		console.log("[App.js] Tentando tocar alarme...");
		setIsAlarmPlaying(true); // Define como tocando (para UI) ANTES de tentar tocar

		// Chama o AudioManager para tocar o som
		// Verifica se o áudio está desbloqueado antes de tentar tocar
		if (!audioManager.unlocked) {
		  console.warn("[App.js] Áudio bloqueado — aguardando interação do usuário.");
		  try {
			await audioManager.userUnlock();
		  } catch (e) {
			console.warn("[App.js] Não foi possível desbloquear o áudio automaticamente:", e);
		  }
		}

		// Só tenta tocar o som se o contexto estiver ativo
		if (audioManager.unlocked) {
		  const stopFn = await audioManager.playSound(ALARM_SOUND_URL, { loop: true, volume: 0.8 });
		  
		  // CORREÇÃO: Armazena a função de parada tanto no estado quanto na ref
		  if (stopFn && typeof stopFn === 'function') {
			setStopAlarmFn(() => stopFn); // Armazena no estado
			stopAlarmRef.current = stopFn; // Armazena na ref
			console.log("[App.js] Alarme iniciado.");
		  } else {
			// Se foi bloqueado ou falhou, reseta o estado da UI
			console.log("[App.js] Falha ao iniciar o alarme (provavelmente bloqueado).");
			setIsAlarmPlaying(false); 
		  }
		} else {
			console.log("[App.js] Áudio ainda bloqueado, não tocando alarme.");
			setIsAlarmPlaying(false);
		}
	}, [isAlarmPlaying]); // Adicione isAlarmPlaying como dependência
	
	  // --- PRÉ-CARREGAMENTO DO ÁUDIO NATIVO (Capacitor Android/iOS) ---
	  useEffect(() => {
		const loadAudio = async () => {
		  if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
			try {
			  await NativeAudio.preload({
					assetId: 'pedido',
					assetPath: 'mixkit_vintage_warning_alarm_990.wav',
					audioChannelNum: 1,
					isUrl: false,
			  });
			  console.log('🔊 Áudio pré-carregado com sucesso!');
			} catch (err) {
			  console.error('Erro ao carregar áudio:', err);
			}
		  }
		};

		loadAudio();
	  }, []);


  // --- SUBSTITUÍDO: Novo useEffect de inicialização do AudioManager ---
  useEffect(() => {
    const tryAutoUnlock = async () => {
      // tenta inicializar automaticamente se já foi aceito antes
      try {
        if (localStorage.getItem("audioUnlocked") === "true") {
          await audioManager.init();
        } else {
          // tenta init para recuperar estado, mas pode ficar suspenso
          await audioManager.init().catch(()=>{});
        }
      } catch (e) {
        console.error("Erro ao inicializar audioManager:", e);
      }
  
      // --- CORREÇÃO: Lógica do botão movida para um state para ser renderizado pelo React ---
      // O botão será renderizado condicionalmente no JSX principal
    };
  
    // Só tenta desbloquear/mostrar botão se o usuário estiver logado
    if(user) {
        tryAutoUnlock();
    }
  
  }, [user]); // Depende do 'user' para saber se deve mostrar o botão

  // --- NOVO: Estado para controlar a exibição do botão de ativar som ---
  const [showActivateSoundButton, setShowActivateSoundButton] = useState(false);
  
    useEffect(() => {
    if (!user) {
      return;
    }

    const requestCapabilities = async () => {
      if (typeof navigator === 'undefined') {
        return;
      }

      const requestGeolocation = async () => {
        if (!navigator.geolocation) {
          return;
        }

        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => resolve(position),
            (error) => {
              console.warn('[App.js] Permissão de geolocalização negada ou indisponível:', error);
              resolve(null);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
          );
        });
      };

      try {
        if (navigator.permissions?.query) {
          try {
            const geoStatus = await navigator.permissions.query({ name: 'geolocation' });
            if (geoStatus.state === 'granted') {
              await requestGeolocation();
            } else if (geoStatus.state === 'prompt') {
              await requestGeolocation();
            }
          } catch (error) {
            await requestGeolocation();
          }
        } else {
          await requestGeolocation();
        }
      } catch (error) {
        console.warn('[App.js] Erro ao solicitar geolocalização:', error);
      }
    };

    requestCapabilities();
  }, [user]);

  // --- NOVO: Effect para verificar e mostrar o botão de ativar som ---
  useEffect(() => {
      // Define um pequeno delay para dar tempo ao audioManager.init() tentar o resume automático
      const timer = setTimeout(() => {
          if (user && !audioManager.unlocked) {
              setShowActivateSoundButton(true);
              console.log("[App.js] Áudio não desbloqueado, mostrando botão.");
          } else {
              setShowActivateSoundButton(false);
          }
      }, 500); // Meio segundo de espera

      return () => clearTimeout(timer);
  }, [user]);


  // EFFECT para sincronizar ref com estado isAlarmSnoozed
  useEffect(() => {
    isSnoozedRef.current = isAlarmSnoozed;
  }, [isAlarmSnoozed]);

  // --- Refs para estabilizar callbacks ---
  const playAlarmRef = useRef(playAlarm);
  useEffect(() => {
      playAlarmRef.current = playAlarm;
  }, [playAlarm]);
  
    useEffect(() => {
    stopAlarmFnRef.current = stopAlarmFn;
  }, [stopAlarmFn]);
  
   const handleIncomingPushNotification = useCallback((payload) => {
    console.log('[App.js] Notificação push recebida:', payload);
    setHasNewPendingOrders(true);

    if (isSnoozedRef.current) {
      console.log('[App.js] Push recebido durante soneca. Alarme permanecerá silenciado até o fim da soneca.');
      return;
    }

    if (typeof playAlarmRef.current === 'function') {
      playAlarmRef.current();
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      pushTokenRef.current = null;
      return;
    }

    let unsubscribeForeground = null;
    let unsubscribeServiceWorker = null;
    let cancelled = false;

    const setupPushNotifications = async () => {
      try {
        const token = await registerDeviceForPush(userId);
        if (token) {
          pushTokenRef.current = token;
          console.log('[App.js] Token de push registrado para o usuário:', userId, token);
        }
      } catch (error) {
        console.error('[App.js] Erro ao configurar notificações push:', error);
      }

      if (cancelled) {
        return;
      }

      try {
        unsubscribeForeground = await listenForForegroundMessages((payload) => {
          console.log('[App.js] Mensagem de push recebida em primeiro plano:', payload);
          handleIncomingPushNotification(payload);
        });
      } catch (error) {
        console.error('[App.js] Não foi possível escutar mensagens em primeiro plano:', error);
      }

      unsubscribeServiceWorker = subscribeToServiceWorkerMessages((event) => {
        const message = event.data;
        if (!message) {
          return;
        }

        if (message.type === 'NEW_ORDER_PUSH') {
          handleIncomingPushNotification(message.payload);
        }
		
        if (message.type === 'PLAY_ORDER_SOUND' && typeof playAlarmRef.current === 'function') {
          playAlarmRef.current();
        }		
		
      });
    };

    setupPushNotifications();

    return () => {
      cancelled = true;
      if (typeof unsubscribeForeground === 'function') {
        unsubscribeForeground();
      }
      if (typeof unsubscribeServiceWorker === 'function') {
        unsubscribeServiceWorker();
      }
    };
  }, [userId, handleIncomingPushNotification]);

  const dataRef = useRef(data);
  useEffect(() => {
      dataRef.current = data;
  }, [data]);
  
  // FUNÇÃO PARA PARAR E ATIVAR SONEÇA - Refatorada
  const handleStopAndSnoozeAlarm = useCallback(() => {
    console.log('[App.js] Ativando soneca...');
    stopAlarm(); // Para o alarme atual
	setStopAlarmFn(null); // Limpa o estado da função de parada
    setIsAlarmSnoozed(true); // Ativa o estado de soneca
    
    const endTime = new Date().getTime() + (5 * 60 * 1000); // 5 minutos a partir de agora
    setSnoozeEndTime(endTime); // Define o tempo final da soneca
    
    // Limpa timer anterior se existir
    if (snoozeTimerRef.current) clearInterval(snoozeTimerRef.current);
    
    // Inicia timer para reativar alarme
    snoozeTimerRef.current = setInterval(() => {
      const now = new Date().getTime();
      const remaining = endTime - now;
      
      if (remaining <= 0) {
        // Fim da soneca
        clearInterval(snoozeTimerRef.current);
        snoozeTimerRef.current = null;
        setIsAlarmSnoozed(false); // Desativa o estado de soneca
        setSnoozeEndTime(null);
        console.log('[App.js] Soneca terminada');
        
        // Verifica se ainda existem pedidos pendentes para tocar o alarme novamente
        const hasPending = dataRef.current.pedidos && dataRef.current.pedidos.some(p => p.status === 'Pendente');
        if (hasPending) {
          console.log('[App.js] Pedidos pendentes encontrados após soneca, reativando alarme.');
          setHasNewPendingOrders(true); // Garante que o banner apareça (se necessário)
          playAlarmRef.current(); // Tenta tocar o alarme usando a ref
        } else {
           setHasNewPendingOrders(false); // Esconde o banner se não há mais pendentes
        }
      } 
      // O display do timer é gerenciado localmente pelo Dashboard
    }, 1000); // Atualiza a cada segundo
  }, [stopAlarm]); // Removidas dependências instáveis (data, playAlarm, unlockAudio)

  // EFFECT PARA SINCRONIZAR DADOS DO FIREBASE
	useEffect(() => {
          if (!user) {
                setData({ clientes: [], pedidos: [], produtos: [], contas_a_pagar: [], contas_a_receber: [], fornecedores: [], pedidosCompra: [], estoque: [], logs: [], cupons: [], users: [], subcategorias: [], fornecedorCategorias: [], pontos: [], empresaInfo: [] });
		setLoading(false);
		initialDataLoaded.current = false;
		return;
	  }

	  setLoading(true);
	  
          const collectionsToSync = [
                'clientes', 'produtos', 'contas_a_pagar', 'contas_a_receber',
                'fornecedores', 'pedidosCompra', 'estoque', 'logs', 'cupons', 'users', 'pedidos', 'subcategorias', 'fornecedorCategorias',
                'pontos', 'empresaInfo'
				];

	  const unsubscribes = [];
	  
	  collectionsToSync.forEach(colName => {
		  const q = query(collection(db, colName));
		  const unsub = onSnapshot(q,
			(snapshot) => {
			  const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
			  
			  setData(prevData => ({ ...prevData, [colName]: items }));

			  if (colName === 'pedidos') {
				const activeOrders = items.filter(p => p.status !== 'Finalizado' && p.status !== 'Cancelado');
				setPendingOrders(activeOrders); 
			  
				if (initialDataLoaded.current) {
				  const newPendingOrdersDetected = snapshot.docChanges().some(change => 
					change.type === 'added' && change.doc.data().status === 'Pendente'
				  );
				  
				  // CORREÇÃO: Só toca alarme se não estiver já tocando
				  if (newPendingOrdersDetected && !isAlarmPlaying && !isSnoozedRef.current) {
					console.log('[App.js] Novo pedido pendente detectado pelo listener!');
					setHasNewPendingOrders(true); 
					
					console.log('[App.js] Tentando tocar alarme...');
					(async () => {
					  try {
						// Verifica se o áudio está desbloqueado antes de tentar tocar 
						if (!audioManager.unlocked) {
						  console.warn("[App.js] Áudio bloqueado — aguardando interação do usuário.");
						  try {
							await audioManager.userUnlock();
						  } catch (e) {
							console.warn("[App.js] Não foi possível desbloquear o áudio automaticamente:", e);
						  }
						}

						// Só tenta tocar o som se o contexto estiver ativo
						if (audioManager.unlocked) {
						  playAlarmRef.current(); // chama normalmente
						} else {
						  console.log("[App.js] Áudio ainda bloqueado, não tocando alarme.");
						}

					  } catch (error) {
						console.error("[App.js] Erro ao tentar tocar alarme:", error);
					  }
					})();
				  }
				  else if (newPendingOrdersDetected && isSnoozedRef.current) {
					console.log('[App.js] Alarme em modo soneca, não tocando agora.');
				  }
				  else if (newPendingOrdersDetected && isAlarmPlaying) {
					console.log('[App.js] Alarme já está tocando, não iniciando novo.');
				  }
				}
			  }
			},
			(error) => {
			  console.error(`[App.js] Erro ao sincronizar ${colName}:`, error);
			}
		  );
		  unsubscribes.push(unsub);
	  });

	  initialDataLoaded.current = true;
	  setLoading(false); 

	  return () => {
		unsubscribes.forEach(unsubscribe => unsubscribe());
		initialDataLoaded.current = false; 
	  };
	}, [user, isAlarmPlaying]); // ADICIONE isAlarmPlaying aqui

    // EFFECT PARA PARAR ALARME QUANDO NÃO HÁ MAIS PEDIDOS PENDENTES
    useEffect(() => {
        const hasAnyPending = data.pedidos && data.pedidos.some(p => p.status === 'Pendente');

        if (!hasAnyPending && !isAlarmSnoozed) {
          console.log('[App.js] Nenhum pedido pendente e não está em soneca. Parando alarme e escondendo banner.');
          setHasNewPendingOrders(false);
          stopAlarm();
        }
    }, [data.pedidos, isAlarmSnoozed, stopAlarm]);

    // Garante que o alarme continue tocando enquanto houver pedidos pendentes
    useEffect(() => {
        const hasPendingOrders = pendingOrders.some(order => order.status === 'Pendente');

        if (hasPendingOrders && !isAlarmSnoozed && !isAlarmPlaying) {
          console.log('[App.js] Pedidos pendentes encontrados enquanto o alarme estava parado. Reativando alarme.');
          setHasNewPendingOrders(true);
          playAlarmRef.current();
        }
    }, [pendingOrders, isAlarmSnoozed, isAlarmPlaying]);

    // --- REMOVIDO: Antigo useEffect de desbloqueio ---
    // useEffect(() => { if (audioUnlocked && ...) ... });


  const addItem = async (section, item) => {
    try {
        const docRef = await addDoc(collection(db, section), {
            ...item,
            createdAt: new Date()
        });
        if (user && section !== 'logs') {
            await addDoc(collection(db, 'logs'), {
                action: `Novo item adicionado em ${section}`,
                details: `ID: ${docRef.id}`,
                userEmail: user?.auth?.email || 'N/A', // Fallback para email
                timestamp: new Date()
            });
        }
    } catch (e) {
        console.error("Erro ao adicionar documento: ", e);
    }
  };

  const updateItem = async (section, id, updatedItem) => {
    try {
        const itemDoc = doc(db, section, id);
        if (user && section !== 'logs') {
             const docSnap = await getDoc(itemDoc);
             if (docSnap.exists()) {
                const oldData = docSnap.data();
                const changes = {};
                for (const key in updatedItem) {
                    if (Object.prototype.hasOwnProperty.call(updatedItem, key) && 
                        JSON.stringify(oldData[key]) !== JSON.stringify(updatedItem[key])) {
                        changes[key] = { old: oldData[key], new: updatedItem[key] };
                    }
                }
                if (Object.keys(changes).length > 0) {
                     await addDoc(collection(db, 'logs'), {
                        action: `Item atualizado em ${section}`,
                        details: `ID ${id} com alterações: ${JSON.stringify(changes)}`,
                        userEmail: user?.auth?.email || 'N/A', // Fallback para email
                        timestamp: new Date()
                    });
                }
             }
        }
        await updateDoc(itemDoc, updatedItem);
    } catch (e) {
        console.error("Erro ao atualizar documento: ", e);
    }
  };

  const deleteItem = async (section, id) => {
    try {
        await deleteDoc(doc(db, section, id));
        if (user && section !== 'logs') {
            await addDoc(collection(db, 'logs'), {
                action: `Item deletado de ${section}`,
                details: `ID: ${id}`,
                userEmail: user?.auth?.email || 'N/A', // Fallback para email
                timestamp: new Date()
            });
        }
    } catch (e) {
        console.error("Erro ao deletar documento: ", e);
    }
  };
  
  useEffect(() => {
    const scripts = [
        { id: 'jspdf', src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' },
        { id: 'jspdf-autotable', src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js' },
        { id: 'xlsx', src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' },
        { id: 'chartjs', src: 'https://cdn.jsdelivr.net/npm/chart.js' }
    ];

    scripts.forEach(scriptInfo => {
        if (!document.getElementById(scriptInfo.id)) {
            const script = document.createElement('script');
            script.id = scriptInfo.id;
            script.src = scriptInfo.src;
            script.async = true;
            document.body.appendChild(script);
        }
    });
  }, []);

  useEffect(() => {
    const handleResize = () => {
        const desktop = window.innerWidth >= 768;
        setIsDesktop(desktop);
        setSidebarOpen(desktop);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
	useEffect(() => {
	  const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
		if (authUser) {
		  try {
			const userDocRef = doc(db, "users", authUser.uid);
			const userDoc = await getDoc(userDocRef);
			const userData = { 
			  auth: authUser, 
			  role: userDoc.exists() ? userDoc.data().role || 'Atendente' : 'Atendente' 
			};
			setUser(userData);
			// Tenta inicializar/resumir o AudioManager APÓS o login
			if (localStorage.getItem("audioUnlocked") === "true") {
			  audioManager.init().catch((e) => {
					console.error("Erro no init pós-login:", e);
			  });
			}

		  } catch (error) {
			console.error("Erro ao carregar dados do usuário:", error);
		  }
		} else {
		  setUser(null);
		  setCurrentPage('pagina-inicial'); 
           // Não remove mais 'audioUnlocked' do localStorage no logout
           stopAlarm(); // Garante que o alarme pare no logout
		}
		setAuthLoading(false);
	  });

	  return () => unsubscribe();
	}, [stopAlarm, setCurrentPage]); 

    const handleLogin = async () => {
        setLoginError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
            setShowLogin(false);
            setEmail('');
            setPassword('');
            setCurrentPage('dashboard');
             // O onAuthStateChanged cuidará de inicializar o AudioManager se necessário
        } catch (error) {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                setLoginError('Email ou senha inválidos.');
            } else {
                 console.error("Erro no login:", error);
                setLoginError('Ocorreu um erro. Tente novamente.');
            }
        }
    };

    const handleGoogleSignIn = async () => {
        setLoginError('');
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const googleUser = result.user;

            const q = query(collection(db, "users"), where("email", "==", googleUser.email));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                await signOut(auth);
                setLoginError("Usuário não autorizado. Solicite acesso ao administrador.");
            } else {
                setShowLogin(false);
                setCurrentPage('dashboard');
                 // O onAuthStateChanged cuidará de inicializar o AudioManager se necessário
            }
        } catch (error) {
            console.error("Erro no login com Google:", error);
            if (error.code === 'auth/popup-closed-by-user') {
                // Não mostra erro se o usuário simplesmente fechou
            } else if (error.code !== 'auth/cancelled-popup-request') { // Ignora erro comum de popup fechado rapidamente
                 setLoginError('Ocorreu um erro ao entrar com Google.');
            }
        }
    };
    
    const handlePasswordReset = async () => {
        if (!passwordResetEmail) {
            setPasswordResetMessage({ text: 'Por favor, insira seu email.', type: 'error' });
            return;
        }
        setPasswordResetMessage({ text: 'Enviando email...', type: 'loading' });
        try {
            await sendPasswordResetEmail(auth, passwordResetEmail);
            setPasswordResetMessage({ text: 'Email de recuperação enviado! Verifique sua caixa de entrada e spam.', type: 'success' });
        } catch (error) {
            if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
                setPasswordResetMessage({ text: 'Email não encontrado. Verifique o email digitado.', type: 'error' });
            } else {
                 console.error("Erro ao resetar senha:", error);
                setPasswordResetMessage({ text: 'Ocorreu um erro. Tente novamente.', type: 'error' });
            }
        }
    };


  const handleLogout = async () => { 
      stopAlarm(); // Garante que o alarme pare
      await signOut(auth); 
      // O useEffect do onAuthStateChanged agora cuida de resetar a página
  };

  const allMenuItems = [ 
    { id: 'pagina-inicial', label: 'Página Inicial', icon: Home, roles: ['admin', 'Atendente', null] }, 
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'Atendente'] }, 
    { id: 'clientes', label: 'Clientes', icon: Users, roles: ['admin', 'Atendente'] }, 
    { id: 'pedidos', label: 'Pedidos', icon: ShoppingCart, roles: ['admin', 'Atendente'] }, 
    { id: 'produtos', label: 'Produtos', icon: Package, roles: ['admin', 'Atendente'] }, 
    { id: 'agenda', label: 'Agenda', icon: Calendar, roles: ['admin', 'Atendente'] },
    { id: 'fornecedores', label: 'Fornecedores/Estoque', icon: Truck, roles: ['admin', 'Atendente'] },
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3, roles: ['admin', 'Atendente'] },
    { id: 'meu-espaco', label: 'Meu Espaço', icon: Clock, roles: ['admin', 'Atendente'] },
    { id: 'financeiro', label: 'Financeiro', icon: DollarSign, roles: ['admin'] },
    { id: 'configuracoes', label: 'Configurações', icon: Settings, roles: ['admin'] }, 
  ];
  const currentUserRole = user ? user.role : null;
  const menuItems = allMenuItems.filter(item => item.roles.includes(currentUserRole));
  
  const ImageSlider = ({ images, onImageClick }) => { 
    const [currentIndex, setCurrentIndex] = useState(0); 
    const nextSlide = useCallback(() => { 
        setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length); 
    }, [images.length]); 
    useEffect(() => { 
        const timer = setInterval(nextSlide, 5000); 
        return () => clearInterval(timer); 
    }, [nextSlide]); 
    return ( 
        <div className="h-64 md:h-96 w-full m-auto relative group rounded-2xl overflow-hidden shadow-lg bg-pink-50/30"> 
            <div 
                style={{ backgroundImage: `url(${images[currentIndex]})` }} 
                className="w-full h-full bg-center bg-contain bg-no-repeat duration-500 cursor-pointer" 
                onClick={() => onImageClick(images[currentIndex])}
            ></div> 
        </div> 
    ); 
  };
  
  // Componentes de Páginas
  const PaginaInicial = () => {
    const slideImages = [ '/slide/slide1.png', '/slide/slide2.png', '/slide/slide3.png' ];
    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Página Inicial</h1>
            <p className="text-gray-600 mt-1">Seja bem-vindo à Ana Guimarães Doceria!</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
              <a href="/cardapio" target="_blank" rel="noopener noreferrer" className="font-medium rounded-xl transition-all flex items-center gap-2 justify-center bg-gradient-to-r from-pink-500 to-rose-600 text-white hover:from-pink-600 hover:to-rose-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 px-6 py-3 w-full">
                  <BookOpen className="w-4 h-4" /> Cardápio Delivery
              </a>
              <a href="/cardapio-festa" target="_blank" rel="noopener noreferrer" className="font-medium rounded-xl transition-all flex items-center gap-2 justify-center bg-gradient-to-r from-pink-500 to-rose-600 text-white hover:from-pink-600 hover:to-rose-700 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 px-6 py-3 w-full">
                  <Gift className="w-4 h-4" /> Cardápio de Festas
              </a>
          </div>
        </div>
        <ImageSlider images={slideImages} onImageClick={setLightboxImage} />
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Sobre Nós</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                    <p className="text-gray-600 leading-relaxed mb-4">
                        Somos uma doceria apaixonada por criar momentos doces e inesquecíveis. Cada bolo, torta e doce é feito com ingredientes de alta qualidade e muito carinho, pensando em levar mais sabor para o seu dia.
                    </p>
                    <div className="space-y-3">
                        <a href="https://www.instagram.com/anaguimaraes.doceria/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-pink-600 font-semibold hover:underline">
                            <Instagram size={20} /> @anaguimaraes.doceria
                        </a>
                        <a href="https://wa.me/5562991056075" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-green-600 font-semibold hover:underline">
                            <MessageCircle size={20} /> (62) 99105-6075
                        </a>
                        <p className="flex items-center gap-2 text-gray-700">
                            <MapPin size={20} /> Av. Comercial, 433 - Jardim Nova Esperanca, Goiânia - GO
                        </p>
                    </div>
                    <div className="mt-4">
                        <h3 className="font-bold text-lg mb-2">Horário de Funcionamento:</h3>
                        <ul className="text-gray-600">
                            <li>Segunda a Sexta: 09:30 – 18:30</li>
                            <li>Sábado: 09:00 – 14:00</li>
                            <li>Domingo: Fechado</li>
                        </ul>
                    </div>
                </div>
                <div>
                    <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3821.890300951331!2d-49.3274707!3d-16.6725019!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x935ef50062f12789%3A0x5711296a03567da3!2sAna%20Guimar%C3%Aes%2d doceria!5e0!3m2!1spt-BR!2sbr!4v1661282662551!5m2!1spt-BR!2sbr" width="100%" height="300" style={{border:0}} allowFullScreen="" loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="rounded-lg shadow-md" title="Localização da Doceria"></iframe>
                </div>
            </div>
        </div>
      </div>
    );
  };

  // --- CORREÇÃO: Props do Dashboard atualizadas ---
  const Dashboard = ({handleStopAndSnoozeAlarm, isAlarmPlaying, isAlarmSnoozed, hasNewPendingOrders, snoozeEndTime}) => {
    const { pedidos, clientes } = data;
    
    // --- CORREÇÃO: Lógica de display da soneca movida para dentro do Dashboard ---
    const [snoozeDisplay, setSnoozeDisplay] = useState('');
    const snoozeDisplayTimerRef = useRef(null);
    // --- CORREÇÃO: State local para audioUnlocked (lido do manager) ---
    const [audioAllowed, setAudioAllowed] = useState(audioManager.unlocked);

    // Efeito para observar mudanças no estado 'unlocked' do AudioManager
    useEffect(() => {
        const checkAudioState = () => {
             // Força a atualização do estado local lendo a propriedade do manager
            setAudioAllowed(audioManager.unlocked);
        };
        // Checa o estado a cada segundo
        const interval = setInterval(checkAudioState, 1000);
        checkAudioState(); // Checa imediatamente na montagem
        return () => clearInterval(interval); // Limpa o intervalo ao desmontar
    }, []); // Roda apenas uma vez no mount


    useEffect(() => {
        if (isAlarmSnoozed && snoozeEndTime) {
            // Limpa timer anterior, se houver
            if (snoozeDisplayTimerRef.current) clearInterval(snoozeDisplayTimerRef.current);
            
            // Função para atualizar o display
            const updateDisplay = () => {
                const now = new Date().getTime();
                const remaining = snoozeEndTime - now;

                if (remaining > 0) {
                    const minutes = Math.floor(remaining / 60000);
                    const seconds = Math.floor((remaining % 60000) / 1000);
                    setSnoozeDisplay(`${minutes}:${seconds.toString().padStart(2, '0')}`);
                } else {
                    // Timer expirou, limpa o display e o timer
                    setSnoozeDisplay('');
                    if (snoozeDisplayTimerRef.current) clearInterval(snoozeDisplayTimerRef.current);
                }
            };
            
            updateDisplay(); // Atualiza imediatamente
            snoozeDisplayTimerRef.current = setInterval(updateDisplay, 1000); // Atualiza a cada segundo
        } else {
            // Garante que, se não estiver em soneca, o timer e o display sejam limpos
            if (snoozeDisplayTimerRef.current) clearInterval(snoozeDisplayTimerRef.current);
            setSnoozeDisplay('');
        }

        // Função de limpeza para o timer do display
        return () => {
            if (snoozeDisplayTimerRef.current) clearInterval(snoozeDisplayTimerRef.current);
        };
    }, [isAlarmSnoozed, snoozeEndTime]); // Roda sempre que o estado de soneca ou o tempo final mudarem


    const today = new Date(); 
    today.setHours(0, 0, 0, 0);
    const lastSunday = new Date(); 
    lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay()); 
    lastSunday.setHours(0, 0, 0, 0);
    const vendasHoje = (pedidos || []).filter(pedido => { const pedidoDate = getJSDate(pedido.createdAt); if (!pedidoDate) return false; pedidoDate.setHours(0,0,0,0); return pedidoDate.getTime() === today.getTime() && pedido.status === 'Finalizado'; }).reduce((acc, pedido) => acc + (pedido.total || 0), 0);
    const numVendasHoje = (pedidos || []).filter(pedido => { const pedidoDate = getJSDate(pedido.createdAt); if (!pedidoDate) return false; pedidoDate.setHours(0,0,0,0); return pedidoDate.getTime() === today.getTime() && pedido.status === 'Finalizado'; }).length;
    const vendasSemana = (pedidos || []).filter(pedido => { const pedidoDate = getJSDate(pedido.createdAt); if (!pedidoDate) return false; return pedidoDate >= lastSunday && pedidoDate <= new Date() && pedido.status === 'Finalizado'; }).reduce((acc, pedido) => acc + (pedido.total || 0), 0);
    const numVendasSemana = (pedidos || []).filter(pedido => { const pedidoDate = getJSDate(pedido.createdAt); if (!pedidoDate) return false; return pedidoDate >= lastSunday && pedidoDate <= new Date() && pedido.status === 'Finalizado'; }).length;
    
    const activeStatuses = ['Pendente', 'Em Produção', 'Pronto para Entrega'];
    const pedidosPendentesCRM = (pedidos || []).filter(p => activeStatuses.includes(p.status) && p.origem !== 'Cardapio Online').length;
    const pedidosPendentesWhatsApp = (pedidos || []).filter(p => activeStatuses.includes(p.status) && p.origem === 'Cardapio Online').length;
    
    const clientesAtivos = (clientes || []).length;
    
    const upcomingBirthdays = useMemo(() => {
        if (!clientes) return [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limitDate = new Date();
        limitDate.setDate(today.getDate() + 30);

        return clientes.filter(cliente => {
            if (!cliente.aniversario || !/^\d{4}-\d{2}-\d{2}$/.test(cliente.aniversario)) return false;

            const [, month, day] = cliente.aniversario.split('-');
            const birthMonth = parseInt(month, 10) - 1;
            const birthDay = parseInt(day, 10);

            const currentYearBirthday = new Date(today.getFullYear(), birthMonth, birthDay);
            currentYearBirthday.setHours(0, 0, 0, 0);

            const nextYearBirthday = new Date(today.getFullYear() + 1, birthMonth, birthDay);
            nextYearBirthday.setHours(0, 0, 0, 0);

            const upcomingBirthday = currentYearBirthday < today ? nextYearBirthday : currentYearBirthday;
            
            return upcomingBirthday >= today && upcomingBirthday <= limitDate;
        }).sort((a, b) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const getUpcomingBirthday = (aniversario) => {
                 const [, month, day] = aniversario.split('-');
                 const birthMonth = parseInt(month, 10) - 1;
                 const birthDay = parseInt(day, 10);
                 const currentYearBirthday = new Date(today.getFullYear(), birthMonth, birthDay);
                 currentYearBirthday.setHours(0, 0, 0, 0);
                 const nextYearBirthday = new Date(today.getFullYear() + 1, birthMonth, birthDay);
                 nextYearBirthday.setHours(0, 0, 0, 0);
                 return currentYearBirthday < today ? nextYearBirthday : currentYearBirthday;
            };

            const dateA = getUpcomingBirthday(a.aniversario);
            const dateB = getUpcomingBirthday(b.aniversario);
            
            return dateA - dateB;
        });
    }, [clientes]);

    const upcomingFestaOrders = useMemo(() => {
        if (!pedidos) return [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const limitDate = new Date();
        limitDate.setDate(today.getDate() + 7);
        limitDate.setHours(23, 59, 59, 999);
  
        return pedidos
            .filter(pedido => {
                if (pedido.categoria !== 'Festa' || !pedido.dataEntrega || ['Finalizado', 'Cancelado'].includes(pedido.status)) {
                    return false;
                }
                const entregaDate = new Date(pedido.dataEntrega + 'T00:00:00'); // Considera a data no início do dia
                // entregaDate.setHours(0, 0, 0, 0); // Ajuste já feito na criação
  
                return entregaDate >= today && entregaDate <= limitDate;
            })
            .sort((a, b) => new Date(a.dataEntrega) - new Date(b.dataEntrega));
    }, [pedidos]);

    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        
        <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
            <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Dashboard</h1>
                <p className="text-gray-600 mt-1">Visão geral da sua doceria</p>
            </div>
            
            {/* Container para os banners de alarme e soneca */}
            <div className="w-full md:w-auto md:min-w-[300px] space-y-2"> 
                {hasNewPendingOrders && !isAlarmSnoozed && (
                  <div className={`p-3 rounded-lg transition-colors ${
                    isAlarmPlaying ? 'bg-red-100 border border-red-300 text-red-700' : 'bg-yellow-100 border border-yellow-300 text-yellow-700'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center">
                        <Bell className={`w-6 h-6 mr-3 ${isAlarmPlaying ? 'animate-bounce' : ''}`} />
                        <div>
                          <p className="font-bold">
                            {isAlarmPlaying ? "🔊 NOVO PEDIDO!" : "📱 Pedido Pendente!"}
                          </p>
                          {/* Mostra aviso apenas se o som estiver bloqueado E o alarme não estiver tocando */}
                          {!audioAllowed && !isAlarmPlaying && (
                            <p className="text-sm text-yellow-600">
                              🔒 Áudio bloqueado
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-shrink-0">
                         {/* Botão de Ativar Som removido daqui, é global agora */}
                        
                        <Button 
                          variant={isAlarmPlaying ? "danger" : "secondary"} 
                          size="sm" 
                          onClick={handleStopAndSnoozeAlarm}
                          className="text-xs" // Deixa o botão um pouco menor
                        >
                          <VolumeX className="w-4 h-4 mr-1" />
                          {isAlarmPlaying ? "Parar" : "Pausar (5min)"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {isAlarmSnoozed && (
                  <div className="bg-blue-100 border border-blue-300 text-blue-700 p-3 rounded-lg flex items-center">
                    <Clock className="w-5 h-5 mr-3 flex-shrink-0" />
                    <div>
                        <p className="font-bold">Alarme Pausado</p>
                        {/* Usa o snoozeDisplay local do Dashboard */}
                        <p className="text-sm">Reativando em <strong>{snoozeDisplay}</strong></p> 
                    </div>
                  </div>
                )}
            </div>
        </div>


        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center shadow-lg"><DollarSign className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Vendas Hoje</p><h2 className="text-2xl font-bold text-gray-800">R$ {vendasHoje.toFixed(2)}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg"><ShoppingCart className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Nº Vendas Hoje</p><h2 className="text-2xl font-bold text-gray-800">{numVendasHoje}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg"><BarChart3 className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Vendas Semana</p><h2 className="text-2xl font-bold text-gray-800">R$ {vendasSemana.toFixed(2)}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg"><ShoppingCart className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Nº Vendas Semana</p><h2 className="text-2xl font-bold text-gray-800">{numVendasSemana}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl flex items-center justify-center shadow-lg"><Heart className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Clientes ativos</p><h2 className="text-2xl font-bold text-gray-800">{clientesAtivos}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg"><Clock className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Pendentes (CRM)</p><h2 className="text-2xl font-bold text-gray-800">{pedidosPendentesCRM}</h2></div></div></div>
            <div className="bg-white p-6 rounded-2xl shadow-lg"><div className="flex items-center gap-4"><div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg"><MessageSquare className="w-6 h-6 text-white" /></div><div><p className="text-gray-500 text-sm font-medium">Pendentes (WhatsApp)</p><h2 className="text-2xl font-bold text-gray-800">{pedidosPendentesWhatsApp}</h2></div></div></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {upcomingBirthdays.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                        <Cake className="w-6 h-6 text-pink-500" />
                        <h3 className="text-xl font-bold text-gray-800">Aniversariantes Próximos</h3>
                    </div>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                        {upcomingBirthdays.map(cliente => (
                            <div key={cliente.id} className="flex items-center justify-between p-3 bg-pink-50 rounded-lg">
                                <p className="font-semibold text-gray-700">{cliente.nome}</p>
                                <p className="text-sm text-pink-600 font-medium">
                                    {new Date(cliente.aniversario + 'T03:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {upcomingFestaOrders.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center gap-3 mb-4">
                        <Gift className="w-6 h-6 text-purple-500" />
                        <h3 className="text-xl font-bold text-gray-800">Próximas Entregas (Festa)</h3>
                    </div>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                        {upcomingFestaOrders.map(pedido => (
                            <div key={pedido.id} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                                <div>
                                    <p className="font-semibold text-gray-700">{pedido.clienteNome}</p>
                                    <p className="text-sm text-gray-500">Pedido para festa</p>
                                </div>
                                <p className="text-sm text-purple-600 font-medium">
                                    {new Date(pedido.dataEntrega + 'T03:00:00Z').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>
    );
  };

  const Clientes = () => {
    const { clientes } = data;
    const [searchTerm, setSearchTerm] = usePersistentState("clientes_searchTerm", "");
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [formData, setFormData] = useState({ nome: "", email: "", telefone: "", endereco: "", aniversario: "", status: "Ativo" });

    const filteredClients = useMemo(() => (clientes || []).filter(c => (c.nome && c.nome.toLowerCase().includes(searchTerm.toLowerCase())) || (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ), [clientes, searchTerm]);
    
    const resetForm = () => {
      setEditingClient(null);
      setFormData({ nome: "", email: "", telefone: "", endereco: "", aniversario: "", status: "Ativo" });
    };

    const handleNewClient = () => {
      resetForm();
      setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (editingClient) {
            const { id, ...updateData } = formData;
            await updateItem('clientes', editingClient.id, updateData);
        } else {
            await addItem('clientes', { ...formData, totalCompras: 0 });
        }
        setShowModal(false);
        resetForm();
    };
    const handleEdit = (client) => { setEditingClient(client); setFormData(client); setShowModal(true); };
    const columns = [
        { header: "Cliente", render: (row) => (<div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center text-white font-bold shadow-md">{row.nome.charAt(0).toUpperCase()}</div><div><p className="font-semibold text-gray-800">{row.nome}</p><p className="text-sm text-gray-500">{row.email}</p></div></div>) },
        { header: "Telefone", key: 'telefone' },
        {
          header: "Aniversário",
          render: (row) => {
            if (!row.aniversario) return '-';
            const parts = row.aniversario.split('-');
            if (parts.length !== 3) return '-';
            const [, month, day] = parts;
            return `${day}/${month}`;
          }
        },
        { header: "Total Compras", render: (row) => (<span className="font-semibold text-green-600">R$ {(row.totalCompras || 0).toFixed(2)}</span>) },
        { header: "Última Compra", render: (row) => row.ultimaCompra ? getJSDate(row.ultimaCompra)?.toLocaleDateString('pt-BR') : '-' },
        { header: "Status", render: (row) => (<span className={`px-3 py-1 rounded-full text-xs font-medium ${row.status === 'VIP' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>{row.status}</span>) }
    ];
    const actions = [ { icon: Edit, label: "Editar", onClick: handleEdit }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('clientes', row.id) }) } ];
    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4"><div><h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Gestão de Clientes</h1><p className="text-gray-600 mt-1">Gerencie seus clientes</p></div><Button onClick={handleNewClient} className="w-full md:w-auto"><Plus className="w-4 h-4" /> Novo Cliente</Button></div>
        <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Buscar clientes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500" /></div>
        <Table columns={columns} data={filteredClients} actions={actions} />
        <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingClient ? "Editar Cliente" : "Novo Cliente"} size="lg"><form onSubmit={handleSubmit} className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Input label="Nome Completo" type="text" value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} required /><Input label="Email" type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} /><Input label="Telefone" type="tel" value={formData.telefone} onChange={(e) => setFormData({...formData, telefone: e.target.value})} /><Input label="Data de Aniversário" type="date" value={formData.aniversario} onChange={(e) => setFormData({...formData, aniversario: e.target.value})} /></div><Input label="Endereço" type="text" value={formData.endereco} onChange={(e) => setFormData({...formData, endereco: e.target.value})} /><div className="flex justify-end gap-3 pt-4"><Button variant="secondary" type="button" onClick={() => { setShowModal(false); resetForm(); }}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4" />{editingClient ? "Salvar Alterações" : "Criar Cliente"}</Button></div></form></Modal>
      </div>
    );
  };
  
  const Produtos = () => {
    const [searchTerm, setSearchTerm] = usePersistentState("produtos_searchTerm", ""); 
    const [showModal, setShowModal] = useState(false); 
    const [editingProduct, setEditingProduct] = useState(null); 
    const [formData, setFormData] = useState({ nome: "", categoria: "Delivery", subcategoria: "", preco: "", custo: "", estoque: "", status: "Ativo", descricao: "", tempoPreparo: "", imageUrl: "" });
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    
    const [showAddSubcategory, setShowAddSubcategory] = useState(false);
    const [newSubcategoryName, setNewSubcategoryName] = useState("");
    const [isSavingSubcategory, setIsSavingSubcategory] = useState(false);
    const [subcategoryError, setSubcategoryError] = useState("");
    const [localSubcategorias, setLocalSubcategorias] = useState({});

    const subcategorias = useMemo(() => {
      const map = {};

      Object.entries(DEFAULT_SUBCATEGORIES).forEach(([categoria, subs]) => {
        map[categoria] = new Set(subs);
      });

      (data.subcategorias || []).forEach((item) => {
        if (!item?.categoria || !item?.nome) return;
        if (!map[item.categoria]) {
          map[item.categoria] = new Set();
        }
        map[item.categoria].add(item.nome);
      });

      Object.entries(localSubcategorias).forEach(([categoria, subs]) => {
        if (!map[categoria]) {
          map[categoria] = new Set();
        }
        subs.forEach((nome) => map[categoria].add(nome));
      });

      return Object.fromEntries(
        Object.entries(map).map(([categoria, values]) => [
          categoria,
          Array.from(values).sort((a, b) => a.localeCompare(b, 'pt-BR'))
        ])
      );
    }, [data.subcategorias, localSubcategorias]);

    useEffect(() => {
      if (formData.categoria && subcategorias[formData.categoria] && !subcategorias[formData.categoria].includes(formData.subcategoria)) {
          setFormData(prev => ({ ...prev, subcategoria: '' }));
      }
    }, [formData.categoria, formData.subcategoria, subcategorias]);
	
	  useEffect(() => {
      if (!data.subcategorias?.length) return;
      setLocalSubcategorias((prev) => {
        let hasChanges = false;
        const updated = { ...prev };

        Object.entries(prev).forEach(([categoria, subs]) => {
          const persisted = new Set(
            data.subcategorias
              .filter((item) => item?.categoria === categoria)
              .map((item) => item?.nome?.toLowerCase().trim())
          );

          const filtered = subs.filter((nome) => !persisted.has(nome.toLowerCase().trim()));

          if (filtered.length !== subs.length) {
            hasChanges = true;
            if (filtered.length > 0) {
              updated[categoria] = filtered;
            } else {
              delete updated[categoria];
            }
          }
        });

        return hasChanges ? updated : prev;
      });
    }, [data.subcategorias]);

    useEffect(() => {
      setShowAddSubcategory(false);
      setNewSubcategoryName("");
      setSubcategoryError("");
    }, [formData.categoria]);

    const handleCreateSubcategory = async () => {
      const categoriaAtual = formData.categoria;
      setSubcategoryError("");

      if (!categoriaAtual) {
        setSubcategoryError('Selecione uma categoria antes de adicionar uma subcategoria.');
        return;
      }

      const trimmedName = newSubcategoryName.trim();
      if (!trimmedName) {
        setSubcategoryError('Informe o nome da nova subcategoria.');
        return;
      }

      const existe = (subcategorias[categoriaAtual] || []).some(
        (nome) => nome.toLowerCase() === trimmedName.toLowerCase()
      );

      if (existe) {
        setSubcategoryError('Essa subcategoria já está cadastrada.');
        return;
      }

      try {
        setIsSavingSubcategory(true);
        await addItem('subcategorias', { categoria: categoriaAtual, nome: trimmedName });
        setLocalSubcategorias((prev) => {
          const atual = new Set(prev[categoriaAtual] || []);
          atual.add(trimmedName);
          return { ...prev, [categoriaAtual]: Array.from(atual) };
        });
        setFormData((prev) => ({ ...prev, subcategoria: trimmedName }));
        setShowAddSubcategory(false);
        setNewSubcategoryName("");
      } catch (error) {
        console.error('Erro ao adicionar subcategoria:', error);
        setSubcategoryError('Não foi possível adicionar a subcategoria. Tente novamente.');
      } finally {
        setIsSavingSubcategory(false);
      }
    };


    const filteredProducts = (data.produtos || []).filter(p => p.nome.toLowerCase().includes(searchTerm.toLowerCase()));
    const resetForm = () => { setShowModal(false); setEditingProduct(null); setFormData({ nome: "", categoria: "Delivery", subcategoria: "", preco: "", custo: "", estoque: "", status: "Ativo", descricao: "", tempoPreparo: "", imageUrl: "" }); setImageFile(null); setImagePreview(null); };
    const handleImageChange = (e) => { if (e.target.files[0]) { const file = e.target.files[0]; setImageFile(file); setImagePreview(URL.createObjectURL(file)); } };
    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsUploading(true);
        let imageUrl = formData.imageUrl || "";
        if (imageFile) {
            const imageRef = ref(storage, `products/${Date.now()}_${imageFile.name}`);
            await uploadBytes(imageRef, imageFile);
            imageUrl = await getDownloadURL(imageRef);
        }
        const productData = { ...formData, preco: parseFloat(formData.preco || 0), custo: parseFloat(formData.custo || 0), estoque: parseInt(formData.estoque || 0), imageUrl: imageUrl };
        if (editingProduct) {
            const { id, ...updateData } = productData;
            await updateItem('produtos', editingProduct.id, updateData);
        } else {
            await addItem('produtos', productData);
        }
        setIsUploading(false);
        resetForm();
    };
    const handleEdit = (product) => { setEditingProduct(product); setFormData({ ...product, preco: String(product.preco), custo: String(product.custo), estoque: String(product.estoque) }); setImagePreview(product.imageUrl || null); setShowModal(true); };
    const columns = [ { header: "Produto", render: (row) => (<div className="flex items-center gap-3"><img src={row.imageUrl || 'https://placehold.co/40x40/FFC0CB/FFFFFF?text=Doce'} alt={row.nome} className="w-10 h-10 rounded-xl object-cover shadow-md" onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/40x40/FFC0CB/FFFFFF?text=Erro'; }}/><div><p className="font-semibold text-gray-800">{row.nome}</p><p className="text-sm text-gray-500">{row.categoria} / {row.subcategoria}</p></div></div>)}, { header: "Preço", render: (row) => <span className="font-semibold text-green-600">R$ {(row.preco || 0).toFixed(2)}</span> }, { header: "Estoque", render: (row) => <span className={`font-medium ${row.estoque < 10 ? 'text-red-600' : 'text-gray-800'}`}>{row.estoque} un</span> }, { header: "Status", render: (row) => <span className={`px-3 py-1 rounded-full text-xs font-medium ${row.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{row.status}</span> } ];
    const actions = [ { icon: Edit, label: "Editar", onClick: handleEdit }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('produtos', row.id) }) } ];
    
    return (
      <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4"><div><h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Gestão de Produtos</h1><p className="text-gray-600 mt-1">Gerencie seu cardápio e estoque</p></div><Button onClick={() => setShowModal(true)} className="w-full md:w-auto"><Plus className="w-4 h-4" /> Novo Produto</Button></div>
        <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" /><input type="text" placeholder="Buscar produtos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500" /></div>
        <Table columns={columns} data={filteredProducts} actions={actions} />
        <Modal isOpen={showModal} onClose={resetForm} title={editingProduct ? "Editar Produto" : "Novo Produto"} size="xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input label="Nome do Produto" value={formData.nome} onChange={(e) => setFormData({...formData, nome: e.target.value})} required />
                  <Select label="Categoria" value={formData.categoria} onChange={(e) => setFormData({...formData, categoria: e.target.value})} required><option value="Delivery">Delivery</option><option value="Festa">Festa</option></Select>
                  <div className="space-y-2">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end">
                      <Select
                        label="Subcategoria"
                        value={formData.subcategoria}
                        onChange={e => setFormData({ ...formData, subcategoria: e.target.value })}
                        required
                        className="flex-1"
                      >
                        <option value="">Selecione...</option>
                        {(subcategorias[formData.categoria] || []).map(sub => (
                          <option key={sub} value={sub}>{sub}</option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setShowAddSubcategory(prev => !prev);
                          setSubcategoryError("");
                          setNewSubcategoryName("");
                        }}
                        className="md:mt-6 whitespace-nowrap"
                      >
                        <Plus className="w-4 h-4" /> Nova
                      </Button>
                    </div>
                    {showAddSubcategory && (
                      <div className="flex flex-col gap-2 md:flex-row md:items-end">
                        <Input
                          label="Nova Subcategoria"
                          type="text"
                          value={newSubcategoryName}
                          onChange={(e) => {
                            setNewSubcategoryName(e.target.value);
                            if (subcategoryError) setSubcategoryError("");
                          }}
                          className="flex-1"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={handleCreateSubcategory}
                            disabled={isSavingSubcategory}
                          >
                            {isSavingSubcategory ? 'Salvando...' : 'Adicionar'}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setShowAddSubcategory(false);
                              setNewSubcategoryName("");
                              setSubcategoryError("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                    {subcategoryError && (
                      <p className="text-sm text-red-600">{subcategoryError}</p>
                    )}
                  </div>
                  <Input label="Preço (R$)" type="number" step="0.01" value={formData.preco} onChange={(e) => setFormData({...formData, preco: e.target.value})} />
                  <Input label="Custo (R$)" type="number" step="0.01" value={formData.custo} onChange={(e) => setFormData({...formData, custo: e.target.value})} />
                  <Input label="Estoque" type="number" value={formData.estoque} onChange={(e) => setFormData({...formData, estoque: e.target.value})} />
                  <Input label="Tempo de Preparo" value={formData.tempoPreparo} onChange={(e) => setFormData({...formData, tempoPreparo: e.target.value})} />
                  <Select label="Status" value={formData.status || 'Ativo'} onChange={(e) => setFormData({...formData, status: e.target.value})} required>
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                  </Select>
                </div>
                <div className="relative">
                  <Textarea label="Descrição" rows="3" value={formData.descricao} onChange={(e) => setFormData({...formData, descricao: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Foto do Produto</label>
                <div className="w-full h-48 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center text-center p-4">{imagePreview ? (<img src={imagePreview} alt="Pré-visualização" className="max-h-full max-w-full object-contain rounded-lg"/>) : (<div className="text-gray-500"><ImageIcon className="mx-auto h-12 w-12" /><p className="mt-2 text-sm">Clique para selecionar</p></div>)}</div>
                <Input type="file" accept="image/*" onChange={handleImageChange} className="mt-2" />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" type="button" onClick={resetForm}>Cancelar</Button>
              <Button type="submit" disabled={isUploading}><Save className="w-4 h-4" />{isUploading ? 'Salvando...' : (editingProduct ? "Salvar Alterações" : "Criar Produto")}</Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  };
  
const Configuracoes = ({ user, setConfirmDelete, data, addItem, updateItem, deleteItem }) => {
    const [activeTab, setActiveTab] = usePersistentState('configuracoes_activeTab', 'users');
    
    // States para Usuários
    const [usuarios, setUsuarios] = useState([]);
	const [userSearchTerm, setUserSearchTerm] = useState('');
    const [userExcludeTerm, setUserExcludeTerm] = useState('');
    const [userEmailFilter, setUserEmailFilter] = useState('any');
    const [userRoleFilter, setUserRoleFilter] = useState('all');
    const [showUserModal, setShowUserModal] = useState(false); 
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null); 
    const [userFormData, setUserFormData] = useState({ email: "", senha: "", nome: "", role: "user" }); 
    const [newPassword, setNewPassword] = useState("");

    // States para Cupons
    const [cupons, setCupons] = useState([]);
    const [showCupomModal, setShowCupomModal] = useState(false);
    const [editingCupom, setEditingCupom] = useState(null);
    const [cupomFormData, setCupomFormData] = useState({});
	
	    const userRoles = useMemo(() => {
        const roles = new Set((usuarios || []).map((userItem) => userItem.role).filter(Boolean));
        return Array.from(roles);
    }, [usuarios]);

    const filteredUsuarios = useMemo(() => {
        const search = userSearchTerm.trim().toLowerCase();
        const exclude = userExcludeTerm.trim().toLowerCase();

        return (usuarios || []).filter((usuario) => {
            const name = (usuario.nome || '').toLowerCase();
            const email = (usuario.email || '').trim();
            const role = (usuario.role || '').toLowerCase();

            if (search && !name.includes(search)) return false;
            if (exclude && name.includes(exclude)) return false;

            if (userEmailFilter === 'empty' && email) return false;
            if (userEmailFilter === 'filled' && !email) return false;

            if (userRoleFilter !== 'all' && role !== userRoleFilter.toLowerCase()) return false;

            return true;
        });
    }, [usuarios, userSearchTerm, userExcludeTerm, userEmailFilter, userRoleFilter]);

    const hasUserFilters = useMemo(() => {
        return Boolean(
            userSearchTerm.trim() ||
            userExcludeTerm.trim() ||
            userEmailFilter !== 'any' ||
            userRoleFilter !== 'all'
        );
    }, [userSearchTerm, userExcludeTerm, userEmailFilter, userRoleFilter]);

    const handleClearUserFilters = useCallback(() => {
        setUserSearchTerm('');
        setUserExcludeTerm('');
        setUserEmailFilter('any');
        setUserRoleFilter('all');
    }, []);


    // 🔄 Carregar dados da aba ativa
    useEffect(() => {
        let unsubscribe = () => {}; // Função de cleanup vazia

        if (activeTab === 'users') {
            setUsuarios([]); // Limpa a lista atual para mostrar o carregamento
            // Chama a Cloud Function para buscar a lista de usuários do Authentication
            const listAllUsersFn = httpsCallable(functions, 'listAllUsers');
            listAllUsersFn()
                .then((result) => {
                    if (result.data.users) {
                        setUsuarios(result.data.users);
                    }
                })
                .catch((error) => {
                    console.error("Erro ao buscar a lista de usuários:", error);
                    alert("Ocorreu um erro ao buscar usuários: " + error.message);
                });

        } else if (activeTab === 'cupons') {
            unsubscribe = onSnapshot(collection(db, "cupons"), (snap) => {
                setCupons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });
        }
        
        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [activeTab]);
    
    // States para Configuração de Frete
    const [freteConfig, setFreteConfig] = useState({ enderecoLoja: '', lat: '', lng: '', valorPorKm: '' });
    const [isSavingFrete, setIsSavingFrete] = useState(false);

    useEffect(() => {
        if (activeTab === 'frete') {
            const fetchFreteConfig = async () => {
                try {
                    const docRef = doc(db, "configuracoes", "frete");
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        setFreteConfig(docSnap.data());
                    }
                } catch (error) {
                    console.error("Erro ao buscar configurações de frete:", error);
                }
            };
            fetchFreteConfig();
        }
    }, [activeTab]);
	
	//Limpeza quando o componente desmontar
        useEffect(() => {
          return () => {
                // Para o alarme quando o componente desmontar
                if (stopAlarmRef.current) {
                  stopAlarmRef.current();
                }
                if (stopAlarmFnRef.current) {
                  stopAlarmFnRef.current();
                }
          };
  }, []);
    
    // Handlers para Usuários
    const handleNewUser = () => { 
        setEditingUser(null); 
        setUserFormData({ email: "", senha: "", nome: "", role: "user" }); 
        setShowUserModal(true); 
    };
    const handleEditUser = (userToEdit) => { 
        setEditingUser(userToEdit); 
        setUserFormData(userToEdit); 
        setShowUserModal(true); 
    };

	const handleUserSubmit = async (e) => {
	  e.preventDefault();
	  
	  if (!userFormData.email || !userFormData.nome || !userFormData.role) {
		alert('Por favor, preencha todos os campos obrigatórios');
		return;
	  }

	  if (!editingUser && (!userFormData.senha || userFormData.senha.length < 6)) {
		alert('A senha é obrigatória e deve ter pelo menos 6 caracteres');
		return;
	  }

	  try {
		if (editingUser) {
		  const updateUserFn = httpsCallable(functions, 'updateUser');
		  await updateUserFn({
			uid: editingUser.uid,
			nome: userFormData.nome,
			role: userFormData.role,
			email: userFormData.email
		  });
		  alert('Usuário atualizado com sucesso!');
		} else {
		  const createUserFn = httpsCallable(functions, 'createUser');
		  await createUserFn({
			email: userFormData.email,
			senha: userFormData.senha,
			nome: userFormData.nome,
			role: userFormData.role,
		  });
		  alert('Usuário criado com sucesso!');
		}
		
		setShowUserModal(false);
		
		// Recarrega a lista de usuários
		const listAllUsersFn = httpsCallable(functions, 'listAllUsers');
		const result = await listAllUsersFn();
		setUsuarios(result.data.users);
		
	  } catch (error) {
		console.error('Erro completo:', error);
		alert("Erro ao salvar usuário: " + error.message);
	  }
	};

    const handleDeleteUser = async (userToDelete) => {
        const deleteUserFn = httpsCallable(functions, "deleteUser");
        try {
            await deleteUserFn({ uid: userToDelete.uid || userToDelete.id });
            // A remoção do Firestore já pode ser feita pela cloud function ou aqui como fallback
            await deleteDoc(doc(db, "users", userToDelete.id));
            setConfirmDelete({ isOpen: false, onConfirm: () => {} });
        } catch (err) {
            alert("Erro ao deletar usuário: " + err.message);
        }
    };
    
    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (!editingUser) return;
        const updatePasswordFn = httpsCallable(functions, "updateUserPassword");
        try {
          await updatePasswordFn({ uid: editingUser.uid || editingUser.id, newPassword });
          alert("Senha alterada com sucesso!");
          setShowPasswordModal(false);
          setNewPassword("");
        } catch (err) {
          alert("Erro ao alterar senha: " + err.message);
        }
    };
    
    const resetCupomForm = () => { 
        setEditingCupom(null); 
        setCupomFormData({ codigo: '', tipoDesconto: 'percentual', valor: '', limiteUso: '', valorMinimo: '', status: 'Ativo' }); 
    };
    
    const handleNewCupom = () => { 
        resetCupomForm(); 
        setShowCupomModal(true); 
    };
    
    const handleEditCupom = (cupom) => { 
        setEditingCupom(cupom); 
        setCupomFormData({
            ...cupom, 
            valor: String(cupom.valor || ''), 
            limiteUso: String(cupom.limiteUso || ''), 
            valorMinimo: String(cupom.valorMinimo || '')
        }); 
        setShowCupomModal(true); 
    };
    
    const handleCupomSubmit = async (e) => {
      e.preventDefault();
      
      try {
        const dataToSave = {
          codigo: cupomFormData.codigo.toUpperCase().trim(),
          tipoDesconto: cupomFormData.tipoDesconto,
          valor: parseFloat(cupomFormData.valor || 0),
          limiteUso: parseInt(cupomFormData.limiteUso || 0),
          valorMinimo: parseFloat(cupomFormData.valorMinimo || 0),
          status: cupomFormData.status || 'Ativo'
        };

        if (editingCupom) {
          await updateItem('cupons', editingCupom.id, dataToSave);
          alert('Cupom atualizado com sucesso!');
        } else {
          await addItem('cupons', { ...dataToSave, usos: 0 });
          alert('Cupom criado com sucesso!');
        }
        
        setShowCupomModal(false);
        resetCupomForm();
      } catch (error) {
        console.error('Erro ao salvar cupom:', error);
        alert('Erro ao salvar cupom: ' + error.message);
      }
    };

    const handleSaveFreteConfig = async (e) => {
        e.preventDefault();
        setIsSavingFrete(true);
        try {
            const freteDoc = doc(db, "configuracoes", "frete");
            await setDoc(freteDoc, {
                ...freteConfig,
                valorPorKm: parseFloat(freteConfig.valorPorKm || 0),
                updatedAt: new Date(),
                updatedBy: user?.auth?.email || 'Sistema'
            });
            alert('Configurações de frete salvas com sucesso!');
        } catch (error) {
            console.error("Erro ao salvar frete:", error);
            alert('Ocorreu um erro ao salvar as configurações.');
        } finally {
            setIsSavingFrete(false);
        }
    };

    const processedLogs = useMemo(() => {
        if (!data.logs || !Array.isArray(data.logs)) return [];
        return data.logs.map(log => {
            const { action = '', details = '' } = log;
            let formattedDetails = details;
            
            const updateMatch = details.match(/alterações: (\{.*\})/);
            if (action.includes('atualizado') && updateMatch) {
                try {
                    const changes = JSON.parse(updateMatch[1]);
                    const field = Object.keys(changes)[0];
                    const { old: oldVal, new: newVal } = changes[field];
                    const idMatch = details.match(/ID (\w+)/);
                    const id = idMatch ? idMatch[1].substring(0,8) + '...' : 'ID desconhecido';

                    formattedDetails = `Item "ID ${id}" atualizado (${field}: "${oldVal}" para "${newVal}")`;
                } catch (e) { 
                }
            } else {
                const idMatch = details.match(/ID:? (\w+)/);
                if (idMatch) {
                    const id = idMatch[1];
                    let collectionName = null;
                    if (action.includes('produtos')) collectionName = 'produtos';
                    else if (action.includes('clientes')) collectionName = 'clientes';
                    else if (action.includes('pedidos')) collectionName = 'pedidos';
                    else if (action.includes('fornecedores')) collectionName = 'fornecedores';
                    else if (action.includes('estoque')) collectionName = 'estoque';
                    else if (action.includes('cupons')) collectionName = 'cupons';

                    if (collectionName && data[collectionName] && Array.isArray(data[collectionName])) {
                        const item = data[collectionName].find(d => d.id === id);
                        if (item) {
                            const itemName = item.nome || item.clienteNome || item.codigo || `(ID: ${id})`;
                            formattedDetails = details.replace(`ID: ${id}`, `"${itemName}"`).replace(`ID ${id}`, `"${itemName}"`);
                        }
                    }
                }
            }
            
            return {
                ...log,
                user: log.userEmail || 'Não registrado',
                formattedDetails: formattedDetails,
            };
        }).sort((a, b) => {
            const dateA = getJSDate(a.timestamp) || new Date(0);
            const dateB = getJSDate(b.timestamp) || new Date(0);
            return dateB - dateA;
        });
    }, [data]);
    
    const userColumns = [ 
        { header: "Nome", key: "nome" },
        { header: "Email", key: "email" }, 
        { header: "Permissão", render: (row) => <span className={`px-3 py-1 rounded-full text-xs font-medium ${row.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>{row.role}</span> } 
    ];
    const userActions = [ 
        { icon: Edit, label: "Editar", onClick: handleEditUser }, 
        { icon: Key, label: "Alterar Senha", onClick: (u) => { setEditingUser(u); setShowPasswordModal(true); } },
        { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => handleDeleteUser(row) }) } 
    ];
    
    const cupomColumns = [
        { header: 'Código', key: 'codigo' },
        { header: 'Desconto', render: (row) => `${row.valor || 0} ${row.tipoDesconto === 'percentual' ? '%' : 'R$'}` },
        { header: 'Uso', render: (row) => `${row.usos || 0} / ${row.limiteUso || 0}` },
        { header: 'Valor Mínimo', render: (row) => `R$ ${(row.valorMinimo || 0).toFixed(2)}` },
        { header: 'Status', render: (row) => <span className={`px-3 py-1 rounded-full text-xs font-medium ${row.status === 'Ativo' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{row.status || 'Ativo'}</span> }
    ];
    const cupomActions = [ 
        { icon: Edit, label: "Editar", onClick: handleEditCupom }, 
        { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('cupons', row.id) }) } 
    ];

    const logColumns = [
        { header: "Data/Hora", render: (row) => {
            const date = getJSDate(row.timestamp);
            return date ? date.toLocaleString('pt-BR') : '-';
        }},
        { header: "Usuário", key: "user" },
        { header: "Ação", key: "action" },
        { header: "Detalhes", key: "formattedDetails" },
    ];
    
    return (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Configurações</h1>
              <p className="text-gray-600 mt-1">Gerencie usuários, cupons, frete e visualize os logs do sistema</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-2">
                <div className="flex space-x-2">
                    <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'users' ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        Usuários
                    </button>
                    <button onClick={() => setActiveTab('cupons')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'cupons' ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        Cupons
                    </button>
                    <button onClick={() => setActiveTab('frete')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'frete' ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        Frete
                    </button>
                    <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'logs' ? 'bg-pink-600 text-white' : 'hover:bg-pink-100'}`}>
                        Logs de Atividade
                    </button>
                </div>
            </div>
            
            {activeTab === 'users' && (

            <div>
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 md:p-6 mb-4">
                    <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
                        <h2 className="text-lg font-semibold text-gray-800">Filtros</h2>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleClearUserFilters}
                            disabled={!hasUserFilters}
                        >
                            Limpar filtros
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Input
                            label="Buscar por nome"
                            placeholder="Ex: Ana"
                            value={userSearchTerm}
                            onChange={(e) => setUserSearchTerm(e.target.value)}
                        />
                        <Input
                            label="Excluir nome"
                            placeholder="Ex: João"
                            value={userExcludeTerm}
                            onChange={(e) => setUserExcludeTerm(e.target.value)}
                        />
                        <Select
                            label="E-mail"
                            value={userEmailFilter}
                            onChange={(e) => setUserEmailFilter(e.target.value)}
                        >
                            <option value="any">Todos</option>
                            <option value="empty">Apenas vazios</option>
                            <option value="filled">Apenas preenchidos</option>
                        </Select>
                        <Select
                            label="Permissão"
                            value={userRoleFilter}
                            onChange={(e) => setUserRoleFilter(e.target.value)}
                        >
                            <option value="all">Todas</option>
                            {userRoles.map((roleOption) => (
                                <option key={roleOption} value={roleOption}>
                                    {roleOption.charAt(0).toUpperCase() + roleOption.slice(1)}
                                </option>
                            ))}
                        </Select>
                    </div>
                </div>

                <div className="flex justify-end my-4">
                    <Button onClick={handleNewUser}><Plus className="w-4 h-4" /> Novo Usuário</Button>
                </div>
				
                {(!usuarios || usuarios.length === 0) ? (
                    <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                        <p className="text-gray-500">Nenhum usuário encontrado.</p>
                        <p className="text-sm text-gray-400 mt-2">Clique em "Novo Usuário" para criar o primeiro usuário.</p>
                    </div>
				) : (filteredUsuarios.length === 0 ? (
                    <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                        <p className="text-gray-500">Nenhum usuário corresponde aos filtros selecionados.</p>
                        <p className="text-sm text-gray-400 mt-2">Ajuste os filtros ou limpe-os para visualizar todos os usuários.</p>
                    </div>								
                ) : (
					<Table columns={userColumns} data={filteredUsuarios} actions={userActions} />
                ))}
                  
              </div>
            )}
            
            {activeTab === 'cupons' && (
              <div>
                <div className="flex justify-end my-4">
                    <Button onClick={handleNewCupom}><Ticket className="w-4 h-4" /> Novo Cupom</Button>
                </div>
                {(!cupons || cupons.length === 0) ? (
                    <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                        <p className="text-gray-500">Nenhum cupom cadastrado.</p>
                        <p className="text-sm text-gray-400 mt-2">Clique em "Novo Cupom" para criar o primeiro cupom.</p>
                    </div>
                ) : (
                    <Table columns={cupomColumns} data={cupons} actions={cupomActions} />
                )}
              </div>
            )}

            {activeTab === 'logs' && (
                <div className="mt-4">
                    {(!data.logs || data.logs.length === 0) ? (
                        <div className="text-center p-8 bg-white rounded-2xl shadow-lg">
                            <p className="text-gray-500">Nenhum log de atividade encontrado.</p>
                            <p className="text-sm text-gray-400 mt-2">Os logs aparecerão conforme você usar o sistema.</p>
                        </div>
                    ) : (
                        <Table columns={logColumns} data={processedLogs} />
                    )}
                </div>
            )}
            
            {activeTab === 'frete' && (
                <div className="mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                    <form onSubmit={handleSaveFreteConfig} className="space-y-4 max-w-lg">
                        <h3 className="text-xl font-bold text-gray-800">Configurações de Entrega</h3>
                        <p className="text-sm text-gray-500">
                            Defina o endereço de partida dos seus pedidos e o valor cobrado por quilômetro. As coordenadas podem ser encontradas no Google Maps.
                        </p>
                        <Input 
                            label="Endereço da Loja (para referência)" 
                            placeholder="Ex: Av. Comercial, 433, Goiânia"
                            value={freteConfig.enderecoLoja || ''} 
                            onChange={e => setFreteConfig({ ...freteConfig, enderecoLoja: e.target.value })} 
                            required 
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input 
                                label="Latitude da Loja" 
                                placeholder="-16.6725019"
                                value={freteConfig.lat || ''} 
                                onChange={e => setFreteConfig({ ...freteConfig, lat: e.target.value })} 
                                required 
                            />
                            <Input 
                                label="Longitude da Loja" 
                                placeholder="-49.3274707"
                                value={freteConfig.lng || ''} 
                                onChange={e => setFreteConfig({ ...freteConfig, lng: e.target.value })} 
                                required 
                            />
                        </div>
                        <Input 
                            label="Valor por KM (R$)" 
                            type="number" 
                            step="0.01" 
                            placeholder="Ex: 1.50"
                            value={freteConfig.valorPorKm || ''} 
                            onChange={e => setFreteConfig({ ...freteConfig, valorPorKm: e.target.value })} 
                            required 
                        />
                        <div className="pt-4">
                            <Button type="submit" disabled={isSavingFrete}>
                                <Save className="w-4 h-4" /> {isSavingFrete ? 'Salvando...' : 'Salvar Configurações'}
                            </Button>
                        </div>
                    </form>
                </div>
            )}
            
            <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title={editingUser ? "Editar Usuário" : "Novo Usuário"}>
                 <form onSubmit={handleUserSubmit} className="space-y-4">
                    <Input label="Nome" value={userFormData.nome || ''} onChange={e => setUserFormData({...userFormData, nome: e.target.value})} required />
                    <Input 
                        label="Email" 
                        type="email" 
                        value={userFormData.email || ''}
                        onChange={(e) => setUserFormData({...userFormData, email: e.target.value})} 
                        required 
                    />
                    {!editingUser && (
                        <Input 
                            label="Senha" 
                            type="password" 
                            value={userFormData.senha || ''} 
                            onChange={(e) => setUserFormData({...userFormData, senha: e.target.value})} 
                            required 
                            minLength="6"
                            placeholder="Mínimo 6 caracteres"
                        />
                    )}
                    <Select 
                        label="Permissão" 
                        value={userFormData.role || 'user'} 
                        onChange={(e) => setUserFormData({...userFormData, role: e.target.value})} 
                        required
                    >
                        <option value="user">Usuário</option>
                        <option value="Atendente">Atendente</option>
                        <option value="admin">Administrador</option>
                    </Select>
                    
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" type="button" onClick={() => setShowUserModal(false)}>Cancelar</Button>
                        <Button type="submit">
                            <Save className="w-4 h-4" /> 
                            Salvar
                        </Button>
                    </div>
                </form>
            </Modal>
            
            <Modal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} title="Alterar Senha" size="sm">
                <form onSubmit={handlePasswordChange} className="space-y-4">
                    <Input label="Nova Senha" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="Mínimo 6 caracteres" />
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" type="button" onClick={() => setShowPasswordModal(false)}>Cancelar</Button>
                        <Button type="submit"><Save className="w-4 h-4"/> Alterar</Button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={showCupomModal} onClose={() => setShowCupomModal(false)} title={editingCupom ? "Editar Cupom" : "Novo Cupom"} size="lg">
                <form onSubmit={handleCupomSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input 
                            label="Nome/Código do Cupom" 
                            value={cupomFormData.codigo || ''} 
                            onChange={e => setCupomFormData({ ...cupomFormData, codigo: e.target.value.toUpperCase() })} 
                            required 
                            disabled={!!editingCupom}
                        />
                        <Select label="Tipo de Desconto" value={cupomFormData.tipoDesconto || 'percentual'} onChange={e => setCupomFormData({ ...cupomFormData, tipoDesconto: e.target.value })}>
                            <option value="percentual">Percentual (%)</option>
                            <option value="fixo">Valor Fixo (R$)</option>
                        </Select>
                        <Input label="Valor do Desconto" type="number" step="0.01" value={cupomFormData.valor || ''} onChange={e => setCupomFormData({ ...cupomFormData, valor: e.target.value })} required />
                        <Input label="Quantidade Máxima de Uso" type="number" value={cupomFormData.limiteUso || ''} onChange={e => setCupomFormData({ ...cupomFormData, limiteUso: e.target.value })} required />
                        <Input label="Valor Mínimo do Pedido (R$)" type="number" step="0.01" value={cupomFormData.valorMinimo || ''} onChange={e => setCupomFormData({ ...cupomFormData, valorMinimo: e.target.value })} required />
                        <Select label="Status" value={cupomFormData.status || 'Ativo'} onChange={e => setCupomFormData({ ...cupomFormData, status: e.target.value })}>
                            <option value="Ativo">Ativo</option>
                            <option value="Inativo">Inativo</option>
                        </Select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" type="button" onClick={() => setShowCupomModal(false)}>Cancelar</Button>
                        <Button type="submit"><Save className="w-4 h-4" /> Salvar</Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
  };
  
  const Pedidos = () => {
    // Helper para obter a data de hoje no formato YYYY-MM-DD
    const getTodayString = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [searchTerm, setSearchTerm] = usePersistentState("pedidos_searchTerm", "");
    // **MELHORIA:** O padrão inicial continua sendo o dia de hoje.
    const [startDateFilter, setStartDateFilter] = usePersistentState("pedidos_startDateFilter", getTodayString());
    const [endDateFilter, setEndDateFilter] = usePersistentState("pedidos_endDateFilter", getTodayString());

    const [statusFilter, setStatusFilter] = usePersistentState("pedidos_statusFilter", 'Todos');
    const [showModal, setShowModal] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [formData, setFormData] = useState({ clienteId: '', clienteNome: '', itens: [], subtotal: 0, desconto: 0, total: 0, status: 'Pendente', origem: 'Manual', categoria: 'Delivery', dataEntrega: '', observacao: '', formaPagamento: 'Pix', cupom: null });
    const [viewingOrder, setViewingOrder] = useState(null);
    const [descontoValor, setDescontoValor] = useState('');
    const [descontoPercentual, setDescontoPercentual] = useState('');

    const pedidosComNomes = (data.pedidos || []).map(pedido => {
        const cliente = data.clientes.find(c => c.id === pedido.clienteId);
        return { ...pedido, clienteNome: cliente ? cliente.nome : (pedido.clienteNome || 'Cliente não encontrado') };
    });

    const filteredOrders = useMemo(() => pedidosComNomes.filter(p => {
        // **MELHORIA:** Lógica de busca por nome do cliente OU ID do pedido
        const term = searchTerm.toLowerCase();
        const searchMatch = !term ||
            (p.clienteNome && p.clienteNome.toLowerCase().includes(term)) ||
            (p.id && p.id.toLowerCase().includes(term));
        
        const dateMatch = (() => {
            if (!startDateFilter && !endDateFilter) return true;
            
            const orderDate = getJSDate(p.createdAt);
            if (!orderDate) return false;
            
            const startDate = startDateFilter ? new Date(startDateFilter) : null;
            if(startDate) startDate.setHours(0, 0, 0, 0);

            const endDate = endDateFilter ? new Date(endDateFilter) : null;
            if(endDate) endDate.setHours(23, 59, 59, 999);

            if (startDate && orderDate < startDate) return false;
            if (endDate && orderDate > endDate) return false;
            
            return true;
        })();

        const statusMatch = statusFilter === 'Todos' || p.status === statusFilter;

        return searchMatch && dateMatch && statusMatch;
    }).sort((a, b) => {
        const dateA = getJSDate(a.createdAt) || 0;
        const dateB = getJSDate(b.createdAt) || 0;
        return dateB - dateA; // Mais recentes primeiro
    }), [pedidosComNomes, searchTerm, startDateFilter, endDateFilter, statusFilter]);

    const resetForm = () => {
        setEditingOrder(null);
        setFormData({ clienteId: '', clienteNome: '', itens: [], subtotal: 0, desconto: 0, total: 0, status: 'Pendente', origem: 'Manual', categoria: 'Delivery', dataEntrega: '', observacao: '', formaPagamento: 'Pix', cupom: null });
        setDescontoValor('');
        setDescontoPercentual('');
    };
    
    // **MELHORIA:** Função para limpar todos os filtros, incluindo as datas
    const handleClearFilters = () => {
        setSearchTerm('');
        setStatusFilter('Todos');
        setStartDateFilter('');
        setEndDateFilter('');
    };


    const handleNewOrder = () => {
        resetForm();
        setShowModal(true);
    };

    const handleAddItemToOrder = (produto) => {
      setFormData(prev => {
          const existingItem = prev.itens.find(item => item.id === produto.id);
          let newItens;
          if (existingItem) {
              newItens = prev.itens.map(item =>
                  item.id === produto.id ? { ...item, quantity: item.quantity + 1 } : item
              );
          } else {
              newItens = [...prev.itens, { ...produto, quantity: 1 }];
          }
          const newSubtotal = newItens.reduce((sum, item) => sum + ((item.preco || 0) * (item.quantity || 1)), 0);
          const currentDiscount = prev.cupom?.valorDesconto || prev.desconto || 0;
          const newTotal = newSubtotal - currentDiscount;
          return { ...prev, itens: newItens, subtotal: newSubtotal, total: newTotal };
      });
    };

    const handleRemoveItemFromOrder = (produtoId) => {
        setFormData(prev => {
            const newItens = prev.itens.filter(item => item.id !== produtoId);
            const newSubtotal = newItens.reduce((sum, item) => sum + ((item.preco || 0) * (item.quantity || 1)), 0);
             const currentDiscount = prev.cupom?.valorDesconto || prev.desconto || 0;
            const newTotal = newSubtotal - currentDiscount;
            return { ...prev, itens: newItens, subtotal: newSubtotal, total: newTotal };
        });
    };
    
    const handleApplyDiscount = () => {
        const valor = parseFloat(descontoValor) || 0;
        const percent = parseFloat(descontoPercentual) || 0;
        const subtotal = formData.subtotal || 0;

        if (valor > 0 && percent > 0) {
            alert("Por favor, aplique o desconto em valor OU em percentual, não ambos.");
            return;
        }

        let newDiscount = 0;
        if (valor > 0) {
            newDiscount = valor;
        } else if (percent > 0) {
            newDiscount = (subtotal * percent) / 100;
        }

        if (newDiscount > subtotal) {
            alert("O desconto não pode ser maior que o subtotal.");
             setDescontoValor('');
             setDescontoPercentual('');
            return;
        }
        
        if (newDiscount < 0) {
            alert("O desconto não pode ser negativo.");
             setDescontoValor('');
             setDescontoPercentual('');
            return;
        }

        setFormData(prev => ({
            ...prev,
            desconto: newDiscount,
            total: subtotal - newDiscount,
            cupom: null // Remove cupom se aplicar desconto manual
        }));
    };

const handleSubmit = async (e) => {
    e.preventDefault();
    // Garante que clienteNome seja definido mesmo se não for encontrado
    const clienteSelecionado = data.clientes.find(c => c.id === formData.clienteId);
    const orderData = { 
        ...formData, 
        clienteNome: clienteSelecionado ? clienteSelecionado.nome : 'Cliente não selecionado' 
    };
    
    if (editingOrder) {
        const { id, ...updateData } = orderData;
        await updateItem('pedidos', editingOrder.id, updateData);
        
        // Atualiza estoque se status mudou para/de Finalizado
        if (orderData.status === 'Finalizado' && editingOrder.status !== 'Finalizado') {
            await updateStockForOrder(orderData.itens, 'decrease');
        }
        else if (orderData.status !== 'Finalizado' && editingOrder.status === 'Finalizado') {
            await updateStockForOrder(editingOrder.itens, 'increase');
        }
    } else {
        await addItem('pedidos', orderData);
        
        // Atualiza estoque se novo pedido já é Finalizado
        if (orderData.status === 'Finalizado') {
            await updateStockForOrder(orderData.itens, 'decrease');
        }
    }
    
    setShowModal(false);
    resetForm();
};

	// Função para atualizar estoque (com verificação de item.id)
	const updateStockForOrder = async (itens, operation) => {
		if (!itens || itens.length === 0) return;
		
		try {
			for (const item of itens) {
                // --- CORREÇÃO: Adiciona verificação para item.id ---
                if (!item.id) {
                    console.warn("Item de pedido sem ID, pulando atualização de estoque:", item);
                    continue; // Pula este item e vai para o próximo
                }
				const productRef = doc(db, 'produtos', item.id);
				const productSnap = await getDoc(productRef);
				
				if (productSnap.exists()) {
					const productData = productSnap.data();
					// Garante que estoque seja um número, tratando NaN ou undefined
                    let currentStock = Number(productData.estoque);
                    if (isNaN(currentStock)) {
                        console.warn(`Estoque inválido para ${item.nome} (ID: ${item.id}). Definindo como 0.`);
                        currentStock = 0;
                    }

                    // ✅✅✅ CORREÇÃO APLICADA AQUI ✅✅✅
                    // 'const' foi mudado para 'let' para permitir reatribuição no 'if' abaixo
                    let quantityChange = Number(item.quantity || 1);
                     if (isNaN(quantityChange)) {
                        console.warn(`Quantidade inválida para ${item.nome} no pedido. Usando 1.`);
                        quantityChange = 1;
                    }
					
					let newStock = currentStock;
					
					if (operation === 'decrease') {
						newStock = Math.max(0, currentStock - quantityChange);
					} else if (operation === 'increase') {
						newStock = currentStock + quantityChange;
					}
					
                    // Só atualiza se o estoque mudou
                    if (newStock !== currentStock) {
                        await updateDoc(productRef, { estoque: newStock });
                        console.log(`Estoque atualizado: ${item.nome} - ${operation === 'decrease' ? 'Baixa' : 'Restauração'} de ${quantityChange}. Estoque anterior: ${currentStock}, Novo estoque: ${newStock}`);
                    } else {
                         console.log(`Estoque de ${item.nome} permaneceu ${currentStock}. Operação: ${operation}, Quantidade: ${quantityChange}`);
                    }
				} else {
                    console.warn(`Produto com ID ${item.id} (${item.nome || 'Nome desconhecido'}) não encontrado no estoque.`);
                }
			}
		} catch (error) {
			console.error('Erro geral ao atualizar estoque:', error);
			alert('Erro ao atualizar estoque dos produtos. Verifique o console para mais detalhes.');
		}
	};
    
    const handleEdit = (order) => {
        setEditingOrder(order);
        const subtotal = (order.itens || []).reduce((sum, item) => sum + ((item.preco || 0) * (item.quantity || 1)), 0);
        const desconto = order.cupom?.valorDesconto || order.desconto || 0;
        const total = subtotal - desconto;
        
        // Garante que todos os campos necessários estejam presentes, mesmo que vazios
        const defaultOrderData = {
            clienteId: '',
            clienteNome: '',
            itens: [],
            subtotal: 0,
            desconto: 0,
            total: 0,
            status: 'Pendente',
            origem: 'Manual',
            categoria: 'Delivery',
            dataEntrega: '',
            observacao: '',
            formaPagamento: 'Pix',
            cupom: null
        };

        setFormData({
            ...defaultOrderData,
            ...order,
            subtotal,
            desconto,
            total,
            dataEntrega: order.dataEntrega ? (getJSDate(order.dataEntrega)?.toISOString().split('T')[0] || '') : ''
        });
        
        setDescontoValor(order.desconto && !order.cupom ? String(order.desconto) : ''); // Preenche desconto manual se houver
        setDescontoPercentual(''); // Limpa percentual ao editar
        setShowModal(true);
    };

    const getStatusClass = (status) => { switch (status) { case 'Pendente': return 'bg-yellow-100 text-yellow-800'; case 'Em Produção': return 'bg-blue-100 text-blue-800'; case 'Finalizado': return 'bg-green-100 text-green-800'; case 'Cancelado': return 'bg-red-100 text-red-800'; default: return 'bg-gray-100 text-gray-800'; } };
    const columns = [ { header: "ID do Pedido", render: (row) => <span className="font-mono text-xs text-gray-500">{row.id?.substring(0, 8) || 'N/A'}</span> }, { header: "Cliente", key: "clienteNome" }, { header: "Total", render: (row) => <span className="font-semibold text-green-600">R$ {(row.total || 0).toFixed(2)}</span> }, { header: "Data", render: (row) => { const date = getJSDate(row.createdAt); return date ? date.toLocaleDateString('pt-BR') : '-'; } }, { header: "Origem", key: "origem"}, { header: "Status", render: (row) => <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusClass(row.status)}`}>{row.status}</span> } ];
    const actions = [ { icon: Eye, label: "Ver", onClick: (row) => setViewingOrder(row) }, { icon: Edit, label: "Editar", onClick: handleEdit }, { icon: Trash2, label: "Excluir", onClick: (row) => setConfirmDelete({ isOpen: true, onConfirm: () => deleteItem('pedidos', row.id) }) } ];
    
    return (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div><h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Gestão de Pedidos</h1><p className="text-gray-600 mt-1">Acompanhe e gerencie todos os pedidos</p></div>
                <Button onClick={handleNewOrder} className="w-full md:w-auto"><Plus className="w-4 h-4" /> Novo Pedido</Button>
            </div>
            
            <div className="flex flex-col md:flex-row md:items-center gap-4 p-4 bg-white rounded-2xl shadow-lg border border-gray-100 flex-wrap">
                <div className="relative flex-grow w-full md:w-auto">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    {/* **MELHORIA:** Placeholder do campo de busca atualizado */}
                    <input type="text" placeholder="Buscar por cliente ou ID do pedido..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-pink-500" />
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto md:flex-grow">
                    <Input label="Data Inicial" type="date" value={startDateFilter} onChange={(e) => setStartDateFilter(e.target.value)} className="py-2.5"/>
                    <Input label="Data Final" type="date" value={endDateFilter} onChange={(e) => setEndDateFilter(e.target.value)} className="py-2.5"/>
                </div>
                <div className="flex-grow w-full md:w-auto">
                    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full">
                        <option value="Todos">Todos os Status</option>
                        <option value="Pendente">Pendente</option>
                        <option value="Em Produção">Em Produção</option>
                        <option value="Pronto para Entrega">Pronto para Entrega</option>
                        <option value="Finalizado">Finalizado</option>
                        <option value="Cancelado">Cancelado</option>
                    </Select>
                </div>
                <Button variant="secondary" onClick={handleClearFilters} className="w-full md:w-auto">
                    Limpar Filtros
                </Button>
            </div>

            <Table columns={columns} data={filteredOrders} actions={actions} />
            
            <Modal isOpen={showModal} onClose={() => { setShowModal(false); resetForm(); }} title={editingOrder ? "Editar Pedido" : "Novo Pedido"} size="xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Select label="Cliente" value={formData.clienteId} onChange={(e) => setFormData({...formData, clienteId: e.target.value})} required><option value="">Selecione um cliente</option>{data.clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}</Select>
                        <Select label="Status" value={formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})} required><option>Pendente</option><option>Em Produção</option><option>Pronto para Entrega</option><option>Finalizado</option><option>Cancelado</option></Select>
                        <Select label="Categoria do Pedido" value={formData.categoria} onChange={(e) => setFormData({...formData, categoria: e.target.value, itens: [], total: 0})} required>
                            <option value="Delivery">Delivery</option>
                            <option value="Festa">Festa</option>
                        </Select>
                        <Select label="Forma de Pagamento" value={formData.formaPagamento} onChange={(e) => setFormData({...formData, formaPagamento: e.target.value})} required>
                            <option>Pix</option>
                            <option>Cartão de Crédito</option>
                            <option>Cartão de Débito</option>
                            <option>Dinheiro</option>
                            <option>Link de Pagamento</option>
                        </Select>
                        {formData.categoria === 'Festa' && (
                            <Input 
                                label="Data de Entrega" 
                                type="date" 
                                value={formData.dataEntrega} 
                                onChange={(e) => setFormData({...formData, dataEntrega: e.target.value})}
                                min={getTodayString()}
                                required 
                            />
                        )}
                    </div>
                     <Textarea 
                        label="Observação" 
                        rows="3" 
                        value={formData.observacao || ''} 
                        onChange={(e) => setFormData({...formData, observacao: e.target.value})} 
                        placeholder="Ex: Bolo sem cobertura, entregar para a secretária, etc."
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <h3 className="font-semibold">Adicionar Produtos</h3>
                            <div className="max-h-60 overflow-y-auto border rounded-lg p-2 space-y-1">
                                {data.produtos.filter(p => p.categoria === formData.categoria && p.status === 'Ativo').map(p => (<div key={p.id} className="flex justify-between items-center p-2 rounded hover:bg-gray-50"><span>{p.nome} - R$ {(p.preco || 0).toFixed(2)}</span><Button size="sm" variant="secondary" onClick={() => handleAddItemToOrder(p)}>+</Button></div>))}
                            </div>
                        </div>
                        <div className="space-y-2">
                          <h3 className="font-semibold">Itens no Pedido</h3>
                          <div className="max-h-60 overflow-y-auto border rounded-lg p-2 space-y-1">{formData.itens.length === 0 ? <p className="text-sm text-gray-500 text-center p-4">Nenhum item</p> : formData.itens.map(item => (<div key={item.id} className="flex justify-between items-center p-2 rounded bg-pink-50"><span>{item.quantity}x {item.nome}</span><div className="flex items-center gap-2"><span className="text-sm">R$ {((item.preco || 0) * (item.quantity || 1)).toFixed(2)}</span><button type="button" onClick={() => handleRemoveItemFromOrder(item.id)} className="text-red-500"><Trash2 size={14}/></button></div></div>))}</div>
                           <div className="text-right mt-2 space-y-1">
                                <p className="text-sm text-gray-600">Subtotal: R$ {(formData.subtotal || 0).toFixed(2)}</p>
                                { (formData.cupom || formData.desconto > 0) && <p className="text-sm text-red-600">Desconto: - R$ {(formData.cupom?.valorDesconto || formData.desconto || 0).toFixed(2)}</p>}
                                {formData.cupom && <p className="text-xs text-green-600">Cupom: {formData.cupom.codigo}</p>}
                                <p className="font-bold text-lg text-gray-800">Total: R$ {(formData.total || 0).toFixed(2)}</p>
                           </div>
                        </div>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-lg mt-4">
                        <h4 className="font-semibold mb-2 text-gray-700">Aplicar Desconto (Manual)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                            <Input label="Valor do desconto (R$)" type="number" step="0.01" value={descontoValor} onChange={e => { setDescontoValor(e.target.value); setDescontoPercentual(''); setFormData(prev => ({...prev, cupom: null})); }} placeholder="Ex: 10.00" />
                            <Input label="Percentual do desconto (%)" type="number" value={descontoPercentual} onChange={e => { setDescontoPercentual(e.target.value); setDescontoValor(''); setFormData(prev => ({...prev, cupom: null})); }} placeholder="Ex: 15" />
                            <Button variant="secondary" onClick={handleApplyDiscount} className="w-full">Aplicar desconto</Button>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4"><Button variant="secondary" type="button" onClick={() => { setShowModal(false); resetForm(); }}>Cancelar</Button><Button type="submit"><Save className="w-4 h-4" />{editingOrder ? "Salvar Alterações" : "Criar Pedido"}</Button></div>
                </form>
            </Modal>
            <Modal isOpen={!!viewingOrder} onClose={() => setViewingOrder(null)} title="Detalhes do Pedido" size="lg">
                {viewingOrder && (() => {
                    const cliente = data.clientes.find(c => c.id === viewingOrder.clienteId);
                    const endereco = viewingOrder.clienteEndereco || cliente?.enderecos?.[0] || 'Não informado';
                    const telefone = viewingOrder.telefone || cliente?.telefone || '';
                    const subtotal = (viewingOrder.itens || []).reduce((sum, item) => sum + ((item.preco || 0) * (item.quantity || 1)), 0);
					const normalizeCoordinate = (value) => {
                        if (value === null || value === undefined) return null;
                        const numeric = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
                        return Number.isFinite(numeric) ? numeric : null;
                    };

                    const pickCoordinate = (...values) => {
                        for (const value of values) {
                            const coord = normalizeCoordinate(value);
                            if (coord !== null) return coord;
                        }
                        return null;
                    };

                    const addressMatch = cliente?.enderecos?.find((addr) => {
                        const storedAddress = (addr?.enderecoCompleto || addr?.endereco || '').trim().toLowerCase();
                        const orderAddress = (viewingOrder.clienteEndereco || '').trim().toLowerCase();
                        return storedAddress && orderAddress && storedAddress === orderAddress;
                    });

                    const latitude = pickCoordinate(
                        viewingOrder.clienteLat,
                        viewingOrder.lat,
                        viewingOrder.latitude,
                        viewingOrder.enderecoLat,
                        addressMatch?.lat,
                        addressMatch?.latitude,
                        addressMatch?.latLng?.lat,
                        addressMatch?.latlng?.lat
                    );
                    const longitude = pickCoordinate(
                        viewingOrder.clienteLng,
                        viewingOrder.lng,
                        viewingOrder.longitude,
                        viewingOrder.enderecoLng,
                        addressMatch?.lng,
                        addressMatch?.longitude,
                        addressMatch?.latLng?.lng,
                        addressMatch?.latlng?.lng
                    );

                    const mapLink = viewingOrder.localizacaoLink
                        || viewingOrder.locationLink
                        || viewingOrder.mapLink
                        || viewingOrder.linkLocalizacao
                        || viewingOrder.mapaUrl
                        || addressMatch?.mapLink
                        || addressMatch?.locationLink
                        || addressMatch?.googleMapsUrl
                        || (latitude !== null && longitude !== null ? `https://www.google.com/maps?q=${latitude},${longitude}` : null);

                    const entregadores = (data.fornecedores || []).filter((fornecedor) => (fornecedor.categoria || '').toLowerCase() === 'entregador');
                    const canSendToDeliverer = !!mapLink && entregadores.length > 0 && endereco !== 'Não informado' && endereco !== 'Retirar na Loja';

                    const formatPhoneForWhatsApp = (phone) => {
                        if (!phone) return '';
                        const digits = phone.replace(/\D/g, '');
                        if (!digits) return '';
                        if (digits.length === 13 && digits.startsWith('55')) return digits;
                        if (digits.length === 11) return `55${digits}`;
                        if (digits.length === 12 && digits.startsWith('55')) return digits;
                        return digits.length > 0 ? `55${digits}` : '';
                    };
					const freteNumber = Number(viewingOrder.valorFrete ?? viewingOrder.frete ?? 0);
                    const frete = Number.isFinite(freteNumber) ? freteNumber : 0;
                    
                    const handleSendToWhatsApp = () => {
                        if (!telefone) {
                           alert("Telefone do cliente não encontrado para enviar mensagem.");
                           return;
                        }
                        const whatsappNumber = formatPhoneForWhatsApp(telefone);
                        if (!whatsappNumber) {
                            alert('Telefone do cliente inválido para WhatsApp.');
                            return;
                        }

                        let message = `Olá, *${viewingOrder.clienteNome || 'Cliente'}!*\n\n`;
                        message += `Aqui está um resumo do seu pedido na Ana Guimarães Doceria:\n\n`;
                        if (endereco !== 'Não informado') {
                            message += `*Endereço de Entrega:*\n${endereco}\n\n`;
                        }
                        message += `*Itens do Pedido:*\n`;
                        (viewingOrder.itens || []).forEach(item => {
                            message += `  • ${item.quantity || 1}x ${item.nome}\n`;
                        });
                        message += `\n`;

                        if (viewingOrder.cupom?.valorDesconto > 0) {
                            message += `*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
                            message += `*Desconto (${viewingOrder.cupom.codigo}):* - R$ ${viewingOrder.cupom.valorDesconto.toFixed(2)}\n`;
                        } else if (viewingOrder.desconto > 0) {
                             message += `*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
                             message += `*Desconto Manual:* - R$ ${viewingOrder.desconto.toFixed(2)}\n`;
                        }

						message += `*Frete:* R$ ${frete.toFixed(2)}\n`;
                        message += `*Total:* R$ ${(viewingOrder.total || 0).toFixed(2)}\n`;
                        if(viewingOrder.formaPagamento) message += `*Pagamento:* ${viewingOrder.formaPagamento}\n`;
                        message += `*Status:* ${viewingOrder.status}\n\n`;
                        if(viewingOrder.observacao) message += `*Observações:* ${viewingOrder.observacao}\n\n`;

                        message += `Agradecemos a sua preferência!`;

                        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
                        window.open(whatsappUrl, '_blank');
                    };


                    const handleSendAddressToDeliverer = () => {
                        if (!canSendToDeliverer) {
                            alert('Não há informações suficientes para enviar o endereço ao entregador.');
                            return;
                        }

                        let selectedDeliverer = entregadores[0];
                        if (entregadores.length > 1) {
                            const options = entregadores.map((entregador, index) => {
                                const contact = entregador.contato_whatsapp || entregador.contato_telefone || 'Sem contato';
                                return `${index + 1} - ${entregador.nome || 'Entregador'} (${contact})`;
                            }).join('\n');
                            const choice = window.prompt(`Selecione o entregador:\n${options}`, '1');
                            if (!choice) return;
                            const selectedIndex = parseInt(choice, 10) - 1;
                            if (Number.isNaN(selectedIndex) || !entregadores[selectedIndex]) {
                                alert('Entregador selecionado inválido.');
                                return;
                            }
                            selectedDeliverer = entregadores[selectedIndex];
                        }

                        const whatsappNumber = formatPhoneForWhatsApp(selectedDeliverer.contato_whatsapp || selectedDeliverer.contato_telefone || '');
                        if (!whatsappNumber) {
                            alert('O entregador selecionado não possui um número de WhatsApp válido.');
                            return;
                        }

                        const linhasMensagem = [
                            `Olá${selectedDeliverer.nome ? ` ${selectedDeliverer.nome}` : ''}!`,
                            `Endereço para entrega do pedido de ${viewingOrder.clienteNome || 'cliente'}:`,
                        ];

                        if (telefone) {
                            linhasMensagem.push(`Telefone do cliente: ${telefone}`);
                        }

                        linhasMensagem.push(endereco);
                        linhasMensagem.push('');
                        linhasMensagem.push(`Localização: ${mapLink}`);

                        const mensagem = linhasMensagem.join('\n');
                        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(mensagem)}`;
                        window.open(whatsappUrl, '_blank');
                    };

                    const handlePrint = () => {
                        const printWindow = window.open('', '_blank');
                        if (!printWindow) {
                            alert("Por favor, habilite pop-ups para imprimir.");
                            return;
                        }
                        printWindow.document.write('<html><head><title>Cupom do Pedido</title>');
                        printWindow.document.write('<style> body { font-family: monospace; margin: 0; padding: 10px; width: 300px; font-size: 10pt; } h2, h3 { text-align: center; margin: 5px 0; } hr { border: none; border-top: 1px dashed black; margin: 5px 0; } table { width: 100%; border-collapse: collapse; margin-bottom: 5px;} td { padding: 1px 0; vertical-align: top;} .right { text-align: right; } p { margin: 2px 0; } .total { font-weight: bold; font-size: 11pt;} </style>');
                        printWindow.document.write('</head><body>');
                        printWindow.document.write('<h2>Ana Guimarães Doceria</h2>');
                        printWindow.document.write(`<p>Cliente: ${viewingOrder.clienteNome || 'N/A'}</p>`);
                        if (endereco !== 'Não informado') printWindow.document.write(`<p>Endereço: ${endereco}</p>`);
                        if (telefone) printWindow.document.write(`<p>Telefone: ${telefone}</p>`);
                        printWindow.document.write(`<p>Data: ${getJSDate(viewingOrder.createdAt)?.toLocaleString('pt-BR') || '-'}</p>`);
                        if (viewingOrder.dataEntrega) printWindow.document.write(`<p>Entrega: ${new Date(viewingOrder.dataEntrega + 'T03:00:00Z').toLocaleDateString('pt-BR')}</p>`);
                        printWindow.document.write('<hr>');
                        printWindow.document.write('<h3>Itens</h3>');
                        printWindow.document.write('<table>');
                        (viewingOrder.itens || []).forEach(item => {
                            printWindow.document.write(`<tr><td>${item.quantity || 1}x ${item.nome}</td><td class="right">R$ ${((item.preco || 0) * (item.quantity || 1)).toFixed(2)}</td></tr>`);
                        });
                        printWindow.document.write('</table>');
                        printWindow.document.write('<hr>');

                        if (viewingOrder.cupom?.valorDesconto > 0 || viewingOrder.desconto > 0) {
                            printWindow.document.write(`<p>Subtotal:<span style="float: right;">R$ ${subtotal.toFixed(2)}</span></p>`);
                             if (viewingOrder.cupom) {
                                printWindow.document.write(`<p>Desconto (${viewingOrder.cupom.codigo}):<span style="float: right;">- R$ ${viewingOrder.cupom.valorDesconto.toFixed(2)}</span></p>`);
                            } else {
                                printWindow.document.write(`<p>Desconto:<span style="float: right;">- R$ ${viewingOrder.desconto.toFixed(2)}</span></p>`);
                            }
                        }

                        printWindow.document.write(`<p>Frete:<span style="float: right;">R$ ${frete.toFixed(2)}</span></p>`);						
                        printWindow.document.write(`<p class="total">Total:<span style="float: right;">R$ ${(viewingOrder.total || 0).toFixed(2)}</span></p>`);
                        if(viewingOrder.formaPagamento) printWindow.document.write(`<p>Pagamento: ${viewingOrder.formaPagamento}</p>`);

                        if(viewingOrder.observacao) {
                            printWindow.document.write(`<hr><h3>Observações:</h3><p>${viewingOrder.observacao}</p>`);
                        }
                        printWindow.document.write('<hr><p style="text-align: center;">Obrigado!</p>');
                        printWindow.document.write('</body></html>');
                        printWindow.document.close();
                         // Adiciona um pequeno delay para garantir que o conteúdo foi escrito antes de imprimir
                        setTimeout(() => {
                           printWindow.focus(); // Necessário para alguns navegadores
                           printWindow.print();
                           // printWindow.close(); // Comentar se quiser manter a janela aberta para debug
                        }, 250);
                    };

                    return (
                        <div className="space-y-4 text-sm text-gray-700">
                            <div className="p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-bold text-lg text-gray-800 mb-2">Informações do Cliente</h3>
                                <p><strong>Nome:</strong> {viewingOrder.clienteNome || 'N/A'}</p>
                                <p><strong>Endereço:</strong> {endereco}</p>
                                <p><strong>Telefone:</strong> {telefone || 'Não informado'}</p>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-bold text-lg text-gray-800 mb-2">Informações do Pedido</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <p><strong>Status:</strong> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusClass(viewingOrder.status)}`}>{viewingOrder.status}</span></p>
                                    <p><strong>Data do Pedido:</strong> {viewingOrder.createdAt ? getJSDate(viewingOrder.createdAt)?.toLocaleString('pt-BR') : '-'}</p>
                                    <p><strong>Origem:</strong> {viewingOrder.origem}</p>
                                    <p><strong>Pagamento:</strong> {viewingOrder.formaPagamento || 'Não informado'}</p>
                                    {viewingOrder.categoria && (<p><strong>Categoria:</strong> {viewingOrder.categoria}</p>)}
                                    {viewingOrder.dataEntrega && (<p><strong>Data de Entrega:</strong> {new Date(viewingOrder.dataEntrega + 'T03:00:00Z').toLocaleDateString('pt-BR')}</p>)}
                                </div>
                            </div>
                            
                             {viewingOrder.observacao && (
                                <div className="p-4 bg-yellow-50 rounded-lg">
                                    <h3 className="font-bold text-lg text-yellow-800 mb-2">Observações</h3>
                                    <p>{viewingOrder.observacao}</p>
                                </div>
                            )}

                            <div>
                                <h4 className="font-bold text-lg text-gray-800 mt-4 mb-2">Itens do Pedido:</h4>
                                <ul className="space-y-2">
                                    {(viewingOrder.itens || []).map((item, index) => (
                                        <li key={item.id || index} className="flex justify-between items-center p-2 bg-pink-50/50 rounded-md">
                                            <span>{item.quantity || 1}x {item.nome}</span>
                                            <span>R$ {((item.preco || 0) * (item.quantity || 1)).toFixed(2)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="text-right pt-4 border-t mt-4 space-y-1">
                                { (viewingOrder.cupom?.valorDesconto > 0 || viewingOrder.desconto > 0) && (
                                    <>
                                        <p className="text-sm text-gray-600">Subtotal: R$ {subtotal.toFixed(2)}</p>
                                        <p className="text-sm text-red-600">
                                            Desconto {viewingOrder.cupom ? `(${viewingOrder.cupom.codigo})` : ''}:
                                            - R$ {(viewingOrder.cupom?.valorDesconto || viewingOrder.desconto || 0).toFixed(2)}
                                        </p>
                                    </>
                                )}
								<p className="text-sm text-gray-600">Frete: R$ {frete.toFixed(2)}</p>
                                <p className="font-bold text-2xl text-pink-600">
                                    Total: R$ ${(viewingOrder.total || 0).toFixed(2)}
                                </p>
                           </div>

                            <div className="flex flex-wrap justify-end pt-4 mt-4 border-t gap-3">
                                <Button 
                                    onClick={handlePrint}
                                    variant="secondary"
                                    size="sm"
                                >
                                    <Printer className="w-4 h-4" />
                                    Imprimir Cupom
                                </Button>
                                <Button
                                    onClick={handleSendAddressToDeliverer}
                                    disabled={!canSendToDeliverer}
                                    className="bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
                                    size="sm"
                                >
                                    <MapPin className="w-4 h-4" />
                                    Enviar Endereço para Entregador
                                </Button>
                                <Button
                                    onClick={handleSendToWhatsApp}
                                    disabled={!telefone}
                                    className="bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-400 disabled:shadow-none disabled:transform-none"
                                    size="sm"
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    Enviar Resumo Cliente
                                </Button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>
        </div>
    );
  }
  
  const Agenda = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDay, setSelectedDay] = useState(null);
    const [viewingOrder, setViewingOrder] = useState(null);
    
    const getStatusClass = (status) => { 
        switch (status) { 
            case 'Pendente': return 'bg-yellow-400'; 
            case 'Em Produção': return 'bg-blue-400'; 
            case 'Finalizado': return 'bg-green-400'; 
            case 'Cancelado': return 'bg-red-400'; 
            default: return 'bg-gray-400'; 
        } 
    };
    
    const getStatusClassText = (status) => { 
        switch (status) { 
            case 'Pendente': return 'bg-yellow-100 text-yellow-800'; 
            case 'Em Produção': return 'bg-blue-100 text-blue-800'; 
            case 'Finalizado': return 'bg-green-100 text-green-800'; 
            case 'Cancelado': return 'bg-red-100 text-red-800'; 
            default: return 'bg-gray-100 text-gray-800'; 
        } 
    };

    const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

    const changeMonth = (offset) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const pedidosDoMes = (data.pedidos || []).filter(p => {
		const relevantDateStr = p.categoria === 'Festa' && p.dataEntrega ? p.dataEntrega : p.createdAt;
		let pedidoDate = getJSDate(relevantDateStr);
		if (p.categoria === 'Festa' && p.dataEntrega) {
			const [year, month, day] = p.dataEntrega.split('-');
			const y = parseInt(year, 10);
			const m = parseInt(month, 10) - 1;
			const d = parseInt(day, 10);
			pedidoDate = new Date(Date.UTC(y, m, d));
		  }
	  return pedidoDate && pedidoDate.getFullYear() === currentDate.getFullYear() &&
			 pedidoDate.getMonth() === currentDate.getMonth();
	});

    const clientes = data.clientes || [];
    const aniversariantesDoMes = useMemo(() => {
        return clientes.filter(cliente => {
            if (!cliente.aniversario || !/^\d{4}-\d{2}-\d{2}$/.test(cliente.aniversario)) return false;
            // Usa UTC para evitar problemas de fuso
            const [year, month, day] = cliente.aniversario.split('-');
            const birthMonth = parseInt(month, 10) - 1; // Mês é 0-indexado
            return birthMonth === currentDate.getMonth();
        });
    }, [data.clientes, currentDate]);

    return (
        <div className="p-4 md:p-6 space-y-6 bg-gradient-to-br from-pink-50/30 to-rose-50/30 min-h-screen">
             <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">Agenda</h1>
                <p className="text-gray-600 mt-1">Visualize entregas e aniversários</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 md:p-6">
                <div className="flex justify-between items-center mb-4">
                    <Button variant="secondary" size="sm" onClick={() => changeMonth(-1)}><ChevronLeft/></Button>
                    <h2 className="text-xl font-bold text-gray-800 text-center">{currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
                    <Button variant="secondary" size="sm" onClick={() => changeMonth(1)}><ChevronRight/></Button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold text-gray-600">
                    {daysOfWeek.map(day => <div key={day} className="py-2">{day}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-1 md:gap-2">
                    {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} className="border rounded-lg aspect-square"></div>)}
                    {Array.from({ length: daysInMonth }).map((_, day) => {
                        const dayNumber = day + 1;
                        
                        const today = new Date();
                        const isToday = today.getDate() === dayNumber && today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();
                        
                        const pedidosDoDia = pedidosDoMes.filter(p => {
                            const relevantDateStr = p.categoria === 'Festa' && p.dataEntrega ? p.dataEntrega : p.createdAt;
                            const pedidoDate = getJSDate(relevantDateStr);
                            if (!pedidoDate) return false;
                            // Se for Festa, compara com UTC
                             if (p.categoria === 'Festa' && p.dataEntrega) {
                                const [year, month, d] = p.dataEntrega.split('-');
                                return parseInt(d, 10) === dayNumber;
                             }
                             // Senão, compara data local
                            return pedidoDate.getDate() === dayNumber;
                        });

                        const aniversariantesDoDia = aniversariantesDoMes.filter(c => {
                             const [, , dayString] = c.aniversario.split('-');
                             return parseInt(dayString, 10) === dayNumber;
                        });

                        const hasEvents = pedidosDoDia.length > 0 || aniversariantesDoDia.length > 0;
                        
                        return (
                            <div key={dayNumber} onClick={() => hasEvents && setSelectedDay({ day: dayNumber, pedidos: pedidosDoDia, aniversariantes: aniversariantesDoDia })} className={`border rounded-lg p-1 md:p-2 aspect-square flex flex-col ${hasEvents ? 'cursor-pointer hover:bg-pink-50' : ''} transition-colors ${isToday ? 'bg-pink-100' : ''}`}>
                                <span className={`font-bold text-xs md:text-base ${isToday ? 'text-pink-600' : 'text-gray-800'}`}>{dayNumber}</span>
                                <div className="mt-1 space-y-1 overflow-y-auto text-[10px] md:text-xs">
                                    {pedidosDoDia.map(p => (
                                        <div key={p.id} className={`w-full text-white rounded px-1 truncate ${getStatusClass(p.status)}`} title={`${p.clienteNome} (${p.status})`}>
                                            {p.categoria === 'Festa' ? <Gift size={10} className="inline mr-1"/> : <ShoppingCart size={10} className="inline mr-1"/>}
                                            {p.clienteNome}
                                        </div>
                                    ))}
                                    {aniversariantesDoDia.map(c => (
                                        <div key={c.id} className="w-full bg-yellow-300 text-yellow-800 rounded px-1 truncate flex items-center gap-1" title={`${c.nome} (Aniversário)`}>
                                            <Cake size={10} />
                                            {c.nome}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            <Modal isOpen={!!selectedDay} onClose={() => setSelectedDay(null)} title={`Eventos do dia ${selectedDay?.day}`}>
                {selectedDay && (
                    <div className="space-y-4">
                        {selectedDay.pedidos.length > 0 && (
                            <div>
                                <h3 className="font-bold text-lg mb-2 text-gray-700">Pedidos ({selectedDay.pedidos.length})</h3>
                                <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                {selectedDay.pedidos.map(p => (
                                    <div key={p.id} onClick={() => { setSelectedDay(null); setViewingOrder(p); }} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer flex justify-between items-center">
                                        <div>
                                            <p className="font-bold flex items-center gap-1">
                                                {p.categoria === 'Festa' ? <Gift size={14} className="text-purple-500"/> : <ShoppingCart size={14} className="text-blue-500"/>}
                                                {p.clienteNome}
                                            </p>
                                            <p className="text-sm text-gray-600">Total: R$ {p.total.toFixed(2)}</p>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusClassText(p.status)}`}>{p.status}</span>
                                    </div>
                                ))}
                                </div>
                            </div>
                        )}
                        {selectedDay.aniversariantes.length > 0 && (
                             <div>
                                <h3 className="font-bold text-lg mb-2 text-gray-700">Aniversariantes ({selectedDay.aniversariantes.length})</h3>
                                 <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                {selectedDay.aniversariantes.map(c => (
                                    <div key={c.id} className="p-3 bg-yellow-50 rounded-lg flex items-center gap-3">
                                        <Cake className="w-5 h-5 text-yellow-600" />
                                        <p className="font-semibold text-yellow-800">{c.nome}</p>
                                    </div>
                                ))}
                                </div>
                            </div>
                        )}
                        {selectedDay.pedidos.length === 0 && selectedDay.aniversariantes.length === 0 && <p>Nenhum evento para este dia.</p>}
                    </div>
                )}
            </Modal>
             {/* Modal de Detalhes do Pedido (igual ao do componente Pedidos) */}
             <Modal isOpen={!!viewingOrder} onClose={() => setViewingOrder(null)} title="Detalhes do Pedido" size="lg">
                 {viewingOrder && (() => {
                    const cliente = data.clientes.find(c => c.id === viewingOrder.clienteId);
                    const endereco = viewingOrder.clienteEndereco || cliente?.enderecos?.[0] || 'Não informado';
                    const telefone = viewingOrder.telefone || cliente?.telefone || '';
                    const subtotal = (viewingOrder.itens || []).reduce((sum, item) => sum + ((item.preco || 0) * (item.quantity || 1)), 0);

                    const normalizeCoordinate = (value) => {
                        if (value === null || value === undefined) return null;
                        const numeric = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
                        return Number.isFinite(numeric) ? numeric : null;
                    };

                    const pickCoordinate = (...values) => {
                        for (const value of values) {
                            const coord = normalizeCoordinate(value);
                            if (coord !== null) return coord;
                        }
                        return null;
                    };

                    const addressMatch = cliente?.enderecos?.find((addr) => {
                        const storedAddress = (addr?.enderecoCompleto || addr?.endereco || '').trim().toLowerCase();
                        const orderAddress = (viewingOrder.clienteEndereco || '').trim().toLowerCase();
                        return storedAddress && orderAddress && storedAddress === orderAddress;
                    });

                    const latitude = pickCoordinate(
                        viewingOrder.clienteLat,
                        viewingOrder.lat,
                        viewingOrder.latitude,
                        viewingOrder.enderecoLat,
                        addressMatch?.lat,
                        addressMatch?.latitude,
                        addressMatch?.latLng?.lat,
                        addressMatch?.latlng?.lat
                    );
                    const longitude = pickCoordinate(
                        viewingOrder.clienteLng,
                        viewingOrder.lng,
                        viewingOrder.longitude,
                        viewingOrder.enderecoLng,
                        addressMatch?.lng,
                        addressMatch?.longitude,
                        addressMatch?.latLng?.lng,
                        addressMatch?.latlng?.lng
                    );

                    const mapLink = viewingOrder.localizacaoLink
                        || viewingOrder.locationLink
                        || viewingOrder.mapLink
                        || viewingOrder.linkLocalizacao
                        || viewingOrder.mapaUrl
                        || addressMatch?.mapLink
                        || addressMatch?.locationLink
                        || addressMatch?.googleMapsUrl
                        || (latitude !== null && longitude !== null ? `https://www.google.com/maps?q=${latitude},${longitude}` : null);

                    const entregadores = (data.fornecedores || []).filter((fornecedor) => (fornecedor.categoria || '').toLowerCase() === 'entregador');
                    const canSendToDeliverer = !!mapLink && entregadores.length > 0 && endereco !== 'Não informado' && endereco !== 'Retirar na Loja';

                    const formatPhoneForWhatsApp = (phone) => {
                        if (!phone) return '';
                        const digits = phone.replace(/\D/g, '');
                        if (!digits) return '';
                        if (digits.length === 13 && digits.startsWith('55')) return digits;
                        if (digits.length === 11) return `55${digits}`;
                        if (digits.length === 12 && digits.startsWith('55')) return digits;
                        return digits.length > 0 ? `55${digits}` : '';
                    };

                    const handleSendToWhatsApp = () => {
                        if (!telefone) {
                           alert("Telefone do cliente não encontrado para enviar mensagem.");
                           return;
                        }

                        const whatsappNumber = formatPhoneForWhatsApp(telefone);
                        if (!whatsappNumber) {
                            alert('Telefone do cliente inválido para WhatsApp.');
                            return;
                        }

                        let message = `Olá, *${viewingOrder.clienteNome || 'Cliente'}!*\n\n`;
                        message += `Aqui está um resumo do seu pedido na Ana Guimarães Doceria:\n\n`;
                        if (endereco !== 'Não informado') {
                            message += `*Endereço de Entrega:*\n${endereco}\n\n`;
                        }
                        message += `*Itens do Pedido:*\n`;
                        (viewingOrder.itens || []).forEach(item => {
                            message += `  • ${item.quantity || 1}x ${item.nome}\n`;
                        });
                        message += `\n`;

                        if (viewingOrder.cupom?.valorDesconto > 0) {
                            message += `*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
                            message += `*Desconto (${viewingOrder.cupom.codigo}):* - R$ ${viewingOrder.cupom.valorDesconto.toFixed(2)}\n`;
                        } else if (viewingOrder.desconto > 0) {
                             message += `*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
                             message += `*Desconto Manual:* - R$ ${viewingOrder.desconto.toFixed(2)}\n`;
                        }

                        message += `*Total:* R$ ${(viewingOrder.total || 0).toFixed(2)}\n`;
                        if(viewingOrder.formaPagamento) message += `*Pagamento:* ${viewingOrder.formaPagamento}\n`;
                        message += `*Status:* ${viewingOrder.status}\n\n`;
                        if(viewingOrder.observacao) message += `*Observações:* ${viewingOrder.observacao}\n\n`;

                        message += `Agradecemos a sua preferência! ❤`;

                        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
                        window.open(whatsappUrl, '_blank');
                    };

                    const handleSendAddressToDeliverer = () => {
                        if (!canSendToDeliverer) {
                            alert('Não há informações suficientes para enviar o endereço ao entregador.');
                            return;
                        }

                        let selectedDeliverer = entregadores[0];
                        if (entregadores.length > 1) {
                            const options = entregadores.map((entregador, index) => {
                                const contact = entregador.contato_whatsapp || entregador.contato_telefone || 'Sem contato';
                                return `${index + 1} - ${entregador.nome || 'Entregador'} (${contact})`;
                            }).join('\n');
                            const choice = window.prompt(`Selecione o entregador:\n${options}`, '1');
                            if (!choice) return;
                            const selectedIndex = parseInt(choice, 10) - 1;
                            if (Number.isNaN(selectedIndex) || !entregadores[selectedIndex]) {
                                alert('Entregador selecionado inválido.');
                                return;
                            }
                            selectedDeliverer = entregadores[selectedIndex];
                        }

                        const whatsappNumber = formatPhoneForWhatsApp(selectedDeliverer.contato_whatsapp || selectedDeliverer.contato_telefone || '');
                        if (!whatsappNumber) {
                            alert('O entregador selecionado não possui um número de WhatsApp válido.');
                            return;
                        }

                        const linhasMensagem = [
                            `Olá${selectedDeliverer.nome ? ` ${selectedDeliverer.nome}` : ''}!`,
                            `Endereço para entrega do pedido de ${viewingOrder.clienteNome || 'cliente'}:`,
                        ];

                        if (telefone) {
                            linhasMensagem.push(`Telefone do cliente: ${telefone}`);
                        }

                        linhasMensagem.push(endereco);
                        linhasMensagem.push('');
                        linhasMensagem.push(`Localização: ${mapLink}`);

                        const mensagem = linhasMensagem.join('\n');
                        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(mensagem)}`;
                        window.open(whatsappUrl, '_blank');
                    };
                    const handlePrint = () => {
                        const printWindow = window.open('', '_blank');
                        if (!printWindow) {
                            alert("Por favor, habilite pop-ups para imprimir.");
                            return;
                        }
                        printWindow.document.write('<html><head><title>Cupom do Pedido</title>');
                        printWindow.document.write('<style> body { font-family: monospace; margin: 0; padding: 10px; width: 300px; font-size: 10pt; } h2, h3 { text-align: center; margin: 5px 0; } hr { border: none; border-top: 1px dashed black; margin: 5px 0; } table { width: 100%; border-collapse: collapse; margin-bottom: 5px;} td { padding: 1px 0; vertical-align: top;} .right { text-align: right; } p { margin: 2px 0; } .total { font-weight: bold; font-size: 11pt;} </style>');
                        printWindow.document.write('</head><body>');
                        printWindow.document.write('<h2>Ana Guimarães Doceria</h2>');
                        printWindow.document.write(`<p>Cliente: ${viewingOrder.clienteNome || 'N/A'}</p>`);
                        if (endereco !== 'Não informado') printWindow.document.write(`<p>Endereço: ${endereco}</p>`);
                        if (telefone) printWindow.document.write(`<p>Telefone: ${telefone}</p>`);
                        printWindow.document.write(`<p>Data: ${getJSDate(viewingOrder.createdAt)?.toLocaleString('pt-BR') || '-'}</p>`);
                        if (viewingOrder.dataEntrega) printWindow.document.write(`<p>Entrega: ${new Date(viewingOrder.dataEntrega + 'T03:00:00Z').toLocaleDateString('pt-BR')}</p>`);
                        printWindow.document.write('<hr>');
                        printWindow.document.write('<h3>Itens</h3>');
                        printWindow.document.write('<table>');
                        (viewingOrder.itens || []).forEach(item => {
                            printWindow.document.write(`<tr><td>${item.quantity || 1}x ${item.nome}</td><td class="right">R$ ${((item.preco || 0) * (item.quantity || 1)).toFixed(2)}</td></tr>`);
                        });
                        printWindow.document.write('</table>');
                        printWindow.document.write('<hr>');

                         if (viewingOrder.cupom?.valorDesconto > 0 || viewingOrder.desconto > 0) {
                            printWindow.document.write(`<p>Subtotal:<span style="float: right;">R$ ${subtotal.toFixed(2)}</span></p>`);
                             if (viewingOrder.cupom) {
                                printWindow.document.write(`<p>Desconto (${viewingOrder.cupom.codigo}):<span style="float: right;">- R$ ${viewingOrder.cupom.valorDesconto.toFixed(2)}</span></p>`);
                            } else {
                                printWindow.document.write(`<p>Desconto:<span style="float: right;">- R$ ${viewingOrder.desconto.toFixed(2)}</span></p>`);
                            }
                        }
                        
                        printWindow.document.write(`<p class="total">Total:<span style="float: right;">R$ ${(viewingOrder.total || 0).toFixed(2)}</span></p>`);
                        if(viewingOrder.formaPagamento) printWindow.document.write(`<p>Pagamento: ${viewingOrder.formaPagamento}</p>`);

                        if(viewingOrder.observacao) {
                            printWindow.document.write(`<hr><h3>Observações:</h3><p>${viewingOrder.observacao}</p>`);
                        }
                        printWindow.document.write('<hr><p style="text-align: center;">Obrigado!</p>');
                        printWindow.document.write('</body></html>');
                        printWindow.document.close();
                         // Adiciona um pequeno delay para garantir que o conteúdo foi escrito antes de imprimir
                        setTimeout(() => {
                           printWindow.focus(); // Necessário para alguns navegadores
                           printWindow.print();
                           // printWindow.close(); // Comentar se quiser manter a janela aberta para debug
                        }, 250);
                    };

                    return (
                        <div className="space-y-4 text-sm text-gray-700">
                            <div className="p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-bold text-lg text-gray-800 mb-2">Informações do Cliente</h3>
                                <p><strong>Nome:</strong> {viewingOrder.clienteNome || 'N/A'}</p>
                                <p><strong>Endereço:</strong> {endereco}</p>
                                <p><strong>Telefone:</strong> {telefone || 'Não informado'}</p>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-bold text-lg text-gray-800 mb-2">Informações do Pedido</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <p><strong>Status:</strong> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusClass(viewingOrder.status)}`}>{viewingOrder.status}</span></p>
                                    <p><strong>Data do Pedido:</strong> {viewingOrder.createdAt ? getJSDate(viewingOrder.createdAt)?.toLocaleString('pt-BR') : '-'}</p>
                                    <p><strong>Origem:</strong> {viewingOrder.origem}</p>
                                    <p><strong>Pagamento:</strong> {viewingOrder.formaPagamento || 'Não informado'}</p>
                                    {viewingOrder.categoria && (<p><strong>Categoria:</strong> {viewingOrder.categoria}</p>)}
                                    {viewingOrder.dataEntrega && (<p><strong>Data de Entrega:</strong> {new Date(viewingOrder.dataEntrega + 'T03:00:00Z').toLocaleDateString('pt-BR')}</p>)}
                                </div>
                            </div>
                            
                             {viewingOrder.observacao && (
                                <div className="p-4 bg-yellow-50 rounded-lg">
                                    <h3 className="font-bold text-lg text-yellow-800 mb-2">Observações</h3>
                                    <p>{viewingOrder.observacao}</p>
                                </div>
                            )}

                            <div>
                                <h4 className="font-bold text-lg text-gray-800 mt-4 mb-2">Itens do Pedido:</h4>
                                <ul className="space-y-2">
                                    {(viewingOrder.itens || []).map((item, index) => (
                                        <li key={item.id || index} className="flex justify-between items-center p-2 bg-pink-50/50 rounded-md">
                                            <span>{item.quantity || 1}x {item.nome}</span>
                                            <span>R$ {((item.preco || 0) * (item.quantity || 1)).toFixed(2)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="text-right pt-4 border-t mt-4 space-y-1">
                                { (viewingOrder.cupom?.valorDesconto > 0 || viewingOrder.desconto > 0) && (
                                    <>
                                        <p className="text-sm text-gray-600">Subtotal: R$ {subtotal.toFixed(2)}</p>
                                        <p className="text-sm text-red-600">
                                            Desconto {viewingOrder.cupom ? `(${viewingOrder.cupom.codigo})` : ''}: 
                                            - R$ {(viewingOrder.cupom?.valorDesconto || viewingOrder.desconto || 0).toFixed(2)}
                                        </p>
                                    </>
                                )}
                                <p className="font-bold text-2xl text-pink-600">
                                    Total: R$ ${(viewingOrder.total || 0).toFixed(2)}
                                </p>
                           </div>

                            <div className="flex flex-wrap justify-end pt-4 mt-4 border-t gap-3">
                                <Button
                                    onClick={handlePrint}
                                    variant="secondary"
                                    size="sm"
                                >
                                    <Printer className="w-4 h-4" />
                                    Imprimir Cupom
                                </Button>
                                <Button
                                    onClick={handleSendAddressToDeliverer}
                                    disabled={!canSendToDeliverer}
                                    className="bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
                                    size="sm"
                                >
                                    <MapPin className="w-4 h-4" />
                                    Enviar Endereço para Entregador
                                </Button>
                                <Button
                                    onClick={handleSendToWhatsApp}
                                    disabled={!telefone}
                                    className="bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-400 disabled:shadow-none disabled:transform-none"
                                    size="sm"
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    Enviar Resumo Cliente
                                </Button>
                            </div>
                        </div>
                    );
                })()}
             </Modal>
        </div>
    );
  };


  const PlaceholderPage = ({ title }) => (<div className="p-6"><h1 className="text-3xl font-bold text-pink-600">{title}</h1><p>Em desenvolvimento...</p></div>);

  const renderCurrentPage = () => {
    if (authLoading || (loading && user)) {
      return (<div className="flex h-full w-full items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-pink-500"></div></div>);
    }
    
    switch (currentPage) {
      case 'pagina-inicial': return <PaginaInicial />;
      case 'dashboard': return user ? <Dashboard 
                                        handleStopAndSnoozeAlarm={handleStopAndSnoozeAlarm}
                                        isAlarmPlaying={isAlarmPlaying}
                                        isAlarmSnoozed={isAlarmSnoozed}
                                        snoozeEndTime={snoozeEndTime} 
                                        hasNewPendingOrders={hasNewPendingOrders}
                                        // --- REMOVIDO: unlockAudio e audioUnlocked ---
                                        /> : <PaginaInicial />;
      case 'clientes': return user ? <Clientes /> : <PaginaInicial />;
      case 'produtos': return user ? <Produtos /> : <PaginaInicial />;
      case 'pedidos': return user ? <Pedidos /> : <PaginaInicial />;
      case 'agenda': return user ? <Agenda /> : <PaginaInicial />;
      case 'fornecedores': return user ? <Fornecedores data={data} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} setConfirmDelete={setConfirmDelete} /> : <PaginaInicial />;
      case 'relatorios': return user ? <Relatorios data={data} /> : <PaginaInicial />;
      case 'meu-espaco': return user ? <MeuEspaco user={user} data={data} /> : <PaginaInicial />;
      case 'financeiro': return user?.role === 'admin' ? <Financeiro data={data} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} setConfirmDelete={setConfirmDelete} /> : <PaginaInicial />;
      case 'configuracoes': return user?.role === 'admin' ? <Configuracoes user={user} setConfirmDelete={setConfirmDelete} data={data} addItem={addItem} updateItem={updateItem} deleteItem={deleteItem} /> : <PaginaInicial />;
      default: return user ? <PlaceholderPage title={allMenuItems.find(i=>i.id===currentPage)?.label || "Página"} /> : <PaginaInicial />;
    }
  };

  return (
    // --- REMOVIDO: onClick={unlockAudio} da div principal ---
    <div className="relative md:flex h-screen bg-gray-100 font-sans"> 
        {/* --- NOVO: Botão de ativação global renderizado condicionalmente --- */}
        {showActivateSoundButton && (
             <button
                id="btn-ativar-som"
                onClick={async () => {
                    await audioManager.userUnlock();
                    setShowActivateSoundButton(!audioManager.unlocked); // Esconde se desbloqueado
                }}
                className="fixed bottom-4 right-4 z-[9999] px-4 py-2 rounded-xl bg-pink-600 text-white border-none shadow-lg hover:bg-pink-700 transition-colors cursor-pointer"
             >
                🔊 Ativar som de pedidos
             </button>
        )}
        
        {!isDesktop && sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/50 z-30"></div>}
        
        <div className={`fixed md:relative flex flex-col bg-white shadow-lg h-full transition-transform duration-300 z-40 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isDesktop ? (sidebarOpen ? 'w-64' : 'w-20') : 'w-64'}`}>
            <div className="flex items-center justify-between p-4 border-b h-16">
                <img src="logotipo.png" alt="Logotipo Ana Doceria" className={`h-8 transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`} />
                <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-pink-50 hidden md:block">
                    <Menu className="w-6 h-6 text-gray-600" />
                </button>
            </div>
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto"> {/* Adicionado overflow */}
                {menuItems.map((item) => (
                    <button key={item.id} onClick={() => {setCurrentPage(item.id); if(!isDesktop) setSidebarOpen(false);}} className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${currentPage === item.id ? 'bg-pink-100 text-pink-700' : 'hover:bg-pink-50 text-gray-700'} ${!sidebarOpen ? 'justify-center' : ''}`}>
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {(sidebarOpen || !isDesktop) && <span className="font-medium text-sm">{item.label}</span>} {/* Diminuído font size */}
                    </button>
                ))}
            </nav>
            {user && (
            <div className="p-4 border-t">
                <button onClick={handleLogout} className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-pink-50 text-gray-700 ${!sidebarOpen ? 'justify-center' : ''}`}>
                <LogOut className="w-5 h-5 flex-shrink-0" />
                {(sidebarOpen || !isDesktop) && <span className="text-sm">Sair</span>} {/* Diminuído font size */}
                </button>
            </div>
            )}
        </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-white shadow-sm h-16 flex-shrink-0"> {/* Adicionado flex-shrink-0 */}
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg hover:bg-pink-50 md:hidden">
                <Menu className="w-6 h-6 text-gray-600" />
            </button>
            <div className="flex-1"></div>
            <div className="flex items-center gap-4">
				{user && (
					<div className="relative">
						<button onClick={() => setShowNotifications(!showNotifications)} className="relative p-2 rounded-full hover:bg-gray-100">
							<Bell className="w-5 h-5 text-gray-600" />
							{pendingOrders.length > 0 && 
								<span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center animate-pulse">
									{pendingOrders.length}
								</span>
							}
						</button>
						{showNotifications && (
							<div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl z-20 border">
								<div className="p-4 font-bold border-b">Pedidos Pendentes ({pendingOrders.length})</div>
								<div className="p-2 max-h-96 overflow-y-auto">
									{pendingOrders.length > 0 ? (
										pendingOrders.map(order => (
											<div key={order.id} className="p-2 border-b hover:bg-gray-50 cursor-pointer" onClick={() => { setCurrentPage('pedidos'); setShowNotifications(false); }}>
												<p className="font-semibold">{order.clienteNome || 'Cliente'}</p>
												<p className="text-sm text-gray-500">ID: {order.id?.substring(0,8) || 'N/A'}</p>
												<p className="text-sm text-gray-500">Data: {getJSDate(order.createdAt)?.toLocaleDateString() || '-'}</p>
												<p className="text-sm">Status: <span className="font-medium">{order.status}</span></p>
											</div>
										))
									) : (
										<p className="p-4 text-center text-gray-500">Nenhum pedido pendente.</p>
									)}
								</div>
							</div>
						)}
					</div>
				)}
				
				<div className="relative">
					<button onClick={() => {
						if (!user) {
							setShowLogin(true);
							setShowPasswordReset(false);
							setPasswordResetMessage({ text: '', type: '' });
						} else {
							setShowUserMenu(!showUserMenu);
						}
					}} className="p-2 rounded-full hover:bg-gray-100">
						<UserIcon className="w-6 h-6 text-gray-600" />
					</button>
					{user && <span className="absolute top-0 right-0 w-2 h-2 bg-green-500 rounded-full border-2 border-white"></span>}
					{showUserMenu && user && (
						<div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-xl z-20 border p-2">
							<p className="px-2 py-1 text-sm text-gray-700 font-semibold truncate">{user.auth.displayName || user.auth.email}</p>
                            <button onClick={() => { setCurrentPage('configuracoes'); setShowUserMenu(false); }} className="w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded">Configurações</button>
                            <button onClick={handleLogout} className="w-full text-left px-2 py-1 text-sm text-red-600 hover:bg-red-50 rounded">Sair</button>
						</div>
					)}
				</div>
			</div>
        </div>
        <main className="flex-1 overflow-y-auto">
            {renderCurrentPage()}
        </main>
      </div>

      <Modal isOpen={showLogin} onClose={() => {setShowLogin(false); setLoginError(''); setPasswordResetMessage({ text: '', type: '' });}} title={showPasswordReset ? "Recuperar Senha" : "Login"} size="sm">
        {showPasswordReset ? (
            <div className="space-y-4">
                <p className="text-sm text-gray-600">Insira seu e-mail para enviarmos um link de recuperação.</p>
                <Input label="Email" type="email" placeholder="seu@email.com" value={passwordResetEmail} onChange={(e) => setPasswordResetEmail(e.target.value)} />
                {passwordResetMessage.text && (
                    <p className={`text-sm ${passwordResetMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                        {passwordResetMessage.text}
                    </p>
                )}
                <div className="flex flex-col gap-2">
                    <Button onClick={handlePasswordReset} disabled={passwordResetMessage.type === 'loading'}>
                        {passwordResetMessage.type === 'loading' ? 'Enviando...' : 'Enviar Email de Recuperação'}
                    </Button>
                    <button onClick={() => setShowPasswordReset(false)} className="text-sm text-pink-600 hover:underline text-center">
                        Voltar para o Login
                    </button>
                </div>
            </div>
        ) : (
            <div className="space-y-4">
                <Input label="Email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Input label="Senha" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button onClick={() => setShowPasswordReset(true)} className="text-sm text-pink-600 hover:underline text-left w-full">
                    Esqueci a senha
                </button>
                {loginError && <p className="text-red-500 text-sm text-center">{loginError}</p>}
                <div className="flex flex-col gap-4 pt-2">
                    <Button onClick={handleLogin}>Entrar</Button>
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="bg-white px-2 text-gray-500">ou</span>
                        </div>
                    </div>
                    <Button onClick={handleGoogleSignIn} variant="secondary">
                        <svg className="w-5 h-5" viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                            <path fill="none" d="M0 0h48v48H0z"></path>
                        </svg>
                        Entrar com Google
                    </Button>
                </div>
            </div>
        )}
      </Modal>

      <Modal isOpen={confirmDelete.isOpen} onClose={() => setConfirmDelete({ isOpen: false, onConfirm: ()=>{} })} title="Confirmar Exclusão" size="sm">
        <div className="space-y-6">
            <p className="text-gray-600">Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={() => setConfirmDelete({ isOpen: false, onConfirm: ()=>{} })}>Cancelar</Button>
                <Button variant="danger" onClick={() => {
                  confirmDelete.onConfirm();
                  setConfirmDelete({ isOpen: false, onConfirm: () => {} });
                }}>Excluir</Button>
            </div>
        </div>
      </Modal>
      
      {lightboxImage && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setLightboxImage(null)}> {/* Aumentado z-index e adicionado backdrop */}
            <img src={lightboxImage} alt="Visualização Ampliada" className="max-w-[90%] max-h-[90%] rounded-lg shadow-2xl object-contain"/>
        </div>
      )}
    </div>
  );
}

export default App;

