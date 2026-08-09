-- B3: invariante estructural de sociedad obligatoria en tenants multisociedad.
-- No modifica RLS ni asigna sociedad a excepciones historicas.

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

-- El lock evita que aparezcan nuevas excepciones entre la verificacion del
-- universo y la instalacion de los triggers.
lock table
  public.empresas,
  public.caja_chica,
  public.centros_beneficio,
  public.centros_costo,
  public.compras_gastos,
  public.correlativos_documentos,
  public.cotizaciones,
  public.cuentas_bancarias,
  public.cxc,
  public.cxp,
  public.devoluciones_proveedor,
  public.devoluciones_proveedor_lineas,
  public.facturas,
  public.financiamientos,
  public.hojas_costeo,
  public.inventario_conteos,
  public.kardex,
  public.nomina_detalle,
  public.ordenes_compra,
  public.ordenes_servicio_interna,
  public.ordenes_trabajo,
  public.ordenes_venta,
  public.os_clientes,
  public.periodos_nomina,
  public.personal_documentos,
  public.presupuesto_aprobaciones,
  public.presupuesto_partidas,
  public.presupuestos,
  public.stock,
  public.valorizaciones,
  public.amonestaciones_personal,
  public.solicitudes_rrhh,
  public.portal_constancias_trabajo,
  public.guias_remision
in share row exclusive mode;

-- Solo se permite grandfathering de los once casos laborales aprobados. La
-- migracion aborta si aparece cualquier otro NULL en un tenant multisociedad.
do $verificar_universo$
declare
  v_objetivo record;
  v_conteo bigint;
begin
  for v_objetivo in
    select *
    from (values
      ('caja_chica', 'sociedad_id', 0),
      ('centros_beneficio', 'sociedad_id', 0),
      ('centros_costo', 'sociedad_id', 0),
      ('compras_gastos', 'sociedad_id', 0),
      ('correlativos_documentos', 'sociedad_id', 0),
      ('cotizaciones', 'sociedad_id', 0),
      ('cuentas_bancarias', 'sociedad_id', 0),
      ('cxc', 'sociedad_id', 0),
      ('cxp', 'sociedad_id', 0),
      ('devoluciones_proveedor', 'sociedad_id', 0),
      ('devoluciones_proveedor_lineas', 'sociedad_id', 0),
      ('facturas', 'sociedad_id', 0),
      ('financiamientos', 'sociedad_id', 0),
      ('hojas_costeo', 'sociedad_id', 0),
      ('inventario_conteos', 'sociedad_id', 0),
      ('kardex', 'sociedad_id', 0),
      ('nomina_detalle', 'sociedad_id', 0),
      ('ordenes_compra', 'sociedad_id', 0),
      ('ordenes_servicio_interna', 'sociedad_id', 0),
      ('ordenes_trabajo', 'sociedad_id', 0),
      ('ordenes_venta', 'sociedad_id', 0),
      ('os_clientes', 'sociedad_id', 0),
      ('periodos_nomina', 'sociedad_id', 0),
      ('personal_documentos', 'sociedad_id', 0),
      ('presupuesto_aprobaciones', 'sociedad_id', 0),
      ('presupuesto_partidas', 'sociedad_id', 0),
      ('presupuestos', 'sociedad_id', 0),
      ('stock', 'sociedad_id', 0),
      ('valorizaciones', 'sociedad_id', 0),
      ('amonestaciones_personal', 'sociedad_id', 0),
      ('solicitudes_rrhh', 'sociedad_id', 9),
      ('portal_constancias_trabajo', 'sociedad_id', 2),
      ('guias_remision', 'sociedad_origen_id', 0)
    ) as objetivos(tabla, columna, esperado)
  loop
    if not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = v_objetivo.tabla
        and c.column_name = v_objetivo.columna
        and c.data_type = 'uuid'
        and c.is_nullable = 'YES'
    ) then
      raise exception
        'B3_UNIVERSO: public.%.% no existe o no es UUID nullable.',
        v_objetivo.tabla,
        v_objetivo.columna;
    end if;

    execute format(
      'select count(*) from public.%I x join public.empresas e on e.id = x.empresa_id and e.multisociedad_habilitado is true where x.%I is null',
      v_objetivo.tabla,
      v_objetivo.columna
    ) into v_conteo;

    if v_conteo <> v_objetivo.esperado then
      raise exception
        'B3_UNIVERSO: public.%.% tiene % NULL en tenants multisociedad; se esperaban %.',
        v_objetivo.tabla,
        v_objetivo.columna,
        v_conteo,
        v_objetivo.esperado;
    end if;
  end loop;

  if exists (
    with esperados(id) as (values
      ('001662bf-2faa-4bf3-a737-aa5c6c7815ab'),
      ('f038595a-ecb4-41aa-ad55-9727f2fe9ac6'),
      ('dd276b3d-06d6-44e2-a89b-97a24ed62eec'),
      ('27192ffc-62dd-49c3-94d9-f822f6c92fe0'),
      ('8d47c681-394a-4e2e-a067-183539c93051'),
      ('72baee8c-d857-411d-93ad-2dd7a3f734a3'),
      ('0e0c3af7-c85b-48c2-b777-bad8db405b6e'),
      ('98a589dd-4591-4372-806f-7cbef893c5c1'),
      ('e06966ac-3e4d-4838-990d-deb4a5826191')
    ),
    actuales as (
      select s.id::text as id
      from public.solicitudes_rrhh s
      join public.empresas e
        on e.id = s.empresa_id
       and e.multisociedad_habilitado is true
      where s.sociedad_id is null
    )
    (select id from actuales except select id from esperados)
    union all
    (select id from esperados except select id from actuales)
  ) then
    raise exception 'B3_UNIVERSO: las nueve solicitudes excepcionales no coinciden con la lista aprobada.';
  end if;

  if exists (
    with esperados(id) as (values
      ('pct_fae09ecace0d'),
      ('pct_8dc6156a7fdf')
    ),
    actuales as (
      select c.id::text as id
      from public.portal_constancias_trabajo c
      join public.empresas e
        on e.id = c.empresa_id
       and e.multisociedad_habilitado is true
      where c.sociedad_id is null
    )
    (select id from actuales except select id from esperados)
    union all
    (select id from esperados except select id from actuales)
  ) then
    raise exception 'B3_UNIVERSO: las dos constancias excepcionales no coinciden con la lista aprobada.';
  end if;
