# Dayweave

Dayweave is a compact desktop task strip with a calendar drawer for Windows and macOS. The application starts with one small always-on-top strip. Pull its edge to reveal actions, then use the calendar icon to unfold an opaque weekly timetable alongside it.

## Launch

The second public release is [Dayweave 0.1.2](https://github.com/Arshi117/Dayweave/releases/tag/v0.1.2): [Windows x64](https://github.com/Arshi117/Dayweave/releases/download/v0.1.2/Dayweave-Setup-0.1.2-x64.exe), [Mac Apple Silicon](https://github.com/Arshi117/Dayweave/releases/download/v0.1.2/Dayweave-0.1.2-mac-arm64.zip), [Mac Intel](https://github.com/Arshi117/Dayweave/releases/download/v0.1.2/Dayweave-0.1.2-mac-x64.zip). The intermediate local test versions are consolidated into this release. See `CHANGELOG.md` and `MAC_TESTING.md` for changes and platform-specific notes.

For day-to-day development, double-click `Open Dayweave Dev.vbs` (also linked as **Dayweave Dev** on this machine's desktop), or run `npm run dev:desktop`. This starts the current checkout with renderer hot reload and native/preload rebuilds. It uses `%APPDATA%/dayweave-dev` and a separate instance lock, so an installed release cannot intercept the launch. Double-clicking again reveals the same development window. Logs are in `node_modules/.cache/dayweave-dev/development.log`. This does not build or replace an installer. The browser preview is at `http://127.0.0.1:5173/?preview=dock` while the development server is running; it uses synthetic browser data, not the desktop profile.

On Windows the native app can dock in the bottom-left taskbar region. Release a dragged strip within 64 logical pixels of the bottom work-area edge to snap it there, or choose **停靠到底部** from its tray menu. Drag it away to float again. Docking is saved in `focus-window.json`; details and the pull handle open upward while docked and downward while floating. The dock uses a separate topmost Electron window over the taskbar, not an injected Explorer toolbar, and does not reserve or rearrange Windows taskbar buttons. Existing data profiles are preserved.

While docked and visible, a Windows hit-test check detects when Explorer covers the entire compact strip after another widget moves away. It restores only Dayweave's z-order without activating the window. A competing widget (including a widget parented to Explorer), menus, full-screen apps, manual hiding, minimizing and native dragging do not trigger recovery. The check reads HWND geometry, ownership and window classes only; it does not inspect window titles or capture screen contents.

The `?preview=dock` page provides the same interaction on a simulated Windows taskbar. Drag anywhere on the strip to detach, then return it to the lower-left corner to snap back. This follows docking state, not which half of the screen contains the strip. The time progress stays on the strip's top edge. The browser page is a simulation; the native implementation runs in the desktop app.

For an installed release, launch Dayweave from the desktop or Start menu shortcut. End users do not need Node.js, npm, or the source folder. The Windows x64 installer is generated as `release/Dayweave-Setup-<version>-x64.exe`. See `RELEASING.md` for building and distributing it.

Use `Open Dayweave Dev.vbs` for the latest source. The older `Open Dayweave.cmd` starts the last compiled build and shares the installed profile; it does not start hot reload. The native app runs in Electron; a browser preview cannot create or embed a real Windows floating window.

After updating the build, quit the old instance from the tray menu and launch again. Starting another copy only reveals the already-running instance. Development mode watches main and preload sources as well as the renderer, restarting Electron when the native side changes so stale IPC bridges are not mixed with updated renderer code.

The current Mac source uses the top menu bar only (not included in the published 0.1.2 packages). The status item shows the event name and live countdown; long names are shortened with a full tooltip. Click it to open arrangements below it; click outside to close, or right-click for calendar and connection actions. The calendar opens down and to the left. Previous Mac floating or bottom-left profiles automatically use this menu-bar presentation. Mac bottom-left docking, snapping and detachable desktop strips have been removed; Windows taskbar docking is unchanged. **始终置顶** remains optional for the transient panel.

## Move and expand

Use the palette icon in the expanded header to switch among Paper, Graphite, and Silver. Paper uses a warm white surface; Graphite separates the dark compact capsule from its details; Silver uses a cool gray surface. Current-arrangement details use a compact title, time range and inline remaining time across the three appearances. Silver is the default for a new installation. The choice applies immediately to the strip, connection screens, calendar, and event dialogs, and is saved locally under `dayweave.appearance.v1`. Choosing a style keeps the appearance selector open so the alternatives remain easy to compare. The back arrow returns to the current arrangement.

The compact strip keeps its small footprint and top-edge time progress. Drag its body to move the native window; click or pull its separate horizontal edge handle to expand the current arrangement. The countdown appears once in the compact strip, using hours when needed and always showing seconds. The X in the expanded header collapses the card and leaves the strip visible; hiding the whole strip remains available through the tray and shortcut. Reduced-motion preferences disable the entry animation.

- Drag anywhere on the task strip itself to move the whole window. The status icon, title, countdown and progress line belong to its native drag region.
- A separate full-width pull area sits immediately beneath the strip. Drag it outward by more than 12 logical pixels, or click it, to reveal task actions. Push it back or click again to collapse. Near the bottom of the display, details open above the strip and the pull area moves to that edge.
- Hovering does not expand or collapse anything. Revealed controls stay available until explicitly closed.
- The calendar icon in the revealed controls unfolds the calendar sideways. It opens to the left when there is insufficient room on the right. The strip remains anchored whenever the available display area permits it.
- Close the calendar with its X, the calendar icon, or Escape. Another Escape collapses the task actions. Escape inside an event dialog closes that dialog without collapsing the whole strip.
- While the strip is collapsed, drag either side edge to change its length (180–600 logical pixels, including transparent margins). Dragging the left edge keeps the right edge anchored. The expanded controls retain a minimum readable width of 300 pixels; collapsing restores the chosen compact length.
- Resize the calendar using its outer side, outer vertical edge, or marked corner. Near a screen boundary those grips follow the calendar's opening direction. Width and height change independently, text retains its size, and smaller calendars use a tighter header and task list. Focus an edge and use the arrow keys for 20-pixel adjustments.
- Drag the horizontal divider between imported tasks and the weekly calendar to adjust their relative heights. Both panes retain usable space and scroll independently. Double-click the divider to restore the default ratio; focus it and use Up/Down for fine adjustment (Shift for larger steps). The ratio is saved locally under `dayweave.calendar-task-ratio.v1` and adapts when the drawer is resized. Collapsing the task section gives its space back to the calendar.
- Position, compact length, calendar width, and calendar height are remembered in `focus-window.json`. Older position-only files remain valid. Dimensions are validated on load and constrained to the current display's work area. The timetable uses an opaque background matching the selected appearance; no calendar window is attached to the wallpaper.
- The tray menu can show the strip, unfold the calendar, open subscription settings, or quit. `Ctrl+Alt+F` toggles the strip; `Ctrl+Alt+D` unfolds the calendar. Hiding the strip does not quit the app.

## Calendar drawer

Timed blocks retain their real height. Very short blocks use a colored marker, short blocks show one complete title line, and taller blocks add the time and location when space permits. Full names and times remain available through the tooltip and event details.

Local time blocks and subscribed timed events share the same weekly timetable. Subscription events are not copied into editable local storage. They use a muted green appearance, are read-only, and show their date and time when clicked. Cross-midnight subscription events are split at local day boundaries for display.

Generic calendar subscriptions preserve descriptions and locations. When an Allocate-style description starts with a structured subject identity, activity and group (for example, `ETM1005_MA_S2_ON-CAMPUS, Tutorial, 02`), its display title becomes `ETM1005 · Tutorial 02`. The source summary remains available in the tooltip and event details, along with the full original description and classroom. Events without that explicit structured line keep their original title; there is no abbreviation-to-course lookup or school-specific account configuration. Event IDs and scheduled times are unchanged.

Every complete calendar download is archived verbatim with Windows secure-storage encryption in a companion `.source.json` file before display parsing. The archive retains events outside the currently expanded range, timezone definitions, reminders, unknown properties, and components that cannot be placed on the timetable. Connection management omits a raw-source viewer to keep the user interface focused on refreshing and managing sources. Source removal clears the archive. A malformed or unsupported new download never erases the prior expanded cache.

Generic feeds support floating all-day events in a separate row, including multi-day spans with an exclusive end date. They are excluded from the timed focus countdown. Non-recurring VTODOs and point-in-time deadlines appear as pending tasks without an invented duration. Repeated VTODOs show the current source item with an explicit limitation notice. Source fields such as organizer, attendees, status, timezone, recurrence and custom properties are available in event details; that readable projection can be shortened for display while the archive remains complete. Cancelled/completed source records and recurrence exclusions are retained in the archive but not resurrected as active items. Invalid dates and unprojected component types produce notices rather than a silent success claim. A feed cannot supply information the provider omitted or withheld.

The calendar opens on the current week and requests that complete week from the subscription service. It does not reuse the old wallpaper calendar's saved week. Week navigation expands the newly viewed week as well as the focus window. The source name, per-source counts, and display filter help distinguish imported events from unrelated local entries. Scrolling starts near a relevant event time. Empty weeks show the unobstructed calendar grid, without an empty-week message or a nearest-event prompt.

Use Today and the arrows to navigate. Drag across empty calendar space or use New to add a local event. Local events can be edited, moved, resized, and deleted. Local color choices remain available. Overlapping blocks appear side by side.

Multiple independent events may have exactly the same start and end times. Right-click any event, including a read-only Google event, and choose the same-time creation action to open a blank local event with that interval. The same action is available in subscription details and the local edit dialog. Right-clicking empty grid space creates an event at that time. Each new event gets its own identity; its edits and deletion do not change the original event or write to Google Calendar. Overlapping groups use separate lanes, expanding a block into unused lanes where its time interval permits. Long titles are limited to two lines; hover or open the event to read the full title.

Local schedules continue to use the existing `dayweave.entries.v1` storage key and the existing Electron user-data directory. Deadline-only entries remain stored but are not shown as timed blocks. Subscription addresses, cached events, local extensions, and completion acknowledgements retain their existing storage locations.

## Current-task actions

Already-started overlapping events appear in a collapsed Concurrent section with a count; expanding it shows names and actual start/end times. Next includes only events whose start is later than the current instant. At the exact start time, an event becomes current/concurrent instead of remaining in the upcoming row; an event ending now is no longer concurrent. If there is no future event, the upcoming row is hidden. Future overlaps retain a separate warning.

The strip always favors a concrete item title over a task-count placeholder. With no active timed event, it shows an explicitly selected imported task or a task due today; otherwise it shows the next scheduled event. When neither exists, undated and upcoming tasks take priority over overdue tasks. The expanded strip lists individual pending tasks and allows selecting the title to display. The selection is remembered locally. Pending tasks do not acquire an invented duration or progress bar. The header sync icon provides source status and manual refresh while retaining cached data on failure.

Imported pending tasks have completion checkboxes in the calendar list, the expanded task list, and the selected-task header. Checking one records completion locally under `dayweave.tasks.completed.v1`, removes it from pending counts and strip selection, and keeps it hidden after refresh or restart. Calendar > Completed lists completed tasks still present in the connected sources; uncheck an item there to restore it. Completion does not change the source application or delete any local time block created from that task. Passing a task's deadline does not automatically mark it completed. Local completion is separate from the short-lived acknowledgements used for timed calendar events.

The calendar task list shows All, Today, and Upcoming filters, with No Date, Overdue, and Completed in More. Every filter has a count, and an active More selection remains visible. All shows all unfinished tasks, placing today's tasks first and overdue tasks last; Completed is separate. Filters use the local deadline date and combine with the source selector, so counts reflect the selected source. Switching filters returns the list to the top. Task rows show the name and deadline; click or use the keyboard to expand source, list and full description. The schedule icon appears on hover, keyboard focus, expanded rows, and touch devices. Dragging the title to the calendar remains available. The expanded strip's compact task picker retains its collapsible date groups, with Overdue collapsed initially.

Completion updates the current view without a toast. The first imported-task completion shows a dismissible hint explaining local completion and the More > Completed recovery path; dismissing it is remembered. Imported tasks can still be restored by unchecking them in Completed. Calendar and sync controls live in the expanded header; idle and task views have no duplicate action footer or refresh-result message.

Drag an imported task's title or grip into the hourly calendar to preview a one-hour local time block, snapped to fifteen minutes and shortened at midnight. Dropping opens the existing editor with the task title, chosen date, and time. Only Save creates the local block; Cancel makes no change. The source task stays pending and the source application is not modified. The existing Schedule Time button remains available. Calendar edges scroll while dragging, and unknown task identifiers are ignored.

The expanded header's sync icon reports the last successful update on hover. Open it to see each source's update time, errors, and cached-content status. Each source can be refreshed independently; failed connections provide a retry or a direct route to their connection settings. Refresh failure does not erase cached arrangements.

Dismissible first-use hints explain moving the strip, opening its details, adjusting the task/calendar divider, and restoring a completed imported task. Using the corresponding movement/layout control or dismissing a hint records that state under `dayweave.hints.seen.v1`. Dismissed hints do not reopen on subsequent launches.

- The compact strip shows the selected task, remaining time, and a thin progress line along its upper edge. Progress measures elapsed time, not work completed.
- Complete acknowledges the task locally. It does not delete or change the source calendar event.
- Continue for 15 minutes adds time from the later of now and the current planned end. Later conflicts are reported without moving their events.
- Timed arrangements leave the current strip automatically at their end, without a completion click or an end notification. The strip then selects another ongoing arrangement, shows a future item or pending task, or becomes idle. An expired saved selection cannot return after restart or sleep. Past events stay in the calendar and are not marked completed or changed at their source.
- An explicit 15-minute extension keeps the arrangement active only until that new end, then the same automatic transition applies. Local focus state survives app restarts. The expanded action row contains only Complete and Extend 15 minutes. Legacy saved reminder fields are ignored; the app no longer schedules focus reminders or exposes a notification bridge.

## Google account connection

Use Settings > Google Calendar to connect in the system browser and select the calendars to display. Desktop OAuth application registration is supplied by the developer and bundled with the release; users do not import JSON, enter client IDs or configure Google Cloud. Maintainer setup remains documented in `GOOGLE_SETUP.md`. If a build is missing registration, the connection screen reports that the build cannot connect and asks for an updated application, without exposing developer forms. Calendar-list and event scopes are read-only. The app supports one connected Google account with up to 20 selected calendars. Connection screens omit routine counts, read-only explanation paragraphs and disconnect controls; no existing authorization is revoked by these UI changes.

Google account mode reads available event names, locations, descriptions, recurring instances, and original-event links. It preserves the saved iCalendar subscription as a fallback after disconnecting; the Busy-only feed is not overlaid on the account events. An identical iCalendar identity and start time share a stable focus ID, with detailed event data preferred when two selected calendars contain the same event.

Application credentials and authorization tokens are encrypted in the Electron user-data directory. Browser login uses PKCE and a state-checked loopback callback. Google account passwords never enter Dayweave. Google or school access restrictions remain authoritative; account authorization cannot manufacture event details withheld from that account. Actual account authorization requires a real registered desktop client and user consent.

## TickTick and Microsoft To Do

Connection settings start with a single paste-link input that identifies the source automatically. Valid Google, TickTick, and generic calendar feeds are added as independent subscriptions; Google Calendar and Microsoft To Do webpages route to account authorization. A normal TickTick webpage or share link requires an outgoing calendar subscription URL. Up to ten additional feed links coexist with existing account connections and saved feeds. Pasting the same canonical URL refreshes the existing source instead of adding a duplicate.

The default view shows Add schedule link, an input without placeholder copy, Import file, a connected-source count, and a collapsed account-connection option. Explanatory subtitles and routine helper paragraphs are omitted; errors and active authorization feedback appear when relevant. Manage opens the source list, and selecting a source opens its controls. Calendar selection and developer registration forms are not displayed in the default view. Existing Google, TickTick, and legacy feed files remain intact.

TickTick uses an outgoing calendar feed; Microsoft uses a developer-registered desktop application with delegated `Tasks.Read` permission. See `IMPORTS_SETUP.md` for configuration and current limits. Actual Microsoft sign-in requires an application registration and human consent; live provider access is not implied by a successful build. Identifying a link does not bypass account authorization or recover details absent from a feed.

Timed feed events appear in the calendar and strip. Date-only TickTick items and incomplete Microsoft tasks appear in a collapsible task list above the weekly timetable, with source, list, deadline, and description. Schedule time opens a local event form for the user to review and save. No work duration is invented from a task's due date, and no task is marked complete in the source app.

Each provider stores authorization or a feed address separately. Removing one does not remove the other connections. Microsoft disconnect clears local authorization; remote consent can be removed in the Microsoft account's app settings. The older Google-hosted iCalendar address remains a fallback while Google account mode is active; independent non-Google feeds remain visible.

## Other calendar subscriptions

### Local university timetable files

Settings > Import timetable file supports `.ics` / `.ical` exports without a Google or Microsoft account. The app previews source counts and sample events before confirmation. A file is an independent, read-only snapshot, expands recurring events when browsing weeks, survives restart, and never polls a server. Exact duplicate file contents are rejected. Manage > Replace file previews a new export and replaces that source while preserving its identity and leaving other sources alone. Removing a source clears its saved content. Complete ICS content is encrypted with operating-system secure storage; limits are 8 MB per calendar and ten additional sources shared with feed links.

The same paste-link field also accepts direct PDF downloads. Detection uses response bytes, including downloads without a filename extension or with a generic MIME type. Calendar content becomes a subscription; a PDF opens the local assisted workflow without creating a source until confirmation. HTML/teaching-system/login pages provide an export-file instruction. Downloads omit account cookies, validate HTTPS redirects, time out after 20 seconds, and enforce 8 MB for calendars / 20 MB for PDFs. PDF links are read once; the original URL is not saved as a subscription. Private signed links are not included in errors or displayed as filenames.

Non-empty invalid input keeps Add available so submission can explain the failure. Address validation runs on blur or submit, not during typing, and reports malformed/incomplete addresses, spaces and unsupported schemes directly below the field. Editing clears the prior failure. A valid URL that returns unsupported content is distinguished from address errors, missing/expired links, access restrictions and connectivity failures. Existing sources remain intact after an unsuccessful add.

PDF recognizes a supported text timetable layout with seven weekday columns, explicit `(1-2节)2-17周` metadata and a period/time column. It reads all pages using rotated text coordinates, carries columns across continuation pages, and pairs period numbers/times even when a row crosses a page boundary. Names, weekdays, weeks, actual period times, campuses/classrooms and source descriptions are prefilled for review. Odd/even weeks remain explicit. Long multi-period sessions get a review notice about breaks. Untimed courses under “其他课程” can optionally become undated tasks, with their source notes retained; no meeting time or deadline is invented. Unsupported layouts and scans fall back to manual entry rather than silent guessed schedules.

The first teaching week's Monday is always left for the user to enter: the academic year, semester and print timestamp cannot establish it. After review, preview and confirm to save; classes use `Asia/Shanghai`. Week expressions include `1-16`, `1-16单`, `2-16双` and `1,3,5`. The reader, CJK character maps, fonts and image-decoding resources are bundled for local/offline use, with no document upload or CDN; limits are 20 MB / 30 pages. Only the confirmed generated calendar is retained, so keep the original PDF separately. Schedule changes require re-exporting/replacing the file. Synthetic tests contain no student identities; `DAYWEAVE_TEST_PDF` optionally supplies a real local sample to `npm run test:imports-ui` in an isolated temporary profile.

Open the task actions, then Settings. Paste an HTTPS or webcal iCalendar feed address and add it. The app recognizes its source and maintains each connection independently. For Google Calendar, use Settings > the selected calendar > Integrate calendar > Secret address in iCal format. A normal webpage or sharing-page URL is not a feed address; supported account pages are routed to authorization instead.

Downloads use Electron networking and follow Windows proxy configuration. Errors distinguish HTTP failures, timeouts, invalid content, unsupported recurrence, and secure-storage failures without revealing the private address. The connection status shows the source calendar name when provided and the number of imported timed events. A subscription URL represents one calendar, not every calendar overlaid in Google Calendar. Busy-only titles are shown as supplied by the provider, with a source warning; Dayweave cannot reconstruct hidden event names. Safe source diagnostics distinguish public and secret Google feed paths and count raw event blocks and Busy-only summaries without storing or logging the private URL. When every raw event summary is Busy, the interface states that the source supplies availability information only.

The feed refreshes every five minutes. Manual refresh and removal are available. A failed refresh retains the last successful cached schedule. Provider-side updates can be delayed even when a refresh succeeds.

The address is encrypted using operating-system secure storage. Event titles and times are stored locally as ordinary app data. Private feed addresses are not printed in app logs.

Each feed expands the entire current week and the following two weeks for focus selection, plus the week currently being viewed, including time zones, recurrence exclusions, and modified occurrences. Disjoint weeks are expanded separately instead of expanding every date between them. Full downloaded feeds stay in memory only; expanded events and source metadata are cached on disk. Week navigation reuses in-memory feeds. Explicit refresh downloads the current source; TickTick is polled every minute and other calendar feeds every five minutes. TickTick date-only and supported deadline tasks appear in the pending list; general all-day calendar events do not become work blocks. Sub-hourly repetition and remote calendar edits remain outside scope. Matching event identities can be merged, but similar titles alone are not considered duplicates.

## Development

```powershell
npm install
npm run dev
npm run typecheck
npm run build
npm start
```

The project uses Electron, React, TypeScript, electron-vite, Lucide icons, and node-ical. Calendar parsing and its recurrence dependencies are bundled into the main process output. See `THIRD_PARTY_NOTICES.md` for dependency notices.

## Main files

- `src/main/index.ts`: floating-window startup, tray menu, and shortcuts.
- `src/main/focus-window.ts`: window anchoring, resize requests, subscription IPC, and notifications.
- `src/shared/focus-window-layout.ts`: compact anchor, expansion direction, and display bounds.
- `src/main/google-oauth.ts`: system-browser authorization, PKCE, loopback callback, token refresh, and safe errors.
- `src/main/google-calendar.ts`: encrypted authorization, calendar selection, event paging, detail mapping, and cached refresh.
- `src/renderer/src/components/GoogleConnection.tsx`: configuration import, connection status, and selected calendars.
- `src/main/calendar-subscription.ts`: downloads, encrypted address storage, refresh, and offline cache.
- `src/main/calendar-feed.ts` and `calendar-errors.ts`: feed parsing and safe failure messages.
- `src/shared/focus.ts`: task selection, elapsed time, conflicts, and local extensions.
- `src/renderer/src/FocusBar.tsx` and `focus.css`: compact strip, pull interaction, actions, and settings.
- `src/renderer/src/focus-theme.css`: shared appearance tokens, joined floating-card surfaces, type hierarchy, and calendar/control styling.
- `src/renderer/src/components/CalendarPanel.tsx` and `calendar-panel.css`: calendar drawer and local event editing.
- `src/renderer/src/calendar-imports.ts`: read-only subscription blocks, split by local date.
- `src/renderer/src/components/WeekCalendar.tsx`: week grid and local editing gestures.

Earlier wallpaper attachment and calendar-frame sources remain in the repository for reference. The current application entry point does not load the desktop helper, attach to Explorer, create a wallpaper calendar, or expose pin-to-desktop controls.



## macOS test version

Separate Apple Silicon and Intel test packages are available in release/. See MAC_TESTING.md for choosing a package, installation, menu-bar controls, and the remaining real-Mac checks.

