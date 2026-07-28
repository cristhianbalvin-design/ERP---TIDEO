import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { useApp } from '../context.jsx';

const TABS = [
  { id: 'pantallas', label: 'Pantallas' },
  { id: 'plantillas_masivas', label: 'Plantillas Masivas' },
];

const FILTROS_RAPIDOS = [
  { id: 'todas', label: 'Todas' },
  { id: 'pendientes', label: 'Solo pendientes' },
  { id: 'sin_responsable', label: 'Sin responsable asignado' },
  { id: 'con_datos', label: 'Con datos' },
  { id: 'sin_capacitar', label: 'Sin capacitar' },
  { id: 'sin_implementar', label: 'Sin implementar' },
];

const normalizarTexto = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const usuarioLabel = (usuario) => {
  if (!usuario) return '';
  if (usuario.email && usuario.email !== usuario.nombre) {
    return `${usuario.nombre} · ${usuario.email}`;
  }
  return usuario.nombre || usuario.email || usuario.user_id;
};

const fechaComentario = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const citaComentario = (texto, maximo = 110) => {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  return limpio.length > maximo ? `${limpio.slice(0, maximo)}…` : limpio;
};

function SelectorUsuario({ value, onChange, usuarios, placeholder, disabled }) {
  return (
    <select
      className="input"
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      style={{ width: '100%', minWidth: 190, fontSize: 11 }}
    >
      <option value="">{placeholder}</option>
      {usuarios.map((usuario) => (
        <option key={usuario.user_id} value={usuario.user_id}>
          {usuarioLabel(usuario)}
        </option>
      ))}
    </select>
  );
}

function EstadoAvance({
  campo,
  etiqueta,
  anotacion,
  puedeEditar,
  guardando,
  onCambiar,
}) {
  const valor = Boolean(anotacion?.[campo]);
  const autor = anotacion?.[`${campo}_por_nombre`];
  const fecha = anotacion?.[`${campo}_at`];

  return (
    <div style={{ minWidth: 125, display: 'grid', gap: 5 }}>
      {puedeEditar ? (
        <button
          type="button"
          role="switch"
          aria-checked={valor}
          className={`btn ${valor ? 'btn-primary' : 'btn-secondary'}`}
          disabled={guardando}
          onClick={() => onCambiar(!valor)}
          style={{ minWidth: 92, justifySelf: 'start', fontSize: 11 }}
        >
          {guardando ? 'Guardando...' : valor ? '✓ Sí' : 'No'}
        </button>
      ) : (
        <span className={`badge ${valor ? 'badge-green' : 'badge-gray'}`}>
          {valor ? `✓ ${etiqueta}` : 'Pendiente'}
        </span>
      )}
      {(autor || fecha) && (
        <div className="text-muted" style={{ fontSize: 9, lineHeight: 1.35 }}>
          {autor || 'Usuario TIDEO'}
          {fecha ? ` · ${fechaComentario(fecha)}` : ''}
        </div>
      )}
    </div>
  );
}

