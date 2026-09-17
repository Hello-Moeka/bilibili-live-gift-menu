# B 站直播间礼物菜单

哔哩哔哩直播间场景搭建用的礼物菜单工具，基于 OBS 浏览器源使用。支持选择礼物、设置数量与菜单内容。新版配置保存到 SQLite 后通过固定长度 token 访问，旧版 URL 配置仍然兼容。

## 功能特点

- 礼物列表每次打开配置页时从 B 站 API 自动拉取
- 左侧礼物图标 + 数量 + 菜单文字，默认透明背景
- 可自定义字体、字号、颜色
- 支持纵向列表和横向单行滚动
- 配置保存到服务器后复制 token 链接即可添加到 OBS 浏览器源

## 快速开始

```bash
python server.py
```

浏览器打开 **http://127.0.0.1:38456**（自动进入配置页）进行配置：

1. 添加菜单项：搜索选择礼物 → 设置数量 → 填写菜单内容
2. 点击「保存并复制链接」
3. 在 OBS 中添加「浏览器源」，粘贴链接，建议尺寸约 **400×350**，背景透明

直播姬用户：请使用「浏览器源」添加链接（非「网页」窗口）。若更新后仍空白，删除旧浏览器源重新添加并刷新。

未保存的编辑内容会保存在浏览器本地草稿；点击保存后配置写入服务器，并生成新的 `?t=` token 链接。导入已有 token 后，编辑内容会作为新草稿保存，重新保存会生成新的 token，原链接不会被修改。

展示页地址格式：`index.html?t=<token>`；旧版 `index.html?c=<Base64URL 编码的配置>` 继续兼容。

## 文件说明

| 文件 | 说明 |
|------|------|
| `index.html` | OBS 展示页，仅读取 URL 参数渲染 |
| `settings.html` | 设置编辑页，每次打开从 B 站 API 拉取礼物列表 |
| `server.py` | 静态服务、礼物 API 代理、SQLite 配置存储和服务器图标缓存 |
| `js/config.js` | URL 参数编解码 |
| `js/gifts.js` | 礼物列表获取 |
| `css/display.css` | 展示样式（深蓝底 + 粉色左边框） |

## URL 参数格式

旧版参数名 `c`，值为 Base64URL 编码的 JSON，继续兼容：

```json
{
  "items": [
    { "giftId": 31036, "count": 5, "text": "上车一小时", "icon": "https://..." }
  ],
  "style": {
    "bg": false,
    "fontFamily": "PingFang SC, Hiragino Sans GB, sans-serif",
    "fontSize": 22,
    "color": "#ffffff"
  }
}
```

礼物图标 URL 会写入配置，OBS 展示页无需再请求 API。

新版参数名为 `t`，值为服务器生成的固定长度 token。展示页通过 `/api/configs/<token>` 读取服务器保存的配置。保存配置时，选中的礼物图标会尽量下载到服务器的 `data/icons/`，展示页优先使用本地图标。

## 部署说明

- **本地使用**：运行 `python server.py`，设置页和展示页均通过 `http://127.0.0.1:38456` 访问
- **公网部署**：建议让页面和 `/api` 使用同一个 HTTPS 域名，由 Nginx 反代到 `server.py`；`data/` 目录需要单独备份，不能作为静态目录暴露
- OBS 浏览器源建议使用 **http://** 或 **https://** 地址，避免 `file://` 协议兼容问题

## 礼物 API

本地代理 `/api/gifts` 会合并两个 B 站接口（无需登录），结果按直播间号缓存 5 分钟：

- **礼物列表**：`giftConfig`（全量礼物名称、价格）
- **动态图标**：`roomGiftList`（指定直播间礼物面板中的当前图标）

```
GET /api/gifts?room_id=2233
```

配置和图标接口：

```text
POST /api/configs
GET  /api/configs/<token>
GET  /api/icons/<filename>
```

配置数据永久保存在 `data/configs.sqlite3`，图标缓存在 `data/icons/`，`data/` 已加入 `.gitignore`。

设置页可填写「直播间号」以拉取对应房间的礼物图标；大航海（舰长/提督/总督）仍使用本地图标。

## 许可证

本项目采用 [GNU Affero General Public License v3.0](LICENSE)（AGPL-3.0）授权。
