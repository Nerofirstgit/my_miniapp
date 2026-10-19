# 标题扭曲扫过与关于逐字显现

日期：2026-10-18（Asia/Shanghai）。本轮真机未验收。

## 最新扩展：其他分区逐字显现（2026-10-18）

作品、经历、技能、联系文字通过 `home-copy.ts` 与首页 `copy-text` 模板扩展逐字效果；每段独立测量，按同一算法正向亮起、反向渐暗。所有文字容器移除叠加透明度，经历卡片背景保持 `#191919`、opacity1。只有Hero/标题/作品容器参与可见性observer，避免逐字文字触发无用的可见性setData。

分区标题新增progress参数：shader按栅格纹理的字符位置对预乘RGB/alpha同时遮罩，静止及拖影均保留逐字明暗；5秒停顿区滚动进度变化会立即绘制，但不重启扫过计时器。非Hero原生文字回退也使用逐字算法；减少动态效果时强制完整显示。Hero原入场不受滚动遮罩影响。

53项模拟API测试、严格TypeScript、资源预算约1224KiB通过；首页与标题组件微信WXML/WXSS编译成功。微信运行时已验证作品/经历/技能/联系的字符有不同中间透明度，页底全部亮起，回滚恢复暗态，标题progress约0.501、rendered=true。具体读数与菜单/间距验证见 [HANDOFF](HANDOFF.md)。本轮截图只包含Canvas星空/标题，未捕获普通界面层，因此不记为完整视觉通过。未生成新预览码；下方历史二维码不含这次扩展。

## 后续反馈：标题黑底（2026-10-18）

后续用户确认：“这次的可以了”，标题黑底修复已获使用反馈认可；未提供设备、系统和微信版本，不视为全量动效或跨平台验收。用户随后提出点击链接白块问题，处理记录见最新 HANDOFF。

用户反馈 Hero 和分区标题带黑色背景。共享组件原先仅调用 `getContext("webgl")`，现显式传入 `alpha: true, premultipliedAlpha: true`；实际上下文未提供 alpha 时保留原生文字回退。六张 PNG 为32位ARGB、左上角 alpha=0，WXSS 无黑底声明。尚无修复前后真实GPU截图，根因判断仍待运行时确认。

新增2项回归先失败后通过；`npm run check` 共45项模拟API测试、严格类型和资源预算通过。微信标题组件 WXML/WXSS 编译成功。当前页查询与截图持续无返回，已终止CLI等待，未反复刷新。真实合成透明度、Hero延迟后的画面、扫过拖影、iOS/Android仍待验证。未生成本次修复预览码，下方历史截图和二维码均不包含修复。

以下为之前的实现与验收记录。

## 实现与来源

只读参照 my_lab 的 `heroHoverShader.ts`、`titleSweep.ts`、`config/titleAnimation.ts`、`characterOpacity.ts`、`characterReveal.ts` 和 `StudioIntro.tsx`。

- 微信原生 WebGL 取代旧 CSS 倾斜循环：相同曲线轨迹、3秒扫过/5秒停顿、0.4曲线幅度、速度上限0.018、10次模糊采样、RGB通道分离及透明边缘处理。首屏与五个分区标题共用组件。
- 首屏纹理取自原站同源字体轮廓，分区标题是固定字体栅格图；纹理3倍分辨率，画布按设备像素比封顶2（首屏）/1.5（分区）。未移植 Three.js 多级浮点帧缓冲、MSAA及 OutputPass 色彩转换，因此字体栅格化、抗锯齿和彩色边缘亮度仍有平台差异。
- 原站逐字透明度算法直接移植：非空白字符按0.06错峰、渐变时长1、暗态0.12；按段落位置的 clamp(top85%) 至 clamp(bottom60%) 区间计算进度，回滚与大幅跳跃都更新。原文、空白和自然换行保留，屏幕阅读标签为完整段落。
- 文字用0.5秒原生颜色过渡平滑更新，未引入 GSAP scrub 引擎。只发送变化的字符路径，不叠加父段落透明度。
- WebGL按可见性懒初始化，视口外/菜单/弹层/后台停止；5秒中立区用单次计时器，不持续刷新。尺寸变化重建，卸载释放资源。减少动态效果下跳过GPU初始化；失败恢复文字。

