-- Dry run completo. Comando literal:
-- psql -X -v ON_ERROR_STOP=1 -f supabase/tests/20260929100000_diagnostico_tecnico_fase2_dry_run.sql "host=aws-1-us-west-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.atqwyjfidfoepthygfoo sslmode=require"
-- No aplicar: termina siempre con ROLLBACK.
\set ECHO all
begin;
set local role postgres;
create temp table dry_results(prueba text primary key,ok boolean,esperado_exito boolean,sql_ejecutado text,sqlerrm text,detalle text);
create or replace function pg_temp.dry_save(p_prueba text,p_esperado_exito boolean,p_sql text,p_exito boolean,p_sqlerrm text,p_detalle text) returns void language plpgsql security definer set search_path=pg_temp as $$
begin insert into dry_results values(p_prueba,p_exito=p_esperado_exito,p_esperado_exito,p_sql,p_sqlerrm,p_detalle); end $$;
grant insert on dry_results to authenticated;
grant select on dry_results to authenticated;
grant execute on function pg_temp.dry_save(text,boolean,text,boolean,text,text) to public;

create temp table dry_catalog_before as select e.id empresa_id,e.nombre_comercial,(select count(*) from public.tipos_servicio_interno t where t.empresa_id=e.id) tipos,(select count(*) from public.familia_trabajo f where f.empresa_id=e.id) familias from public.empresas e where not e.es_plataforma;
create temp table dry_costeo_before as select (select count(*) from public.hoja_costeo_lineas_mano_obra) mo,(select count(*) from public.hoja_costeo_lineas_activos) activos,(select count(*) from public.hoja_costeo_lineas_materiales) materiales;
create temp table dry_rpc_before as select p.oid::text oid,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%aprobar%hoja%costeo%';
create temp table dry_default_function_before as select p.oid::text oid,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='asignar_permisos_default_a_rol' and pg_get_function_identity_arguments(p.oid)='p_rol_id text, p_tipo_rol text';
select public.asignar_permisos_default_a_rol('rol_emp_20601829101_admin','admin');
select public.asignar_permisos_default_a_rol('rol_emp_20601829101_ops_jefe','ops_jefe');
select public.asignar_permisos_default_a_rol('rol_emp_20601829101_ops_tecnico','ops_tecnico');
create temp table dry_default_before as select pr.* from public.permisos_roles pr where pr.rol_id in('rol_emp_20601829101_admin','rol_emp_20601829101_ops_jefe','rol_emp_20601829101_ops_tecnico') and pr.pantalla<>'diagnostico_tecnico';
\i supabase/migrations/20260929100000_diagnostico_tecnico_fase2.sql
savepoint t_defaults;
select public.asignar_permisos_default_a_rol('rol_emp_20601829101_admin','admin');
select public.asignar_permisos_default_a_rol('rol_emp_20601829101_ops_jefe','ops_jefe');
select public.asignar_permisos_default_a_rol('rol_emp_20601829101_ops_tecnico','ops_tecnico');
do $$ declare v_ok boolean; v_err text; v_sql text:='select asignar_permisos_default_a_rol for admin, ops_jefe and ops_tecnico'; begin begin
 v_ok:=
 exists(select 1 from public.permisos_roles where rol_id='rol_emp_20601829101_admin' and pantalla='diagnostico_tecnico' and puede_ver and puede_crear and puede_editar and puede_anular and puede_aprobar and puede_exportar and puede_ver_costos and puede_ver_finanzas)
 and exists(select 1 from public.permisos_roles where rol_id='rol_emp_20601829101_ops_jefe' and pantalla='diagnostico_tecnico' and puede_ver and puede_crear and puede_editar and puede_aprobar and not puede_anular and not puede_exportar and not puede_ver_costos and not puede_ver_finanzas)
 and exists(select 1 from public.permisos_roles where rol_id='rol_emp_20601829101_ops_tecnico' and pantalla='diagnostico_tecnico' and puede_ver and puede_crear and puede_editar and not puede_aprobar and not puede_anular and not puede_exportar and not puede_ver_costos and not puede_ver_finanzas)
 and (select count(*) from public.permisos_roles where rol_id in('rol_emp_20601829101_admin','rol_emp_20601829101_ops_jefe','rol_emp_20601829101_ops_tecnico') and pantalla<>'diagnostico_tecnico')=(select count(*) from dry_default_before);
 exception when others then v_err:=sqlerrm; v_ok:=false; end; perform pg_temp.dry_save('defaults_admin_ops_jefe_ops_tecnico',true,v_sql,v_ok,v_err,'mismas filas previas mas diagnostico_tecnico'); end $$;
release savepoint t_defaults;

