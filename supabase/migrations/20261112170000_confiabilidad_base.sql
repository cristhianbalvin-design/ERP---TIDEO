-- Confiabilidad: eventos y lecturas. Una falla se agrupa por coalesce(ot_id,id::text);
-- si el grupo tiene partes de flota, su parada es la suma de esos partes;
-- en otro caso se toma la parada del evento OT o manual. Los KPI aplican esta regla.

create function public.conf_segmento_activo(p_activo_id text) returns text
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce((select case
    when a.propietario_tipo = 'cliente' then 'cliente'
    when exists (select 1 from public.planner_maquinas_taller m where m.activo_id = a.id and m.empresa_id = a.empresa_id) then 'taller'
    when exists (select 1 from public.contratos_alquiler_equipos c join public.contratos_alquiler ca on ca.id = c.contrato_alquiler_id where c.equipo_id = a.id and ca.empresa_id = a.empresa_id)
      or a.tipo_activo = 'maquinaria_completa' then 'flota'
    else 'otro' end from public.activos a where a.id = p_activo_id), 'otro');
$$;

create table public.conf_eventos_falla (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  sociedad_id uuid references public.sociedades(id),
  activo_id text not null references public.activos(id),
  origen text not null check (origen in ('ot','parte_flota','manual')),
  origen_id text not null,
  ot_id text references public.ordenes_trabajo(id),
  backlog_id text references public.backlog(id),
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz,
  horas_parada numeric,
  sistema text, modo_falla text, descripcion text,
  atribucion text check (atribucion is null or atribucion in ('proveedor','cliente','neutral')),
  estado text not null check (estado in ('abierta','cerrada','anulada')),
  motivo_anulacion text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (empresa_id, origen, origen_id),
  check (horas_parada is null or horas_parada >= 0),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);
create index conf_eventos_falla_empresa_activo_idx on public.conf_eventos_falla (empresa_id, activo_id);
create index conf_eventos_falla_empresa_ot_idx on public.conf_eventos_falla (empresa_id, ot_id);
alter table public.conf_eventos_falla enable row level security;
create policy conf_eventos_falla_select on public.conf_eventos_falla for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id));
revoke all on public.conf_eventos_falla from public, anon, authenticated;
grant select on public.conf_eventos_falla to authenticated;

-- Preserva la expresión vigente completa del CHECK, incluso valores añadidos por otras migraciones.
do $$
declare r record; v_expr text; v_invalid boolean; v_count integer := 0;
begin
  for r in select conname, pg_get_expr(conbin, conrelid) as expr from pg_constraint
    where conrelid = 'public.historial_lecturas_activo'::regclass and contype = 'c'
      and pg_get_expr(conbin, conrelid) ~ '\morigen\M'
  loop
    v_count := v_count + 1;
    v_expr := '(' || r.expr || ') or origen in (''parte_flota'',''reporte_mina'',''cierre_ot'',''manual_confiabilidad'')';
    if exists (select 1 from public.historial_lecturas_activo where origen is null) then
      raise exception 'Hay lecturas sin origen';
    end if;
    execute format('select exists (select 1 from public.historial_lecturas_activo where not (%s))', v_expr) into v_invalid;
    -- La comprobación se hace dinámicamente antes de sustituir el CHECK.
    if v_invalid then raise exception 'El CHECK ampliado excluiría lecturas existentes'; end if;
    execute format('alter table public.historial_lecturas_activo drop constraint %I', r.conname);
    execute format('alter table public.historial_lecturas_activo add constraint %I check (%s)', r.conname, v_expr);
  end loop;
  if v_count = 0 then raise exception 'No se encontró el CHECK de origen del historial'; end if;
end $$;

