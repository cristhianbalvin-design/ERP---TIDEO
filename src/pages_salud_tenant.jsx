import React from 'react';
import { useApp } from './context.jsx';
import { SaludImplementacionPanel } from './components/SaludImplementacionPanel.jsx';

export function SaludImplementacionTenant() {
  const { role, empresa, todasMembresias } = useApp();
  const soySuperadmin = todasMembresias?.some((membresia) => membresia.empresa?.es_plataforma) || false;
  const autorizado = role?.es_admin_empresa || soySuperadmin;

  if (!autorizado) {
    return <div style={{ padding: 40 }}>Acceso denegado. Solo Administrador de Empresa.</div>;
  }

  if (!empresa?.id) {
    return <div style={{ padding: 40 }}>Cargando el tenant activo de la sesión...</div>;
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
