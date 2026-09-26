# 日常语音与中文字幕

来源：[基沃托斯古书馆](https://kivo.wiki/)。按本项目 `assets/media/catalog.json` 中的 38 名角色与 Kivo ID，读取公开学生数据 `https://api.kivo.wiki/api/v1/data/students/{id}`。

`catalog.json` 保留每条音频对应的原始描述、中文台词、原文、语言、资源地址与本地路径；文件索引包含大小和 SHA-256。音频直接保存原始 Ogg，不合成声音、不改写台词、不按列表位置跨语言拼接。

本次收录日语 786 句、中文 671 句，覆盖 Cafe、Lobby、Relationship_Up、LogIn、Formation_Select 等桌宠适用条目。38 名角色均有日语；34 名有本次可用的中文日常条目。缺少中文时回退到同一角色的日语音频与对应翻译。未把战斗喊声、节日专用台词和回忆大厅连续剧情混入挂机随机池。

运行时只读取本地资源，不请求古书馆。更新方式：`node tools/sync-companion-assets.mjs --refresh`。省略 `--refresh` 可复用开发请求缓存。同步工具并发受限，检查响应与 Ogg 文件头，成功后才写入新索引；开发请求缓存位于 `test-results/kivo`。

角色、配音及游戏素材归原权利人所有；资料整理和翻译来源见古书馆角色页面。当前用于本地桌宠，不代表原作或古书馆官方产品。
