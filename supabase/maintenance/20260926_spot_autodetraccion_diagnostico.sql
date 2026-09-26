\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- SPOT Bloque 2 / diagnostico de registrar_cobro_cxc_atomico ---'

begin;

create or replace function pg_temp.spot2_diag_visible(p_line text)
returns text
language sql
immutable
as $$
  select replace(
           replace(
             replace(
               replace(coalesce(p_line, '[LINEA_AUSENTE]'), E'\r', '<CR>'),
               E'\t', '<TAB>'
             ),
             ' ', '<SP>'
           ),
           E'\n', '<LF>'
         );
$$;

create or replace function pg_temp.spot2_diag_aligned_diff(
  p_remota text,
  p_generada text
)
returns void
language plpgsql
as $$
declare
  v_remotas text[] := string_to_array(p_remota, E'\n');
  v_generadas text[] := string_to_array(p_generada, E'\n');
  v_m integer := coalesce(array_length(v_remotas, 1), 0);
  v_n integer := coalesce(array_length(v_generadas, 1), 0);
  v_i integer;
  v_j integer;
  v_valor integer;
  v_izquierda integer;
  v_arriba integer;
  v_diagonal integer;
  v_actual integer;
begin
  create temp table pg_temp.spot2_diag_lcs (
    i integer not null,
    j integer not null,
    valor integer not null,
    primary key (i, j)
  ) on commit drop;

  if v_m > 0 and v_n > 0 then
    for v_i in reverse 1..v_m loop
      for v_j in reverse 1..v_n loop
        if v_remotas[v_i] = v_generadas[v_j] then
          select coalesce(max(l.valor), 0) into v_diagonal
          from pg_temp.spot2_diag_lcs l
          where l.i = v_i + 1 and l.j = v_j + 1;
          v_valor := v_diagonal + 1;
        else
          select coalesce(max(l.valor), 0) into v_izquierda
          from pg_temp.spot2_diag_lcs l
          where l.i = v_i and l.j = v_j + 1;
          select coalesce(max(l.valor), 0) into v_arriba
          from pg_temp.spot2_diag_lcs l
          where l.i = v_i + 1 and l.j = v_j;
          v_valor := greatest(v_izquierda, v_arriba);
        end if;
        insert into pg_temp.spot2_diag_lcs(i, j, valor)
        values (v_i, v_j, v_valor);
      end loop;
    end loop;
  end if;

  v_i := 1;
  v_j := 1;
  while v_i <= v_m or v_j <= v_n loop
    if v_i <= v_m and v_j <= v_n and v_remotas[v_i] = v_generadas[v_j] then
      v_i := v_i + 1;
      v_j := v_j + 1;
    elsif v_j <= v_n and (
      v_i > v_m
      or (select coalesce(max(l.valor), 0) from pg_temp.spot2_diag_lcs l where l.i = v_i and l.j = v_j + 1)
         >= (select coalesce(max(l.valor), 0) from pg_temp.spot2_diag_lcs l where l.i = v_i + 1 and l.j = v_j)
    ) then
      raise notice 'SPOT2_ALIGNED_DIFF|agregada|remota_linea=%|generada_linea=%|texto=%',
        v_i - 1, v_j, pg_temp.spot2_diag_visible(v_generadas[v_j]);
      v_j := v_j + 1;
    else
      raise notice 'SPOT2_ALIGNED_DIFF|quitada|remota_linea=%|generada_linea=%|texto=%',
        v_i, v_j - 1, pg_temp.spot2_diag_visible(v_remotas[v_i]);
      v_i := v_i + 1;
    end if;
  end loop;
end;
$$;

