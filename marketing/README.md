# Dayweave product website

Public URL: https://arshi117.github.io/Dayweave/

The public website is served from this repository's dedicated gh-pages branch. Maintainable page source is in marketing/site; Git-ignored marketing/dist is deployment output. This existing GitHub Pages site does not require a new hosting service.

## Build and preview

From the repository root:

```sh
npm run build
node marketing/scripts/build-site.cjs
node marketing/preview.cjs
```

Open http://127.0.0.1:4173/. Restart the server after changing preview.cjs; reload the browser after rebuilding other files.

The build copies static HTML/CSS/JS, the app icon and current compiled renderer. It excludes former walkthrough videos and posters. Downloads use the 0.1.2 Windows installer and native Apple Silicon / Intel Mac ZIPs from GitHub Releases.

## Interactive product trial

The trial embeds the unchanged compiled 0.1.2 React renderer: actual styles, countdown, completion, extension, weekly calendar, tasks, event editor and appearance picker. product-demo/renderer-provenance.json records the version and asset SHA-256 values. PDF worker and offline font resources are copied with the renderer.

Only marketing/demo/demo-bridge.js simulates Electron's account and window transport with fictional Google Calendar events and Microsoft To Do tasks. The left guide selects the current event, weekly calendar, tasks, actual appearance picker or bottom-left docking. The right side is a CSS-drawn Windows desktop with a simulated taskbar. The actual product strip can be dragged freely, snapped into the bottom-left corner, expanded upward while docked and pulled back into the desktop with downward expansion. Docking here is a browser simulation; it does not attach anything to the visitor's real OS taskbar. No alternate product UI is drawn by the marketing page. Visitors can create demo events, complete tasks, extend the active event, drag and resize the strip, and choose a theme. Reset restores sample data. Appearance is retained for the browser origin.

Real accounts, network subscriptions and file commits return a short instruction to use the desktop client. Native desktop always-on-top behavior, OS docking and global shortcuts require the installed app. The trial desktop is labeled as a sample. The iframe CSP permits same-origin resource loading, blocks external connections and prevents document form navigation. React saves demo events locally. The bridge verifies origin and source for host messages.

No personal app profile, subscription URL, account authorization, analytics, external font, customer quote or invented usage statistic is published.

## Publication

Commit maintainable website source to master. Copy marketing/dist to an isolated gh-pages worktree, preserving Git metadata. Commit and push normally without force-pushing. Remove the former video assets from the published branch. Wait for GitHub Pages deployment, then verify the public URL, live trial and three download links.
