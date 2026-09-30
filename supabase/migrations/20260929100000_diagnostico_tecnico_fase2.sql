-- Fase 2. Propuesta sin transaccion. No ejecutar sin revision.
create table public.diagnosticos_tecnicos(
 id text primary key default ('dt_'||replace(gen_random_uuid()::text,'-','')),
 empresa_id text not null references public.empresas(id),
 tipo text not null check (tipo in ('fabricacion','mantenimiento')),
 oportunidad_id text references public.oportunidades(id),
 recepcion_id text references public.recepciones_activos_cliente(id),
 activo_id text references public.activos(id),
 estado text not null default 'borrador' check (estado in ('borrador','emitido')),
 elaborado_por uuid not null, emitido_por uuid, emitido_en timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((tipo='mantenimiento' and recepcion_id is not null and oportunidad_id is null) or (tipo='fabricacion' and oportunidad_id is not null and recepcion_id is null)),
 check ((estado='borrador' and emitido_por is null and emitido_en is null) or (estado='emitido' and emitido_por is not null and emitido_en is not null))
);
create table public.diagnostico_tecnico_lineas(
 id uuid primary key default gen_random_uuid(), empresa_id text not null references public.empresas(id),
 diagnostico_id text not null references public.diagnosticos_tecnicos(id) on delete cascade,
 familia_trabajo_id uuid not null references public.familia_trabajo(id), actividad_id text references public.tipos_servicio_interno(id),
 tarea_id text not null references public.tipos_servicio_interno(id), hallazgo text, cargo_id text references public.cargos_empresa(id),
 horas_mano_obra numeric not null default 0 check (horas_mano_obra>=0), activo_id text references public.activos(id),
 horas_maquina numeric not null default 0 check (horas_maquina>=0), orden integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((activo_id is null and horas_maquina=0) or activo_id is not null)
);
create table public.diagnostico_tecnico_linea_materiales(
 id uuid primary key default gen_random_uuid(), empresa_id text not null references public.empresas(id),
 linea_id uuid not null references public.diagnostico_tecnico_lineas(id) on delete cascade, material_id text references public.materiales(id),
 descripcion text, cantidad numeric not null default 1 check (cantidad>0), unidad text not null default 'und', orden integer not null default 0,
 created_at timestamptz not null default now(), check (material_id is not null or nullif(btrim(descripcion),'') is not null)
);
create table public.plantillas_actividad(
 id uuid primary key default gen_random_uuid(), empresa_id text not null references public.empresas(id),
 actividad_id text not null references public.tipos_servicio_interno(id), tarea_id text not null references public.tipos_servicio_interno(id),
 cargo_id text references public.cargos_empresa(id), orden integer not null default 0, created_at timestamptz not null default now(),
 unique (empresa_id,actividad_id,tarea_id)
);

create or replace function public.buscar_o_crear_tipo_servicio_interno(p_empresa_id text,p_nombre text)
returns public.tipos_servicio_interno language plpgsql security definer set search_path=public,pg_temp as $$
declare n text:=btrim(regexp_replace(coalesce(p_nombre,''),'\s+',' ','g')); k text:=lower(n); r public.tipos_servicio_interno%rowtype;
begin
 if auth.uid() is null then raise exception 'Se requiere una sesion autenticada.' using errcode='28000'; end if;
 if not public.usuario_tiene_empresa(p_empresa_id) or not public.usuario_puede(p_empresa_id,'diagnostico_tecnico','crear') then raise exception 'No autorizado.' using errcode='42501'; end if;
 if n='' then raise exception 'El nombre es obligatorio.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('tsi:'||p_empresa_id||':'||k,0));
 select * into r from public.tipos_servicio_interno where empresa_id=p_empresa_id and lower(btrim(regexp_replace(nombre,'\s+',' ','g')))=k order by id limit 1;
 if found then return r; end if;
 loop
  r.id:='tsi_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
  r.codigo:='TSI-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
  exit when not exists(select 1 from public.tipos_servicio_interno where id=r.id or (empresa_id=p_empresa_id and codigo=r.codigo));
 end loop;
 insert into public.tipos_servicio_interno(id,empresa_id,codigo,nombre,clasificacion) values (r.id,p_empresa_id,r.codigo,n,'General') returning * into r;
 return r;
