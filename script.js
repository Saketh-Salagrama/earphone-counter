(function () {
  "use strict";

  const STORAGE_KEY = "earphone-counter-state";
  const STATE_VERSION = 2;
  const countElement = document.querySelector("#count");
  const todayCountElement = document.querySelector("#today-count");
  const lifetimeCountElement = document.querySelector("#lifetime-count");
  const currentDateElement = document.querySelector("#current-date");
  const historyListElement = document.querySelector("#history-list");
  const incrementButton = document.querySelector("#increment-button");
  const decrementButton = document.querySelector("#decrement-button");
  const undoButton = document.querySelector("#undo-button");
  const resetButton = document.querySelector("#reset-button");
  const clearHistoryButton = document.querySelector("#clear-history-button");
  const saveStatus = document.querySelector("#save-status");
  const startMediaButton = document.querySelector("#start-media-button");
  const stopMediaButton = document.querySelector("#stop-media-button");
  const diagnosticToggle = document.querySelector("#diagnostic-toggle");
  const mediaStatus = document.querySelector("#media-status");
  const mediaDetail = document.querySelector("#media-detail");

  let state = loadState();
  let mediaMode = "unsupported";
  let silentAudio = null;
  let silentAudioUrl = null;
  let mediaHandlersRegistered = false;
  let mediaSessionReady = false;
  const registeredMediaActions = new Set();
  const lastMediaActionAt = new Map();
  const MEDIA_ACTIONS = [
    "play",
    "pause",
    "seekbackward",
    "seekforward",
    "previoustrack",
    "nexttrack"
  ];
  const MEDIA_DUPLICATE_WINDOW_MS = 250;

  function createEmptyState() {
    return {
      version: STATE_VERSION,
      dailyHistory: {},
      undoStack: []
    };
  }

  function isDateKey(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function isValidCount(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function isValidState(value) {
    if (!value || value.version !== STATE_VERSION
      || !value.dailyHistory || typeof value.dailyHistory !== "object"
      || !Array.isArray(value.undoStack)) {
      return false;
    }

    const hasValidHistory = Object.entries(value.dailyHistory).every(([date, count]) => (
      isDateKey(date) && isValidCount(count)
    ));
    const hasValidUndo = value.undoStack.every((operation) => (
      operation
      && isDateKey(operation.date)
      && (operation.delta === 1 || operation.delta === -1)
    ));
    return hasValidHistory && hasValidUndo;
  }

  function migrateLegacyState(value) {
    if (!value || !isValidCount(value.count) || !Array.isArray(value.history)
      || !value.history.every(isValidCount)) {
      return null;
    }

    const migratedState = createEmptyState();
    const today = getLocalDateKey();
    if (value.count > 0 || value.history.length > 0) {
      migratedState.dailyHistory[today] = value.count;
    }

    // Legacy history stored the count before each operation in chronological
    // order, so reconstruct only adjacent single-step operations.
    const legacySequence = value.history.concat(value.count);
    legacySequence.slice(0, -1).forEach((previousCount, index) => {
      const delta = legacySequence[index + 1] - previousCount;
      if (delta === 1 || delta === -1) {
        migratedState.undoStack.push({ date: today, delta });
      }
    });
    return migratedState;
  }

  function loadState() {
    try {
      const rawState = localStorage.getItem(STORAGE_KEY);
      if (!rawState) {
        return createEmptyState();
      }

      const parsedState = JSON.parse(rawState);
      if (isValidState(parsedState)) {
        return parsedState;
      }

      const migratedState = migrateLegacyState(parsedState);
      if (migratedState) {
        return migratedState;
      }

      saveStatus.textContent = "Saved data was invalid; started safely at zero";
      return createEmptyState();
    } catch (error) {
      console.warn("Unable to load saved counter state.", error);
      saveStatus.textContent = "Saved data could not be read; started safely at zero";
      return createEmptyState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      saveStatus.textContent = "Saved locally";
      return true;
    } catch (error) {
      saveStatus.textContent = "Could not save locally";
      console.warn("Unable to save counter state.", error);
      return false;
    }
  }

  function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDate(dateKey) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(year, month - 1, day));
  }

  function getTodayCount() {
    return state.dailyHistory[getLocalDateKey()] || 0;
  }

  function getLifetimeTotal() {
    return Object.values(state.dailyHistory).reduce((total, count) => total + count, 0);
  }

  function renderHistory() {
    const dates = Object.keys(state.dailyHistory).sort().reverse();
    historyListElement.replaceChildren();

    if (dates.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.className = "empty-state";
      emptyMessage.textContent = "No counting activity has been recorded yet.";
      historyListElement.append(emptyMessage);
      return;
    }

    dates.forEach((date) => {
      const item = document.createElement("div");
      item.className = "history-item";
      const dateLabel = document.createElement("span");
      const countLabel = document.createElement("strong");
      dateLabel.textContent = formatDate(date);
      countLabel.textContent = String(state.dailyHistory[date]);
      item.append(dateLabel, countLabel);
      historyListElement.append(item);
    });
  }

  function render() {
    const todayCount = getTodayCount();
    countElement.textContent = String(todayCount);
    todayCountElement.textContent = String(todayCount);
    lifetimeCountElement.textContent = String(getLifetimeTotal());
    currentDateElement.textContent = formatDate(getLocalDateKey());
    undoButton.disabled = state.undoStack.length === 0;
    renderHistory();
  }

  function logMedia(message, details) {
    if (diagnosticToggle.checked) {
      console.info(`[Earphone Counter] ${message}`, details || "");
    }
  }

  function createSilentWavBlob() {
    const sampleRate = 8000;
    const sampleCount = sampleRate;
    const dataSize = sampleCount;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeText(offset, text) {
      for (let index = 0; index < text.length; index += 1) {
        view.setUint8(offset + index, text.charCodeAt(index));
      }
    }

    writeText(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    writeText(36, "data");
    view.setUint32(40, dataSize, true);
    for (let index = 0; index < dataSize; index += 1) {
      view.setUint8(44 + index, 128);
    }

    return new Blob([buffer], { type: "audio/wav" });
  }

  function setMediaStatus(status, detail) {
    mediaStatus.innerHTML = `<strong>${status}</strong>`;
    mediaDetail.textContent = detail;
  }

  function handleMediaCommand(command) {
    if (!mediaSessionReady) {
      logMedia("Ignored Media Session action during startup.", {
        action: command,
        reason: "session-not-ready"
      });
      return;
    }

    const now = Date.now();
    const previousTime = lastMediaActionAt.get(command);
    const isDuplicate = previousTime !== undefined
      && now - previousTime < MEDIA_DUPLICATE_WINDOW_MS;

    if (isDuplicate) {
      logMedia("Ignored duplicate Media Session action.", {
        command,
        elapsedMs: now - previousTime
      });
      return;
    }

    lastMediaActionAt.set(command, now);
    recordCountOperation(1, "media-control");
    setMediaStatus(
      `${formatMediaAction(command)} command received`,
      `The browser delivered the "${command}" Media Session action. This does not prove which physical device sent it.`
    );
    logMedia("Accepted Media Session action as one count.", {
      action: command,
      source: "Media Session action handler"
    });

    // Keep the session available for another command. Audio play/pause events
    // themselves never call recordCountOperation.
    if (silentAudio && silentAudio.paused) {
      silentAudio.play().catch((error) => {
        setMediaStatus(
          "Playback blocked or failed",
          "The media command arrived, but the silent session could not resume."
        );
        console.warn("Unable to resume silent media session.", error);
      });
    }
  }

  function updatePlaybackState(playbackState) {
    if (!navigator.mediaSession) {
      return;
    }

    try {
      navigator.mediaSession.playbackState = playbackState;
    } catch (error) {
      logMedia("Unable to update Media Session playback state.", { playbackState });
    }
  }

  function formatMediaAction(action) {
    return action
      .replace("previoustrack", "Previous track")
      .replace("nexttrack", "Next track")
      .replace("seekbackward", "Seek backward")
      .replace("seekforward", "Seek forward")
      .replace("play", "Play")
      .replace("pause", "Pause");
  }

  function registerMediaHandlers() {
    if (!navigator.mediaSession || typeof navigator.mediaSession.setActionHandler !== "function") {
      return false;
    }

    registeredMediaActions.clear();
    MEDIA_ACTIONS.forEach((action) => {
      try {
        navigator.mediaSession.setActionHandler(action, () => handleMediaCommand(action));
        registeredMediaActions.add(action);
        logMedia("Registered Media Session action handler.", { action });
      } catch (error) {
        logMedia("Media Session action is unsupported or rejected.", { action });
        console.warn(`Unable to configure ${action} Media Session handler.`, error);
      }
    });
    mediaHandlersRegistered = registeredMediaActions.size > 0;
    return mediaHandlersRegistered;
  }

  function unregisterMediaHandlers() {
    if (!navigator.mediaSession || typeof navigator.mediaSession.setActionHandler !== "function") {
      return true;
    }

    let cleanupSucceeded = true;
    registeredMediaActions.forEach((action) => {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch (error) {
        cleanupSucceeded = false;
        console.warn(`Unable to remove ${action} Media Session handler.`, error);
      }
    });
    registeredMediaActions.clear();
    mediaHandlersRegistered = false;
    return cleanupSucceeded;
  }

  function cleanupSilentSession() {
    mediaSessionReady = false;
    let cleanupSucceeded = unregisterMediaHandlers();
    if (navigator.mediaSession) {
      try {
        navigator.mediaSession.playbackState = "none";
        navigator.mediaSession.metadata = null;
      } catch (error) {
        cleanupSucceeded = false;
        console.warn("Unable to clear Media Session state.", error);
      }
    }

    if (silentAudio) {
      silentAudio.pause();
      silentAudio.removeEventListener("play", handleAudioPlay);
      silentAudio.removeEventListener("pause", handleAudioPause);
      silentAudio.removeEventListener("error", handleAudioError);
      silentAudio.removeEventListener("stalled", handleAudioHealthEvent);
      silentAudio.removeEventListener("suspend", handleAudioHealthEvent);
      silentAudio.removeEventListener("waiting", handleAudioHealthEvent);
      silentAudio.removeEventListener("ended", handleAudioHealthEvent);
      silentAudio.remove();
      silentAudio = null;
    }
    if (silentAudioUrl) {
      URL.revokeObjectURL(silentAudioUrl);
      silentAudioUrl = null;
    }
    stopMediaButton.disabled = true;
    startMediaButton.disabled = false;
    return cleanupSucceeded;
  }

  function handleAudioPlay() {
    updatePlaybackState("playing");
    logMedia("Silent audio playback event received; no count recorded.");
  }

  function handleAudioPause() {
    updatePlaybackState("paused");
    logMedia("Silent audio pause event received; no count recorded.");
  }

  function handleAudioError() {
    setMediaStatus(
      "Playback blocked or failed",
      "The browser could not play the locally generated silent audio. Manual counting remains available."
    );
    logMedia("Silent audio reported an error.");
  }

  function logAudioHealth(eventName) {
    if (!silentAudio) {
      logMedia(`Audio ${eventName} event received without an active audio element.`);
      return;
    }

    logMedia(`Audio ${eventName} event received; no count recorded.`, {
      paused: silentAudio.paused,
      ended: silentAudio.ended,
      readyState: silentAudio.readyState,
      visibilityState: document.visibilityState
    });
  }

  function handleAudioHealthEvent(event) {
    logAudioHealth(event.type);
  }

  function attemptResumeAfterVisibility() {
    if (mediaMode !== "active" || !silentAudio || !silentAudio.paused) {
      return;
    }

    logMedia("Silent audio is paused after the page became visible; attempting one lifecycle resume.", {
      visibilityState: document.visibilityState
    });
    silentAudio.play().then(() => {
      updatePlaybackState("playing");
      logMedia("Silent audio resumed after visibility change.");
    }).catch((error) => {
      setMediaStatus(
        "Playback suspended in background",
        "The browser paused the silent session. Start it again if media commands stop arriving."
      );
      logMedia("Silent audio could not resume after visibility change.", {
        error: error.name
      });
    });
  }

  function handleVisibilityChange() {
    logMedia(`Page became ${document.visibilityState}.`, {
      audioPaused: silentAudio ? silentAudio.paused : null,
      mediaMode
    });
    refreshDateDisplay();
    if (mediaMode === "active" && document.visibilityState === "hidden") {
      setMediaStatus(
        "Session active in background; browser media priority is unknown",
        "Another tab or application may own hardware media commands. This page cannot override Chrome's Media Session priority."
      );
    }
    if (document.visibilityState === "visible") {
      attemptResumeAfterVisibility();
    }
  }

  function handlePageHide(event) {
    logMedia("Pagehide received; keeping media handlers and audio session intact.", {
      persisted: event.persisted,
      audioPaused: silentAudio ? silentAudio.paused : null,
      mediaMode
    });
    if (mediaMode === "active") {
      setMediaStatus(
        "Session active; background delivery is browser-controlled",
        "The counter remains registered, but another tab's active media session may receive the next hardware command."
      );
    }
  }

  function handlePageShow(event) {
    logMedia("Pageshow received; checking media session health.", {
      persisted: event.persisted,
      audioPaused: silentAudio ? silentAudio.paused : null,
      mediaMode
    });
    refreshDateDisplay();
    attemptResumeAfterVisibility();
  }

  async function startSilentSession() {
    if (!navigator.mediaSession || typeof navigator.mediaSession.setActionHandler !== "function") {
      mediaMode = "unsupported";
      setMediaStatus(
        "Media Session API unsupported",
        "This browser cannot register media action handlers. Manual counting remains fully functional."
      );
      return;
    }

    cleanupSilentSession();
    setMediaStatus(
      "Starting silent session",
      "Preparing a locally generated silent audio loop after your explicit gesture."
    );

    silentAudioUrl = URL.createObjectURL(createSilentWavBlob());
    silentAudio = document.createElement("audio");
    silentAudio.src = silentAudioUrl;
    silentAudio.loop = true;
    silentAudio.playsInline = true;
    silentAudio.preload = "auto";
    silentAudio.setAttribute("aria-hidden", "true");
    silentAudio.addEventListener("play", handleAudioPlay);
    silentAudio.addEventListener("pause", handleAudioPause);
    silentAudio.addEventListener("error", handleAudioError);
    ["stalled", "suspend", "waiting", "ended"].forEach((eventName) => {
      silentAudio.addEventListener(eventName, handleAudioHealthEvent);
    });
    document.body.append(silentAudio);

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Earphone Counter (silent)",
        artist: "Local Earphone Counter",
        album: "Experimental media session"
      });
      if (!registerMediaHandlers()) {
        throw new Error("Media Session action handlers are unavailable.");
      }
      await silentAudio.play();
      updatePlaybackState("playing");
      mediaSessionReady = true;
      mediaMode = "active";
      startMediaButton.disabled = true;
      stopMediaButton.disabled = false;
      setMediaStatus(
        "Session active; physical button detection not yet verified",
        "The silent loop is playing locally. Any delivered supported media action will count once, but Android Chrome may not forward every headset button."
      );
    } catch (error) {
      console.warn("Unable to start silent media session.", error);
      cleanupSilentSession();
      mediaMode = "failed";
      setMediaStatus(
        "Playback blocked or failed",
        "The browser did not allow the silent session to start. Manual counting remains fully functional."
      );
    }
  }

  function stopSilentSession() {
    const cleanupSucceeded = cleanupSilentSession();
    mediaMode = "stopped";
    if (cleanupSucceeded) {
      setMediaStatus(
        "Session stopped",
        "No media session is active. Stopping the session does not change the counter."
      );
    } else {
      setMediaStatus(
        "Session stopped or cleanup failed",
        "The counter was not changed, but the browser rejected part of media-session cleanup."
      );
    }
    logMedia("Silent media session stopped.");
  }

  function recordCountOperation(delta, source = "manual") {
    const date = getLocalDateKey();
    const previousCount = state.dailyHistory[date] || 0;
    const nextCount = Math.max(0, previousCount + delta);
    if (nextCount === previousCount) {
      return;
    }

    state.dailyHistory[date] = nextCount;
    state.undoStack.push({ date, delta: nextCount - previousCount });
    render();
    saveState();
    logMedia(`Recorded ${source} count operation.`, { date, delta: nextCount - previousCount });
  }

  function undoLastCount() {
    while (state.undoStack.length > 0) {
      const operation = state.undoStack.pop();
      const currentCount = state.dailyHistory[operation.date] || 0;
      const restoredCount = currentCount - operation.delta;
      if (restoredCount < 0) {
        continue;
      }

      state.dailyHistory[operation.date] = restoredCount;
      render();
      saveState();
      return;
    }
    render();
  }

  function resetToday() {
    const today = getLocalDateKey();
    state.dailyHistory[today] = 0;
    state.undoStack = state.undoStack.filter((operation) => operation.date !== today);
    render();
    saveState();
  }

  function clearAllHistory() {
    if (!window.confirm("Clear all daily history and undo information? This cannot be undone.")) {
      return;
    }

    state = createEmptyState();
    render();
    saveState();
  }

  function isInteractiveTarget(target) {
    return target instanceof Element
      && Boolean(target.closest("button, a, input, select, textarea, summary, [contenteditable]"));
  }

  function handleKeydown(event) {
    if (event.code === "Space" && !isInteractiveTarget(event.target)) {
      event.preventDefault();
      recordCountOperation(1);
    }
  }

  function refreshDateDisplay() {
    render();
  }

  incrementButton.addEventListener("click", () => recordCountOperation(1));
  decrementButton.addEventListener("click", () => recordCountOperation(-1));
  undoButton.addEventListener("click", undoLastCount);
  resetButton.addEventListener("click", resetToday);
  clearHistoryButton.addEventListener("click", clearAllHistory);
  startMediaButton.addEventListener("click", startSilentSession);
  stopMediaButton.addEventListener("click", stopSilentSession);
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("focus", refreshDateDisplay);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);

  if (navigator.mediaSession && typeof navigator.mediaSession.setActionHandler === "function") {
    mediaMode = "stopped";
    setMediaStatus(
      "Session stopped",
      "Media Session action handlers are available. Start the silent session with the button to experiment."
    );
  }

  render();
  logMedia("Application initialized.", { mediaMode });
  window.addEventListener("beforeunload", cleanupSilentSession);
})();
