-- Agrega columna participantes_admin a ordenes_trabajo
-- Array JSONB de objetos: { personal_id, personal_nombre, horas_estimadas }

alter table public.ordenes_trabajo
  add column if not exists participantes_admin jsonb not null default '[]'::jsonb;

select pg_notify('pgrst', 'reload schema');
