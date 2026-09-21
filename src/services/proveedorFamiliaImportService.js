import { getSupabaseClient } from '../lib/supabaseClient.js';
import { proveedorFamiliaService } from './proveedorFamiliaService.js';

const requireTenant = (empresaId) => {
  if (!empresaId) throw new Error('No se pudo determinar el tenant actual.');
  return empresaId;
};

const textKey = (value) => String(value ?? '').trim();
const rucKey = (value) => textKey(value).replace(/\s+/g, '');
const codeKey = (value) => textKey(value).toLocaleUpperCase('es-PE');

const familyReferenceCode = (group, family) => {
  const familyCode = codeKey(family.codigo);
  if (!group) return `SIN-GRUPO-${familyCode}-${String(family.id).slice(-6)}`;
  return `${codeKey(group.codigo)}-${familyCode}`;
};

const addToIndex = (map, key, value) => {
  if (!key) return;
  const current = map.get(key) || [];
  current.push(value);
  map.set(key, current);
};

export const cargarReferenciasProveedorFamilia = async (empresaId) => {
  const tenantId = requireTenant(empresaId);
  const supabase = await getSupabaseClient();

  const [proveedoresRes, gruposRes, familiasRes, relacionesRes] = await Promise.all([
    supabase
      .from('proveedores')
      .select('id, empresa_id, codigo, ruc, razon_social, nombre_comercial')
      .eq('empresa_id', tenantId)
      .order('razon_social'),
    supabase
      .from('material_grupos')
      .select('id, empresa_id, codigo, nombre')
      .eq('empresa_id', tenantId)
      .order('codigo'),
    supabase
      .from('material_familias')
      .select('id, empresa_id, grupo_id, codigo, nombre')
      .eq('empresa_id', tenantId)
      .order('grupo_id')
      .order('codigo'),
    supabase
      .from('proveedor_familia')
      .select('proveedor_id, familia_id')
      .eq('empresa_id', tenantId),
  ]);

  const firstError = [proveedoresRes, gruposRes, familiasRes, relacionesRes].find(result => result.error)?.error;
  if (firstError) throw firstError;

  const gruposById = new Map((gruposRes.data || []).map(group => [group.id, group]));
  const proveedores = (proveedoresRes.data || []).map(provider => ({
    ...provider,
    ruc: rucKey(provider.ruc),
  }));
  const familias = (familiasRes.data || []).map(family => {
    const group = gruposById.get(family.grupo_id) || null;
    return {
      ...family,
      codigo_familia: familyReferenceCode(group, family),
      nombre_familia: family.nombre,
      grupo: group ? `${group.codigo} - ${group.nombre}` : 'Sin grupo válido',
      grupo_id: group?.id || family.grupo_id,
    };
  });

  const proveedoresByRuc = new Map();
  proveedores.forEach(provider => addToIndex(proveedoresByRuc, provider.ruc, provider));

  const familiasByCode = new Map();
  familias.forEach(family => addToIndex(familiasByCode, codeKey(family.codigo_familia), family));

  const relacionesExistentes = new Set(
    (relacionesRes.data || []).map(row => `${row.proveedor_id}|${row.familia_id}`),
  );

  return {
    empresaId: tenantId,
    proveedores,
    familias,
    proveedoresByRuc,
    familiasByCode,
    relacionesExistentes,
  };
};

