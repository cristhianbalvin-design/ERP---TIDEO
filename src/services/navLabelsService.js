import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';

const labelsCache = new Map();
const labelsRequests = new Map();
const labelsListeners = new Map();
const sectionLabelsCache = new Map();
const sectionLabelsRequests = new Map();
const sectionLabelsListeners = new Map();
let navSectionsCache = null;
let navSectionsRequest = null;

const notifyTenant = empresaId => {
  (labelsListeners.get(String(empresaId)) || new Set()).forEach(listener => listener());
  (sectionLabelsListeners.get(String(empresaId)) || new Set()).forEach(listener => listener());
};

const subscribeTenant = (empresaId, listener) => {
  const key = String(empresaId);
  const listeners = labelsListeners.get(key) || new Set();
  listeners.add(listener);
  labelsListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) labelsListeners.delete(key);
  };
};

const subscribeSectionLabels = (empresaId, listener) => {
  const key = String(empresaId);
  const listeners = sectionLabelsListeners.get(key) || new Set();
  listeners.add(listener);
  sectionLabelsListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) sectionLabelsListeners.delete(key);
  };
};

const labelsToMap = rows => (rows || []).reduce((result, row) => {
  if (row?.module_key && row.custom_label) result[row.module_key] = row.custom_label;
  return result;
}, {});

const sectionLabelsToMap = rows => (rows || []).reduce((result, row) => {
  if (row?.section_key && row.custom_label) result[row.section_key] = row.custom_label;
  return result;
}, {});

export async function fetchTenantNavLabels(empresaId, { force = false } = {}) {
  if (!empresaId) return {};
  const key = String(empresaId);
  if (!force && labelsCache.has(key)) return labelsCache.get(key);
  if (!force && labelsRequests.has(key)) return labelsRequests.get(key);
  if (!isSupabaseConfigured()) {
    labelsCache.set(key, {});
    return {};
  }

  const request = getSupabaseClient()
    .then(supabase => supabase
      .from('tenant_nav_labels')
      .select('module_key, custom_label, updated_at')
      .eq('empresa_id', empresaId)
    )
    .then(({ data, error }) => {
      if (error) throw error;
      const labels = labelsToMap(data);
      labelsCache.set(key, labels);
      notifyTenant(key);
      return labels;
    })
    .finally(() => labelsRequests.delete(key));

  labelsRequests.set(key, request);
  return request;
}

