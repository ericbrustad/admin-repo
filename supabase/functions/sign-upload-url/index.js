// supabase/functions/sign-upload-url/index.js
// Generates a short-lived signed upload URL for Supabase Storage objects.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.0';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MEDIA_BUCKET = Deno.env.get('SUPABASE_MEDIA_BUCKET') ?? 'media';
const IMPORTS_BUCKET = Deno.env.get('SUPABASE_IMPORTS_BUCKET') ?? 'imports';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const bucket = String(body.bucket || MEDIA_BUCKET);
    const path = String(body.path || '').replace(/^\/+/, '');
    const contentType =
      typeof body.contentType === 'string' && body.contentType ? body.contentType : 'application/octet-stream';
    const upsert = Boolean(body.upsert);

    if (!path) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing path' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const allowedBuckets = new Set([MEDIA_BUCKET, IMPORTS_BUCKET]);
    if (!allowedBuckets.has(bucket)) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Bucket not allowed' }),
        { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path, { upsert, contentType });
    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, error: error?.message || 'Unable to sign upload URL' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const publicUrl = bucket === MEDIA_BUCKET
      ? `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${encodeURIComponent(path).replace(/%2F/g, '/')}`
      : null;

    return new Response(
      JSON.stringify({ ok: true, bucket, path, url: data.signedUrl, token: data.token, publicUrl }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error) {
    console.error('sign-upload-url error', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unexpected error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