end $$;
create or replace function public.buscar_o_crear_familia_trabajo(p_empresa_id text,p_nombre text)
returns public.familia_trabajo language plpgsql security definer set search_path=public,pg_temp as $$
declare n text:=btrim(regexp_replace(coalesce(p_nombre,''),'\s+',' ','g')); k text:=lower(n); r public.familia_trabajo%rowtype;
begin
 if auth.uid() is null then raise exception 'Se requiere una sesion autenticada.' using errcode='28000'; end if;
 if not public.usuario_tiene_empresa(p_empresa_id) or not public.usuario_puede(p_empresa_id,'diagnostico_tecnico','crear') then raise exception 'No autorizado.' using errcode='42501'; end if;
 if n='' then raise exception 'El nombre es obligatorio.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fam:'||p_empresa_id||':'||k,0));
 select * into r from public.familia_trabajo where empresa_id=p_empresa_id and lower(btrim(regexp_replace(nombre,'\s+',' ','g')))=k order by id limit 1;
 if found then return r; end if;
 insert into public.familia_trabajo(id,empresa_id,nombre,activo) values (gen_random_uuid(),p_empresa_id,n,true) returning * into r;
 return r;
end $$;
revoke all on function public.buscar_o_crear_tipo_servicio_interno(text,text),public.buscar_o_crear_familia_trabajo(text,text) from public,anon,service_role;
grant execute on function public.buscar_o_crear_tipo_servicio_interno(text,text),public.buscar_o_crear_familia_trabajo(text,text) to authenticated;

create or replace function public.validar_diagnostico_tecnico_referencias() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare pe text; pa text; ae text;
begin
 if tg_op='UPDATE' and (new.elaborado_por is distinct from old.elaborado_por or new.tipo is distinct from old.tipo or new.recepcion_id is distinct from old.recepcion_id or new.oportunidad_id is distinct from old.oportunidad_id) then
  raise exception 'No se pueden cambiar elaborado_por, tipo, recepcion_id ni oportunidad_id.' using errcode='42501';
 end if;
 if new.tipo='mantenimiento' then select r.empresa_id,r.activo_id into pe,pa from public.recepciones_activos_cliente r where r.id=new.recepcion_id;
 else select o.empresa_id into pe from public.oportunidades o where o.id=new.oportunidad_id; end if;
 if pe is null or pe is distinct from new.empresa_id then raise exception 'El padre no pertenece al mismo tenant.' using errcode='23514'; end if;
 if new.tipo='mantenimiento' and new.activo_id is null then new.activo_id:=pa; end if;
 if new.activo_id is not null then select a.empresa_id into ae from public.activos a where a.id=new.activo_id; if ae is distinct from new.empresa_id then raise exception 'El activo debe pertenecer al mismo tenant.' using errcode='23514'; end if; end if;
 if tg_op='INSERT' then new.elaborado_por:=auth.uid();
 elsif old.estado='emitido' then
  if new.estado<>'borrador' or not public.usuario_puede(new.empresa_id,'diagnostico_tecnico','aprobar') then raise exception 'Un diagnostico emitido solo puede reabrirse con aprobar.' using errcode='42501'; end if;
  new.emitido_por:=null; new.emitido_en:=null;
 elsif new.estado='emitido' then new.emitido_por:=auth.uid(); new.emitido_en:=now(); end if;
 new.updated_at:=now(); return new;
end $$;
create trigger trg_validar_diagnostico_tecnico_referencias before insert or update on public.diagnosticos_tecnicos for each row execute function public.validar_diagnostico_tecnico_referencias();
create or replace function public.bloquear_diagnostico_tecnico_cabecera_emitido() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.estado='emitido' then raise exception 'No se puede eliminar un Diagnostico Tecnico emitido.' using errcode='42501'; end if;
 return old;
