-- 647: Campana en tiempo real. Publica notificaciones_sistema en supabase_realtime para que el ERP reciba
-- INSERT y UPDATE (avisos nuevos y marcados como leídos) sin recargar. Aditiva: no cambia datos ni RLS;
-- Realtime respeta la política de SELECT existente (auth.uid() = user_id).

begin;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones_sistema'
  ) then
    execute 'alter publication supabase_realtime add table public.notificaciones_sistema';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones_sistema'
  ) then
    raise exception '647: notificaciones_sistema no quedó en la publicación supabase_realtime';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notificaciones_sistema' and cmd = 'SELECT'
  ) then
    raise exception '647: notificaciones_sistema no tiene política de SELECT; Realtime expondría filas sin filtro';
  end if;
end $$;

commit;
