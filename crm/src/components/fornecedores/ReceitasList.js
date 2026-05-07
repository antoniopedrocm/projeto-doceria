import React from 'react';
import { Edit, Trash2 } from 'lucide-react';

const formatCurrency = (value) => {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const ReceitasList = ({ receitas = [], onEdit, onDelete }) => (
  <div className="bg-white p-4 rounded-2xl shadow border border-gray-100 overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          {['Nome da Receita', 'Categoria', 'Tempo de Preparo', 'Rendimento', 'Custo', 'Ações'].map((header) => (
            <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">{header}</th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-100">
        {receitas.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">Nenhuma receita cadastrada.</td>
          </tr>
        ) : receitas.map((receita) => (
          <tr key={receita.id} className="hover:bg-pink-50/40 transition-colors">
            <td className="px-4 py-3 text-sm font-medium text-gray-800">{receita.nome}</td>
            <td className="px-4 py-3 text-sm text-gray-700">{receita.categoria}</td>
            <td className="px-4 py-3 text-sm text-gray-700">{receita.tempoPreparo} min</td>
            <td className="px-4 py-3 text-sm text-gray-700">{receita.rendimento}</td>
            <td className="px-4 py-3 text-sm text-gray-700">{formatCurrency(receita.custoEstimado)}</td>
            <td className="px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onEdit(receita)} className="p-2 rounded-lg border border-gray-200 text-blue-600 hover:bg-blue-50" title="Editar receita">
                  <Edit className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => onDelete(receita)} className="p-2 rounded-lg border border-gray-200 text-red-600 hover:bg-red-50" title="Excluir receita">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default ReceitasList;
