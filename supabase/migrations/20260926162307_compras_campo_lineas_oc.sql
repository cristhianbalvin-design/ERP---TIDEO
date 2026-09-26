-- Fase 1b-1: lineas de SOLPE y OC de regularizacion para compras de campo.
-- Construida sobre las definiciones remotas verificadas el 2026-09-26.

alter table public.compras_gastos
  add column if not exists orden_compra_id text,
  add column if not exists excluir_de_er boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'compras_gastos_orden_compra_id_fkey'
      and conrelid = 'public.compras_gastos'::regclass
  ) then
    alter table public.compras_gastos
      add constraint compras_gastos_orden_compra_id_fkey
      foreign key (orden_compra_id) references public.ordenes_compra(id)
      on delete set null;
  end if;
end;
$$;

create index if not exists idx_compras_gastos_orden_compra
  on public.compras_gastos (empresa_id, orden_compra_id)
  where orden_compra_id is not null;

create unique index if not exists uq_proveedores_empresa_ruc_normalizado
  on public.proveedores (
    empresa_id,
    regexp_replace(coalesce(ruc, ''), '\D', '', 'g')
  )
  where nullif(regexp_replace(coalesce(ruc, ''), '\D', '', 'g'), '') is not null;

create or replace function public.siguiente_codigo_oc_campo(p_empresa_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_next integer;
  v_code text;
begin
  if nullif(btrim(coalesce(p_empresa_id, '')), '') is null then
    raise exception 'La empresa es obligatoria';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('OCC|' || p_empresa_id || '|' || v_year, 0));

  select coalesce(max((substring(codigo from '^OCC-' || v_year || '-([0-9]+)$'))::integer), 0) + 1
    into v_next
  from public.ordenes_compra
  where empresa_id = p_empresa_id
    and codigo like 'OCC-' || v_year || '-%';

  v_code := 'OCC-' || v_year || '-' || lpad(v_next::text, 6, '0');
  while exists (select 1 from public.ordenes_compra where empresa_id = p_empresa_id and codigo = v_code) loop
    v_next := v_next + 1;
    v_code := 'OCC-' || v_year || '-' || lpad(v_next::text, 6, '0');
  end loop;
  return v_code;
end;
$$;

revoke all on function public.siguiente_codigo_oc_campo(text) from public, anon;
grant execute on function public.siguiente_codigo_oc_campo(text) to authenticated, service_role;

create or replace function public.resolver_proveedor_por_ruc(
  p_empresa_id text,
  p_ruc text,
  p_nombre text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ruc text := regexp_replace(coalesce(p_ruc, ''), '\D', '', 'g');
  v_id text;
  v_nombre text := coalesce(nullif(btrim(p_nombre), ''), 'Proveedor ' || v_ruc);
  v_codigo text;
begin
  if nullif(btrim(coalesce(p_empresa_id, '')), '') is null or v_ruc = '' then
    raise exception 'Empresa y RUC son obligatorios para resolver el proveedor';
  end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No autorizado para resolver el proveedor en el tenant';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('PROVEEDOR_RUC|' || p_empresa_id || '|' || v_ruc, 0));

  select p.id into v_id
  from public.proveedores p
  where p.empresa_id = p_empresa_id
    and regexp_replace(coalesce(p.ruc, ''), '\D', '', 'g') = v_ruc
  order by p.created_at nulls first, p.id
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  v_id := 'prv_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_codigo := 'POT-' || substr(v_ruc, greatest(length(v_ruc) - 5, 1));
  insert into public.proveedores (
    id, empresa_id, razon_social, nombre_comercial, ruc, codigo, tipo, estado, created_at, updated_at
  ) values (
    v_id, p_empresa_id, v_nombre, v_nombre, v_ruc, v_codigo, 'empresa', 'potencial', now(), now()
  );
  return v_id;
end;
$$;

revoke all on function public.resolver_proveedor_por_ruc(text, text, text) from public, anon;
grant execute on function public.resolver_proveedor_por_ruc(text, text, text) to authenticated, service_role;

create or replace function public.bloquear_cxp_recepcion_compra_campo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.recepcion_id is not null and new.orden_compra_id is not null
     and exists (
       select 1 from public.ordenes_compra oc
       where oc.id = new.orden_compra_id
         and oc.empresa_id = new.empresa_id
         and oc.origen_tipo = 'compra_campo'
     ) then
    raise exception 'La OC de compra en campo ya está facturada; la recepción no genera CxP';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_cxp_recepcion_compra_campo on public.cxp;
create trigger trg_bloquear_cxp_recepcion_compra_campo
before insert on public.cxp
for each row execute function public.bloquear_cxp_recepcion_compra_campo();

revoke all on function public.bloquear_cxp_recepcion_compra_campo() from public, anon;
grant execute on function public.bloquear_cxp_recepcion_compra_campo() to authenticated, service_role;

create or replace function public.obtener_lineas_campo(p_empresa_id text)
returns table (
  solpe_id text,
  solpe_codigo text,
  solpe_item_id text,
  material_id text,
  material_codigo text,
  descripcion text,
  cantidad numeric,
  unidad text,
  ot_id text,
  centro_costo_id text,
  comprador_campo_id text,
  comprador_nombre text,
  tomada_en timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(p_empresa_id, '')), '') is null then
    raise exception 'La empresa es obligatoria';
  end if;
  if not exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = p_empresa_id
      and ue.estado = 'activo'
      and ue.acceso_campo = true
      and 'compras' = any(coalesce(ue.campo_modulos, array[]::text[]))
  ) and not public.usuario_es_superadmin_plataforma() then
    raise exception 'No tienes acceso de campo al módulo Compras' using errcode = '42501';
  end if;

  return query
  select s.id,
         s.codigo,
         item.item ->> 'id',
         nullif(btrim(item.item ->> 'material_id'), ''),
         coalesce(m.codigo, item.item ->> 'material_codigo'),
         coalesce(nullif(btrim(item.item ->> 'descripcion'), ''), m.descripcion, 'Item de compra'),
         nullif(item.item ->> 'cantidad', '')::numeric,
         coalesce(nullif(btrim(item.item ->> 'unidad'), ''), m.unidad, 'UND'),
         s.ot_id,
         s.centro_costo_id,
         nullif(btrim(item.item ->> 'comprador_campo_id'), ''),
         coalesce(u.nombre, u.email, item.item ->> 'comprador_campo_id'),
         nullif(item.item ->> 'tomada_en', '')::timestamptz
  from public.solpe_interna s
  cross join lateral jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) with ordinality as item(item, ordinality)
  left join public.materiales m on m.id = nullif(btrim(item.item ->> 'material_id'), '') and m.empresa_id = p_empresa_id
  left join public.usuarios u on u.id = nullif(btrim(item.item ->> 'comprador_campo_id'), '')
  where s.empresa_id = p_empresa_id
    and lower(trim(coalesce(s.estado, ''))) in ('aprobada', 'oc_parcial')
    and nullif(btrim(item.item ->> 'oc_id'), '') is null
    and nullif(btrim(item.item ->> 'proveedor_asignado_id'), '') is null
  order by s.codigo, item.ordinality;
