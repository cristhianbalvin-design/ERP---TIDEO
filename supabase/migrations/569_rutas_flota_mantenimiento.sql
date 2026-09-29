-- RECONSTRUCCION EXPLICITA (2026-09-28).
-- El original no fue encontrado en ramas, commits ni worktrees.
-- Reconstruido desde la evidencia del dry run anterior.

do $preflight$
begin
  if to_regclass('public.orden_compra_transitos') is null then raise exception '569_PREFLIGHT: falta orden_compra_transitos'; end if;
  if to_regclass('public.guias_remision') is null then raise exception '569_PREFLIGHT: falta guias_remision'; end if;
  if to_regprocedure('public.usuario_puede(text,text,text)') is null then raise exception '569_PREFLIGHT: falta usuario_puede'; end if;
  if to_regprocedure('public.usuario_alcance_sociedades(text)') is null then raise exception '569_PREFLIGHT: falta usuario_alcance_sociedades'; end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.orden_compra_transitos'::regclass and tgname='trg_oc_transitos_en_transito' and not tgisinternal) then raise exception '569_PREFLIGHT: falta trigger de OC en transito'; end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.recepciones'::regclass and tgname='trg_recepcion_marca_oc_transito_recibido' and not tgisinternal) then raise exception '569_PREFLIGHT: falta trigger de recepciones'; end if;
end
$preflight$;

create temporary table rutas_569_roles(empresa_id text not null,nombre text not null) on commit drop;
insert into rutas_569_roles values
 ('emp_20601829101','Finanzas y Admin'),('emp_20601829101','Administrador de la plataforma'),('emp_20601829101','GERENCIA DE ADM. Y FINANZAS'),('emp_20601829101','GERENTE GENERAL'),
 ('emp_20606120487','Administrador de la plataforma'),('emp_20606120487','Asistente Contable y Finanzas'),
 ('emp_20600026446','Administrador del tenant'),('emp_20600026446','Finanzas y Admin'),('emp_20600026446','Jefe de Operaciones'),
 ('emp_20609996464','Finanzas y Admin'),('emp_20609996464','Administrador de la plataforma'),
 ('emp_20513453711','Finanzas y Admin'),('emp_20513453711','Administrador de la plataforma'),('emp_20513453711','Jefe Comercial'),('emp_20513453711','Logistica'),
 ('emp_20541435833','Administrador de la plataforma'),('emp_20541435833','GERENCIA DE OPERACIONES'),('emp_20541435833','COMPRADOR'),('emp_20541435833','GERENCIA GENERAL');

do $roles$
declare v_total integer;
begin
  select count(*) into v_total from rutas_569_roles x join public.roles r on r.empresa_id=x.empresa_id and regexp_replace(lower(trim(r.nombre)),'\s+',' ','g')=regexp_replace(lower(trim(x.nombre)),'\s+',' ','g');
  if v_total<>19 then raise exception '569_PREFLIGHT: se esperaban 19 roles y se encontraron %',v_total; end if;
end
$roles$;

insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular)
select r.id,'ordenes_compra',true,true,true,true from public.roles r join rutas_569_roles x on r.empresa_id=x.empresa_id and regexp_replace(lower(trim(r.nombre)),'\s+',' ','g')=regexp_replace(lower(trim(x.nombre)),'\s+',' ','g')
on conflict(rol_id,pantalla) do update set puede_ver=excluded.puede_ver,puede_crear=excluded.puede_crear,puede_editar=excluded.puede_editar,puede_anular=excluded.puede_anular;

drop policy if exists tenant_oc_transitos on public.orden_compra_transitos;
drop policy if exists oc_transitos_select on public.orden_compra_transitos;
drop policy if exists oc_transitos_insert on public.orden_compra_transitos;
drop policy if exists oc_transitos_update on public.orden_compra_transitos;
drop policy if exists oc_transitos_delete on public.orden_compra_transitos;
create policy oc_transitos_select on public.orden_compra_transitos for select to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','ver'));
create policy oc_transitos_insert on public.orden_compra_transitos for insert to authenticated with check(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','crear'));
create policy oc_transitos_update on public.orden_compra_transitos for update to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','editar')) with check(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','editar'));
create policy oc_transitos_delete on public.orden_compra_transitos for delete to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','anular'));

create table if not exists public.rutas(
 id text primary key, empresa_id text not null references public.empresas(id) on delete cascade, codigo text not null, fecha date not null default current_date,
 estado text not null default 'planificada' check(estado in('planificada','en_curso','completada','cancelada')), vehiculo_id text, conductor_id text, transportista_id text,
 hora_salida timestamptz, hora_cierre timestamptz, observaciones text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(empresa_id,codigo));
