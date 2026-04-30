import { filterByEmpresa, withEmpresa, assertEmpresa } from '../lib/tenant.js';

const makeId = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const createMockRepository = ({
  getState,
  setState,
  empresa,
  idPrefix = 'rec',
  sortBy,
} = {}) => {
  if (typeof getState !== 'function') {
    throw new Error('createMockRepository requiere getState.');
  }
  if (typeof setState !== 'function') {
    throw new Error('createMockRepository requiere setState.');
  }

  const scoped = () => {
    const rows = filterByEmpresa(getState() || [], empresa);
    return sortBy ? [...rows].sort(sortBy) : rows;
  };

  return {
    list() {
      return scoped();
    },

    getById(id) {
      const record = (getState() || []).find(item => item.id === id);
      return record ? assertEmpresa(record, empresa) : null;
    },

    create(values) {
      const record = withEmpresa({
        id: values?.id || makeId(idPrefix),
        created_at: new Date().toISOString(),
        estado: values?.estado || 'activo',
        ...values,
      }, empresa);

      setState(prev => [record, ...(prev || [])]);
      return record;
    },

    update(id, patch) {
      let updated = null;
      setState(prev => (prev || []).map(item => {
        if (item.id !== id) return item;
        assertEmpresa(item, empresa);
        updated = { ...item, ...patch, updated_at: new Date().toISOString() };
        return updated;
      }));
      return updated;
    },

    softDelete(id, extra = {}) {
      return this.update(id, {
        estado: 'anulado',
        anulacion_fecha: new Date().toISOString(),
        ...extra,
      });
    },
  };
};
