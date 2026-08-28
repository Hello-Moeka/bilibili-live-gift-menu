#!/usr/bin/env python3
"""本地静态文件服务 + B 站礼物 API 代理（解决浏览器 CORS 限制）"""

from urllib.parse import urlparse
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
GIFT_API = (
    "https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/giftConfig"
    "?platform=pc&source=live"
)
PORT = int(os.environ.get("PORT", "38456"))


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
        try:
            req = urllib.request.Request(
                GIFT_API,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read()
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
