-- F4 · Calidad de la Orden de Fabricación (OF).
-- Decisiones (Cristhian, 2026-11-09, mock OF-F4-Calidad aprobado):
--   * La inspección toma las piezas y características de la ficha técnica congelada del diagnóstico
--     de fabricación (OF → Hoja de Costeo → diagnóstico → última versión de la ficha).
--   * Mediciones por unidad (#1, #2… según la cantidad de la pieza).
--   * Liberar exige todas las críticas dentro de tolerancia en cada unidad y ninguna NC abierta;
--     las no críticas son opcionales.
--   * Fuera de tolerancia → no conformidad (NC) con disposición: reprocesar, concesión del cliente o
--     rechazar y rehacer; bloquea la liberación hasta cerrarla.
--   * Permiso propio 'of_calidad': editar = medir y gestionar NC; aprobar = liberar.
--   * Además: el material de las piezas del diagnóstico pasa a la OF también cuando la OS es mixta.
-- Aditiva: columnas y tablas nuevas, funciones nuevas con prefijo of_calidad_ y dos ajustes por replace().

set lock_timeout = '10s';

-- ─────────────────────────────────────────────────────────────
-- 1. Cabecera de la OF: ficha técnica usada y liberación
-- ─────────────────────────────────────────────────────────────
alter table public.ordenes_fabricacion
  add column if not exists ficha_fabricacion_id uuid references public.diagnostico_fabricacion_fichas(id) on delete set null,
  add column if not exists calidad_enviado_en   timestamptz,
  add column if not exists calidad_enviado_por  uuid,
  add column if not exists calidad_liberado_en  timestamptz,
  add column if not exists calidad_liberado_por uuid;

comment on column public.ordenes_fabricacion.ficha_fabricacion_id is 'Versión de la ficha técnica de fabricación usada como base de la inspección (F4).';

-- ─────────────────────────────────────────────────────────────
-- 2. Características a controlar (copia al enviar a calidad)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.of_calidad_caracteristicas (
  id               uuid primary key default gen_random_uuid(),
  of_id            uuid not null references public.ordenes_fabricacion(id) on delete cascade,
  empresa_id       text not null references public.empresas(id),
  pieza_id         uuid,
  pieza_nombre     text not null,
  pieza_orden      integer not null default 1,
  pieza_cantidad   integer not null default 1 check (pieza_cantidad between 1 and 500),
  numero           integer not null,
  nombre           text not null,
  parte            text,
  tipo_control     text not null default 'medida' check (tipo_control in ('medida', 'visual')),
  nominal          numeric,
  nominal_texto    text,
  unidad           text,
  tol_menos        numeric,
  tol_mas          numeric,
  critica          boolean not null default false,
  pos_x            numeric,
  pos_y            numeric,
  created_at       timestamptz not null default now(),
  constraint of_calidad_caracteristicas_uk unique (of_id, pieza_orden, numero)
);
create index if not exists idx_of_calidad_car_of on public.of_calidad_caracteristicas (of_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Mediciones por unidad
-- ─────────────────────────────────────────────────────────────
create table if not exists public.of_calidad_mediciones (
  id                 uuid primary key default gen_random_uuid(),
  of_id              uuid not null references public.ordenes_fabricacion(id) on delete cascade,
  empresa_id         text not null references public.empresas(id),
  caracteristica_id  uuid not null references public.of_calidad_caracteristicas(id) on delete cascade,
  unidad             integer not null check (unidad >= 1),
  valor              numeric,
  conforme           boolean not null,
  medido_por         uuid default auth.uid(),
  medido_en          timestamptz not null default now(),
  constraint of_calidad_mediciones_uk unique (caracteristica_id, unidad)
);
create index if not exists idx_of_calidad_med_of on public.of_calidad_mediciones (of_id);

-- ─────────────────────────────────────────────────────────────
-- 4. No conformidades
-- ─────────────────────────────────────────────────────────────
create table if not exists public.of_no_conformidades (
  id                 uuid primary key default gen_random_uuid(),
  of_id              uuid not null references public.ordenes_fabricacion(id) on delete cascade,
  empresa_id         text not null references public.empresas(id),
  numero             text not null,
  caracteristica_id  uuid references public.of_calidad_caracteristicas(id) on delete set null,
  unidad             integer,
  valor_medido       numeric,
  descripcion        text not null,
  disposicion        text not null check (disposicion in ('reprocesar', 'concesion', 'rechazar')),
  responsable        text,
  estado             text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  accion_cierre      text,
  valor_cierre       numeric,
  evidencia          text,
  creado_por         uuid default auth.uid(),
  creado_en          timestamptz not null default now(),
  cerrado_por        uuid,
  cerrado_en         timestamptz,
  constraint of_no_conformidades_numero_uk unique (empresa_id, numero)
);
create index if not exists idx_of_nc_of on public.of_no_conformidades (of_id, estado);

-- ─────────────────────────────────────────────────────────────
-- 5. RLS: lectura con permiso de OF o de Calidad; la escritura solo por las funciones of_calidad_*
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['of_calidad_caracteristicas', 'of_calidad_mediciones', 'of_no_conformidades'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format($p$create policy %1$s_select on public.%1$s for select using (
      exists (select 1 from public.ordenes_fabricacion o
               where o.id = %1$s.of_id
                 and public.usuario_tiene_empresa(o.empresa_id)
                 and (public.usuario_puede(o.empresa_id, 'of', 'ver') or public.usuario_puede(o.empresa_id, 'of_calidad', 'ver'))))$p$, t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 6. Permiso 'of_calidad': quien aprueba OF recibe Calidad completo; el resto solo lo ve
-- ─────────────────────────────────────────────────────────────
insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
                                   puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas, permisos_extra)
select pr.rol_id, 'of_calidad', pr.puede_ver, false, pr.puede_aprobar, false,
       pr.puede_aprobar, pr.puede_aprobar, false, false, '{}'::jsonb
  from public.permisos_roles pr
 where pr.pantalla = 'of'
on conflict (rol_id, pantalla) do nothing;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.asignar_permisos_default_a_rol'::regproc);
  if (length(d) - length(replace(d, $q$'backlog','ot','of','partes'$q$, ''))) / length($q$'backlog','ot','of','partes'$q$) <> 2 then
    raise exception 'asignar_permisos_default_a_rol: se esperaban 2 listas de admin/jefe con backlog,ot,of,partes';
  end if;
  execute replace(d, $q$'backlog','ot','of','partes'$q$, $q$'backlog','ot','of','of_calidad','partes'$q$);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Utilidades
-- ─────────────────────────────────────────────────────────────
-- Número desde texto ("60", "60,5", "+0.05", "−0.02", "60 mm"); null si no es numérico.
create or replace function public.of_calidad_numero(p_texto text)
returns numeric
language plpgsql immutable
set search_path to 'public'
as $$
declare v text;
begin
  v := btrim(coalesce(p_texto, ''));
  if v = '' then return null; end if;
  v := replace(replace(v, chr(8722), '-'), ',', '.');
  v := regexp_replace(v, '\s*(mm|cm|m|in|pulg|°|deg|um|µm)\.?$', '', 'i');
  v := btrim(v);
  if v ~ '^[+-]?\s*[0-9]+(\.[0-9]+)?$' then
    return replace(v, ' ', '')::numeric;
  end if;
  return null;
end;
$$;

-- Acceso de Calidad a la OF (bloquea la fila para la transacción).
create or replace function public.of_calidad_exigir(p_of_id uuid, p_estados text[], p_pantalla text, p_accion text)
returns public.ordenes_fabricacion
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_alc uuid[];
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id for update;
  if not found then raise exception 'La OF no existe.'; end if;
  if not public.usuario_tiene_empresa(v.empresa_id) or not public.usuario_puede(v.empresa_id, p_pantalla, p_accion) then
    raise exception 'No tienes permiso para esta acción de calidad.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(v.empresa_id);
  if v_alc is not null and v.sociedad_id is not null and not (v.sociedad_id = any (v_alc)) then
    raise exception 'La sociedad de la OF está fuera de tu alcance.' using errcode = '42501';
  end if;
  if p_estados is not null and not (v.estado = any (p_estados)) then
    raise exception 'La OF está en estado % y no admite este cambio.', v.estado;
  end if;
  return v;
end;
$$;

-- Conformidad de un valor medido contra nominal y tolerancias.
create or replace function public.of_calidad_conforme(p_nominal numeric, p_menos numeric, p_mas numeric, p_valor numeric)
returns boolean
language sql immutable
as $$
  select p_valor >= p_nominal - abs(coalesce(p_menos, 0)) and p_valor <= p_nominal + abs(coalesce(p_mas, 0));
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. Datos de la pestaña Calidad
-- ─────────────────────────────────────────────────────────────
create or replace function public.of_calidad_datos(p_of_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_ficha record;
  v_diag text;
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id;
  if not found then raise exception 'La OF no existe.'; end if;
  if not public.usuario_tiene_empresa(v.empresa_id)
     or not (public.usuario_puede(v.empresa_id, 'of', 'ver') or public.usuario_puede(v.empresa_id, 'of_calidad', 'ver')) then
    raise exception 'No tienes permiso para ver la calidad de esta OF.' using errcode = '42501';
  end if;

  if v.ficha_fabricacion_id is not null then
    select f.id, f.version, f.snapshot, f.diagnostico_id into v_ficha
      from public.diagnostico_fabricacion_fichas f where f.id = v.ficha_fabricacion_id;
  else
    select h.diagnostico_id into v_diag from public.hojas_costeo h where h.id = v.hoja_costeo_id;
    select f.id, f.version, f.snapshot, f.diagnostico_id into v_ficha
      from public.diagnostico_fabricacion_fichas f
     where f.diagnostico_id = v_diag
     order by f.version desc limit 1;
  end if;

  return jsonb_build_object(
    'estado', v.estado,
    'puede_enviar', public.usuario_puede(v.empresa_id, 'of', 'editar'),
    'puede_inspeccionar', public.usuario_puede(v.empresa_id, 'of_calidad', 'editar'),
    'puede_liberar', public.usuario_puede(v.empresa_id, 'of_calidad', 'aprobar'),
    'enviado_en', v.calidad_enviado_en,
    'liberado_en', v.calidad_liberado_en,
    'liberado_por', (select coalesce(u.nombre, u.email) from public.usuarios u where u.id = v.calidad_liberado_por::text limit 1),
    'ficha', case when v_ficha.id is null then null else jsonb_build_object(
      'id', v_ficha.id, 'version', v_ficha.version, 'diagnostico_id', v_ficha.diagnostico_id,
      'piezas', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', p->>'id', 'orden', p->'orden', 'nombre', p->>'nombre', 'cantidad', p->'cantidad',
                    'plano_origen', p->>'plano_origen', 'plano_imagen_ruta', p->>'plano_imagen_ruta',
                    'plano_ancho', p->'plano_ancho', 'plano_alto', p->'plano_alto', 'svg', p->>'svg',
                    'material', p->'material', 'consumo_material', p->'consumo_material')), '[]'::jsonb)
                   from jsonb_array_elements(coalesce(v_ficha.snapshot->'piezas', '[]'::jsonb)) p)) end,
    'caracteristicas', (select coalesce(jsonb_agg(to_jsonb(c) order by c.pieza_orden, c.numero), '[]'::jsonb)
                          from public.of_calidad_caracteristicas c where c.of_id = v.id),
    'mediciones', (select coalesce(jsonb_agg(jsonb_build_object('caracteristica_id', m.caracteristica_id, 'unidad', m.unidad,
                                     'valor', m.valor, 'conforme', m.conforme, 'medido_en', m.medido_en)), '[]'::jsonb)
                     from public.of_calidad_mediciones m where m.of_id = v.id),
    'no_conformidades', (select coalesce(jsonb_agg(to_jsonb(n) order by n.creado_en), '[]'::jsonb)
                           from public.of_no_conformidades n where n.of_id = v.id)
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. Enviar a calidad: copia las características de la ficha y pasa la OF a "En calidad"
-- ─────────────────────────────────────────────────────────────
create or replace function public.of_calidad_enviar(p_of_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_diag text;
  v_ficha record;
  v_n integer := 0;
begin
  v := public.of_calidad_exigir(p_of_id, array['aprobada', 'en_produccion'], 'of', 'editar');

  select h.diagnostico_id into v_diag from public.hojas_costeo h where h.id = v.hoja_costeo_id;
  select f.id, f.snapshot into v_ficha
    from public.diagnostico_fabricacion_fichas f
   where f.diagnostico_id = v_diag
   order by f.version desc limit 1;

  if v_ficha.id is not null and not exists (select 1 from public.of_calidad_caracteristicas where of_id = v.id) then
    insert into public.of_calidad_caracteristicas (of_id, empresa_id, pieza_id, pieza_nombre, pieza_orden, pieza_cantidad,
                                                   numero, nombre, parte, tipo_control, nominal, nominal_texto, unidad,
                                                   tol_menos, tol_mas, critica, pos_x, pos_y)
    select v.id, v.empresa_id, (p->>'id')::uuid, coalesce(nullif(p->>'nombre', ''), 'Pieza'),
           coalesce((p->>'orden')::integer, pi.ord::integer),
           greatest(1, least(500, coalesce(round((p->>'cantidad')::numeric)::integer, 1))),
           c.numero, c.nombre,
           (select z.nombre from public.diagnostico_fabricacion_piezas dp
              join public.catalogo_componente_zonas z on z.componente_id = dp.componente_catalogo_id and z.id = c.zona_id
             where dp.id = c.pieza_id limit 1),
           case when public.of_calidad_numero(c.nominal) is null then 'visual' else 'medida' end,
           public.of_calidad_numero(c.nominal), nullif(btrim(coalesce(c.nominal, '')), ''), nullif(btrim(coalesce(c.unidad, '')), ''),
           abs(public.of_calidad_numero(c.tolerancia_menos)), abs(public.of_calidad_numero(c.tolerancia_mas)),
           coalesce(c.critica, false), c.pos_x, c.pos_y
      from jsonb_array_elements(coalesce(v_ficha.snapshot->'piezas', '[]'::jsonb)) with ordinality pi(p, ord)
      join public.diagnostico_fabricacion_caracteristicas c on c.pieza_id = (p->>'id')::uuid
     order by pi.ord, c.numero;
    get diagnostics v_n = row_count;
  end if;

  update public.ordenes_fabricacion
     set estado = 'en_calidad',
         ficha_fabricacion_id = coalesce(ficha_fabricacion_id, v_ficha.id),
         calidad_enviado_en = now(),
         calidad_enviado_por = auth.uid()
   where id = v.id;

  return jsonb_build_object('id', v.id, 'estado', 'en_calidad', 'caracteristicas', v_n, 'ficha_id', v_ficha.id);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 10. Registrar o borrar una medición
-- ─────────────────────────────────────────────────────────────
create or replace function public.of_calidad_medir(p_caracteristica_id uuid, p_unidad integer, p_valor numeric, p_conforme boolean)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  c public.of_calidad_caracteristicas%rowtype;
  v public.ordenes_fabricacion%rowtype;
  v_conforme boolean;
begin
  select * into c from public.of_calidad_caracteristicas where id = p_caracteristica_id;
  if not found then raise exception 'La característica no existe.'; end if;
  v := public.of_calidad_exigir(c.of_id, array['en_calidad'], 'of_calidad', 'editar');
  if p_unidad is null or p_unidad < 1 or p_unidad > c.pieza_cantidad then
    raise exception 'La unidad debe estar entre 1 y %.', c.pieza_cantidad;
  end if;
  if exists (select 1 from public.of_no_conformidades n
              where n.caracteristica_id = c.id and n.unidad = p_unidad and n.estado = 'abierta') then
    raise exception 'Esta unidad tiene una NC abierta: la nueva medición se registra al cerrarla.';
  end if;

  if p_valor is null and p_conforme is null then
    delete from public.of_calidad_mediciones where caracteristica_id = c.id and unidad = p_unidad;
    return jsonb_build_object('caracteristica_id', c.id, 'unidad', p_unidad, 'borrada', true);
  end if;

  if c.tipo_control = 'medida' then
    if p_valor is null then raise exception 'Escribe el valor medido.'; end if;
    v_conforme := public.of_calidad_conforme(c.nominal, c.tol_menos, c.tol_mas, p_valor);
  else
    if p_conforme is null then raise exception 'Indica si la característica es conforme.'; end if;
    v_conforme := p_conforme;
  end if;

  insert into public.of_calidad_mediciones (of_id, empresa_id, caracteristica_id, unidad, valor, conforme)
  values (c.of_id, c.empresa_id, c.id, p_unidad, case when c.tipo_control = 'medida' then p_valor end, v_conforme)
  on conflict (caracteristica_id, unidad) do update
     set valor = excluded.valor, conforme = excluded.conforme, medido_por = auth.uid(), medido_en = now();

  return jsonb_build_object('caracteristica_id', c.id, 'unidad', p_unidad, 'valor', p_valor, 'conforme', v_conforme);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 11. Abrir y cerrar no conformidades
-- ─────────────────────────────────────────────────────────────
create or replace function public.of_calidad_abrir_nc(p_caracteristica_id uuid, p_unidad integer, p_descripcion text,
                                                      p_disposicion text, p_responsable text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  c public.of_calidad_caracteristicas%rowtype;
  v public.ordenes_fabricacion%rowtype;
  m public.of_calidad_mediciones%rowtype;
  v_num text;
  v_pref text := 'NC-' || to_char(current_date, 'YY') || '-';
  v_id uuid;
begin
  select * into c from public.of_calidad_caracteristicas where id = p_caracteristica_id;
  if not found then raise exception 'La característica no existe.'; end if;
  v := public.of_calidad_exigir(c.of_id, array['en_calidad'], 'of_calidad', 'editar');
  if coalesce(btrim(p_descripcion), '') = '' then raise exception 'Describe la no conformidad.'; end if;
  if p_disposicion not in ('reprocesar', 'concesion', 'rechazar') then raise exception 'Elige una disposición válida.'; end if;
  select * into m from public.of_calidad_mediciones where caracteristica_id = c.id and unidad = p_unidad;
  if not found or m.conforme then
    raise exception 'Solo se abre una NC sobre una medición fuera de tolerancia o no conforme.';
  end if;
  if exists (select 1 from public.of_no_conformidades n
              where n.caracteristica_id = c.id and n.unidad = p_unidad and n.estado = 'abierta') then
    raise exception 'Esta unidad ya tiene una NC abierta.';
  end if;

  perform pg_advisory_xact_lock(hashtext('of_nc:' || c.empresa_id));
  select v_pref || lpad((coalesce(max(substring(numero from length(v_pref) + 1)::integer), 0) + 1)::text, 4, '0')
    into v_num
    from public.of_no_conformidades
   where empresa_id = c.empresa_id and numero like v_pref || '%' and substring(numero from length(v_pref) + 1) ~ '^[0-9]+$';

  insert into public.of_no_conformidades (of_id, empresa_id, numero, caracteristica_id, unidad, valor_medido, descripcion, disposicion, responsable)
  values (c.of_id, c.empresa_id, v_num, c.id, p_unidad, m.valor, btrim(p_descripcion), p_disposicion, nullif(btrim(coalesce(p_responsable, '')), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'numero', v_num);
end;
$$;

create or replace function public.of_calidad_cerrar_nc(p_nc_id uuid, p_accion text, p_valor numeric, p_conforme boolean, p_evidencia text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  n public.of_no_conformidades%rowtype;
  c public.of_calidad_caracteristicas%rowtype;
  v public.ordenes_fabricacion%rowtype;
  v_conforme boolean;
begin
  select * into n from public.of_no_conformidades where id = p_nc_id;
  if not found then raise exception 'La NC no existe.'; end if;
  v := public.of_calidad_exigir(n.of_id, array['en_calidad'], 'of_calidad', 'editar');
  if n.estado <> 'abierta' then raise exception 'La NC ya está cerrada.'; end if;
  if coalesce(btrim(p_accion), '') = '' then raise exception 'Describe la acción realizada.'; end if;
  select * into c from public.of_calidad_caracteristicas where id = n.caracteristica_id;

  if n.disposicion = 'concesion' then
    if coalesce(btrim(p_evidencia), '') = '' then
      raise exception 'La concesión necesita la evidencia de la aprobación del cliente.';
    end if;
  elsif c.id is not null then
    -- Reprocesar o rehacer: la unidad debe volver a medirse dentro de tolerancia.
    if c.tipo_control = 'medida' then
      if p_valor is null then raise exception 'Escribe la nueva medición.'; end if;
      v_conforme := public.of_calidad_conforme(c.nominal, c.tol_menos, c.tol_mas, p_valor);
    else
      v_conforme := coalesce(p_conforme, false);
    end if;
    if not v_conforme then
      raise exception 'La nueva medición sigue fuera de tolerancia: la NC no se puede cerrar.';
    end if;
    update public.of_calidad_mediciones
       set valor = case when c.tipo_control = 'medida' then p_valor end, conforme = true, medido_por = auth.uid(), medido_en = now()
     where caracteristica_id = c.id and unidad = n.unidad;
  end if;

  update public.of_no_conformidades
     set estado = 'cerrada', accion_cierre = btrim(p_accion),
         valor_cierre = case when n.disposicion = 'concesion' then null else p_valor end,
         evidencia = nullif(btrim(coalesce(p_evidencia, '')), ''),
         cerrado_por = auth.uid(), cerrado_en = now()
   where id = n.id;
  return jsonb_build_object('id', n.id, 'estado', 'cerrada');
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 12. Liberar: críticas OK en cada unidad (o aceptadas por concesión) y sin NC abiertas
-- ─────────────────────────────────────────────────────────────
create or replace function public.of_calidad_liberar(p_of_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_faltan integer;
begin
  v := public.of_calidad_exigir(p_of_id, array['en_calidad'], 'of_calidad', 'aprobar');
  if exists (select 1 from public.of_no_conformidades where of_id = v.id and estado = 'abierta') then
    raise exception 'Hay no conformidades abiertas: ciérralas antes de liberar.';
  end if;
  select count(*) into v_faltan
    from public.of_calidad_caracteristicas c
    cross join lateral generate_series(1, c.pieza_cantidad) u(n)
    left join public.of_calidad_mediciones m on m.caracteristica_id = c.id and m.unidad = u.n
   where c.of_id = v.id and c.critica
     and not coalesce(m.conforme, false)
     and not exists (select 1 from public.of_no_conformidades nc
                      where nc.caracteristica_id = c.id and nc.unidad = u.n
                        and nc.disposicion = 'concesion' and nc.estado = 'cerrada');
  if v_faltan > 0 then
    raise exception 'Faltan % mediciones críticas dentro de tolerancia.', v_faltan;
  end if;
  update public.ordenes_fabricacion
     set estado = 'lista_entrega', calidad_liberado_en = now(), calidad_liberado_por = auth.uid()
   where id = v.id;
  return jsonb_build_object('id', v.id, 'estado', 'lista_entrega');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['of_calidad_exigir(uuid,text[],text,text)', 'of_calidad_datos(uuid)', 'of_calidad_enviar(uuid)',
                           'of_calidad_medir(uuid,integer,numeric,boolean)', 'of_calidad_abrir_nc(uuid,integer,text,text,text)',
                           'of_calidad_cerrar_nc(uuid,text,numeric,boolean,text)', 'of_calidad_liberar(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 13. Material de las piezas del diagnóstico también en OS mixtas
-- ─────────────────────────────────────────────────────────────
do $$
declare
  f text;
  d text;
  v_old text := $q$m.linea_mano_obra_id is null and v_os.tipo_ejecucion = 'fabricacion'$q$;
  v_new text := $q$m.linea_mano_obra_id is null and (v_os.tipo_ejecucion = 'fabricacion' or m.diagnostico_pieza_id is not null)$q$;
begin
  foreach f in array array['public.crear_of_desde_os(text,boolean)', 'public.vista_previa_of_desde_os(text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if (length(d) - length(replace(d, v_old, ''))) / length(v_old) <> 1 then
      raise exception '%: no se encontró la condición del material sin tarea', f;
    end if;
    execute replace(d, v_old, v_new);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Comprobación
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if (select count(*) from information_schema.tables where table_schema = 'public'
       and table_name in ('of_calidad_caracteristicas', 'of_calidad_mediciones', 'of_no_conformidades')) <> 3 then
    raise exception 'VERIFY F4: faltan tablas de calidad';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public'
       and tablename in ('of_calidad_caracteristicas', 'of_calidad_mediciones', 'of_no_conformidades')) <> 3 then
    raise exception 'VERIFY F4: políticas de lectura incompletas';
  end if;
  if (select count(*) from public.permisos_roles where pantalla = 'of_calidad')
     <> (select count(*) from public.permisos_roles where pantalla = 'of') then
    raise exception 'VERIFY F4: permisos of_calidad distintos de of';
  end if;
  if position('of_calidad' in pg_get_functiondef('public.asignar_permisos_default_a_rol'::regproc)) = 0 then
    raise exception 'VERIFY F4: asignar_permisos_default_a_rol sin of_calidad';
  end if;
  if position('m.diagnostico_pieza_id is not null' in pg_get_functiondef('public.crear_of_desde_os(text,boolean)'::regprocedure)) = 0
     or position('m.diagnostico_pieza_id is not null' in pg_get_functiondef('public.vista_previa_of_desde_os(text)'::regprocedure)) = 0 then
    raise exception 'VERIFY F4: OF sin material de piezas en OS mixta';
  end if;
  if public.of_calidad_numero('−0,02') <> -0.02 or public.of_calidad_numero('60 mm') <> 60 or public.of_calidad_numero('Ra 1.6') is not null then
    raise exception 'VERIFY F4: of_calidad_numero no interpreta bien los textos';
  end if;
end $$;
