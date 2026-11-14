-- F5a · Ajustes de la segunda revisión:
-- 1) of_unidades con sociedad y RLS por alcance de sociedad (tablas sin datos aún).
-- 2) Storage of-entregas: la ruta {empresa}/{of}/... se valida contra la OF (empresa, sociedad y permiso).
-- 3) Números AEF/GAR únicos por empresa (antes el correlativo era por sociedad y podía chocar con el único por empresa).
-- 4) of_entregar exige que fotos y firmas existan en Storage y que se entreguen todas las unidades (1..n),
--    y usa la fecha de Lima para acta, guía y garantía.
-- 5) of_registrar_pdf_entrega exige que el PDF exista en Storage.

alter table public.of_unidades add column if not exists sociedad_id uuid;
update public.of_unidades u set sociedad_id = o.sociedad_id
  from public.ordenes_fabricacion o where o.id = u.of_id and u.sociedad_id is distinct from o.sociedad_id;

drop policy if exists of_unidades_select on public.of_unidades;
create policy of_unidades_select on public.of_unidades for select to authenticated
  using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'of', 'ver')
         and (public.usuario_alcance_sociedades(empresa_id) is null or sociedad_id = any (public.usuario_alcance_sociedades(empresa_id))));

-- Ruta de Storage permitida: {empresa}/{of_id}/archivo, OF de esa empresa, sociedad en alcance y permiso.
create or replace function public.of_entregas_ruta_permitida(p_name text, p_accion text)
returns boolean
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_emp text := split_part(p_name, '/', 1);
  v_of text := split_part(p_name, '/', 2);
  v_soc uuid;
  v_alc uuid[];
begin
  if v_of !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or split_part(p_name, '/', 3) = '' then return false; end if;
  select o.sociedad_id into v_soc from public.ordenes_fabricacion o where o.id = v_of::uuid and o.empresa_id = v_emp;
  if not found then return false; end if;
  if not public.usuario_tiene_empresa(v_emp) or not public.usuario_puede(v_emp, 'of', p_accion) then return false; end if;
  v_alc := public.usuario_alcance_sociedades(v_emp);
  return v_alc is null or v_soc is null or v_soc = any (v_alc);
end;
$$;
revoke all on function public.of_entregas_ruta_permitida(text, text) from public, anon;
grant execute on function public.of_entregas_ruta_permitida(text, text) to authenticated;

drop policy if exists storage_of_entregas_select on storage.objects;
drop policy if exists storage_of_entregas_insert on storage.objects;
create policy storage_of_entregas_select on storage.objects for select to authenticated
  using (bucket_id = 'of-entregas' and public.of_entregas_ruta_permitida(name, 'ver'));
create policy storage_of_entregas_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'of-entregas' and public.of_entregas_ruta_permitida(name, 'editar'));

-- Siguiente número por empresa y prefijo (AEF-AA- o GAR-AA-), bajo bloqueo.
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
  else
    raise exception 'Prefijo de numeración no válido.';
  end if;
  return v_n;
end;
$$;
revoke all on function public.of_siguiente_numero(text, text) from public, anon, authenticated;

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
  select coalesce(max(pieza_cantidad), 1) into v_esperadas from public.of_calidad_caracteristicas where of_id = v.id;
  if jsonb_array_length(v_unis) <> v_esperadas
     or (select count(distinct (x->>'unidad')) from jsonb_array_elements(v_unis) x
          where (x->>'unidad') ~ '^[0-9]+$' and (x->>'unidad')::integer between 1 and v_esperadas) <> v_esperadas then
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

  -- Unidades
  for u in select * from jsonb_array_elements(v_unis) loop
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
    from public.of_unidades x where x.of_id = v.id;

  -- Acta de entrega
  v_num := 'AEF-' || to_char(v_ini, 'YY') || '-' || lpad(public.of_siguiente_numero(v.empresa_id, 'AEF-' || to_char(v_ini, 'YY') || '-')::text, 4, '0');
  insert into public.of_entregas (empresa_id, sociedad_id, of_id, numero, fecha, conformidad, observaciones, recibe_nombre, recibe_dni,
    firma_responsable_path, firma_cliente_path, fotos, guia_id)
  values (v.empresa_id, v.sociedad_id, v.id, v_num, v_ini, v_conf, nullif(btrim(coalesce(p_datos->>'observaciones', '')), ''), v_rec, v_dni,
    v_fr, v_fc, v_fotos, v_guia)
  returning id into v_ent;

  -- Garantía por unidad
  if v_meses > 0 then
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
  if not exists (select 1 from storage.objects o where o.bucket_id = 'of-entregas' and o.name = p_path) then
    raise exception 'El PDF no se subió completo. Vuelve a intentarlo.';
  end if;
  update public.of_entregas set pdf_path = p_path, pdf_sha256 = p_sha256 where id = e.id;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'of_unidades_select' and pg_get_expr(polqual, polrelid) like '%usuario_alcance_sociedades%') then
    raise exception 'F5a ajustes: falta el alcance de sociedad en of_unidades';
  end if;
  if (select count(*) from pg_policy where polname in ('storage_of_entregas_select', 'storage_of_entregas_insert')
        and coalesce(pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)) like '%of_entregas_ruta_permitida%') <> 2 then
    raise exception 'F5a ajustes: políticas de Storage sin validar la OF';
  end if;
  if position('of_siguiente_numero' in pg_get_functiondef('public.of_entregar(uuid,jsonb)'::regprocedure)) = 0
     or position('storage.objects' in pg_get_functiondef('public.of_registrar_pdf_entrega(uuid,text,text)'::regprocedure)) = 0 then
    raise exception 'F5a ajustes: funciones sin actualizar';
  end if;
end;
$$;
