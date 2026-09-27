# 原始家具适配

## 当前范围

- 1015 件带纹理的游戏原始家具，对所有已导入学生开放摆放。
- 122 个候选组合中，108 组开放专用互动，涉及 103 个学生/服装、101 件家具。
- 12 组超出固定桌宠窗口，1 组角色睡姿低于地面，1 组缺少家具动画：仅保留摆放。原因在 `tools/game-assets/furniture-overrides.json` 和清单的 `missingAnimations`。
- 36 个 prefab 导出失败、1 个没有纹理：未加入选择列表。

设置 → 语音与家具 → 桌面休息角：图片、搜索、每页 18 项、当前学生专用互动筛选。名称暂用中日英分类及稳定编号，非官方译名。一次摆放一件家具；摆放时暂停散步，收起后恢复用户保存的散步偏好；抓起、切换学生会清理家具。

## 渲染与动画

原始 GLB 按 SHA-256 验证，模型与贴图原样保留。静态网格的 Y-up 已烘焙；骨骼 prefab 需要补齐 FBX 根节点坐标，避免重复旋转。蓝色懒人沙发另有经过画面核查的轴向修正。专用动作按学生、动作阶段匹配家具动画，两个 AnimationMixer 共用角色动画时间。

互动角色与家具共享原始坐标、相同比例及转向，不做行走时的根骨骼位移抵消；固定家具基底高度接地，避免按每帧角色姿势抬升家具。装饰家具在身旁以有限尺寸摆放，略微倾斜呈现，让地毯和薄墙板在固定正面镜头下可见。角色相机、正常尺寸及抓取支点不因家具改变，头发不加入碰撞。

家具只在选择时加载；切换中断旧请求，迟到的解析结果立即释放。收起清理几何体、贴图、骨骼、动画和描边资源。失败会清除保存的选择并提示；角色站稳后暂停时选家具，只更新一次静止姿势。

## 验证与复现

`tools/game-assets/review-furniture.cjs` 启动真实 Electron 桌宠，使用其镜头、材质、灯光、物理和动画，输出每件家具的原始画面、边界、运行状态及代码指纹。1015 件摆放家具均完成加载和截帧，全部 122 个候选组合有检查记录，失败组合显式停用。自动边界检测不代表任何时刻都没有细微穿模。

`tools/game-assets/build-furniture-gallery.py` 生成 `test-results/furniture-preview/index.html`，可以搜索、放大检查。预览卡只裁切和排版原图，不替换渲染设置。

```powershell
node --test tests/*.test.cjs
node tests/furniture-desktop.cjs
node tests/furniture-lifecycle.cjs
node tools/game-assets/review-furniture.cjs decor
node tools/game-assets/review-furniture.cjs interactions
python tools/game-assets/build-furniture-gallery.py
```

桌面测试覆盖屏幕边缘、真实鼠标抓取、支点误差、点击后保持静止、暂停选家具、快速切换竞态、缺资源恢复、角色动作匹配、缩略图和中日英界面。打包逐字节校验所有家具 GLB 与预览图，保留既有光环 OBJ 校验。

## 限制

这是单个桌宠的家具休息角，不是完整咖啡厅搭建器。大型舞台、墙面和泳池的部分专用组合仍待镜头与场景布局适配；睡床的 457 号角色需要重新对齐。GLB 不含完整 Unity 粒子系统、游戏机屏幕程序或专用 shader。
