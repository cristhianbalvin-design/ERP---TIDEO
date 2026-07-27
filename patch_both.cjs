const fs = require('fs');
const { execSync } = require('child_process');
execSync('git restore src/pages_fin.jsx');

let code = fs.readFileSync('src/pages_fin.jsx', 'utf8');

// 1. PATCH CxP (Cuentas por Pagar)
// Add state and memo
const cxpStateTarget = `  const [filtTipo, setFiltTipo] = useState('todos');
  const [filtOrigen, setFiltOrigen] = useState('todos');
  const [filtMoneda, setFiltMoneda] = useState('todos');`;

const cxpStateReplacement = `  const [filtTipo, setFiltTipo] = useState('todos');
  const [filtOrigen, setFiltOrigen] = useState('todos');
  const [filtMoneda, setFiltMoneda] = useState('todos');
  const [filtMes, setFiltMes] = useState('todos');
  const [filtBusqueda, setFiltBusqueda] = useState('');

  const mesesDisponibles = useMemo(() => {
    const set = new Set();
    (cxp || []).forEach(c => {
      const fecha = c.fecha_emision || c.emision;
      if (fecha && fecha.length >= 7) set.add(fecha.substring(0, 7));
    });
    return Array.from(set).sort().reverse();
  }, [cxp]);`;
code = code.replace(cxpStateTarget, cxpStateReplacement);

// Add filter logic
const cxpLogicTarget = `    if (filtMoneda !== 'todos' && (c.moneda || 'PEN') !== filtMoneda) return false;
    return true;`;

const cxpLogicReplacement = `    if (filtMoneda !== 'todos' && (c.moneda || 'PEN') !== filtMoneda) return false;
    if (filtMes !== 'todos') {
      const fecha = c.fecha_emision || c.emision || '';
      if (!fecha.startsWith(filtMes)) return false;
    }
    if (filtBusqueda) {
      const ben = beneficiarioDetalle(c);
      const nombre = (ben?.nombre || '').toLowerCase();
      if (!nombre.includes(filtBusqueda.toLowerCase())) return false;
    }
    return true;`;
code = code.replace(cxpLogicTarget, cxpLogicReplacement);

// Replace filter UI
const cxpUiTarget = `      <div className="row" style={{gap:8, marginTop:16, marginBottom:4, flexWrap:'wrap'}}>
        {[{v:'todos',l:'Todos'},{v:'proveedor',l:'Proveedores'},{v:'personal',l:'Colaboradores'},{v:DIVIDENDO_TIPO,l:'Socio / accionista'}].map(f => (
          <button key={f.v} className={'btn btn-sm '+(filtTipo===f.v?'btn-primary':'btn-secondary')} onClick={() => setFiltTipo(f.v)}>{f.l}</button>
        ))}
        <div style={{width:1,background:'var(--border)',margin:'0 4px'}}/>
        {[{v:'todos',l:'Origen: Todos'},{v:'recepcion',l:'OC'},{v:'auto_gasto',l:'Gasto directo'},{v:'rhe_externo',l:'RHE'},{v:'honorarios',l:'Honorarios'},{v:'viaticos',l:'Viáticos'},{v:'nomina',l:'Nómina'},{v:'manual',l:'Manual'}].map(f => (
          <button key={f.v} className={'btn btn-sm '+(filtOrigen===f.v?'btn-primary':'btn-secondary')} onClick={() => setFiltOrigen(f.v)}>{f.l}</button>
        ))}
        <div style={{width:1,background:'var(--border)',margin:'0 4px'}}/>
        {[{v:'todos',l:'Todas'},{v:'PEN',l:'S/ PEN'},{v:'USD',l:'US$ USD'}].map(f => (
          <button key={f.v} className={'btn btn-sm '+(filtMoneda===f.v?'btn-primary':'btn-secondary')} onClick={() => setFiltMoneda(f.v)}>{f.l}</button>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">`;

