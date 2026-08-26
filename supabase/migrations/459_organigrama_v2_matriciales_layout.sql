-- TIDEO ERP - Organigrama v2: relaciones matriciales visuales y layout.
-- No toca posiciones_usuarios ni las asignaciones adicionales de la migracion 301.

create table public.posicion_relaciones_matriciales (
  id text primary key default ('prm_' || left(replace(gen_random_uuid()::text, '-', ''), 18)),
  empresa_id text not null references public.empresas(id) on delete cascade,
  sociedad_id uuid null,
  posicion_subordinada_id uuid not null references public.posiciones(id) on delete cascade,
  posicion_jefe_id uuid not null references public.posiciones(id) on delete cascade,
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint posicion_relaciones_matriciales_no_auto_relacion check (posicion_subordinada_id <> posicion_jefe_id),
  constraint posicion_relaciones_matriciales_sociedad_empresa_fkey foreign key (empresa_id, sociedad_id) references public.sociedades(empresa_id, id)
);
create unique index ux_posicion_relaciones_matriciales_activa on public.posicion_relaciones_matriciales(empresa_id,posicion_subordinada_id,posicion_jefe_id) where estado='activo';
create index idx_prm_subordinada on public.posicion_relaciones_matriciales(empresa_id,posicion_subordinada_id) where estado='activo';
create index idx_prm_jefe on public.posicion_relaciones_matriciales(empresa_id,posicion_jefe_id) where estado='activo';
alter table public.posicion_relaciones_matriciales enable row level security;
create policy posicion_relaciones_matriciales_tenant_isolation on public.posicion_relaciones_matriciales for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create or replace function public.crear_relacion_matricial(p_empresa_id text,p_posicion_subordinada_id uuid,p_posicion_jefe_id uuid,p_sociedad_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_sub_emp text; v_jefe_emp text; v_sub_cc text; v_jefe_cc text; v_sub_soc uuid; v_jefe_soc uuid; v_sociedad_relacion uuid; v_sub_orden integer; v_jefe_orden integer; v_multi boolean; v_grupos integer; v_sociedades_actor uuid[]; v_id text;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) or not public.usuario_puede(p_empresa_id,'organigrama','editar') then raise exception 'No tiene permiso para editar relaciones matriciales'; end if;
  select empresa_id,cargo_colocacion_id into v_sub_emp,v_sub_cc from public.posiciones where id=p_posicion_subordinada_id;
  if not found or v_sub_emp<>p_empresa_id then raise exception 'La posición subordinada debe pertenecer al tenant indicado'; end if;
  select empresa_id,cargo_colocacion_id into v_jefe_emp,v_jefe_cc from public.posiciones where id=p_posicion_jefe_id;
  if not found or v_jefe_emp<>p_empresa_id then raise exception 'La posición jefe debe pertenecer al tenant indicado'; end if;
  if v_sub_cc is null then raise exception 'La posición subordinada no tiene cargo-colocación asignada, no se puede determinar su rango'; end if;
  if v_jefe_cc is null then raise exception 'La posición jefe no tiene cargo-colocación asignada, no se puede determinar su rango'; end if;
  select cc.sociedad_id,nj.orden into v_sub_soc,v_sub_orden from public.cargo_colocaciones cc join public.niveles_jerarquicos nj on nj.id=cc.nivel_jerarquico_id where cc.id=v_sub_cc and cc.empresa_id=p_empresa_id;
  select cc.sociedad_id,nj.orden into v_jefe_soc,v_jefe_orden from public.cargo_colocaciones cc join public.niveles_jerarquicos nj on nj.id=cc.nivel_jerarquico_id where cc.id=v_jefe_cc and cc.empresa_id=p_empresa_id;
  if v_jefe_orden is null or v_sub_orden is null then raise exception 'No se pudo determinar el rango jerárquico de las posiciones'; end if;
  if v_jefe_orden >= v_sub_orden then raise exception 'La posición jefe debe tener un rango estrictamente superior a la posición subordinada'; end if;
  if v_sub_soc is distinct from v_jefe_soc then raise exception 'Las posiciones de la relación matricial deben pertenecer a la misma sociedad'; end if;
  v_sociedad_relacion:=v_sub_soc;
  if p_sociedad_id is not null and p_sociedad_id is distinct from v_sociedad_relacion then raise exception 'La sociedad indicada no coincide con la sociedad derivada de las posiciones'; end if;
  select multisociedad_habilitado into v_multi from public.empresas where id=p_empresa_id;
  select count(*) into v_grupos from public.usuarios_asignaciones ua where ua.empresa_id=p_empresa_id and ua.user_id=auth.uid() and ua.activo and ua.alcance_tipo='grupo';
  if v_grupos>0 then
    if exists(select 1 from public.usuarios_asignaciones ua where ua.empresa_id=p_empresa_id and ua.user_id=auth.uid() and ua.activo and ua.alcance_tipo='grupo' and ua.sociedades_ids is null) then v_sociedades_actor:=null;
    else select array_agg(distinct sociedad_id) into v_sociedades_actor from (select unnest(coalesce(ua.sociedades_ids,'{}'::uuid[])) sociedad_id from public.usuarios_asignaciones ua where ua.empresa_id=p_empresa_id and ua.user_id=auth.uid() and ua.activo and ua.alcance_tipo='grupo') s; end if;
  elsif exists(select 1 from public.usuarios_asignaciones ua where ua.empresa_id=p_empresa_id and ua.user_id=auth.uid() and ua.activo and ua.alcance_tipo='sociedad') then
    select array_agg(distinct sociedad_id) into v_sociedades_actor from (select unnest(coalesce(ua.sociedades_ids,'{}'::uuid[])) sociedad_id from public.usuarios_asignaciones ua where ua.empresa_id=p_empresa_id and ua.user_id=auth.uid() and ua.activo and ua.alcance_tipo='sociedad') s;
  else v_sociedades_actor:=null; end if;
  if v_multi and v_sociedades_actor is not null then
    if v_sociedad_relacion is null then raise exception 'No puede crear una relación matricial con posición global cuando su alcance societario es restringido'; end if;
    if not (v_sociedad_relacion=any(coalesce(v_sociedades_actor,'{}'::uuid[]))) then raise exception 'La relación matricial está fuera de su alcance societario'; end if;
  end if;
  select id into v_id from public.posicion_relaciones_matriciales where empresa_id=p_empresa_id and posicion_subordinada_id=p_posicion_subordinada_id and posicion_jefe_id=p_posicion_jefe_id order by (estado='activo') desc,updated_at desc limit 1 for update;
  if v_id is null then insert into public.posicion_relaciones_matriciales(empresa_id,sociedad_id,posicion_subordinada_id,posicion_jefe_id) values(p_empresa_id,v_sociedad_relacion,p_posicion_subordinada_id,p_posicion_jefe_id) returning id into v_id;
  else update public.posicion_relaciones_matriciales set sociedad_id=v_sociedad_relacion,estado='activo',updated_at=now() where id=v_id; end if;
  return jsonb_build_object('id',v_id,'estado','activo');
