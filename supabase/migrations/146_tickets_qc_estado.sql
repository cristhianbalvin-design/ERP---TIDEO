-- Actualizar el constraint del estado del ticket para permitir 'qc'
alter table public.tickets drop constraint if exists tickets_estado_check;
alter table public.tickets add constraint tickets_estado_check check (estado in ('abierto', 'en_proceso', 'qc', 'resuelto', 'cerrado'));
