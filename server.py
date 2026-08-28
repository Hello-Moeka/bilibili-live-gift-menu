#!/usr/bin/env python3
"""本地静态文件服务 + B 站礼物 API 代理（解决浏览器 CORS 限制）"""

import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
GIFT_CONFIG_API = (
    "https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/giftConfig"
    "?platform=pc&source=live"
)
ROOM_GIFT_API = (
    "https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/roomGiftList"
    "?platform=pc&room_id={room_id}"
)
DEFAULT_ROOM_ID = "2233"
ICON_OVERRIDE_FIELDS = (
    "img_basic",
    "img_dynamic",
    "gif",
    "webp",
    "frame_animation",
    "full_sc_effect",
)
PORT = int(os.environ.get("PORT", "38456"))


def fetch_bilibili_json(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def merge_gift_icons(config_list, room_list):
    """用房间礼物面板的图标覆盖全局礼物配置中的同 ID 礼物。"""
    icon_map = {gift["id"]: gift for gift in room_list if gift.get("id")}
    merged = []
    for gift in config_list:
        merged_gift = dict(gift)
        room_gift = icon_map.get(gift.get("id"))
        if room_gift:
            for field in ICON_OVERRIDE_FIELDS:
                value = room_gift.get(field)
                if value:
                    merged_gift[field] = value
        merged.append(merged_gift)
    return merged


def build_gift_list(room_id):
    config_data = fetch_bilibili_json(GIFT_CONFIG_API)
    if config_data.get("code") != 0:
        raise ValueError(config_data.get("message") or "giftConfig 返回异常")

    config_list = config_data.get("data", {}).get("list") or []
    room_data = fetch_bilibili_json(ROOM_GIFT_API.format(room_id=room_id))
    if room_data.get("code") != 0:
        raise ValueError(room_data.get("message") or "roomGiftList 返回异常")

    room_list = (
        room_data.get("data", {})
        .get("gift_config", {})
        .get("base_config", {})
        .get("list")
        or []
    )
    merged_list = merge_gift_icons(config_list, room_list)
    return {
        "code": 0,
        "message": "0",
        "data": {
            "list": merged_list,
            "room_id": room_id,
            "room_icon_count": len(room_list),
        },
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/gifts"):
            self.proxy_gifts()
            return
        if urlparse(self.path).path in ("", "/"):
            self.path = "/settings.html"
        return super().do_GET()

    def proxy_gifts(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        room_id = (query.get("room_id") or [DEFAULT_ROOM_ID])[0].strip() or DEFAULT_ROOM_ID
        if not room_id.isdigit():
            self.send_error(400, "room_id 须为数字")
            return

        try:
            payload = build_gift_list(room_id)
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_error(e.code, f"上游 API 错误: {e.reason}")
        except Exception as e:
            self.send_error(502, f"代理请求失败: {e}")

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main():
    os.chdir(ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"礼物菜单服务已启动: http://127.0.0.1:{PORT}")
    print(f"  配置页: http://127.0.0.1:{PORT}/")
    print(f"  展示页: http://127.0.0.1:{PORT}/index.html")
    print("按 Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.server_close()


if __name__ == "__main__":
    main()
