# 原版情绪图标

本目录的 16 张 PNG 来自用户此前在对话 **「连接 MuMu 模拟器 ADB」** 中解包的《蔚蓝档案》资源：

`BlueArchive_UI`（解包结果的逻辑根目录；公开记录不包含本机用户路径）

以该目录 `image_index.json` 为索引，大小写不敏感地筛选 `original_path` 包含 `03_Emoticon` 且导出 `file` 为 PNG 的记录，共找到 33 张；从中选取 16 张适合表现头顶情绪的图片。复制后的 PNG 与源文件字节一致，未裁剪、重绘、改色或重新编码，原解包目录没有改动。每张图片的原名、原游戏资源路径、bundle、解包文件路径、尺寸和 SHA256 均记录在 `catalog.json` 中。

`catalog.json` 的 `icons` 以稳定 `id` 为键。`file` 相对于桌宠项目根目录；`sourceFile` 相对于上述本机解包目录。`pathId` 使用字符串保存 Unity 的 64 位标识，避免 JavaScript 数值精度丢失。`meaning` 是本项目为便于选择而写的中文说明，不是游戏台词。

打开 `preview.html` 可直接查看所选原图，无需联网。

| ID | 原图含义与使用注意 |
| --- | --- |
| `heart` | 红色爱心，喜爱、开心 |
| `note` | 黄色音符，愉快、哼歌 |
| `twinkle` | 黄色闪光，期待、喜悦 |
| `exclamation` | 橙黄感叹号，惊讶 |
| `exclamation_mark` | 红色感叹号，强烈惊讶 |
| `question` | 橙黄问号，疑惑 |
| `question_mark` | 绿色问号，疑惑 |
| `sweat_1`, `sweat_2` | 大小两种汗滴，紧张、慌张 |
| `shy` | 粉红三条腮红，害羞 |
| `anxiety` | 灰蓝乱线，困扰、慌张 |
| `aggro` | 生气符号的单个红色弧角，完整符号需要复用并旋转组合 |
| `tear_1`, `tear_2` | 大小两种泪滴，委屈 |
| `sad` | 单根紫色竖线，多根错列可表现低落 |
| `zzz` | 单个蓝色 Z，可复用并错列大小表现困倦 |

## 原版预制体能参考的部分

检查的文件为解包目录中的：

`Structure/uis-03_scenario-03_emoticon-_mxload-prefabs_242db813.json`

该文件含 30 个 GameObject、30 个 Transform、23 个 MonoBehaviour、7 个 Animation、8 个 AudioSource 和 1 个 MonoScript。7 个可追溯的根预制体分别是 `Emoticon_Steam`、`Emoticon_Sigh`、`Emoticon_Tear`、`Emoticon_Think`、`Emoticon_Bulb`、`Emoticon_Sad`、`Emoticon_Zzz`。

这里有静态层级、精灵名、显示尺寸、局部位置，以及动画资源的外部引用；**没有 AnimationClip 对象，也没有实际播放关键帧曲线**。7 个 Animation 均为 `m_PlayAutomatically: true`、`m_WrapMode: 0`，其 clip 指向 `m_FileID: 1` 的外部文件，无法仅凭这份预制体 JSON 确定时长、缓动或循环方式。本项目没有把外部 clip 引用当作已经还原的动画，也没有复制或播放这些预制体中的音效。

可确认的原版静态组合如下。坐标是 Unity 局部坐标，不直接等同于桌宠画布坐标；表中尺寸是预制体控件尺寸，与 PNG 原尺寸可能略有不同。

| 预制体 | 子精灵与尺寸 | 局部位置 | 外部动画 clip path ID |
| --- | --- | --- | --- |
| Tear | `Emoji_Tear_1` 68×88；`Emoji_Tear_2` 52×40 | `(0,0)`；`(-2,6)` | `-7903321712304303084` |
| Sad | 3 个 `Emoji_Sad`，均为 28×160 | `(0,0)`；`(28,-18)`；`(55,26)` | `-6957832047586180330` |
| Zzz | 3 个 `Emoji_Zzz`，分别 92×94、78×80、65×66 | `(0,0)`；`(70,38)`；`(131,4)` | `-461615514074135076` |

**原版的是图片素材，以及上面明确列出的静态组合参考；桌宠中的互动触发、情绪选择、出现位置、缩放、浮动、消失时机和播放队列由本项目实现。** 不应把它们描述为完整复刻了游戏情绪动画，或把情绪图标当作角色模型的面部表情骨骼。
