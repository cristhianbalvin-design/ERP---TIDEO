-- Analisis de aceite: los limites sembrados son orientativos y deben validarse por aplicacion.
create table public.conf_sos_limites (
  id uuid primary key default gen_random_uuid(), empresa_id text references public.empresas(id), sistema text,
  elemento text not null, unidad text not null, tipo text not null check(tipo in ('max','rango')),
  alerta numeric, critico numeric, minimo numeric, maximo numeric,
  check ((tipo='max' and alerta is not null and critico is not null and alerta >= 0 and critico > alerta)
      or (tipo='rango' and minimo is not null and maximo is not null and minimo < maximo and alerta is not null and critico is not null and alerta > 0 and critico > alerta))
);
create unique index conf_sos_limites_clave_uq on public.conf_sos_limites(coalesce(empresa_id,''),coalesce(lower(sistema),''),lower(elemento));
create index conf_sos_limites_empresa_idx on public.conf_sos_limites(empresa_id);
create table public.conf_sos_muestras (
  id uuid primary key default gen_random_uuid(), empresa_id text not null references public.empresas(id), sociedad_id uuid references public.sociedades(id),
  activo_id text not null references public.activos(id), sistema text not null, tipo_aceite text, horometro_muestra numeric,
  horas_aceite numeric, fecha_muestra date not null, laboratorio text, numero_informe text, fecha_resultado date,
  estado text not null default 'registrada' check(estado in ('registrada','con_resultado','revisada','anulada')),
  condicion text check(condicion in ('normal','alerta','critico')), recomendacion text, informe_path text,
  backlog_id text references public.backlog(id), created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index conf_sos_muestras_empresa_activo_idx on public.conf_sos_muestras(empresa_id,activo_id);
create table public.conf_sos_resultados (
  id uuid primary key default gen_random_uuid(), muestra_id uuid not null references public.conf_sos_muestras(id), empresa_id text not null references public.empresas(id),
  elemento text not null, valor numeric not null, unidad text not null, nivel text not null check(nivel in ('normal','alerta','critico')),
  unique(muestra_id,elemento)
);
create index conf_sos_resultados_empresa_muestra_idx on public.conf_sos_resultados(empresa_id,muestra_id);

alter table public.conf_sos_limites enable row level security;
alter table public.conf_sos_muestras enable row level security;
alter table public.conf_sos_resultados enable row level security;
create policy conf_sos_limites_select on public.conf_sos_limites for select to authenticated using (empresa_id is null or (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'analisis_sos','ver')));
create policy conf_sos_muestras_select on public.conf_sos_muestras for select to authenticated using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'analisis_sos','ver') and (sociedad_id is null or public.flota_sociedad_en_alcance(empresa_id,sociedad_id)));
create policy conf_sos_resultados_select on public.conf_sos_resultados for select to authenticated using (exists(select 1 from public.conf_sos_muestras m where m.id=muestra_id and m.empresa_id=conf_sos_resultados.empresa_id));
grant select on public.conf_sos_limites, public.conf_sos_muestras, public.conf_sos_resultados to authenticated;

-- Rango: minimo/maximo son el intervalo normal; alerta y critico son desviaciones porcentuales del limite mas cercano.
insert into public.conf_sos_limites(sistema,elemento,unidad,tipo,alerta,critico,minimo,maximo)
select s.sistema, v.elemento,v.unidad,v.tipo,v.alerta,v.critico,v.minimo,v.maximo
from (values (null::text),('Motor'),('Transmisión'),('Hidráulico')) s(sistema)
cross join (values
 ('Fe','ppm','max',50::numeric,100::numeric,null::numeric,null::numeric),('Cu','ppm','max',30,60,null,null),
 ('Al','ppm','max',20,40,null,null),('Cr','ppm','max',10,20,null,null),('Pb','ppm','max',20,40,null,null),
 ('Si','ppm','max',20,40,null,null),('Na','ppm','max',30,60,null,null),('K','ppm','max',20,40,null,null),
 ('viscosidad','cSt a 100 °C','rango',10,20,11,16),('agua','%','max',0.1,0.2,null,null),('hollín','%','max',2,4,null,null)
) v(elemento,unidad,tipo,alerta,critico,minimo,maximo);

