-- Maestro comercial de rutas y tarifas de transporte.
begin;

do $preflight$
begin
  if to_regclass('public.empresas') is null then
    raise exception 'TRANSPORTE_MAESTRO_PREFLIGHT: falta public.empresas';
  end if;
  if to_regclass('public.cuentas') is null then
    raise exception 'TRANSPORTE_MAESTRO_PREFLIGHT: falta public.cuentas';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cuentas' and column_name = 'empresa_id'
  ) then
    raise exception 'TRANSPORTE_MAESTRO_PREFLIGHT: public.cuentas no tiene empresa_id';
  end if;
  if to_regprocedure('public.usuario_tiene_empresa(text)') is null then
    raise exception 'TRANSPORTE_MAESTRO_PREFLIGHT: falta usuario_tiene_empresa(text)';
  end if;
  if to_regprocedure('public.usuario_puede(text,text,text)') is null then
    raise exception 'TRANSPORTE_MAESTRO_PREFLIGHT: falta usuario_puede(text,text,text)';
  end if;
end
$preflight$;

create table if not exists public.transporte_rutas (
  id text primary key default ('tru_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id) on delete restrict,
  codigo text not null,
  nombre text not null,
  origen_nombre text not null,
  origen_direccion text,
  origen_ubigeo text,
  origen_latitud numeric,
  origen_longitud numeric,
  destino_nombre text not null,
  destino_direccion text,
  destino_ubigeo text,
  destino_latitud numeric,
  destino_longitud numeric,
  distancia_km numeric(10,2) check (distancia_km is null or distancia_km >= 0),
  duracion_estimada_horas numeric(6,2) check (duracion_estimada_horas is null or duracion_estimada_horas >= 0),
  tipo_carga_habitual text,
  peajes_estimados numeric(14,2) check (peajes_estimados is null or peajes_estimados >= 0),
  moneda_peajes text not null default 'PEN' check (char_length(moneda_peajes) = 3 and moneda_peajes in ('PEN', 'USD')),
  notas text,
  estado text not null default 'activa' check (estado in ('activa', 'inactiva')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transporte_rutas_empresa_codigo_key unique (empresa_id, codigo),
  constraint transporte_rutas_empresa_id_id_key unique (empresa_id, id),
  constraint transporte_rutas_nombre_chk check (nullif(trim(nombre), '') is not null),
  constraint transporte_rutas_origen_nombre_chk check (nullif(trim(origen_nombre), '') is not null),
  constraint transporte_rutas_destino_nombre_chk check (nullif(trim(destino_nombre), '') is not null),
  constraint transporte_rutas_origen_latitud_chk check (origen_latitud is null or origen_latitud between -90 and 90),
  constraint transporte_rutas_origen_longitud_chk check (origen_longitud is null or origen_longitud between -180 and 180),
  constraint transporte_rutas_destino_latitud_chk check (destino_latitud is null or destino_latitud between -90 and 90),
  constraint transporte_rutas_destino_longitud_chk check (destino_longitud is null or destino_longitud between -180 and 180),
  constraint transporte_rutas_codigo_chk check (nullif(trim(codigo), '') is not null)
);

create table if not exists public.transporte_tarifas (
  id text primary key default ('tta_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id) on delete restrict,
  ruta_id text,
  cuenta_id text references public.cuentas(id) on delete restrict,
  tipo_unidad text not null,
  modalidad text not null check (modalidad in ('viaje', 'km', 'tonelada', 'hora')),
  tarifa numeric(14,4) not null check (tarifa > 0),
  moneda text not null check (char_length(moneda) = 3 and moneda in ('PEN', 'USD')),
  minimo_facturable numeric(14,2) check (minimo_facturable is null or minimo_facturable >= 0),
  vigente_desde date not null,
  vigente_hasta date,
  estado text not null default 'activa' check (estado in ('activa', 'inactiva')),
  notas text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transporte_tarifas_empresa_ruta_fk
    foreign key (empresa_id, ruta_id)
    references public.transporte_rutas (empresa_id, id) on delete restrict,
  constraint transporte_tarifas_tipo_unidad_chk check (nullif(trim(tipo_unidad), '') is not null),
  constraint transporte_tarifas_vigencia_chk check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  constraint transporte_tarifas_viaje_ruta_chk check (modalidad <> 'viaje' or ruta_id is not null)
);

create index if not exists transporte_rutas_empresa_idx
  on public.transporte_rutas (empresa_id);
create index if not exists transporte_rutas_empresa_estado_idx
  on public.transporte_rutas (empresa_id, estado);
create index if not exists transporte_tarifas_empresa_idx
  on public.transporte_tarifas (empresa_id);
create index if not exists transporte_tarifas_ruta_idx
  on public.transporte_tarifas (ruta_id);
create index if not exists transporte_tarifas_cuenta_idx
  on public.transporte_tarifas (cuenta_id);
create index if not exists transporte_tarifas_vigencia_idx
  on public.transporte_tarifas (empresa_id, vigente_desde, vigente_hasta);

-- Las funciones se crean solo si aún no existen para permitir reejecutar esta migración.
do $functions$
begin
  if to_regprocedure('public.transporte_maestro_actualizar_updated_at()') is null then
    execute $function$
      create function public.transporte_maestro_actualizar_updated_at()
      returns trigger
      language plpgsql
      set search_path to 'public'
      as $body$
      begin
        new.updated_at = now();
        return new;
      end;
      $body$
    $function$;
  end if;

  if to_regprocedure('public.transporte_rutas_normalizar_codigo()') is null then
    execute $function$
      create function public.transporte_rutas_normalizar_codigo()
      returns trigger
      language plpgsql
      set search_path to 'public'
      as $body$
      begin
        new.codigo = upper(regexp_replace(trim(new.codigo), '\s+', '', 'g'));
        return new;
      end;
      $body$
    $function$;
  end if;

  if to_regprocedure('public.transporte_tarifas_validar_no_solapamiento()') is null then
    execute $function$
      create function public.transporte_tarifas_validar_no_solapamiento()
      returns trigger
      language plpgsql
      set search_path to 'public'
      as $body$
      declare
        v_tipo_unidad_normalizado text;
        v_clave text;
      begin
        if new.estado <> 'activa' then
          return new;
        end if;

        v_tipo_unidad_normalizado := lower(regexp_replace(trim(new.tipo_unidad), '\s+', '', 'g'));
        v_clave := concat_ws(chr(31), new.empresa_id, coalesce(new.ruta_id, '<NULL>'),
          coalesce(new.cuenta_id, '<NULL>'), v_tipo_unidad_normalizado, new.modalidad, new.moneda);
        perform pg_advisory_xact_lock(hashtextextended(v_clave, 0));

        if exists (
          select 1
          from public.transporte_tarifas t
          where t.empresa_id = new.empresa_id
            and t.ruta_id is not distinct from new.ruta_id
            and t.cuenta_id is not distinct from new.cuenta_id
            and lower(regexp_replace(trim(t.tipo_unidad), '\s+', '', 'g')) = v_tipo_unidad_normalizado
            and t.modalidad = new.modalidad
            and t.moneda = new.moneda
            and t.estado = 'activa'
            and t.id <> new.id
            and t.vigente_desde <= coalesce(new.vigente_hasta, 'infinity'::date)
            and coalesce(t.vigente_hasta, 'infinity'::date) >= new.vigente_desde
        ) then
          raise exception 'El rango de vigencia se solapa con otra tarifa activa de la misma combinación.';
        end if;

        return new;
      end;
      $body$
    $function$;
  end if;
end
$functions$;

create trigger transporte_rutas_updated_at_trg
before update on public.transporte_rutas
for each row execute function public.transporte_maestro_actualizar_updated_at();
create trigger transporte_tarifas_updated_at_trg
before update on public.transporte_tarifas
for each row execute function public.transporte_maestro_actualizar_updated_at();
create trigger transporte_rutas_normalizar_codigo_trg
before insert or update of codigo on public.transporte_rutas
for each row execute function public.transporte_rutas_normalizar_codigo();
create trigger transporte_tarifas_no_solapamiento_trg
before insert or update on public.transporte_tarifas
for each row execute function public.transporte_tarifas_validar_no_solapamiento();

do $resolver_function$
begin
  if to_regprocedure('public.resolver_tarifa_transporte(text,text,text,text,text,text,date)') is null then
    execute $function$
      create function public.resolver_tarifa_transporte(
        p_empresa_id text,
        p_ruta_id text,
        p_cuenta_id text,
        p_tipo_unidad text,
        p_modalidad text,
        p_moneda text,
        p_fecha date
      )
      returns setof public.transporte_tarifas
      language sql
      stable
      security invoker
      set search_path to 'public'
      as $body$
        select t.*
        from public.transporte_tarifas t
        where t.empresa_id = p_empresa_id
          and t.estado = 'activa'
          and t.vigente_desde <= p_fecha
          and (t.vigente_hasta is null or t.vigente_hasta >= p_fecha)
          and lower(regexp_replace(trim(t.tipo_unidad), '\s+', '', 'g'))
            = lower(regexp_replace(trim(p_tipo_unidad), '\s+', '', 'g'))
          and t.modalidad = p_modalidad
          and (p_moneda is null or t.moneda = p_moneda)
          and (
            (t.ruta_id = p_ruta_id and t.cuenta_id = p_cuenta_id)
            or (t.ruta_id is null and t.cuenta_id = p_cuenta_id)
            or (t.ruta_id = p_ruta_id and t.cuenta_id is null)
            or (t.ruta_id is null and t.cuenta_id is null)
          )
        order by
          case
            when t.ruta_id = p_ruta_id and t.cuenta_id = p_cuenta_id then 1
            when t.ruta_id is null and t.cuenta_id = p_cuenta_id then 2
            when t.ruta_id = p_ruta_id and t.cuenta_id is null then 3
            else 4
          end,
          case when p_moneda is null and t.moneda = 'PEN' then 1
               when p_moneda is null and t.moneda = 'USD' then 2
               else 1 end,
          t.id
        limit 1
      $body$
    $function$;
  end if;
end
$resolver_function$;
alter table public.transporte_rutas enable row level security;
alter table public.transporte_tarifas enable row level security;

create policy transporte_rutas_select on public.transporte_rutas
for select to authenticated
using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'ver'));
create policy transporte_rutas_insert on public.transporte_rutas
for insert to authenticated
with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'crear'));
create policy transporte_rutas_update on public.transporte_rutas
for update to authenticated
using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'editar'))
with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'editar'));
create policy transporte_rutas_delete on public.transporte_rutas
for delete to authenticated
using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'anular'));