end $$;

create or replace function public.eliminar_relacion_matricial(p_id text) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_empresa text; begin select empresa_id into v_empresa from public.posicion_relaciones_matriciales where id=p_id for update; if not found then raise exception 'La relación matricial no existe'; end if; if not public.usuario_tiene_empresa(v_empresa) or not public.usuario_puede(v_empresa,'organigrama','editar') then raise exception 'No tiene permiso para eliminar relaciones matriciales'; end if; update public.posicion_relaciones_matriciales set estado='inactivo',updated_at=now() where id=p_id; return jsonb_build_object('id',p_id,'estado','inactivo'); end $$;
grant execute on function public.crear_relacion_matricial(text,uuid,uuid,uuid) to authenticated,service_role;
grant execute on function public.eliminar_relacion_matricial(text) to authenticated,service_role;

create table public.organigrama_v2_layout (
  id text primary key default ('ov2l_' || left(replace(gen_random_uuid()::text, '-', ''), 18)), empresa_id text not null references public.empresas(id) on delete cascade,
  tipo_nodo text not null check(tipo_nodo in('uo','cargo_colocacion','posicion')), nodo_id text not null, x numeric not null,y numeric not null,updated_at timestamptz not null default now(),
  constraint organigrama_v2_layout_empresa_tipo_nodo_key unique(empresa_id,tipo_nodo,nodo_id)
);
alter table public.organigrama_v2_layout enable row level security;
create policy organigrama_v2_layout_tenant_isolation on public.organigrama_v2_layout for all using(public.usuario_tiene_empresa(empresa_id)) with check(public.usuario_tiene_empresa(empresa_id));
create or replace function public.guardar_posicion_nodo_organigrama(p_empresa_id text,p_tipo_nodo text,p_nodo_id text,p_x numeric,p_y numeric) returns jsonb language plpgsql security definer set search_path=public as $$ declare v_existe boolean; begin if not public.usuario_tiene_empresa(p_empresa_id) or not public.usuario_puede(p_empresa_id,'organigrama','editar') then raise exception 'No tiene permiso para guardar el layout del organigrama'; end if; if p_tipo_nodo='uo' then select exists(select 1 from public.unidades_organizacionales where id=p_nodo_id and empresa_id=p_empresa_id) into v_existe; elsif p_tipo_nodo='cargo_colocacion' then select exists(select 1 from public.cargo_colocaciones where id=p_nodo_id and empresa_id=p_empresa_id) into v_existe; elsif p_tipo_nodo='posicion' then select exists(select 1 from public.posiciones where id::text=p_nodo_id and empresa_id=p_empresa_id) into v_existe; else raise exception 'tipo_nodo inválido: %',p_tipo_nodo; end if; if not v_existe then raise exception 'El nodo % de tipo % no existe o no pertenece al tenant indicado',p_nodo_id,p_tipo_nodo; end if; insert into public.organigrama_v2_layout(empresa_id,tipo_nodo,nodo_id,x,y) values(p_empresa_id,p_tipo_nodo,p_nodo_id,p_x,p_y) on conflict(empresa_id,tipo_nodo,nodo_id) do update set x=excluded.x,y=excluded.y,updated_at=now(); return jsonb_build_object('empresa_id',p_empresa_id,'tipo_nodo',p_tipo_nodo,'nodo_id',p_nodo_id,'x',p_x,'y',p_y); end $$;
grant execute on function public.guardar_posicion_nodo_organigrama(text,text,text,numeric,numeric) to authenticated,service_role;
select pg_notify('pgrst','reload schema');
