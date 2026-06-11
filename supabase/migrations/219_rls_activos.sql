-- 219 · RLS para tabla activos
-- La tabla se creó en schemas/010_maestro_activos.sql sin políticas RLS.
-- Al habilitarse RLS en la base de datos sin políticas, todos los inserts/updates
-- son bloqueados con "new row violates row-level security policy".

alter table public.activos enable row level security;

drop policy if exists activos_select on public.activos;
drop policy if exists activos_insert on public.activos;
drop policy if exists activos_update on public.activos;
drop policy if exists activos_delete on public.activos;

create policy activos_select on public.activos
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy activos_insert on public.activos
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy activos_update on public.activos
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy activos_delete on public.activos
  for delete using (public.usuario_es_admin_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
