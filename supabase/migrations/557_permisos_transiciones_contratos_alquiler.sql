-- 557 · Permiso comercial y ciclo de vida de contratos de alquiler.
-- El permiso es independiente de tarifario_comercial a nivel de pantalla,
-- pero se asigna inicialmente a los mismos roles ya autorizados allí.

begin;
insert into public.permisos_roles (
  rol_id,
  pantalla,
  puede_ver,
  puede_crear,
  puede_editar,
  puede_anular,
  puede_aprobar,
  puede_exportar,
  puede_ver_costos,
  puede_ver_finanzas
)
select
  base.rol_id,
  'contratos_alquiler',
  true,
  false,
  true,
  false,
  false,
  false,
  false,
  false
from public.permisos_roles base
where base.pantalla = 'tarifario_comercial'
  and coalesce(base.puede_ver, false)
  and coalesce(base.puede_editar, false)
on conflict (rol_id, pantalla) do update
set puede_ver = true,
    puede_editar = true,
    updated_at = now();
drop policy if exists contratos_alquiler_update on public.contratos_alquiler;
create policy contratos_alquiler_update
on public.contratos_alquiler
for update to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'contratos_alquiler', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'contratos_alquiler', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);
create or replace function public.validar_transicion_estado_contrato_alquiler()
returns trigger
language plpgsql
as $$
begin
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  if not (
    (old.estado = 'borrador' and new.estado = 'vigente')
    or (old.estado = 'vigente' and new.estado in ('suspendido', 'vencido', 'cerrado', 'cancelado'))
    or (old.estado = 'suspendido' and new.estado in ('vigente', 'cancelado'))
    or (old.estado in ('vencido', 'cerrado') and new.estado = 'cancelado')
  ) then
    raise exception
      'Transición de estado no permitida para el contrato %: % -> %. Desde % solo se permiten transiciones definidas del ciclo de vida comercial.',
      coalesce(new.numero, new.id),
      old.estado,
      new.estado,
      old.estado
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_contratos_alquiler_validar_transicion_estado
  on public.contratos_alquiler;
create trigger trg_contratos_alquiler_validar_transicion_estado
before update of estado on public.contratos_alquiler
for each row
execute function public.validar_transicion_estado_contrato_alquiler();
select pg_notify('pgrst', 'reload schema');
commit;