export const prepararPreviewProveedorFamilia = (rows = [], referencias) => {
  const seenPairs = new Set();

  return rows.map((row, index) => {
    const ruc = rucKey(row.ruc_proveedor);
    const codigoFamilia = codeKey(row.codigo_familia);
    const item = {
      id: `pf_imp_${index}`,
      fila: index + 2,
      ruc_proveedor: ruc,
      codigo_familia: textKey(row.codigo_familia),
      proveedor_id: null,
      familia_id: null,
      proveedor_nombre: '',
      familia_nombre: '',
      grupo: '',
      status: 'LISTO',
      errorMsg: '',
    };

    if (!ruc) {
      item.status = 'ERROR';
      item.errorMsg = 'RUC de proveedor vacío.';
      return item;
    }
    if (!codigoFamilia) {
      item.status = 'ERROR';
      item.errorMsg = 'Código de familia vacío.';
      return item;
    }

    const proveedores = referencias?.proveedoresByRuc?.get(ruc) || [];
    if (proveedores.length === 0) {
      item.status = 'ERROR';
      item.errorMsg = 'El RUC no existe en los proveedores del tenant actual.';
      return item;
    }
    if (proveedores.length > 1) {
      item.status = 'ERROR';
      item.errorMsg = 'El RUC corresponde a más de un proveedor en el tenant.';
      return item;
    }

    const familias = referencias?.familiasByCode?.get(codigoFamilia) || [];
    if (familias.length === 0) {
      item.status = 'ERROR';
      item.errorMsg = 'El código de familia no existe en el tenant actual.';
      return item;
    }
    if (familias.length > 1) {
      item.status = 'ERROR';
      item.errorMsg = 'El código de familia es ambiguo en el tenant actual.';
      return item;
    }

    const proveedor = proveedores[0];
    const familia = familias[0];
    const pairKey = `${proveedor.id}|${familia.id}`;
    item.proveedor_id = proveedor.id;
    item.familia_id = familia.id;
    item.proveedor_nombre = proveedor.razon_social || proveedor.nombre_comercial || proveedor.id;
    item.familia_nombre = familia.nombre_familia || familia.nombre || familia.id;
    item.grupo = familia.grupo || 'Sin grupo válido';

    if (seenPairs.has(pairKey)) {
      item.status = 'ERROR';
      item.errorMsg = 'Duplicado dentro del archivo: la primera ocurrencia ya fue considerada.';
      return item;
    }
    seenPairs.add(pairKey);

    if (referencias.relacionesExistentes?.has(pairKey)) {
      item.status = 'DUPLICADO';
      item.errorMsg = 'La relación ya existe en proveedor_familia.';
    }

    return item;
  });
};

const errorImportacion = (error) => {
  const code = error?.code || error?.details?.code;
  const message = String(error?.message || error || 'Error desconocido.');
  if (code === '23505' || error?.status === 409 || error?.statusCode === 409) {
    return 'La relación ya existe; no se insertó nuevamente.';
  }
  if (code === '23514' || /tenant|tenant actual|mismo tenant/i.test(message)) {
    return 'La base de datos rechazó la relación por integridad de tenant.';
  }
  return message;
};

const esDuplicado = (error) => {
  const code = error?.code || error?.details?.code;
  const message = String(error?.message || error || '');
  return code === '23505'
    || error?.status === 409
    || error?.statusCode === 409
    || /duplicate key|unique constraint|ya existe|already exists/i.test(message);
};

export const confirmarImportacionProveedorFamilia = async (empresaId, items = []) => {
  const tenantId = requireTenant(empresaId);
  const resultado = {
    insertados: 0,
    duplicados: 0,
    errores: 0,
    filas: items.map(item => ({ ...item })),
  };

  for (const item of resultado.filas) {
    if (item.status !== 'LISTO') {
      if (item.status === 'DUPLICADO') resultado.duplicados += 1;
      if (item.status === 'ERROR') resultado.errores += 1;
      continue;
    }

    try {
      await proveedorFamiliaService.asignarFamilia(tenantId, item.proveedor_id, item.familia_id);
      resultado.insertados += 1;
    } catch (error) {
      if (esDuplicado(error)) {
        item.status = 'DUPLICADO';
        item.errorMsg = errorImportacion(error);
        resultado.duplicados += 1;
      } else {
        item.status = 'ERROR';
        item.errorMsg = errorImportacion(error);
        resultado.errores += 1;
      }
    }
  }

  return resultado;
};

export const proveedorFamiliaImportUtils = {
  codeKey,
  rucKey,
  familyReferenceCode,
};
