# Task imports

Dayweave can display Google Calendar, a TickTick calendar feed, Microsoft To Do tasks, and local entries together. Each connection has separate storage and controls. This version imports read-only data; it does not change, complete, or delete remote items.

## One entry point

Open connection settings and paste a link into the single input. Source detection recognizes Google Calendar, TickTick/Dida, Microsoft To Do, and generic HTTPS/webcal calendar feeds. It distinguishes known account pages from outgoing calendar feeds. A detected account page can require user authorization; recognizing a hostname does not make private tasks publicly readable. TickTick webpage/share links require the outgoing subscription URL.

Adding a valid feed creates an independent source, with up to ten additional feeds. An identical canonical URL refreshes the existing source. The URL is encrypted in its source file; only a random source identifier and provider kind enter `calendar-links.json`. Old Google and TickTick feed files are retained without migration. Manage opens compact source rows, and selecting one opens its details, refresh, selection, or removal controls. Account registration and selection forms are hidden from the default view.

## TickTick

1. In TickTick, find the option to subscribe to TickTick from another calendar application. Copy the calendar subscription URL. This is an outgoing TickTick feed, not the field used to add Google calendars into TickTick.
2. Open Dayweave's connection settings and paste the URL in the unified link input. The app detects TickTick automatically.
3. Valid timed events appear in the weekly timetable and floating strip. Date-only events and supported VTODO items appear in the pending-task list above the timetable.
4. Choose Schedule time on a pending task to open a new local event. Review its date and duration and save it. This does not edit the TickTick task.

The feed must return an iCalendar document through HTTPS or webcal. Only items included by TickTick can be imported; an absent task cannot be reconstructed. Availability of the outgoing feed depends on the user's TickTick version/account. TickTick refresh runs every minute, subject to provider caching. Refresh arrangements in the expanded strip requests current data immediately. A failed refresh retains the last successful cache. Feed addresses are encrypted with Windows secure storage and are not exposed back to the renderer.

When no timed event is active, the strip shows a specific pending task title instead of a task count. Expanding it lists the imported tasks with source and deadline; clicking one changes the strip selection without modifying the source app. Task dates alone never imply an automatic work duration or time-progress percentage.

Non-recurring date-only events, point deadlines, and incomplete VTODOs are shown without inventing a duration. Point deadlines retain their supplied time. Recurring date-only events, point deadlines, and timed blocks are expanded for the current week, the following two weeks, and the viewed week. Recurring VTODOs are not supported and produce an explicit import error. Completed items are excluded when their completion status is present. Provider feeds may omit completion status, unscheduled tasks, or task details.

## Microsoft To Do: developer setup

The application developer registers Dayweave once. A release should supply its own registered application ID so ordinary users only need to connect an account. This development build exposes configuration under Developer settings, and also accepts the `DAYWEAVE_MICROSOFT_CLIENT_ID` environment variable. The application ID is a public identifier, not a client secret.

1. Open [Microsoft Entra admin center](https://entra.microsoft.com/), then App registrations > New registration.
2. Name the application Dayweave. To support both organizational and personal Microsoft accounts, choose Accounts in any organizational directory and personal Microsoft accounts.
3. Under Authentication, add the Mobile and desktop applications platform with the exact redirect URI `http://localhost/oauth2callback`. Do not configure this redirect as a Web or SPA client. The application binds a random loopback port; Microsoft ignores the port when matching localhost desktop redirect URIs.
4. Add Microsoft Graph delegated permission `Tasks.Read`. Dayweave also requests `offline_access` for refresh tokens. No application-wide task permission or client secret is needed. Remove unrelated default permissions if they are unused.
5. Copy Application (client) ID from Overview. In Dayweave, open More connection methods > Microsoft account > Developer settings, enter the ID, and save. The ID remains on this machine. It can alternatively be provided through the environment when packaging/launching a development build.
6. Connect Microsoft To Do in the system browser. The human user signs in and grants permission. Organization administrators can restrict registration or consent; a developer application cannot override these restrictions.
7. Select task lists in Dayweave, then synchronize the selection. Personal and work/school accounts are supported when the application registration and tenant permit them. This build uses the global Microsoft service, not national-cloud endpoints.

If you cannot register an app in the selected Entra tenant, its administrator must allow registration or provide a registered client. Do not use another application's client ID or attempt to bypass account policies. Entra registration availability and any tenant subscription requirements are controlled by Microsoft; Dayweave does not require renting a cloud server.

## Microsoft To Do behavior

- Only task-list and task reads are performed using Microsoft Graph `Tasks.Read`. Tasks with completed status are excluded. Up to 20 selected lists and 5000 unfinished tasks are displayed; each list download has a 10000-item safety cap, including completed source records.
- Deadlines remain dates, not automatic time blocks. Tasks without a deadline are included. A due date is not treated as a work-session end time. Recurring tasks are shown as returned by Microsoft To Do; Dayweave does not fabricate future repetitions.
- Schedule time creates an independent local event after the user reviews and saves the form. It does not mark the source task complete or write the chosen duration back to Microsoft.
- Pagination, token refresh, five-minute polling, per-list selection, and offline cache are supported. Authorization and refresh tokens are encrypted in the main process. Only task data and connection state reach the renderer.
- List and task requests use `$top` paging without `$select`: some To Do accounts reject field projection with HTTP 400 even after successful authorization. A read failure is shown separately from a successful zero-task result, with cached counts identified when available.
- Disconnect clears local tokens and cached tasks. Microsoft consent may remain in the user's account settings; remove Dayweave there to revoke remote consent. Dayweave does not request broad permissions to revoke all account sessions.
- Task descriptions and deadlines are ordinary locally cached application data. Each source can be disconnected independently without deleting local schedules or other connections.

## School and generic calendar feeds

Any valid HTTPS/webcal iCalendar subscription can use the unified link input. This does not require a school-specific login integration. Generic timed events, all-day events, VTODO items and point deadlines use distinct display paths. An all-day event remains an all-day calendar item; only TickTick's known date-only task feed is mapped to pending tasks. Generic task completions remain local to Dayweave.

The complete latest downloaded calendar is encrypted separately from the expanded display cache. Open connection management, select a feed and choose View complete source to inspect all source records and extensions. A source's record counts describe the original calendar components; recurring instances and the currently viewed date range can yield different display counts. Missing source information cannot be reconstructed. Recurring VTODOs and unprojected component kinds are explicitly identified. Original calendar alarms are retained as source information and are not scheduled as Dayweave notifications.

## Original Google feed compatibility

When a Google account is connected, an older Google-hosted iCalendar feed remains a fallback and is not overlaid as a duplicate Busy source. A separately connected TickTick feed, Microsoft tasks, and non-Google iCalendar feed remain visible. Imported Google event details still offer the original-event link.

## Official references

- [TickTick calendar subscriptions](https://help.ticktick.com/articles/7055781614550253568)
- [Microsoft task-list reads](https://learn.microsoft.com/en-us/graph/api/todo-list-lists?view=graph-rest-1.0)
- [Microsoft task reads and permissions](https://learn.microsoft.com/en-us/graph/api/todotasklist-list-tasks?view=graph-rest-1.0)
- [Task properties](https://learn.microsoft.com/en-us/graph/api/resources/todotask?view=graph-rest-1.0)
- [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Desktop localhost redirect rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url#localhost-exceptions)
