-- Programacion preventiva. Las escrituras de usuario se realizan por RPC.
create table public.conf_pm_planes (
  id uuid primary key default gen_random_uuid(), empresa_id text not null references public.empresas(id),
  nombre text not null, alcance text not null check (alcance in ('modelo','activo')),
  marca text, modelo text, activo_id text references public.activos(id),
  intervalo_horas numeric check (intervalo_horas > 0), intervalo_dias integer check (intervalo_dias > 0),
  tolerancia_pct numeric not null default 10 check (tolerancia_pct between 0 and 100),
  tareas jsonb not null default '[]'::jsonb check (jsonb_typeof(tareas) = 'array'),
  vigente boolean not null default true, created_by uuid default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (intervalo_horas is not null or intervalo_dias is not null),
  check ((alcance = 'activo' and activo_id is not null) or (alcance = 'modelo' and marca is not null and modelo is not null))
);
create table public.conf_pm_programas (
  id uuid primary key default gen_random_uuid(), empresa_id text not null references public.empresas(id),
  plan_id uuid not null references public.conf_pm_planes(id), activo_id text not null references public.activos(id),
  horometro_ultimo numeric, fecha_ultimo date, ot_activa_id text references public.ordenes_trabajo(id),
  vigente boolean not null default true, unique(plan_id, activo_id)
);
create table public.conf_pm_ejecuciones (
  id uuid primary key default gen_random_uuid(), empresa_id text not null references public.empresas(id),
  programa_id uuid not null references public.conf_pm_programas(id), fecha date not null,
  horometro numeric, ot_id text references public.ordenes_trabajo(id),
  origen text not null check (origen in ('ot','manual')), costo numeric, observacion text,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create unique index conf_pm_ejecuciones_ot_uq on public.conf_pm_ejecuciones(ot_id) where origen = 'ot' and ot_id is not null;
create index conf_pm_planes_empresa_idx on public.conf_pm_planes(empresa_id);
create index conf_pm_programas_empresa_activo_idx on public.conf_pm_programas(empresa_id, activo_id);
create index conf_pm_ejecuciones_empresa_programa_idx on public.conf_pm_ejecuciones(empresa_id, programa_id);
alter table public.ordenes_trabajo add column pm_programa_id uuid references public.conf_pm_programas(id);
create index ordenes_trabajo_pm_programa_idx on public.ordenes_trabajo(pm_programa_id);

alter table public.conf_pm_planes enable row level security;
alter table public.conf_pm_programas enable row level security;
alter table public.conf_pm_ejecuciones enable row level security;
create policy conf_pm_planes_select on public.conf_pm_planes for select to authenticated using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'programacion_pm','ver'));
create policy conf_pm_programas_select on public.conf_pm_programas for select to authenticated using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'programacion_pm','ver'));
create policy conf_pm_ejecuciones_select on public.conf_pm_ejecuciones for select to authenticated using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'programacion_pm','ver'));
grant select on public.conf_pm_planes, public.conf_pm_programas, public.conf_pm_ejecuciones to authenticated;

create function public.conf_pm_guardar_plan(p_payload jsonb) returns uuid
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_id uuid := nullif(p_payload->>'id','')::uuid; v_empresa text := p_payload->>'empresa_id'; v_plan public.conf_pm_planes;
begin
  perform public.flota__exigir(v_empresa,'programacion_pm',case when v_id is null then 'crear' else 'editar' end,'Sin permiso para guardar planes PM.');
  if jsonb_typeof(coalesce(p_payload->'tareas','[]'::jsonb)) <> 'array' or exists (select 1 from jsonb_array_elements(coalesce(p_payload->'tareas','[]'::jsonb)) x where jsonb_typeof(x) <> 'string') then
    raise exception 'Las tareas deben ser un arreglo de textos.' using errcode='22023';
  end if;
  if p_payload->>'alcance' = 'activo' and not exists (select 1 from public.activos where id = p_payload->>'activo_id' and empresa_id = v_empresa) then
    raise exception 'Activo fuera de la empresa.' using errcode='22023';
  end if;
  if v_id is null then
    insert into public.conf_pm_planes(empresa_id,nombre,alcance,marca,modelo,activo_id,intervalo_horas,intervalo_dias,tolerancia_pct,tareas,vigente)
    values(v_empresa, nullif(btrim(p_payload->>'nombre'),''), p_payload->>'alcance', nullif(btrim(p_payload->>'marca'),''), nullif(btrim(p_payload->>'modelo'),''), nullif(p_payload->>'activo_id',''), nullif(p_payload->>'intervalo_horas','')::numeric, nullif(p_payload->>'intervalo_dias','')::integer, coalesce(nullif(p_payload->>'tolerancia_pct','')::numeric,10), coalesce(p_payload->'tareas','[]'::jsonb), coalesce((p_payload->>'vigente')::boolean,true)) returning * into v_plan;
  else
    update public.conf_pm_planes set nombre=nullif(btrim(p_payload->>'nombre'),''), alcance=p_payload->>'alcance', marca=nullif(btrim(p_payload->>'marca'),''), modelo=nullif(btrim(p_payload->>'modelo'),''), activo_id=nullif(p_payload->>'activo_id',''), intervalo_horas=nullif(p_payload->>'intervalo_horas','')::numeric, intervalo_dias=nullif(p_payload->>'intervalo_dias','')::integer, tolerancia_pct=coalesce(nullif(p_payload->>'tolerancia_pct','')::numeric,10), tareas=coalesce(p_payload->'tareas','[]'::jsonb), vigente=coalesce((p_payload->>'vigente')::boolean,true), updated_at=now()
    where id=v_id and empresa_id=v_empresa returning * into v_plan;
    if not found then raise exception 'Plan inexistente.' using errcode='22023'; end if;
  end if;
  update public.conf_pm_programas set vigente=false where plan_id=v_plan.id and empresa_id=v_empresa;
  insert into public.conf_pm_programas(empresa_id,plan_id,activo_id,vigente)
  select v_empresa,v_plan.id,a.id,v_plan.vigente from public.activos a
  where a.empresa_id=v_empresa and ((v_plan.alcance='activo' and a.id=v_plan.activo_id) or (v_plan.alcance='modelo' and lower(btrim(a.marca))=lower(v_plan.marca) and lower(btrim(a.modelo))=lower(v_plan.modelo)))
  on conflict (plan_id,activo_id) do update set vigente=excluded.vigente;
  return v_plan.id;
