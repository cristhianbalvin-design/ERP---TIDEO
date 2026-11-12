// Aria en la app de Administración: toma empresa, sociedad y usuario del contexto de la app.
import React from 'react';
import { useApp } from '../context.jsx';
import { AsistenteErpPanelBase } from './AsistenteErpPanel.jsx';
import { urlOperaciones } from '../services/ordenesFabricacionAdminService.js';
import { getSupabaseClient } from '../lib/supabaseClient.js';
import { loadCrmFromSupabase } from '../services/crmService.js';

export function AsistenteErpPanel({ pantallaActiva }) {
  const { empresa, sociedadActiva, authSession, authUser, navigate, recargarLeads, setCuentas, setContactos } = useApp();
  // Tras confirmar un lead o una cuenta preparados por Aria, la pantalla debe mostrarlos sin recargar la aplicación.
  const registrado = async resultado => {
    try {
      if (resultado?.tipo === 'lead') { await recargarLeads(); return; }
      const datos = await loadCrmFromSupabase(await getSupabaseClient(), empresa.id);
      if (!datos) return;
      setCuentas((datos.cuentas || []).filter(cuenta => cuenta?.empresa_id === empresa.id));
      setContactos(datos.contactos || []);
    } catch { /* el registro ya quedó grabado; se verá al recargar */ }
  };
  // Botón "Ir a…" de Aria: navega dentro de Administración o abre la pantalla de Operaciones.
  const ir = destino => { if (destino.app === 'operaciones') window.location.assign(urlOperaciones(destino.ruta)); else navigate(destino.ruta); };
  const sociedadId = sociedadActiva?.id && !['todas', 'all', '**todas**'].includes(String(sociedadActiva.id).toLowerCase()) ? sociedadActiva.id : undefined;
  return <AsistenteErpPanelBase empresaId={empresa?.id} sociedadId={sociedadId} nombreUsuario={authUser?.nombre}
    habilitado={Boolean(authSession && empresa?.id)} pantallaActiva={pantallaActiva} ocultarFab={pantallaActiva === 'inicio'} onIr={ir} onRegistrado={registrado} />;
}
