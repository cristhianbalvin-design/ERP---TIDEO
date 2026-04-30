-- TIDEO ERP - Campos comerciales para flujo lead -> oportunidad.
-- Ejecutar en proyectos existentes antes de probar conversion CRM desde frontend.

alter table public.leads add column if not exists cargo text;
alter table public.leads add column if not exists urgencia text default 'media';
alter table public.leads add column if not exists registrado_desde text default 'backoffice';
alter table public.leads add column if not exists responsable text;
alter table public.leads add column if not exists campana text;
alter table public.leads add column if not exists dias_sin_actividad integer default 0;
alter table public.leads add column if not exists fecha_creacion date default current_date;
alter table public.leads add column if not exists motivo_descarte text;

alter table public.oportunidades add column if not exists contacto_id text references public.contactos(id);
alter table public.oportunidades add column if not exists servicio_interes text;
alter table public.oportunidades add column if not exists fecha_cierre_real date;
alter table public.oportunidades add column if not exists fecha_creacion date default current_date;
alter table public.oportunidades add column if not exists forecast_ponderado numeric(14,2) default 0;
alter table public.oportunidades add column if not exists fuente text;
alter table public.oportunidades add column if not exists responsable text;
alter table public.oportunidades add column if not exists notas text;
alter table public.oportunidades add column if not exists competidor text;
