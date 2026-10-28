-- Viajes comerciales, paradas y trazabilidad de estados del TMS.
begin;

do $preflight$
begin
  if to_regclass('public.empresas') is null or to_regclass('public.cuentas') is null
     or to_regclass('public.os_clientes') is null or to_regclass('public.cotizaciones') is null
     or to_regclass('public.transporte_rutas') is null or to_regclass('public.transporte_tarifas') is null
     or to_regclass('public.guias_remision') is null or to_regclass('public.transportistas') is null
     or to_regclass('public.vehiculos_transporte') is null or to_regclass('public.conductores_transporte') is null then
    raise exception 'TMS_VIAJES_PREFLIGHT: falta una tabla de referencia requerida';
  end if;
  if to_regprocedure('public.usuario_tiene_empresa(text)') is null
     or to_regprocedure('public.usuario_puede(text,text,text)') is null then
    raise exception 'TMS_VIAJES_PREFLIGHT: faltan funciones de autorización';
  end if;
end
$preflight$;

create table if not exists public.transporte_viajes (
  id text primary key default ('tvj_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id) on delete restrict,
  sociedad_id uuid references public.sociedades(id) on delete restrict,
  codigo text not null,
  cuenta_id text not null references public.cuentas(id) on delete restrict,
  os_cliente_id text,
  cotizacion_id text references public.cotizaciones(id) on delete restrict,
  ruta_id text,
  origen_nombre text not null,
  destino_nombre text not null,
  distancia_km numeric(10,2),
  duracion_estimada_horas numeric(8,2),
  tipo_unidad text not null,
  modalidad text not null default 'viaje' check (modalidad in ('viaje','km','tonelada','hora')),
  carga_descripcion text,
  peso_toneladas numeric(12,3),
  volumen_m3 numeric(12,3),
  cantidad_facturable numeric(14,3),
  tarifa_id text,
  tarifa_unitaria numeric(14,4),
  moneda text not null default 'PEN' check (moneda in ('PEN','USD')),
  minimo_facturable numeric(14,2),
  ingreso_estimado numeric(14,2),
  fecha_programada timestamptz,
  transportista_id text references public.transportistas(id) on delete restrict,
  vehiculo_id text references public.vehiculos_transporte(id) on delete restrict,
  conductor_id text references public.conductores_transporte(id) on delete restrict,
  estado text not null default 'borrador' check (estado in ('borrador','programado','despachado','en_ruta','con_incidente','entregado','en_liquidacion','cerrado','cancelado')),
  motivo_cancelacion text,
  observaciones text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transporte_viajes_empresa_codigo_key unique (empresa_id,codigo),
  constraint transporte_viajes_empresa_id_id_key unique (empresa_id,id),
  constraint transporte_viajes_os_fk foreign key (os_cliente_id) references public.os_clientes(id) on delete restrict,
  constraint transporte_viajes_ruta_fk foreign key (ruta_id) references public.transporte_rutas(id) on delete restrict,
  constraint transporte_viajes_tarifa_fk foreign key (tarifa_id) references public.transporte_tarifas(id) on delete restrict,
  constraint transporte_viajes_distancia_chk check (distancia_km is null or distancia_km >= 0),
  constraint transporte_viajes_duracion_chk check (duracion_estimada_horas is null or duracion_estimada_horas >= 0),
  constraint transporte_viajes_peso_chk check (peso_toneladas is null or peso_toneladas >= 0),
  constraint transporte_viajes_volumen_chk check (volumen_m3 is null or volumen_m3 >= 0),
  constraint transporte_viajes_cantidad_chk check (cantidad_facturable is null or cantidad_facturable >= 0),
  constraint transporte_viajes_tarifa_unitaria_chk check (tarifa_unitaria is null or tarifa_unitaria >= 0),
  constraint transporte_viajes_minimo_chk check (minimo_facturable is null or minimo_facturable >= 0),
  constraint transporte_viajes_ingreso_chk check (ingreso_estimado is null or ingreso_estimado >= 0),
  constraint transporte_viajes_nombres_chk check (nullif(trim(origen_nombre),'') is not null and nullif(trim(destino_nombre),'') is not null),
  constraint transporte_viajes_unidad_chk check (nullif(trim(tipo_unidad),'') is not null),
  constraint transporte_viajes_cancelacion_chk check (estado <> 'cancelado' or nullif(trim(motivo_cancelacion),'') is not null)
);

create table if not exists public.transporte_viaje_paradas (
  id text primary key default ('tvp_' || replace(gen_random_uuid()::text, '-', '')),
  viaje_id text not null,
  empresa_id text not null references public.empresas(id) on delete restrict,
  secuencia integer not null,
  tipo text not null check (tipo in ('origen','recojo','entrega','destino')),
  nombre text not null,
  direccion text,
  latitud numeric(10,7),
  longitud numeric(10,7),
  guia_remision_id text references public.guias_remision(id) on delete restrict,
  estado text not null default 'pendiente' check (estado in ('pendiente','completada','omitida')),
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transporte_viaje_paradas_viaje_fk foreign key (empresa_id,viaje_id) references public.transporte_viajes(empresa_id,id) on delete cascade,
  constraint transporte_viaje_paradas_secuencia_key unique (viaje_id,secuencia),
  constraint transporte_viaje_paradas_secuencia_chk check (secuencia > 0),
  constraint transporte_viaje_paradas_latitud_chk check (latitud is null or latitud between -90 and 90),
  constraint transporte_viaje_paradas_longitud_chk check (longitud is null or longitud between -180 and 180),
  constraint transporte_viaje_paradas_nombre_chk check (nullif(trim(nombre),'') is not null)
);

create table if not exists public.transporte_viaje_eventos (
  id text primary key default ('tve_' || replace(gen_random_uuid()::text, '-', '')),
  viaje_id text not null,
  empresa_id text not null references public.empresas(id) on delete restrict,
  estado_anterior text,
  estado_nuevo text not null,
  nota text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint transporte_viaje_eventos_viaje_fk foreign key (empresa_id,viaje_id) references public.transporte_viajes(empresa_id,id) on delete cascade,
  constraint transporte_viaje_eventos_estado_chk check (estado_nuevo in ('borrador','programado','despachado','en_ruta','con_incidente','entregado','en_liquidacion','cerrado','cancelado'))
);

create index if not exists transporte_viajes_empresa_estado_idx on public.transporte_viajes(empresa_id,estado);
create index if not exists transporte_viajes_empresa_fecha_idx on public.transporte_viajes(empresa_id,fecha_programada);
create index if not exists transporte_viajes_cuenta_idx on public.transporte_viajes(cuenta_id);
create index if not exists transporte_viajes_os_cliente_idx on public.transporte_viajes(os_cliente_id);
create index if not exists transporte_viaje_paradas_empresa_viaje_idx on public.transporte_viaje_paradas(empresa_id,viaje_id,secuencia);
create index if not exists transporte_viaje_eventos_empresa_viaje_idx on public.transporte_viaje_eventos(empresa_id,viaje_id,created_at);

create or replace function public.transporte_viaje_transicion_permitida(p_anterior text,p_nuevo text)
returns boolean language sql immutable set search_path to 'public' as $body$
  select case p_anterior
    when 'borrador' then p_nuevo in ('programado','cancelado')
    when 'programado' then p_nuevo in ('despachado','borrador','cancelado')
    when 'despachado' then p_nuevo in ('en_ruta','cancelado')
    when 'en_ruta' then p_nuevo in ('con_incidente','entregado')
    when 'con_incidente' then p_nuevo in ('en_ruta','entregado')
    when 'entregado' then p_nuevo = 'en_liquidacion'
    when 'en_liquidacion' then p_nuevo in ('cerrado','entregado')
    else false end
$body$;

create or replace function public.transporte_viaje_preparar()
returns trigger language plpgsql security definer set search_path to 'public' as $body$
declare v_anio integer; v_numero bigint; v_recalcular_cantidad boolean; v_recalcular_ingreso boolean;
begin
  if not public.usuario_tiene_empresa(new.empresa_id)
     or (tg_op='INSERT' and not public.usuario_puede(new.empresa_id,'transporte_comercial','crear'))
     or (tg_op='UPDATE' and not public.usuario_puede(new.empresa_id,'transporte_comercial','editar')) then
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
  if new.cuenta_id is null or not exists (select 1 from public.cuentas c where c.id=new.cuenta_id and c.empresa_id=new.empresa_id) then
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
$body$;

create or replace function public.transporte_viaje_parada_updated_at()
returns trigger language plpgsql security definer set search_path to 'public' as $body$
begin
  if not public.usuario_tiene_empresa(new.empresa_id)
     or (tg_op='INSERT' and not (public.usuario_puede(new.empresa_id,'transporte_comercial','crear') or public.usuario_puede(new.empresa_id,'transporte_comercial','editar')))
     or (tg_op='UPDATE' and not public.usuario_puede(new.empresa_id,'transporte_comercial','editar')) then raise exception 'No tienes permiso para editar paradas de viaje.' using errcode='42501'; end if;
  if new.guia_remision_id is not null and not exists (select 1 from public.guias_remision g where g.id=new.guia_remision_id and g.empresa_id=new.empresa_id) then raise exception 'La guía de remisión debe pertenecer a la empresa de la parada.'; end if;
  new.updated_at:=now();
  return new;
end;
$body$;

create or replace function public.transporte_viaje_evento_inicial()
returns trigger language plpgsql security definer set search_path to 'public' as $body$
begin
  if not public.usuario_tiene_empresa(new.empresa_id) or not public.usuario_puede(new.empresa_id,'transporte_comercial','crear') then
    raise exception 'No tienes permiso para crear viajes.' using errcode='42501';
  end if;
  perform set_config('tms.escribiendo_evento','si',true);
  insert into public.transporte_viaje_eventos(viaje_id,empresa_id,estado_anterior,estado_nuevo,nota,created_by)
  values(new.id,new.empresa_id,null,new.estado,'Viaje creado',auth.uid());
  perform set_config('tms.escribiendo_evento','no',true);
  return new;
end;
$body$;

create or replace function public.transporte_viaje_evento_solo_funcion()
returns trigger language plpgsql security definer set search_path to 'public' as $body$
begin
  if current_setting('tms.escribiendo_evento',true) is distinct from 'si' then raise exception 'Los eventos de viaje solo se registran mediante funciones internas.' using errcode='42501'; end if;
  return new;
end;
$body$;

create or replace function public.transporte_viaje_cambiar_estado(p_viaje_id text,p_estado_nuevo text,p_nota text default null)
returns public.transporte_viajes language plpgsql security definer set search_path to 'public' as $body$
declare v_viaje public.transporte_viajes%rowtype; v_estado_anterior text;
begin
  select * into v_viaje from public.transporte_viajes where id=p_viaje_id for update;
  if not found then raise exception 'Viaje no encontrado.'; end if;
  if not public.usuario_tiene_empresa(v_viaje.empresa_id) or not public.usuario_puede(v_viaje.empresa_id,'transporte_comercial','editar') then raise exception 'No tienes permiso para cambiar el estado del viaje.' using errcode='42501'; end if;
  v_estado_anterior := v_viaje.estado;
  if p_estado_nuevo not in ('borrador','programado','despachado','en_ruta','con_incidente','entregado','en_liquidacion','cerrado','cancelado')
     or not public.transporte_viaje_transicion_permitida(v_viaje.estado,p_estado_nuevo) then raise exception 'Transición de estado no permitida: % -> %.',v_viaje.estado,p_estado_nuevo; end if;
  if p_estado_nuevo='cancelado' and nullif(trim(p_nota),'') is null then raise exception 'Se requiere motivo para cancelar el viaje.'; end if;
  perform set_config('tms.cambiando_estado','si',true);
  update public.transporte_viajes set estado=p_estado_nuevo,motivo_cancelacion=case when p_estado_nuevo='cancelado' then trim(p_nota) else motivo_cancelacion end where id=p_viaje_id returning * into v_viaje;
  perform set_config('tms.cambiando_estado','no',true);
  perform set_config('tms.escribiendo_evento','si',true);
  insert into public.transporte_viaje_eventos(viaje_id,empresa_id,estado_anterior,estado_nuevo,nota,created_by)
  values(v_viaje.id,v_viaje.empresa_id,v_estado_anterior,p_estado_nuevo,nullif(trim(p_nota),''),auth.uid());
  perform set_config('tms.escribiendo_evento','no',true);
  return v_viaje;
end;
$body$;

do $triggers$
begin
  if not exists (select 1 from pg_trigger where tgrelid='public.transporte_viajes'::regclass and tgname='transporte_viajes_preparar_trg' and not tgisinternal) then
    create trigger transporte_viajes_preparar_trg before insert or update on public.transporte_viajes for each row execute function public.transporte_viaje_preparar();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.transporte_viajes'::regclass and tgname='transporte_viajes_evento_inicial_trg' and not tgisinternal) then
    create trigger transporte_viajes_evento_inicial_trg after insert on public.transporte_viajes for each row execute function public.transporte_viaje_evento_inicial();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.transporte_viaje_paradas'::regclass and tgname='transporte_viaje_paradas_updated_at_trg' and not tgisinternal) then
    create trigger transporte_viaje_paradas_updated_at_trg before insert or update on public.transporte_viaje_paradas for each row execute function public.transporte_viaje_parada_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.transporte_viaje_eventos'::regclass and tgname='transporte_viaje_eventos_insercion_controlada_trg' and not tgisinternal) then
    create trigger transporte_viaje_eventos_insercion_controlada_trg before insert on public.transporte_viaje_eventos for each row execute function public.transporte_viaje_evento_solo_funcion();
  end if;
end
$triggers$;

alter table public.transporte_viajes enable row level security;
alter table public.transporte_viaje_paradas enable row level security;
alter table public.transporte_viaje_eventos enable row level security;

do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transporte_viajes' and policyname='transporte_viajes_select') then
    create policy transporte_viajes_select on public.transporte_viajes for select to authenticated using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','ver'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transporte_viajes' and policyname='transporte_viajes_insert') then
    create policy transporte_viajes_insert on public.transporte_viajes for insert to authenticated with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','crear'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transporte_viajes' and policyname='transporte_viajes_update') then
    create policy transporte_viajes_update on public.transporte_viajes for update to authenticated using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','editar'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transporte_viajes' and policyname='transporte_viajes_delete') then
    create policy transporte_viajes_delete on public.transporte_viajes for delete to authenticated using (estado='borrador' and public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','editar'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transporte_viaje_paradas' and policyname='transporte_viaje_paradas_select') then
    create policy transporte_viaje_paradas_select on public.transporte_viaje_paradas for select to authenticated using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','ver'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transporte_viaje_paradas' and policyname='transporte_viaje_paradas_insert') then
    create policy transporte_viaje_paradas_insert on public.transporte_viaje_paradas for insert to authenticated with check (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id,'transporte_comercial','crear') or public.usuario_puede(empresa_id,'transporte_comercial','editar')));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transporte_viaje_paradas' and policyname='transporte_viaje_paradas_update') then
    create policy transporte_viaje_paradas_update on public.transporte_viaje_paradas for update to authenticated using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','editar'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transporte_viaje_paradas' and policyname='transporte_viaje_paradas_delete') then
    create policy transporte_viaje_paradas_delete on public.transporte_viaje_paradas for delete to authenticated using (exists(select 1 from public.transporte_viajes v where v.id=transporte_viaje_paradas.viaje_id and v.empresa_id=transporte_viaje_paradas.empresa_id and v.estado='borrador') and public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','editar'));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='transporte_viaje_eventos' and policyname='transporte_viaje_eventos_select') then
    create policy transporte_viaje_eventos_select on public.transporte_viaje_eventos for select to authenticated using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','ver'));
  end if;
end
$policies$;

revoke all on function public.transporte_viaje_cambiar_estado(text,text,text) from public,anon;
grant execute on function public.transporte_viaje_cambiar_estado(text,text,text) to authenticated,service_role;

do $postflight$
declare v_tablas integer; v_politicas integer;
begin
  select count(*) into v_tablas from pg_tables where schemaname='public' and tablename in ('transporte_viajes','transporte_viaje_paradas','transporte_viaje_eventos');
  if v_tablas<>3 then raise exception 'TMS_VIAJES_POSTFLIGHT: faltan tablas'; end if;
  if to_regprocedure('public.transporte_viaje_cambiar_estado(text,text,text)') is null or to_regprocedure('public.transporte_viaje_transicion_permitida(text,text)') is null then raise exception 'TMS_VIAJES_POSTFLIGHT: faltan funciones'; end if;
  select count(*) into v_politicas from pg_policies where schemaname='public' and tablename in ('transporte_viajes','transporte_viaje_paradas','transporte_viaje_eventos');
  if v_politicas<9 then raise exception 'TMS_VIAJES_POSTFLIGHT: faltan políticas'; end if;
  if public.transporte_viaje_transicion_permitida('cerrado','programado') then raise exception 'TMS_VIAJES_POSTFLIGHT: se acepta una transición inválida'; end if;
end
$postflight$;

commit;
