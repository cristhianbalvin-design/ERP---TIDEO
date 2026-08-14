import React, { useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { ZAHORY_SAC_DATA } from '../data.js';

export const ProyectosTarifasPage = () => {
  const D = ZAHORY_SAC_DATA;
  const [proyectos] = useState([
    { id: "PRY-001", cliente: "Pepas de Oro", nombre: "Mantenimiento Jumbos", dmp: 97.92, hMes: 720, inicio: "01/01/2026", estado: "Activo" },
    { id: "PRY-002", cliente: "Buenaventura", nombre: "Gestión Integral Mina", dmp: 98.00, hMes: 720, inicio: "15/02/2026", estado: "Activo" },
    { id: "PRY-003", cliente: "Antapaccay", nombre: "Soporte Técnico Especializado", dmp: 97.50, hMes: 720, inicio: "10/03/2026", estado: "Activo" },
  ]);

  const [tarifas] = useState([
    { esp: "Mecánico Mina", cat: "Senior", proy: "Todos", usdHr: 15.00, hsb: 11.50 },
    { esp: "Mecatrónico", cat: "Especialista", proy: "Todos", usdHr: 18.50, hsb: 14.00 },
    { esp: "Electricista", cat: "Pleno", proy: "Todos", usdHr: 16.00, hsb: 12.00 },
    { esp: "Mecánico Taller", cat: "Junior", proy: "Taller Carapongo", usdHr: 14.00, hsb: 10.00 },
  ]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Proyectos y Tarifas</h1>
          <div className="sub">Gestión de contratos, clientes, disponibilidad pactada (DMP) y maestro de tarifas</div>
        </div>
        <div className="spacer"/>
        <button className="btn btn-primary"><Icon name="plus" size={13}/> Nuevo Proyecto</button>
      </div>

      <div className="grid-2">
        <div>
          <div className="card mb-md">
            <div className="card-header"><h3>Proyectos Activos</h3></div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Proyecto</th>
                  <th className="num">DMP (%)</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {proyectos.map(p => (
                  <tr key={p.id}>
                    <td className="bold">{p.cliente}</td>
                    <td>{p.nombre}</td>
                    <td className="num">{p.dmp}%</td>
                    <td>
                      {p.estado === "Activo" ? <span className="badge green"><span className="dot"/>Activo</span> : <span className="badge slate">Cerrado</span>}
                    </td>
                    <td><button className="btn btn-ghost btn-sm"><Icon name="edit" size={14}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="card">
            <div className="card-header" style={{ background: "var(--navy)", color: "white", borderRadius: "8px 8px 0 0" }}>
              <h3>Ficha: Pepas de Oro</h3>
              <div className="spacer"/>
              <button className="btn btn-secondary btn-sm" style={{ color: "black", border: "none" }}><Icon name="edit" size={12}/> Editar</button>
            </div>
            <div className="card-body">
              <div className="grid-2" style={{ gap: 16 }}>
                <div className="field"><label>Cliente</label><input className="input" defaultValue="Pepas de Oro" readOnly/></div>
                <div className="field"><label>Nombre del proyecto</label><input className="input" defaultValue="Mantenimiento Jumbos" readOnly/></div>
                <div className="field"><label>Disponibilidad Mecánica Pactada (DMP)</label>
                  <div className="input-group">
                    <input className="input" defaultValue="97.92" style={{ textAlign: "right" }} readOnly/>
                    <span className="input-addon">%</span>
                  </div>
                </div>
                <div className="field"><label>Horas Disponibles / Mes</label>
                  <div className="input-group">
                    <input className="input" defaultValue="720" style={{ textAlign: "right" }} readOnly/>
                    <span className="input-addon">hrs</span>
                  </div>
                </div>
                <div className="field"><label>Fecha inicio</label><input className="input" defaultValue="2026-01-01" type="date" readOnly/></div>
                <div className="field"><label>Moneda facturación</label>
                  <div className="toggle-pills" style={{ pointerEvents: "none" }}>
                    <button className="toggle-pill active">USD</button>
                    <button className="toggle-pill">PEN</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <h3>Maestro de Tarifas (Mano de Obra)</h3>
              <div className="spacer"/>
              <button className="btn btn-secondary btn-sm"><Icon name="plus" size={12}/> Tarifa</button>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Especialidad</th>
                  <th>Categoría</th>
                  <th className="num">Tarifa Normal</th>
                  <th className="num">Stand-By (HSB)</th>
                </tr>
              </thead>
              <tbody>
                {tarifas.map((t, i) => (
                  <tr key={i}>
                    <td className="bold">{t.esp}</td>
                    <td>{t.cat}<br/><span className="muted" style={{ fontSize: 10 }}>{t.proy}</span></td>
                    <td className="num mono" style={{ color: "var(--cyan)" }}>${t.usdHr.toFixed(2)}</td>
                    <td className="num mono">${t.hsb.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="card-body muted" style={{ fontSize: 12, borderTop: "1px solid var(--card-border)" }}>
              Las tarifas se aplican automáticamente en la OT al asignar técnicos, diferenciando entre horas trabajadas y horas stand-by (espera, traslados, etc).
            </div>
          </div>
        </div>
      </div>
      <FooterBrand/>
    </div>
  );
};
