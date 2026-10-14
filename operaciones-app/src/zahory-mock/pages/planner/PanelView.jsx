import { esOtPlanificable } from './plannerEngine.js';
import { agruparPorOS } from './plannerLogic.js';
import { capacidadSemanal, colorUso, fmtCorto, fmtDia, horas, nombrePuesto, puestoDeOT } from './plannerModelo.js';

const ICONO_AVISO = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" />
  </svg>
);
const PILL = { ok: 'is-ok', warn: 'is-warn', bad: 'is-bad', done: 'is-done', none: 'is-none' };

export function PanelView({ datos, modelo, seleccion, busqueda, setBusqueda, onSelect, onPlanificar, permiteEscritura }) {
  const pendientes = [...modelo.infos.values()].filter(info => esOtPlanificable(info.ot) && !info.planificada);
  return (
    <>
      {pendientes.length > 0 && (
        <section className="dx-pl-panel" aria-labelledby="pl-tray">
          <div className="dx-pl-ph">
            <h2 id="pl-tray">Por planificar ({pendientes.length})</h2>
            <span className="dx-pl-hintx">OT que nacieron de una OS y aún no tienen recursos ni fechas</span>
          </div>
          {pendientes.map(info => (
            <div className="dx-pl-trayr" key={info.id}>
              <div className="t">
                <b>{info.ot.numero || info.id} · {info.ot.descripcion || info.ot.servicio || 'Orden de trabajo'}</b>
                <span>
                  {info.ot.orden_servicio?.numero || 'Sin OS'}
                  {info.comp ? ` · compromiso ${fmtDia(info.comp)}` : ''}
                  {' '}· {info.tareas.length} tarea{info.tareas.length === 1 ? '' : 's'} heredada{info.tareas.length === 1 ? '' : 's'}
                  {' '}· {horas(info.est)} de mano de obra
                </span>
              </div>
              <button type="button" className="dx-pl-btn is-pri" disabled={!permiteEscritura} onClick={() => onPlanificar(info.ot)}>
                Planificar
              </button>
            </div>
          ))}
        </section>
      )}
      <Capacidad datos={datos} modelo={modelo} />
      <Ordenes
        datos={datos}
        modelo={modelo}
        seleccion={seleccion}
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        onSelect={onSelect}
      />
    </>
  );
}

function Celda({ celda, semana }) {
  const proporcion = celda.capacidad ? celda.usadas / celda.capacidad : 0;
  return (
    <div className={`hc is-wk${semana + 1}`} style={{ '--c': colorUso(proporcion) }}>
      <b>{Math.round(proporcion * 100)}%</b>
      <div className="bar"><i style={{ width: `${Math.min(100, Math.round(proporcion * 100))}%` }} /></div>
      <span>{Math.round(celda.usadas)} de {Math.round(celda.capacidad)} h</span>
    </div>
  );
}

function Capacidad({ datos, modelo }) {
  const { semanas, personal, maquinas } = capacidadSemanal(datos, modelo.hoy);
  const critico = modelo.met.critico;
  const fila = item => [
    <div className="rl" key={`${item.id}-l`}><b>{item.nombre}</b><span>{item.detalle}</span></div>,
    ...item.celdas.map((celda, indice) => <Celda key={`${item.id}-${indice}`} celda={celda} semana={indice} />),
  ];
  return (
    <section className="dx-pl-panel" aria-labelledby="pl-cap">
      <div className="dx-pl-ph">
        <h2 id="pl-cap">Capacidad vs. trabajo pendiente</h2>
        <span className="dx-pl-hintx">Horas planificadas sobre horas disponibles, por semana</span>
      </div>
      <div className="dx-pl-hm">
        <div className="hh" />
        {semanas.map((semana, indice) => (
          <div className={`hh is-wk${indice + 1}`} key={semana.inicio}>{fmtCorto(semana.inicio)} – {fmtCorto(semana.fin)}</div>
        ))}
        <div className="grp">Personal por cargo</div>
        {personal.length ? personal.flatMap(fila) : <div className="rl" style={{ gridColumn: '1/-1' }}><span>No hay personal activo.</span></div>}
        <div className="grp">Máquinas de taller</div>
        {maquinas.length ? maquinas.flatMap(fila) : <div className="rl" style={{ gridColumn: '1/-1' }}><span>No hay máquinas configuradas.</span></div>}
      </div>
      {critico && (
        <div className="dx-pl-bn">
          {ICONO_AVISO}
          <div>
            <b>{critico.nombre}</b> es el recurso que más retrasa entregas: acumula {critico.diasEspera} días de espera entre tareas.
            {' '}Una persona más o liberar horas ahí es lo que más adelanta.
          </div>
        </div>
      )}
    </section>
  );
}

