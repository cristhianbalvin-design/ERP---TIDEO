import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../lib/supabaseClient.js';

const TABS = [
  { id: 'pantallas', label: 'Pantallas' },
  { id: 'plantillas_masivas', label: 'Plantillas Masivas' },
];

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

function HistorialComentarios({
  comentarios,
  borrador,
  onBorradorChange,
  onAgregar,
  guardando,
  bloqueado,
}) {
  if (bloqueado) {
    return (
      <div
        className="text-muted"
        style={{
          minWidth: 230,
          padding: 12,
          border: '1px dashed var(--border)',
          borderRadius: 8,
          fontSize: 11,
          textAlign: 'center',
        }}
      >
        Privado para TIDEO
      </div>
    );
  }

  return (
    <div style={{ minWidth: 260, display: 'grid', gap: 8 }}>
      <div style={{ maxHeight: 150, overflowY: 'auto', display: 'grid', gap: 6 }}>
        {comentarios.map((comentario) => (
          <div
            key={comentario.id}
            style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '7px 9px',
              background: 'var(--bg-subtle)',
              whiteSpace: 'normal',
            }}
          >
            <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginBottom: 3 }}>
              {comentario.autor_nombre} · {fechaComentario(comentario.created_at)}
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.4 }}>{comentario.texto}</div>
          </div>
        ))}
        {comentarios.length === 0 && (
          <div className="text-muted" style={{ fontSize: 10 }}>
            Sin comentarios.
          </div>
        )}
      </div>
      <textarea
        className="input"
        rows={2}
        value={borrador}
        onChange={(event) => onBorradorChange(event.target.value)}
        placeholder="Agregar comentario..."
        style={{ width: '100%', resize: 'vertical', fontSize: 11 }}
      />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={guardando || !borrador.trim()}
        onClick={onAgregar}
        style={{ fontSize: 11, justifySelf: 'start' }}
      >
        {guardando ? 'Guardando...' : 'Agregar comentario'}
      </button>
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
  const modoSuperadmin = esSuperadmin && !modoTenant;
  const [pestana, setPestana] = useState('pantallas');
  const [filtroSeccion, setFiltroSeccion] = useState('Todas');
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
  const [estadoGuardado, setEstadoGuardado] = useState({});
  const [comentariosGuardando, setComentariosGuardando] = useState({});

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

      let comentariosQuery = supabase
        .from('tideo_salud_comentarios')
        .select('id, configuracion_id, empresa_id, audiencia, autor_id, autor_nombre, texto, created_at')
        .eq('empresa_id', tenantId)
        .order('created_at', { ascending: false });

      // La vista tenant ni siquiera solicita la audiencia privada. RLS aplica como segunda barrera.
      if (modoTenant) {
        comentariosQuery = comentariosQuery.eq('audiencia', 'cliente');
      }

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

  const secciones = useMemo(() => {
    const valores = new Set(configuracionesPestana.map((configuracion) => configuracion.seccion));
    return ['Todas', ...Array.from(valores).sort()];
  }, [configuracionesPestana]);

  const configuracionesFiltradas = useMemo(() => {
    if (filtroSeccion === 'Todas') return configuracionesPestana;
    return configuracionesPestana.filter(
      (configuracion) => configuracion.seccion === filtroSeccion,
    );
  }, [configuracionesPestana, filtroSeccion]);

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

  const agregarComentario = async (configuracionId, audiencia) => {
    const key = `${configuracionId}_${audiencia}`;
    const texto = (borradoresComentarios[key] || '').trim();
    if (!texto || (modoTenant && audiencia === 'tideo')) return;

    setComentariosGuardando((prev) => ({ ...prev, [key]: true }));
    setError('');

    try {
      const supabase = await getSupabaseClient();
      const { data, error: insertError } = await supabase
        .from('tideo_salud_comentarios')
        .insert({
          configuracion_id: configuracionId,
          empresa_id: tenantId,
          audiencia,
          texto,
        })
        .select('id, configuracion_id, empresa_id, audiencia, autor_id, autor_nombre, texto, created_at')
        .single();

      if (insertError) throw insertError;
      setComentarios((prev) => ({
        ...prev,
        [key]: [data, ...(prev[key] || [])],
      }));
      setBorradoresComentarios((prev) => ({ ...prev, [key]: '' }));
    } catch (err) {
      console.error('Error agregando comentario:', err);
      setError(`No se pudo agregar el comentario: ${err.message || String(err)}`);
    } finally {
      setComentariosGuardando((prev) => ({ ...prev, [key]: false }));
    }
  };

  const cambiarPestana = (nuevaPestana) => {
    setPestana(nuevaPestana);
    setFiltroSeccion('Todas');
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
            value={filtroSeccion}
            onChange={(event) => setFiltroSeccion(event.target.value)}
            style={{ minWidth: 190 }}
            aria-label="Sección"
          >
            {secciones.map((seccion) => (
              <option key={seccion} value={seccion}>{seccion}</option>
            ))}
          </select>
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
                <th style={{ minWidth: 210 }}>Responsable TIDEO</th>
                <th style={{ minWidth: 210 }}>Responsable Cliente</th>
                <th style={{ width: 105 }}>Guardar</th>
                <th style={{ minWidth: 280 }}>Observaciones TIDEO</th>
                <th style={{ minWidth: 280 }}>Observaciones Cliente</th>
              </tr>
            </thead>
            <tbody>
              {configuracionesFiltradas.map((configuracion) => {
                const count = conteos[configuracion.id] || 0;
                const borrador = borradoresResponsables[configuracion.id] || {};
                const guardado = estadoGuardado[configuracion.id];
                const cambioPendiente =
                  (borrador.responsable_tideo || '') !==
                    (anotaciones[configuracion.id]?.responsable_tideo || '')
                  || (borrador.responsable_cliente || '') !==
                    (anotaciones[configuracion.id]?.responsable_cliente || '');
                const keyTideo = `${configuracion.id}_tideo`;
                const keyCliente = `${configuracion.id}_cliente`;

                return (
                  <tr key={configuracion.id} className="hover-row">
                    <td style={{ verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600 }}>{configuracion.seccion}</div>
                      <div className="text-muted">{configuracion.pantalla}</div>
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
                      <SelectorUsuario
                        value={borrador.responsable_tideo}
                        onChange={(value) => actualizarResponsable(
                          configuracion.id,
                          'responsable_tideo',
                          value,
                        )}
                        usuarios={usuariosTideo}
                        placeholder={
                          usuariosTideo.length ? 'Sin asignar' : 'Sin usuarios TIDEO elegibles'
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
                          usuariosCliente.length ? 'Sin asignar' : 'Sin usuarios cliente elegibles'
                        }
                      />
                    </td>
                    <td style={{ verticalAlign: 'top' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={guardado === 'guardando' || (!cambioPendiente && guardado !== 'error')}
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
                        borrador={borradoresComentarios[keyTideo] || ''}
                        onBorradorChange={(value) => setBorradoresComentarios((prev) => ({
                          ...prev,
                          [keyTideo]: value,
                        }))}
                        onAgregar={() => agregarComentario(configuracion.id, 'tideo')}
                        guardando={Boolean(comentariosGuardando[keyTideo])}
                        bloqueado={modoTenant}
                      />
                    </td>
                    <td style={{ verticalAlign: 'top' }}>
                      <HistorialComentarios
                        comentarios={comentarios[keyCliente] || []}
                        borrador={borradoresComentarios[keyCliente] || ''}
                        onBorradorChange={(value) => setBorradoresComentarios((prev) => ({
                          ...prev,
                          [keyCliente]: value,
                        }))}
                        onAgregar={() => agregarComentario(configuracion.id, 'cliente')}
                        guardando={Boolean(comentariosGuardando[keyCliente])}
                      />
                    </td>
                  </tr>
                );
              })}
              {configuracionesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-muted" style={{ padding: 40 }}>
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