相关微信接口依据本地官方 `miniprogram-api-typings@5.2.3` 的 Canvas/WebGL 声明以及[官方类型源码](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.canvas.d.ts)。

## 本地检查与审查

`npm run check` 通过：严格 TypeScript、34项模拟API测试、原生结构与资源预算（约1191KiB）。本轮新增10项，覆盖逐字顺序/空白/反向/跨越整段、长段落、无重复桥接更新、扫过轨迹/限速/周期，以及热重载ready、减少动态效果、缺失画布和卸载迟到回调。

审查发现减少动态效果模式下隐藏画布仍耗费GPU的问题，已改为初始化前检查computed display，并在返回前台重新检查；复审通过。热重载实际暴露了 ready 先于本模块 attached 状态的异常，已加入 ensureRuntime 并补模拟回归。真实系统偏好和设备上下文丢失仍需真机验证。

## 微信开发者工具实际验证

开发者工具2.02.2608080、skill 0.3.11、基础库3.17.4，登录状态有效。首页及标题组件 WXML/WXSS 正式编译通过。新页面实例中首屏组件 `active=true, rendered=true`；滚动后首屏 active=false，关于标题 active=true/rendered=true，其余未进入视口的标题未初始化。

连续八张截图覆盖多轮扫过和停顿，帧2/4/7捕捉到彩色像素拖影；静止帧恢复完整清晰文字。下列是本机证据，不加入小程序包：

- [扫过左侧文字](C:/Users/nerot/.codex/visualizations/2026/10/18/01a14dfb-1df7-7ae3-aaf9-da3a7997c0c8/shader-frame-7.png)
- [扫过右侧文字](C:/Users/nerot/.codex/visualizations/2026/10/18/01a14dfb-1df7-7ae3-aaf9-da3a7997c0c8/shader-frame-2.png)
- [关于逐字过渡中间态](C:/Users/nerot/.codex/visualizations/2026/10/18/01a14dfb-1df7-7ae3-aaf9-da3a7997c0c8/characters-mid.png)

第一段逐字运行时读数：scrollTop650时前25字完全亮起，随后透明度从0.978逐字降至0.133，后部维持0.12；scrollTop800时首/中/末字都为1；回滚550时首字1、中/末字0.12。验证了顺序渐入和反向渐出。

点击菜单后 `menuOpen=true`、首屏标题 active=false；点击遮罩关闭后 active=true。新组件未遮挡菜单交互。

工具操作说明：自定义组件用 `.shader-title` 类选择器查询；直接查询注册标签名在此工具中返回空，不能因此推断组件缺失。文件热重载会保留已卸载页面的旧自动化引用，正式核对用 `automation_navigate --action reLaunch --url /pages/home/index` 创建新实例，再读取组件状态。历史错误日志不可直接当作新实例失败。

## 新预览与待验证

官方预览生成成功，启动页 `pages/home/index`，TOTAL **1,199,115字节**（约1171KiB）。

[本轮新版预览二维码](C:/Users/nerot/.codex/visualizations/2026/10/18/01a14dfb-1df7-7ae3-aaf9-da3a7997c0c8/shader-character-preview.png)

真机待验证：iOS/Android GPU性能与温度、低端机流畅度、画布透明层级、标题字体及拖影观感、小屏/旋转/放大字体、系统减少动态效果、后台返回、资源失败及WebGL上下文丢失后的回退。模拟器截图和单元测试不替代这些验收。

未修改相邻 my_lab，未提交、推送、上传体验版或发布。
