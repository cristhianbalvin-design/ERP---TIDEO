// Inicio de Administración: toma empresa, sociedad, usuario y navegación del contexto de la app.
import React from 'react';
import { useApp } from '../context.jsx';
import { SOCIEDAD_TODAS_ID } from '../services/sociedadesService.js';
import { InicioBase } from './Inicio.jsx';

export default function InicioAdmin() {
  const { empresa, sociedadActiva, authUser, navigate } = useApp();
  const sociedadId = sociedadActiva?.id === SOCIEDAD_TODAS_ID ? null : sociedadActiva?.id || null;
  return <InicioBase empresaId={empresa?.id} sociedadId={sociedadId} authUser={authUser} navigate={navigate} />;
}
