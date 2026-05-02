(function () {
  "use strict";

  var shared = globalThis.ABDMShared;
  var ext = shared.extensionApi();
  var config = shared.normalizeConfig();
  var pendingRequests = Object.create(null);
  var recentCaptures = Object.create(null);

  function invoke(target, method) {
    var args = Array.prototype.slice.call(arguments, 2);
    try {
      var maybePromise = target[method].apply(target, args);
      if (maybePromise && typeof maybePromise.then === "function") {
        return maybePromise;
      }
    } catch (_) {
      // Fall through to callback style APIs.
    }
    return new Promise(function (resolve, reject) {
      try {
        target[method].apply(target, args.concat(function (result) {
          var lastError = ext.runtime && ext.runtime.lastError;
          if (lastError) {
            reject(lastError);
          } else {
            resolve(result);
          }
        }));
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageGet(keys) {
    return invoke(ext.storage.local, "get", keys);
  }

  function storageSet(values) {
    return invoke(ext.storage.local, "set", values);
  }

  async function loadConfig() {
    config = shared.normalizeConfig(await storageGet(Object.keys(shared.DEFAULT_CONFIG)));
    return config;
  }

  function apiUrl(path) {
    return "http://localhost:" + config.port + "/" + path;
  }

  async function postToBackend(path, payload) {
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 2500);
    try {
      var response = await fetch(apiUrl(path), {
        method: "POST",
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error("ABDM API returned HTTP " + response.status);
      }
      return true;
    } finally {
      clearTimeout(timer);
    }
  }

  async function ping(port) {
    var previousPort = config.port;
    if (port) config.port = Number(port);
    try {
      return await postToBackend("ping", null);
    } catch (_) {
      return false;
    } finally {
      config.port = previousPort;
    }
  }

  function addRecent(url) {
    recentCaptures[url] = Date.now();
    setTimeout(function () {
      delete recentCaptures[url];
    }, 8000);
  }

  function recentlyCaptured(url) {
    var time = recentCaptures[url];
    return !!time && Date.now() - time < 8000;
  }

  function defaultDownloadOptions() {
    return {
      silentAdd: !!config.silentAddDownload,
      silentStart: !!config.silentStartDownload
    };
  }

  async function getCookiesHeader(url) {
    if (!config.sendCookies || !ext.cookies || !ext.cookies.getAll) {
      return "";
    }
    try {
      var cookies = await invoke(ext.cookies, "getAll", { url: url });
      return (cookies || []).map(function (cookie) {
        return cookie.name + "=" + cookie.value;
      }).join("; ");
    } catch (_) {
      return "";
    }
  }

  async function enrichHeaders(item) {
    var headers = Object.assign({}, item.headers || {});
    if (!config.sendHeaders) return null;
    try {
      var parsed = new URL(item.link);
      if (!headers.Host) headers.Host = parsed.host;
    } catch (_) {
      // Ignore invalid URLs; the backend will reject them if necessary.
    }
    if (!headers["User-Agent"]) {
      headers["User-Agent"] = navigator.userAgent;
    }
    if (!headers.Cookie) {
      var cookies = await getCookiesHeader(item.link);
      if (cookies) headers.Cookie = cookies;
    }
    return Object.keys(headers).length ? headers : null;
  }

  async function normalizeItem(item) {
    return {
      link: item.link,
      downloadPage: item.downloadPage || null,
      headers: await enrichHeaders(item),
      description: item.description || null,
      suggestedName: item.suggestedName || null,
      type: item.type || "http"
    };
  }

  async function addDownloads(items, source) {
    var normalizedItems = [];
    for (var i = 0; i < items.length; i += 1) {
      if (items[i] && items[i].link && !shared.isBlacklisted(items[i].link, config.blacklistedUrls)) {
        normalizedItems.push(await normalizeItem(items[i]));
      }
    }
    if (!normalizedItems.length) {
      return { ok: false, captured: false, reason: "empty" };
    }

    try {
      await postToBackend("add", {
        items: normalizedItems,
        options: defaultDownloadOptions()
      });
      normalizedItems.forEach(function (item) {
        addRecent(item.link);
      });
      notifyCaptured(normalizedItems, source);
      return { ok: true, captured: true };
    } catch (error) {
      console.warn("ABDM capture failed", error);
      return {
        ok: false,
        captured: false,
        reason: "backend_unavailable",
        allowNativeOnFailure: config.allowNativeOnFailure
      };
    }
  }

  function notifyCaptured(items, source) {
    if (!config.showNotifications || !ext.notifications || !ext.notifications.create) return;
    var title = "AB Download Manager";
    var message = items.length === 1 ?
      "已发送下载任务给 ABDM" :
      "已发送 " + items.length + " 个下载任务给 ABDM";
    if (source === "response") {
      message += "；Safari 可能仍会保留原下载。";
    }
    try {
      ext.notifications.create({
        type: "basic",
        iconUrl: ext.runtime.getURL("icons/icon-128.png"),
        title: title,
        message: message
      });
    } catch (_) {
      // Notifications are optional in Safari.
    }
  }

  function itemFromRequest(details, responseDetails) {
    var headers = config.sendHeaders ? shared.headersArrayToObject(details.requestHeaders || []) : null;
    var disposition = shared.headerValue(responseDetails.responseHeaders, "content-disposition");
    var suggestedName = shared.parseContentDispositionFilename(disposition) ||
      shared.fileNameFromUrl(responseDetails.url);
    return {
      link: responseDetails.url,
      downloadPage: details.documentUrl || details.originUrl || responseDetails.documentUrl || responseDetails.initiator || null,
      headers: headers,
      description: null,
      suggestedName: suggestedName || null,
      type: "http"
    };
  }

  function handleHeadersReceived(details) {
    if (!config.autoSniffResponses) return;
    if (details.type && ["main_frame", "sub_frame", "other"].indexOf(details.type) === -1) return;
    if (recentlyCaptured(details.url)) return;
    if (!shared.shouldCaptureResponse(details, config)) return;
    var request = pendingRequests[details.requestId] || details;
    addDownloads([itemFromRequest(request, details)], "response");
  }

  function setupWebRequest() {
    if (!ext.webRequest) return;
    var filter = { urls: ["http://*/*", "https://*/*"] };
    try {
      ext.webRequest.onBeforeSendHeaders.addListener(function (details) {
        pendingRequests[details.requestId] = details;
      }, filter, ["requestHeaders"]);
    } catch (error) {
      console.warn("ABDM could not subscribe to request headers", error);
    }
    try {
      ext.webRequest.onHeadersReceived.addListener(function (details) {
        handleHeadersReceived(details);
      }, filter, ["responseHeaders"]);
    } catch (error) {
      console.warn("ABDM could not subscribe to response headers", error);
    }
    var cleanup = function (details) {
      delete pendingRequests[details.requestId];
    };
    try {
      ext.webRequest.onCompleted.addListener(cleanup, filter);
      ext.webRequest.onErrorOccurred.addListener(cleanup, filter);
    } catch (_) {
      // Cleanup is best effort.
    }
  }

  function setupContextMenus() {
    if (!ext.contextMenus) return;
    try {
      ext.contextMenus.removeAll(function () {
        ext.contextMenus.create({
          id: "abdm-download-link",
          title: "用 AB Download Manager 下载",
          contexts: ["link", "image", "video", "audio"]
        });
        ext.contextMenus.create({
          id: "abdm-download-selection",
          title: "用 AB Download Manager 下载选中链接",
          contexts: ["selection"]
        });
      });
      ext.contextMenus.onClicked.addListener(function (info, tab) {
        if (info.menuItemId === "abdm-download-link") {
          var link = info.linkUrl || info.srcUrl;
          if (!link) return;
          addDownloads([{
            link: link,
            downloadPage: info.pageUrl || null,
            headers: null,
            description: tab && tab.title || null,
            suggestedName: null,
            type: "http"
          }], "context_menu");
        }
        if (info.menuItemId === "abdm-download-selection" && tab && tab.id) {
          invoke(ext.tabs, "sendMessage", tab.id, { type: "abdm_collect_selection_links" })
            .then(function (items) {
              if (items && items.length) addDownloads(items, "selection");
            })
            .catch(function () {});
        }
      });
    } catch (error) {
      console.warn("ABDM could not set up context menus", error);
    }
  }

  function sendResponseAsync(sendResponse, promise) {
    promise.then(function (value) {
      sendResponse(value);
    }).catch(function (error) {
      sendResponse({ ok: false, error: String(error && error.message || error) });
    });
    return true;
  }

  function setupMessages() {
    ext.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message || !message.type) return undefined;
      if (message.type === "abdm_get_config") {
        return sendResponseAsync(sendResponse, Promise.resolve({ ok: true, config: config }));
      }
      if (message.type === "abdm_save_config") {
        return sendResponseAsync(sendResponse, storageSet(shared.normalizeConfig(message.config)).then(loadConfig).then(function () {
          return { ok: true, config: config };
        }));
      }
      if (message.type === "abdm_test_connection") {
        return sendResponseAsync(sendResponse, ping(message.port || config.port).then(function (ok) {
          return { ok: ok };
        }));
      }
      if (message.type === "abdm_capture_link") {
        var item = Object.assign({
          downloadPage: sender && sender.tab && sender.tab.url || null,
          headers: null,
          description: sender && sender.tab && sender.tab.title || null,
          suggestedName: null,
          type: "http"
        }, message.item || {});
        return sendResponseAsync(sendResponse, addDownloads([item], "click"));
      }
      if (message.type === "abdm_add_downloads") {
        return sendResponseAsync(sendResponse, addDownloads(message.items || [], message.source || "message"));
      }
      if (message.type === "abdm_should_capture_link") {
        return sendResponseAsync(sendResponse, Promise.resolve({
          ok: true,
          capture: config.autoCaptureClicks && shared.shouldCaptureLink(message.url, message.downloadName, config)
        }));
      }
      return undefined;
    });
  }

  async function boot() {
    await loadConfig();
    if (ext.storage && ext.storage.onChanged) {
      ext.storage.onChanged.addListener(function () {
        loadConfig();
      });
    }
    setupContextMenus();
    setupWebRequest();
    setupMessages();
    console.log("ABDM Safari Capture loaded");
  }

  boot().catch(function (error) {
    console.error("ABDM Safari Capture failed to load", error);
  });
})();
