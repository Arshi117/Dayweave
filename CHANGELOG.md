# Release notes

## Unreleased

- Offer two Mac placements: a persistent bottom-left strip or a menu-bar countdown with an on-demand arrangement panel. Remember the mode, preserve desktop bounds and dismiss the menu-bar panel on focus loss.
- Add macOS bottom-left docking above the system Dock, with a menu-bar command, bottom-edge snapping, upward expansion and saved placement. Preserve existing floating profiles.
- Add a saved macOS **始终置顶** toggle so the strip can follow normal application stacking.
- Avoid treating each macOS `moved` event as the end of a drag; validate Mac work-area layouts and controller persistence, and extend the packaged Mac smoke check.

## 0.1.2 — 2026-11-08

Second public GitHub release. Consolidates the intermediate local test builds.

- Import local ICS files and recognize text-based Chinese timetable PDFs, with a review step and an explicit first-teaching-week date before saving semester schedules.
- Detect calendar and PDF downloads by their content, including extensionless links. Show concise errors for invalid, unsupported, missing, restricted and failed links.
- Simplify links, files and account screens; bundle public application registration so users sign in without configuring cloud developer applications.
- Keep source counts consistent with the source management list, including saved backup subscriptions.
- Use one compact countdown, retain whole-strip dragging and the separate horizontal pull handle, and remove empty-week calendar overlays.
- On Windows, dock in the bottom taskbar region, expand upward while docked and downward while floating, remember docking state and provide a tray docking command.
- Restore a docked strip that Explorer covers after another widget moves away, without fighting other windows, changing keyboard focus or undoing explicit hiding.
- Provide a separate development launcher and profile with live renderer updates.
- Build Mac Apple Silicon and Intel downloads on native macOS runners with architecture, signature and packaged-launch checks. Windows docking features do not apply on Mac.

All packages are beta builds. macOS packages are ad-hoc signed and not notarized; Windows packages are unsigned. Automatic app updates are not included. Provider and organization consent restrictions still apply.
