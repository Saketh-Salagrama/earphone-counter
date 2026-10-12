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
  const handsFreeButton = document.querySelector("#hands-free-button");
  const diagnosticToggle = document.querySelector("#diagnostic-toggle");
  const mediaStatus = document.querySelector("#media-status");
  const mediaDetail = document.querySelector("#media-detail");

  let state = loadState();
  let mediaMode = "unsupported";
  let lastMediaCommandAt = 0;

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

  function setMediaStatus(status, detail) {
    mediaStatus.innerHTML = `<strong>${status}</strong>`;
    mediaDetail.textContent = detail;
  }

  function handleMediaCommand(command) {
    const now = Date.now();
    if (now - lastMediaCommandAt < 500) {
      logMedia("Ignored a duplicate media command.", { command });
      return;
    }

    lastMediaCommandAt = now;
    recordCountOperation(1, "media-control");
    setMediaStatus(
      "Configured; command received",
      "A browser media command reached this page. This does not prove every physical Bluetooth press will be exposed."
    );
    logMedia("Received Media Session action.", { command });
  }

  function startHandsFreeMode() {
    if (!navigator.mediaSession || typeof navigator.mediaSession.setActionHandler !== "function") {
      mediaMode = "unsupported";
      setMediaStatus(
        "Unsupported in this browser",
        "Media Session action handlers are unavailable. Manual counting remains fully functional."
      );
      return;
    }

    try {
      ["play", "pause"].forEach((action) => {
        navigator.mediaSession.setActionHandler(action, () => handleMediaCommand(action));
      });
      mediaMode = "configured";
      handsFreeButton.disabled = true;
      handsFreeButton.textContent = "Hands-Free Mode configured";
      setMediaStatus(
        "Configured; not verified",
        "Handlers are registered, but the browser and operating system may not expose physical earphone presses."
      );
      logMedia("Media Session handlers configured.");
    } catch (error) {
      mediaMode = "unsupported";
      setMediaStatus(
        "Could not configure",
        "The browser rejected the Media Session handlers. Manual counting remains fully functional."
      );
      console.warn("Unable to configure Media Session handlers.", error);
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
  handsFreeButton.addEventListener("click", startHandsFreeMode);
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("focus", refreshDateDisplay);
  document.addEventListener("visibilitychange", refreshDateDisplay);

  if (!navigator.mediaSession) {
    setMediaStatus(
      "Unsupported in this browser",
      "This browser does not expose the Media Session API. Manual counting remains fully functional."
    );
  }

  render();
  logMedia("Application initialized.", { mediaMode });
})();
