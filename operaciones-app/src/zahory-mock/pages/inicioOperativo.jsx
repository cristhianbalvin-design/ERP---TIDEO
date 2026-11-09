import React, { useEffect, useRef, useState } from 'react';
import { cargarInicioOperativo, fechaLima, saludoHora } from '../../services/inicioOperativoService.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';

function Boton({ children, onClick, principal = false }) {
  return <button type="button" className={`dx-opsi-btn${principal ? ' dx-opsi-primary' : ''}`} onClick={onClick}>{children}</button>;
}

function Tarjeta({ titulo, cantidad, children }) {
  return (
    <section className="dx-opsi-card">
      <header className="dx-opsi-card-head"><h2>{titulo}</h2>{cantidad != null && <span>{cantidad}</span>}</header>
      {children}
    </section>
  );
}

function Indicadores({ kpis }) {
  const items = [
    ['OT en ejecución', kpis.ejecucion, `avance promedio ${kpis.avance} %`],
    ['Programadas para hoy', kpis.programadas.length, kpis.programadas.length === 1 ? kpis.programadas[0].numero : 'OT programadas'],
    ['Partes por aprobar', kpis.partes, 'en revisión'],
    ['Equipos en mantenimiento', kpis.mantenimiento, `de ${kpis.propios} propios · toda la empresa`],
  ];
  return (
    <div className="dx-opsi-kpis">
      {items.map(([label, valor, detalle]) => (
        <div className="dx-opsi-kpi" key={label}>
          <span>{label}</span>
          <b>{valor}</b>
          <small>{detalle}</small>
        </div>
      ))}
    </div>
  );
}