-- Referencias reales para fixtures y pruebas.
create temp table dry_refs as
select
 (select id from familia_trabajo where empresa_id='emp_20513453711' limit 1) as wh_familia,
 (select id from familia_trabajo where empresa_id='emp_2000000000' limit 1) as other_familia,
 (select id from tipos_servicio_interno where empresa_id='emp_20513453711' limit 1) as wh_tarea,
 (select id from tipos_servicio_interno where empresa_id='emp_20513453711' offset 1 limit 1) as wh_actividad,
 (select id from tipos_servicio_interno where empresa_id='emp_20541435833' limit 1) as other_tarea,
 (select id from cargos_empresa where empresa_id='emp_20513453711' limit 1) as wh_cargo,
 (select id from cargos_empresa where empresa_id='emp_20541435833' limit 1) as other_cargo,
 (select id from materiales where empresa_id='emp_20513453711' limit 1) as wh_material,
 (select id from materiales where empresa_id='emp_20541435833' limit 1) as other_material,
 (select id from activos where empresa_id='emp_20513453711' and propietario_tipo='propio' and cliente_propietario_id is null limit 1) as wh_activo_propio,
 (select id from activos where empresa_id='emp_20513453711' and propietario_tipo='cliente' limit 1) as wh_activo_cliente,
 (select id from recepciones_activos_cliente where id='rac_9d179189e96042ec8550f5406f16521f') as wh_rac,
 (select id from oportunidades where id='opp_332015') as wh_opp,
 (select id from oportunidades where empresa_id='emp_20541435833' limit 1) as other_opp,
 (select id from recepciones_activos_cliente where empresa_id='emp_20541435833' limit 1) as other_rac,
 (select id from recepciones_activos_cliente where empresa_id='emp_2000000000' limit 1) as prueba_rac,
 (select id from oportunidades where empresa_id='emp_2000000000' limit 1) as prueba_opp,
 (select id from recepciones_activos_cliente where empresa_id='emp_20541435833' and sociedad_id='b7379adf-a7bd-4883-ac32-f60271ed7b3b' limit 1) as zahory_rac,
 'rac_dry_zahory_allowed'::text as zahory_rac_allowed,
 (select id from oportunidades where empresa_id='emp_20606120487' limit 1) as ingetec_opp,
 (select ue.user_id from usuarios_empresas ue where ue.rol_id='rol_emp_20606120487_ops_jefe' and ue.estado='activo' order by ue.user_id limit 1) as ingetec_ops_jefe_user;
grant select on dry_refs to authenticated;
select * from dry_refs;

-- Fixtures: se crean como postgres dentro de la misma transaccion y se deshacen al final.
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
insert into public.recepciones_activos_cliente(id,empresa_id,numero,activo_id,sociedad_id,estado_custodia)
select 'rac_dry_zahory_allowed','emp_20541435833','RAC-DRY-SOCIETY-C133',r.activo_id,'c13395ae-55ba-49b3-89c4-c1c1c96223fe','recibido'
from public.recepciones_activos_cliente r where r.id='rac_2c60dea53f2e44558f930a6884590715';
insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,recepcion_id,estado,elaborado_por) select 'dt_dry_m_draft','emp_20513453711','mantenimiento',wh_rac,'borrador','03cb9bb6-cd70-4463-81a0-a97b3bb7efae'::uuid from dry_refs;
insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,oportunidad_id,estado,elaborado_por) select 'dt_dry_f_draft','emp_20513453711','fabricacion',wh_opp,'borrador','03cb9bb6-cd70-4463-81a0-a97b3bb7efae'::uuid from dry_refs;
insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,recepcion_id,estado,elaborado_por) select 'dt_dry_emit','emp_20513453711','mantenimiento',wh_rac,'borrador','03cb9bb6-cd70-4463-81a0-a97b3bb7efae'::uuid from dry_refs;
insert into public.diagnostico_tecnico_lineas(id,empresa_id,diagnostico_id,familia_trabajo_id,actividad_id,tarea_id,cargo_id,hallazgo) select '10000000-0000-0000-0000-000000000001','emp_20513453711','dt_dry_m_draft',wh_familia,wh_actividad,wh_tarea,wh_cargo,'fixture draft' from dry_refs;
insert into public.diagnostico_tecnico_lineas(id,empresa_id,diagnostico_id,familia_trabajo_id,actividad_id,tarea_id,cargo_id,hallazgo) select '10000000-0000-0000-0000-000000000002','emp_20513453711','dt_dry_emit',wh_familia,wh_actividad,wh_tarea,wh_cargo,'fixture emit' from dry_refs;
insert into public.diagnostico_tecnico_linea_materiales(id,empresa_id,linea_id,material_id,descripcion) select '20000000-0000-0000-0000-000000000001','emp_20513453711','10000000-0000-0000-0000-000000000001',wh_material,'fixture material draft' from dry_refs;
insert into public.diagnostico_tecnico_linea_materiales(id,empresa_id,linea_id,material_id,descripcion) select '20000000-0000-0000-0000-000000000002','emp_20513453711','10000000-0000-0000-0000-000000000002',wh_material,'fixture material emit' from dry_refs;
update public.diagnosticos_tecnicos set estado='emitido' where id='dt_dry_emit';
insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,oportunidad_id,estado,elaborado_por) select 'dt_dry_other','emp_20513453711','fabricacion',wh_opp,'borrador','03cb9bb6-cd70-4463-81a0-a97b3bb7efae'::uuid from dry_refs;
insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,oportunidad_id,estado,elaborado_por) select 'dt_dry_prueba','emp_2000000000','fabricacion',prueba_opp,'borrador','58d38046-8c04-4190-a9e7-eec2db0f1752'::uuid from dry_refs where prueba_opp is not null;
insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,recepcion_id,estado,elaborado_por) select 'dt_dry_zahory','emp_20541435833','mantenimiento',zahory_rac,'borrador','3752e906-ded9-4f6a-8845-286fe5215356'::uuid from dry_refs where zahory_rac is not null;
insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,recepcion_id,estado,elaborado_por) select 'dt_dry_zahory_allowed','emp_20541435833','mantenimiento',zahory_rac_allowed,'borrador','3752e906-ded9-4f6a-8845-286fe5215356'::uuid from dry_refs where zahory_rac_allowed is not null;
insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,oportunidad_id,estado,elaborado_por) select 'dt_dry_delete_cascade','emp_20513453711','fabricacion',wh_opp,'borrador','03cb9bb6-cd70-4463-81a0-a97b3bb7efae'::uuid from dry_refs;
insert into public.diagnostico_tecnico_lineas(id,empresa_id,diagnostico_id,familia_trabajo_id,actividad_id,tarea_id,cargo_id,hallazgo) select '10000000-0000-0000-0000-000000000003','emp_20513453711','dt_dry_delete_cascade',wh_familia,wh_actividad,wh_tarea,wh_cargo,'fixture cascade' from dry_refs;
insert into public.diagnostico_tecnico_linea_materiales(id,empresa_id,linea_id,material_id,descripcion) select '20000000-0000-0000-0000-000000000003','emp_20513453711','10000000-0000-0000-0000-000000000003',wh_material,'fixture cascade material' from dry_refs;
insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,oportunidad_id,estado,elaborado_por) select 'dt_dry_ingetec_emit','emp_20606120487','fabricacion',ingetec_opp,'borrador',ingetec_ops_jefe_user from dry_refs where ingetec_opp is not null and ingetec_ops_jefe_user is not null;
update public.diagnosticos_tecnicos set estado='emitido' where id='dt_dry_ingetec_emit';