function HistorialComentarios({
  comentarios,
  comentariosPorId,
  borrador,
  onBorradorChange,
  onAgregar,
  guardando,
  puedeAgregar = true,
  placeholder = 'Agregar comentario...',
  botonLabel = 'Agregar comentario',
  mostrarOpcionInterna = false,
  soloInterno = false,
  onSoloInternoChange,
  onResponder,
  respuestaActiva,
  onCancelarRespuesta,
}) {
  return (
    <div style={{ minWidth: 260, display: 'grid', gap: 8 }}>
      <div style={{ maxHeight: 150, overflowY: 'auto', display: 'grid', gap: 6 }}>
        {comentarios.map((comentario) => {
          const original = comentario.respuesta_a_comentario_id
            ? comentariosPorId[comentario.respuesta_a_comentario_id]
            : null;

          return (
            <div
              key={comentario.id}
              style={{
                border: '1px solid var(--border)',
                borderLeft: comentario.respuesta_a_comentario_id
                  ? '3px solid var(--cyan)'
                  : '1px solid var(--border)',
                borderRadius: 8,
                padding: '7px 9px',
                marginLeft: comentario.respuesta_a_comentario_id ? 12 : 0,
                background: 'var(--bg-subtle)',
                whiteSpace: 'normal',
              }}
            >
              {original && (
                <div
                  style={{
                    padding: '5px 7px',
                    marginBottom: 6,
                    borderRadius: 6,
                    background: 'var(--bg)',
                    borderLeft: '2px solid var(--cyan)',
                    fontSize: 9,
                    color: 'var(--fg-muted)',
                  }}
                >
                  En respuesta a {original.autor_nombre} · {fechaComentario(original.created_at)}
                  <div style={{ marginTop: 2 }}>“{citaComentario(original.texto)}”</div>
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginBottom: 3 }}>
                {comentario.autor_nombre} · {fechaComentario(comentario.created_at)}
              </div>
              {comentario.solo_interno && (
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--warning)', marginBottom: 3 }}>
                  Nota interna
                </div>
              )}
              <div style={{ fontSize: 11, lineHeight: 1.4 }}>{comentario.texto}</div>
              {onResponder && (
                <button
                  type="button"
                  onClick={() => onResponder(comentario)}
                  style={{
                    marginTop: 5,
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    color: 'var(--cyan)',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  Responder
                </button>
              )}
            </div>
          );
        })}
        {comentarios.length === 0 && (
          <div className="text-muted" style={{ fontSize: 10 }}>
            Sin comentarios.
          </div>
        )}
      </div>
      {puedeAgregar ? (
        <>
          {respuestaActiva && (
            <div
              style={{
                padding: '6px 8px',
                borderRadius: 7,
                background: 'rgba(6,182,212,.08)',
                borderLeft: '3px solid var(--cyan)',
                fontSize: 9,
              }}
            >
              <div style={{ color: 'var(--fg-muted)' }}>
                Respondiendo a {respuestaActiva.autor_nombre}
                {' · '}
                {fechaComentario(respuestaActiva.created_at)}
              </div>
              <div style={{ marginTop: 2 }}>“{citaComentario(respuestaActiva.texto)}”</div>
              <button
                type="button"
                onClick={onCancelarRespuesta}
                style={{
                  padding: 0,
                  marginTop: 4,
                  border: 0,
                  background: 'transparent',
                  color: 'var(--danger)',
                  fontSize: 9,
                  cursor: 'pointer',
                }}
              >
                Cancelar respuesta
              </button>
            </div>
          )}
          <textarea
            className="input"
            rows={2}
            value={borrador}
            onChange={(event) => onBorradorChange(event.target.value)}
            placeholder={placeholder}
            style={{ width: '100%', resize: 'vertical', fontSize: 11 }}
          />
          {mostrarOpcionInterna && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
              <input
                type="checkbox"
                checked={soloInterno}
                onChange={(event) => onSoloInternoChange(event.target.checked)}
              />
              Marcar como nota interna (no visible para el cliente)
            </label>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={guardando || !borrador.trim()}
            onClick={onAgregar}
            style={{ fontSize: 11, justifySelf: 'start' }}
          >
            {guardando ? 'Guardando...' : botonLabel}
          </button>
        </>
      ) : (
        <div className="text-muted" style={{ fontSize: 10 }}>
          Historial de solo lectura.
        </div>
      )}
    </div>
  );
}

export function SaludImplementacionPanel({
  esSuperadmin,
  modoTenant = false,
  tenantId,
  tenants = [],
  onTenantChange,
  titulo,
  subtitulo,
}) {
  const { authUser } = useApp();
  const modoSuperadmin = esSuperadmin && !modoTenant;
  const esPersonalTideo = String(authUser?.email || '')
    .trim()
    .toLowerCase()
    .endsWith('@tideo.tech');
  const [pestana, setPestana] = useState('pantallas');
  const [filtroRapido, setFiltroRapido] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configuraciones, setConfiguraciones] = useState([]);
  const [conteos, setConteos] = useState({});
  const [anotaciones, setAnotaciones] = useState({});
  const [borradoresResponsables, setBorradoresResponsables] = useState({});
  const [usuariosTideo, setUsuariosTideo] = useState([]);
  const [usuariosCliente, setUsuariosCliente] = useState([]);
  const [comentarios, setComentarios] = useState({});
  const [borradoresComentarios, setBorradoresComentarios] = useState({});
  const [comentariosInternos, setComentariosInternos] = useState({});
  const [respuestasActivas, setRespuestasActivas] = useState({});
  const [estadoGuardado, setEstadoGuardado] = useState({});
  const [estadosGuardando, setEstadosGuardando] = useState({});
  const [comentariosGuardando, setComentariosGuardando] = useState({});
  const [seccionesColapsadas, setSeccionesColapsadas] = useState({});

  const cargarDatos = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const supabase = await getSupabaseClient();
      const configuracionesQuery = supabase
        .from('tideo_salud_configuracion')
        .select('*')
        .eq('activa', true)
        .order('pestana', { ascending: true })
        .order('orden', { ascending: true })
        .order('seccion', { ascending: true })
        .order('pantalla', { ascending: true });

      const conteosQuery = modoSuperadmin
        ? supabase.rpc('get_salud_implementacion_conteos', { p_tenant_ids: [tenantId] })
        : supabase.rpc('get_salud_implementacion_conteos_local', { p_tenant_id: tenantId });

      const anotacionesQuery = supabase
        .from('tideo_salud_anotaciones')
        .select('*')
        .eq('empresa_id', tenantId);

      const usuariosQuery = supabase
        .rpc('get_salud_implementacion_usuarios', { p_tenant_id: tenantId });

      const comentariosQuery = supabase
        .from('tideo_salud_comentarios')
        .select('id, configuracion_id, empresa_id, audiencia, autor_id, autor_nombre, texto, solo_interno, respuesta_a_comentario_id, created_at')
        .eq('empresa_id', tenantId)
        .order('created_at', { ascending: false });

      const [configResp, conteosResp, anotacionesResp, usuariosResp, comentariosResp] =
        await Promise.all([
          configuracionesQuery,
          conteosQuery,
          anotacionesQuery,
          usuariosQuery,
          comentariosQuery,
        ]);

      const primeraFalla = [
        configResp,
        conteosResp,
        anotacionesResp,
        usuariosResp,
        comentariosResp,
      ].find((respuesta) => respuesta.error);

      if (primeraFalla?.error) throw primeraFalla.error;

      const nuevasConfiguraciones = configResp.data || [];
      const nuevosConteos = {};
      (conteosResp.data || []).forEach((fila) => {
        nuevosConteos[fila.configuracion_id] = Number(fila.conteo || 0);
      });

      const nuevasAnotaciones = {};
      const nuevosBorradores = {};
      (anotacionesResp.data || []).forEach((fila) => {
        nuevasAnotaciones[fila.configuracion_id] = fila;
        nuevosBorradores[fila.configuracion_id] = {
          responsable_tideo: fila.responsable_tideo || '',
          responsable_cliente: fila.responsable_cliente || '',
        };
      });

      nuevasConfiguraciones.forEach((fila) => {
        if (!nuevosBorradores[fila.id]) {
          nuevosBorradores[fila.id] = {
            responsable_tideo: '',
            responsable_cliente: '',
          };
        }
      });

      const nuevosComentarios = {};
      (comentariosResp.data || []).forEach((fila) => {
        const key = `${fila.configuracion_id}_${fila.audiencia}`;
        if (!nuevosComentarios[key]) nuevosComentarios[key] = [];
        nuevosComentarios[key].push(fila);
      });

      const usuarios = usuariosResp.data || [];
      setConfiguraciones(nuevasConfiguraciones);
      setConteos(nuevosConteos);
      setAnotaciones(nuevasAnotaciones);
      setBorradoresResponsables(nuevosBorradores);
      setUsuariosTideo(usuarios.filter((usuario) => usuario.tipo_usuario === 'tideo'));
      setUsuariosCliente(usuarios.filter((usuario) => usuario.tipo_usuario === 'cliente'));
      setComentarios(nuevosComentarios);
    } catch (err) {
      console.error('Error cargando Salud de Implementación:', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [modoSuperadmin, modoTenant, tenantId]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const configuracionesPestana = useMemo(
    () => configuraciones.filter((configuracion) => configuracion.pestana === pestana),
    [configuraciones, pestana],
  );

  const comentariosPorId = useMemo(() => {
    const indice = {};
    Object.values(comentarios).flat().forEach((comentario) => {
      indice[comentario.id] = comentario;
    });
    return indice;
  }, [comentarios]);

  const configuracionesFiltradas = useMemo(() => {
    const termino = normalizarTexto(busqueda.trim());

    return configuracionesPestana.filter((configuracion) => {
      const count = conteos[configuracion.id] || 0;
      const anotacion = anotaciones[configuracion.id] || {};
      const coincideBusqueda = !termino || normalizarTexto(
        `${configuracion.seccion} ${configuracion.pantalla}`,
      ).includes(termino);

      if (!coincideBusqueda) return false;

      switch (filtroRapido) {
        case 'pendientes':
          return count === 0;
        case 'sin_responsable':
          return !anotacion.responsable_tideo && !anotacion.responsable_cliente;
        case 'con_datos':
          return count > 0;
        case 'sin_capacitar':
          return !anotacion.capacitado;
        case 'sin_implementar':
          return !anotacion.implementado;
        default:
          return true;
      }
    });
  }, [anotaciones, busqueda, configuracionesPestana, conteos, filtroRapido]);

  const resumen = useMemo(() => ({
    total: configuracionesPestana.length,
    conDatos: configuracionesPestana.filter(
      (configuracion) => (conteos[configuracion.id] || 0) > 0,
    ).length,
    capacitadas: configuracionesPestana.filter(
      (configuracion) => Boolean(anotaciones[configuracion.id]?.capacitado),
    ).length,
    implementadas: configuracionesPestana.filter(
      (configuracion) => Boolean(anotaciones[configuracion.id]?.implementado),
    ).length,
  }), [anotaciones, configuracionesPestana, conteos]);

  const resumenSecciones = useMemo(() => {
    const indice = {};
    configuracionesPestana.forEach((configuracion) => {
      if (!indice[configuracion.seccion]) {
        indice[configuracion.seccion] = { total: 0, conDatos: 0 };
      }
      indice[configuracion.seccion].total += 1;
      if ((conteos[configuracion.id] || 0) > 0) {
        indice[configuracion.seccion].conDatos += 1;
      }
    });
    return indice;
  }, [configuracionesPestana, conteos]);

  const gruposFiltrados = useMemo(() => {
    const ordenOriginal = new Map(
      configuracionesPestana.map((configuracion, indice) => [configuracion.id, indice]),
    );
    const grupos = new Map();

    configuracionesFiltradas.forEach((configuracion) => {
      if (!grupos.has(configuracion.seccion)) grupos.set(configuracion.seccion, []);
      grupos.get(configuracion.seccion).push(configuracion);
    });

    return Array.from(grupos.entries()).map(([seccion, filas]) => ({
      seccion,
      filas: filas.sort((a, b) => {
        const pendienteA = (conteos[a.id] || 0) === 0 ? 0 : 1;
        const pendienteB = (conteos[b.id] || 0) === 0 ? 0 : 1;
        return pendienteA - pendienteB
          || (ordenOriginal.get(a.id) || 0) - (ordenOriginal.get(b.id) || 0);
      }),
    }));
  }, [configuracionesFiltradas, configuracionesPestana, conteos]);

  useEffect(() => {
    const inicial = {};
    Object.entries(resumenSecciones).forEach(([seccion, avance]) => {
      inicial[seccion] = avance.total > 0 && avance.conDatos === avance.total;
    });
    setSeccionesColapsadas(inicial);
  }, [tenantId, pestana, resumenSecciones]);

  const actualizarResponsable = (configuracionId, campo, valor) => {
    setBorradoresResponsables((prev) => ({
      ...prev,
      [configuracionId]: {
        responsable_tideo: prev[configuracionId]?.responsable_tideo || '',
        responsable_cliente: prev[configuracionId]?.responsable_cliente || '',
        [campo]: valor,
      },
    }));
    setEstadoGuardado((prev) => ({ ...prev, [configuracionId]: '' }));
  };

  const guardarResponsables = async (configuracionId) => {
    const borrador = borradoresResponsables[configuracionId] || {};
    setEstadoGuardado((prev) => ({ ...prev, [configuracionId]: 'guardando' }));

    try {
      const supabase = await getSupabaseClient();
      const { data, error: rpcError } = await supabase.rpc(
        'guardar_salud_implementacion_responsables',
        {
          p_configuracion_id: configuracionId,
          p_empresa_id: tenantId,
          p_responsable_tideo: borrador.responsable_tideo || null,
          p_responsable_cliente: borrador.responsable_cliente || null,
        },
      );

      if (rpcError) throw rpcError;
      const fila = Array.isArray(data) ? data[0] : data;
      if (fila) {
        setAnotaciones((prev) => ({ ...prev, [configuracionId]: fila }));
      }
      setEstadoGuardado((prev) => ({ ...prev, [configuracionId]: 'ok' }));
      window.setTimeout(() => {
        setEstadoGuardado((prev) => (
          prev[configuracionId] === 'ok'
            ? { ...prev, [configuracionId]: '' }
            : prev
        ));
      }, 2200);
    } catch (err) {
      console.error('Error guardando responsables:', err);
      setEstadoGuardado((prev) => ({ ...prev, [configuracionId]: 'error' }));
      setError(`No se pudieron guardar los responsables: ${err.message || String(err)}`);
    }
  };

  const guardarEstado = async (configuracionId, campo, valor) => {
    const key = `${configuracionId}_${campo}`;
    setEstadosGuardando((prev) => ({ ...prev, [key]: true }));
    setError('');

    try {
      const supabase = await getSupabaseClient();
      const { data, error: rpcError } = await supabase.rpc(
        'guardar_salud_implementacion_estado',
        {
          p_configuracion_id: configuracionId,
          p_empresa_id: tenantId,
          p_campo: campo,
          p_valor: valor,
        },
      );

      if (rpcError) throw rpcError;
      const fila = Array.isArray(data) ? data[0] : data;
      if (fila) {
        setAnotaciones((prev) => ({ ...prev, [configuracionId]: fila }));
      }
    } catch (err) {
      console.error('Error guardando estado de implementación:', err);
      setError(`No se pudo guardar el estado: ${err.message || String(err)}`);
    } finally {
      setEstadosGuardando((prev) => ({ ...prev, [key]: false }));
    }
  };

  const prepararRespuesta = (configuracionId, comentario) => {
    const audienciaRespuesta = esPersonalTideo ? 'tideo' : 'cliente';
    const key = `${configuracionId}_${audienciaRespuesta}`;
    setRespuestasActivas((prev) => ({ ...prev, [key]: comentario }));
  };

  const agregarComentario = async (configuracionId, audiencia) => {
    const key = `${configuracionId}_${audiencia}`;
    const texto = (borradoresComentarios[key] || '').trim();
    if (!texto || (audiencia === 'tideo' && !esPersonalTideo)) return;

    setComentariosGuardando((prev) => ({ ...prev, [key]: true }));
    setError('');

    try {
      const supabase = await getSupabaseClient();
      const payload = {
        configuracion_id: configuracionId,
        empresa_id: tenantId,
        audiencia,
        texto,
        respuesta_a_comentario_id: respuestasActivas[key]?.id || null,
      };
      if (audiencia === 'tideo') {
        payload.solo_interno = Boolean(comentariosInternos[key]);
      }

      const { data, error: insertError } = await supabase
        .from('tideo_salud_comentarios')
        .insert(payload)
        .select('id, configuracion_id, empresa_id, audiencia, autor_id, autor_nombre, texto, solo_interno, respuesta_a_comentario_id, created_at')
        .single();

      if (insertError) throw insertError;
      setComentarios((prev) => ({
        ...prev,
        [key]: [data, ...(prev[key] || [])],
      }));
      setBorradoresComentarios((prev) => ({ ...prev, [key]: '' }));
      setComentariosInternos((prev) => ({ ...prev, [key]: false }));
      setRespuestasActivas((prev) => ({ ...prev, [key]: null }));
    } catch (err) {
      console.error('Error agregando comentario:', err);
      setError(`No se pudo agregar el comentario: ${err.message || String(err)}`);
    } finally {
      setComentariosGuardando((prev) => ({ ...prev, [key]: false }));
    }
  };

  const cambiarPestana = (nuevaPestana) => {
    setPestana(nuevaPestana);
    setFiltroRapido('todas');
    setBusqueda('');
  };

  return (
    <div className="card" style={{ margin: 24 }}>
      <div
        className="card-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 className="card-title" style={{ fontSize: 18, fontWeight: 700 }}>
            {titulo}
          </h2>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
            {subtitulo}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {modoSuperadmin && tenants.length > 0 && (
            <select
              className="input"
              value={tenantId || ''}
              onChange={(event) => onTenantChange?.(event.target.value)}
              style={{ minWidth: 210 }}
              aria-label="Tenant"
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.nombre_comercial || tenant.razon_social}
                </option>
              ))}
            </select>
          )}
          <select
            className="input"
            value={filtroRapido}
            onChange={(event) => setFiltroRapido(event.target.value)}
            style={{ minWidth: 210 }}
            aria-label="Filtro rápido"
          >
            {FILTROS_RAPIDOS.map((filtro) => (
              <option key={filtro.id} value={filtro.id}>{filtro.label}</option>
            ))}
          </select>
          <input
            type="search"
            className="input"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar pantalla o sección..."
            aria-label="Buscar pantalla o sección"
            style={{ minWidth: 230 }}
          />
          <button type="button" className="btn btn-secondary" onClick={cargarDatos}>
            Actualizar
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
        {TABS.map((tab) => {
          const cantidad = configuraciones.filter((fila) => fila.pestana === tab.id).length;
          return (
            <button
              key={tab.id}
              type="button"
              className={`btn ${pestana === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => cambiarPestana(tab.id)}
            >
              {tab.label} ({cantidad})
            </button>
          );
        })}
      </div>

      <div
        style={{
          margin: '0 16px 12px',
          padding: '9px 12px',
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--bg-subtle)',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {resumen.total} {pestana === 'pantallas' ? 'pantallas' : 'plantillas'}
        {' · '}
        {resumen.conDatos} con datos
        {' · '}
        {resumen.capacitadas} capacitadas
        {' · '}
        {resumen.implementadas} implementadas
      </div>

      {error && (
        <div
          style={{
            margin: '0 16px 12px',
            padding: 10,
            borderRadius: 8,
            color: 'var(--danger)',
            background: 'rgba(239,68,68,.08)',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-muted" style={{ padding: 40, textAlign: 'center' }}>
          Cargando salud de implementación...
        </div>
      ) : (
        <div
          className="table-responsive"
          style={{ maxHeight: 'calc(100vh - 230px)', overflow: 'auto' }}
        >
          <table className="table" style={{ fontSize: 12, whiteSpace: 'normal' }}>
            <thead
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: 'var(--bg)',
                boxShadow: '0 1px 0 var(--border)',
              }}
            >
              <tr>
                <th style={{ minWidth: 220 }}>Módulo / Pantalla</th>
                <th style={{ width: 90, textAlign: 'center' }}>Registros</th>
                <th style={{ minWidth: 135 }}>Capacitado</th>
                <th style={{ minWidth: 135 }}>Implementado</th>
                <th style={{ minWidth: 210 }}>Responsable TIDEO</th>
                <th style={{ minWidth: 210 }}>Responsable Cliente</th>
                <th style={{ width: 105 }}>Guardar</th>
                <th style={{ minWidth: 280 }}>Observaciones TIDEO</th>
                <th style={{ minWidth: 280 }}>Observaciones Cliente</th>
              </tr>
            </thead>
            <tbody>
              {gruposFiltrados.map(({ seccion, filas }) => {
                const colapsada = Boolean(seccionesColapsadas[seccion]);
                const avance = resumenSecciones[seccion] || { conDatos: 0, total: filas.length };

                return (
                  <React.Fragment key={seccion}>
                    <tr>
                      <td
                        colSpan={9}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--bg-subtle)',
                          borderTop: '1px solid var(--border)',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setSeccionesColapsadas((prev) => ({
                            ...prev,
                            [seccion]: !colapsada,
                          }))}
                          aria-expanded={!colapsada}
                          style={{
                            width: '100%',
                            padding: 0,
                            border: 0,
                            background: 'transparent',
                            color: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          <span aria-hidden="true">{colapsada ? '▸' : '▾'}</span>
                          <span>{seccion}</span>
                          <span className="badge badge-gray">
                            {avance.conDatos}/{avance.total} con datos
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!colapsada && filas.map((configuracion) => {
                      const count = conteos[configuracion.id] || 0;
                      const anotacion = anotaciones[configuracion.id] || {};
                      const borrador = borradoresResponsables[configuracion.id] || {};
                      const guardado = estadoGuardado[configuracion.id];
                      const cambioPendiente =
                        (borrador.responsable_tideo || '') !==
                          (anotacion.responsable_tideo || '')
                        || (borrador.responsable_cliente || '') !==
                          (anotacion.responsable_cliente || '');
                      const requiereAtencion = count === 0
                        && !anotacion.responsable_tideo
                        && !anotacion.responsable_cliente;
                      const keyTideo = `${configuracion.id}_tideo`;
                      const keyCliente = `${configuracion.id}_cliente`;

                      return (
                        <tr
                          key={configuracion.id}
                          className="hover-row"
                          title={requiereAtencion ? 'Requiere atención: sin datos ni responsables' : ''}
                          style={requiereAtencion ? {
                            boxShadow: 'inset 4px 0 0 var(--danger)',
                            background: 'rgba(239,68,68,.035)',
                          } : undefined}
                        >
                          <td style={{ verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 600 }}>{configuracion.pantalla}</div>
                            {requiereAtencion && (
                              <div style={{ color: 'var(--danger)', fontSize: 9, marginTop: 3 }}>
                                ● Requiere atención
                              </div>
                            )}
                            <div
                              style={{ fontSize: 10, color: 'var(--cyan)', marginTop: 3 }}
                              title={configuracion.evidencia || ''}
                            >
                              {[configuracion.tabla_principal, configuracion.tabla_secundaria]
                                .filter(Boolean)
                                .join(' + ')}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', verticalAlign: 'top' }}>
                            <span
                              className={`badge ${count > 0 ? 'badge-green' : 'badge-gray'}`}
                              style={{ minWidth: 42, textAlign: 'center' }}
                            >
                              {count}
                            </span>
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <EstadoAvance
                              campo="capacitado"
                              etiqueta="Capacitado"
                              anotacion={anotacion}
                              puedeEditar={esPersonalTideo}
                              guardando={Boolean(
                                estadosGuardando[`${configuracion.id}_capacitado`],
                              )}
                              onCambiar={(valor) => guardarEstado(
                                configuracion.id,
                                'capacitado',
                                valor,
                              )}
                            />
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <EstadoAvance
                              campo="implementado"
                              etiqueta="Implementado"
                              anotacion={anotacion}
                              puedeEditar={esPersonalTideo}
                              guardando={Boolean(
                                estadosGuardando[`${configuracion.id}_implementado`],
                              )}
                              onCambiar={(valor) => guardarEstado(
                                configuracion.id,
                                'implementado',
                                valor,
                              )}
                            />
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <SelectorUsuario
                              value={borrador.responsable_tideo}
                              onChange={(value) => actualizarResponsable(
                                configuracion.id,
                                'responsable_tideo',
                                value,
                              )}
                              usuarios={usuariosTideo}
                              placeholder={
                                usuariosTideo.length
                                  ? 'Sin asignar'
                                  : 'Sin usuarios TIDEO elegibles'
                              }
                            />
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <SelectorUsuario
                              value={borrador.responsable_cliente}
                              onChange={(value) => actualizarResponsable(
                                configuracion.id,
                                'responsable_cliente',
                                value,
                              )}
                              usuarios={usuariosCliente}
                              placeholder={
                                usuariosCliente.length
                                  ? 'Sin asignar'
                                  : 'Sin usuarios cliente elegibles'
                              }
                            />
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={
                                guardado === 'guardando'
                                || (!cambioPendiente && guardado !== 'error')
                              }
                              onClick={() => guardarResponsables(configuracion.id)}
                              style={{ minWidth: 88, fontSize: 11 }}
                            >
                              {guardado === 'guardando'
                                ? 'Guardando...'
                                : guardado === 'ok'
                                  ? '✓ Guardado'
                                  : guardado === 'error'
                                    ? 'Reintentar'
                                    : 'Guardar'}
                            </button>
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <HistorialComentarios
                              comentarios={comentarios[keyTideo] || []}
                              comentariosPorId={comentariosPorId}
                              borrador={borradoresComentarios[keyTideo] || ''}
                              onBorradorChange={(value) => setBorradoresComentarios((prev) => ({
                                ...prev,
                                [keyTideo]: value,
                              }))}
                              onAgregar={() => agregarComentario(configuracion.id, 'tideo')}
                              guardando={Boolean(comentariosGuardando[keyTideo])}
                              puedeAgregar={esPersonalTideo}
                              placeholder="Agregar observación TIDEO..."
                              botonLabel="Agregar observación TIDEO"
                              mostrarOpcionInterna={esPersonalTideo}
                              soloInterno={Boolean(comentariosInternos[keyTideo])}
                              onSoloInternoChange={(value) => setComentariosInternos((prev) => ({
                                ...prev,
                                [keyTideo]: value,
                              }))}
                              onResponder={(comentario) => prepararRespuesta(
                                configuracion.id,
                                comentario,
                              )}
                              respuestaActiva={respuestasActivas[keyTideo]}
                              onCancelarRespuesta={() => setRespuestasActivas((prev) => ({
                                ...prev,
                                [keyTideo]: null,
                              }))}
                            />
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <HistorialComentarios
                              comentarios={comentarios[keyCliente] || []}
                              comentariosPorId={comentariosPorId}
                              borrador={borradoresComentarios[keyCliente] || ''}
                              onBorradorChange={(value) => setBorradoresComentarios((prev) => ({
                                ...prev,
                                [keyCliente]: value,
                              }))}
                              onAgregar={() => agregarComentario(configuracion.id, 'cliente')}
                              guardando={Boolean(comentariosGuardando[keyCliente])}
                              onResponder={(comentario) => prepararRespuesta(
                                configuracion.id,
                                comentario,
                              )}
                              respuestaActiva={respuestasActivas[keyCliente]}
                              onCancelarRespuesta={() => setRespuestasActivas((prev) => ({
                                ...prev,
                                [keyCliente]: null,
                              }))}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {configuracionesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-muted" style={{ padding: 40 }}>
                    No hay configuraciones para mostrar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
