-- TMS · Hoja de Ruta combinada (Fase C)
-- Un solo modelo de viaje para el servicio comercial y la logística propia:
--   * transporte_viajes.tipo_viaje = 'comercial' | 'logistica' (la logística no tiene cliente ni tarifa).
--   * Paradas con documento (tránsito de OC, guía, compra de campo o libre) y evidencia de entrega.
--   * Pedidos «Por enviar a ruta» que crean Compras, Almacén y el despachador.
--   * Hitos, inspección antes de salir y gastos en ruta del servicio comercial.
--   * Lecturas e incidentes de flota ligados al viaje.
--   * Migración de las rutas de logística propia (rutas / ruta_paradas) al modelo combinado.
-- Las escrituras de logística y del conductor pasan por funciones SECURITY DEFINER que validan permisos.

-- =========================================================================
-- 1. Columnas
-- =========================================================================
alter table public.transporte_viajes
  add column if not exists tipo_viaje text not null default 'comercial',
  add column if not exists hora_salida time,
  add column if not exists legacy_ruta_id text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transporte_viajes_tipo_viaje_check') then
    alter table public.transporte_viajes add constraint transporte_viajes_tipo_viaje_check check (tipo_viaje in ('comercial','logistica'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transporte_viajes_cuenta_comercial_chk') then
    alter table public.transporte_viajes add constraint transporte_viajes_cuenta_comercial_chk check (tipo_viaje = 'logistica' or cuenta_id is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transporte_viajes_legacy_ruta_key') then
    alter table public.transporte_viajes add constraint transporte_viajes_legacy_ruta_key unique (legacy_ruta_id);
  end if;
end $$;

alter table public.transporte_viajes alter column cuenta_id drop not null;

alter table public.transporte_viaje_paradas
  add column if not exists documento_tipo text,
  add column if not exists oc_transito_id text references public.orden_compra_transitos(id) on delete restrict,
  add column if not exists compra_gasto_id text references public.compras_gastos(id) on delete set null,
  add column if not exists descripcion text,
  add column if not exists pedido_id text,
  add column if not exists llegada_at timestamptz,
  add column if not exists salida_at timestamptz,
  add column if not exists recibe_nombre text,
  add column if not exists recibe_dni text,
  add column if not exists firma_url text,
  add column if not exists foto_url text,
  add column if not exists foto_carga_url text,
  add column if not exists bultos_recibidos numeric(12,2),
  add column if not exists novedad text,
  add column if not exists latitud_evidencia numeric,
  add column if not exists longitud_evidencia numeric,
  add column if not exists completada_por uuid,
  add column if not exists legacy_parada_id text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transporte_viaje_paradas_documento_tipo_check') then
    alter table public.transporte_viaje_paradas add constraint transporte_viaje_paradas_documento_tipo_check
      check (documento_tipo is null or documento_tipo in ('orden_compra_transito','guia_remision','compra_gasto','libre'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transporte_viaje_paradas_novedad_check') then
    alter table public.transporte_viaje_paradas add constraint transporte_viaje_paradas_novedad_check
      check (novedad is null or novedad in ('conforme','faltante','danio','rechazo_parcial'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transporte_viaje_paradas_bultos_chk') then
    alter table public.transporte_viaje_paradas add constraint transporte_viaje_paradas_bultos_chk
      check (bultos_recibidos is null or bultos_recibidos >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transporte_viaje_paradas_legacy_key') then
    alter table public.transporte_viaje_paradas add constraint transporte_viaje_paradas_legacy_key unique (legacy_parada_id);
  end if;
end $$;

alter table public.lecturas_flota
  add column if not exists viaje_id text references public.transporte_viajes(id) on delete set null,
  add column if not exists viaje_parada_id text references public.transporte_viaje_paradas(id) on delete set null;
alter table public.incidentes_flota
  add column if not exists viaje_id text references public.transporte_viajes(id) on delete set null,
  add column if not exists viaje_parada_id text references public.transporte_viaje_paradas(id) on delete set null;

alter table public.conductores_transporte add column if not exists usuario_id uuid;
create unique index if not exists conductores_transporte_usuario_key
  on public.conductores_transporte (empresa_id, usuario_id) where usuario_id is not null;

create index if not exists transporte_viajes_tipo_fecha_idx on public.transporte_viajes (empresa_id, tipo_viaje, fecha_programada);
create index if not exists transporte_viajes_conductor_idx on public.transporte_viajes (conductor_id);
create index if not exists lecturas_flota_viaje_idx on public.lecturas_flota (viaje_id);
create index if not exists incidentes_flota_viaje_idx on public.incidentes_flota (viaje_id);

-- =========================================================================
-- 2. Tablas nuevas
-- =========================================================================
create table if not exists public.transporte_pedidos_ruta (
  id text primary key default ('tpr_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id) on delete restrict,
  accion text not null check (accion in ('recoger','entregar')),
  documento_tipo text not null check (documento_tipo in ('orden_compra_transito','guia_remision','compra_gasto','libre')),
  oc_transito_id text references public.orden_compra_transitos(id) on delete cascade,
  guia_remision_id text references public.guias_remision(id) on delete cascade,
  compra_gasto_id text references public.compras_gastos(id) on delete cascade,
  documento_codigo text,
  titulo text not null check (nullif(trim(titulo), '') is not null),
  lugar_nombre text not null check (nullif(trim(lugar_nombre), '') is not null),
  direccion text,
  latitud numeric check (latitud is null or latitud between -90 and 90),
  longitud numeric check (longitud is null or longitud between -180 and 180),
  fecha_requerida date,
  ventana_inicio time,
  ventana_fin time,
  indicaciones text,
  origen text not null check (origen in ('compras','almacen','despachador')),
  estado text not null default 'pendiente' check (estado in ('pendiente','asignado','completado','retirado')),
  viaje_id text references public.transporte_viajes(id) on delete set null,
  parada_id text references public.transporte_viaje_paradas(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transporte_pedidos_ruta_documento_chk check (
    (documento_tipo = 'orden_compra_transito' and oc_transito_id is not null)
    or (documento_tipo = 'guia_remision' and guia_remision_id is not null)
    or (documento_tipo = 'compra_gasto' and compra_gasto_id is not null)
    or documento_tipo = 'libre'),
  constraint transporte_pedidos_ruta_ventana_chk check (ventana_inicio is null or ventana_fin is null or ventana_fin > ventana_inicio)
);
create index if not exists transporte_pedidos_ruta_estado_idx on public.transporte_pedidos_ruta (empresa_id, estado);
create unique index if not exists transporte_pedidos_ruta_oc_activo_key on public.transporte_pedidos_ruta (oc_transito_id)
  where oc_transito_id is not null and estado in ('pendiente','asignado');
create unique index if not exists transporte_pedidos_ruta_guia_activo_key on public.transporte_pedidos_ruta (guia_remision_id)
  where guia_remision_id is not null and estado in ('pendiente','asignado');

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transporte_viaje_paradas_pedido_fk') then
    alter table public.transporte_viaje_paradas add constraint transporte_viaje_paradas_pedido_fk
      foreign key (pedido_id) references public.transporte_pedidos_ruta(id) on delete set null;
  end if;
end $$;

create table if not exists public.transporte_viaje_hitos (
  id text primary key default ('tvh_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null,
  viaje_id text not null,
  hito text not null check (hito in ('salida_base','llegada_carga','fin_carga','llegada_destino','fin_descarga','entregado')),
  ocurrido_at timestamptz not null default now(),
  latitud numeric,
  longitud numeric,
  km numeric(12,1) check (km is null or km >= 0),
  foto_url text,
  nota text,
  registrado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint transporte_viaje_hitos_viaje_fk foreign key (empresa_id, viaje_id) references public.transporte_viajes(empresa_id, id) on delete cascade,
  constraint transporte_viaje_hitos_unico unique (viaje_id, hito)
);

create table if not exists public.transporte_viaje_inspecciones (
  id text primary key default ('tvi_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null,
  viaje_id text not null unique,
  items jsonb not null default '[]'::jsonb,
  requisitos jsonb not null default '[]'::jsonb,
  observados integer not null default 0,
  criticos integer not null default 0,
  km_salida numeric(12,1) check (km_salida is null or km_salida >= 0),
  foto_tablero_url text,
  autorizada_por uuid,
  autorizada_at timestamptz,
  registrado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transporte_viaje_inspecciones_viaje_fk foreign key (empresa_id, viaje_id) references public.transporte_viajes(empresa_id, id) on delete cascade
);

create table if not exists public.transporte_viaje_gastos (
  id text primary key default ('tvg_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null,
  viaje_id text not null,
  tipo text not null check (tipo in ('peaje','combustible','estiba','viatico','otro')),
  monto numeric(12,2) not null check (monto > 0),
  moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
  lugar text,
  foto_url text not null,
  fecha timestamptz not null default now(),
  registrado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint transporte_viaje_gastos_viaje_fk foreign key (empresa_id, viaje_id) references public.transporte_viajes(empresa_id, id) on delete cascade
);
create index if not exists transporte_viaje_gastos_viaje_idx on public.transporte_viaje_gastos (viaje_id);

alter table public.transporte_pedidos_ruta enable row level security;
alter table public.transporte_viaje_hitos enable row level security;
alter table public.transporte_viaje_inspecciones enable row level security;
alter table public.transporte_viaje_gastos enable row level security;

-- =========================================================================
-- 3. Permisos: logística propia y conductor
-- =========================================================================
-- Quien trabaja la logística propia: transporte comercial, compras o guías.
create or replace function public.transporte_puede_logistica(p_empresa_id text, p_accion text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.usuario_tiene_empresa(p_empresa_id) and (
    public.usuario_puede(p_empresa_id, 'transporte_comercial', p_accion)
    or public.usuario_puede(p_empresa_id, 'ordenes_compra', p_accion)
    or public.usuario_puede(p_empresa_id, 'Transporte y Guias', p_accion))
$function$;

-- El usuario está vinculado al conductor indicado.
create or replace function public.transporte_es_conductor(p_empresa_id text, p_conductor_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_conductor_id is not null and exists (
    select 1 from public.conductores_transporte c
    where c.id = p_conductor_id and c.empresa_id = p_empresa_id
      and c.usuario_id = auth.uid() and c.activo)
$function$;

-- Lectura de un viaje: transporte comercial, logística propia o el conductor asignado.
create or replace function public.transporte_puede_ver_viaje(p_viaje_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.transporte_viajes v
    where v.id = p_viaje_id and public.usuario_tiene_empresa(v.empresa_id) and (
      public.usuario_puede(v.empresa_id, 'transporte_comercial', 'ver')
      or (v.tipo_viaje = 'logistica' and public.transporte_puede_logistica(v.empresa_id, 'ver'))
      or public.transporte_es_conductor(v.empresa_id, v.conductor_id)))
$function$;

-- Escritura del conductor o de quien gestiona el viaje.
create or replace function public.transporte__puede_operar_viaje(v public.transporte_viajes)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.usuario_tiene_empresa(v.empresa_id) and (
    public.usuario_puede(v.empresa_id, 'transporte_comercial', 'editar')
    or (v.tipo_viaje = 'logistica' and public.transporte_puede_logistica(v.empresa_id, 'editar'))
    or public.transporte_es_conductor(v.empresa_id, v.conductor_id))
$function$;

-- Políticas adicionales de lectura (se suman a las de transporte comercial).
drop policy if exists transporte_viajes_select_logistica on public.transporte_viajes;
create policy transporte_viajes_select_logistica on public.transporte_viajes for select
  using (usuario_tiene_empresa(empresa_id) and (
    (tipo_viaje = 'logistica' and transporte_puede_logistica(empresa_id, 'ver'))
    or transporte_es_conductor(empresa_id, conductor_id)));

drop policy if exists transporte_viaje_paradas_select_logistica on public.transporte_viaje_paradas;
create policy transporte_viaje_paradas_select_logistica on public.transporte_viaje_paradas for select
  using (usuario_tiene_empresa(empresa_id) and transporte_puede_ver_viaje(viaje_id));

drop policy if exists transporte_viaje_eventos_select_logistica on public.transporte_viaje_eventos;
create policy transporte_viaje_eventos_select_logistica on public.transporte_viaje_eventos for select
  using (usuario_tiene_empresa(empresa_id) and transporte_puede_ver_viaje(viaje_id));

drop policy if exists transporte_viaje_hitos_select on public.transporte_viaje_hitos;
create policy transporte_viaje_hitos_select on public.transporte_viaje_hitos for select
  using (usuario_tiene_empresa(empresa_id) and transporte_puede_ver_viaje(viaje_id));

drop policy if exists transporte_viaje_inspecciones_select on public.transporte_viaje_inspecciones;
create policy transporte_viaje_inspecciones_select on public.transporte_viaje_inspecciones for select
  using (usuario_tiene_empresa(empresa_id) and transporte_puede_ver_viaje(viaje_id));

drop policy if exists transporte_viaje_gastos_select on public.transporte_viaje_gastos;
create policy transporte_viaje_gastos_select on public.transporte_viaje_gastos for select
  using (usuario_tiene_empresa(empresa_id) and transporte_puede_ver_viaje(viaje_id));

drop policy if exists transporte_pedidos_ruta_select on public.transporte_pedidos_ruta;
create policy transporte_pedidos_ruta_select on public.transporte_pedidos_ruta for select
  using (transporte_puede_logistica(empresa_id, 'ver'));

-- El conductor ve su propia ficha (para identificarse en la app).
drop policy if exists conductores_transporte_select_propio on public.conductores_transporte;
create policy conductores_transporte_select_propio on public.conductores_transporte for select
  using (usuario_tiene_empresa(empresa_id) and usuario_id = auth.uid());

-- =========================================================================
-- 4. Funciones existentes ajustadas (parten de pg_get_functiondef vigente)
-- =========================================================================
-- transporte_viaje_preparar: las funciones de logística validan permisos por su cuenta
-- (tms.rpc_logistica = 'si'); la cuenta solo es obligatoria en el servicio comercial.
CREATE OR REPLACE FUNCTION public.transporte_viaje_preparar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_anio integer; v_numero bigint; v_recalcular_cantidad boolean; v_recalcular_ingreso boolean;
begin
  if current_setting('tms.rpc_logistica',true) is distinct from 'si' and (
     not public.usuario_tiene_empresa(new.empresa_id)
     or (tg_op='INSERT' and not public.usuario_puede(new.empresa_id,'transporte_comercial','crear'))
     or (tg_op='UPDATE' and not public.usuario_puede(new.empresa_id,'transporte_comercial','editar'))) then
    if tg_op='INSERT' then raise exception 'No tienes permiso para crear viajes.' using errcode='42501';
    else raise exception 'No tienes permiso para editar viajes.' using errcode='42501'; end if;
  end if;
  if tg_op='INSERT' then
    new.created_by := auth.uid();
    v_anio := extract(year from coalesce(new.fecha_programada,now()))::integer;
    perform pg_advisory_xact_lock(hashtextextended(new.empresa_id || ':viaje:' || v_anio::text,0));
    select coalesce(max(substring(codigo from 9)::bigint),0)+1 into v_numero
    from public.transporte_viajes where empresa_id=new.empresa_id and codigo like 'TV-'||v_anio::text||'-%';
    new.codigo := 'TV-'||v_anio::text||'-'||lpad(v_numero::text,5,'0');
  end if;
  if new.os_cliente_id is not null and not exists (
    select 1 from public.os_clientes o where o.id=new.os_cliente_id and o.empresa_id=new.empresa_id and o.cuenta_id=new.cuenta_id
  ) then raise exception 'La OS cliente debe pertenecer a la misma cuenta y empresa.'; end if;
  if new.tipo_viaje='comercial' and new.cuenta_id is null then
    raise exception 'La cuenta debe pertenecer a la empresa del viaje.';
  end if;
  if new.cuenta_id is not null and not exists (select 1 from public.cuentas c where c.id=new.cuenta_id and c.empresa_id=new.empresa_id) then
    raise exception 'La cuenta debe pertenecer a la empresa del viaje.';
  end if;
  if new.sociedad_id is not null and not exists (select 1 from public.sociedades s where s.id=new.sociedad_id and s.empresa_id=new.empresa_id) then raise exception 'La sociedad debe pertenecer a la empresa del viaje.'; end if;
  if new.cotizacion_id is not null and not exists (select 1 from public.cotizaciones c where c.id=new.cotizacion_id and c.empresa_id=new.empresa_id and (c.cuenta_id is null or c.cuenta_id=new.cuenta_id)) then raise exception 'La cotización no corresponde a la empresa y cuenta del viaje.'; end if;
  if new.ruta_id is not null and not exists (select 1 from public.transporte_rutas r where r.id=new.ruta_id and r.empresa_id=new.empresa_id) then raise exception 'La ruta no corresponde a la empresa del viaje.'; end if;
  if new.tarifa_id is not null and not exists (select 1 from public.transporte_tarifas t where t.id=new.tarifa_id and t.empresa_id=new.empresa_id) then raise exception 'La tarifa no corresponde a la empresa del viaje.'; end if;
  if new.transportista_id is not null and not exists (select 1 from public.transportistas t where t.id=new.transportista_id and t.empresa_id=new.empresa_id) then raise exception 'El transportista no corresponde a la empresa del viaje.'; end if;
  if new.vehiculo_id is not null and not exists (select 1 from public.vehiculos_transporte v where v.id=new.vehiculo_id and v.empresa_id=new.empresa_id) then raise exception 'El vehículo no corresponde a la empresa del viaje.'; end if;
  if new.conductor_id is not null and not exists (select 1 from public.conductores_transporte c where c.id=new.conductor_id and c.empresa_id=new.empresa_id) then raise exception 'El conductor no corresponde a la empresa del viaje.'; end if;
  v_recalcular_cantidad := new.cantidad_facturable is null or (tg_op='UPDATE'
    and new.cantidad_facturable is not distinct from old.cantidad_facturable
    and (new.modalidad is distinct from old.modalidad or new.distancia_km is distinct from old.distancia_km
      or new.peso_toneladas is distinct from old.peso_toneladas
      or new.duracion_estimada_horas is distinct from old.duracion_estimada_horas));
  if v_recalcular_cantidad then
    if new.modalidad='viaje' then new.cantidad_facturable := 1;
    elsif new.modalidad='km' then new.cantidad_facturable := new.distancia_km;
    elsif new.modalidad='tonelada' then new.cantidad_facturable := new.peso_toneladas;
    else new.cantidad_facturable := new.duracion_estimada_horas; end if;
  end if;
  v_recalcular_ingreso := new.ingreso_estimado is null or (tg_op='UPDATE'
    and new.ingreso_estimado is not distinct from old.ingreso_estimado
    and (new.tarifa_unitaria is distinct from old.tarifa_unitaria
      or new.cantidad_facturable is distinct from old.cantidad_facturable
      or new.minimo_facturable is distinct from old.minimo_facturable));
  if v_recalcular_ingreso and new.tarifa_unitaria is not null and new.cantidad_facturable is not null then
    new.ingreso_estimado := round(greatest(new.tarifa_unitaria*new.cantidad_facturable,coalesce(new.minimo_facturable,0)),2);
  end if;
  if tg_op='UPDATE' and new.estado is distinct from old.estado and current_setting('tms.cambiando_estado',true) is distinct from 'si' then
    raise exception 'El estado solo puede cambiarse mediante transporte_viaje_cambiar_estado.' using errcode='42501';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

-- transporte_viaje_evento_inicial: mismo criterio de permisos que preparar.
CREATE OR REPLACE FUNCTION public.transporte_viaje_evento_inicial()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if current_setting('tms.rpc_logistica',true) is distinct from 'si'
     and (not public.usuario_tiene_empresa(new.empresa_id) or not public.usuario_puede(new.empresa_id,'transporte_comercial','crear')) then
    raise exception 'No tienes permiso para crear viajes.' using errcode='42501';
  end if;
  perform set_config('tms.escribiendo_evento','si',true);
  insert into public.transporte_viaje_eventos(viaje_id,empresa_id,estado_anterior,estado_nuevo,nota,created_by)
  values(new.id,new.empresa_id,null,new.estado,coalesce(nullif(current_setting('tms.nota_creacion',true),''),'Viaje creado'),auth.uid());
  perform set_config('tms.escribiendo_evento','no',true);
  return new;
end;
$function$;

-- transporte_viaje_cambiar_estado: la logística propia pasa de programado a en ruta sin despacho
-- y el conductor solo mueve su viaje entre en ruta, con incidente y entregado.
CREATE OR REPLACE FUNCTION public.transporte_viaje_cambiar_estado(p_viaje_id text, p_estado_nuevo text, p_nota text DEFAULT NULL::text)
 RETURNS transporte_viajes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_viaje public.transporte_viajes%rowtype; v_estado_anterior text; v_editor boolean; v_prev_rpc text;
begin
  select * into v_viaje from public.transporte_viajes where id=p_viaje_id for update;
  if not found then raise exception 'Viaje no encontrado.'; end if;
  v_editor := public.usuario_tiene_empresa(v_viaje.empresa_id) and (
    public.usuario_puede(v_viaje.empresa_id,'transporte_comercial','editar')
    or (v_viaje.tipo_viaje='logistica' and public.transporte_puede_logistica(v_viaje.empresa_id,'editar')));
  if not v_editor and not (
     public.transporte_es_conductor(v_viaje.empresa_id, v_viaje.conductor_id)
     and p_estado_nuevo in ('en_ruta','con_incidente','entregado')) then
    raise exception 'No tienes permiso para cambiar el estado del viaje.' using errcode='42501';
  end if;
  v_estado_anterior := v_viaje.estado;
  if p_estado_nuevo not in ('borrador','programado','despachado','en_ruta','con_incidente','entregado','en_liquidacion','cerrado','cancelado')
     or not (public.transporte_viaje_transicion_permitida(v_viaje.estado,p_estado_nuevo)
       or (v_viaje.tipo_viaje='logistica' and v_viaje.estado='programado' and p_estado_nuevo='en_ruta')) then
    raise exception 'Transición de estado no permitida: % -> %.',v_viaje.estado,p_estado_nuevo;
  end if;
  if v_viaje.tipo_viaje='logistica' and p_estado_nuevo in ('en_liquidacion','cerrado') then
    raise exception 'La logística propia no pasa por liquidación.';
  end if;
  if p_estado_nuevo='cancelado' and nullif(trim(p_nota),'') is null then raise exception 'Se requiere motivo para cancelar el viaje.'; end if;
  perform set_config('tms.cambiando_estado','si',true);
  v_prev_rpc := coalesce(current_setting('tms.rpc_logistica',true),'');
  perform set_config('tms.rpc_logistica','si',true);
  update public.transporte_viajes set estado=p_estado_nuevo,motivo_cancelacion=case when p_estado_nuevo='cancelado' then trim(p_nota) else motivo_cancelacion end where id=p_viaje_id returning * into v_viaje;
  perform set_config('tms.rpc_logistica',v_prev_rpc,true);
  perform set_config('tms.cambiando_estado','no',true);
  perform set_config('tms.escribiendo_evento','si',true);
  insert into public.transporte_viaje_eventos(viaje_id,empresa_id,estado_anterior,estado_nuevo,nota,created_by)
  values(v_viaje.id,v_viaje.empresa_id,v_estado_anterior,p_estado_nuevo,nullif(trim(p_nota),''),auth.uid());
  perform set_config('tms.escribiendo_evento','no',true);
  return v_viaje;
end;
$function$;

-- transporte_viaje_parada_updated_at: mismo criterio de permisos que preparar.
CREATE OR REPLACE FUNCTION public.transporte_viaje_parada_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if current_setting('tms.rpc_logistica',true) is distinct from 'si' and (
     not public.usuario_tiene_empresa(new.empresa_id)
     or (tg_op='INSERT' and not (public.usuario_puede(new.empresa_id,'transporte_comercial','crear') or public.usuario_puede(new.empresa_id,'transporte_comercial','editar')))
     or (tg_op='UPDATE' and not public.usuario_puede(new.empresa_id,'transporte_comercial','editar'))) then raise exception 'No tienes permiso para editar paradas de viaje.' using errcode='42501'; end if;
  if new.guia_remision_id is not null and not exists (select 1 from public.guias_remision g where g.id=new.guia_remision_id and g.empresa_id=new.empresa_id) then raise exception 'La guía de remisión debe pertenecer a la empresa de la parada.'; end if;
  new.updated_at:=now();
  return new;
end;
$function$;

-- =========================================================================
-- 5. Funciones internas
-- =========================================================================
create or replace function public.transporte__nota(p_viaje public.transporte_viajes, p_nota text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if nullif(trim(p_nota), '') is null then return; end if;
  perform set_config('tms.escribiendo_evento', 'si', true);
  insert into public.transporte_viaje_eventos(viaje_id, empresa_id, estado_anterior, estado_nuevo, nota, created_by)
  values (p_viaje.id, p_viaje.empresa_id, p_viaje.estado, p_viaje.estado, trim(p_nota), auth.uid());
  perform set_config('tms.escribiendo_evento', 'no', true);
end;
$function$;

-- Renumera las paradas de un viaje según el orden recibido (dos fases por el índice único).
create or replace function public.transporte__renumerar_paradas(p_viaje_id text, p_ids text[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare i integer;
begin
  update public.transporte_viaje_paradas set secuencia = secuencia + 100000 where viaje_id = p_viaje_id;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    update public.transporte_viaje_paradas set secuencia = i where id = p_ids[i] and viaje_id = p_viaje_id;
  end loop;
  -- Las que no vinieron en la lista quedan al final, en su orden anterior.
  with resto as (
    select id, row_number() over (order by secuencia) + coalesce(array_length(p_ids, 1), 0) as nueva
    from public.transporte_viaje_paradas where viaje_id = p_viaje_id and secuencia > 100000)
  update public.transporte_viaje_paradas p set secuencia = resto.nueva from resto where p.id = resto.id;
end;
$function$;

-- Valida unidad y conductor para la logística propia. Devuelve observaciones no bloqueantes.
create or replace function public.transporte__validar_recursos_logistica(p_empresa_id text, p_vehiculo_id text, p_conductor_id text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_veh public.vehiculos_transporte%rowtype; v_con public.conductores_transporte%rowtype;
  v_hoy date := (now() at time zone 'America/Lima')::date; v_obs text[] := '{}';
begin
  if p_vehiculo_id is not null then
    select * into v_veh from public.vehiculos_transporte where id = p_vehiculo_id and empresa_id = p_empresa_id;
    if not found then raise exception 'La unidad no existe en la empresa.'; end if;
    if not v_veh.activo then raise exception 'La unidad % está inactiva.', v_veh.placa; end if;
    if v_veh.vigencia_certificado_habilitacion < v_hoy then v_obs := v_obs || format('certificado MTC de %s vencido', v_veh.placa); end if;
  end if;
  if p_conductor_id is not null then
    select * into v_con from public.conductores_transporte where id = p_conductor_id and empresa_id = p_empresa_id;
    if not found then raise exception 'El conductor no existe en la empresa.'; end if;
    if not v_con.activo then raise exception 'El conductor % está inactivo.', v_con.nombre; end if;
    if v_con.vigencia_brevete < v_hoy then raise exception 'El brevete de % está vencido.', v_con.nombre; end if;
  end if;
  return nullif(array_to_string(v_obs, '; '), '');
end;
$function$;

-- =========================================================================
-- 6. Pedidos «Por enviar a ruta»
-- =========================================================================
create or replace function public.transporte_pedido_ruta_crear(p_empresa_id text, p_datos jsonb)
returns public.transporte_pedidos_ruta
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tipo text := p_datos->>'documento_tipo';
  v_codigo text;
  v_ok boolean;
  v_row public.transporte_pedidos_ruta%rowtype;
begin
  if not (public.transporte_puede_logistica(p_empresa_id, 'crear') or public.transporte_puede_logistica(p_empresa_id, 'editar')) then
    raise exception 'No tienes permiso para enviar documentos a ruta.' using errcode = '42501';
  end if;
  if v_tipo = 'orden_compra_transito' then
    select oc.codigo, t.estado in ('registrado','en_transito') into v_codigo, v_ok
    from public.orden_compra_transitos t join public.ordenes_compra oc on oc.id = t.orden_compra_id
    where t.id = p_datos->>'oc_transito_id' and t.empresa_id = p_empresa_id;
    if not found then raise exception 'El tránsito de la OC no existe.'; end if;
    if not v_ok then raise exception 'El tránsito de la OC ya no está activo.'; end if;
  elsif v_tipo = 'guia_remision' then
    select g.numero_completo, not coalesce(g.anulado, false) into v_codigo, v_ok
    from public.guias_remision g where g.id = p_datos->>'guia_remision_id' and g.empresa_id = p_empresa_id;
    if not found then raise exception 'La guía no existe.'; end if;
    if not v_ok then raise exception 'La guía está anulada.'; end if;
  elsif v_tipo = 'compra_gasto' then
    select coalesce(g.num_comprobante, 'Compra de campo') into v_codigo
    from public.compras_gastos g where g.id = p_datos->>'compra_gasto_id' and g.empresa_id = p_empresa_id;
    if not found then raise exception 'La compra de campo no existe.'; end if;
  elsif v_tipo is distinct from 'libre' then
    raise exception 'Tipo de documento no válido.';
  end if;

  if (v_tipo = 'orden_compra_transito' and exists (select 1 from public.transporte_pedidos_ruta
        where oc_transito_id = p_datos->>'oc_transito_id' and estado in ('pendiente','asignado')))
     or (v_tipo = 'guia_remision' and exists (select 1 from public.transporte_pedidos_ruta
        where guia_remision_id = p_datos->>'guia_remision_id' and estado in ('pendiente','asignado'))) then
    raise exception 'Este documento ya está en la Hoja de Ruta.';
  end if;

  insert into public.transporte_pedidos_ruta (
    empresa_id, accion, documento_tipo, oc_transito_id, guia_remision_id, compra_gasto_id, documento_codigo,
    titulo, lugar_nombre, direccion, latitud, longitud, fecha_requerida, ventana_inicio, ventana_fin, indicaciones, origen)
  values (
    p_empresa_id,
    coalesce(p_datos->>'accion', 'recoger'),
    v_tipo,
    case when v_tipo = 'orden_compra_transito' then p_datos->>'oc_transito_id' end,
    case when v_tipo = 'guia_remision' then p_datos->>'guia_remision_id' end,
    case when v_tipo = 'compra_gasto' then p_datos->>'compra_gasto_id' end,
    v_codigo,
    trim(coalesce(p_datos->>'titulo', '')),
    trim(coalesce(p_datos->>'lugar_nombre', '')),
    nullif(trim(p_datos->>'direccion'), ''),
    nullif(p_datos->>'latitud', '')::numeric,
    nullif(p_datos->>'longitud', '')::numeric,
    nullif(p_datos->>'fecha_requerida', '')::date,
    nullif(p_datos->>'ventana_inicio', '')::time,
    nullif(p_datos->>'ventana_fin', '')::time,
    nullif(trim(p_datos->>'indicaciones'), ''),
    coalesce(p_datos->>'origen', 'despachador'))
  returning * into v_row;
  return v_row;
end;
$function$;

create or replace function public.transporte_pedido_ruta_retirar(p_pedido_id text)
returns public.transporte_pedidos_ruta
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.transporte_pedidos_ruta%rowtype;
begin
  select * into v_row from public.transporte_pedidos_ruta where id = p_pedido_id for update;
  if not found then raise exception 'El pedido no existe.'; end if;
  if not (public.transporte_puede_logistica(v_row.empresa_id, 'editar') or v_row.created_by = auth.uid()) then
    raise exception 'No tienes permiso para retirar este pedido.' using errcode = '42501';
  end if;
  if v_row.estado <> 'pendiente' then raise exception 'Solo se retira un pedido que aún no está en una ruta.'; end if;
  update public.transporte_pedidos_ruta set estado = 'retirado', updated_at = now() where id = p_pedido_id returning * into v_row;
  return v_row;
end;
$function$;

-- =========================================================================
-- 7. Rutas de logística propia (Hoja de Ruta)
-- =========================================================================
-- p_datos: fecha_programada, hora_salida, vehiculo_id, conductor_id, transportista_id,
--          origen_nombre, destino_nombre, observaciones.
-- p_paradas (en orden): {parada_id} para conservar, {pedido_id} para tomar un pedido,
--          o {accion, nombre, direccion, latitud, longitud, descripcion} para una parada libre.
create or replace function public.transporte_ruta_logistica_guardar(
  p_empresa_id text, p_viaje_id text, p_datos jsonb, p_paradas jsonb, p_programar boolean default false)
returns public.transporte_viajes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.transporte_viajes%rowtype;
  v_ped public.transporte_pedidos_ruta%rowtype;
  v_item jsonb;
  v_ids text[] := '{}';
  v_id text;
  v_obs text;
  v_prev text := coalesce(current_setting('tms.rpc_logistica', true), '');
  v_vehiculo text := nullif(p_datos->>'vehiculo_id', '');
  v_conductor text := nullif(p_datos->>'conductor_id', '');
  v_transportista text := nullif(p_datos->>'transportista_id', '');
  v_tipo_unidad text;
  v_origen text := coalesce(nullif(trim(p_datos->>'origen_nombre'), ''), 'Base');
  v_hoy date := (now() at time zone 'America/Lima')::date;
  r record;
begin
  if not (public.transporte_puede_logistica(p_empresa_id, 'crear') or public.transporte_puede_logistica(p_empresa_id, 'editar')) then
    raise exception 'No tienes permiso para armar rutas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_paradas) is distinct from 'array' or jsonb_array_length(p_paradas) = 0 then
    raise exception 'Agrega al menos una parada a la ruta.';
  end if;
  v_obs := public.transporte__validar_recursos_logistica(p_empresa_id, v_vehiculo, v_conductor);
  if v_transportista is not null and not exists (select 1 from public.transportistas where id = v_transportista and empresa_id = p_empresa_id) then
    v_transportista := null;
  end if;
  select coalesce(nullif(trim(tipo), ''), 'Unidad propia') into v_tipo_unidad from public.vehiculos_transporte where id = v_vehiculo;
  v_tipo_unidad := coalesce(v_tipo_unidad, 'Unidad propia');

  perform set_config('tms.rpc_logistica', 'si', true);
  if nullif(p_viaje_id, '') is null then
    perform set_config('tms.nota_creacion', 'Ruta de logística creada', true);
    insert into public.transporte_viajes (
      empresa_id, tipo_viaje, estado, origen_nombre, destino_nombre, tipo_unidad, modalidad, moneda,
      fecha_programada, hora_salida, vehiculo_id, conductor_id, transportista_id, observaciones)
    values (
      p_empresa_id, 'logistica', 'borrador', v_origen,
      coalesce(nullif(trim(p_datos->>'destino_nombre'), ''), v_origen), v_tipo_unidad, 'viaje', 'PEN',
      coalesce(nullif(p_datos->>'fecha_programada', '')::date, v_hoy), nullif(p_datos->>'hora_salida', '')::time,
      v_vehiculo, v_conductor, v_transportista, nullif(trim(p_datos->>'observaciones'), ''))
    returning * into v;
    perform set_config('tms.nota_creacion', '', true);
  else
    select * into v from public.transporte_viajes where id = p_viaje_id and empresa_id = p_empresa_id for update;
    if not found then raise exception 'La ruta no existe.'; end if;
    if v.tipo_viaje <> 'logistica' then raise exception 'Aquí solo se editan rutas de logística propia.'; end if;
    if v.estado not in ('borrador','programado') then raise exception 'La ruta ya salió: agrega paradas con «Agregar a la ruta».'; end if;
    update public.transporte_viajes set
      origen_nombre = v_origen,
      destino_nombre = coalesce(nullif(trim(p_datos->>'destino_nombre'), ''), v_origen),
      tipo_unidad = v_tipo_unidad,
      fecha_programada = coalesce(nullif(p_datos->>'fecha_programada', '')::date, fecha_programada),
      hora_salida = nullif(p_datos->>'hora_salida', '')::time,
      vehiculo_id = v_vehiculo, conductor_id = v_conductor, transportista_id = v_transportista,
      observaciones = nullif(trim(p_datos->>'observaciones'), '')
    where id = v.id returning * into v;
  end if;

  for v_item in select value from jsonb_array_elements(p_paradas) loop
    if nullif(v_item->>'parada_id', '') is not null then
      if not exists (select 1 from public.transporte_viaje_paradas where id = v_item->>'parada_id' and viaje_id = v.id) then
        raise exception 'Una de las paradas no pertenece a esta ruta.';
      end if;
      v_ids := v_ids || (v_item->>'parada_id');
    elsif nullif(v_item->>'pedido_id', '') is not null then
      select * into v_ped from public.transporte_pedidos_ruta where id = v_item->>'pedido_id' and empresa_id = p_empresa_id for update;
      if not found then raise exception 'Uno de los pedidos ya no existe.'; end if;
      if v_ped.estado <> 'pendiente' then raise exception 'El pedido «%» ya está en otra ruta.', v_ped.titulo; end if;
      insert into public.transporte_viaje_paradas (
        viaje_id, empresa_id, secuencia, tipo, nombre, direccion, latitud, longitud, guia_remision_id,
        oc_transito_id, compra_gasto_id, documento_tipo, descripcion, pedido_id, ventana_inicio, ventana_fin)
      values (
        v.id, p_empresa_id, 900001 + coalesce(array_length(v_ids, 1), 0),
        case v_ped.accion when 'entregar' then 'entrega' else 'recojo' end,
        v_ped.lugar_nombre, v_ped.direccion, v_ped.latitud, v_ped.longitud, v_ped.guia_remision_id,
        v_ped.oc_transito_id, v_ped.compra_gasto_id, v_ped.documento_tipo,
        coalesce(v_ped.indicaciones, v_ped.titulo), v_ped.id, v_ped.ventana_inicio, v_ped.ventana_fin)
      returning id into v_id;
      update public.transporte_pedidos_ruta set estado = 'asignado', viaje_id = v.id, parada_id = v_id, updated_at = now() where id = v_ped.id;
      v_ids := v_ids || v_id;
    else
      if nullif(trim(v_item->>'nombre'), '') is null then raise exception 'Cada parada libre necesita un nombre.'; end if;
      insert into public.transporte_viaje_paradas (
        viaje_id, empresa_id, secuencia, tipo, nombre, direccion, latitud, longitud, documento_tipo, descripcion)
      values (
        v.id, p_empresa_id, 900001 + coalesce(array_length(v_ids, 1), 0),
        case v_item->>'accion' when 'recoger' then 'recojo' else 'entrega' end,
        trim(v_item->>'nombre'), nullif(trim(v_item->>'direccion'), ''),
        nullif(v_item->>'latitud', '')::numeric, nullif(v_item->>'longitud', '')::numeric,
        'libre', nullif(trim(v_item->>'descripcion'), ''))
      returning id into v_id;
      v_ids := v_ids || v_id;
    end if;
  end loop;

  for r in select * from public.transporte_viaje_paradas where viaje_id = v.id and not (id = any (v_ids)) loop
    if r.estado <> 'pendiente' or r.llegada_at is not null then
      raise exception 'No se puede quitar la parada «%»: ya fue atendida.', r.nombre;
    end if;
    update public.transporte_pedidos_ruta set estado = 'pendiente', viaje_id = null, parada_id = null, updated_at = now() where parada_id = r.id;
    delete from public.transporte_viaje_paradas where id = r.id;
  end loop;
  perform public.transporte__renumerar_paradas(v.id, v_ids);

  if p_programar and v.estado = 'borrador' then
    if v.vehiculo_id is null or v.conductor_id is null then
      raise exception 'Asigna unidad y conductor para programar la ruta.';
    end if;
    v := public.transporte_viaje_cambiar_estado(v.id, 'programado', 'Ruta programada');
  end if;
  if v_obs is not null then perform public.transporte__nota(v, 'Observación: ' || v_obs); end if;
  perform set_config('tms.rpc_logistica', v_prev, true);
  select * into v from public.transporte_viajes where id = v.id;
  return v;
end;
$function$;

-- Agrega pedidos a una ruta que ya salió (o a cualquiera no cerrada), al final.
create or replace function public.transporte_ruta_agregar_pedidos(p_viaje_id text, p_pedido_ids text[])
returns public.transporte_viajes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.transporte_viajes%rowtype;
  v_ped public.transporte_pedidos_ruta%rowtype;
  v_id text;
  v_seq integer;
  v_pid text;
begin
  select * into v from public.transporte_viajes where id = p_viaje_id for update;
  if not found then raise exception 'La ruta no existe.'; end if;
  if not (public.transporte_puede_logistica(v.empresa_id, 'editar') or public.transporte_puede_logistica(v.empresa_id, 'crear')) then
    raise exception 'No tienes permiso para armar rutas.' using errcode = '42501';
  end if;
  if v.tipo_viaje <> 'logistica' then raise exception 'Solo se agregan pedidos a rutas de logística propia.'; end if;
  perform set_config('tms.rpc_logistica', 'si', true);
  if v.estado not in ('borrador','programado','despachado','en_ruta','con_incidente') then
    raise exception 'La ruta ya terminó.';
  end if;
  foreach v_pid in array coalesce(p_pedido_ids, '{}') loop
    select * into v_ped from public.transporte_pedidos_ruta where id = v_pid and empresa_id = v.empresa_id for update;
    if not found then raise exception 'Uno de los pedidos ya no existe.'; end if;
    if v_ped.estado <> 'pendiente' then raise exception 'El pedido «%» ya está en otra ruta.', v_ped.titulo; end if;
    select coalesce(max(secuencia), 0) + 1 into v_seq from public.transporte_viaje_paradas where viaje_id = v.id;
    insert into public.transporte_viaje_paradas (
      viaje_id, empresa_id, secuencia, tipo, nombre, direccion, latitud, longitud, guia_remision_id,
      oc_transito_id, compra_gasto_id, documento_tipo, descripcion, pedido_id, ventana_inicio, ventana_fin)
    values (
      v.id, v.empresa_id, v_seq, case v_ped.accion when 'entregar' then 'entrega' else 'recojo' end,
      v_ped.lugar_nombre, v_ped.direccion, v_ped.latitud, v_ped.longitud, v_ped.guia_remision_id,
      v_ped.oc_transito_id, v_ped.compra_gasto_id, v_ped.documento_tipo,
      coalesce(v_ped.indicaciones, v_ped.titulo), v_ped.id, v_ped.ventana_inicio, v_ped.ventana_fin)
    returning id into v_id;
    update public.transporte_pedidos_ruta set estado = 'asignado', viaje_id = v.id, parada_id = v_id, updated_at = now() where id = v_ped.id;
    perform public.transporte__nota(v, format('Parada agregada: %s', v_ped.titulo));
  end loop;
  return v;
end;
$function$;

-- =========================================================================
-- 8. App del conductor
-- =========================================================================
create or replace function public.transporte__viaje_operable(p_viaje_id text)
returns public.transporte_viajes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.transporte_viajes%rowtype;
begin
  select * into v from public.transporte_viajes where id = p_viaje_id for update;
  if not found then raise exception 'El viaje no existe.'; end if;
  if not public.transporte__puede_operar_viaje(v) then
    raise exception 'No tienes permiso para registrar en este viaje.' using errcode = '42501';
  end if;
  -- Permisos ya validados: los triggers de viaje y paradas no vuelven a exigir transporte comercial.
  perform set_config('tms.rpc_logistica', 'si', true);
  return v;
end;
$function$;

-- Inspección antes de salir (servicio comercial).
-- p_datos: items [{texto, ok, critico, observacion}], requisitos [{texto, ok}], km_salida, foto_tablero_url.
create or replace function public.transporte_viaje_inspeccion_registrar(p_viaje_id text, p_datos jsonb)
returns public.transporte_viaje_inspecciones
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.transporte_viajes%rowtype;
  v_row public.transporte_viaje_inspecciones%rowtype;
  v_items jsonb := coalesce(p_datos->'items', '[]'::jsonb);
  v_criticos integer;
  v_observados integer;
begin
  v := public.transporte__viaje_operable(p_viaje_id);
  if v.tipo_viaje <> 'comercial' then raise exception 'La inspección es del servicio comercial.'; end if;
  if v.estado not in ('programado','despachado') then raise exception 'La inspección se hace antes de salir.'; end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then raise exception 'Revisa los puntos de la inspección.'; end if;
  if nullif(p_datos->>'km_salida', '') is null then raise exception 'Registra el km de salida.'; end if;
  select count(*) filter (where not coalesce((i->>'ok')::boolean, false) and coalesce((i->>'critico')::boolean, false)),
         count(*) filter (where not coalesce((i->>'ok')::boolean, false) and not coalesce((i->>'critico')::boolean, false))
    into v_criticos, v_observados
  from jsonb_array_elements(v_items) i;
  insert into public.transporte_viaje_inspecciones (empresa_id, viaje_id, items, requisitos, observados, criticos, km_salida, foto_tablero_url)
  values (v.empresa_id, v.id, v_items, coalesce(p_datos->'requisitos', '[]'::jsonb), v_observados, v_criticos,
    (p_datos->>'km_salida')::numeric, nullif(p_datos->>'foto_tablero_url', ''))
  on conflict (viaje_id) do update set items = excluded.items, requisitos = excluded.requisitos,
    observados = excluded.observados, criticos = excluded.criticos, km_salida = excluded.km_salida,
    foto_tablero_url = excluded.foto_tablero_url, autorizada_por = null, autorizada_at = null,
    registrado_por = auth.uid(), updated_at = now()
  returning * into v_row;
  if v_criticos > 0 then
    perform public.transporte__nota(v, format('Inspección: %s punto(s) crítico(s). La salida espera autorización del despachador.', v_criticos));
  elsif v_observados > 0 then
    perform public.transporte__nota(v, format('Inspección con %s punto(s) observado(s).', v_observados));
  else
    perform public.transporte__nota(v, 'Inspección sin observaciones.');
  end if;
  return v_row;
end;
$function$;

create or replace function public.transporte_viaje_autorizar_salida(p_viaje_id text, p_nota text)
returns public.transporte_viaje_inspecciones
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.transporte_viajes%rowtype; v_row public.transporte_viaje_inspecciones%rowtype;
begin
  select * into v from public.transporte_viajes where id = p_viaje_id;
  if not found then raise exception 'El viaje no existe.'; end if;
  if not (public.usuario_tiene_empresa(v.empresa_id) and public.usuario_puede(v.empresa_id, 'transporte_comercial', 'editar')) then
    raise exception 'Solo el despachador autoriza la salida.' using errcode = '42501';
  end if;
  if nullif(trim(p_nota), '') is null then raise exception 'Indica por qué autorizas la salida.'; end if;
  update public.transporte_viaje_inspecciones set autorizada_por = auth.uid(), autorizada_at = now(), updated_at = now()
  where viaje_id = v.id returning * into v_row;
  if not found then raise exception 'El viaje aún no tiene inspección.'; end if;
  perform public.transporte__nota(v, 'Salida autorizada: ' || trim(p_nota));
  return v_row;
end;
$function$;

-- Salida: logística (programado/despachado) o comercial (despachado + inspección).
create or replace function public.transporte_viaje_iniciar(p_viaje_id text, p_datos jsonb default '{}'::jsonb)
returns public.transporte_viajes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.transporte_viajes%rowtype;
  v_ins public.transporte_viaje_inspecciones%rowtype;
  v_km numeric := nullif(p_datos->>'km', '')::numeric;
begin
  v := public.transporte__viaje_operable(p_viaje_id);
  if v.tipo_viaje = 'comercial' then
    if v.estado <> 'despachado' then raise exception 'El despachador aún no despacha este viaje.'; end if;
    select * into v_ins from public.transporte_viaje_inspecciones where viaje_id = v.id;
    if not found then raise exception 'Completa la inspección antes de salir.'; end if;
    if v_ins.criticos > 0 and v_ins.autorizada_at is null then
      raise exception 'Hay puntos críticos en la inspección: espera la autorización del despachador.';
    end if;
    v_km := coalesce(v_km, v_ins.km_salida);
  elsif v.estado not in ('programado','despachado') then
    raise exception 'La ruta no está lista para salir.';
  end if;
  insert into public.transporte_viaje_hitos (empresa_id, viaje_id, hito, latitud, longitud, km)
  values (v.empresa_id, v.id, 'salida_base', nullif(p_datos->>'latitud', '')::numeric, nullif(p_datos->>'longitud', '')::numeric, v_km)
  on conflict (viaje_id, hito) do nothing;
  if v_km is not null and v.vehiculo_id is not null then
    insert into public.lecturas_flota (empresa_id, vehiculo_id, viaje_id, conductor_id, tipo_lectura, valor, unidad, foto_url, observaciones)
    values (v.empresa_id, v.vehiculo_id, v.id, v.conductor_id, 'odometro', v_km, 'km', nullif(p_datos->>'foto_url', ''), 'Salida');
  end if;
  return public.transporte_viaje_cambiar_estado(v.id, 'en_ruta', case v.tipo_viaje when 'comercial' then 'Salió de base' else 'Ruta iniciada' end);
end;
$function$;

-- Hitos del servicio comercial entre la salida y la entrega.
create or replace function public.transporte_viaje_hito_registrar(p_viaje_id text, p_hito text, p_datos jsonb default '{}'::jsonb)
returns public.transporte_viaje_hitos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.transporte_viajes%rowtype;
  v_row public.transporte_viaje_hitos%rowtype;
  v_previo text;
  v_lat numeric := nullif(p_datos->>'latitud', '')::numeric;
  v_lng numeric := nullif(p_datos->>'longitud', '')::numeric;
begin
  v := public.transporte__viaje_operable(p_viaje_id);
  if v.tipo_viaje <> 'comercial' then raise exception 'Los hitos son del servicio comercial.'; end if;
  if v.estado not in ('en_ruta','con_incidente') then raise exception 'El viaje no está en ruta.'; end if;
  v_previo := case p_hito
    when 'llegada_carga' then 'salida_base' when 'fin_carga' then 'llegada_carga'
    when 'llegada_destino' then 'fin_carga' when 'fin_descarga' then 'llegada_destino' end;
  if v_previo is null then raise exception 'Hito no válido.'; end if;
  if not exists (select 1 from public.transporte_viaje_hitos where viaje_id = v.id and hito = v_previo) then
    raise exception 'Registra antes el hito anterior.';
  end if;
  insert into public.transporte_viaje_hitos (empresa_id, viaje_id, hito, latitud, longitud, km, nota)
  values (v.empresa_id, v.id, p_hito, v_lat, v_lng, nullif(p_datos->>'km', '')::numeric, nullif(trim(p_datos->>'nota'), ''))
  on conflict (viaje_id, hito) do nothing
  returning * into v_row;
  if v_row.id is null then raise exception 'Ese hito ya está registrado.'; end if;
  -- La carga ocurre en la parada de origen y la descarga en la de destino.
  if p_hito = 'llegada_carga' then
    update public.transporte_viaje_paradas set llegada_at = coalesce(llegada_at, now())
    where viaje_id = v.id and tipo = 'origen' and estado = 'pendiente';
  elsif p_hito = 'fin_carga' then
    update public.transporte_viaje_paradas set estado = 'completada', salida_at = now(), completada_por = auth.uid(),
      latitud_evidencia = v_lat, longitud_evidencia = v_lng
    where viaje_id = v.id and tipo = 'origen' and estado = 'pendiente';
  elsif p_hito = 'llegada_destino' then
    update public.transporte_viaje_paradas set llegada_at = coalesce(llegada_at, now())
    where viaje_id = v.id and tipo = 'destino' and estado = 'pendiente';
  end if;
  return v_row;
end;
$function$;

create or replace function public.transporte_parada_llegada(p_parada_id text, p_datos jsonb default '{}'::jsonb)
returns public.transporte_viaje_paradas
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.transporte_viajes%rowtype; v_p public.transporte_viaje_paradas%rowtype;
begin
  select * into v_p from public.transporte_viaje_paradas where id = p_parada_id for update;
  if not found then raise exception 'La parada no existe.'; end if;
  v := public.transporte__viaje_operable(v_p.viaje_id);
  if v.estado not in ('en_ruta','con_incidente') then raise exception 'Inicia la ruta antes de marcar la llegada.'; end if;
  if v_p.estado <> 'pendiente' then raise exception 'La parada ya fue atendida.'; end if;
  update public.transporte_viaje_paradas set llegada_at = coalesce(llegada_at, now()),
    latitud_evidencia = coalesce(nullif(p_datos->>'latitud', '')::numeric, latitud_evidencia),
    longitud_evidencia = coalesce(nullif(p_datos->>'longitud', '')::numeric, longitud_evidencia)
  where id = v_p.id returning * into v_p;
  return v_p;
end;
$function$;

-- Cierra una parada con su constancia, o la omite (solo logística propia).
-- p_datos: omitir, recibe_nombre, recibe_dni, firma_url, foto_url, foto_carga_url, bultos_recibidos,
--          novedad, observaciones, latitud, longitud, km (km de llegada en la entrega comercial).
create or replace function public.transporte_parada_completar(p_parada_id text, p_datos jsonb)
returns public.transporte_viaje_paradas
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.transporte_viajes%rowtype;
  v_p public.transporte_viaje_paradas%rowtype;
  v_omitir boolean := coalesce((p_datos->>'omitir')::boolean, false);
  v_nombre text := nullif(trim(p_datos->>'recibe_nombre'), '');
  v_dni text := nullif(trim(p_datos->>'recibe_dni'), '');
  v_firma text := nullif(p_datos->>'firma_url', '');
  v_foto text := nullif(p_datos->>'foto_url', '');
  v_novedad text := nullif(p_datos->>'novedad', '');
  v_obs text := nullif(trim(p_datos->>'observaciones'), '');
  v_bultos numeric := nullif(p_datos->>'bultos_recibidos', '')::numeric;
  v_km numeric := nullif(p_datos->>'km', '')::numeric;
  v_lat numeric := nullif(p_datos->>'latitud', '')::numeric;
  v_lng numeric := nullif(p_datos->>'longitud', '')::numeric;
begin
  select * into v_p from public.transporte_viaje_paradas where id = p_parada_id for update;
  if not found then raise exception 'La parada no existe.'; end if;
  v := public.transporte__viaje_operable(v_p.viaje_id);
  if v.estado not in ('en_ruta','con_incidente') then raise exception 'Inicia la ruta antes de cerrar paradas.'; end if;
  if v_p.estado <> 'pendiente' then raise exception 'La parada ya fue atendida.'; end if;

  if v_omitir then
    if v.tipo_viaje = 'comercial' then raise exception 'En el servicio comercial no se omiten paradas: reporta un incidente.'; end if;
    if v_obs is null then raise exception 'Indica por qué se omite la parada.'; end if;
    update public.transporte_viaje_paradas set estado = 'omitida', salida_at = now(), observaciones = v_obs,
      completada_por = auth.uid(), latitud_evidencia = v_lat, longitud_evidencia = v_lng
    where id = v_p.id returning * into v_p;
    update public.transporte_pedidos_ruta set estado = 'pendiente', viaje_id = null, parada_id = null, updated_at = now()
    where parada_id = v_p.id;
    perform public.transporte__nota(v, format('Parada omitida: %s (%s)', v_p.nombre, v_obs));
    return v_p;
  end if;

  if v_nombre is null then raise exception 'Escribe el nombre de quien recibe o entrega.'; end if;
  if v_firma is null then raise exception 'Falta la firma.'; end if;
  if v.tipo_viaje = 'comercial' then
    if v_dni is null then raise exception 'Escribe el DNI de quien recibe.'; end if;
    if v_foto is null then raise exception 'Toma la foto de la guía firmada.'; end if;
    if v_bultos is null then raise exception 'Indica los bultos recibidos.'; end if;
    if v_novedad is null then raise exception 'Indica el estado de la carga.'; end if;
    if v_novedad <> 'conforme' and v_obs is null then raise exception 'Describe la novedad de la carga.'; end if;
    if v_p.tipo = 'destino' then
      if not exists (select 1 from public.transporte_viaje_hitos where viaje_id = v.id and hito = 'llegada_destino') then
        raise exception 'Marca primero la llegada al destino.';
      end if;
      if v_km is null then raise exception 'Registra el km de llegada.'; end if;
    end if;
  end if;

  update public.transporte_viaje_paradas set
    estado = 'completada', llegada_at = coalesce(llegada_at, now()), salida_at = now(),
    recibe_nombre = v_nombre, recibe_dni = v_dni, firma_url = v_firma, foto_url = coalesce(v_foto, foto_url),
    foto_carga_url = nullif(p_datos->>'foto_carga_url', ''), bultos_recibidos = v_bultos, novedad = v_novedad,
    observaciones = coalesce(v_obs, observaciones), latitud_evidencia = v_lat, longitud_evidencia = v_lng,
    completada_por = auth.uid()
  where id = v_p.id returning * into v_p;
  update public.transporte_pedidos_ruta set estado = 'completado', updated_at = now() where parada_id = v_p.id;

  if v.tipo_viaje = 'comercial' and v_p.tipo = 'destino' then
    insert into public.transporte_viaje_hitos (empresa_id, viaje_id, hito, latitud, longitud)
    values (v.empresa_id, v.id, 'fin_descarga', v_lat, v_lng) on conflict (viaje_id, hito) do nothing;
    insert into public.transporte_viaje_hitos (empresa_id, viaje_id, hito, latitud, longitud, km)
    values (v.empresa_id, v.id, 'entregado', v_lat, v_lng, v_km) on conflict (viaje_id, hito) do nothing;
    if v.vehiculo_id is not null then
      insert into public.lecturas_flota (empresa_id, vehiculo_id, viaje_id, viaje_parada_id, conductor_id, tipo_lectura, valor, unidad, observaciones)
      values (v.empresa_id, v.vehiculo_id, v.id, v_p.id, v.conductor_id, 'odometro', v_km, 'km', 'Llegada');
    end if;
    if not exists (select 1 from public.transporte_viaje_paradas where viaje_id = v.id and estado = 'pendiente') then
      perform public.transporte_viaje_cambiar_estado(v.id, 'entregado',
        format('Entregado con conformidad de %s (%s)', v_nombre,
          case v_novedad when 'conforme' then 'conforme' when 'faltante' then 'con faltante'
            when 'danio' then 'con daño' else 'con rechazo parcial' end));
    end if;
  end if;
  return v_p;
end;
$function$;

-- Termina la ruta de logística propia cuando no quedan paradas pendientes.
create or replace function public.transporte_viaje_terminar_logistica(p_viaje_id text, p_datos jsonb default '{}'::jsonb)
returns public.transporte_viajes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.transporte_viajes%rowtype; v_km numeric := nullif(p_datos->>'km', '')::numeric;
begin
  v := public.transporte__viaje_operable(p_viaje_id);
  if v.tipo_viaje <> 'logistica' then raise exception 'Solo para rutas de logística propia.'; end if;
  if v.estado not in ('en_ruta','con_incidente') then raise exception 'La ruta no está en curso.'; end if;
  if exists (select 1 from public.transporte_viaje_paradas where viaje_id = v.id and estado = 'pendiente') then
    raise exception 'Quedan paradas pendientes.';
  end if;
  if v_km is not null and v.vehiculo_id is not null then
    insert into public.lecturas_flota (empresa_id, vehiculo_id, viaje_id, conductor_id, tipo_lectura, valor, unidad, foto_url, observaciones)
    values (v.empresa_id, v.vehiculo_id, v.id, v.conductor_id, 'odometro', v_km, 'km', nullif(p_datos->>'foto_url', ''), 'Retorno');
  end if;
  insert into public.transporte_viaje_hitos (empresa_id, viaje_id, hito, km)
  values (v.empresa_id, v.id, 'entregado', v_km) on conflict (viaje_id, hito) do nothing;
  return public.transporte_viaje_cambiar_estado(v.id, 'entregado', 'Ruta terminada');
end;
$function$;

-- Parada libre que agrega el conductor durante una ruta de logística propia.
create or replace function public.transporte_parada_libre_agregar(p_viaje_id text, p_datos jsonb)
returns public.transporte_viaje_paradas
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.transporte_viajes%rowtype; v_p public.transporte_viaje_paradas%rowtype; v_seq integer;
begin
  v := public.transporte__viaje_operable(p_viaje_id);
  if v.tipo_viaje <> 'logistica' then raise exception 'En el servicio comercial la ruta es la contratada: reporta un incidente.'; end if;
  if v.estado not in ('programado','despachado','en_ruta','con_incidente') then raise exception 'La ruta ya terminó.'; end if;
  if nullif(trim(p_datos->>'descripcion'), '') is null then raise exception 'Describe la parada.'; end if;
  select coalesce(max(secuencia), 0) + 1 into v_seq from public.transporte_viaje_paradas where viaje_id = v.id;
  insert into public.transporte_viaje_paradas (viaje_id, empresa_id, secuencia, tipo, nombre, direccion, latitud, longitud,
    documento_tipo, descripcion, foto_url)
  values (v.id, v.empresa_id, v_seq, 'entrega',
    coalesce(nullif(trim(p_datos->>'nombre'), ''), left(trim(p_datos->>'descripcion'), 80)),
    nullif(trim(p_datos->>'direccion'), ''), nullif(p_datos->>'latitud', '')::numeric, nullif(p_datos->>'longitud', '')::numeric,
    'libre', trim(p_datos->>'descripcion'), nullif(p_datos->>'foto_url', ''))
  returning * into v_p;
  perform public.transporte__nota(v, 'El conductor agregó una parada: ' || v_p.nombre);
  return v_p;
end;
$function$;

-- Gasto en ruta (va a la liquidación del viaje).
create or replace function public.transporte_viaje_gasto_registrar(p_viaje_id text, p_datos jsonb)
returns public.transporte_viaje_gastos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.transporte_viajes%rowtype; v_row public.transporte_viaje_gastos%rowtype;
begin
  v := public.transporte__viaje_operable(p_viaje_id);
  if v.estado not in ('despachado','en_ruta','con_incidente','entregado') then raise exception 'El viaje no admite gastos en este estado.'; end if;
  if coalesce(nullif(p_datos->>'monto', '')::numeric, 0) <= 0 then raise exception 'Ingresa el monto.'; end if;
  if nullif(p_datos->>'foto_url', '') is null then raise exception 'Toma la foto del comprobante.'; end if;
  insert into public.transporte_viaje_gastos (empresa_id, viaje_id, tipo, monto, moneda, lugar, foto_url)
  values (v.empresa_id, v.id, coalesce(p_datos->>'tipo', 'otro'), round((p_datos->>'monto')::numeric, 2),
    coalesce(nullif(p_datos->>'moneda', ''), 'PEN'), nullif(trim(p_datos->>'lugar'), ''), p_datos->>'foto_url')
  returning * into v_row;
  return v_row;
end;
$function$;

-- Incidente: en el servicio comercial en ruta, el viaje pasa a «con incidente».
create or replace function public.transporte_viaje_incidente_reportar(p_viaje_id text, p_datos jsonb)
returns public.incidentes_flota
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.transporte_viajes%rowtype; v_row public.incidentes_flota%rowtype; v_parada text := nullif(p_datos->>'parada_id', '');
begin
  v := public.transporte__viaje_operable(p_viaje_id);
  if nullif(trim(p_datos->>'descripcion'), '') is null then raise exception 'Describe el incidente.'; end if;
  if v_parada is not null and not exists (select 1 from public.transporte_viaje_paradas where id = v_parada and viaje_id = v.id) then
    raise exception 'La parada no pertenece al viaje.';
  end if;
  insert into public.incidentes_flota (empresa_id, viaje_id, viaje_parada_id, vehiculo_id, conductor_id, tipo, severidad,
    descripcion, foto_url, latitud, longitud)
  values (v.empresa_id, v.id, v_parada, v.vehiculo_id, v.conductor_id, coalesce(p_datos->>'tipo', 'otro'),
    coalesce(p_datos->>'severidad', 'media'), trim(p_datos->>'descripcion'), nullif(p_datos->>'foto_url', ''),
    nullif(p_datos->>'latitud', '')::double precision, nullif(p_datos->>'longitud', '')::double precision)
  returning * into v_row;
  if v.tipo_viaje = 'comercial' and v.estado = 'en_ruta' then
    perform public.transporte_viaje_cambiar_estado(v.id, 'con_incidente', 'Incidente: ' || trim(p_datos->>'descripcion'));
  else
    perform public.transporte__nota(v, 'Incidente: ' || trim(p_datos->>'descripcion'));
  end if;
  return v_row;
end;
$function$;

-- Lectura de odómetro u horómetro durante el viaje.
create or replace function public.transporte_viaje_lectura_registrar(p_viaje_id text, p_datos jsonb)
returns public.lecturas_flota
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.transporte_viajes%rowtype; v_row public.lecturas_flota%rowtype;
begin
  v := public.transporte__viaje_operable(p_viaje_id);
  if v.vehiculo_id is null then raise exception 'El viaje no tiene unidad asignada.'; end if;
  if nullif(p_datos->>'valor', '') is null then raise exception 'Ingresa la lectura.'; end if;
  if nullif(p_datos->>'foto_url', '') is null then raise exception 'Toma la foto del tablero.'; end if;
  insert into public.lecturas_flota (empresa_id, vehiculo_id, viaje_id, viaje_parada_id, conductor_id, tipo_lectura, valor, unidad, foto_url, observaciones)
  values (v.empresa_id, v.vehiculo_id, v.id, nullif(p_datos->>'parada_id', ''), v.conductor_id,
    coalesce(p_datos->>'tipo_lectura', 'odometro'), (p_datos->>'valor')::numeric,
    coalesce(p_datos->>'unidad', 'km'), p_datos->>'foto_url', nullif(trim(p_datos->>'observaciones'), ''))
  returning * into v_row;
  return v_row;
end;
$function$;

-- Usuarios de la empresa que pueden vincularse a un conductor.
create or replace function public.transporte_usuarios_empresa(p_empresa_id text)
returns table (user_id uuid, nombre text, perfil text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select ue.user_id, coalesce(nullif(trim(u.nombre), ''), u.email, ue.user_id::text), ue.perfil_campo
  from public.usuarios_empresas ue
  left join public.usuarios u on u.id = ue.user_id::text
  where ue.empresa_id = p_empresa_id and ue.estado = 'activo'
    and public.usuario_tiene_empresa(p_empresa_id)
    and (public.usuario_puede(p_empresa_id, 'transporte_comercial', 'editar') or public.usuario_puede(p_empresa_id, 'ordenes_compra', 'editar'))
  order by 2
$function$;

-- =========================================================================
-- 9. Permisos de ejecución
-- =========================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'transporte_puede_logistica(text,text)', 'transporte_es_conductor(text,text)', 'transporte_puede_ver_viaje(text)',
    'transporte_pedido_ruta_crear(text,jsonb)', 'transporte_pedido_ruta_retirar(text)',
    'transporte_ruta_logistica_guardar(text,text,jsonb,jsonb,boolean)', 'transporte_ruta_agregar_pedidos(text,text[])',
    'transporte_viaje_inspeccion_registrar(text,jsonb)', 'transporte_viaje_autorizar_salida(text,text)',
    'transporte_viaje_iniciar(text,jsonb)', 'transporte_viaje_hito_registrar(text,text,jsonb)',
    'transporte_parada_llegada(text,jsonb)', 'transporte_parada_completar(text,jsonb)',
    'transporte_viaje_terminar_logistica(text,jsonb)', 'transporte_parada_libre_agregar(text,jsonb)',
    'transporte_viaje_gasto_registrar(text,jsonb)', 'transporte_viaje_incidente_reportar(text,jsonb)',
    'transporte_viaje_lectura_registrar(text,jsonb)', 'transporte_usuarios_empresa(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'transporte__puede_operar_viaje(public.transporte_viajes)', 'transporte__nota(public.transporte_viajes,text)',
    'transporte__renumerar_paradas(text,text[])', 'transporte__validar_recursos_logistica(text,text,text)',
    'transporte__viaje_operable(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

revoke all on table public.transporte_pedidos_ruta, public.transporte_viaje_hitos,
  public.transporte_viaje_inspecciones, public.transporte_viaje_gastos from anon;
revoke insert, update, delete on table public.transporte_pedidos_ruta, public.transporte_viaje_hitos,
  public.transporte_viaje_inspecciones, public.transporte_viaje_gastos from authenticated;
grant select on table public.transporte_pedidos_ruta, public.transporte_viaje_hitos,
  public.transporte_viaje_inspecciones, public.transporte_viaje_gastos to authenticated;

-- =========================================================================
-- 10. Migración de las rutas de logística propia (rutas / ruta_paradas)
--     Las tablas antiguas se conservan como historial; no se borran.
-- =========================================================================
do $$
declare r record; p record; v_id text; v_pid text; v_tipo_unidad text; v_nombre text;
begin
  perform set_config('tms.rpc_logistica', 'si', true);
  for r in select ru.* from public.rutas ru
           where not exists (select 1 from public.transporte_viajes v where v.legacy_ruta_id = ru.id)
           order by ru.empresa_id, ru.fecha, ru.codigo loop
    select coalesce(nullif(trim(tipo), ''), 'Unidad propia') into v_tipo_unidad
    from public.vehiculos_transporte where id = r.vehiculo_id and empresa_id = r.empresa_id;
    perform set_config('tms.nota_creacion', 'Migrada desde la ruta ' || r.codigo, true);
    insert into public.transporte_viajes (
      empresa_id, tipo_viaje, estado, motivo_cancelacion, origen_nombre, destino_nombre, tipo_unidad, modalidad, moneda,
      fecha_programada, hora_salida, vehiculo_id, conductor_id, transportista_id, observaciones, legacy_ruta_id, created_at)
    values (
      r.empresa_id, 'logistica',
      case r.estado when 'en_curso' then 'en_ruta' when 'completada' then 'entregado' when 'cancelada' then 'cancelado' else 'programado' end,
      case when r.estado = 'cancelada' then 'Cancelada en la ruta anterior' end,
      'Base', 'Base', coalesce(v_tipo_unidad, 'Unidad propia'), 'viaje', 'PEN',
      r.fecha, (r.hora_salida at time zone 'America/Lima')::time,
      (select id from public.vehiculos_transporte where id = r.vehiculo_id and empresa_id = r.empresa_id),
      (select id from public.conductores_transporte where id = r.conductor_id and empresa_id = r.empresa_id),
      (select id from public.transportistas where id = r.transportista_id and empresa_id = r.empresa_id),
      concat_ws(' · ', 'Ruta ' || r.codigo, nullif(trim(r.observaciones), '')), r.id, r.created_at)
    returning id into v_id;

    for p in select * from public.ruta_paradas where ruta_id = r.id order by secuencia loop
      v_nombre := case p.tipo_documento
        when 'orden_compra_transito' then (
          select coalesce(nullif(trim(pv.razon_social), ''), oc.codigo)
          from public.orden_compra_transitos t join public.ordenes_compra oc on oc.id = t.orden_compra_id
          left join public.proveedores pv on pv.id = oc.proveedor_id where t.id = p.documento_id)
        when 'guia_remision' then (
          select coalesce(nullif(trim(g.destinatario_razon_social), ''), g.numero_completo)
          from public.guias_remision g where g.id = p.documento_id)
        else nullif(left(trim(p.descripcion_libre), 80), '') end;
      insert into public.transporte_viaje_paradas (
        viaje_id, empresa_id, secuencia, tipo, nombre, direccion, latitud, longitud, guia_remision_id, oc_transito_id,
        compra_gasto_id, documento_tipo, descripcion, estado, observaciones, llegada_at, salida_at, firma_url, foto_url,
        latitud_evidencia, longitud_evidencia, legacy_parada_id, created_at)
      values (
        v_id, r.empresa_id, p.secuencia,
        case p.tipo_documento when 'orden_compra_transito' then 'recojo' else 'entrega' end,
        coalesce(v_nombre, case p.tipo_documento when 'orden_compra_transito' then 'Tránsito de OC'
          when 'guia_remision' then 'Guía de remisión' else 'Parada libre' end),
        coalesce(p.direccion_parada, (select g.llegada_direccion from public.guias_remision g where g.id = p.documento_id and p.tipo_documento = 'guia_remision')),
        p.latitud_parada, p.longitud_parada,
        (select g.id from public.guias_remision g where g.id = p.documento_id and p.tipo_documento = 'guia_remision'),
        (select t.id from public.orden_compra_transitos t where t.id = p.documento_id and p.tipo_documento = 'orden_compra_transito'),
        p.gasto_campo_id,
        case when p.gasto_campo_id is not null then 'compra_gasto' else p.tipo_documento end,
        p.descripcion_libre,
        case p.estado when 'en_curso' then 'pendiente' else p.estado end,
        p.observaciones, p.llegada_at, p.salida_at, p.firma_entrega_url, p.foto_entrega_url,
        p.latitud_entrega, p.longitud_entrega, p.id, p.created_at)
      returning id into v_pid;
      update public.lecturas_flota set viaje_id = v_id, viaje_parada_id = v_pid where parada_id = p.id;
      update public.incidentes_flota set viaje_id = v_id, viaje_parada_id = v_pid where parada_id = p.id;
    end loop;
    update public.lecturas_flota set viaje_id = v_id where ruta_id = r.id and viaje_id is null;
    update public.incidentes_flota set viaje_id = v_id where ruta_id = r.id and viaje_id is null;
  end loop;
  perform set_config('tms.nota_creacion', '', true);
  perform set_config('tms.rpc_logistica', '', true);
end $$;

-- =========================================================================
-- 11. Comprobación (revierte toda la migración si algo no cuadra)
-- =========================================================================
do $$
declare v_rutas integer; v_viajes integer; v_paradas_old integer; v_paradas_new integer; v_lec integer; v_inc integer;
begin
  select count(*) into v_rutas from public.rutas;
  select count(*) into v_viajes from public.transporte_viajes where legacy_ruta_id is not null;
  if v_rutas <> v_viajes then raise exception 'Migración de rutas incompleta: % rutas, % viajes.', v_rutas, v_viajes; end if;
  select count(*) into v_paradas_old from public.ruta_paradas;
  select count(*) into v_paradas_new from public.transporte_viaje_paradas where legacy_parada_id is not null;
  if v_paradas_old <> v_paradas_new then raise exception 'Migración de paradas incompleta: % y %.', v_paradas_old, v_paradas_new; end if;
  select count(*) into v_lec from public.lecturas_flota where ruta_id is not null and viaje_id is null;
  select count(*) into v_inc from public.incidentes_flota where ruta_id is not null and viaje_id is null;
  if v_lec + v_inc > 0 then raise exception 'Quedaron lecturas o incidentes sin viaje.'; end if;
  if exists (select 1 from public.transporte_viajes where tipo_viaje = 'comercial' and cuenta_id is null) then
    raise exception 'Hay viajes comerciales sin cuenta.';
  end if;
  if exists (select 1 from public.transporte_viajes v join public.rutas r on r.id = v.legacy_ruta_id where v.empresa_id <> r.empresa_id) then
    raise exception 'Un viaje migrado quedó en otra empresa.';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('transporte_ruta_logistica_guardar','transporte_parada_completar',
        'transporte_viaje_iniciar','transporte_pedido_ruta_crear','transporte_viaje_hito_registrar')) <> 5 then
    raise exception 'Faltan funciones de la Hoja de Ruta.';
  end if;
end $$;

