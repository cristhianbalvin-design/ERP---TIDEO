-- F1 · Orden de Fabricación (OF): base de datos
-- Decisiones (Cristhian, 2026-10-27):
--   * Una OF por OS (se permite crear otra a mano, sin copiar la hoja).
--   * Cada operación de la ruta es una Tarea, agrupada por Trabajo › Actividad.
--   * La bahía de la operación se deduce del equipo de la tarea (activo → máquina del Planner → bahía);
--     si la tarea no usa equipo, la bahía queda vacía y la asigna el Planner.
--   * Calidad en F4; reservas del WMS en F3.
-- Solo cambios aditivos.

set lock_timeout = '10s';

-- ─────────────────────────────────────────────────────────────
-- 1. Cabecera de la OF
-- ─────────────────────────────────────────────────────────────
create table if not exists public.ordenes_fabricacion (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       text not null references public.empresas(id),
  sociedad_id      uuid references public.sociedades(id) on delete restrict,
  numero           text not null,
  os_cliente_id    text references public.os_clientes(id) on delete restrict,
  hoja_costeo_id   text references public.hojas_costeo(id),
  cuenta_id        text references public.cuentas(id) on delete set null,
  activo_id        text references public.activos(id),
  descripcion      text,
  estado           text not null default 'borrador'
                   check (estado in ('borrador','en_ingenieria','aprobada','en_produccion','en_calidad','lista_entrega','entregada','cerrada','anulada')),
  fecha_apertura   date not null default current_date,
  fecha_compromiso date,
  responsable_id   uuid,
  centro_costo_id  text,
  moneda           text,
  costo_estimado   numeric not null default 0,
  costo_real       numeric not null default 0,
  avance_pct       numeric not null default 0 check (avance_pct between 0 and 100),
  creado_por       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint ordenes_fabricacion_numero_uk unique (empresa_id, numero)
);
create index if not exists idx_of_empresa_estado on public.ordenes_fabricacion (empresa_id, estado);
create index if not exists idx_of_os on public.ordenes_fabricacion (os_cliente_id);

comment on table public.ordenes_fabricacion is 'Orden de Fabricación: documento propio con su ruta (of_operaciones) y su lista de materiales (of_materiales).';
comment on column public.ordenes_fabricacion.activo_id is 'Componente o equipo del cliente que se fabrica o recupera.';

