# 未花独立光环（Kivo 模型 201）

- 来源：[Kivo 未花鉴赏](https://kivo.wiki/data/character/1)，模型元数据：[models/201](https://api.kivo.wiki/api/v1/data/models/201)
- 来源名称：`mika_unofficial_halo`。这是来源标为 **非官方** 的独立光环，不应写成游戏官方原版模型。
- 原文件：[ミカ.obj](ミカ.obj)、[ミカ.mtl](ミカ.mtl)、[fuwafuwa.jpg](fuwafuwa.jpg)。此前已随学生素材完整下载，本次接入复用这些文件，未改写其内容；来源地址、字节数及 SHA-256 仍见 `assets/media/catalog.json`。

2026-09-08：本站通过 `scripts/mika-halo.js` 解析 23 个网格及原 MTL 材质，保留蓝粉渐变、星点和圆环；以中心圆环匹配角色内嵌光环的宽度，让外围特效保持原始比例。整个实例挂在未花的 `HaloRoot` 下，随头部骨骼、Victory 与 Pick Up 动画运动，不另外修改身体或骨骼。

光环使用不受灯光压暗的材质，也不叠加人物描边。仅在新实例完整加载并挂接后隐藏旧光环；独立资源读取失败时继续显示旧光环。两者原文件均保留。原始美术与独立模型的权利归各自权利方所有，保留来源说明。

回归：`node scripts/check-mika-halo.mjs`（离线检查；`--online` 可额外比较当前远端原文件）。
