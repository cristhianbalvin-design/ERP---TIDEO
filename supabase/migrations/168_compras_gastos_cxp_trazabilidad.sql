-- TIDEO ERP - Trazabilidad CxP -> gasto devengado para Estado de Resultados.
-- Garantiza que las CxP de naturaleza gasto puedan vincularse con compras_gastos.

alter table public.compras_gastos
  add column if not exists estado_pago       text not null default 'pagado',
  add column if not exists referencia_pago   text,
  add column if not exists cxp_id            text,
  add column if not exists periodo_nomina_id text,
  add column if not exists personal_id       text,
  add column if not exists ot_vinc_id        text;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'cxp') then
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.compras_gastos'::regclass
        and conname = 'compras_gastos_cxp_id_fkey'
    ) then
      alter table public.compras_gastos
        add constraint compras_gastos_cxp_id_fkey
        foreign key (cxp_id) references public.cxp(id) on delete set null;
    end if;
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'periodos_nomina') then
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.compras_gastos'::regclass
        and conname = 'compras_gastos_periodo_nomina_id_fkey'
    ) then
      alter table public.compras_gastos
        add constraint compras_gastos_periodo_nomina_id_fkey
        foreign key (periodo_nomina_id) references public.periodos_nomina(id) on delete set null;
    end if;
  end if;
end $$;

create index if not exists idx_compras_gastos_cxp_id
  on public.compras_gastos(cxp_id);

create index if not exists idx_compras_gastos_periodo_nomina
  on public.compras_gastos(periodo_nomina_id);

select pg_notify('pgrst', 'reload schema');