function MiDia({ datos, onNavigate }) {
  const horas = datos.asignaciones.reduce((total, item) => total + Number(item.horas_estimadas || 0), 0);
  return (
    <Tarjeta titulo="Mi día" cantidad={`${datos.asignaciones.length} asignaciones · ${horas} h`}>
      {datos.asignaciones.length ? (
        <div className="dx-opsi-table-wrap">
          <table>
            <thead>
              <tr>
                <th>OT</th>
                <th>Técnico</th>
                <th>Puesto</th>
                <th>Horas</th>
                <th><span className="dx-opsi-sr">Acción</span></th>
              </tr>
            </thead>
            <tbody>
              {datos.asignaciones.map(item => (
                <tr key={item.id}>
                  <td>
                    <b>{item.ot.numero}</b>
                    <div className="dx-opsi-muted">{item.ot.servicio}</div>
                  </td>
                  <td>{item.tecnico?.nombre || '—'}</td>
                  <td>{item.puesto?.nombre || '—'}</td>
                  <td>{item.horas_estimadas ?? '—'}</td>
                  <td><Boton onClick={() => onNavigate('crear-parte-taller', { ot: item.ot_id })}>Registrar parte</Boton></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="dx-opsi-body dx-opsi-muted">No hay trabajo programado para hoy en el Planner</p>
      )}
      {datos.sinVinculo && (
        <p className="dx-opsi-body dx-opsi-muted">No se encontró un registro de personal vinculado a tu usuario; se muestran las asignaciones de tu alcance.</p>
      )}
    </Tarjeta>
  );
}

function Alertas({ datos, onNavigate }) {
  const alertas = [
    ...datos.sinParte.map(ot => ({
      key: `ot-${ot.id}`,
      titulo: `${ot.numero} sin parte hace 3 días o más`,
      detalle: ot.servicio,
      ruta: 'ots',
      color: 'amb',
    })),
    ...datos.certificaciones.map(cert => ({
      key: `cert-${cert.id}`,
      titulo: `${cert.activo?.codigo || 'Equipo'} · ${cert.tipo?.nombre || 'Certificación'} vence el ${cert.fecha_vencimiento}`,
      detalle: `${cert.activo?.nombre || ''} · toda la empresa`,
      ruta: 'certificaciones-activo',
      color: 'amb',
    })),
    ...datos.backlog.map(grupo => ({
      key: `backlog-${grupo.descripcion}`,
      titulo: `${grupo.cantidad} ${grupo.cantidad === 1 ? 'pedido pendiente' : 'pedidos pendientes'} de backlog`,
      detalle: grupo.descripcion,
      ruta: 'backlog',
      color: 'cyan',
    })),
    ...datos.liquidaciones.map(liquidacion => ({
      key: `liq-${liquidacion.id}`,
      titulo: `Liquidación ${liquidacion.numero} en revisión`,
      detalle: 'Flota',
      ruta: 'liquidacion',
      color: 'cyan',
    })),
  ];
  return (
    <Tarjeta titulo="Alertas" cantidad={alertas.length}>
      <div className="dx-opsi-body dx-opsi-alerts">
        {alertas.length ? alertas.map(alerta => (
          <div className="dx-opsi-alert" key={alerta.key}>
            <span className={`dx-opsi-dot dx-opsi-${alerta.color}`} />
            <div>
              <b>{alerta.titulo}</b>
              <div className="dx-opsi-muted">{alerta.detalle}</div>
            </div>
            <Boton onClick={() => onNavigate(alerta.ruta)}>Ver</Boton>
          </div>
        )) : <div className="dx-opsi-muted">Sin alertas por ahora</div>}
      </div>
    </Tarjeta>
  );
}

function Accesos({ onNavigate }) {
  const accesos = [
    ['Nueva OT', 'Bandeja de OTs', 'crear-ot'],
    ['Registrar parte', 'Partes de taller', 'partes-taller'],
    ['Crear acta', 'Despacho o retorno', 'checkout'],
    ['Abrir Planner', 'Trabajo programado', 'scheduler-despacho'],
  ];
  return (
    <Tarjeta titulo="Accesos rápidos">
      <div className="dx-opsi-body dx-opsi-quick">
        {accesos.map(([titulo, detalle, ruta]) => (
          <button type="button" key={ruta} onClick={() => onNavigate(ruta)}>
            <b>{titulo}</b>
            <small>{detalle}</small>
          </button>
        ))}
      </div>
    </Tarjeta>
  );
}

export default function InicioOperativo({ onNavigate }) {
  const sesion = useSesionOperativa();
  const sesionRef = useRef(sesion);
  sesionRef.current = sesion;
  const { estado, empresaId, sociedadId, vistaConsolidada, esAdminEmpresa } = sesion;
  const usuarioId = sesion.usuario?.id;
  const multisociedad = sesion.empresa?.multisociedad_habilitado;
  const sociedadesClave = JSON.stringify(sesion.sociedadesIdsAlcance);
  const puedeVerArea = esAdminEmpresa || sesion.permisos.some(
    permiso => ['planner', 'ot'].includes(permiso.pantalla) && permiso.puede_ver,
  );
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const hoy = fechaLima();
  useEffect(() => {
    let vigente = true;
    if (estado !== 'listo') return () => { vigente = false; };
    setCargando(true);
    setDatos(null);
    setError('');
    cargarInicioOperativo(sesionRef.current, hoy).then(resultado => {
      if (vigente) setDatos(resultado);
    }).catch(fallo => {
      if (vigente) setError(fallo.message || 'No se pudo cargar el inicio operativo.');
    }).finally(() => {
      if (vigente) setCargando(false);
    });
    return () => { vigente = false; };
  }, [estado, empresaId, usuarioId, sociedadId, vistaConsolidada, sociedadesClave, multisociedad, puedeVerArea, hoy]);
  const ahora = new Date();
  const fecha = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' }).format(ahora);
  const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', hourCycle: 'h23' }).format(ahora));
  const nombre = (sesion.usuario?.user_metadata?.nombre || sesion.usuario?.user_metadata?.full_name || sesion.usuario?.email?.split('@')[0] || '').split(' ')[0];
  const numeroOT = datos ? new Set(datos.asignaciones.map(item => item.ot_id)).size : 0;
  const resumen = [numeroOT ? `${numeroOT} OT con trabajo programado hoy` : '', datos?.kpis.partes ? `${datos.kpis.partes} partes esperan tu revisión` : ''].filter(Boolean).join(' · ');
  return (
    <div className="dx-opsi">
      <header className="dx-opsi-head">
        <div>
          <div className="dx-opsi-eyebrow">Operaciones · {fecha}</div>
          <h1>{saludoHora(hora)}{nombre ? `, ${nombre}` : ''}</h1>
          {resumen && <div className="dx-opsi-muted">{resumen}</div>}
        </div>
        <div className="dx-opsi-actions">
          <Boton onClick={() => onNavigate('scheduler-despacho')}>Abrir Planner</Boton>
          <Boton principal onClick={() => onNavigate('crear-ot')}>Nueva OT</Boton>
        </div>
      </header>
      {sesion.cargando || (sesion.estado === 'listo' && cargando) ? (
        <div className="dx-opsi-card dx-opsi-body">Cargando inicio operativo…</div>
      ) : sesion.estado === 'sin_sesion' ? (
        <div className="dx-opsi-card dx-opsi-body">No hay una sesión operativa válida para consultar el inicio operativo.</div>
      ) : sesion.estado === 'sin_empresa' ? (
        <div className="dx-opsi-card dx-opsi-body">Selecciona o solicita acceso a una empresa para ver el inicio operativo.</div>
      ) : error || sesion.error ? (
        <div className="dx-opsi-card dx-opsi-body">No se pudo cargar el inicio operativo: {error || sesion.error}</div>
      ) : datos && (
        <>
          <Indicadores kpis={datos.kpis} />
          <div className="dx-opsi-grid">
            <MiDia datos={datos} onNavigate={onNavigate} />
            <div className="dx-opsi-stack">
              <Alertas datos={datos} onNavigate={onNavigate} />
              <Accesos onNavigate={onNavigate} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
