-- Configuración de empresa: datos institucionales y condiciones comerciales por defecto.
-- Una fila por empresa. Se usa para pre-llenar cotizaciones, facturas y documentos PDF.

create table if not exists public.empresa_config (
  empresa_id    text primary key references public.empresas(id) on delete cascade,

  -- Identidad
  razon_social  text,
  ruc           text,
  email_comercial text,
  sitio_web     text,
  direccion     text,

  -- Firmante
  firmante      text,
  cargo_firmante text,

  -- Imágenes (subidas a Storage)
  logo_url      text,
  logo_path     text,
  firma_url     text,
  firma_path    text,

  -- Condiciones comerciales por defecto
  cond_forma_pago       text,
  cond_validez          text,
  cond_penalidad        text,
  cond_inicio_proyecto  text,
  cond_alcance          text,
  cond_integraciones    text,
  cond_confidencialidad text,
  cond_glosa_factura    text,

  updated_at    timestamptz default now()
);

-- RLS: solo usuarios autenticados de la misma empresa pueden ver/editar
alter table public.empresa_config enable row level security;

create policy "empresa_config_select" on public.empresa_config
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy "empresa_config_write" on public.empresa_config
  for all
  using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- Bucket de Storage para logos y firmas de empresa (público para que los PDFs accedan a las imágenes)
insert into storage.buckets (id, name, public)
  values ('empresa-assets', 'empresa-assets', true)
  on conflict (id) do nothing;

create policy "empresa_assets_read" on storage.objects
  for select using (bucket_id = 'empresa-assets');

create policy "empresa_assets_write" on storage.objects
  for insert with check (bucket_id = 'empresa-assets' and auth.role() = 'authenticated');

create policy "empresa_assets_update" on storage.objects
  for update using (bucket_id = 'empresa-assets' and auth.role() = 'authenticated');

select pg_notify('pgrst', 'reload schema');
