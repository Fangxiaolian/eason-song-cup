# 陈奕迅 392 版本私人冠军杯

静态网页应用，无需安装依赖，直接打开 `index.html` 即可运行。比赛进度只保存在当前浏览器，不会上传。

## 赛制

- 392 个独立 Spotify Track ID，同名录音室、现场与特别版本分别参赛；18 个重制版本以及用户审查确认的 60 个重复版本已排除。
- 国粤对应曲先在各自语种内部选出版本代表；《六月飞霜》单独进行录音室与现场版审判。
- 其余 373 个版本参加 152 组海选，其中 69 组三选一、83 组二选一。
- 七组国粤代表随后正面对决；《Lonely Christmas》因仅有重制条目而退出，其对应的《圣诞结》回到普通海选。国粤胜者、海选胜者及《六月飞霜》版本冠军组成精确的 160 强。
- 160 强进入 40 个 GSL 小组；40 个小组第一直通，40 个小组第二参加 Page 最后机会赛，产生 24 个席位。
- 64 强采用有限双败，16 强起改为单败，最终四强以 Page 赛制决出唯一冠军。

完整流程需要 499 次选择。每次选择支持确认、最多三步撤销和自动保存；冠军页会展示统计、最纠结的一票及完整投票时间线，并可导出 JSON 或总结图片。

## 曲库与媒体

- 曲库来自用户 Spotify 点赞记录，并参考 Apple Music、Spotify 与哔哩哔哩的热门结果补充核对。
- 104 张专辑封面已保存到本地；优先使用歌曲所属原始专辑或指定现场专辑，不用精选集替代已有原版专辑。
- Apple Music 精确试听优先，其中包含 FEAR and DREAMS 全部 31 首及《陳奕迅2010 Duo演唱會》的《富士山下》。没有固定试听的版本在曲库或对局页均可直接点“试听”：网页会先并行检索 Apple Music 三个地区，严格核对歌手、歌名、录音室/现场身份与专辑，再自动播放；成功结果会保存在当前浏览器。未命中的版本才依次尝试 Meting（网易云、QQ 音乐、酷狗）、可选的 NeteaseCloudMusicApi / QQMusicApi 自建服务和 Deezer，任何情况都不会弹出嵌入播放器。
- Meting 默认使用官方公共接口 `https://api.i-meto.com/meting/api`。部署自有 Meting-API 后，可在 `app.js` 载入前设置 `window.METING_API_ENDPOINT` 切换到自己的接口。
- 原版 NeteaseCloudMusicApi 已归档，建议自建仍在维护的 `NeteaseCloudMusicApiEnhanced/api-enhanced`；QQMusicApi 的公开演示域名目前无法解析，因此两者都不写死公共地址。自建后可在 `app.js` 载入前分别设置 `window.NETEASE_API_ENDPOINT` 和 `window.QQMUSIC_API_ENDPOINT`，网页会在 Meting 无结果时自动尝试。
- 平台热度只用于确定收录范围，网页不展示歌曲名次或虚构综合分数。

## 同名版本审查

打开 `version-review.html` 可查看原始 452 首非重制曲库中的 98 组同名歌曲及其 231 个版本。审查表会分别显示专辑、录音室/现场身份、Spotify Track ID 和现有试听；本次导出的 60 个排除项已经写入 `review-exclusions.js`，原始 Spotify 曲库仍保留，方便以后恢复或重新筛选。

## 校验

运行以下命令可检查曲库、封面、分组人数、完整 499 票流程以及确认按钮状态：

```powershell
node .\tools\validate-app.mjs
```

封面数据需要重新生成时，运行：

```powershell
node .\tools\build-spotify-media.mjs
```

重新检索 Apple Music 多地区目录并生成逐 Track ID 试听映射：

```powershell
node .\tools\build-track-previews.mjs
```
