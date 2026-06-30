# Beam landing page

A static, no-build-step marketing page for Beam. Plain HTML/CSS/JS — open `index.html` directly or serve the folder with any static file server.

```bash
# preview locally
npx serve .
# or
python -m http.server 8000
```

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo settings → Pages, set the source to the `landing` folder on your default branch (or copy these files to a `gh-pages` branch / `docs/` folder, whichever your Pages setup expects).
3. Update the `RELEASE_URL` constant in `script.js` to point at your repo's actual Releases page once you've published one (`https://github.com/<you>/<repo>/releases/latest`).

## Updating the download link

The "Download for Windows" buttons all share the id `download-btn` and get their `href` set in `script.js`. Point `RELEASE_URL` at the GitHub Release that has `beam-*-setup.exe` attached as an asset — `releases/latest` always resolves to the most recent one, so you don't need to touch this again on future releases.
