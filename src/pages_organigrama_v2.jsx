import { useCallback, useEffect, useState } from 'react';
import { useApp } from './context.jsx';
import OrganigramaCanvas from './organigrama_v2/OrganigramaCanvas.jsx';
import { organigramaV2Service } from './services/organigramaV2Service.js';

const EMPRESA_VALIDACION_ID = 'emp_20609996464';

const errorText = error => error?.message || error?.details || 'No se pudo completar la operación.';

const sugerirRol = (niveles, roles, nivelId) => {
  if (!nivelId) return '';
  const nivel = niveles.find(item => item.id === nivelId);
  return roles.find(rol => rol.nivel_jerarquico === nivel?.codigo)?.id || roles[0]?.id || '';
};

const nivelIdDelCargo = (cargos, niveles, cargoId) => {
  const categoriaNivel = cargos.find(cargo => cargo.id === cargoId)?.categoria_nivel;
  return categoriaNivel ? niveles.find(nivel => nivel.codigo === categoriaNivel)?.id || '' : '';
};

const tienePermiso = (role, accion, pantalla) => {
  const asignados = role?.permisos?.[accion];
  return Boolean(
    role?.permisos?.todo
    || asignados === true
    || asignados?.includes?.(pantalla),
  );
};

const sugerirCodigoUO = (unidades = []) => {
  const existentes = new Set(unidades.map(unidad => String(unidad.codigo || '').trim().toUpperCase()));
  let consecutivo = 1;
  while (existentes.has(`UO-${String(consecutivo).padStart(3, '0')}`)) consecutivo += 1;
  return `UO-${String(consecutivo).padStart(3, '0')}`;
};

