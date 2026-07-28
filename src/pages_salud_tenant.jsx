import React from 'react';
import { useApp } from './context.jsx';
import { SaludImplementacionPanel } from './components/SaludImplementacionPanel.jsx';

export function SaludImplementacionTenant() {
  const { role, empresaSeleccionada, todasMembresias } = useApp();
  const soySuperadmin = todasMembresias?.some((membresia) => membresia.empresa?.es_plataforma) || false;
  const autorizado = role?.es_admin_empresa || soySuperadmin;

  if (!autorizado) {
    return <div style={{ padding: 40 }}>Acceso denegado. Solo Administrador de Empresa.</div>;
  }

  if (!empresaSeleccionada?.id) {
    return <div style={{ padding: 40 }}>Selecciona una empresa para consultar su implementación.</div>;
  }

  return (
    <SaludImplementacionPanel
      esSuperadmin={soySuperadmin}
      tenantId={empresaSeleccionada.id}
      titulo="Progreso de Implementación"
      subtitulo={`Estado de carga de datos iniciales en ${
        empresaSeleccionada.nombre_comercial
          || empresaSeleccionada.razon_social
          || 'este entorno'
      }.`}
    />
  );
}
