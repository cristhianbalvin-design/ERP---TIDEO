-- Recepciones: agrega frontera societaria a las politicas RLS existentes.
--
-- Ejecucion controlada:
--   1. Hacer dry run manual dentro de BEGIN; ... ROLLBACK;
--   2. Revisar el resultado de pg_policies antes de ejecutar COMMIT.
-- Esta migracion no crea politicas nuevas: modifica exclusivamente las tres
-- politicas com_recepciones_* ya existentes y falla si no son exactamente tres.

do $preflight$
declare
  v_count integer;
  v_rls_enabled boolean;
begin
  select c.relrowsecurity
    into v_rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'recepciones';

  if v_rls_enabled is distinct from true then
    raise exception 'RECEPCIONES_RLS_PREFLIGHT: public.recepciones no tiene RLS habilitado.';
  end if;

  if not exists (
    select 1
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'recepciones'
     and c.column_name = 'sociedad_id'
     and c.data_type = 'uuid'
  ) then
    raise exception 'RECEPCIONES_RLS_PREFLIGHT: falta public.recepciones.sociedad_id uuid.';
  end if;

  select count(*)
    into v_count
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'recepciones';

  if v_count <> 3 then
    raise exception
      'RECEPCIONES_RLS_PREFLIGHT: se esperaban exactamente 3 politicas en public.recepciones y se encontraron %.',
      v_count;
  end if;

  if not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'recepciones'
     and p.polname = 'com_recepciones_select'
     and p.polcmd = 'r'
  ) or not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'recepciones'
     and p.polname = 'com_recepciones_insert'
     and p.polcmd = 'a'
  ) or not exists (
    select 1
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'recepciones'
     and p.polname = 'com_recepciones_update'
     and p.polcmd = 'w'
  ) then
    raise exception 'RECEPCIONES_RLS_PREFLIGHT: faltan o no coinciden las politicas com_recepciones_select/insert/update.';
  end if;
end
$preflight$;

alter policy com_recepciones_select on public.recepciones
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'recepciones', 'ver')
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

alter policy com_recepciones_insert on public.recepciones
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'recepciones', 'crear')
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

alter policy com_recepciones_update on public.recepciones
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'recepciones', 'editar')
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'recepciones', 'editar')
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

do $postflight$
declare
  v_count integer;
begin
  select count(*)
    into v_count
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'recepciones';

  if v_count <> 3 then
    raise exception
      'RECEPCIONES_RLS_POSTFLIGHT: se esperaban exactamente 3 politicas en public.recepciones y se encontraron %.',
      v_count;
  end if;
end
$postflight$;

select pg_notify('pgrst', 'reload schema');

-- Verificacion posterior (ejecutar durante el dry run y despues del COMMIT):
-- select *
-- from pg_policies
-- where tablename = 'recepciones'
-- order by policyname;