function Ordenes({ datos, modelo, seleccion, busqueda, setBusqueda, onSelect }) {
  const texto = busqueda.trim().toLowerCase();
  const infos = [...modelo.infos.values()].filter(info => !texto
    || `${info.ot.numero || info.id} ${info.ot.descripcion || ''} ${info.ot.servicio || ''} ${info.ot.orden_servicio?.numero || ''}`
      .toLowerCase().includes(texto));
  const grupos = agruparPorOS(infos.map(info => info.ot))
    .map(grupo => {
      const lista = grupo.ots.map(ot => modelo.infos.get(ot.id));
      const fin = lista.map(info => info.end).filter(Boolean).sort().at(-1) || null;
      let st = 'ok';
      if (lista.every(info => info.st === 'done')) st = 'done';
      else if (lista.every(info => info.st === 'none' || info.st === 'done')) st = 'none';
      else if (lista.some(info => info.st === 'bad')) st = 'bad';
      else if (lista.some(info => info.st === 'warn')) st = 'warn';
      const etiqueta = { ok: 'A tiempo', warn: 'En riesgo', bad: 'Atrasada', done: 'Cerrada', none: 'Sin horas' }[st];
      return { ...grupo, lista, fin, st, etiqueta, comp: grupo.orden?.fecha_fin || null };
    })
    .sort((a, b) => (a.comp || '9999').localeCompare(b.comp || '9999'));
  return (
    <section className="dx-pl-panel" aria-labelledby="pl-os">
      <div className="dx-pl-ph">
        <h2 id="pl-os">Órdenes de servicio y sus OT</h2>
        <label className="dx-pl-search">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Buscar OT" placeholder="Buscar OT…" value={busqueda} onChange={event => setBusqueda(event.target.value)} />
        </label>
        <span className="dx-pl-hintx" style={{ flexBasis: '100%' }}>
          Las fechas las calcula el Planner con horas estimadas, horas reales y capacidad
        </span>
      </div>
      {grupos.length ? grupos.map(grupo => (
        <div className="dx-pl-os" key={grupo.id}>
          <div className="dx-pl-osh">
            <div>
              <b>{grupo.orden?.numero || 'OT sin orden de servicio'}</b>
              <span className="m"> <span>·</span> {grupo.lista.length} OT</span>
            </div>
            <div className="m">
              <span>Compromiso</span> {grupo.comp ? fmtDia(grupo.comp) : 'Sin fecha'}
              <span>Probable</span> {grupo.fin ? fmtDia(grupo.fin) : 'Por calcular'}
              <span className={`dx-pl-pill ${PILL[grupo.st]}`}>{grupo.etiqueta}</span>
            </div>
          </div>
          {grupo.lista.map(info => (
            <FilaOT key={info.id} datos={datos} info={info} activa={seleccion?.ot?.id === info.id} onSelect={onSelect} />
          ))}
        </div>
      )) : <p className="dx-pl-empty">No hay OT que coincidan con la búsqueda.</p>}
    </section>
  );
}

function FilaOT({ datos, info, activa, onSelect }) {
  const puesto = puestoDeOT(datos, info.id);
  return (
    <button
      type="button"
      className={`dx-pl-otr${activa ? ' is-on' : ''}`}
      aria-pressed={activa}
      onClick={() => onSelect({ ot: info.ot })}
    >
      <span className="t">
        <b>{info.ot.numero || info.id} · {info.ot.descripcion || info.ot.servicio || 'Orden de trabajo'}</b>
        <span>{info.tareas.length} tarea{info.tareas.length === 1 ? '' : 's'} · {puesto ? nombrePuesto(datos, puesto) : 'sin puesto'}</span>
      </span>
      <span className="dx-pl-hb">
        <span className="tr"><i style={{ width: `${info.pct}%` }} /></span>
        <span>{horas(info.real)} reales de {horas(info.est)} estimadas</span>
      </span>
      {info.st === 'done'
        ? <span className="dx-pl-fd"><b>{info.end ? fmtDia(info.end) : 'Cerrada'}</b>Cerrada · bloqueada</span>
        : (
          <span className="dx-pl-fd">
            <b>{info.end ? fmtDia(info.end) : 'Por calcular'}</b>
            {info.p90 ? `Hasta ${fmtCorto(info.p90)} si las horas suben 25%` : 'Sin horas estimadas'}
          </span>
        )}
      <span className={`dx-pl-pill ${PILL[info.st]}`}>{info.label}</span>
    </button>
  );
}