end $$;
create trigger trg_bloquear_diagnostico_tecnico_cabecera_emitido before delete on public.diagnosticos_tecnicos for each row execute function public.bloquear_diagnostico_tecnico_cabecera_emitido();

create or replace function public.usuario_puede_ver_diagnostico_padre(p_tipo text,p_empresa_id text,p_recepcion_id text,p_oportunidad_id text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select public.usuario_tiene_empresa(p_empresa_id) and case
 when p_tipo='mantenimiento' then exists(select 1 from public.recepciones_activos_cliente r where r.id=p_recepcion_id and r.empresa_id=p_empresa_id and (public.usuario_alcance_sociedades(p_empresa_id) is null or r.sociedad_id=any(public.usuario_alcance_sociedades(p_empresa_id))))
 when p_tipo='fabricacion' then exists(select 1 from public.oportunidades o where o.id=p_oportunidad_id and o.empresa_id=p_empresa_id)
 else false end
$$;
revoke all on function public.usuario_puede_ver_diagnostico_padre(text,text,text,text) from public,anon,service_role;
grant execute on function public.usuario_puede_ver_diagnostico_padre(text,text,text,text) to authenticated;

create or replace function public.validar_plantilla_actividad_referencias() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ae text; te text;
begin
 if new.actividad_id=new.tarea_id then raise exception 'Una plantilla no puede autorreferenciarse.' using errcode='23514'; end if;
 select empresa_id into ae from public.tipos_servicio_interno where id=new.actividad_id;
 select empresa_id into te from public.tipos_servicio_interno where id=new.tarea_id;
 if ae is null or te is null or ae is distinct from new.empresa_id or te is distinct from new.empresa_id then raise exception 'Las referencias de la plantilla deben pertenecer al mismo tenant.' using errcode='23514'; end if;
 return new;
end $$;
create trigger trg_validar_plantilla_actividad_referencias before insert or update on public.plantillas_actividad for each row execute function public.validar_plantilla_actividad_referencias();

create or replace function public.validar_diagnostico_tecnico_linea_referencias() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare de text; fe text; ae text; te text; ce text; xe text;
begin
 if tg_op='UPDATE' and new.diagnostico_id is distinct from old.diagnostico_id then raise exception 'No se puede mover una linea a otro diagnostico.' using errcode='42501'; end if;
 select empresa_id into de from public.diagnosticos_tecnicos where id=new.diagnostico_id;
 select empresa_id into fe from public.familia_trabajo where id=new.familia_trabajo_id;
 select empresa_id into ae from public.tipos_servicio_interno where id=new.actividad_id;
 select empresa_id into te from public.tipos_servicio_interno where id=new.tarea_id;
 select empresa_id into ce from public.cargos_empresa where id=new.cargo_id;
 if de is distinct from new.empresa_id then raise exception 'La linea y su diagnostico deben pertenecer al mismo tenant.' using errcode='23514'; end if;
 if fe is distinct from new.empresa_id then raise exception 'La familia de trabajo debe pertenecer al mismo tenant.' using errcode='23514'; end if;
 if new.actividad_id is not null and ae is distinct from new.empresa_id then raise exception 'La actividad debe pertenecer al mismo tenant.' using errcode='23514'; end if;
 if te is distinct from new.empresa_id then raise exception 'La tarea debe pertenecer al mismo tenant.' using errcode='23514'; end if;
 if new.cargo_id is not null and ce is distinct from new.empresa_id then raise exception 'El cargo debe pertenecer al mismo tenant.' using errcode='23514'; end if;
 if new.activo_id is not null then select empresa_id into xe from public.activos where id=new.activo_id and propietario_tipo='propio' and cliente_propietario_id is null; if xe is distinct from new.empresa_id then raise exception 'El activo de maquina debe ser propio y pertenecer al mismo tenant.' using errcode='23514'; end if; end if;
 return new;
end $$;
create trigger trg_validar_diagnostico_tecnico_linea_referencias before insert or update on public.diagnostico_tecnico_lineas for each row execute function public.validar_diagnostico_tecnico_linea_referencias();
create or replace function public.validar_diagnostico_tecnico_material_referencias() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare le text; me text;
begin
 select empresa_id into le from public.diagnostico_tecnico_lineas where id=new.linea_id;
 if le is distinct from new.empresa_id then raise exception 'El material y su linea deben pertenecer al mismo tenant.' using errcode='23514'; end if;
 if new.material_id is not null then select empresa_id into me from public.materiales where id=new.material_id; if me is distinct from new.empresa_id then raise exception 'El material debe pertenecer al mismo tenant.' using errcode='23514'; end if; end if;
 return new;
end $$;
create trigger trg_validar_diagnostico_tecnico_material_referencias before insert or update on public.diagnostico_tecnico_linea_materiales for each row execute function public.validar_diagnostico_tecnico_material_referencias();

create or replace function public.bloquear_diagnostico_tecnico_linea_emitido() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare i text; e text;
begin
 if tg_op='DELETE' then i:=old.diagnostico_id; else i:=new.diagnostico_id; end if;
 select estado into e from public.diagnosticos_tecnicos where id=i;
 if e='emitido' then raise exception 'No se puede modificar un Diagnostico Tecnico emitido.' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create or replace function public.bloquear_diagnostico_tecnico_material_emitido() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare i text; e text; li uuid;
begin
 if tg_op='DELETE' then li:=old.linea_id; else li:=new.linea_id; end if;
 select diagnostico_id into i from public.diagnostico_tecnico_lineas where id=li;
 select estado into e from public.diagnosticos_tecnicos where id=i;
 if e='emitido' then raise exception 'No se puede modificar un Diagnostico Tecnico emitido.' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger trg_bloquear_diagnostico_tecnico_linea_emitido before insert or update or delete on public.diagnostico_tecnico_lineas for each row execute function public.bloquear_diagnostico_tecnico_linea_emitido();
create trigger trg_bloquear_diagnostico_tecnico_material_emitido before insert or update or delete on public.diagnostico_tecnico_linea_materiales for each row execute function public.bloquear_diagnostico_tecnico_material_emitido();

alter table public.diagnosticos_tecnicos enable row level security;
alter table public.diagnostico_tecnico_lineas enable row level security;
alter table public.diagnostico_tecnico_linea_materiales enable row level security;
alter table public.plantillas_actividad enable row level security;
create policy diagnosticos_tecnicos_select on public.diagnosticos_tecnicos for select to authenticated using (public.usuario_tiene_empresa(diagnosticos_tecnicos.empresa_id) and public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','ver') and public.usuario_puede_ver_diagnostico_padre(diagnosticos_tecnicos.tipo,diagnosticos_tecnicos.empresa_id,diagnosticos_tecnicos.recepcion_id,diagnosticos_tecnicos.oportunidad_id));
create policy diagnosticos_tecnicos_insert on public.diagnosticos_tecnicos for insert to authenticated with check (public.usuario_tiene_empresa(diagnosticos_tecnicos.empresa_id) and public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','crear') and public.usuario_puede_ver_diagnostico_padre(diagnosticos_tecnicos.tipo,diagnosticos_tecnicos.empresa_id,diagnosticos_tecnicos.recepcion_id,diagnosticos_tecnicos.oportunidad_id));
create policy diagnosticos_tecnicos_update on public.diagnosticos_tecnicos for update to authenticated using (public.usuario_tiene_empresa(diagnosticos_tecnicos.empresa_id) and (public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','editar') or (diagnosticos_tecnicos.estado='emitido' and public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','aprobar')))) with check (public.usuario_tiene_empresa(diagnosticos_tecnicos.empresa_id) and (public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','editar') or (diagnosticos_tecnicos.estado='borrador' and public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','aprobar'))));
create policy diagnosticos_tecnicos_delete on public.diagnosticos_tecnicos for delete to authenticated using (public.usuario_tiene_empresa(diagnosticos_tecnicos.empresa_id) and public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','editar'));
create policy diagnostico_tecnico_lineas_select on public.diagnostico_tecnico_lineas for select to authenticated using (public.usuario_tiene_empresa(diagnostico_tecnico_lineas.empresa_id) and public.usuario_puede(diagnostico_tecnico_lineas.empresa_id,'diagnostico_tecnico','ver') and exists(select 1 from public.diagnosticos_tecnicos d where d.id=diagnostico_tecnico_lineas.diagnostico_id and d.empresa_id=diagnostico_tecnico_lineas.empresa_id and public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));
create policy diagnostico_tecnico_lineas_insert on public.diagnostico_tecnico_lineas for insert to authenticated with check (public.usuario_tiene_empresa(diagnostico_tecnico_lineas.empresa_id) and public.usuario_puede(diagnostico_tecnico_lineas.empresa_id,'diagnostico_tecnico','crear') and exists(select 1 from public.diagnosticos_tecnicos d where d.id=diagnostico_tecnico_lineas.diagnostico_id and d.empresa_id=diagnostico_tecnico_lineas.empresa_id and public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));
create policy diagnostico_tecnico_lineas_update on public.diagnostico_tecnico_lineas for update to authenticated using (public.usuario_tiene_empresa(diagnostico_tecnico_lineas.empresa_id) and public.usuario_puede(diagnostico_tecnico_lineas.empresa_id,'diagnostico_tecnico','editar') and exists(select 1 from public.diagnosticos_tecnicos d where d.id=diagnostico_tecnico_lineas.diagnostico_id and d.empresa_id=diagnostico_tecnico_lineas.empresa_id and public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id))) with check (public.usuario_tiene_empresa(diagnostico_tecnico_lineas.empresa_id) and public.usuario_puede(diagnostico_tecnico_lineas.empresa_id,'diagnostico_tecnico','editar') and exists(select 1 from public.diagnosticos_tecnicos d where d.id=diagnostico_tecnico_lineas.diagnostico_id and d.empresa_id=diagnostico_tecnico_lineas.empresa_id and public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));
create policy diagnostico_tecnico_lineas_delete on public.diagnostico_tecnico_lineas for delete to authenticated using (public.usuario_tiene_empresa(diagnostico_tecnico_lineas.empresa_id) and public.usuario_puede(diagnostico_tecnico_lineas.empresa_id,'diagnostico_tecnico','editar') and exists(select 1 from public.diagnosticos_tecnicos d where d.id=diagnostico_tecnico_lineas.diagnostico_id and d.empresa_id=diagnostico_tecnico_lineas.empresa_id and public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));
create policy diagnostico_tecnico_materiales_select on public.diagnostico_tecnico_linea_materiales for select to authenticated using (public.usuario_tiene_empresa(diagnostico_tecnico_linea_materiales.empresa_id) and public.usuario_puede(diagnostico_tecnico_linea_materiales.empresa_id,'diagnostico_tecnico','ver') and exists(select 1 from public.diagnostico_tecnico_lineas l join public.diagnosticos_tecnicos d on d.id=l.diagnostico_id where l.id=diagnostico_tecnico_linea_materiales.linea_id and l.empresa_id=diagnostico_tecnico_linea_materiales.empresa_id and public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));
create policy diagnostico_tecnico_materiales_insert on public.diagnostico_tecnico_linea_materiales for insert to authenticated with check (public.usuario_tiene_empresa(diagnostico_tecnico_linea_materiales.empresa_id) and public.usuario_puede(diagnostico_tecnico_linea_materiales.empresa_id,'diagnostico_tecnico','crear') and exists(select 1 from public.diagnostico_tecnico_lineas l join public.diagnosticos_tecnicos d on d.id=l.diagnostico_id where l.id=diagnostico_tecnico_linea_materiales.linea_id and l.empresa_id=diagnostico_tecnico_linea_materiales.empresa_id and public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));
create policy diagnostico_tecnico_materiales_update on public.diagnostico_tecnico_linea_materiales for update to authenticated using (public.usuario_tiene_empresa(diagnostico_tecnico_linea_materiales.empresa_id) and public.usuario_puede(diagnostico_tecnico_linea_materiales.empresa_id,'diagnostico_tecnico','editar') and exists(select 1 from public.diagnostico_tecnico_lineas l join public.diagnosticos_tecnicos d on d.id=l.diagnostico_id where l.id=diagnostico_tecnico_linea_materiales.linea_id and l.empresa_id=diagnostico_tecnico_linea_materiales.empresa_id and public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id))) with check (public.usuario_tiene_empresa(diagnostico_tecnico_linea_materiales.empresa_id) and public.usuario_puede(diagnostico_tecnico_linea_materiales.empresa_id,'diagnostico_tecnico','editar') and exists(select 1 from public.diagnostico_tecnico_lineas l join public.diagnosticos_tecnicos d on d.id=l.diagnostico_id where l.id=diagnostico_tecnico_linea_materiales.linea_id and l.empresa_id=diagnostico_tecnico_linea_materiales.empresa_id and public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));
create policy diagnostico_tecnico_materiales_delete on public.diagnostico_tecnico_linea_materiales for delete to authenticated using (public.usuario_tiene_empresa(diagnostico_tecnico_linea_materiales.empresa_id) and public.usuario_puede(diagnostico_tecnico_linea_materiales.empresa_id,'diagnostico_tecnico','editar') and exists(select 1 from public.diagnostico_tecnico_lineas l join public.diagnosticos_tecnicos d on d.id=l.diagnostico_id where l.id=diagnostico_tecnico_linea_materiales.linea_id and l.empresa_id=diagnostico_tecnico_linea_materiales.empresa_id and public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));
create policy plantillas_actividad_select on public.plantillas_actividad for select to authenticated using (public.usuario_tiene_empresa(plantillas_actividad.empresa_id) and public.usuario_puede(plantillas_actividad.empresa_id,'diagnostico_tecnico','ver'));
create policy plantillas_actividad_insert on public.plantillas_actividad for insert to authenticated with check (public.usuario_tiene_empresa(plantillas_actividad.empresa_id) and public.usuario_puede(plantillas_actividad.empresa_id,'diagnostico_tecnico','crear'));
create policy plantillas_actividad_update on public.plantillas_actividad for update to authenticated using (public.usuario_tiene_empresa(plantillas_actividad.empresa_id) and public.usuario_puede(plantillas_actividad.empresa_id,'diagnostico_tecnico','editar')) with check (public.usuario_tiene_empresa(plantillas_actividad.empresa_id) and public.usuario_puede(plantillas_actividad.empresa_id,'diagnostico_tecnico','editar'));
create policy plantillas_actividad_delete on public.plantillas_actividad for delete to authenticated using (public.usuario_tiene_empresa(plantillas_actividad.empresa_id) and public.usuario_puede(plantillas_actividad.empresa_id,'diagnostico_tecnico','editar'));
grant select,insert,update,delete on public.diagnosticos_tecnicos,public.diagnostico_tecnico_lineas,public.diagnostico_tecnico_linea_materiales,public.plantillas_actividad to authenticated;

