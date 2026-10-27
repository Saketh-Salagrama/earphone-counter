"use strict";

const COUNTER_TITLE = "Earphone Counter";

chrome.runtime.onMessage.addListener((message) => {
  if (document.title !== COUNTER_TITLE
    || !message
    || message.type !== "earphone-counter-media-command") {
    return;
  }

  window.postMessage({
    source: "earphone-counter-extension",
    action: message.action,
    eventId: message.eventId
  }, "*");
});
