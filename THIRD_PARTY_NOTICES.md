# 第三方素材与组件说明

BA 桌宠是非官方桌面应用，与《蔚蓝档案》及基沃托斯古书馆没有官方隶属或合作关系。

## 角色、模型、图像与声音

《蔚蓝档案》的角色、模型、动画、立绘、贴图、UI、情绪图标及配音等游戏素材权利归各原权利人所有。本项目的来源记录不构成对这些素材的开源授权，也不将第三方素材重新许可为 MIT 等代码许可证。

- 模型和立绘的来源索引：`assets/media/catalog.json`。
- 补充嘴部表情贴图及适配记录：`assets/media/expressions/README.md`。
- 日语、中文语音与台词来自 [基沃托斯古书馆](https://kivo.wiki/) 的公开学生资料；具体角色页面、音频地址、语言和文件校验见 `assets/voices/catalog.json`、`assets/voices/README.md`。
- 家具参考图及角色家具对应关系：`assets/furniture/catalog.json`、`assets/furniture/README.md`。本应用中的沙发和游戏机三维形体为本地简模。
- 原版 UI 和情绪图标来自本地解包的游戏资源。原始资源路径、bundle、文件名和 SHA-256 保留在 `assets/ui/catalog.json`、`assets/emotions/catalog.json`，不依赖原解包目录运行。

## 开源运行组件

- Three.js 使用 MIT 许可证，原文保留在 `assets/vendor/three/LICENSE`。
- Electron、Chromium 及随附组件的许可文件随 Windows 发行程序一起打包，包含 `LICENSE.electron.txt` 和 `LICENSES.chromium.html`。
- JavaScript 构建及测试依赖由 `package.json` 和 `package-lock.json` 记录，其许可证由各依赖自身提供。

仓库公开可见不代表全部代码及素材获得了同一种开源许可证；各第三方权利及许可仍分别适用。

## 应用内更新

electron-updater 6.8.9（MIT）及其生产依赖随程序分发，用于下载与校验 GitHub 更新。依赖随附的 LICENSE 文件保留在应用内 node_modules 目录中。lazy-val 1.0.5 的 npm 包未附单独许可证文件，其 package.json 声明 MIT，作者为 Vladimir Krivosheev；该元数据保留在应用内。项目：https://github.com/electron-userland/electron-builder
