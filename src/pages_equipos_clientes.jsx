import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from './context.jsx';
import { getEquiposClientesConHistorial } from './services/activosService.js';
import { EquipoClienteHistorial, EquiposClientesListado } from './components/EquiposClientes.jsx';

function EquiposClientes() {
  const { empresa, cuentas } = useApp();
  const empresaId = empresa?.id || '';
  const [fichas, setFichas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let active = true;
    const cargar = async () => {
      if (!empresaId) { if (active) setFichas([]); return; }
      setLoading(true); setError('');
      try {
        const data = await getEquiposClientesConHistorial(empresaId);
        if (active) { setFichas(data); setSelectedId(current => data.some(ficha => ficha.activo.id === current) ? current : data[0]?.activo.id || null); }
      } catch (err) {
        if (active) setError(err?.message || 'No se pudieron cargar los equipos de clientes.');
      } finally { if (active) setLoading(false); }
    };
    cargar();
    return () => { active = false; };
  }, [empresaId]);

  const cuentasPorId = useMemo(() => new Map((cuentas || []).map(cuenta => [cuenta.id, cuenta])), [cuentas]);
  const fichasVisibles = fichas.filter(ficha => {
    const cliente = cuentasPorId.get(ficha.activo.cliente_propietario_id);
    const texto = [ficha.activo.codigo, ficha.activo.nombre, cliente?.razon_social, cliente?.nombre_comercial].filter(Boolean).join(' ').toLowerCase();
    return texto.includes(search.trim().toLowerCase());
  });
  const seleccionada = fichas.find(ficha => ficha.activo.id === selectedId) || null;

  if (!empresaId) return <div className="p-4"><div className="alert alert-warning">Selecciona una empresa activa para consultar los equipos de clientes.</div></div>;
  return <div className="page">
    <div className="page-header"><div><div className="eyebrow">Activos en custodia</div><h1 className="page-title">Equipos de Clientes</h1><div className="page-sub">Consulta de equipos y su historial de OS Cliente</div></div></div>
    <div className="card" style={{ marginBottom: 16 }}><div className="card-body"><input className="input" style={{ maxWidth: 460 }} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por código, equipo o cliente" /></div></div>
    {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
    <EquiposClientesListado fichas={fichasVisibles} cuentasPorId={cuentasPorId} selectedId={selectedId} onSelect={setSelectedId} loading={loading} emptyMessage="No hay equipos de clientes para esta empresa." />
    <EquipoClienteHistorial ficha={seleccionada} cuentasPorId={cuentasPorId} />
  </div>;
}

export { EquiposClientes };
