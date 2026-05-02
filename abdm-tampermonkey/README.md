# ABDM Download Capture for Tampermonkey

把 `abdm-download-capture.user.js` 导入 Tampermonkey 后，它会在网页内捕获可下载链接，并通过 ABDM 本地接口发送任务：

- `POST http://127.0.0.1:15151/add`
- `POST http://127.0.0.1:15151/ping`

## 能做什么

- 点击常见下载扩展名链接时阻止浏览器原跳转，改为发送到 ABDM。
- 捕获带 `download` 属性的链接。
- 捕获 `.m3u8` / `.mpd` 媒体链接。
- Tampermonkey 菜单中支持“下载选中链接”“测试连接”“设置端口/扩展名/黑名单”“启用/停用接管”。

## 做不到什么

Tampermonkey 运行在页面脚本层，不能读取 Safari/浏览器内部下载管理器事件，也不能可靠监听所有响应头。因此它不能真正接管所有下载请求；地址栏直达、服务端重定向、脚本创建下载、浏览器内部下载面板已经开始的任务，都可能无法拦截。

需要更接近全局接管时，仍然要用 Safari WebExtension / App Extension 方案。
