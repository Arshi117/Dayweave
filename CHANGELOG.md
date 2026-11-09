# Release notes

## Unreleased

- Offer Mac menu-bar and freely draggable desktop-strip presentations, with the same event name/countdown, saved floating position, resizing and mode switching.
- Let Windows strips dock and slide across the entire bottom taskbar, keep their dock height and remember their horizontal position. Open the calendar on the available side near screen edges.
- Keep an optional Mac **始终置顶** preference for the transient panel and dismiss it on focus loss.
- Fit short-event labels to their actual height: use a marker, one title line or fuller details without changing the scheduled duration. Retain full event names and times for inspection and editing.
- Simplify the interactive website around Windows taskbar sliding and both Mac presentations; remove redundant helper copy and the homepage update/beta captions.

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
