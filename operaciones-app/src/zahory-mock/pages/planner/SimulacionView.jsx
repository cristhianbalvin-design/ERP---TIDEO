import { esOtPlanificable } from './plannerEngine.js';
import { fmtDia, numeroOT, sumarHabiles } from './plannerModelo.js';

export function SimulacionView({ simulacion, ots = [], infos = new Map(), guardando, onClose, onApply, onElegir }) {
  if (simulacion.elegir) {
    const opciones = ots.filter(esOtPlanificable);
    return (
      <section className="dx-pl-banner dx-planner-sim" aria-label="Simular OT urgente">
        <div>
          <b>Escenario borrador · ¿qué OT entra como urgente?</b>
          <p>Elige la orden que quieres meter con prioridad. Verás cómo cambia el resto del plan antes de aplicar nada.</p>
          <select
            aria-label="OT urgente"
            defaultValue=""
            onChange={event => {
              const ot = opciones.find(item => item.id === event.target.value);
              if (ot) onElegir(ot);
            }}
          >
            <option value="" disabled>Elige una OT…</option>
            {opciones.map(ot => (
              <option key={ot.id} value={ot.id}>{numeroOT(ot)} · {ot.descripcion || ot.servicio || 'Orden de trabajo'}</option>
            ))}
          </select>
        </div>
        <div className="dx-pl-acts"><button type="button" className="dx-pl-btn" onClick={onClose}>Descartar</button></div>
      </section>
    );
  }
  // «Aplicar al plan» corre las asignaciones programadas de las demás OT esta cantidad de días hábiles.
  const dias = Math.max(1, simulacion.resultado.esperaDias);
  const critico = simulacion.resultado.impacto?.critico;
  const desplazadas = [...infos.values()]
    .filter(info => info.id !== simulacion.urgente.id && info.planificada && info.st !== 'done' && info.end)
    .map(info => {
      const nueva = sumarHabiles(info.end, dias);
      return { info, nueva, rompe: info.comp && nueva > info.comp && !(info.end > info.comp) };
    });
  return (
    <section className="dx-pl-banner dx-planner-sim" aria-label="Escenario borrador">
      <div>
        <b>
          Escenario borrador · {numeroOT(simulacion.urgente)} como urgente
          {' '}({simulacion.resultado.horasUrgentes} h de trabajo)
        </b>
        <p>
          {desplazadas.length
            ? `Al meter el trabajo urgente, las demás OT planificadas se corren ${dias} día${dias > 1 ? 's' : ''} hábil${dias > 1 ? 'es' : ''}${critico ? ` (cuello de botella: ${critico.nombre})` : ''}:`
            : 'No hay otras OT planificadas que se muevan.'}
        </p>
        {desplazadas.length > 0 && (
          <ul className="dx-pl-imp">
            {desplazadas.map(({ info, nueva, rompe }) => (
              <li key={info.id}>
                <b>{numeroOT(info.ot)}</b>
                {': entrega de '}{fmtDia(info.end)} a {fmtDia(nueva)} (+{dias} d){rompe ? ' · rompe el compromiso' : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="dx-pl-acts">
        <button type="button" className="dx-pl-btn" onClick={onClose}>Descartar</button>
        <button type="button" className="dx-pl-btn is-pri" disabled={guardando} onClick={onApply}>Aplicar al plan</button>
      </div>
    </section>
  );
}