-- Cada caso: savepoint, role authenticated, JWT real, bloque BEGIN/EXCEPTION, SQLERRM real y ok calculado.
savepoint t_rpc_cap;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare a public.tipos_servicio_interno; b public.tipos_servicio_interno; v_ok boolean:=false; v_err text; v_sql text:='select buscar_o_crear_tipo_servicio_interno(empresa_id, nombre) twice with different capitalization'; begin begin select * into a from public.buscar_o_crear_tipo_servicio_interno('emp_20513453711','Dry Run Unique Tsi'); select * into b from public.buscar_o_crear_tipo_servicio_interno('emp_20513453711','  dry   run   unique tsi  '); v_ok:=a.id=b.id and a.clasificacion='General' and (select count(*)=1 from public.tipos_servicio_interno where empresa_id='emp_20513453711' and lower(btrim(regexp_replace(nombre,'\s+',' ','g')))=lower('dry run unique tsi')); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('buscar_o_crear_otra_capitalizacion',true,v_sql,v_ok,v_err,format('first_id=%s second_id=%s',a.id,b.id)); end $$;
release savepoint t_rpc_cap;
set local role none;
delete from public.tipos_servicio_interno where empresa_id='emp_20513453711' and lower(btrim(regexp_replace(nombre,'\s+',' ','g')))='dry run unique tsi';

savepoint t_rpc_conc;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare a public.tipos_servicio_interno; b public.tipos_servicio_interno; v_ok boolean:=false; v_err text; v_sql text:='two real calls for the same normalized name (advisory xact lock)'; begin begin select * into a from public.buscar_o_crear_tipo_servicio_interno('emp_20513453711','Dry Concurrent Tsi'); select * into b from public.buscar_o_crear_tipo_servicio_interno('emp_20513453711','DRY CONCURRENT TSI'); v_ok:=a.id=b.id; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('buscar_o_crear_concurrencia',true,v_sql,v_ok,v_err,format('id_a=%s id_b=%s',a.id,b.id)); end $$;
release savepoint t_rpc_conc;
set local role none;
delete from public.tipos_servicio_interno where empresa_id='emp_20513453711' and lower(btrim(regexp_replace(nombre,'\s+',' ','g')))='dry concurrent tsi';

savepoint t_rpc_familia;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare a public.familia_trabajo; b public.familia_trabajo; v_ok boolean:=false; v_err text; v_sql text:='select buscar_o_crear_familia_trabajo twice with normalized capitalization'; begin begin select * into a from public.buscar_o_crear_familia_trabajo('emp_20513453711','Dry Run Unique Familia'); select * into b from public.buscar_o_crear_familia_trabajo('emp_20513453711',' dry   run unique familia '); v_ok:=a.id=b.id and a.activo and (select count(*)=1 from public.familia_trabajo where empresa_id='emp_20513453711' and lower(btrim(regexp_replace(nombre,'\s+',' ','g')))=lower('dry run unique familia')); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('buscar_o_crear_familia_exito',true,v_sql,v_ok,v_err,format('first_id=%s second_id=%s',a.id,b.id)); end $$;
release savepoint t_rpc_familia;
set local role none;
delete from public.familia_trabajo where empresa_id='emp_20513453711' and lower(btrim(regexp_replace(nombre,'\s+',' ','g')))='dry run unique familia';