end
$verificar_universo$;

create or replace function public.validar_sociedad_obligatoria_multisociedad()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $funcion$
declare
  v_columna text;
  v_multisociedad_habilitado boolean := false;
  v_sociedad_nueva text;
  v_sociedad_anterior text;
begin
  if TG_NARGS <> 1 then
    raise exception
      'B3_CONFIGURACION: el trigger de public.% requiere exactamente una columna societaria.',
      TG_TABLE_NAME;
  end if;

  v_columna := TG_ARGV[0];
  if not (to_jsonb(NEW) ? v_columna) then
    raise exception
      'B3_CONFIGURACION: public.% no contiene la columna % configurada en el trigger.',
      TG_TABLE_NAME,
      v_columna;
  end if;

  select coalesce(e.multisociedad_habilitado, false)
  into v_multisociedad_habilitado
  from public.empresas e
  where e.id = NEW.empresa_id;

  if not coalesce(v_multisociedad_habilitado, false) then
    return NEW;
  end if;

  v_sociedad_nueva := to_jsonb(NEW) ->> v_columna;
  if v_sociedad_nueva is not null then
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if not (to_jsonb(OLD) ? v_columna) then
      raise exception
        'B3_CONFIGURACION: public.% no contiene la columna % configurada en el trigger.',
        TG_TABLE_NAME,
        v_columna;
    end if;

    v_sociedad_anterior := to_jsonb(OLD) ->> v_columna;
    if v_sociedad_anterior is null
       and NEW.empresa_id is not distinct from OLD.empresa_id then
      return NEW;
    end if;
  end if;

  raise exception using
    errcode = '23502',
    message = format(
      'SOCIEDAD_OBLIGATORIA: public.%s rechaza %s con %s NULL porque el tenant %s tiene multisociedad activa.',
      TG_TABLE_NAME,
      TG_OP,
      v_columna,
      NEW.empresa_id
    ),
    hint = 'Proporciona o deriva una sociedad valida antes de escribir el registro.';
end
$funcion$;

