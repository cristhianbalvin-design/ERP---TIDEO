-- F5b · Pasaporte por serie, garantías de producción, reclamos y OF de garantía (no facturable).
-- Un reclamo se registra sobre la garantía de una unidad entregada; si procede, se crea una OF de garantía
-- (borrador, no facturable, enlazada al reclamo). Al entregar o cerrar esa OF, el reclamo se cierra.
-- La OF de garantía entrega la misma unidad del reclamo: no crea unidades ni garantías nuevas.

alter table public.ordenes_fabricacion
  add column if not exists facturable boolean not null default true,
  add column if not exists reclamo_id uuid;

create table public.of_reclamos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  sociedad_id uuid,
  numero text not null,
  garantia_id uuid not null references public.of_garantias(id) on delete cascade,
  unidad_id uuid not null references public.of_unidades(id) on delete cascade,
  of_id uuid not null references public.ordenes_fabricacion(id) on delete cascade,
  fecha date not null,
  falla text not null check (length(btrim(falla)) between 5 and 2000),
  evaluacion text not null default 'pendiente' check (evaluacion in ('pendiente', 'procede', 'no_procede')),
  observacion text,
  estado text not null default 'abierto' check (estado in ('abierto', 'en_reparacion', 'cerrado', 'rechazado')),
  of_garantia_id uuid references public.ordenes_fabricacion(id) on delete set null,
  fotos jsonb not null default '[]'::jsonb,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  cerrado_en timestamptz,
  unique (empresa_id, numero)
);
create index of_reclamos_garantia_idx on public.of_reclamos (garantia_id);
create index of_reclamos_of_garantia_idx on public.of_reclamos (of_garantia_id);
alter table public.ordenes_fabricacion
  add constraint ordenes_fabricacion_reclamo_fk foreign key (reclamo_id) references public.of_reclamos(id) on delete set null;

alter table public.of_reclamos enable row level security;
create policy of_reclamos_select on public.of_reclamos for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'of', 'ver')
         and (public.usuario_alcance_sociedades(empresa_id) is null or sociedad_id = any (public.usuario_alcance_sociedades(empresa_id))));
grant select on public.of_reclamos to authenticated;

-- Numeración REC-AA-NNNN por empresa (se amplía of_siguiente_numero).
create or replace function public.of_siguiente_numero(p_empresa_id text, p_prefijo text)
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('of-numero:' || p_empresa_id || ':' || p_prefijo, 0));
  if left(p_prefijo, 4) = 'AEF-' then
    select coalesce(max(substr(numero, length(p_prefijo) + 1)::integer), 0) + 1 into v_n
      from public.of_entregas where empresa_id = p_empresa_id and numero like p_prefijo || '%' and substr(numero, length(p_prefijo) + 1) ~ '^[0-9]+$';
  elsif left(p_prefijo, 4) = 'GAR-' then
    select coalesce(max(substr(numero, length(p_prefijo) + 1)::integer), 0) + 1 into v_n
      from public.of_garantias where empresa_id = p_empresa_id and numero like p_prefijo || '%' and substr(numero, length(p_prefijo) + 1) ~ '^[0-9]+$';
  elsif left(p_prefijo, 4) = 'REC-' then
    select coalesce(max(substr(numero, length(p_prefijo) + 1)::integer), 0) + 1 into v_n
      from public.of_reclamos where empresa_id = p_empresa_id and numero like p_prefijo || '%' and substr(numero, length(p_prefijo) + 1) ~ '^[0-9]+$';
  else
    raise exception 'Prefijo de numeración no válido.';
  end if;
  return v_n;
end;
$$;
revoke all on function public.of_siguiente_numero(text, text) from public, anon, authenticated;

-- Garantía visible para el usuario (empresa, permiso y sociedad), con bloqueo opcional.
create or replace function public.of_garantia_exigir(p_garantia_id uuid, p_accion text)
returns public.of_garantias
language plpgsql security definer
set search_path to 'public'
as $$
declare g public.of_garantias%rowtype; v_alc uuid[];
begin
  select * into g from public.of_garantias where id = p_garantia_id for update;
  if not found then raise exception 'La garantía no existe.'; end if;
  if not public.usuario_tiene_empresa(g.empresa_id) or not public.usuario_puede(g.empresa_id, 'of', p_accion) then
    raise exception 'No tienes permiso para esta acción en garantías.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(g.empresa_id);
  if v_alc is not null and g.sociedad_id is not null and not (g.sociedad_id = any (v_alc)) then
    raise exception 'La sociedad de la garantía está fuera de tu alcance.' using errcode = '42501';
  end if;
  return g;
end;
$$;
revoke all on function public.of_garantia_exigir(uuid, text) from public, anon, authenticated;

