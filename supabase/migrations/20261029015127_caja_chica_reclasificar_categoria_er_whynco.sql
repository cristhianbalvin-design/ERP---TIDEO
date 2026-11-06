-- Reclasifica la categoria del ER de egresos de Caja Chica de WHYNCO (emp_20513453711).
-- Antes todos quedaban en 'Administrativos' por defecto porque el wizard abria en el paso 2 sin tipo de gasto.
-- Alcance: solo WHYNCO, solo PEN, solo conceptos con regla clara. No toca otros tenants.
create table if not exists public.caja_chica_reclasificacion_er (
  id bigserial primary key,
  empresa_id text not null,
  caja_chica_id text not null,
  gasto_id text,
  categoria_anterior text,
  categoria_nueva text not null,
  regla text not null,
  aplicado_en timestamptz not null default now()
);
alter table public.caja_chica_reclasificacion_er enable row level security;

do $$
declare
  v_emp constant text := 'emp_20513453711';
  v_esperado constant int := 102;
  v_n int;
  v_cc int;
  v_g int;
begin
  create temp table _reclas on commit drop as
  with m as (
    select c.id, c.gasto_id, c.categoria actual,
    case
     when lower(c.concepto) ~ 'epps|zapato de seguridad' then 'SSOMA operativo|ssoma'
     when lower(c.concepto) ~ 'facebook' then 'Comerciales|marketing'
     when lower(c.concepto) ~ 'reclutamiento' then 'Cargas sociales|reclutamiento'
     when lower(c.concepto) ~ 'internet|entel|servicio de agua|hoja bond|vigencia de poder|cinta y bond|cinta y hoja|tramite' then 'Administrativos|servicio_admin'
     when lower(c.concepto) ~ 'casa del soldador|soldamundo|pariguela|parihuela' then 'Materiales|materiales'
     when lower(c.concepto) ~ 'sueldo|planilla|liquidacion|horas extras|dominical|bono|adelanto' then 'Planilla|labor_planilla'
     when lower(c.concepto) ~ 'proyecto|soldador|ayudante|walter|jhon|yhon|franklin|frank |electrico|rodil|chamos|pago ope|gabriel|conductor' then 'Mano de obra|labor_proyecto'
     when lower(c.concepto) ~ 'servicio de corte|plegado|tronzado|amoladora|visita tecnica|am service' then 'Servicios terceros|servicio_tercero'
     when lower(c.concepto) ~ 'gate gourmet|altamin|compras y recojo|santa anita|sanvidk|motorizado|delivery|peaje|cochera|combustible|cobustible|petroleo|gasolina|servicio de transporte' then 'Logistica|movilidad_operativa'
     when lower(c.concepto) ~ 'pasaj|taxi|indrive' then 'Administrativos|movilidad_personal'
     when lower(c.concepto) ~ 'detergente|deterjente|esponja' then 'Costos indirectos de taller|limpieza'
     when lower(c.concepto) ~ 'menu|cena|comida|platos|alimentacion|alimentación|leche|torta' then 'Administrativos|alimentacion'
     when lower(c.concepto) ~ '^(barra|plancha|fierro|sellos|acople|oxigeno|tobera|rele |conector|caja conduit|palancas|carton|mezcla|thinner|thiner|cinta maske)|barra de acero|plancha 304|fierro charles|thinner op|thinner comerical|sellos op|acople op|vega inversiones|ecometal|ruconsa|corporacion industrial|soluciones industriales|thr company|ortega alloy|import richard' then 'Materiales|materiales'
    end r
    from public.caja_chica c
    where c.empresa_id = v_emp and c.moneda = 'PEN'
      and lower(c.concepto) !~ 'sdfsdfsf|compra dolares|devolucion|traspaso de caja'
  )
  select id, gasto_id, actual, split_part(r,'|',1) nueva, split_part(r,'|',2) regla
  from m where r is not null and actual is distinct from split_part(r,'|',1);

  select count(*) into v_n from _reclas;
  if v_n <> v_esperado then
    raise exception 'RECLAS_CONTEO: se esperaban % filas y hay %', v_esperado, v_n;
  end if;

  insert into public.caja_chica_reclasificacion_er (empresa_id, caja_chica_id, gasto_id, categoria_anterior, categoria_nueva, regla)
  select v_emp, id, gasto_id, actual, nueva, regla from _reclas;

  update public.caja_chica c set categoria = t.nueva
  from _reclas t where c.id = t.id and c.empresa_id = v_emp;
  get diagnostics v_cc = row_count;

  update public.compras_gastos g set categoria = t.nueva, updated_at = now()
  from _reclas t where g.id = t.gasto_id and g.empresa_id = v_emp;
  get diagnostics v_g = row_count;

  if v_cc <> v_esperado or v_g <> v_esperado then
    raise exception 'RECLAS_UPDATE: caja_chica % y compras_gastos % (esperado %)', v_cc, v_g, v_esperado;
  end if;
end $$;