revoke all on function public.validar_sociedad_obligatoria_multisociedad()
from public, anon, authenticated, service_role;

do $instalar_triggers$
declare
  v_objetivo record;
begin
  for v_objetivo in
    select *
    from (values
      ('caja_chica', 'sociedad_id'),
      ('centros_beneficio', 'sociedad_id'),
      ('centros_costo', 'sociedad_id'),
      ('compras_gastos', 'sociedad_id'),
      ('correlativos_documentos', 'sociedad_id'),
      ('cotizaciones', 'sociedad_id'),
      ('cuentas_bancarias', 'sociedad_id'),
      ('cxc', 'sociedad_id'),
      ('cxp', 'sociedad_id'),
      ('devoluciones_proveedor', 'sociedad_id'),
      ('devoluciones_proveedor_lineas', 'sociedad_id'),
      ('facturas', 'sociedad_id'),
      ('financiamientos', 'sociedad_id'),
      ('hojas_costeo', 'sociedad_id'),
      ('inventario_conteos', 'sociedad_id'),
      ('kardex', 'sociedad_id'),
      ('nomina_detalle', 'sociedad_id'),
      ('ordenes_compra', 'sociedad_id'),
      ('ordenes_servicio_interna', 'sociedad_id'),
      ('ordenes_trabajo', 'sociedad_id'),
      ('ordenes_venta', 'sociedad_id'),
      ('os_clientes', 'sociedad_id'),
      ('periodos_nomina', 'sociedad_id'),
      ('personal_documentos', 'sociedad_id'),
      ('presupuesto_aprobaciones', 'sociedad_id'),
      ('presupuesto_partidas', 'sociedad_id'),
      ('presupuestos', 'sociedad_id'),
      ('stock', 'sociedad_id'),
      ('valorizaciones', 'sociedad_id'),
      ('amonestaciones_personal', 'sociedad_id'),
      ('solicitudes_rrhh', 'sociedad_id'),
      ('portal_constancias_trabajo', 'sociedad_id'),
      ('guias_remision', 'sociedad_origen_id')
    ) as objetivos(tabla, columna)
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'zz_validar_sociedad_obligatoria',
      v_objetivo.tabla
    );
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.validar_sociedad_obligatoria_multisociedad(%L)',
      'zz_validar_sociedad_obligatoria',
      v_objetivo.tabla,
      v_objetivo.columna
    );
  end loop;
end
$instalar_triggers$;

do $verificar_instalacion$
declare
  v_total integer;
begin
  select count(*)
  into v_total
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and t.tgname = 'zz_validar_sociedad_obligatoria'
    and not t.tgisinternal;

  if v_total <> 33 then
    raise exception 'B3_INSTALACION: se esperaban 33 triggers y se encontraron %.', v_total;
  end if;

  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and t.tgname = 'zz_validar_sociedad_obligatoria'
      and not t.tgisinternal
      and (
        c.relname <> all(array[
          'caja_chica', 'centros_beneficio', 'centros_costo',
          'compras_gastos', 'correlativos_documentos', 'cotizaciones',
          'cuentas_bancarias', 'cxc', 'cxp', 'devoluciones_proveedor',
          'devoluciones_proveedor_lineas', 'facturas', 'financiamientos',
          'hojas_costeo', 'inventario_conteos', 'kardex', 'nomina_detalle',
          'ordenes_compra', 'ordenes_servicio_interna', 'ordenes_trabajo',
          'ordenes_venta', 'os_clientes', 'periodos_nomina',
          'personal_documentos', 'presupuesto_aprobaciones',
          'presupuesto_partidas', 'presupuestos', 'stock', 'valorizaciones',
          'amonestaciones_personal', 'solicitudes_rrhh',
          'portal_constancias_trabajo', 'guias_remision'
        ])
        or (t.tgtype & 1) = 0
        or (t.tgtype & 2) = 0
        or (t.tgtype & 4) = 0
        or (t.tgtype & 16) = 0
        or t.tgattr::text <> ''
      )
  ) then
    raise exception 'B3_INSTALACION: existe un trigger fuera del alcance o con una declaracion distinta a BEFORE INSERT OR UPDATE sin UPDATE OF.';
  end if;
end
$verificar_instalacion$;

commit;
