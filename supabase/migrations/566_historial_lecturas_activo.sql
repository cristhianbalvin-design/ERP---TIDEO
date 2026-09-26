-- Historial de horómetro/kilometraje por activo.
-- La única captura integrada en esta migración es el ingreso por Recepción.

create table if not exists public.historial_lecturas_activo (
  id text primary key default (
    'lect_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18)
  ),
  empresa_id text not null references public.empresas(id),
  activo_id text not null references public.activos(id),
  fecha_lectura date not null default current_date,
  valor numeric not null,
  unidad text not null check (unidad in ('horas', 'km')),
  origen text not null check (
    origen in ('ingreso_recepcion', 'parte_diario', 'cierre_ot', 'manual')
  ),
  origen_id text,
  registrado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on column public.historial_lecturas_activo.origen_id is
  'Identificador del documento que generó la lectura; no tiene FK porque su tabla depende del origen.';

alter table public.activos
  add column if not exists horometro_actual numeric null;

create index if not exists historial_lecturas_activo_empresa_activo_fecha_idx
  on public.historial_lecturas_activo (empresa_id, activo_id, fecha_lectura desc, created_at desc);

create or replace function public.registrar_lectura_activo(
  p_empresa_id text,
  p_activo_id text,
  p_valor numeric,
  p_unidad text,
  p_origen text,
  p_origen_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_activo public.activos%rowtype;
  v_lectura_id text;
  v_cache_actual numeric;
  v_cache_actualizado boolean := false;
begin
  if p_empresa_id is null or btrim(p_empresa_id) = '' then
    raise exception 'La empresa es obligatoria.' using errcode = '22023';
  end if;

  if p_activo_id is null or btrim(p_activo_id) = '' then
    raise exception 'El activo es obligatorio.' using errcode = '22023';
  end if;

  if p_valor is null or p_valor < 0 then
    raise exception 'El valor de la lectura debe ser un número no negativo.' using errcode = '22023';
  end if;

  if p_unidad is null or p_unidad not in ('horas', 'km') then
    raise exception 'Unidad de lectura no permitida: %.' , p_unidad using errcode = '22023';
  end if;

  if p_origen is null or p_origen not in ('ingreso_recepcion', 'parte_diario', 'cierre_ot', 'manual') then
    raise exception 'Origen de lectura no permitido: %.' , p_origen using errcode = '22023';
  end if;

  -- Bloquea el activo para serializar el cálculo del caché ante lecturas concurrentes.
  select *
    into v_activo
  from public.activos
  where id = p_activo_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'El activo no existe o no pertenece a la empresa indicada.' using errcode = '22023';
  end if;

  insert into public.historial_lecturas_activo (
    empresa_id,
    activo_id,
    valor,
    unidad,
    origen,
    origen_id,
    registrado_por
  ) values (
    p_empresa_id,
    p_activo_id,
    p_valor,
    p_unidad,
    p_origen,
    p_origen_id,
    auth.uid()
  )
  returning id into v_lectura_id;

  if v_activo.horometro_actual is null or p_valor > v_activo.horometro_actual then
    update public.activos
    set horometro_actual = p_valor,
        updated_at = now()
    where id = p_activo_id
      and empresa_id = p_empresa_id;
    v_cache_actual := p_valor;
    v_cache_actualizado := true;
  else
    v_cache_actual := v_activo.horometro_actual;
  end if;

  return jsonb_build_object(
    'lectura_id', v_lectura_id,
    'activo_id', p_activo_id,
    'valor', p_valor,
    'unidad', p_unidad,
    'cache_actual', v_cache_actual,
    'cache_actualizado', v_cache_actualizado
  );
end;
$$;

revoke all on function public.registrar_lectura_activo(text, text, numeric, text, text, text) from public, anon;
grant execute on function public.registrar_lectura_activo(text, text, numeric, text, text, text) to authenticated, service_role;
