-- TIDEO ERP - Modelo mixto de posiciones: modo_gestion por cargo
--
-- Por defecto cada persona tiene su propia Posicion individual (headcount 1:1). Algunos cargos
-- de alta rotacion (ej. Tecnico Operativo) necesitan que varias personas compartan la MISMA
-- Posicion sin generar duplicados -- eso se marca aqui, cargo por cargo, a mano.
--
-- No se migra ningun cargo existente a 'compartido' automaticamente: todos quedan en
-- 'individual' (el default) hasta que Cristhian lo decida explicitamente en Maestros -> Cargos.

alter table public.cargos_empresa
  add column if not exists modo_gestion text not null default 'individual'
  check (modo_gestion in ('individual', 'compartido'));

comment on column public.cargos_empresa.modo_gestion is
  'individual: cada persona tiene su propia Posicion (default). compartido: varias personas pueden ocupar la MISMA Posicion de este cargo sin duplicarla (ver crearPosicion en PosicionSelector.jsx).';

select pg_notify('pgrst', 'reload schema');
