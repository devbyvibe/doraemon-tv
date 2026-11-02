# Doraemon TV

A personal site where Nobita's room TV plays Doraemon episodes straight from a public Google Drive folder.

- `index.html`, `style.css`, `app.js`: the player (plain HTML/CSS/JS, no build step)
- `assets/room.webp`: the room picture; the TV screen and buttons are positioned over it in `style.css`
- `episodes.json`: the episode list, generated from the Drive folder
- `tools/update_episodes.py`: rebuilds `episodes.json`

## How it plays video

Each MP4 is streamed directly from `drive.usercontent.google.com`, so the TV's own buttons, OSD and CRT effects work on the real picture. No API key is needed. If Drive refuses a file (for example after too many views in a day), the TV falls back to Drive's own player inside the screen.

The folder must stay shared as **Anyone with the link → Viewer**.

## Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Power | ⏻ button, or tap the screen | `P` |
| Next / previous episode | CH▲ / CH▼ | `→` / `←` |
| Volume | VOL+ / VOL− | `↑` / `↓` |
| Pause | Tap the screen | `Space` |
| Seek | Bar at the bottom of the screen | `J` / `L` (±10s) |
| Episode list | MENU, or the cabinet under the TV | `M` |
| Full screen | Double-click the screen | `F` |
| Jump to an episode | — | Type its number, e.g. `4` `1` `5` |
| Random episode | Doraemon poster on the wall | — |

It remembers the last episode, where you stopped in each one, and the volume.

## Adding episodes

Upload them to the Drive folder, then:

```bash
python3 tools/update_episodes.py
```

and publish again.

## Run locally

```bash
python3 -m http.server 8642
```

Then open http://localhost:8642 (opening `index.html` directly won't load the episode list). Add `?debug` to the URL to outline the screen and button positions.

## Publish on GitHub Pages (free)

1. Create a new repository on github.com, e.g. `doraemon-tv` (Public).
2. In this folder:
   ```bash
   git init && git add . && git commit -m "Doraemon TV"
   git branch -M main
   git remote add origin https://github.com/<your-username>/doraemon-tv.git
   git push -u origin main
   ```
3. On GitHub: Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)` → Save.
4. After a minute the site is live at `https://<your-username>.github.io/doraemon-tv/`.