create function public.conf__registrar_lectura(p_empresa_id text, p_activo_id text, p_valor numeric, p_unidad text, p_origen text, p_origen_id text, p_fecha date)
returns void language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if p_empresa_id is null or p_activo_id is null or p_valor is null or p_valor < 0
     or p_unidad not in ('horas','km') or p_origen_id is null or p_fecha is null then return; end if;
  -- El bloqueo del activo serializa también el backfill y llamadas concurrentes.
  perform 1 from public.activos where id = p_activo_id and empresa_id = p_empresa_id for update;
  if not found then return; end if;
  if not exists (select 1 from public.historial_lecturas_activo where activo_id = p_activo_id and origen = p_origen and origen_id = p_origen_id) then
    insert into public.historial_lecturas_activo (empresa_id, activo_id, valor, unidad, origen, origen_id, fecha_lectura, registrado_por)
    values (p_empresa_id, p_activo_id, p_valor, p_unidad, p_origen, p_origen_id, p_fecha, auth.uid());
    update public.activos set horometro_actual = p_valor, updated_at = now()
      where id = p_activo_id and empresa_id = p_empresa_id and p_unidad = 'horas'
        and (horometro_actual is null or horometro_actual < p_valor);
  end if;
end $$;

create function public.conf__ot_evento(p_ot public.ordenes_trabajo) returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_inicio timestamptz; v_fin timestamptz;
begin
  if p_ot.tipo_trabajo is distinct from 'Correctivo' or p_ot.equipo_id is null
     or not exists (select 1 from public.activos where id = p_ot.equipo_id and empresa_id = p_ot.empresa_id) then
    update public.conf_eventos_falla set estado = 'anulada', motivo_anulacion = 'OT sin equipo o sin clasificación correctiva', updated_at = now()
      where empresa_id = p_ot.empresa_id and origen = 'ot' and origen_id = p_ot.id and estado <> 'anulada';
    return;
  end if;
  v_inicio := coalesce(p_ot.fecha_inicio_real, p_ot.created_at, now());
  if p_ot.estado = 'cerrada' then
    select ct.fecha_cierre::timestamptz into v_fin from public.cierres_tecnicos ct
      where ct.orden_trabajo_id = p_ot.id and ct.empresa_id = p_ot.empresa_id order by ct.created_at desc limit 1;
    v_fin := greatest(v_inicio, coalesce(v_fin, p_ot.updated_at, now()));
  end if;
  insert into public.conf_eventos_falla (empresa_id, sociedad_id, activo_id, origen, origen_id, ot_id, backlog_id, fecha_inicio, fecha_fin, horas_parada, descripcion, estado)
  values (p_ot.empresa_id, p_ot.sociedad_id, p_ot.equipo_id, 'ot', p_ot.id, p_ot.id,
    (select b.id from public.backlog b where b.id = p_ot.backlog_id and b.empresa_id = p_ot.empresa_id), v_inicio, v_fin,
    case when v_fin is not null then extract(epoch from (v_fin-v_inicio))/3600 end, p_ot.descripcion, case when v_fin is null then 'abierta' else 'cerrada' end)
  on conflict (empresa_id, origen, origen_id) do update set sociedad_id = excluded.sociedad_id, activo_id = excluded.activo_id,
    backlog_id = excluded.backlog_id, fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin,
    horas_parada = excluded.horas_parada, descripcion = excluded.descripcion,
    estado = case when conf_eventos_falla.estado = 'anulada' then 'anulada' else excluded.estado end, updated_at = now();
end $$;

