# Bluetooth Earphone Counter

A private, local-only counter built with plain HTML, CSS, and vanilla
JavaScript. It can be opened directly in a browser or hosted as static files.
There is no backend, database, analytics, external API, library, or network
request in this project.

## Files

- `index.html` contains the accessible counter, daily history, and media-control
  status interface.
- `styles.css` contains the responsive mobile-first light/dark-friendly design.
- `script.js` contains the counter, LocalStorage state model, daily history,
  undo behavior, and isolated Media Session experiment.
- `README.md` contains usage, privacy, compatibility, and testing notes.

## Run locally

Open `index.html` in a modern browser. No build step or internet connection is
required. Alternatively, from this directory run:

```text
python -m http.server
```

Then visit `http://localhost:8000/`.

## How the counter works

- The count starts at zero when this browser origin has no saved state.
- `+1`, decrement, and the Space shortcut record a supported operation.
- Decrement never lowers a daily count below zero.
- `Undo last` reverses the most recent supported increment or decrement,
  including an operation from an earlier date if it is still the newest undo
  entry.
- `Reset` sets only today's count to zero. It deliberately keeps previous
  dates, records today's explicit zero, and removes today's pending undo
  operations.
- `Clear history` removes every daily record and undo entry only after a
  confirmation dialog. It is different from Reset and cannot be undone.
- The lifetime total is recalculated from the saved daily records. No
  unvisited or missed dates are fabricated.

The current date is generated from the device's local year, month, and day in
`YYYY-MM-DD` form. Returning after midnight refreshes the display without
assigning old activity to the new date. Changing the device clock can affect
which local date receives a count.

## Daily history

Each used date has one local daily summary, shown with the most recent date
first. A date is created when a count operation occurs; a zero entry can also
be created deliberately by using Reset. Dates with no recorded activity are
not added. The current-day count and lifetime total are shown separately.

## LocalStorage privacy

All counter data is stored only in this browser's LocalStorage under the
`earphone-counter-state` key. The application does not send counts or history
to GitHub, a server, analytics, or any third party.

GitHub stores source code only when the user pushes the project. LocalStorage
data is not included in a normal Git commit, and cloning this repository does
not transfer another person's browser counts. LocalStorage is not encrypted:
someone with access to the same browser profile and origin may be able to read
it. The application handles missing, malformed, and inaccessible storage
without using hard-coded example counts.

## Experimental Bluetooth media controls

The optional **Start Silent Media Session** button creates a one-second,
locally generated PCM WAV containing digital silence, then starts it only after
the user clicks the button. The audio is looped so the browser has an active
media session to experiment with. **Stop Silent Media Session** pauses the
audio, unregisters handlers, clears metadata, removes the audio element, and
revokes its object URL. Starting or stopping does not change the counter.

Media Session API handlers are attempted for `play`, `pause`, `seekbackward`,
`seekforward`, `previoustrack`, and `nexttrack` for the active session. Browsers
may reject individual actions; the diagnostic log records which handlers were
actually registered. If the browser invokes any registered action handler, one
count is recorded regardless of action type. Repeated delivery of the same
action within a short 250 ms browser-event window is ignored, while different
actions are not globally suppressed. Audio `play` and `pause` events are
diagnostic-only and never increment the counter. This is an experiment, not
Bluetooth detection:

The action handlers are registered before the awaited `audio.play()` call so
the first command is not lost during startup. The UI reports the session as
active only after playback succeeds. The deduplication guard is action-specific:
an immediate repeated `pause` is treated as duplicate browser delivery, but a
legitimate alternating `pause` then `play` sequence is not discarded by one
broad global debounce. Media Session callbacks do not include a universal
hardware event ID, so a webpage cannot perfectly distinguish an OS duplicate
callback from two extremely rapid presses of the same action.

The page does not stop or unregister the session when it becomes hidden,
backgrounded, or placed in the back-forward cache. It logs `visibilitychange`,
`pagehide`, and `pageshow`, along with audio `stalled`, `suspend`, `waiting`,
and `ended` events. When returning to the page, it makes one guarded attempt to
resume a session that the browser paused; this attempt never increments the
counter. The page does not use autoplay tricks, audible keep-alive audio, or
CPU-intensive loops.

Chrome and the operating system still choose which tab owns hardware media
commands. If YouTube or another tab is actively playing audio or video, its
Media Session may take priority even when the sound is routed to laptop
speakers. There is no supported webpage API to force the earphone command to
this tab, and the counter cannot observe a command that Chrome does not
deliver to it. The background status therefore distinguishes “registered” from
“command received”; it does not claim that background detection is guaranteed.
The feasible alternatives are to pause/stop the competing tab while testing,
use a browser/OS configuration that routes the command to this session, or use
a native Android media-session application for reliable background media-button
handling.

