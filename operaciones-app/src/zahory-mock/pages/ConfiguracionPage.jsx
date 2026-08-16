import React, { useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';

export const ConfiguracionPage = () => {
  const [fx, setFx] = useState(ZAHORY_SAC_DATA.fx);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configuración del sistema</h1>
          <div className="sub">Parámetros globales y umbrales de alerta</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-primary" onClick={save}>
          <Icon name="check" size={13}/> Guardar cambios
        </button>
      </div>

      {saved && (
        <div style={{ padding: 12, background: "var(--green-soft)", color: "var(--green)", border: "1px solid #CDE7CE", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="check" size={16}/> Configuración guardada exitosamente.
        </div>
      )}

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-header"><h3>Parámetros Financieros</h3></div>
          <div className="card-body">
            <div className="field">
              <label>Tipo de cambio por defecto (USD a PEN)</label>
              <div className="input-group">
                <span className="input-addon">S/</span>
                <input className="input" type="number" step="0.001" value={fx} onChange={e => setFx(parseFloat(e.target.value))}/>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Impacta en todos los cálculos de conversión de la plataforma.</div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Umbrales de Rentabilidad (OTs)</h3></div>
          <div className="card-body">
            <div className="grid-2">
              <div className="field">
                <label>Margen Óptimo (Verde) Mayor a:</label>
                <div className="input-group">
                  <input className="input" defaultValue="60" style={{ textAlign: "right" }}/>
                  <span className="input-addon">%</span>
                </div>
              </div>
              <div className="field">
                <label>Margen en Riesgo (Rojo) Menor a:</label>
                <div className="input-group">
                  <input className="input" defaultValue="30" style={{ textAlign: "right" }}/>
                  <span className="input-addon">%</span>
                </div>
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 12 }}>
              Las OTs con margen entre estos valores se considerarán "Aceptables" (Naranja).
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h3>Alertas y Notificaciones</h3></div>
          <div className="card-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" defaultChecked/> Enviar email al Planner cuando se reporte una "Emergencia" en Backlog.
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" defaultChecked/> Notificar al Supervisor si la OT excede el costo Estimado.
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="checkbox" defaultChecked/> Alerta visual cuando el DMR de un equipo cae por debajo del DMP.
              </label>
            </div>
          </div>
        </div>

      </div>
      <FooterBrand/>
    </div>
  );
};
