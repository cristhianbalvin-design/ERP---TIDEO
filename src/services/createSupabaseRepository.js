import { getSupabaseClient } from '../lib/supabaseClient.js';

export const createSupabaseRepository = ({ table, empresa }) => {
  if (!table) {
    throw new Error('createSupabaseRepository requiere table.');
  }

  const scoped = query => {
    if (!empresa?.id) return query;
    return query.eq('empresa_id', empresa.id);
  };

  return {
    async list({ orderBy = 'created_at', ascending = false } = {}) {
      const supabase = await getSupabaseClient();
      const { data, error } = await scoped(supabase.from(table).select('*')).order(orderBy, { ascending });
      if (error) throw error;
      return data || [];
    },

    async getById(id) {
      const supabase = await getSupabaseClient();
      const { data, error } = await scoped(supabase.from(table).select('*').eq('id', id)).single();
      if (error) throw error;
      return data;
    },

    async create(values) {
      const supabase = await getSupabaseClient();
      const payload = empresa?.id ? { ...values, empresa_id: empresa.id } : values;
      const { data, error } = await supabase.from(table).insert(payload).select('*').single();
      if (error) throw error;
      return data;
    },

    async update(id, patch) {
      const supabase = await getSupabaseClient();
      const { data, error } = await scoped(supabase.from(table).update(patch).eq('id', id)).select('*').single();
      if (error) throw error;
      return data;
    },
  };
};