create function public.conf_sos_limites_vigentes(p_empresa_id text,p_sistema text)
returns setof public.conf_sos_limites language sql stable security invoker set search_path=public,pg_temp as $$
  select distinct on (lower(l.elemento)) l.* from public.conf_sos_limites l
  where public.usuario_tiene_empresa(p_empresa_id) and public.usuario_puede(p_empresa_id,'analisis_sos','ver')
    and (l.empresa_id=p_empresa_id or l.empresa_id is null) and (l.sistema is null or lower(l.sistema)=lower(p_sistema))
  order by lower(l.elemento), (l.empresa_id is not null) desc, (l.sistema is not null) desc;
$$;

create function public.conf_sos_guardar_limite(p_payload jsonb) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid := nullif(p_payload->>'id','')::uuid; v_empresa text := p_payload->>'empresa_id';
begin
  perform public.flota__exigir(v_empresa,'analisis_sos','editar','Sin permiso para configurar limites SOS.');
  if v_id is null then
    insert into public.conf_sos_limites(empresa_id,sistema,elemento,unidad,tipo,alerta,critico,minimo,maximo)
    values(v_empresa,nullif(btrim(p_payload->>'sistema'),''),nullif(btrim(p_payload->>'elemento'),''),nullif(btrim(p_payload->>'unidad'),''),p_payload->>'tipo',nullif(p_payload->>'alerta','')::numeric,nullif(p_payload->>'critico','')::numeric,nullif(p_payload->>'minimo','')::numeric,nullif(p_payload->>'maximo','')::numeric) returning id into v_id;
  else
    update public.conf_sos_limites set sistema=nullif(btrim(p_payload->>'sistema'),''),elemento=nullif(btrim(p_payload->>'elemento'),''),unidad=nullif(btrim(p_payload->>'unidad'),''),tipo=p_payload->>'tipo',alerta=nullif(p_payload->>'alerta','')::numeric,critico=nullif(p_payload->>'critico','')::numeric,minimo=nullif(p_payload->>'minimo','')::numeric,maximo=nullif(p_payload->>'maximo','')::numeric where id=v_id and empresa_id=v_empresa;
    if not found then raise exception 'Limite inexistente.' using errcode='22023'; end if;
  end if;
  return v_id;
end $$;

create function public.conf_sos_guardar_muestra(p_payload jsonb) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid:=nullif(p_payload->>'id','')::uuid; v_empresa text:=p_payload->>'empresa_id'; v_soc uuid:=nullif(p_payload->>'sociedad_id','')::uuid;
begin
  perform public.flota__exigir(v_empresa,'analisis_sos',case when v_id is null then 'crear' else 'editar' end,'Sin permiso para guardar muestras SOS.');
  if v_soc is not null and not public.flota_sociedad_en_alcance(v_empresa,v_soc) then raise exception 'Sociedad fuera de alcance.' using errcode='42501'; end if;
  if v_soc is not null and not exists(select 1 from public.sociedades where id=v_soc and empresa_id=v_empresa) then raise exception 'Sociedad fuera de la empresa.' using errcode='22023'; end if;
  if not exists(select 1 from public.activos where id=p_payload->>'activo_id' and empresa_id=v_empresa) then raise exception 'Activo fuera de la empresa.' using errcode='22023'; end if;
  if v_id is null then
    insert into public.conf_sos_muestras(empresa_id,sociedad_id,activo_id,sistema,tipo_aceite,horometro_muestra,horas_aceite,fecha_muestra,laboratorio,numero_informe)
    values(v_empresa,v_soc,p_payload->>'activo_id',nullif(btrim(p_payload->>'sistema'),''),p_payload->>'tipo_aceite',nullif(p_payload->>'horometro_muestra','')::numeric,nullif(p_payload->>'horas_aceite','')::numeric,(p_payload->>'fecha_muestra')::date,p_payload->>'laboratorio',p_payload->>'numero_informe') returning id into v_id;
  else
    update public.conf_sos_muestras set sociedad_id=v_soc,activo_id=p_payload->>'activo_id',sistema=nullif(btrim(p_payload->>'sistema'),''),tipo_aceite=p_payload->>'tipo_aceite',horometro_muestra=nullif(p_payload->>'horometro_muestra','')::numeric,horas_aceite=nullif(p_payload->>'horas_aceite','')::numeric,fecha_muestra=(p_payload->>'fecha_muestra')::date,laboratorio=p_payload->>'laboratorio',numero_informe=p_payload->>'numero_informe',updated_at=now()
    where id=v_id and empresa_id=v_empresa and estado='registrada' and (sociedad_id is null or public.flota_sociedad_en_alcance(v_empresa,sociedad_id));
    if not found then raise exception 'Muestra no editable o fuera de alcance.' using errcode='22023'; end if;
  end if;
  return v_id;
end $$;

