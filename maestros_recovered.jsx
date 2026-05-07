  const addRow = async (e) => {
    e.preventDefault();
    if (!sel) return;
    setFormSaving(true);
    setFormError('');
    const base = {
      codigo: editandoId ? nuevo.codigo : autoCode(sel.id, selectedRows.length),
      nombre: nuevo.nombre || 'Nuevo valor',
      estado: nuevo.estado
    };
    try {
      if (sel.id === 'mst_cargos') {
        const item = { ...base, tipo:nuevo.tipo_cargo||'Administrativo', detalle:nuevo.detalle||'Pendiente de completar' };
        if (editandoId) await actualizarCargo(editandoId, item); else await crearCargo(item);
      } else if (sel.id === 'mst_especialidades') {
        const item = { ...base, area:nuevo.area||'General', requiere_cert:nuevo.requiere_cert, detalle:`${nuevo.area||'General'} ┬À Cert: ${nuevo.requiere_cert?'S├¡':'No'}` };
        await crearEspecialidad(item);
        const item = { ...base, categoria:nuevo.detalle||'General', detalle:nuevo.detalle||'General' };
        await crearIndustria(item);
      } else {
        return;
      }
      setNuevo(nuevoBase);
      addNotificacion?.(`${sel.tabla}: registro creado.`);
    } catch (err) {
      console.error(err);
      const msg = err?.message || 'No se pudo crear el registro en Supabase.';
      setFormError(msg);
      addNotificacion?.(`No se pudo crear el registro: ${msg}`);
    } finally {
      setFormSaving(false);
    }
  };

        ))}</tbody>
      </table>
    );
    if (sel?.id === 'mst_cargos') return (
      <table className="tbl">
        <thead><tr><th>C├│digo</th><th>Cargo</th><th>Tipo</th><th>Descripci├│n</th><th>Estado</th><th style={{textAlign:'right'}}>Acciones</th></tr></thead>
        <tbody>{selectedRows.map((r,i) => (
          <tr key={`${r.codigo}-${i}`} style={{background: editandoId === r.id ? 'var(--bg-subtle)' : 'transparent'}}>
            <td className="mono text-muted">{r.codigo}</td>
            <td><strong>{r.nombre}</strong></td>
            <td><span className={'badge '+(r.tipo==='Operativo'?'badge-cyan':r.tipo==='Ambos'?'badge-purple':'badge-gray')} style={{fontSize:11}}>{r.tipo||'ÔÇö'}</span></td>
            <td className="text-muted" style={{fontSize:12}}>{r.detalle}</td>
            <td><span className={'badge '+(r.estado==='activo'?'badge-green':'badge-gray')}>{r.estado}</span></td>
            <td style={{textAlign:'right', whiteSpace:'nowrap'}}>
              <button className="btn btn-sm btn-ghost" onClick={() => { setEditandoId(r.id); setNuevo({nombre:r.nombre, estado:r.estado, tipo_cargo:r.tipo, detalle:r.detalle, codigo:r.codigo}); }}>Ô£Å´©Å</button>
              <button className="btn btn-sm btn-ghost" style={{color:'var(--danger)'}} onClick={async () => { if(window.confirm('┬┐Eliminar cargo?')) await eliminarCargo(r.id); }}>­ƒùæ´©Å</button>
            </td>
          </tr>
        ))}</tbody>
      </table>
          <div className="page-sub">Cat├ílogos de referencia globales del sistema</div>
        </div>
      </div>
      <div className="maestros-grid">
        {maestrosCatalogos.map(m => (
          <div key={m.id} className="maestro-card hover-raise">
            <div className="maestro-card-icon">{I.settings}</div>
            <div className="maestro-card-main">
              <div className="maestro-card-title">{m.tabla}</div>
              {m.id === 'mst_industrias' && (
                <div className="maestro-card-meta">
                  {industrias.length} valores - Actualizado en tiempo real
                </div>
              )}
            </div>
            <button className="btn btn-secondary btn-sm maestro-card-action" onClick={() => { setSel(m); setNuevo(nuevoBase); setFormError(''); }}>
              Gestionar {I.chevRight}
            </button>
          </div>
        ))}
      </div>

      <div className="maestros-help">
        <div className="maestros-help-icon">{I.users}</div>
        <div className="maestros-help-copy">
          <div className="maestros-help-title">┬┐Buscas gestionar personal?</div>
          <div className="maestros-help-text">El personal operativo se administra desde <strong>RRHH Operativo</strong> ┬À El personal administrativo desde <strong>RRHH Administrativo</strong></div>
        </div>
        <div className="maestros-help-actions">
          <button className="btn btn-secondary btn-sm" onClick={()=>navigate('rrhh_operativo')}>Ir a RRHH Operativo</button>
          <button className="btn btn-secondary btn-sm" onClick={()=>navigate('rrhh_admin')}>Ir a RRHH Administrativo</button>
        </div>
                <span className="badge badge-cyan">Validaci├│n de duplicados activa</span>
              </div>
            )}
            {formError && <div className="alert alert-danger" style={{marginBottom:16}}>{formError}</div>}
            {renderForm()}
            <div className="card">
              <div className="table-wrap">
