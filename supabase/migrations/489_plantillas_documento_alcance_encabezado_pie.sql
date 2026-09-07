-- 489 · Alcance por página de encabezado y pie del constructor documental.
-- El COMMIT de producción queda bajo control manual.

alter table public.plantillas_documento_bloques
  add column encabezado_alcance text not null default 'todas'
    constraint plantillas_documento_bloques_encabezado_alcance_check
    check (encabezado_alcance in ('todas', 'primera')),
  add column pie_alcance text not null default 'todas'
    constraint plantillas_documento_bloques_pie_alcance_check
    check (pie_alcance in ('todas', 'primera'));

select pg_notify('pgrst', 'reload schema');
