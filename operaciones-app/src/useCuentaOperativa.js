import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';
import { applyNotificacionSistemaEvent, mergeNotificacionesSistema } from '../../src/services/notificacionesRealtime.js';

// Notificaciones del usuario y tema oscuro de Operaciones. Viven en OperationalApp para que el
// header y el pie del cajón (modo trabajo) muestren y cambien el mismo estado.
export function useNotificacionesSistema(userId) {
  const [notificaciones, setNotificaciones] = useState([]);

  useEffect(() => {
    setNotificaciones([]);
    if (!isSupabaseConfigured() || !userId) return;

    let active = true;
    let client = null;
    let channel = null;
    const sync = async () => {
      try {
        const sb = client || getSupabaseClient();
        if (!active) return;
        client = sb;
        const { data, error } = await sb
          .from('notificaciones_sistema')
          .select('id, texto, leida, created_at, titulo, prioridad')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30);
        if (active && !error) setNotificaciones(prev => mergeNotificacionesSistema(prev, data || []));
      } catch {}
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') sync();
    };

    sync();
    document.addEventListener('visibilitychange', onVisibilityChange);
    try {
      client = getSupabaseClient();
      channel = client.channel(`operaciones-notificaciones-sistema-${userId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones_sistema', filter: `user_id=eq.${userId}` }, payload => {
          if (active && payload.new) setNotificaciones(prev => applyNotificacionSistemaEvent(prev, payload.new));
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notificaciones_sistema', filter: `user_id=eq.${userId}` }, payload => {
          if (active && payload.new) setNotificaciones(prev => applyNotificacionSistemaEvent(prev, payload.new));
        })
        .subscribe(status => { if (status === 'SUBSCRIBED') sync(); });
    } catch {}
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (channel && client) {
        try { client.removeChannel(channel).catch(() => {}); } catch {}
      }
    };
  }, [userId]);
  const markRead = useCallback((id = null) => {
    if (id) {
      setNotificaciones(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      if (isSupabaseConfigured()) {
        getSupabaseClient().from('notificaciones_sistema').update({ leida: true }).eq('id', id).catch(() => {});
      }
    } else {
      setNotificaciones(prev => prev.map(n => ({ ...n, read: true })));
      if (isSupabaseConfigured() && userId) {
        getSupabaseClient().from('notificaciones_sistema').update({ leida: true }).eq('user_id', userId).catch(() => {});
      }
    }
  }, [userId]);

  return { notificaciones, markRead };
}

const leerTemaOscuro = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    if (window.localStorage?.getItem('theme') === 'dark') return true;
  } catch {}
  return Boolean(document.documentElement?.classList?.contains('dark'));
};

export function useTemaOscuro() {
  const [dark, setDark] = useState(leerTemaOscuro);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement?.classList?.toggle('dark', dark);
    document.body?.classList?.toggle('dark', dark);
    try {
      window.localStorage?.setItem('theme', dark ? 'dark' : 'light');
    } catch {}
  }, [dark]);
  return [dark, setDark];
}
