-- Columnas para adjuntar el PDF y ZIP de la factura directamente en el registro.
alter table public.facturas
  add column if not exists archivo_pdf_url  text,
  add column if not exists archivo_zip_url  text;

select pg_notify('pgrst', 'reload schema');
