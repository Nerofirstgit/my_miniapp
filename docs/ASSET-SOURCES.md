# 内容与素材来源

核对日期：2026-10-19。参考网站为 <https://my-resume-alj.pages.dev/>；从相邻 `../my_lab` 当前源码和素材只读复制，不共享导入，也不修改网站工程。两张作品GIF已按用户要求恢复包内本地文件，与其他素材一样无需云存储。

## 微信聊天分享封面（2026-10-21）

- `miniprogram/assets/share/portfolio.jpg`：本会话通过内置 imagegen 工具生成并经用户确认的独立分享封面。以项目已有资料为文案依据：全栈开发者、你好／我叫康彤、网站／小程序／软件定制、天工开物工作室。
- 生成提示：为中文个人作品集设计单张近5:4微信分享封面；近黑背景、荧光黄超粗两行中文主标题、左对齐与安全留白；边缘稀疏星点与石墨色星云；辅助文案灰白色；无二维码、设备模型、额外标志或额外口号。主标题必须准确显示“你好，”与“我叫康彤”。
- 原始PNG：`C:/Users/nerot/.codex/generated_images/01a15e1b-c2b9-7981-b647-9ffe8b583df8/exec-2fb83539-c678-4ecb-a75d-4ebd591227c3.png`，仅作为本机原稿留存。项目运行时只引用包内JPG，不引用此绝对路径。
- 包内JPEG由Windows System.Drawing以质量85转码，保持原图1402×1122像素和构图，文件170756字节。无运行时转换或新依赖。已目视检查转码后中文和构图；微信开发者工具成功解码，手机接收端显示待验。

## 个人内容

2026-10-18 联系按钮补充：`miniprogram/pages/home/contact-icons.wxss` 三个 SVG 路径只读取自 `../my_lab/src/components/HeroContacts.tsx`（电话、微信、邮箱），转为本地 data URL。未新增网络资源或运行时跨项目引用。三格等宽，按用户确认移除原站语言切换及上一版动效开关。

- `miniprogram/data/profile.ts` 的四段介绍对应网站 `src/i18n/sectionCopy.ts` 中 `zh.paragraphs`。
- 三条工作经历、公司、日期、职责、成果数字和标签对应网站 `src/data/profile.ts` 的 `workExperiences`，未增加新职责或成果；内容为网站已公开的本人资料，未做独立履历审计。
- 16 项技能、顺序和名称对应同文件的 `skills`。英文类别说明已翻译为中文，序号为展示编号。
- 原有个人信息、联系方式和微信二维码沿用本项目现有数据。

## 图标与字体

2026-10-18 标题纹理补充：`assets/titles/hero.png` 从网站 `public/fonts/chinese-hero.json` 的同源 Noto Sans SC 字形轮廓生成（沿用已保存的 OFL 许可）；其余五个标题PNG由本机 Microsoft YaHei 600栅格化固定标题文字，不分发系统字体文件。全部为3倍分辨率透明图片，总计约83KiB。可用 `node scripts/prepare-title-assets.cjs <chinese-hero.json绝对路径> <sharp模块绝对路径> <three包目录绝对路径>` 重新生成，脚本仅写本项目；系统字体不同会改变分区标题字形。运行时只读本地PNG，标题内容修改后应同步重新生成纹理与组件label/文字回退。

