# 3D 嘴部表情图

- `Character_Mouth_High.png`：来自 Kivo 页面公开资源 [Character_Mouth_High-BgFqI_9W.png](https://kivo.wiki/assets/Character_Mouth_High-BgFqI_9W.png)，2048 × 2048，200,034 字节。
- SHA-256：`ff48cd75c186d6b344e1b63ef8e13b3c82122d859373e5c4a94ce781fb75c8f7`
- 使用原图，不修改源模型或原始游戏贴图。默认使用第 60 格，8 × 8 图集；按原模型嘴部 UV 设置 repeat 为 4/8、offset 为列/8 与行/8。
- 眼睛继续使用 GLB 内嵌的 EyeMouth 贴图，仅嘴部三角形使用本文件；不是给整个面部覆盖表情图。

处理方式参考 2026-09-07 检查的 [Kivo 学生页加载模块](https://kivo.wiki/assets/info-D_ZXEBqy.js)：转换 Toon 材质、独立嘴部图集、眼嘴几何分区与光环绑定。`scripts/ba-model-materials.js` 为本项目独立实现，采用同一网格的材质分组保留现有动画绑定，并非复制网站代码。

GLB 中身体等贴图 alpha 和顶点 alpha 包含游戏着色数据，不能一概作为透明裁剪。普通部位关闭透明和顶点色，眉毛与明确 `_alpha` 附件单独保留相应特性；不要重新加入全局 `alphaTest >= 0.04`。

2026-09-08 伊吹特殊结构：`Ibuki_Original_Face_Outline` 为普通脸，`Ibuki_Original_Face01_Outline` 为备用挤眼脸，不能同时显示。由于导出的动画不包含游戏面部显示切换事件，本站保留普通脸，隐藏备用网格。身体下独立的 `EyeMouth` primitive 实际只有嘴部（1 个岛、32 个三角形），以完整对象／材质名称及拓扑校验后接入嘴部图集；不放宽其他角色的单岛判断，也不改动正常眼睛网格。

本文件夹是补充表情资源，不属于学生模型 API 的 `texture` 列表，单独记录，不改写 `catalog.json` 的原始下载索引。角色和游戏素材版权归原权利方所有。

2026-09-10 玲纱（Reisa）独立嘴部：`CH0167_Body` 下的 `CH0167_Body_2` 使用 `CH0167_EyeMouth` 材质，但其索引仅包含嘴部的 1 个岛、32 个三角形；眼睛另在 `CH0167_Body_Face_Outline_2` 中。原通用单岛保护会跳过嘴部，显示内嵌贴图中的白色区域。增加精确名称／父节点／拓扑校验后，仅为该嘴部接入现有第 60 格表情，不修改眼睛与眉毛，也不修改源 GLB。真实贴图采样及 30 条动作下的嘴部绑定检查已补入 `check-model-materials.mjs`。

2026-09-08 佳代子光环坐标修复：`Kayoko_Original_Halo` 静态局部位置约为 `[0, 0.000516591, -0.001020315]`，父节点 `HaloRoot` 偏移约为 `[0, 0.0103, -0.002]`。43 个动画中的 15 个含恒定光环位置轨道，其值却是两者相加后的角色坐标。直接应用会再次叠加父偏移，使默认取景高度从约 `0.012558` 增至 `0.022997`。

`prepareAnimations()` 在绑定头部及首次取景前，仅对精确匹配该层级和恒定值的轨道克隆并转换坐标。源文件、原始 clips、身体／面部／武器轨道与其他角色不变；真正变化的光环位置轨道不采用此规则。`node scripts/check-model-halos.mjs` 覆盖所有动作、渐变切换、重复准备保护及其他 38 个模型的不变性。