savepoint t_rpc_other;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='select buscar_o_crear_familia_trabajo(empresa PRUEBA, nombre nuevo) as otro_tenant'; begin begin perform public.buscar_o_crear_familia_trabajo('emp_2000000000','Debe Fallar Otro Tenant'); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('buscar_o_crear_otro_tenant',false,v_sql,v_ok,v_err,'La operacion debia ser rechazada.'); end $$;
release savepoint t_rpc_other;

savepoint t_rpc_anon;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='select buscar_o_crear_tipo_servicio_interno(...) as anonimo'; begin begin perform public.buscar_o_crear_tipo_servicio_interno('emp_20513453711','Anonimo'); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('anon_no_ejecuta_rpc',false,v_sql,v_ok,v_err,'Debe existir SQLERRM de permiso o autenticacion.'); end $$;
set local role none;
release savepoint t_rpc_anon;

savepoint t_cross_family;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='insert linea WHYNCO con familia_trabajo_id de ZAHORY'; begin begin insert into public.diagnostico_tecnico_lineas(empresa_id,diagnostico_id,familia_trabajo_id,tarea_id) select 'emp_20513453711','dt_dry_m_draft',other_familia,wh_tarea from dry_refs; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('cross_tenant_familia_linea',false,v_sql,v_ok,v_err,'Debe rechazar la familia de otro tenant.'); end $$;
release savepoint t_cross_family;

savepoint t_cross_activity;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='insert linea WHYNCO con actividad_id de ZAHORY'; begin begin insert into public.diagnostico_tecnico_lineas(empresa_id,diagnostico_id,familia_trabajo_id,actividad_id,tarea_id) select 'emp_20513453711','dt_dry_m_draft',wh_familia,other_tarea,wh_tarea from dry_refs; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('cross_tenant_actividad_linea',false,v_sql,v_ok,v_err,'Debe rechazar la actividad de otro tenant.'); end $$;
release savepoint t_cross_activity;

savepoint t_cross_task;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='insert linea WHYNCO con tarea_id de ZAHORY'; begin begin insert into public.diagnostico_tecnico_lineas(empresa_id,diagnostico_id,familia_trabajo_id,tarea_id) select 'emp_20513453711','dt_dry_m_draft',wh_familia,other_tarea from dry_refs; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('cross_tenant_tarea_linea',false,v_sql,v_ok,v_err,'Debe rechazar la tarea de otro tenant.'); end $$;
release savepoint t_cross_task;

savepoint t_cross_cargo;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='insert linea WHYNCO con cargo_id de ZAHORY'; begin begin insert into public.diagnostico_tecnico_lineas(empresa_id,diagnostico_id,familia_trabajo_id,tarea_id,cargo_id) select 'emp_20513453711','dt_dry_m_draft',wh_familia,wh_tarea,other_cargo from dry_refs; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('cross_tenant_cargo_linea',false,v_sql,v_ok,v_err,'Debe rechazar el cargo de otro tenant.'); end $$;
release savepoint t_cross_cargo;

savepoint t_cross_asset;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='insert linea WHYNCO con activo cliente (propietario_tipo=cliente)'; begin begin insert into public.diagnostico_tecnico_lineas(empresa_id,diagnostico_id,familia_trabajo_id,tarea_id,activo_id,horas_maquina) select 'emp_20513453711','dt_dry_m_draft',wh_familia,wh_tarea,wh_activo_cliente,1 from dry_refs; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('activo_de_cliente_no_maquina',false,v_sql,v_ok,v_err,'El activo propio se determina por propietario_tipo=propio y cliente_propietario_id IS NULL.'); end $$;
release savepoint t_cross_asset;

savepoint t_cross_material;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='insert material de linea WHYNCO con material_id de ZAHORY'; begin begin insert into public.diagnostico_tecnico_linea_materiales(empresa_id,linea_id,material_id,descripcion) select 'emp_20513453711','10000000-0000-0000-0000-000000000001',other_material,'cross tenant' from dry_refs; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('cross_tenant_material',false,v_sql,v_ok,v_err,'Debe rechazar el material de otro tenant.'); end $$;
release savepoint t_cross_material;

savepoint t_move_line;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='update linea draft set diagnostico_id=otro diagnostico'; begin begin update public.diagnostico_tecnico_lineas set diagnostico_id='dt_dry_other' where id='10000000-0000-0000-0000-000000000001'; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('mover_linea_otro_diagnostico',false,v_sql,v_ok,v_err,'Debe rechazar el movimiento de diagnostico.'); end $$;
release savepoint t_move_line;

