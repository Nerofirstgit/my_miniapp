# 康彤的微信小程序作品集

独立的中文原生微信小程序，使用 WXML、WXSS、TypeScript。无 React、Taro 或云开发依赖。与 `my_lab` 网站没有代码引用、Git remote 或自动部署关联。

新窗口接手开发时，先阅读 [AGENTS.md](AGENTS.md) 和 [开发交接](docs/HANDOFF.md)，其中记录已确认的需求、实现状态、验证边界及下一步。

当前交接状态（2026-10-19）：按用户要求，两张作品GIF已恢复包内本地路径，不再依赖云存储。恢复文件与原备份SHA-256一致，现有样式、动画条件及静态封面回退未改；64项本地检查通过，源文件约1236KiB。真机连续播放观感待验。详情见 [开发交接](docs/HANDOFF.md)、[素材加载记录](docs/CLOUD-ASSETS.md) 和此前的 [告警验证](docs/RUNTIME-WARNINGS.md)。

## 本地打开

1. 在微信开发者工具中导入**本项目根目录**，工具会通过 `project.config.json` 找到 `miniprogram/`。
2. 已配置你提供的 AppID `wxb5933408f91a5f03`。登录具有该小程序开发者权限的微信账号。AppID 不是 AppSecret；本项目不需要 AppSecret 或上传私钥。
3. 工程已启用开发者工具的 TypeScript 编译插件，直接编译即可；无需“构建 npm”。两张作品GIF从包内 `assets/projects/` 加载，无需云存储、域名或密钥。
4. 实际分享和真机预览需要对应开发者权限及已登录的微信开发者工具。仅填入 AppID 不代表这些能力已验证。

## 工程检查

使用 Node.js 20 或更高版本：

```sh
npm ci
npm run check
```

`typecheck` 执行严格类型检查；`test` 在模拟的微信 API 环境验证作品跳转、分享直达、无效参数、复制失败、拨号取消及图片降级；资源检查验证页面配置、组件和源文件体积预算。它们不替代微信运行时编译及真机验收。

## 当前范围

- 首页：全屏大标题、动态星空、分区菜单、四段介绍、两个动画作品、经历卡片、16项技能及联系入口。
- 作品详情：中文介绍、封面放大、复制演示网址、分享当前案例。
- 联系弹层：拨号、复制微信/邮箱、二维码预览。
- 标题、封面、图标、二维码及两张作品GIF均在本地；GIF加载失败时保留静态封面，无用户登录流程。
- 首页自定义导航避让状态栏和微信胶囊，详情保留原生导航栏；联系弹层处理底部安全区。

本轮已按网站当前资料补齐真实经历、技能与图标，并实现原生动效和低体积GIF。首页仅保留三个联系图标，无语言或动效开关；菜单栏支持点击/下拉展开。标题使用原站算法的 WebGL 扭曲扫过，关于文字随滚动逐字显现；星空已移植原站3000颗三维星点、透视呼吸与持续演化的噪声白雾。仍需验证平台渲染和性能差异，详见 [星空迁移验证](docs/ATMOSPHERE-ACCEPTANCE.md) 和 [标题与逐字验证](docs/SHADER-CHARACTER-ACCEPTANCE.md)。没有后台或表单收集。

## 内容维护

- `miniprogram/data/profile.ts`：姓名、介绍、经历、技能和联系方式。
- `miniprogram/data/projects.ts`：作品、中文介绍、封面与项目网址。
- `miniprogram/assets/`：本地作品GIF、静态封面、标题、图标、字体、许可证与二维码；两张GIF原备份保留于包外的 `asset-backups/projects/`。来源和可选转换脚本见 [素材来源](docs/ASSET-SOURCES.md)。网站原文件未修改。
- `miniprogram/app.wxss`：全局样式；页面和联系组件分别维护局部样式。

项目网址只提供复制，由用户在浏览器打开。首版没有 `web-view`，网页可达性不影响小程序内的介绍内容。

## 历史真机验收与当前待验

历史基础版已获用户反馈：iOS复制、图片预览、弹层关闭和分享通过；卡顿也已获确认解决。这些结论不代表最新界面修改已通过真机验收。历史预览码见 [星空迁移验证](docs/ATMOSPHERE-ACCEPTANCE.md)，不包含本会话修改；当前61项本地检查、微信运行时证据及待验清单以 [开发交接](docs/HANDOFF.md) 为准。

- 编译无 WXML、WXSS、TypeScript 错误，首页可正常滚动。
- 两个作品均可打开，分享后直接进入对应详情；无效 id 显示返回入口。
- 联系弹层打开、关闭正常，拨号取消不误报失败，复制和图片预览可用。
- 分别在 iOS、Android 检查小屏排版、系统字体、底部安全区、字体放大及图片加载。
- 以开发者工具统计为准检查上传包体积。先通过预览验收，再准备发布。

## Git 与发布

本项目使用独立 Git 仓库，远程仓库为 [Nerofirstgit/my_miniapp](https://github.com/Nerofirstgit/my_miniapp)，没有 CI 或 Cloudflare 配置。本地开发不会向网站仓库提交或推送，也不会因此触发网站构建。开发者工具私有配置、环境文件和包外重复素材备份不纳入 Git；两张运行时 GIF 保留在 `miniprogram/assets/projects/` 并随代码提交。

官方参考：[原生小程序示例](https://github.com/wechat-miniprogram/miniprogram-demo)、[微信 TypeScript 类型](https://github.com/wechat-miniprogram/api-typings)。

