// Inicio de Operaciones: el mismo Inicio con Aria de Administración (InicioBase), con la bandeja de
// pendientes operativos (inicio_operaciones_pendientes), sus indicadores y una columna lateral operativa.
import React from 'react';
import { InicioBase, Icon } from '../../src/inicio/Inicio.jsx';
import { fecha } from '../../src/inicio/datos.js';
import robotAria from '../../src/assets/aria/b_base.webp?no-inline';
import { useCompactWorkMode } from './useCompactWorkMode.js';
import { openWorkNav } from './workMode.js';
import './inicio_operaciones.css';

const preguntas = ['¿Qué OT están atrasadas?', '¿Qué partes faltan revisar?',
  '¿Qué repuestos debo despachar?', '¿Qué viajes están pendientes?'];
const accesos = [['scheduler-despacho', 'Planner'], ['crear-ot', 'Nueva OT'], ['ots', 'Bandeja de OT'], ['transporte-viajes', 'Monitor de viajes']];
// En modo trabajo (celular y tablet) la cabecera se oculta: esta barra abre el menú en cajón.
const BarraMenu = () => <div className="dx-opsini-bar">
  <button type="button" className="dx-opsini-menu" aria-label="Abrir menú" onClick={openWorkNav}>☰</button>
  <span>Inicio operativo</span>
</div>;

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function Indicadores({ data }) {
  const k = data.kpis || {};
  return <>
    {k.ot_ejecucion != null && <div className="dx-ui-kpi"><strong>{k.ot_ejecucion}</strong><span>OT en<br />ejecución</span></div>}
    {k.partes_revision != null && <div className="dx-ui-kpi"><strong>{k.partes_revision}</strong><span>Partes por<br />revisar</span></div>}
    {k.reservas_despacho != null && <div className="dx-ui-kpi"><strong>{k.reservas_despacho}</strong><span>Repuestos por<br />despachar</span></div>}
  </>;
}

function Lateral({ data, navigate }) {
  const a = data.alertas || {};
  const hayAvisos = a.cert || a.viajes || a.ot_larga;
  return <>
    <div className="dx-ui-card dxi-reveal" id="alerts"><div className="dxi-bar"><h2>Aria te avisa</h2></div>
      {a.cert && <div className="dxi-al"><span className="dx-ui-icon dxi-ic-am"><Icon name="check" /></span><div>
        <p>{a.cert.documento} vence el {fecha(a.cert.fecha)}{a.cert.tercero ? ` · ${a.cert.tercero}` : ''}</p>
        <button onClick={() => navigate('certificaciones-activo')}>Ver certificación</button></div></div>}
      {a.viajes && <div className="dxi-al"><span className="dx-ui-icon dxi-ic-red"><Icon name="truck" /></span><div>
        <p>{plural(a.viajes.cantidad, 'viaje con fecha pasada sigue programado', 'viajes con fecha pasada siguen programados')}</p>
        <button onClick={() => navigate('transporte-viajes')}>Abrir monitor de viajes</button></div></div>}
      {a.ot_larga && <div className="dxi-al"><span className="dx-ui-icon dxi-ic-vi"><Icon name="wrench" /></span><div>
        <p>{a.ot_larga.documento} lleva {plural(a.ot_larga.dias, 'día', 'días')} en ejecución</p>
        <button onClick={() => navigate('ots')}>Abrir OT</button></div></div>}
      {!hayAvisos && <div className="dxi-empty">Sin avisos para hoy.</div>}
    </div>
    {Array.isArray(data.mi_dia) && <div className="dx-ui-card dxi-reveal"><div className="dxi-bar"><h2>Mi día</h2>
      <span className="dxi-count">{data.mi_dia.length}</span></div>
      {data.mi_dia.length ? data.mi_dia.map(ot => <div className="dxi-al" key={ot.id}>
        <span className="dx-ui-icon dxi-ic-vi"><Icon name="wrench" /></span><div>
          <p>{ot.documento} · {ot.descripcion || 'Sin descripción'}</p>
          <div className="dxi-r-s">{ot.estado === 'programada' ? 'Programada' : 'En ejecución'}{ot.fecha ? ` · ${fecha(ot.fecha)}` : ''}</div>
        </div></div>) : <div className="dxi-empty">Sin OT programadas ni en ejecución.</div>}
    </div>}
    <div className="dx-ui-card dxi-reveal"><div className="dxi-bar"><h2>Accesos rápidos</h2></div>
      <div className="dx-opsini-acc">{accesos.map(([ruta, etiqueta]) =>
        <button key={ruta} className="dxi-btn dxi-g" onClick={() => navigate(ruta)}>{etiqueta}</button>)}</div>
    </div>
  </>;
}

export function InicioOperaciones({ sesion, onNavigate }) {
  // En celular y tablet el menú pasa a un cajón ☰, como en las demás pantallas de trabajo.
  useCompactWorkMode(true);
  const usuario = sesion?.usuario;
  const authUser = usuario ? { id: usuario.id, nombre: usuario.user_metadata?.nombre || usuario.user_metadata?.full_name || '' } : null;
  const sociedadId = sesion?.vistaConsolidada ? null : (sesion?.sociedadId || null);
  if (sesion?.estado !== 'listo' || !sesion?.empresaId) {
    return <div className="ops-inicio-aria"><BarraMenu /><div className="dxi-empty" role="status">
      {sesion?.cargando || sesion?.estado === 'cargando' ? 'Cargando tu inicio…' : 'Selecciona o solicita acceso a una empresa para ver tu inicio.'}</div></div>;
  }
  return <div className="ops-inicio-aria" style={{ '--ops-aria-robot': `url(${robotAria})` }}>
    <BarraMenu />
    <InicioBase empresaId={sesion.empresaId} sociedadId={sociedadId} authUser={authUser} navigate={onNavigate}
      rpc="inicio_operaciones_pendientes" preguntas={preguntas} Indicadores={Indicadores} Lateral={Lateral} />
  </div>;
}
