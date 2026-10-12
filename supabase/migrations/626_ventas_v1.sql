-- 626_ventas_v1.sql
-- Ventas V1 (camino B): ventas directas sin comprobante, items, cobros propios y
-- anulacion controlada. Migracion ADITIVA: no elimina ni reescribe datos de
-- ningun tenant. Las politicas RLS existentes de public.ventas no se tocan.
-- Solo se modifica la fila VEN-2026-0001 de emp_2000000000 (sociedad principal).

BEGIN;

-- 1) Columnas nuevas en ventas (nullable o con DEFAULT constante).
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS sociedad_id uuid REFERENCES public.sociedades(id),
  ADD COLUMN IF NOT EXISTS tipo_venta text NOT NULL DEFAULT 'con_comprobante',
  ADD COLUMN IF NOT EXISTS subtotal numeric(14,2),
  ADD COLUMN IF NOT EXISTS igv numeric(14,2),
  ADD COLUMN IF NOT EXISTS tipo_comprobante_previsto text,
  ADD COLUMN IF NOT EXISTS monto_cobrado numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS anulada_por text,
  ADD COLUMN IF NOT EXISTS anulada_en timestamptz;

ALTER TABLE public.ventas
  ADD CONSTRAINT ventas_tipo_venta_check CHECK (tipo_venta IN ('con_comprobante','sin_comprobante')),
  ADD CONSTRAINT ventas_tipo_comprobante_previsto_check CHECK (tipo_comprobante_previsto IS NULL OR tipo_comprobante_previsto IN ('factura','boleta')),
  ADD CONSTRAINT ventas_monto_cobrado_check CHECK (monto_cobrado >= 0);

CREATE INDEX IF NOT EXISTS ventas_empresa_sociedad_idx ON public.ventas (empresa_id, sociedad_id);
CREATE INDEX IF NOT EXISTS ventas_empresa_tipo_estado_fecha_idx ON public.ventas (empresa_id, tipo_venta, estado, fecha);

-- 2) Items de la venta.
CREATE TABLE IF NOT EXISTS public.venta_items (
  id text PRIMARY KEY DEFAULT ('vit_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id text NOT NULL REFERENCES public.empresas(id),
  venta_id text NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  orden integer NOT NULL DEFAULT 1,
  descripcion text NOT NULL CHECK (btrim(descripcion) <> ''),
  cantidad numeric(14,4) NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric(14,4) NOT NULL CHECK (precio_unitario >= 0),
  afecto_igv boolean NOT NULL DEFAULT true,
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0),
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venta_items_venta_idx ON public.venta_items (venta_id, orden);

-- 3) Cobros propios de la venta (solo ventas sin comprobante).
CREATE TABLE IF NOT EXISTS public.venta_cobros (
  id text PRIMARY KEY DEFAULT ('vco_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id text NOT NULL REFERENCES public.empresas(id),
  venta_id text NOT NULL REFERENCES public.ventas(id),
  fecha date NOT NULL DEFAULT current_date,
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  moneda text NOT NULL CHECK (moneda IN ('PEN','USD')),
  cuenta_bancaria_id text NOT NULL REFERENCES public.cuentas_bancarias(id),
  movimiento_id text REFERENCES public.movimientos_tesoreria(id),
  referencia text,
  estado text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente','anulado')),
  motivo_anulacion text,
  anulado_por text,
  anulado_en timestamptz,
  movimiento_reverso_id text REFERENCES public.movimientos_tesoreria(id),
  creado_por text,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venta_cobros_venta_idx ON public.venta_cobros (venta_id, estado);
CREATE INDEX IF NOT EXISTS venta_cobros_empresa_fecha_idx ON public.venta_cobros (empresa_id, fecha);

-- 4) RLS de las tablas nuevas: lectura con permiso de pantalla y alcance de
--    sociedad; escritura solo por las funciones SECURITY DEFINER de abajo.
ALTER TABLE public.venta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venta_cobros ENABLE ROW LEVEL SECURITY;

CREATE POLICY venta_items_select ON public.venta_items FOR SELECT TO authenticated
USING (
  public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id, 'ventas', 'ver')
  AND EXISTS (
    SELECT 1 FROM public.ventas v
    WHERE v.id = venta_items.venta_id
      AND v.empresa_id = venta_items.empresa_id
      AND (v.sociedad_id IS NULL
           OR public.usuario_alcance_sociedades(venta_items.empresa_id) IS NULL
           OR v.sociedad_id = ANY (public.usuario_alcance_sociedades(venta_items.empresa_id)))
  )
);