create policy transporte_tarifas_select on public.transporte_tarifas
for select to authenticated
using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'ver'));
create policy transporte_tarifas_insert on public.transporte_tarifas
for insert to authenticated
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'transporte_comercial', 'crear')
  and (ruta_id is null or exists (
    select 1 from public.transporte_rutas r
    where r.id = transporte_tarifas.ruta_id and r.empresa_id = transporte_tarifas.empresa_id
  ))
  and (cuenta_id is null or exists (
    select 1 from public.cuentas c
    where c.id = transporte_tarifas.cuenta_id and c.empresa_id = transporte_tarifas.empresa_id
  ))
);
create policy transporte_tarifas_update on public.transporte_tarifas
for update to authenticated
using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'editar'))
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'transporte_comercial', 'editar')
  and (ruta_id is null or exists (
    select 1 from public.transporte_rutas r
    where r.id = transporte_tarifas.ruta_id and r.empresa_id = transporte_tarifas.empresa_id
  ))
  and (cuenta_id is null or exists (
    select 1 from public.cuentas c
    where c.id = transporte_tarifas.cuenta_id and c.empresa_id = transporte_tarifas.empresa_id
  ))
);
create policy transporte_tarifas_delete on public.transporte_tarifas
for delete to authenticated
using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'transporte_comercial', 'anular'));

