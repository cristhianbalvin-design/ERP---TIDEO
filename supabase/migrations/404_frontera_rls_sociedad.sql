-- TIDEO ERP - B0-c2: frontera RLS por sociedad.
--
-- NULL en usuario_alcance_sociedades significa alcance irrestricto.
-- Un array vacio significa que el usuario no tiene acceso a ninguna sociedad.
-- Las politicas funcionales existentes se conservan sin consolidar; este bloque
-- agrega exclusivamente la frontera societaria.

create or replace function public.usuario_alcance_sociedades(target_empresa_id text)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_multisociedad_habilitado boolean;
  v_sociedades_ids uuid[];
begin
  -- Replica el bypass de usuario_tiene_empresa para el superadmin de plataforma.
  if public.usuario_es_superadmin_plataforma() then
    return null;
  end if;

  select e.multisociedad_habilitado
    into v_multisociedad_habilitado
  from public.empresas e
  where e.id = target_empresa_id;

  -- Tenant inexistente o sin multisociedad: sin restriccion. La pertenencia al
  -- tenant sigue siendo responsabilidad de la expresion RLS preexistente.
  if not coalesce(v_multisociedad_habilitado, false) then
    return null;
  end if;

  -- 'grupo' tiene precedencia sobre cualquier asignacion 'sociedad'.
  if exists (
    select 1
    from public.usuarios_asignaciones ua
    where ua.empresa_id = target_empresa_id
      and ua.user_id = auth.uid()
      and ua.activo is true
      and ua.alcance_tipo = 'grupo'
  ) then
    -- Una asignacion de grupo sin array representa alcance irrestricto.
    if exists (
      select 1
      from public.usuarios_asignaciones ua
      where ua.empresa_id = target_empresa_id
        and ua.user_id = auth.uid()
        and ua.activo is true
        and ua.alcance_tipo = 'grupo'
        and ua.sociedades_ids is null
    ) then
      return null;
    end if;

    select coalesce(array_agg(distinct sociedad_id), array[]::uuid[])
      into v_sociedades_ids
    from public.usuarios_asignaciones ua
    cross join lateral unnest(ua.sociedades_ids) as sociedad_id
    where ua.empresa_id = target_empresa_id
      and ua.user_id = auth.uid()
      and ua.activo is true
      and ua.alcance_tipo = 'grupo';

    return v_sociedades_ids;
  end if;

  if exists (
    select 1
    from public.usuarios_asignaciones ua
    where ua.empresa_id = target_empresa_id
      and ua.user_id = auth.uid()
      and ua.activo is true
      and ua.alcance_tipo = 'sociedad'
  ) then
    select coalesce(array_agg(distinct sociedad_id), array[]::uuid[])
      into v_sociedades_ids
    from public.usuarios_asignaciones ua
    cross join lateral unnest(coalesce(ua.sociedades_ids, array[]::uuid[])) as sociedad_id
    where ua.empresa_id = target_empresa_id
      and ua.user_id = auth.uid()
      and ua.activo is true
      and ua.alcance_tipo = 'sociedad';

    return v_sociedades_ids;
  end if;

  -- Compatibilidad con asignaciones historicas tenant/area/etc. y con usuarios
  -- sin asignaciones modernas.
  return null;
end;
$$;

revoke all on function public.usuario_alcance_sociedades(text) from public;
revoke all on function public.usuario_alcance_sociedades(text) from anon;
grant execute on function public.usuario_alcance_sociedades(text) to authenticated;