end;
$$;

revoke all on function public.obtener_lineas_campo(text) from public, anon;
grant execute on function public.obtener_lineas_campo(text) to authenticated;

create or replace function public.tomar_linea_sourcing(p_solpe_id text, p_solpe_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_solpe public.solpe_interna%rowtype;
  v_items jsonb;
  v_item jsonb;
  v_new_item jsonb;
  v_matches integer;
begin
  select * into v_solpe from public.solpe_interna where id = p_solpe_id for update;
  if not found then raise exception 'La SOLPE % no existe', p_solpe_id; end if;
  if not exists (
    select 1 from public.usuarios_empresas ue
    where ue.user_id = auth.uid() and ue.empresa_id = v_solpe.empresa_id
      and ue.estado = 'activo' and ue.acceso_campo = true
      and 'compras' = any(coalesce(ue.campo_modulos, array[]::text[]))
  ) then
    raise exception 'No tienes acceso de campo al módulo Compras' using errcode = '42501';
  end if;

  if lower(trim(coalesce(v_solpe.estado, ''))) not in ('aprobada', 'oc_parcial') then
    raise exception 'La SOLPE no está disponible para compras de campo';
  end if;

  v_items := coalesce(v_solpe.items, '[]'::jsonb);
  select count(*) into v_matches from jsonb_array_elements(v_items) x(item)
  where x.item ->> 'id' = p_solpe_item_id;
  if v_matches = 0 then raise exception 'La línea % no existe en la SOLPE %', p_solpe_item_id, p_solpe_id; end if;
  if v_matches > 1 then raise exception 'La línea % está duplicada en la SOLPE %', p_solpe_item_id, p_solpe_id; end if;
  select x.item into v_item from jsonb_array_elements(v_items) x(item) where x.item ->> 'id' = p_solpe_item_id;
  if nullif(btrim(v_item ->> 'oc_id'), '') is not null then raise exception 'La línea ya está cubierta por una OC'; end if;
  if nullif(btrim(v_item ->> 'proveedor_asignado_id'), '') is not null then raise exception 'La línea ya tiene proveedor asignado'; end if;
  if nullif(btrim(v_item ->> 'comprador_campo_id'), '') is not null then raise exception 'Esta línea ya fue tomada por otro comprador'; end if;

  v_new_item := jsonb_set(jsonb_set(v_item, '{comprador_campo_id}', to_jsonb(auth.uid()::text), true), '{tomada_en}', to_jsonb(now()), true);
  select coalesce(jsonb_agg(case when x.item ->> 'id' = p_solpe_item_id then v_new_item else x.item end order by x.ordinality), '[]'::jsonb)
    into v_items from jsonb_array_elements(v_items) with ordinality x(item, ordinality);
  update public.solpe_interna set items = v_items, updated_at = now() where id = p_solpe_id;
  return jsonb_build_object('solpe_id', p_solpe_id, 'solpe_item_id', p_solpe_item_id, 'comprador_campo_id', auth.uid(), 'tomada_en', now(), 'items', v_items);
end;
$$;

revoke all on function public.tomar_linea_sourcing(text, text) from public, anon;
grant execute on function public.tomar_linea_sourcing(text, text) to authenticated;

create or replace function public.liberar_linea_sourcing(p_solpe_id text, p_solpe_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_solpe public.solpe_interna%rowtype;
  v_items jsonb;
  v_item jsonb;
begin
  select * into v_solpe from public.solpe_interna where id = p_solpe_id for update;
  if not found then raise exception 'La SOLPE % no existe', p_solpe_id; end if;
  v_items := coalesce(v_solpe.items, '[]'::jsonb);
  select x.item into v_item from jsonb_array_elements(v_items) x(item) where x.item ->> 'id' = p_solpe_item_id;
  if v_item is null then raise exception 'La línea no existe'; end if;
  if nullif(btrim(v_item ->> 'comprador_campo_id'), '') <> auth.uid()::text then
    raise exception 'Solo el comprador que tomó la línea puede liberarla' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(case when x.item ->> 'id' = p_solpe_item_id then x.item - 'comprador_campo_id' - 'tomada_en' else x.item end order by x.ordinality), '[]'::jsonb)
    into v_items from jsonb_array_elements(v_items) with ordinality x(item, ordinality);
  update public.solpe_interna set items = v_items, updated_at = now() where id = p_solpe_id;
  return jsonb_build_object('solpe_id', p_solpe_id, 'solpe_item_id', p_solpe_item_id, 'liberada', true, 'items', v_items);
end;
$$;

revoke all on function public.liberar_linea_sourcing(text, text) from public, anon;
grant execute on function public.liberar_linea_sourcing(text, text) to authenticated;

create or replace function public.quitar_comprador_linea_sourcing(p_solpe_id text, p_solpe_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_solpe public.solpe_interna%rowtype;
  v_items jsonb;
begin
  select * into v_solpe from public.solpe_interna where id = p_solpe_id for update;
  if not found then raise exception 'La SOLPE % no existe', p_solpe_id; end if;
  if not public.usuario_puede(v_solpe.empresa_id, 'ordenes_compra', 'editar') then
    raise exception 'No tienes permiso para quitar al comprador' using errcode = '42501';
  end if;
  v_items := coalesce(v_solpe.items, '[]'::jsonb);
  if not exists (select 1 from jsonb_array_elements(v_items) x(item) where x.item ->> 'id' = p_solpe_item_id) then
    raise exception 'La línea no existe';
  end if;
  select coalesce(jsonb_agg(case when x.item ->> 'id' = p_solpe_item_id then x.item - 'comprador_campo_id' - 'tomada_en' else x.item end order by x.ordinality), '[]'::jsonb)
    into v_items from jsonb_array_elements(v_items) with ordinality x(item, ordinality);
  update public.solpe_interna set items = v_items, updated_at = now() where id = p_solpe_id;
  return jsonb_build_object('solpe_id', p_solpe_id, 'solpe_item_id', p_solpe_item_id, 'quitado', true, 'items', v_items);
end;
$$;

revoke all on function public.quitar_comprador_linea_sourcing(text, text) from public, anon;
grant execute on function public.quitar_comprador_linea_sourcing(text, text) to authenticated;

drop function if exists public.obtener_lineas_sourcing(text);
create function public.obtener_lineas_sourcing(p_empresa_id text)
returns table (
  solpe_id text, solpe_codigo text, solpe_estado text, solpe_descripcion text,
  solpe_item_id text, proveedor_asignado_id text, comprador_campo_id text,
  comprador_nombre text, tomada_en timestamptz, item_index bigint, material_id text,
  material_codigo text, material_descripcion text, familia_id text, familia_codigo text,
  familia_nombre text, cantidad numeric, unidad text, precio_unitario numeric,
  proveedores_candidatos jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(p_empresa_id, '')), '') is null then raise exception 'El empresa_id es obligatorio' using errcode = '22023'; end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then raise exception 'No autorizado para consultar el tenant %', p_empresa_id using errcode = '42501'; end if;
  if not public.usuario_puede(p_empresa_id, 'ordenes_compra', 'ver') then raise exception 'No tienes permiso para consultar candidatos de sourcing' using errcode = '42501'; end if;
  return query
  with lineas as (
    select s.id solpe_id,s.codigo solpe_codigo,s.estado solpe_estado,s.descripcion solpe_descripcion,
      item.item ->> 'id' solpe_item_id,
      nullif(btrim(item.item ->> 'proveedor_asignado_id'),'') proveedor_asignado_id,
      nullif(btrim(item.item ->> 'comprador_campo_id'),'') comprador_campo_id,
      coalesce(u.nombre,u.email,item.item ->> 'comprador_campo_id') comprador_nombre,
      nullif(item.item ->> 'tomada_en','')::timestamptz tomada_en,
      item.ordinality item_index,nullif(btrim(item.item ->> 'material_id'),'') material_id,
      nullif(btrim(item.item ->> 'cantidad'),'')::numeric cantidad,
      nullif(btrim(item.item ->> 'unidad'),'') unidad,
      nullif(btrim(item.item ->> 'precio_unitario'),'')::numeric precio_unitario,
      coalesce(nullif(btrim(item.item ->> 'descripcion'),''),'Item de compra') item_descripcion
    from public.solpe_interna s
    cross join lateral jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) with ordinality item(item,ordinality)
    left join public.usuarios u on u.id = nullif(btrim(item.item ->> 'comprador_campo_id'),'')
    where s.empresa_id=p_empresa_id and lower(trim(coalesce(s.estado,''))) in ('aprobada','oc_parcial')
      and nullif(btrim(item.item ->> 'oc_id'),'') is null
  ), candidatos as (
    select l.*,m.codigo material_codigo,coalesce(m.descripcion,l.item_descripcion) material_descripcion,
      m.familia_id,f.codigo familia_codigo,f.nombre familia_nombre,
      p.id proveedor_id,p.codigo proveedor_codigo,p.razon_social proveedor_razon_social,p.nombre_comercial proveedor_nombre_comercial,
      coalesce(p.total_ocs,0) total_ocs,p.fecha_ultima_oc,
      row_number() over(partition by l.solpe_id,l.item_index order by coalesce(p.total_ocs,0) desc,p.fecha_ultima_oc desc nulls last,p.codigo,p.id) ranking
    from lineas l
    left join public.materiales m on m.id=l.material_id and m.empresa_id=p_empresa_id
    left join public.material_familias f on f.id=m.familia_id and f.empresa_id=p_empresa_id
    left join public.proveedor_familia pf on pf.empresa_id=p_empresa_id and pf.familia_id=m.familia_id
    left join public.proveedores p on p.id=pf.proveedor_id and p.empresa_id=p_empresa_id and p.estado is distinct from 'bloqueado'
  )
  select c.solpe_id,c.solpe_codigo,c.solpe_estado,c.solpe_descripcion,c.solpe_item_id,c.proveedor_asignado_id,c.comprador_campo_id,c.comprador_nombre,c.tomada_en,c.item_index,c.material_id,c.material_codigo,c.material_descripcion,c.familia_id,c.familia_codigo,c.familia_nombre,c.cantidad,c.unidad,c.precio_unitario,
    coalesce(jsonb_agg(jsonb_build_object('proveedor_id',c.proveedor_id,'proveedor_codigo',c.proveedor_codigo,'razon_social',c.proveedor_razon_social,'nombre_comercial',c.proveedor_nombre_comercial,'familia_id',c.familia_id,'total_ocs',c.total_ocs,'fecha_ultima_oc',c.fecha_ultima_oc,'ranking',c.ranking) order by c.ranking) filter(where c.proveedor_id is not null),'[]'::jsonb)
  from candidatos c
  group by c.solpe_id,c.solpe_codigo,c.solpe_estado,c.solpe_descripcion,c.solpe_item_id,c.proveedor_asignado_id,c.comprador_campo_id,c.comprador_nombre,c.tomada_en,c.item_index,c.material_id,c.material_codigo,c.material_descripcion,c.familia_id,c.familia_codigo,c.familia_nombre,c.cantidad,c.unidad,c.precio_unitario
  order by c.solpe_codigo,c.item_index;