savepoint t_parent_other;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare m boolean; f boolean; v_ok boolean:=false; v_err text; v_sql text:='select usuario_puede_ver_diagnostico_padre para RAC y oportunidad de otro tenant'; begin begin select public.usuario_puede_ver_diagnostico_padre('mantenimiento','emp_2000000000',prueba_rac,null),public.usuario_puede_ver_diagnostico_padre('fabricacion','emp_2000000000',null,prueba_opp) into m,f from dry_refs; v_ok:=not m and not f; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('referencias_padre_otro_tenant_false',true,v_sql,v_ok,v_err,format('rac=false=%s opp=false=%s',not m,not f)); end $$;
release savepoint t_parent_other;

savepoint t_material_draft_insert;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_id uuid:=gen_random_uuid(); v_sql text:='insert material on draft line'; begin begin insert into public.diagnostico_tecnico_linea_materiales(id,empresa_id,linea_id,material_id,descripcion) select v_id,'emp_20513453711','10000000-0000-0000-0000-000000000001',wh_material,'draft insert' from dry_refs; v_ok:=exists(select 1 from public.diagnostico_tecnico_linea_materiales where id=v_id); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('material_draft_insert_permitido',true,v_sql,v_ok,v_err,format('id=%s',v_id)); end $$;
release savepoint t_material_draft_insert;

savepoint t_material_draft_update;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='update material draft set cantidad=2'; begin begin update public.diagnostico_tecnico_linea_materiales set cantidad=2 where id='20000000-0000-0000-0000-000000000001'; v_ok=(select cantidad=2 from public.diagnostico_tecnico_linea_materiales where id='20000000-0000-0000-0000-000000000001'); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('material_draft_update_permitido',true,v_sql,v_ok,v_err,'cantidad=2'); end $$;
release savepoint t_material_draft_update;

savepoint t_material_draft_delete;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='delete material draft'; begin begin delete from public.diagnostico_tecnico_linea_materiales where id='20000000-0000-0000-0000-000000000001'; v_ok=not exists(select 1 from public.diagnostico_tecnico_linea_materiales where id='20000000-0000-0000-0000-000000000001'); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('material_draft_delete_permitido',true,v_sql,v_ok,v_err,'fila eliminada'); end $$;
release savepoint t_material_draft_delete;

savepoint t_material_emit_insert;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='insert material on emitted line'; begin begin insert into public.diagnostico_tecnico_linea_materiales(empresa_id,linea_id,material_id,descripcion) select 'emp_20513453711','10000000-0000-0000-0000-000000000002',wh_material,'must fail emitted' from dry_refs; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('material_emit_insert_rechazado',false,v_sql,v_ok,v_err,'Debe capturar el mensaje real del trigger.'); end $$;
release savepoint t_material_emit_insert;

savepoint t_material_emit_update;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='update material emitted set cantidad=3'; begin begin update public.diagnostico_tecnico_linea_materiales set cantidad=3 where id='20000000-0000-0000-0000-000000000002'; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('material_emit_update_rechazado',false,v_sql,v_ok,v_err,'Debe capturar el mensaje real del trigger.'); end $$;
release savepoint t_material_emit_update;

savepoint t_material_emit_delete;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='delete material emitted'; begin begin delete from public.diagnostico_tecnico_linea_materiales where id='20000000-0000-0000-0000-000000000002'; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('material_emit_delete_rechazado',false,v_sql,v_ok,v_err,'Debe capturar el mensaje real del trigger.'); end $$;
release savepoint t_material_emit_delete;

savepoint t_update_emit_header;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='update public.diagnosticos_tecnicos set activo_id=wh_activo_propio where id=dt_dry_emit'; begin begin update public.diagnosticos_tecnicos set activo_id=(select wh_activo_propio from dry_refs) where id='dt_dry_emit'; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('update_emitido_cabecera_activo',false,v_sql,v_ok,v_err,'Campo de contenido; no modifica estado.'); end $$;
release savepoint t_update_emit_header;

savepoint t_update_emit_line;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='update public.diagnostico_tecnico_lineas set hallazgo=... where linea emitida'; begin begin update public.diagnostico_tecnico_lineas set hallazgo='cambio rechazado' where id='10000000-0000-0000-0000-000000000002'; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('update_emitido_linea_hallazgo',false,v_sql,v_ok,v_err,'Campo de contenido de linea; rechazado por trigger.'); end $$;
release savepoint t_update_emit_line;

savepoint t_delete_emit_header;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='delete from public.diagnosticos_tecnicos where id=dt_dry_emit'; begin begin delete from public.diagnosticos_tecnicos where id='dt_dry_emit'; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('delete_emitido_cabecera',false,v_sql,v_ok,v_err,'Debe rechazar la eliminacion de cabecera emitida.'); end $$;
release savepoint t_delete_emit_header;

savepoint t_reopen;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='update diagnostico emitido set estado=borrador sin aprobar'; begin begin update public.diagnosticos_tecnicos set estado='borrador' where id='dt_dry_emit'; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('reabrir_sin_aprobar',false,v_sql,v_ok,v_err,'Debe mostrar el mensaje real de reabrir.'); end $$;
release savepoint t_reopen;

