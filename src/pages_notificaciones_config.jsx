import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from './context.jsx';
import { listarNotificacionesConfig, guardarNotificacionConfig, listarEnviosNotificaciones, ejecutarNotificacionesAhora, listarTelefonosUsuariosNotificaciones, guardarTelefonoUsuarioNotificaciones, normalizarDiasAnticipacion, normalizarDiasVencidoMax, validarUmbralMinutos, normalizarCorreosAdicionales, normalizarTelefonoWhatsApp, normalizarTelefonosAdicionales, construirMatrizDestinatarios, reglaTieneCambios, etiquetaEstadoEnvio, etiquetaRolDestinatario, etiquetaCanalEnvio } from './services/notificacionesConfigService.js';
import './notificaciones_config.css';

const ROLE_LABELS = {
  rrhh: ['RRHH y administradores', 'Todos los usuarios con rol RRHH o administrador'],
  jefe: ['Jefe directo', 'Según el organigrama del colaborador'],
  colaborador: ['Colaborador', 'Solo si tiene usuario en el ERP'],
};
const ROLE_LABELS_TARDANZA = {
  rrhh: ['RRHH y administradores', 'Resumen de toda la empresa'],
  jefe: ['Jefe directo', 'Solo las tardanzas de su equipo'],
};
const clone = value => JSON.parse(JSON.stringify(value ?? {}));
const normalizarRegla = row => {
  const regla = { ...row, parametros: clone(row.parametros), destinatarios: clone(row.destinatarios) };
  regla.__original = clone({ activo: regla.activo, parametros: regla.parametros, destinatarios: regla.destinatarios });
  return regla;
};
const fechaHora = value => value
  ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : 'Sin cambios desde la instalación';
const fechaEnvio = value => value
  ? new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '—';
const escudo = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');


