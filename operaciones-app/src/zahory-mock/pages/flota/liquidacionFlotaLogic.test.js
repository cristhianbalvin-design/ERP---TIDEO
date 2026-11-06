import { describe, expect, it } from "vitest";
import {
  armarKpiPartes,
  atribucionParada,
  etiquetaHistorialLiquidacion,
  estadoDia,
  formatoMoneda,
  formatoPeriodo,
  horasOperadas,
  validarParte,
} from "./liquidacionFlotaLogic.js";

const base = {
  contrato_equipo_id: "ce-1",
  fecha: "2026-10-10",
  turno: "dia",
  sin_operacion: false,
  horas_programadas: 12,
  horometro_inicio: 100,
  horometro_fin: 108,
  paradas: [],
  vb_cliente: "Ana",
};
describe("liquidacionFlotaLogic", () => {
  it("etiqueta movimientos del historial y agrega los motivos de devolución y anulación", () => {
    expect(etiquetaHistorialLiquidacion({ accion: "creada" })).toBe("Liquidación creada");
    expect(etiquetaHistorialLiquidacion({ accion: "enviada" })).toBe("Enviada a revisión");
    expect(etiquetaHistorialLiquidacion({ accion: "devuelta", detalle: { motivo: "Falta evidencia" } }))
      .toBe("Devuelta · Falta evidencia");
    expect(etiquetaHistorialLiquidacion({ accion: "aprobada" })).toBe("Aprobada");
    expect(etiquetaHistorialLiquidacion({ accion: "anulada", detalle: { motivo: "Duplicada" } }))
      .toBe("Anulada · Duplicada");
    expect(etiquetaHistorialLiquidacion({ accion: "registrado" })).toBe("Parte registrado");
    expect(etiquetaHistorialLiquidacion({ accion: "actualizado" })).toBe("Parte actualizado");
    expect(etiquetaHistorialLiquidacion({ accion: "anulado", detalle: { motivo: "Error" } }))
      .toBe("Parte anulado · Error");
  });
  it("formatea monedas y periodos para la lista y el detalle", () => {
    expect(formatoMoneda(9100, "USD")).toBe("US$ 9,100.00");
    expect(formatoMoneda(325, "PEN")).toBe("S/ 325.00");
    expect(formatoPeriodo("2026-10-01")).toBe("oct. 2026");
  });
  it("calcula atribución según los códigos del RPC", () => {
    expect(atribucionParada("falla_mecanica")).toBe("proveedor");
    expect(atribucionParada("sin_frente")).toBe("cliente");
    expect(atribucionParada("clima")).toBe("neutral");
    expect(atribucionParada("desconocida")).toBeNull();
  });
  it("calcula horas operadas y el caso sin operación", () => {
    expect(horasOperadas(100, 108)).toBe(8);
    expect(horasOperadas(3366.8, 3373.1)).toBe(6.3);
    expect(horasOperadas(null, null, true)).toBe(0);
  });
  it("valida todos los campos y relaciones de horómetro y paradas", () => {
    expect(validarParte(base)).toEqual({});
    const errores = validarParte(
      {
        ...base,
        fecha: "2026-11-02",
        horas_programadas: 25,
        horometro_inicio: 90,
        horometro_fin: 130,
        paradas: [{ horas: 2, causa: "x" }],
        vb_cliente: "",
      },
      { hoy: "2026-11-01", anterior: 95, siguiente: 120 },
    );
    expect(errores.fecha).toMatch(/futuros/);
    expect(errores.horas_programadas).toBeTruthy();
    expect(errores.horometro_inicio).toBeTruthy();
    expect(errores.horometro_fin).toBeTruthy();
    expect(errores.parada_0).toBeTruthy();
    expect(errores.vb_cliente).toBeTruthy();
  });
  it("valida el modo sin operación y partes faltantes por cierre", () => {
    expect(
      validarParte({
        ...base,
        sin_operacion: true,
        horas_programadas: 0,
        horometro_inicio: null,
        horometro_fin: null,
        vb_cliente: "",
      }),
    ).toEqual({});
    expect(validarParte(base, { mesBloqueado: true }).mes).toMatch(/revisión o aprobado/);
  });
  it("determina estados de calendario y arma KPI sin incluir datos sintéticos", () => {
    expect(
      estadoDia({ fecha: "2026-10-01", hoy: "2026-10-20", parte: { estado: "registrado", horas_parada_proveedor: 1 } }),
    ).toBe("proveedor");
    expect(
      estadoDia({ fecha: "2026-10-01", hoy: "2026-10-20", parte: { estado: "registrado", sin_operacion: true } }),
    ).toBe("sin_operacion");
    expect(estadoDia({ fecha: "2026-10-01", hoy: "2026-10-20" })).toBe("falta");
    expect(estadoDia({ fecha: "2026-10-20", hoy: "2026-10-20" })).toBe("pendiente");
    expect(estadoDia({ fecha: "2026-10-21", hoy: "2026-10-20" })).toBe("futuro");
    expect(estadoDia({ fecha: "2026-10-21", hoy: "2026-10-20", inicio: "2026-10-22" })).toBe("fuera");
    expect(
      armarKpiPartes(
        [{ horas_programadas: 10, horas_operadas: 8, horas_parada_proveedor: 1, horas_parada_cliente: 2 }],
        [1, 2],
      ),
    ).toEqual({ programadas: 10, operadas: 8, proveedor: 1, cliente: 2, faltantes: 2 });
  });
});