savepoint t_immutable;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='update draft set elaborado_por,tipo,recepcion_id,oportunidad_id (campos protegidos)'; begin begin update public.diagnosticos_tecnicos set elaborado_por='03cb9bb6-cd70-4463-81a0-a97b3bb7efae'::uuid,tipo='fabricacion',recepcion_id=null,oportunidad_id=(select wh_opp from dry_refs) where id='dt_dry_m_draft'; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('campos_cabecera_protegidos',false,v_sql,v_ok,v_err,'Debe rechazar los cuatro campos inmutables.'); end $$;
release savepoint t_immutable;

savepoint t_template_cross;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='insert plantilla con actividad/tarea de empresas distintas'; begin begin insert into public.plantillas_actividad(empresa_id,actividad_id,tarea_id) select 'emp_20513453711',wh_actividad,other_tarea from dry_refs; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('plantilla_referencia_entre_empresas',false,v_sql,v_ok,v_err,'Debe rechazar referencia cross-tenant.'); end $$;
release savepoint t_template_cross;

savepoint t_template_self;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='insert plantilla con actividad_id=tarea_id'; begin begin insert into public.plantillas_actividad(empresa_id,actividad_id,tarea_id) select 'emp_20513453711',wh_tarea,wh_tarea from dry_refs; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('plantilla_autorreferencia',false,v_sql,v_ok,v_err,'Debe rechazar autorreferencia.'); end $$;
release savepoint t_template_self;

savepoint t_ops_m;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='ops_tecnico INSERT y UPDATE de diagnostico mantenimiento real'; begin begin insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,recepcion_id,estado,elaborado_por) select 'dt_dry_ops_m','emp_20513453711','mantenimiento',wh_rac,'borrador','03cb9bb6-cd70-4463-81a0-a97b3bb7efae'::uuid from dry_refs; update public.diagnosticos_tecnicos set activo_id=(select wh_activo_propio from dry_refs) where id='dt_dry_ops_m'; v_ok=exists(select 1 from public.diagnosticos_tecnicos where id='dt_dry_ops_m'); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('tecnico_crea_edita_mantenimiento',true,v_sql,v_ok,v_err,'rol ops_tecnico sin pipeline ni recepcion_activos_cliente'); end $$;
release savepoint t_ops_m;

savepoint t_ops_f;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='ops_tecnico INSERT y UPDATE de diagnostico fabricacion real'; begin begin insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,oportunidad_id,estado,elaborado_por) select 'dt_dry_ops_f','emp_20513453711','fabricacion',wh_opp,'borrador','03cb9bb6-cd70-4463-81a0-a97b3bb7efae'::uuid from dry_refs; update public.diagnosticos_tecnicos set activo_id=(select wh_activo_propio from dry_refs) where id='dt_dry_ops_f'; v_ok=exists(select 1 from public.diagnosticos_tecnicos where id='dt_dry_ops_f'); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('tecnico_crea_edita_fabricacion',true,v_sql,v_ok,v_err,'rol ops_tecnico tenant WHYNCO'); end $$;
release savepoint t_ops_f;

-- Evidencia literal del alcance de sociedad y del permiso efectivo del usuario 3752e906.
savepoint t_society_evidence;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"3752e906-ded9-4f6a-8845-286fe5215356","role":"authenticated"}',true);
select public.usuario_alcance_sociedades('emp_20541435833') as sociedades_permitidas,
       public.usuario_puede('emp_20541435833','diagnostico_tecnico','ver') as permiso_ver_diagnostico_tecnico;
release savepoint t_society_evidence;

savepoint t_ops_jefe_reopen;
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select ingetec_ops_jefe_user::text from dry_refs),'role','authenticated')::text,true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='update diagnostico emitido INGETEC set estado=borrador como ops_jefe'; begin begin update public.diagnosticos_tecnicos set estado='borrador' where id='dt_dry_ingetec_emit'; v_ok=exists(select 1 from public.diagnosticos_tecnicos where id='dt_dry_ingetec_emit' and estado='borrador' and emitido_por is null and emitido_en is null); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('ops_jefe_reabre_emitido',true,v_sql,v_ok,v_err,'Debe quedar estado=borrador, emitido_por=NULL y emitido_en=NULL.'); end $$;
release savepoint t_ops_jefe_reopen;

savepoint t_tecnico_emit;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='update diagnostico borrador WHYNCO set estado=emitido como tecnico 03cb9bb6'; begin begin update public.diagnosticos_tecnicos set estado='emitido' where id='dt_dry_f_draft'; v_ok=exists(select 1 from public.diagnosticos_tecnicos where id='dt_dry_f_draft' and estado='emitido' and emitido_por='03cb9bb6-cd70-4463-81a0-a97b3bb7efae'::uuid and emitido_en is not null); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('tecnico_pasa_borrador_a_emitido',true,v_sql,v_ok,v_err,'Debe registrar emitido_por con el UUID del técnico.'); end $$;
release savepoint t_tecnico_emit;

