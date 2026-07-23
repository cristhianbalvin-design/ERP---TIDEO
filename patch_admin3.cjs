const fs = require('fs');

let content = fs.readFileSync('src/pages_admin.jsx', 'utf8');

const lines = content.split('\n');

// Find the index of the table wrap
let startIndex = -1;
for(let i=0; i<lines.length; i++) {
    if (lines[i].includes('<tr key={p.id} className="hover-row" onClick={() => { setSel(p.id); setTab(\'ficha\'); }} style={{cursor:\'pointer\'}}>')) {
        startIndex = i;
        break;
    }
}

if (startIndex !== -1) {
    const tdNew = `                    {visibleColsAdmin.includes('codigo') && <td className="mono text-muted">{p.codigo || '—'}</td>}
                    {visibleColsAdmin.includes('colaborador') && <td>
                      <div className="row">
                        <div className="avatar" style={{width:30,height:30,fontSize:11}}>{p.nombre.split(' ').map(x=>x[0]).slice(0,2).join('')}</div>
                        <div><strong>{p.nombre}</strong><div className="text-muted" style={{fontSize:11}}>DNI: {p.dni || p.documento || '—'}</div></div>
                      </div>
                    </td>}
                    {visibleColsAdmin.includes('cargo') && <td>{p.cargo}</td>}
                    {visibleColsAdmin.includes('unidad') && <td>{unidadNombrePorId.get(posiciones.find(pos => pos.id === p.posicion_id)?.unidad_organizacional_id) || p.area || <span className="text-subtle">Sin posición</span>}</td>}
                    {visibleColsAdmin.includes('sede') && <td>{p.sede ? <span className="badge badge-gray" style={{fontSize:11}}>{p.sede}</span> : <span className="text-subtle">—</span>}</td>}
                    {visibleColsAdmin.includes('turno') && <td>{esHon ? <span className="text-subtle">—</span> : <span className="text-muted" style={{fontSize:12}}>{turnosOptions.find(t => t.id === p.turno_id)?.nombre || 'Sin turno'}</span>}</td>}
                    {visibleColsAdmin.includes('jornada') && <td>{esHon ? <span className="text-subtle">—</span> : <span className="text-muted" style={{fontSize:12}}>{labelOr(REGIMEN_JORNADA_LABELS, p.regimen_jornada || p.personal_asignaciones_jornada || 'general')}</span>}</td>}
                    {visibleColsAdmin.includes('contrato') && <td>{esHon ? <span className="text-subtle">—</span> : (
                      <span className={\`badge \${contratoInfoFila.estado === 'sin_contrato' && !p.cargo_confianza ? 'badge-red' : contratoInfoFila.badge}\`}>
                        {contratoInfoFila.texto}
                      </span>
                    )}</td>}
                    {visibleColsAdmin.includes('modalidad') && <td>{esHon ? <span className="text-subtle">—</span> : p.modalidad}</td>}
                    {visibleColsAdmin.includes('vacaciones') && <td className="num">{esHon ? <span className="text-subtle">—</span> : \`\${rrhhAdminCalcVacProp(p, solicitudesRRHH)} días\`}</td>}
                    {visibleColsAdmin.includes('estado') && <td>
                      <span className="badge badge-green">{p.estado}</span>
                      {!esHon && !p.sede && !p.turno_id && <span className="badge badge-gray" style={{fontSize:10, marginLeft:4}}>Ficha incompleta</span>}
                    </td>}
                    {visibleColsAdmin.includes('acciones') && <td>
                      <div style={{display:'flex', gap:4, justifyContent:'flex-end'}}>
                        <button className="btn btn-sm btn-ghost" onClick={e=>{e.stopPropagation();setSel(p.id);setTab('ficha');}}>Ver ficha</button>
                        <button className="icon-btn" title="Editar colaborador" style={{color:'var(--cyan)'}} onClick={e=>{e.stopPropagation();abrirEditarColaborador(p);}}>{I.edit}</button>
                        <button className="icon-btn" title="Eliminar colaborador" style={{color:'var(--danger)'}} onClick={e=>{e.stopPropagation();eliminarColaborador(p);}}>{I.trash}</button>
                      </div>
                    </td>}`;
    
    // The tr block is 30 lines long (from <td...codigo> to </td> under acciones).
    // Let's replace the next 30 lines.
    lines.splice(startIndex + 1, 30, tdNew);

    fs.writeFileSync('src/pages_admin.jsx', lines.join('\n'), 'utf8');
    console.log('Patched pages_admin.jsx successfully using line indexing.');
} else {
    console.log('Could not find start index');
}
