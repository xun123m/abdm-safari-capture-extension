(function () {
  "use strict";

  var shared = globalThis.ABDMShared;
  var ext = shared.extensionApi();
  var config = shared.normalizeConfig();

  function invokeRuntime(message) {
    try {
      var maybePromise = ext.runtime.sendMessage(message);
      if (maybePromise && typeof maybePromise.then === "function") {
        return maybePromise;
      }
    } catch (_) {
      // Fall through to callback style.
    }
    return new Promise(function (resolve, reject) {
      try {
        ext.runtime.sendMessage(message, function (response) {
          var lastError = ext.runtime && ext.runtime.lastError;
          if (lastError) reject(lastError);
          else resolve(response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function invokeStorageGet(keys) {
    try {
      var maybePromise = ext.storage.local.get(keys);
      if (maybePromise && typeof maybePromise.then === "function") {
        return maybePromise;
      }
    } catch (_) {
      // Fall through to callback style.
    }
    return new Promise(function (resolve) {
      ext.storage.local.get(keys, resolve);
    });
  }

  async function refreshConfig() {
    try {
      config = shared.normalizeConfig(await invokeStorageGet(Object.keys(shared.DEFAULT_CONFIG)));
    } catch (_) {
      config = shared.normalizeConfig();
    }
  }

  function closestAnchor(target) {
    while (target && target !== document) {
      if (target.tagName && target.tagName.toLowerCase() === "a" && target.href) {
        return target;
      }
      target = target.parentNode;
    }
    return null;
  }

  function continueNativeNavigation(anchor, url) {
    var target = anchor.getAttribute("target");
    if (target && target !== "_self") {
      window.open(url, target);
      return;
    }
    window.location.assign(url);
  }

  function itemFromAnchor(anchor) {
    return {
      link: anchor.href,
      downloadPage: location.href,
      headers: null,
      description: document.title || null,
      suggestedName: anchor.getAttribute("download") || null,
      type: "http"
    };
  }

  function shouldIgnoreClick(event) {
    return event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey;
  }

  async function handleClick(event) {
    if (shouldIgnoreClick(event)) return;
    if (!config.autoCaptureClicks) return;
    var anchor = closestAnchor(event.target);
    if (!anchor || !anchor.href) return;
    var downloadName = anchor.getAttribute("download");
    if (!shared.shouldCaptureLink(anchor.href, downloadName, config)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    var response = await invokeRuntime({
      type: "abdm_capture_link",
      item: itemFromAnchor(anchor)
    }).catch(function () {
      return { ok: false, allowNativeOnFailure: config.allowNativeOnFailure };
    });

    if (!response || !response.captured) {
      var shouldContinue = response && Object.prototype.hasOwnProperty.call(response, "allowNativeOnFailure") ?
        response.allowNativeOnFailure :
        config.allowNativeOnFailure;
      if (shouldContinue) {
        continueNativeNavigation(anchor, anchor.href);
      }
    }
  }

  function selectionLinks() {
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return [];
    var root = document.createElement("div");
    for (var i = 0; i < selection.rangeCount; i += 1) {
      root.appendChild(selection.getRangeAt(i).cloneContents());
    }
    var links = Array.prototype.slice.call(root.querySelectorAll("a[href]"));
    var seen = Object.create(null);
    return links.map(function (anchor) {
      return anchor.href;
    }).filter(function (href) {
      if (!href || seen[href]) return false;
      seen[href] = true;
      return true;
    }).map(function (href) {
      return {
        link: href,
        downloadPage: location.href,
        headers: null,
        description: document.title || null,
        suggestedName: null,
        type: "http"
      };
    });
  }

  function setupMessages() {
    ext.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (message && message.type === "abdm_collect_selection_links") {
        sendResponse(selectionLinks());
      }
      return false;
    });
  }

  refreshConfig();
  if (ext.storage && ext.storage.onChanged) {
    ext.storage.onChanged.addListener(refreshConfig);
  }
  document.addEventListener("click", function (event) {
    handleClick(event);
  }, true);
  setupMessages();
})();