savepoint t_tecnico_delete_cascade;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_sql text:='delete diagnostico borrador WHYNCO con linea y material como tecnico 03cb9bb6'; begin begin delete from public.diagnosticos_tecnicos where id='dt_dry_delete_cascade'; v_ok=not exists(select 1 from public.diagnosticos_tecnicos where id='dt_dry_delete_cascade') and not exists(select 1 from public.diagnostico_tecnico_lineas where id='10000000-0000-0000-0000-000000000003') and not exists(select 1 from public.diagnostico_tecnico_linea_materiales where id='20000000-0000-0000-0000-000000000003'); exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('tecnico_borra_borrador_cascada',true,v_sql,v_ok,v_err,'Debe eliminar cabecera, línea y material por ON DELETE CASCADE.'); end $$;
release savepoint t_tecnico_delete_cascade;

savepoint t_restricted_society;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"3752e906-ded9-4f6a-8845-286fe5215356","role":"authenticated"}',true);
do $$ declare n bigint; v_ok boolean:=false; v_err text; v_sql text:='select diagnosticos_tecnicos for restricted society user against real reception'; begin begin select count(*) into n from public.diagnosticos_tecnicos where id='dt_dry_zahory'; v_ok=n=0; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('rls_sociedad_restringida',true,v_sql,v_ok,v_err,format('visible_rows=%s; user=3752e906-ded9-4f6a-8845-286fe5215356; sociedad permitida distinta',n)); end $$;
release savepoint t_restricted_society;

savepoint t_society_positive_negative;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"3752e906-ded9-4f6a-8845-286fe5215356","role":"authenticated"}',true);
do $$ declare v_allowed bigint:=0; v_foreign bigint:=0; v_ok boolean:=false; v_err text; v_soc text; v_ver boolean:=false; v_sql text:='select diagnosticos_tecnicos: recepcion de sociedad propia count=1 y sociedad ajena count=0'; begin begin select public.usuario_alcance_sociedades('emp_20541435833')::text, public.usuario_puede('emp_20541435833','diagnostico_tecnico','ver') into v_soc,v_ver; select count(*) into v_allowed from public.diagnosticos_tecnicos where id='dt_dry_zahory_allowed'; select count(*) into v_foreign from public.diagnosticos_tecnicos where id='dt_dry_zahory'; v_ok=v_allowed=1 and v_foreign=0 and v_ver; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('rls_sociedad_propiedad_y_ajena',true,v_sql,v_ok,v_err,format('allowed_count=%s; foreign_count=%s; usuario_alcance_sociedades=%s; permiso_ver=%s; user=3752e906-ded9-4f6a-8845-286fe5215356',v_allowed,v_foreign,v_soc,v_ver)); end $$;
release savepoint t_society_positive_negative;

savepoint t_other_tenant_select;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"03cb9bb6-cd70-4463-81a0-a97b3bb7efae","role":"authenticated"}',true);
do $$ declare n bigint; v_ok boolean:=false; v_err text; v_sql text:='select diagnosticos_tecnicos PRUEBA as user WHYNCO'; begin begin select count(*) into n from public.diagnosticos_tecnicos where id='dt_dry_prueba'; v_ok=n=0; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('rls_fabricacion_otro_tenant',true,v_sql,v_ok,v_err,format('visible_rows=%s; user=03cb9bb6-cd70-4463-81a0-a97b3bb7efae',n)); end $$;
release savepoint t_other_tenant_select;

savepoint t_comercial;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"58d38046-8c04-4190-a9e7-eec2db0f1752","role":"authenticated"}',true);
do $$ declare n bigint; v_ok boolean:=false; v_err text; v_sql text:='commercial asesor SELECT own PRUEBA diagnostic, then INSERT/UPDATE/DELETE'; begin begin select count(*) into n from public.diagnosticos_tecnicos where id='dt_dry_prueba'; v_ok=n=1; begin insert into public.diagnosticos_tecnicos(id,empresa_id,tipo,oportunidad_id,estado,elaborado_por) select 'dt_comercial_fail','emp_2000000000',tipo,oportunidad_id,'borrador','58d38046-8c04-4190-a9e7-eec2db0f1752'::uuid from public.diagnosticos_tecnicos where id='dt_dry_prueba'; v_ok:=false; exception when others then v_err:=sqlerrm; end; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('comercial_solo_lee',true,v_sql,v_ok,v_err,format('select_rows=%s; insert_error=%s',n,coalesce(v_err,'none'))); end $$;
release savepoint t_comercial;
savepoint t_comercial_update;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"58d38046-8c04-4190-a9e7-eec2db0f1752","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_n bigint:=0; v_sql text:='commercial asesor UPDATE diagnostico PRUEBA'; begin begin update public.diagnosticos_tecnicos set activo_id=null where id='dt_dry_prueba'; get diagnostics v_n=ROW_COUNT; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('comercial_update_rechazado',false,v_sql,v_ok,v_err,format('row_count=%s; sqlerrm=%s; Comercial solo lee.',v_n,coalesce(v_err,'NULL'))); end $$;
release savepoint t_comercial_update;
savepoint t_comercial_delete;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"58d38046-8c04-4190-a9e7-eec2db0f1752","role":"authenticated"}',true);
do $$ declare v_ok boolean:=false; v_err text; v_n bigint:=0; v_sql text:='commercial asesor DELETE diagnostico PRUEBA'; begin begin delete from public.diagnosticos_tecnicos where id='dt_dry_prueba'; get diagnostics v_n=ROW_COUNT; exception when others then v_err:=sqlerrm; end; perform pg_temp.dry_save('comercial_delete_rechazado',false,v_sql,v_ok,v_err,format('row_count=%s; sqlerrm=%s; Comercial solo lee.',v_n,coalesce(v_err,'NULL'))); end $$;
release savepoint t_comercial_delete;
set local role none;

