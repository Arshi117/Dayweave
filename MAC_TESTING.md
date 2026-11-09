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

## Upcoming Mac presentations (source only)

The current source offers **顶部菜单栏** and **桌面悬浮条**. Drag the status item down to float; drag the strip back to the top to dock. The popup strip supports the same drag. Mode commands remain in the right-click menu. The item shows the event name and countdown only in menu-bar mode, shortening long names without splitting emoji; its tooltip retains the full title. Menu-bar mode opens a panel below the item. Floating mode has the same pull handle, event actions, strip resizing and calendar as Windows. Outside clicks first close the calendar, then collapse details; compact floating strips stay visible and menu-bar popups hide. Open editors are protected. The selected presentation and floating position survive restarts and mode changes. Mac does not snap to the Windows taskbar. **始终置顶** is optional. The linked 0.1.2 downloads do not contain these source changes.

Before distributing an updated Mac package, verify on a real Mac:

- Drag the status item down, move the resulting strip in both axes, then drag it back to the top menu bar. Repeat from the popup strip. A click or small jitter must not detach, and releasing a drag must not trigger show/hide. Switch modes through the menu and restart: the floating position should return.
- Expand the calendar, click outside twice: the first click closes only the calendar, the second collapses details. Repeat in floating mode and menu-bar mode. Try outside clicks with an editor open; it must remain open.
- In menu-bar mode, check the event name/countdown, long Chinese names, emoji and full tooltip. After dragging down, only the app icon remains in the menu bar; the event name/countdown must appear only in the floating strip. Drag back to restore them at the top. Complete or extend the arrangement and confirm updates continue while hidden.
- Resize the floating strip and calendar. Check small displays, screen edges, different system Dock positions and display changes.
- Check keyboard shortcuts, sleep/wake, full-screen spaces and **始终置顶**. Check dragging and outside clicks on both arm64 and Intel Macs; pointer state reads use CoreGraphics without an event tap.
- Create adjacent 1-, 5-, 15- and 45-minute events, including midnight: every event needs a readable title card, with no clipped text or overlapping labels. A short event's left rail must retain its real duration. Confirm exact times, keyboard access and complete details remain available.

The packaged-launch smoke test checks default menu-bar startup and the preload bridge. Host-side controller tests cover presentation switching and persistent floating bounds; native Mac testing is still required.

## Rebuild on a Mac

From the project folder with Node.js installed, use `npm ci`, supply the application registration as described in `RELEASING.md`, then run `npm run dist:mac`. This produces separate arm64 and x64 ZIP files and uses macOS ad-hoc signing. Use a Developer ID and notarization for a public release.
