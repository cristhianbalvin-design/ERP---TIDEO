-- Permite eliminar cuentas CRM y conserva las entidades comerciales vinculadas
-- sin cuenta asociada. Los registros financieros no anulables (por ejemplo CxC)
-- mantienen sus restricciones y bloquean la eliminación con un error explícito.

drop policy if exists crm_cuentas_delete on public.cuentas;
create policy crm_cuentas_delete on public.cuentas
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'cuentas', 'editar')
  );

-- Las FK históricas del CRM se crearon sin acción ON DELETE. Se ajustan las
-- referencias anulables a SET NULL para que contactos, oportunidades y demás
-- documentos comerciales puedan permanecer como indica la interfaz.
do $$
declare
  fk record;
begin
  for fk in
    select
      con.conname,
      con.conrelid::regclass as tabla,
      att.attname as columna
    from pg_constraint con
    join lateral unnest(con.conkey) as key(attnum) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
    where con.contype = 'f'
      and con.confrelid = 'public.cuentas'::regclass
      and array_length(con.conkey, 1) = 1
      and not att.attnotnull
      and con.confdeltype <> 'n'
  loop
    execute format('alter table %s drop constraint %I', fk.tabla, fk.conname);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references public.cuentas(id) on delete set null',
      fk.tabla, fk.conname, fk.columna
    );
  end loop;
end $$;

select pg_notify('pgrst', 'reload schema');