| 本项目素材 | 来源与转换 |
| --- | --- |
| `assets/icons/logo.png` | 网站 `public/icons/logo.svg` 的康彤 KT 品牌标识，转为宽 128px 的透明 PNG |
| `assets/icons/companies/ping-an.png` | 网站 `public/icons/companies/ping-an.svg`；来源为[中国平安品牌资料库](https://www.pingan.cn/about/material-lib.shtml)及[官方矢量素材](https://img2.pingan.com/app_series/pingancn/assets/img/logo_nav.svg)，保留网站中“中国平安”文字裁切，转为宽 256px PNG |
| `assets/icons/companies/hon-hai.png` | 网站 `public/icons/companies/hon-hai.svg`；来源为[鸿海企业识别规范](https://www.honhai.com/zh-tw/identification-specification)及[官方矢量素材](https://www.honhai.com/s3/modules/identification/h.svg)，转为宽 256px PNG |
| `assets/icons/skills/*.png` | 网站 `public/icons/skills/*.svg`，来自 [Devicon](https://github.com/devicons/devicon)，网站记录固定版本 `7330accdbc47e2dc0c19789a48533c4a3c50fe58`；宽 128px，保留透明背景和原始比例 |
| `assets/fonts/chinese-hero.woff2` | 网站同名字体；[Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc) 900 字重子集，覆盖“你好，我叫康彤”和“天工开物工作室” |

技术、公司名称及图标属于各自所有者，用于标识技能与经历。Kafka 原图为深色单色，转码为白色，对应网站 `lightIcon: true` 的深色卡片显示。其他图标保持原配色。采用 PNG 避免依赖微信对 SVG 图片的支持，运行时无图标库或 CDN 请求。

Devicon 许可原文保存于 `miniprogram/assets/icons/skills/LICENSE.devicon`。中文字体的来源说明和 SIL OFL 许可分别保存于 `miniprogram/assets/fonts/chinese-hero-LICENSE.md`、`NotoSansSC-OFL.txt`；使用、嵌入字体时保留这些文件。

## 作品动画

2026-10-19：下表GIF已从 `asset-backups/projects/` 原字节复制回 `miniprogram/assets/projects/`，备份继续保留。首页本地地址维护于 `data/projects.ts`；离线转换脚本生成的包内GIF可直接使用，无需上传或移出。加载记录见[CLOUD-ASSETS.md](CLOUD-ASSETS.md)。

原始素材为网站 `public/images/projects/kushop-640.webp` 与 `rest-640.webp`，两者均为 640×360、100 帧、每帧 50ms、完整时长 5 秒。它们展示网站现有案例，不是小程序内可操作的商城或餐厅页面。

| 本项目素材 | 原始字节数 | GIF 字节数 | 尺寸 | 帧数 | 时长 |
| --- | ---: | ---: | --- | ---: | ---: |
| `assets/projects/mall-motion.gif` | 844,698 | 145,473 | 320×180 | 34 | 5,000ms |
| `assets/projects/restaurant-motion.gif` | 3,156,818 | 593,527 | 320×180 | 34 | 5,000ms |

两个 GIF 合计 739,000 字节（约 722 KiB），低于本轮 900KB 素材预算。商城减少约 82.8%，餐厅减少约 81.2%。转换使用 Lanczos 缩小到原宽高的一半，每三帧采样一次，前 33 帧各 150ms，末帧 50ms，保留完整 5 秒时长并无限循环。采用每个动画统一的 64 色调色板、不加抖动，避免逐帧调色板导致闪色；代价是降低分辨率、帧率和颜色细节，尤其餐厅暗色画面可见色阶压缩。原静态 JPG 继续用于高清预览及动画失败降级。

已通过 Pillow 重新解码核对帧数、每帧时长及循环参数；检查了两段动画的首帧、中段和末帧，以及全部图标。GIF 的实际播放、页面加载、滚动时性能和真机观感需要另做微信运行时验证，不能由转码检查推定。

## 可重复生成

`scripts/prepare-assets.cjs` 只读取输入目录，将上述图标、字体、许可和动画写入本项目。此脚本是可选素材维护工具，不属于构建或运行依赖，不会安装软件包。

```powershell
node scripts/prepare-assets.cjs <参考网站public目录> <已安装sharp模块绝对路径> <带Pillow的Python可执行文件>
```

本次使用 Codex bundled runtime 中的 sharp 和 Pillow 12.3.0；未安装额外包。改变采样、尺寸、调色板或工具版本后，需重新记录体积和解码结果，并重新验证实际显示效果。

2026-10-19 Hero排版更新：离线生成脚本通过显式传入的 Three.js 包读取同源字体几何，复用网站移动端可见字形边界居中、1.3倍行距、宽度92%/高度80%等比适配。Hero纹理1080×655，容器宽高比1.65；添加 --hero-only 仅重建Hero，其他分区纹理不变。Three.js仅用于离线生成，不打入小程序包。
