-- 452 · Cierres técnicos: frontera societaria y consolidación de RLS.
--
-- EJECUCIÓN CONTROLADA (Cristhian): ejecutar primero el preflight de abajo dentro
-- de BEGIN/ROLLBACK. Esta migración no debe ejecutarse desde el frontend ni por
-- agentes; el COMMIT real queda bajo control manual.
--
-- PREFLIGHT (ejecutar por separado y finalizar con ROLLBACK):
-- begin;
-- set local app.cierre_preflight = 'on';
--
-- select count(*) as cierres_antes
-- from public.cierres_tecnicos;
--
-- Ejecutar el cuerpo completo de esta migración.
--
-- select
--   count(*) as cierres_despues,
--   count(*) filter (where sociedad_id is null) as cierres_sin_sociedad
-- from public.cierres_tecnicos;
--
-- rollback;
--
-- POST-COMMIT (ejecutar manualmente tras aplicar esta migración):
-- select policyname, cmd, qual, with_check
-- from pg_policies
-- where schemaname = 'public' and tablename = 'cierres_tecnicos'
-- order by policyname;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

alter table public.cierres_tecnicos
  add column if not exists sociedad_id uuid default null
  references public.sociedades(id) on delete restrict;

update public.cierres_tecnicos cierre
set sociedad_id = ot.sociedad_id
from public.ordenes_trabajo ot
where ot.id = cierre.orden_trabajo_id
  and cierre.sociedad_id is null;

create index if not exists idx_cierres_tecnicos_empresa_sociedad
  on public.cierres_tecnicos (empresa_id, sociedad_id);

-- La sociedad del cierre es una propiedad derivada de su OT, no un dato confiado
-- al cliente. Se ejecuta antes del trigger genérico zz_ por orden alfabético.
create or replace function public.derivar_sociedad_cierre_tecnico()
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
      message = 'CIERRE_OT_INEXISTENTE: la OT del cierre no existe.';
  end if;

  if new.empresa_id is distinct from v_empresa_ot then
    raise exception using
      errcode = '23514',
      message = 'CIERRE_EMPRESA_DIVERGENTE: la empresa del cierre no coincide con la OT.';
  end if;

  if new.sociedad_id is not null
     and new.sociedad_id is distinct from v_sociedad_ot then
    raise exception using
      errcode = '23514',
      message = 'CIERRE_SOCIEDAD_DIVERGENTE: la sociedad del cierre no coincide con la OT.';
  end if;

  new.sociedad_id := v_sociedad_ot;
  return new;
end;
$funcion$;

revoke all on function public.derivar_sociedad_cierre_tecnico() from public, anon;
grant execute on function public.derivar_sociedad_cierre_tecnico() to authenticated;

drop trigger if exists aa_derivar_sociedad_cierre_tecnico on public.cierres_tecnicos;
create trigger aa_derivar_sociedad_cierre_tecnico
before insert or update on public.cierres_tecnicos
for each row execute function public.derivar_sociedad_cierre_tecnico();

-- Reutiliza la invariante B3: en tenant multisociedad rechaza cualquier NULL
-- resultante de una OT sin sociedad, sin duplicar esa lógica aquí.
drop trigger if exists zz_validar_sociedad_obligatoria on public.cierres_tecnicos;
create trigger zz_validar_sociedad_obligatoria
before insert or update on public.cierres_tecnicos
for each row execute function public.validar_sociedad_obligatoria_multisociedad('sociedad_id');

-- Se consolida el juego laxo de 065 y se conserva DELETE con su guard admin,
-- ahora también atravesado por la misma frontera societaria.
drop policy if exists cierres_tecnicos_select on public.cierres_tecnicos;
drop policy if exists cierres_tecnicos_insert on public.cierres_tecnicos;
drop policy if exists cierres_tecnicos_update on public.cierres_tecnicos;
drop policy if exists cierres_tecnicos_delete on public.cierres_tecnicos;

-- Reemplazo idempotente de las tres policies de pantalla de 024.
drop policy if exists ops_cierre_select on public.cierres_tecnicos;
drop policy if exists ops_cierre_insert on public.cierres_tecnicos;
drop policy if exists ops_cierre_update on public.cierres_tecnicos;

create policy ops_cierre_select on public.cierres_tecnicos
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'cierre', 'ver')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy ops_cierre_insert on public.cierres_tecnicos
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'cierre', 'crear')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy ops_cierre_update on public.cierres_tecnicos
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'cierre', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'cierre', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy cierres_tecnicos_delete on public.cierres_tecnicos
for delete
using (
  public.usuario_es_admin_empresa(empresa_id)
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

-- La prueba corre solo cuando el preflight activa app.cierre_preflight. Requiere
-- una empresa con una OT societaria y una segunda sociedad distinta para probar
-- que el trigger rechaza una sociedad divergente antes de persistir la fila.
do $preflight_sociedad_divergente$
declare
  v_ot_id text;
  v_empresa_id text;
  v_sociedad_divergente uuid;
  v_rechazado boolean := false;
begin
  if current_setting('app.cierre_preflight', true) is distinct from 'on' then
    return;
  end if;

  select ot.id, ot.empresa_id, s.id
    into v_ot_id, v_empresa_id, v_sociedad_divergente
  from public.ordenes_trabajo ot
  join public.sociedades s
    on s.empresa_id = ot.empresa_id
   and s.id is distinct from ot.sociedad_id
  where ot.sociedad_id is not null
  order by ot.id, s.id
  limit 1;

  if not found then
    raise exception
      'PREFLIGHT_CIERRE_SOCIEDAD: no existe una OT con sociedad y una segunda sociedad para probar el rechazo divergente.';
  end if;

  begin
    insert into public.cierres_tecnicos (
      id, empresa_id, orden_trabajo_id, fecha_cierre, sociedad_id
    ) values (
      '__preflight_cierre_' || replace(gen_random_uuid()::text, '-', ''),
      v_empresa_id,
      v_ot_id,
      current_date,
      v_sociedad_divergente
    );
  exception
    when check_violation then
      if sqlerrm <> 'CIERRE_SOCIEDAD_DIVERGENTE: la sociedad del cierre no coincide con la OT.' then
        raise;
      end if;
      v_rechazado := true;
  end;

  if not v_rechazado then
    raise exception
      'PREFLIGHT_CIERRE_SOCIEDAD: el trigger permitió una sociedad divergente.';
  end if;

  raise notice 'PREFLIGHT_CIERRE_SOCIEDAD: sociedad divergente rechazada correctamente.';
end;
$preflight_sociedad_divergente$;

do $$
declare
  v_sin_sociedad bigint;
begin
  select count(*)
  into v_sin_sociedad
  from public.cierres_tecnicos
  where sociedad_id is null;

  raise notice 'CIERRES_TECNICOS_BACKFILL: % fila(s) sin sociedad_id.', v_sin_sociedad;
end;
$$;

select pg_notify('pgrst', 'reload schema');