-- Crea la OF de garantía de un reclamo que procede (borrador, no facturable).
create or replace function public.of_crear_of_garantia(p_reclamo_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare r public.of_reclamos%rowtype; o public.ordenes_fabricacion%rowtype; u public.of_unidades%rowtype; v_id uuid; v_num text;
begin
  select * into r from public.of_reclamos where id = p_reclamo_id for update;
  if not found then raise exception 'El reclamo no existe.'; end if;
  perform public.of_garantia_exigir(r.garantia_id, 'ver');
  if not public.usuario_puede(r.empresa_id, 'of', 'crear') then
    raise exception 'No tienes permiso para crear órdenes de fabricación.' using errcode = '42501';
  end if;
  if r.evaluacion <> 'procede' then raise exception 'Solo se crea una OF de garantía cuando el reclamo procede.'; end if;
  if r.of_garantia_id is not null then raise exception 'El reclamo ya tiene su OF de garantía.'; end if;
  if r.estado in ('cerrado', 'rechazado') then raise exception 'El reclamo ya está cerrado.'; end if;
  select * into o from public.ordenes_fabricacion where id = r.of_id;
  select * into u from public.of_unidades where id = r.unidad_id;
  v_num := public.siguiente_numero_orden_fabricacion(r.empresa_id);
  insert into public.ordenes_fabricacion (empresa_id, sociedad_id, numero, os_cliente_id, cuenta_id, activo_id, descripcion,
                                          moneda, garantia_meses, facturable, reclamo_id)
  values (r.empresa_id, o.sociedad_id, v_num, o.os_cliente_id, o.cuenta_id, o.activo_id,
          left('Garantía ' || u.serie || ': ' || btrim(r.falla), 500), o.moneda, 0, false, r.id)
  returning id into v_id;
  update public.of_reclamos set of_garantia_id = v_id, estado = 'en_reparacion' where id = r.id;
  return jsonb_build_object('of_id', v_id, 'numero', v_num);
end;
$$;

-- Registra un reclamo; si procede y se pide, crea la OF de garantía.
create or replace function public.of_registrar_reclamo(p_garantia_id uuid, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  g public.of_garantias%rowtype;
  v_fecha date;
  v_falla text := nullif(btrim(coalesce(p_datos->>'falla', '')), '');
  v_eval text := coalesce(nullif(btrim(coalesce(p_datos->>'evaluacion', '')), ''), 'pendiente');
  v_obs text := nullif(btrim(coalesce(p_datos->>'observacion', '')), '');
  v_fotos jsonb := coalesce(p_datos->'fotos', '[]'::jsonb);
  v_pref text; f jsonb; v_id uuid; v_num text; v_of jsonb;
  v_hoy date := (now() at time zone 'America/Lima')::date;
begin
  g := public.of_garantia_exigir(p_garantia_id, 'editar');
  begin
    v_fecha := coalesce(nullif(btrim(coalesce(p_datos->>'fecha', '')), '')::date, v_hoy);
  exception when others then raise exception 'La fecha del reclamo no es válida.';
  end;
  if g.estado <> 'vigente' then raise exception 'La garantía no está vigente.'; end if;
  if v_fecha > v_hoy then raise exception 'La fecha del reclamo no puede ser futura.'; end if;
  if v_fecha < g.fecha_inicio then raise exception 'La fecha del reclamo es anterior al inicio de la garantía.'; end if;
  if v_falla is null or length(v_falla) < 5 then raise exception 'Describe la falla reportada (mínimo 5 caracteres).'; end if;
  if v_eval not in ('pendiente', 'procede', 'no_procede') then raise exception 'Evaluación no válida.'; end if;
  if v_eval = 'procede' and v_fecha > g.fecha_fin then raise exception 'La garantía venció el %; el reclamo no procede.', to_char(g.fecha_fin, 'DD/MM/YYYY'); end if;
  if v_eval = 'no_procede' and v_obs is null then raise exception 'Indica por qué el reclamo no procede.'; end if;
  if exists (select 1 from public.of_reclamos where garantia_id = g.id and estado in ('abierto', 'en_reparacion')) then
    raise exception 'Esta garantía ya tiene un reclamo abierto.';
  end if;
  v_pref := g.empresa_id || '/' || g.of_id::text || '/';
  if jsonb_typeof(v_fotos) <> 'array' or jsonb_array_length(v_fotos) > 6 then raise exception 'Agrega como máximo 6 fotos.'; end if;
  for f in select * from jsonb_array_elements(v_fotos) loop
    if left(coalesce(f->>'path', ''), length(v_pref)) <> v_pref
       or not exists (select 1 from storage.objects o where o.bucket_id = 'of-entregas' and o.name = f->>'path') then
      raise exception 'Una foto del reclamo no se subió completa. Vuelve a intentarlo.';
    end if;
  end loop;
  v_num := 'REC-' || to_char(v_hoy, 'YY') || '-' || lpad(public.of_siguiente_numero(g.empresa_id, 'REC-' || to_char(v_hoy, 'YY') || '-')::text, 4, '0');
  insert into public.of_reclamos (empresa_id, sociedad_id, numero, garantia_id, unidad_id, of_id, fecha, falla, evaluacion, observacion, estado, fotos)
  values (g.empresa_id, g.sociedad_id, v_num, g.id, g.unidad_id, g.of_id, v_fecha, v_falla, v_eval, v_obs,
          case when v_eval = 'no_procede' then 'rechazado' else 'abierto' end, v_fotos)
  returning id into v_id;
  if v_eval = 'no_procede' then update public.of_reclamos set cerrado_en = now() where id = v_id; end if;
  if v_eval = 'procede' and coalesce((p_datos->>'crear_of')::boolean, false) then
    v_of := public.of_crear_of_garantia(v_id);
  end if;
  return jsonb_build_object('reclamo_id', v_id, 'numero', v_num, 'of', v_of);
end;
$$;

-- Evalúa un reclamo pendiente (procede / no procede).
create or replace function public.of_evaluar_reclamo(p_reclamo_id uuid, p_evaluacion text, p_observacion text)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare r public.of_reclamos%rowtype; g public.of_garantias%rowtype; v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
begin
  select * into r from public.of_reclamos where id = p_reclamo_id for update;
  if not found then raise exception 'El reclamo no existe.'; end if;
  g := public.of_garantia_exigir(r.garantia_id, 'editar');
  if r.estado <> 'abierto' or r.evaluacion <> 'pendiente' then raise exception 'Solo se evalúa un reclamo pendiente.'; end if;
  if p_evaluacion not in ('procede', 'no_procede') then raise exception 'Evaluación no válida.'; end if;
  if p_evaluacion = 'procede' and r.fecha > g.fecha_fin then raise exception 'La garantía venció el %; el reclamo no procede.', to_char(g.fecha_fin, 'DD/MM/YYYY'); end if;
  if p_evaluacion = 'no_procede' and v_obs is null then raise exception 'Indica por qué el reclamo no procede.'; end if;
  update public.of_reclamos
     set evaluacion = p_evaluacion, observacion = coalesce(v_obs, observacion),
         estado = case when p_evaluacion = 'no_procede' then 'rechazado' else 'abierto' end,
         cerrado_en = case when p_evaluacion = 'no_procede' then now() end
   where id = r.id;
end;
$$;

-- Cierra o reabre el reclamo según el estado de su OF de garantía.
create or replace function public.trg_of_reclamo_estado()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
begin
  if new.reclamo_id is null or new.estado is not distinct from old.estado then return new; end if;
  if new.estado in ('entregada', 'cerrada') then
    update public.of_reclamos set estado = 'cerrado', cerrado_en = coalesce(cerrado_en, now())
     where id = new.reclamo_id and estado = 'en_reparacion';
  elsif new.estado = 'anulada' then
    update public.of_reclamos set estado = 'abierto', of_garantia_id = null
     where id = new.reclamo_id and of_garantia_id = new.id and estado = 'en_reparacion';
  end if;
  return new;
end;
$$;
create trigger trg_of_reclamo_estado after update of estado on public.ordenes_fabricacion
  for each row execute function public.trg_of_reclamo_estado();

-- Listado de garantías de producción con KPIs.
create or replace function public.of_garantias_listado(p_empresa_id text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare v_alc uuid[]; v_hoy date := (now() at time zone 'America/Lima')::date; v_filas jsonb; v_costo jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) or not public.usuario_puede(p_empresa_id, 'of', 'ver') then
    raise exception 'No tienes permiso para ver garantías.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  select coalesce(jsonb_agg(x order by x->>'fecha_fin'), '[]'::jsonb) into v_filas from (
    select jsonb_build_object(
      'id', g.id, 'numero', g.numero, 'unidad_id', u.id, 'serie', u.serie, 'unidad', u.unidad,
      'of_id', o.id, 'of_numero', o.numero, 'descripcion', o.descripcion,
      'cliente', coalesce(c.razon_social, c.nombre_comercial),
      'fecha_inicio', g.fecha_inicio, 'fecha_fin', g.fecha_fin,
      'situacion', case when g.estado = 'anulada' then 'anulada'
                        when ra.id is not null then 'con_reclamo'
                        when g.fecha_fin < v_hoy then 'vencida'
                        when g.fecha_fin <= v_hoy + 30 then 'vence_pronto'
                        else 'vigente' end,
      'reclamo', case when ra.id is null then null else jsonb_build_object('id', ra.id, 'numero', ra.numero, 'estado', ra.estado,
                   'evaluacion', ra.evaluacion, 'of_garantia_id', ra.of_garantia_id,
                   'of_garantia_numero', (select og.numero from public.ordenes_fabricacion og where og.id = ra.of_garantia_id)) end,
      'reclamos', (select count(*) from public.of_reclamos rr where rr.garantia_id = g.id)) x
      from public.of_garantias g
      join public.of_unidades u on u.id = g.unidad_id
      join public.ordenes_fabricacion o on o.id = g.of_id
      left join public.cuentas c on c.id = o.cuenta_id
      left join lateral (select * from public.of_reclamos r where r.garantia_id = g.id and r.estado in ('abierto', 'en_reparacion')
                          order by r.created_at desc limit 1) ra on true
     where g.empresa_id = p_empresa_id
       and (v_alc is null or g.sociedad_id is null or g.sociedad_id = any (v_alc))) t(x);
  select coalesce(jsonb_object_agg(moneda, total), '{}'::jsonb) into v_costo from (
    select coalesce(o.moneda, 'PEN') moneda, round(sum(o.costo_real), 2) total
      from public.ordenes_fabricacion o
     where o.empresa_id = p_empresa_id and o.reclamo_id is not null and o.estado <> 'anulada'
       and extract(year from o.created_at at time zone 'America/Lima') = extract(year from v_hoy)
       and (v_alc is null or o.sociedad_id is null or o.sociedad_id = any (v_alc))
     group by 1) s;
  return jsonb_build_object(
    'filas', v_filas,
    'kpis', jsonb_build_object(
      'vigentes', (select count(*) from jsonb_array_elements(v_filas) f where f->>'situacion' in ('vigente', 'vence_pronto', 'con_reclamo')),
      'vencen_30', (select count(*) from jsonb_array_elements(v_filas) f where f->>'situacion' = 'vence_pronto'),
      'reclamos_abiertos', (select count(*) from jsonb_array_elements(v_filas) f where f->>'situacion' = 'con_reclamo'),
      'costo_no_facturable', v_costo));
end;
$$;

-- Pasaporte de una unidad: contexto de la OF, entrega, garantía y reclamos.
create or replace function public.of_pasaporte(p_unidad_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare u public.of_unidades%rowtype; o public.ordenes_fabricacion%rowtype; v_alc uuid[];
begin
  select * into u from public.of_unidades where id = p_unidad_id;
  if not found then raise exception 'La unidad no existe.'; end if;
  if not public.usuario_tiene_empresa(u.empresa_id) or not public.usuario_puede(u.empresa_id, 'of', 'ver') then
    raise exception 'No tienes permiso para ver este pasaporte.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(u.empresa_id);
  if v_alc is not null and u.sociedad_id is not null and not (u.sociedad_id = any (v_alc)) then
    raise exception 'La sociedad de la unidad está fuera de tu alcance.' using errcode = '42501';
  end if;
  select * into o from public.ordenes_fabricacion where id = u.of_id;
  return jsonb_build_object(
    'unidad', jsonb_build_object('id', u.id, 'unidad', u.unidad, 'serie', u.serie),
    'of', jsonb_build_object('id', o.id, 'numero', o.numero, 'descripcion', o.descripcion, 'estado', o.estado,
            'fecha_apertura', o.fecha_apertura, 'calidad_liberado_en', o.calidad_liberado_en, 'entregada_en', o.entregada_en,
            'cliente', (select coalesce(c.razon_social, c.nombre_comercial) from public.cuentas c where c.id = o.cuenta_id),
            'os_numero', (select s.numero from public.os_clientes s where s.id = o.os_cliente_id)),
    'entrega', (select jsonb_build_object('id', e.id, 'numero', e.numero, 'fecha', e.fecha, 'recibe_nombre', e.recibe_nombre,
                  'conformidad', e.conformidad, 'pdf_path', e.pdf_path, 'guia_numero', gr.numero_completo)
                  from public.of_entregas e left join public.guias_remision gr on gr.id = e.guia_id where e.of_id = o.id),
    'garantia', (select jsonb_build_object('id', g.id, 'numero', g.numero, 'fecha_inicio', g.fecha_inicio, 'fecha_fin', g.fecha_fin, 'estado', g.estado)
                   from public.of_garantias g where g.unidad_id = u.id),
    'reclamos', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'numero', r.numero, 'fecha', r.fecha, 'falla', r.falla,
                   'evaluacion', r.evaluacion, 'estado', r.estado, 'observacion', r.observacion, 'of_garantia_id', r.of_garantia_id,
                   'of_garantia_numero', og.numero, 'of_garantia_estado', og.estado) order by r.created_at)
                   from public.of_reclamos r left join public.ordenes_fabricacion og on og.id = r.of_garantia_id
                  where r.unidad_id = u.id), '[]'::jsonb));
