# 已下载的学生 3D 模型

本目录保存本站 38 名学生在 Kivo Wiki 公开关联的模型原文件，不是外部资源链接占位。

- 角色本体：40 个 GLB（部分学生有多个本体版本）
- 光环：38 组 OBJ / PNG
- 共 119 个文件，约 374.0 MiB
- 全部文件已通过大小与 SHA-256 校验；40 个 GLB 的 glTF 2.0 文件头及声明长度已检查
- 2026-09-20 新增常服梓：本体 `218/Azusa_Original.glb`，光环 `10/Azusa_Original_Halo.obj`；其余学生记录保持不变
- 原始下载地址、文件大小和 SHA-256 见 [完整媒体索引](../catalog.json)
- 2026-09-08 重新核对 Kivo 的 37 名学生关联列表，无遗漏模型；浏览器逐个确认 37 名学生及两套额外版本载入就绪，完整动作表现仍需按需复核

## 加载兼容修复（2026-09-08）

礼服爱露、Kei、桔梗、未花、名草、妮可的原文件含 8 个权重整段为 NaN 的附属／备用网格，导致旧版预览取景失败。本站在运行时隔离这些不可用网格，并只对可见、有效顶点计算边界；未删除或改写任何 GLB，也未伪造附件骨骼权重。

Kei 默认展示 `501/CH0335.glb` 本体，`502/CH0335_Carrier.glb` 仍可在版本菜单中选择。完整来源索引保留原始顺序，网页本体优先排序不修改该索引。

检查命令：`node scripts/check-model-coverage.mjs`、`node scripts/check-model-skinning.mjs`；来源列表在线对照：`node scripts/check-model-coverage.mjs --online`。

## 按学生查找

小桃与未花（2026-09-08）：小桃的两条光环动画轨道已在运行时修正坐标空间，恢复正常取景比例。未花默认使用已下载的 [201 独立光环](201/README.md)，它在 Kivo 标为 `mika_unofficial_halo`；原内嵌光环保留为加载失败时的回退。没有改写原始模型文件。

