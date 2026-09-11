-- Un comprobante solo puede repetirse si corresponde a otra contraparte y el
-- usuario lo confirma explícitamente. Los triggers cubren además escrituras
-- directas y carreras simultáneas que no pasan por la interfaz.

create or replace function public.normalizar_numero_comprobante(p_numero text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(regexp_replace(btrim(coalesce(p_numero, '')), '\s+', ' ', 'g'))
$$;

create or replace function public.bloquear_cxp_factura_duplicada()
returns trigger
language plpgsql
as $$
begin
  if new.proveedor_id is null or public.normalizar_numero_comprobante(new.factura_numero) = '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(
    new.empresa_id || '|CXP|' || coalesce(new.sociedad_id::text, 'sin-sociedad') || '|' || new.proveedor_id || '|' || public.normalizar_numero_comprobante(new.factura_numero)
  ));
  if exists (
    select 1 from public.cxp c
    where c.empresa_id = new.empresa_id
      and c.id is distinct from new.id
      and c.sociedad_id is not distinct from new.sociedad_id
      and c.proveedor_id = new.proveedor_id
      and public.normalizar_numero_comprobante(c.factura_numero) = public.normalizar_numero_comprobante(new.factura_numero)
  ) then
    raise exception 'Ya existe una CxP con la factura % para este proveedor y sociedad.', new.factura_numero;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_cxp_factura_duplicada on public.cxp;
create trigger trg_bloquear_cxp_factura_duplicada
before insert or update of empresa_id, sociedad_id, proveedor_id, factura_numero on public.cxp
for each row execute function public.bloquear_cxp_factura_duplicada();

create or replace function public.bloquear_factura_duplicada_cliente()
returns trigger
language plpgsql
as $$
begin
  if new.cuenta_id is null or public.normalizar_numero_comprobante(new.numero) = '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(
    new.empresa_id || '|FACTURA|' || coalesce(new.sociedad_id::text, 'sin-sociedad') || '|' || new.cuenta_id || '|' || public.normalizar_numero_comprobante(new.numero)
  ));
  if exists (
    select 1 from public.facturas f
    where f.empresa_id = new.empresa_id
      and f.id is distinct from new.id
      and f.sociedad_id is not distinct from new.sociedad_id
      and f.cuenta_id = new.cuenta_id
      and public.normalizar_numero_comprobante(f.numero) = public.normalizar_numero_comprobante(new.numero)
  ) then
    raise exception 'Ya existe una factura con el número % para este cliente y sociedad.', new.numero;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_factura_duplicada_cliente on public.facturas;
create trigger trg_bloquear_factura_duplicada_cliente
before insert or update of empresa_id, sociedad_id, cuenta_id, numero on public.facturas
for each row execute function public.bloquear_factura_duplicada_cliente();

-- La importación de CxC vigente quedó renombrada a *_base por la extensión
-- SPOT. Se actualiza su control de número sin duplicar toda la función.
do $$
declare
  v_def text;
  v_inicio integer;
  v_fin integer;
  v_bloque text;
