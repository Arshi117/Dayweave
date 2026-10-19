# Dayweave

Dayweave is a transparent weekly calendar that sits over the existing Windows wallpaper. Days run from Sunday to Saturday, and the vertical axis covers 24 hours. Each event block reflects its start time and duration.

## Launch on Windows

Open the Dayweave folder and double-click `Open Dayweave.cmd`. Once connected, the week calendar appears on the desktop. Use the button in the top-right corner to edit the schedule.

In WebStorm, run the `start` script from `package.json`. The HTML browser preview cannot attach to the desktop.

After changing source code, run `npm run build`, quit the running Dayweave instance from its tray menu, then launch the app again. Launching a second copy only opens the existing editor; it does not load the new build. `npm run dev` starts both a local development server and the Electron desktop window. The local URL is for that window, not for using Dayweave in a browser.

## Use

- The calendar is read-only on the desktop. Empty areas remain transparent, and desktop icons outside the small edit button remain clickable.
- Click the top-right edit button to open the editor. Click it again to return to the desktop; open windows are minimized so the wallpaper calendar is visible.
- The tray icon and `Ctrl+Alt+D` are alternate ways to open the editor.
- Click or drag across an empty time slot to create an event. Drag an event to move it, or drag its bottom edge to change its duration. Click an event to edit or delete it.
- Overlapping events appear side by side. The opacity slider changes event blocks only.
- Changes in the event dialog are saved with its save button. Drag changes save immediately. If saving fails, the editor stays open and offers a retry.
- The editor's close button quits Dayweave. The tray menu can edit, return to the desktop, reconnect, hide the calendar, or quit.
- The app retains the viewed week, scroll position, and event opacity when switching modes.

## Current scope

Desktop attachment supports Windows 10 and 11 and uses the primary display's work area, excluding the taskbar. The calendar is attached to the desktop window, while the editor is a normal window. The edit button is a separate tool window owned by the desktop shell, preserving normal mouse handling across repeated edit/pin transitions. It stays below application windows. `Win+D` should leave the calendar visible and hide the editor.

Windows does not provide a stable public interface for attaching windows to its desktop layer. Dayweave supports traditional and newer Windows 11 desktop structures. Windows updates, third-party live wallpapers, and display scaling may still affect attachment. If it fails, the editor remains usable. The app retries a lost connection up to three times; the user can also retry manually.

This version does not include auto-start, an independent calendar on a second monitor, an installer, or reading information from a university website.

Older scheduled events remain visible. Deadline-only tasks remain in local storage but do not appear in this weekly view. The first edit also backs up the data from before the weekly view. Dayweave does not replace the system wallpaper.

## Project files

- `src/main/index.ts`: editor, wallpaper and control windows, tray menu, and reconnection.
- `src/main/desktop-host.ts`: communication with the native desktop helper.
- `src/main/native/DesktopHost.cs`: desktop window ownership, ordering, positioning, and recovery.
- `src/main/native/desktop-host.ps1`: runs the native helper with Windows PowerShell and .NET, without a visible console window.
- `src/shared/desktop-layout.ts`: shared position and size for the top-right edit button.
- `src/renderer/src/DesktopControl.tsx`: the desktop edit button.
- `src/renderer/src/components/EditModeButton.tsx`: button shared by the desktop and editor windows.
- `src/renderer/src`: calendar display and editing, synchronized through local storage.

The native helper is copied to `out/main/chunks` during the build and needs no extra npm dependency. A future installer must put its two native files outside `app.asar` and adjust their paths. The current development and preview commands read directly from the build output.

Implementation references: [Microsoft SetParent documentation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setparent) and [Lively's Windows desktop implementation](https://github.com/rocksdanister/lively/blob/core-separation/src/Lively/Lively/Core/WinDesktopCore.cs).

## Development commands

```powershell
npm run typecheck
npm run build
```
