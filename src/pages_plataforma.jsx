import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from './context.jsx';
import { getSupabaseClient } from './lib/supabaseClient.js';
import { I } from './icons.jsx';

export function SaludImplementacion() {
  const { isSuperadmin } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Datos
  const [configuraciones, setConfiguraciones] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [conteos, setConteos] = useState({}); // { [configId_tenantId]: count }
  const [anotaciones, setAnotaciones] = useState({}); // { [configId_tenantId]: anotacion_object }
  
  // Filtros
  const [filtroSeccion, setFiltroSeccion] = useState('Todas');

  useEffect(() => {
    if (!isSuperadmin) {
      setError('Acceso denegado. Solo Superadmin.');
      setLoading(false);
      return;
    }
    cargarDatos();
  }, [isSuperadmin]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const supabase = await getSupabaseClient();

      // 1. Obtener configuraciones
      const { data: configs, error: errCfg } = await supabase
        .from('tideo_salud_configuracion')
        .select('*')
        .eq('activa', true)
        .order('seccion', { ascending: true })
        .order('pantalla', { ascending: true });
        
      if (errCfg) throw errCfg;
      setConfiguraciones(configs || []);

      // 2. Obtener tenants (empresas que no son plataforma)
      const { data: tnts, error: errTnt } = await supabase
        .from('empresas')
        .select('id, nombre_comercial, razon_social')
        .eq('es_plataforma', false)
        .eq('estado', 'activo')
        .order('nombre_comercial', { ascending: true });
        
      if (errTnt) throw errTnt;
      setTenants(tnts || []);

      const tenantIds = tnts?.map(t => t.id) || [];

      // 3. Obtener conteos vía RPC
      if (tenantIds.length > 0 && configs.length > 0) {
        const { data: counts, error: errCount } = await supabase
          .rpc('get_salud_implementacion_conteos', { p_tenant_ids: tenantIds });
          
        if (errCount) throw errCount;
        
        const countMap = {};
        if (counts) {
          counts.forEach(c => {
            countMap[`${c.configuracion_id}_${c.tenant_id}`] = c.conteo;
          });
        }
        setConteos(countMap);
      }

      // 4. Obtener anotaciones
      const { data: anots, error: errAnot } = await supabase
        .from('tideo_salud_anotaciones')
        .select('*');
        
      if (errAnot) throw errAnot;
      
      const anotMap = {};
      if (anots) {
        anots.forEach(a => {
          anotMap[`${a.configuracion_id}_${a.empresa_id}`] = a;
        });
      }
      setAnotaciones(anotMap);

    } catch (e) {
      console.error(e);
      setError('Error al cargar datos: ' + (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const guardarAnotacion = async (configId, tenantId, campo, valor) => {
    try {
      const supabase = await getSupabaseClient();
      const key = `${configId}_${tenantId}`;
      const existing = anotaciones[key];
      const payload = {
        configuracion_id: configId,
        empresa_id: tenantId,
        [campo]: valor
      };

      let resp;
      if (existing?.id) {
        resp = await supabase
          .from('tideo_salud_anotaciones')
          .update({ [campo]: valor, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single();
      } else {
        resp = await supabase
          .from('tideo_salud_anotaciones')
          .insert([payload])
          .select()
          .single();
      }

      if (resp.error) throw resp.error;

      setAnotaciones(prev => ({
        ...prev,
        [key]: resp.data
      }));
    } catch (err) {
      console.error('Error guardando anotacion:', err);
      alert('Error guardando: ' + (err.message || ''));
    }
  };

  const secciones = useMemo(() => {
    const s = new Set(configuraciones.map(c => c.seccion));
    return ['Todas', ...Array.from(s).sort()];
  }, [configuraciones]);

  const filtradas = useMemo(() => {
    if (filtroSeccion === 'Todas') return configuraciones;
    return configuraciones.filter(c => c.seccion === filtroSeccion);
  }, [configuraciones, filtroSeccion]);

  if (!isSuperadmin) return <div style={{padding:40}}>Acceso denegado</div>;
  if (loading) return <div style={{padding:40}}>Cargando auditoría de salud...</div>;

  return (
    <div className="card" style={{margin:24}}>
      <div className="card-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <h2 className="card-title" style={{fontSize:18, fontWeight:700}}>Salud de Implementación</h2>
          <p className="text-muted" style={{fontSize:13, marginTop:4}}>Auditoría en vivo de datos cargados por tenant y pantalla.</p>
        </div>
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <select 
            className="input" 
            style={{width:200}} 
            value={filtroSeccion} 
            onChange={e => setFiltroSeccion(e.target.value)}
          >
            {secciones.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={cargarDatos}>{I.refresh}</button>
        </div>
      </div>
      
      <div className="table-responsive" style={{maxHeight:'calc(100vh - 180px)', overflow:'auto'}}>
        <table className="table" style={{whiteSpace:'nowrap', fontSize:12}}>
          <thead style={{position:'sticky', top:0, zIndex:10, background:'var(--bg)', boxShadow:'0 1px 0 var(--border)'}}>
            <tr>
              <th style={{minWidth:200, position:'sticky', left:0, zIndex:11, background:'var(--bg)', boxShadow:'inset -1px 0 0 var(--border)'}}>
                Módulo / Pantalla
              </th>
              {tenants.map(t => (
                <th key={t.id} style={{minWidth:260}}>
                  {t.nombre_comercial || t.razon_social}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map(cfg => (
              <tr key={cfg.id} className="hover-row">
                <td style={{position:'sticky', left:0, zIndex:2, background:'var(--bg)', boxShadow:'inset -1px 0 0 var(--border)'}}>
                  <div style={{fontWeight:600}}>{cfg.seccion}</div>
                  <div className="text-muted">{cfg.pantalla}</div>
                  <div style={{fontSize:10, color:'var(--cyan)', marginTop:2}} title={cfg.evidencia}>
                    {cfg.tabla_principal}
                  </div>
                </td>
                
                {tenants.map(t => {
                  const key = `${cfg.id}_${t.id}`;
                  const count = conteos[key] || 0;
                  const anotacion = anotaciones[key] || {};
                  
                  return (
                    <td key={t.id} style={{verticalAlign:'top'}}>
                      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                        <span className={`badge ${count > 0 ? 'badge-green' : 'badge-gray'}`} style={{minWidth:40, textAlign:'center'}}>
                          {count > 0 ? count : '0'}
                        </span>
                        <select 
                          className="input" 
                          style={{height:24, padding:'0 6px', fontSize:11, width:90}}
                          value={anotacion.responsable || ''}
                          onChange={e => guardarAnotacion(cfg.id, t.id, 'responsable', e.target.value)}
                        >
                          <option value="">(Sin asig)</option>
                          <option value="TIDEO">TIDEO</option>
                          <option value="Cliente">Cliente</option>
                          <option value="Ambos">Ambos</option>
                          <option value="N/A">N/A</option>
                        </select>
                      </div>
                      <div style={{display:'flex', alignItems:'center', gap:8, marginTop:4}}>
                        <input 
                          className="input" 
                          type="text" 
                          placeholder="Observación..."
                          style={{flex:1, fontSize:11, height:26}}
                          defaultValue={anotacion.observacion || ''}
                          onBlur={e => {
                            if (e.target.value !== (anotacion.observacion || '')) {
                              guardarAnotacion(cfg.id, t.id, 'observacion', e.target.value);
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') e.target.blur();
                          }}
                        />
                        <label style={{display:'flex', alignItems:'center', gap:4, fontSize:10, cursor:'pointer', color:'var(--text-muted)'}} title="Ocultar esta observación en la vista del Tenant">
                          <input 
                            type="checkbox" 
                            checked={anotacion.solo_interno || false}
                            onChange={e => guardarAnotacion(cfg.id, t.id, 'solo_interno', e.target.checked)}
                          />
                          Interno
                        </label>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={tenants.length + 1} className="text-center text-muted" style={{padding:40}}>
                  No hay configuraciones para mostrar
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
