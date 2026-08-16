import React, { useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';

// ─── Modal Contrato ───────────────────────────────────────────────
const ContratoModal = ({ contrato, onClose }) => {
  const isNew = !contrato;
  const [form, setForm] = useState(contrato || {
    numero: '', cliente: '', tipo: 'Contrato', descripcion: '',
    moneda: 'USD', fechaInicio: '', fechaFin: '',
    estado: 'Activo', condicionFact: 'Por período mensual',
    dmp: 97.92, obs: '',
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', zIndex:1000, display:'grid', placeItems:'center', padding:20 }}>
      <div className="card" style={{ width:'100%', maxWidth:640 }}>
        <div className="card-header" style={{ background:'var(--navy)', color:'white', borderRadius:'8px 8px 0 0' }}>
          <h3>{isNew ? 'Nuevo Contrato / OS' : `Editar ${contrato.numero}`}</h3>
          <div className="spacer"/>
          <button className="icon-btn" onClick={onClose} style={{ color:'white' }}><Icon name="x" size={16}/></button>
        </div>
        <div className="card-body" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div className="field" style={{ gridColumn:'1/-1' }}>
            <label>N° Contrato / OS *</label>
            <input className="input" value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="CT-2026-CLI-001"/>
          </div>
          <div className="field">
            <label>Cliente *</label>
            <select className="select" value={form.cliente} onChange={e => set('cliente', e.target.value)}>
              <option value="">Seleccionar...</option>
              {ZAHORY_SAC_DATA.clientes.map(c => <option key={c.id}>{c.razonSocial}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Tipo *</label>
            <div className="seg">
              <button className={form.tipo === 'Contrato' ? 'active' : ''} onClick={() => set('tipo','Contrato')}>Contrato</button>
              <button className={form.tipo === 'OS' ? 'active' : ''} onClick={() => set('tipo','OS')}>OS</button>
            </div>
          </div>
          <div className="field" style={{ gridColumn:'1/-1' }}>
            <label>Descripción del servicio *</label>
            <input className="input" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Servicio de mantenimiento..."/>
          </div>
          <div className="field">
            <label>Fecha inicio *</label>
            <input className="input" type="date" value={form.fechaInicio} onChange={e => set('fechaInicio', e.target.value)}/>
          </div>
          <div className="field">
            <label>Fecha fin</label>
            <input className="input" type="date" value={form.fechaFin} onChange={e => set('fechaFin', e.target.value)}/>
          </div>
          <div className="field">
            <label>Moneda facturación</label>
            <div className="seg">
              <button className={form.moneda === 'USD' ? 'active' : ''} onClick={() => set('moneda','USD')}>USD</button>
              <button className={form.moneda === 'PEN' ? 'active' : ''} onClick={() => set('moneda','PEN')}>PEN</button>
            </div>
          </div>
          <div className="field">
            <label>DMP pactado % <span className="muted">(default 97.92)</span></label>
            <input className="input" type="number" step="0.01" min="0" max="100" value={form.dmp} onChange={e => set('dmp', parseFloat(e.target.value))}/>
          </div>
          <div className="field" style={{ gridColumn:'1/-1' }}>
            <label>Condición de facturación</label>
            <select className="select" value={form.condicionFact} onChange={e => set('condicionFact', e.target.value)}>
              <option>Por período mensual</option>
              <option>Por OT aprobada</option>
              <option>Por hito</option>
            </select>
          </div>
          <div className="field" style={{ gridColumn:'1/-1' }}>
            <label>Observaciones contractuales</label>
            <textarea className="input" rows={3} value={form.obs} onChange={e => set('obs', e.target.value)} style={{ resize:'vertical' }}/>
          </div>
          <div style={{ gridColumn:'1/-1', display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4, borderTop:'1px solid var(--card-border)' }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={onClose}>
              <Icon name="check" size={14}/> {isNew ? 'Crear contrato' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Modal Cliente ────────────────────────────────────────────────
const ClienteModal = ({ cliente, onClose }) => {
  const isNew = !cliente;
  const [form, setForm] = useState(cliente || { razonSocial:'', ruc:'', contacto:'', email:'', telefono:'', estado:'Activo' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.65)', zIndex:1000, display:'grid', placeItems:'center', padding:20 }}>
      <div className="card" style={{ width:'100%', maxWidth:480 }}>
        <div className="card-header" style={{ background:'var(--navy)', color:'white', borderRadius:'8px 8px 0 0' }}>
          <h3>{isNew ? 'Nuevo Cliente' : `Editar ${cliente.razonSocial}`}</h3>
          <div className="spacer"/>
          <button className="icon-btn" onClick={onClose} style={{ color:'white' }}><Icon name="x" size={16}/></button>
        </div>
        <div className="card-body" style={{ display:'grid', gap:12 }}>
          <div className="field"><label>Razón social *</label><input className="input" value={form.razonSocial} onChange={e => set('razonSocial',e.target.value)}/></div>
          <div className="field"><label>RUC *</label><input className="input" value={form.ruc} onChange={e => set('ruc',e.target.value)} placeholder="20XXXXXXXXX"/></div>
          <div className="field"><label>Contacto principal</label><input className="input" value={form.contacto} onChange={e => set('contacto',e.target.value)}/></div>
          <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={e => set('email',e.target.value)}/></div>
          <div className="field"><label>Teléfono</label><input className="input" value={form.telefono} onChange={e => set('telefono',e.target.value)}/></div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', borderTop:'1px solid var(--card-border)', paddingTop:12 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={onClose}><Icon name="check" size={14}/> {isNew ? 'Crear cliente' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Página principal ─────────────────────────────────────────────
export const ClientesContratosPage = () => {
  const D = ZAHORY_SAC_DATA;
  const [tab, setTab] = useState('contratos');
  const [showContratoModal, setShowContratoModal] = useState(false);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [selectedContrato, setSelectedContrato] = useState(null);
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [filterEstado, setFilterEstado] = useState('Todos');

  const contratosFiltered = D.contratos.filter(c => filterEstado === 'Todos' || c.estado === filterEstado);

  const estadoBadge = (e) => {
    if (e === 'Activo')  return <span className="badge green"><span className="dot"/>Activo</span>;
    if (e === 'Cerrado') return <span className="badge slate"><span className="dot"/>Cerrado</span>;
    if (e === 'Suspendido') return <span className="badge orange"><span className="dot"/>Suspendido</span>;
    return <span className="badge slate">{e}</span>;
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clientes y Contratos</h1>
          <div className="sub">Marco contractual que da cobertura a las OTs · DMP por contrato</div>
        </div>
        <div className="spacer"/>
        {tab === 'contratos'
          ? <button className="btn btn-cyan" onClick={() => { setSelectedContrato(null); setShowContratoModal(true); }}>
              <Icon name="plus" size={13}/> Nuevo Contrato / OS
            </button>
          : <button className="btn btn-primary" onClick={() => { setSelectedCliente(null); setShowClienteModal(true); }}>
              <Icon name="plus" size={13}/> Nuevo cliente
            </button>
        }
      </div>

      <div className="tabs">
        <div className={'tab ' + (tab === 'contratos' ? 'active' : '')} onClick={() => setTab('contratos')}>
          Contratos / OS <span className="chip" style={{ marginLeft:6 }}>{D.contratos.filter(c=>c.estado==='Activo').length} activos</span>
        </div>
        <div className={'tab ' + (tab === 'clientes' ? 'active' : '')} onClick={() => setTab('clientes')}>
          Clientes <span className="chip" style={{ marginLeft:6 }}>{D.clientes.length}</span>
        </div>
      </div>

      {/* ── TAB CONTRATOS ── */}
      {tab === 'contratos' && (
        <>
          {/* KPIs */}
          <div className="kpi-grid" style={{ marginBottom:16, gridTemplateColumns:'repeat(4,1fr)' }}>
            <div className="kpi"><div className="kpi-header"><div className="label">Total contratos</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value">{D.contratos.length}</div></div>
            <div className="kpi green-soft"><div className="label" style={{color:'#1B5E20'}}>Activos</div><div className="value" style={{color:'#1B5E20'}}>{D.contratos.filter(c=>c.estado==='Activo').length}</div></div>
            <div className="kpi"><div className="kpi-header"><div className="label">Equipos en scope</div><div className="kpi-icon-wrap"><Icon name="chart" size={16}/></div></div><div className="value">{[...new Set(D.contratos.flatMap(c=>c.equiposScope))].length}</div></div>
            <div className="kpi navy">
              <div className="label">DMP promedio</div>
              <div className="value">{(D.contratos.filter(c=>c.estado==='Activo').reduce((s,c)=>s+c.dmp,0)/D.contratos.filter(c=>c.estado==='Activo').length).toFixed(2)}%</div>
            </div>
          </div>

          <div className="toolbar">
            <div className="seg">
              {['Todos','Activo','Cerrado'].map(e => (
                <button key={e} className={filterEstado===e?'active':''} onClick={()=>setFilterEstado(e)}>{e}</button>
              ))}
            </div>
            <div className="spacer"/>
            <input className="input" placeholder="Buscar contrato..." style={{ width:260 }}/>
          </div>

          <div className="card">
            <table className="tbl">
              <thead>
                <tr>
                  <th>N° Contrato / OS</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Descripción del servicio</th>
                  <th>Equipos scope</th>
                  <th className="num">DMP %</th>
                  <th>Cond. facturación</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {contratosFiltered.map(c => (
                  <tr key={c.id}>
                    <td className="ot-code">{c.numero}</td>
                    <td className="bold">{c.cliente}</td>
                    <td>
                      <span className={`badge ${c.tipo === 'Contrato' ? 'navy' : 'cyan'}`}>
                        <span className="dot"/>{c.tipo}
                      </span>
                    </td>
                    <td style={{ fontSize:12, maxWidth:220 }}>{c.descripcion}</td>
                    <td>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {c.equiposScope.map(e => <span key={e} className="chip">{e}</span>)}
                      </div>
                    </td>
                    <td className="num">
                      <span style={{ fontWeight:700, fontFamily:'ui-monospace,monospace', color: c.dmp >= 97.92 ? 'var(--navy)' : '#C15D00' }}>
                        {c.dmp.toFixed(2)}%
                      </span>
                    </td>
                    <td style={{ fontSize:12 }}>{c.condicionFact}</td>
                    <td style={{ fontSize:11 }}>
                      <div className="mono">{c.fechaInicio}</div>
                      <div className="mono muted">{c.fechaFin || '—'}</div>
                    </td>
                    <td>{estadoBadge(c.estado)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedContrato(c); setShowContratoModal(true); }}>
                        <Icon name="edit" size={13}/>
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Ver OTs de este contrato">
                        <Icon name="orders" size={13}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detalle expandido del primer contrato activo */}
          {D.contratos.filter(c=>c.obs).slice(0,1).map(c => (
            <div key={c.id} className="card" style={{ marginTop:16 }}>
              <div className="card-header">
                <h3>Observaciones contractuales · {c.numero}</h3>
              </div>
              <div className="card-body" style={{ fontSize:13, lineHeight:1.7, color:'var(--text-muted)' }}>
                {c.obs}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── TAB CLIENTES ── */}
      {tab === 'clientes' && (
        <div className="card">
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th>
                <th>Razón social</th>
                <th>RUC</th>
                <th>Contacto principal</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th className="num">Contratos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {D.clientes.map(cl => {
                const nContratos = D.contratos.filter(c => c.clienteId === cl.id).length;
                return (
                  <tr key={cl.id}>
                    <td className="ot-code">{cl.id}</td>
                    <td className="bold">{cl.razonSocial}</td>
                    <td className="mono">{cl.ruc}</td>
                    <td>{cl.contacto}</td>
                    <td className="mono" style={{ fontSize:12 }}>{cl.email}</td>
                    <td style={{ fontSize:12 }}>{cl.telefono}</td>
                    <td className="num">
                      {nContratos > 0
                        ? <span className="badge cyan">{nContratos}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td>{estadoBadge(cl.estado)}</td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedCliente(cl); setShowClienteModal(true); }}>
                        <Icon name="edit" size={13}/>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showContratoModal && <ContratoModal contrato={selectedContrato} onClose={() => setShowContratoModal(false)}/>}
      {showClienteModal  && <ClienteModal  cliente={selectedCliente}   onClose={() => setShowClienteModal(false)}/>}
      <FooterBrand/>
    </div>
  );
};