-- Las 30 tablas siguientes poseen sociedad_id. El catalogo actual debe contener
-- exactamente 94 politicas sobre ellas; personal_documentos_self_select es la
-- unica politica de autoservicio excluida, por lo que se modifican 93.
do $$
declare
  v_tablas constant text[] := array[
    'caja_chica',
    'centros_beneficio',
    'centros_costo',
    'compras_gastos',
    'correlativos_documentos',
    'cotizaciones',
    'cuentas_bancarias',
    'cxc',
    'cxp',
    'devoluciones_proveedor',
    'devoluciones_proveedor_lineas',
    'facturas',
    'financiamientos',
    'hojas_costeo',
    'inventario_conteos',
    'kardex',
    'nomina_detalle',
    'ordenes_compra',
    'ordenes_servicio_interna',
    'ordenes_trabajo',
    'ordenes_venta',
    'os_clientes',
    'periodos_nomina',
    'personal_documentos',
    'presupuesto_aprobaciones',
    'presupuesto_partidas',
    'presupuestos',
    'stock',
    'tipos_cambio_grupo',
    'valorizaciones'
  ];
  v_predicado constant text := $predicado$
    exists (
      select 1
      from (
        select public.usuario_alcance_sociedades(empresa_id) as alcance
      ) alcance_usuario
      where alcance_usuario.alcance is null
         or sociedad_id = any(alcance_usuario.alcance)
    )
  $predicado$;
  v_politica record;
  v_using text;
  v_check text;
  v_total integer;
begin
  select count(*)
    into v_total
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(v_tablas)
    and p.polname <> 'personal_documentos_self_select';

  if v_total <> 93 then
    raise exception
      'Inventario RLS societario inesperado: se esperaban 93 politicas directas y se encontraron %.',
      v_total;
  end if;

  for v_politica in
    select
      c.relname as tabla,
      p.polname as politica,
      p.polcmd,
      pg_get_expr(p.polqual, p.polrelid) as expresion_using,
      pg_get_expr(p.polwithcheck, p.polrelid) as expresion_check
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(v_tablas)
      and p.polname <> 'personal_documentos_self_select'
    order by c.relname, p.polname
  loop
    v_using := case
      when v_politica.expresion_using is null then null
      else format('(%s) and (%s)', v_politica.expresion_using, v_predicado)
    end;
    v_check := case
      when v_politica.expresion_check is null then null
      else format('(%s) and (%s)', v_politica.expresion_check, v_predicado)
    end;

    case v_politica.polcmd
      when 'r' then -- SELECT
        if v_using is null then
          raise exception 'Politica SELECT %.% sin USING.', v_politica.tabla, v_politica.politica;
        end if;
        execute format(
          'alter policy %I on public.%I using (%s)',
          v_politica.politica, v_politica.tabla, v_using
        );
      when 'a' then -- INSERT
        if v_check is null then
          raise exception 'Politica INSERT %.% sin WITH CHECK.', v_politica.tabla, v_politica.politica;
        end if;
        execute format(
          'alter policy %I on public.%I with check (%s)',
          v_politica.politica, v_politica.tabla, v_check
        );
      when 'd' then -- DELETE
        if v_using is null then
          raise exception 'Politica DELETE %.% sin USING.', v_politica.tabla, v_politica.politica;
        end if;
        execute format(
          'alter policy %I on public.%I using (%s)',
          v_politica.politica, v_politica.tabla, v_using
        );
      when 'w' then -- UPDATE
        if v_using is null then
          raise exception 'Politica UPDATE %.% sin USING.', v_politica.tabla, v_politica.politica;
        end if;
        if v_check is null then
          -- PostgreSQL reutiliza USING como WITH CHECK implicito.
          execute format(
            'alter policy %I on public.%I using (%s)',
            v_politica.politica, v_politica.tabla, v_using
          );
        else
          execute format(
            'alter policy %I on public.%I using (%s) with check (%s)',
            v_politica.politica, v_politica.tabla, v_using, v_check
          );
        end if;
      when '*' then -- ALL
        if v_using is null or v_check is null then
          raise exception 'Politica ALL %.% incompleta.', v_politica.tabla, v_politica.politica;
        end if;
        execute format(
          'alter policy %I on public.%I using (%s) with check (%s)',
          v_politica.politica, v_politica.tabla, v_using, v_check
        );
      else
        raise exception
          'Comando RLS desconocido % en %.%.',
          v_politica.polcmd, v_politica.tabla, v_politica.politica;
    end case;
  end loop;
