-- OT: facturable derivado del cargo financiero DBS.
-- Los cargos no facturables (Interno_Plataforma, Garantia_Fabrica, Reclamo_Rework) fuerzan facturable = false
-- al insertar o al cambiar cargo_financiero/facturable. Cliente_Contrato o cargo nulo no se tocan (edición manual permitida).
-- Incluye la corrección de las OTs existentes con cargo no facturable (6 filas al 2026-10-22, autorizado por Cristhian).

create or replace function public.ot_facturable_segun_cargo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cargo_financiero in ('Interno_Plataforma', 'Garantia_Fabrica', 'Reclamo_Rework') then
    new.facturable := false;
  end if;
  return new;
end;
$$;

comment on function public.ot_facturable_segun_cargo() is
  'Fuerza facturable = false en OTs con cargo financiero no facturable (Interno_Plataforma, Garantia_Fabrica, Reclamo_Rework).';

create trigger trg_ot_facturable_segun_cargo
  before insert or update of cargo_financiero, facturable on public.ordenes_trabajo
  for each row execute function public.ot_facturable_segun_cargo();

do $$
declare
  v_filas int;
  v_inconsistentes int;
begin
  update public.ordenes_trabajo
     set facturable = false
   where cargo_financiero in ('Interno_Plataforma', 'Garantia_Fabrica', 'Reclamo_Rework')
     and facturable is true;
  get diagnostics v_filas = row_count;
  if v_filas > 6 then
    raise exception 'Corrección inesperada: se esperaban como máximo 6 OTs, se actualizaron %', v_filas;
  end if;

  select count(*) into v_inconsistentes
    from public.ordenes_trabajo
   where cargo_financiero in ('Interno_Plataforma', 'Garantia_Fabrica', 'Reclamo_Rework')
     and facturable is true;
  if v_inconsistentes <> 0 then
    raise exception 'Quedan % OTs no facturables marcadas como facturables', v_inconsistentes;
  end if;
end $$;
