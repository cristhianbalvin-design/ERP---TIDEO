import React, { useEffect, useState } from 'react';
import { getApplicationAccess } from './access/applicationAccess.js';
import { I } from './icons.jsx';
import { useApp } from './context.jsx';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';

const APPLICATION_ICONS = {
  administrativa: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
    </svg>
  ),
  operativa: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M3 21V10l6 3V8l6 3V4l6 4v13H3z" />
      <path d="M7 21v-4h3v4M15 14h.01M18 14h.01M15 17h.01M18 17h.01" />
    </svg>
  ),
};

const apps = [
  {
    key: 'administrativa',
    title: 'Administración',
    description: 'Gestiona la plataforma, finanzas y configuración.',
    icon: APPLICATION_ICONS.administrativa,
  },
  {
    key: 'operativa',
    title: 'Operaciones',
    description: 'Consulta y ejecuta el trabajo operativo diario.',
    icon: APPLICATION_ICONS.operativa,
  },
  {
    key: 'asistencia',
    title: 'Control de asistencia',
    description: 'Registra tus marcaciones de ingreso y salida.',
    icon: I.clock,
  },
];

function AppCard({ app, enabled, loading, onSelect }) {
  const content = <>
    <span className="application-card-icon" aria-hidden="true">
      {enabled ? app.icon : I.lock}
    </span>
    <span className="application-card-copy">
      <span className="font-display application-card-title">{app.title}</span>
      <span className="application-card-description">{loading ? 'Verificando acceso…' : app.description}</span>
    </span>
    {!loading && enabled && <span className="application-card-arrow" aria-hidden="true">→</span>}
  </>;

  if (loading) {
    return (
      <div className={`application-card application-card-${app.key}`} aria-busy="true">
        {content}
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className={`application-card application-card-${app.key} application-card-disabled`} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <button className={`application-card application-card-${app.key}`} type="button" onClick={onSelect}>
      {content}
    </button>
  );
}

export function ApplicationWelcome({ onEnterAdministration, onEnterAttendance }) {
  const { empresa, role, membresiaCargando, membresiaActiva, todasMembresias = [] } = useApp();
  const empresaAcceso = membresiaActiva?.empresa || empresa;
  const accessBase = getApplicationAccess({ empresa: empresaAcceso, role });
  const [accessVerified, setAccessVerified] = useState(null);

  useEffect(() => {
    let active = true;
    const empresaId = empresaAcceso?.id;

    // En Supabase la fuente de verdad es la misma autorizacion que protege las
    // pantallas. Esto evita bloquear las tarjetas si la hidratacion local del
    // objeto role llega incompleta o se refresca despues de la membresia.
    if (!isSupabaseConfigured() || !empresaId || !membresiaActiva) {
      setAccessVerified(accessBase);
      return () => { active = false; };
    }

    setAccessVerified(null);
    const verificarAcceso = async () => {
      try {
        const supabase = await getSupabaseClient();
        const [administrativa, operativa] = await Promise.all([
          supabase.rpc('usuario_puede', {
            target_empresa_id: empresaId,
            target_pantalla: 'app_administrativo',
            target_accion: 'ver',
          }),
          supabase.rpc('usuario_puede', {
            target_empresa_id: empresaId,
            target_pantalla: 'app_operativo',
            target_accion: 'ver',
          }),
        ]);
        if (administrativa.error) throw administrativa.error;
        if (operativa.error) throw operativa.error;
        if (!active) return;

        setAccessVerified({
          ...accessBase,
          administrativa: Boolean(administrativa.data),
          operativa: Boolean(empresaAcceso?.modulo_operativo_habilitado) && Boolean(operativa.data),
        });
      } catch (error) {
        // Ante una incidencia transitoria, se conserva la evaluacion local
        // existente en vez de conceder acceso sin autorizacion verificable.
        if (active) setAccessVerified(accessBase);
      }
    };

    verificarAcceso();
    return () => { active = false; };
  }, [empresaAcceso?.id, empresaAcceso?.modulo_operativo_habilitado, membresiaActiva?.rol_id, accessBase.administrativa, accessBase.operativa, accessBase.asistencia]);

  // La asistencia es un portal personal: cualquier miembro activo puede abrirlo.
  // La ficha y el turno se validan dentro de la vista antes de permitir marcar.
  const access = {
    ...(accessVerified || accessBase),
    asistencia: Boolean(membresiaActiva?.empresa?.id || todasMembresias.length),
  };
  const enterOperations = () => {
    window.location.assign(import.meta.env.VITE_OPERATIONS_APP_URL || '/operaciones/');
  };

  return (
    <main className="application-welcome">
      <div className="application-welcome-content">
        <img className="application-wordmark" src="/logo_tideo.png" alt="TIDEO Tech & Strategy" />
        <div className="application-welcome-intro">
          <div className="eyebrow">Plataforma TIDEO</div>
          <h1 className="font-display">Elige una aplicación</h1>
          <p>Selecciona el espacio en el que deseas trabajar.</p>
        </div>
        <div className="application-card-grid">
          {apps.map(app => (
            <AppCard
              key={app.key}
              app={app}
              enabled={access[app.key]}
              loading={membresiaCargando || (isSupabaseConfigured() && Boolean(membresiaActiva) && !accessVerified)}
              onSelect={app.key === 'administrativa'
                ? onEnterAdministration
                : app.key === 'asistencia'
                  ? onEnterAttendance
                  : enterOperations}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