end;
$$;

-- Buscador de unidades entregadas para el pasaporte.
create or replace function public.of_pasaporte_buscar(p_empresa_id text, p_texto text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare v_alc uuid[]; v_t text := '%' || lower(btrim(coalesce(p_texto, ''))) || '%';
begin
  if not public.usuario_tiene_empresa(p_empresa_id) or not public.usuario_puede(p_empresa_id, 'of', 'ver') then
    raise exception 'No tienes permiso para ver pasaportes.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', u.id, 'serie', u.serie, 'unidad', u.unidad, 'of_numero', o.numero, 'descripcion', o.descripcion,
             'cliente', coalesce(c.razon_social, c.nombre_comercial), 'entregada_en', o.entregada_en) x
      from public.of_unidades u
      join public.ordenes_fabricacion o on o.id = u.of_id
      left join public.cuentas c on c.id = o.cuenta_id
     where u.empresa_id = p_empresa_id
       and (v_alc is null or u.sociedad_id is null or u.sociedad_id = any (v_alc))
       and (lower(u.serie) like v_t or lower(o.numero) like v_t or lower(coalesce(c.razon_social, c.nombre_comercial, '')) like v_t
            or lower(coalesce(o.descripcion, '')) like v_t)
     order by o.entregada_en desc nulls last, u.serie
     limit 30) t), '[]'::jsonb);
