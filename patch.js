import fs from 'fs';

let ctx = fs.readFileSync('src/context.jsx', 'utf8');

ctx = ctx.replace(
  /const crearCargo = async \(cargo\) => {[\s\S]*?};/,
  `const crearCargo = async (cargo) => {
    if (isSupabaseConfigured() && empresa?.id) {
      const data = await maestrosService.crearCargo(empresa.id, cargo);
      setCargos(prev => [data, ...prev]);
      return data;
    } else {
      const nuevo = { ...cargo, id: generateId('car'), empresa_id: empresa?.id, created_at: new Date().toISOString() };
      setCargos(prev => [nuevo, ...prev]);
      return nuevo;
    }
  };
  const actualizarCargo = async (id, datos) => {
    if (isSupabaseConfigured()) {
      const act = await maestrosService.actualizarCargo(id, datos);
      setCargos(prev => prev.map(c => c.id === id ? act : c));
      return act;
    } else {
      setCargos(prev => prev.map(c => c.id === id ? { ...c, ...datos } : c));
      return datos;
    }
  };
  const eliminarCargo = async (id) => {
    if (isSupabaseConfigured()) {
      await maestrosService.eliminarCargo(id);
    }
    setCargos(prev => prev.filter(c => c.id !== id));
  };`
);

ctx = ctx.replace(
  /cargos, setCargos,/,
  `cargos, setCargos, actualizarCargo, eliminarCargo,`
);

fs.writeFileSync('src/context.jsx', ctx, 'utf8');

let adm = fs.readFileSync('src/pages_admin.jsx', 'utf8');

adm = adm.replace(
  /cargos, especialidades, tiposServicio, almacenes, sedes, industrias, crearCargo,/,
  `cargos, especialidades, tiposServicio, almacenes, sedes, industrias, crearCargo, actualizarCargo, eliminarCargo,`
);

// Add editing state and delete logic to Maestros
adm = adm.replace(
  /const \[sel, setSel\] = useState\(null\);/,
  `const [sel, setSel] = useState(null);\n  const [editandoId, setEditandoId] = useState(null);`
);

adm = adm.replace(
  /setNuevo\(nuevoBase\);\n      }\n    } catch \(err\) {/,
  `setNuevo(nuevoBase);\n        setEditandoId(null);\n      }\n    } catch (err) {`
);

adm = adm.replace(
  /const addRow = async \(e\) => {[\s\S]*?try {/,
  `const addRow = async (e) => {
    e.preventDefault();
    if (!sel) return;
    setFormSaving(true);
    setFormError('');
    const base = {
      codigo: editandoId ? nuevo.codigo : autoCode(sel.id, selectedRows.length),
      nombre: nuevo.nombre || 'Nuevo valor',
      estado: nuevo.estado
    };
    try {`
);

adm = adm.replace(
  /await crearCargo\(item\);/,
  `if (editandoId) await actualizarCargo(editandoId, item); else await crearCargo(item);`
);

adm = adm.replace(
  /if \(sel\?\.id === 'mst_cargos'\) return \([\s\S]*?<\/table>\n    \);/,
  `if (sel?.id === 'mst_cargos') return (
      <table className="tbl">
        <thead><tr><th>Código</th><th>Cargo</th><th>Tipo</th><th>Descripción</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={\`\${r.codigo}-\${i}\`} style={{background: editandoId === r.id ? 'var(--bg-subtle)' : 'transparent'}}>
            <td className="mono text-muted">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td><span className={'badge '+(r.tipo==='Operativo'?'badge-cyan':r.tipo==='Ambos'?'badge-purple':'badge-gray')} style={{fontSize:11}}>{r.tipo||'—'}</span></td>
            <td className="text-muted" style={{fontSize:12}}>{r.detalle}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}>
              <button className="btn btn-sm btn-ghost" onClick={() => { setEditandoId(r.id); setNuevo({nombre:r.nombre, estado:r.estado, tipo_cargo:r.tipo, detalle:r.detalle, codigo:r.codigo}); }}>✏️</button>
              <button className="btn btn-sm btn-ghost" style={{color:'var(--danger)'}} onClick={async () => { if(window.confirm('¿Eliminar cargo?')) await eliminarCargo(r.id); }}>🗑️</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    );`
);

adm = adm.replace(
  /<button className="btn btn-primary" type="submit" disabled={formSaving} style={{width:'100%'}}>{I\.plus} {formSaving \? 'Guardando\.\.\.' : 'Agregar cargo'}<\/button>/,
  `<button className="btn btn-primary" type="submit" disabled={formSaving} style={{width:'100%'}}>{editandoId ? 'Actualizar cargo' : (I.plus + ' Agregar cargo')}</button>
           {editandoId && <button type="button" className="btn btn-secondary" style={{width:'100%', marginTop:6}} onClick={()=>{setEditandoId(null); setNuevo(nuevoBase);}}>Cancelar</button>}`
);

fs.writeFileSync('src/pages_admin.jsx', adm, 'utf8');
console.log('Done');