const cxpUiReplacement = `      <div className="card">
        <div className="card-head row" style={{gap:12, flexWrap:'wrap'}}>
          <input className="input" placeholder="Buscar beneficiario..." value={filtBusqueda} onChange={e => setFiltBusqueda(e.target.value)} style={{flex:'1 1 200px'}} />
          <select className="input" style={{flex:'1 1 140px'}} value={filtTipo} onChange={e => setFiltTipo(e.target.value)}>
            {[{v:'todos',l:'Todos los beneficiarios'},{v:'proveedor',l:'Proveedores'},{v:'personal',l:'Colaboradores'},{v:DIVIDENDO_TIPO,l:'Socio / accionista'}].map(f => (
              <option key={f.v} value={f.v}>{f.l}</option>
            ))}
          </select>
          <select className="input" style={{flex:'1 1 140px'}} value={filtOrigen} onChange={e => setFiltOrigen(e.target.value)}>
            {[{v:'todos',l:'Todos los orígenes'},{v:'recepcion',l:'OC'},{v:'auto_gasto',l:'Gasto directo'},{v:'rhe_externo',l:'RHE'},{v:'honorarios',l:'Honorarios'},{v:'viaticos',l:'Viáticos'},{v:'nomina',l:'Nómina'},{v:'manual',l:'Manual'}].map(f => (
              <option key={f.v} value={f.v}>{f.l}</option>
            ))}
          </select>
          <select className="input" style={{flex:'1 1 120px'}} value={filtMoneda} onChange={e => setFiltMoneda(e.target.value)}>
            {[{v:'todos',l:'Todas las monedas'},{v:'PEN',l:'S/ PEN'},{v:'USD',l:'US$ USD'}].map(f => (
              <option key={f.v} value={f.v}>{f.l}</option>
            ))}
          </select>
          <select className="input" style={{flex:'1 1 120px'}} value={filtMes} onChange={e => setFiltMes(e.target.value)}>
            <option value="todos">Todos los meses</option>
            {mesesDisponibles.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">`;
code = code.replace(cxpUiTarget, cxpUiReplacement);


// 2. PATCH CxC (Cuentas por Cobrar)
const cxcFilterBlockOriginal = `      <div className="card" style={{marginTop:12}}>
        <div className="card-head row" style={{gap:12, flexWrap:'wrap', alignItems:'center'}}>
          <input className="input" placeholder="Buscar cliente..." value={fCliente} onChange={e=>setFCliente(e.target.value)} style={{flex:'1 1 200px'}} />
          <select className="input" style={{flex:'1 1 140px'}} value={fPeriodoEmision} onChange={e=>setFPeriodoEmision(e.target.value)}>
            <option value="">Todos los períodos</option>
            {periodoOptsEmision.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <select className="input" style={{flex:'1 1 140px'}} value={fEstado} onChange={e=>setFEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input" style={{flex:'1 1 120px'}} value={fMoneda} onChange={e=>setFMoneda(e.target.value)}>
            <option value="">Todas las monedas</option>
            <option value="PEN">S/ Soles (PEN)</option>
            <option value="USD">US$ Dólares (USD)</option>
          </select>
          <div style={{display:'flex', gap:8, alignItems:'center', flex:'1 1 240px'}}>
            <span style={{fontSize:12, color:'var(--fg-muted)', whiteSpace:'nowrap'}}>Vence:</span>
            <input className="input" type="date" value={fVenceDesde} onChange={e=>setFVenceDesde(e.target.value)} style={{flex:1}} />
            <span style={{fontSize:12, color:'var(--fg-muted)'}}>-</span>
            <input className="input" type="date" value={fVenceHasta} onChange={e=>setFVenceHasta(e.target.value)} style={{flex:1}} />
          </div>
          <div style={{display:'flex', gap:8, alignItems:'center', flex:'1 1 160px'}}>
            <span style={{fontSize:12, color:'var(--fg-muted)', whiteSpace:'nowrap'}}>Mora:</span>
            <input className="input" type="number" min="0" placeholder="Mín" value={fMoraDesde} onChange={e=>setFMoraDesde(e.target.value)} style={{flex:1}} />
            <input className="input" type="number" min="0" placeholder="Máx" value={fMoraHasta} onChange={e=>setFMoraHasta(e.target.value)} style={{flex:1}} />
          </div>
          {hayFiltros && (
            <button className="icon-btn" onClick={()=>{setFCliente('');setFEstado('');setFMoneda('');setFVenceDesde('');setFVenceHasta('');setFMoraDesde('');setFMoraHasta('');setFGestor('');setFPeriodoEmision('');setAgingFilter(null);}} title="Limpiar filtros">
              ✕
            </button>
          )}
        </div>
      </div>

      {seccionesMoneda.map(sec => {`;

