# Dayweave landing page

A Chinese product page for the Windows floating task strip. Open through `node preview.cjs` at http://127.0.0.1:4173. The public product page is published at https://arshi117.github.io/Dayweave/ from the dedicated gh-pages branch. The former Sites preview is retained separately.

Opening the HTML directly with a file:// URL redirects to the published HTTPS website, preserving the section anchor. This avoids a blank product preview caused by local-file module and iframe origin restrictions. Use `Open Website.url` for the public website; use `node preview.cjs` for local development.

## Actual product UI

The old independently drawn task strip has been removed. `dist/product-demo` now embeds the exact compiled renderer from the Dayweave 0.1.1 desktop application, including its own React components, stylesheet, icons, combined expanded panel, Complete and Extend actions, weekly calendar, pending tasks, filters and appearance selector. No product CSS or component markup is overridden for the demonstration.

Rebuild the renderer from the current D:/Dayweave source before updating the demo, then run `node scripts/prepare-demo.cjs <fresh-renderer-directory>` from this folder. The generated provenance includes the SHA-256 hashes of the current renderer and shared source files. The script copies only the renderer's JS and CSS assets. `renderer-provenance.json` records their SHA-256 hashes so they can be checked against `../out/renderer`. The desktop program is not modified by this page.

`demo/demo-bridge.js` replaces Electron's window and account bridge with fictional schedules, tasks and browser-host transport. The iframe blocks external connections with CSP. Account authorization, actual calendar synchronization, OS-level always-on-top behavior and native global shortcuts are not exercised by this website. The page explicitly states this boundary.

The iframe permits forms so the product's existing submit handlers can create and edit local demo events. CSP `form-action 'none'` prevents document-level form navigation; React handles saves locally. Reset discards demo edits.

Dragging and resizing move the preview iframe; the actual renderer retains its pull gesture, icons, dimensions, completion, extension, calendar and appearance logic. The preview uses one combined fictional dataset: Google Calendar scheduled events and Microsoft To Do deadline-only tasks are connected at the same time. There are no scenario switches. The default dataset contains future calendar events and four future To Do tasks, matching the native upcoming-event panel with pending-task checkboxes. It does not create an active event just to show additional controls. In FocusBar.tsx, the current-event condition alone enables the countdown and Complete/Extend footer. The unchanged renderer owns those states; the website does not add or remove product controls. Opening the weekly calendar shows the Google schedule and To Do list together. Deadline-only tasks never acquire a fabricated countdown. Reset restores the combined dataset. There are no exterior appearance controls, simulated desktop backgrounds, unrelated app windows, or imitation service logos. Appearance selection remains available only through the product's own palette control. The preview sits directly on the page and grows with the real panel.

The release dialog links directly to the public Dayweave 0.1.1 Windows x64 installer on GitHub Releases and provides its release notes. The release includes a SHA-256 checksum file and is labeled as an unsigned beta. No installer binaries are committed to the GitHub Pages branch. Source files and comments have English names; visitor-facing copy remains Chinese. No analytics, mailing-list collection or external fonts are used.


## Product film

The walkthrough is a 32-second, 1920 x 1080, 60 fps edited product film. Native playback controls and fullscreen are available, with no autoplay. It uses captures of the unchanged compiled Dayweave 0.1.1 renderer, showing an active Google Calendar event with a countdown, Microsoft To Do tasks, the weekly calendar and the compact strip. All data is fictional. The recording fixture contains an active event so the actual renderer supplies its real countdown state and controls.

Camera moves, panel reveals and transitions are editorial motion graphics composed from those UI captures, not a continuous native desktop recording or newly implemented application animations. The film does not demonstrate real account authorization or OS-level always-on-top behavior. The page identifies current app UI and sample data.

The soft stereo background score is an original short composition generated with additive piano-like tones and ambient pads. It contains no third-party music samples or copied reference-video audio. The mix targets -22 LUFS, includes fade-in/fade-out and is encoded as AAC. The video uses H.264 with fast-start metadata. Public media: `dist/assets/dayweave-walkthrough-v2.mp4` and `dist/assets/dayweave-walkthrough-v2-poster.jpg`. Raw captures, temporary hosts, source audio and system fonts are not published.
