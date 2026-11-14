-- Con una sociedad elegida, los registros sin sociedad (fallas manuales, hallazgos antiguos) son de toda la empresa
-- y deben contarse. Parte de la definición vigente de cada función (pg_get_functiondef) y cambia solo esos filtros.
do $$
declare d text; n int;
begin
  d := pg_get_functiondef('public.conf_disponibilidad(text,uuid,date,date,text)'::regprocedure);
  n := (length(d) - length(replace(d, '(p_sociedad_id is null or e.sociedad_id = p_sociedad_id)', ''))) / length('(p_sociedad_id is null or e.sociedad_id = p_sociedad_id)');
  if n <> 1 then raise exception 'conf_disponibilidad: se esperaba 1 filtro de fallas por sociedad, hay %', n; end if;
  d := replace(d, '(p_sociedad_id is null or e.sociedad_id = p_sociedad_id)', '(p_sociedad_id is null or e.sociedad_id is null or e.sociedad_id = p_sociedad_id)');
  execute d;

  d := pg_get_functiondef('public.conf_kpis(text,uuid,date,date,text)'::regprocedure);
  n := (length(d) - length(replace(d, '(p_sociedad_id is null or e.sociedad_id = p_sociedad_id)', ''))) / length('(p_sociedad_id is null or e.sociedad_id = p_sociedad_id)');
  if n <> 1 then raise exception 'conf_kpis: se esperaba 1 filtro de eventos por sociedad, hay %', n; end if;
  d := replace(d, '(p_sociedad_id is null or e.sociedad_id = p_sociedad_id)', '(p_sociedad_id is null or e.sociedad_id is null or e.sociedad_id = p_sociedad_id)');
  n := (length(d) - length(replace(d, '(p_sociedad_id is null or b.sociedad_id = p_sociedad_id)', ''))) / length('(p_sociedad_id is null or b.sociedad_id = p_sociedad_id)');
  if n <> 1 then raise exception 'conf_kpis: se esperaba 1 filtro de backlog por sociedad, hay %', n; end if;
  d := replace(d, '(p_sociedad_id is null or b.sociedad_id = p_sociedad_id)', '(p_sociedad_id is null or b.sociedad_id is null or b.sociedad_id = p_sociedad_id)');
  execute d;
end $$;

do $$ begin
  if position('e.sociedad_id is null' in pg_get_functiondef('public.conf_disponibilidad(text,uuid,date,date,text)'::regprocedure)) = 0
     or position('e.sociedad_id is null' in pg_get_functiondef('public.conf_kpis(text,uuid,date,date,text)'::regprocedure)) = 0
     or position('b.sociedad_id is null' in pg_get_functiondef('public.conf_kpis(text,uuid,date,date,text)'::regprocedure)) = 0 then
    raise exception 'Filtros de sociedad no actualizados';
  end if;
  if not has_function_privilege('authenticated','public.conf_kpis(text,uuid,date,date,text)','execute')
     or has_function_privilege('anon','public.conf_kpis(text,uuid,date,date,text)','execute') then
    raise exception 'Privilegios alterados';
  end if;
end $$;
