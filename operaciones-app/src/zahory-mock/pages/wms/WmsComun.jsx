export function PaginaPrevia({ previo, onReintentar }) {
  return <section className={`dx-ui dx-wms ${previo.clase}`}>
    {previo.tipo === 'error'
      ? <div className="dx-w-note red" role="alert">{previo.texto}<button type="button" className="dx-btn sm" onClick={onReintentar}>Reintentar</button></div>
      : <div className="dx-ui-empty">{previo.texto}</div>}
  </section>;
}

export function Encabezado({ titulo, sub, children }) {
  return <header className="dx-ui-head-page">
    <div><div className="dx-ui-eyebrow">Almacén · WMS</div><h1 className="dx-ui-title">{titulo}</h1><p className="dx-ui-sub">{sub}</p></div>
    {children && <div className="dx-ui-actions">{children}</div>}
  </header>;
}

export function AvisoSoloLectura({ sesion }) {
  if (sesion.permiteEscritura) return null;
  return <div className="dx-w-note amber" role="status">Vista de solo lectura. Selecciona una sociedad operativa para registrar movimientos.</div>;
}

export function SelectorAlmacen({ id, almacenes, valor, onCambio, todos = true, etiqueta = 'Almacén' }) {
  return <select id={id} className="dx-ui-select" aria-label={etiqueta} value={valor} onChange={e => onCambio(e.target.value)}>
    {todos && <option value="">Todos los almacenes</option>}
    {almacenes.map(a => <option key={a.id} value={a.id}>{a.codigo} · {a.nombre}</option>)}
  </select>;
}
