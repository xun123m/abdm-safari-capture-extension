(function (global) {
  "use strict";

  var DEFAULT_FILE_TYPES = [
    "zip", "rar", "7z", "iso", "tar", "gz", "tgz", "bz2", "xz",
    "dmg", "pkg", "app", "exe", "msi", "deb", "rpm", "apk", "ipa",
    "bin", "jar", "war", "cab",
    "pdf", "epub", "mobi", "azw3",
    "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv",
    "mp3", "aac", "m4a", "flac", "wav", "ogg", "opus",
    "mp4", "m4v", "mov", "mkv", "avi", "wmv", "webm", "mpeg", "mpg",
    "srt", "ass", "vtt",
    "psd", "ai", "sketch", "fig",
    "torrent"
  ];

  var DEFAULT_CONFIG = {
    port: 15151,
    autoCaptureClicks: true,
    autoSniffResponses: true,
    captureAllFileTypes: true,
    captureFileSizeMinimumKb: 0,
    registeredFileTypes: DEFAULT_FILE_TYPES.slice(),
    blacklistedUrls: [],
    sendHeaders: true,
    sendCookies: true,
    allowNativeOnFailure: true,
    silentAddDownload: false,
    silentStartDownload: false,
    showNotifications: true
  };

  function extensionApi() {
    return global.browser || global.chrome;
  }

  function uniqueStrings(values) {
    var seen = Object.create(null);
    return values
      .map(function (value) { return String(value || "").trim(); })
      .filter(function (value) {
        if (!value || seen[value]) return false;
        seen[value] = true;
        return true;
      });
  }

  function normalizeFileTypes(values) {
    if (typeof values === "string") {
      values = values.split(/[\s,;]+/);
    }
    if (!Array.isArray(values)) return DEFAULT_FILE_TYPES.slice();
    return uniqueStrings(values).map(function (value) {
      return value.replace(/^\./, "").toLowerCase();
    });
  }

  function normalizePatterns(values) {
    if (typeof values === "string") {
      values = values.split(/\r?\n/);
    }
    if (!Array.isArray(values)) return [];
    return uniqueStrings(values);
  }

  function normalizeConfig(raw) {
    var config = Object.assign({}, DEFAULT_CONFIG, raw || {});
    config.port = Number(config.port) || DEFAULT_CONFIG.port;
    config.port = Math.max(1024, Math.min(65535, config.port));
    config.captureFileSizeMinimumKb = Math.max(0, Number(config.captureFileSizeMinimumKb) || 0);
    config.registeredFileTypes = normalizeFileTypes(config.registeredFileTypes);
    config.blacklistedUrls = normalizePatterns(config.blacklistedUrls);
    config.autoCaptureClicks = !!config.autoCaptureClicks;
    config.autoSniffResponses = !!config.autoSniffResponses;
    config.captureAllFileTypes = !!config.captureAllFileTypes;
    config.sendHeaders = !!config.sendHeaders;
    config.sendCookies = !!config.sendCookies;
    config.allowNativeOnFailure = !!config.allowNativeOnFailure;
    config.silentAddDownload = !!config.silentAddDownload;
    config.silentStartDownload = !!config.silentStartDownload;
    config.showNotifications = !!config.showNotifications;
    return config;
  }

  function toUrl(value) {
    try {
      return new URL(value);
    } catch (_) {
      return null;
    }
  }

  function fileNameFromUrl(url) {
    var parsed = toUrl(url);
    if (!parsed) return null;
    var pathname = decodeURIComponent(parsed.pathname || "");
    var last = pathname.split("/").filter(Boolean).pop();
    if (!last || last.indexOf(".") === -1) return null;
    return last;
  }

  function fileExtensionFromName(fileName) {
    if (!fileName) return "";
    var cleaned = String(fileName).split("?")[0].split("#")[0];
    var dot = cleaned.lastIndexOf(".");
    if (dot <= 0 || dot === cleaned.length - 1) return "";
    return cleaned.slice(dot + 1).toLowerCase();
  }

  function getUrlExtension(url) {
    return fileExtensionFromName(fileNameFromUrl(url));
  }

  function headerValue(headers, name) {
    if (!headers) return null;
    var lower = String(name).toLowerCase();
    if (headers instanceof Headers) {
      return headers.get(name);
    }
    if (Array.isArray(headers)) {
      for (var i = 0; i < headers.length; i += 1) {
        if (String(headers[i].name || "").toLowerCase() === lower) {
          return headers[i].value || null;
        }
      }
      return null;
    }
    for (var key in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, key) && key.toLowerCase() === lower) {
        return headers[key];
      }
    }
    return null;
  }

  function headersArrayToObject(headers) {
    var result = {};
    if (!Array.isArray(headers)) return result;
    headers.forEach(function (header) {
      if (header && header.name && header.value) {
        result[header.name] = header.value;
      }
    });
    return result;
  }

  function parseContentDispositionFilename(value) {
    if (!value) return null;
    var utfMatch = /filename\*\s*=\s*([^']*)''([^;]+)/i.exec(value);
    if (utfMatch) {
      try {
        return decodeURIComponent(utfMatch[2].trim().replace(/^"|"$/g, ""));
      } catch (_) {
        return utfMatch[2].trim().replace(/^"|"$/g, "");
      }
    }
    var quotedMatch = /filename\s*=\s*"([^"]+)"/i.exec(value);
    if (quotedMatch) return quotedMatch[1].trim();
    var plainMatch = /filename\s*=\s*([^;]+)/i.exec(value);
    if (plainMatch) return plainMatch[1].trim().replace(/^"|"$/g, "");
    return null;
  }

  function isAttachment(headers) {
    return /(^|;|\s)attachment(\s|;|$)/i.test(headerValue(headers, "content-disposition") || "");
  }

  function contentLength(headers) {
    var value = headerValue(headers, "content-length");
    if (!value) return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function isWebLikeContentType(contentType) {
    if (!contentType) return false;
    var type = contentType.split(";")[0].trim().toLowerCase();
    return type === "text/html" ||
      type === "text/css" ||
      type === "text/javascript" ||
      type === "application/javascript" ||
      type === "application/json" ||
      type === "application/xml" ||
      type === "text/xml" ||
      type === "image/svg+xml";
  }

  function escapeRegExp(value) {
    return String(value).replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }

  function wildcardToRegExp(pattern) {
    var source = String(pattern)
      .split("*")
      .map(escapeRegExp)
      .join(".*");
    return new RegExp("^" + source + "$", "i");
  }

  function isBlacklisted(url, patterns) {
    if (!url || !patterns || !patterns.length) return false;
    return patterns.some(function (pattern) {
      var value = String(pattern || "").trim();
      if (!value) return false;
      if (value.indexOf("*") !== -1) {
        return wildcardToRegExp(value).test(url);
      }
      return url.indexOf(value) !== -1;
    });
  }

  function isRegisteredExtension(extension, config) {
    if (!extension) return false;
    return normalizeConfig(config).registeredFileTypes.indexOf(extension.toLowerCase()) !== -1;
  }

  function shouldCaptureLink(url, anchorDownloadName, config) {
    config = normalizeConfig(config);
    if (!url || isBlacklisted(url, config.blacklistedUrls)) return false;
    if (anchorDownloadName) return true;
    return isRegisteredExtension(getUrlExtension(url), config);
  }

  function shouldCaptureResponse(details, config) {
    config = normalizeConfig(config);
    if (!details || !details.url || isBlacklisted(details.url, config.blacklistedUrls)) {
      return false;
    }
    if (details.initiator && isBlacklisted(details.initiator, config.blacklistedUrls)) {
      return false;
    }
    if (details.originUrl && isBlacklisted(details.originUrl, config.blacklistedUrls)) {
      return false;
    }
    if (details.documentUrl && isBlacklisted(details.documentUrl, config.blacklistedUrls)) {
      return false;
    }
    if (details.method && details.method !== "GET") return false;
    if (details.statusCode && (details.statusCode < 200 || details.statusCode > 299)) return false;

    var headers = details.responseHeaders || [];
    var minBytes = config.captureFileSizeMinimumKb * 1024;
    var length = contentLength(headers);
    if (minBytes > 0 && length !== null && length < minBytes) return false;

    var disposition = headerValue(headers, "content-disposition");
    var fileName = parseContentDispositionFilename(disposition) || fileNameFromUrl(details.url);
    var extension = fileExtensionFromName(fileName);
    var knownType = isRegisteredExtension(extension, config);
    var attachment = isAttachment(headers);
    var type = headerValue(headers, "content-type");

    if (!attachment && isWebLikeContentType(type)) return false;
    if (attachment) return true;
    if (knownType) return true;
    return config.captureAllFileTypes && !!type && !isWebLikeContentType(type);
  }

  global.ABDMShared = {
    DEFAULT_FILE_TYPES: DEFAULT_FILE_TYPES,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    extensionApi: extensionApi,
    normalizeConfig: normalizeConfig,
    normalizeFileTypes: normalizeFileTypes,
    normalizePatterns: normalizePatterns,
    fileNameFromUrl: fileNameFromUrl,
    fileExtensionFromName: fileExtensionFromName,
    getUrlExtension: getUrlExtension,
    headerValue: headerValue,
    headersArrayToObject: headersArrayToObject,
    parseContentDispositionFilename: parseContentDispositionFilename,
    isAttachment: isAttachment,
    contentLength: contentLength,
    isWebLikeContentType: isWebLikeContentType,
    isBlacklisted: isBlacklisted,
    isRegisteredExtension: isRegisteredExtension,
    shouldCaptureLink: shouldCaptureLink,
    shouldCaptureResponse: shouldCaptureResponse
  };
})(globalThis);
