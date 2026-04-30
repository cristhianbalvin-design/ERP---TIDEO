import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I, money, moneyD } from './icons.jsx';
import { MOCK } from './data.js';
import { useApp } from './context.jsx';

// Cotizaciones + Valorización + Inventario - high-value stub replacements

// ============ COTIZACIONES ============
function CotizacionesInner() {
  const { cotizaciones, oportunidades, cuentas, activeParams, navigate, crearCotizacion, actualizarCotizacion, aprobarCotizacion, crearOSCliente, searchQuery } = useApp();
  const [osModal, setOsModal] = useState(null);

  const getCuentaNombre = (cuentaId) => {
    const cuenta = cuentas.find(c => c.id === cuentaId);
    return cuenta?.razon_social || cuenta?.nombre_comercial || cuentaId || 'N/A';
  };
  const getOpp = (oppId) => oportunidades.find(o => o.id === oppId);
  const badge = e => e==='ganada'||e==='aprobada'?'badge-green':e==='perdida'?'badge-red':e==='negociacion'?'badge-orange':e==='enviada'?'badge-cyan':'badge-gray';

  // Si estamos creando una nueva
  if (activeParams?.active_tab === 'nueva' && activeParams?.opp) {
    const opp = getOpp(activeParams.opp);
    if (!opp) return <div className="p-4">Oportunidad no encontrada</div>;
    return <EditorCotizacion opp={opp} getCuentaNombre={getCuentaNombre} onSave={async (data) => { await crearCotizacion(data); navigate('cotizaciones'); }} onCancel={() => navigate('pipeline', { panel: opp.id })} />;
  }

  // Si estamos viendo el detalle
  if (activeParams?.detail) {
    const cot = cotizaciones.find(c => c.id === activeParams.detail);
    if (!cot) return <div className="p-4">Cotización no encontrada</div>;
    const opp = getOpp(cot.oportunidad_id);
    const partidas = cot.items || cot.partidas || [];
    return (
      <>
        <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
          <div>
            <button className="btn btn-ghost" onClick={() => navigate('cotizaciones')} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a lista</button>
            <h1 className="page-title">{cot.numero}</h1>
            <div className="page-sub">Oportunidad: {opp?.nombre || 'Sin oportunidad'} · Cliente: {getCuentaNombre(cot.cuenta_id || opp?.cuenta_id)}</div>
          </div>
          <div className="row">
            {cot.estado === 'borrador' && (
              <button className="btn btn-primary" onClick={() => actualizarCotizacion(cot.id, { estado: 'enviada' })}>
                {I.send} Enviar a cliente
              </button>
            )}
            {cot.estado === 'enviada' && (
              <button className="btn btn-primary" onClick={() => { aprobarCotizacion(cot.id); setOsModal(cot); }}>
                {I.check} Aprobar y generar OS
              </button>
            )}
            {cot.estado === 'aprobada' && (
              <button className="btn btn-primary" onClick={() => setOsModal(cot)}>
                {I.clipboard} Generar OS
              </button>
            )}
            <button className="btn btn-secondary">{I.download} Descargar PDF</button>
          </div>
        </div>
        
        <div className="card mt-6">
          <div className="card-body">
            <div className="grid-4" style={{marginBottom:32}}>
              <div><div className="eyebrow">Estado</div><div><span className={'badge '+badge(cot.estado)} style={{marginTop:4}}>{cot.estado.replace('_', ' ')}</span></div></div>
              <div><div className="eyebrow">Fecha Emisión</div><div style={{fontWeight:600, marginTop:4}}>{cot.fecha}</div></div>
              <div><div className="eyebrow">Validez</div><div style={{fontWeight:600, marginTop:4}}>{cot.validez}</div></div>
              <div><div className="eyebrow">Monto Total</div><div style={{fontWeight:700, fontSize:18, fontFamily:'Sora', color:'var(--fg)', marginTop:4}}>{money(cot.total)}</div></div>
            </div>

            <h3 style={{marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:8}}>Partidas</h3>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Descripción</th><th>Categoría</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th></tr></thead>
                <tbody>
                  {partidas.map((p, i) => {
                    const cantidad = Number(p.cantidad || 0);
                    const precioUnitario = Number(p.precio_unitario ?? p.costo_unitario ?? 0);
                    const subtotal = Number(p.subtotal ?? (cantidad * precioUnitario));
                    return (
                      <tr key={i}>
                        <td>{p.descripcion || p.servicio || 'Partida sin descripcion'}</td>
                        <td><span className={`badge ${p.tipo==='servicio'?'badge-cyan':p.tipo==='material'?'badge-purple':'badge-orange'}`}>{p.tipo || 'Servicio'}</span></td>
                        <td className="num">{cantidad}</td>
                        <td className="num">{money(precioUnitario)}</td>
                        <td className="num" style={{fontWeight:600}}>{money(subtotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <div style={{marginTop:24, padding:16, background:'var(--bg-subtle)', borderRadius:8, width:300, marginLeft:'auto'}}>
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}><span className="text-muted">Subtotal</span><span className="num">{money(cot.subtotal)}</span></div>
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}><span className="text-muted">IGV (18%)</span><span className="num">{money(cot.igv)}</span></div>
              <div className="row" style={{justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)', fontWeight:700, fontSize:16, fontFamily:'Sora'}}><span>Total</span><span className="num">{money(cot.total)}</span></div>
            </div>
          </div>
        </div>
        {osModal && (
          <GenerarOSModal
            cot={osModal}
            onClose={() => setOsModal(null)}
            onConfirm={async (datos) => {
              await crearOSCliente(osModal.id, datos);
              setOsModal(null);
            }}
          />
        )}
      </>
    );
  }

  const query = searchQuery.toLowerCase();
  const filteredCotizaciones = cotizaciones.filter(c => {
    const opp = getOpp(c.oportunidad_id);
    const cliente = getCuentaNombre(c.cuenta_id || opp?.cuenta_id);
    return !query ||
      c.numero.toLowerCase().includes(query) ||
      cliente.toLowerCase().includes(query) ||
      (opp?.nombre || '').toLowerCase().includes(query);
  });

  // Vista de Lista
  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Cotizaciones</h1><div className="page-sub">{cotizaciones.length} cotizaciones registradas</div></div>
        <div className="row"><button className="btn btn-secondary">{I.filter} Filtrar</button></div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Número</th><th>Cliente</th><th>Oportunidad</th><th>Monto Total</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>{filteredCotizaciones.map(r => {
              const opp = getOpp(r.oportunidad_id);
              const cliente = getCuentaNombre(r.cuenta_id || opp?.cuenta_id);
              return (
              <tr key={r.id} onClick={()=>navigate('cotizaciones', { detail: r.id })} className="hover-row" style={{cursor:'pointer'}}>
                <td className="mono" style={{fontWeight:600}}>{r.numero}</td>
                <td><strong>{cliente}</strong></td>
                <td>{opp?.nombre}</td>
                <td className="num"><strong>{money(r.total)}</strong></td>
                <td className="text-muted">{r.fecha}</td>
                <td><span className={'badge '+badge(r.estado)}>{r.estado?.replace('_',' ')}</span></td>
              </tr>
            )})}
            {filteredCotizaciones.length === 0 && <tr><td colSpan="6" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>{query ? 'No se encontraron resultados para "'+query+'"' : 'No hay cotizaciones registradas.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function GenerarOSModal({ cot, onClose, onConfirm }) {
  const today = new Date().toISOString().split('T')[0];
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const defaultEnd = nextMonth.toISOString().split('T')[0];
  const [form, setForm] = useState({
    numero_doc_cliente: '',
    condicion_pago: cot.condicion_pago || '30 dias',
    fecha_inicio: today,
    fecha_fin: defaultEnd,
    sla: 'estandar',
  });

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{maxWidth:520}}>
        <div className="modal-head">
          <h2>Generar OS Cliente</h2>
          <button className="icon-btn" onClick={onClose}>{I.x}</button>
        </div>
        <form className="modal-body col" style={{gap:16}} onSubmit={(event) => {
          event.preventDefault();
          onConfirm(form);
        }}>
          <div style={{padding:'10px 14px', background:'var(--bg-subtle)', borderRadius:8, border:'1px solid var(--border)', fontSize:13}}>
            <div className="eyebrow">Cotizacion aprobada</div>
            <strong>{cot.numero}</strong> · {money(cot.total)}
          </div>
          <div className="input-group">
            <label>OC / pedido cliente</label>
            <input className="input" value={form.numero_doc_cliente} onChange={e => update('numero_doc_cliente', e.target.value)} placeholder="Ej. OC-2026-001" />
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Fecha inicio</label>
              <input className="input" type="date" value={form.fecha_inicio} onChange={e => update('fecha_inicio', e.target.value)} required />
            </div>
            <div className="input-group">
              <label>Fecha fin</label>
              <input className="input" type="date" value={form.fecha_fin} onChange={e => update('fecha_fin', e.target.value)} required />
            </div>
          </div>
          <div className="grid-2">
            <div className="input-group">
              <label>Condicion de pago</label>
              <input className="input" value={form.condicion_pago} onChange={e => update('condicion_pago', e.target.value)} />
            </div>
            <div className="input-group">
              <label>SLA</label>
              <select className="select" value={form.sla} onChange={e => update('sla', e.target.value)}>
                <option value="estandar">Estandar</option>
                <option value="estricto">Estricto</option>
                <option value="critico">Critico</option>
              </select>
            </div>
          </div>
          <div className="modal-foot mt-4">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary">{I.check} Crear OS</button>
          </div>
        </form>
      </div>
    </div>
  );
}

class CotizacionesErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8">
          <h3 className="text-danger">Crash en Cotizaciones</h3>
          <pre>{this.state.error?.stack || this.state.error?.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function Cotizaciones() {
  return (
    <CotizacionesErrorBoundary>
      <CotizacionesInner />
    </CotizacionesErrorBoundary>
  );
}

// Subcomponente Editor Cotización
function EditorCotizacion({ opp, getCuentaNombre, onSave, onCancel }) {
  const montoInicial = Number(opp.monto_estimado || 0);
  const [partidas, setPartidas] = useState([
    { id: 1, descripcion: 'Servicio de consultoría', tipo: 'servicio', cantidad: 1, precio_unitario: 5000 }
  ]);
  const [validez, setValidez] = useState('15 días');

  useEffect(() => {
    setPartidas(prev => prev.map((p, index) => (
      index === 0 && Number(p.precio_unitario) === 5000
        ? {
            ...p,
            descripcion: opp.servicio_interes || opp.nombre || 'Servicio cotizado',
            precio_unitario: montoInicial
          }
        : p
    )));
  }, [montoInicial, opp.nombre, opp.servicio_interes]);

  const subtotal = partidas.reduce((acc, p) => acc + (p.cantidad * p.precio_unitario), 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  const addPartida = () => {
    setPartidas([...partidas, { id: Date.now(), descripcion: '', tipo: 'servicio', cantidad: 1, precio_unitario: 0 }]);
  };

  const updatePartida = (id, field, value) => {
    setPartidas(partidas.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const removePartida = (id) => {
    setPartidas(partidas.filter(p => p.id !== id));
  };

  const handleSave = () => {
    const items = partidas.map(p => ({
      descripcion: p.descripcion,
      tipo: p.tipo,
      cantidad: Number(p.cantidad),
      precio_unitario: Number(p.precio_unitario)
    }));

    onSave({
      oportunidad_id: opp.id,
      cuenta_id: opp.cuenta_id,
      moneda: opp.moneda || 'PEN',
      validez,
      subtotal,
      base_imponible: subtotal,
      igv,
      total,
      items,
      partidas: items
    });
  };

  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={onCancel} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a oportunidad</button>
          <h1 className="page-title">Nueva Cotización</h1>
          <div className="page-sub">Oportunidad: {opp.nombre} · Cliente: <strong style={{color:'var(--fg)'}}>{getCuentaNombre(opp.cuenta_id)}</strong></div>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>{I.save} Guardar Cotización</button>
        </div>
      </div>

      <div className="card mt-6">
        <div className="card-body">
          <div className="grid-2" style={{marginBottom:32}}>
            <div className="input-group">
              <label>Validez de la oferta</label>
              <select className="select" value={validez} onChange={e => setValidez(e.target.value)}>
                <option>7 días</option>
                <option>15 días</option>
                <option>30 días</option>
              </select>
            </div>
          </div>

          <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>
            <h3>Partidas</h3>
            <button className="btn btn-secondary btn-sm" onClick={addPartida}>{I.plus} Agregar línea</button>
          </div>
          
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Descripción</th><th>Tipo</th><th style={{width:100}}>Cant.</th><th style={{width:120}}>P. Unitario</th><th style={{width:120}}>Subtotal</th><th style={{width:40}}></th></tr></thead>
              <tbody>
                {partidas.map(p => (
                  <tr key={p.id}>
                    <td><input type="text" className="input" placeholder="Descripción" value={p.descripcion} onChange={e => updatePartida(p.id, 'descripcion', e.target.value)} /></td>
                    <td>
                      <select className="select" value={p.tipo} onChange={e => updatePartida(p.id, 'tipo', e.target.value)}>
                        <option value="servicio">Servicio</option>
                        <option value="material">Material</option>
                        <option value="licencia">Licencia</option>
                      </select>
                    </td>
                    <td><input type="number" className="input num" min="1" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', e.target.value)} /></td>
                    <td><input type="number" className="input num" min="0" value={p.precio_unitario} onChange={e => updatePartida(p.id, 'precio_unitario', e.target.value)} /></td>
                    <td className="num" style={{fontWeight:600, paddingRight:16}}>{money(p.cantidad * p.precio_unitario)}</td>
                    <td><button className="icon-btn text-danger" onClick={() => removePartida(p.id)}>{I.x}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{marginTop:24, padding:16, background:'var(--bg-subtle)', borderRadius:8, width:300, marginLeft:'auto'}}>
            <div className="row" style={{justifyContent:'space-between', marginBottom:8}}><span className="text-muted">Subtotal</span><span className="num">{money(subtotal)}</span></div>
            <div className="row" style={{justifyContent:'space-between', marginBottom:8}}><span className="text-muted">IGV (18%)</span><span className="num">{money(igv)}</span></div>
            <div className="row" style={{justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)', fontWeight:700, fontSize:16, fontFamily:'Sora'}}><span>Total</span><span className="num">{money(total)}</span></div>
          </div>
        </div>
      </div>
    </>
  );
}

function Valorizacion({ role }) {
  const { valorizaciones, osClientes, generarValorizacion, ots, searchQuery } = useApp();
  const canCost = role.permisos.ver_costos || role.permisos.todo;
  const [editing, setEditing] = useState(false);

  // Editor states
  const [selOs, setSelOs] = useState('');
  const [partidas, setPartidas] = useState([{ id: 1, descripcion: 'Avance de obra', cantidad: 1, precio_unitario: 0 }]);
  const [periodo, setPeriodo] = useState('Mes actual');

  const addPartida = () => setPartidas(prev => [...prev, { id: Date.now(), descripcion: '', cantidad: 1, precio_unitario: 0 }]);
  const removePartida = (id) => setPartidas(prev => prev.filter(p => p.id !== id));
  const updatePartida = (id, field, value) => {
    setPartidas(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const subtotal = partidas.reduce((acc, p) => acc + (p.cantidad * p.precio_unitario), 0);
  const igv = subtotal * 0.18;
  const total = subtotal + igv;

  const otsValorizables = selOs ? ots.filter(ot => ot.os_cliente_id === selOs && ot.estado === 'cerrada') : [];

  const handleSave = () => {
    if (!selOs) {
      alert('Debe seleccionar una OS Cliente válida.');
      return;
    }
    generarValorizacion(selOs, subtotal, igv, total, periodo, {
      otIds: otsValorizables.map(ot => ot.id),
      items: partidas.map(p => ({
        ot_id: p.ot_id || null,
        descripcion: p.descripcion,
        cantidad: Number(p.cantidad || 0),
        precio_unitario: Number(p.precio_unitario || 0)
      }))
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <>
        <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
          <div>
            <button className="btn btn-ghost" onClick={()=>setEditing(false)} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a Valorizaciones</button>
            <h1 className="page-title">Generar Valorización</h1>
            <div className="page-sub">Cálculo de avance y pre-factura</div>
          </div>
          <div className="row">
            <button className="btn btn-secondary" onClick={()=>setEditing(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave}>{I.save} Aprobar Valorización</button>
          </div>
        </div>

        <div className="card mt-6">
          <div className="card-body">
            <div className="grid-2" style={{marginBottom:32}}>
              <div className="input-group">
                <label>OS Cliente Asociada</label>
                <select className="select" value={selOs} onChange={e => setSelOs(e.target.value)}>
                  <option value="">Seleccione OS Cliente...</option>
                  {osClientes.map(os => (
                    <option key={os.id} value={os.id}>{os.numero} - Saldo: {money(os.saldo_por_valorizar)}</option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label>Período de Ejecución</label>
                <input type="text" className="input" value={periodo} onChange={e=>setPeriodo(e.target.value)} placeholder="Ej. Enero 2025" />
              </div>
            </div>

            {selOs && (
              <div className="card" style={{padding:14, marginBottom:20, borderLeft:'3px solid var(--cyan)'}}>
                <strong>{otsValorizables.length}</strong> OT cerradas pendientes de valorizar para esta OS.
                {otsValorizables.length === 0 && <span className="text-muted"> Se usara el saldo pendiente de la OS como referencia manual.</span>}
              </div>
            )}

            <div className="row" style={{justifyContent:'space-between', alignItems:'center', marginBottom:16, paddingBottom:8, borderBottom:'1px solid var(--border)'}}>
              <h3>Partidas a Valorizar</h3>
              <button className="btn btn-secondary btn-sm" onClick={addPartida}>{I.plus} Agregar línea</button>
            </div>
            
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Descripción</th><th style={{width:100}}>Cant.</th><th style={{width:120}}>P. Unitario</th><th style={{width:120}}>Subtotal</th><th style={{width:40}}></th></tr></thead>
                <tbody>
                  {partidas.map(p => (
                    <tr key={p.id}>
                      <td><input type="text" className="input" placeholder="Descripción de avance" value={p.descripcion} onChange={e => updatePartida(p.id, 'descripcion', e.target.value)} /></td>
                      <td><input type="number" className="input num" min="1" value={p.cantidad} onChange={e => updatePartida(p.id, 'cantidad', e.target.value)} /></td>
                      <td><input type="number" className="input num" min="0" value={p.precio_unitario} onChange={e => updatePartida(p.id, 'precio_unitario', e.target.value)} /></td>
                      <td className="num" style={{fontWeight:600, paddingRight:16}}>{money(p.cantidad * p.precio_unitario)}</td>
                      <td><button className="icon-btn text-danger" onClick={() => removePartida(p.id)}>{I.x}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{marginTop:24, padding:16, background:'var(--bg-subtle)', borderRadius:8, width:300, marginLeft:'auto'}}>
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}><span className="text-muted">Subtotal</span><span className="num">{money(subtotal)}</span></div>
              <div className="row" style={{justifyContent:'space-between', marginBottom:8}}><span className="text-muted">IGV (18%)</span><span className="num">{money(igv)}</span></div>
              <div className="row" style={{justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)', fontWeight:700, fontSize:16, fontFamily:'Sora'}}><span>Total a Valorizar</span><span className="num">{money(total)}</span></div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const badge = e => e==='aprobada'?'badge-green':e==='facturada'?'badge-navy':e==='revision'?'badge-orange':'badge-gray';
  const getOSNumero = (id) => osClientes.find(o => o.id === id)?.numero || id;

  const query = searchQuery.toLowerCase();
  const filteredValorizaciones = valorizaciones.filter(v => 
    v.numero.toLowerCase().includes(query) ||
    getOSNumero(v.os_cliente_id).toLowerCase().includes(query) ||
    (v.periodo || '').toLowerCase().includes(query)
  );

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Valorizaciones</h1><div className="page-sub">{valorizaciones.length} valorizaciones registradas</div></div>
        <button className="btn btn-primary" onClick={()=>setEditing(true)}>{I.plus} Generar Valorización</button>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Valorización</th><th>OS Cliente</th><th>Período</th><th>Subtotal</th><th>IGV</th><th>Total</th><th>Estado</th></tr></thead>
            <tbody>{filteredValorizaciones.map(r=>(
              <tr key={r.id} className="hover-row">
                <td className="mono" style={{fontWeight:600}}>{r.numero}</td>
                <td className="mono text-muted">{getOSNumero(r.os_cliente_id)}</td>
                <td className="text-muted">{r.periodo}</td>
                <td className="num">{money(r.subtotal)}</td>
                <td className="num">{money(r.igv)}</td>
                <td className="num" style={{fontWeight:600}}>{money(r.total)}</td>
                <td><span className={'badge '+badge(r.estado)}>{r.estado.toUpperCase()}</span></td>
              </tr>
            ))}
            {filteredValorizaciones.length === 0 && <tr><td colSpan="7" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>{query ? 'No se encontraron resultados' : 'No hay valorizaciones'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Inventario() {
  const { inventario, searchQuery } = useApp();
  const [selSku, setSelSku] = useState(null);

  const query = searchQuery.toLowerCase();
  const filteredInv = inventario.filter(i => 
    i.sku.toLowerCase().includes(query) ||
    i.nombre.toLowerCase().includes(query) ||
    i.categoria.toLowerCase().includes(query) ||
    i.almacen.toLowerCase().includes(query)
  );

  const totalValor = filteredInv.reduce((acc, curr) => acc + (curr.stock_actual * curr.costo_promedio), 0);
  const stockCritico = filteredInv.filter(i => i.stock_actual === 0).length;
  const stockBajo = filteredInv.filter(i => i.stock_actual > 0 && i.stock_actual <= 5).length;

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Almacenes e Inventario</h1><div className="page-sub">Almacén principal · {inventario.length} SKUs registrados</div></div>
        <div className="row"><button className="btn btn-primary">{I.plus} Registrar Entrada</button></div>
      </div>
      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi-card"><div className="kpi-label">Valor inventario</div><div className="kpi-value">{money(totalValor)}</div><div className="kpi-icon cyan">{I.package}</div></div>
        <div className="kpi-card"><div className="kpi-label">SKUs activos</div><div className="kpi-value">{filteredInv.length}</div><div className="kpi-icon purple">{I.warehouse}</div></div>
        <div className="kpi-card"><div className="kpi-label">Stock bajo ({"<="}5)</div><div className="kpi-value" style={{color:'var(--orange)'}}>{stockBajo}</div><div className="kpi-icon orange">{I.alert}</div></div>
        <div className="kpi-card"><div className="kpi-label">Stock crítico (0)</div><div className="kpi-value" style={{color:'var(--danger)'}}>{stockCritico}</div><div className="kpi-icon danger">{I.alert}</div></div>
      </div>
      
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>SKU</th><th>Descripción</th><th>Categoría</th><th>Almacén</th><th>Unidad</th><th>Stock</th><th>Costo Prom.</th><th>Valor Total</th></tr></thead>
            <tbody>{filteredInv.map(r=>(
              <tr key={r.id} onClick={() => setSelSku(r)} className="hover-row" style={{cursor:'pointer'}}>
                <td className="mono" style={{fontWeight:600}}>{r.sku}</td>
                <td><strong>{r.nombre}</strong></td>
                <td>{r.categoria}</td>
                <td>{r.almacen}</td>
                <td className="text-muted">{r.unidad}</td>
                <td className="num" style={{fontWeight:600,color:r.stock_actual===0?'var(--danger)':r.stock_actual<=5?'var(--orange)':'var(--fg)'}}>{r.stock_actual}</td>
                <td className="num">{money(r.costo_promedio)}</td>
                <td className="num">{money(r.stock_actual * r.costo_promedio)}</td>
              </tr>
            ))}
            {filteredInv.length === 0 && <tr><td colSpan="8" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>No se encontraron materiales</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selSku && (
        <>
          <div className="side-panel-backdrop" onClick={() => setSelSku(null)}/>
          <div className="side-panel" style={{width: 600}}>
            <div className="side-panel-head">
              <div>
                <div className="eyebrow">KARDEX y Detalles de SKU</div>
                <div className="font-display mono" style={{fontSize:20, fontWeight:700, marginTop:2}}>{selSku.sku}</div>
              </div>
              <button className="icon-btn" onClick={() => setSelSku(null)}>{I.x}</button>
            </div>
            <div className="side-panel-body">
              <div className="grid-2" style={{gap:16, marginBottom:24}}>
                <div><div className="eyebrow">Descripción</div><div style={{fontWeight:600, fontSize:16}}>{selSku.nombre}</div></div>
                <div><div className="eyebrow">Categoría</div><div>{selSku.categoria}</div></div>
                <div>
                  <div className="eyebrow">Stock Actual</div>
                  <div style={{fontSize:24, fontWeight:700, color:selSku.stock_actual===0?'var(--danger)':selSku.stock_actual<=5?'var(--orange)':'var(--cyan)'}}>
                    {selSku.stock_actual} {selSku.unidad}
                  </div>
                  <div style={{fontSize:11, color:'var(--fg-muted)', marginTop:4}}>Min: 5 | Max: 100</div>
                </div>
                <div><div className="eyebrow">Costo Promedio</div><div style={{fontSize:24, fontWeight:700}}>{money(selSku.costo_promedio)}</div></div>
              </div>

              <div className="row" style={{marginBottom:24, gap:10}}>
                <button className="btn btn-secondary flex-1">{I.plus} Transferencia Interna</button>
                <button className="btn btn-secondary flex-1">Ajuste de Inventario</button>
                {selSku.stock_actual <= 5 && <button className="btn btn-primary flex-1">Generar SOLPE Automática</button>}
              </div>

              <h3 style={{marginBottom:16}}>Movimientos Recientes (KARDEX)</h3>
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Operación</th><th>OT/Doc</th><th>Cant.</th><th>Saldo</th></tr></thead>
                  <tbody>
                    <tr>
                      <td className="text-muted">Hoy</td>
                      <td><span className="badge badge-orange">SALIDA</span> (Consumo)</td>
                      <td className="mono text-muted">OT-25-0012</td>
                      <td className="num" style={{color:'var(--danger)'}}>-2</td>
                      <td className="num">{selSku.stock_actual}</td>
                    </tr>
                    <tr>
                      <td className="text-muted">Hace 5 días</td>
                      <td><span className="badge badge-green">ENTRADA</span> (Compra)</td>
                      <td className="mono text-muted">OC-25-0104</td>
                      <td className="num" style={{color:'var(--green)'}}>+20</td>
                      <td className="num">{selSku.stock_actual + 2}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ============ HOJA DE COSTEO ============
function HojaCosteo() {
  const { hojasCosteo, oportunidades, cuentas, activeParams, navigate, crearHojaCosteo, actualizarHojaCosteo, aprobarHojaCosteo, searchQuery } = useApp();

  const getOpp = id => oportunidades.find(o => o.id === id);
  const getCuentaNombre = id => { const c = cuentas.find(x => x.id === id); return c?.razon_social || c?.nombre_comercial || id || 'N/A'; };
  const estadoHC = e => e || 'borrador';
  const labelEstadoHC = e => String(estadoHC(e)).replace('_', ' ');
  const badgeHC = e => estadoHC(e) === 'aprobada' ? 'badge-green' : estadoHC(e) === 'en_revision' ? 'badge-orange' : 'badge-gray';

  const query = searchQuery.toLowerCase();
  const filteredHC = hojasCosteo.filter(hc => {
    const opp = getOpp(hc.oportunidad_id);
    const cliente = getCuentaNombre(hc.cuenta_id);
    return !query ||
      hc.numero.toLowerCase().includes(query) ||
      cliente.toLowerCase().includes(query) ||
      (opp?.nombre || '').toLowerCase().includes(query);
  });

  if (activeParams?.detail) {
    const hc = hojasCosteo.find(h => h.id === activeParams.detail);
    if (!hc) return <div className="p-4">Hoja de Costeo no encontrada</div>;
    return <DetalleHC hc={hc} getOpp={getOpp} getCuentaNombre={getCuentaNombre} badgeHC={badgeHC} actualizarHojaCosteo={actualizarHojaCosteo} aprobarHojaCosteo={aprobarHojaCosteo} navigate={navigate} />;
  }

  if (activeParams?.nueva) {
    const opp = getOpp(activeParams.opp);
    if (!opp) return <div className="p-4">Oportunidad no encontrada</div>;
    return (
      <EditorHC
        opp={opp}
        getCuentaNombre={getCuentaNombre}
        onSave={async datos => { const id = await crearHojaCosteo(datos); navigate('hoja_costeo', { detail: id }); }}
        onCancel={() => navigate('pipeline', { panel: opp.id })}
      />
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hojas de Costeo</h1>
          <div className="page-sub">{hojasCosteo.length} documentos · documento interno previo a cotización</div>
        </div>
      </div>
      <div className="card mt-6">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Número</th><th>Oportunidad</th><th>Cliente</th><th>Costo Total</th><th>Precio Sugerido</th><th>Margen obj.</th><th>Responsable</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {filteredHC.map(hc => {
                const opp = getOpp(hc.oportunidad_id);
                return (
                  <tr key={hc.id} className="hover-row" style={{cursor:'pointer'}} onClick={() => navigate('hoja_costeo', { detail: hc.id })}>
                    <td className="mono" style={{fontWeight:600}}>{hc.numero}</td>
                    <td>{opp?.nombre || '—'}</td>
                    <td><strong>{getCuentaNombre(hc.cuenta_id)}</strong></td>
                    <td className="num">{money(hc.costo_total)}</td>
                    <td className="num" style={{fontWeight:600}}>{money(hc.precio_sugerido_total)}</td>
                    <td className="num">{hc.margen_objetivo_pct}%</td>
                    <td className="text-muted">{hc.responsable_costeo || '—'}</td>
                    <td><span className={'badge ' + badgeHC(hc.estado)}>{labelEstadoHC(hc.estado)}</span></td>
                  </tr>
                );
              })}
              {filteredHC.length === 0 && <tr><td colSpan="8" style={{textAlign:'center', padding:40, color:'var(--fg-muted)'}}>{query ? 'Sin resultados para la búsqueda' : 'No hay hojas de costeo. Créalas desde el Pipeline.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SeccionCosto({ titulo, badge, items, onChange, readOnly, sugerido }) {
  const safeItems = Array.isArray(items) ? items : [];
  const calcSubtotal = list => list.reduce((s, i) => s + (Number(i.cantidad || 0) * Number(i.costo_unitario || 0)), 0);

  const addItem = () => onChange([...safeItems, { id: Date.now(), descripcion: sugerido || '', cantidad: 1, unidad: 'und', costo_unitario: 0 }]);
  const removeItem = id => onChange(safeItems.filter(i => i.id !== id));
  const updateItem = (id, field, value) => onChange(safeItems.map(i => i.id === id ? { ...i, [field]: value } : i));

  return (
    <section className="cost-section">
      <div className="cost-section-head">
        <div className="row" style={{gap:10, alignItems:'center'}}>
          <h3>{titulo}</h3>
          <span className={'badge ' + badge}>{money(calcSubtotal(safeItems))}</span>
        </div>
        {!readOnly && <button className="btn btn-secondary btn-sm" onClick={addItem}>{I.plus} Agregar línea</button>}
      </div>
      {safeItems.length === 0 && !readOnly && (
        <div style={{padding:'12px 16px', background:'var(--bg-subtle)', borderRadius:6, color:'var(--fg-muted)', fontSize:13}}>
          Sin ítems — usa "Agregar línea" para comenzar.
        </div>
      )}
      {safeItems.length > 0 && (
        <div className="table-wrap cost-table-wrap">
          <table className="tbl cost-table">
            <thead><tr><th>Descripción</th><th style={{width:100}}>Cant.</th><th style={{width:100}}>Unidad</th><th style={{width:130}}>Costo unit.</th><th style={{width:120}}>Subtotal</th>{!readOnly && <th style={{width:36}}></th>}</tr></thead>
            <tbody>
              {safeItems.map(item => (
                <tr key={item.id}>
                  <td data-label="Descripcion">{readOnly ? item.descripcion : <input className="input" value={item.descripcion} onChange={e => updateItem(item.id, 'descripcion', e.target.value)} placeholder="Concepto del costo" />}</td>
                  <td data-label="Cant.">{readOnly ? <span className="num">{item.cantidad}</span> : <input type="number" className="input num" min="0" step="0.01" value={item.cantidad} onChange={e => updateItem(item.id, 'cantidad', e.target.value)} />}</td>
                  <td data-label="Unidad">{readOnly ? <span className="text-muted">{item.unidad}</span> : <input className="input" value={item.unidad} onChange={e => updateItem(item.id, 'unidad', e.target.value)} />}</td>
                  <td data-label="Costo unit.">{readOnly ? <span className="num">{money(item.costo_unitario)}</span> : <input type="number" className="input num" min="0" step="0.01" value={item.costo_unitario} onChange={e => updateItem(item.id, 'costo_unitario', e.target.value)} />}</td>
                  <td data-label="Subtotal" className="num" style={{fontWeight:600}}>{money(Number(item.cantidad || 0) * Number(item.costo_unitario || 0))}</td>
                  {!readOnly && <td className="cost-row-action"><button type="button" className="icon-btn text-danger" onClick={() => removeItem(item.id)} title="Eliminar linea">{I.x}</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ResumenCostos({ hc }) {
  const margen = Number(hc.margen_objetivo_pct || 35);
  const totalManoObra = hc.total_mano_obra ?? calcSub(hc.mano_obra);
  const totalMateriales = hc.total_materiales ?? calcSub(hc.materiales);
  const totalServicios = hc.total_servicios_terceros ?? calcSub(hc.servicios_terceros);
  const totalLogistica = hc.total_logistica ?? calcSub(hc.logistica);
  const costo = hc.costo_total ?? (totalManoObra + totalMateriales + totalServicios + totalLogistica);
  const sinIgv = hc.precio_sugerido_sin_igv ?? calcPrecio(hc);
  const conIgv = hc.precio_sugerido_total ?? (sinIgv * 1.18);
  const margenReal = sinIgv > 0 ? Math.round((sinIgv - costo) / sinIgv * 100) : 0;

  return (
    <div style={{background:'var(--bg-subtle)', borderRadius:10, padding:20, border:'1px solid var(--border)'}}>
      <div className="eyebrow" style={{marginBottom:16}}>Resumen económico</div>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 24px', marginBottom:16}}>
        {[
          ['Mano de obra', totalManoObra],
          ['Materiales', totalMateriales],
          ['Servicios terceros', totalServicios],
          ['Logística', totalLogistica],
        ].map(([label, val]) => (
          <div key={label} className="row" style={{justifyContent:'space-between'}}>
            <span className="text-muted" style={{fontSize:13}}>{label}</span>
            <span className="num" style={{fontSize:13}}>{money(val || 0)}</span>
          </div>
        ))}
      </div>
      <div style={{borderTop:'2px solid var(--border)', paddingTop:12, marginBottom:8}}>
        <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
          <span style={{fontWeight:600}}>Costo total estimado</span>
          <span className="num" style={{fontWeight:700}}>{money(costo)}</span>
        </div>
        <div className="row" style={{justifyContent:'space-between', marginBottom:6}}>
          <span className="text-muted" style={{fontSize:13}}>Margen objetivo: {margen}% → precio sin IGV</span>
          <span className="num" style={{fontSize:13}}>{money(sinIgv)}</span>
        </div>
        <div className="row" style={{justifyContent:'space-between', paddingTop:8, borderTop:'1px solid var(--border)'}}>
          <span style={{fontWeight:700, fontFamily:'Sora', fontSize:16}}>Precio sugerido al cliente (c/ IGV)</span>
          <span className="num" style={{fontWeight:700, fontFamily:'Sora', fontSize:18, color:'var(--cyan)'}}>{money(conIgv)}</span>
        </div>
      </div>
      <div style={{marginTop:8, padding:'6px 10px', background: margenReal >= margen ? 'rgba(76,175,80,0.1)' : 'rgba(255,152,0,0.1)', borderRadius:6, textAlign:'center', fontSize:13}}>
        Margen real calculado: <strong>{margenReal}%</strong> {margenReal >= margen ? '✓' : '↓ bajo objetivo'}
      </div>
    </div>
  );
}

function DetalleHC({ hc, getOpp, getCuentaNombre, badgeHC, actualizarHojaCosteo, aprobarHojaCosteo, navigate }) {
  const opp = getOpp(hc.oportunidad_id);
  const estado = hc.estado || 'borrador';
  const estadoLabel = String(estado).replace('_',' ');
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    mano_obra: Array.isArray(hc.mano_obra) ? hc.mano_obra : [],
    materiales: Array.isArray(hc.materiales) ? hc.materiales : [],
    servicios_terceros: Array.isArray(hc.servicios_terceros) ? hc.servicios_terceros : [],
    logistica: Array.isArray(hc.logistica) ? hc.logistica : [],
    margen_objetivo_pct: hc.margen_objetivo_pct,
    responsable_costeo: hc.responsable_costeo || '',
    notas: hc.notas || ''
  });

  const puedeEditar = estado !== 'aprobada';
  const readOnly = !puedeEditar || !editMode;

  const handleSave = async () => {
    await actualizarHojaCosteo(hc.id, form);
    setEditMode(false);
  };

  const handleEnviarRevision = async () => {
    await actualizarHojaCosteo(hc.id, editMode ? { ...form, estado: 'en_revision' } : { estado: 'en_revision' });
    setEditMode(false);
  };

  const handleVolverBorrador = async () => {
    await actualizarHojaCosteo(hc.id, editMode ? { ...form, estado: 'borrador' } : { estado: 'borrador' });
    setEditMode(false);
  };

  const handleAprobar = async () => {
    if (editMode) await handleSave();
    await aprobarHojaCosteo(hc.id);
  };

  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={() => navigate('hoja_costeo')} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver a lista</button>
          <h1 className="page-title row" style={{gap:10}}>{hc.numero} <span className={'badge ' + badgeHC(estado)} style={{fontSize:12, textTransform:'uppercase'}}>{estadoLabel}</span></h1>
          <div className="page-sub">Oportunidad: {opp?.nombre || '—'} · Cliente: <strong>{getCuentaNombre(hc.cuenta_id)}</strong></div>
        </div>
        <div className="row">
          {puedeEditar && (
            <button className={`btn ${editMode?'btn-primary':'btn-secondary'}`} onClick={() => editMode ? handleSave() : setEditMode(true)}>
              {editMode ? <>{I.save} Guardar cambios</> : <>{I.edit} Editar costeo</>}
            </button>
          )}
          {estado === 'borrador' && (
            <button className="btn btn-primary" onClick={handleEnviarRevision}>{I.send} Enviar a revision</button>
          )}
          {estado === 'en_revision' && puedeEditar && (
            <button className="btn btn-secondary" onClick={handleVolverBorrador}>{I.edit} Volver a borrador</button>
          )}
          {estado === 'en_revision' && (
            <button className="btn btn-primary" style={{background:'var(--green)'}} onClick={handleAprobar}>{I.check} Aprobar Costeo</button>
          )}
          {estado === 'aprobada' && (
            <button className="btn btn-primary" onClick={() => navigate('cotizaciones', { active_tab: 'nueva', opp: hc.oportunidad_id })}>{I.plus} Generar Cotización</button>
          )}
          <button className="btn btn-secondary">{I.download} PDF</button>
        </div>
      </div>

      <div className="cost-editor-shell">
        <div className="cost-editor-grid">
          <div className="cost-lines">
            <SeccionCosto titulo="Mano de Obra" badge="badge-cyan" items={form.mano_obra} readOnly={readOnly} onChange={val => setForm(p=>({...p, mano_obra: val}))} />
            <SeccionCosto titulo="Materiales e Insumos" badge="badge-purple" items={form.materiales} readOnly={readOnly} onChange={val => setForm(p=>({...p, materiales: val}))} />
            <SeccionCosto titulo="Servicios Terceros / Alquileres" badge="badge-orange" items={form.servicios_terceros} readOnly={readOnly} onChange={val => setForm(p=>({...p, servicios_terceros: val}))} />
            <SeccionCosto titulo="Logística y Viáticos" badge="badge-gray" items={form.logistica} readOnly={readOnly} onChange={val => setForm(p=>({...p, logistica: val}))} />
          </div>
          <aside className="cost-sidebar">
            <ResumenCostos hc={{ ...hc, ...form, costo_total: (calcSub(form.mano_obra)+calcSub(form.materiales)+calcSub(form.servicios_terceros)+calcSub(form.logistica)), precio_sugerido_sin_igv: calcPrecio(form), precio_sugerido_total: calcPrecio(form)*1.18 }} />
            
            <div className="card mt-6" style={{padding:20}}>
              <div className="eyebrow" style={{marginBottom:16}}>Configuración y Notas</div>
              <div className="input-group">
                <label>Margen objetivo (%)</label>
                {readOnly ? <div>{form.margen_objetivo_pct}%</div> : <input type="number" className="input" value={form.margen_objetivo_pct} onChange={e => setForm(p=>({...p, margen_objetivo_pct: Number(e.target.value)}))} />}
              </div>
              <div className="input-group">
                <label>Responsable</label>
                {readOnly ? <div>{form.responsable_costeo}</div> : <input className="input" value={form.responsable_costeo} onChange={e => setForm(p=>({...p, responsable_costeo: e.target.value}))} />}
              </div>
              <div className="input-group">
                <label>Notas internas</label>
                {readOnly ? <div className="text-muted" style={{fontSize:13}}>{form.notas || 'Sin notas'}</div> : <textarea className="input" rows="3" value={form.notas} onChange={e => setForm(p=>({...p, notas: e.target.value}))} />}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

const calcSub = list => (list||[]).reduce((s,i)=>s+(Number(i.cantidad || 0)*Number(i.costo_unitario || 0)),0);
const calcPrecio = f => {
  const c = calcSub(f.mano_obra)+calcSub(f.materiales)+calcSub(f.servicios_terceros)+calcSub(f.logistica);
  const margen = Math.min(Math.max(Number(f.margen_objetivo_pct || 35), 0), 95);
  const m = margen / 100;
  return c / (1 - m);
};

// Subcomponente Editor Hoja de Costeo
function EditorHC({ opp, getCuentaNombre, onSave, onCancel }) {
  const [form, setForm] = useState({
    oportunidad_id: opp.id,
    cuenta_id: opp.cuenta_id,
    numero: `HC-${Date.now().toString().slice(-6)}`,
    mano_obra: [{ id: 1, descripcion: 'Técnico Especialista', cantidad: 1, unidad: 'hh', costo_unitario: 80 }],
    materiales: [],
    servicios_terceros: [],
    logistica: [],
    margen_objetivo_pct: 35,
    responsable_costeo: 'Admin',
    notas: ''
  });

  const totalCosto = calcSub(form.mano_obra) + calcSub(form.materiales) + calcSub(form.servicios_terceros) + calcSub(form.logistica);
  const precioSinIgv = calcPrecio(form);

  return (
    <>
      <div className="page-header" style={{borderBottom:'none', paddingBottom:0}}>
        <div>
          <button className="btn btn-ghost" onClick={onCancel} style={{marginBottom:10, padding:0, color:'var(--cyan)'}}>← Volver</button>
          <h1 className="page-title">Nueva Hoja de Costeo</h1>
          <div className="page-sub">Oportunidad: {opp.nombre} · Cliente: <strong>{getCuentaNombre(opp.cuenta_id)}</strong></div>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave({ ...form, costo_total: totalCosto, precio_sugerido_sin_igv: precioSinIgv, precio_sugerido_total: precioSinIgv * 1.18 })}>{I.save} Guardar y Continuar</button>
        </div>
      </div>
      <div className="cost-editor-shell">
        <div className="cost-editor-grid">
          <div className="cost-lines">
            <SeccionCosto titulo="Mano de Obra" badge="badge-cyan" items={form.mano_obra} onChange={val => setForm(p=>({...p, mano_obra: val}))} />
            <SeccionCosto titulo="Materiales e Insumos" badge="badge-purple" items={form.materiales} onChange={val => setForm(p=>({...p, materiales: val}))} />
            <SeccionCosto titulo="Servicios Terceros / Alquileres" badge="badge-orange" items={form.servicios_terceros} onChange={val => setForm(p=>({...p, servicios_terceros: val}))} />
            <SeccionCosto titulo="Logistica y Viaticos" badge="badge-gray" items={form.logistica} onChange={val => setForm(p=>({...p, logistica: val}))} />
          </div>
          <aside className="cost-sidebar">
             <ResumenCostos hc={{ ...form, costo_total: totalCosto, precio_sugerido_sin_igv: precioSinIgv, precio_sugerido_total: precioSinIgv * 1.18 }} />
             <div className="card mt-6" style={{padding:20}}>
              <div className="eyebrow" style={{marginBottom:16}}>Configuracion y notas</div>
              <div className="input-group">
                <label>Margen objetivo (%)</label>
                <input type="number" className="input" value={form.margen_objetivo_pct} onChange={e => setForm(p=>({...p, margen_objetivo_pct: Number(e.target.value)}))} />
              </div>
              <div className="input-group">
                <label>Responsable del costeo</label>
                <input className="input" value={form.responsable_costeo} onChange={e => setForm(p=>({...p, responsable_costeo: e.target.value}))} />
              </div>
              <div className="input-group">
                <label>Notas internas</label>
                <textarea className="input" rows="3" value={form.notas} onChange={e => setForm(p=>({...p, notas: e.target.value}))} />
              </div>
             </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export { Cotizaciones, Valorizacion, Inventario, HojaCosteo };
