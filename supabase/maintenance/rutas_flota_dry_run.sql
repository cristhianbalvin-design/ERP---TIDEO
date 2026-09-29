\echo '--- Rutas / permiso OC / mantenimiento de flota: DRY RUN RECONSTRUIDO ---'
\echo 'Termina en ROLLBACK; no aplicar sin autorizacion.'
begin;
\ir ../migrations/569_rutas_flota_mantenimiento.sql

select policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='orden_compra_transitos' order by policyname;

create temporary table rutas_dry_run_usuario_scope as
select ue.user_id,ue.rol_id,ua.sociedades_ids[1] as sociedad_dentro
from public.usuarios_asignaciones ua join public.usuarios_empresas ue on ue.user_id=ua.user_id and ue.empresa_id=ua.empresa_id
where ua.empresa_id='emp_20601829101' and ua.activo is true and ua.alcance_tipo='grupo' and cardinality(ua.sociedades_ids)=1 and ue.estado='activo' limit 1;
do $user$
begin
 if not exists(select 1 from rutas_dry_run_usuario_scope) then raise exception 'RUTAS_DRY_RUN: falta usuario con alcance unico'; end if;
end
$user$;
insert into public.permisos_roles(rol_id,pantalla,puede_ver,puede_crear,puede_editar,puede_anular)
select rol_id,'ordenes_compra',true,true,true,true from rutas_dry_run_usuario_scope
on conflict(rol_id,pantalla) do update set puede_ver=true,puede_crear=true,puede_editar=true,puede_anular=true;

do $guides$
declare v_inside uuid; v_outside uuid;
begin
 select id into v_inside from public.sociedades where empresa_id='emp_20601829101' and id=(select sociedad_dentro from rutas_dry_run_usuario_scope) limit 1;
 select id into v_outside from public.sociedades where empresa_id='emp_20601829101' and id<>v_inside order by id limit 1;
 if v_inside is null or v_outside is null then raise exception 'RUTAS_DRY_RUN: faltan dos sociedades'; end if;
 create temporary table rutas_dry_run_sociedades(sociedad_dentro uuid not null,sociedad_fuera uuid not null) on commit drop;
 insert into rutas_dry_run_sociedades values(v_inside,v_outside);
 insert into public.guias_remision(id,empresa_id,serie,numero,numero_completo,fecha_emision,fecha_inicio_traslado,tipo_origen,motivo_traslado,modalidad,sociedad_origen_id,partida_direccion,llegada_direccion,estado)
 values('guia_dry_run_rutas_servicio','emp_20601829101','TDR',999999,'TDR-999999',current_date,current_date,'despacho_servicio','01','remitente',v_inside,'Fixture dentro','Destino dentro','emitida');
 insert into public.guias_remision(id,empresa_id,serie,numero,numero_completo,fecha_emision,fecha_inicio_traslado,tipo_origen,motivo_traslado,modalidad,sociedad_origen_id,partida_direccion,llegada_direccion,estado)
 values('guia_dry_run_rutas_fuera_alcance','emp_20601829101','TDR',999998,'TDR-999998',current_date,current_date,'despacho_servicio','01','remitente',v_outside,'Fixture fuera','Destino fuera','emitida');
end
$guides$;

create temporary table rutas_dry_run_transitos as select id,estado from public.orden_compra_transitos where empresa_id='emp_20601829101' and id in('oct_1781549868389','oct_1781546632874','oct_1781547780919');
select 'BEFORE' as snapshot,id,estado from rutas_dry_run_transitos order by id;
do $three$
begin if(select count(*) from rutas_dry_run_transitos)<>3 then raise exception 'RUTAS_DRY_RUN: faltan transitos reales'; end if; end
$three$;

insert into public.rutas(id,empresa_id,codigo,fecha,estado,observaciones) values('ruta_dry_run_fase_2','emp_20601829101','RUTA-DRY-RUTAS',current_date,'planificada','3 transitos y guia dentro');
insert into public.ruta_paradas(id,empresa_id,ruta_id,secuencia,tipo_documento,documento_id) values
 ('parada_dry_run_01','emp_20601829101','ruta_dry_run_fase_2',1,'orden_compra_transito','oct_1781549868389'),
 ('parada_dry_run_02','emp_20601829101','ruta_dry_run_fase_2',2,'orden_compra_transito','oct_1781546632874'),
 ('parada_dry_run_03','emp_20601829101','ruta_dry_run_fase_2',3,'orden_compra_transito','oct_1781547780919'),
 ('parada_dry_run_04','emp_20601829101','ruta_dry_run_fase_2',4,'guia_remision','guia_dry_run_rutas_servicio');
