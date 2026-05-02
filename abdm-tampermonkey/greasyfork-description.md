# ABDM Download Capture

把网页里的下载链接发送到 [AB Download Manager](https://abdownloadmanager.com/)，适合在 Safari + Tampermonkey 中作为轻量下载接管方案使用。

## 主要功能

- 点击常见下载链接时拦截浏览器跳转，并发送到 ABDM。
- 支持带 `download` 属性的链接。
- 支持常见压缩包、安装包、文档、音频、视频、字幕、种子等扩展名。
- 支持 `.m3u8` / `.mpd` 媒体链接。
- 支持在 Tampermonkey 菜单中批量发送选中文本里的下载链接。
- 支持自定义 ABDM 端口、文件扩展名和黑名单。
- ABDM 未响应时，可自动回退到浏览器原始下载。

## 使用前准备

1. 安装并启动 AB Download Manager。
2. 在 ABDM 设置中开启 Browser Integration。
3. 确认 ABDM 本地接口端口为 `15151`，如果你改过端口，可以在脚本菜单里修改。
4. 安装脚本后刷新网页。

## Tampermonkey 菜单

安装后，在 Tampermonkey 菜单中可以看到：

- `ABDM：测试连接`
- `ABDM：下载选中链接`
- `ABDM：设置端口/扩展名/黑名单`
- `ABDM：启用/停用接管`

## 默认接管的扩展名

默认包含：

```text
zip rar 7z iso tar gz tgz bz2 xz dmg pkg app exe msi deb rpm apk ipa
bin jar war cab pdf epub mobi azw3 doc docx xls xlsx ppt pptx csv
mp3 aac m4a flac wav ogg opus mp4 m4v mov mkv avi wmv webm mpeg mpg
srt ass vtt torrent
```

你可以在脚本菜单中自行增删。

## 黑名单

黑名单每行一个，支持 `*` 通配符。例如：

```text
https://example.com/*
https://*.internal.example/*
```

匹配黑名单的网站或链接不会被脚本接管。

## 权限说明

脚本使用 `GM_xmlhttpRequest` 请求 ABDM 本地接口：

```text
http://127.0.0.1:15151/add
http://127.0.0.1:15151/ping
```

脚本不会上传数据到第三方服务器，不包含远程脚本，不包含跟踪、广告或挖矿逻辑。

## 限制

Tampermonkey 运行在网页脚本层，不能像浏览器扩展那样监听浏览器下载管理器，也不能稳定读取所有响应头。因此它不能真正接管所有下载请求。

以下场景可能无法拦截：

- 地址栏直接打开下载地址。
- 服务端跳转后才变成下载。
- 网站通过复杂 JavaScript 或 iframe 触发下载。
- 浏览器内部下载面板已经开始的任务。

如果你需要更接近全局接管，请使用 Safari WebExtension / App Extension 方案。

## 兼容性

主要面向：

- Safari + Tampermonkey
- Chrome / Edge / Firefox + Tampermonkey 或兼容用户脚本管理器

不同脚本管理器对 `GM_xmlhttpRequest` 和本地连接权限的实现可能略有差异。
