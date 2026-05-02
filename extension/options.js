(function () {
  "use strict";

  var shared = globalThis.ABDMShared;
  var ext = shared.extensionApi();
  var controls = {};
  var checkboxIds = [
    "autoCaptureClicks",
    "autoSniffResponses",
    "captureAllFileTypes",
    "allowNativeOnFailure",
    "sendHeaders",
    "sendCookies",
    "silentAddDownload",
    "silentStartDownload",
    "showNotifications"
  ];
  var inputIds = [
    "port",
    "registeredFileTypes",
    "blacklistedUrls",
    "captureFileSizeMinimumKb"
  ];

  function runtimeMessage(message) {
    try {
      var maybePromise = ext.runtime.sendMessage(message);
      if (maybePromise && typeof maybePromise.then === "function") {
        return maybePromise;
      }
    } catch (_) {
      // Use callback style below.
    }
    return new Promise(function (resolve, reject) {
      ext.runtime.sendMessage(message, function (response) {
        var lastError = ext.runtime && ext.runtime.lastError;
        if (lastError) reject(lastError);
        else resolve(response);
      });
    });
  }

  function setStatus(text, state) {
    var status = document.getElementById("status");
    status.textContent = text;
    status.dataset.state = state || "";
  }

  function writeConfig(config) {
    config = shared.normalizeConfig(config);
    checkboxIds.forEach(function (id) {
      controls[id].checked = !!config[id];
    });
    controls.port.value = String(config.port);
    controls.captureFileSizeMinimumKb.value = String(config.captureFileSizeMinimumKb);
    controls.registeredFileTypes.value = config.registeredFileTypes.join(" ");
    controls.blacklistedUrls.value = config.blacklistedUrls.join("\n");
  }

  function readConfig() {
    var config = {};
    checkboxIds.forEach(function (id) {
      config[id] = controls[id].checked;
    });
    config.port = Number(controls.port.value) || 15151;
    config.captureFileSizeMinimumKb = Number(controls.captureFileSizeMinimumKb.value) || 0;
    config.registeredFileTypes = shared.normalizeFileTypes(controls.registeredFileTypes.value);
    config.blacklistedUrls = shared.normalizePatterns(controls.blacklistedUrls.value);
    return shared.normalizeConfig(config);
  }

  async function load() {
    var response = await runtimeMessage({ type: "abdm_get_config" });
    writeConfig(response.config);
    setStatus("", "");
  }

  async function save() {
    setStatus("正在保存...", "checking");
    var response = await runtimeMessage({
      type: "abdm_save_config",
      config: readConfig()
    });
    writeConfig(response.config);
    setStatus("已保存", "ok");
  }

  async function testConnection() {
    setStatus("正在测试连接...", "checking");
    var response = await runtimeMessage({
      type: "abdm_test_connection",
      port: Number(controls.port.value) || 15151
    });
    setStatus(response.ok ? "已连接到 ABDM" : "未连接到 ABDM", response.ok ? "ok" : "error");
  }

  document.addEventListener("DOMContentLoaded", function () {
    checkboxIds.concat(inputIds).forEach(function (id) {
      controls[id] = document.getElementById(id);
    });
    document.getElementById("save").addEventListener("click", save);
    document.getElementById("test").addEventListener("click", testConnection);
    document.getElementById("reset").addEventListener("click", function () {
      writeConfig(shared.DEFAULT_CONFIG);
      setStatus("已恢复默认，保存后生效", "checking");
    });
    load().catch(function (error) {
      setStatus(String(error && error.message || error), "error");
    });
  });
})();
