import React from 'react';

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
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Nome da receita" value={formData.nome || ''} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} required />
        <Select label="Categoria" value={formData.categoria || ''} onChange={(e) => setFormData({ ...formData, categoria: e.target.value })} required>
          <option value="">Selecione...</option>
          <option value="Bolos">Bolos</option>
          <option value="Doces">Doces</option>
          <option value="Salgados">Salgados</option>
          <option value="Bebidas">Bebidas</option>
          <option value="Outros">Outros</option>
        </Select>
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
  </Modal>
);

export default ReceitasModal;