do $$
declare
  v_oid oid;
  v_remota text;
  v_declaracion text;
  v_limite text;
  v_generada text;
  v_old text;
  v_limite_nuevo text;
  v_transicion_nueva text;
  v_anchor text;
  v_ancla_declaracion text;
  v_count_remota integer;
  v_count_generada integer;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_remota
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_cobro_cxc_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id text, p_cxc_id text, p_cobro jsonb, p_movimiento jsonb, p_comision jsonb';

  if v_oid is null or v_remota is null then
    raise exception 'SPOT2_DIAGNOSTICO|registrar_cobro_cxc_atomico ausente';
  end if;

  -- Esta es la misma cadena que usa la migracion para el bloque del limite.
  v_old := $old$
  if not v_es_detraccion then
    select coalesce(sum(d.monto_detraccion_origen), 0)
      into v_detraccion_pendiente
    from public.detracciones d
    where d.cxc_id = v_cxc.id
      and d.direccion = 'venta'
      and d.estado = 'pendiente';
    v_saldo_normal_max := greatest(
      0,
      coalesce(v_cxc.saldo, v_neto_cobrable - coalesce(v_cxc.monto_pagado, 0))
      - v_detraccion_pendiente
    );
    if v_monto > v_saldo_normal_max + 0.005 then
      raise exception 'El cobro normal no puede invadir el tramo pendiente de detraccion; maximo cobrable ahora: %.', v_saldo_normal_max;
    end if;
  end if;$old$;

  v_count_remota := (length(v_remota) - length(replace(v_remota, v_old, ''))) / length(v_old);

  -- Misma generacion que la migracion, sin ejecutar DDL ni la funcion resultante.
  v_ancla_declaracion := '  v_es_detraccion boolean := v_tipo_cobro = ''detraccion'';';
  v_declaracion := replace(
    v_remota,
    v_ancla_declaracion,
    v_ancla_declaracion || E'\n' || '  v_cliente_pago_total_sin_detraer boolean := coalesce((p_cobro ->> ''cliente_pago_total_sin_detraer'')::boolean, false);'
  );

  v_limite_nuevo := $new$
  if not v_es_detraccion then
    if v_cliente_pago_total_sin_detraer then
      select * into v_detraccion
      from public.detracciones d
      where d.cxc_id = v_cxc.id
        and d.direccion = 'venta'
        and d.estado = 'pendiente'
      order by d.creado_en
      limit 1
      for update;

      if not found then
        raise exception 'El pago total sin detraccion requiere una obligacion SPOT pendiente.';
      end if;
      if abs(v_monto - coalesce(v_cxc.saldo, v_neto_cobrable - coalesce(v_cxc.monto_pagado, 0))) > 0.005 then
        raise exception 'El pago total sin detraccion debe cubrir exactamente el saldo completo de la CxC.';
      end if;
    else
      select coalesce(sum(d.monto_detraccion_origen), 0)
        into v_detraccion_pendiente
      from public.detracciones d
      where d.cxc_id = v_cxc.id
        and d.direccion = 'venta'
        and d.estado = 'pendiente';
      v_saldo_normal_max := greatest(
        0,
        coalesce(v_cxc.saldo, v_neto_cobrable - coalesce(v_cxc.monto_pagado, 0))
        - v_detraccion_pendiente
      );
      if v_monto > v_saldo_normal_max + 0.005 then
        raise exception 'El cobro normal no puede invadir el tramo pendiente de detraccion; maximo cobrable ahora: %.', v_saldo_normal_max;
      end if;
    end if;
  end if;$new$;
  v_limite := replace(v_declaracion, v_old, v_limite_nuevo);

  v_anchor := E'\n  v_cobro_id := coalesce(nullif(btrim(p_cobro ->> ''id''), ''''), ''cob_'' || replace(gen_random_uuid()::text, ''-'', ''''));';
  v_transicion_nueva := E'\n  if v_cliente_pago_total_sin_detraer then\n    update public.detracciones\n    set estado = ''por_autodetraer'',\n        fecha_limite_deposito = public.spot_quinto_dia_habil(v_cxc.empresa_id, coalesce(nullif(p_cobro ->> ''fecha_cobro'', '''')::date, current_date)),\n        actualizado_en = now()\n    where id = v_detraccion.id\n      and estado = ''pendiente'';\n    if not found then\n      raise exception ''La obligacion SPOT ya no esta pendiente para autodetraccion.'';\n    end if;\n  end if;' || v_anchor;
  v_generada := replace(v_limite, v_anchor, v_transicion_nueva);

  v_count_generada := (length(v_generada) - length(replace(v_generada, v_old, ''))) / length(v_old);
  raise notice 'SPOT2_DIAGNOSTICO|ancla_bloque_limite|remota=%|generada=%', v_count_remota, v_count_generada;
  raise notice E'SPOT2_DIAGNOSTICO|BLOQUE_VIEJO_BEGIN\n%\nSPOT2_DIAGNOSTICO|BLOQUE_VIEJO_END', v_old;
  raise notice E'SPOT2_DIAGNOSTICO|BLOQUE_NUEVO_BEGIN\n%\nSPOT2_DIAGNOSTICO|BLOQUE_NUEVO_END', v_limite_nuevo;
  raise notice 'SPOT2_DIAGNOSTICO|longitudes|remota=%|generada=%|cr_remota=%|cr_generada=%',
    length(v_remota), length(v_generada),
    length(v_remota) - length(replace(v_remota, E'\r', '')),
    length(v_generada) - length(replace(v_generada, E'\r', ''));
  raise notice 'SPOT2_DIAGNOSTICO|diff_alineado_begin';
  perform pg_temp.spot2_diag_aligned_diff(v_remota, v_generada);
  raise notice 'SPOT2_DIAGNOSTICO|diff_alineado_end';

  -- Esta es la prueba que distingue la causa: el bloque viejo puede quedar
  -- dentro del ELSE del bloque nuevo, pero el reemplazo completo debe revertir
  -- exactamente a la definicion remota.
  if replace(v_generada, v_transicion_nueva, v_anchor) = v_limite
     and replace(v_limite, v_limite_nuevo, v_old) = v_declaracion
     and replace(v_declaracion,
                 v_ancla_declaracion || E'\n' || '  v_cliente_pago_total_sin_detraer boolean := coalesce((p_cobro ->> ''cliente_pago_total_sin_detraer'')::boolean, false);',
                 v_ancla_declaracion) = v_remota then
    raise notice 'SPOT2_DIAGNOSTICO|causa=reemplazo_ocurrio|bloque_viejo_conservado_intencionalmente_en_else=true';
  else
    raise notice 'SPOT2_DIAGNOSTICO|causa=requiere_revision|roundtrip_no_coincide';
  end if;
end;
$$;

rollback;
\echo '--- diagnostico finalizado; transaction rollback ---'
