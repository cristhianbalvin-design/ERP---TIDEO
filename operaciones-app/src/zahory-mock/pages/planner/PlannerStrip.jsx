import { fmtDia } from './plannerModelo.js';

export function PlannerStrip({ met }) {
  return (
    <section className="dx-pl-strip" aria-label="Resumen del plan">
      <div className="dx-pl-st">
        <span className="k">OS con compromiso en riesgo</span>
        <span className="v">{met.osRiesgo} <small>de {met.osTotal}</small></span>
        <span className="d">{met.otRiesgo} de {met.otTotal} OT en riesgo o atrasadas</span>
      </div>
      <div className="dx-pl-st">
        <span className="k">Última entrega estimada</span>
        <span className="v">{met.ultima ? fmtDia(met.ultima) : 'Sin fecha'}</span>
        <span className="d">Fecha probable, con horas reales de partes</span>
      </div>
      <div className="dx-pl-st">
        <span className="k">Uso del personal, próximos 10 días</span>
        <span className="v">{met.uso}%</span>
        <span className="d">
          {met.personas} técnico{met.personas === 1 ? '' : 's'} · {met.maquinas} máquina{met.maquinas === 1 ? '' : 's'}
          {' '}· {met.puestos} puesto{met.puestos === 1 ? '' : 's'}
        </span>
      </div>
      <div className="dx-pl-st">
        <span className="k">Cuello de botella</span>
        <span className="v is-sm">{met.critico?.nombre || 'Ninguno'}</span>
        <span className="d">
          {met.critico ? `${met.critico.diasEspera} días de espera acumulados` : 'Sin esperas por recursos'}
        </span>
      </div>
    </section>
  );
}
