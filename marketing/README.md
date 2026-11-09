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

The trial embeds the current React desktop renderer without website-specific product UI changes: actual styles, countdown, completion, extension, weekly calendar, tasks, event editor and appearance picker. Public downloads remain at 0.1.2; upcoming Mac placement behavior is explicitly labeled as a preview. product-demo/renderer-provenance.json records the package version and asset SHA-256 values. PDF worker and offline font resources are copied with the renderer.

Only marketing/demo/demo-bridge.js simulates Electron's account and window transport with fictional Google Calendar events and Microsoft To Do tasks. The Windows trial initially shows a compact, undocked strip on the desktop. The left guide follows the product button order: current event, calendar (including tasks), appearance, connections, then strip resizing and bottom-left docking. On Windows, only the last guide item or a deliberate drag docks the strip; selecting another guide item returns it to the desktop. The resizing guide leaves the strip compact so both real edge grips are available. The right side is a CSS-drawn desktop for the selected system, with its taskbar or menu bar and system Dock. The actual product strip can be dragged freely, snapped into the bottom-left corner, expanded upward while docked and pulled back into the desktop with downward expansion. Docking here is a browser simulation; it does not attach anything to the visitor's real OS taskbar. No alternate product UI is drawn by the marketing page. Visitors can create demo events, complete tasks, extend the active event, drag and resize the strip, and choose a theme. Reset restores sample data. Appearance is retained for the browser origin.

Real accounts, network subscriptions and file commits return a short instruction to use the desktop client. Native desktop always-on-top behavior, OS docking and global shortcuts require the installed app. The trial desktop is labeled as a sample. The iframe CSP permits same-origin resource loading, blocks external connections and prevents document form navigation. React saves demo events locally. The bridge verifies origin and source for host messages.

The sliding platform selector places Windows on the left and Mac on the right, with click and native radio-group arrow-key support. Both systems share the same renderer, example events, task progress and appearance. Mac starts in **左下角常显** mode above the system Dock. Its placement selector also offers **顶部菜单栏**: only the status icon and renderer-supplied live countdown remain until clicked, then arrangements open underneath and the calendar extends to the left. Clicking outside, closing the panel or Escape hides it. Right-clicking the icon opens placement/calendar/connection actions. Reset retains both system and Mac placement. Switching to Windows removes the Mac-only controls. The Mac desktop fits narrow viewports so the status item stays reachable. Both Mac placement modes are upcoming-version previews, not features in the linked 0.1.2 downloads.

No personal app profile, subscription URL, account authorization, analytics, external font, customer quote or invented usage statistic is published.

## Publication

Commit maintainable website source to master. Copy marketing/dist to an isolated gh-pages worktree, preserving Git metadata. Commit and push normally without force-pushing. Remove the former video assets from the published branch. Wait for GitHub Pages deployment, then verify the public URL, live trial and three download links.