end $$;

create function public.conf_pm_registrar_ejecucion(p_programa_id uuid,p_fecha date,p_horometro numeric,p_observacion text) returns uuid
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_p public.conf_pm_programas; v_id uuid;
begin
  select * into v_p from public.conf_pm_programas where id=p_programa_id for update;
  if not found then raise exception 'Programa inexistente.'; end if;
  perform public.flota__exigir(v_p.empresa_id,'programacion_pm','crear','Sin permiso para registrar ejecuciones PM.');
  if p_fecha is null or p_horometro < 0 then raise exception 'Fecha u horometro invalido.' using errcode='22023'; end if;
  insert into public.conf_pm_ejecuciones(empresa_id,programa_id,fecha,horometro,origen,observacion) values(v_p.empresa_id,v_p.id,p_fecha,p_horometro,'manual',p_observacion) returning id into v_id;
  if v_p.fecha_ultimo is null or p_fecha >= v_p.fecha_ultimo then update public.conf_pm_programas set fecha_ultimo=p_fecha, horometro_ultimo=p_horometro where id=v_p.id; end if;
  return v_id;
end $$;

-- El trigger no actualiza OT y no interrumpe su guardado si faltan datos.
create function public.conf_pm__ot() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_p public.conf_pm_programas; v_h numeric; v_fecha date;
begin
  if tg_op='UPDATE' and old.pm_programa_id is distinct from new.pm_programa_id then
    update public.conf_pm_programas set ot_activa_id=null where id=old.pm_programa_id and ot_activa_id=old.id and empresa_id=old.empresa_id;
  end if;
  if new.pm_programa_id is null then return new; end if;
  select * into v_p from public.conf_pm_programas where id=new.pm_programa_id and empresa_id=new.empresa_id and activo_id=new.equipo_id for update;
  if not found then return new; end if;
  if new.estado='cerrada' then
    v_fecha := new.fecha_fin::date;
    select coalesce(new.horometro_actual,a.horometro_actual) into v_h from public.activos a where a.id=v_p.activo_id and a.empresa_id=v_p.empresa_id;
    if v_fecha is not null then
      insert into public.conf_pm_ejecuciones(empresa_id,programa_id,fecha,horometro,ot_id,origen,costo) values(v_p.empresa_id,v_p.id,v_fecha,v_h,new.id,'ot',new.costo_real) on conflict (ot_id) where origen='ot' and ot_id is not null do nothing;
      if found and (v_p.fecha_ultimo is null or v_fecha >= v_p.fecha_ultimo) then update public.conf_pm_programas set fecha_ultimo=v_fecha,horometro_ultimo=v_h where id=v_p.id; end if;
    end if;
    update public.conf_pm_programas set ot_activa_id=null where id=v_p.id and ot_activa_id=new.id;
  else
    update public.conf_pm_programas set ot_activa_id=new.id where id=v_p.id;
  end if;
  return new;
exception when others then
  raise warning 'No se pudo sincronizar PM para OT %: %', new.id, sqlerrm;
  return new;
end $$;
create trigger conf_pm_ot after insert or update on public.ordenes_trabajo for each row execute function public.conf_pm__ot();

