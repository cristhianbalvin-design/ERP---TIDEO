export const getEmpresaId = empresa => empresa?.id || empresa?.empresa_id || null;

export const belongsToEmpresa = (record, empresa) => {
  const empresaId = getEmpresaId(empresa);
  if (!empresaId) return true;
  return record?.empresa_id === empresaId;
};

export const filterByEmpresa = (items = [], empresa) =>
  items.filter(item => belongsToEmpresa(item, empresa));

export const withEmpresa = (record = {}, empresa) => {
  const empresaId = getEmpresaId(empresa);
  return empresaId ? { ...record, empresa_id: empresaId } : { ...record };
};

export const assertEmpresa = (record, empresa) => {
  if (!belongsToEmpresa(record, empresa)) {
    throw new Error('El registro no pertenece a la empresa activa.');
  }
  return record;
};
