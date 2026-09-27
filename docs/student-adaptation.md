# 学生适配清单

当前接入 **276 个角色／换装、280 个模型**。原有 40 个模型的选择 ID 和 38 个学生存档 ID 均保留；新角色使用独立存档 ID。

全部学生身体模型采用古书馆处理过的版本，不再使用本地游戏转换的身体模型。模型按原文件下载，桌宠运行时适配面部材质、嘴型及光环跟随。原始游戏包和中间文件不随程序打包。优先使用 Cafe／Coffee 待机；源模型没有咖啡厅动作时使用其 Formation／Normal 待机，不假造咖啡厅动作。

已逐个通过实际渲染器的加载、光环跟随和可用待机／行走／抱起／倒地动作检查，共 3824 个动作采样。面部回归检查 2868 帧：276 个模型驱动嘴型；面具和没有可安全分离嘴部的特殊面部保留原材质。逐模型 SHA-256 和结果见 assets/media/student-validation.json。

语音采用原始日语／中文录音与对应台词，共 10036 条（含 3 条原始 WAV，其余为 Ogg）。270 个角色／换装有日常语音及主动邀约；其余显示暂无可用日常语音。6 个暂无语音的角色：雪乃、小雪（兔女郎）、海、周防、明美、茜（制服）。一条礼服亚子 Relationship_Up_3 的上游 Ogg 文件截断，经重复下载确认后排除，保留该角色其余完整录音；证据记录在语音目录 excluded 字段。

## 当前素材缺口

以下 5 个已实装角色／换装尚无可用的对应模型，因此未混入其他换装冒充。

