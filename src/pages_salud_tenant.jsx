import React, { useEffect, useState } from 'react';
import { useApp } from './context.jsx';
import { SaludImplementacionPanel } from './components/SaludImplementacionPanel.jsx';
import { getSupabaseClient } from './lib/supabaseClient.js';

export function SaludImplementacionTenant() {
  const { empresa, todasMembresias } = useApp();
  const soySuperadmin = todasMembresias?.some((membresia) => membresia.empresa?.es_plataforma) || false;
  const [autorizado, setAutorizado] = useState(null);
  const [errorAutorizacion, setErrorAutorizacion] = useState('');

  useEffect(() => {
    let mounted = true;

    if (!empresa?.id) {
      setAutorizado(null);
      setErrorAutorizacion('');
      return () => { mounted = false; };
    }

    setAutorizado(null);
    setErrorAutorizacion('');

    getSupabaseClient()
      .then((supabase) => Promise.all([
        supabase.rpc('usuario_es_admin_empresa', {
          target_empresa_id: empresa.id,
        }),
        supabase.rpc('tideo_salud_personal_tideo_tiene_acceso', {
          p_tenant_id: empresa.id,
        }),
      ]))
      .then(([adminResp, tideoResp]) => {
        if (adminResp.error) throw adminResp.error;
        if (tideoResp.error) throw tideoResp.error;
        if (mounted) {
          setAutorizado(adminResp.data === true || tideoResp.data === true);
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setAutorizado(false);
        setErrorAutorizacion(error?.message || 'No se pudo validar el acceso de administrador.');
      });

    return () => { mounted = false; };
  }, [empresa?.id]);

  if (!empresa?.id || autorizado === null) {
    return <div style={{ padding: 40 }}>Validando acceso al tenant activo de la sesión...</div>;
  }

  if (errorAutorizacion) {
    return <div style={{ padding: 40 }}>{errorAutorizacion}</div>;
  }

  if (!autorizado) {
    return <div style={{ padding: 40 }}>Acceso denegado. Solo Administrador de Empresa o personal TIDEO.</div>;
  }

  return (
    <SaludImplementacionPanel
      esSuperadmin={soySuperadmin}
      modoTenant
      tenantId={empresa.id}
      titulo="Progreso de Implementación"
      subtitulo={`Estado de carga de datos iniciales en ${
        empresa.nombre_comercial
          || empresa.razon_social
          || 'este entorno'
      }.`}
    />
  );
}
