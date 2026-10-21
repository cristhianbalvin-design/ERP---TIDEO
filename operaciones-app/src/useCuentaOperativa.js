import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabaseClient.js';

// Notificaciones del usuario y tema oscuro de Operaciones. Viven en OperationalApp para que el
// header y el pie del cajón (modo trabajo) muestren y cambien el mismo estado.
export function useNotificacionesSistema(userId) {
  const [notificaciones, setNotificaciones] = useState([]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !userId) return;
    getSupabaseClient()
      .from('notificaciones_sistema')
      .select('id, texto, leida, created_at, titulo, prioridad')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!error && data && data.length) {
          setNotificaciones(data.map(d => ({
            id: d.id,
            text: d.texto,
            title: d.titulo,
            read: Boolean(d.leida),
            time: d.created_at ? new Date(d.created_at).toLocaleDateString() : '',
            priority: d.prioridad,
          })));
        }
      })
      .catch(() => {});
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
