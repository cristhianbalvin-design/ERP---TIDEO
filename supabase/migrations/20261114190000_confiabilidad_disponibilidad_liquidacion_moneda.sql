-- Confiabilidad · conf_disponibilidad devuelve en cada fila de flota el id de la liquidación y su moneda,
-- para que «Ver liquidación» abra la liquidación de la fila y la penalidad se muestre con su moneda.
-- Parte de la definición vigente (pg_get_functiondef) y solo agrega dos claves al objeto JSON.
do $$
declare d text; n text;
  o1 text := $o$'meta_dmr',c.meta_dmr,'penalidad',ll.penalidad,'estado_liquidacion',coalesce(l.estado,'ausente'))$o$;
  r1 text := $o$'meta_dmr',c.meta_dmr,'penalidad',ll.penalidad,'estado_liquidacion',coalesce(l.estado,'ausente'),'liquidacion_id',l.id,'moneda',coalesce(l.moneda,c.moneda))$o$;
begin
  d := pg_get_functiondef('public.conf_disponibilidad'::regproc);
  if (length(d) - length(replace(d, o1, ''))) / length(o1) <> 1 then
    raise exception 'conf_disponibilidad: el fragmento esperado no aparece exactamente una vez';
  end if;
  n := replace(d, o1, r1);
  execute n;
end $$;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.conf_disponibilidad'::regproc);
  if position('''liquidacion_id'',l.id' in d) = 0 or position('''moneda'',coalesce(l.moneda,c.moneda)' in d) = 0 then
    raise exception 'conf_disponibilidad no quedó con liquidacion_id y moneda';
  end if;
end $$;
