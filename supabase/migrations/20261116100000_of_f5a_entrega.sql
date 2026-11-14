-- F5a · Entrega de la OF al cliente: unidades con serie, acta de entrega con fotos y firmas,
-- guía de remisión (despacho_servicio) y garantía por unidad. La OF pasa de Lista para entrega a Entregada.
-- Archivos (fotos, firmas, PDF) en el bucket privado of-entregas, ruta {empresa}/{of}/...

alter table public.ordenes_fabricacion
  add column if not exists garantia_meses integer not null default 12,
  add column if not exists entregada_en timestamptz;
alter table public.ordenes_fabricacion add constraint ordenes_fabricacion_garantia_meses_chk check (garantia_meses between 0 and 120);
alter table public.guias_remision add column if not exists of_id uuid references public.ordenes_fabricacion(id);

create table public.of_unidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  of_id uuid not null references public.ordenes_fabricacion(id) on delete cascade,
  unidad integer not null check (unidad > 0),
  serie text not null check (length(btrim(serie)) between 1 and 60),
  estado text not null default 'entregada' check (estado in ('entregada')),
  created_at timestamptz not null default now(),
  unique (of_id, unidad),
  unique (empresa_id, serie)
);

create table public.of_entregas (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  sociedad_id uuid,
  of_id uuid not null unique references public.ordenes_fabricacion(id) on delete cascade,
  numero text not null,
  fecha date not null default current_date,
  conformidad text not null check (conformidad in ('conforme', 'con_observaciones')),
  observaciones text,
  recibe_nombre text not null,
  recibe_dni text not null,
  firma_responsable_path text not null,
  firma_cliente_path text not null,
  fotos jsonb not null default '[]'::jsonb,
  guia_id text references public.guias_remision(id),
  pdf_path text,
  pdf_sha256 text,
  creado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (empresa_id, numero)
);

create table public.of_garantias (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  sociedad_id uuid,
  of_id uuid not null references public.ordenes_fabricacion(id) on delete cascade,
  unidad_id uuid not null unique references public.of_unidades(id) on delete cascade,
  numero text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  estado text not null default 'vigente' check (estado in ('vigente', 'anulada')),
  created_at timestamptz not null default now(),
  unique (empresa_id, numero)
);

create index of_unidades_of_idx on public.of_unidades (of_id);
create index of_garantias_of_idx on public.of_garantias (of_id);
create index of_garantias_empresa_fin_idx on public.of_garantias (empresa_id, fecha_fin);

alter table public.of_unidades enable row level security;
alter table public.of_entregas enable row level security;
alter table public.of_garantias enable row level security;

create policy of_unidades_select on public.of_unidades for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'of', 'ver'));
create policy of_entregas_select on public.of_entregas for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'of', 'ver')
         and (public.usuario_alcance_sociedades(empresa_id) is null or sociedad_id = any (public.usuario_alcance_sociedades(empresa_id))));
create policy of_garantias_select on public.of_garantias for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'of', 'ver')
         and (public.usuario_alcance_sociedades(empresa_id) is null or sociedad_id = any (public.usuario_alcance_sociedades(empresa_id))));
grant select on public.of_unidades, public.of_entregas, public.of_garantias to authenticated;

-- Bucket privado para fotos, firmas y PDF de la entrega.
insert into storage.buckets (id, name, public) values ('of-entregas', 'of-entregas', false) on conflict (id) do nothing;
create policy storage_of_entregas_select on storage.objects for select to authenticated
  using (bucket_id = 'of-entregas' and public.usuario_tiene_empresa(split_part(name, '/', 1))
         and public.usuario_puede(split_part(name, '/', 1), 'of', 'ver'));
create policy storage_of_entregas_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'of-entregas' and public.usuario_tiene_empresa(split_part(name, '/', 1))
              and public.usuario_puede(split_part(name, '/', 1), 'of', 'editar'));

