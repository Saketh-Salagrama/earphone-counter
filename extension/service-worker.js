"use strict";

const COMMAND_ACTIONS = {
  "media-play-pause": "pause",
  "media-next-track": "nexttrack",
  "media-previous-track": "previoustrack",
  "media-stop": "stop"
};

chrome.commands.onCommand.addListener(async (command) => {
  const action = COMMAND_ACTIONS[command];
  if (!action) {
    console.warn("[Earphone Counter extension] Ignored unknown command.", command);
    return;
  }

  const tabs = await chrome.tabs.query({});
  const eventId = `${Date.now()}-${crypto.randomUUID()}`;
  let delivered = 0;

  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "earphone-counter-media-command",
        action,
        eventId
      });
      delivered += 1;
    } catch (error) {
      // Most tabs do not contain the counter bridge.
    }
  }

  console.info("[Earphone Counter extension] Media command dispatched.", {
    command,
    action,
    delivered
  });
});
