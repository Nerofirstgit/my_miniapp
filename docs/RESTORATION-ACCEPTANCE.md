# 网站移动端还原验收 · 2026-10-18

本轮基于 https://my-resume-alj.pages.dev/ 的 390×844 移动视口和相邻网站当前源码。微信模拟器逻辑视口为 390×844，官方截图优化输出 363×785，含状态栏和胶囊。两者纵向内容面积不同，不以截图像素完全相等作为标准。

## 已实现

- 首屏使用网站 Noto Sans SC 900 子集，两行“你好／我叫康彤”，全屏留白、底部联系入口和下滑提示。线上和当前源码已确认该标题；此前交接中的“天工开物工作室”标题已过时。
- 原生 WXSS 灰色星云、110 个静态定位星点，整体缓慢漂移；标题逐字入场和按压倾斜。连续动画不通过逐帧 setData 驱动。
- 自定义顶部导航避让状态栏与微信胶囊；横向分区菜单、40px 下拉门槛与32px选择步进、取消手势、自动收起、当前分区提示、回到顶部。
- 关于→作品→经历→技能→联系，恢复四段介绍、编号作品行、16:9预览、经历卡片与公司标识、技能卡片和页尾联系条目。
- 技能默认6项，可展开16项；收起后回到技能区，重新测量后续分区位置。宽度超过480px为两列。
- 两份完整5秒循环GIF，仅作品所在行进入视口且页面可见、动效开启、无弹层/菜单时挂载；失败时保留原静态JPG。静态封面详情预览不变。
- 联系复用已有原生组件和拨号、复制、图片预览、分享能力。第四个首屏入口为动效开关，替代网站的语言切换，小程序仍只提供中文。

## 自动检查与审查

`npm run check` 通过：严格TypeScript、19项模拟微信API行为测试、原生配置/资源检查。源文件约1078KiB，小于项目1.5MiB预算；源文件体积不等于预览构建包体积。

新增测试覆盖分区白名单、导航偏移和菜单关闭顺序、技能切换、生命周期、手势门槛/步进/取消、观察器显隐及卸载后迟到回调、同批布局测量和滚动事件竞态、动图失败保留静态封面。模拟测试不证明实际微信触摸或渲染表现。

通用代码审查和TypeScript审查完成，修复后复审通过：

1. 标题入场使用 backwards 填充，避免结束后的 transform 覆盖按压反馈。
2. 系统减少动态效果媒体规则隐藏 GIF、显示静态封面；CSS 动画停止。
3. 分区矩形与视口 scrollTop 通过同一个 SelectorQuery 取样，避免技能收起同时滚动导致缓存坐标偏移。
4. WXML 实际编译要求表达式直接使用 `&&` 和 `<`，已修复首次编译中实体转义导致的语法错误。

## 实际微信开发者工具验证

工具2.02.2608080，skill 0.3.11；正式接口确认已登录、版本一致。以下均为本轮实际操作，未调用上传体验版或发布。

| 检查 | 结果及证据 |
| --- | --- |
| 首页 WXML/WXSS | 最终两项正式编译成功；真实页面可显示 |
| 首屏字体、布局、星空 | [hero.jpg](validation/2026-10-18-restoration/hero.jpg)；动态性能仍需真机确认 |
| 关于入口与滚动揭示 | 实际点击下滑按钮，activeSection=about，前三段进入视口后 revealed=true；[about.jpg](validation/2026-10-18-restoration/about.jpg) |
| 点击菜单与定位 | 实际打开菜单、点击作品，定位正确；[menu.jpg](validation/2026-10-18-restoration/menu.jpg) |
| 下拉菜单手势 | 正式自动化 touchstart(267,68)→touchmove(267,172)→touchend，selected=2、menuOpen=false、activeSection=works、scrollTop=1765；不是手指真机测试 |
| 作品动画 | [works.jpg](validation/2026-10-18-restoration/works.jpg) 与 [works-motion.jpg](validation/2026-10-18-restoration/works-motion.jpg) 显示商城不同帧；两项 visibleWorks=true、failedMotion/failedImages为空 |
| 经历与图标 | [experience.jpg](validation/2026-10-18-restoration/experience.jpg)，公司标识与标签显示 |
| 技能展开/收起 | 实际点击后查询渲染卡片数16→6；收起后重新测量contact位置正确；[skills.jpg](validation/2026-10-18-restoration/skills.jpg) |
| 页尾联系 | [contact.jpg](validation/2026-10-18-restoration/contact.jpg)；点击二维码入口打开原联系弹层：[contact-sheet.jpg](validation/2026-10-18-restoration/contact-sheet.jpg) |
| 详情回归 | 实际点击商城封面进入详情：[mall-detail.jpg](validation/2026-10-18-restoration/mall-detail.jpg)；调用原生 navigateBack 后首页可继续操作 |
| 回顶与动效开关 | 实际点击回顶，scrollTop=0；点击动效开关后motionEnabled=false，再点恢复 |
| 错误日志 | 当时 `grep -i error` 无匹配，不能推定所有场景无错误 |

## 与参照的差异及未验证项

- 网站使用 Three.js shader 的标题扭曲、扫描变色和持续星场；本版使用原生位移/缩放/倾斜和灰色渐变近似，不具备相同的逐像素变形、星场深度及随机运动。
- 网站关于正文按字符随滚动逐步变亮；本版按段落/区块首次进入视口显现，不是逐字跟随滚动。各分区标题采用原生揭示，不复现彩色shader扫描。
- 导航为胶囊留位，展开后单独一行横向菜单；与网站的拉伸轨道布局不同。首屏电话/微信入口统一打开联系弹层，邮箱直接复制；第四格动效控制替代语言切换。
- GIF 从640×360/20fps降低为320×180、约6.8fps、64色，保留5秒时间。餐厅暗色画面有色阶损失；详见[素材来源](ASSET-SOURCES.md)。两张静态JPG保留高清预览。
- 移动端参照本身隐藏时钟和噪声层，因此没有添加这两项。小程序分类说明保持中文。
- 新版尚无真机反馈：iOS/Android性能、字体加载、小屏与大字体、胶囊/安全区、触摸按压/下拉手感、减少动态效果偏好、弹层滚动锁定、拨号及复制/图片/分享完整回归仍需验证。基础静态版的iOS通过不覆盖本轮。
- 本轮没有验证所有二级详情路径和每一种异常情况的真实系统API；这些有模拟测试和旧版运行时证据，但不记为本轮全部真机通过。

参照截图位于同一目录 `reference-hero/about/works/experience/skills/contact.png`。它们是动态页面某一时刻的截图，部分标题shader可能处于变形阶段；不把动画中的某一帧当作静态排版基准。