const cxcFilterBlockReplacement = `      {(() => {
        const firstVisibleIdx = seccionesMoneda.findIndex(s => s.rows.length > 0);
        const FiltersUI = (
          <div className="card-head row" style={{gap:12, flexWrap:'wrap', alignItems:'center'}}>
            <input className="input" placeholder="Buscar cliente..." value={fCliente} onChange={e=>setFCliente(e.target.value)} style={{flex:'1 1 200px'}} />
            <select className="input" style={{flex:'1 1 140px'}} value={fPeriodoEmision} onChange={e=>setFPeriodoEmision(e.target.value)}>
              <option value="">Todos los períodos</option>
              {periodoOptsEmision.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <select className="input" style={{flex:'1 1 140px'}} value={fEstado} onChange={e=>setFEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="input" style={{flex:'1 1 120px'}} value={fMoneda} onChange={e=>setFMoneda(e.target.value)}>
              <option value="">Todas las monedas</option>
              <option value="PEN">S/ Soles (PEN)</option>
              <option value="USD">US$ Dólares (USD)</option>
            </select>
            <div style={{display:'flex', gap:8, alignItems:'center', flex:'1 1 240px'}}>
              <span style={{fontSize:12, color:'var(--fg-muted)', whiteSpace:'nowrap'}}>Vence:</span>
              <input className="input" type="date" value={fVenceDesde} onChange={e=>setFVenceDesde(e.target.value)} style={{flex:1}} />
              <span style={{fontSize:12, color:'var(--fg-muted)'}}>-</span>
              <input className="input" type="date" value={fVenceHasta} onChange={e=>setFVenceHasta(e.target.value)} style={{flex:1}} />
            </div>
            <div style={{display:'flex', gap:8, alignItems:'center', flex:'1 1 160px'}}>
              <span style={{fontSize:12, color:'var(--fg-muted)', whiteSpace:'nowrap'}}>Mora:</span>
              <input className="input" type="number" min="0" placeholder="Mín" value={fMoraDesde} onChange={e=>setFMoraDesde(e.target.value)} style={{flex:1}} />
              <input className="input" type="number" min="0" placeholder="Máx" value={fMoraHasta} onChange={e=>setFMoraHasta(e.target.value)} style={{flex:1}} />
            </div>
            {hayFiltros && (
              <button className="icon-btn" onClick={()=>{setFCliente('');setFEstado('');setFMoneda('');setFVenceDesde('');setFVenceHasta('');setFMoraDesde('');setFMoraHasta('');setFGestor('');setFPeriodoEmision('');setAgingFilter(null);}} title="Limpiar filtros">
                ✕
              </button>
            )}
          </div>
        );

        if (firstVisibleIdx === -1) {
          return (
            <div className="card mt-6">
              {FiltersUI}
              <div style={{padding: 40, textAlign:'center', color:'var(--fg-muted)'}}>
                No hay registros que coincidan con los filtros.
              </div>
            </div>
          );
        }

        return seccionesMoneda.map((sec, index) => {`;
code = code.replace(cxcFilterBlockOriginal, cxcFilterBlockReplacement);

const cxcLoopEndOriginal = `                  )}
                </tbody>
              </table>
            </div>
          </div>
        </React.Fragment>
        );
      })}`;

const cxcLoopEndReplacement = `                  )}
                </tbody>
              </table>
            </div>
          </div>
        </React.Fragment>
        );
      })()}`;

// we must ONLY replace the cxc map closing bracket!
const cxcStart = code.indexOf('function CxC() {');
const cxpStart = code.indexOf('function CxP() {');

const cxcTableOriginal = `          <div className="card mt-6">
            <div className="table-wrap">`;
const cxcTableReplacement = `          <div className="card mt-6">
            {index === firstVisibleIdx && FiltersUI}
            <div className="table-wrap">`;
let cxcBody = code.substring(cxcStart, cxpStart);
cxcBody = cxcBody.replace(cxcTableOriginal, cxcTableReplacement);
cxcBody = cxcBody.replace(cxcLoopEndOriginal, cxcLoopEndReplacement);

code = code.substring(0, cxcStart) + cxcBody + code.substring(cxpStart);

fs.writeFileSync('src/pages_fin.jsx', code);
console.log('PATCH APPLIED');
