import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context.jsx';
import { getActivosParaOS } from '../services/activosService.js';
import { SelectorTipoCotizacion } from './SelectorTipoCotizacion.jsx';
import { AdvertenciaHojaCosteoDuplicada } from './AdvertenciaHojaCosteoDuplicada.jsx';
import {
  listarRecepcionesActivosCliente,
  devolverRecepcionActivoCliente,
} from '../services/recepcionesActivosClienteService.js';

const today = () => new Date().toISOString().slice(0, 10);

const diasDesde = fecha => {
  if (!fecha) return '—';
  const inicio = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return '—';
  return Math.max(0, Math.floor((Date.now() - inicio.getTime()) / 86400000));
};

const ESTADO_CUSTODIA = {
  recibido: { label: 'Recibido', className: 'badge-cyan' },
  en_diagnostico: { label: 'En diagnóstico', className: 'badge-orange' },
  en_reparacion: { label: 'En reparación', className: 'badge-cyan' },
  listo_entrega: { label: 'Listo para entrega', className: 'badge-green' },
  entregado: { label: 'Entregado', className: 'badge-gray' },
};

const estadoCustodia = estado => ESTADO_CUSTODIA[estado] || {
  label: estado ? String(estado).replaceAll('_', ' ') : 'Sin estado',
  className: 'badge-gray',
};