create function public.conf__flota_eventos(p_parte public.flota_partes_equipo) returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare r record; v_causa text; v_horas numeric; v_ids text[] := array[]::text[];
begin
  if p_parte.empresa_id is null or p_parte.activo_id is null or p_parte.fecha is null then return; end if;
  if not exists (select 1 from public.activos where id = p_parte.activo_id and empresa_id = p_parte.empresa_id) then return; end if;
  for r in select value, ordinality - 1 as idx from jsonb_array_elements(case when jsonb_typeof(p_parte.paradas) = 'array' then p_parte.paradas else '[]'::jsonb end) with ordinality loop
    v_causa := translate(lower(coalesce(r.value->>'causa','')), 'áéíóúüñ', 'aeiouun');
    if lower(coalesce(r.value->>'atribucion','')) <> 'proveedor' or v_causa not in ('falla_mecanica','mant_correctivo','falla mecanica','mantenimiento correctivo') then continue; end if;
    if length(coalesce(r.value->>'horas','')) > 1000 or coalesce(r.value->>'horas','') !~ '^[0-9]+([.][0-9]+)?$' then continue; end if;
    v_horas := (r.value->>'horas')::numeric;
    v_ids := array_append(v_ids, p_parte.id::text || ':' || r.idx::text);
    insert into public.conf_eventos_falla (empresa_id, sociedad_id, activo_id, origen, origen_id, fecha_inicio, fecha_fin, horas_parada, modo_falla, descripcion, atribucion, estado, motivo_anulacion, created_by)
    values (p_parte.empresa_id, p_parte.sociedad_id, p_parte.activo_id, 'parte_flota', p_parte.id::text || ':' || r.idx::text,
      p_parte.fecha::timestamptz, p_parte.fecha::timestamptz, v_horas, r.value->>'causa', r.value->>'descripcion', 'proveedor',
      case when p_parte.estado = 'anulado' then 'anulada' else 'cerrada' end, p_parte.anulado_motivo,
      (select u.id from auth.users u where u.id = p_parte.created_by))
    on conflict (empresa_id, origen, origen_id) do update set sociedad_id = excluded.sociedad_id, activo_id = excluded.activo_id,
      fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, horas_parada = excluded.horas_parada,
      modo_falla = excluded.modo_falla, descripcion = excluded.descripcion, atribucion = excluded.atribucion,
      estado = case when conf_eventos_falla.estado = 'anulada' and conf_eventos_falla.motivo_anulacion is distinct from 'Parada retirada del parte' then 'anulada' else excluded.estado end,
      motivo_anulacion = case when conf_eventos_falla.estado = 'anulada' and conf_eventos_falla.motivo_anulacion is distinct from 'Parada retirada del parte' then conf_eventos_falla.motivo_anulacion else excluded.motivo_anulacion end, updated_at = now();
  end loop;
  update public.conf_eventos_falla set estado = 'anulada', motivo_anulacion = coalesce(p_parte.anulado_motivo, 'Parada retirada del parte'), updated_at = now()
    where empresa_id = p_parte.empresa_id and origen = 'parte_flota' and split_part(origen_id, ':', 1) = p_parte.id::text
      and (p_parte.estado = 'anulado' or not (origen_id = any(v_ids))) and estado <> 'anulada';
end $$;

create function public.conf__trigger_ot() returns trigger language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  begin
    perform public.conf__ot_evento(new);
  exception when others then
    raise warning 'No se pudo registrar evento para OT %: %', new.id, sqlerrm;
  end;
  if new.estado = 'cerrada' then
    begin
      perform public.conf__registrar_lectura(new.empresa_id, new.equipo_id, new.horometro_actual, 'horas', 'cierre_ot', new.id, coalesce(new.updated_at::date, current_date));
    exception when others then
      raise warning 'No se pudo registrar lectura para OT %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;
create trigger conf_ot_alimentar after insert or update on public.ordenes_trabajo for each row execute function public.conf__trigger_ot();

create function public.conf__trigger_flota() returns trigger language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  begin
    perform public.conf__flota_eventos(new);
  exception when others then
    raise warning 'No se pudieron registrar eventos para parte de flota %: %', new.id, sqlerrm;
  end;
  if new.estado <> 'anulado' then
    begin
      perform public.conf__registrar_lectura(new.empresa_id, new.activo_id, new.horometro_fin, 'horas', 'parte_flota', new.id::text, new.fecha);
    exception when others then
      raise warning 'No se pudo registrar lectura para parte de flota %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;
create trigger conf_flota_alimentar after insert or update on public.flota_partes_equipo for each row execute function public.conf__trigger_flota();

create function public.conf__parte_lectura(p_parte public.partes_diarios) returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_activo text; v_texto text;
begin
  v_texto := p_parte.datos_mina->'horometros'->'motor'->>'final';
  if length(coalesce(v_texto,'')) > 1000 or coalesce(v_texto,'') !~ '^[0-9]+([.][0-9]+)?$' then return; end if;
  select equipo_id into v_activo from public.ordenes_trabajo where id = p_parte.orden_trabajo_id and empresa_id = p_parte.empresa_id;
  perform public.conf__registrar_lectura(p_parte.empresa_id, v_activo, v_texto::numeric, 'horas', 'reporte_mina', p_parte.id, p_parte.fecha);