-- Datos para preparar la entrega: unidades propuestas, garantía, cliente y partida.
create or replace function public.of_entrega_datos(p_of_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_alc uuid[];
  v_n integer;
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
  return jsonb_build_object(
    'puede_entregar', v.estado = 'lista_entrega' and public.usuario_puede(v.empresa_id, 'of', 'editar'),
    'garantia_meses', v.garantia_meses,
    'unidades', (select jsonb_agg(jsonb_build_object('unidad', n, 'serie', v.numero || '-' || lpad(n::text, 2, '0')) order by n)
                   from generate_series(1, v_n) n),
    'cliente', (select jsonb_build_object('razon_social', coalesce(c.razon_social, c.nombre_comercial), 'ruc', c.ruc, 'direccion', c.direccion)
                  from public.cuentas c where c.id = v.cuenta_id),
    'partida', (select s.direccion_fiscal from public.sociedades s where s.id = v.sociedad_id));
end;
$$;

-- Entrega: valida, crea unidades, guía, acta y garantías, y pasa la OF a Entregada.
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
  v_ini date := current_date;
  v_ngar integer := 0;
begin
  v := public.of_exigir_edicion(p_of_id, array['lista_entrega'], 'editar');
  v_pref := v.empresa_id || '/' || v.id::text || '/';
  select * into c from public.cuentas where id = v.cuenta_id;
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
  end loop;
  if jsonb_typeof(v_unis) <> 'array' or jsonb_array_length(v_unis) < 1 then raise exception 'Indica las unidades que se entregan.'; end if;
  if (select count(distinct lower(btrim(x->>'serie'))) from jsonb_array_elements(v_unis) x where nullif(btrim(x->>'serie'), '') is not null)
     <> jsonb_array_length(v_unis) then
    raise exception 'Cada unidad necesita una serie distinta.';
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

  -- Unidades
  for u in select * from jsonb_array_elements(v_unis) loop
    if exists (select 1 from public.of_unidades x where x.empresa_id = v.empresa_id and lower(x.serie) = lower(btrim(u->>'serie')) and x.of_id <> v.id) then
      raise exception 'La serie % ya existe en otra OF.', btrim(u->>'serie');
    end if;
    insert into public.of_unidades (empresa_id, of_id, unidad, serie)
    values (v.empresa_id, v.id, (u->>'unidad')::integer, btrim(u->>'serie'))
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
    current_date, v_traslado, 'despacho_servicio', '01', v_mod, v.id, v.sociedad_id, btrim(g->>'partida_direccion'), btrim(g->>'llegada_direccion'),
    coalesce(c.ruc, ''), coalesce(c.razon_social, c.nombre_comercial, ''), v_peso, 'KGM',
    nullif(btrim(coalesce(g->>'transportista_ruc', '')), ''), nullif(btrim(coalesce(g->>'transportista_razon_social', '')), ''),
    nullif(btrim(coalesce(g->>'vehiculo_placa', '')), ''), nullif(btrim(coalesce(g->>'conductor_nombre', '')), ''),
    nullif(btrim(coalesce(g->>'conductor_dni', '')), ''), nullif(btrim(coalesce(g->>'conductor_brevete', '')), ''),
    'emitida', auth.uid(), now(), now());
  insert into public.guias_remision_lineas (id, empresa_id, guia_id, descripcion, codigo, unidad, cantidad, serie, orden)
  select 'grl_' || replace(gen_random_uuid()::text, '-', ''), v.empresa_id, v_guia,
         coalesce(nullif(v.descripcion, ''), 'Componente fabricado') || ' · unidad ' || x.unidad, v.numero, 'NIU', 1, x.serie, x.unidad
    from public.of_unidades x where x.of_id = v.id;

  -- Acta de entrega
  v_num := 'AEF-' || to_char(current_date, 'YY') || '-' || lpad(public.wms_siguiente_numero(v.empresa_id, 'of_entrega', 'AEF', v.sociedad_id)::text, 4, '0');
  insert into public.of_entregas (empresa_id, sociedad_id, of_id, numero, conformidad, observaciones, recibe_nombre, recibe_dni,
    firma_responsable_path, firma_cliente_path, fotos, guia_id)
  values (v.empresa_id, v.sociedad_id, v.id, v_num, v_conf, nullif(btrim(coalesce(p_datos->>'observaciones', '')), ''), v_rec, v_dni,
    v_fr, v_fc, v_fotos, v_guia)
  returning id into v_ent;

  -- Garantía por unidad
  if v_meses > 0 then
    insert into public.of_garantias (empresa_id, sociedad_id, of_id, unidad_id, numero, fecha_inicio, fecha_fin)
    select v.empresa_id, v.sociedad_id, v.id, x.id,
           'GAR-' || to_char(current_date, 'YY') || '-' || lpad(public.wms_siguiente_numero(v.empresa_id, 'of_garantia', 'GAR', v.sociedad_id)::text, 4, '0'),
           v_ini, (v_ini + make_interval(months => v_meses))::date
      from public.of_unidades x where x.of_id = v.id order by x.unidad;
    get diagnostics v_ngar = row_count;
  end if;

  update public.ordenes_fabricacion
     set estado = 'entregada', entregada_en = now(), garantia_meses = v_meses
   where id = v.id;

  return jsonb_build_object('entrega_id', v_ent, 'numero', v_num, 'guia_id', v_guia, 'guia_numero', v_gnum->>'numero_completo',
                            'garantias', v_ngar, 'estado', 'entregada');
end;
$$;

-- Registra el PDF del acta una sola vez.
create or replace function public.of_registrar_pdf_entrega(p_entrega_id uuid, p_path text, p_sha256 text)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare e public.of_entregas%rowtype;
begin
  select * into e from public.of_entregas where id = p_entrega_id for update;
  if not found then raise exception 'La entrega no existe.'; end if;
  perform public.of_exigir_edicion(e.of_id, null, 'editar');
  if e.pdf_path is not null then raise exception 'El acta ya tiene su PDF.'; end if;
  if left(coalesce(p_path, ''), length(e.empresa_id || '/' || e.of_id::text || '/')) <> e.empresa_id || '/' || e.of_id::text || '/' then
    raise exception 'Ruta de PDF no válida.';
  end if;
  update public.of_entregas set pdf_path = p_path, pdf_sha256 = p_sha256 where id = e.id;
end;
$$;

-- Lectura de la entrega para la ficha.
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
                   from public.of_unidades x where x.of_id = v.id), '[]'::jsonb));
end;
$$;

revoke all on function public.of_entrega_datos(uuid) from public, anon;
revoke all on function public.of_entregar(uuid, jsonb) from public, anon;
revoke all on function public.of_registrar_pdf_entrega(uuid, text, text) from public, anon;
revoke all on function public.of_entrega(uuid) from public, anon;
grant execute on function public.of_entrega_datos(uuid), public.of_entregar(uuid, jsonb),
  public.of_registrar_pdf_entrega(uuid, text, text), public.of_entrega(uuid) to authenticated;

do $$
begin
  if (select count(*) from pg_class where relname in ('of_unidades', 'of_entregas', 'of_garantias') and relnamespace = 'public'::regnamespace) <> 3 then
    raise exception 'F5a: faltan tablas';
  end if;
  if not exists (select 1 from storage.buckets where id = 'of-entregas' and not public) then
    raise exception 'F5a: falta el bucket privado';
  end if;
end $$;
