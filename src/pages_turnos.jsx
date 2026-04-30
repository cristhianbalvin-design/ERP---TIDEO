import React, { useState } from 'react';
import { I } from './icons.jsx';
import { MOCK } from './data.js';

const DIAS_LABELS = { lun:'Lun', mar:'Mar', mie:'Mié', jue:'Jue', vie:'Vie', sab:'Sáb', dom:'Dom' };
const DIAS_ORDER = ['lun','mar','mie','jue','vie','sab','dom'];

function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function calcHorasEfectivas(entrada, salida, cruceMed, refrigerio) {
  if (!entrada || !salida) return '—';
  let minSalida = timeToMinutes(salida);
  if (cruceMed) minSalida += 24 * 60;
  const total = minSalida - timeToMinutes(entrada) - Number(refrigerio || 0);
  if (total <= 0) return '0h';
  return `${Math.floor(total / 60)}h ${total % 60 > 0 ? (total % 60) + 'min' : ''}`.trim();
}

function diasLabel(t) {
  if (t.dias_variables) return 'Variable';
  if (!t.dias_laborables || t.dias_laborables.length === 0) return '—';
  if (t.dias_laborables.length === 7) return 'Lun-Dom';
  if (t.dias_laborables.join(',') === 'lun,mar,mie,jue,vie') return 'Lun-Vie';
  return t.dias_laborables.map(d => DIAS_LABELS[d]).join(', ');
}

