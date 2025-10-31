# Esxape Ride — Project Memory

(Last updated: <replace with date>)

## Architecture
- Repo: Admin-esxape-ride
- Admin at repo root (Vercel: admin-esxape-ride)
- Game in /game (Vercel: game-esxape-ride)
- Admin ENV: NEXT_PUBLIC_GAME_ORIGIN=https://game.esxaperide.com, GITHUB_* (owner, name, branch=main, token, base_dir='')
- Game ENV: may use NEXT_PUBLIC_GAME_ORIGIN for own links
- Game mirroring can be toggled in the repo's `.env` file. Leave `GAME_ENABLED`/`NEXT_PUBLIC_GAME_ENABLED` at `0` (default) to
  keep Game disabled, or set them to `1` to enable Game writes and UI controls.

## Save / Publish
- Save All -> Admin draft only:
  public/games/<slug>/draft/{missions.json, config.json}
- Publish -> makes live + writes to Game:
  Admin: public/games/<slug>/{missions.json, config.json}
  Game:  apps/game-web/public/games/<slug>/{missions.json, config.json}
- Handles 409 with retry; shows "Saving…" and redeploy notes

## Media (global pool)
- Pool dirs (both apps):
  - public/media/mediapool/Audio/
  - public/media/mediapool/Video/
  - public/media/mediapool/AR Target/
  - public/media/mediapool/AR Overlay/
  - public/media/mediapool/Images/ (plus /Images/{bundles,covers,icons,uploads})
  - public/media/mediapool/Gif/
  - public/media/mediapool/Other/
  - Legacy backups live in public/media/*_bak for reference
- Pick from media reads /media/mediapool/** with type + tag metadata
- Drag & drop + chooser supported for pool & icon lists
- Re-apply defaults seeds default entries (does not delete custom)
- "Key" column = human-readable statement of what pin the icon is for

- Default image bundles (shipped every build)
  - /media/mediapool/Images/bundles/ROBOT1small.png -> "Roaming Robot" — Device icon (type clone)
  - /media/mediapool/Images/bundles/SMOKE BOMB.png -> "Smoke Shield" — Device icon (type smoke)
  - /media/mediapool/Images/bundles/GOLDEN COIN.png -> "Gold Coin" — Reward icon
  - /media/mediapool/Images/bundles/evidence 2.png -> "Evidence" — Reward icon
  - /media/mediapool/Images/bundles/CLUEgreen.png -> "Clue" — Reward icon
  - /media/mediapool/Images/bundles/trivia icon.png -> "Trivia" — Mission icon
  - /media/mediapool/Images/bundles/trivia yellow.png -> "Trivia 2" — Mission icon
- AR folders split markers vs overlays for assignment (`AR Target`, `AR Overlay`)

## Missions
- Types: multiple_choice, short_answer, statement, video, geofence_image, geofence_video, ar_image, ar_video, stored_statement
- stored_statement: template with #mXX# tags to insert prior answers
- short_answer: “Also Accept” may be blank
- Correct/Wrong tickers: image/video/gif/statement (+optional audio)
  - Correct: can deploy Reward device or Clue
  - Wrong: can deploy Punishment device or time delay
- Photo Opportunity mission: statement + camera with overlay from /media/overlays; saves to Photos pocket

## Map & Devices
- Overview map: missions + devices on one map
- Click behavior:
  - placing new device -> set its location
  - selected device -> move it
  - none selected -> move nearest pin
- Address search (Nominatim), radius slider, duplicate/delete
- Pins numbered by order; icons from Media icon lists
- Device edit panel shows thumbnail left of title

## Backpack
- Pockets: Video, Audio, Rewards, Utilities (Devices), Photos
- Items have thumbnail + title; can preview, use/remove

## Data stored
- Splash: first name, last name, email, cell
- Gameplay: Q/A, points, items collected, stored values, photos
- For end-game email/SMS and later marketing

## UI invariants
- Look stays the same
- Mission editor overlay on right, Close & Save at top and bottom
- Missions list on left with numbering, arrows, duplicate, delete
- Test tab with iframe + open full window
- Appearance controls: font, sizes, colors, opacities, bg image, alignments (default vertical top)

## Deploy feedback & errors
- "Saving…" with short delay to cover redeploy window
- Auto-retry on 409 ETag mismatch

