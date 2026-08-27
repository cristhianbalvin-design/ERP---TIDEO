-- 461 · Partes diarios: frontera societaria, derivación desde OT y consolidación RLS.
--
-- PRE-FLIGHT MANUAL (ejecutar por separado y finalizar con ROLLBACK):
-- begin;
-- set local app.partes_preflight = 'on';
--
-- select count(*) as partes_antes
-- from public.partes_diarios;
--
-- Ejecutar el cuerpo completo de esta migración.
--
-- select
--   count(*) as partes_despues,
--   count(*) filter (where sociedad_id is null) as partes_sin_sociedad
-- from public.partes_diarios;
--
-- select policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'partes_diarios'
-- order by policyname;
--
-- rollback;
--
-- APLICACIÓN MANUAL (solo tras revisar el pre-flight):
-- begin;
-- Ejecutar el cuerpo completo de esta migración.
-- commit;
--
-- POST-COMMIT ESPERADO:
-- - 0 partes_diarios con sociedad_id NULL.
-- - Cuatro policies: ops_partes_select/insert/update y partes_diarios_delete.
-- - ops_partes_select conserva usuario_puede_ver_registro y añade alcance societario.

set local lock_timeout = '15s';
set local statement_timeout = '5min';

alter table public.partes_diarios
  add column if not exists sociedad_id uuid null
  references public.sociedades(id) on delete restrict;

update public.partes_diarios parte
set sociedad_id = ot.sociedad_id
from public.ordenes_trabajo ot
where ot.id = parte.orden_trabajo_id
  and parte.sociedad_id is null;

create index if not exists idx_partes_diarios_empresa_sociedad
  on public.partes_diarios (empresa_id, sociedad_id);

-- La sociedad del parte es una propiedad derivada de su OT, no un dato confiado
-- al cliente. El trigger aa_ se ejecuta antes de la invariante genérica zz_.
create or replace function public.derivar_sociedad_parte_diario()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $funcion$
declare
  v_empresa_ot text;
  v_sociedad_ot uuid;
begin
  select ot.empresa_id, ot.sociedad_id
    into v_empresa_ot, v_sociedad_ot
  from public.ordenes_trabajo ot
  where ot.id = new.orden_trabajo_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'PARTE_OT_INEXISTENTE: la OT del parte no existe.';
  end if;

  if new.empresa_id is distinct from v_empresa_ot then
    raise exception using
      errcode = '23514',
      message = 'PARTE_EMPRESA_DIVERGENTE: la empresa del parte no coincide con la OT.';
  end if;

  if new.sociedad_id is not null
     and new.sociedad_id is distinct from v_sociedad_ot then
    raise exception using
      errcode = '23514',
      message = 'PARTE_SOCIEDAD_DIVERGENTE: la sociedad del parte no coincide con la OT.';
  end if;

  new.sociedad_id := v_sociedad_ot;
  return new;
end;
$funcion$;

revoke all on function public.derivar_sociedad_parte_diario() from public, anon;
grant execute on function public.derivar_sociedad_parte_diario() to authenticated;

drop trigger if exists aa_derivar_sociedad_parte_diario on public.partes_diarios;
create trigger aa_derivar_sociedad_parte_diario
before insert or update on public.partes_diarios
for each row execute function public.derivar_sociedad_parte_diario();

-- En tenants multisociedad, una OT sin sociedad no puede volver a introducir
-- un parte sin frontera societaria.
drop trigger if exists zz_validar_sociedad_obligatoria on public.partes_diarios;
create trigger zz_validar_sociedad_obligatoria
before insert or update on public.partes_diarios
for each row execute function public.validar_sociedad_obligatoria_multisociedad('sociedad_id');

-- Las policies legacy de 065 son PERMISSIVE y no comprueban permiso; por OR
-- neutralizan las estrictas. DELETE se conserva por instrucción explícita.
drop policy if exists partes_diarios_select on public.partes_diarios;
drop policy if exists partes_diarios_insert on public.partes_diarios;
drop policy if exists partes_diarios_update on public.partes_diarios;

