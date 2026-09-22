const COTIZACION_ITEM_FIELDS = [
  { id:'descripcion', label:'Descripción', token:'{{item.descripcion}}' },
  { id:'cantidad', label:'Cantidad', token:'{{item.cantidad}}' },
  { id:'unidad', label:'Unidad', token:'{{item.unidad}}' },
  { id:'precio_unitario', label:'Precio unitario', token:'{{item.precio_unitario}}' },
  { id:'subtotal', label:'Subtotal', token:'{{item.subtotal}}' },
  { id:'codigo', label:'Código del activo', token:'{{item.codigo}}' },
  { id:'marca', label:'Marca del activo', token:'{{item.marca}}' },
  { id:'modelo', label:'Modelo del activo', token:'{{item.modelo}}' },
  { id:'año_fabricacion', label:'Año de fabricación del activo', token:'{{item.año_fabricacion}}' },
  { id:'año_overhaul', label:'Año de overhaul del activo', token:'{{item.año_overhaul}}' },
];

export const DOCUMENT_REPEAT_SOURCES = {
  cotizacion: [
    { id:'cotizacion.items', label:'Ítems de la cotización', fields:COTIZACION_ITEM_FIELDS },
  ],
};

export const getDocumentRepeatSources = categoria => DOCUMENT_REPEAT_SOURCES[categoria] || [];

export const getDocumentRepeatSource = (categoria, sourceId) => (
  getDocumentRepeatSources(categoria).find(source => source.id === sourceId) || null
);

export const getRepeatSourceItems = (contexto, sourceId) => {
  if (!sourceId || !contexto) return null;
  const value = sourceId.split('.').reduce((current, key) => current?.[key], contexto);
  return Array.isArray(value) ? value : null;
};

export const getRepeatVariables = (categoria, sourceId) => {
  const source = getDocumentRepeatSource(categoria, sourceId);
  return (source?.fields || []).map(field => ({ grupo:'Ítem repetido', label:field.label, token:field.token }));
};
