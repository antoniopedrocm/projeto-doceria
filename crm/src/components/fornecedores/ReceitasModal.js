import React from 'react';

const CATEGORIAS_PADRAO = ['Bolos', 'Doces', 'Salgados', 'Bebidas', 'Outros'];
const NOVA_CATEGORIA_VALUE = '__nova_categoria__';

const ReceitasModal = ({
  isOpen,
  onClose,
  onSubmit,
  formData,
  setFormData,
  editingReceita,
  Modal,
  Input,
  Select,
  Textarea,
  Button,
  Save
}) => (
  <Modal isOpen={isOpen} onClose={onClose} title={editingReceita ? 'Editar Receita' : 'Nova Receita'} size="lg">
    {(() => {
      const categoriaAtual = formData.categoria || '';
      const categoriaEhPadrao = CATEGORIAS_PADRAO.includes(categoriaAtual);
      const selecionadoNoSelect = categoriaAtual === '' ? '' : (categoriaEhPadrao ? categoriaAtual : NOVA_CATEGORIA_VALUE);

      return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Nome da receita" value={formData.nome || ''} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required />
        <Select
          label="Categoria"
          value={selecionadoNoSelect}
          onChange={(e) => {
            const value = e.target.value;
            if (value === NOVA_CATEGORIA_VALUE) {
              setFormData({ ...formData, categoria: '' });
              return;
            }
            setFormData({ ...formData, categoria: value });
          }}
          required
        >
          <option value="">Selecione...</option>
          {CATEGORIAS_PADRAO.map((categoria) => (
            <option key={categoria} value={categoria}>{categoria}</option>
          ))}
          <option value={NOVA_CATEGORIA_VALUE}>+ Cadastrar nova categoria</option>
        </Select>
        {selecionadoNoSelect === NOVA_CATEGORIA_VALUE && (
          <Input
            label="Nova categoria"
            value={formData.categoria || ''}
            onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
            placeholder="Digite o nome da nova categoria"
            required
          />
        )}
        <Input label="Tempo de Preparo em minutos" type="number" min="1" value={formData.tempoPreparo || ''} onChange={(e) => setFormData({ ...formData, tempoPreparo: e.target.value })} required />
        <Input label="Rendimento" type="number" min="1" value={formData.rendimento || ''} onChange={(e) => setFormData({ ...formData, rendimento: e.target.value })} required />
        <Input label="Custo estimado" type="number" step="0.01" min="0" value={formData.custoEstimado || ''} onChange={(e) => setFormData({ ...formData, custoEstimado: e.target.value })} required />
      </div>
      <Textarea label="Ingredientes" rows="3" value={formData.ingredientes || ''} onChange={(e) => setFormData({ ...formData, ingredientes: e.target.value })} required />
      <Textarea label="Modo de Preparo" rows="4" value={formData.modoPreparo || ''} onChange={(e) => setFormData({ ...formData, modoPreparo: e.target.value })} required />
      <Textarea label="Observações (opcional)" rows="2" value={formData.observacoes || ''} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} />
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
        <Button type="submit"><Save className="w-4 h-4" /> Salvar</Button>
      </div>
    </form>
      );
    })()}
  </Modal>
);

export default ReceitasModal;