-- ─────────────────────────────────────────────────────────────
-- 2. Ruta de operaciones (una por Tarea)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.of_operaciones (
  id                 uuid primary key default gen_random_uuid(),
  of_id              uuid not null references public.ordenes_fabricacion(id) on delete cascade,
  empresa_id         text not null references public.empresas(id),
  secuencia          integer not null,
  familia_trabajo_id uuid references public.familia_trabajo(id),
  actividad_id       text references public.tipos_servicio_interno(id),
  tarea_id           text references public.tipos_servicio_interno(id),
  titulo             text not null,
  cargo_id           text references public.cargos_empresa(id),
  activo_id          text references public.activos(id),
  bahia_id           uuid references public.planner_bahias(id) on delete set null,
  horas_estimadas    numeric not null default 0 check (horas_estimadas >= 0),
  horas_maquina      numeric not null default 0 check (horas_maquina >= 0),
  horas_reales       numeric not null default 0 check (horas_reales >= 0),
  costo_estimado     numeric not null default 0,
  estado             text not null default 'pendiente' check (estado in ('pendiente','en_proceso','terminada','bloqueada')),
  avance_pct         numeric not null default 0 check (avance_pct between 0 and 100),
  hoja_linea_id      uuid references public.hoja_costeo_lineas_mano_obra(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_of_operaciones_of on public.of_operaciones (of_id, secuencia);
create index if not exists idx_of_operaciones_bahia on public.of_operaciones (bahia_id);

comment on column public.of_operaciones.bahia_id is 'Bahía deducida del equipo (máquina del Planner con ese activo). Vacía si la tarea no usa equipo: la asigna el Planner.';

-- ─────────────────────────────────────────────────────────────
-- 3. Lista de materiales (BOM plan / real)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.of_materiales (
  id                uuid primary key default gen_random_uuid(),
  of_id             uuid not null references public.ordenes_fabricacion(id) on delete cascade,
  empresa_id        text not null references public.empresas(id),
  operacion_id      uuid references public.of_operaciones(id) on delete set null,
  material_id       text references public.materiales(id),
  descripcion       text,
  unidad            text,
  cantidad_plan     numeric not null default 0 check (cantidad_plan >= 0),
  cantidad_real     numeric check (cantidad_real is null or cantidad_real >= 0),
  costo_unitario    numeric not null default 0 check (costo_unitario >= 0),
  origen            text not null default 'stock' check (origen in ('stock','compra','cliente')),
  no_planificado    boolean not null default false,
  motivo_desviacion text,
  hoja_linea_id     uuid references public.hoja_costeo_lineas_materiales(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_of_materiales_of on public.of_materiales (of_id);

-- updated_at
drop trigger if exists trg_of_updated_at on public.ordenes_fabricacion;
create trigger trg_of_updated_at before update on public.ordenes_fabricacion
  for each row execute function public.planner_set_updated_at();
drop trigger if exists trg_of_operaciones_updated_at on public.of_operaciones;
create trigger trg_of_operaciones_updated_at before update on public.of_operaciones
  for each row execute function public.planner_set_updated_at();
drop trigger if exists trg_of_materiales_updated_at on public.of_materiales;
create trigger trg_of_materiales_updated_at before update on public.of_materiales
  for each row execute function public.planner_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. RLS (pantalla de permisos 'of')
-- ─────────────────────────────────────────────────────────────
alter table public.ordenes_fabricacion enable row level security;
alter table public.of_operaciones enable row level security;
alter table public.of_materiales enable row level security;

drop policy if exists of_select on public.ordenes_fabricacion;
create policy of_select on public.ordenes_fabricacion for select using (
  usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id, 'of', 'ver')
  and exists (select 1 from (select usuario_alcance_sociedades(ordenes_fabricacion.empresa_id) as alcance) au
              where au.alcance is null or ordenes_fabricacion.sociedad_id = any (au.alcance)));
drop policy if exists of_insert on public.ordenes_fabricacion;
create policy of_insert on public.ordenes_fabricacion for insert with check (
  usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id, 'of', 'crear')
  and exists (select 1 from (select usuario_alcance_sociedades(ordenes_fabricacion.empresa_id) as alcance) au
              where au.alcance is null or ordenes_fabricacion.sociedad_id = any (au.alcance)));
drop policy if exists of_update on public.ordenes_fabricacion;
create policy of_update on public.ordenes_fabricacion for update using (
  usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id, 'of', 'editar')
  and exists (select 1 from (select usuario_alcance_sociedades(ordenes_fabricacion.empresa_id) as alcance) au
              where au.alcance is null or ordenes_fabricacion.sociedad_id = any (au.alcance)))
  with check (
  usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id, 'of', 'editar')
  and exists (select 1 from (select usuario_alcance_sociedades(ordenes_fabricacion.empresa_id) as alcance) au
              where au.alcance is null or ordenes_fabricacion.sociedad_id = any (au.alcance)));
drop policy if exists of_delete on public.ordenes_fabricacion;
create policy of_delete on public.ordenes_fabricacion for delete using (usuario_es_admin_empresa(empresa_id));