end;
$$;

revoke all on function public.obtener_lineas_sourcing(text) from public, anon;
grant execute on function public.obtener_lineas_sourcing(text) to authenticated;

create or replace function public.asignar_proveedor_linea_sourcing(p_solpe_id text, p_solpe_item_id text, p_proveedor_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_solpe public.solpe_interna%rowtype;
  v_item jsonb;
  v_new_item jsonb;
  v_items jsonb;
  v_matches integer;
begin
  if nullif(btrim(coalesce(p_solpe_id,'')),'') is null then raise exception 'El id de la SOLPE es obligatorio'; end if;
  if nullif(btrim(coalesce(p_solpe_item_id,'')),'') is null then raise exception 'El id de la línea de SOLPE es obligatorio'; end if;
  select * into v_solpe from public.solpe_interna where id=p_solpe_id for update;
  if not found then raise exception 'La SOLPE % no existe',p_solpe_id; end if;
  if not public.usuario_tiene_empresa(v_solpe.empresa_id) then raise exception 'No autorizado para actualizar la SOLPE %',p_solpe_id using errcode='42501'; end if;
  if not public.usuario_puede(v_solpe.empresa_id,'ordenes_compra','crear') then raise exception 'No tienes permiso para asignar proveedores en sourcing' using errcode='42501'; end if;
  v_items:=coalesce(v_solpe.items,'[]'::jsonb);
  select count(*) into v_matches from jsonb_array_elements(v_items) x(item) where x.item ->> 'id'=p_solpe_item_id;
  if v_matches=0 then raise exception 'La línea % no existe en la SOLPE %',p_solpe_item_id,p_solpe_id; end if;
  if v_matches>1 then raise exception 'La línea % está duplicada en la SOLPE %',p_solpe_item_id,p_solpe_id; end if;
  select x.item into v_item from jsonb_array_elements(v_items) x(item) where x.item ->> 'id'=p_solpe_item_id;
  if nullif(btrim(v_item ->> 'oc_id'),'') is not null then raise exception 'La línea % ya está cubierta por la OC %',p_solpe_item_id,v_item ->> 'oc_id'; end if;
  if nullif(btrim(v_item ->> 'comprador_campo_id'),'') is not null then raise exception 'Esta línea está en campo; quítala al comprador antes de asignar proveedor'; end if;
  if p_proveedor_id is not null and not exists(select 1 from public.proveedores p where p.id=p_proveedor_id and p.empresa_id=v_solpe.empresa_id and p.estado is distinct from 'bloqueado') then raise exception 'El proveedor % no existe o no está habilitado en el tenant',p_proveedor_id; end if;
  v_new_item:=jsonb_set(v_item,'{proveedor_asignado_id}',coalesce(to_jsonb(p_proveedor_id),'null'::jsonb),true);
  select coalesce(jsonb_agg(case when x.item ->> 'id'=p_solpe_item_id then v_new_item else x.item end order by x.ordinality),'[]'::jsonb) into v_items from jsonb_array_elements(v_items) with ordinality x(item,ordinality);
  update public.solpe_interna set items=v_items,updated_at=now() where id=p_solpe_id;
  return jsonb_build_object('solpe_id',p_solpe_id,'solpe_item_id',p_solpe_item_id,'proveedor_asignado_id',p_proveedor_id,'oc_id',v_item ->> 'oc_id','estado',v_solpe.estado,'items',v_items);
end;
$$;

revoke all on function public.asignar_proveedor_linea_sourcing(text, text, text) from public, anon;
grant execute on function public.asignar_proveedor_linea_sourcing(text, text, text) to authenticated, service_role;

create or replace function public.registrar_cobertura_solpe_oc(p_solpe_id text, p_oc_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor_solpe public.solpe_interna%rowtype;
  v_solpe public.solpe_interna%rowtype;
  v_oc public.ordenes_compra%rowtype;
  v_source_ids text[] := array[]::text[];
  v_source_id text;
  v_has_line_origins boolean := false;
  v_items jsonb;
  v_line record;
  v_match_ordinal bigint;
  v_used_oc_ordinals bigint[] := array[]::bigint[];
  v_total_oc_lines integer := 0;
  v_total_matched integer := 0;
  v_total_covered integer := 0;
  v_total_pending integer := 0;
  v_total integer := 0;
  v_covered integer := 0;
  v_matched integer := 0;
  v_pending integer := 0;
  v_next_state text;
  v_document_solpe_id text;
  v_source_results jsonb := '[]'::jsonb;
begin
  if nullif(btrim(coalesce(p_solpe_id,'')),'') is null then raise exception 'El id de la SOLPE es obligatorio'; end if;
  if nullif(btrim(coalesce(p_oc_id,'')),'') is null then raise exception 'El id de la OC es obligatorio'; end if;
  select * into v_anchor_solpe from public.solpe_interna where id=p_solpe_id for update;
  if not found then raise exception 'La SOLPE % no existe',p_solpe_id; end if;
  if not public.usuario_tiene_empresa(v_anchor_solpe.empresa_id) then raise exception 'No autorizado para actualizar la SOLPE %',p_solpe_id using errcode='42501'; end if;
  select * into v_oc from public.ordenes_compra where id=p_oc_id and empresa_id=v_anchor_solpe.empresa_id and (solpe_id=p_solpe_id or exists(select 1 from jsonb_array_elements(coalesce(items,'[]'::jsonb)) item where nullif(btrim(item ->> 'solpe_id'),'')=p_solpe_id)) for update;
  if not found then raise exception 'La OC % no pertenece a la SOLPE %',p_oc_id,p_solpe_id; end if;
  select coalesce(array_agg(source_id order by source_id),array[]::text[]),count(*)>0 into v_source_ids,v_has_line_origins from (select distinct nullif(btrim(item ->> 'solpe_id'),'') source_id from jsonb_array_elements(coalesce(v_oc.items,'[]'::jsonb)) item where nullif(btrim(item ->> 'solpe_id'),'') is not null) origins;
  if not v_has_line_origins and nullif(btrim(coalesce(v_oc.solpe_id,'')),'') is not null then v_source_ids:=array[v_oc.solpe_id]; end if;
  if cardinality(v_source_ids)=0 then raise exception 'La OC % no tiene SOLPE de origen en el documento ni en sus líneas',p_oc_id; end if;
  v_total_oc_lines:=jsonb_array_length(coalesce(v_oc.items,'[]'::jsonb));
  foreach v_source_id in array v_source_ids loop
    select * into v_solpe from public.solpe_interna where id=v_source_id and empresa_id=v_anchor_solpe.empresa_id for update;
    if not found then raise exception 'La SOLPE % no existe en el tenant de la OC %',v_source_id,p_oc_id; end if;
    v_items:=coalesce(v_solpe.items,'[]'::jsonb); v_total:=0;v_covered:=0;v_matched:=0;v_pending:=0;v_next_state:=v_solpe.estado;
    for v_line in select x.item,x.ordinality from jsonb_array_elements(v_items) with ordinality x(item,ordinality) where nullif(btrim(x.item ->> 'oc_id'),'') is null order by x.ordinality loop
      v_match_ordinal:=null;
      if nullif(btrim(v_line.item ->> 'id'),'') is not null then
        select x.ordinality into v_match_ordinal from jsonb_array_elements(coalesce(v_oc.items,'[]'::jsonb)) with ordinality x(item,ordinality) where nullif(btrim(x.item ->> 'solpe_item_id'),'')=nullif(btrim(v_line.item ->> 'id'),'') and nullif(btrim(x.item ->> 'material_id'),'')=nullif(btrim(v_line.item ->> 'material_id'),'') and (nullif(btrim(x.item ->> 'solpe_id'),'')=v_source_id or (nullif(btrim(x.item ->> 'solpe_id'),'') is null and v_oc.solpe_id=v_source_id)) and not(x.ordinality=any(v_used_oc_ordinals)) order by x.ordinality limit 1;
      end if;
      if v_match_ordinal is null and nullif(btrim(v_line.item ->> 'material_id'),'') is not null then
        select x.ordinality into v_match_ordinal from jsonb_array_elements(coalesce(v_oc.items,'[]'::jsonb)) with ordinality x(item,ordinality) where nullif(btrim(x.item ->> 'material_id'),'')=nullif(btrim(v_line.item ->> 'material_id'),'') and nullif(btrim(x.item ->> 'solpe_item_id'),'') is null and (nullif(btrim(x.item ->> 'solpe_id'),'')=v_source_id or (nullif(btrim(x.item ->> 'solpe_id'),'') is null and v_oc.solpe_id=v_source_id)) and not(x.ordinality=any(v_used_oc_ordinals)) order by x.ordinality limit 1;
      end if;
      if v_match_ordinal is not null then
        v_items:=jsonb_set(v_items,array[(v_line.ordinality-1)::text],jsonb_set(jsonb_set(jsonb_set(v_line.item,'{oc_id}',to_jsonb(p_oc_id),true),'{proveedor_asignado_id}','null'::jsonb,true),'{comprador_campo_id}','null'::jsonb,true),true);
        v_items:=jsonb_set(v_items,array[(v_line.ordinality-1)::text],jsonb_set(v_items -> (v_line.ordinality-1)::integer,'{tomada_en}','null'::jsonb,true),true);
        v_used_oc_ordinals:=array_append(v_used_oc_ordinals,v_match_ordinal);v_matched:=v_matched+1;
      end if;
    end loop;
    select count(*) into v_total from jsonb_array_elements(v_items) x(item);
    select count(*) into v_covered from jsonb_array_elements(v_items) x(item) where nullif(btrim(x.item ->> 'oc_id'),'') is not null;
    v_pending:=greatest(v_total-v_covered,0);v_next_state:=case when v_matched=0 then v_solpe.estado when v_pending=0 then 'oc_generada' else 'oc_parcial' end;
    if v_matched>0 then update public.solpe_interna set items=v_items,estado=v_next_state,updated_at=now() where id=v_source_id; end if;
    v_total_matched:=v_total_matched+v_matched;v_total_covered:=v_total_covered+v_covered;v_total_pending:=v_total_pending+v_pending;
    v_source_results:=v_source_results||jsonb_build_array(jsonb_build_object('solpe_id',v_source_id,'oc_id',p_oc_id,'lineas_oc',v_total_oc_lines,'lineas_cubiertas_en_oc',v_matched,'lineas_cubiertas_total',v_covered,'lineas_pendientes',v_pending,'estado_anterior',v_solpe.estado,'estado',v_next_state,'items',v_items));
  end loop;
  v_document_solpe_id:=case when cardinality(v_source_ids)=1 then v_source_ids[1] else null end;
  update public.ordenes_compra set solpe_id=v_document_solpe_id,updated_at=now() where id=p_oc_id and empresa_id=v_anchor_solpe.empresa_id;
  return jsonb_build_object('solpe_id',v_document_solpe_id,'oc_id',p_oc_id,'lineas_oc',v_total_oc_lines,'lineas_cubiertas_en_oc',v_total_matched,'lineas_cubiertas_total',v_total_covered,'lineas_pendientes',v_total_pending,'estado_anterior',case when cardinality(v_source_ids)=1 then v_source_results -> 0 ->> 'estado_anterior' else null end,'estado',case when cardinality(v_source_ids)=1 then v_source_results -> 0 ->> 'estado' else null end,'items',case when cardinality(v_source_ids)=1 then v_source_results -> 0 -> 'items' else null end,'solpes',v_source_results);
end;
$$;

revoke all on function public.registrar_cobertura_solpe_oc(text,text) from public, anon;
grant execute on function public.registrar_cobertura_solpe_oc(text,text) to authenticated, service_role;

create or replace function public.registrar_compra_campo(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_gasto jsonb := coalesce(v_payload -> 'gasto','{}'::jsonb);
  v_adjunto jsonb := coalesce(v_payload -> 'adjunto','{}'::jsonb);
  v_cxp_input jsonb := coalesce(v_payload -> 'cxp','{}'::jsonb);
  v_lineas jsonb := coalesce(v_payload -> 'lineas_solpe','[]'::jsonb);
  v_cxp_payload jsonb;
  v_user_id uuid := auth.uid();
  v_empresa_id text := nullif(btrim(coalesce(v_payload ->> 'empresa_id','')),'');
  v_gasto_id text := nullif(btrim(coalesce(v_gasto ->> 'id','')),'');
  v_centro_costo_id text := nullif(btrim(coalesce(v_gasto ->> 'centro_costo_id',v_payload ->> 'centro_costo_id','')),'');
  v_ot_id text := nullif(btrim(coalesce(v_gasto ->> 'ot_vinc_id',v_gasto ->> 'ot_id','')),'');
  v_sociedad_text text := nullif(btrim(coalesce(v_payload ->> 'sociedad_id',v_gasto ->> 'sociedad_id','')),'');
  v_sociedad_id uuid;
  v_alcance uuid[];
  v_monto numeric;
  v_monto_sin_igv numeric;
  v_lineas_total numeric := 0;
  v_fecha date;
  v_crear_cxp boolean := coalesce(nullif(v_payload ->> 'crear_cxp','')::boolean,false);
  v_ruc text;
  v_factura text;
  v_adjunto_id uuid;
  v_cxp jsonb;
  v_gasto_row jsonb;
  v_multisociedad boolean;
  v_adjunto_bucket text := nullif(btrim(coalesce(v_adjunto ->> 'bucket','')),'');
  v_storage_path text := nullif(btrim(coalesce(v_adjunto ->> 'storage_path','')),'');
  v_adjunto_url text := nullif(btrim(coalesce(v_adjunto ->> 'url','')),'');
  v_concepto text;
  v_fecha_vencimiento text;
  v_tiene_lineas boolean := jsonb_typeof(v_lineas) = 'array' and jsonb_array_length(v_lineas) > 0;
  v_solpe_ids text[] := array[]::text[];
  v_seen text[] := array[]::text[];
  v_solpe public.solpe_interna%rowtype;
  v_item jsonb;
  v_items jsonb;
  v_new_item jsonb;
  v_rest_item jsonb;
  v_item_id text;
  v_solpe_id text;
  v_qty numeric;
  v_price numeric;
  v_original_qty numeric;
  v_ordinal bigint;
  v_proveedor_id text;
  v_proveedor_nombre text;
  v_oc_id text;
  v_oc_codigo text;
  v_oc_items jsonb := '[]'::jsonb;
  v_oc_subtotal numeric := 0;
  v_oc_igv numeric := 0;
  v_first_solpe public.solpe_interna%rowtype;
  v_coverage jsonb;
  v_line jsonb;
begin
  if v_user_id is null then raise exception 'Debes iniciar sesión para registrar una compra de campo.'; end if;
  if v_empresa_id is null then raise exception 'La empresa es obligatoria.'; end if;
  if not exists(select 1 from public.usuarios_empresas ue where ue.user_id=v_user_id and ue.empresa_id=v_empresa_id and ue.estado='activo' and ue.acceso_campo=true and 'compras'=any(coalesce(ue.campo_modulos,array[]::text[]))) and not public.usuario_es_superadmin_plataforma() then raise exception 'No tienes acceso de campo al módulo Compras.'; end if;
  if v_gasto_id is null or v_gasto_id !~ '^gasto_[a-z0-9]{24,64}$' then raise exception 'El identificador del gasto no tiene un formato válido.'; end if;
  if exists(select 1 from public.compras_gastos where id=v_gasto_id) then raise exception 'El identificador del gasto ya existe.'; end if;
  select coalesce(e.multisociedad_habilitado,false) into v_multisociedad from public.empresas e where e.id=v_empresa_id;
  if not found then raise exception 'La empresa indicada no existe.'; end if;
  if v_sociedad_text is not null then begin v_sociedad_id:=v_sociedad_text::uuid; exception when invalid_text_representation then raise exception 'La sociedad indicada no es válida.'; end; elsif v_centro_costo_id is not null then select cc.sociedad_id into v_sociedad_id from public.centros_costo cc where cc.id=v_centro_costo_id and cc.empresa_id=v_empresa_id and cc.estado='activo'; end if;
  if v_multisociedad and v_sociedad_id is null then raise exception 'La sociedad es obligatoria para registrar el gasto.'; end if;
  if v_centro_costo_id is null or not exists(select 1 from public.centros_costo cc where cc.id=v_centro_costo_id and cc.empresa_id=v_empresa_id and cc.estado='activo' and (v_sociedad_id is null or cc.sociedad_id=v_sociedad_id)) then raise exception 'El centro de costo no pertenece a la empresa o sociedad indicada.'; end if;
  v_alcance:=public.usuario_alcance_sociedades(v_empresa_id);
  if v_sociedad_id is not null and v_alcance is not null and not(v_sociedad_id=any(v_alcance)) then raise exception 'La sociedad está fuera del alcance del usuario.'; end if;
  if v_adjunto_bucket <> 'documentos-generales' then raise exception 'El comprobante debe estar en el bucket documentos-generales.'; end if;
  if v_storage_path is null or left(v_storage_path,length(v_empresa_id || '/compras_gastos/' || v_gasto_id || '/')) <> v_empresa_id || '/compras_gastos/' || v_gasto_id || '/' or length(v_storage_path) <= length(v_empresa_id || '/compras_gastos/' || v_gasto_id || '/') then raise exception 'La ruta del comprobante no corresponde al gasto y empresa indicados.'; end if;
  if v_adjunto_url is null then raise exception 'La URL del comprobante es obligatoria.'; end if;
  begin v_monto:=nullif(btrim(coalesce(v_gasto ->> 'monto','')),'')::numeric; v_fecha:=nullif(btrim(coalesce(v_gasto ->> 'fecha','')),'')::date; exception when invalid_text_representation then raise exception 'El monto o la fecha del gasto no son válidos.'; end;
  if v_monto is null or v_monto <= 0 then raise exception 'El monto debe ser mayor que cero.'; end if;
  if v_fecha is null then raise exception 'La fecha del gasto es obligatoria.'; end if;
  if nullif(btrim(coalesce(v_gasto ->> 'metodo_pago','')),'') is null then raise exception 'El método de pago es obligatorio.'; end if;
  v_ruc:=regexp_replace(coalesce(nullif(btrim(v_gasto ->> 'ruc_proveedor'),''),nullif(btrim(v_cxp_input ->> 'ruc_emisor'),''),''),'\D','','g');
  v_factura:=public.normalizar_numero_comprobante(coalesce(nullif(btrim(v_gasto ->> 'num_comprobante'),''),nullif(btrim(v_cxp_input ->> 'factura_numero'),''),''));
  if v_crear_cxp and (v_ruc='' or v_factura='') then raise exception 'El RUC y número de comprobante son obligatorios para generar una CxP.'; end if;
  if v_tiene_lineas and v_ruc='' then raise exception 'El RUC es obligatorio para crear la OC de regularización.'; end if;
  if v_ruc <> '' and v_factura <> '' then
    perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|CXP_CAMPO|' || v_ruc || '|' || v_factura));
    if exists(select 1 from public.compras_gastos g where g.empresa_id=v_empresa_id and lower(coalesce(g.estado,'')) <> 'anulada' and regexp_replace(coalesce(g.ruc_proveedor,''),'\D','','g')=v_ruc and public.normalizar_numero_comprobante(g.num_comprobante)=v_factura) or exists(select 1 from public.cxp c where c.empresa_id=v_empresa_id and lower(coalesce(c.estado,'')) <> 'anulada' and regexp_replace(coalesce(c.ruc_emisor,''),'\D','','g')=v_ruc and public.normalizar_numero_comprobante(c.factura_numero)=v_factura) then raise exception 'Esta factura ya fue registrada'; end if;
  end if;

  if v_tiene_lineas then
    begin v_monto_sin_igv:=nullif(btrim(coalesce(v_gasto ->> 'monto_sin_igv','')),'')::numeric; exception when invalid_text_representation then raise exception 'El monto sin IGV de la factura no es válido.'; end;
    if v_monto_sin_igv is null then raise exception 'El monto sin IGV de la factura es obligatorio cuando se indican líneas.'; end if;
    select coalesce(array_agg(distinct nullif(btrim(x.value ->> 'solpe_id'),'') order by 1),array[]::text[]) into v_solpe_ids from jsonb_array_elements(v_lineas) x(value);
    if cardinality(v_solpe_ids)=0 then raise exception 'Cada línea debe indicar su SOLPE.'; end if;
    select * into v_first_solpe from public.solpe_interna where id=v_solpe_ids[1] and empresa_id=v_empresa_id for update;
    if not found then raise exception 'La SOLPE % no pertenece a la empresa',v_solpe_ids[1]; end if;
    for v_solpe in select * from public.solpe_interna where empresa_id=v_empresa_id and id=any(v_solpe_ids) order by id for update loop end loop;
    if (select count(*) from public.solpe_interna where empresa_id=v_empresa_id and id=any(v_solpe_ids)) <> cardinality(v_solpe_ids) then raise exception 'Una SOLPE indicada no pertenece a la empresa.'; end if;
    for v_line in select value from jsonb_array_elements(v_lineas) value loop
      v_solpe_id:=nullif(btrim(v_line ->> 'solpe_id'),''); v_item_id:=nullif(btrim(v_line ->> 'solpe_item_id'),'');
      if v_solpe_id is null or v_item_id is null then raise exception 'Cada línea debe indicar solpe_id y solpe_item_id.'; end if;
      if (v_solpe_id || ':' || v_item_id) = any(v_seen) then raise exception 'La línea de SOLPE está repetida en la compra.'; end if;
      v_seen:=array_append(v_seen,v_solpe_id || ':' || v_item_id);
      begin v_qty:=nullif(btrim(v_line ->> 'cantidad'),'')::numeric; v_price:=nullif(btrim(v_line ->> 'precio_unitario'),'')::numeric; exception when invalid_text_representation then raise exception 'La cantidad o precio de una línea no son válidos.'; end;
      if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0 then raise exception 'La cantidad y precio de cada línea deben ser válidos.'; end if;
      select s.items into v_items from public.solpe_interna s where s.id=v_solpe_id and s.empresa_id=v_empresa_id;
      select x.item,x.ordinality into v_item,v_ordinal from jsonb_array_elements(v_items) with ordinality x(item,ordinality) where x.item ->> 'id'=v_item_id;
      if v_item is null then raise exception 'La línea % no existe en la SOLPE %',v_item_id,v_solpe_id; end if;
      if nullif(btrim(v_item ->> 'oc_id'),'') is not null then raise exception 'La línea % ya está cubierta por una OC',v_item_id; end if;
      if nullif(btrim(v_item ->> 'proveedor_asignado_id'),'') is not null then raise exception 'La línea % ya tiene proveedor asignado',v_item_id; end if;
      if nullif(btrim(v_item ->> 'comprador_campo_id'),'') <> v_user_id::text then raise exception 'La línea % no está tomada por este comprador',v_item_id; end if;
      v_original_qty:=nullif(btrim(v_item ->> 'cantidad'),'')::numeric;
      if v_original_qty is null or v_qty > v_original_qty then raise exception 'La cantidad de la línea % supera la cantidad pendiente',v_item_id; end if;
      v_lineas_total:=v_lineas_total + v_qty * v_price;
      v_oc_items:=v_oc_items || jsonb_build_array(jsonb_build_object('item_id','oci_' || substr(replace(gen_random_uuid()::text,'-',''),1,18),'solpe_id',v_solpe_id,'solpe_item_id',v_item_id,'material_id',v_item ->> 'material_id','codigo',v_item ->> 'material_codigo','descripcion',coalesce(v_item ->> 'descripcion','Item de compra'),'cantidad',v_qty,'unidad',coalesce(v_item ->> 'unidad','UND'),'precio_unitario',v_price,'subtotal',round((v_qty*v_price)::numeric,2)));
    end loop;
    if abs(v_lineas_total - v_monto_sin_igv) > 0.10 then raise exception 'El total de las líneas no coincide con la factura'; end if;
    v_proveedor_nombre:=coalesce(nullif(btrim(v_gasto ->> 'proveedor_referencia'),''),nullif(btrim(v_cxp_input ->> 'nombre_emisor'),''));
    v_proveedor_id:=public.resolver_proveedor_por_ruc(v_empresa_id,v_ruc,v_proveedor_nombre);

    for v_line in select value from jsonb_array_elements(v_lineas) value loop
      v_solpe_id:=nullif(btrim(v_line ->> 'solpe_id'),''); v_item_id:=nullif(btrim(v_line ->> 'solpe_item_id'),''); v_qty:=(v_line ->> 'cantidad')::numeric;
      select s.items into v_items from public.solpe_interna s where s.id=v_solpe_id and s.empresa_id=v_empresa_id;
      select x.item,x.ordinality into v_item,v_ordinal from jsonb_array_elements(v_items) with ordinality x(item,ordinality) where x.item ->> 'id'=v_item_id;
      v_original_qty:=(v_item ->> 'cantidad')::numeric;
      v_new_item:=jsonb_set(v_item,'{cantidad}',to_jsonb(v_qty),true);
      if v_qty < v_original_qty then
        v_rest_item:=(v_item - 'oc_id' - 'proveedor_asignado_id' - 'comprador_campo_id' - 'tomada_en') || jsonb_build_object('id','itm_' || substr(replace(gen_random_uuid()::text,'-',''),1,20),'cantidad',v_original_qty-v_qty,'proveedor_asignado_id',null,'comprador_campo_id',null,'tomada_en',null);
        v_new_item:=v_new_item;
      end if;
      select coalesce(jsonb_agg(case when x.ordinality=v_ordinal then v_new_item else x.item end order by x.ordinality),'[]'::jsonb) into v_items from jsonb_array_elements(v_items) with ordinality x(item,ordinality);
      if v_qty < v_original_qty then v_items:=v_items || jsonb_build_array(v_rest_item); end if;
      update public.solpe_interna set items=v_items,updated_at=now() where id=v_solpe_id;
    end loop;
    v_oc_subtotal:=round(v_lineas_total,2); v_oc_igv:=round(greatest(v_monto-v_oc_subtotal,0),2); v_oc_id:='oc_' || substr(replace(gen_random_uuid()::text,'-',''),1,20); v_oc_codigo:=public.siguiente_codigo_oc_campo(v_empresa_id);
    insert into public.ordenes_compra(id,empresa_id,sociedad_id,codigo,solpe_id,solpe_codigo,origen_tipo,proveedor_id,ot_id,centro_costo_id,descripcion,items,subtotal,igv,total,condicion_pago,moneda,fecha_emision,estado,porcentaje_recibido,creado_por,created_at,updated_at)
    values(v_oc_id,v_empresa_id,v_sociedad_id,v_oc_codigo,case when cardinality(v_solpe_ids)=1 then v_solpe_ids[1] else null end,case when cardinality(v_solpe_ids)=1 then v_first_solpe.codigo else null end,'compra_campo',v_proveedor_id,case when cardinality(v_solpe_ids)=1 then v_first_solpe.ot_id else null end,case when cardinality(v_solpe_ids)=1 then v_first_solpe.centro_costo_id else null end,'Compra de campo ' || coalesce(v_factura,'sin factura'),v_oc_items,v_oc_subtotal,v_oc_igv,v_monto,case when v_crear_cxp then 'Crédito' else 'Contado' end,coalesce(nullif(btrim(v_gasto ->> 'moneda'),''),'PEN'),v_fecha,'emitida',0,v_user_id,now(),now());
    select public.registrar_cobertura_solpe_oc(v_solpe_ids[1],v_oc_id) into v_coverage;
  end if;

  insert into public.compras_gastos(id,empresa_id,tipo,descripcion,categoria,monto,moneda,fecha,origen_registro,estado,estado_pago,proveedor_referencia,ruc_proveedor,num_comprobante,archivo_url,metodo_pago,cxp_id,orden_compra_id,excluir_de_er,centro_costo_id,sociedad_id,ot_vinc_id,created_at,updated_at,es_activo_fijo)
  values(v_gasto_id,v_empresa_id,'gasto',coalesce(nullif(btrim(v_gasto ->> 'descripcion'),''),'Compra en campo'),coalesce(nullif(btrim(v_gasto ->> 'categoria'),''),'Materiales'),v_monto,coalesce(nullif(btrim(v_gasto ->> 'moneda'),''),'PEN'),v_fecha,'campo','pendiente_revision',case when v_crear_cxp then 'pendiente' else 'pagado' end,nullif(btrim(v_gasto ->> 'proveedor_referencia'),''),nullif(btrim(v_gasto ->> 'ruc_proveedor'),''),nullif(btrim(v_gasto ->> 'num_comprobante'),''),v_adjunto_url,nullif(btrim(v_gasto ->> 'metodo_pago'),''),null,v_oc_id,v_tiene_lineas,v_centro_costo_id,v_sociedad_id,v_ot_id,now(),now(),false);
  select to_jsonb(g) into v_gasto_row from public.compras_gastos g where g.id=v_gasto_id;
  insert into public.adjuntos(empresa_id,entidad_tipo,entidad_id,categoria,nombre_original,bucket,storage_path,url,mime_type,tamano_bytes,descripcion,subido_por)
  values(v_empresa_id,'compras_gastos',v_gasto_id,coalesce(nullif(btrim(v_adjunto ->> 'categoria'),''),'comprobante'),coalesce(nullif(btrim(v_adjunto ->> 'nombre_original'),''),'comprobante'),v_adjunto_bucket,v_storage_path,v_adjunto_url,nullif(btrim(v_adjunto ->> 'mime_type'),''),nullif(btrim(v_adjunto ->> 'tamano_bytes'),'')::bigint,nullif(btrim(v_adjunto ->> 'descripcion'),''),v_user_id) returning id into v_adjunto_id;
  if v_crear_cxp then
    v_concepto:=coalesce(nullif(btrim(v_cxp_input ->> 'concepto'),''),v_gasto ->> 'descripcion','Compra en campo');
    v_fecha_vencimiento:=nullif(btrim(v_cxp_input ->> 'fecha_vencimiento'),'');
    if v_fecha_vencimiento is null then raise exception 'La fecha de vencimiento es obligatoria para generar una CxP.'; end if;
    v_cxp_payload:=(v_cxp_input - 'id' - 'estado' - 'origen' - 'no_devengar_er' - 'gasto_id' - 'orden_compra_id') || jsonb_build_object('empresa_id',v_empresa_id,'sociedad_id',v_sociedad_id,'estado','por_pagar','origen','gasto_movil','no_devengar_er',true,'gasto_id',v_gasto_id,'orden_compra_id',v_oc_id,'proveedor_id',v_proveedor_id,'tipo_beneficiario','proveedor','factura_numero',coalesce(nullif(btrim(v_cxp_input ->> 'factura_numero'),''),v_gasto ->> 'num_comprobante'),'concepto',v_concepto,'monto_total',v_monto,'monto_pagado',0,'saldo',v_monto,'fecha_emision',coalesce(nullif(btrim(v_cxp_input ->> 'fecha_emision'),''),v_fecha::text),'ruc_emisor',coalesce(nullif(btrim(v_cxp_input ->> 'ruc_emisor'),''),v_gasto ->> 'ruc_proveedor'),'archivo_factura_url',v_adjunto_url,'centro_costo_id',v_centro_costo_id);
    select public.generar_cxp_centralizado(v_cxp_payload,'gasto_movil','crear') into v_cxp;
    update public.compras_gastos set cxp_id=v_cxp ->> 'id',updated_at=now() where id=v_gasto_id and empresa_id=v_empresa_id;
    if not found then raise exception 'No se pudo vincular el gasto con la CxP creada.'; end if;
    v_gasto_row:=v_gasto_row || jsonb_build_object('cxp_id',v_cxp ->> 'id');
  end if;
  if v_tiene_lineas then
    return jsonb_build_object('ok',true,'gasto_id',v_gasto_id,'cxp_id',v_cxp ->> 'id','adjunto_id',v_adjunto_id,'gasto',v_gasto_row,'cxp',v_cxp,'oc',jsonb_build_object('id',v_oc_id,'codigo',v_oc_codigo,'origen_tipo','compra_campo','estado','emitida'),'cobertura',v_coverage,'lineas_cubiertas',jsonb_array_length(v_oc_items),'lineas_divididas',jsonb_array_length(v_lineas));
  end if;
  return jsonb_build_object('ok',true,'gasto_id',v_gasto_id,'cxp_id',case when v_crear_cxp then v_cxp ->> 'id' else null end,'adjunto_id',v_adjunto_id,'gasto',v_gasto_row,'cxp',case when v_crear_cxp then v_cxp else null end,'lineas_solpe_ignoradas',jsonb_array_length(v_lineas));
end;
$$;

revoke execute on function public.registrar_compra_campo(jsonb) from public, anon;
grant execute on function public.registrar_compra_campo(jsonb) to authenticated;