create function public.conf_sos_guardar_resultados(p_muestra_id uuid,p_resultados jsonb,p_recomendacion text,p_fecha_resultado date,p_informe_path text) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare m public.conf_sos_muestras; l public.conf_sos_limites; x jsonb; v_val numeric; v_nivel text; v_cond text:='normal'; v_backlog text;
begin
  select * into m from public.conf_sos_muestras where id=p_muestra_id for update;
  if not found then raise exception 'Muestra inexistente.'; end if;
  perform public.flota__exigir(m.empresa_id,'analisis_sos','editar','Sin permiso para registrar resultados SOS.');
  if m.sociedad_id is not null and not public.flota_sociedad_en_alcance(m.empresa_id,m.sociedad_id) then raise exception 'Sociedad fuera de alcance.' using errcode='42501'; end if;
  if m.estado in ('anulada','revisada') or jsonb_typeof(p_resultados) is distinct from 'array' or jsonb_array_length(p_resultados)=0 or p_fecha_resultado is null then raise exception 'Resultados o estado invalidos.' using errcode='22023'; end if;
  if p_informe_path is not null and (split_part(p_informe_path,'/',1)<>m.empresa_id or split_part(p_informe_path,'/',2)<>'sos' or split_part(p_informe_path,'/',3)='') then raise exception 'Ruta de informe invalida.' using errcode='22023'; end if;
  delete from public.conf_sos_resultados where muestra_id=m.id and empresa_id=m.empresa_id;
  for x in select value from jsonb_array_elements(p_resultados) loop
    select * into l from public.conf_sos_limites where (empresa_id=m.empresa_id or empresa_id is null) and (sistema is null or lower(sistema)=lower(m.sistema)) and lower(elemento)=lower(btrim(x->>'elemento')) order by (empresa_id is not null) desc,(sistema is not null) desc limit 1;
    if not found or x->>'unidad' is distinct from l.unidad or nullif(x->>'valor','') is null then raise exception 'Elemento, unidad o limite invalido: %',x->>'elemento' using errcode='22023'; end if;
    v_val := (x->>'valor')::numeric;
    if v_val < 0 then raise exception 'Valor negativo.' using errcode='22023'; end if;
    -- Max: critico >= critico; alerta >= alerta. Rango: desviacion porcentual >= umbral.
    if l.tipo='max' then v_nivel:=case when v_val>=l.critico then 'critico' when v_val>=l.alerta then 'alerta' else 'normal' end;
    else v_nivel:=case when v_val <= l.minimo*(1-l.critico/100) or v_val >= l.maximo*(1+l.critico/100) then 'critico' when v_val <= l.minimo*(1-l.alerta/100) or v_val >= l.maximo*(1+l.alerta/100) then 'alerta' else 'normal' end; end if;
    insert into public.conf_sos_resultados(muestra_id,empresa_id,elemento,valor,unidad,nivel) values(m.id,m.empresa_id,l.elemento,v_val,l.unidad,v_nivel);
    if v_nivel='critico' then v_cond:='critico'; elsif v_nivel='alerta' and v_cond='normal' then v_cond:='alerta'; end if;
  end loop;
  v_backlog:=m.backlog_id;
  if v_cond='critico' and v_backlog is null then
    v_backlog:=gen_random_uuid()::text;
    insert into public.backlog(id,empresa_id,descripcion,prioridad,estado,activo_id,sistema,fuente,fuente_id,impacto,urgencia,fecha_deteccion,sociedad_id,ciclo,created_by)
    values(v_backlog,m.empresa_id,'Resultado SOS critico: '||m.sistema,'alta','pendiente',m.activo_id,m.sistema,'sos',m.id::text,5,5,m.fecha_muestra,m.sociedad_id,'nuevo',auth.uid());
  end if;
  update public.conf_sos_muestras set condicion=v_cond,estado='con_resultado',recomendacion=p_recomendacion,fecha_resultado=p_fecha_resultado,informe_path=p_informe_path,backlog_id=v_backlog,updated_at=now() where id=m.id;
  return jsonb_build_object('condicion',v_cond,'backlog_id',v_backlog);
end $$;

