const fs = require('fs');
let code = fs.readFileSync('src/pages_fin.jsx', 'utf8');

const filterBlock = `      {(() => {
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

// 1. Remove the standalone filter card and change map to IIFE
const p1 = /<div className="card" style=\{\{marginTop:12\}\}>[\s\S]*?<\/div>\s*<\/div>\s*\{seccionesMoneda\.map\(sec => \{/;
code = code.replace(p1, filterBlock);

// 2. Inject FiltersUI inside the table card
const p2 = /<div className="card mt-6">\s*<div className="table-wrap">/g;
code = code.replace(p2, '<div className="card mt-6">\n            {index === firstVisibleIdx && FiltersUI}\n            <div className="table-wrap">');

// 3. Close the IIFE at the end
const p3 = /<\/React\.Fragment>\s*\);\s*\}\)/;
code = code.replace(p3, '</React.Fragment>\n        );\n      })()}');

fs.writeFileSync('src/pages_fin.jsx', code);
console.log('done');
