# 时：桌面服装与战斗部件重叠

普通版时（角色 287）的 Kivo 模型包含 `CH0187_Body`、女仆服
`CH0187_A_Body`、变身服装 `CH0187_B_Body` 和 `CH0187_Machine`。
实际桌宠待机截图复现了战斗面罩遮脸、机甲影响取景、抱起时外观突变。

本地源文件 `character-ch0187-_mxload-prefabs-2026-06-04_assets_all_1961795966.bundle`
中，`CH0187` / `Echelon_CH0187` 的 B_Body renderer 原本禁用。
另一个 `CH0187_CafeOnly` prefab 仅含 C_Body、武器和光环，不含机甲。
导出的 GLB 未保留游戏的 renderer-enable 切换。

桌宠适配层因此固定保留普通女仆形态，只隐藏当前模型的 B_Body 与 Machine
渲染节点，不隐藏共享骨骼，不改源 GLB、面部贴图或衣服顶点。
此适配也由家具演员加载流程使用；没有实现战斗机甲变身功能。
兔女郎（306）、临战（499）的节点不匹配该规则。

源 GLB SHA-256：`90d27862f89095e6cc546199dd1143120ddc55a93815f528707ccbdfbf26113c`。

验证：实际 Electron 桌宠渲染、尺寸 360、物理开启，截取待机、行走、抱起及
恢复画面；没有使用独立预览相机或替代材质。三个版本共 33 次面部/口型动作
采样通过。普通版没有无后缀的 Vital_Death 动作，当前仍沿用原有快速恢复逻辑。

```sh
node tests/face-desktop.cjs 287,306,499
node --test tests/face-materials.test.cjs
```

本地截图：`test-results/toki-review-before/cards/287.png` 与
`test-results/toki-review-after/cards/287.png`。此修复纳入 1.13.2 程序更新，源模型资源包不变。