create table if not exists public.ruta_paradas(
 id text primary key, empresa_id text not null references public.empresas(id) on delete cascade, ruta_id text not null references public.rutas(id) on delete cascade, secuencia integer not null check(secuencia>0),
 tipo_documento text not null check(tipo_documento in('orden_compra_transito','guia_remision')), documento_id text not null, estado text not null default 'pendiente' check(estado in('pendiente','en_curso','completada','cancelada')),
 llegada_at timestamptz, salida_at timestamptz, observaciones text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(ruta_id,secuencia));
create index if not exists rutas_empresa_fecha_idx on public.rutas(empresa_id,fecha desc,estado);
create index if not exists ruta_paradas_ruta_secuencia_idx on public.ruta_paradas(ruta_id,secuencia);
create index if not exists ruta_paradas_documento_idx on public.ruta_paradas(empresa_id,tipo_documento,documento_id);
alter table public.rutas enable row level security;
alter table public.ruta_paradas enable row level security;

-- SECURITY DEFINER solo evita el bloqueo interno de RLS; auth.uid() sigue
-- siendo el usuario invocante y usuario_alcance_sociedades conserva su alcance.
create or replace function public.ruta_tiene_guia_fuera_alcance(p_empresa_id text,p_ruta_id text)
returns boolean language sql stable security definer set search_path=public set row_security=off
as $$
 select exists(
  select 1 from public.ruta_paradas rp
  left join public.guias_remision g on g.id=rp.documento_id and g.empresa_id=rp.empresa_id
  cross join lateral(select public.usuario_alcance_sociedades(p_empresa_id) as alcance) alcance_usuario
  where rp.empresa_id=p_empresa_id and rp.ruta_id=p_ruta_id and rp.tipo_documento='guia_remision'
    and (g.id is null or g.empresa_id is distinct from p_empresa_id or (alcance_usuario.alcance is not null and not(coalesce(g.sociedad_origen_id=any(alcance_usuario.alcance),false) or coalesce(g.sociedad_destino_id=any(alcance_usuario.alcance),false))))
 );
$$;
revoke all on function public.ruta_tiene_guia_fuera_alcance(text,text) from public;
grant execute on function public.ruta_tiene_guia_fuera_alcance(text,text) to authenticated;

drop policy if exists rutas_select on public.rutas;
drop policy if exists rutas_insert on public.rutas;
drop policy if exists rutas_update on public.rutas;
drop policy if exists rutas_delete on public.rutas;
create policy rutas_select on public.rutas for select to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','ver') and not public.ruta_tiene_guia_fuera_alcance(empresa_id,id));
create policy rutas_insert on public.rutas for insert to authenticated with check(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','crear') and (vehiculo_id is null or exists(select 1 from public.vehiculos_transporte v where v.id=rutas.vehiculo_id and v.empresa_id=rutas.empresa_id)) and (conductor_id is null or exists(select 1 from public.conductores_transporte c where c.id=rutas.conductor_id and c.empresa_id=rutas.empresa_id)) and (transportista_id is null or exists(select 1 from public.transportistas t where t.id=rutas.transportista_id and t.empresa_id=rutas.empresa_id)));
create policy rutas_update on public.rutas for update to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','editar')) with check(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','editar') and (vehiculo_id is null or exists(select 1 from public.vehiculos_transporte v where v.id=rutas.vehiculo_id and v.empresa_id=rutas.empresa_id)) and (conductor_id is null or exists(select 1 from public.conductores_transporte c where c.id=rutas.conductor_id and c.empresa_id=rutas.empresa_id)) and (transportista_id is null or exists(select 1 from public.transportistas t where t.id=rutas.transportista_id and t.empresa_id=rutas.empresa_id)));
create policy rutas_delete on public.rutas for delete to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','anular'));