export function TurnosHorarios() {
  const [turnos, setTurnos] = useState([...MOCK.turnos]);
  const [panel, setPanel] = useState(false);
  const formBase = { nombre:'', hora_entrada:'08:00', hora_salida:'17:00', tolerancia_minutos:10, cruza_medianoche:false, dias_laborables:['lun','mar','mie','jue','vie'], dias_variables:false, refrigerio_minutos:60, descripcion:'', estado:'activo' };
  const [form, setForm] = useState(formBase);
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDia = d => {
    const curr = form.dias_laborables;
    upd('dias_laborables', curr.includes(d) ? curr.filter(x => x !== d) : [...curr, d]);
  };

  const guardar = e => {
    e.preventDefault();
    const idx = turnos.length + 1;
    setTurnos(prev => [...prev, {
      ...form, id: `tur_${String(idx).padStart(3,'0')}`,
      codigo: `TUR-${String(idx).padStart(3,'0')}`,
      empresa_id: 'emp_001',
      horas_efectivas: Math.floor((timeToMinutes(form.hora_salida) + (form.cruza_medianoche ? 1440 : 0) - timeToMinutes(form.hora_entrada) - form.refrigerio_minutos) / 60),
      tolerancia_minutos: Number(form.tolerancia_minutos),
      refrigerio_minutos: Number(form.refrigerio_minutos),
    }]);
    setForm(formBase);
    setPanel(false);
  };

  const horasPreview = calcHorasEfectivas(form.hora_entrada, form.hora_salida, form.cruza_medianoche, form.refrigerio_minutos);

  return (
    <>
      <div className="page-header">
        <div><h1 className="page-title">Turnos y Horarios</h1><div className="page-sub">Configuración de jornadas laborales · {turnos.filter(t=>t.estado==='activo').length} turnos activos</div></div>
        <button className="btn btn-primary" onClick={() => setPanel(true)}>{I.plus} Nuevo turno</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Código</th><th>Nombre</th><th>Entrada</th><th>Salida</th><th>Horas/día</th><th>Tolerancia</th><th>Días</th><th>Refrigerio</th><th>Estado</th></tr></thead>
            <tbody>{turnos.map(t => (
              <tr key={t.id} className="hover-row">
                <td className="mono text-muted">{t.codigo}</td>
                <td><strong>{t.nombre}</strong></td>
                <td><span className="badge badge-gray" style={{fontFamily:'monospace'}}>{t.hora_entrada}</span></td>
                <td><span className="badge badge-gray" style={{fontFamily:'monospace'}}>{t.hora_salida}{t.cruza_medianoche && <span style={{color:'var(--cyan)',marginLeft:4}}>+1d</span>}</span></td>
                <td className="num"><strong>{t.horas_efectivas}h</strong></td>
                <td className="num">{t.tolerancia_minutos} min</td>
                <td>{diasLabel(t)}</td>
                <td className="num">{t.refrigerio_minutos} min</td>
                <td><span className={`badge badge-${t.estado==='activo'?'green':'gray'}`}>{t.estado}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {panel && <>
        <div className="side-panel-backdrop" onClick={() => setPanel(false)}/>
        <div className="side-panel" style={{width:'min(480px, 96vw)'}}>
          <div className="side-panel-head">
            <div><div className="eyebrow">Configuración</div><div className="font-display" style={{fontSize:22,fontWeight:700,marginTop:2}}>Nuevo turno</div></div>
            <button className="icon-btn" onClick={() => setPanel(false)}>{I.x}</button>
          </div>
          <form className="side-panel-body" onSubmit={guardar}>
            <div className="input-group"><label>Nombre del turno *</label><input className="input" required value={form.nombre} onChange={e=>upd('nombre',e.target.value)} placeholder="Ej: Turno Mañana" autoFocus/></div>

            <div className="grid-2" style={{gap:14,marginTop:14}}>
              <div className="input-group"><label>Hora de entrada *</label><input className="input" type="time" required value={form.hora_entrada} onChange={e=>upd('hora_entrada',e.target.value)}/></div>
              <div className="input-group"><label>Hora de salida *</label><input className="input" type="time" required value={form.hora_salida} onChange={e=>upd('hora_salida',e.target.value)}/></div>
              <div className="input-group"><label>Tolerancia tardanza (min)</label><input className="input" type="number" min="0" value={form.tolerancia_minutos} onChange={e=>upd('tolerancia_minutos',e.target.value)}/></div>
              <div className="input-group"><label>Refrigerio / break (min)</label><input className="input" type="number" min="0" value={form.refrigerio_minutos} onChange={e=>upd('refrigerio_minutos',e.target.value)}/></div>
            </div>

            <div style={{padding:'12px 16px',background:'rgba(6,182,212,0.08)',border:'1px solid rgba(6,182,212,0.25)',borderRadius:8,marginTop:12,fontSize:13}}>
              <span className="text-muted">Horas efectivas calculadas: </span><strong style={{color:'var(--cyan)'}}>{horasPreview}</strong>
              <span className="text-muted" style={{marginLeft:8,fontSize:11}}>(entrada → salida − refrigerio)</span>
            </div>

            <div style={{marginTop:16}}>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
                <input type="checkbox" checked={form.cruza_medianoche} onChange={e=>upd('cruza_medianoche',e.target.checked)}/>
                Turno cruza medianoche <span className="text-muted" style={{fontSize:11}}>(ej. 22:00 → 06:00)</span>
              </label>
            </div>

            <div style={{marginTop:16}}>
              <div style={{fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--fg-subtle)',marginBottom:8}}>Días laborables</div>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,marginBottom:10}}>
                <input type="checkbox" checked={form.dias_variables} onChange={e=>upd('dias_variables',e.target.checked)}/>
                Días variables (el responsable define por semana)
              </label>
              {!form.dias_variables && (
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {DIAS_ORDER.map(d => (
                    <label key={d} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',padding:'5px 10px',borderRadius:6,border:`1px solid ${form.dias_laborables.includes(d)?'var(--cyan)':'var(--border)'}`,background:form.dias_laborables.includes(d)?'rgba(6,182,212,0.1)':'transparent',fontSize:13}}>
                      <input type="checkbox" checked={form.dias_laborables.includes(d)} onChange={()=>toggleDia(d)} style={{display:'none'}}/>
                      {DIAS_LABELS[d]}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="input-group" style={{marginTop:14}}>
              <label>Descripción / notas</label>
              <textarea className="input" rows={2} value={form.descripcion} onChange={e=>upd('descripcion',e.target.value)} placeholder="Notas adicionales sobre este turno..." style={{resize:'vertical'}}/>
            </div>

            <div className="input-group" style={{marginTop:14}}>
              <label>Estado</label>
              <select className="select" value={form.estado} onChange={e=>upd('estado',e.target.value)}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>

            <div className="row" style={{justifyContent:'flex-end',gap:10,marginTop:24}}>
              <button type="button" className="btn btn-secondary" onClick={()=>setPanel(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">{I.save || I.check} Guardar turno</button>
            </div>
          </form>
        </div>
      </>}
    </>
  );
}
