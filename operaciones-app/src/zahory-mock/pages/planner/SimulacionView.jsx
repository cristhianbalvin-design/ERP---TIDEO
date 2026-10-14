import { esOtPlanificable } from './plannerEngine.js';
import { fmtDia, numeroOT } from './plannerModelo.js';

export function SimulacionView({ simulacion, ots = [], guardando, onClose, onApply, onElegir }) {
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
  const nombres = new Map(ots.map(ot => [ot.id, ot]));
  const desplazadas = simulacion.resultado.desplazadas
    .filter(item => item.otId !== simulacion.urgente.id && item.fechaOriginal !== item.fechaConUrgencia);
  return (
    <section className="dx-pl-banner dx-planner-sim" aria-label="Escenario borrador">
      <div>
        <b>
          Escenario borrador · {numeroOT(simulacion.urgente)} como urgente
          {' '}({simulacion.resultado.horasUrgentes} h de trabajo)
        </b>
        <p>{desplazadas.length ? 'Así cambia el resto del plan al meter el trabajo urgente:' : 'Sin impacto en las otras OT.'}</p>
        {desplazadas.length > 0 && (
          <ul className="dx-pl-imp">
            {desplazadas.map(item => (
              <li key={item.otId}>
                <b>{numeroOT(nombres.get(item.otId))}</b>
                {': entrega de '}{fmtDia(item.fechaOriginal)} a {fmtDia(item.fechaConUrgencia)} (+{item.diasDesplazada} d) · {item.causa}
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
