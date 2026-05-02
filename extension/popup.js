(function () {
  "use strict";

  var shared = globalThis.ABDMShared;
  var ext = shared.extensionApi();
  var controls = {};
  var config = shared.normalizeConfig();

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

  function readControls() {
    config.autoCaptureClicks = controls.autoCaptureClicks.checked;
    config.autoSniffResponses = controls.autoSniffResponses.checked;
    config.allowNativeOnFailure = controls.allowNativeOnFailure.checked;
    config.port = Number(controls.port.value) || 15151;
    return shared.normalizeConfig(config);
  }

  function writeControls(nextConfig) {
    config = shared.normalizeConfig(nextConfig);
    controls.autoCaptureClicks.checked = config.autoCaptureClicks;
    controls.autoSniffResponses.checked = config.autoSniffResponses;
    controls.allowNativeOnFailure.checked = config.allowNativeOnFailure;
    controls.port.value = String(config.port);
  }

  async function load() {
    var response = await runtimeMessage({ type: "abdm_get_config" });
    writeControls(response.config);
    await testConnection(false);
  }

  async function save() {
    setStatus("正在保存...", "checking");
    var response = await runtimeMessage({
      type: "abdm_save_config",
      config: readControls()
    });
    writeControls(response.config);
    await testConnection(false);
  }

  async function testConnection(showChecking) {
    if (showChecking) setStatus("正在检查连接...", "checking");
    var response = await runtimeMessage({
      type: "abdm_test_connection",
      port: Number(controls.port.value) || 15151
    });
    if (response.ok) {
      setStatus("已连接到 ABDM", "ok");
    } else {
      setStatus("未连接到 ABDM，请启动应用并开启浏览器集成", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    ["autoCaptureClicks", "autoSniffResponses", "allowNativeOnFailure", "port"].forEach(function (id) {
      controls[id] = document.getElementById(id);
    });
    document.getElementById("save").addEventListener("click", save);
    document.getElementById("test").addEventListener("click", function () {
      testConnection(true);
    });
    document.getElementById("options").addEventListener("click", function () {
      ext.runtime.openOptionsPage();
    });
    load().catch(function (error) {
      setStatus(String(error && error.message || error), "error");
    });
  });
})();
