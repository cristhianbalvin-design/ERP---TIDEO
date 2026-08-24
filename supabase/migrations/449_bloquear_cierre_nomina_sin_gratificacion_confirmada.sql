-- Impide cerrar un periodo de gratificacion sin la confirmacion manual
-- del pago real. La regla se aplica en base de datos para cubrir todo caller,
-- incluidos los UPDATE directos que no pasan por la UI.

create or replace function public._bloquear_cierre_sin_gratificacion_confirmada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Solo protege la transicion efectiva hacia cerrado. No interviene en
  -- actualizaciones que no incluyen estado ni en transiciones a otros estados.
  if new.estado = 'cerrado'
     and old.estado is distinct from 'cerrado'
     and extract(month from new.fecha_pago) in (7, 12)
     and (new.quincena is null or new.quincena = 1)
     and new.gratificacion_real_confirmada is not true then
    raise exception 'Debes confirmar la gratificacion real antes de cerrar este periodo.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bloquear_cierre_nomina_sin_gratificacion_confirmada
  on public.periodos_nomina;

create trigger trg_bloquear_cierre_nomina_sin_gratificacion_confirmada
before update of estado on public.periodos_nomina
for each row
execute function public._bloquear_cierre_sin_gratificacion_confirmada();
