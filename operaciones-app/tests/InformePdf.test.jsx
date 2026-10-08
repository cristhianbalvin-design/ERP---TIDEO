import React from 'react';
import { create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-pdf/renderer', async () => {
  const React = await import('react');
  const primitive = name => ({ children, ...props }) => React.createElement(name, props, children);
  return {
    Document: primitive('Document'), Page: primitive('Page'), View: primitive('View'),
    Text: primitive('Text'), Image: primitive('Image'), StyleSheet: { create: styles => styles },
  };
});
vi.mock('../src/services/informePdfImagenes.js', () => ({ prepararImagenesInforme: vi.fn() }));
import InformePdf from '../src/zahory-mock/pages/InformePdf.jsx';

const completeSnapshot = {
  version: 4,
  emitido_en: '2026-10-07T12:00:00Z',
  cabecera: { numero_recepcion: 'RAC-42', activo_nombre: 'Excavadora', activo_codigo: 'EX-4', cliente_razon_social: 'Cliente Uno', numero_serie: 'SN-44', fecha_recepcion: '2026-10-01', numero_caso: 'CAS-8', horometro: 123, tipo: 'Mantenimiento' },
  empresa: { razon_social: 'Tideo Servicios', ruc: '20123456789' },
  resumen: { P1: 1, P2: 2, P3: 0, P4: 0, conformes: 1 },
  hallazgos: [{ hallazgo_id: 'h1', componente_parte: 'Bomba', prioridad: 'P1', tipo_dano_etiqueta: 'Desgaste', causa_probable_etiqueta: 'Lubricación', condicion_etiqueta: 'Fuera de tolerancia', riesgo_etiqueta: 'Detener equipo', accion_recomendada_etiqueta: 'Reemplazar', atribuible_a_etiqueta: 'Operación', observacion: 'Vibración', lineas: [{ tarea_nombre: 'Revisar sello' }], fotos: [{ ruta_storage: 'foto-1', leyenda: 'Vista frontal', orden: 1 }] }],
  mediciones: [{ hallazgo_id: 'h1', parametro: 'Presión', unidad: 'bar', nominal: 10, minimo: 9, maximo: 11, medido: 8, resultado: 'Bajo' }],
  tareas_repuestos: [{ actividad_nombre: 'Reparación', tarea_nombre: 'Cambiar sello', hallazgo: 'Bomba', cargo_nombre: 'Técnico', horas_mano_obra: 2, horas_maquina: 1, materiales: [{ codigo: 'SEL-1', descripcion: 'Sello', cantidad: 1, unidad: 'und' }] }],
  conclusion: 'Requiere reparación prioritaria.',
  emisor: { nombre: 'Ana Pérez', cargo: 'Jefa técnica' },
};

const minimalSnapshot = {
  version: 1, emitido_en: null,
  cabecera: { numero_recepcion: 'RAC-MIN', horometro: null, activo_nombre: null, cliente_razon_social: null, numero_serie: null, fecha_recepcion: null, numero_caso: null, tipo: null },
  empresa: { razon_social: null, ruc: null }, resumen: {}, hallazgos: [], mediciones: [], tareas_repuestos: [], conclusion: null, emisor: { nombre: null, cargo: null },
};

const textContents = node => {
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(textContents);
  if (!node) return [];
  return [ ...(node.children || []).flatMap(textContents) ];
};

const findNode = (node, predicate) => {
  if (!node) return null;
  if (Array.isArray(node)) return node.map(child => findNode(child, predicate)).find(Boolean) || null;
  if (predicate(node)) return node;
  return (node.children || []).map(child => findNode(child, predicate)).find(Boolean) || null;
};

