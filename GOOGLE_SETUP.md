# Connect Google Calendar to Dayweave

This development build needs a Google Cloud desktop OAuth client. The developer creates this application configuration once; a distributed release should include its registered desktop client so ordinary users only need to connect their account.

## 1. Prepare the Google Cloud application

1. Open [Google Cloud Console](https://console.cloud.google.com/) and select or create a project.
2. Enable [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) for that project.
3. Open Google Auth platform > Branding. Configure the app name as Dayweave, a support email, and a developer contact email.
4. Open Audience. For a personal development project, select External and leave the publishing status as Testing. Add the exact school account that will authorize Dayweave to Test users. A personal Google account can own the Cloud project; the school account can be a test user. An Internal application is appropriate only when the project belongs to the same Workspace organization as its intended users.
5. Open Data Access and add these scopes:

   - `https://www.googleapis.com/auth/calendar.events.readonly`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`

6. Open Clients > Create client. Choose Desktop app and name it Dayweave Desktop. The current app is a conventional user-controlled calendar reader, not an AI agent acting on a user's behalf.
7. Download the client's JSON configuration. Keep it outside the repository; do not paste its contents into chat or commit it to Git.

The downloaded file must have an `installed` object with a `client_id` ending in `.apps.googleusercontent.com`. Web application and service-account credentials are not interchangeable with this desktop configuration.

## 2. Connect in Dayweave

1. Open the floating strip's controls, then Settings.
2. In the Google Calendar section, import the desktop application JSON using the file picker.
3. Click Connect Google account. Dayweave opens the system browser.
4. The user signs in and grants the requested read-only permissions. Dayweave never asks for or receives the Google account password.
5. Return to Dayweave, select the calendars to display, including the school course calendar, then synchronize the selection.
6. Open the weekly timetable. Imported events are read-only. Clicking one shows its available title, location, description, and a button to open the original Google Calendar event.

The browser flow uses PKCE, a random state value, and an ephemeral listener bound only to `127.0.0.1`. The browser callback page contains no authorization code or token. Client configuration and authorization tokens are encrypted with Windows secure storage in the Electron user-data directory. Tokens and private feed addresses are never returned to the renderer or written into logs. Calendar details are cached locally as ordinary app data.

## 3. Expected behavior and limits

- Only calendar-list and event read permissions are requested. Dayweave does not create, modify, or delete remote events.
- The selected Google calendars are displayed alongside independent TickTick and non-Google calendar feeds. A previous Google-hosted iCalendar address remains a fallback after disconnecting the Google account; it is not overlaid as a duplicate Busy calendar. Microsoft To Do tasks can also be shown in the pending-task list; see `IMPORTS_SETUP.md`.
- Event paging, recurring instances, selected calendars, and viewed-week ranges are handled through Google Calendar API. Local entries remain editable and independent.
- Up to 20 calendars and 5000 timed events are supported. All-day events are not displayed as time blocks in this version.
- Authorization does not override Google event privacy, calendar access roles, or school policies. A calendar with only free/busy access cannot supply event names. A school administrator may also block the app from being authorized.
- If Google reports that access is blocked or the app requires verification, follow Google's normal approval process; Dayweave does not bypass browser or account safety screens. External production distribution can require Google verification for the requested scopes.
- Testing-mode authorizations can expire and require reconnecting. The app retains the last downloaded schedule when a refresh fails and displays an authorization or connection message.
- Disconnect clears the app's local authorization and requests Google token revocation. If the network prevents revocation, check the Google account's third-party connections to complete removal.

## Official references

- [Google Calendar quickstart and Cloud configuration](https://developers.google.com/workspace/calendar/api/quickstart/nodejs)
- [Desktop OAuth flow and PKCE](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Calendar authorization scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Calendar access roles](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList)
- [Event paging and recurrence expansion](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