end;
$$;

create or replace function public.of_entrega_datos(p_of_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_alc uuid[];
  v_n integer;
  v_ru public.of_unidades%rowtype;
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id;
  if not found then raise exception 'La OF no existe.'; end if;
  if not public.usuario_tiene_empresa(v.empresa_id) or not public.usuario_puede(v.empresa_id, 'of', 'ver') then
    raise exception 'No tienes permiso para ver esta OF.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(v.empresa_id);
  if v_alc is not null and v.sociedad_id is not null and not (v.sociedad_id = any (v_alc)) then
    raise exception 'La sociedad de la OF está fuera de tu alcance.' using errcode = '42501';
  end if;
  select coalesce(max(pieza_cantidad), 1) into v_n from public.of_calidad_caracteristicas where of_id = v.id;
  if v.reclamo_id is not null then
    select u.* into v_ru from public.of_reclamos r join public.of_unidades u on u.id = r.unidad_id where r.id = v.reclamo_id;
  end if;
  return jsonb_build_object(
    'es_garantia', v.reclamo_id is not null,
    'puede_entregar', v.estado = 'lista_entrega' and public.usuario_puede(v.empresa_id, 'of', 'editar'),
    'garantia_meses', case when v.reclamo_id is not null then 0 else v.garantia_meses end,
    'unidades', case when v.reclamo_id is not null then jsonb_build_array(jsonb_build_object('unidad', v_ru.unidad, 'serie', v_ru.serie)) else (select jsonb_agg(jsonb_build_object('unidad', n, 'serie', v.numero || '-' || lpad(n::text, 2, '0')) order by n)
                   from generate_series(1, v_n) n) end,
    'cliente', (select jsonb_build_object('razon_social', coalesce(c.razon_social, c.nombre_comercial), 'ruc', c.ruc, 'direccion', c.direccion)
                  from public.cuentas c where c.id = v.cuenta_id),
    'partida', (select s.direccion_fiscal from public.sociedades s where s.id = v.sociedad_id));
end;
$$;

create or replace function public.of_entregar(p_of_id uuid, p_datos jsonb)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  c public.cuentas%rowtype;
  g jsonb := coalesce(p_datos->'guia', '{}'::jsonb);
  v_pref text;
  v_conf text := nullif(btrim(coalesce(p_datos->>'conformidad', '')), '');
  v_rec text := nullif(btrim(coalesce(p_datos->>'recibe_nombre', '')), '');
  v_dni text := nullif(btrim(coalesce(p_datos->>'recibe_dni', '')), '');
  v_fr text := nullif(btrim(coalesce(p_datos->>'firma_responsable_path', '')), '');
  v_fc text := nullif(btrim(coalesce(p_datos->>'firma_cliente_path', '')), '');
  v_fotos jsonb := coalesce(p_datos->'fotos', '[]'::jsonb);
  v_unis jsonb := coalesce(p_datos->'unidades', '[]'::jsonb);
  v_meses integer;
  v_mod text := coalesce(nullif(btrim(coalesce(g->>'modalidad', '')), ''), 'remitente');
  v_peso numeric;
  v_traslado date;
  u jsonb; f jsonb;
  v_uid uuid;
  v_gnum jsonb; v_guia text := 'gr_' || replace(gen_random_uuid()::text, '-', '');
  v_ent uuid; v_num text;
  v_ini date := (now() at time zone 'America/Lima')::date;
  v_esperadas integer;
  v_ru public.of_unidades%rowtype;
  v_ngar integer := 0;
begin
  v := public.of_exigir_edicion(p_of_id, array['lista_entrega'], 'editar');
  v_pref := v.empresa_id || '/' || v.id::text || '/';
  select * into c from public.cuentas where id = v.cuenta_id;
  -- OF de garantía: se entrega la unidad reparada del reclamo; no crea unidades ni garantías nuevas.
  if v.reclamo_id is not null then
    select xu.* into v_ru from public.of_reclamos r join public.of_unidades xu on xu.id = r.unidad_id where r.id = v.reclamo_id;
    v_unis := jsonb_build_array(jsonb_build_object('unidad', v_ru.unidad, 'serie', v_ru.serie));
    p_datos := jsonb_set(p_datos, '{garantia_meses}', '0'::jsonb);
  end if;
  begin
    v_meses := coalesce(nullif(btrim(coalesce(p_datos->>'garantia_meses', '')), '')::integer, v.garantia_meses);
    v_peso := nullif(btrim(coalesce(g->>'peso_bruto_total', '')), '')::numeric;
    v_traslado := nullif(btrim(coalesce(g->>'fecha_inicio_traslado', '')), '')::date;
  exception when others then
    raise exception 'Hay datos con formato no válido en la entrega.';
  end;
  if v_conf is null or v_conf not in ('conforme', 'con_observaciones') then raise exception 'Indica la conformidad del cliente.'; end if;
  if v_conf = 'con_observaciones' and nullif(btrim(coalesce(p_datos->>'observaciones', '')), '') is null then
    raise exception 'Escribe las observaciones del cliente.';
  end if;
  if v_rec is null then raise exception 'Indica el nombre de quien recibe.'; end if;
  if v_dni is null or v_dni !~ '^[0-9A-Za-z-]{6,15}$' then raise exception 'Indica un documento válido de quien recibe.'; end if;
  if v_fr is null or v_fc is null or left(v_fr, length(v_pref)) <> v_pref or left(v_fc, length(v_pref)) <> v_pref then
    raise exception 'Faltan las firmas del responsable y del cliente.';
  end if;
  if jsonb_typeof(v_fotos) <> 'array' or jsonb_array_length(v_fotos) not between 1 and 6 then
    raise exception 'Agrega entre 1 y 6 fotos de la entrega.';
  end if;
  for f in select * from jsonb_array_elements(v_fotos) loop
    if left(coalesce(f->>'path', ''), length(v_pref)) <> v_pref then raise exception 'Hay una foto que no pertenece a esta OF.'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'of-entregas' and o.name = f->>'path') then
      raise exception 'Una foto de la entrega no se subió completa. Vuelve a intentarlo.';
    end if;
  end loop;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'of-entregas' and o.name = v_fr)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'of-entregas' and o.name = v_fc) then
    raise exception 'Las firmas no se subieron completas. Vuelve a intentarlo.';
  end if;
  if jsonb_typeof(v_unis) <> 'array' or jsonb_array_length(v_unis) < 1 then raise exception 'Indica las unidades que se entregan.'; end if;
  if (select count(distinct lower(btrim(x->>'serie'))) from jsonb_array_elements(v_unis) x where nullif(btrim(x->>'serie'), '') is not null)
     <> jsonb_array_length(v_unis) then
    raise exception 'Cada unidad necesita una serie distinta.';
  end if;
  select case when v.reclamo_id is not null then 1 else coalesce(max(pieza_cantidad), 1) end into v_esperadas from public.of_calidad_caracteristicas where of_id = v.id;
  if v.reclamo_id is null and (jsonb_array_length(v_unis) <> v_esperadas
     or (select count(distinct (x->>'unidad')) from jsonb_array_elements(v_unis) x
          where (x->>'unidad') ~ '^[0-9]+$' and (x->>'unidad')::integer between 1 and v_esperadas) <> v_esperadas) then
    raise exception 'Se deben entregar las % unidades de la OF, numeradas del 1 al %.', v_esperadas, v_esperadas;
  end if;
  if v_meses is null or v_meses not between 0 and 120 then raise exception 'La garantía debe estar entre 0 y 120 meses.'; end if;
  if nullif(btrim(coalesce(g->>'partida_direccion', '')), '') is null then raise exception 'Indica el punto de partida.'; end if;
  if nullif(btrim(coalesce(g->>'llegada_direccion', '')), '') is null then raise exception 'Indica el punto de llegada.'; end if;
  if v_traslado is null then raise exception 'Indica la fecha de inicio del traslado.'; end if;
  if v_peso is null or v_peso <= 0 then raise exception 'Indica el peso bruto en kg.'; end if;
  if v_mod not in ('remitente', 'transportista') then raise exception 'Modalidad de transporte no válida.'; end if;
  if v_mod = 'remitente' and (nullif(btrim(coalesce(g->>'vehiculo_placa', '')), '') is null
       or nullif(btrim(coalesce(g->>'conductor_nombre', '')), '') is null
       or nullif(btrim(coalesce(g->>'conductor_dni', '')), '') is null
       or nullif(btrim(coalesce(g->>'conductor_brevete', '')), '') is null) then
    raise exception 'En transporte privado indica placa, conductor, documento y licencia.';
  end if;
  if v_mod = 'transportista' and (nullif(btrim(coalesce(g->>'transportista_ruc', '')), '') is null
       or nullif(btrim(coalesce(g->>'transportista_razon_social', '')), '') is null) then
    raise exception 'En transporte público indica el RUC y la razón social del transportista.';
  end if;

  -- Unidades (no aplica a una OF de garantía)
  for u in select * from jsonb_array_elements(v_unis) where v.reclamo_id is null loop
    if exists (select 1 from public.of_unidades x where x.empresa_id = v.empresa_id and lower(x.serie) = lower(btrim(u->>'serie')) and x.of_id <> v.id) then
      raise exception 'La serie % ya existe en otra OF.', btrim(u->>'serie');
    end if;
    insert into public.of_unidades (empresa_id, sociedad_id, of_id, unidad, serie)
    values (v.empresa_id, v.sociedad_id, v.id, (u->>'unidad')::integer, btrim(u->>'serie'))
    on conflict (of_id, unidad) do update set serie = excluded.serie
    returning id into v_uid;
  end loop;

  -- Guía de remisión
  v_gnum := public.guia_reservar_numero(v.empresa_id, coalesce(nullif(btrim(coalesce(g->>'serie', '')), ''), 'T001'), v.sociedad_id);
  insert into public.guias_remision (id, empresa_id, serie, numero, numero_completo, fecha_emision, fecha_inicio_traslado, tipo_origen,
    motivo_traslado, modalidad, of_id, sociedad_origen_id, partida_direccion, llegada_direccion, destinatario_ruc_dni, destinatario_razon_social,
    peso_bruto_total, unidad_peso, transportista_ruc, transportista_razon_social, vehiculo_placa, conductor_nombre, conductor_dni,
    conductor_brevete, estado, created_by, created_at, updated_at)
  values (v_guia, v.empresa_id, split_part(v_gnum->>'numero_completo', '-', 1), (v_gnum->>'numero')::integer, v_gnum->>'numero_completo',
    v_ini, v_traslado, 'despacho_servicio', '01', v_mod, v.id, v.sociedad_id, btrim(g->>'partida_direccion'), btrim(g->>'llegada_direccion'),
    coalesce(c.ruc, ''), coalesce(c.razon_social, c.nombre_comercial, ''), v_peso, 'KGM',
    nullif(btrim(coalesce(g->>'transportista_ruc', '')), ''), nullif(btrim(coalesce(g->>'transportista_razon_social', '')), ''),
    nullif(btrim(coalesce(g->>'vehiculo_placa', '')), ''), nullif(btrim(coalesce(g->>'conductor_nombre', '')), ''),
    nullif(btrim(coalesce(g->>'conductor_dni', '')), ''), nullif(btrim(coalesce(g->>'conductor_brevete', '')), ''),
    'emitida', auth.uid(), now(), now());
  insert into public.guias_remision_lineas (id, empresa_id, guia_id, descripcion, codigo, unidad, cantidad, serie, orden)
  select 'grl_' || replace(gen_random_uuid()::text, '-', ''), v.empresa_id, v_guia,
         coalesce(nullif(v.descripcion, ''), 'Componente fabricado') || ' · unidad ' || x.unidad, v.numero, 'NIU', 1, x.serie, x.unidad
    from public.of_unidades x where (v.reclamo_id is null and x.of_id = v.id) or (v.reclamo_id is not null and x.id = v_ru.id);

  -- Acta de entrega
  v_num := 'AEF-' || to_char(v_ini, 'YY') || '-' || lpad(public.of_siguiente_numero(v.empresa_id, 'AEF-' || to_char(v_ini, 'YY') || '-')::text, 4, '0');
  insert into public.of_entregas (empresa_id, sociedad_id, of_id, numero, fecha, conformidad, observaciones, recibe_nombre, recibe_dni,
    firma_responsable_path, firma_cliente_path, fotos, guia_id)
  values (v.empresa_id, v.sociedad_id, v.id, v_num, v_ini, v_conf, nullif(btrim(coalesce(p_datos->>'observaciones', '')), ''), v_rec, v_dni,
    v_fr, v_fc, v_fotos, v_guia)
  returning id into v_ent;

  -- Garantía por unidad
  if v_meses > 0 and v.reclamo_id is null then
    -- Una a una: cada número se calcula con las garantías ya insertadas.
    for v_uid in select x.id from public.of_unidades x where x.of_id = v.id order by x.unidad loop
      insert into public.of_garantias (empresa_id, sociedad_id, of_id, unidad_id, numero, fecha_inicio, fecha_fin)
      values (v.empresa_id, v.sociedad_id, v.id, v_uid,
              'GAR-' || to_char(v_ini, 'YY') || '-' || lpad(public.of_siguiente_numero(v.empresa_id, 'GAR-' || to_char(v_ini, 'YY') || '-')::text, 4, '0'),
              v_ini, (v_ini + make_interval(months => v_meses))::date);
      v_ngar := v_ngar + 1;
    end loop;
  end if;

  update public.ordenes_fabricacion
     set estado = 'entregada', entregada_en = now(), garantia_meses = v_meses
   where id = v.id;

  return jsonb_build_object('entrega_id', v_ent, 'numero', v_num, 'guia_id', v_guia, 'guia_numero', v_gnum->>'numero_completo',
                            'garantias', v_ngar, 'estado', 'entregada');