describe('InformePdf', () => {
  it('renderiza el snapshot completo con hallazgos, mediciones, tareas, fotos, emisor y pie', () => {
    const tree = create(<InformePdf snapshot={completeSnapshot} imagenes={{ logo: 'data:image/png;base64,logo', fotos: { 'foto-1': 'data:image/jpeg;base64,foto' } }} />).toJSON();
    expect(tree).toMatchInlineSnapshot(`
      <Document>
        <Page
          size="A4"
          style={
            {
              "color": "#172033",
              "fontFamily": "Helvetica",
              "fontSize": 9,
              "paddingBottom": 58,
              "paddingHorizontal": 38,
              "paddingTop": 30,
            }
          }
        >
          <View
            style={
              {
                "alignItems": "center",
                "borderBottomWidth": 1,
                "borderColor": "#d9e0e8",
                "flexDirection": "row",
                "justifyContent": "space-between",
                "marginBottom": 14,
                "paddingBottom": 10,
              }
            }
          >
            <Image
              src="data:image/png;base64,logo"
              style={
                {
                  "height": 48,
                  "objectFit": "contain",
                  "width": 125,
                }
              }
            />
            <View
              style={
                {
                  "maxWidth": 300,
                  "textAlign": "right",
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 11,
                  }
                }
              >
                Tideo Servicios
              </Text>
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 8,
                    "marginTop": 3,
                  }
                }
              >
                RUC: 
                20123456789
              </Text>
            </View>
          </View>
          <Text
            style={
              {
                "color": "#1a2b4a",
                "fontFamily": "Helvetica-Bold",
                "fontSize": 15,
                "marginBottom": 5,
                "textAlign": "center",
              }
            }
          >
            INFORME DE DIAGNÓSTICO TÉCNICO
          </Text>
          <Text
            style={
              {
                "color": "#667085",
                "fontSize": 8,
                "marginBottom": 13,
                "textAlign": "center",
              }
            }
          >
            Recepción 
            RAC-42
          </Text>
          <View
            style={
              {
                "flexDirection": "row",
                "flexWrap": "wrap",
                "gap": 6,
              }
            }
          >
            <View
              style={
                {
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "padding": 7,
                  "width": "32%",
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Activo
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 8.5,
                  }
                }
              >
                Excavadora · EX-4
              </Text>
            </View>
            <View
              style={
                {
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "padding": 7,
                  "width": "32%",
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Cliente
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 8.5,
                  }
                }
              >
                Cliente Uno
              </Text>
            </View>
            <View
              style={
                {
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "padding": 7,
                  "width": "32%",
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                N° de serie
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 8.5,
                  }
                }
              >
                SN-44
              </Text>
            </View>
            <View
              style={
                {
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "padding": 7,
                  "width": "32%",
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Fecha de recepción
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 8.5,
                  }
                }
              >
                01/10/2026
              </Text>
            </View>
            <View
              style={
                {
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "padding": 7,
                  "width": "32%",
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                N° de caso
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 8.5,
                  }
                }
              >
                CAS-8
              </Text>
            </View>
            <View
              style={
                {
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "padding": 7,
                  "width": "32%",
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Horómetro
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 8.5,
                  }
                }
              >
                123
              </Text>
            </View>
            <View
              style={
                {
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "padding": 7,
                  "width": "32%",
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Tipo
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 8.5,
                  }
                }
              >
                Mantenimiento
              </Text>
            </View>
            <View
              style={
                {
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "padding": 7,
                  "width": "32%",
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Versión
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 8.5,
                  }
                }
              >
                4
              </Text>
            </View>
            <View
              style={
                {
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "padding": 7,
                  "width": "32%",
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Emitido el
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 8.5,
                  }
                }
              >
                7/10/2026
              </Text>
            </View>
          </View>
          <Text
            style={
              {
                "borderBottomWidth": 1,
                "borderColor": "#e1e6ec",
                "color": "#1a2b4a",
                "fontFamily": "Helvetica-Bold",
                "fontSize": 10,
                "marginBottom": 6,
                "marginTop": 13,
                "paddingBottom": 4,
              }
            }
          >
            Resumen por prioridad
          </Text>
          <View
            style={
              {
                "flexDirection": "row",
                "gap": 6,
              }
            }
          >
            <View
              style={
                {
                  "alignItems": "center",
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "flexGrow": 1,
                  "padding": 7,
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Atención antes de operar
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 12,
                  }
                }
              >
                1
              </Text>
            </View>
            <View
              style={
                {
                  "alignItems": "center",
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "flexGrow": 1,
                  "padding": 7,
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Atención prioritaria
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 12,
                  }
                }
              >
                2
              </Text>
            </View>
            <View
              style={
                {
                  "alignItems": "center",
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "flexGrow": 1,
                  "padding": 7,
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Próximo mantenimiento
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 12,
                  }
                }
              >
                0
              </Text>
            </View>
            <View
              style={
                {
                  "alignItems": "center",
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "flexGrow": 1,
                  "padding": 7,
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Monitorear
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 12,
                  }
                }
              >
                0
              </Text>
            </View>
            <View
              style={
                {
                  "alignItems": "center",
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "flexGrow": 1,
                  "padding": 7,
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Conformes
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 12,
                  }
                }
              >
                1
              </Text>
            </View>
          </View>
          <Text
            style={
              {
                "borderBottomWidth": 1,
                "borderColor": "#e1e6ec",
                "color": "#1a2b4a",
                "fontFamily": "Helvetica-Bold",
                "fontSize": 10,
                "marginBottom": 6,
                "marginTop": 13,
                "paddingBottom": 4,
              }
            }
          >
            Hallazgos
          </Text>
          <View
            style={
              {
                "borderColor": "#dfe5ec",
                "borderRadius": 4,
                "borderWidth": 1,
                "marginBottom": 8,
                "padding": 9,
              }
            }
            wrap={false}
          >
            <View
              style={
                {
                  "flexDirection": "row",
                  "justifyContent": "space-between",
                  "marginBottom": 6,
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 10,
                  }
                }
              >
                Bomba
              </Text>
              <Text
                style={
                  {
                    "color": "#1a2b4a",
                    "fontFamily": "Helvetica-Bold",
                  }
                }
              >
                P1
              </Text>
            </View>
            <Text
              style={
                {
                  "lineHeight": 1.35,
                  "marginBottom": 1,
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                  }
                }
              >
                Daño
                : 
              </Text>
              Desgaste
            </Text>
            <Text
              style={
                {
                  "lineHeight": 1.35,
                  "marginBottom": 1,
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                  }
                }
              >
                Causa probable
                : 
              </Text>
              Lubricación
            </Text>
            <Text
              style={
                {
                  "lineHeight": 1.35,
                  "marginBottom": 1,
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                  }
                }
              >
                Condición
                : 
              </Text>
              Fuera de tolerancia
            </Text>
            <Text
              style={
                {
                  "lineHeight": 1.35,
                  "marginBottom": 1,
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                  }
                }
              >
                Riesgo
                : 
              </Text>
              Detener equipo
            </Text>
            <Text
              style={
                {
                  "lineHeight": 1.35,
                  "marginBottom": 1,
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                  }
                }
              >
                Acción recomendada
                : 
              </Text>
              Reemplazar
            </Text>
            <Text
              style={
                {
                  "lineHeight": 1.35,
                  "marginBottom": 1,
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                  }
                }
              >
                Atribuible a
                : 
              </Text>
              Operación
            </Text>
            <Text
              style={
                {
                  "lineHeight": 1.35,
                  "marginBottom": 1,
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                  }
                }
              >
                Observación
                : 
              </Text>
              Vibración
            </Text>
            <Text
              style={
                {
                  "lineHeight": 1.35,
                  "marginBottom": 1,
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                  }
                }
              >
                Tareas relacionadas: 
              </Text>
              Revisar sello
            </Text>
            <Text
              style={
                [
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  },
                  {
                    "fontFamily": "Helvetica-Bold",
                    "marginTop": 5,
                  },
                ]
              }
            >
              Mediciones
            </Text>
            <View
              style={
                {
                  "marginTop": 5,
                }
              }
            >
              <View
                style={
                  {
                    "backgroundColor": "#1a2b4a",
                    "flexDirection": "row",
                    "padding": 5,
                  }
                }
              >
                <Text
                  style={
                    [
                      {
                        "color": "#fff",
                        "fontFamily": "Helvetica-Bold",
                        "fontSize": 7,
                      },
                      {
                        "width": "30%",
                      },
                    ]
                  }
                >
                  Parámetro
                </Text>
                <Text
                  style={
                    [
                      {
                        "color": "#fff",
                        "fontFamily": "Helvetica-Bold",
                        "fontSize": 7,
                      },
                      {
                        "width": "26%",
                      },
                    ]
                  }
                >
                  Especificado
                </Text>
                <Text
                  style={
                    [
                      {
                        "color": "#fff",
                        "fontFamily": "Helvetica-Bold",
                        "fontSize": 7,
                      },
                      {
                        "width": "22%",
                      },
                    ]
                  }
                >
                  Medido
                </Text>
                <Text
                  style={
                    [
                      {
                        "color": "#fff",
                        "fontFamily": "Helvetica-Bold",
                        "fontSize": 7,
                      },
                      {
                        "width": "22%",
                      },
                    ]
                  }
                >
                  Resultado
                </Text>
              </View>
              <View
                style={
                  {
                    "borderBottomWidth": 0.5,
                    "borderColor": "#e6e9ee",
                    "flexDirection": "row",
                    "padding": 5,
                  }
                }
              >
                <Text
                  style={
                    [
                      {
                        "fontSize": 7.5,
                      },
                      {
                        "width": "30%",
                      },
                    ]
                  }
                >
                  Presión
                   (bar)
                </Text>
                <Text
                  style={
                    [
                      {
                        "fontSize": 7.5,
                      },
                      {
                        "width": "26%",
                      },
                    ]
                  }
                >
                  10
                </Text>
                <Text
                  style={
                    [
                      {
                        "fontSize": 7.5,
                      },
                      {
                        "width": "22%",
                      },
                    ]
                  }
                >
                  8
                </Text>
                <Text
                  style={
                    [
                      {
                        "fontSize": 7.5,
                      },
                      {
                        "width": "22%",
                      },
                    ]
                  }
                >
                  Bajo
                </Text>
              </View>
            </View>
            <View
              style={
                {
                  "flexDirection": "row",
                  "gap": 8,
                  "marginTop": 7,
                }
              }
            >
              <View
                style={
                  {
                    "alignItems": "center",
                    "width": "32%",
                  }
                }
              >
                <Image
                  src="data:image/jpeg;base64,foto"
                  style={
                    [
                      {
                        "maxWidth": "100%",
                        "objectFit": "contain",
                      },
                      {
                        "height": 95,
                        "width": 142.5,
                      },
                    ]
                  }
                />
                <Text
                  style={
                    {
                      "color": "#667085",
                      "fontSize": 7,
                      "marginTop": 3,
                      "textAlign": "center",
                    }
                  }
                >
                  Vista frontal
                </Text>
              </View>
            </View>
          </View>
          <View
            wrap={false}
          >
            <Text
              style={
                {
                  "borderBottomWidth": 1,
                  "borderColor": "#e1e6ec",
                  "color": "#1a2b4a",
                  "fontFamily": "Helvetica-Bold",
                  "fontSize": 10,
                  "marginBottom": 6,
                  "marginTop": 13,
                  "paddingBottom": 4,
                }
              }
            >
              Tareas y repuestos
            </Text>
            <View
              style={
                {
                  "backgroundColor": "#1a2b4a",
                  "flexDirection": "row",
                  "padding": 5,
                }
              }
            >
              <Text
                style={
                  [
                    {
                      "color": "#fff",
                      "fontFamily": "Helvetica-Bold",
                      "fontSize": 7,
                    },
                    {
                      "width": "31%",
                    },
                  ]
                }
              >
                Actividad / tarea
              </Text>
              <Text
                style={
                  [
                    {
                      "color": "#fff",
                      "fontFamily": "Helvetica-Bold",
                      "fontSize": 7,
                    },
                    {
                      "width": "24%",
                    },
                  ]
                }
              >
                Hallazgo
              </Text>
              <Text
                style={
                  [
                    {
                      "color": "#fff",
                      "fontFamily": "Helvetica-Bold",
                      "fontSize": 7,
                    },
                    {
                      "width": "15%",
                    },
                  ]
                }
              >
                Cargo / horas
              </Text>
              <Text
                style={
                  [
                    {
                      "color": "#fff",
                      "fontFamily": "Helvetica-Bold",
                      "fontSize": 7,
                    },
                    {
                      "width": "30%",
                    },
                  ]
                }
              >
                Repuestos
              </Text>
            </View>
            <View
              style={
                {
                  "borderBottomWidth": 0.5,
                  "borderColor": "#e6e9ee",
                  "flexDirection": "row",
                  "padding": 5,
                }
              }
            >
              <Text
                style={
                  [
                    {
                      "fontSize": 7.5,
                    },
                    {
                      "width": "31%",
                    },
                  ]
                }
              >
                Reparación · Cambiar sello
              </Text>
              <Text
                style={
                  [
                    {
                      "fontSize": 7.5,
                    },
                    {
                      "width": "24%",
                    },
                  ]
                }
              >
                Bomba
              </Text>
              <Text
                style={
                  [
                    {
                      "fontSize": 7.5,
                    },
                    {
                      "width": "15%",
                    },
                  ]
                }
              >
                Técnico
      2 h MO
      1 h máquina
              </Text>
              <Text
                style={
                  [
                    {
                      "fontSize": 7.5,
                    },
                    {
                      "width": "30%",
                    },
                  ]
                }
              >
                SEL-1 · Sello · 1 und
              </Text>
            </View>
          </View>
          <Text
            style={
              {
                "borderBottomWidth": 1,
                "borderColor": "#e1e6ec",
                "color": "#1a2b4a",
                "fontFamily": "Helvetica-Bold",
                "fontSize": 10,
                "marginBottom": 6,
                "marginTop": 13,
                "paddingBottom": 4,
              }
            }
          >
            Conclusión
          </Text>
          <Text
            style={
              {
                "lineHeight": 1.45,
              }
            }
          >
            Requiere reparación prioritaria.
          </Text>
          <View
            style={
              {
                "alignItems": "center",
                "alignSelf": "center",
                "marginTop": 20,
                "width": 250,
              }
            }
          >
            <View
              style={
                {
                  "height": 26,
                }
              }
            />
            <View
              style={
                {
                  "borderColor": "#667085",
                  "borderTopWidth": 1,
                  "marginBottom": 5,
                  "width": "85%",
                }
              }
            />
            <Text
              style={
                {
                  "fontFamily": "Helvetica-Bold",
                }
              }
            >
              Ana Pérez
            </Text>
            <Text
              style={
                {
                  "color": "#667085",
                  "fontSize": 8,
                  "marginTop": 3,
                }
              }
            >
              Jefa técnica
            </Text>
            <Text
              style={
                {
                  "color": "#667085",
                  "fontSize": 8,
                  "marginTop": 3,
                }
              }
            >
              7/10/2026
            </Text>
          </View>
          <Text
            fixed={true}
            render={[Function]}
            style={
              {
                "borderColor": "#d9e0e8",
                "borderTopWidth": 1,
                "bottom": 20,
                "color": "#667085",
                "fontSize": 7,
                "left": 38,
                "paddingTop": 5,
                "position": "absolute",
                "right": 38,
                "textAlign": "center",
              }
            }
          />
        </Page>
      </Document>
    `);
    const rendered = textContents(tree).join(' ');
    expect(rendered).toContain('Ana Pérez');
    expect(rendered).toContain('Versión');
    const footer = (function findFooter(node) {
      if (!node) return null;
      if (node.type === 'Text' && node.props?.fixed) return node;
      for (const child of node.children || []) {
        const found = findFooter(child);
        if (found) return found;
      }
      return null;
    })(tree);
    expect(footer.props.render({ pageNumber: 1, totalPages: 2 })).toContain('Página 1 de 2');
    expect(rendered).not.toMatch(/costo|precio|tarifa|margen|salario|sueldo/i);
  });

  it('renderiza el snapshot mínimo sin fotos, tareas, mediciones ni horómetro nulo', () => {
    const tree = create(<InformePdf snapshot={minimalSnapshot} />).toJSON();
    expect(tree).toMatchInlineSnapshot(`
      <Document>
        <Page
          size="A4"
          style={
            {
              "color": "#172033",
              "fontFamily": "Helvetica",
              "fontSize": 9,
              "paddingBottom": 58,
              "paddingHorizontal": 38,
              "paddingTop": 30,
            }
          }
        >
          <View
            style={
              {
                "alignItems": "center",
                "borderBottomWidth": 1,
                "borderColor": "#d9e0e8",
                "flexDirection": "row",
                "justifyContent": "space-between",
                "marginBottom": 14,
                "paddingBottom": 10,
              }
            }
          >
            <View />
            <View
              style={
                {
                  "maxWidth": 300,
                  "textAlign": "right",
                }
              }
            >
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 11,
                  }
                }
              />
            </View>
          </View>
          <Text
            style={
              {
                "color": "#1a2b4a",
                "fontFamily": "Helvetica-Bold",
                "fontSize": 15,
                "marginBottom": 5,
                "textAlign": "center",
              }
            }
          >
            INFORME DE DIAGNÓSTICO TÉCNICO
          </Text>
          <Text
            style={
              {
                "color": "#667085",
                "fontSize": 8,
                "marginBottom": 13,
                "textAlign": "center",
              }
            }
          >
            Recepción 
            RAC-MIN
          </Text>
          <View
            style={
              {
                "flexDirection": "row",
                "flexWrap": "wrap",
                "gap": 6,
              }
            }
          >
            <View
              style={
                {
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "padding": 7,
                  "width": "32%",
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Versión
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 8.5,
                  }
                }
              >
                1
              </Text>
            </View>
          </View>
          <Text
            style={
              {
                "borderBottomWidth": 1,
                "borderColor": "#e1e6ec",
                "color": "#1a2b4a",
                "fontFamily": "Helvetica-Bold",
                "fontSize": 10,
                "marginBottom": 6,
                "marginTop": 13,
                "paddingBottom": 4,
              }
            }
          >
            Resumen por prioridad
          </Text>
          <View
            style={
              {
                "flexDirection": "row",
                "gap": 6,
              }
            }
          >
            <View
              style={
                {
                  "alignItems": "center",
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "flexGrow": 1,
                  "padding": 7,
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Atención antes de operar
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 12,
                  }
                }
              >
                0
              </Text>
            </View>
            <View
              style={
                {
                  "alignItems": "center",
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "flexGrow": 1,
                  "padding": 7,
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Atención prioritaria
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 12,
                  }
                }
              >
                0
              </Text>
            </View>
            <View
              style={
                {
                  "alignItems": "center",
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "flexGrow": 1,
                  "padding": 7,
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Próximo mantenimiento
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 12,
                  }
                }
              >
                0
              </Text>
            </View>
            <View
              style={
                {
                  "alignItems": "center",
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "flexGrow": 1,
                  "padding": 7,
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Monitorear
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 12,
                  }
                }
              >
                0
              </Text>
            </View>
            <View
              style={
                {
                  "alignItems": "center",
                  "borderColor": "#e4eaf0",
                  "borderRadius": 3,
                  "borderWidth": 1,
                  "flexGrow": 1,
                  "padding": 7,
                }
              }
            >
              <Text
                style={
                  {
                    "color": "#667085",
                    "fontSize": 7,
                    "marginBottom": 3,
                  }
                }
              >
                Conformes
              </Text>
              <Text
                style={
                  {
                    "fontFamily": "Helvetica-Bold",
                    "fontSize": 12,
                  }
                }
              >
                0
              </Text>
            </View>
          </View>
          <Text
            fixed={true}
            render={[Function]}
            style={
              {
                "borderColor": "#d9e0e8",
                "borderTopWidth": 1,
                "bottom": 20,
                "color": "#667085",
                "fontSize": 7,
                "left": 38,
                "paddingTop": 5,
                "position": "absolute",
                "right": 38,
                "textAlign": "center",
              }
            }
          />
        </Page>
      </Document>
    `);
    const rendered = textContents(tree).join(' ');
    expect(rendered).toContain('RAC-MIN');
    expect(rendered).not.toMatch(/null|undefined|Horómetro|Mediciones|Tareas y repuestos|costo|precio|tarifa/i);
  });

  it('mantiene el título, encabezado y primeras filas de tareas juntos', () => {
    const tree = create(<InformePdf snapshot={completeSnapshot} />).toJSON();
    const group = findNode(tree, node => node.type === 'View' && node.props?.wrap === false && textContents(node).includes('Tareas y repuestos'));
    expect(group).not.toBeNull();
    expect(textContents(group)).toContain('Actividad / tarea');
    expect(textContents(group).some(text => text.includes('Cambiar sello'))).toBe(true);
  });

  it('capitaliza Tipo solo al renderizar el PDF', () => {
    const snapshot = { ...completeSnapshot, cabecera: { ...completeSnapshot.cabecera, tipo: 'mantenimiento' } };
    const tree = create(<InformePdf snapshot={snapshot} />).toJSON();
    const tipo = findNode(tree, node => node.type === 'View' && node.children?.length === 2 && textContents(node).includes('Tipo'));
    expect(textContents(tipo)).toEqual(['Tipo', 'Mantenimiento']);
    expect(snapshot.cabecera.tipo).toBe('mantenimiento');
  });
});