export async function listNavModules() {
  if (!isSupabaseConfigured()) return [];
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('nav_modules')
    .select('id, key, parent_key, section_key, default_label, icon, order_index, is_active')
    .eq('is_active', true)
    .order('section_key', { ascending: true })
    .order('order_index', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchTenantSectionLabels(empresaId, { force = false } = {}) {
  if (!empresaId) return {};
  const key = String(empresaId);
  if (!force && sectionLabelsCache.has(key)) return sectionLabelsCache.get(key);
  if (!force && sectionLabelsRequests.has(key)) return sectionLabelsRequests.get(key);
  if (!isSupabaseConfigured()) {
    sectionLabelsCache.set(key, {});
    return {};
  }

  const request = getSupabaseClient()
    .then(supabase => supabase
      .from('tenant_section_labels')
      .select('section_key, custom_label, updated_at')
      .eq('empresa_id', empresaId)
    )
    .then(({ data, error }) => {
      if (error) throw error;
      const labels = sectionLabelsToMap(data);
      sectionLabelsCache.set(key, labels);
      notifyTenant(key);
      return labels;
    })
    .finally(() => sectionLabelsRequests.delete(key));

  sectionLabelsRequests.set(key, request);
  return request;
}

export async function fetchNavSections({ force = false } = {}) {
  if (!isSupabaseConfigured()) return [];
  if (!force && navSectionsCache) return navSectionsCache;
  if (!force && navSectionsRequest) return navSectionsRequest;
  const supabase = await getSupabaseClient();
  navSectionsRequest = supabase
    .from('nav_sections')
    .select('key, default_label, order_index, is_active')
    .eq('is_active', true)
    .order('order_index', { ascending: true })
    .then(({ data, error }) => {
      if (error) throw error;
      navSectionsCache = data || [];
      return navSectionsCache;
    })
    .finally(() => { navSectionsRequest = null; });
  return navSectionsRequest;
}

export async function listNavSections() {
  return fetchNavSections();
}

const updateCache = (empresaId, updater) => {
  const key = String(empresaId);
  const next = updater({ ...(labelsCache.get(key) || {}) });
  labelsCache.set(key, next);
  notifyTenant(key);
  return next;
};

export async function saveTenantNavLabel(empresaId, moduleKey, customLabel) {
  if (!empresaId || !moduleKey) throw new Error('Faltan datos para guardar la etiqueta.');
  const label = String(customLabel || '').trim();
  if (!label) return resetTenantNavLabel(empresaId, moduleKey);
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('tenant_nav_labels')
    .upsert({ empresa_id: empresaId, module_key: moduleKey, custom_label: label }, { onConflict: 'empresa_id,module_key' })
    .select('module_key, custom_label, updated_at')
    .single();
  if (error) throw error;
  updateCache(empresaId, labels => ({ ...labels, [moduleKey]: data.custom_label }));
  return data;
}

export async function resetTenantNavLabel(empresaId, moduleKey) {
  if (!empresaId || !moduleKey) throw new Error('Faltan datos para restablecer la etiqueta.');
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from('tenant_nav_labels')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('module_key', moduleKey);
  if (error) throw error;
  updateCache(empresaId, labels => {
    delete labels[moduleKey];
    return labels;
  });
  return true;
}

export async function saveTenantSectionLabel(empresaId, sectionKey, customLabel) {
  if (!empresaId || !sectionKey) throw new Error('Faltan datos para guardar la sección.');
  const label = String(customLabel || '').trim();
  if (!label) return resetTenantSectionLabel(empresaId, sectionKey);
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('tenant_section_labels')
    .upsert({ empresa_id: empresaId, section_key: sectionKey, custom_label: label }, { onConflict: 'empresa_id,section_key' })
    .select('section_key, custom_label, updated_at')
    .single();
  if (error) throw error;
  updateSectionCache(empresaId, labels => ({ ...labels, [sectionKey]: data.custom_label }));
  return data;
}

export async function resetTenantSectionLabel(empresaId, sectionKey) {
  if (!empresaId || !sectionKey) throw new Error('Faltan datos para restablecer la sección.');
  const supabase = await getSupabaseClient();
  const { error } = await supabase
    .from('tenant_section_labels')
    .delete()
    .eq('empresa_id', empresaId)
    .eq('section_key', sectionKey);
  if (error) throw error;
  updateSectionCache(empresaId, labels => {
    delete labels[sectionKey];
    return labels;
  });
  return true;
}

const updateSectionCache = (empresaId, updater) => {
  const key = String(empresaId);
  const next = updater({ ...(sectionLabelsCache.get(key) || {}) });
  sectionLabelsCache.set(key, next);
  notifyTenant(key);
  return next;
};

export function useTenantNavLabels(empresaId, { enabled = true } = {}) {
  const key = empresaId ? String(empresaId) : '';
  const [labels, setLabels] = useState(() => labelsCache.get(key) || {});
  const [sectionLabels, setSectionLabels] = useState(() => sectionLabelsCache.get(key) || {});
  const [sectionDefaults, setSectionDefaults] = useState(() => (navSectionsCache || []).reduce((result, section) => ({ ...result, [section.key]: section.default_label }), {}));
  const [loading, setLoading] = useState(Boolean(enabled && empresaId && !labelsCache.has(key)));
  const [sectionLoading, setSectionLoading] = useState(Boolean(enabled && empresaId && !sectionLabelsCache.has(key)));
  const [error, setError] = useState(null);
  const [sectionError, setSectionError] = useState(null);

  useEffect(() => {
    if (!enabled || !empresaId) {
      setLabels({});
      setSectionLabels({});
      setSectionDefaults({});
      setLoading(false);
      setSectionLoading(false);
      setError(null);
      setSectionError(null);
      return undefined;
    }
    const tenantKey = String(empresaId);
    const sync = () => setLabels({ ...(labelsCache.get(tenantKey) || {}) });
    const syncSections = () => setSectionLabels({ ...(sectionLabelsCache.get(tenantKey) || {}) });
    const unsubscribe = subscribeTenant(tenantKey, sync);
    const unsubscribeSections = subscribeSectionLabels(tenantKey, syncSections);
    setLabels({ ...(labelsCache.get(tenantKey) || {}) });
    setSectionLabels({ ...(sectionLabelsCache.get(tenantKey) || {}) });
    setSectionDefaults((navSectionsCache || []).reduce((result, section) => ({ ...result, [section.key]: section.default_label }), {}));
    setLoading(!labelsCache.has(tenantKey));
    setSectionLoading(!sectionLabelsCache.has(tenantKey));
    setError(null);
    setSectionError(null);
    fetchTenantNavLabels(tenantKey)
      .then(next => setLabels({ ...next }))
      .catch(nextError => {
        setError(nextError);
        console.error('[tenant_nav_labels]', nextError);
      })
      .finally(() => setLoading(false));
    fetchTenantSectionLabels(tenantKey)
      .then(next => setSectionLabels({ ...next }))
      .catch(nextError => {
        setSectionError(nextError);
        console.error('[tenant_section_labels]', nextError);
      })
      .finally(() => setSectionLoading(false));
    fetchNavSections()
      .then(next => setSectionDefaults(next.reduce((result, section) => ({ ...result, [section.key]: section.default_label }), {})))
      .catch(nextError => {
        setSectionError(nextError);
        console.error('[nav_sections]', nextError);
      });
    return () => {
      unsubscribe();
      unsubscribeSections();
    };
  }, [empresaId, enabled]);

  const getLabel = useMemo(() => (moduleKey, defaultLabel) => labels[moduleKey] || defaultLabel, [labels]);
  const getSectionLabel = useMemo(() => (sectionKey, defaultLabel) => sectionLabels[sectionKey] || sectionDefaults[sectionKey] || defaultLabel, [sectionLabels, sectionDefaults]);

  return {
    labels,
    sectionLabels,
    loading,
    sectionLoading,
    error,
    sectionError,
    getLabel,
    getSectionLabel,
    saveLabel: (moduleKey, customLabel) => saveTenantNavLabel(empresaId, moduleKey, customLabel),
    resetLabel: moduleKey => resetTenantNavLabel(empresaId, moduleKey),
    saveSectionLabel: (sectionKey, customLabel) => saveTenantSectionLabel(empresaId, sectionKey, customLabel),
    resetSectionLabel: sectionKey => resetTenantSectionLabel(empresaId, sectionKey),
    refresh: () => Promise.all([
      fetchTenantNavLabels(empresaId, { force: true }),
      fetchTenantSectionLabels(empresaId, { force: true }),
    ]),
  };
}