create function public.conf_sos_marcar_revisada(p_id uuid) returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare m public.conf_sos_muestras;
begin
  select * into m from public.conf_sos_muestras where id=p_id for update;
  if not found then raise exception 'Muestra inexistente.'; end if;
  perform public.flota__exigir(m.empresa_id,'analisis_sos','editar','Sin permiso para revisar muestras SOS.');
  if m.sociedad_id is not null and not public.flota_sociedad_en_alcance(m.empresa_id,m.sociedad_id) then raise exception 'Sociedad fuera de alcance.' using errcode='42501'; end if;
  if m.estado<>'con_resultado' then raise exception 'La muestra no tiene resultados pendientes de revision.' using errcode='22023'; end if;
  update public.conf_sos_muestras set estado='revisada',updated_at=now() where id=m.id;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('confiabilidad','confiabilidad',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
create function public.conf_sos__objeto_registrado(p_name text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.conf_sos_muestras where informe_path=p_name and estado<>'anulada');
$$;
create policy storage_confiabilidad_select on storage.objects for select to authenticated using (bucket_id='confiabilidad' and split_part(name,'/',2)='sos' and public.usuario_tiene_empresa(split_part(name,'/',1)) and public.usuario_puede(split_part(name,'/',1),'analisis_sos','ver'));
create policy storage_confiabilidad_insert on storage.objects for insert to authenticated with check (bucket_id='confiabilidad' and split_part(name,'/',2)='sos' and split_part(name,'/',3)<>'' and public.usuario_tiene_empresa(split_part(name,'/',1)) and (public.usuario_puede(split_part(name,'/',1),'analisis_sos','crear') or public.usuario_puede(split_part(name,'/',1),'analisis_sos','editar')));
create policy storage_confiabilidad_delete on storage.objects for delete to authenticated using (bucket_id='confiabilidad' and split_part(name,'/',2)='sos' and public.usuario_tiene_empresa(split_part(name,'/',1)) and (public.usuario_puede(split_part(name,'/',1),'analisis_sos','crear') or public.usuario_puede(split_part(name,'/',1),'analisis_sos','editar')) and not public.conf_sos__objeto_registrado(name));
revoke all on function public.conf_sos__objeto_registrado(text) from public,anon;
grant execute on function public.conf_sos__objeto_registrado(text) to authenticated;
revoke all on function public.conf_sos_guardar_muestra(jsonb),public.conf_sos_guardar_resultados(uuid,jsonb,text,date,text),public.conf_sos_marcar_revisada(uuid),public.conf_sos_limites_vigentes(text,text),public.conf_sos_guardar_limite(jsonb) from public,anon;
grant execute on function public.conf_sos_guardar_muestra(jsonb),public.conf_sos_guardar_resultados(uuid,jsonb,text,date,text),public.conf_sos_marcar_revisada(uuid),public.conf_sos_limites_vigentes(text,text),public.conf_sos_guardar_limite(jsonb) to authenticated;

do $$ declare t text; f text; begin
  foreach t in array array['conf_sos_limites','conf_sos_muestras','conf_sos_resultados'] loop
    if to_regclass('public.'||t) is null or not (select relrowsecurity from pg_class where oid=to_regclass('public.'||t)) or not exists(select 1 from pg_policies where schemaname='public' and tablename=t and cmd='SELECT') then raise exception 'Tabla, RLS o politica ausente: %',t; end if;
  end loop;
  foreach f in array array['public.conf_sos_guardar_muestra(jsonb)','public.conf_sos_guardar_resultados(uuid,jsonb,text,date,text)','public.conf_sos_marcar_revisada(uuid)','public.conf_sos_limites_vigentes(text,text)','public.conf_sos_guardar_limite(jsonb)','public.conf_sos__objeto_registrado(text)'] loop
    if to_regprocedure(f) is null then raise exception 'Funcion ausente: %',f; end if;
  end loop;
  foreach t in array array['conf_sos_limites_clave_uq','conf_sos_limites_empresa_idx','conf_sos_muestras_empresa_activo_idx','conf_sos_resultados_empresa_muestra_idx'] loop
    if to_regclass('public.'||t) is null then raise exception 'Indice ausente: %',t; end if;
  end loop;
  if not exists(select 1 from storage.buckets where id='confiabilidad' and not public) or (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('storage_confiabilidad_select','storage_confiabilidad_insert','storage_confiabilidad_delete'))<>3 then raise exception 'Bucket o politicas SOS ausentes'; end if;
  if (select count(*) from public.conf_sos_limites where empresa_id is null)<>44 then raise exception 'Limites globales incompletos'; end if;
  if has_function_privilege('anon','public.conf_sos_guardar_resultados(uuid,jsonb,text,date,text)','execute') or not has_function_privilege('authenticated','public.conf_sos_guardar_resultados(uuid,jsonb,text,date,text)','execute') then raise exception 'Privilegios SOS incorrectos'; end if;
end $$;
