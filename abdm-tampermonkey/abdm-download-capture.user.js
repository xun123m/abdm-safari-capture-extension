// ==UserScript==
// @name         ABDM Download Capture
// @namespace    local.abdm.tampermonkey
// @version      0.1.0
// @description  Capture downloadable links on web pages and send them to AB Download Manager.
// @description:zh-CN  捕获网页中的下载链接，并发送到 AB Download Manager。
// @author       local
// @license      MIT
// @match        http://*/*
// @match        https://*/*
// @exclude      http://127.0.0.1/*
// @exclude      http://localhost/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function () {
  "use strict";

  const DEFAULT_EXTENSIONS = [
    "zip", "rar", "7z", "iso", "tar", "gz", "tgz", "bz2", "xz",
    "dmg", "pkg", "app", "exe", "msi", "deb", "rpm", "apk", "ipa",
    "bin", "jar", "war", "cab",
    "pdf", "epub", "mobi", "azw3",
    "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv",
    "mp3", "aac", "m4a", "flac", "wav", "ogg", "opus",
    "mp4", "m4v", "mov", "mkv", "avi", "wmv", "webm", "mpeg", "mpg",
    "srt", "ass", "vtt", "torrent"
  ];

  const DEFAULT_CONFIG = {
    port: 15151,
    enabled: true,
    captureDownloadAttribute: true,
    captureKnownExtensions: true,
    captureMediaLinks: true,
    captureAllSameOriginBlobLinks: false,
    allowBrowserFallback: true,
    silentAdd: false,
    silentStart: false,
    extensions: DEFAULT_EXTENSIONS.join(" "),
    blacklist: ""
  };

  const RECENT_CAPTURE_TTL = 5000;
  const recentCaptures = new Map();

  function getConfig() {
    const config = {};
    Object.keys(DEFAULT_CONFIG).forEach((key) => {
      config[key] = GM_getValue(key, DEFAULT_CONFIG[key]);
    });
    config.port = clampPort(config.port);
    config.extensions = normalizeWords(config.extensions).map((item) => item.replace(/^\./, "").toLowerCase());
    config.blacklist = normalizeLines(config.blacklist);
    return config;
  }

  function setConfig(nextConfig) {
    Object.keys(DEFAULT_CONFIG).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(nextConfig, key)) {
        GM_setValue(key, nextConfig[key]);
      }
    });
  }

  function clampPort(value) {
    const port = Number(value) || DEFAULT_CONFIG.port;
    return Math.max(1024, Math.min(65535, port));
  }

  function normalizeWords(value) {
    return String(value || "")
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function normalizeLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseUrl(value, base) {
    try {
      return new URL(value, base || location.href);
    } catch (_) {
      return null;
    }
  }

  function fileNameFromUrl(url) {
    const parsed = parseUrl(url);
    if (!parsed) return "";
    const parts = decodeURIComponent(parsed.pathname).split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  }

  function extensionFromUrl(url) {
    const fileName = fileNameFromUrl(url).split("?")[0].split("#")[0];
    const dot = fileName.lastIndexOf(".");
    if (dot <= 0 || dot === fileName.length - 1) return "";
    return fileName.slice(dot + 1).toLowerCase();
  }

  function wildcardToRegExp(pattern) {
    return new RegExp("^" + String(pattern)
      .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
      .replace(/\*/g, ".*") + "$", "i");
  }

  function isBlacklisted(url, config) {
    return config.blacklist.some((pattern) => {
      if (pattern.includes("*")) return wildcardToRegExp(pattern).test(url);
      return url.includes(pattern);
    });
  }

  function isRecentlyCaptured(url) {
    const capturedAt = recentCaptures.get(url);
    return capturedAt && Date.now() - capturedAt < RECENT_CAPTURE_TTL;
  }

  function markCaptured(url) {
    recentCaptures.set(url, Date.now());
    setTimeout(() => recentCaptures.delete(url), RECENT_CAPTURE_TTL);
  }

  function closestAnchor(target) {
    for (let node = target; node && node !== document; node = node.parentNode) {
      if (node instanceof HTMLAnchorElement && node.href) return node;
    }
    return null;
  }

  function isPlainPrimaryClick(event) {
    return event.button === 0 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.defaultPrevented;
  }

  function looksLikeMediaLink(url) {
    const parsed = parseUrl(url);
    if (!parsed) return false;
    return /\.(m3u8|mpd)(?:[?#].*)?$/i.test(parsed.pathname + parsed.search);
  }

  function shouldCaptureAnchor(anchor, config) {
    if (!config.enabled || !anchor || !anchor.href) return false;
    if (isRecentlyCaptured(anchor.href)) return false;
    if (isBlacklisted(anchor.href, config) || isBlacklisted(location.href, config)) return false;

    const parsed = parseUrl(anchor.href);
    if (!parsed) return false;
    if (!/^https?:$|^blob:$/.test(parsed.protocol)) return false;

    if (config.captureDownloadAttribute && anchor.hasAttribute("download")) return true;
    if (config.captureMediaLinks && looksLikeMediaLink(anchor.href)) return true;
    if (config.captureKnownExtensions && config.extensions.includes(extensionFromUrl(anchor.href))) return true;

    return config.captureAllSameOriginBlobLinks &&
      parsed.protocol === "blob:" &&
      anchor.href.startsWith(location.origin);
  }

  function requestAbdm(path, body, config) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `http://127.0.0.1:${config.port}/${path}`,
        data: body === undefined ? null : JSON.stringify(body),
        timeout: 2500,
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(response);
          } else {
            reject(new Error(`ABDM HTTP ${response.status}`));
          }
        },
        ontimeout() {
          reject(new Error("ABDM request timeout"));
        },
        onerror() {
          reject(new Error("ABDM request failed"));
        }
      });
    });
  }

  function createDownloadItem(anchor) {
    return {
      link: anchor.href,
      downloadPage: location.href,
      headers: {
        Referer: location.href,
        "User-Agent": navigator.userAgent
      },
      description: document.title || null,
      suggestedName: anchor.getAttribute("download") || fileNameFromUrl(anchor.href) || null,
      type: looksLikeMediaLink(anchor.href) ? "hls" : "http"
    };
  }

  async function addToAbdm(items, config) {
    await requestAbdm("add", {
      items,
      options: {
        silentAdd: !!config.silentAdd,
        silentStart: !!config.silentStart
      }
    }, config);
    items.forEach((item) => markCaptured(item.link));
  }

  async function pingAbdm(config) {
    await requestAbdm("ping", null, config);
  }

  function continueBrowserNavigation(anchor) {
    const target = anchor.getAttribute("target");
    if (target && target !== "_self") {
      window.open(anchor.href, target);
    } else {
      location.assign(anchor.href);
    }
  }

  async function handleClick(event) {
    if (!isPlainPrimaryClick(event)) return;

    const anchor = closestAnchor(event.target);
    const config = getConfig();
    if (!shouldCaptureAnchor(anchor, config)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const item = createDownloadItem(anchor);
    try {
      await addToAbdm([item], config);
      showToast("已发送到 AB Download Manager");
    } catch (error) {
      console.warn("[ABDM] capture failed", error);
      showToast("ABDM 未响应");
      if (config.allowBrowserFallback) continueBrowserNavigation(anchor);
    }
  }

  function collectLinksFromSelection(config) {
    const selection = getSelection();
    if (!selection || selection.rangeCount === 0) return [];

    const root = document.createElement("div");
    for (let i = 0; i < selection.rangeCount; i += 1) {
      root.appendChild(selection.getRangeAt(i).cloneContents());
    }

    const seen = new Set();
    return Array.from(root.querySelectorAll("a[href]"))
      .filter((anchor) => shouldCaptureAnchor(anchor, config))
      .filter((anchor) => {
        if (seen.has(anchor.href)) return false;
        seen.add(anchor.href);
        return true;
      })
      .map(createDownloadItem);
  }

  async function downloadSelection() {
    const config = getConfig();
    const items = collectLinksFromSelection(config);
    if (!items.length) {
      showToast("选区中没有匹配的下载链接");
      return;
    }
    try {
      await addToAbdm(items, config);
      showToast(`已发送 ${items.length} 个链接到 ABDM`);
    } catch (error) {
      console.warn("[ABDM] selection capture failed", error);
      showToast("ABDM 未响应");
    }
  }

  async function testConnection() {
    const config = getConfig();
    try {
      await pingAbdm(config);
      showToast(`ABDM 已连接：127.0.0.1:${config.port}`);
    } catch (error) {
      console.warn("[ABDM] ping failed", error);
      showToast(`ABDM 未连接：127.0.0.1:${config.port}`);
    }
  }

  function promptSettings() {
    const config = getConfig();
    const port = prompt("ABDM 端口", String(config.port));
    if (port === null) return;
    const extensions = prompt("接管扩展名，空格/逗号分隔", config.extensions.join(" "));
    if (extensions === null) return;
    const blacklist = prompt("黑名单网址，每行一个，支持 *", config.blacklist.join("\n"));
    if (blacklist === null) return;

    setConfig({
      port: clampPort(port),
      extensions,
      blacklist
    });
    showToast("ABDM 脚本设置已保存");
  }

  function toggleEnabled() {
    const config = getConfig();
    GM_setValue("enabled", !config.enabled);
    showToast(!config.enabled ? "ABDM 接管已启用" : "ABDM 接管已停用");
  }

  function showToast(message) {
    if (!document.documentElement) return;

    let toast = document.getElementById("__abdm_capture_toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "__abdm_capture_toast";
      Object.assign(toast.style, {
        position: "fixed",
        zIndex: "2147483647",
        right: "16px",
        bottom: "16px",
        maxWidth: "360px",
        padding: "10px 12px",
        borderRadius: "8px",
        background: "rgba(20, 24, 28, 0.92)",
        color: "#fff",
        font: "13px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.22)",
        pointerEvents: "none",
        transition: "opacity 160ms ease"
      });
      document.documentElement.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.style.opacity = "0";
    }, 1800);
  }

  GM_registerMenuCommand("ABDM：测试连接", testConnection);
  GM_registerMenuCommand("ABDM：下载选中链接", downloadSelection);
  GM_registerMenuCommand("ABDM：设置端口/扩展名/黑名单", promptSettings);
  GM_registerMenuCommand("ABDM：启用/停用接管", toggleEnabled);

  document.addEventListener("click", (event) => {
    handleClick(event);
  }, true);
})();
