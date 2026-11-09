-- Demo PRUEBA · 05 Motor de clonado: rellena una tabla de PRUEBA tomando como molde las filas respaldadas,
-- reasignando empresa, sociedad, IDs, fechas (ago–nov 2026) y referencias a los registros demo ya creados.
create schema if not exists demo_seed;
revoke all on schema demo_seed from public, anon, authenticated;

create or replace function demo_seed.ref_tabla(col text) returns text language sql immutable as $$
  select case
    when col in ('cuenta_id','cliente_id','cliente_propietario_id','cuenta_cliente_id') then 'cuentas'
    when col in ('proveedor_id','transportista_id') then 'proveedores'
    when col in ('ot_id','orden_trabajo_id','ot_vinc_id','ot_origen_id') then 'ordenes_trabajo'
    when col in ('activo_id','equipo_id','activo_padre_id','maquina_id') then 'activos'
    when col in ('personal_id','trabajador_id','tecnico_id','colaborador_id','candidato_personal_id','operador_id','conductor_personal_id') then 'personal_operativo'
    when col in ('material_id') then 'materiales'
    when col in ('almacen_id','almacen_origen_id','almacen_destino_id') then 'almacenes'
    when col in ('ubicacion_id') then 'ubicaciones'
    when col in ('os_cliente_id','os_id') then 'os_clientes'
    when col in ('cotizacion_id') then 'cotizaciones'
    when col in ('oportunidad_id') then 'oportunidades'
    when col in ('factura_id') then 'facturas'
    when col in ('cxp_id') then 'cxp'
    when col in ('cxc_id') then 'cxc'
    when col in ('lead_id') then 'leads'
    when col in ('contacto_id') then 'contactos'
    when col in ('orden_compra_id','oc_id') then 'ordenes_compra'
    when col in ('contrato_alquiler_id','contrato_id') then 'contratos_alquiler'
    when col in ('periodo_id','periodo_nomina_id') then 'periodos_nomina'
    when col in ('fondo_id','fondo_origen_id','fondo_destino_id') then 'caja_chica_fondos'
    when col in ('cuenta_bancaria_id','devolucion_cuenta_bancaria_id') then 'cuentas_bancarias'
    when col in ('gasto_id','compras_gasto_id') then 'compras_gastos'
    else null end $$;

create or replace function demo_seed.clonar(p_tabla text, p_n int, p_fijos jsonb default '{}'::jsonb)
returns int language plpgsql as $$
declare
  emp constant text := 'emp_2000000000';
  soc constant uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  src text[]; j jsonb; k int; col record; pt text; pk text; v text; ids text[]; total int; creados int := 0;
  idtipo text; fk record; base_ini constant date := date '2026-08-08'; dmin date; shift int;
begin
  execute format('select array_agg(to_jsonb(t)::text) from respaldo_prueba_20261108.%I t', p_tabla) into src;
  if src is null then return 0; end if;
  total := array_length(src,1);
  select format_type(atttypid, atttypmod) into idtipo from pg_attribute where attrelid=('public.'||quote_ident(p_tabla))::regclass and attname='id' and not attisdropped;
  for k in 1..p_n loop
    j := src[1 + (k-1) % total]::jsonb;
    j := j || jsonb_build_object('empresa_id', emp);
    if j ? 'sociedad_id' then j := j || jsonb_build_object('sociedad_id', soc); end if;
    if idtipo = 'uuid' then j := j || jsonb_build_object('id', gen_random_uuid());
    elsif idtipo in ('text','character varying') then j := j || jsonb_build_object('id', 'demo_'||left(p_tabla,12)||'_'||lpad(k::text,4,'0'));
    elsif idtipo is not null then j := j - 'id'; end if;
    -- desplazamiento de fechas por fila: conserva el orden entre columnas de la misma fila
    select min(left(j->>a.attname,10)::date) into dmin from pg_attribute a
      where a.attrelid=('public.'||quote_ident(p_tabla))::regclass and a.attnum>0 and not a.attisdropped
        and (format_type(a.atttypid,a.atttypmod)='date' or format_type(a.atttypid,a.atttypmod) like 'timestamp%') and j->>a.attname is not null;
    shift := coalesce((base_ini + ((k*7) % 80)) - dmin, 0);
    for col in select a.attname::text nombre, format_type(a.atttypid,a.atttypmod) tipo, a.attnotnull nn
               from pg_attribute a where a.attrelid=('public.'||quote_ident(p_tabla))::regclass and a.attnum>0 and not a.attisdropped loop
      -- números y códigos únicos
      if col.nombre in ('numero','codigo','correlativo','numero_correlativo','codigo_interno','secuencia') and j->>col.nombre is not null then
        if col.tipo in ('text','character varying') then
          j := j || jsonb_build_object(col.nombre, upper(left(regexp_replace(j->>col.nombre,'[-_0-9]+$',''),12))||'-D'||lpad(k::text,4,'0'));
        else
          j := j || jsonb_build_object(col.nombre, case when col.nombre='secuencia' then k else 9000+k end);
        end if;
      end if;
      -- fechas dentro de la ventana de la demo
      if j->>col.nombre is not null and col.tipo = 'date' then
        j := j || jsonb_build_object(col.nombre, ((j->>col.nombre)::date + shift)::text);
      elsif j->>col.nombre is not null and col.tipo like 'timestamp%' then
        j := j || jsonb_build_object(col.nombre, ((j->>col.nombre)::timestamptz + make_interval(days => shift))::text);
      end if;
      -- referencias por FK declarada
      select pa.relname::text padre, (select a2.attname::text from pg_attribute a2 where a2.attrelid=con.confrelid and a2.attnum=con.confkey[1]) pcol
        into fk from pg_constraint con join pg_class pa on pa.oid=con.confrelid
        where con.conrelid=('public.'||quote_ident(p_tabla))::regclass and con.contype='f' and array_length(con.conkey,1)=1
          and pa.relnamespace='public'::regnamespace
          and con.conkey[1]=(select attnum from pg_attribute where attrelid=con.conrelid and attname=col.nombre) limit 1;
      pt := coalesce(fk.padre, case when j->>col.nombre is not null then demo_seed.ref_tabla(col.nombre) end);
      pk := coalesce(fk.pcol, 'id');
      if pt is not null and pt <> 'empresas' and col.nombre not in ('id','empresa_id','sociedad_id') and j->>col.nombre is not null then
        if exists (select 1 from pg_attribute where attrelid=('public.'||quote_ident(pt))::regclass and attname='empresa_id' and not attisdropped) then
          execute format('select array_agg(%I::text order by %I::text) from public.%I where empresa_id=%L', pk, pk, pt, emp) into ids;
          if ids is null then
            j := j || jsonb_build_object(col.nombre, null);
          else
            j := j || jsonb_build_object(col.nombre, ids[1 + (k*3 + length(col.nombre)) % array_length(ids,1)]);
          end if;
        else
          execute format('select %I::text from public.%I where %I::text=%L limit 1', pk, pt, pk, j->>col.nombre) into v;
          if v is null then j := j || jsonb_build_object(col.nombre, null); end if;
        end if;
      end if;
      fk := null;
    end loop;
    j := j || p_fijos;
    select string_agg(quote_ident(a.attname), ',') into v from pg_attribute a
      where a.attrelid=('public.'||quote_ident(p_tabla))::regclass and a.attnum>0 and not a.attisdropped
        and a.attgenerated='' and a.attidentity<>'a' and j ? a.attname and jsonb_typeof(j->a.attname) <> 'null';
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', p_tabla, v, v, p_tabla) using j;
    creados := creados + 1;
  end loop;
  return creados;
end $$;