end;
$$;

create or replace function public.of_entrega(p_of_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare v public.ordenes_fabricacion%rowtype; v_alc uuid[];
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id;
  if not found then raise exception 'La OF no existe.'; end if;
  if not public.usuario_tiene_empresa(v.empresa_id) or not public.usuario_puede(v.empresa_id, 'of', 'ver') then
    raise exception 'No tienes permiso para ver esta OF.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(v.empresa_id);
  if v_alc is not null and v.sociedad_id is not null and not (v.sociedad_id = any (v_alc)) then
    raise exception 'La sociedad de la OF está fuera de tu alcance.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'entrega', (select to_jsonb(e) - 'creado_por' || jsonb_build_object('guia_numero', gr.numero_completo, 'llegada', gr.llegada_direccion)
                  from public.of_entregas e left join public.guias_remision gr on gr.id = e.guia_id where e.of_id = v.id),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'unidad', x.unidad, 'serie', x.serie,
                   'garantia', (select jsonb_build_object('numero', gg.numero, 'fecha_inicio', gg.fecha_inicio, 'fecha_fin', gg.fecha_fin, 'estado', gg.estado)
                                  from public.of_garantias gg where gg.unidad_id = x.id)) order by x.unidad)
                   from public.of_unidades x where x.of_id = v.id
                     or x.id = (select rr.unidad_id from public.of_reclamos rr where rr.id = v.reclamo_id)), '[]'::jsonb),
    'es_garantia', v.reclamo_id is not null);