begin
  select pg_get_functiondef('public.importar_cxc_masiva_fila_base(jsonb)'::regprocedure) into v_def;
  if v_def is null then
    raise exception 'No se encontró importar_cxc_masiva_fila_base(jsonb).';
  end if;

  v_def := replace(
    v_def,
    '  v_numero_normalizado text;',
    '  v_numero_normalizado text;' || E'\n' ||
    '  v_confirmar_numero_duplicado boolean := coalesce((p_payload ->> ''confirmar_numero_duplicado'')::boolean, false);'
  );
  v_inicio := strpos(v_def, '  v_numero_normalizado := regexp_replace');
  v_fin := strpos(substr(v_def, v_inicio), E'\n\n  insert into public.facturas');
  if v_inicio = 0 or v_fin = 0 then
    raise exception 'No se pudo localizar el control de duplicados de la importación CxC.';
  end if;
  v_fin := v_inicio + v_fin - 1;
  v_bloque :=
    '  v_numero_normalizado := regexp_replace(lower(btrim(v_numero)), ''\s+'', '' '', ''g'');' || E'\n' ||
    '  perform pg_advisory_xact_lock(hashtext(v_empresa_id || ''|FACTURA|'' || coalesce(v_sociedad_id::text, ''sin-sociedad'') || ''|'' || v_numero_normalizado));' || E'\n' ||
    '  if exists (' || E'\n' ||
    '    select 1 from public.facturas' || E'\n' ||
    '    where empresa_id = v_empresa_id and sociedad_id is not distinct from v_sociedad_id' || E'\n' ||
    '      and cuenta_id = v_cuenta.id' || E'\n' ||
    '      and regexp_replace(lower(btrim(numero)), ''\s+'', '' '', ''g'') = v_numero_normalizado' || E'\n' ||
    '  ) then raise exception ''Duplicado: ya existe una factura con el número % para este cliente y sociedad.'', v_numero; end if;' || E'\n' ||
    '  if exists (' || E'\n' ||
    '    select 1 from public.facturas' || E'\n' ||
    '    where empresa_id = v_empresa_id and sociedad_id is not distinct from v_sociedad_id' || E'\n' ||
    '      and cuenta_id is distinct from v_cuenta.id' || E'\n' ||
    '      and regexp_replace(lower(btrim(numero)), ''\s+'', '' '', ''g'') = v_numero_normalizado' || E'\n' ||
    '  ) and not v_confirmar_numero_duplicado then' || E'\n' ||
    '    raise exception ''Posible error: el número % ya existe para otro cliente en esta sociedad. Confirma la carga para continuar.'', v_numero;' || E'\n' ||
    '  end if;';
  v_def := overlay(v_def placing v_bloque from v_inicio for v_fin - v_inicio);
  execute v_def;
end;
$$;

-- La emisión normal usa su propia RPC, que también debe permitir el mismo
-- número para otro cliente solo cuando llegue la confirmación desde la UI.
create or replace function public.validar_numero_factura_por_contraparte(
  p_empresa_id text, p_sociedad_id uuid, p_cuenta_id text, p_numero text, p_confirmado boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero text := public.normalizar_numero_comprobante(p_numero);
begin
  perform pg_advisory_xact_lock(hashtext(p_empresa_id || '|FACTURA|' || coalesce(p_sociedad_id::text, 'sin-sociedad') || '|' || v_numero));
  if exists (
    select 1 from public.facturas
    where empresa_id = p_empresa_id and sociedad_id is not distinct from p_sociedad_id
      and cuenta_id = p_cuenta_id and public.normalizar_numero_comprobante(numero) = v_numero
  ) then
    raise exception 'Ya existe una factura con el número % para este cliente y sociedad.', p_numero;
  end if;
  if exists (
    select 1 from public.facturas
    where empresa_id = p_empresa_id and sociedad_id is not distinct from p_sociedad_id
      and cuenta_id is distinct from p_cuenta_id and public.normalizar_numero_comprobante(numero) = v_numero
  ) and not coalesce(p_confirmado, false) then
    raise exception 'Posible error: el número % ya existe para otro cliente en esta sociedad. Confirma para continuar.', p_numero;
  end if;
end;
$$;

do $$
declare
  v_def text;
  v_inicio integer;
  v_fin integer;
begin
  select pg_get_functiondef('public.emitir_factura_cxc_atomico(jsonb)'::regprocedure) into v_def;
  if v_def is null then
    raise exception 'No se encontró emitir_factura_cxc_atomico(jsonb).';
  end if;
  v_inicio := strpos(v_def, '  perform pg_advisory_xact_lock(hashtext(v_empresa_id || ''|FACTURA|''');
  v_fin := strpos(substr(v_def, v_inicio), E'\n\n  v_monto_neto');
  if v_inicio = 0 or v_fin = 0 then
    raise exception 'No se pudo localizar el control de duplicados de la emisión de factura.';
  end if;
  v_fin := v_inicio + v_fin - 1;
  v_def := overlay(
    v_def placing
      '  perform public.validar_numero_factura_por_contraparte(' || E'\n' ||
      '    v_empresa_id, v_sociedad_id, v_cuenta_id, v_numero,' || E'\n' ||
      '    coalesce((p_payload ->> ''confirmar_numero_duplicado'')::boolean, false)' || E'\n' ||
      '  );'
    from v_inicio for v_fin - v_inicio
  );
  execute v_def;
end;
$$;

select pg_notify('pgrst', 'reload schema');
