-- Aportes adicionales para fondos de caja chica.
-- Solo un aporte de origen bancario genera Tesorería.

create table if not exists public.caja_chica_aportes (
  id                  text primary key default ('cca_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id          text not null references public.empresas(id),
  fondo_id            text not null references public.caja_chica_fondos(id) on delete restrict,
  fecha               date not null default current_date,
  monto               numeric(14,2) not null check (monto > 0),
  moneda              text not null default 'PEN',
  tipo_origen         text not null check (tipo_origen in ('cuenta_bancaria', 'aporte_directo', 'prestamo_tercero')),
  cuenta_bancaria_id  text references public.cuentas_bancarias(id) on delete set null,
  aportante_id        text references public.usuarios(id) on delete set null,
  tercero_nombre      text,
  tercero_documento   text,
  notas               text,
  creado_por          text references public.usuarios(id) on delete set null,
  creado_en           timestamptz not null default now(),
  estado              text not null default 'registrado' check (estado in ('registrado', 'anulado')),
  constraint caja_chica_aportes_origen_coherente check (
    (
      tipo_origen = 'cuenta_bancaria'
      and cuenta_bancaria_id is not null
      and aportante_id is null
      and tercero_nombre is null
      and tercero_documento is null
    )
    or (
      tipo_origen = 'aporte_directo'
      and cuenta_bancaria_id is null
      and aportante_id is not null
      and tercero_nombre is null
      and tercero_documento is null
    )
    or (
      tipo_origen = 'prestamo_tercero'
      and cuenta_bancaria_id is null
      and aportante_id is null
      and nullif(trim(tercero_nombre), '') is not null
    )
  )
);

create index if not exists idx_caja_chica_aportes_fondo_fecha
  on public.caja_chica_aportes(empresa_id, fondo_id, fecha desc);

alter table public.caja_chica_aportes enable row level security;

drop policy if exists cc_aportes_select on public.caja_chica_aportes;
drop policy if exists cc_aportes_insert on public.caja_chica_aportes;

create policy cc_aportes_select on public.caja_chica_aportes
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'caja', 'ver')
      or public.usuario_responsable_fondo_caja(fondo_id)
    )
  );

create policy cc_aportes_insert on public.caja_chica_aportes
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'caja', 'editar')
  );

select pg_notify('pgrst', 'reload schema');
