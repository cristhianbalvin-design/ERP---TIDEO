const CONDITION_LABELS = {
  conforme: 'Conforme',
  desgaste_aceptable: 'Desgaste aceptable',
  fuera_de_tolerancia: 'Fuera de tolerancia',
  falla_funcional: 'Falla funcional',
};

const RESULT_LABELS = {
  fuera_de_rango: 'Fuera de tolerancia',
  fuera_de_tolerancia: 'Fuera de tolerancia',
  dentro_de_rango: 'Dentro',
  dentro: 'Dentro',
  sin_sugerencia: 'Sin evaluar',
  sin_evaluar: 'Sin evaluar',
};

export const etiquetaCondicion = value => CONDITION_LABELS[value] || value || null;
export const etiquetaResultado = value => RESULT_LABELS[value] || value || null;
