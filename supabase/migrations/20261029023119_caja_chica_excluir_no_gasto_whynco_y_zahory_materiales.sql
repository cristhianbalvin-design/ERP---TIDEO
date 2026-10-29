-- (1) WHYNCO (emp_20513453711): 4 egresos de Caja Chica que no son gasto del ER salen del ER.
--     El movimiento de caja_chica se conserva, el saldo del fondo no cambia.
--     gasto_r4877mlpnqr  Compra dolares                    S/ 4,400.00 (cambio de moneda)
--     gasto_fdxs1unk237  devolucion de prestado hecho     S/ 2,000.00 (pago de prestamo)
--     gasto_h3pkjz4t19a  DEVOLUCION PRESTAMOD A EDINSON   S/   200.00 (pago de prestamo)
--     gasto_wjp28ayge1b  traspaso de caja sobrante        S/    37.94 (transferencia entre cajas)
-- (2) C&J ZAHORY (emp_20541435833): 2 egresos huerfanos "Materiales" pasan a 'Materiales e insumos'
--     (nombre exacto del catalogo ER de ese tenant).
do $$
declare
  v_n int;
  v_cc int;
begin
  update public.compras_gastos
     set excluir_de_er = true, updated_at = now()
   where empresa_id = 'emp_20513453711'
     and id in ('gasto_r4877mlpnqr','gasto_fdxs1unk237','gasto_h3pkjz4t19a','gasto_wjp28ayge1b')
     and coalesce(excluir_de_er,false) = false;
  get diagnostics v_n = row_count;
  if v_n <> 4 then
    raise exception 'EXCLUIR_ER: se esperaban 4 filas y se actualizaron %', v_n;
  end if;

  insert into public.caja_chica_reclasificacion_er (empresa_id, caja_chica_id, gasto_id, categoria_anterior, categoria_nueva, regla)
  select c.empresa_id, c.id, c.gasto_id, c.categoria, 'Materiales e insumos', 'manual_usuario'
    from public.caja_chica c
   where c.empresa_id = 'emp_20541435833'
     and c.id in ('cc_1hkp9cz62lg','cc_lz54ggj848')
     and c.categoria is distinct from 'Materiales e insumos';

  update public.caja_chica
     set categoria = 'Materiales e insumos'
   where empresa_id = 'emp_20541435833'
     and id in ('cc_1hkp9cz62lg','cc_lz54ggj848')
     and categoria is distinct from 'Materiales e insumos';
  get diagnostics v_cc = row_count;
  if v_cc <> 2 then
    raise exception 'ZAHORY_MATERIALES: se esperaban 2 filas y se actualizaron %', v_cc;
  end if;
end $$;