-- Backfill: solo roles con por lo menos un flag fuente verdadero; no depende de usuarios activos.
insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular,puede_aprobar,puede_exportar,puede_ver_costos,puede_ver_finanzas)
select r.id,'diagnostico_tecnico',
 bool_or((pr.pantalla='ot' and pr.puede_ver) or (pr.pantalla='hoja_costeo' and pr.puede_ver)),
 bool_or(pr.pantalla='ot' and pr.puede_crear), bool_or(pr.pantalla='ot' and pr.puede_editar), false,
 bool_or(pr.pantalla='ot' and pr.puede_aprobar), false,false,false
from public.roles r join public.empresas e on e.id=r.empresa_id join public.permisos_roles pr on pr.rol_id=r.id and pr.pantalla in ('ot','hoja_costeo')
where not e.es_plataforma group by r.id
having bool_or((pr.pantalla='ot' and (pr.puede_ver or pr.puede_crear or pr.puede_editar or pr.puede_aprobar)) or (pr.pantalla='hoja_costeo' and pr.puede_ver))
on conflict (rol_id,pantalla) do nothing;

-- Defaults: cuerpo remoto preservado; la pantalla nueva se agrega para tres tipos.
create or replace function public.asignar_permisos_default_a_rol(p_rol_id text,p_tipo_rol text) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_tipo_rol='admin' then
  insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular,puede_aprobar,puede_exportar,puede_ver_costos,puede_ver_finanzas)
  select p_rol_id,x.pantalla,true,true,true,true,true,true,true,true from unnest(array['dashboard','bi_comercial','bi_operativo','bi_financiero','tenants','planes','metricas_saas','cuentas','leads','pipeline','actividades','agenda_comercial','hoja_costeo','cotizaciones','os_cliente','planner','backlog','ot','partes','cierre','tickets','inventario','solpe','remision','proveedores','cot_compras','ordenes_compra','ordenes_servicio','recepciones','rrhh_operativo','rrhh_admin','asistencia','turnos','nomina','prestamos_personal','financiamiento','ventas','cxc','cxp','tesoreria','resultados','roles','usuarios','maestros','parametros']) x(pantalla)
  on conflict(rol_id,pantalla) do update set puede_ver=excluded.puede_ver,puede_crear=excluded.puede_crear,puede_editar=excluded.puede_editar,puede_anular=excluded.puede_anular,puede_aprobar=excluded.puede_aprobar,puede_exportar=excluded.puede_exportar,puede_ver_costos=excluded.puede_ver_costos,puede_ver_finanzas=excluded.puede_ver_finanzas;
 elsif p_tipo_rol='comercial_jefe' then
  insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular,puede_aprobar,puede_exportar,puede_ver_costos,puede_ver_finanzas)
  select p_rol_id,x.pantalla,true,true,true,false,true,true,false,false from unnest(array['bi_comercial','cuentas','leads','pipeline','actividades','agenda_comercial','hoja_costeo','cotizaciones','os_cliente']) x(pantalla)
  on conflict(rol_id,pantalla) do update set puede_ver=excluded.puede_ver,puede_crear=excluded.puede_crear,puede_editar=excluded.puede_editar,puede_anular=excluded.puede_anular,puede_aprobar=excluded.puede_aprobar,puede_exportar=excluded.puede_exportar,puede_ver_costos=excluded.puede_ver_costos,puede_ver_finanzas=excluded.puede_ver_finanzas;
 elsif p_tipo_rol='comercial_asesor' then
  insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular,puede_aprobar,puede_exportar,puede_ver_costos,puede_ver_finanzas)
  select p_rol_id,x.pantalla,true,true,true,false,false,false,false,false from unnest(array['bi_comercial','cuentas','leads','pipeline','actividades','agenda_comercial','hoja_costeo','cotizaciones']) x(pantalla)
  on conflict(rol_id,pantalla) do update set puede_ver=excluded.puede_ver,puede_crear=excluded.puede_crear,puede_editar=excluded.puede_editar,puede_anular=excluded.puede_anular,puede_aprobar=excluded.puede_aprobar,puede_exportar=excluded.puede_exportar,puede_ver_costos=excluded.puede_ver_costos,puede_ver_finanzas=excluded.puede_ver_finanzas;
 elsif p_tipo_rol='ops_jefe' then
  insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular,puede_aprobar,puede_exportar,puede_ver_costos,puede_ver_finanzas)
  select p_rol_id,x.pantalla,true,true,true,false,true,true,true,false from unnest(array['bi_operativo','planner','backlog','ot','partes','cierre','tickets','inventario','solpe','remision','recepciones']) x(pantalla)
  on conflict(rol_id,pantalla) do update set puede_ver=excluded.puede_ver,puede_crear=excluded.puede_crear,puede_editar=excluded.puede_editar,puede_anular=excluded.puede_anular,puede_aprobar=excluded.puede_aprobar,puede_exportar=excluded.puede_exportar,puede_ver_costos=excluded.puede_ver_costos,puede_ver_finanzas=excluded.puede_ver_finanzas;
 elsif p_tipo_rol='ops_tecnico' then
  insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular,puede_aprobar,puede_exportar,puede_ver_costos,puede_ver_finanzas)
  select p_rol_id,x.pantalla,true,true,true,false,false,false,false,false from unnest(array['ot','partes']) x(pantalla)
  on conflict(rol_id,pantalla) do update set puede_ver=excluded.puede_ver,puede_crear=excluded.puede_crear,puede_editar=excluded.puede_editar,puede_anular=excluded.puede_anular,puede_aprobar=excluded.puede_aprobar,puede_exportar=excluded.puede_exportar,puede_ver_costos=excluded.puede_ver_costos,puede_ver_finanzas=excluded.puede_ver_finanzas;
 elsif p_tipo_rol='finanzas' then
  insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular,puede_aprobar,puede_exportar,puede_ver_costos,puede_ver_finanzas)
  select p_rol_id,x.pantalla,true,true,true,false,true,true,true,true from unnest(array['bi_financiero','proveedores','cot_compras','ordenes_compra','ordenes_servicio','recepciones','nomina','financiamiento','ventas','cxc','cxp','tesoreria','resultados']) x(pantalla)
  on conflict(rol_id,pantalla) do update set puede_ver=excluded.puede_ver,puede_crear=excluded.puede_crear,puede_editar=excluded.puede_editar,puede_anular=excluded.puede_anular,puede_aprobar=excluded.puede_aprobar,puede_exportar=excluded.puede_exportar,puede_ver_costos=excluded.puede_ver_costos,puede_ver_finanzas=excluded.puede_ver_finanzas;
 end if;
 if p_tipo_rol='admin' then insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular,puede_aprobar,puede_exportar,puede_ver_costos,puede_ver_finanzas) values(p_rol_id,'diagnostico_tecnico',true,true,true,true,true,true,true,true) on conflict(rol_id,pantalla) do update set puede_ver=excluded.puede_ver,puede_crear=excluded.puede_crear,puede_editar=excluded.puede_editar,puede_anular=excluded.puede_anular,puede_aprobar=excluded.puede_aprobar,puede_exportar=excluded.puede_exportar,puede_ver_costos=excluded.puede_ver_costos,puede_ver_finanzas=excluded.puede_ver_finanzas;
 elsif p_tipo_rol='ops_jefe' then insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular,puede_aprobar,puede_exportar,puede_ver_costos,puede_ver_finanzas) values(p_rol_id,'diagnostico_tecnico',true,true,true,false,true,false,false,false) on conflict(rol_id,pantalla) do update set puede_ver=excluded.puede_ver,puede_crear=excluded.puede_crear,puede_editar=excluded.puede_editar,puede_anular=excluded.puede_anular,puede_aprobar=excluded.puede_aprobar,puede_exportar=excluded.puede_exportar,puede_ver_costos=excluded.puede_ver_costos,puede_ver_finanzas=excluded.puede_ver_finanzas;
 elsif p_tipo_rol='ops_tecnico' then insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular,puede_aprobar,puede_exportar,puede_ver_costos,puede_ver_finanzas) values(p_rol_id,'diagnostico_tecnico',true,true,true,false,false,false,false,false) on conflict(rol_id,pantalla) do update set puede_ver=excluded.puede_ver,puede_crear=excluded.puede_crear,puede_editar=excluded.puede_editar,puede_anular=excluded.puede_anular,puede_aprobar=excluded.puede_aprobar,puede_exportar=excluded.puede_exportar,puede_ver_costos=excluded.puede_ver_costos,puede_ver_finanzas=excluded.puede_ver_finanzas;
 end if;
end $$;