-- Vencido: cualquier restante <= 0. Por vencer: cualquier restante positivo <= intervalo * tolerancia / 100.
-- Si ningun criterio es calculable: sin_lectura; si no se cumple lo anterior: al_dia.
-- p_sociedad_id se acepta por compatibilidad; los activos pertenecen a la empresa y no se filtran por sociedad.
create function public.conf_pm_estado(p_empresa_id text,p_sociedad_id uuid default null)
returns table(programa_id uuid,plan_id uuid,plan_nombre text,activo_id text,activo_codigo text,activo_nombre text,segmento text,horometro_actual numeric,horometro_ultimo numeric,fecha_ultimo date,intervalo_horas numeric,intervalo_dias integer,tolerancia_pct numeric,proximo_horometro numeric,proxima_fecha date,horas_restantes numeric,dias_restantes integer,semaforo text,ot_activa_id text,ot_activa_numero text)
language sql stable security invoker set search_path=public,pg_temp as $$
  with datos as (
    select p.id programa_id, pl.id plan_id, pl.nombre plan_nombre,a.id activo_id,a.codigo activo_codigo,a.nombre activo_nombre,public.conf_segmento_activo(a.id) segmento,a.horometro_actual,p.horometro_ultimo,p.fecha_ultimo,pl.intervalo_horas,pl.intervalo_dias,pl.tolerancia_pct,
      p.horometro_ultimo+pl.intervalo_horas proximo_horometro,p.fecha_ultimo+pl.intervalo_dias proxima_fecha,
      p.horometro_ultimo+pl.intervalo_horas-a.horometro_actual horas_restantes,p.fecha_ultimo+pl.intervalo_dias-current_date dias_restantes,p.ot_activa_id,ot.numero ot_activa_numero
    from public.conf_pm_programas p join public.conf_pm_planes pl on pl.id=p.plan_id and pl.empresa_id=p.empresa_id join public.activos a on a.id=p.activo_id and a.empresa_id=p.empresa_id left join public.ordenes_trabajo ot on ot.id=p.ot_activa_id and ot.empresa_id=p.empresa_id
    where p.empresa_id=p_empresa_id and p.vigente and pl.vigente
  ) select d.programa_id,d.plan_id,d.plan_nombre,d.activo_id,d.activo_codigo,d.activo_nombre,d.segmento,d.horometro_actual,d.horometro_ultimo,d.fecha_ultimo,d.intervalo_horas,d.intervalo_dias,d.tolerancia_pct,d.proximo_horometro,d.proxima_fecha,d.horas_restantes,d.dias_restantes,
    case when d.horas_restantes<=0 or d.dias_restantes<=0 then 'vencido' when d.horas_restantes<=d.intervalo_horas*d.tolerancia_pct/100 or d.dias_restantes<=d.intervalo_dias*d.tolerancia_pct/100 then 'por_vencer' when d.horas_restantes is null and d.dias_restantes is null then 'sin_lectura' else 'al_dia' end,d.ot_activa_id,d.ot_activa_numero from datos d;
$$;
revoke all on function public.conf_pm__ot() from public,anon,authenticated;
revoke all on function public.conf_pm_guardar_plan(jsonb), public.conf_pm_registrar_ejecucion(uuid,date,numeric,text), public.conf_pm_estado(text,uuid) from public,anon;
grant execute on function public.conf_pm_guardar_plan(jsonb), public.conf_pm_registrar_ejecucion(uuid,date,numeric,text), public.conf_pm_estado(text,uuid) to authenticated;

do $$ declare t text; f text; begin
  foreach t in array array['conf_pm_planes','conf_pm_programas','conf_pm_ejecuciones'] loop
    if to_regclass('public.'||t) is null or not (select relrowsecurity from pg_class where oid=to_regclass('public.'||t)) or not exists(select 1 from pg_policies where schemaname='public' and tablename=t and cmd='SELECT') then raise exception 'Tabla, RLS o politica ausente: %',t; end if;
  end loop;
  foreach f in array array['public.conf_pm_guardar_plan(jsonb)','public.conf_pm_registrar_ejecucion(uuid,date,numeric,text)','public.conf_pm_estado(text,uuid)','public.conf_pm__ot()'] loop
    if to_regprocedure(f) is null then raise exception 'Funcion ausente: %',f; end if;
  end loop;
  foreach t in array array['conf_pm_ejecuciones_ot_uq','conf_pm_planes_empresa_idx','conf_pm_programas_empresa_activo_idx','conf_pm_ejecuciones_empresa_programa_idx','ordenes_trabajo_pm_programa_idx'] loop
    if to_regclass('public.'||t) is null then raise exception 'Indice ausente: %',t; end if;
  end loop;
  if not exists(select 1 from pg_trigger where tgrelid='public.ordenes_trabajo'::regclass and tgname='conf_pm_ot' and not tgisinternal) or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ordenes_trabajo' and column_name='pm_programa_id') then raise exception 'Falta columna o trigger PM'; end if;
  if not exists(select 1 from pg_constraint where conrelid='public.ordenes_trabajo'::regclass and confrelid='public.conf_pm_programas'::regclass and contype='f') or has_function_privilege('anon','public.conf_pm_guardar_plan(jsonb)','execute') or not has_function_privilege('authenticated','public.conf_pm_guardar_plan(jsonb)','execute') then raise exception 'FK o privilegios PM incorrectos'; end if;
end $$;
