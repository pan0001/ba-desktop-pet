# 日常语音与中文字幕

来源：[基沃托斯古书馆](https://kivo.wiki/)。按本项目 `assets/media/catalog.json` 与 `assets/media/student-imports.json` 中的学生和 Kivo ID，读取公开学生数据 `https://api.kivo.wiki/api/v1/data/students/{id}`。

`catalog.json` 保留每条音频对应的原始描述、中文台词、原文、语言、资源地址与本地路径；文件索引包含大小和 SHA-256。音频直接保存原始 Ogg 或 WAV，不合成声音、不改写台词、不按列表位置跨语言拼接。

本次收录日语 5,621 句、中文 4,415 句，共 10,036 个文件（其中 3 个为原始 WAV），覆盖 Cafe、Lobby、Relationship_Up、LogIn、Formation_Select 等桌宠适用条目。276 个角色／换装中，270 个有日语，225 个有中文日常条目。缺少中文时回退到同一角色的日语音频与对应翻译；没有可用日常语音的角色明确显示暂无语音。战斗喊声、节日专用台词和回忆大厅连续剧情不会进入挂机随机池。礼服亚子的一条 Relationship_Up_3 上游文件截断，已排除并记录在 `catalog.json` 的 `excluded` 字段。

运行时只读取本地资源，不请求古书馆。更新方式：`node tools/sync-companion-assets.mjs --students-only --refresh`。省略 `--refresh` 可复用开发请求缓存。同步工具并发受限，验证 Ogg 页及结束标记或 WAV 容器完整性，成功后才写入新索引；下载可续跑，已确认的上游损坏记录见 `tools/game-assets/voice-exclusions.json`，源文件修好后应移除对应排除项。开发请求缓存位于 `test-results/kivo`。

角色、配音及游戏素材归原权利人所有；资料整理和翻译来源见古书馆角色页面。当前用于本地桌宠，不代表原作或古书馆官方产品。