| 学生 | 角色本体 | 光环 | 来源 |
| --- | --- | --- | --- |
| 天童 爱丽丝  | [Aris_Original_Body](212/Aris_Original.glb) | [Aris_Original_Halo](5/Aris_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/108) |
| 天童 爱丽丝 (临战) | [CH0334_Body](500/CH0334.glb) | [Aris_Original_Halo](5/Aris_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/574) |
| 陆八魔 阿露 (礼服) | [CH0240_Body](326/CH0240.glb) | [Aru_Original_Halo](6/Aru_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/350) |
| 秤 亚津子  | [Atsuko_Original_Body](216/Atsuko_Original.glb) | [Atsuko_Original_halo](8/Atsuko_Original_halo.obj) | [Kivo](https://kivo.wiki/student/35) |
| 火宫 千夏 (温泉) | [CH0163_Body](265/CH0163.glb) | [Chinatsu_Original_Halo](113/Chinatsu_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/140) |
| 和乐 千世  | [Chise_Original_Body](375/Chise_Original.glb) | [Chise_Original_Halo](112/Chise_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/84) |
| 伊草 遥香  | [Haruka_Original_Body](381/Haruka_Original.glb) | [Haruka_Original_Halo](27/Haruka_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/192) |
| 黑馆 晴奈 (正月) | [CH0191_Body](291/CH0191.glb) | [Haruna_Original_Halo](28/Haruna_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/145) |
| 阿慈谷 日富美  | [Hihumi_Original_Body](385/Hihumi_Original.glb) | [Hihumi_Halo](31/Hihumi_Halo.obj) | [Kivo](https://kivo.wiki/student/74) |
| 橘 光  | [CH0242_Body](327/CH0242.glb) | [CH0242_Halo](191/CH0242_Halo.obj) | [Kivo](https://kivo.wiki/student/365) |
| 空崎 日奈 (礼服) | [CH0230_Body](319/CH0230.glb) | [Hina_Original_Halo](32/Hina_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/346) |
| 小鸟游 星野 (临战) | [CH0258_01_Body](335/CH0258_01.glb)<br>[CH0258_02_Body](336/CH0258_02.glb) | [Hoshino_Origina_Halo](35/ホシノ.obj) | [Kivo](https://kivo.wiki/student/373) |
| 丹花 伊吹  | [Ibuki_Original_Body](391/Ibuki_Original.glb) | [Ibuki_Original](182/Ibuki_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/136) |
| 久田 泉奈 (泳装) | [CH0179_Body](279/CH0179.glb) | [Izuna_Original_Halo](38/Izuna_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/46) |
| 鬼方 佳代子  | [Kayoko_Original_Body](404/Kayoko_Original.glb) | [Kayoko_Original_Halo](42/Kayoko_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/176) |
| 天童 凯伊  | [CH0335_Carrier_Body](502/CH0335_Carrier.glb)<br>[CH0335_Body](501/CH0335.glb) | [CH0335_Halo](514/CH0335_Halo.obj) | [Kivo](https://kivo.wiki/student/518) |
| 桐生 桔梗  | [CH0225_Body](318/CH0225.glb) | [CH0225_Halo](156/CH0225_Halo.obj) | [Kivo](https://kivo.wiki/student/320) |
| 春原 心奈  | [CH0137_Body](252/CH0137.glb) | [CH0137_Halo](48/CH0137_Halo.obj) | [Kivo](https://kivo.wiki/student/4) |
| 高仓 胡桃  | [CH0173_Body](520/CH0173.glb) | [CH0173_Halo](62/CH0173_Halo.obj) | [Kivo](https://kivo.wiki/student/66) |
| 伊落 玛丽 (偶像) | [CH0273_Body](348/CH0273.glb) | [Mari_Original_Halo](109/Mari_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/498) |
| 才羽 绿  | [Midori_Original_Body](415/Midori_Original.glb) | [Midori_Original_Halo](105/Midori_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/27) |
| 圣园 未花  | [CH0069_Body](227/CH0069.glb) | [CH0069_Halo](12/CH0069_Halo.obj)<br>[mika_unofficial_halo](201/ミカ.obj) | [Kivo](https://kivo.wiki/student/1) |
| 苍森 美弥 (偶像) | [CH0275_Body](350/CH0275.glb) | [CH0152_Halo](53/CH0152_Halo.obj) | [Kivo](https://kivo.wiki/student/500) |
| 才羽 桃井  | [Momoi_Original_Body](421/Momoi_Original.glb) | [Momoi_Original_Halo](100/Momoi_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/2) |
| 浅黄 睦月  | [Mutsuki_Original_Body](423/Mutsuki_Original.glb) | [Mutsuki_Original_Halo](99/Mutsuki_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/107) |
| 御稜 名草  | [CH0222_Body](316/CH0222.glb) | [CH0222_Halo](203/CH0222_Halo.obj) | [Kivo](https://kivo.wiki/student/254) |
| 柚鸟 夏  | [CH0155_Body](259/CH0155.glb) | [CH0155_Halo](54/CH0155_Halo.obj) | [Kivo](https://kivo.wiki/student/139) |
| 吉野 妮可  | [CH0172_Body](519/CH0172.glb) | [CH0172_Halo](61/CH0172_Halo.obj) | [Kivo](https://kivo.wiki/student/65) |
| 生盐 诺亚 (睡衣) | [CH0285_Body](355/CH0285.glb) | [CH0095_Halo](17/CH0095_Halo.obj) | [Kivo](https://kivo.wiki/student/506) |
| 橘 望  | [CH0243_Body](328/CH0243.glb) | [CH0243_Halo](190/CH0243_Halo.obj) | [Kivo](https://kivo.wiki/student/366) |
| 宇泽 玲纱  | [CH0167_Body](268/CH0167.glb) | [CH0167_Halo](58/CH0167_Halo.obj) | [Kivo](https://kivo.wiki/student/142) |
| 歌住 樱子 (偶像) | [CH0274_Body](349/CH0274.glb) | [Sakurako_Original_Halo](94/Sakurako_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/499) |
| 间宵 时雨  | [Shigure_Original_Body](438/Shigure_Original.glb) | [Shigure_Original_Halo](88/CH0123_Halo.obj) | [Kivo](https://kivo.wiki/student/106) |
| 百合园 圣娅  | [CH0070_Body](228/CH0070.glb) | [CH0070_Halo](176/CH0070_Halo.obj) | [Kivo](https://kivo.wiki/student/43) |
| 古关 忧  | [CH0169_Body](269/CH0169.glb) | [CH0169_Halo](59/CH0169_Halo.obj) | [Kivo](https://kivo.wiki/student/23) |
| 早濑 优香 (睡衣) | [CH0284_Body](354/CH0284.glb) | [Yuuka_Original_Halo](76/Yuuka_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/505) |
| 花冈 柚子  | [Yuzu_Original_Body](455/Yuzu_Original.glb) | [Yuzu_Original_Halo](74/Yuzu_Original_Halo.obj) | [Kivo](https://kivo.wiki/student/81) |
| 白洲 梓 | [Azusa_Original_Body](218/Azusa_Original.glb) | [Azusa_Original_Halo](10/Azusa_Original_Halo.obj) | [Kivo](https://kivo.wiki/data/character/3) |

游戏素材与模型中的原始作者署名保持不变；本地保存不改变其权利归属。

GLB 可由兼容 glTF 2.0 的工具读取；OBJ 光环的 PNG 贴图与模型存放在同一编号文件夹。
