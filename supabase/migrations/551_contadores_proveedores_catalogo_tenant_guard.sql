-- Contadores de proveedores y guardas de tenant del catalogo de materiales.
-- Incluye la correccion aislada de PAPELERIA en emp_20609996464.

create or replace function public.recalcular_contadores_proveedor_oc(
  p_empresa_id text,
  p_proveedor_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.proveedores p
     set total_ocs = agg.total_ocs,
         monto_total_comprado = agg.monto_total_comprado,
         fecha_ultima_oc = agg.fecha_ultima_oc
    from (
      select
        count(*) filter (
          where coalesce(oc.estado, '') not in ('borrador', 'anulada')
        )::integer as total_ocs,
        coalesce(
          sum(oc.total) filter (
            where oc.estado in ('cerrada', 'recibida_total', 'aprobada')
          ),
          0
        )::numeric(14,2) as monto_total_comprado,
        max(oc.fecha_emision) filter (
          where oc.estado in ('cerrada', 'recibida_total', 'aprobada')
        )::date as fecha_ultima_oc
      from public.ordenes_compra oc
      where oc.empresa_id = p_empresa_id
        and oc.proveedor_id = p_proveedor_id
    ) agg
   where p.empresa_id = p_empresa_id
     and p.id = p_proveedor_id;
end;
$$;

revoke all on function public.recalcular_contadores_proveedor_oc(text, text)
  from public, anon, authenticated, service_role;

create or replace function public.trg_recalcular_contadores_proveedor_oc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and (
       old.empresa_id is distinct from new.empresa_id
       or old.proveedor_id is distinct from new.proveedor_id
     ) then
    perform public.recalcular_contadores_proveedor_oc(old.empresa_id, old.proveedor_id);
  end if;

  perform public.recalcular_contadores_proveedor_oc(new.empresa_id, new.proveedor_id);
  return new;
end;
$$;

revoke all on function public.trg_recalcular_contadores_proveedor_oc()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_recalcular_contadores_proveedor_oc
  on public.ordenes_compra;

create trigger trg_recalcular_contadores_proveedor_oc
after insert or update on public.ordenes_compra
for each row
execute function public.trg_recalcular_contadores_proveedor_oc();

-- Backfill usando exactamente la misma funcion que usara el trigger.
do $$
declare
  v_pair record;
begin
  for v_pair in
    select distinct oc.empresa_id, oc.proveedor_id
    from public.ordenes_compra oc
    where oc.proveedor_id is not null
  loop
    perform public.recalcular_contadores_proveedor_oc(
      v_pair.empresa_id,
      v_pair.proveedor_id
    );
  end loop;
end;
$$;

create or replace function public.validar_material_familia_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_grupo_empresa_id text;
begin
  select mg.empresa_id
    into v_grupo_empresa_id
    from public.material_grupos mg
   where mg.id = new.grupo_id;

  if v_grupo_empresa_id is null
     or new.empresa_id is null
     or v_grupo_empresa_id is distinct from new.empresa_id then
    raise exception using
      errcode = '23514',
      message = 'La familia de materiales debe pertenecer al mismo tenant que su grupo.',
      detail = format(
        'familia.empresa_id=%s, grupo.empresa_id=%s, grupo_id=%s',
        new.empresa_id,
        coalesce(v_grupo_empresa_id, '<inexistente>'),
        new.grupo_id
      );
  end if;

  return new;
end;
$$;

revoke all on function public.validar_material_familia_tenant()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_validar_material_familia_tenant
  on public.material_familias;

create trigger trg_validar_material_familia_tenant
before insert or update on public.material_familias
for each row
execute function public.validar_material_familia_tenant();

create or replace function public.validar_material_subfamilia_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_familia_empresa_id text;
begin
  select mf.empresa_id
    into v_familia_empresa_id
    from public.material_familias mf
   where mf.id = new.familia_id;

  if v_familia_empresa_id is null
     or new.empresa_id is null
     or v_familia_empresa_id is distinct from new.empresa_id then
    raise exception using
      errcode = '23514',
      message = 'La subfamilia de materiales debe pertenecer al mismo tenant que su familia.',
      detail = format(
        'subfamilia.empresa_id=%s, familia.empresa_id=%s, familia_id=%s',
        new.empresa_id,
        coalesce(v_familia_empresa_id, '<inexistente>'),
        new.familia_id
      );
  end if;

  return new;
end;
$$;

revoke all on function public.validar_material_subfamilia_tenant()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_validar_material_subfamilia_tenant
  on public.material_subfamilias;

create trigger trg_validar_material_subfamilia_tenant
before insert or update on public.material_subfamilias
for each row
execute function public.validar_material_subfamilia_tenant();

-- PAPELERIA se mueve a un grupo local con el siguiente codigo numerico libre.
do $$
declare
  v_empresa_id constant text := 'emp_20609996464';
  v_familia_id constant text := 'mf_a2bd1c62511b4c83a3';
  v_grupo_id text;
  v_codigo text;
  v_siguiente integer;
begin
  select coalesce(max(codigo::integer) filter (where codigo ~ '^[0-9]+$'), 0) + 1
    into v_siguiente
    from public.material_grupos
   where empresa_id = v_empresa_id;

  v_codigo := lpad(v_siguiente::text, 2, '0');
  while exists (
    select 1
      from public.material_grupos
     where empresa_id = v_empresa_id
       and codigo = v_codigo
  ) loop
    v_siguiente := v_siguiente + 1;
    v_codigo := lpad(v_siguiente::text, 2, '0');
  end loop;

  v_grupo_id := 'mg_' || left(replace(gen_random_uuid()::text, '-', ''), 18);

  insert into public.material_grupos (id, empresa_id, codigo, nombre, estado)
  values (v_grupo_id, v_empresa_id, v_codigo, 'MATERIALES DE OFICINA', 'activo');

  update public.material_familias
     set grupo_id = v_grupo_id
   where id = v_familia_id
     and empresa_id = v_empresa_id;

  if not found then
    raise exception 'No se encontro PAPELERIA en el tenant esperado.';
  end if;
end;
$$;

notify pgrst, 'reload schema';