const CARGOS_ADM = MOCK.cargosEmpresa.filter(c => c.tipo !== 'Operativo' && c.estado === 'activo').map(c => c.nombre);

function RRHHAdmin() {
  const { personalAdmin, vacacionesSolicitudes, licencias, solicitudesRRHH, aprobarVacacion, turnos, crearAdminPersonalCtx, actualizarAdminPersonalCtx, eliminarAdminPersonalCtx, empresa, addNotificacion } = useApp();
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('ficha');
  const [view, setView] = useState('personal');
  const [panelAlta, setPanelAlta] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [altaSaving, setAltaSaving] = useState(false);
  const [altaError, setAltaError] = useState('');
  const formAltaBase = { nombre:'', dni:'', fecha_nacimiento:'', telefono:'', email:'', direccion:'', codigo:'', cargo:'', area:'', sede:'', turno_id:'tur_005', modalidad:'Planilla', fecha_inicio:'', fecha_fin:'', remuneracion:'', dias_vacaciones:'30', estado:'activo' };
  const [formAlta, setFormAlta] = useState(formAltaBase);
  const todosPersonal = personalAdmin;
  const persona = sel ? todosPersonal.find(p => p.id === sel) : null;

  const cerrarPanelColaborador = () => {
    setPanelAlta(false);
    setEditandoId(null);
    setFormAlta(formAltaBase);
    setAltaError('');
  };
  const abrirNuevoColaborador = () => {
    setEditandoId(null);
    setFormAlta(formAltaBase);
    setPanelAlta(true);
  };
  const abrirEditarColaborador = (p) => {
    setEditandoId(p.id);
    setFormAlta({
      ...formAltaBase,
      nombre: p.nombre || '',
      dni: p.dni || p.documento || '',
      fecha_nacimiento: p.fecha_nacimiento || '',
      telefono: p.telefono || '',
      email: p.email || '',
      direccion: p.direccion || '',
      codigo: p.codigo || p.id || '',
      cargo: p.cargo || '',
      area: p.area || '',
      sede: p.sede || '',
      turno_id: p.turno_id || 'tur_005',
      modalidad: p.tipo_contrato || 'Planilla',
      fecha_inicio: p.fecha_inicio_contrato || p.fecha_ingreso || '',
      fecha_fin: p.fecha_fin_contrato || '',
      remuneracion: String(p.remuneracion ?? p.sueldo_base ?? ''),
      dias_vacaciones: String(p.dias_vacaciones_total ?? p.dias_vacaciones_disponibles ?? 30),
      estado: p.estado || 'activo',
    });
    setPanelAlta(true);
  };
  const eliminarColaborador = async (p) => {
    if (!window.confirm(`Eliminar a ${p.nombre}? Esta accion se reflejara en la base de datos.`)) return;
    try {
      await eliminarAdminPersonalCtx(p.id);
      if (sel === p.id) setSel(null);
      addNotificacion('Colaborador eliminado.');
    } catch (_) {
      addNotificacion('No se pudo eliminar el colaborador. Revisa permisos o registros relacionados.');
    }
  };

  const guardarColaborador = async (e) => {
    e.preventDefault();
    if (altaSaving) return;
    setAltaSaving(true);
    setAltaError('');
    const idx = todosPersonal.length + 1;
    const nuevo = {
      id: editandoId || `per_${Date.now()}`, empresa_id: empresa?.id,
      nombre: formAlta.nombre || 'Nuevo colaborador',
      dni: formAlta.dni || '00000000',
      fecha_nacimiento: formAlta.fecha_nacimiento || '',