update public.ruta_paradas set estado='completada',llegada_at=now(),salida_at=now(),updated_at=now() where ruta_id='ruta_dry_run_fase_2';
update public.rutas set estado='completada',hora_salida=now(),hora_cierre=now(),updated_at=now() where id='ruta_dry_run_fase_2';
insert into public.rutas(id,empresa_id,codigo,fecha,estado) values('ruta_dry_run_transitos_only','emp_20601829101','RUTA-DRY-TRANSITOS',current_date,'planificada');
insert into public.ruta_paradas(id,empresa_id,ruta_id,secuencia,tipo_documento,documento_id) values('parada_dry_run_transito_only','emp_20601829101','ruta_dry_run_transitos_only',1,'orden_compra_transito','oct_1781549868389');
insert into public.rutas(id,empresa_id,codigo,fecha,estado) values('ruta_dry_run_fuera_alcance','emp_20601829101','RUTA-DRY-FUERA',current_date,'planificada');
insert into public.ruta_paradas(id,empresa_id,ruta_id,secuencia,tipo_documento,documento_id) values('parada_dry_run_fuera_alcance','emp_20601829101','ruta_dry_run_fuera_alcance',1,'guia_remision','guia_dry_run_rutas_fuera_alcance');

select 'AFTER' as snapshot,t.id,t.estado from public.orden_compra_transitos t where t.empresa_id='emp_20601829101' and t.id in('oct_1781549868389','oct_1781546632874','oct_1781547780919') order by t.id;
select set_config('request.jwt.claim.sub',(select user_id::text from rutas_dry_run_usuario_scope limit 1),true);
grant select on rutas_dry_run_usuario_scope,rutas_dry_run_sociedades to authenticated;
set local role authenticated;
select 'VISIBLE_ROUTE' as check_name,r.id,r.empresa_id from public.rutas r where r.id='ruta_dry_run_fase_2';
select 'VISIBLE_STOPS' as check_name,rp.id,rp.tipo_documento,rp.documento_id from public.ruta_paradas rp where rp.ruta_id='ruta_dry_run_fase_2' order by rp.secuencia;
select 'HIDDEN_ROUTE_COUNT' as check_name,count(*) as visible_rows from public.rutas where id='ruta_dry_run_fuera_alcance';
select 'HIDDEN_STOP_COUNT' as check_name,count(*) as visible_rows from public.ruta_paradas where id='parada_dry_run_fuera_alcance';
select 'SOCIETY_SCOPE_VISIBILITY' as check_name,(select user_id from rutas_dry_run_usuario_scope limit 1) as user_id,(select sociedad_dentro from rutas_dry_run_sociedades) as sociedad_dentro,(select sociedad_fuera from rutas_dry_run_sociedades) as sociedad_fuera,(select count(*) from public.rutas where id='ruta_dry_run_fase_2') as mixed_route_visible,(select count(*) from public.rutas where id='ruta_dry_run_transitos_only') as transit_only_route_visible,(select count(*) from public.rutas where id='ruta_dry_run_fuera_alcance') as outside_route_visible,(select count(*) from public.ruta_paradas where ruta_id='ruta_dry_run_fase_2') as mixed_stops_visible,(select count(*) from public.ruta_paradas where ruta_id='ruta_dry_run_fuera_alcance') as outside_stops_visible;
do $scope$
declare v_mixed integer;v_transit integer;v_outside integer;v_stops integer;
begin
 select count(*) into v_mixed from public.rutas where id='ruta_dry_run_fase_2'; select count(*) into v_transit from public.rutas where id='ruta_dry_run_transitos_only'; select count(*) into v_outside from public.rutas where id='ruta_dry_run_fuera_alcance'; select count(*) into v_stops from public.ruta_paradas where ruta_id='ruta_dry_run_fase_2';
 if v_mixed<>1 or v_transit<>1 or v_outside<>0 or v_stops<>4 then raise exception 'RUTAS_DRY_RUN: fallo de visibilidad'; end if;
end
$scope$;
reset role;

do $maintenance$
begin
 insert into public.vehiculos_transporte(id,empresa_id,placa,marca,modelo,activo) values('vehiculo_dry_run_rutas','emp_20601829101','DRY-RUTAS','Fixture','Temporal',true);
 insert into public.mantenimientos_flota(id,empresa_id,vehiculo_id,tipo_mantenimiento,fecha,costo,moneda,taller_proveedor,kilometraje,proximo_mantenimiento_fecha,orden_compra_id,observaciones)
 values('mantenimiento_dry_run_rutas','emp_20601829101','vehiculo_dry_run_rutas','preventivo',current_date,1,'PEN','Fixture dry run',1,current_date+180,null,'Fixture temporal');
end
$maintenance$;

select tablename,policyname,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in('orden_compra_transitos','rutas','ruta_paradas','mantenimientos_flota') order by tablename,policyname;
select c.conname,ref.relname as tabla_referenciada from pg_constraint c join pg_class ref on ref.oid=c.confrelid
where c.conrelid='public.mantenimientos_flota'::regclass order by c.conname;
select tg.tgname,pg_get_triggerdef(tg.oid) as trigger_definition from pg_trigger tg join pg_class rel on rel.oid=tg.tgrelid
where rel.relnamespace='public'::regnamespace and rel.relname in('orden_compra_transitos','rutas','ruta_paradas','mantenimientos_flota') and not tg.tgisinternal order by rel.relname,tg.tgname;

rollback;
