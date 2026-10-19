# 选择器、观察器与监听器告警排查

日期：2026-10-19（Asia/Shanghai）。微信开发者工具2.02.2608080，基础库3.17.4，模拟器430×932。

## 修改

- 全局、首页、详情及联系组件的普通标签/属性选择器改为类选择器。原生view/image/button使用`ui-box`保持border-box；button使用`ui-button`，具体按钮采用`.ui-button.用途类`，保持高于style v2默认按钮的优先级。标题文字、经历编号、微信复制提示及联系行内容使用明确的类。组件内补充隔离的box-sizing规则。保留微信页面/宿主的特殊`page`、`:host`规则；清理未使用的disabled规则。
- 首页观察器开启`nativeMode: true`，保留`observeAll`、阈值及视口边距。最低支持基础库3.5.7，当前3.17.4支持；真机旧版本行为未验证。
- 再次执行onReady前断开旧观察器；回调检查实例身份，忽略被替换观察器的迟到通知；卸载断开并清空引用。不改变标题、GIF和逐字进度的控制条件。

## 样式和动画证据

- `npm run check`：64项模拟API/VM测试、严格TypeScript和资源检查通过，约1236KiB。新增观察器行为测试先在旧代码失败，修复后通过；覆盖原生参数、重复初始化、旧回调、卸载清理。
- 两页面、三组件共10个WXML/WXSS局部编译结果全部成功。完整重新编译后进行运行时验收，而非只依赖reLaunch及热重载。
- 首页20个关键节点的left/top/width/height与修改前逐项完全相同：包含导航、Hero标题、联系图标、作品图片、经历卡片、技能卡片/按钮、联系操作。联系弹层10个节点同样完全相同。
- 原始几何快照位于本机聊天产物目录`C:/Users/nerot/.codex/visualizations/2026/10/19/01a151d2-c8c0-7720-bf53-33eb93b50130/`：`layout-before.json`、`layout-after.json`、`contact-before.json`、`contact-after.json`。这些文件不进入小程序代码包。
- scrollTop1635：作品mall进入视口、GIF节点存在，封面真实计算opacity0.56；回到顶部后两件作品visibleWorks均false、封面进度opacity0.12。联系弹层打开时Hero active=false，关闭后恢复。
- 三轮全页滚动后，6个标题组件和星空均rendered=true；回到顶部只有Hero标题active=true，其他标题停止，作品GIF离开视口卸载。
- 再进行三轮“navigateTo作品详情→navigateBack→reLaunch首页”循环。随后控制台grep `selectors`、`slowest`、`listeners`均无匹配，最终grep `error`也无匹配。最终页面栈1、首页、nativeMode=true、Hero和星空rendered=true。
- 通用和TypeScript专项审查通过。真机视觉、减少动态效果实机表现、旧基础库兼容及长时间内存曲线未验证。

## 监听器告警的证据与限制

修复前控制台曾记录page30、33、34的`21 listeners of event onBeforeUnloadPage_*`。项目源码没有直接注册这个内部事件。

只读检查本机同版本基础库包`C:/Users/nerot/AppData/Local/微信开发者工具/User Data/2ca4252ffa87560ea1fd48b913e45179/WeappVendor/3.17.4.wxvpkg`中的`/WAServiceMainContext.js`：

- 模块2594的EventEmitter默认阈值为20，首次超过时打印21并设置warned标志，随后继续增长不会重复打印。因此“多次都显示21”不证明数量稳定，也不证明泄漏。
- 模块9405负责页面卸载事件管理。canvasInserted通过Canvas编号去重注册一次性页面卸载监听；DevtoolsCanvas等基础库功能也有注册。页面卸载触发事件，once包装先移除自身，再执行清理，并删除该页面注册表。不能将21猜成“7个canvas×3”。
- 该发射器保存在模块闭包，未暴露只读监听数量接口。没有修改基础库、hook内部发射器或调高阈值。
- 项目标题/星空组件detached已经取消帧/定时器、释放GPU资源、更新generation并删除实例，相关模拟生命周期测试通过。本轮另外补强了首页观察器的重复初始化与卸载防护。
- 同版本`WAWebview.js`中，非原生观察器使用共享的pageReRender/scroll监听，最后一个观察器断开时移除；原生路径使用window.IntersectionObserver。已检查的两条路径及SelectorQuery请求链均未见直接注册onBeforeUnloadPage。因此，nativeMode消除慢路径警告与本轮未复现监听器警告之间，尚无因果证据。

本轮完整重新编译及上述滚动/导航循环未复现监听器告警。这是有限范围运行时结果，**不等于已经证明所有真机长期运行都没有内存泄漏**。若再次出现，应记录基础库、是否热重载、复现操作和内存曲线，再定位具体注册栈，不屏蔽日志。

此前的`Native title canvas failed`与`missing-hero.png`来自上一轮主动故障注入，已恢复。本轮最终正常验证没有再次注入这些故障。没有上传预览、提交、推送或发布。
