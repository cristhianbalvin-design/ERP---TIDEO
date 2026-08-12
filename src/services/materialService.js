import { getSupabaseClient } from '../lib/supabaseClient.js';

const makeId = (prefix) => {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(r).replace(/-/g, '').slice(0, 18)}`;
};

const pick = (src, keys) => keys.reduce((a, k) => { if (src[k] !== undefined) a[k] = src[k]; return a; }, {});

// Misma semántica que public.normalizar_texto_matching: evita duplicados por
// mayúsculas, tildes o espacios al buscar/crear fabricantes desde la UI e importación.
export const normalizarTextoMatching = (value) => String(value ?? '')
  .trim()
  .toLocaleUpperCase('es-PE')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ');

export const getFabricantes = async (empresaId) => {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('fabricantes')
    .select('*').eq('empresa_id', empresaId).order('nombre_normalizado');
  if (error) throw error;
  return data || [];
};

export const crearFabricante = async (empresaId, fabricante) => {
  const supabase = await getSupabaseClient();
  const nombre = String(fabricante?.nombre || '').trim();
  if (!nombre) throw new Error('El nombre del fabricante es obligatorio.');
  const { data, error } = await supabase.from('fabricantes').insert([{
    id: makeId('fab'), empresa_id: empresaId, codigo: fabricante?.codigo || '',
    nombre, estado: fabricante?.estado || 'activo',
  }]).select().single();
  if (error) throw error;
  return data;
};

export const actualizarFabricante = async (id, fabricante) => {
  const supabase = await getSupabaseClient();
  const nombre = String(fabricante?.nombre || '').trim();
  if (!nombre) throw new Error('El nombre del fabricante es obligatorio.');
  // El trigger preparar_fabricante recalcula nombre_normalizado y aplica la
  // unicidad por tenant al persistir cualquier cambio de nombre.
  const { data, error } = await supabase.from('fabricantes')
    .update(pick({ ...fabricante, nombre }, ['codigo', 'nombre', 'estado']))
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const findOrCreateFabricante = async (empresaId, nombre, fabricantes = []) => {
  const normalizado = normalizarTextoMatching(nombre);
  if (!normalizado) return null;
  const existente = fabricantes.find(f => normalizarTextoMatching(f.nombre) === normalizado);
  if (existente) return existente;
  try {
    return await crearFabricante(empresaId, { nombre: String(nombre).trim(), estado: 'activo' });
  } catch (error) {
    // La restricción normalizada también cubre dos altas simultáneas.
    if (error?.code !== '23505') throw error;
    const supabase = await getSupabaseClient();
    const { data, error: findError } = await supabase.from('fabricantes')
      .select('*').eq('empresa_id', empresaId).eq('nombre_normalizado', normalizado).maybeSingle();
    if (findError) throw findError;
    if (data) return data;
    throw error;
  }
};

export const guardarMaterialNumerosParte = async (empresaId, materialId, alternativos = []) => {
  const filas = (alternativos || [])
    .map(row => ({
      numero_parte: String(row?.numero_parte || '').trim(),
      fabricante_id: row?.fabricante_id || null,
      notas: String(row?.notas || '').trim() || null,
      activo: row?.activo !== false,
    }))
    .filter(row => row.numero_parte);
  if (filas.length > 4) throw new Error('Se permiten como máximo 4 números de parte alternativos.');
  if (new Set(filas.map(row => row.numero_parte)).size !== filas.length) {
    throw new Error('No se puede repetir un número de parte en el mismo material.');
  }
  const supabase = await getSupabaseClient();
  const { error } = await supabase.rpc('reemplazar_material_numeros_alternativos', {
    p_empresa_id: empresaId,
    p_material_id: materialId,
    p_alternativos: filas,
  });
  if (error) throw error;
};

// Actualiza únicamente el fabricante de la fila original. La validación de
// empresa material/fabricante se conserva en trg_validar_material_numero_parte.
export const guardarFabricanteNumeroParteOriginal = async (empresaId, materialId, fabricanteId = null, numeroParteId = null) => {
  const supabase = await getSupabaseClient();
  let query = supabase.from('material_numeros_parte')
    .update({ fabricante_id: fabricanteId || null })
    .eq('material_id', materialId).eq('tipo', 'original');
  // La ficha ya conoce el ID de la fila original al editar; usarlo hace que el
  // PATCH se dirija a la fila exacta que se mostró al usuario.
  if (numeroParteId) query = query.eq('id', numeroParteId);
  const { data, error } = await query.select('id, fabricante_id').maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('No se encontró la fila del número de parte original para actualizar el fabricante.');
  }
  if ((data.fabricante_id || null) !== (fabricanteId || null)) {
    throw new Error('El fabricante original no se pudo confirmar después de guardar.');
  }
  return data;
};

// ─── Grupos ───────────────────────────────────────────────────────────────────
export const getMaterialGrupos = async (empresaId) => {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('material_grupos').select('*')
    .eq('empresa_id', empresaId).order('codigo');
  if (error) { console.error('getMaterialGrupos:', error); return []; }
  return data;
};

export const crearMaterialGrupo = async (empresaId, grupo) => {
  const supabase = await getSupabaseClient();
  const payload = { id: makeId('mg'), empresa_id: empresaId, ...pick(grupo, ['codigo', 'nombre', 'estado']) };
  const { data, error } = await supabase.from('material_grupos').insert([payload]).select().single();
  if (error) throw error;
  return data;
};

export const actualizarMaterialGrupo = async (id, payload) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('material_grupos')
    .update(pick(payload, ['codigo', 'nombre', 'estado'])).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const eliminarMaterialGrupo = async (id) => {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('material_grupos').delete().eq('id', id);
  if (error) throw error;
};

// ─── Familias ─────────────────────────────────────────────────────────────────
export const getMaterialFamilias = async (empresaId) => {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('material_familias').select('*')
    .eq('empresa_id', empresaId).order('grupo_id').order('codigo');
  if (error) { console.error('getMaterialFamilias:', error); return []; }
  return data;
};

export const crearMaterialFamilia = async (empresaId, familia) => {
  const supabase = await getSupabaseClient();
  const payload = { id: makeId('mf'), empresa_id: empresaId, ...pick(familia, ['grupo_id', 'codigo', 'nombre', 'estado']) };
  const { data, error } = await supabase.from('material_familias').insert([payload]).select().single();
  if (error) throw error;
  return data;
};

export const actualizarMaterialFamilia = async (id, payload) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('material_familias')
    .update(pick(payload, ['grupo_id', 'codigo', 'nombre', 'estado'])).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const eliminarMaterialFamilia = async (id) => {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('material_familias').delete().eq('id', id);
  if (error) throw error;
};

// ─── Subfamilias ──────────────────────────────────────────────────────────────
export const getMaterialSubfamilias = async (empresaId) => {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('material_subfamilias').select('*')
    .eq('empresa_id', empresaId).order('familia_id').order('codigo');
  if (error) { console.error('getMaterialSubfamilias:', error); return []; }
  return data;
};

export const crearMaterialSubfamilia = async (empresaId, subfamilia) => {
  const supabase = await getSupabaseClient();
  const payload = { id: makeId('ms'), empresa_id: empresaId, ...pick(subfamilia, ['familia_id', 'codigo', 'nombre', 'estado']) };
  const { data, error } = await supabase.from('material_subfamilias').insert([payload]).select().single();
  if (error) throw error;
  return data;
};

export const actualizarMaterialSubfamilia = async (id, payload) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('material_subfamilias')
    .update(pick(payload, ['familia_id', 'codigo', 'nombre', 'estado'])).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const eliminarMaterialSubfamilia = async (id) => {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('material_subfamilias').delete().eq('id', id);
  if (error) throw error;
};

// ─── Materiales ───────────────────────────────────────────────────────────────
const MAT_FIELDS = [
  'codigo', 'descripcion', 'unidad', 'grupo_id', 'familia_id', 'subfamilia_id',
  'nro_parte', 'unidades_contenidas', 'almacen_id', 'ubicacion', 'observacion',
  'precio_unitario', 'stock_minimo', 'stock_maximo', 'punto_reorden', 'stock_seguridad',
  'estado', 'creado_por',
];

export const getMateriales = async (empresaId) => {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('materiales').select('*, material_numeros_parte(*, fabricantes(id, codigo, nombre, estado))')
      .eq('empresa_id', empresaId).order('codigo')
      .range(from, from + PAGE - 1);
    if (error) { console.error('getMateriales:', error); return []; }
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
};

export const generarCodigoMaterial = async (subfamiliaId, empresaId) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.rpc('generar_codigo_material', {
    p_subfamilia_id: subfamiliaId,
    p_empresa_id: empresaId,
  });
  if (error) { console.warn('generar_codigo_material RPC:', error.message); return null; }
  return data;
};

export const crearMaterial = async (empresaId, mat) => {
  const supabase = await getSupabaseClient();
  const payload = {
    id: makeId('mat'),
    empresa_id: empresaId,
    ...pick(mat, MAT_FIELDS),
    almacen_id: mat.almacen_id || null,
  };
  const { data, error } = await supabase.from('materiales').insert([payload]).select().single();
  if (error) throw error;
  return data;
};

export const actualizarMaterial = async (id, mat) => {
  const supabase = await getSupabaseClient();
  const payload = { ...pick(mat, MAT_FIELDS), almacen_id: mat.almacen_id || null };
  const { data, error } = await supabase.from('materiales')
    .update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const eliminarMaterial = async (id) => {
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('materiales').delete().eq('id', id);
  if (error) throw error;
};

// ─── Importación masiva ───────────────────────────────────────────────────────
const importarMaterialesMasivoLegacy = async (empresaId, filas) => {
  const supabase = await getSupabaseClient();
  const creados = [];
  const actualizados = [];
  const errores = [];

  for (const fila of filas) {
    try {
      // Upsert grupo
      const { data: grupoRows } = await supabase
        .from('material_grupos')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('codigo', String(fila.cod_grupo).padStart(2, '0'))
        .maybeSingle();

      let grupoId = grupoRows?.id;
      if (!grupoId) {
        const g = await crearMaterialGrupo(empresaId, {
          codigo: String(fila.cod_grupo).padStart(2, '0'),
          nombre: fila.grupo || `Grupo ${fila.cod_grupo}`,
          estado: 'activo',
        });
        grupoId = g.id;
      }

      // Upsert familia
      const { data: famRows } = await supabase
        .from('material_familias')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('grupo_id', grupoId)
        .eq('codigo', String(fila.cod_familia).padStart(2, '0'))
        .maybeSingle();

      let familiaId = famRows?.id;
      if (!familiaId) {
        const f = await crearMaterialFamilia(empresaId, {
          grupo_id: grupoId,
          codigo: String(fila.cod_familia).padStart(2, '0'),
          nombre: fila.familia || `Familia ${fila.cod_familia}`,
          estado: 'activo',
        });
        familiaId = f.id;
      }

      // Upsert subfamilia
      const { data: subRows } = await supabase
        .from('material_subfamilias')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('familia_id', familiaId)
        .eq('codigo', String(fila.cod_subfamilia).padStart(2, '0'))
        .maybeSingle();

      let subfamiliaId = subRows?.id;
      if (!subfamiliaId) {
        const s = await crearMaterialSubfamilia(empresaId, {
          familia_id: familiaId,
          codigo: String(fila.cod_subfamilia).padStart(2, '0'),
          nombre: fila.subfamilia || `Sub ${fila.cod_subfamilia}`,
          estado: 'activo',
        });
        subfamiliaId = s.id;
      }

      // Resolve almacén
      let almacenId = null;
      if (fila.almacen) {
        const { data: almRows } = await supabase
          .from('almacenes')
          .select('id')
          .eq('empresa_id', empresaId)
          .ilike('nombre', fila.almacen)
          .maybeSingle();
        almacenId = almRows?.id || null;
      }

      const codigo = fila.codigo || null;

      // Check si ya existe por código
      const { data: existente } = codigo
        ? await supabase.from('materiales').select('id').eq('empresa_id', empresaId).eq('codigo', codigo).maybeSingle()
        : { data: null };

      const payload = {
        empresa_id: empresaId,
        codigo: codigo,
        descripcion: fila.descripcion,
        unidad: fila.unidad,
        grupo_id: grupoId,
        familia_id: familiaId,
        subfamilia_id: subfamiliaId,
        nro_parte: fila.nro_parte || null,
        unidades_contenidas: Number(fila.unidades_contenidas) || 1,
        almacen_id: almacenId,
        ubicacion: fila.ubicacion || null,
        observacion: fila.observacion || null,
        precio_unitario: Number(fila.precio_unitario) || 0,
        estado: fila.estado || 'activo',
      };

      if (existente) {
        await supabase.from('materiales').update(payload).eq('id', existente.id);
        actualizados.push(codigo);
      } else {
        const newId = makeId('mat');
        await supabase.from('materiales').insert([{ id: newId, ...payload }]);
        creados.push(codigo || newId);
      }
    } catch (err) {
      errores.push({ fila: fila.descripcion || fila.codigo, error: err.message });
    }
  }

  return { creados: creados.length, actualizados: actualizados.length, errores };
};

export const importarMaterialesMasivo = async (empresaId, filas) => {
  const supabase = await getSupabaseClient();
  const creados = [];
  const actualizados = [];
  const errores = [];

  const normSegment = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && /^-?\d+(\.0+)?$/.test(raw)) return String(Math.trunc(asNumber)).padStart(2, '0');
    return raw.padStart(2, '0');
  };
  const normText = (value) => String(value ?? '').trim();
  const keyText = (value) => normText(value).toLowerCase();

  const [gruposRes, familiasRes, subfamiliasRes, almacenesRes, materialesRes, fabricantesRes] = await Promise.all([
    supabase.from('material_grupos').select('*').eq('empresa_id', empresaId),
    supabase.from('material_familias').select('*').eq('empresa_id', empresaId),
    supabase.from('material_subfamilias').select('*').eq('empresa_id', empresaId),
    supabase.from('almacenes').select('id,nombre').eq('empresa_id', empresaId),
    supabase.from('materiales').select('id,codigo').eq('empresa_id', empresaId),
    supabase.from('fabricantes').select('*').eq('empresa_id', empresaId),
  ]);

  const firstError = [gruposRes, familiasRes, subfamiliasRes, almacenesRes, materialesRes, fabricantesRes].find(r => r.error)?.error;
  if (firstError) throw firstError;

  const gruposByCode = new Map((gruposRes.data || []).map(g => [normSegment(g.codigo), g]));
  const familiasByGroupCode = new Map((familiasRes.data || []).map(f => [`${f.grupo_id}|${normSegment(f.codigo)}`, f]));
  const subfamiliasByFamilyCode = new Map((subfamiliasRes.data || []).map(s => [`${s.familia_id}|${normSegment(s.codigo)}`, s]));
  const almacenesByName = new Map((almacenesRes.data || []).map(a => [keyText(a.nombre), a]));
  const materialesByCode = new Map((materialesRes.data || []).filter(m => m.codigo).map(m => [normText(m.codigo), m]));
  const fabricantesByNombre = new Map((fabricantesRes.data || []).map(f => [normalizarTextoMatching(f.nombre), f]));

  const alternativosDeFila = (fila) => {
    if (Array.isArray(fila.alternativos)) return fila.alternativos;
    return [1, 2, 3, 4].map(orden => ({
      numero_parte: fila[`nro_parte_alternativo_${orden}`] ?? fila[`numero_parte_alternativo_${orden}`] ?? '',
      fabricante_nombre: fila[`fabricante_alternativo_${orden}`] ?? fila[`fabricante_${orden}`] ?? '',
      notas: fila[`notas_alternativo_${orden}`] ?? '',
    }));
  };
  const incluyeAlternativos = (fila) => fila.alternativos_proporcionados === true
    || (fila.alternativos_proporcionados !== false && Array.isArray(fila.alternativos))
    || [1, 2, 3, 4].some(orden => Object.prototype.hasOwnProperty.call(fila, `nro_parte_alternativo_${orden}`)
      || Object.prototype.hasOwnProperty.call(fila, `numero_parte_alternativo_${orden}`));
  const resolverFabricante = async (nombre) => {
    const nombreLimpio = normText(nombre);
    if (!nombreLimpio) return null;
    const key = normalizarTextoMatching(nombreLimpio);
    const existente = fabricantesByNombre.get(key);
    if (existente) return existente;
    const creado = await findOrCreateFabricante(empresaId, nombreLimpio, Array.from(fabricantesByNombre.values()));
    fabricantesByNombre.set(key, creado);
    return creado;
  };

  const gruposPendientes = new Map();
  filas.forEach(fila => {
    const codigo = normSegment(fila.cod_grupo);
    if (codigo && !gruposByCode.has(codigo) && !gruposPendientes.has(codigo)) {
      gruposPendientes.set(codigo, fila.grupo || `Grupo ${codigo}`);
    }
  });

  for (const [codigo, nombre] of gruposPendientes) {
    try {
      const grupo = await crearMaterialGrupo(empresaId, { codigo, nombre, estado: 'activo' });
      gruposByCode.set(codigo, grupo);
    } catch (err) {
      errores.push({ fila: `Grupo ${codigo}`, error: err.message });
    }
  }

  const familiasPendientes = new Map();
  filas.forEach(fila => {
    const grupo = gruposByCode.get(normSegment(fila.cod_grupo));
    const codigo = normSegment(fila.cod_familia);
    if (!grupo || !codigo) return;
    const key = `${grupo.id}|${codigo}`;
    if (!familiasByGroupCode.has(key) && !familiasPendientes.has(key)) {
      familiasPendientes.set(key, { grupo_id: grupo.id, codigo, nombre: fila.familia || `Familia ${codigo}` });
    }
  });

  for (const [key, familiaData] of familiasPendientes) {
    try {
      const familia = await crearMaterialFamilia(empresaId, { ...familiaData, estado: 'activo' });
      familiasByGroupCode.set(key, familia);
    } catch (err) {
      errores.push({ fila: `Familia ${familiaData.codigo}`, error: err.message });
    }
  }

  const subfamiliasPendientes = new Map();
  filas.forEach(fila => {
    const grupo = gruposByCode.get(normSegment(fila.cod_grupo));
    const familia = grupo ? familiasByGroupCode.get(`${grupo.id}|${normSegment(fila.cod_familia)}`) : null;
    const codigo = normSegment(fila.cod_subfamilia);
    if (!familia || !codigo) return;
    const key = `${familia.id}|${codigo}`;
    if (!subfamiliasByFamilyCode.has(key) && !subfamiliasPendientes.has(key)) {
      subfamiliasPendientes.set(key, { familia_id: familia.id, codigo, nombre: fila.subfamilia || `Sub ${codigo}` });
    }
  });

  for (const [key, subfamiliaData] of subfamiliasPendientes) {
    try {
      const subfamilia = await crearMaterialSubfamilia(empresaId, { ...subfamiliaData, estado: 'activo' });
      subfamiliasByFamilyCode.set(key, subfamilia);
    } catch (err) {
      errores.push({ fila: `Sub-familia ${subfamiliaData.codigo}`, error: err.message });
    }
  }

  for (const fila of filas) {
    try {
      const grupo = gruposByCode.get(normSegment(fila.cod_grupo));
      const familia = grupo ? familiasByGroupCode.get(`${grupo.id}|${normSegment(fila.cod_familia)}`) : null;
      const subfamilia = familia ? subfamiliasByFamilyCode.get(`${familia.id}|${normSegment(fila.cod_subfamilia)}`) : null;

      if (!grupo || !familia || !subfamilia) {
        errores.push({ fila: fila.descripcion || fila.codigo || 'Fila sin descripcion', error: 'No se pudo resolver grupo/familia/sub-familia.' });
        continue;
      }

      const codigo = normText(fila.codigo) || null;
      const existente = codigo ? materialesByCode.get(codigo) : null;
      const almacenId = fila.almacen ? (almacenesByName.get(keyText(fila.almacen))?.id || null) : null;
      const payload = {
        empresa_id: empresaId,
        codigo,
        descripcion: normText(fila.descripcion),
        unidad: normText(fila.unidad),
        grupo_id: grupo.id,
        familia_id: familia.id,
        subfamilia_id: subfamilia.id,
        nro_parte: fila.nro_parte || null,
        unidades_contenidas: Number(fila.unidades_contenidas) || 1,
        almacen_id: almacenId,
        ubicacion: fila.ubicacion || null,
        observacion: fila.observacion || null,
        precio_unitario: Number(fila.precio_unitario) || 0,
        estado: fila.estado || 'activo',
      };

      let materialId;
      if (existente) {
        const { data, error } = await supabase.from('materiales').update(payload).eq('id', existente.id).select('id,codigo').single();
        if (error) throw error;
        if (codigo) materialesByCode.set(codigo, data || existente);
        materialId = data?.id || existente.id;
        actualizados.push(codigo);
      } else {
        const newId = makeId('mat');
        const { data, error } = await supabase.from('materiales').insert([{ id: newId, ...payload }]).select('id,codigo').single();
        if (error) throw error;
        if (codigo) materialesByCode.set(codigo, data || { id: newId, codigo });
        materialId = data?.id || newId;
        creados.push(codigo || newId);
      }

      // Las columnas alternas son opcionales: si no existen en el archivo, no se
      // modifican equivalencias ya registradas en el material.
      if (incluyeAlternativos(fila)) {
        const alternativos = [];
        for (const row of alternativosDeFila(fila)) {
          const numero_parte = normText(row?.numero_parte);
          if (!numero_parte) continue;
          const fabricante = await resolverFabricante(row?.fabricante_nombre || row?.fabricante || '');
          alternativos.push({
            numero_parte,
            fabricante_id: fabricante?.id || null,
            notas: normText(row?.notas) || null,
            activo: row?.activo !== false,
          });
        }
        await guardarMaterialNumerosParte(empresaId, materialId, alternativos);
      }
    } catch (err) {
      errores.push({ fila: fila.descripcion || fila.codigo, error: err.message });
    }
  }

  return { creados: creados.length, actualizados: actualizados.length, errores };
};
