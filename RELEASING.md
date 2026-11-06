# Windows release

## Install and use

Distribute `release/Dayweave-Setup-0.1.1-x64.exe` to Windows x64 testers. The installer includes Electron and all application resources; users do not need Node.js or npm. It installs for the current user, creates desktop and Start menu shortcuts, and registers a standard uninstaller. The setup wizard offers an installation directory. Launch Dayweave through either shortcut. Exit through the tray menu.

Version 0.1.1 is an unsigned test release. Windows may display an unknown-publisher or SmartScreen prompt. Public distribution should use a signing certificate. Automatic updates are not implemented; distribute a newer installer when releasing changes.

## Build

Use Node.js and npm on a Windows development machine:

```powershell
npm ci
$env:DAYWEAVE_GOOGLE_CLIENT_FILE = 'C:\path\to\google-desktop-application.json'
$env:DAYWEAVE_MICROSOFT_CLIENT_ID = 'your-public-desktop-application-id'
npm run dist:win
```

The Google file must contain an `installed` Desktop client registration. Web client registrations are rejected. Microsoft must use a public desktop application with the loopback redirect and Tasks.Read delegated permission described in `IMPORTS_SETUP.md`.

`prepare-release.cjs` writes only application registration fields to the ignored `build/desktop-clients.json`. Later local builds can reuse that file. Google treats installed desktop clients as public clients; their client secret cannot be confidential in a desktop binary. Authentication uses the existing system-browser, PKCE and loopback flow. See https://developers.google.com/identity/protocols/oauth2/native-app. No user account tokens, calendar subscription URLs, calendars, tasks or profile caches are copied into a release. Do not substitute web-server credentials, service-account keys or user authorization files.

`npm run pack:win` produces the unpacked application for diagnostics. `scripts/create-icon.ps1` regenerates the application icon. Build resources and source files use English; the application interface remains Chinese.

The build packages only compiled `out` resources, the allowlisted application registration, third-party notices and package metadata. Runtime JavaScript dependencies are bundled by electron-vite; build tools remain development dependencies. Publishing is disabled in the packaging commands.

## Accounts and tester access

Users connect their own accounts from Dayweave. They do not create cloud projects or import application registration files. Google test-mode restrictions still apply: add intended testers in Google Auth Platform, or complete the appropriate production publishing and verification before broader distribution. Workspace administrators may restrict consent. Microsoft account availability likewise depends on the registered supported account types and organization policies. Building an installer does not change those provider settings.

## Profile and upgrades

Default user data stays in `%APPDATA%\dayweave-desktop`, including the existing development profile. Local schedules, theme and task completion remain in that profile; connected-account authorization stays encrypted locally. Reinstalling or upgrading does not delete it. Uninstall also preserves it. A fresh user receives an empty schedule and no connected accounts.

Quit the old development instance before launching the installed app. The single-instance lock otherwise brings the existing instance forward. For isolated checks, launch the installed executable with `--user-data-dir="C:\absolute\test-profile"`. Do not enable remote debugging in normal user launches.

## Validation performed for 0.1.0

- Typecheck and production build succeeded.
- Package inventory contained no source files, development modules, account tokens, profile caches or user subscription URLs.
- The generated installer completed successfully and registered shortcuts and an uninstaller.
- The installed executable matched the packaged executable.
- An isolated fresh profile loaded the native preload bridge, both provider application registrations and an empty personal schedule.
- The installed renderer displayed a saved test event and opened the calendar drawer.
- Reinstalling the same version and relaunching retained the isolated test schedule.

These checks ran on the development Windows computer using an isolated profile. A separate clean computer and another person's browser sign-in still need tester validation. No automatic update, code-signing or broad Google OAuth production approval is claimed.

## Validation performed for 0.1.1

- Typecheck and production build passed.
- All 21 regression tests passed after updating retired expectations and enabling TypeScript import resolution.
- The packaged executable started with a separate empty profile and displayed the native task strip.
- Package inventory was checked against the current compiled main, preload and renderer files; personal profile data, development modules and stale nested build output are excluded.
- The installer and its SHA-256 checksum are published at https://github.com/Arshi117/Dayweave/releases/tag/v0.1.1.
- This release has not been installed on a separate clean computer. Code signing and automatic updates remain unavailable.


## macOS test build

See MAC_TESTING.md for the separate Apple Silicon and Intel ZIP files, installation steps, signing limitations and the native Mac rebuild command. Both builds require macOS 12 or later. The first Mac test version is 0.1.1.