end $$;
create function public.conf__trigger_parte() returns trigger language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  begin
    perform public.conf__parte_lectura(new);
  exception when others then
    raise warning 'No se pudo registrar lectura para parte diario %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
create trigger conf_parte_lectura after insert or update on public.partes_diarios for each row execute function public.conf__trigger_parte();

create function public.conf_registrar_falla(p_empresa_id text, p_activo_id text, p_fecha_inicio timestamptz, p_fecha_fin timestamptz, p_sistema text, p_modo_falla text, p_descripcion text)
returns uuid language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_id uuid := gen_random_uuid();
begin
  perform public.flota__exigir(p_empresa_id, 'backlog', 'crear', 'No tiene permiso para registrar fallas.');
  if not exists (select 1 from public.activos where id = p_activo_id and empresa_id = p_empresa_id) then raise exception 'Activo ajeno o inexistente'; end if;
  if p_fecha_inicio is null or (p_fecha_fin is not null and p_fecha_fin < p_fecha_inicio) then raise exception 'Fechas de falla inválidas'; end if;
  insert into public.conf_eventos_falla (id, empresa_id, activo_id, origen, origen_id, fecha_inicio, fecha_fin, horas_parada, sistema, modo_falla, descripcion, estado, created_by)
  values (v_id, p_empresa_id, p_activo_id, 'manual', v_id::text, p_fecha_inicio, p_fecha_fin,
    case when p_fecha_fin is not null then extract(epoch from (p_fecha_fin-p_fecha_inicio))/3600 end, p_sistema, p_modo_falla, p_descripcion,
    case when p_fecha_fin is null then 'abierta' else 'cerrada' end, auth.uid());
  return v_id;
end $$;
create function public.conf_cerrar_falla(p_id uuid, p_fecha_fin timestamptz) returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v public.conf_eventos_falla;
begin
  select * into v from public.conf_eventos_falla where id = p_id for update;
  if not found then raise exception 'Falla inexistente'; end if;
  perform public.flota__exigir(v.empresa_id, 'backlog', 'editar', 'No tiene permiso para cerrar fallas.');
  if v.estado = 'anulada' or p_fecha_fin is null or p_fecha_fin < v.fecha_inicio then raise exception 'Cierre inválido'; end if;
  update public.conf_eventos_falla set fecha_fin = p_fecha_fin, horas_parada = extract(epoch from (p_fecha_fin-fecha_inicio))/3600, estado = 'cerrada', updated_at = now() where id = p_id;
end $$;
create function public.conf_vincular_falla_ot(p_id uuid, p_ot_id text) returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v public.conf_eventos_falla;
begin
  select * into v from public.conf_eventos_falla where id = p_id for update;
  if not found then raise exception 'Falla inexistente'; end if;
  perform public.flota__exigir(v.empresa_id, 'backlog', 'editar', 'No tiene permiso para vincular fallas.');
  if v.origen = 'ot' then raise exception 'No se puede desvincular el evento de su OT de origen'; end if;
  if p_ot_id is not null and not exists (select 1 from public.ordenes_trabajo where id = p_ot_id and empresa_id = v.empresa_id and equipo_id = v.activo_id) then raise exception 'OT ajena o de otro activo'; end if;
  update public.conf_eventos_falla set ot_id = p_ot_id, updated_at = now() where id = p_id;