end;
$$;

-- Operaciones intercompania: lectura por cualquiera de los extremos; toda
-- escritura exige autoridad sobre ambos propietarios.
drop policy if exists operaciones_intercompania_tenant_access
  on public.operaciones_intercompania;

create policy operaciones_intercompania_select
on public.operaciones_intercompania
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_origen = any(alcance_usuario.alcance)
       or sociedad_destino = any(alcance_usuario.alcance)
  )
);

create policy operaciones_intercompania_insert
on public.operaciones_intercompania
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or (
         sociedad_origen = any(alcance_usuario.alcance)
         and sociedad_destino = any(alcance_usuario.alcance)
       )
  )
);

create policy operaciones_intercompania_update
on public.operaciones_intercompania
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or (
         sociedad_origen = any(alcance_usuario.alcance)
         and sociedad_destino = any(alcance_usuario.alcance)
       )
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or (
         sociedad_origen = any(alcance_usuario.alcance)
         and sociedad_destino = any(alcance_usuario.alcance)
       )
  )
);

create policy operaciones_intercompania_delete
on public.operaciones_intercompania
for delete
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or (
         sociedad_origen = any(alcance_usuario.alcance)
         and sociedad_destino = any(alcance_usuario.alcance)
       )
  )
);

-- Guias de remision: lectura por cualquier extremo. En alcance explicito se
-- exige autoridad sobre cada extremo informado y al menos uno no nulo.
drop policy if exists tenant_guias on public.guias_remision;

create policy guias_remision_select
on public.guias_remision
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_origen_id = any(alcance_usuario.alcance)
       or sociedad_destino_id = any(alcance_usuario.alcance)
  )
);

create policy guias_remision_insert
on public.guias_remision
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or (
         (sociedad_origen_id is null or sociedad_origen_id = any(alcance_usuario.alcance))
         and (sociedad_destino_id is null or sociedad_destino_id = any(alcance_usuario.alcance))
         and (sociedad_origen_id is not null or sociedad_destino_id is not null)
       )
  )
);

create policy guias_remision_update
on public.guias_remision
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or (
         (sociedad_origen_id is null or sociedad_origen_id = any(alcance_usuario.alcance))
         and (sociedad_destino_id is null or sociedad_destino_id = any(alcance_usuario.alcance))
         and (sociedad_origen_id is not null or sociedad_destino_id is not null)
       )
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or (
         (sociedad_origen_id is null or sociedad_origen_id = any(alcance_usuario.alcance))
         and (sociedad_destino_id is null or sociedad_destino_id = any(alcance_usuario.alcance))
         and (sociedad_origen_id is not null or sociedad_destino_id is not null)
       )
  )
);

create policy guias_remision_delete
on public.guias_remision
for delete
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or (
         (sociedad_origen_id is null or sociedad_origen_id = any(alcance_usuario.alcance))
         and (sociedad_destino_id is null or sociedad_destino_id = any(alcance_usuario.alcance))
         and (sociedad_origen_id is not null or sociedad_destino_id is not null)
       )
  )
);

-- Maestro de sociedades: lectura y mantenimiento dentro del alcance. Crear una
-- sociedad nueva requiere alcance irrestricto porque su id aun no puede formar
-- parte de una asignacion explicita.
drop policy if exists sociedades_tenant_access on public.sociedades;

create policy sociedades_select
on public.sociedades
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or id = any(alcance_usuario.alcance)
  )
);

create policy sociedades_insert
on public.sociedades
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_alcance_sociedades(empresa_id) is null
);

create policy sociedades_update
on public.sociedades
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or id = any(alcance_usuario.alcance)
  )
);

create policy sociedades_delete
on public.sociedades
for delete
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from (
      select public.usuario_alcance_sociedades(empresa_id) as alcance
    ) alcance_usuario
    where alcance_usuario.alcance is null
       or id = any(alcance_usuario.alcance)
  )
);
