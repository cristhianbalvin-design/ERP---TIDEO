// Aria en la app de Operaciones: mismo panel y botón flotante que Administración, con la sesión operativa.
import React, { useMemo } from 'react';
import { AsistenteErpPanelBase } from '../../src/components/AsistenteErpPanel.jsx';
import { usarClienteSupabase } from '../../src/lib/supabaseClient.js';
import catalogo from '../../catalogo/pantallas.json';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';

// Una sola instancia de cliente de autenticación por pestaña: Aria usa el de Operaciones.
if (isSupabaseConfigured()) usarClienteSupabase(getSupabaseClient());

const permisoPorRuta = new Map();
for (const pantalla of catalogo.pantallas) {
  if (pantalla.app !== 'operaciones') continue;
  for (const ruta of [pantalla.ruta, ...(pantalla.alias || [])]) permisoPorRuta.set(ruta, pantalla.permiso || null);
}

// Clave que Aria recibe como pantalla activa: el permiso de la pantalla según el catálogo, o la ruta si no tiene.
export function pantallaAriaOperaciones(ruta) {
  const limpia = String(ruta || 'inicio');
  return permisoPorRuta.get(limpia) || `operaciones/${limpia}`;
}

export function AriaOperaciones({ sesion, ruta }) {
  const pantalla = useMemo(() => pantallaAriaOperaciones(ruta), [ruta]);
  const usuario = sesion?.usuario;
  const nombre = usuario?.user_metadata?.nombre || usuario?.user_metadata?.full_name || usuario?.email?.split('@')[0] || '';
  const habilitado = sesion?.estado === 'listo' && Boolean(sesion?.empresaId);
  const sociedadId = sesion?.vistaConsolidada ? undefined : (sesion?.sociedadId || undefined);
  // Botón "Ir a…" de Aria: navega dentro de Operaciones o abre la pantalla de Administración.
  const ir = destino => {
    if (destino.app === 'operaciones') window.location.hash = `/${destino.ruta}`;
    else window.location.assign(`${(import.meta.env.VITE_ADMIN_APP_URL || '/').replace(/[?#].*$/, '')}?ir=1#${destino.ruta}`);
  };
  return <AsistenteErpPanelBase empresaId={sesion?.empresaId} sociedadId={sociedadId} nombreUsuario={nombre}
    habilitado={habilitado} pantallaActiva={pantalla} ocultarFab={ruta === 'inicio'} onIr={ir} />;
}