CREATE POLICY venta_cobros_select ON public.venta_cobros FOR SELECT TO authenticated
USING (
  public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id, 'ventas', 'ver')
  AND EXISTS (
    SELECT 1 FROM public.ventas v
    WHERE v.id = venta_cobros.venta_id
      AND v.empresa_id = venta_cobros.empresa_id
      AND (v.sociedad_id IS NULL
           OR public.usuario_alcance_sociedades(venta_cobros.empresa_id) IS NULL
           OR v.sociedad_id = ANY (public.usuario_alcance_sociedades(venta_cobros.empresa_id)))
  )
);

REVOKE ALL ON public.venta_items FROM PUBLIC, anon;
REVOKE ALL ON public.venta_cobros FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.venta_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.venta_cobros FROM authenticated;
GRANT SELECT ON public.venta_items TO authenticated;
GRANT SELECT ON public.venta_cobros TO authenticated;

-- 5) Autorizacion interna reutilizada por las RPC.
CREATE OR REPLACE FUNCTION public.venta_autorizar(p_empresa_id text, p_accion text, p_sociedad_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_alcance uuid[];
begin
  if auth.uid() is null then
    raise exception 'Sesion no valida.';
  end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso a esta empresa.';
  end if;
  if not public.usuario_puede(p_empresa_id, 'ventas', p_accion) then
    raise exception 'No tienes permiso para esta accion en Ventas.';
  end if;
  if p_sociedad_id is not null then
    v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
    if v_alcance is not null and not (p_sociedad_id = any(v_alcance)) then
      raise exception 'No tienes acceso a la sociedad de esta venta.';
    end if;
  end if;
end;
$function$;

-- 6) Crear o editar un borrador con sus items. Calcula subtotal, IGV y total
--    en el servidor (IGV 18 % solo sobre items afectos; una venta sin
--    comprobante nunca lleva IGV).
CREATE OR REPLACE FUNCTION public.venta_guardar(p_empresa_id text, p_venta jsonb, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_id text := nullif(btrim(p_venta ->> 'id'), '');
  v_row public.ventas%rowtype;
  v_tipo text := coalesce(nullif(btrim(p_venta ->> 'tipo_venta'), ''), 'con_comprobante');
  v_moneda text := upper(coalesce(nullif(btrim(p_venta ->> 'moneda'), ''), 'PEN'));
  v_cond text := coalesce(nullif(btrim(p_venta ->> 'condicion_pago'), ''), 'contado');
  v_dias integer := nullif(p_venta ->> 'dias_credito', '')::integer;
  v_soc uuid := nullif(p_venta ->> 'sociedad_id', '')::uuid;
  v_fecha date := coalesce(nullif(p_venta ->> 'fecha', '')::date, current_date);
  v_cuenta text := nullif(btrim(p_venta ->> 'cuenta_id'), '');
  v_cliente text := nullif(btrim(p_venta ->> 'cliente_nombre_snapshot'), '');
  v_concepto text := nullif(btrim(p_venta ->> 'concepto'), '');
  v_comp text := nullif(btrim(p_venta ->> 'tipo_comprobante_previsto'), '');
  v_sub numeric(14,2) := 0;
  v_igv numeric(14,2) := 0;
  v_total numeric(14,2);
  v_venc date;
  v_item jsonb;
  v_orden integer;
  v_desc text;
  v_cant numeric;
  v_precio numeric;
  v_afecto boolean;
  v_linea numeric(14,2);
  v_n integer := 0;
begin
  perform public.venta_autorizar(p_empresa_id, case when v_id is null then 'crear' else 'editar' end, null);

  if v_tipo not in ('con_comprobante', 'sin_comprobante') then
    raise exception 'Tipo de venta no valido.';
  end if;
  if v_moneda not in ('PEN', 'USD') then
    raise exception 'Moneda no valida.';
  end if;
  if v_cond not in ('contado', 'credito') then
    raise exception 'Condicion de pago no valida.';
  end if;
  if v_cond = 'credito' and (v_dias is null or v_dias <= 0 or v_dias > 365) then
    raise exception 'El credito requiere dias de credito entre 1 y 365.';
  end if;
  if v_cliente is null then
    raise exception 'El cliente es obligatorio.';
  end if;
  if v_concepto is null then
    raise exception 'El concepto es obligatorio.';
  end if;
  if v_tipo = 'sin_comprobante' then
    v_comp := null;
  elsif v_comp is not null and v_comp not in ('factura', 'boleta') then
    raise exception 'Tipo de comprobante previsto no valido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un item a la venta.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Una venta admite hasta 50 items.';
  end if;

  if v_cuenta is not null and not exists (
    select 1 from public.cuentas c where c.id = v_cuenta and c.empresa_id = p_empresa_id
  ) then
    raise exception 'El cliente no pertenece a la empresa.';
  end if;

  if v_soc is null then
    select s.id into v_soc
    from public.sociedades s
    where s.empresa_id = p_empresa_id and s.activa is true and s.es_principal is true
    limit 1;
  elsif not exists (
    select 1 from public.sociedades s where s.id = v_soc and s.empresa_id = p_empresa_id and s.activa is true
  ) then
    raise exception 'La sociedad no pertenece a la empresa o esta inactiva.';
  end if;
  perform public.venta_autorizar(p_empresa_id, case when v_id is null then 'crear' else 'editar' end, v_soc);

  for v_item, v_orden in
    select e.value, e.ordinality::integer from jsonb_array_elements(p_items) with ordinality e(value, ordinality)
  loop
    v_desc := nullif(btrim(v_item ->> 'descripcion'), '');
    v_cant := nullif(v_item ->> 'cantidad', '')::numeric;
    v_precio := nullif(v_item ->> 'precio_unitario', '')::numeric;
    v_afecto := case when v_tipo = 'sin_comprobante' then false
                     else coalesce((v_item ->> 'afecto_igv')::boolean, true) end;
    if v_desc is null or v_cant is null or v_cant <= 0 or v_precio is null or v_precio < 0 then
      raise exception 'El item % no es valido: descripcion, cantidad mayor a cero y precio.', v_orden;
    end if;
    v_linea := round(v_cant * v_precio, 2);
    v_sub := v_sub + v_linea;
    if v_afecto then
      v_igv := v_igv + round(v_linea * 0.18, 2);
    end if;
    v_n := v_n + 1;
  end loop;

  v_total := v_sub + v_igv;
  if v_total <= 0 then
    raise exception 'El total de la venta debe ser mayor a cero.';
  end if;
  v_venc := case when v_cond = 'credito' then v_fecha + v_dias else null end;

  if v_id is null then
    insert into public.ventas (
      empresa_id, fecha, cuenta_id, cliente_nombre_snapshot, concepto, monto_total, moneda,
      estado, creado_por, condicion_pago, dias_credito, fecha_vencimiento,
      sociedad_id, tipo_venta, subtotal, igv, tipo_comprobante_previsto
    ) values (
      p_empresa_id, v_fecha, v_cuenta, v_cliente, v_concepto, v_total, v_moneda,
      'borrador', auth.uid()::text, v_cond, v_dias, v_venc,
      v_soc, v_tipo, v_sub, v_igv, v_comp
    ) returning * into v_row;
  else
    select * into v_row from public.ventas where id = v_id and empresa_id = p_empresa_id for update;
    if not found then
      raise exception 'La venta no existe en la empresa.';
    end if;
    if v_row.estado <> 'borrador' then
      raise exception 'Solo se puede editar una venta en borrador.';
    end if;
    update public.ventas
       set fecha = v_fecha, cuenta_id = v_cuenta, cliente_nombre_snapshot = v_cliente,
           concepto = v_concepto, monto_total = v_total, moneda = v_moneda,
           condicion_pago = v_cond, dias_credito = v_dias, fecha_vencimiento = v_venc,
           sociedad_id = v_soc, tipo_venta = v_tipo, subtotal = v_sub, igv = v_igv,
           tipo_comprobante_previsto = v_comp
     where id = v_id
     returning * into v_row;
    delete from public.venta_items where venta_id = v_row.id;
  end if;

  for v_item, v_orden in
    select e.value, e.ordinality::integer from jsonb_array_elements(p_items) with ordinality e(value, ordinality)
  loop
    v_cant := (v_item ->> 'cantidad')::numeric;
    v_precio := (v_item ->> 'precio_unitario')::numeric;
    insert into public.venta_items (empresa_id, venta_id, orden, descripcion, cantidad, precio_unitario, afecto_igv, subtotal)
    values (
      p_empresa_id, v_row.id, v_orden, btrim(v_item ->> 'descripcion'), v_cant, v_precio,
      case when v_tipo = 'sin_comprobante' then false else coalesce((v_item ->> 'afecto_igv')::boolean, true) end,
      round(v_cant * v_precio, 2)
    );
  end loop;

  return jsonb_build_object(
    'venta', to_jsonb(v_row),
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.orden), '[]'::jsonb) from public.venta_items i where i.venta_id = v_row.id)
  );
