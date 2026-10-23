-- Datos de prueba del Planner para la sociedad PRUEBA del tenant de pruebas GRUPO PRUEBA (emp_2000000000).
-- Solo toca tablas del Planner (bahías, puestos, máquinas, asignaciones y ocupaciones). Idempotente por código.
DO $$
DECLARE
  v_emp text := 'emp_2000000000';
  v_soc uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  b01 uuid; b02 uuid; b03 uuid; b04 uuid; b05 uuid; b06 uuid;
  p_b02_1 uuid; p_b03_1 uuid; p_cnc uuid; p_conv uuid; p_b06_1 uuid;
  m_weld uuid;
  v_n int;
BEGIN
  IF (SELECT razon_social FROM empresas WHERE id = v_emp) IS DISTINCT FROM 'GRUPO PRUEBA' THEN
    RAISE EXCEPTION 'El tenant % no es el de pruebas', v_emp;
  END IF;
  IF EXISTS (SELECT 1 FROM planner_bahias WHERE sociedad_id = v_soc AND codigo = 'B03') THEN
    RAISE NOTICE 'Semilla ya aplicada'; RETURN;
  END IF;

  SELECT id INTO b01 FROM planner_bahias WHERE sociedad_id = v_soc AND codigo = 'B01';
  SELECT id INTO b02 FROM planner_bahias WHERE sociedad_id = v_soc AND codigo = 'B02';
  UPDATE planner_bahias SET categoria = 'pesada' WHERE id = b01;
  UPDATE planner_bahias SET categoria = 'sold' WHERE id = b02;

  INSERT INTO planner_bahias (empresa_id, sociedad_id, codigo, nombre, categoria, orden, activa) VALUES
    (v_emp, v_soc, 'B03', 'Banco hidráulico', 'hidr', 3, true) RETURNING id INTO b03;
  INSERT INTO planner_bahias (empresa_id, sociedad_id, codigo, nombre, categoria, orden, activa) VALUES
    (v_emp, v_soc, 'B04', 'Zona de mecanizado', 'mec', 4, true) RETURNING id INTO b04;
  INSERT INTO planner_bahias (empresa_id, sociedad_id, codigo, nombre, categoria, orden, activa) VALUES
    (v_emp, v_soc, 'B05', 'Cromado', 'crom', 5, true) RETURNING id INTO b05;
  INSERT INTO planner_bahias (empresa_id, sociedad_id, codigo, nombre, categoria, orden, activa) VALUES
    (v_emp, v_soc, 'B06', 'Bahía general', 'general', 6, true) RETURNING id INTO b06;

  INSERT INTO planner_puestos (empresa_id, bahia_id, codigo, nombre, capacidad, orden, activo) VALUES
    (v_emp, b02, 'B02-P1', 'Puesto 1', 1, 1, true) RETURNING id INTO p_b02_1;
  INSERT INTO planner_puestos (empresa_id, bahia_id, codigo, nombre, capacidad, orden, activo) VALUES
    (v_emp, b02, 'B02-P2', 'Puesto 2', 1, 2, true);
  INSERT INTO planner_puestos (empresa_id, bahia_id, codigo, nombre, capacidad, orden, activo) VALUES
    (v_emp, b03, 'B03-P1', 'Banco 1', 1, 1, true) RETURNING id INTO p_b03_1;
  INSERT INTO planner_puestos (empresa_id, bahia_id, codigo, nombre, capacidad, orden, activo) VALUES
    (v_emp, b03, 'B03-P2', 'Banco 2', 1, 2, true);
  INSERT INTO planner_puestos (empresa_id, bahia_id, codigo, nombre, capacidad, orden, activo) VALUES
    (v_emp, b04, 'B04-P1', 'Torno CNC', 1, 1, true) RETURNING id INTO p_cnc;
  INSERT INTO planner_puestos (empresa_id, bahia_id, codigo, nombre, capacidad, orden, activo) VALUES
    (v_emp, b04, 'B04-P2', 'Torno convencional', 1, 2, true) RETURNING id INTO p_conv;
  INSERT INTO planner_puestos (empresa_id, bahia_id, codigo, nombre, capacidad, orden, activo) VALUES
    (v_emp, b05, 'B05-P1', 'Tanque 1', 1, 1, true);
  INSERT INTO planner_puestos (empresa_id, bahia_id, codigo, nombre, capacidad, orden, activo) VALUES
    (v_emp, b06, 'B06-P1', 'Puesto 1', 1, 1, true) RETURNING id INTO p_b06_1;
  INSERT INTO planner_puestos (empresa_id, bahia_id, codigo, nombre, capacidad, orden, activo) VALUES
    (v_emp, b06, 'B06-P2', 'Puesto 2', 1, 2, true);

  UPDATE planner_maquinas_taller SET bahia_id = b04, puesto_id = p_cnc
   WHERE sociedad_id = v_soc AND tipo_clave = 'cnc';
  INSERT INTO planner_maquinas_taller (empresa_id, sociedad_id, tipo_clave, nombre, bahia_id, puesto_id, horas_dia, estado) VALUES
    (v_emp, v_soc, 'crane', 'Grúa puente 20 t', b01, NULL, 8, 'disponible'),
    (v_emp, v_soc, 'lathe', 'Torno convencional', b04, p_conv, 8, 'disponible'),
    (v_emp, v_soc, 'bench', 'Banco de pruebas hidráulico', b03, NULL, 8, 'disponible'),
    (v_emp, v_soc, 'press', 'Prensa hidráulica 100 t', b03, NULL, 8, 'disponible');
  INSERT INTO planner_maquinas_taller (empresa_id, sociedad_id, tipo_clave, nombre, bahia_id, puesto_id, horas_dia, estado) VALUES
    (v_emp, v_soc, 'weld', 'Equipo de soldadura', b02, p_b02_1, 8, 'disponible') RETURNING id INTO m_weld;

  -- OT-26-0838 · Armado de cilindro (16 h): soldadora Zoe, puesto B02-P1, con equipo de soldadura.
  INSERT INTO planner_asignaciones (empresa_id, sociedad_id, ot_id, tecnico_id, puesto_id, tarea_id, fecha, horas_estimadas, estado) VALUES
    (v_emp, v_soc, 'ot_844c1ba9-bb5d-44d3-8f4d-9264a5d4214f', 'pop_1783959044972', p_b02_1, 'dc545313-1f0c-49f2-b8d2-99ca9e7f09d9', '2026-10-15', 8, 'programado'),
    (v_emp, v_soc, 'ot_844c1ba9-bb5d-44d3-8f4d-9264a5d4214f', 'pop_1783959044972', p_b02_1, 'dc545313-1f0c-49f2-b8d2-99ca9e7f09d9', '2026-10-16', 8, 'programado');
  INSERT INTO planner_asignaciones_equipo (empresa_id, sociedad_id, ot_id, maquina_id, tarea_id, fecha, horas_estimadas, estado) VALUES
    (v_emp, v_soc, 'ot_844c1ba9-bb5d-44d3-8f4d-9264a5d4214f', m_weld, 'dc545313-1f0c-49f2-b8d2-99ca9e7f09d9', '2026-10-15', 6, 'programado'),
    (v_emp, v_soc, 'ot_844c1ba9-bb5d-44d3-8f4d-9264a5d4214f', m_weld, 'dc545313-1f0c-49f2-b8d2-99ca9e7f09d9', '2026-10-16', 6, 'programado');
  -- OT-26-0455 · Mantenimiento preventivo (12 h): electricista Juan, Bahía general P1.
  INSERT INTO planner_asignaciones (empresa_id, sociedad_id, ot_id, tecnico_id, puesto_id, tarea_id, fecha, horas_estimadas, estado) VALUES
    (v_emp, v_soc, 'ot_13d96174-428e-4182-b545-6f0aeffa3cc6', 'pop_1783959070510', p_b06_1, '32db2cba-6818-4f98-a7dd-978c4d926471', '2026-10-19', 6, 'programado'),
    (v_emp, v_soc, 'ot_13d96174-428e-4182-b545-6f0aeffa3cc6', 'pop_1783959070510', p_b06_1, '32db2cba-6818-4f98-a7dd-978c4d926471', '2026-10-20', 6, 'programado');

  PERFORM planner_sincronizar_ocupaciones_ot('ot_844c1ba9-bb5d-44d3-8f4d-9264a5d4214f');
  PERFORM planner_sincronizar_ocupaciones_ot('ot_13d96174-428e-4182-b545-6f0aeffa3cc6');

  SELECT count(*) INTO v_n FROM planner_bahias WHERE sociedad_id = v_soc AND activa;
  IF v_n <> 6 THEN RAISE EXCEPTION 'Se esperaban 6 bahías y hay %', v_n; END IF;
  SELECT count(*) INTO v_n FROM planner_ocupaciones WHERE sociedad_id = v_soc AND estado <> 'cancelado';
  IF v_n < 3 THEN RAISE EXCEPTION 'Se esperaban al menos 3 ocupaciones y hay %', v_n; END IF;
END $$;