-- Hijas: mismo acceso que la cabecera
do $$
declare t text;
begin
  foreach t in array array['of_operaciones','of_materiales'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format($p$create policy %1$s_select on public.%1$s for select using (
      exists (select 1 from public.ordenes_fabricacion o where o.id = %1$s.of_id
              and usuario_tiene_empresa(o.empresa_id) and usuario_puede(o.empresa_id, 'of', 'ver')
              and exists (select 1 from (select usuario_alcance_sociedades(o.empresa_id) as alcance) au
                          where au.alcance is null or o.sociedad_id = any (au.alcance))))$p$, t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format($p$create policy %1$s_insert on public.%1$s for insert with check (
      exists (select 1 from public.ordenes_fabricacion o where o.id = %1$s.of_id and o.empresa_id = %1$s.empresa_id
              and usuario_tiene_empresa(o.empresa_id) and usuario_puede(o.empresa_id, 'of', 'editar')
              and exists (select 1 from (select usuario_alcance_sociedades(o.empresa_id) as alcance) au
                          where au.alcance is null or o.sociedad_id = any (au.alcance))))$p$, t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format($p$create policy %1$s_update on public.%1$s for update using (
      exists (select 1 from public.ordenes_fabricacion o where o.id = %1$s.of_id
              and usuario_tiene_empresa(o.empresa_id) and usuario_puede(o.empresa_id, 'of', 'editar')
              and exists (select 1 from (select usuario_alcance_sociedades(o.empresa_id) as alcance) au
                          where au.alcance is null or o.sociedad_id = any (au.alcance))))
      with check (
      exists (select 1 from public.ordenes_fabricacion o where o.id = %1$s.of_id and o.empresa_id = %1$s.empresa_id
              and usuario_tiene_empresa(o.empresa_id) and usuario_puede(o.empresa_id, 'of', 'editar')
              and exists (select 1 from (select usuario_alcance_sociedades(o.empresa_id) as alcance) au
                          where au.alcance is null or o.sociedad_id = any (au.alcance))))$p$, t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format($p$create policy %1$s_delete on public.%1$s for delete using (
      exists (select 1 from public.ordenes_fabricacion o where o.id = %1$s.of_id
              and usuario_tiene_empresa(o.empresa_id) and usuario_puede(o.empresa_id, 'of', 'editar')
              and exists (select 1 from (select usuario_alcance_sociedades(o.empresa_id) as alcance) au
                          where au.alcance is null or o.sociedad_id = any (au.alcance))))$p$, t);
  end loop;
end $$;

grant select, insert, update, delete on public.ordenes_fabricacion, public.of_operaciones, public.of_materiales to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Partes diarios: también para la OF
-- ─────────────────────────────────────────────────────────────
alter table public.partes_diarios
  add column if not exists orden_fabricacion_id uuid references public.ordenes_fabricacion(id),
  add column if not exists of_operacion_id uuid references public.of_operaciones(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'partes_diarios_ot_u_of_chk') then
    alter table public.partes_diarios add constraint partes_diarios_ot_u_of_chk
      check (orden_trabajo_id is null or orden_fabricacion_id is null);
  end if;
end $$;
create index if not exists idx_partes_diarios_of on public.partes_diarios (orden_fabricacion_id) where orden_fabricacion_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 6. Máquina del Planner ↔ equipo (activo)
-- ─────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'planner_maquinas_taller_activo_id_fkey') then
    alter table public.planner_maquinas_taller add constraint planner_maquinas_taller_activo_id_fkey
      foreign key (activo_id) references public.activos(id) on delete set null;
  end if;
end $$;
create unique index if not exists uk_planner_maquinas_activo
  on public.planner_maquinas_taller (empresa_id, activo_id) where activo_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 7. Permiso 'of': mismo acceso que 'ot' en cada rol; y en los roles por defecto
-- ─────────────────────────────────────────────────────────────
insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
                                   puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas, permisos_extra)
select pr.rol_id, 'of', pr.puede_ver, pr.puede_crear, pr.puede_editar, pr.puede_anular,
       pr.puede_aprobar, pr.puede_exportar, pr.puede_ver_costos, pr.puede_ver_finanzas, pr.permisos_extra
  from public.permisos_roles pr
 where pr.pantalla = 'ot'
on conflict (rol_id, pantalla) do nothing;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.asignar_permisos_default_a_rol'::regproc);
  if position($q$'ot','of','partes'$q$ in d) = 0 then
    d := replace(d, $q$'ot','partes'$q$, $q$'ot','of','partes'$q$);
    if (length(d) - length(replace(d, $q$'ot','of','partes'$q$, ''))) / length($q$'ot','of','partes'$q$) <> 3 then
      raise exception 'asignar_permisos_default_a_rol: se esperaban 3 listas con ot,partes';
    end if;
    execute d;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 8. Numeración OF-AA-NNNN
-- ─────────────────────────────────────────────────────────────
create or replace function public.siguiente_numero_orden_fabricacion(p_empresa_id text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  v_yy    text := right(to_char(current_date, 'YYYY'), 2);
  v_serie record;
  v_max   int;
  v_corr  int;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('siguiente_numero_orden_fabricacion:' || p_empresa_id, 0));

  select * into v_serie from public.series_documentarias
   where empresa_id = p_empresa_id and documento = 'Ordenes de Fabricacion' and estado = 'activo'
   limit 1 for update;
  if found then
    v_corr := v_serie.siguiente_correlativo;
    update public.series_documentarias set siguiente_correlativo = siguiente_correlativo + 1 where id = v_serie.id;
    return v_serie.serie || '-' || lpad(v_corr::text, 4, '0');
  end if;

  select coalesce(max((substring(numero from '-([0-9]{4})$'))::int), 0) into v_max
    from public.ordenes_fabricacion
   where empresa_id = p_empresa_id and numero ~ ('^OF-' || v_yy || '-[0-9]{4}$');
  v_corr := v_max + 1;
  insert into public.series_documentarias (id, empresa_id, documento, serie, siguiente_correlativo, regla, estado)
  values ('ser_ordenes_fabricacion_' || replace(gen_random_uuid()::text, '-', ''), p_empresa_id,
          'Ordenes de Fabricacion', 'OF-' || v_yy, v_corr + 1, 'Anual por empresa', 'activo');
  return 'OF-' || v_yy || '-' || lpad(v_corr::text, 4, '0');
end;
$function$;

-- ─────────────────────────────────────────────────────────────
-- 9. Crear OF desde una OS (copia el plan de fabricación de la hoja)
-- ─────────────────────────────────────────────────────────────
create or replace function public.crear_of_desde_os(p_os_id text, p_copiar_hoja boolean default true)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_os      record;
  v_hoja    text;
  v_diag    text;
  v_of_id   uuid;
  v_numero  text;
  v_mo      numeric;
  v_mat     numeric;
begin
  select * into v_os from public.os_clientes where id = p_os_id;
  if not found then
    raise exception 'La OS % no existe.', p_os_id;
  end if;
  if not public.usuario_tiene_empresa(v_os.empresa_id) or not public.usuario_puede(v_os.empresa_id, 'of', 'crear') then
    raise exception 'No tiene permiso para crear órdenes de fabricación.' using errcode = '42501';
  end if;
  if coalesce(v_os.tipo_ejecucion, '') not in ('fabricacion', 'mixto') then
    raise exception 'La OS % no es de fabricación (tipo: %).', v_os.numero, coalesce(v_os.tipo_ejecucion, 'sin definir');
  end if;

  select coalesce(
           (select c.hoja_costeo_id from public.cotizaciones c where c.id = v_os.cotizacion_id),
           (select ce.hoja_costeo_id from public.cotizaciones_especiales ce where ce.id = v_os.cotizacion_especial_id))
    into v_hoja;

  if p_copiar_hoja and v_hoja is not null and exists (
       select 1 from public.ordenes_fabricacion f
        where f.os_cliente_id = p_os_id and f.hoja_costeo_id is not null and f.estado <> 'anulada') then
    raise exception 'La OS % ya tiene una OF con el plan de la hoja. Crea la siguiente sin copiar la hoja.', v_os.numero;
  end if;

  v_numero := public.siguiente_numero_orden_fabricacion(v_os.empresa_id);
  insert into public.ordenes_fabricacion (empresa_id, sociedad_id, numero, os_cliente_id, hoja_costeo_id, cuenta_id,
                                          activo_id, descripcion, fecha_compromiso, moneda)
  values (v_os.empresa_id, v_os.sociedad_id, v_numero, v_os.id, case when p_copiar_hoja then v_hoja end, v_os.cuenta_id,
          v_os.activo_id, v_os.nombre, v_os.fecha_fin, v_os.moneda)
  returning id into v_of_id;

  if p_copiar_hoja and v_hoja is not null then
    select d.tipo into v_diag
      from public.hojas_costeo h left join public.diagnosticos_tecnicos d on d.id = h.diagnostico_id
     where h.id = v_hoja;

    -- Operaciones: tareas de los Trabajos de fabricación
    insert into public.of_operaciones (of_id, empresa_id, secuencia, familia_trabajo_id, actividad_id, tarea_id, titulo,
                                       cargo_id, activo_id, bahia_id, horas_estimadas, horas_maquina, costo_estimado, hoja_linea_id)
    select v_of_id, v_os.empresa_id,
           row_number() over (order by l.orden nulls last, l.creado_en, l.id),
           l.familia_trabajo_id,
           coalesce(l.actividad_receta_id, l.actividad_id),
           l.tarea_id,
           coalesce(tt.nombre, ta.nombre, 'Tarea'),
           l.cargo_id,
           a.activo_id,
           (select m.bahia_id from public.planner_maquinas_taller m
             where m.empresa_id = v_os.empresa_id and m.activo_id = a.activo_id and m.estado <> 'baja'
             limit 1),
           coalesce(l.horas, 0),
           coalesce(a.horas_uso_estimadas, 0),
           coalesce(l.subtotal, 0) + coalesce(a.depreciacion_asignada, a.costo_hora_equipo * a.horas_uso_estimadas, 0),
           l.id
      from public.hoja_costeo_lineas_mano_obra l
      left join public.hoja_costeo_trabajos ht on ht.hoja_costeo_id = l.hoja_costeo_id and ht.familia_trabajo_id = l.familia_trabajo_id
      left join public.tipos_servicio_interno tt on tt.id = l.tarea_id
      left join public.tipos_servicio_interno ta on ta.id = coalesce(l.actividad_receta_id, l.actividad_id)
      left join lateral (
             select la.activo_id, la.horas_uso_estimadas, la.depreciacion_asignada, la.costo_hora_equipo
               from public.hoja_costeo_lineas_activos la
              where la.linea_mano_obra_id = l.id
              order by la.orden nulls last, la.creado_en
              limit 1) a on true
     where l.hoja_costeo_id = v_hoja
       and coalesce(ht.tipo_ejecucion, v_diag,
                    case when v_os.tipo_ejecucion = 'fabricacion' then 'fabricacion' end) = 'fabricacion';

    -- Materiales: los de esas tareas; los sueltos solo si la OS es solo de fabricación
    insert into public.of_materiales (of_id, empresa_id, operacion_id, material_id, descripcion, unidad,
                                      cantidad_plan, costo_unitario, origen, hoja_linea_id)
    select v_of_id, v_os.empresa_id, op.id, m.material_id, m.descripcion, m.unidad,
           coalesce(m.cantidad, 0), coalesce(m.costo_unitario_snapshot, 0), 'stock', m.id
      from public.hoja_costeo_lineas_materiales m
      left join public.of_operaciones op on op.of_id = v_of_id and op.hoja_linea_id = m.linea_mano_obra_id
     where m.hoja_costeo_id = v_hoja
       and (op.id is not null or (m.linea_mano_obra_id is null and v_os.tipo_ejecucion = 'fabricacion'))
     order by m.orden nulls last, m.creado_en;

    select coalesce(sum(costo_estimado), 0) into v_mo from public.of_operaciones where of_id = v_of_id;
    select coalesce(sum(cantidad_plan * costo_unitario), 0) into v_mat from public.of_materiales where of_id = v_of_id;
    update public.ordenes_fabricacion set costo_estimado = v_mo + v_mat where id = v_of_id;
  end if;

  return v_of_id;
end;
$function$;

revoke all on function public.crear_of_desde_os(text, boolean) from public, anon;
grant execute on function public.crear_of_desde_os(text, boolean) to authenticated;
revoke all on function public.siguiente_numero_orden_fabricacion(text) from public, anon;
grant execute on function public.siguiente_numero_orden_fabricacion(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 10. Comprobación
-- ─────────────────────────────────────────────────────────────
do $$ begin
  if (select count(*) from pg_tables where schemaname = 'public'
        and tablename in ('ordenes_fabricacion','of_operaciones','of_materiales') and rowsecurity) <> 3 then
    raise exception 'F1: faltan tablas de OF con RLS';
  end if;
  if (select count(*) from pg_policies where tablename in ('ordenes_fabricacion','of_operaciones','of_materiales')) <> 12 then
    raise exception 'F1: se esperaban 12 políticas';
  end if;
  if (select count(*) from information_schema.columns where table_name = 'partes_diarios'
        and column_name in ('orden_fabricacion_id','of_operacion_id')) <> 2 then
    raise exception 'F1: faltan columnas en partes_diarios';
  end if;
  if (select count(*) from public.permisos_roles where pantalla = 'of')
     <> (select count(*) from public.permisos_roles where pantalla = 'ot') then
    raise exception 'F1: permisos of distintos de ot';
  end if;
  if position($q$'ot','of','partes'$q$ in pg_get_functiondef('public.asignar_permisos_default_a_rol'::regproc)) = 0 then
    raise exception 'F1: roles por defecto sin of';
  end if;
  if to_regprocedure('public.crear_of_desde_os(text,boolean)') is null then
    raise exception 'F1: falta crear_of_desde_os';
  end if;
end $$;
