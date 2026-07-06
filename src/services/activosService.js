import { getSupabaseClient } from '../lib/supabaseClient.js';

const makeId = (prefix) => {
  const r = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${String(r).replace(/-/g, '').slice(0, 18)}`;
};

const pick = (src, keys) => keys.reduce((a, k) => { if (src[k] !== undefined) a[k] = src[k]; return a; }, {});

const ACTIVO_FIELDS = [
  'codigo', 'nombre', 'tipo_categoria', 'marca', 'modelo', 'placa_serie',
  'ubicacion', 'estado', 'centro_costo_id', 'responsable_id', 'responsable_nombre',
  'fecha_alta', 'valor_adquisicion', 'moneda', 'vida_util_anos',
  'documentos', 'observacion', 'compras_gasto_id',
];

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const getActivos = async (empresaId) => {
  if (!empresaId) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('activos').select('*')
    .eq('empresa_id', empresaId).order('codigo');
  if (error) { console.error('getActivos:', error); return []; }
  return data || [];
};

export const crearActivo = async (empresaId, activo, usuarioId = null) => {
  const supabase = await getSupabaseClient();
  const payload = {
    id: makeId('act'),
    empresa_id: empresaId,
    created_by: usuarioId || null,
    ...pick(activo, ACTIVO_FIELDS),
  };
  const { data, error } = await supabase.from('activos').insert([payload]).select().single();
  if (error) throw error;
  return data;
};

export const actualizarActivo = async (id, activo) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('activos')
    .update({ ...pick(activo, ACTIVO_FIELDS), updated_at: new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
};

// Baja: desactiva con motivo, nunca elimina.
export const darBajaActivo = async (id, motivo, usuarioId = null) => {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase.from('activos').update({
    estado: 'dado_baja',
    baja_motivo: motivo || 'Sin motivo indicado',
    baja_at: new Date().toISOString(),
    baja_por: usuarioId || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

// ─── Importación masiva ───────────────────────────────────────────────────────
// Columnas esperadas en la plantilla:
//   codigo, nombre, tipo_categoria, marca, modelo, placa_serie,
//   ubicacion, estado, centro_costo, responsable, fecha_alta,
//   valor_adquisicion, moneda, vida_util_anos, observacion
//
// Validaciones: codigo y nombre son obligatorios.
// centro_costo: se resuelve por codigo o nombre; si no se encuentra → error de fila.
// Sin fallbacks silenciosos: fila inválida = error reportado, no insertada.
const parseExcelDate = (val) => {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  const str = String(val).trim();
  if (/^\d+(\.\d+)?$/.test(str) && Number(str) > 10000) {
    const d = new Date((Number(str) - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  const m = str.match(/^(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})$/);
  if (m) {
    if (m[1].length === 4) {
      const d = new Date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } else if (m[3].length === 4) {
      const d = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
};

// Acepta variantes con espacios ("en mantenimiento", "dado de baja") además del valor canónico con guion bajo.
const normalizarEstadoActivo = (raw) => {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return 'operativo';
  if (s === 'operativo' || s === 'activo') return 'operativo';
  if (s.includes('mantenimiento')) return 'en_mantenimiento';
  if (s.includes('baja')) return 'dado_baja';
  return s.replace(/\s+/g, '_');
};

export const importarActivosMasivo = async (empresaId, filas) => {
  const supabase = await getSupabaseClient();
  const creados = [], actualizados = [], errores = [];

  const norm = v => String(v ?? '').trim();
  const normLow = v => norm(v).toLowerCase();

  const [cecosRes, activosRes] = await Promise.all([
    supabase.from('centros_costo').select('id,codigo,nombre').eq('empresa_id', empresaId),
    supabase.from('activos').select('id,codigo').eq('empresa_id', empresaId),
  ]);
  if (cecosRes.error) throw cecosRes.error;

  const cecosByCode = new Map((cecosRes.data || []).map(c => [normLow(c.codigo), c]));
  const cecosByName = new Map((cecosRes.data || []).map(c => [normLow(c.nombre), c]));
  const activosByCode = new Map((activosRes.data || []).filter(a => a.codigo).map(a => [norm(a.codigo), a]));

  for (const fila of filas) {
    try {
      const codigo = norm(fila.codigo);
      const nombre = norm(fila.nombre);
      if (!codigo) { errores.push({ fila: nombre || 'Fila sin código', error: 'Código es obligatorio' }); continue; }
      if (!nombre) { errores.push({ fila: codigo, error: 'Nombre es obligatorio' }); continue; }

      let centro_costo_id = null;
      const claveCeco = normLow(fila.centro_costo || '');
      if (claveCeco) {
        const cecoRow = cecosByCode.get(claveCeco) || cecosByName.get(claveCeco);
        if (!cecoRow) {
          errores.push({ fila: codigo, error: `Centro de costo "${fila.centro_costo}" no encontrado` });
          continue;
        }
        centro_costo_id = cecoRow.id;
      }

      const valorAdquisicion = Number(String(fila.valor_adquisicion ?? '').replace(/[^0-9.]/g, '')) || 0;
      const vidaUtilAnos = parseInt(fila.vida_util_anos, 10) || 0;
      const estadoRaw = norm(fila.estado);
      const estadoActivo = normalizarEstadoActivo(estadoRaw);

      const ESTADOS_VALIDOS = ['operativo', 'en_mantenimiento', 'dado_baja'];
      if (!ESTADOS_VALIDOS.includes(estadoActivo)) {
        errores.push({ fila: codigo, error: `Estado "${estadoRaw}" inválido. Use: operativo, en_mantenimiento, dado_baja` });
        continue;
      }

      const fechaAlta = parseExcelDate(fila.fecha_alta);
      if (fila.fecha_alta !== undefined && norm(fila.fecha_alta) !== '' && fechaAlta === null) {
        errores.push({ fila: codigo, error: `Fecha de alta "${fila.fecha_alta}" no es una fecha válida` });
        continue;
      }

      const payload = {
        empresa_id: empresaId,
        codigo,
        nombre,
        tipo_categoria: norm(fila.tipo_categoria) || 'equipo',
        marca: norm(fila.marca) || null,
        modelo: norm(fila.modelo) || null,
        placa_serie: norm(fila.placa_serie) || null,
        ubicacion: norm(fila.ubicacion) || null,
        estado: estadoActivo,
        centro_costo_id,
        responsable_nombre: norm(fila.responsable) || null,
        fecha_alta: fechaAlta,
        valor_adquisicion: valorAdquisicion,
        moneda: norm(fila.moneda) || 'PEN',
        vida_util_anos: vidaUtilAnos,
        documentos: '[]',
        observacion: norm(fila.observacion) || null,
      };

      const existente = activosByCode.get(codigo);
      if (existente) {
        const { error } = await supabase.from('activos')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', existente.id);
        if (error) throw error;
        actualizados.push(codigo);
      } else {
        const newId = makeId('act');
        const { error } = await supabase.from('activos').insert([{ id: newId, ...payload }]);
        if (error) throw error;
        activosByCode.set(codigo, { id: newId, codigo });
        creados.push(codigo);
      }
    } catch (err) {
      errores.push({ fila: String(fila.codigo || fila.nombre || 'Fila'), error: err.message });
    }
  }

  return { creados: creados.length, actualizados: actualizados.length, errores };
};
