# Beam landing page

A static, no-build-step marketing page for Beam. Plain HTML/CSS/JS — open `index.html` directly or serve the folder with any static file server.

```bash
# preview locally
npx serve .
# or
python -m http.server 8000
```

## Deploying to GitHub Pages

1. Push this repo to GitHub (already at `rohzzn/beam`).
2. In the repo settings → Pages, set the source to the `landing` folder on your default branch (or copy these files to a `gh-pages` branch / `docs/` folder, whichever your Pages setup expects).

## How the download buttons work

All three "Download for Windows" buttons (nav, hero, and the bottom CTA) share the class `js-download`. On page load, `script.js` calls the GitHub API for `rohzzn/beam`'s latest release and, if it finds a `.exe` asset attached, repoints every button straight at that file — so the click downloads the installer immediately instead of just opening a GitHub page.

If no release exists yet (or the API call fails for any reason — offline, rate-limited), the buttons fall back to their default `href`, which is the repo's `/releases/latest` page. Nothing in this file needs to change between releases — publish a new GitHub Release with a `beam-*-setup.exe` asset and the page picks it up automatically on next load.
