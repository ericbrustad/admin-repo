// Back/forward compatible upsert that returns rows when possible.
// Works with supabase-js v1 (no .select on upsert) and v2 (has .select()).
export async function upsertReturning(supa, table, payload, options = {}) {
  const q = supa.from(table).upsert(payload, options);
  // v2 supports chaining .select(); v1 doesn't.
  if (typeof q.select === 'function') {
    const { data, error } = await q.select();
    if (error) throw error;
    return data ?? null;
  }
  const { data, error } = await q; // v1 response shape
  if (error) throw error;
  return data ?? null;
}
