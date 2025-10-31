# Media Storage & Supabase Synchronization

The Admin Escape Ride repository follows a strict zero-binary policy: no PNGs,
JPGs, MP4s, or other binary payloads are tracked in Git. All production art now
lives in Supabase Storage. The repo only contains JSON manifests and empty
directory placeholders so teammates know which folders map to Supabase bucket
prefixes.

This guide explains how the Supabase-centric workflow is wired and how to keep
the bucket in sync with the admin dashboard.

## 1. Directory map

The Media Pool and game bundle still expect the following folder structure:

```
public/media/mediapool/
  Audio/
  Video/
  Gif/
  Images/
    bundles/
    covers/
    icons/
    uploads/
  AR Overlay/
  AR Target/
  Other/
```

Each directory ships with a `.gitkeep` placeholder only. When you upload media
the API streams the file to Supabase and records the object path, leaving Git
untouched.

Game-specific mirrors (`apps/game-web/lib/media/overlays`, `lib/media/overlays`,
`public/game/public/media/*`) also contain `.gitkeep` files so the runtime can
resolve relative paths while assets reside in Supabase.

## 2. Manifest as the source of truth

`public/media/manifest.json` catalogs every asset that should exist in
Supabase. Each entry includes the expected bucket and object path inside the
`supabase` block and now carries a lightweight SVG placeholder so the Admin UI
can keep rendering thumbnails even when the binary only lives in Storage.
Example:

```json
{
  "id": "supabase-bundle-clue-green",
  "folder": "mediapool/Images/bundles",
  "fileName": "CLUEgreen.png",
  "status": "supabase",
  "supabase": {
    "bucket": "admin-media",
    "path": "mediapool/Images/bundles/CLUEgreen.png"
  },
  "thumbUrl": "/media/placeholders/bundle.svg",
  "placeholder": {
    "kind": "bundle",
    "path": "public/media/placeholders/bundle.svg",
    "url": "/media/placeholders/bundle.svg"
  }
}
```

The manifest keeps the repo reviewable while ensuring the dashboard knows which
Supabase keys to look for. Placeholders live in
`public/media/placeholders/**` and cover every Media Pool category (covers,
icons, bundles, uploads, AR, audio, video, etc.). They are text-based SVGs, so
the zero-binary policy remains intact while previews stay informative.

## 3. How uploads work

1. The Admin UI converts dropped files into base64 payloads.
2. `/api/upload` detects that Supabase Storage is enabled and writes the bytes
   to `SUPABASE_MEDIA_BUCKET/SUPABASE_MEDIA_PREFIX`.
3. The manifest is updated with the new object metadata (no binaries are
   committed).
4. `/api/list-media` merges three sources when building the Media Pool
   inventory and attaches the manifest placeholder data as `thumbUrl` so
   thumbnails no longer break when objects are Supabase-only:
   * manifest entries (with placeholder previews),
   * live Supabase listings (so thumbnails appear as soon as the object exists),
   * any fallback repo files (only placeholders now).

## 4. Mirroring settings, missions, and devices

The data APIs (`/api/save-config`, `/api/save-bundle`, `/api/save-publish`) call
`syncSupabaseJson()` so drafts land in Supabase alongside media. JSON payloads
are stored under `SUPABASE_DATA_PREFIX/{settings|missions|devices}`. This keeps
the storage layer authoritative for both configuration and art.

## 5. Operating procedures

* Treat Supabase as the canonical store. If you remove an object, update the
  manifest entry or delete it entirely.
* Never commit binaries. If you need to test locally, place files in the
  appropriate folder without committing them, or upload through the dashboard so
they appear in Supabase.
* Include bucket and folder changes in code review by updating the manifest and
  docs.

## 6. Troubleshooting checklist

| Symptom | Fix |
| --- | --- |
| Media card shows `status: missing` | The Supabase object probably does not exist. Upload the file or adjust the manifest to the correct path. |
| Upload API returns `Supabase upload failed` | Confirm `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MEDIA_BUCKET`, and `SUPABASE_MEDIA_PREFIX` are configured. |
| JSON mirrors are missing | Ensure `SUPABASE_DATA_BUCKET`/`SUPABASE_DATA_PREFIX` are set or allow the API to reuse the media bucket. |
| Manifest writes crash with `ENOENT: .../admin-media` | The API falls back to the OS temp directory (`/tmp/admin-media/manifest.json`). Verify the environment allows writing to `/tmp` or override with `MEDIA_STORAGE_ROOT`. |

Following this workflow honors the zero-binary requirement while keeping the
admin dashboard fully aware of every asset stored in Supabase.
