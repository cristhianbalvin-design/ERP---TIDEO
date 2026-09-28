-- Fase 1b: proveedor de compras en campo, consulta por RUC y montos de líneas.
-- La función registrar_compra_campo se reconstruye desde su definición remota
-- vigente dentro del bloque DO; no se copia una versión local antigua.

alter table public.proveedores add column if not exists origen text null;
alter table public.proveedores add column if not exists creado_por uuid null;

create or replace function public.crear_proveedor_campo(
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
  v_nombre text := coalesce(nullif(btrim(p_nombre), ''), 'Proveedor ' || v_ruc);
  v_id text;
  v_codigo text;
  v_suma integer := 0;
  v_calculado integer;
  v_user_id uuid := auth.uid();
  v_pesos integer[] := array[5,4,3,2,7,6,5,4,3,2];
begin
  if p_empresa_id is null or not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso a la empresa indicada.' using errcode = '42501';
  end if;
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para registrar un proveedor.' using errcode = '42501';
  end if;
  if length(v_ruc) <> 11 then return null; end if;
  for i in 1..10 loop
    v_suma := v_suma + substr(v_ruc, i, 1)::integer * v_pesos[i];
  end loop;
  v_calculado := 11 - (v_suma % 11);
  if v_calculado = 10 then v_calculado := 0;
  elsif v_calculado = 11 then v_calculado := 1;
  end if;
  if v_calculado <> substr(v_ruc, 11, 1)::integer then return null; end if;

  perform pg_advisory_xact_lock(hashtextextended('PROVEEDOR_CAMPO|' || p_empresa_id || '|' || v_ruc, 0));
  select p.id into v_id
    from public.proveedores p
   where p.empresa_id = p_empresa_id
     and regexp_replace(coalesce(p.ruc, ''), '\D', '', 'g') = v_ruc
   order by p.created_at nulls first, p.id
   limit 1;
  if v_id is not null then return v_id; end if;

  v_id := 'prv_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_codigo := 'POT-' || substr(v_ruc, greatest(length(v_ruc) - 5, 1));
  insert into public.proveedores (
    id, empresa_id, razon_social, nombre_comercial, ruc, codigo, tipo, estado,
    origen, creado_por, created_at, updated_at
  ) values (
    v_id, p_empresa_id, v_nombre, v_nombre, v_ruc, v_codigo, 'empresa', 'potencial',
    'campo', v_user_id, now(), now()
  );
  return v_id;
end;
$$;

revoke all on function public.crear_proveedor_campo(text, text, text) from public, anon, authenticated;

create or replace function public.buscar_proveedor_por_ruc(
  p_empresa_id text,
  p_ruc text
)
returns table(id text, razon_social text, nombre_comercial text, estado text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ruc text := regexp_replace(coalesce(p_ruc, ''), '\D', '', 'g');
begin
  if p_empresa_id is null or not exists (
    select 1 from public.usuarios_empresas ue
     where ue.user_id = auth.uid()
       and ue.empresa_id = p_empresa_id
       and ue.estado = 'activo'
       and ue.acceso_campo = true
       and 'compras' = any(coalesce(ue.campo_modulos, array[]::text[]))
  ) and not public.usuario_es_superadmin_plataforma() then
    raise exception 'No tienes acceso de campo al módulo Compras.' using errcode = '42501';
  end if;
  if length(v_ruc) <> 11 then return; end if;
  return query
  select p.id, p.razon_social, p.nombre_comercial, p.estado
    from public.proveedores p
   where p.empresa_id = p_empresa_id
     and regexp_replace(coalesce(p.ruc, ''), '\D', '', 'g') = v_ruc
   order by p.created_at nulls first, p.id
   limit 1;
end;
$$;

revoke all on function public.buscar_proveedor_por_ruc(text, text) from public, anon;
grant execute on function public.buscar_proveedor_por_ruc(text, text) to authenticated;

do $$
declare
  v_def text;
  v_new text;
  v_decl_old text := E'  v_proveedor_id text;\n  v_proveedor_nombre text;';
  v_decl_new text := E'  v_proveedor_id text;\n  v_proveedor_nombre text;\n  v_registrar_proveedor boolean := coalesce(nullif(v_payload ->> ''registrar_proveedor'','''')::boolean,false);';
  v_anchor text := E'  if v_ruc <> '''' and v_factura <> '''' then';
  v_provider_call text := E'    v_proveedor_id:=public.resolver_proveedor_por_ruc(v_empresa_id,v_ruc,v_proveedor_nombre);';
begin
  select pg_get_functiondef('public.registrar_compra_campo(jsonb)'::regprocedure) into v_def;
  if v_def is null then raise exception 'No se encontró la definición remota de registrar_compra_campo(jsonb).'; end if;
  if position(v_decl_old in v_def) = 0 then raise exception 'No se encontró el bloque de declaraciones esperado.'; end if;
  if position(v_anchor in v_def) = 0 then raise exception 'No se encontró el bloque de validación de duplicados esperado.'; end if;
  if position(v_provider_call in v_def) = 0 then raise exception 'No se encontró la llamada remota a resolver_proveedor_por_ruc.'; end if;

  v_new := replace(v_def, v_decl_old, v_decl_new);
  v_new := replace(v_new, v_anchor, E'  v_proveedor_nombre:=coalesce(nullif(btrim(v_gasto ->> ''proveedor_referencia''),''''),nullif(btrim(v_cxp_input ->> ''nombre_emisor''),''''));\n  if (v_tiene_lineas or v_crear_cxp or v_registrar_proveedor) and v_ruc <> '''' then\n    v_proveedor_id:=public.crear_proveedor_campo(v_empresa_id,v_ruc,v_proveedor_nombre);\n  end if;\n\n' || v_anchor);
  v_new := replace(v_new, v_provider_call, E'    v_proveedor_id:=coalesce(v_proveedor_id,public.crear_proveedor_campo(v_empresa_id,v_ruc,v_proveedor_nombre));');
  if v_new = v_def then raise exception 'La reconstrucción no produjo cambios.'; end if;
  execute v_new;
end;
$$;

revoke execute on function public.registrar_compra_campo(jsonb) from public, anon;
grant execute on function public.registrar_compra_campo(jsonb) to authenticated;

