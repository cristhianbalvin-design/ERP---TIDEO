-- Demo PRUEBA · 06 Rellena el resto de tablas de PRUEBA con el motor de clonado, en orden de dependencias.
-- Cada tabla va en su propio subbloque: si una falla se reporta y no afecta a las demás.
create or replace function demo_seed.clonar_todo(p_tablas text[]) returns table(tabla text, filas int, error text)
language plpgsql as $$
declare
  pend text[] := p_tablas; t text; n int; listo bool; err text; i int;
begin
  set local session_replication_role = replica;
  create temp table if not exists _rep(tabla text, filas int, error text) on commit drop;
  for i in 1..30 loop
    foreach t in array pend loop
      select not exists (
        select 1 from pg_constraint con join pg_class pa on pa.oid=con.confrelid
        where con.conrelid=('public.'||quote_ident(t))::regclass and con.contype='f'
          and pa.relname::text = any(pend) and pa.relname::text <> t) into listo;
      if not listo and i < 25 then continue; end if;
      begin
        execute format('select count(*) from respaldo_prueba_20261108.%I', t) into n;
        n := demo_seed.clonar(t, n);
        insert into _rep values (t, n, null);
      exception when others then
        get stacked diagnostics err = message_text;
        insert into _rep values (t, 0, left(err, 220));
      end;
      pend := array_remove(pend, t);
    end loop;
    exit when coalesce(array_length(pend,1),0) = 0;
  end loop;
  return query select r.tabla, r.filas, r.error from _rep r order by r.error nulls first, r.tabla;
end $$;