export default function NotificacionesConfig() {
  const { empresa } = useApp();
  const empresaId = empresa?.id;
  const [eventos, setEventos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [tab, setTab] = useState('eventos');
  const [filtro, setFiltro] = useState('');
  const [estado, setEstado] = useState('');
  const [busy, setBusy] = useState({});
  const [correoBorrador, setCorreoBorrador] = useState({});
  const [correoError, setCorreoError] = useState({});
  const [mostrarAgregarDia, setMostrarAgregarDia] = useState({});
  const [diaBorrador, setDiaBorrador] = useState({});
  const [diaError, setDiaError] = useState({});
  const [telefonoBorrador, setTelefonoBorrador] = useState({});
  const [telefonoError, setTelefonoError] = useState({});
  const [telefonosUsuarios, setTelefonosUsuarios] = useState([]);
  const [telefonosUsuariosError, setTelefonosUsuariosError] = useState('');
  const [telefonoUsuarioBorrador, setTelefonoUsuarioBorrador] = useState({});
  const [telefonoUsuarioError, setTelefonoUsuarioError] = useState({});

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); setError('Selecciona una empresa para configurar sus notificaciones.'); return; }
    setLoading(true); setError('');
    try {
      const [configResp, enviosResp] = await Promise.all([
        listarNotificacionesConfig(empresaId),
        listarEnviosNotificaciones(empresaId),
      ]);
      if (configResp.error) throw configResp.error;
      if (enviosResp.error) throw enviosResp.error;
      setEventos((configResp.data || []).map(normalizarRegla));
      setHistorial(enviosResp.data || []);
      try {
        const usuariosResp = await listarTelefonosUsuariosNotificaciones(empresaId);
        if (usuariosResp.error) throw usuariosResp.error;
        const usuarios = usuariosResp.data || [];
        setTelefonosUsuarios(usuarios);
        setTelefonoUsuarioBorrador(Object.fromEntries(usuarios.map(usuario => [usuario.user_id, usuario.telefono || ''])));
        setTelefonosUsuariosError('');
      } catch (usersError) {
        setTelefonosUsuariosError(usersError?.message || 'No se pudieron cargar los teléfonos de usuarios.');
        setTelefonosUsuarios([]);
      }
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar las notificaciones.');
    } finally { setLoading(false); }
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const activos = eventos.filter(evento => !evento.legado && evento.activo).length;
  const ultimaSemana = useMemo(() => historial.filter(envio => Date.now() - new Date(envio.creado_en).getTime() <= 7 * 86400000), [historial]);
  const errores = ultimaSemana.filter(envio => envio.estado === 'error').length;
  const listados = useMemo(() => historial.filter(envio => {
    const matchEstado = !estado || envio.estado === estado;
    const q = escudo(filtro);
    return matchEstado && (!q || escudo([envio.destinatario_nombre, envio.destinatario_email, envio.mensaje, envio.evento_nombre].join(' ')).includes(q));
  }), [historial, filtro, estado]);

  const editar = (codigo, fn) => setEventos(items => items.map(evento => evento.evento_codigo === codigo ? fn({ ...evento, parametros: clone(evento.parametros), destinatarios: clone(evento.destinatarios) }) : evento));
  const guardar = async evento => {
    setBusy(state => ({ ...state, [evento.evento_codigo]: true })); setMensaje(''); setError('');
    try {
      const parametrosEvento = evento.parametros || {};
      let parametros = {};
      if (evento.evento_codigo === 'tardanza_resumen_diario') parametros.umbral_minutos = validarUmbralMinutos(parametrosEvento.umbral_minutos);
      else if (Array.isArray(parametrosEvento.dias_anticipacion)) parametros.dias_anticipacion = normalizarDiasAnticipacion(parametrosEvento.dias_anticipacion);
      else if (evento.evento_codigo === 'contrato_vencido') parametros.dias_vencido_max = normalizarDiasVencidoMax(parametrosEvento.dias_vencido_max);
      const { error: rpcError } = await guardarNotificacionConfig({
        empresaId, evento: evento.evento_codigo, activo: evento.activo,
        parametros, destinatarios: construirMatrizDestinatarios(evento.destinatarios, evento.roles_soportados || [], evento.canales_soportados || []),
      });
      if (rpcError) throw rpcError;
      setEventos(items => items.map(item => item.evento_codigo === evento.evento_codigo ? {
        ...item,
        actualizado_en: new Date().toISOString(),
        __original: clone({ activo: evento.activo, parametros: evento.parametros, destinatarios: evento.destinatarios }),
      } : item));
      setMensaje(`Se guardó “${evento.nombre}”.`);
    } catch (err) { setError(err?.message || 'No se pudieron guardar los cambios.'); }
    finally { setBusy(state => ({ ...state, [evento.evento_codigo]: false })); }
  };

  const probarAhora = async () => {
    setBusy(state => ({ ...state, probar: true })); setError(''); setMensaje('');
    try {
      const { data, error: rpcError } = await ejecutarNotificacionesAhora(empresaId);
      if (rpcError) throw rpcError;
      setMensaje(`Ejecución completada: ${Object.entries(data || {}).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${value}`).join(' · ') || 'sin avisos nuevos'}.`);
      const { data: rows, error: listError } = await listarEnviosNotificaciones(empresaId);
      if (listError) throw listError;
      setHistorial(rows || []);
    } catch (err) { setError(err?.message || 'No se pudo ejecutar la prueba.'); }
    finally { setBusy(state => ({ ...state, probar: false })); }
  };

  const guardarTelefonoUsuario = async usuario => {
    const id = usuario.user_id;
    setTelefonoUsuarioError(items => ({ ...items, [id]: '' }));
    setBusy(items => ({ ...items, [`telefono-${id}`]: true }));
    try {
      const { data, error: rpcError } = await guardarTelefonoUsuarioNotificaciones(empresaId, id, telefonoUsuarioBorrador[id] || '');
      if (rpcError) throw rpcError;
      const telefono = data || '';
      setTelefonosUsuarios(items => items.map(item => item.user_id === id ? { ...item, telefono } : item));
      setTelefonoUsuarioBorrador(items => ({ ...items, [id]: telefono }));
    } catch (err) {
      setTelefonoUsuarioError(items => ({ ...items, [id]: err?.message || 'No se pudo guardar el teléfono.' }));
    } finally { setBusy(items => ({ ...items, [`telefono-${id}`]: false })); }
  };

  const renderEvento = evento => {
    const codigo = evento.evento_codigo;
    const tardanzas = codigo === 'tardanza_resumen_diario';
    const tieneDias = Array.isArray(evento.parametros?.dias_anticipacion);
    const contratoVencido = codigo === 'contrato_vencido';
    const rolesLabels = tardanzas ? ROLE_LABELS_TARDANZA : ROLE_LABELS;
    const labels = Object.fromEntries((evento.roles_soportados || []).filter(rol => rolesLabels[rol]).map(rol => [rol, rolesLabels[rol]]));
    const dias = tieneDias ? normalizarDiasAnticipacion(evento.parametros.dias_anticipacion) : [];
    const valorDiasVencido = Number(evento.parametros?.dias_vencido_max);
    const diasVencidoMax = Number.isInteger(valorDiasVencido) && valorDiasVencido >= 1 && valorDiasVencido <= 365 ? valorDiasVencido : 30;
    const correos = normalizarCorreosAdicionales(evento.destinatarios?.correos_adicionales);
    const telefonos = normalizarTelefonosAdicionales(evento.destinatarios?.telefonos_adicionales);
    const canalesVisibles = ['campana', 'correo', 'whatsapp'].filter(canal => evento.canales_soportados?.includes(canal));
    const sucio = reglaTieneCambios(evento);
    const agregarCorreo = () => {
      try {
        const valor = String(correoBorrador[codigo] || '').trim();
        if (!valor) throw new RangeError('Ingresa un correo válido.');
        const nuevos = normalizarCorreosAdicionales([...correos, valor]);
        editar(codigo, item => ({ ...item, destinatarios: { ...item.destinatarios, correos_adicionales: nuevos }, __saved: false }));
        setCorreoBorrador(items => ({ ...items, [codigo]: '' }));
        setCorreoError(items => ({ ...items, [codigo]: '' }));
      } catch (err) { setCorreoError(items => ({ ...items, [codigo]: err.message || 'Ingresa un correo válido.' })); }
    };
    const agregarTelefono = () => {
      try {
        const valor = String(telefonoBorrador[codigo] || '').trim();
        if (!valor) throw new RangeError('Ingresa un teléfono válido.');
        const nuevos = normalizarTelefonoWhatsApp([...telefonos, valor]);
        editar(codigo, item => ({ ...item, destinatarios: { ...item.destinatarios, telefonos_adicionales: nuevos }, __saved: false }));
        setTelefonoBorrador(items => ({ ...items, [codigo]: '' }));
        setTelefonoError(items => ({ ...items, [codigo]: '' }));
      } catch (err) { setTelefonoError(items => ({ ...items, [codigo]: err.message || 'Ingresa un teléfono válido.' })); }
    };
    const agregarDia = () => {
      try {
        const valor = diaBorrador[codigo];
        const nuevos = normalizarDiasAnticipacion([...dias, valor === '' ? NaN : Number(valor)]);
        editar(codigo, item => ({ ...item, parametros: { ...item.parametros, dias_anticipacion: nuevos }, __saved: false }));
        setDiaBorrador(items => ({ ...items, [codigo]: '' }));
        setDiaError(items => ({ ...items, [codigo]: '' }));
        setMostrarAgregarDia(items => ({ ...items, [codigo]: false }));
      } catch { setDiaError(items => ({ ...items, [codigo]: 'Indica un número único entre 1 y 180, con un máximo de 5 avisos.' })); }
    };
    return <article className="dx-notif-card" data-activo={String(evento.activo)} key={codigo}>
      <div className="dx-notif-card-top">
        <div className={`dx-notif-ico ${tardanzas ? 'dx-notif-ico--vio' : ''}`} aria-hidden="true">{tardanzas ? '◷' : '▤'}</div>
        <div className="dx-notif-card-main"><div className="dx-notif-card-name"><h3>{evento.nombre}</h3><span className={`dx-notif-mod ${tardanzas ? 'dx-notif-mod--vio' : ''}`}>{evento.modulo === 'rrhh' ? 'RRHH' : 'Asistencia'}</span><span className={`dx-notif-pill ${evento.activo ? 'dx-notif-pill--on' : 'dx-notif-pill--off'}`}>{evento.activo ? 'Activo' : 'Inactivo'}</span></div><p className="dx-notif-desc">{evento.descripcion}</p></div>
        <label className="dx-notif-toggle"><span>{evento.activo ? 'Activado' : 'Desactivado'}</span><button type="button" className="dx-notif-switch" role="switch" aria-checked={String(evento.activo)} aria-label={`Activar ${evento.nombre}`} onClick={() => editar(codigo, item => ({ ...item, activo: !item.activo, __saved: false }))} /></label>
      </div>
      <div className="dx-notif-body">
        <div>
          {tardanzas ? <><div className="dx-notif-label">Umbral de tardanza</div><label className="dx-notif-num">Más de <input type="number" min="1" max="480" value={evento.parametros?.umbral_minutos ?? 10} aria-label="Minutos de tardanza" onChange={e => editar(codigo, item => ({ ...item, parametros: { ...item.parametros, umbral_minutos: e.target.value === '' ? '' : Number(e.target.value), }, __saved: false }))} /> minutos</label><div className="dx-notif-hint">Las tardanzas justificadas o anuladas no se incluyen.</div></> : tieneDias ? <><div className="dx-notif-label">Avisar antes del vencimiento</div><div className="dx-notif-days">{dias.map(dia => <span className="dx-notif-day" key={dia}>{dia} días <button type="button" aria-label={`Quitar aviso de ${dia} días`} onClick={() => editar(codigo, item => ({ ...item, parametros: { ...item.parametros, dias_anticipacion: dias.filter(d => d !== dia) }, __saved: false }))}>×</button></span>)}{dias.length < 5 && (mostrarAgregarDia[codigo] ? <form className="dx-notif-inline-form" onSubmit={e => { e.preventDefault(); agregarDia(); }}><input className="dx-notif-inline-input" type="number" min="1" max="180" step="1" autoFocus aria-label="Días antes del vencimiento" value={diaBorrador[codigo] ?? ''} aria-invalid={Boolean(diaError[codigo])} aria-describedby={diaError[codigo] ? `dia-error-${codigo}` : undefined} onKeyDown={e => { if (e.key === 'Escape') { setMostrarAgregarDia(items => ({ ...items, [codigo]: false })); setDiaError(items => ({ ...items, [codigo]: '' })); } }} onChange={e => { setDiaBorrador(items => ({ ...items, [codigo]: e.target.value })); setDiaError(items => ({ ...items, [codigo]: '' })); }} /><button type="submit" className="dx-notif-add">Agregar</button><button type="button" className="dx-notif-add" onClick={() => { setMostrarAgregarDia(items => ({ ...items, [codigo]: false })); setDiaError(items => ({ ...items, [codigo]: '' })); }}>Cancelar</button></form> : <button type="button" className="dx-notif-add" onClick={() => { setMostrarAgregarDia(items => ({ ...items, [codigo]: true })); setDiaBorrador(items => ({ ...items, [codigo]: '' })); }}>+ Agregar aviso</button>)}</div>{diaError[codigo] && <div className="dx-notif-inline-error" id={`dia-error-${codigo}`} role="alert">{diaError[codigo]}</div>}<div className="dx-notif-hint">{codigo === 'contrato_por_vencer' ? (dias.length ? <>Hasta 5 avisos, entre 1 y 180 días. En la campana, cada aviso llega una vez por contrato. El correo diario incluye todos los contratos que vencen dentro del aviso más largo ({Math.max(...dias)} días).</> : 'Hasta 5 avisos, entre 1 y 180 días. En la campana, cada aviso llega una vez por contrato.') : <>Hasta 5 avisos, entre 1 y 180 días. En la campana, cada aviso llega una vez por documento. {dias.length > 0 && <>El correo diario incluye todos los documentos que vencen dentro del aviso más largo ({Math.max(...dias)} días).</>} No incluye contratos.</>}</div></> : contratoVencido ? <><div className="dx-notif-label">Rango de contratos vencidos</div><label className="dx-notif-num"><input type="number" min="1" max="365" step="1" value={evento.parametros?.dias_vencido_max ?? 30} aria-label="Días hacia atrás para avisar contratos vencidos" aria-invalid={evento.parametros?.dias_vencido_max === '' || Number(evento.parametros?.dias_vencido_max) < 1 || Number(evento.parametros?.dias_vencido_max) > 365 || !Number.isInteger(Number(evento.parametros?.dias_vencido_max))} onChange={e => editar(codigo, item => ({ ...item, parametros: { ...item.parametros, dias_vencido_max: e.target.value === '' ? '' : Number(e.target.value) }, __saved: false }))} /> días</label><div className="dx-notif-hint">En la campana avisa una vez por contrato vencido. El correo diario lista los contratos vencidos sin renovación de los últimos {diasVencidoMax} días.</div></> : null}
        </div>
        <div><div className="dx-notif-label">Quién recibe y por dónde</div><table className="dx-notif-matrix"><thead><tr><th>Destinatario</th>{canalesVisibles.map(canal => <th key={canal}>{canal === 'campana' ? 'Campana' : canal === 'correo' ? 'Correo' : 'WhatsApp'}</th>)}</tr></thead><tbody>{Object.entries(labels).map(([rol, [label, help]]) => <tr key={rol}><td>{label}<small>{help}</small></td>{canalesVisibles.map(canal => <td key={canal}><input className="dx-notif-check" type="checkbox" checked={Boolean(evento.destinatarios?.[rol]?.[canal])} aria-label={`${label} por ${canal}`} onChange={e => editar(codigo, item => ({ ...item, destinatarios: { ...item.destinatarios, [rol]: { ...item.destinatarios?.[rol], [canal]: e.target.checked } }, __saved: false }))} /></td>)}</tr>)}</tbody></table><div className="dx-notif-additional"><div className="dx-notif-label">Correos adicionales</div><div className="dx-notif-email-chips">{correos.map(correo => <span className="dx-notif-day" key={correo}>{correo}<button type="button" aria-label={`Quitar correo ${correo}`} onClick={() => editar(codigo, item => ({ ...item, destinatarios: { ...item.destinatarios, correos_adicionales: correos.filter(c => c !== correo) }, __saved: false }))}>×</button></span>)}</div><form noValidate className="dx-notif-inline-form" onSubmit={e => { e.preventDefault(); agregarCorreo(); }}><input className="dx-notif-inline-input dx-notif-email-input" type="email" aria-label="Correo adicional" value={correoBorrador[codigo] ?? ''} aria-invalid={Boolean(correoError[codigo])} aria-describedby={correoError[codigo] ? `correo-error-${codigo}` : undefined} onChange={e => { setCorreoBorrador(items => ({ ...items, [codigo]: e.target.value })); setCorreoError(items => ({ ...items, [codigo]: '' })); }} /><button type="submit" className="dx-notif-add">Agregar</button></form>{correoError[codigo] && <div className="dx-notif-inline-error" id={`correo-error-${codigo}`} role="alert">{correoError[codigo]}</div>}<div className="dx-notif-hint">Reciben este aviso por correo aunque no tengan usuario en el ERP. Máximo 10.</div></div>{evento.canales_soportados?.includes('whatsapp') && <div className="dx-notif-additional"><div className="dx-notif-label">Teléfonos adicionales (WhatsApp)</div><div className="dx-notif-email-chips">{telefonos.map(telefono => <span className="dx-notif-day" key={telefono}>{telefono}<button type="button" aria-label={`Quitar teléfono ${telefono}`} onClick={() => editar(codigo, item => ({ ...item, destinatarios: { ...item.destinatarios, telefonos_adicionales: telefonos.filter(t => t !== telefono) }, __saved: false }))}>×</button></span>)}</div><form noValidate className="dx-notif-inline-form" onSubmit={e => { e.preventDefault(); agregarTelefono(); }}><input className="dx-notif-inline-input dx-notif-phone-input" type="tel" aria-label="Teléfono adicional" placeholder="987654321 o +51987654321" value={telefonoBorrador[codigo] ?? ''} aria-invalid={Boolean(telefonoError[codigo])} aria-describedby={telefonoError[codigo] ? `telefono-error-${codigo}` : undefined} onChange={e => { setTelefonoBorrador(items => ({ ...items, [codigo]: e.target.value })); setTelefonoError(items => ({ ...items, [codigo]: '' })); }} /><button type="submit" className="dx-notif-add" disabled={telefonos.length >= 10}>Agregar</button></form>{telefonoError[codigo] && <div className="dx-notif-inline-error" id={`telefono-error-${codigo}`} role="alert">{telefonoError[codigo]}</div>}<div className="dx-notif-hint">Celular peruano de 9 dígitos que empiece con 9 o formato internacional con +. Se guarda normalizado a 51XXXXXXXXX. Máximo 10.</div></div>}</div>
      </div>
      <div className="dx-notif-foot"><span>{evento.actualizado_en != null ? `Última modificación: ${fechaHora(evento.actualizado_en)}` : 'Sin cambios desde la instalación'}</span><div className="dx-notif-foot-actions"><button type="button" className="dx-notif-btn" disabled={!evento.activo || busy.probar} onClick={probarAhora}>{busy.probar ? 'Ejecutando…' : 'Probar ahora'}</button><button type="button" className="dx-notif-btn dx-notif-btn--primary" disabled={!sucio || busy[codigo]} onClick={() => guardar(evento)}>{busy[codigo] ? 'Guardando…' : 'Guardar cambios'}</button></div></div>
    </article>;
  };

  return <>
    <main className="dx-notif">
      <header className="dx-notif-head"><div><div className="dx-notif-eyebrow">Configuración</div><h1 className="dx-notif-title">Notificaciones</h1><div className="dx-notif-sub">Elige qué avisos envía el sistema, con cuánta anticipación, a quién y por qué canal. Los avisos se generan cada mañana a las 7:20.</div></div></header>
      {error && <div className="dx-notif-alert" role="alert">{error}</div>}{mensaje && <div className="dx-notif-alert dx-notif-alert--ok" role="status">{mensaje}</div>}
      <div className="dx-notif-chips"><div className="dx-notif-chip"><b>{eventos.filter(e => !e.legado).length}</b> eventos configurables</div><div className="dx-notif-chip"><b>{activos}</b> activos</div><div className="dx-notif-chip"><b>{ultimaSemana.length}</b> envíos en los últimos 7 días</div><div className="dx-notif-chip"><b>{errores}</b> con error</div></div>
      <div className="dx-notif-tabs" role="tablist"><button className="dx-notif-tab" role="tab" aria-selected={String(tab === 'eventos')} onClick={() => setTab('eventos')}>Eventos</button><button className="dx-notif-tab" role="tab" aria-selected={String(tab === 'historial')} onClick={() => setTab('historial')}>Historial de envíos</button></div>
      {loading ? <div className="dx-notif-loading">Cargando configuración…</div> : tab === 'eventos' ? <section><div className="dx-notif-list">{eventos.filter(e => !e.legado).map(renderEvento)}</div><div className="dx-notif-users"><h2 className="dx-notif-section">Teléfonos de usuarios para WhatsApp</h2><p className="dx-notif-hint">WhatsApp solo llega a usuarios con teléfono registrado.</p>{telefonosUsuariosError && <div className="dx-notif-inline-error" role="alert">{telefonosUsuariosError}</div>}<div className="dx-notif-users-list">{telefonosUsuarios.map(usuario => <div className="dx-notif-user-row" key={usuario.user_id}><div className="dx-notif-user-info"><b>{usuario.nombre || 'Usuario'}</b><span>{usuario.rol || '—'}</span><span>{usuario.email || '—'}</span></div><input className="dx-notif-user-phone" type="tel" aria-label={`Teléfono de ${usuario.nombre || usuario.email || 'usuario'}`} placeholder="987654321 o +51987654321" value={telefonoUsuarioBorrador[usuario.user_id] ?? ''} aria-invalid={Boolean(telefonoUsuarioError[usuario.user_id])} onChange={e => { setTelefonoUsuarioBorrador(items => ({ ...items, [usuario.user_id]: e.target.value })); setTelefonoUsuarioError(items => ({ ...items, [usuario.user_id]: '' })); }} /><button type="button" className="dx-notif-btn" disabled={busy[`telefono-${usuario.user_id}`]} onClick={() => guardarTelefonoUsuario(usuario)}>{busy[`telefono-${usuario.user_id}`] ? 'Guardando…' : 'Guardar'}</button>{telefonoUsuarioError[usuario.user_id] && <div className="dx-notif-inline-error dx-notif-user-error" role="alert">{telefonoUsuarioError[usuario.user_id]}</div>}</div>)}</div></div><h2 className="dx-notif-section">Avisos del sistema</h2><div className="dx-notif-sys">{eventos.filter(e => e.legado).map(evento => <div className="dx-notif-sys-row" key={evento.evento_codigo}><div><b>{evento.nombre}</b><span className="t">{evento.descripcion}</span></div><span className="dx-notif-pill dx-notif-pill--sys">Siempre activo · campana</span></div>)}</div></section> : <section><div className="dx-notif-hist"><div className="dx-notif-hist-tool"><h3>Envíos</h3><span className="dx-notif-count">{listados.length}</span><select className="dx-notif-filter" aria-label="Filtrar por estado" value={estado} onChange={e => setEstado(e.target.value)}><option value="">Todos los estados</option><option value="enviado">Enviado</option><option value="pendiente">Pendiente</option><option value="enviando">Enviando</option><option value="error">Error</option><option value="omitido">Omitido</option><option value="simulado">Simulado (sin credenciales)</option></select><input className="dx-notif-search" type="search" placeholder="Buscar destinatario o mensaje" aria-label="Buscar en el historial" value={filtro} onChange={e => setFiltro(e.target.value)} /></div><div className="dx-notif-hrow dx-notif-hrow--head"><span>Fecha</span><span>Evento</span><span>Destinatario y mensaje</span><span>Canal</span><span>Estado</span></div>{listados.map(envio => { const { etiqueta, variante } = etiquetaEstadoEnvio(envio); return <div className="dx-notif-hrow" key={envio.id}><span className="m">{fechaEnvio(envio.creado_en)}</span><b>{envio.evento_nombre}</b><span><b>{envio.destinatario_nombre || envio.destinatario_email || 'Destinatario'}</b>{envio.rol_destinatario && <> · {etiquetaRolDestinatario(envio.rol_destinatario)}</>}<br /><span className="m">{envio.mensaje}</span></span><span className="dx-notif-canal">{etiquetaCanalEnvio(envio.canal)}</span><span className={`dx-notif-pill dx-notif-pill--${variante}`}>{etiqueta}</span></div>; })}{!listados.length && <div className="dx-notif-empty">{historial.length === 0 && !estado && !filtro.trim() ? 'Aún no se ha enviado ninguna notificación.' : 'No hay envíos que coincidan con el filtro.'}</div>}</div></section>}
    </main>
  </>;
}
