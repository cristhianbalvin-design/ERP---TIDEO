-- Tarifa y costeo por colaborador.
-- Guarda la tarifa calculada para costear mano de obra en OTs, tareos admin y reportes.

alter table public.personal_operativo
  add column if not exists metodo_pago text not null default 'mensual',
  add column if not exists monto_mensual numeric(14,2) default 0,
  add column if not exists horas_base_mes numeric(8,2) not null default 160,
  add column if not exists tarifa_hora numeric(14,2) default 0;

alter table public.personal_administrativo
  add column if not exists metodo_pago text not null default 'mensual',
  add column if not exists monto_mensual numeric(14,2) default 0,
  add column if not exists horas_base_mes numeric(8,2) not null default 160,
  add column if not exists tarifa_hora numeric(14,2) default 0;

alter table public.personal_operativo
  drop constraint if exists personal_operativo_metodo_pago_chk,
  add constraint personal_operativo_metodo_pago_chk
    check (metodo_pago in ('mensual', 'por_horas'));

alter table public.personal_administrativo
  drop constraint if exists personal_admin_metodo_pago_chk,
  add constraint personal_admin_metodo_pago_chk
    check (metodo_pago in ('mensual', 'por_horas'));

create or replace function public.calcular_tarifa_hora_colaborador()
returns trigger
language plpgsql
as $$
begin
  new.horas_base_mes := coalesce(nullif(new.horas_base_mes, 0), 160);
  new.monto_mensual := coalesce(new.monto_mensual, 0);
  new.tarifa_hora := round((new.monto_mensual / new.horas_base_mes)::numeric, 2);
  return new;
end;
$$;

drop trigger if exists trg_personal_operativo_tarifa_hora on public.personal_operativo;
create trigger trg_personal_operativo_tarifa_hora
before insert or update of monto_mensual, horas_base_mes, metodo_pago on public.personal_operativo
for each row execute function public.calcular_tarifa_hora_colaborador();

drop trigger if exists trg_personal_admin_tarifa_hora on public.personal_administrativo;
create trigger trg_personal_admin_tarifa_hora
before insert or update of monto_mensual, horas_base_mes, metodo_pago on public.personal_administrativo
for each row execute function public.calcular_tarifa_hora_colaborador();

update public.personal_operativo
set
  monto_mensual = coalesce(nullif(monto_mensual, 0), nullif(sueldo_base, 0), nullif(costo_hora_real, 0) * 160, 0),
  horas_base_mes = coalesce(nullif(horas_base_mes, 0), 160)
where tarifa_hora is null or tarifa_hora = 0;

update public.personal_administrativo
set
  monto_mensual = coalesce(nullif(monto_mensual, 0), remuneracion, sueldo_base, 0),
  horas_base_mes = coalesce(nullif(horas_base_mes, 0), 160)
where tarifa_hora is null or tarifa_hora = 0;

update public.personal_operativo
set tarifa_hora = round((coalesce(monto_mensual, 0) / coalesce(nullif(horas_base_mes, 0), 160))::numeric, 2);

update public.personal_administrativo
set tarifa_hora = round((coalesce(monto_mensual, 0) / coalesce(nullif(horas_base_mes, 0), 160))::numeric, 2);
