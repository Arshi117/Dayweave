# Dayweave 0.1.2 macOS beta

## Choose a download

Open Apple menu > About This Mac and check Chip or Processor.

- Apple M-series chip: [Dayweave-0.1.2-mac-arm64.zip](https://github.com/Arshi117/Dayweave/releases/download/v0.1.2/Dayweave-0.1.2-mac-arm64.zip)
- Intel processor: [Dayweave-0.1.2-mac-x64.zip](https://github.com/Arshi117/Dayweave/releases/download/v0.1.2/Dayweave-0.1.2-mac-x64.zip)

Both builds require macOS 12 Monterey or later. Neither requires Node.js or npm.

## Install and open

1. Unzip the matching download on the Mac.
2. Drag `Dayweave.app` into Applications, then open it there.
3. If macOS blocks this test build because its developer is unverified, review the app name and use System Settings > Privacy & Security > Open Anyway when that option is available. See https://support.apple.com/102445. Do not disable Gatekeeper or change global system security.
4. The small task strip appears near the top-right. The Dayweave icon in the top menu bar provides Show/Hide, Calendar, Connections and Quit. A Dock icon is intentionally hidden for this menu-bar utility.
5. Pull the edge below the strip to expand it. Use the calendar icon to open the timetable. Drag the strip to reposition it.

Keyboard shortcuts are Command+Option+F for the strip and Command+Option+D for the calendar. A shortcut can be unavailable if another app already uses it.

## Accounts and data

Connect your own Google or Microsoft account, or paste a supported calendar subscription link. The installer includes the application's public desktop OAuth registration, not anyone's account tokens or schedules. Google test-mode restrictions still apply; the app developer may need to allow the tester's email address. Organization policies can also restrict sign-in.

The Mac profile is `~/Library/Application Support/dayweave-desktop`. It is independent of the developer's Windows profile. Removing the app does not erase that profile.

## Build and validation

The release workflow builds arm64 and x64 packages on matching macOS runners. It runs typechecking, all 41 regression tests, native bundle signing verification, an executable architecture check and an isolated-profile launch of the packaged application. The smoke test checks the preload bridge, empty profile, application registration, expanded task strip and calendar drawer. Both bundles use Electron 38.8.6. Workflow logs identify the source commit and validation results.

These beta packages carry ad-hoc signatures, not an Apple Developer ID signature or Apple notarization. CI validation does not replace testing on a separate user's Mac: account consent, organization restrictions, Keychain prompts and sleep/wake behavior still need that test. In the published 0.1.2 packages, taskbar docking applies only to Windows and the Mac strip remains floating.

If opening fails, report the Mac chip, macOS version and exact error message. Do not share subscription URLs, passwords, tokens or account configuration files.

## Upcoming Mac placement changes (source only)

The current source offers **左下角停靠** and **顶部菜单栏** through the menu-bar icon. Left-corner mode stays visible above the system Dock and expands upward. Top-menu mode hides the desktop strip, shows the active arrangement's countdown beside the status icon and opens a transient panel below it on click. Click outside or close the panel to hide it; right-click the status icon to change modes. Calendar expansion follows the status item's display and opens downwards and to the left. The same renderer supplies the countdown and actions in both modes. A shortcut still opens the panel when the system hides menu-bar items.

New profiles start at the bottom-left; existing floating profiles keep their position. Drag near the bottom to dock or away to reposition. **始终置顶** stays optional. Mode, desktop position and preferences persist across restarts; menu-bar panel bounds do not overwrite the desktop position.

Before distributing an updated Mac package, verify on a real Mac:

- Try bottom, left, right and auto-hidden system Docks, then move between displays with different sizes.
- Drag continuously near the bottom, then away; confirm docking settles without interrupting the drag. Test the menu command too.
- Expand details and the calendar while docked; confirm the strip remains at the bottom-left and all controls stay within the work area.
- Turn **始终置顶** off, switch to another app, then restore it through the menu-bar icon. Restart and confirm the choice and floating/docked position persist.
- Switch to **顶部菜单栏** and restart: no desktop strip should appear. Check the icon's countdown against the open arrangement, complete or extend it, then hide the panel and confirm updates continue. Idle state should keep only the icon.
- Open details/calendar/settings from the status item; check screen-edge and display changes. Click outside and click the icon again to close without immediately reopening. Check keyboard shortcuts, right-click mode selection and switching back to **左下角停靠**.

The packaged-launch smoke test now checks default Mac docking, upward expansion and work-area bounds. Host-side controller tests simulate Mac movement events and preference restoration; they do not replace this native Mac check. These changes are not in the linked 0.1.2 downloads.

## Rebuild on a Mac

From the project folder with Node.js installed, use `npm ci`, supply the application registration as described in `RELEASING.md`, then run `npm run dist:mac`. This produces separate arm64 and x64 ZIP files and uses macOS ad-hoc signing. Use a Developer ID and notarization for a public release.