const Panel = ({ title, children, onClose }) => (
  <aside className="card" style={{ position: 'absolute', top: 16, right: 16, zIndex: 6, width: 330, maxWidth: 'calc(100% - 32px)', padding: 16, boxShadow: '0 14px 32px rgba(15,23,42,.18)' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
      <button type="button" className="btn btn-secondary" style={{ padding: '3px 7px', fontSize: 12 }} onClick={onClose}>Cerrar</button>
    </div>
    {children}
  </aside>
);

export default function OrganigramaV2Page({ empresaIdOverride, preview = false }) {
  const { empresa, role, crearUnidadOrganizacional, actualizarUnidadOrganizacional } = useApp();
  const empresaId = preview ? (empresaIdOverride || EMPRESA_VALIDACION_ID) : empresa?.id;
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [generacionPendienteId, setGeneracionPendienteId] = useState('');
  const [modoConexion, setModoConexion] = useState('todos');
  const [conexionHint, setConexionHint] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId) return null;
    try {
      setError('');
      const resultado = await organigramaV2Service.getDatos(empresaId);
      setDatos(resultado);
      return resultado;
    } catch (causa) {
      setError(errorText(causa));
      return null;
    }
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    cargar();
  }, [cargar, empresaId]);

  const catalogos = datos?.catalogos || { cargos: [], niveles: [], roles: [] };
  const puedeEditarOrganigrama = tienePermiso(role, 'editar', 'organigrama');
  const puedeCrearUO = puedeEditarOrganigrama && tienePermiso(role, 'crear', 'maestros');
  const abrirCrear = useCallback(unidad => {
    const cargoId = catalogos.cargos[0]?.id || '';
    const nivelId = nivelIdDelCargo(catalogos.cargos, catalogos.niveles, cargoId);
    setPanel({
      modo: 'crear',
      unidad,
      form: {
        cargoId,
        nivelJerarquicoId: nivelId,
        rolId: sugerirRol(catalogos.niveles, catalogos.roles, nivelId),
        cantidadPosiciones: 1,
      },
    });
  }, [catalogos]);

  const abrirEditar = useCallback(colocacion => {
    setPanel({
      modo: 'editar',
      colocacion,
      form: {
        rolId: colocacion.rol_id || '',
        cantidadPosiciones: colocacion.cantidad_posiciones || 1,
      },
    });
  }, []);

  const abrirCrearUO = useCallback(() => {
    if (!puedeCrearUO) return;
    setPanel({
      modo: 'crear_uo',
      form: {
        nombre: '',
        codigo: sugerirCodigoUO(datos?.unidadesOrganizacionales),
        unidadPadreId: '',
        categoria: 'otro',
      },
    });
  }, [datos?.unidadesOrganizacionales, puedeCrearUO]);

  const setForm = useCallback(cambio => {
    setPanel(actual => actual ? { ...actual, form: { ...actual.form, ...cambio } } : actual);
  }, []);

  const guardarLayout = useCallback(async ({ tipoNodo, nodoId, x, y }) => {
    try {
      await organigramaV2Service.guardarPosicionNodo({ empresaId, tipoNodo, nodoId, x, y });
      setNotice('Posición visual guardada.');
    } catch (causa) {
      setError(errorText(causa));
      throw causa;
    }
  }, [empresaId]);

  const crearJerarquia = useCallback(async ({ hija, padre }) => {
    try {
      setGuardando(true);
      const resultado = await organigramaV2Service.crearOActualizarCargoColocacion({
        id: hija.id,
        empresaId,
        sociedadId: hija.sociedad_id,
        unidadOrganizacionalId: hija.unidad_organizacional_id,
        cargoId: hija.cargo_id,
        nivelJerarquicoId: hija.nivel_jerarquico_id,
        rolId: hija.rol_id,
        cantidadPosiciones: hija.cantidad_posiciones,
        estado: hija.estado,
        reportaACargoColocacionId: padre.id,
      });
      setNotice(`Jerarquía guardada para ${hija.cargo?.nombre || hija.cargo_id} (${resultado.id}).`);
      await cargar();
    } catch (causa) {
      setError(errorText(causa));
      throw causa;
    } finally {
      setGuardando(false);
    }
  }, [cargar, empresaId]);

  const eliminarJerarquia = useCallback(async hija => {
    try {
      setGuardando(true);
      await organigramaV2Service.crearOActualizarCargoColocacion({
        id: hija.id,
        empresaId,
        sociedadId: hija.sociedad_id,
        unidadOrganizacionalId: hija.unidad_organizacional_id,
        cargoId: hija.cargo_id,
        nivelJerarquicoId: hija.nivel_jerarquico_id,
        rolId: hija.rol_id,
        cantidadPosiciones: hija.cantidad_posiciones,
        estado: hija.estado,
        reportaACargoColocacionId: null,
      });
      setNotice(`Jerarquía eliminada para ${hija.cargo?.nombre || hija.cargo_id}.`);
      await cargar();
    } catch (causa) {
      setError(errorText(causa));
      throw causa;
    } finally {
      setGuardando(false);
    }
  }, [cargar, empresaId]);

  const reasignarUO = useCallback(async ({ colocacion, unidad }) => {
    const unidadValida = (datos?.unidadesOrganizacionales || []).some(item => (
      item.id === unidad?.id && item.empresa_id === empresaId
    ));
    if (!unidadValida) throw new Error('La unidad organizacional no pertenece al tenant activo.');
    if (colocacion.unidad_organizacional_id === unidad.id) {
      setNotice(`${colocacion.cargo?.nombre || colocacion.cargo_id} ya pertenece a ${unidad.nombre}.`);
      return null;
    }
    try {
      setGuardando(true);
      const resultado = await organigramaV2Service.crearOActualizarCargoColocacion({
        id: colocacion.id,
        empresaId,
        sociedadId: colocacion.sociedad_id,
        unidadOrganizacionalId: unidad.id,
        cargoId: colocacion.cargo_id,
        nivelJerarquicoId: colocacion.nivel_jerarquico_id,
        rolId: colocacion.rol_id,
        cantidadPosiciones: colocacion.cantidad_posiciones,
        estado: colocacion.estado,
        reportaACargoColocacionId: colocacion.reporta_a_cargo_colocacion_id,
      });
      setNotice(`${colocacion.cargo?.nombre || colocacion.cargo_id} se asignó a ${unidad.nombre}; sus posiciones vinculadas se actualizaron.`);
      await cargar();
      return resultado;
    } catch (causa) {
      setError(errorText(causa));
      throw causa;
    } finally {
      setGuardando(false);
    }
  }, [cargar, datos?.unidadesOrganizacionales, empresaId]);

  const asignarUOPadre = useCallback(async ({ hija, padre }) => {
    const unidades = datos?.unidadesOrganizacionales || [];
    const hijaValida = unidades.some(unidad => unidad.id === hija?.id && unidad.empresa_id === empresaId);
    const padreValida = unidades.some(unidad => unidad.id === padre?.id && unidad.empresa_id === empresaId);
    if (!hijaValida || !padreValida) throw new Error('Las unidades organizacionales deben pertenecer al tenant activo.');
    if (hija.id === padre.id) throw new Error('Una unidad organizacional no puede ser su propia UO padre.');
    if (hija.unidad_padre_id === padre.id) {
      setNotice(`${hija.nombre} ya reporta a ${padre.nombre}.`);
      return null;
    }
    try {
      setGuardando(true);
      await actualizarUnidadOrganizacional(hija.id, { unidad_padre_id: padre.id });
      setNotice(`${padre.nombre} ahora es UO padre de ${hija.nombre}.`);
      await cargar();
    } catch (causa) {
      setError(errorText(causa));
      throw causa;
    } finally {
      setGuardando(false);
    }
  }, [actualizarUnidadOrganizacional, cargar, datos?.unidadesOrganizacionales, empresaId]);

  const eliminarUOPadre = useCallback(async hija => {
    try {
      setGuardando(true);
      await actualizarUnidadOrganizacional(hija.id, { unidad_padre_id: null });
      setNotice(`${hija.nombre} ya no tiene UO padre.`);
      await cargar();
    } catch (causa) {
      setError(errorText(causa));
      throw causa;
    } finally {
      setGuardando(false);
    }
  }, [actualizarUnidadOrganizacional, cargar]);

  const crearMatricial = useCallback(async ({ subordinada, jefe }) => {
    try {
      setGuardando(true);
      const resultado = await organigramaV2Service.crearRelacionMatricial({
        empresaId,
        posicionSubordinadaId: subordinada.id,
        posicionJefeId: jefe.id,
      });
      setNotice(`Relación matricial guardada (${resultado.id}).`);
      await cargar();
    } catch (causa) {
      setError(errorText(causa));
      throw causa;
    } finally {
      setGuardando(false);
    }
  }, [cargar, empresaId]);

  const eliminarMatricial = useCallback(async id => {
    try {
      setGuardando(true);
      await organigramaV2Service.eliminarRelacionMatricial(id);
      setNotice('Relación matricial eliminada.');
      await cargar();
    } catch (causa) {
      setError(errorText(causa));
      throw causa;
    } finally {
      setGuardando(false);
    }
  }, [cargar]);

  const eliminarUnidad = useCallback(async unidad => {
    if (!unidad?.id) return;
    if (!window.confirm(`¿Eliminar la UO "${unidad.nombre}"? Se borrará físicamente y de forma permanente.`)) return;
    try {
      setGuardando(true);
      setError('');
      const resultado = await organigramaV2Service.eliminarUnidadOrganizacional(unidad.id);
      setNotice(`Unidad organizacional ${resultado.nombre || unidad.nombre} eliminada.`);
      await cargar();
    } catch (causa) {
      setError(errorText(causa));
    } finally {
      setGuardando(false);
    }
  }, [cargar]);

  const eliminarColocacion = useCallback(async colocacion => {
    if (!colocacion?.id) return;
    const cargoNombre = colocacion.cargo?.nombre || colocacion.cargo_id;
    if (!window.confirm(`¿Eliminar el cargo "${cargoNombre}"? Se borrará la cargo-colocación y sus posiciones vacantes asociadas de forma permanente.`)) return;
    try {
      setGuardando(true);
      setError('');
      const resultado = await organigramaV2Service.eliminarCargoColocacion(colocacion.id);
      setNotice(`Cargo-colocación eliminada; posiciones vacantes eliminadas: ${resultado.posiciones_eliminadas || 0}.`);
      setPanel(null);
      await cargar();
    } catch (causa) {
      setError(errorText(causa));
    } finally {
      setGuardando(false);
    }
  }, [cargar]);

  const reintentarGeneracion = useCallback(async () => {
    if (!generacionPendienteId) return;
    try {
      setGuardando(true);
      const resultado = await organigramaV2Service.generarPosicionesDesdeColocacion(generacionPendienteId);
      setNotice(`Posiciones generadas para ${generacionPendienteId}: ${JSON.stringify(resultado)}.`);
      setError('');
      setGeneracionPendienteId('');
      await cargar();
    } catch (causa) {
      setError(`La cargo-colocación ${generacionPendienteId} existe, pero sigue sin poder generar posiciones: ${errorText(causa)}`);
    } finally {
      setGuardando(false);
    }
  }, [cargar, generacionPendienteId]);

  const guardarPanel = useCallback(async event => {
    event.preventDefault();
    if (!panel) return;
    try {
      setGuardando(true);
      setError('');
      if (panel.modo === 'crear_uo') {
        if (!puedeCrearUO) throw new Error('No tienes ambos permisos requeridos para crear una unidad organizacional.');
        const nombre = String(panel.form.nombre || '').trim();
        const codigo = String(panel.form.codigo || '').trim();
        if (!nombre || !codigo) throw new Error('Nombre y código son obligatorios para la unidad organizacional.');
        const creada = await crearUnidadOrganizacional({
          nombre,
          codigo,
          unidad_padre_id: panel.form.unidadPadreId || null,
          categoria: panel.form.categoria || 'otro',
          estado: 'activo',
        });
        setNotice(`Unidad organizacional ${creada.nombre} creada.`);
        setPanel(null);
      } else if (panel.modo === 'crear') {
        const creada = await organigramaV2Service.crearOActualizarCargoColocacion({
          empresaId,
          unidadOrganizacionalId: panel.unidad.id,
          cargoId: panel.form.cargoId,
          nivelJerarquicoId: panel.form.nivelJerarquicoId,
          rolId: panel.form.rolId,
          cantidadPosiciones: Number(panel.form.cantidadPosiciones),
        });
        try {
          const generadas = await organigramaV2Service.generarPosicionesDesdeColocacion(creada.id);
          setNotice(`Cargo-colocación creada (${creada.id}) y posiciones generadas: ${JSON.stringify(generadas)}.`);
          setGeneracionPendienteId('');
          setPanel(null);
        } catch (causaGeneracion) {
          setError(`La cargo-colocación ${creada.id} fue creada, pero no se generaron sus posiciones: ${errorText(causaGeneracion)}. Puedes reintentar la generación desde esta colocación.`);
          setGeneracionPendienteId(creada.id);
          setPanel(null);
        }
      } else {
        const colocacion = panel.colocacion;
        const resultado = await organigramaV2Service.crearOActualizarCargoColocacion({
          id: colocacion.id,
          empresaId,
          sociedadId: colocacion.sociedad_id,
          unidadOrganizacionalId: colocacion.unidad_organizacional_id,
          cargoId: colocacion.cargo_id,
          nivelJerarquicoId: colocacion.nivel_jerarquico_id,
          rolId: panel.form.rolId,
          cantidadPosiciones: Number(panel.form.cantidadPosiciones),
          estado: colocacion.estado,
          reportaACargoColocacionId: colocacion.reporta_a_cargo_colocacion_id,
        });
        setNotice(`Cargo-colocación ${resultado.id} actualizada.`);
        setPanel(null);
      }
      await cargar();
    } catch (causa) {
      setError(errorText(causa));
    } finally {
      setGuardando(false);
    }
  }, [cargar, crearUnidadOrganizacional, empresaId, panel, puedeCrearUO]);

  if (!empresaId) {
    return <section style={{ padding: 24 }}><div className="card" style={{ padding: 24 }}>Cargando empresa activa…</div></section>;
  }

  return (
    <section style={{ height: '100%', minHeight: 0, boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 24, maxWidth: 1680, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Organigrama v2</h1>
        <p className="text-muted" style={{ margin: '6px 0 0' }}>
          Validación interactiva para {empresaId}. Conecta UO → cargo-colocación para asignar unidad, UO padre → UO hija (arrastra desde el jefe hacia el subordinado), cargo-colocación hija → padre para jerarquía y posición subordinada → posición jefe para relación matricial.
        </p>
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: 10, marginBottom: 12, pointerEvents: 'none' }}>
        <span className="text-muted" style={{ fontSize: 12, fontWeight: 700, marginRight: 2 }}>Conectar:</span>
        {[
          ['todos', 'Todos'],
          ['uo', 'Asignar UO'],
          ['jerarquia', 'Jerarquía'],
          ['matricial', 'Matricial'],
          ['uo_padre', 'UO padre'],
        ].map(([modo, etiqueta]) => (
          <button
            key={modo}
            type="button"
            className={modoConexion === modo ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ padding: '5px 9px', fontSize: 12, pointerEvents: 'auto' }}
            onClick={() => setModoConexion(modo)}
            aria-pressed={modoConexion === modo}
          >
            {etiqueta}
          </button>
        ))}
        <span style={{ flex: 1, minWidth: 140 }} />
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="ov2-new-uo"
          style={{ padding: '5px 9px', fontSize: 12, pointerEvents: 'auto' }}
          disabled={!puedeCrearUO || guardando}
          title={puedeCrearUO ? 'Crear una nueva unidad organizacional' : 'Requiere los permisos Organigrama: editar y Maestros Base: crear.'}
          onClick={abrirCrearUO}
        >
          + Nueva UO
        </button>
        {conexionHint && <span className="text-muted" style={{ width: '100%', fontSize: 12 }}>{conexionHint}</span>}
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}
      {generacionPendienteId && (
        <div className="alert alert-warning" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span>La cargo-colocación <strong>{generacionPendienteId}</strong> existe, pero aún no tiene sus posiciones generadas.</span>
          <button type="button" className="btn btn-secondary" disabled={guardando} onClick={reintentarGeneracion}>{guardando ? 'Generando…' : 'Reintentar generar posiciones'}</button>
        </div>
      )}
      {!error && !datos && <div className="card" style={{ padding: 24 }}>Cargando organigrama…</div>}
      {datos && (
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <OrganigramaCanvas
            datos={datos}
            onCrearColocacion={abrirCrear}
            onEditarColocacion={abrirEditar}
            onEliminarUnidad={eliminarUnidad}
            onGuardarPosicion={guardarLayout}
            modoConexion={modoConexion}
            onConnectionHint={setConexionHint}
            onReasignarUO={reasignarUO}
            onAsignarUOPadre={asignarUOPadre}
            onCrearJerarquia={crearJerarquia}
            onEliminarUOPadre={eliminarUOPadre}
            onEliminarJerarquia={eliminarJerarquia}
            onCrearRelacionMatricial={crearMatricial}
            onEliminarRelacionMatricial={eliminarMatricial}
            onError={causa => setError(errorText(causa))}
          />

          {panel?.modo === 'crear' && (
            <Panel title={`Nuevo cargo en ${panel.unidad.nombre}`} onClose={() => setPanel(null)}>
              <form data-testid="ov2-create-form" onSubmit={guardarPanel} style={{ display: 'grid', gap: 10 }}>
                <div className="input-group"><label>Cargo</label><select data-testid="ov2-create-cargo" className="select" value={panel.form.cargoId} disabled={guardando} onChange={event => { const cargoId = event.target.value; const nivelJerarquicoId = nivelIdDelCargo(catalogos.cargos, catalogos.niveles, cargoId); setForm({ cargoId, nivelJerarquicoId, rolId: sugerirRol(catalogos.niveles, catalogos.roles, nivelJerarquicoId) }); }}>{catalogos.cargos.map(cargo => <option key={cargo.id} value={cargo.id}>{cargo.nombre}</option>)}</select></div>
                <div className="input-group"><label>Nivel</label><select data-testid="ov2-create-nivel" className="select" value={panel.form.nivelJerarquicoId} disabled={guardando} onChange={event => { const nivelJerarquicoId = event.target.value; setForm({ nivelJerarquicoId, rolId: sugerirRol(catalogos.niveles, catalogos.roles, nivelJerarquicoId) }); }}><option value="">Selecciona un nivel</option>{catalogos.niveles.map(nivel => <option key={nivel.id} value={nivel.id}>{nivel.nombre}</option>)}</select></div>
                <div className="input-group"><label>Rol sugerido (editable)</label><select data-testid="ov2-create-rol" className="select" value={panel.form.rolId} disabled={guardando} onChange={event => setForm({ rolId: event.target.value })}><option value="">Selecciona un rol</option>{catalogos.roles.map(rol => <option key={rol.id} value={rol.id}>{rol.nombre}</option>)}</select></div>
                <div className="input-group"><label>Cantidad de posiciones</label><input data-testid="ov2-create-cantidad" className="input" type="number" min="1" required value={panel.form.cantidadPosiciones} disabled={guardando} onChange={event => setForm({ cantidadPosiciones: event.target.value })} /></div>
                {(!panel.form.nivelJerarquicoId || !panel.form.rolId) && <div className="alert alert-warning" style={{ margin: 0, fontSize: 12 }}>{!panel.form.nivelJerarquicoId ? 'Selecciona un nivel para continuar.' : 'Selecciona un rol para continuar.'}</div>}
                <div className="text-muted" style={{ fontSize: 12 }}>Al guardar se crearán la cargo-colocación y sus sillas vacantes.</div>
                <button data-testid="ov2-create-submit" type="submit" className="btn btn-primary" disabled={guardando || !panel.form.cargoId || !panel.form.nivelJerarquicoId || !panel.form.rolId}>{guardando ? 'Guardando…' : 'Crear cargo y posiciones'}</button>
              </form>
            </Panel>
          )}

          {panel?.modo === 'crear_uo' && (
            <Panel title="Nueva unidad organizacional" onClose={() => setPanel(null)}>
              <form data-testid="ov2-create-uo-form" onSubmit={guardarPanel} style={{ display: 'grid', gap: 10 }}>
                <div className="input-group"><label>Nombre</label><input data-testid="ov2-create-uo-nombre" className="input" required autoFocus value={panel.form.nombre} disabled={guardando} onChange={event => setForm({ nombre: event.target.value })} /></div>
                <div className="input-group"><label>Código</label><input data-testid="ov2-create-uo-codigo" className="input" required value={panel.form.codigo} disabled={guardando} onChange={event => setForm({ codigo: event.target.value })} /></div>
                <div className="input-group"><label>UO padre <span className="text-muted">(opcional)</span></label><select data-testid="ov2-create-uo-padre" className="select" value={panel.form.unidadPadreId} disabled={guardando} onChange={event => setForm({ unidadPadreId: event.target.value })}><option value="">Sin UO padre</option>{(datos.unidadesOrganizacionales || []).filter(unidad => unidad.estado === 'activo').map(unidad => <option key={unidad.id} value={unidad.id}>{unidad.nombre}</option>)}</select></div>
                <div className="input-group"><label>Categoría <span className="text-muted">(opcional)</span></label><input data-testid="ov2-create-uo-categoria" className="input" value={panel.form.categoria} disabled={guardando} onChange={event => setForm({ categoria: event.target.value })} /></div>
                <button data-testid="ov2-create-uo-submit" type="submit" className="btn btn-primary" disabled={guardando || !panel.form.nombre.trim() || !panel.form.codigo.trim()}>{guardando ? 'Guardando…' : 'Crear UO'}</button>
              </form>
            </Panel>
          )}

          {panel?.modo === 'editar' && (
            <Panel title="Editar cargo-colocación" onClose={() => setPanel(null)}>
              <form data-testid="ov2-edit-form" onSubmit={guardarPanel} style={{ display: 'grid', gap: 10 }}>
                <div className="text-muted" style={{ fontSize: 12 }}>{panel.colocacion.cargo?.nombre || panel.colocacion.cargo_id}</div>
                <div className="input-group"><label>Rol</label><select data-testid="ov2-edit-rol" className="select" value={panel.form.rolId} disabled={guardando} onChange={event => setForm({ rolId: event.target.value })}>{catalogos.roles.map(rol => <option key={rol.id} value={rol.id}>{rol.nombre}</option>)}</select></div>
                <div className="input-group"><label>Cantidad de posiciones</label><input data-testid="ov2-edit-cantidad" className="input" type="number" min="1" required value={panel.form.cantidadPosiciones} disabled={guardando} onChange={event => setForm({ cantidadPosiciones: event.target.value })} /></div>
                <div className="text-muted" style={{ fontSize: 12 }}>Cambiar el rol de esta colocación no altera los roles vigentes de sus ocupantes.</div>
                <button data-testid="ov2-edit-submit" type="submit" className="btn btn-primary" disabled={guardando || !panel.form.rolId}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
                <button data-testid="ov2-edit-delete" type="button" className="btn btn-danger" disabled={guardando} onClick={() => eliminarColocacion(panel.colocacion)}>Eliminar cargo</button>
              </form>
            </Panel>
          )}
        </div>
      )}
    </section>
  );
}
