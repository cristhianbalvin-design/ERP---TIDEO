import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient.js';

export const MaterialAutocomplete = ({ item, empresaId, sociedadId, disabled, onSelect, onClear }) => {
  const [busqueda, setBusqueda] = useState(
    [item.material_codigo, item.material_descripcion].filter(Boolean).join(' · '),
  );
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const termino = busqueda.trim();
    if (!empresaId || termino.length < 2) {
      setResultados([]);
      setError(null);
      return undefined;
    }

    let vigente = true;
    const temporizador = setTimeout(async () => {
      setCargando(true);
      setError(null);
      const { data, error: errorBusqueda } = await getSupabaseClient().rpc('buscar_materiales_ot', {
        p_empresa_id: empresaId,
        p_sociedad_id: sociedadId || null,
        p_busqueda: termino,
        p_limite: 30,
      });
      if (!vigente) return;
      setCargando(false);
      if (errorBusqueda) {
        setResultados([]);
        setError(errorBusqueda.message || 'No se pudo buscar materiales.');
        return;
      }
      setResultados(data || []);
    }, 280);

    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [busqueda, empresaId, sociedadId]);

  const seleccionar = (material) => {
    setBusqueda([material.codigo, material.descripcion].filter(Boolean).join(' · '));
    setResultados([]);
    onSelect(material);
  };

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <input
        type="search"
        className="input"
        value={busqueda}
        disabled={disabled}
        onChange={(event) => {
          setBusqueda(event.target.value);
          if (item.material_id) onClear();
        }}
        placeholder="Busca por código, parte o descripción"
        style={{ fontSize: 12, padding: '4px 6px', width: '100%' }}
      />
      {cargando && (
        <div className="hint" style={{ fontSize: 10, marginTop: 2 }}>Buscando materiales…</div>
      )}
      {error && (
        <div style={{ color: '#b91c1c', fontSize: 10, marginTop: 2 }}>{error}</div>
      )}
      {resultados.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0,
          maxHeight: 220, overflowY: 'auto', background: '#fff',
          border: '1px solid var(--card-border)', borderRadius: 6, marginTop: 2,
          boxShadow: '0 6px 18px rgba(0,0,0,.14)',
        }}>
          {resultados.map((material) => (
            <button
              key={material.material_id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => seleccionar(material)}
              style={{
                display: 'block', width: '100%', border: 0, background: 'transparent',
                textAlign: 'left', padding: '7px 8px', cursor: 'pointer', fontSize: 12,
              }}
            >
              <b>{material.codigo}</b> · {material.descripcion}
              <span className="muted" style={{ marginLeft: 5 }}>
                Disp. {Number(material.disponible || 0).toLocaleString()} {material.unidad || 'und'}
              </span>
            </button>
          ))}
          <div className="hint" style={{ padding: '5px 8px', fontSize: 10 }}>
            Mostrando hasta 30 resultados. Sigue escribiendo para acotar la búsqueda.
          </div>
        </div>
      )}
    </div>
  );
};

