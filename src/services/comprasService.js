import { getSupabaseClient } from '../lib/supabaseClient.js';
import { registrarEntradaDesdeRecepcion, getStockCompleto } from './inventarioService.js';

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
    return getStockCompleto(empresaId);
  },

  // Delega al motor WMS. Mantiene la firma para compatibilidad con context.jsx.
  registrarEntradaInventario: async (empresaId, item, referencia, usuarioId) => {
    return registrarEntradaDesdeRecepcion(empresaId, item, referencia, usuarioId);
  },

};
