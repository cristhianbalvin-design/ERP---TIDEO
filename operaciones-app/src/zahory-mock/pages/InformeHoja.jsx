import React, { useEffect, useState } from 'react';
import { agruparFotosEnFilas } from '../../services/informeFotosFilas.js';

const dash = value => value === null || value === undefined || value === '' ? '—' : value;
const hasValue = value => value !== null && value !== undefined && String(value).trim() !== '';
const dateLabel = value => value ? new Date(value).toLocaleDateString('es-PE') : '—';
const prioridadLabel = { P1: 'Requieren atención antes de operar', P2: 'Atención prioritaria', P3: 'Próximo mantenimiento', P4: 'Monitorear', conformes: 'Conformes' };
const tones = { P1: 'p1', P2: 'p2', P3: 'p3', P4: 'p4', conformes: 'ok' };

export function InformeHoja({ snapshot, borrador = true, identidadEmpresa = null }) {
  const [logoFallido, setLogoFallido] = useState(false);
  const [firmaFallida, setFirmaFallida] = useState(false);
  const [dimensionesFotos, setDimensionesFotos] = useState({});
  useEffect(() => { setLogoFallido(false); }, [identidadEmpresa?.logo_url]);
  useEffect(() => { setFirmaFallida(false); }, [identidadEmpresa?.firma_url]);
  useEffect(() => { setDimensionesFotos({}); }, [snapshot]);
  const data = snapshot || {};
  const head = data.cabecera || {};
  const resumen = data.resumen || {};
  const hallazgos = data.hallazgos || [];
  const mediciones = data.mediciones || [];
  const tareas = data.tareas_repuestos || [];
  const tareasConHoras = tareas.some(task => task.horas_mano_obra !== undefined || task.horas_maquina !== undefined);
  const priorities = ['P1', 'P2', 'P3', 'P4', 'conformes'];
  return <article className="dx-inf-sheet" aria-label="Vista previa del informe">
    <header className="dx-inf-sheet-head">
      <div className="dx-inf-title-block">
        <div className="dx-inf-kicker">{dash(head.numero_recepcion)}</div>
        <h1>INFORME DE DIAGNÓSTICO TÉCNICO</h1>
        <h2>{dash(head.activo_nombre)}{head.activo_codigo ? ` · ${head.activo_codigo}` : ''}</h2>
        <div className="dx-inf-meta-grid">
          <span>Cliente<strong>{dash(head.cliente_razon_social)}</strong></span>
          {hasValue(head.numero_serie) && <span>N° de serie<strong>{dash(head.numero_serie)}</strong></span>}
          {hasValue(head.horometro) && <span>Horómetro<strong>{dash(head.horometro)}</strong></span>}
          <span>Fecha<strong>{dateLabel(head.fecha_recepcion)}</strong></span>
        </div>
      </div>
      <div className="dx-inf-logo" aria-label="Logo empresa">{identidadEmpresa?.logo_url && !logoFallido ? <img src={identidadEmpresa.logo_url} alt="Logo de la empresa" onError={() => setLogoFallido(true)} /> : '[Logo empresa]'}</div>
    </header>
    <section className="dx-inf-summary" aria-label="Resumen por prioridad">
      {priorities.map(key => <div className={`dx-inf-summary-card ${tones[key]}`} key={key}><span>{prioridadLabel[key]}</span><strong>{Number(resumen[key] || 0)}</strong></div>)}
    </section>
    {hallazgos.length > 0 && <section className="dx-inf-section">
      <h2>Hallazgos</h2>
      {hallazgos.map((item, index) => {
        const measures = mediciones.filter(m => m.hallazgo_id === item.hallazgo_id);
        return <article className="dx-inf-finding" key={item.hallazgo_id || index}>
          <div className="dx-inf-finding-head"><div><span className="dx-inf-pill">{dash(item.condicion_etiqueta)}</span><span className={`dx-inf-priority ${tones[item.prioridad] || 'p4'}`}>{dash(item.prioridad)}</span><h3>{dash(item.componente_parte)}</h3></div></div>
          <p>{dash(item.observacion)}</p>
          {measures.length > 0 && <div className="dx-inf-table-wrap"><table className="dx-inf-table"><thead><tr><th>Parámetro</th><th>Especificado</th><th>Medido</th><th>Resultado</th></tr></thead><tbody>{measures.map((measure, mi) => <tr key={`${measure.parametro}-${mi}`}><td>{dash(measure.parametro)}{measure.unidad ? ` (${measure.unidad})` : ''}</td><td>{measure.nominal !== null && measure.nominal !== undefined ? measure.nominal : `${dash(measure.minimo)} – ${dash(measure.maximo)}`}</td><td>{dash(measure.medido)}</td><td className={/fuera|no_conforme|fall/i.test(String(measure.resultado || measure.condicion_sugerida || '')) ? 'is-bad' : 'is-good'}>{dash(measure.resultado || measure.condicion_sugerida)}</td></tr>)}</tbody></table></div>}
          <div className="dx-inf-recommend"><strong>Recomendación</strong><span>{dash(item.accion_recomendada_etiqueta)}</span></div>
          {item.fotos?.length > 0 && <div className="dx-informe-fotos">{(() => {
            const fotos = item.fotos.map((foto, fotoIndex) => {
              const key = `${item.hallazgo_id || index}:${foto.url}:${fotoIndex}`;
              return { foto, fotoIndex, key, ...(dimensionesFotos[key] || { width: foto.ancho, height: foto.alto }) };
            });
            return agruparFotosEnFilas(fotos).map((fila, filaIndex) => <div className={`dx-informe-fila dx-informe-fila-${fila.orientacion}`} key={`${item.hallazgo_id || index}-fila-${filaIndex}`}>
              {fila.fotos.map(({ foto, fotoIndex, key }) => <figure className="dx-informe-foto" key={key}><img src={foto.url} alt={foto.leyenda || 'Foto del hallazgo'} onLoad={event => {
                const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                if (width && height) setDimensionesFotos(current => current[key]?.width === width && current[key]?.height === height ? current : { ...current, [key]: { width, height } });
              }} />{foto.leyenda && <figcaption>{foto.leyenda}</figcaption>}</figure>)}
            </div>);
          })()}</div>}
        </article>;
      })}
    </section>}
    {tareas.length > 0 && tareasConHoras && <section className="dx-inf-section"><h2>Trabajos propuestos</h2>{tareas.map((task, index) => <article className="dx-inf-task" key={task.linea_id || index}><div className="dx-inf-task-title"><strong>{dash(task.tarea_nombre || task.familia_trabajo_nombre)}</strong><span>{dash(task.cargo_nombre)}</span><b>{task.horas_mano_obra === null || task.horas_mano_obra === undefined ? '—' : `${task.horas_mano_obra} h`}</b></div>{task.hallazgo && <p>{task.hallazgo}</p>}{task.materiales?.length > 0 && <ul>{task.materiales.map((material, mi) => <li key={material.material_id || mi}>{dash(material.descripcion)} · {dash(material.cantidad)} {dash(material.unidad)}</li>)}</ul>}</article>)}</section>}
    <section className="dx-inf-section dx-inf-conclusion"><h2>Conclusión</h2><p>{dash(data.conclusion)}</p></section>
    <footer className="dx-inf-sheet-footer">
      <div className="dx-inf-signature">{(data.emisor?.firma_url || identidadEmpresa?.firma_url) && !firmaFallida && <img src={data.emisor?.firma_url || identidadEmpresa?.firma_url} alt="Firma" onError={() => setFirmaFallida(true)} />}<strong>{dash(data.emisor?.nombre || identidadEmpresa?.firmante)}</strong><span>{dash(data.emisor?.cargo || identidadEmpresa?.cargo_firmante)}</span></div>
      <div>{borrador ? 'Vista previa \u00b7 Borrador' : `Versi\u00f3n ${dash(data.version)} \u00b7 Emitido por ${dash(data.emisor?.nombre)}, ${dash(data.emisor?.cargo)}`}<span>Este informe no contiene valores econ\u00f3micos \u00b7 P\u00e1gina 1 de 1</span></div>
    </footer>
  </article>;
}
