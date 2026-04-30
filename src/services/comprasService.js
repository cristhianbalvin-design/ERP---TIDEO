import { getSupabaseClient } from '../lib/supabaseClient.js';

const materialCode = (descripcion = '') => {
  const base = String(descripcion || 'material')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
    .slice(0, 18);
  return `MAT-${base || Date.now()}`;
};

export const comprasService = {

  // ─── Proveedores ──────────────────────────────────────────────
  getProveedores: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('proveedores').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching proveedores:', error); return []; }
    return data;
  },
  crearProveedor: async (empresaId, proveedor) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('proveedores').insert([{ ...proveedor, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarProveedor: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('proveedores').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  getEvaluacionesProveedor: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('evaluaciones_proveedor')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });
    if (error) { console.error('Error fetching evaluaciones proveedor:', error); return []; }
    return data;
  },
  registrarEvaluacionProveedor: async (empresaId, evaluacion) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('evaluaciones_proveedor')
      .insert([{ ...evaluacion, empresa_id: empresaId }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ─── SOLPE ────────────────────────────────────────────────────
  getSolpes: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('solpe_interna').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching solpes:', error); return []; }
    return data;
  },
  crearSolpe: async (empresaId, solpe) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('solpe_interna').insert([{ ...solpe, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  aprobarSolpe: async (id, aprobador_id) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('solpe_interna')
      .update({ estado: 'aprobada', aprobada_por: aprobador_id, aprobada_at: new Date().toISOString() })
      .eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ─── Procesos de Compra ───────────────────────────────────────
  getProcesosCompra: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('procesos_compra').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching procesos compra:', error); return []; }
    return data;
  },
  crearProcesoCompra: async (empresaId, proceso) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('procesos_compra').insert([{ ...proceso, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarProcesoCompra: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('procesos_compra').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ─── Órdenes de Compra ────────────────────────────────────────
  getOrdenesCompra: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_compra').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching ordenes compra:', error); return []; }
    return data;
  },
  crearOrdenCompra: async (empresaId, oc) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_compra').insert([{ ...oc, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarOrdenCompra: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_compra').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ─── Órdenes de Servicio (OSI) ────────────────────────────────
  getOrdenesServicio: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_servicio_interna').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching ordenes servicio:', error); return []; }
    return data;
  },
  crearOrdenServicio: async (empresaId, os) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_servicio_interna').insert([{ ...os, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },
  actualizarOrdenServicio: async (id, cambios) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('ordenes_servicio_interna').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ─── Recepciones ─────────────────────────────────────────────
  getRecepciones: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('recepciones').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false });
    if (error) { console.error('Error fetching recepciones:', error); return []; }
    return data;
  },
  crearRecepcion: async (empresaId, recepcion) => {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('recepciones').insert([{ ...recepcion, empresa_id: empresaId }]).select().single();
    if (error) throw error;
    return data;
  },

  getInventario: async (empresaId) => {
    if (!empresaId) return [];
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('stock')
      .select(`*, materiales(id, codigo, descripcion, unidad, familia, costo_promedio), almacenes(id, codigo, nombre)`)
      .eq('empresa_id', empresaId)
      .order('updated_at', { ascending: false });
    if (error) { console.error('Error fetching inventario:', error); return []; }
    return (data || []).map(row => ({
      id: row.id,
      material_id: row.material_id,
      almacen_id: row.almacen_id,
      sku: row.materiales?.codigo || row.material_id,
      nombre: row.materiales?.descripcion || row.material_id,
      categoria: row.materiales?.familia || 'Compras',
      unidad: row.materiales?.unidad || 'und',
      stock_actual: Number(row.disponible || 0),
      reservado: Number(row.reservado || 0),
      costo_promedio: Number(row.materiales?.costo_promedio || 0),
      almacen: row.almacenes?.nombre || row.almacenes?.codigo || row.almacen_id
    }));
  },

  registrarEntradaInventario: async (empresaId, item, referencia) => {
    const supabase = await getSupabaseClient();
    const almacenCodigo = item.almacen_codigo || 'ALM-001';
    const { data: almacenExistente } = await supabase
      .from('almacenes')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('codigo', almacenCodigo)
      .maybeSingle();

    let almacen = almacenExistente;
    if (!almacen) {
      const { data, error } = await supabase
        .from('almacenes')
        .insert({
          id: `alm_${Date.now()}`,
          empresa_id: empresaId,
          codigo: almacenCodigo,
          nombre: 'Almacen principal',
          estado: 'activo'
        })
        .select()
        .single();
      if (error) throw error;
      almacen = data;
    }

    const codigo = item.codigo || item.sku || materialCode(item.descripcion);
    const { data: materialExistente } = await supabase
      .from('materiales')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('codigo', codigo)
      .maybeSingle();

    let material = materialExistente;
    if (!material) {
      const { data, error } = await supabase
        .from('materiales')
        .insert({
          id: `mat_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          empresa_id: empresaId,
          codigo,
          descripcion: item.descripcion,
          unidad: item.unidad || 'und',
          familia: item.familia || 'Compras',
          costo_promedio: Number(item.costo_unitario || item.precio_unitario || 0),
          moneda: item.moneda || 'PEN',
          estado: 'activo'
        })
        .select()
        .single();
      if (error) throw error;
      material = data;
    }

    await supabase.from('kardex').insert({
      id: `kdx_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      empresa_id: empresaId,
      material_id: material.id,
      almacen_id: almacen.id,
      tipo: 'entrada',
      cantidad: Number(item.cantidad || item.recibido || 0),
      costo_unitario: Number(item.costo_unitario || item.precio_unitario || material.costo_promedio || 0),
      moneda: item.moneda || 'PEN',
      referencia_tipo: referencia?.tipo || 'recepcion',
      referencia_id: referencia?.id || null,
      observacion: referencia?.observacion || `Entrada por ${referencia?.tipo || 'recepcion'}`
    });

    const { data: stockExistente } = await supabase
      .from('stock')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('material_id', material.id)
      .eq('almacen_id', almacen.id)
      .is('lote', null)
      .is('serie', null)
      .maybeSingle();

    if (stockExistente) {
      const disponible = Number(stockExistente.disponible || 0) + Number(item.cantidad || item.recibido || 0);
      const { data, error } = await supabase
        .from('stock')
        .update({ disponible, updated_at: new Date().toISOString() })
        .eq('id', stockExistente.id)
        .select()
        .single();
      if (error) throw error;
      return { material, almacen, stock: data };
    }

    const { data: stock, error: stockError } = await supabase
      .from('stock')
      .insert({
        empresa_id: empresaId,
        material_id: material.id,
        almacen_id: almacen.id,
        disponible: Number(item.cantidad || item.recibido || 0),
        reservado: 0
      })
      .select()
      .single();
    if (stockError) throw stockError;
    return { material, almacen, stock };
  },

};