select * from dry_results order by prueba;
select e.nombre_comercial tenant,r.id rol_id,r.nombre rol,count(distinct ue.user_id) filter(where ue.estado='activo') usuarios_activos,pr.puede_ver,pr.puede_crear,pr.puede_editar,pr.puede_aprobar,pr.puede_anular,pr.puede_exportar,pr.puede_ver_costos,pr.puede_ver_finanzas from public.permisos_roles pr join public.roles r on r.id=pr.rol_id join public.empresas e on e.id=r.empresa_id left join public.usuarios_empresas ue on ue.rol_id=r.id where pr.pantalla='diagnostico_tecnico' and not e.es_plataforma group by e.nombre_comercial,r.id,r.nombre,pr.puede_ver,pr.puede_crear,pr.puede_editar,pr.puede_aprobar,pr.puede_anular,pr.puede_exportar,pr.puede_ver_costos,pr.puede_ver_finanzas order by e.nombre_comercial,r.nombre,r.id;
select 'permisos_roles_rol_03cb9bb6_literal' etiqueta,pr.rol_id,pr.pantalla,pr.puede_ver,pr.puede_crear,pr.puede_editar,pr.puede_anular,pr.puede_aprobar,pr.puede_exportar,pr.puede_ver_costos,pr.puede_ver_finanzas from public.permisos_roles pr where pr.rol_id='rol_emp_20513453711_ops_tecnico' and (pr.puede_ver or pr.puede_crear or pr.puede_editar or pr.puede_anular or pr.puede_aprobar or pr.puede_exportar or pr.puede_ver_costos or pr.puede_ver_finanzas) order by pr.pantalla;
select 'permission_rows_inserted' prueba,count(*) total from public.permisos_roles where pantalla='diagnostico_tecnico';
select 'permission_rows_with_no_source_flags' prueba,count(*) total from public.permisos_roles d where d.pantalla='diagnostico_tecnico' and not exists(select 1 from public.permisos_roles s where s.rol_id=d.rol_id and ((s.pantalla='ot' and (s.puede_ver or s.puede_crear or s.puede_editar or s.puede_aprobar)) or (s.pantalla='hoja_costeo' and s.puede_ver)));
select e.nombre_comercial,e.id,(select tipos from dry_catalog_before b where b.empresa_id=e.id) tipos_before,(select count(*) from public.tipos_servicio_interno t where t.empresa_id=e.id) tipos_after,(select familias from dry_catalog_before b where b.empresa_id=e.id) familias_before,(select count(*) from public.familia_trabajo f where f.empresa_id=e.id) familias_after from public.empresas e where not e.es_plataforma order by e.nombre_comercial;
select 'roles_ver_sin_flags_fuente' control,count(*) from public.permisos_roles d where d.pantalla='diagnostico_tecnico' and d.puede_ver and not exists(select 1 from public.permisos_roles s where s.rol_id=d.rol_id and ((s.pantalla='ot' and (s.puede_ver or s.puede_crear or s.puede_editar or s.puede_aprobar)) or (s.pantalla='hoja_costeo' and s.puede_ver)));
\d public.tipos_servicio_interno
\d public.familia_trabajo
\pset format unaligned
\pset fieldsep ' | '
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in('diagnosticos_tecnicos','diagnostico_tecnico_lineas','diagnostico_tecnico_linea_materiales','plantillas_actividad') order by tablename,policyname;
\pset format aligned
select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in('diagnosticos_tecnicos','diagnostico_tecnico_lineas','diagnostico_tecnico_linea_materiales','plantillas_actividad') order by c.relname;
select (select mo from dry_costeo_before) mo_before,(select count(*) from public.hoja_costeo_lineas_mano_obra) mo_after,(select activos from dry_costeo_before) activos_before,(select count(*) from public.hoja_costeo_lineas_activos) activos_after,(select materiales from dry_costeo_before) materiales_before,(select count(*) from public.hoja_costeo_lineas_materiales) materiales_after;
select b.oid before_oid,md5(b.definition) before_hash,md5(pg_get_functiondef(p.oid)) after_hash from dry_rpc_before b join pg_proc p on p.oid=b.oid::oid where b.definition<>pg_get_functiondef(p.oid);
select b.oid before_oid,md5(b.definition) before_hash,md5(pg_get_functiondef(p.oid)) after_hash from dry_default_function_before b join pg_proc p on p.oid=b.oid::oid where b.definition<>pg_get_functiondef(p.oid);
rollback;