export function BandejaRecepcionesActivosCliente() {
  const {
    empresa,
    crearHojaCosteo,
    navigate,
  } = useApp();
  const empresaId = empresa?.id || '';
  const [recepciones, setRecepciones] = useState([]);
  const [activos, setActivos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [errorRecepcionId, setErrorRecepcionId] = useState(null);
  const [selectorCotizacion, setSelectorCotizacion] = useState(null);
  const [advertenciaHojaCosteo, setAdvertenciaHojaCosteo] = useState(null);
  const [modalDevolucion, setModalDevolucion] = useState(null);
  const [devolucion, setDevolucion] = useState({ fecha_devolucion: today(), guia_devolucion: '' });

  const cargar = async () => {
    if (!empresaId) {
      setRecepciones([]);
      setActivos([]);
      return;
    }
    setLoading(true);
    try {
      const [recepcionesEmpresa, activosEmpresa] = await Promise.all([
        listarRecepcionesActivosCliente(empresaId),
        getActivosParaOS(empresaId),
      ]);
      setRecepciones(recepcionesEmpresa);
      setActivos(activosEmpresa);
      setError('');
      setErrorRecepcionId(null);
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar las recepciones de activos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [empresaId]);

  const activosPorId = useMemo(() => new Map(activos.map(activo => [activo.id, activo])), [activos]);

  const abrirCotizacion = recepcion => {
    const activo = activosPorId.get(recepcion.activo_id);
    if (!activo?.cliente_propietario_id) {
      setError(`${recepcion.numero}: el activo ${activo?.codigo || 'sin código'} no tiene cliente propietario; así no se puede abrir una cotización.`);
      setErrorRecepcionId(recepcion.id);
      return;
    }
    setError('');
    setErrorRecepcionId(null);
    setSelectorCotizacion(recepcion);
  };

  const abrirCotizacionEstandar = (recepcion, lineaNegocio) => {
    setSelectorCotizacion(null);
    navigate('cotizaciones', {
      recepcion_id: recepcion.id,
      activo_id: recepcion.activo_id,
      linea_negocio: lineaNegocio,
    });
  };

  const abrirCotizacionEspecial = (recepcion, plantilla, lineaNegocio) => {
    const activo = activosPorId.get(recepcion.activo_id);
    setSelectorCotizacion(null);
    navigate('cotizaciones', {
      especial: 'nueva',
      plantilla_documento_id: plantilla.id,
      tipo_documento_id: plantilla.tipo_documento_id,
      cuenta_id: activo?.cliente_propietario_id || null,
      recepcion_id: recepcion.id,
      activo_id: recepcion.activo_id,
      linea_negocio: lineaNegocio || null,
    });
  };

  const iniciarHojaCosteo = async (recepcion, lineaNegocio, reemplazarAprobadas = false) => {
    const activo = activosPorId.get(recepcion.activo_id);
    if (!activo?.cliente_propietario_id) {
      setError(`${recepcion.numero}: el activo ${activo?.codigo || 'sin código'} no tiene cliente propietario; así no se puede iniciar una Hoja de Costeo.`);
      setErrorRecepcionId(recepcion.id);
      return;
    }
    setSaving(true);
    setError('');
    setErrorRecepcionId(null);
    try {
      const hojaId = await crearHojaCosteo({
        cuenta_id: activo.cliente_propietario_id,
        linea_negocio: lineaNegocio,
        sociedad_id: recepcion.sociedad_id || null,
        activo_id: recepcion.activo_id,
        recepcion_id: recepcion.id,
        moneda: empresa?.moneda || 'PEN',
      }, { reemplazarAprobadas });
      navigate('hoja_costeo_wizard', { hojaId });
    } catch (err) {
      if (err?.code === 'HC_DUPLICADA_APROBADA_SIN_COTIZACION') {
        setAdvertenciaHojaCosteo({ recepcion, lineaNegocio, hojas: err.hojasCosteo || [] });
        return;
      }
      setError(err?.message || 'No se pudo iniciar la Hoja de Costeo desde esta recepción.');
    } finally {
      setSaving(false);
    }
  };

  const abrirDevolucion = recepcion => {
    setDevolucion({ fecha_devolucion: today(), guia_devolucion: '' });
    setError('');
    setErrorRecepcionId(null);
    setModalDevolucion(recepcion);
  };

  const guardarDevolucion = async event => {
    event.preventDefault();
    if (!modalDevolucion || !devolucion.fecha_devolucion) {
      setError('La fecha de devolución es obligatoria.');
      return;
    }
    setSaving(true);
    try {
      const actualizada = await devolverRecepcionActivoCliente(empresaId, modalDevolucion.id, devolucion);
      setRecepciones(actuales => actuales.map(item => item.id === actualizada.id ? { ...item, ...actualizada } : item));
      setModalDevolucion(null);
      setError('');
    } catch (err) {
      setError(err?.message || 'No se pudo registrar la devolución.');
    } finally {
      setSaving(false);
    }
  };

  if (!empresaId) return null;

  return <>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div>
            <div className="eyebrow">Recepción de activos</div>
            <h3 style={{ margin: 0 }}>Bandeja de activos de clientes</h3>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Consulta de ingresos y estado de custodia. Las nuevas recepciones se registran desde Operaciones.
            </div>
          </div>
        </div>
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          Las recepciones de activos ahora se registran desde Operaciones. Ve a {'App de Operaciones → Taller & Operaciones → Recepción de Activos'} para registrar el ingreso de un activo de cliente.
        </div>
        {error && !errorRecepcionId && !selectorCotizacion && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="table-wrap">
          <table className="tbl" style={{ minWidth: 980 }}>
            <thead><tr><th>Recepción</th><th>Código</th><th>Activo</th><th>Estado de custodia</th><th>Ingreso</th><th>Días</th><th>Guía</th><th /></tr></thead>
            <tbody>
              {recepciones.map(recepcion => {
                const activo = activosPorId.get(recepcion.activo_id);
                const estado = estadoCustodia(recepcion.estado_custodia);
                const puedeCotizar = recepcion.estado === 'pendiente_cotizar';
                return <tr key={recepcion.id}>
                  <td className="mono"><strong>{recepcion.numero || '—'}</strong>{errorRecepcionId === recepcion.id && <div className="alert alert-danger" style={{ marginTop: 8, marginBottom: 0, whiteSpace: 'normal', minWidth: 280 }}>{error}</div>}</td>
                  <td className="mono">{activo?.codigo || '—'}</td>
                  <td>{activo?.nombre || 'Activo no disponible'}{activo?.modelo ? ` · ${activo.modelo}` : ''}</td>
                  <td><span className={`badge ${estado.className}`}>{estado.label}</span></td>
                  <td>{recepcion.fecha_ingreso || '—'}{recepcion.hora_ingreso ? ` ${String(recepcion.hora_ingreso).slice(0, 5)}` : ''}</td>
                  <td>{diasDesde(recepcion.fecha_ingreso)}</td>
                  <td>{recepcion.guia_ingreso || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {puedeCotizar
                      ? <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirCotizacion(recepcion)} disabled={saving}>Cotizar</button>
                        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => abrirDevolucion(recepcion)} disabled={saving}>Devolver sin cotizar</button>
                      </>
                      : <span className="text-muted">Sin acción</span>}
                  </td>
                </tr>;
              })}
              {!recepciones.length && <tr><td colSpan="8" className="text-center text-muted" style={{ padding: 24 }}>{loading ? 'Cargando recepciones…' : 'No hay recepciones registradas.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    {modalDevolucion && <div className="modal-backdrop"><div className="modal" style={{ maxWidth: 520 }}>
      <div className="modal-head">
        <div><h2>Devolver sin cotizar</h2><div className="text-muted" style={{ fontSize: 12 }}>{modalDevolucion.numero}</div></div>
        <button className="icon-btn" onClick={() => { setModalDevolucion(null); setError(''); }}>×</button>
      </div>
      <form onSubmit={guardarDevolucion}>
        <div className="modal-body">
          {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}
          <div className="grid-2" style={{ gap: 14 }}>
            <div className="input-group"><label>Fecha de devolución *</label><input className="input" type="date" value={devolucion.fecha_devolucion} onChange={e => setDevolucion(actual => ({ ...actual, fecha_devolucion: e.target.value }))} required /></div>
            <div className="input-group"><label>Guía de devolución</label><input className="input" value={devolucion.guia_devolucion} onChange={e => setDevolucion(actual => ({ ...actual, guia_devolucion: e.target.value }))} placeholder="N° guía o documento" /></div>
          </div>
        </div>
        <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={() => { setModalDevolucion(null); setError(''); }}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Confirmar devolución'}</button></div>
      </form>
    </div></div>}

    {selectorCotizacion && <SelectorTipoCotizacion
      empresaId={empresaId}
      onHojaCosteo={lineaNegocio => iniciarHojaCosteo(selectorCotizacion, lineaNegocio)}
      onEstandar={lineaNegocio => abrirCotizacionEstandar(selectorCotizacion, lineaNegocio)}
      onEspecial={(plantilla, lineaNegocio) => abrirCotizacionEspecial(selectorCotizacion, plantilla, lineaNegocio)}
      onCancel={() => setSelectorCotizacion(null)}
      onError={mensaje => setError(mensaje)}
    />}
    {advertenciaHojaCosteo && <AdvertenciaHojaCosteoDuplicada
      hojas={advertenciaHojaCosteo.hojas}
      saving={saving}
      onCancel={() => {
        const hoja = advertenciaHojaCosteo.hojas[0];
        setAdvertenciaHojaCosteo(null);
        setSelectorCotizacion(null);
        if (hoja?.id) navigate('hoja_costeo_wizard', { hojaId: hoja.id });
      }}
      onContinue={() => {
        const { recepcion, lineaNegocio } = advertenciaHojaCosteo;
        setAdvertenciaHojaCosteo(null);
        iniciarHojaCosteo(recepcion, lineaNegocio, true);
      }}
    />}
  </>;
}

// Alias de compatibilidad para cualquier consumidor legacy que aún importe el nombre anterior.
export const RecepcionesActivosCliente = BandejaRecepcionesActivosCliente;