end;
$function$;

-- 7) Confirmar un borrador.
CREATE OR REPLACE FUNCTION public.venta_confirmar(p_empresa_id text, p_venta_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_row public.ventas%rowtype;
begin
  select * into v_row from public.ventas where id = p_venta_id and empresa_id = p_empresa_id for update;
  if not found then
    raise exception 'La venta no existe en la empresa.';
  end if;
  perform public.venta_autorizar(p_empresa_id, 'editar', v_row.sociedad_id);
  if v_row.estado <> 'borrador' then
    raise exception 'Solo se puede confirmar una venta en borrador.';
  end if;
  if v_row.monto_total <= 0 then
    raise exception 'La venta no tiene total.';
  end if;
  update public.ventas set estado = 'confirmada' where id = v_row.id returning * into v_row;
  return jsonb_build_object('venta', to_jsonb(v_row));
end;
$function$;

-- 8) Registrar un cobro de una venta sin comprobante: crea el cobro propio y su
--    ingreso en Tesoreria en una sola transaccion.
CREATE OR REPLACE FUNCTION public.venta_registrar_cobro(p_empresa_id text, p_venta_id text, p_cobro jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_venta public.ventas%rowtype;
  v_cuenta public.cuentas_bancarias%rowtype;
  v_cobro public.venta_cobros%rowtype;
  v_mov public.movimientos_tesoreria%rowtype;
  v_monto numeric(14,2) := round(coalesce(nullif(p_cobro ->> 'monto', '')::numeric, 0), 2);
  v_fecha date := coalesce(nullif(p_cobro ->> 'fecha', '')::date, current_date);
  v_cuenta_id text := nullif(btrim(p_cobro ->> 'cuenta_bancaria_id'), '');
  v_ref text := nullif(btrim(p_cobro ->> 'referencia'), '');
  v_mov_id text := 'tes_' || replace(gen_random_uuid()::text, '-', '');
begin
  select * into v_venta from public.ventas where id = p_venta_id and empresa_id = p_empresa_id for update;
  if not found then
    raise exception 'La venta no existe en la empresa.';
  end if;
  perform public.venta_autorizar(p_empresa_id, 'editar', v_venta.sociedad_id);
  if not public.usuario_puede(p_empresa_id, 'tesoreria', 'crear') then
    raise exception 'Registrar un cobro requiere permiso para crear movimientos de Tesoreria.';
  end if;
  if v_venta.tipo_venta <> 'sin_comprobante' then
    raise exception 'Solo las ventas sin comprobante registran cobros propios; las demas se cobran desde Cuentas por Cobrar.';
  end if;
  if v_venta.estado <> 'confirmada' then
    raise exception 'Solo se cobra una venta confirmada.';
  end if;
  if v_monto <= 0 then
    raise exception 'El monto cobrado debe ser mayor a cero.';
  end if;
  if v_monto > round(v_venta.monto_total - v_venta.monto_cobrado, 2) + 0.005 then
    raise exception 'El monto supera el saldo pendiente de %.', round(v_venta.monto_total - v_venta.monto_cobrado, 2);
  end if;
  if v_fecha > current_date then
    raise exception 'La fecha del cobro no puede ser futura.';
  end if;
  if v_cuenta_id is null then
    raise exception 'Selecciona la cuenta bancaria donde ingreso el dinero.';
  end if;

  select * into v_cuenta from public.cuentas_bancarias where id = v_cuenta_id and empresa_id = p_empresa_id;
  if not found or v_cuenta.estado <> 'activo' then
    raise exception 'La cuenta bancaria no existe, no es de la empresa o esta inactiva.';
  end if;
  if coalesce(v_cuenta.es_cuenta_detracciones, false) is true then
    raise exception 'Un cobro de venta no puede ir a una cuenta de detracciones.';
  end if;
  if v_cuenta.moneda <> v_venta.moneda then
    raise exception 'La cuenta bancaria debe estar en la misma moneda de la venta (%).', v_venta.moneda;
  end if;
  if v_venta.sociedad_id is not null and v_cuenta.sociedad_id is not null
     and v_cuenta.sociedad_id <> v_venta.sociedad_id then
    raise exception 'La cuenta bancaria pertenece a otra sociedad.';
  end if;

  insert into public.movimientos_tesoreria (
    id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria,
    cuenta_bancaria_id, monto_en_moneda_cuenta, referencia, vinculo_tipo, vinculo_id,
    estado, categoria, es_manual, created_at
  ) values (
    v_mov_id, p_empresa_id, 'ingreso',
    'Cobro de venta ' || v_venta.numero || ' - ' || v_venta.cliente_nombre_snapshot,
    v_monto, v_venta.moneda, v_fecha, v_cuenta.nombre,
    v_cuenta.id, v_monto, v_ref, 'venta', v_venta.id,
    'registrado', 'venta_sin_comprobante', false, now()
  ) returning * into v_mov;

  insert into public.venta_cobros (
    empresa_id, venta_id, fecha, monto, moneda, cuenta_bancaria_id, movimiento_id, referencia, creado_por
  ) values (
    p_empresa_id, v_venta.id, v_fecha, v_monto, v_venta.moneda, v_cuenta.id, v_mov.id, v_ref, auth.uid()::text
  ) returning * into v_cobro;

  update public.ventas
     set monto_cobrado = round(monto_cobrado + v_monto, 2)
   where id = v_venta.id
   returning * into v_venta;

  return jsonb_build_object('venta', to_jsonb(v_venta), 'cobro', to_jsonb(v_cobro), 'movimiento', to_jsonb(v_mov));
end;
$function$;

-- 9) Anular un cobro: genera un egreso inverso en Tesoreria (no se borra nada).
CREATE OR REPLACE FUNCTION public.venta_anular_cobro(p_empresa_id text, p_cobro_id text, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cobro public.venta_cobros%rowtype;
  v_venta public.ventas%rowtype;
  v_mov public.movimientos_tesoreria%rowtype;
  v_cuenta public.cuentas_bancarias%rowtype;
  v_motivo text := nullif(btrim(p_motivo), '');
  v_rev_id text := 'tes_' || replace(gen_random_uuid()::text, '-', '');
begin
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Indica el motivo de la anulacion.';
  end if;
  select * into v_cobro from public.venta_cobros where id = p_cobro_id and empresa_id = p_empresa_id for update;
  if not found then
    raise exception 'El cobro no existe en la empresa.';
  end if;
  select * into v_venta from public.ventas where id = v_cobro.venta_id and empresa_id = p_empresa_id for update;
  perform public.venta_autorizar(p_empresa_id, 'editar', v_venta.sociedad_id);
  if not public.usuario_puede(p_empresa_id, 'tesoreria', 'crear') then
    raise exception 'Anular un cobro requiere permiso para crear movimientos de Tesoreria.';
  end if;
  if v_cobro.estado <> 'vigente' then
    raise exception 'El cobro ya esta anulado.';
  end if;
  select * into v_cuenta from public.cuentas_bancarias where id = v_cobro.cuenta_bancaria_id;

  insert into public.movimientos_tesoreria (
    id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria,
    cuenta_bancaria_id, monto_en_moneda_cuenta, referencia, vinculo_tipo, vinculo_id,
    estado, categoria, es_manual, created_at
  ) values (
    v_rev_id, p_empresa_id, 'egreso',
    'Anulacion de cobro de venta ' || v_venta.numero || ' - ' || v_motivo,
    v_cobro.monto, v_cobro.moneda, current_date, v_cuenta.nombre,
    v_cobro.cuenta_bancaria_id, v_cobro.monto, 'Reverso ' || coalesce(v_cobro.referencia, v_cobro.id),
    'venta_anulacion', v_venta.id, 'registrado', 'venta_sin_comprobante_reverso', false, now()
  ) returning * into v_mov;

  update public.venta_cobros
     set estado = 'anulado', motivo_anulacion = v_motivo, anulado_por = auth.uid()::text,
         anulado_en = now(), movimiento_reverso_id = v_mov.id
   where id = v_cobro.id
   returning * into v_cobro;

  update public.ventas
     set monto_cobrado = greatest(0, round(monto_cobrado - v_cobro.monto, 2))
   where id = v_venta.id
   returning * into v_venta;

  return jsonb_build_object('venta', to_jsonb(v_venta), 'cobro', to_jsonb(v_cobro), 'movimiento_reverso', to_jsonb(v_mov));
end;
$function$;

-- 10) Anular una venta. Bloquea si tiene cobros vigentes, comprobante o CxC.
CREATE OR REPLACE FUNCTION public.venta_anular(p_empresa_id text, p_venta_id text, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_row public.ventas%rowtype;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if v_motivo is null or length(v_motivo) < 3 then
    raise exception 'Indica el motivo de la anulacion.';
  end if;
  select * into v_row from public.ventas where id = p_venta_id and empresa_id = p_empresa_id for update;
  if not found then
    raise exception 'La venta no existe en la empresa.';
  end if;
  perform public.venta_autorizar(p_empresa_id, 'editar', v_row.sociedad_id);
  if v_row.estado = 'anulada' then
    raise exception 'La venta ya esta anulada.';
  end if;
  if exists (select 1 from public.venta_cobros c where c.venta_id = v_row.id and c.estado = 'vigente') then
    raise exception 'La venta tiene cobros vigentes: anula primero los cobros.';
  end if;
  if v_row.factura_id is not null or v_row.cxc_id is not null or v_row.estado = 'facturada' then
    raise exception 'La venta ya tiene comprobante o cuenta por cobrar: anulala desde Facturacion.';
  end if;
  update public.ventas
     set estado = 'anulada', motivo_anulacion = v_motivo, anulada_por = auth.uid()::text, anulada_en = now()
   where id = v_row.id
   returning * into v_row;
  return jsonb_build_object('venta', to_jsonb(v_row));
end;
$function$;

-- 11) Permisos de ejecucion: solo usuarios autenticados.
REVOKE ALL ON FUNCTION public.venta_autorizar(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.venta_guardar(text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.venta_confirmar(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.venta_registrar_cobro(text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.venta_anular_cobro(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.venta_anular(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.venta_guardar(text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venta_confirmar(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venta_registrar_cobro(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venta_anular_cobro(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.venta_anular(text, text, text) TO authenticated;

-- 12) Datos: solo la venta de prueba de emp_2000000000 toma su sociedad principal.
UPDATE public.ventas v
   SET sociedad_id = s.id
  FROM public.sociedades s
 WHERE v.empresa_id = 'emp_2000000000'
   AND v.numero = 'VEN-2026-0001'
   AND v.sociedad_id IS NULL
   AND s.empresa_id = 'emp_2000000000'
   AND s.es_principal IS TRUE;

-- 13) Comprobaciones: cualquier fallo revierte toda la migracion.
DO $check$
declare
  v_n integer;
begin
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'ventas'
     and column_name in ('sociedad_id','tipo_venta','subtotal','igv','tipo_comprobante_previsto','monto_cobrado','motivo_anulacion','anulada_por','anulada_en');
  if v_n <> 9 then raise exception 'Faltan columnas en ventas (%).', v_n; end if;

  if (select count(*) from public.ventas) <> 8 then
    raise exception 'El conteo de ventas cambio.';
  end if;
  if exists (select 1 from public.ventas where tipo_venta <> 'con_comprobante' or monto_cobrado <> 0) then
    raise exception 'Las ventas existentes deben quedar como con_comprobante y sin cobros.';
  end if;
  if (select count(*) from public.ventas where sociedad_id is not null) > 1 then
    raise exception 'Solo la venta de prueba debia recibir sociedad.';
  end if;

  select count(*) into v_n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('venta_autorizar','venta_guardar','venta_confirmar','venta_registrar_cobro','venta_anular_cobro','venta_anular')
     and p.prosecdef is true
     and exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%');
  if v_n <> 6 then raise exception 'Funciones de Ventas incompletas o sin search_path (%).', v_n; end if;

  if has_function_privilege('anon', 'public.venta_guardar(text,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.venta_anular(text,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.venta_autorizar(text,text,uuid)', 'EXECUTE') then
    raise exception 'Permisos de ejecucion incorrectos.';
  end if;
  if not has_function_privilege('authenticated', 'public.venta_registrar_cobro(text,text,jsonb)', 'EXECUTE') then
    raise exception 'authenticated debe poder ejecutar venta_registrar_cobro.';
  end if;

  if has_table_privilege('authenticated', 'public.venta_cobros', 'INSERT')
     or has_table_privilege('authenticated', 'public.venta_items', 'UPDATE')
     or has_table_privilege('anon', 'public.venta_cobros', 'SELECT') then
    raise exception 'Privilegios de tabla incorrectos.';
  end if;
  if (select count(*) from pg_class where relname in ('venta_items','venta_cobros') and relrowsecurity) <> 2 then
    raise exception 'RLS no activo en tablas nuevas.';
  end if;
end
$check$;

COMMIT;
