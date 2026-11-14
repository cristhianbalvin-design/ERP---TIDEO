-- Extensión aditiva: estado y prioridad históricos siguen disponibles para sus consumidores.
alter table public.backlog
  add column activo_id text references public.activos(id),
  add column sistema text,
  add column fuente text default 'manual' check (fuente in ('manual','diagnostico','parte_diario','pm','sos','inspeccion')),
  add column fuente_id text,
  add column impacto smallint check (impacto between 1 and 5),
  add column urgencia smallint check (urgencia between 1 and 5),
  add column puntaje smallint,
  add column prioridad_calculada text,
  add column costo_estimado numeric,
  add column moneda text,
  add column fecha_deteccion date,
  add column sociedad_id uuid references public.sociedades(id),
  add column ciclo text default 'nuevo' check (ciclo in ('nuevo','evaluado','pendiente_recursos','listo_para_ot','en_ot','cerrado','descartado')),
  add column ot_id text references public.ordenes_trabajo(id),
  add column motivo_descarte text,
  add column created_by uuid references auth.users(id);
create index conf_backlog_empresa_activo_idx on public.backlog (empresa_id, activo_id);

create function public.conf__backlog_puntaje() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.puntaje := new.impacto * new.urgencia;
  new.prioridad_calculada := case when new.puntaje is null then null when new.puntaje >= 20 then 'emergencia'
    when new.puntaje >= 12 then 'urgente' when new.puntaje >= 6 then 'programable' else 'baja' end;
  return new;
end $$;
create trigger conf_backlog_puntaje before insert or update on public.backlog for each row execute function public.conf__backlog_puntaje();

-- Los estados legados no documentados quedan en nuevo; no se modifica estado.
update public.backlog set ciclo = case lower(coalesce(estado,''))
  when 'cerrado' then 'cerrado' when 'cerrada' then 'cerrado'
  when 'descartado' then 'descartado' when 'descartada' then 'descartado'
  when 'en_ot' then 'en_ot' when 'evaluado' then 'evaluado'
  when 'pendiente_recursos' then 'pendiente_recursos' when 'listo_para_ot' then 'listo_para_ot'
  else 'nuevo' end where ciclo = 'nuevo';

create function public.conf__backlog_ot(p_ot public.ordenes_trabajo) returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if p_ot.backlog_id is null or p_ot.empresa_id is null then return; end if;
  update public.backlog set ot_id = p_ot.id, ciclo = case when p_ot.estado = 'cerrada' then 'cerrado' else 'en_ot' end, updated_at = now()
    where id = p_ot.backlog_id and empresa_id = p_ot.empresa_id
      and (ot_id is distinct from p_ot.id or ciclo is distinct from case when p_ot.estado = 'cerrada' then 'cerrado' else 'en_ot' end);
end $$;
create function public.conf__trigger_backlog_ot() returns trigger language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  begin
    perform public.conf__backlog_ot(new);
  exception when others then
    raise warning 'No se pudo sincronizar backlog para OT %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
create trigger conf_backlog_desde_ot after insert or update on public.ordenes_trabajo for each row execute function public.conf__trigger_backlog_ot();

-- Una OT existente por backlog: se elige la más reciente de la misma empresa.
do $$ declare r public.ordenes_trabajo; begin
  for r in select distinct on (empresa_id, backlog_id) * from public.ordenes_trabajo
    where backlog_id is not null order by empresa_id, backlog_id, created_at desc nulls last, id desc
  loop
    begin
      perform public.conf__backlog_ot(r);
    exception when others then
      raise warning 'Backfill de backlog para OT %: %', r.id, sqlerrm;
    end;
  end loop;
end $$;

