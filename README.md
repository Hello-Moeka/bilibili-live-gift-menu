# B 站直播间礼物菜单

哔哩哔哩直播间场景搭建用的礼物菜单工具，基于 OBS 浏览器源使用。支持选择礼物、设置数量与菜单内容，配置通过 URL 参数传递，无需数据库。

## 功能特点

- 礼物列表每次打开配置页时从 B 站 API 自动拉取
- 左侧礼物图标 + 数量 + 菜单文字，默认透明背景
- 可自定义字体、字号、颜色
- 复制带参数的链接即可添加到 OBS 浏览器源

## 快速开始

```bash
python server.py
```

浏览器打开 **http://127.0.0.1:38456**（自动进入配置页）进行配置：

1. 添加菜单项：搜索选择礼物 → 设置数量 → 填写菜单内容
2. 点击「复制链接」
3. 在 OBS 中添加「浏览器源」，粘贴链接，建议尺寸约 **400×300**，背景透明

设置会自动保存在浏览器本地，下次打开配置页可继续编辑；地址栏 `?c=` 参数也会同步更新，刷新页面不会丢失。

展示页地址格式：`index.html?c=<Base64URL 编码的配置>`

## 文件说明

| 文件 | 说明 |
|------|------|
| `index.html` | OBS 展示页，仅读取 URL 参数渲染 |
| `settings.html` | 设置编辑页，每次打开从 B 站 API 拉取礼物列表 |
| `server.py` | 本地服务 + 礼物 API 代理（解决 CORS） |
| `js/config.js` | URL 参数编解码 |
| `js/gifts.js` | 礼物列表获取 |
| `css/display.css` | 展示样式（深蓝底 + 粉色左边框） |

## URL 参数格式

参数名 `c`，值为 Base64URL 编码的 JSON：

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

## 部署说明

- **本地使用**：运行 `python server.py`，设置页和展示页均通过 `http://127.0.0.1:38456` 访问
- **静态托管**：可将 `index.html` 及静态资源部署到任意 CDN/Pages；设置页需配套 API 代理（或自行修改 `js/settings.js` 中的代理地址）
- OBS 浏览器源建议使用 **http://** 或 **https://** 地址，避免 `file://` 协议兼容问题

## 礼物 API

本地代理 `/api/gifts` 会合并两个 B 站接口（无需登录）：

- **礼物列表**：`giftConfig`（全量礼物名称、价格）
- **动态图标**：`roomGiftList`（指定直播间礼物面板中的当前图标）

```
GET /api/gifts?room_id=2233
```

设置页可填写「直播间号」以拉取对应房间的礼物图标；大航海（舰长/提督/总督）仍使用本地图标。

## 许可证

本项目采用 [GNU Affero General Public License v3.0](LICENSE)（AGPL-3.0）授权。