drop policy if exists ruta_paradas_select on public.ruta_paradas;
drop policy if exists ruta_paradas_insert on public.ruta_paradas;
drop policy if exists ruta_paradas_update on public.ruta_paradas;
drop policy if exists ruta_paradas_delete on public.ruta_paradas;
create policy ruta_paradas_select on public.ruta_paradas
for select to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id,'ordenes_compra','ver')
  and exists (
    select 1 from public.rutas r
    where r.id=ruta_paradas.ruta_id and r.empresa_id=ruta_paradas.empresa_id
  )
  and (
    tipo_documento <> 'guia_remision'
    or exists (
      select 1
      from public.guias_remision g
      cross join lateral (
        select public.usuario_alcance_sociedades(ruta_paradas.empresa_id) as alcance
      ) alcance_usuario
      where g.id=ruta_paradas.documento_id
        and g.empresa_id=ruta_paradas.empresa_id
        and (
          alcance_usuario.alcance is null
          or coalesce(g.sociedad_origen_id=any(alcance_usuario.alcance),false)
          or coalesce(g.sociedad_destino_id=any(alcance_usuario.alcance),false)
        )
    )
  )
);
create policy ruta_paradas_insert on public.ruta_paradas for insert to authenticated with check(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','crear') and exists(select 1 from public.rutas r where r.id=ruta_paradas.ruta_id and r.empresa_id=ruta_paradas.empresa_id) and ((tipo_documento='orden_compra_transito' and exists(select 1 from public.orden_compra_transitos t where t.id=ruta_paradas.documento_id and t.empresa_id=ruta_paradas.empresa_id)) or (tipo_documento='guia_remision' and exists(select 1 from public.guias_remision g where g.id=ruta_paradas.documento_id and g.empresa_id=ruta_paradas.empresa_id))));
create policy ruta_paradas_update on public.ruta_paradas for update to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','editar')) with check(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','editar') and exists(select 1 from public.rutas r where r.id=ruta_paradas.ruta_id and r.empresa_id=ruta_paradas.empresa_id) and ((tipo_documento='orden_compra_transito' and exists(select 1 from public.orden_compra_transitos t where t.id=ruta_paradas.documento_id and t.empresa_id=ruta_paradas.empresa_id)) or (tipo_documento='guia_remision' and exists(select 1 from public.guias_remision g where g.id=ruta_paradas.documento_id and g.empresa_id=ruta_paradas.empresa_id))));
create policy ruta_paradas_delete on public.ruta_paradas for delete to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','anular'));

-- Fase 3: sin FK a activos ni ordenes_trabajo y sin triggers de inventario.
create table if not exists public.mantenimientos_flota(
 id text primary key, empresa_id text not null references public.empresas(id) on delete cascade, vehiculo_id text not null references public.vehiculos_transporte(id), tipo_mantenimiento text not null, fecha date not null,
 costo numeric(14,2), moneda text not null default 'PEN', taller_proveedor text, kilometraje integer, proximo_mantenimiento_fecha date, orden_compra_id text, observaciones text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists mantenimientos_flota_empresa_fecha_idx on public.mantenimientos_flota(empresa_id,fecha desc);
create index if not exists mantenimientos_flota_vehiculo_idx on public.mantenimientos_flota(empresa_id,vehiculo_id,fecha desc);
alter table public.mantenimientos_flota enable row level security;
drop policy if exists mantenimientos_flota_select on public.mantenimientos_flota;
drop policy if exists mantenimientos_flota_insert on public.mantenimientos_flota;
drop policy if exists mantenimientos_flota_update on public.mantenimientos_flota;
drop policy if exists mantenimientos_flota_delete on public.mantenimientos_flota;
create policy mantenimientos_flota_select on public.mantenimientos_flota for select to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','ver'));
create policy mantenimientos_flota_insert on public.mantenimientos_flota for insert to authenticated with check(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','crear') and exists(select 1 from public.vehiculos_transporte v where v.id=mantenimientos_flota.vehiculo_id and v.empresa_id=mantenimientos_flota.empresa_id));
create policy mantenimientos_flota_update on public.mantenimientos_flota for update to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','editar')) with check(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','editar') and exists(select 1 from public.vehiculos_transporte v where v.id=mantenimientos_flota.vehiculo_id and v.empresa_id=mantenimientos_flota.empresa_id));
create policy mantenimientos_flota_delete on public.mantenimientos_flota for delete to authenticated using(public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'ordenes_compra','anular'));
revoke all on table public.rutas,public.ruta_paradas,public.mantenimientos_flota from anon;
grant select,insert,update,delete on table public.rutas,public.ruta_paradas,public.mantenimientos_flota to authenticated;

do $postflight$
begin
 if not(select relrowsecurity from pg_class where oid='public.rutas'::regclass) then raise exception '569_POSTFLIGHT: rutas sin RLS'; end if;
 if not(select relrowsecurity from pg_class where oid='public.ruta_paradas'::regclass) then raise exception '569_POSTFLIGHT: ruta_paradas sin RLS'; end if;
 if not(select relrowsecurity from pg_class where oid='public.mantenimientos_flota'::regclass) then raise exception '569_POSTFLIGHT: mantenimientos_flota sin RLS'; end if;
end
$postflight$;
select pg_notify('pgrst','reload schema');
