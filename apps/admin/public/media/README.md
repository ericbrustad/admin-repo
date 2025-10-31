# Media Storage (External Assets)

This repository no longer stores binary media (images, audio, video, AR models).
Uploaders should publish assets to an external CDN or storage provider and then
register the public URL inside the admin dashboard. The `/api/list-media` route
reads from `public/media/manifest.json` to organize those references into the
Media Pool. Subdirectories under `public/media/mediapool` are kept for local
organization only and contain `.gitkeep` placeholders so Git ignores real
uploads. The Admin dashboard surfaces these keep-alive markers under a
"Placeholders" tab so you can confirm each folder exists; the files remain
read-only and cannot be deleted from the UI.
