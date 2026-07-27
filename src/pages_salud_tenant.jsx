import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from './context.jsx';
import { getSupabaseClient } from './lib/supabaseClient.js';

export function SaludImplementacionTenant() {
  const { role, empresaSeleccionada } = useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [configuraciones, setConfiguraciones] = useState([]);
  const [conteos, setConteos] = useState({});
  const [anotaciones, setAnotaciones] = useState({});
  const [filtroSeccion, setFiltroSeccion] = useState('Todas');
  
  useEffect(() => {
    if (!role?.es_admin_empresa) {
      setError('Acceso denegado. Solo Administrador de Empresa.');
      setLoading(false);
      return;
    }
    cargarDatos();
  }, [role, empresaSeleccionada]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const supabase = await getSupabaseClient();

      // 1. Configuraciones
      const { data: configs, error: errCfg } = await supabase
        .from('tideo_salud_configuracion')
        .select('*')
        .eq('activa', true)
        .order('seccion', { ascending: true })
        .order('pantalla', { ascending: true });
        
      if (errCfg) throw errCfg;
      setConfiguraciones(configs || []);

      if (configs?.length > 0 && empresaSeleccionada?.id) {
        // 2. RPC Local
        const { data: counts, error: errCount } = await supabase
          .rpc('get_salud_implementacion_conteos_local', { p_tenant_id: empresaSeleccionada.id });
          
        if (errCount) console.warn("Error en conteos RPC:", errCount);
        
        const countMap = {};
        if (counts) {
          counts.forEach(c => { countMap[c.configuracion_id] = c.conteo; });
        }
        setConteos(countMap);
      }

      // 3. Anotaciones de mi empresa
      if (empresaSeleccionada?.id) {
        const { data: anots, error: errAnot } = await supabase
          .from('tideo_salud_anotaciones')
          .select('*')
          .eq('empresa_id', empresaSeleccionada.id);
          
        if (errAnot) throw errAnot;
        
        const anotMap = {};
        if (anots) {
          anots.forEach(a => { anotMap[a.configuracion_id] = a; });
        }
        setAnotaciones(anotMap);
      }
    } catch (e) {
      console.error(e);
      setError('Error al cargar datos: ' + (e.message || String(e)));
    } finally {
      setLoading(false);
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

  if (!role?.es_admin_empresa) return <div style={{padding:40}}>Acceso denegado</div>;
  if (loading) return <div style={{padding:40}}>Cargando progreso de implementación...</div>;

  return (
    <div className="card" style={{margin:24}}>
      <div className="card-header" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <h2 className="card-title" style={{fontSize:18, fontWeight:700}}>Progreso de Implementación</h2>
          <p className="text-muted" style={{fontSize:13, marginTop:4}}>Estado de carga de datos iniciales en {empresaSeleccionada?.nombre_comercial || 'este entorno'}.</p>
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
          <button className="btn btn-secondary" onClick={cargarDatos}>Actualizar</button>
        </div>
      </div>
      
      <div className="table-responsive" style={{maxHeight:'calc(100vh - 180px)', overflow:'auto'}}>
        <table className="table" style={{whiteSpace:'nowrap', fontSize:12}}>
          <thead style={{position:'sticky', top:0, zIndex:10, background:'var(--bg)', boxShadow:'0 1px 0 var(--border)'}}>
            <tr>
              <th style={{width: 250}}>Módulo / Pantalla</th>
              <th style={{width: 100, textAlign:'center'}}>Registros</th>
              <th style={{width: 150}}>Responsable Asignado</th>
              <th>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map(cfg => {
              const count = conteos[cfg.id] || 0;
              const anot = anotaciones[cfg.id] || {};
              // Si está marcado como solo interno y por el RLS se ocultó, anot estará vacio.
              return (
                <tr key={cfg.id} className="hover-row">
                  <td>
                    <div style={{fontWeight:600}}>{cfg.seccion}</div>
                    <div className="text-muted">{cfg.pantalla}</div>
                  </td>
                  <td style={{textAlign:'center'}}>
                    <span className={`badge ${count > 0 ? 'badge-green' : 'badge-gray'}`} style={{minWidth:40, textAlign:'center'}}>
                      {count > 0 ? count : '0'}
                    </span>
                  </td>
                  <td>
                     {anot.responsable ? <span className="badge badge-blue">{anot.responsable}</span> : <span className="text-muted">Pendiente</span>}
                  </td>
                  <td style={{whiteSpace:'normal'}}>
                     {anot.observacion || <span className="text-muted">-</span>}
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted" style={{padding:40}}>
                  No hay pantallas configuradas en esta sección
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
