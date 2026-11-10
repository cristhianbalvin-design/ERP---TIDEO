// Aria en la app de Administración: toma empresa, sociedad y usuario del contexto de la app.
import React from 'react';
import { useApp } from '../context.jsx';
import { AsistenteErpPanelBase } from './AsistenteErpPanel.jsx';

export function AsistenteErpPanel({ pantallaActiva }) {
  const { empresa, sociedadActiva, authSession, authUser } = useApp();
  const sociedadId = sociedadActiva?.id && !['todas', 'all', '**todas**'].includes(String(sociedadActiva.id).toLowerCase()) ? sociedadActiva.id : undefined;
  return <AsistenteErpPanelBase empresaId={empresa?.id} sociedadId={sociedadId} nombreUsuario={authUser?.nombre}
    habilitado={Boolean(authSession && empresa?.id)} pantallaActiva={pantallaActiva} ocultarFab={pantallaActiva === 'inicio'} />;
}
