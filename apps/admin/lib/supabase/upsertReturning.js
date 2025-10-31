// Supabase v2 helper that returns the rows impacted by an upsert operation.
export async function upsertReturning(supa, table, payload, options = {}) {
  const { data, error } = await supa
    .from(table)
    .upsert(payload, options)
    .select();
  if (error) throw error;
  return data ?? null;
}
