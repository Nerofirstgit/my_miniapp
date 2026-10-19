# 作品 GIF 加载记录

## 当前状态：已恢复本地（2026-10-19）

按用户要求，两张GIF已从 `asset-backups/projects/` 原字节复制回 `miniprogram/assets/projects/`，备份保留；首页 `data/projects.ts` 的 `motion` 字段使用 `/assets/projects/mall-motion.gif` 和 `/assets/projects/restaurant-motion.gif`。运行时不再使用下方CloudBase地址，无需云存储、SDK或图片下载域名。

两图SHA-256与备份一致，首页WXML/WXSS/TS哈希未变，保留原始GIF、尺寸、渐变和播放控制。`npm run check` 64项通过，源文件约1236KiB；微信运行时两张image节点引用本地路径，进入作品区visibleWorks均为true、failedMotion为空。真机连续播放与观感待验，未上传或发布。

离线转换脚本 `scripts/prepare-assets.cjs` 生成的包内GIF可直接使用，不再需要上传或移出。2026-10-19用户随后确认已自行销毁云环境；本项目保持本地加载，不应恢复下方历史云地址。

## 以下为历史云接入记录（已撤回，不再作为操作指引）

2026-10-19：用户已上传两张 GIF 并配置 PostgreSQL RLS 读取策略。本项目仅使用公开 HTTPS 地址，不需要 CloudBase SDK、登录或密钥。

- 环境：`kangtong-portfolio-d7cm82e10f703`
- Bucket：`projects`
- 文件：`mall-motion.gif`、`restaurant-motion.gif`
- 公开地址前缀：`https://kangtong-portfolio-d7cm82e10f703.api.tcloudbasegateway.com/v1/storages/object/public/projects/`
- 地址维护位置：`miniprogram/data/projects.ts` 的 `motion` 字段。
- 读取策略：`storage.objects`，SELECT，角色 anon/authenticated，USING `bucket_id = 'projects'`。本轮没有修改云端策略或开放写入。

用户提供的两条 `/object/sign/` 带 token 链接仅用于识别环境与文件，未写入源码或文档。最终公开地址不包含查询参数或签名。更改权限、删除文件或云环境停服仍可能导致访问失败。

## 保留的行为

只更改首页 GIF 的 src。可见性判断、菜单/联系弹层/页面隐藏时暂停、减少动态效果、双向渐变、失败处理及尺寸样式保持原样。本地 JPG 始终作为底层封面，网络加载期间或失败后仍有静态内容。Hero 标题图片仍在包内。

原 GIF 移到项目根目录 `asset-backups/projects/`，移动前后 SHA-256 一致。此目录位于 miniprogramRoot 外，不进入小程序代码包。两文件合计 739,000 字节（约 722 KiB）。

## 验证

- 不携带 cookie、Authorization 或 token 的外部 GET：两文件均 HTTP 200，Content-Type=image/gif，签名 GIF89a；大小分别 145,473 / 593,527 字节，与迁移前本地文件逐字节一致。
- npm run check：严格 TypeScript、64 项模拟 API/VM 测试及资源检查通过；源文件统计约 515 KiB（此前约 1236 KiB）。不是微信最终上传包体积。
- 微信首页 WXML 局部编译成功，触发完整刷新后真实页面数据及 image 节点引用公开地址。滚动到作品区，visibleWorks 两项为 true，failedMotion 为空；首作品实际 opacity 为 0.56。仅这些运行时状态得到确认，不等于逐帧播放已经目视验证。
- 工具 get_simulator_network 对 motion.gif 无记录，不能据此断言没有网络请求；simulator_screenshot 仍只捕获星空原生层，无法据此确认普通 WXML 图片画面。菜单点击/查询返回有延迟或不一致，未据此声称本轮暂停恢复实机验收通过；原有模拟测试通过。
- 额外用 wx.getImageInfo 诊断远程文件时，失败原因是 `downloadFile:fail ... url not in domain list`。这属于下载 API 的白名单检查，不能当作 image 组件加载失败证据。项目没有引入 getImageInfo 下载 GIF 的运行代码，也未关闭 urlCheck。
- 真机 GIF 连续播放、首次网络等待、菜单/弹层暂停恢复和离线回退仍需验收。
- 后续自动化出现 `An object could not be cloned`、`routeDone ... webviewId ... not found` 及节点查询超时；停止进一步注入，已触发重新编译清理临时诊断状态，未修改业务逻辑去规避自动化异常。

若使用 wx.getImageInfo/wx.downloadFile 下载云端 GIF，需要在微信公众平台的小程序后台「开发管理 → 开发设置 → 服务器域名 → downloadFile 合法域名」配置：

`https://kangtong-portfolio-d7cm82e10f703.api.tcloudbasegateway.com`

## 更新素材

`scripts/prepare-assets.cjs` 是历史离线转换工具，仍会生成 `miniprogram/assets/projects/*-motion.gif`。重新生成后应将 GIF 更新到 `asset-backups/projects/`，上传 CloudBase，验证公开地址，再清除包内生成的 GIF；否则会重新增加代码包体积。未改变既有脚本的输出契约。

没有新增预览上传、提交、推送或发布。CloudBase 免费环境续期及正式上线后的套餐限制以控制台当前政策为准。
