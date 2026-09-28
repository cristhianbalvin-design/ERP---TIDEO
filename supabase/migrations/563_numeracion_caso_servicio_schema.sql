-- Numeración de caso compartido: schema y funciones aisladas.
-- Esta migración no hace backfill ni modifica los números existentes.

alter table public.recepciones_activos_cliente
  add column numero_caso integer;
alter table public.cotizaciones
  add column numero_caso integer;
alter table public.cotizaciones_especiales
  add column numero_caso integer;
alter table public.os_clientes
  add column numero_caso integer;
alter table public.ordenes_trabajo
  add column numero_caso integer;
-- El caso de servicio es una serie nueva: no se deriva ni se siembra desde
-- números históricos de ningún documento existente.
insert into public.series_documentarias (
  id,
  empresa_id,
  documento,
  serie,
  siguiente_correlativo,
  regla,
  estado
)
select
  'ser_caso_servicio_' || replace(gen_random_uuid()::text, '-', ''),
  e.id,
  'caso_servicio',
  'CASO',
  1,
  'Secuencial por empresa',
  'activo'
from public.empresas e
on conflict (empresa_id, documento) do nothing;
create or replace function public.abrir_o_heredar_numero_caso(
  p_empresa_id text,
  p_padre_id text,
  p_padre_tabla text,
  p_cuenta_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero_caso integer;
  v_siguiente integer;
begin
  if p_padre_id is not null then
    if p_padre_tabla not in (
      'recepciones_activos_cliente',
      'cotizaciones',
      'cotizaciones_especiales',
      'os_clientes',
      'ordenes_trabajo'
    ) then
      raise exception 'Tabla padre no permitida: %', p_padre_tabla
        using errcode = '22023';
    end if;

    execute format(
      'select numero_caso
         from public.%I
        where empresa_id = $1
          and id::text = $2',
      p_padre_tabla
    )
    into strict v_numero_caso
    using p_empresa_id, p_padre_id;

    if v_numero_caso is not null then
      return v_numero_caso;
    end if;
  end if;

  if p_cuenta_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('caso_servicio' || p_empresa_id, 0)
  );

  select siguiente_correlativo
    into v_siguiente
  from public.series_documentarias
  where empresa_id = p_empresa_id
    and documento = 'caso_servicio'
    and estado = 'activo'
  for update;

  if not found then
    raise exception 'No existe una serie activa caso_servicio para la empresa %', p_empresa_id
      using errcode = '22023';
  end if;

  update public.series_documentarias
     set siguiente_correlativo = siguiente_correlativo + 1
   where empresa_id = p_empresa_id
     and documento = 'caso_servicio'
     and estado = 'activo';

  return v_siguiente;
end;
$$;
create or replace function public.secuencia_ot_en_caso(
  p_empresa_id text,
  p_numero_caso integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siguiente integer;
begin
  if p_numero_caso is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('caso_servicio' || p_empresa_id, 0)
  );

  select count(*)::integer + 1
    into v_siguiente
  from public.ordenes_trabajo
  where empresa_id = p_empresa_id
    and numero_caso = p_numero_caso;

  return v_siguiente;
end;
$$;
revoke all on function public.abrir_o_heredar_numero_caso(text, text, text, text) from public, anon;
grant execute on function public.abrir_o_heredar_numero_caso(text, text, text, text) to authenticated, service_role;
revoke all on function public.secuencia_ot_en_caso(text, integer) from public, anon;
grant execute on function public.secuencia_ot_en_caso(text, integer) to authenticated, service_role;
