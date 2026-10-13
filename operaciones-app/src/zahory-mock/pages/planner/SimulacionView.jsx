const fecha = value => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('es-PE')
  : 'Por calcular';

export function SimulacionView({ simulacion, guardando, onClose, onApply }) {
  const desplazadas = simulacion.resultado.desplazadas
    .filter(item => item.otId !== simulacion.urgente.id);
  return (
    <section className="dx-ui-card dx-planner-sim">
      <button className="dx-planner-close" onClick={onClose} aria-label="Descartar simulación">
        ×
      </button>
      <h2>Escenario borrador · OT urgente</h2>
      <p>
        La OT {simulacion.urgente.numero || simulacion.urgente.id} requiere
        {' '}{simulacion.resultado.horasUrgentes} h y desplaza asignaciones
        {' '}{simulacion.resultado.esperaDias} días.
      </p>
      <ul>
        {desplazadas.map(item => (
          <li key={item.otId}>
            OT {item.otId}: P50 {fecha(item.fechaOriginal)} → {fecha(item.fechaConUrgencia)};
            espera {item.diasDesplazada} días por {item.causa}.
          </li>
        ))}
      </ul>
      <p>
        Al aplicar se reprograman las asignaciones activas y puedes confirmar recursos para
        la OT urgente.
      </p>
      <div className="dx-planner-sim-actions">
        <button className="dx-btn" onClick={onClose}>Descartar</button>
        <button className="dx-btn primary" disabled={guardando} onClick={onApply}>
          Aplicar al plan
        </button>
      </div>
    </section>
  );
}
