-- TIDEO ERP - Overrides opcionales de politica de nomina por sociedad.
-- empresa_config conserva los valores por defecto del tenant.

alter table public.sociedades
  add column if not exists regimen_laboral text,
  add column if not exists pct_quincena_1 numeric(5,2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sociedades'::regclass
      and conname = 'sociedades_regimen_laboral_check'
  ) then
    alter table public.sociedades
      add constraint sociedades_regimen_laboral_check check (
        regimen_laboral in ('general', 'pequena_empresa', 'microempresa')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sociedades'::regclass
      and conname = 'sociedades_pct_quincena_1_check'
  ) then
    alter table public.sociedades
      add constraint sociedades_pct_quincena_1_check check (
        pct_quincena_1 >= 1 and pct_quincena_1 <= 99
      );
  end if;
end
$$;

comment on column public.sociedades.regimen_laboral is
  'Override opcional del regimen laboral para nomina. NULL hereda empresa_config.regimen_laboral_empresa.';

comment on column public.sociedades.pct_quincena_1 is
  'Override opcional del porcentaje de primera quincena. NULL hereda empresa_config.pct_quincena_1.';

select pg_notify('pgrst', 'reload schema');
