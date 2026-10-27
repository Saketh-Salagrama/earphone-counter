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

Media Session API handlers for `play` and `pause` are registered only for the
active session. If the browser actually invokes one of those handlers, one
count is recorded with a short duplicate-command guard. Audio `play` and
`pause` events are diagnostic-only and never increment the counter. This is an
experiment, not Bluetooth detection:

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
while pressing Play/Pause on a supported headset. Click Stop when finished.
Repeat with Android Chrome and a connected headset, keeping the page available
and checking the console. Results can differ by browser version,
Android/Windows media-session integration, playback policy, headset firmware,
and whether the page is active. A lack of a command is an inconclusive
unsupported result, not proof that the headset is not connected.

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
    unsupported, starting, active, failure, stopped, and command-received
    wording is honest. Manual controls must still work.
11. Test keyboard focus, visible focus rings, narrow phone width, tablet width,
    dark mode, and a browser with JavaScript disabled as a graceful static
    page failure mode.

For a physical-device test, start from a fresh count, start the silent session,
press the headset Play/Pause button once, and verify the count changes only if
the browser reports a `play` or `pause` action. Press it twice and verify the
two commands are not collapsed unless they arrive within the duplicate-command
guard window. Test browser-generated media controls separately; the page cannot
reliably distinguish those from a physical headset command.