drop policy if exists ops_partes_select on public.partes_diarios;
drop policy if exists ops_partes_insert on public.partes_diarios;
drop policy if exists ops_partes_update on public.partes_diarios;

create policy ops_partes_select on public.partes_diarios
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'partes', 'ver')
  and public.usuario_puede_ver_registro(
    empresa_id,
    (
      select po.auth_user_id
      from public.personal_operativo po
      where po.id = tecnico_id
        and po.empresa_id = partes_diarios.empresa_id
      limit 1
    )
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy ops_partes_insert on public.partes_diarios
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'partes', 'crear')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy ops_partes_update on public.partes_diarios
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'partes', 'editar')
    or public.usuario_puede(empresa_id, 'partes', 'crear')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'partes', 'editar')
    or public.usuario_puede(empresa_id, 'partes', 'crear')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

-- Self-test únicamente durante el pre-flight: actualiza una fila existente
-- dentro de un bloque interno y exige que aa_ rechace una sociedad distinta.
do $preflight_parte_sociedad_divergente$
declare
  v_parte_id text;
  v_empresa_id text;
  v_sociedad_divergente uuid;
  v_rechazado boolean := false;
begin
  if current_setting('app.partes_preflight', true) is distinct from 'on' then
    return;
  end if;

  select parte.id, parte.empresa_id, s.id
    into v_parte_id, v_empresa_id, v_sociedad_divergente
  from public.partes_diarios parte
  join public.ordenes_trabajo ot
    on ot.id = parte.orden_trabajo_id
  join public.sociedades s
    on s.empresa_id = parte.empresa_id
   and s.id is distinct from ot.sociedad_id
  where ot.sociedad_id is not null
  order by parte.id, s.id
  limit 1;

  if not found then
    raise exception
      'PREFLIGHT_PARTE_SOCIEDAD: no existe un parte con OT societaria y una segunda sociedad para probar el rechazo divergente.';
  end if;

  begin
    update public.partes_diarios
    set sociedad_id = v_sociedad_divergente
    where id = v_parte_id
      and empresa_id = v_empresa_id;
  exception
    when check_violation then
      if sqlerrm <> 'PARTE_SOCIEDAD_DIVERGENTE: la sociedad del parte no coincide con la OT.' then
        raise;
      end if;
      v_rechazado := true;
  end;

  if not v_rechazado then
    raise exception
      'PREFLIGHT_PARTE_SOCIEDAD: el trigger permitió una sociedad divergente.';
  end if;

  raise notice 'PREFLIGHT_PARTE_SOCIEDAD: sociedad divergente rechazada correctamente.';
end;
$preflight_parte_sociedad_divergente$;

do $verificar_partes_diarios_postflight$
declare
  v_sin_sociedad bigint;
  v_total_policies integer;
begin
  select count(*)
    into v_sin_sociedad
  from public.partes_diarios
  where sociedad_id is null;

  if v_sin_sociedad <> 0 then
    raise exception
      'PARTES_DIARIOS_BACKFILL: quedaron % fila(s) sin sociedad_id.', v_sin_sociedad;
  end if;

  select count(*)
    into v_total_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'partes_diarios';

  if v_total_policies <> 4
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'partes_diarios'
         and policyname = 'ops_partes_select' and cmd = 'SELECT'
         and coalesce(qual, '') like '%usuario_puede_ver_registro%'
     )
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'partes_diarios'
         and policyname = 'ops_partes_insert' and cmd = 'INSERT'
     )
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'partes_diarios'
         and policyname = 'ops_partes_update' and cmd = 'UPDATE'
     )
     or not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'partes_diarios'
         and policyname = 'partes_diarios_delete' and cmd = 'DELETE'
     ) then
    raise exception
      'PARTES_DIARIOS_RLS_POSTFLIGHT: se esperaban exactamente las cuatro policies consolidadas.';
  end if;
end;
$verificar_partes_diarios_postflight$;

select pg_notify('pgrst', 'reload schema');