end;
$$;

revoke all on function public.of_crear_of_garantia(uuid) from public, anon;
revoke all on function public.of_registrar_reclamo(uuid, jsonb) from public, anon;
revoke all on function public.of_evaluar_reclamo(uuid, text, text) from public, anon;
revoke all on function public.of_garantias_listado(text) from public, anon;
revoke all on function public.of_pasaporte(uuid) from public, anon;
revoke all on function public.of_pasaporte_buscar(text, text) from public, anon;
revoke all on function public.trg_of_reclamo_estado() from public, anon, authenticated;
grant execute on function public.of_crear_of_garantia(uuid), public.of_registrar_reclamo(uuid, jsonb),
  public.of_evaluar_reclamo(uuid, text, text), public.of_garantias_listado(text), public.of_pasaporte(uuid),
  public.of_pasaporte_buscar(text, text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_class where relname = 'of_reclamos' and relnamespace = 'public'::regnamespace) then
    raise exception 'F5b: falta of_reclamos';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ordenes_fabricacion' and column_name = 'facturable') then
    raise exception 'F5b: falta facturable';
  end if;
  if position('reclamo_id' in pg_get_functiondef('public.of_entregar(uuid,jsonb)'::regprocedure)) = 0
     or position('es_garantia' in pg_get_functiondef('public.of_entrega_datos(uuid)'::regprocedure)) = 0 then
    raise exception 'F5b: entrega sin soporte de OF de garantía';
  end if;
end;
$$;