| 角色／换装 | 原因 | 来源 |
| --- | --- | --- |
| 霞（泳装） | 古书馆暂无可用身体模型 | [角色页](https://kivo.wiki/student/546) |
| 叶莲娜 | 古书馆暂无可用身体模型 | [角色页](https://kivo.wiki/student/641) |
| 安娜 | 古书馆暂无可用身体模型 | [角色页](https://kivo.wiki/student/644) |
| 心 | 古书馆暂无可用身体模型 | [角色页](https://kivo.wiki/student/620) |
| 琴音 | 古书馆暂无可用身体模型 | [角色页](https://kivo.wiki/student/621) |

剧情占位条目、敌人及没有身体模型的未实装服装不计作已适配学生。完整来源覆盖记录保存在 assets/media/student-imports.json。

## 已接入角色

| 中文 | 日文 | 英文 | 模型 ID | 来源 |
| --- | --- | --- | --- | --- |
| 爱丽丝 | アリス | Aris | 212 | [古书馆](https://kivo.wiki/student/108) |
| 爱丽丝（临战） | アリス（臨戦） | Aris（Armed） | 500 | [古书馆](https://kivo.wiki/student/574) |
| 阿露（礼服） | アル（ドレス） | Aru（Dress） | 326 | [古书馆](https://kivo.wiki/student/350) |
| 亚津子 | アツコ | Atsuko | 216 | [古书馆](https://kivo.wiki/student/35) |
| 千夏（温泉） | チナツ（温泉） | Chinatsu（Hot Spring） | 265 | [古书馆](https://kivo.wiki/student/140) |
| 千世 | チセ | Chise | 375 | [古书馆](https://kivo.wiki/student/84) |
| 遥香 | ハルカ | Haruka | 381 | [古书馆](https://kivo.wiki/student/192) |
| 晴奈（正月） | ハルナ（正月） | Haruna（New Year） | 291 | [古书馆](https://kivo.wiki/student/145) |
| 日富美 | ヒフミ | Hifumi | 385 | [古书馆](https://kivo.wiki/student/74) |
| 光 | ヒカリ | Hikari | 327 | [古书馆](https://kivo.wiki/student/365) |
| 日奈（礼服） | ヒナ（ドレス） | Hina（Dress） | 319 | [古书馆](https://kivo.wiki/student/346) |
| 星野（临战） | ホシノ（臨戦） | Hoshino（Armed） | 335, 336 | [古书馆](https://kivo.wiki/student/373) |
| 伊吹 | イブキ | Ibuki | 391 | [古书馆](https://kivo.wiki/student/136) |
| 泉奈（泳装） | イズナ（水着） | Izuna（Swimsuit） | 279 | [古书馆](https://kivo.wiki/student/46) |
| 佳代子 | カヨコ | Kayoko | 404 | [古书馆](https://kivo.wiki/student/176) |
| 凯伊 | ケイ | Kei | 502, 501 | [古书馆](https://kivo.wiki/student/518) |
| 桔梗 | キキョウ | Kikyou | 318 | [古书馆](https://kivo.wiki/student/320) |
| 心奈 | ココナ | Kokona | 252 | [古书馆](https://kivo.wiki/student/4) |
| 胡桃 | クルミ | Kurumi | 520 | [古书馆](https://kivo.wiki/student/66) |
| 玛丽（偶像） | マリー（アイドル） | Mari（Idol） | 348 | [古书馆](https://kivo.wiki/student/498) |
| 绿 | ミドリ | Midori | 415 | [古书馆](https://kivo.wiki/student/27) |
| 未花 | ミカ | Mika | 227 | [古书馆](https://kivo.wiki/student/1) |
| 美弥（偶像） | ミネ（アイドル） | Mine（Idol） | 350 | [古书馆](https://kivo.wiki/student/500) |
| 桃井 | モモイ | Momoi | 421 | [古书馆](https://kivo.wiki/student/2) |
| 睦月 | ムツキ | Mutsuki | 423 | [古书馆](https://kivo.wiki/student/107) |
| 名草 | ナグサ | Nagusa | 316 | [古书馆](https://kivo.wiki/student/254) |
| 夏 | ナツ | Natsu | 259 | [古书馆](https://kivo.wiki/student/139) |
| 妮可 | ニコ | Niko | 519 | [古书馆](https://kivo.wiki/student/65) |
| 诺亚（睡衣） | ノア（パジャマ） | Noa（Pajamas） | 355 | [古书馆](https://kivo.wiki/student/506) |
| 望 | ノゾミ | Nozomi | 328 | [古书馆](https://kivo.wiki/student/366) |
| 玲纱 | レイサ | Reisa | 268 | [古书馆](https://kivo.wiki/student/142) |
| 樱子（偶像） | サクラコ（アイドル） | Sakurako（Idol） | 349 | [古书馆](https://kivo.wiki/student/499) |
| 时雨 | シグレ | Shigure | 438 | [古书馆](https://kivo.wiki/student/106) |
| 圣娅 | セイア | Seia | 228 | [古书馆](https://kivo.wiki/student/43) |
| 忧 | ウイ | Ui | 269 | [古书馆](https://kivo.wiki/student/23) |
| 优香（睡衣） | ユウカ（パジャマ） | Yuuka（Pajamas） | 354 | [古书馆](https://kivo.wiki/student/505) |
| 柚子 | ユズ | Yuzu | 455 | [古书馆](https://kivo.wiki/student/81) |
| 梓 | アズサ | Azusa | 218 | [古书馆](https://kivo.wiki/student/3) |
| 宫子 | ミヤコ | Miyako | 418 | [古书馆](https://kivo.wiki/student/6) |
| 萌绘 | モエ | Moe | 419 | [古书馆](https://kivo.wiki/student/7) |
| 咲 | サキ | Saki | 256 | [古书馆](https://kivo.wiki/student/8) |
| 美游 | ミユ | Miyu | 257 | [古书馆](https://kivo.wiki/student/9) |
| 爱莉 | アイリ | Airi | 208 | [古书馆](https://kivo.wiki/student/10) |
| 若藻 | ワカモ | Wakamo | 450 | [古书馆](https://kivo.wiki/student/11) |
| 濑名 | セナ | Sena | 232 | [古书馆](https://kivo.wiki/student/18) |
| 千寻 | チヒロ | Chihiro | 263 | [古书馆](https://kivo.wiki/student/20) |
| 弥守 | ミモリ | Mimori | 416 | [古书馆](https://kivo.wiki/student/22) |
| 茜 | アカネ | Akane | 209 | [古书馆](https://kivo.wiki/student/24) |
| 渚 | ナギサ | Nagisa | 425 | [古书馆](https://kivo.wiki/student/25) |
| 日向 | ヒナタ | Hinata | 387 | [古书馆](https://kivo.wiki/student/26) |
| 诺亚 | ノア | Noa | 239 | [古书馆](https://kivo.wiki/student/28) |
| 枫 | カエデ | Kaede | 397 | [古书馆](https://kivo.wiki/student/29) |
| 桃井（女仆） | モモイ（メイド） | Momoi（Maid） | 300 | [古书馆](https://kivo.wiki/student/30) |
| 绿（女仆） | ミドリ（メイド） | Midori（Maid） | 457 | [古书馆](https://kivo.wiki/student/31) |
| 月咏 | ツクヨ | Tsukuyo | 248 | [古书馆](https://kivo.wiki/student/32) |
| 美咲 | ミサキ | Misaki | 417 | [古书馆](https://kivo.wiki/student/33) |
| 日和 | ヒヨリ | Hiyori | 388 | [古书馆](https://kivo.wiki/student/34) |
| 纱织 | サオリ | Saori | 432 | [古书馆](https://kivo.wiki/student/36) |
| 和纱 | カズサ | Kazusa | 405 | [古书馆](https://kivo.wiki/student/37) |
| 伊吕波 | イロハ | Iroha | 260 | [古书馆](https://kivo.wiki/student/38) |
| 亚子 | アコ | Ako | 211 | [古书馆](https://kivo.wiki/student/39) |
| 野宫（泳装） | ノノミ（水着） | Nonomi（Swimsuit） | 238 | [古书馆](https://kivo.wiki/student/40) |
| 若藻（泳装） | ワカモ（水着） | Wakamo（Swimsuit） | 275 | [古书馆](https://kivo.wiki/student/41) |
| 星野（泳装） | ホシノ（水着） | Hoshino（Swimsuit） | 390 | [古书馆](https://kivo.wiki/student/42) |
| 芹香（正月） | セリカ（正月） | Serika（New Year） | 435 | [古书馆](https://kivo.wiki/student/44) |
| 玛丽娜 | マリナ | Marina | 413 | [古书馆](https://kivo.wiki/student/45) |
| 绫音（泳装） | アヤネ（水着） | Ayane（Swimsuit） | 276 | [古书馆](https://kivo.wiki/student/47) |
| 千世（泳装） | チセ（水着） | Chise（Swimsuit） | 278 | [古书馆](https://kivo.wiki/student/48) |
| 枫香（正月） | フウカ（正月） | Fuuka（New Year） | 277 | [古书馆](https://kivo.wiki/student/49) |
| 静子（泳装） | シズコ（水着） | Shizuko（Swimsuit） | 280 | [古书馆](https://kivo.wiki/student/50) |
| 响（应援团） | ヒビキ（応援団） | Hibiki（Cheer Squad） | 281 | [古书馆](https://kivo.wiki/student/51) |
| 优香 | ユウカ | Yuuka | 454 | [古书馆](https://kivo.wiki/student/52) |
| 歌原（应援团） | ウタハ（応援団） | Utaha（Cheer Squad） | 282 | [古书馆](https://kivo.wiki/student/53) |
| 优香（体操服） | ユウカ（体操服） | Yuuka（Track） | 284 | [古书馆](https://kivo.wiki/student/54) |
| 玛丽（体操服） | マリー（体操服） | Mari（Track） | 286 | [古书馆](https://kivo.wiki/student/55) |
| 弥守（泳装） | ミモリ（水着） | Mimori（Swimsuit） | 283 | [古书馆](https://kivo.wiki/student/56) |
| 小鸟（应援团） | コトリ（応援団） | Kotori（Cheer Squad） | 285 | [古书馆](https://kivo.wiki/student/57) |
| 白子（泳装） | シロコ（水着） | Shiroko（Swimsuit） | 288 | [古书馆](https://kivo.wiki/student/58) |
| 芹香（泳装） | セリカ（水着） | Serika（Swimsuit） | 289 | [古书馆](https://kivo.wiki/student/59) |
| 莲见（体操服） | ハスミ（体操服） | Hasumi（Track） | 290 | [古书馆](https://kivo.wiki/student/60) |
| 妃咲 | キサキ | Kisaki | 254 | [古书馆](https://kivo.wiki/student/61) |
| 日鞠 | ヒマリ | Himari | 262 | [古书馆](https://kivo.wiki/student/62) |
| 吹雪 | フブキ | Fubuki | 255 | [古书馆](https://kivo.wiki/student/63) |
| 雪乃 | ユキノ | Yukino | 271 | [古书馆](https://kivo.wiki/student/64) |
| 音葵 | オトギ | Otogi | 521 | [古书馆](https://kivo.wiki/student/67) |
| 初音未来 | ミク | Miku | 372 | [古书馆](https://kivo.wiki/student/68) |
| 响 | ヒビキ | Hibiki | 384 | [古书馆](https://kivo.wiki/student/69) |
| 日富美（泳装） | ヒフミ（水着） | Hifumi（Swimsuit） | 221 | [古书馆](https://kivo.wiki/student/70) |
| 日奈 | ヒナ | Hina | 386 | [古书馆](https://kivo.wiki/student/71) |
| 伊织 | イオリ | Iori | 392 | [古书馆](https://kivo.wiki/student/72) |
| 泉 | イズミ | Izumi | 393 | [古书馆](https://kivo.wiki/student/73) |
| 泉（泳装） | イズミ（水着） | Izumi（Swimsuit） | 394 | [古书馆](https://kivo.wiki/student/75) |
| 星野 | ホシノ | Hoshino | 389 | [古书馆](https://kivo.wiki/student/76) |
| 时 | トキ | Toki | 287 | [古书馆](https://kivo.wiki/student/77) |
| 野宫 | ノノミ | Nonomi | 428 | [古书馆](https://kivo.wiki/student/78) |
| 真白 | マシロ | Mashiro | 414 | [古书馆](https://kivo.wiki/student/79) |
| 真白（泳装） | マシロ（水着） | Mashiro（Swimsuit） | 223 | [古书馆](https://kivo.wiki/student/80) |
| 柚子（女仆） | ユズ（メイド） | Yuzu（Maid） | 301 | [古书馆](https://kivo.wiki/student/82) |
| 芹香 | セリカ | Serika | 436 | [古书馆](https://kivo.wiki/student/83) |
| 绫音 | アヤネ | Ayane | 217 | [古书馆](https://kivo.wiki/student/85) |
| 白子 | シロコ | Shiroko | 440 | [古书馆](https://kivo.wiki/student/86) |
| 白子（骑行服） | シロコ（ライディング） | Shiroko（Cycling） | 441 | [古书馆](https://kivo.wiki/student/87) |
| 纱绫 | サヤ | Saya | 434 | [古书馆](https://kivo.wiki/student/88) |
| 纱绫（私服） | サヤ（私服） | Saya（Casual） | 433 | [古书馆](https://kivo.wiki/student/89) |
| 瞬 | シュン | Shun | 443 | [古书馆](https://kivo.wiki/student/90) |
| 芹娜 | セリナ | Serina | 437 | [古书馆](https://kivo.wiki/student/91) |
| 花子 | ハナコ | Hanako | 379 | [古书馆](https://kivo.wiki/student/92) |
| 椿 | ツバキ | Tsubaki | 447 | [古书馆](https://kivo.wiki/student/93) |
| 鹤城 | ツルギ | Tsurugi | 448 | [古书馆](https://kivo.wiki/student/94) |
| 智惠 | トモエ | Tomoe | 446 | [古书馆](https://kivo.wiki/student/95) |
| 静子 | シズコ | Shizuko | 442 | [古书馆](https://kivo.wiki/student/96) |
| 枫香 | フウカ | Fuuka | 377 | [古书馆](https://kivo.wiki/student/97) |
| 花江 | ハナエ | Hanae | 378 | [古书馆](https://kivo.wiki/student/98) |
| 玛丽 | マリー | Mari | 412 | [古书馆](https://kivo.wiki/student/99) |
| 桐乃 | キリノ | Kirino | 407 | [古书馆](https://kivo.wiki/student/100) |
| 小雪 | コユキ | Koyuki | 298 | [古书馆](https://kivo.wiki/student/101) |
| 阿露（正月） | アル（正月） | Aru（New Year） | 213 | [古书馆](https://kivo.wiki/student/102) |
| 纯子 | ジュンコ | Junko | 456 | [古书馆](https://kivo.wiki/student/103) |
| 瞬（幼女） | シュン（幼女） | Shun（Young） | 226 | [古书馆](https://kivo.wiki/student/109) |
| 明里 | アカリ | Akari | 210 | [古书馆](https://kivo.wiki/student/110) |
| 莲见 | ハスミ | Hasumi | 383 | [古书馆](https://kivo.wiki/student/111) |
| 阿露 | アル | Aru | 214 | [古书馆](https://kivo.wiki/student/112) |
| 明日奈 | アスナ | Asuna | 215 | [古书馆](https://kivo.wiki/student/113) |
| 一花 | イチカ | ichika | 229 | [古书馆](https://kivo.wiki/student/114) |
| 真琴 | マコト | Makoto | 230 | [古书馆](https://kivo.wiki/student/115) |
| 霞 | カスミ | Kasumi | 237 | [古书馆](https://kivo.wiki/student/116) |
| 千夏 | チナツ | Chinatsu | 374 | [古书馆](https://kivo.wiki/student/117) |
| 好美 | ヨシミ | Yoshimi | 453 | [古书馆](https://kivo.wiki/student/118) |
| 和香 | ノドカ | Nodoka | 427 | [古书馆](https://kivo.wiki/student/119) |
| 和香（温泉） | ノドカ（温泉） | Nodoka（Hot Spring） | 267 | [古书馆](https://kivo.wiki/student/120) |
| 日奈（泳装） | ヒナ（水着） | Hina（Swimsuit） | 224 | [古书馆](https://kivo.wiki/student/121) |
| 伊织（泳装） | イオリ（水着） | Iori（Swimsuit） | 225 | [古书馆](https://kivo.wiki/student/122) |
| 佳代子（正月） | カヨコ（正月） | Kayoko（New Year） | 234 | [古书馆](https://kivo.wiki/student/123) |
| 遥香（正月） | ハルカ（正月） | Haruka（New Year） | 235 | [古书馆](https://kivo.wiki/student/124) |
| 尼娅 | ニヤ | Niya | 245 | [古书馆](https://kivo.wiki/student/126) |
| 海夏 | ウミカ | Umika | 246 | [古书馆](https://kivo.wiki/student/127) |
| 留美 | ルミ | Rumi | 251 | [古书馆](https://kivo.wiki/student/128) |
| 美弥 | ミネ | Mine | 258 | [古书馆](https://kivo.wiki/student/129) |
| 明日奈（兔女郎） | アスナ（バニーガール） | Asuna（Bunny） | 240 | [古书馆](https://kivo.wiki/student/130) |
| 南 | ミナ | Mina | 253 | [古书馆](https://kivo.wiki/student/131) |
| 茜（兔女郎） | アカネ（バニーガール） | Akane（Bunny） | 241 | [古书馆](https://kivo.wiki/student/132) |
| 莉音 | リオ | Rio | 261 | [古书馆](https://kivo.wiki/student/133) |
| 兰舞 | ラブ | Rabu | 478, 464 | [古书馆](https://kivo.wiki/student/134) |
| 白子*恐怖 | シロコ＊テラー | Shiroko*terror | 341 | [古书馆](https://kivo.wiki/student/135) |
| 花凛（兔女郎） | カリン（バニーガール） | Karin（Bunny） | 242 | [古书馆](https://kivo.wiki/student/137) |
| 妮禄（兔女郎） | ネル（バニーガール） | Neru（Bunny） | 243 | [古书馆](https://kivo.wiki/student/138) |
| 切里诺（温泉） | チェリノ（温泉） | Cherino（Hot Spring） | 266 | [古书馆](https://kivo.wiki/student/141) |
| 果穗 | カホ | Kaho | 244 | [古书馆](https://kivo.wiki/student/143) |
| 叶渚 | カンナ | Kanna | 270 | [古书馆](https://kivo.wiki/student/144) |
| 纯子（正月） | ジュンコ（正月） | Junko（New Year） | 292 | [古书馆](https://kivo.wiki/student/146) |
| 爱丽丝（女仆） | アリス（メイド） | Aris（Maid） | 299 | [古书馆](https://kivo.wiki/student/152) |
| 芹娜（圣诞节） | セリナ（クリスマス） | Serina（Christmas） | 294 | [古书馆](https://kivo.wiki/student/153) |
| 晴奈（体操服） | ハルナ（体操服） | Haruna（Track） | 293 | [古书馆](https://kivo.wiki/student/154) |
| 明里（正月） | アカリ（正月） | Akari（New Year） | 296 | [古书馆](https://kivo.wiki/student/155) |
| 泉（正月） | イズミ（正月） | Izumi（New Year） | 297 | [古书馆](https://kivo.wiki/student/156) |
| 小春 | コハル | Koharu | 408 | [古书馆](https://kivo.wiki/student/157) |
| 艾米 | エイミ | Eimi | 376 | [古书馆](https://kivo.wiki/student/158) |
| 绘里香 | エリカ | Erika | 424, 531 | [古书馆](https://kivo.wiki/student/159) |
| 晴 | ハレ | Hare | 380 | [古书馆](https://kivo.wiki/student/160) |
| 小雪（兔女郎） | コユキ（バニーガール） | Koyuki（Bunny） | 452 | [古书馆](https://kivo.wiki/student/161) |
| 绮良 | キララ | Kirara | 406 | [古书馆](https://kivo.wiki/student/163) |
| 实梨 | ミノリ | Minori | 308 | [古书馆](https://kivo.wiki/student/166) |
| 红叶 | モミジ | Momiji | 420 | [古书馆](https://kivo.wiki/student/167) |
| 花凛 | カリン | Karin | 403 | [古书馆](https://kivo.wiki/student/175) |
| 睦月（正月） | ムツキ（正月） | Mutsuki（New Year） | 422 | [古书馆](https://kivo.wiki/student/177) |
| 花江（圣诞节） | ハナエ（クリスマス） | Hanae（Christmas） | 295 | [古书馆](https://kivo.wiki/student/178) |
| 切里诺 | チェリノ | Cherino | 373 | [古书馆](https://kivo.wiki/student/179) |
| 泉奈 | イズナ | Izuna | 395 | [古书馆](https://kivo.wiki/student/180) |
| 铃美 | スズミ | Suzumi | 445 | [古书馆](https://kivo.wiki/student/181) |
| 真纪 | マキ | Maki | 411 | [古书馆](https://kivo.wiki/student/182) |
| 歌原 | ウタハ | Utaha | 449 | [古书馆](https://kivo.wiki/student/185) |
| 朱莉 | ジュリ | Juri | 396 | [古书馆](https://kivo.wiki/student/186) |
| 堇 | スミレ | Sumire | 444 | [古书馆](https://kivo.wiki/student/187) |
| 志美子 | シミコ | Shimiko | 439 | [古书馆](https://kivo.wiki/student/194) |
| 晴奈 | ハルナ | Haruna | 382 | [古书馆](https://kivo.wiki/student/195) |
| 樱子 | サクラコ | Sakurako | 431 | [古书馆](https://kivo.wiki/student/203) |
| 小鸟 | コトリ | Kotori | 410 | [古书馆](https://kivo.wiki/student/211) |
| 小玉 | コタマ | Kotama | 409 | [古书馆](https://kivo.wiki/student/212) |
| 妮禄 | ネル | Neru | 426 | [古书馆](https://kivo.wiki/student/213) |
| 满 | ミチル | Michiru | 247 | [古书馆](https://kivo.wiki/student/214) |
| 菲娜 | フィーナ | Pina | 429 | [古书馆](https://kivo.wiki/student/215) |
| 皋月 | サツキ | Satsuki | 231 | [古书馆](https://kivo.wiki/student/216) |
| 时雨（温泉） | シグレ（温泉） | Shigure（Hot Spring） | 249 | [古书馆](https://kivo.wiki/student/227) |
| 梓（泳装） | アズサ（水着） | Azusa（Swimsuit） | 219 | [古书馆](https://kivo.wiki/student/228) |
| 惠 | メグ | Megu | 236 | [古书馆](https://kivo.wiki/student/229) |
| 时（兔女郎） | トキ（バニーガール） | Toki（Bunny） | 306 | [古书馆](https://kivo.wiki/student/230) |
| 梅露 | メル | Meru | 250 | [古书馆](https://kivo.wiki/student/264) |
| 鹤城（泳装） | ツルギ（水着） | Tsurugi（Swimsuit） | 222 | [古书馆](https://kivo.wiki/student/269) |
| 海 | カイ | Kai | 307 | [古书馆](https://kivo.wiki/student/270) |
| 丽情 | レイジョ | Reijo | 430 | [古书馆](https://kivo.wiki/student/271) |
| 美游（泳装） | ミユ（水着） | Miyu（Swimsuit） | 312 | [古书馆](https://kivo.wiki/student/278) |
| 咲（泳装） | サキ（水着） | Saki（Swimsuit） | 311 | [古书馆](https://kivo.wiki/student/279) |
| 宫子（泳装） | ミヤコ（水着） | Miyako（Swimsuit） | 309 | [古书馆](https://kivo.wiki/student/280) |
| 萌绘（泳装） | モエ（水着） | Moe（Swimsuit） | 310 | [古书馆](https://kivo.wiki/student/286) |
| 小春（泳装） | コハル（水着） | Koharu（Swimsuit） | 303 | [古书馆](https://kivo.wiki/student/299) |
| 花子（泳装） | ハナコ（水着） | Hanako（Swimsuit） | 304 | [古书馆](https://kivo.wiki/student/300) |
| 日向（泳装） | ヒナタ（水着） | Hinata（Swimsuit） | 305 | [古书馆](https://kivo.wiki/student/301) |
| 忧（泳装） | ウイ（水着） | Ui（Swimsuit） | 302 | [古书馆](https://kivo.wiki/student/302) |
| 贵音 | タカネ | Takane | 486 | [古书馆](https://kivo.wiki/student/308) |
| 八云 | ヤクモ | Yakumo | 485 | [古书馆](https://kivo.wiki/student/309) |
| 美琴 | 美琴 | Mikoto | 371 | [古书馆](https://kivo.wiki/student/315) |
| 操祈 | 操祈 | Misaki | 370 | [古书馆](https://kivo.wiki/student/316) |
| 泪子 | 涙子 | Ruiko | 369 | [古书馆](https://kivo.wiki/student/317) |
| 紫 | ユカリ | Yukari | 264 | [古书馆](https://kivo.wiki/student/318) |
| 莲华 | レンゲ | Renge | 317 | [古书馆](https://kivo.wiki/student/319) |
| 艾米（泳装） | エイミ（水着） | Eimi（Swimsuit） | 313 | [古书馆](https://kivo.wiki/student/334) |
| 晴（露营） | ハレ（キャンプ） | Hare（Camp） | 322 | [古书馆](https://kivo.wiki/student/340) |
| 小玉（露营） | コタマ（キャンプ） | Kotama（Camp） | 321 | [古书馆](https://kivo.wiki/student/341) |
| 莱依 | レイ | Rei | 330 | [古书馆](https://kivo.wiki/student/342) |
| 真纪（露营） | マキ（キャンプ） | Maki（Camp） | 323 | [古书馆](https://kivo.wiki/student/343) |
| 亚子（礼服） | アコ（ドレス） | Ako（Dress） | 320 | [古书馆](https://kivo.wiki/student/345) |
| 千明 | チアキ | Chiaki | 324 | [古书馆](https://kivo.wiki/student/347) |
| 佳代子（礼服） | カヨコ（ドレス） | Kayoko（Dress） | 325 | [古书馆](https://kivo.wiki/student/351) |
| 睦月（礼服） | ムツキ（ドレス） | Mutsuki（Dress） | 532 | [古书馆](https://kivo.wiki/student/352) |
| 遥香（礼服） | ハルカ（ドレス） | Haruka（Dress） | 533 | [古书馆](https://kivo.wiki/student/353) |
| 纱织（礼服） | サオリ（ドレス） | Saori（Dress） | 337 | [古书馆](https://kivo.wiki/student/356) |
| 椿（导游） | ツバキ（ガイド） | Tsubaki（Guide） | 333 | [古书馆](https://kivo.wiki/student/360) |
| 菲娜（导游） | フィーナ（ガイド） | Pina（Guide） | 334 | [古书馆](https://kivo.wiki/student/362) |
| 周防 | スオウ | Suou | 329 | [古书馆](https://kivo.wiki/student/367) |
| 和纱（乐队） | カズサ（バンド） | Kazusa（Band） | 331 | [古书馆](https://kivo.wiki/student/368) |
| 爱莉（乐队） | アイリ（バンド） | Airi（Band） | 332 | [古书馆](https://kivo.wiki/student/369) |
| 好美（乐队） | ヨシミ（バンド） | Yoshimi（Band） | 314 | [古书馆](https://kivo.wiki/student/370) |
| 夏（乐队） | ナツ（バンド） | Natsu（Band） | 315 | [古书馆](https://kivo.wiki/student/371) |
| 叶渚（泳装） | カンナ（水着） | Kanna（Swimsuit） | 338 | [古书馆](https://kivo.wiki/student/375) |
| 吹雪（泳装） | フブキ（水着） | Fubuki（Swimsuit） | 339 | [古书馆](https://kivo.wiki/student/376) |
| 桐乃（泳装） | キリノ（水着） | Kirino（Swimsuit） | 340 | [古书馆](https://kivo.wiki/student/377) |
| 心华 | コノカ | Konoka | 522 | [古书馆](https://kivo.wiki/student/378) |
| 纱织（泳装） | サオリ（水着） | Saori（Swimsuit） | 343 | [古书馆](https://kivo.wiki/student/381) |
| 亚津子（泳装） | アツコ（水着） | Atsuko（Swimsuit） | 344 | [古书馆](https://kivo.wiki/student/382) |
| 日和（泳装） | ヒヨリ（水着） | Hiyori（Swimsuit） | 345 | [古书馆](https://kivo.wiki/student/383) |
| 美咲（泳装） | ミサキ（水着） | Misaki（Swimsuit） | 458 | [古书馆](https://kivo.wiki/student/384) |
| 明美 | アケミ | Akemi | 342 | [古书馆](https://kivo.wiki/student/385) |
| 智惠（旗袍） | トモエ（チーパオ） | Tomoe（Qipao） | 347 | [古书馆](https://kivo.wiki/student/388) |
| 玛丽娜（旗袍） | マリナ（チーパオ） | Marina（Qipao） | 346 | [古书馆](https://kivo.wiki/student/389) |
| 小雪（睡衣） | コユキ（パジャマ） | Koyuki（Pajamas） | 516 | [古书馆](https://kivo.wiki/student/508) |
| 明日奈（制服） | アスナ（制服） | Asuna（Uniform） | 352 | [古书馆](https://kivo.wiki/student/512) |
| 花凛（制服） | カリン（制服） | Karin（Uniform） | 353 | [古书馆](https://kivo.wiki/student/513) |
| 妮禄（制服） | ネル（制服） | Neru（Uniform） | 351 | [古书馆](https://kivo.wiki/student/514) |
| 茜（制服） | アカネ（制服） | Akane（Uniform） | 524 | [古书馆](https://kivo.wiki/student/517) |
| 濑名（私服） | セナ（私服） | Sena（Casual） | 233 | [古书馆](https://kivo.wiki/student/520) |
| 朱莉（打工） | ジュリ（アルバイト） | Juri（Part-time） | 356 | [古书馆](https://kivo.wiki/student/521) |
| 堇（打工） | スミレ（アルバイト） | Sumire（Part-time） | 357 | [古书馆](https://kivo.wiki/student/523) |
| 青叶 | アオバ | Aoba | 358 | [古书馆](https://kivo.wiki/student/525) |
| 紫（泳装） | ユカリ（水着） | Yukari（Swimsuit） | 365 | [古书馆](https://kivo.wiki/student/533) |
| 桔梗（泳装） | キキョウ（水着） | Kikyou（Swimsuit） | 364 | [古书馆](https://kivo.wiki/student/534) |
| 莲华（泳装） | レンゲ（水着） | Renge（Swimsuit） | 366 | [古书馆](https://kivo.wiki/student/535) |
| 名草（泳装） | ナグサ（水着） | Nagusa（Swimsuit） | 534 | [古书馆](https://kivo.wiki/student/537) |
| 莲见（泳装） | ハスミ（水着） | Hasumi（Swimsuit） | 359 | [古书馆](https://kivo.wiki/student/541) |
| 一花（泳装） | イチカ（水着） | Ichika（Swimsuit） | 360 | [古书馆](https://kivo.wiki/student/542) |
| 圣娅（泳装） | セイア（水着） | Seia（Swimsuit） | 363 | [古书馆](https://kivo.wiki/student/543) |
| 渚（泳装） | ナギサ（水着） | Nagisa（Swimsuit） | 361 | [古书馆](https://kivo.wiki/student/544) |
| 未花（泳装） | ミカ（水着） | Mika（Swimsuit） | 362 | [古书馆](https://kivo.wiki/student/545) |
| 庚 | カノエ | Kanoe | 368 | [古书馆](https://kivo.wiki/student/548) |
| 艾利 | エリ | Eri | 367 | [古书馆](https://kivo.wiki/student/549) |
| 莱娜 | レナ | Rena | 523 | [古书馆](https://kivo.wiki/student/550) |
| 美代 | ミヨ | Miyo | 472 | [古书馆](https://kivo.wiki/student/554) |
| 昴 | スバル | Subaru | 487 | [古书馆](https://kivo.wiki/student/559) |
| 冬 | フユ | Fuyu | 473 | [古书馆](https://kivo.wiki/student/560) |
| 律 | リツ | Ritsu | 474 | [古书馆](https://kivo.wiki/student/561) |
| 铃美（魔法） | スズミ（マジカル） | Suzumi（Magical） | 479 | [古书馆](https://kivo.wiki/student/563) |
| 玲纱（魔法） | レイサ（マジカル） | Reisa（Magical） | 480 | [古书馆](https://kivo.wiki/student/565) |
| 月咏（礼服） | ツクヨ（ドレス） | Tsukuyo（Dress） | 496 | [古书馆](https://kivo.wiki/student/568) |
| 满（礼服） | ミチル（ドレス） | Michiru（Dress） | 495 | [古书馆](https://kivo.wiki/student/569) |
| 莉音（临战） | リオ（臨戦） | Rio（Armed） | 497 | [古书馆](https://kivo.wiki/student/571) |
| 日鞠（临战） | ヒマリ（臨戦） | Himari（Armed） | 498 | [古书馆](https://kivo.wiki/student/572) |
| 时（临战） | トキ（臨戦） | Toki（Armed） | 499 | [古书馆](https://kivo.wiki/student/573) |
| 艾米（临战） | エイミ（臨戦） | Eimi（Armed） | 504 | [古书馆](https://kivo.wiki/student/576) |
| 柚子（临战） | ユズ（臨戦） | Yuzu（Armed） | 503 | [古书馆](https://kivo.wiki/student/577) |
| 瞬（泳装） |  シュン（水着） | Shun（Swimsuit） | 539 | [古书馆](https://kivo.wiki/student/598) |
| 妃咲（泳装） | キサキ（水着） | Kisaki（Swimsuit） | 541 | [古书馆](https://kivo.wiki/student/599) |
| 雪玲（泳装） | シュエリン（水着） | Shunling（Swimsuit） | 540 | [古书馆](https://kivo.wiki/student/606) |
| 皋月（泳装） | サツキ（水着） | Satsuki（Swimsuit） | 543 | [古书馆](https://kivo.wiki/student/608) |
| 伊吹（泳装） | イブキ（水着） | Ibuki（Swimsuit） | 545 | [古书馆](https://kivo.wiki/student/609) |
| 真琴（泳装） | マコト（水着） | Makoto（Swimsuit） | 542 | [古书馆](https://kivo.wiki/student/610) |
| 千明（泳装） | チアキ（水着） | Chiaki（Swimsuit） | 546 | [古书馆](https://kivo.wiki/student/611) |
| 伊吕波（泳装） | イロハ（水着） | Iroha（Swimsuit） | 544 | [古书馆](https://kivo.wiki/student/612) |