end $$;
create function public.conf_anular_falla(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v public.conf_eventos_falla;
begin
  select * into v from public.conf_eventos_falla where id = p_id for update;
  if not found then raise exception 'Falla inexistente'; end if;
  perform public.flota__exigir(v.empresa_id, 'backlog', 'editar', 'No tiene permiso para anular fallas.');
  if nullif(btrim(p_motivo),'') is null then raise exception 'Motivo obligatorio'; end if;
  update public.conf_eventos_falla set estado = 'anulada', motivo_anulacion = btrim(p_motivo), updated_at = now() where id = p_id;
end $$;

revoke all on function public.conf__registrar_lectura(text,text,numeric,text,text,text,date), public.conf__ot_evento(public.ordenes_trabajo), public.conf__flota_eventos(public.flota_partes_equipo), public.conf__parte_lectura(public.partes_diarios), public.conf__trigger_ot(), public.conf__trigger_flota(), public.conf__trigger_parte() from public, anon, authenticated;
revoke all on function public.conf_segmento_activo(text), public.conf_registrar_falla(text,text,timestamptz,timestamptz,text,text,text), public.conf_cerrar_falla(uuid,timestamptz), public.conf_vincular_falla_ot(uuid,text), public.conf_anular_falla(uuid,text) from public, anon;
grant execute on function public.conf_segmento_activo(text), public.conf_registrar_falla(text,text,timestamptz,timestamptz,text,text,text), public.conf_cerrar_falla(uuid,timestamptz), public.conf_vincular_falla_ot(uuid,text), public.conf_anular_falla(uuid,text) to authenticated;

-- Las mismas rutinas de los triggers hacen que el backfill sea repetible.
do $$ declare r public.ordenes_trabajo; f public.flota_partes_equipo; d public.partes_diarios; begin
  for r in select * from public.ordenes_trabajo loop
    begin
      perform public.conf__ot_evento(r);
    exception when others then
      raise warning 'Backfill de evento para OT %: %', r.id, sqlerrm;
    end;
    if r.estado = 'cerrada' then
      begin
        perform public.conf__registrar_lectura(r.empresa_id, r.equipo_id, r.horometro_actual, 'horas', 'cierre_ot', r.id, coalesce(r.updated_at::date, current_date));
      exception when others then
        raise warning 'Backfill de lectura para OT %: %', r.id, sqlerrm;
      end;
    end if;
  end loop;
  for f in select * from public.flota_partes_equipo loop
    begin
      perform public.conf__flota_eventos(f);
    exception when others then
      raise warning 'Backfill de eventos para parte de flota %: %', f.id, sqlerrm;
    end;
    if f.estado <> 'anulado' then
      begin
        perform public.conf__registrar_lectura(f.empresa_id, f.activo_id, f.horometro_fin, 'horas', 'parte_flota', f.id::text, f.fecha);
      exception when others then
        raise warning 'Backfill de lectura para parte de flota %: %', f.id, sqlerrm;
      end;
    end if;
  end loop;
  for d in select * from public.partes_diarios loop
    begin
      perform public.conf__parte_lectura(d);
    exception when others then
      raise warning 'Backfill de lectura para parte diario %: %', d.id, sqlerrm;
    end;
  end loop;
end $$;

do $$ declare n text; begin
  if to_regclass('public.conf_eventos_falla') is null or to_regclass('public.conf_eventos_falla_empresa_activo_idx') is null or to_regclass('public.conf_eventos_falla_empresa_ot_idx') is null then raise exception 'Faltan tabla o índices de confiabilidad'; end if;
  foreach n in array array['conf_segmento_activo(text)','conf__registrar_lectura(text,text,numeric,text,text,text,date)','conf__ot_evento(public.ordenes_trabajo)','conf__flota_eventos(public.flota_partes_equipo)','conf__parte_lectura(public.partes_diarios)','conf__trigger_ot()','conf__trigger_flota()','conf__trigger_parte()','conf_registrar_falla(text,text,timestamptz,timestamptz,text,text,text)','conf_cerrar_falla(uuid,timestamptz)','conf_vincular_falla_ot(uuid,text)','conf_anular_falla(uuid,text)'] loop
    if to_regprocedure('public.' || n) is null then raise exception 'Falta función %', n; end if;
  end loop;
  if (select count(*) from pg_trigger where not tgisinternal and tgname in ('conf_ot_alimentar','conf_flota_alimentar','conf_parte_lectura')) <> 3 then raise exception 'Faltan triggers de confiabilidad'; end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conf_eventos_falla' and policyname = 'conf_eventos_falla_select') then raise exception 'Falta política de confiabilidad'; end if;
end $$;
