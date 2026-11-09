-- Demo PRUEBA (emp_2000000000) · 00 Respaldo y limpieza (ejecutado el 2026-11-08)
-- 1) Respaldo: esquema respaldo_prueba_20261108 con todas las filas de PRUEBA (232 tablas)
--    + copia completa de 8 tablas hijas sin empresa_id. Sin acceso para anon/authenticated.
-- 2) Limpieza: borra las filas de PRUEBA de todas las tablas con empresa_id, salvo las de configuración,
--    accesos, organigrama y catálogos (lista "keep"). Se omiten los triggers de inmutabilidad solo en esta
--    transacción (session_replication_role = replica) y se borran las filas hijas que quedan huérfanas.
--    Se revierte sola si queda cualquier referencia rota o si se afecta la asignación de geocerca de ZAHORY.
-- Restaurar una tabla:  insert into public.<tabla> select * from respaldo_prueba_20261108.<tabla>;

do $$ declare r record; n bigint; begin
create schema if not exists respaldo_prueba_20261108;
revoke all on schema respaldo_prueba_20261108 from public, anon, authenticated;
for r in select c.table_name from information_schema.columns c join information_schema.tables t using (table_schema,table_name)
 where c.table_schema='public' and t.table_type='BASE TABLE' and c.column_name='empresa_id' and c.data_type in ('text','character varying') loop
 execute format('select count(*) from public.%I where empresa_id=%L', r.table_name, 'emp_2000000000') into n;
 if n>0 then execute format('create table respaldo_prueba_20261108.%I as select * from public.%I where empresa_id=%L', r.table_name, r.table_name, 'emp_2000000000'); end if;
end loop;
for r in select unnest(array['contratos_alquiler_equipos','contratos_alquiler_equipo_tarifas','cuadrilla_miembros','documento_bloques','hoja_costeo_lineas_activos','hoja_costeo_lineas_mano_obra','hoja_costeo_lineas_materiales','hoja_costeo_trabajos']) t loop
 execute format('create table respaldo_prueba_20261108.%I as select * from public.%I', '_completa_'||r.t, r.t);
end loop; end $$;

do $$
declare
 keep text[] := array['usuarios','usuarios_empresas','usuarios_asignaciones','roles','posiciones_usuarios','superadmin_accesos','empresa_config','empresa_wms_config','sociedades','tenant_nav_labels','tenant_section_labels','notif_reglas_empresa','ticket_numeradores','correlativos_documentos','series_documentarias','tipos_documento_electronico','tipos_documento_empresa','monedas_impuestos_unidades','feriados','afp_parametros','tipos_contrato','gasto_administrativo_config','er_categorias','tipos_gasto_empresa','diagnostico_catalogo_valores','plantillas_documento_bloques','biblioteca_condiciones_generales','industrias','niveles_jerarquicos','tideo_salud_comentarios','tideo_salud_anotaciones','contrato_firmantes_autorizados','plantillas_actividad','tipos_servicio_interno','planner_maquina_tipos','especialidades_tecnicas','familia_trabajo','familia_servicio','material_grupos','material_familias','material_subfamilias','unidades_organizacionales','organigrama_v2_layout','posiciones','areas_empresa','cargos_empresa','centros_costo','centros_beneficio','cargo_documento_requisito','turnos','diccionario_comercial','rrhh_geocercas','cargo_colocaciones'];
 r record; n bigint; huerf bigint; rep text:=''; ronda int; borr bigint;
begin
 set local session_replication_role = replica;
 delete from plantillas_actividad where empresa_id='emp_2000000000' and activo_id is not null;
 for r in select c.table_name t from information_schema.columns c join information_schema.tables tt using (table_schema,table_name)
 where c.table_schema='public' and tt.table_type='BASE TABLE' and c.column_name='empresa_id' and c.data_type in ('text','character varying')
   and c.table_name <> all(keep) and c.table_name !~ '^_(backup|reporte)' and c.table_name !~ 'backup_2026' loop
   execute format('delete from public.%I where empresa_id=%L', r.t, 'emp_2000000000');
 end loop;
 for ronda in 1..5 loop borr:=0;
 for r in select ch.relname hijo, pa.relname padre,
   (select string_agg(quote_ident(a.attname),',' order by k.o) from unnest(con.conkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.n) hc,
   (select string_agg(quote_ident(a.attname),',' order by k.o) from unnest(con.confkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.n) pc
  from pg_constraint con join pg_class ch on ch.oid=con.conrelid join pg_class pa on pa.oid=con.confrelid
  where con.contype='f' and ch.relnamespace='public'::regnamespace and pa.relnamespace='public'::regnamespace
   and not exists(select 1 from pg_attribute where attrelid=ch.oid and attname='empresa_id' and not attisdropped)
   and ch.relname not in ('empresas') and ch.relname !~ '^_' loop
  execute format('delete from public.%I h where (%s) is not null and not exists (select 1 from public.%I p where (%s)=(%s))',
    r.hijo, (select string_agg('h.'||x,',') from unnest(string_to_array(r.hc,',')) x), r.padre,
    (select string_agg('p.'||x,',') from unnest(string_to_array(r.pc,',')) x),(select string_agg('h.'||x,',') from unnest(string_to_array(r.hc,',')) x));
  get diagnostics n=row_count; borr:=borr+n;
 end loop; exit when borr=0; end loop;
 for r in select ch.relname hijo, pa.relname padre,
   (select string_agg(quote_ident(a.attname),',' order by k.o) from unnest(con.conkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.n) hc,
   (select string_agg(quote_ident(a.attname),',' order by k.o) from unnest(con.confkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=con.confrelid and a.attnum=k.n) pc
  from pg_constraint con join pg_class ch on ch.oid=con.conrelid join pg_class pa on pa.oid=con.confrelid
  where con.contype='f' and ch.relnamespace='public'::regnamespace and pa.relnamespace='public'::regnamespace and ch.relname !~ '^_' loop
  execute format('select count(*) from public.%I h where (%s) is not null and not exists (select 1 from public.%I p where (%s)=(%s))',
    r.hijo, (select string_agg('h.'||x,',') from unnest(string_to_array(r.hc,',')) x), r.padre,
    (select string_agg('p.'||x,',') from unnest(string_to_array(r.pc,',')) x),(select string_agg('h.'||x,',') from unnest(string_to_array(r.hc,',')) x)) into huerf;
  if huerf>0 then rep:=rep||'{'||r.hijo||'.'||r.hc||'->'||r.padre||' '||huerf||'} '; end if;
 end loop;
 if rep<>'' then raise exception 'Quedan huérfanos, se revierte: %', rep; end if;
 if not exists(select 1 from rrhh_geocerca_asignaciones where id='gea_04e4ee027c69') then raise exception 'Se afectó fila de ZAHORY'; end if;
end $$;
