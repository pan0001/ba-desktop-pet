# 原版界面素材

本目录用于桌宠设置界面。原始素材来自用户此前对话 **「连接 MuMu 模拟器 ADB」** 解包的《蔚蓝档案》UI 文件：

`BlueArchive_UI`（解包结果的逻辑根目录；公开记录不包含本机用户路径）

依据该目录的 `image_index.json`，查看了 `01_通用界面与控件` 的通用图集、按钮与面板底纹，以及 `09_背景加载与宣传/界面背景` 中的浅色背景。最终选择以下 4 张原 PNG。复制后未裁剪、重绘、改色、压缩或重新编码，源目录未改动。

| 文件 | 游戏原名 | 原尺寸 | 文件字节 | 用途 |
| --- | --- | --- | ---: | --- |
| `scenario-background.png` | `Scenario_Bg` | 1024×768 | 393023 | 浅蓝三角网格与淡粉渐变背景 |
| `mailbox-panel.png` | `Common_MailBox_NormalBg` | 906×315 | 162523 | 横向面板的灰蓝白三角底纹 |
| `triangle-panel.png` | `Common_Bg_Texture_Type01` | 482×251 | 65946 | 小型面板三角底纹 |
| `common-atlas.png` | `Common` | 2048×2048 | 2850633 | 原版按钮底纹、控件和图标的完整图集 |

原图合计 **3,472,125 字节（约 3.31 MiB）**。为了保留图集原字节并复用原按钮和图标，没有为了缩小体积而裁成单独图片。

`catalog.json` 的 `images` 记录原游戏路径、bundle、解包文件路径、原始尺寸、文件大小、SHA256；`sprites` 记录本次选用的 20 个图集区域及其原始 border/padding。Unity 的 64 位 path ID 保存为字符串，避免 JavaScript 数值精度丢失。`file` 相对桌宠项目根目录，`sourceFile` 相对上述本机解包目录。

## 精灵坐标来源

图集区域直接来自：

`Structure/prologdepengroup-assets-_mx-uis-atlas-_mxprolog_e65fce81.json`

其中 `type: MonoBehaviour`、`name: Common` 对应的原资源为 `Assets/_MX/UIs/Atlas/Common.asset`，使用其 `data.mSprites` 数值。导出的 PNG 与这些坐标使用同一方向：**左上角为原点，x 向右，y 向下**。已通过浏览器显示精确区域核对齿轮、手机、音量、咖啡杯、学生名片、放大镜和按钮底纹；不需要反转 y。

## 使用方式

加载 `sprites.css` 后可直接显示原版图标：

```html
<link rel="stylesheet" href="assets/ui/sprites.css">
<span class="ba-sprite ui-icon-settings" aria-hidden="true"></span>
<span class="ba-sprite ui-icon-chat" style="--icon-size:24px" aria-hidden="true"></span>
```

`--icon-size` 指显示高度，默认 30px；宽度保持原图比例。已提供 `settings`、`chat`、`volume`、`volume-muted`、`cafe`、`students`、`search`、`check`、`close`、`home`、`radio-off`、`radio-on` 类。原图中的 `search`、`close`、`home` 为白色图标，适合蓝色或深色按钮背景。

设置界面的按钮由 `renderer/button-skins.js` 绘制：使用原 `Common_Btn_BG` 的九宫格边界作为底板，按原 prefab 的 `inclineAngle: 10` 倾斜；`Common_Btn_Normal_*_Pt` 仅作为两侧等比装饰，不再横向拉伸成完整按钮。文字保留为可访问的 DOM 文本，不随底板倾斜。蓝色用于常用操作，白色用于次要操作，黄色用于首次启动确认，禁用时统一灰色。原图字节未修改，不增加第二层边框。

绘制仅在按钮尺寸变化或图集加载完成时进行，不使用持续动画循环。原组件结构核对来源为 `Structure/prologgroup-assets-_mx-addressableasset-ui-_mxprolog_f387612c.json`，网页实现沿用其组合方式，并非直接运行 Unity 组件。

可供进一步参考的原九宫格区域：

| ID | 原区域 x,y,w,h | 左/右/上/下 border |
| --- | --- | --- |
| `button-base` | 1400,375,68,70 | 30/30/30/35 |
| `tab-base` | 1250,262,76,79 | 35/35/35/35 |
| `popup-panel` | 222,678,118,215 | 48/48/145/65 |
| `selected-blue` | 1174,1189,138,87 | 69/69/42/42 |
| `sound-slider` | 975,1565,123,54 | 60/60/0/0 |

这些 border 是原 NGUI 元数据，**不等于对整张 2048² 图集直接应用 CSS `border-image-slice` 的参数**。如需九宫格，必须先在绘制层正确处理精灵区域；设置界面已在 Canvas 绘制层实现 `button-base` 的九宫格；其他区域仍按各自用途显示。

`preview.html` 只引用现有原图和图集区域，可离线查看素材、精灵及按钮示例。预览网页、桌宠设置的页面结构、中文标签、设置功能和交互行为均为本项目自己的实现；原版部分是这些图片和明确记录的图集坐标。
