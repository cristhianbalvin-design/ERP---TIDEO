import React from 'react';

export const CAMPO_MODULE_OPTIONS = [
  { id: 'tecnico', label: 'Tecnico' },
  { id: 'logistica', label: 'Logistica' },
  { id: 'vendedor', label: 'Vendedor' },
  { id: 'compras', label: 'Compras' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'gerencia', label: 'Gerencia' },
  { id: 'asistencia', label: 'Control de asistencia' },
  { id: 'mi_espacio', label: 'Mi espacio' },
];

export function SelectorModulosCampo({
  value = [],
  onChange,
  disabled = false,
  requiredModule = null,
  getRestriction,
}) {
  const selected = Array.isArray(value) ? value : [];
  const actualizar = (moduleId, checked) => {
    if (moduleId === requiredModule) return;
    const next = checked
      ? [...new Set([...selected, moduleId])]
      : selected.filter(id => id !== moduleId);
    onChange?.(requiredModule ? [...new Set([...next, requiredModule])] : next);
  };

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, opacity: disabled ? 0.55 : 1}}>
      {CAMPO_MODULE_OPTIONS.map(module => {
        const restriction = getRestriction?.(module.id) || { disabled: false, tooltip: '' };
        const required = module.id === requiredModule;
        const moduleDisabled = Boolean(disabled || restriction.disabled || required);
        const checked = selected.includes(module.id) || (required && !disabled);
        return (
          <label
            key={module.id}
            className="row"
            title={restriction.tooltip || ''}
            style={{
              gap:8,
              fontSize:13,
              padding:'8px 10px',
              border:'1px solid var(--border)',
              borderRadius:8,
              opacity: restriction.disabled ? 0.55 : 1,
              cursor: moduleDisabled ? 'not-allowed' : 'pointer',
              background: restriction.disabled || disabled ? 'var(--bg-subtle)' : undefined,
            }}
          >
            <input
              type="checkbox"
              className="checkbox"
              disabled={moduleDisabled}
              checked={checked}
              onChange={event => actualizar(module.id, event.target.checked)}
            />
            {module.label}
          </label>
        );
      })}
    </div>
  );
}
