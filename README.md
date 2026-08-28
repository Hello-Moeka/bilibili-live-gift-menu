# B 站直播间礼物菜单

用于 OBS 浏览器源的礼物菜单玩法工具。左侧显示礼物图标，中间为数量（`x5`），右侧为触发的菜单内容。所有配置编码在 URL 参数中，无需额外存储。

## 快速开始

```bash
python server.py
```

浏览器打开 **http://127.0.0.1:8765**（自动进入配置页）进行配置：

1. 添加菜单项：搜索选择礼物 → 设置数量 → 填写菜单内容
2. 点击「复制链接」
3. 在 OBS 中添加「浏览器源」，粘贴链接，建议尺寸约 **400×300**，背景透明

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
    "subtitleSize": 14,
    "color": "#ffffff",
    "subtitleColor": "#b8b8b8"
  }
}
```

礼物图标 URL 会写入配置，OBS 展示页无需再请求 API。

## 部署说明

- **本地使用**：运行 `python server.py`，设置页和展示页均通过 `http://127.0.0.1:8765` 访问
- **静态托管**：可将 `index.html` 及静态资源部署到任意 CDN/Pages；设置页需配套 API 代理（或自行修改 `js/settings.js` 中的代理地址）
- OBS 浏览器源建议使用 **http://** 或 **https://** 地址，避免 `file://` 协议兼容问题

## 礼物 API

使用 B 站直播礼物面板接口（无需登录）：

```
GET https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/giftConfig?platform=pc&source=live
```

## 许可证

本项目采用 [GNU Affero General Public License v3.0](LICENSE)（AGPL-3.0）授权。