do $postflight$
declare
  v_policy_count integer;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.transporte_rutas'::regclass) then
    raise exception 'TRANSPORTE_MAESTRO_POSTFLIGHT: transporte_rutas sin RLS';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.transporte_tarifas'::regclass) then
    raise exception 'TRANSPORTE_MAESTRO_POSTFLIGHT: transporte_tarifas sin RLS';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in ('transporte_rutas', 'transporte_tarifas')
    and policyname in (
      'transporte_rutas_select', 'transporte_rutas_insert', 'transporte_rutas_update', 'transporte_rutas_delete',
      'transporte_tarifas_select', 'transporte_tarifas_insert', 'transporte_tarifas_update', 'transporte_tarifas_delete'
    );
  if v_policy_count <> 8 then
    raise exception 'TRANSPORTE_MAESTRO_POSTFLIGHT: se esperaban 8 políticas y se encontraron %', v_policy_count;
  end if;

  if to_regprocedure('public.resolver_tarifa_transporte(text,text,text,text,text,text,date)') is null then
    raise exception 'TRANSPORTE_MAESTRO_POSTFLIGHT: falta resolver_tarifa_transporte';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transporte_tarifas'::regclass
      and conname = 'transporte_tarifas_vigencia_chk'
  ) then
    raise exception 'TRANSPORTE_MAESTRO_POSTFLIGHT: falta constraint transporte_tarifas_vigencia_chk';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.transporte_tarifas'::regclass
      and tgname = 'transporte_tarifas_no_solapamiento_trg'
      and not tgisinternal
  ) then
    raise exception 'TRANSPORTE_MAESTRO_POSTFLIGHT: falta trigger de validación de solapamiento';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.transporte_rutas'::regclass
      and tgname = 'transporte_rutas_updated_at_trg'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.transporte_tarifas'::regclass
      and tgname = 'transporte_tarifas_updated_at_trg'
      and not tgisinternal
  ) then
    raise exception 'TRANSPORTE_MAESTRO_POSTFLIGHT: falta trigger updated_at';
  end if;
end
$postflight$;

commit;