create function public.conf_backlog_guardar(p_payload jsonb) returns text
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_id text := nullif(btrim(p_payload->>'id'),''); v_empresa text := nullif(btrim(p_payload->>'empresa_id'),'');
  v_old public.backlog; v_activo text; v_sociedad uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Datos inválidos'; end if;
  if v_id is null then
    perform public.flota__exigir(v_empresa, 'backlog', 'crear', 'No tiene permiso para crear backlog.');
    v_id := 'bl_' || replace(gen_random_uuid()::text,'-','');
  else
    select * into v_old from public.backlog where id = v_id for update;
    if not found then raise exception 'Backlog inexistente'; end if;
    if v_empresa is distinct from v_old.empresa_id then raise exception 'Empresa incompatible'; end if;
    perform public.flota__exigir(v_empresa, 'backlog', 'editar', 'No tiene permiso para editar backlog.');
  end if;
  v_activo := case when p_payload ? 'activo_id' then nullif(p_payload->>'activo_id','') else v_old.activo_id end;
  v_sociedad := case when p_payload ? 'sociedad_id' then nullif(p_payload->>'sociedad_id','')::uuid else v_old.sociedad_id end;
  if v_activo is not null and not exists (select 1 from public.activos where id = v_activo and empresa_id = v_empresa) then raise exception 'Activo ajeno o inexistente'; end if;
  if v_sociedad is not null and not exists (select 1 from public.sociedades where id = v_sociedad and empresa_id = v_empresa) then raise exception 'Sociedad ajena o inexistente'; end if;
  if v_old.id is null then
    if nullif(btrim(p_payload->>'descripcion'),'') is null then raise exception 'Descripción obligatoria'; end if;
    insert into public.backlog (id, empresa_id, descripcion, activo_id, sistema, fuente, fuente_id, impacto, urgencia, costo_estimado, moneda, fecha_deteccion, sociedad_id, created_by)
    values (v_id, v_empresa, btrim(p_payload->>'descripcion'), v_activo, nullif(p_payload->>'sistema',''), coalesce(nullif(p_payload->>'fuente',''),'manual'),
      nullif(p_payload->>'fuente_id',''), nullif(p_payload->>'impacto','')::smallint, nullif(p_payload->>'urgencia','')::smallint,
      nullif(p_payload->>'costo_estimado','')::numeric, nullif(p_payload->>'moneda',''), nullif(p_payload->>'fecha_deteccion','')::date, v_sociedad, auth.uid());
  else
    update public.backlog set
      descripcion = case when p_payload ? 'descripcion' then coalesce(nullif(btrim(p_payload->>'descripcion'),''), descripcion) else descripcion end,
      activo_id = v_activo, sociedad_id = v_sociedad,
      sistema = case when p_payload ? 'sistema' then nullif(p_payload->>'sistema','') else sistema end,
      fuente = case when p_payload ? 'fuente' then coalesce(nullif(p_payload->>'fuente',''),'manual') else fuente end,
      fuente_id = case when p_payload ? 'fuente_id' then nullif(p_payload->>'fuente_id','') else fuente_id end,
      impacto = case when p_payload ? 'impacto' then nullif(p_payload->>'impacto','')::smallint else impacto end,
      urgencia = case when p_payload ? 'urgencia' then nullif(p_payload->>'urgencia','')::smallint else urgencia end,
      costo_estimado = case when p_payload ? 'costo_estimado' then nullif(p_payload->>'costo_estimado','')::numeric else costo_estimado end,
      moneda = case when p_payload ? 'moneda' then nullif(p_payload->>'moneda','') else moneda end,
      fecha_deteccion = case when p_payload ? 'fecha_deteccion' then nullif(p_payload->>'fecha_deteccion','')::date else fecha_deteccion end,
      updated_at = now() where id = v_id and empresa_id = v_empresa;
  end if;
  return v_id;
end $$;

create function public.conf_backlog_cambiar_ciclo(p_id text, p_ciclo text, p_motivo text) returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v public.backlog;
begin
  select * into v from public.backlog where id = p_id for update;
  if not found then raise exception 'Backlog inexistente'; end if;
  perform public.flota__exigir(v.empresa_id, 'backlog', 'editar', 'No tiene permiso para cambiar el ciclo.');
  if p_ciclo is null or p_ciclo not in ('nuevo','evaluado','pendiente_recursos','listo_para_ot','en_ot','cerrado','descartado') then raise exception 'Ciclo inválido'; end if;
  if p_ciclo = 'descartado' and nullif(btrim(p_motivo),'') is null then raise exception 'Motivo obligatorio'; end if;
  update public.backlog set ciclo = p_ciclo, motivo_descarte = case when p_ciclo = 'descartado' then btrim(p_motivo) else null end, updated_at = now() where id = p_id;
end $$;

revoke all on function public.conf__backlog_puntaje(), public.conf__backlog_ot(public.ordenes_trabajo), public.conf__trigger_backlog_ot() from public, anon, authenticated;
revoke all on function public.conf_backlog_guardar(jsonb), public.conf_backlog_cambiar_ciclo(text,text,text) from public, anon;
grant execute on function public.conf_backlog_guardar(jsonb), public.conf_backlog_cambiar_ciclo(text,text,text) to authenticated;

do $$ declare n text; begin
  foreach n in array array['activo_id','sistema','fuente','fuente_id','impacto','urgencia','puntaje','prioridad_calculada','costo_estimado','moneda','fecha_deteccion','sociedad_id','ciclo','ot_id','motivo_descarte','created_by'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'backlog' and column_name = n) then raise exception 'Falta backlog.%', n; end if;
  end loop;
  foreach n in array array['conf__backlog_puntaje()','conf__backlog_ot(public.ordenes_trabajo)','conf__trigger_backlog_ot()','conf_backlog_guardar(jsonb)','conf_backlog_cambiar_ciclo(text,text,text)'] loop
    if to_regprocedure('public.' || n) is null then raise exception 'Falta función %', n; end if;
  end loop;
  if to_regclass('public.conf_backlog_empresa_activo_idx') is null then raise exception 'Falta índice backlog'; end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgname in ('conf_backlog_puntaje','conf_backlog_desde_ot')) <> 2 then raise exception 'Faltan triggers de backlog'; end if;
end $$;
