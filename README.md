# ABDM Safari Capture

这是一个给 Safari 使用的 AB Download Manager WebExtension，用于尽可能接管 Safari 中的下载请求并发送到 ABDM 桌面端。

## 功能

- 点击可下载链接时阻止 Safari 导航，并把任务发送到 ABDM。
- 右键链接、图片、视频、音频时可选择“用 AB Download Manager 下载”。
- 选中一段文本后可右键批量提取其中链接。
- 后台嗅探主框架/子框架/下载类响应，识别 `Content-Disposition: attachment`、常见文件扩展名和二进制响应。
- 支持 ABDM 默认端口 `15151`、请求头/Cookie 转发、静默添加/静默开始、黑名单、文件类型和最小文件大小设置。

## Safari 限制

Safari WebExtension 不支持 Chrome/Firefox 那种完整的异步下载阻断能力，Apple 文档也明确提示 `webRequestBlocking` 不受支持。因此这个扩展对点击链接可以接管并阻止 Safari 原动作；对地址栏直达、服务端跳转、脚本触发或 Safari 内部下载面板已经创建的下载，只能尽早检测并发送给 ABDM，Safari 可能仍会保留原下载。

## 临时加载测试

1. 启动 AB Download Manager，并在 ABDM 设置里开启 Browser Integration。
2. 打开 Safari > Settings > Advanced，启用开发者菜单。
3. Safari 17 或更新版本：Safari > Settings > Developer，勾选 Allow unsigned extensions。
4. Safari > Settings > Developer > Add Temporary Extension，选择本项目的 `extension` 文件夹。
5. 在扩展弹窗里点击“测试”，确认显示已连接到 ABDM。

Safari 临时扩展会在退出 Safari 或约 24 小时后移除。

## 打包为 Safari App Extension

本机需要安装完整 Xcode，只有 Command Line Tools 不够。

```bash
./scripts/package-safari.sh
```

成功后会在 `dist/safari-xcode` 生成 Xcode 项目。打开项目、选择开发者 Team、构建并运行容器 App 后，再到 Safari Extensions 中启用扩展。

## 生成 zip

```bash
./scripts/zip-extension.sh
```

zip 会生成到 `dist/abdm-safari-capture-extension.zip`，可用于 Safari 临时加载或上传到 Apple 的 Safari Web Extension Packager。

## 来源说明

ABDM 的本地通信接口参考了官方浏览器集成项目：`http://localhost:15151/ping` 与 `http://localhost:15151/add`。图标来自 ABDM 官方浏览器集成仓库，保留其 Apache-2.0 许可证。