- The page does not scan for devices or request microphone/Bluetooth
  permissions.
- It does not claim that an earphone is connected.
- Media Session support and physical button exposure vary by browser,
  operating system, browser tab state, and device.
- A “session active” status means silent playback and handlers started, not
  that a physical button works. A “command received” status means the browser
  delivered a Media Session action to the page; it still does not prove which
  device sent it or universal support.
- The app reports playback failure separately and never claims success merely
  because a media session was created.
- If the API is unavailable or rejected, manual counting remains functional.
- Enable **diagnostic logging** before testing to see relevant events in the
  browser console. No logs are sent anywhere.

For a Windows Chrome/Edge experiment, open the page, enable diagnostic
logging, click Start Silent Media Session, and inspect DevTools Console output
while pressing Play/Pause, Next, Previous, or seek controls on a supported
headset. Click Stop when finished.
Repeat with Android Chrome and a connected headset, keeping the page available
and checking the console. Results can differ by browser version,
Android/Windows media-session integration, playback policy, headset firmware,
whether the page is active, and whether Android suspends the tab or audio
session. A lack of a command is an inconclusive unsupported result, not proof
that the headset is not connected. Background delivery cannot be guaranteed
by a webpage; if Chrome or Android suspends the page/session, a native Android
media-session implementation is required for reliable background handling.

## Manual test checklist

1. Clear the site storage or use a fresh browser profile; confirm the count,
   today's count, lifetime total, and history start at zero/empty.
2. Increment, decrement, and press Space on the page background. Confirm the
   count and today's history entry update.
3. At zero, click Decrement repeatedly and confirm it never becomes negative.
4. Make several changes, click Undo last repeatedly, and confirm each latest
   supported operation is reversed once.
5. Refresh and confirm the current count, daily history, lifetime total, and
   undo state persist.
6. Change the device date or test across midnight; confirm a new local date
   starts at zero while earlier records remain. Restore the device clock after
   testing.
7. Click Reset and confirm only today's count is zero and earlier dates remain.
8. Click Clear history, cancel the confirmation, and confirm nothing changes;
   accept it and confirm the history and lifetime total are empty.
9. Enter an invalid value such as `{bad json` for the storage key in DevTools,
   reload, and confirm the page reports a safe initialization without errors.
10. Enable diagnostic logging and test Start/Stop Silent Media Session where
    available. Confirm starting and stopping do not change the count, and that
    the console lists each registered or rejected action. Manually invoke or
    physically test each exposed action and confirm its exact action name is
    logged and each accepted action increments once.
11. Switch to another tab and return. Confirm visibility, pagehide/pageshow,
    and audio-health diagnostics appear, and that no lifecycle event changes
    the count. If the browser pauses audio, confirm the guarded resume attempt
    reports the result honestly.
12. Test keyboard focus, visible focus rings, narrow phone width, tablet width,
    dark mode, and a browser with JavaScript disabled as a graceful static
    page failure mode.

For a physical-device test, start from a fresh count, start the silent session,
then test Play/Pause, Next, Previous, and any seek buttons separately. Verify
that each button increments only when Chrome logs its corresponding Media
Session action. Test two rapid presses of the same button and alternating
buttons separately; the page cannot reliably distinguish a browser duplicate
callback from two identical presses inside the 250 ms guard window.

To test media-session conflicts specifically:

1. Start the session with the counter visible and confirm its active status.
2. Switch to another tab with media paused; press the headset button and check
   whether the counter receives and logs the action.
3. Start YouTube or other media in that tab, with output routed to the laptop
   speakers. Press the headset button again and inspect both tabs' diagnostics.
4. If the counter receives no action, that is browser media-session priority,
   not a JavaScript event the page can recover or synthesize. Pause the other
   tab and repeat to compare.
5. Return to the counter and verify its count/history changed only for actions
   Chrome actually delivered. Lock/unlock testing is likewise subject to
   Android background restrictions.

Android Chrome may not expose headset actions to a webpage at all, even when
the headset is connected. JavaScript cannot directly listen to every Bluetooth
hardware button. Reliable access to Android media-button events generally
requires a native Android application using Android media-session APIs such as
`MediaSession`/`MediaSessionCompat` and, where appropriate, a media button
receiver or `MediaBrowserService`, subject to Android background and audio
focus rules.
