#!/usr/bin/env python3
"""本地/公网静态文件服务 + B 站礼物代理 + token 配置存储。"""

import hashlib
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
from pathlib import Path

try:
    from http.server import ThreadingHTTPServer
except ImportError:  # Python 3.6 及更早版本
    class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True

ROOT = Path(__file__).resolve().parent
DATA_ROOT = Path(os.environ.get("BILIGIFT_DATA_DIR", ROOT / "data"))
DB_PATH = Path(os.environ.get("BILIGIFT_DB", DATA_ROOT / "configs.sqlite3"))
ICON_ROOT = DATA_ROOT / "icons"

GIFT_CONFIG_API = (
    "https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/giftConfig"
    "?platform=pc&source=live"
)
ROOM_GIFT_API = (
    "https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/roomGiftList"
    "?platform=pc&room_id={room_id}"
)
DEFAULT_ROOM_ID = "2233"
GIFT_CACHE_TTL = 5 * 60
MAX_BODY_BYTES = 64 * 1024
MAX_CONFIG_ITEMS = 30
MAX_TEXT_LENGTH = 100
MAX_ROOM_ID_LENGTH = 12
MAX_CREATE_PER_MINUTE = 10
MAX_GIFT_PER_MINUTE = 10
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,32}$")
COLOR_PATTERN = re.compile(r"^#[0-9a-fA-F]{6}$")
ICON_HOST_SUFFIXES = (".hdslb.com", ".bilibili.com", ".bilivideo.com")
ICON_CONTENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
PORT = int(os.environ.get("PORT", "38456"))

_cache_lock = threading.Lock()
_gift_cache = {}
_create_rate_lock = threading.Lock()
_create_rate = {}


@contextmanager
def get_db():
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    ICON_ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_hash TEXT NOT NULL UNIQUE,
                config_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_access_at TEXT
            );
            CREATE TABLE IF NOT EXISTS gift_cache (
                room_id TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                updated_at REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_configs_token_hash ON configs(token_hash);
            """
        )


def fetch_bilibili_json(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 bilibili-live-gift-menu",
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
            for field in (
                "img_basic",
                "img_dynamic",
                "gif",
                "webp",
                "frame_animation",
                "full_sc_effect",
            ):
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
    return {
        "code": 0,
        "message": "0",
        "data": {
            "list": merge_gift_icons(config_list, room_list),
            "room_id": room_id,
            "room_icon_count": len(room_list),
        },
    }


def get_cached_gift_list(room_id):
    now = time.time()
    with _cache_lock:
        cached = _gift_cache.get(room_id)
        if cached and now - cached["updated_at"] < GIFT_CACHE_TTL:
            return cached["payload"]

    with get_db() as conn:
        row = conn.execute(
            "SELECT payload_json, updated_at FROM gift_cache WHERE room_id = ?",
            (room_id,),
        ).fetchone()
    if row and now - row["updated_at"] < GIFT_CACHE_TTL:
        payload = json.loads(row["payload_json"])
        with _cache_lock:
            _gift_cache[room_id] = {"payload": payload, "updated_at": row["updated_at"]}
        return payload

    try:
        payload = build_gift_list(room_id)
    except Exception:
        if row:
            payload = json.loads(row["payload_json"])
            with _cache_lock:
                _gift_cache[room_id] = {"payload": payload, "updated_at": row["updated_at"]}
            return payload
        raise

    updated_at = time.time()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO gift_cache(room_id, payload_json, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(room_id) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at",
            (room_id, json.dumps(payload, ensure_ascii=False), updated_at),
        )
    with _cache_lock:
        _gift_cache[room_id] = {"payload": payload, "updated_at": updated_at}
    return payload


def normalize_style(style, room_id=DEFAULT_ROOM_ID):
    style = style if isinstance(style, dict) else {}
    try:
        font_size = max(12, min(72, int(float(style.get("fontSize", 22)))))
    except (TypeError, ValueError):
        font_size = 22
    color = str(style.get("color") or "#ffffff")
    if not COLOR_PATTERN.fullmatch(color):
        color = "#ffffff"
    layout = style.get("layout") if style.get("layout") in ("vertical", "horizontal") else "vertical"
    room = str(style.get("roomId") or room_id or DEFAULT_ROOM_ID).strip()
    if not room.isdigit() or not room or len(room) > MAX_ROOM_ID_LENGTH:
        room = DEFAULT_ROOM_ID
    return {
        "bg": style.get("bg") is True or style.get("bg") == 1,
        "fontFamily": str(style.get("fontFamily") or "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif")[:200],
        "fontSize": font_size,
        "color": color,
        "layout": layout,
        "roomId": room,
    }


def icon_is_allowed(url):
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return False
    if parsed.scheme != "https" or not parsed.hostname:
        return False
    host = parsed.hostname.lower()
    return any(host == suffix[1:] or host.endswith(suffix) for suffix in ICON_HOST_SUFFIXES)


def cache_icon(url):
    """下载已允许的 B 站图标到服务器，返回本地路径；失败时保留原 URL。"""
    if not url or url.startswith("assets/") or url.startswith("/api/icons/"):
        return url
    if not icon_is_allowed(url):
        return ""
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": ""})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            content_type = (resp.headers.get_content_type() or "").lower()
            suffix = ICON_CONTENT_TYPES.get(content_type, ".img")
            body = resp.read(3 * 1024 * 1024 + 1)
            if len(body) > 3 * 1024 * 1024 or not content_type.startswith("image/"):
                return url
    except (OSError, urllib.error.URLError, ValueError):
        return url
    filename = f"{digest}{suffix}"
    target = ICON_ROOT / filename
    if not target.exists():
        target.write_bytes(body)
    return f"/api/icons/{filename}"


def sanitize_config(payload):
    if not isinstance(payload, dict):
        raise ValueError("配置格式无效")
    raw_style = payload.get("style") if isinstance(payload.get("style"), dict) else {}
    room_id = str(payload.get("roomId") or raw_style.get("roomId") or DEFAULT_ROOM_ID).strip()
    if not room_id.isdigit() or not room_id or len(room_id) > MAX_ROOM_ID_LENGTH:
        raise ValueError("roomId 格式无效")
    raw_items = payload.get("items") or []
    if not isinstance(raw_items, list) or len(raw_items) > MAX_CONFIG_ITEMS:
        raise ValueError(f"菜单项最多 {MAX_CONFIG_ITEMS} 项")
    items = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        try:
            gift_id = int(raw.get("giftId") or 0)
            count = max(1, min(999999, int(float(raw.get("count") or 1))))
        except (TypeError, ValueError):
            continue
        text = str(raw.get("text") or "").strip()[:MAX_TEXT_LENGTH]
        if not gift_id or not text:
            continue
        icon = str(raw.get("icon") or "")
        if icon.startswith("http"):
            icon = cache_icon(icon)
        elif not (icon.startswith("assets/") or icon.startswith("/api/icons/")):
            icon = ""
        items.append({"giftId": gift_id, "count": count, "text": text, "icon": icon})
    style = normalize_style(raw_style, room_id)
    config = {"items": items, "style": style}
    encoded_size = len(json.dumps(config, ensure_ascii=False).encode("utf-8"))
    if encoded_size > 32 * 1024:
        raise ValueError("配置过大")
    if not items:
        raise ValueError("至少需要一个有效菜单项")
    return config


def token_hash(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def create_config(config):
    token = secrets.token_urlsafe(16)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with get_db() as conn:
        conn.execute(
            "INSERT INTO configs(token_hash, config_json, created_at) VALUES (?, ?, ?)",
            (token_hash(token), json.dumps(config, ensure_ascii=False), now),
        )
    return token


def read_config(token):
    with get_db() as conn:
        row = conn.execute(
            "SELECT config_json FROM configs WHERE token_hash = ?",
            (token_hash(token),),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE configs SET last_access_at = ? WHERE token_hash = ?",
                (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), token_hash(token)),
            )
    return json.loads(row["config_json"]) if row else None


def allowed_rate(bucket, client_ip, limit):
    now = time.time()
    with _create_rate_lock:
        key = f"{bucket}:{client_ip}"
        timestamps = [t for t in _create_rate.get(key, []) if now - t < 60]
        if len(timestamps) >= limit:
            _create_rate[key] = timestamps
            return False
        timestamps.append(now)
        _create_rate[key] = timestamps
        return True


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def client_ip(self):
        # Nginx 应覆盖 X-Real-IP；直接访问时回退到 socket 地址。
        return self.headers.get("X-Real-IP", self.client_address[0]).split(",")[0].strip()

    def send_json(self, status, payload, headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", (headers or {}).get("Cache-Control", "no-store"))
        if headers:
            for key, value in headers.items():
                if key.lower() != "cache-control":
                    self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def api_error(self, status, message):
        self.send_json(status, {"code": status, "message": message})

    def read_json_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("请求体大小无效")
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("请求体过大或为空")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/data" or parsed.path.startswith("/data/") or parsed.path == "/.git" or parsed.path.startswith("/.git/"):
            self.api_error(404, "资源不存在")
            return
        if parsed.path == "/healthz":
            try:
                with get_db() as conn:
                    conn.execute("SELECT 1").fetchone()
                self.send_json(200, {"ok": True})
            except Exception:
                self.send_json(503, {"ok": False})
            return
        if parsed.path == "/api/gifts":
            self.proxy_gifts(parsed.query)
            return
        match = re.fullmatch(r"/api/configs/([A-Za-z0-9_-]{20,32})", parsed.path)
        if match:
            self.get_config(match.group(1))
            return
        match = re.fullmatch(r"/api/icons/([A-Za-z0-9]+\.(?:png|jpg|gif|webp|img))", parsed.path)
        if match:
            self.serve_cached_icon(match.group(1))
            return
        if parsed.path in ("", "/"):
            self.path = "/settings.html"
        super().do_GET()

    def do_POST(self):
        if urllib.parse.urlparse(self.path).path != "/api/configs":
            self.api_error(404, "接口不存在")
            return
        if not allowed_rate("create", self.client_ip(), MAX_CREATE_PER_MINUTE):
            self.api_error(429, "保存请求过于频繁，请稍后再试")
            return
        try:
            config = sanitize_config(self.read_json_body())
            token = create_config(config)
            self.send_json(201, {"code": 0, "token": token, "config": config})
        except (ValueError, json.JSONDecodeError) as exc:
            self.api_error(400, str(exc))
        except Exception:
            self.api_error(500, "配置保存失败，请稍后重试")

    def proxy_gifts(self, query_string):
        query = urllib.parse.parse_qs(query_string)
        room_id = (query.get("room_id") or [DEFAULT_ROOM_ID])[0].strip() or DEFAULT_ROOM_ID
        if not room_id.isdigit() or len(room_id) > MAX_ROOM_ID_LENGTH:
            self.api_error(400, "room_id 格式无效")
            return
        if not allowed_rate("gifts", self.client_ip(), MAX_GIFT_PER_MINUTE):
            self.api_error(429, "礼物列表请求过于频繁，请稍后再试")
            return
        try:
            payload = get_cached_gift_list(room_id)
            self.send_json(200, payload, {"Cache-Control": f"private, max-age={GIFT_CACHE_TTL}"})
        except urllib.error.HTTPError:
            self.api_error(502, "B 站礼物接口暂时不可用")
        except Exception:
            self.api_error(502, "礼物列表暂时不可用，请稍后重试")

    def get_config(self, token):
        config = read_config(token)
        if not config:
            self.api_error(404, "配置不存在")
            return
        self.send_json(200, {"code": 0, "config": config}, {"Cache-Control": "no-cache, must-revalidate"})

    def serve_cached_icon(self, filename):
        target = (ICON_ROOT / filename).resolve()
        if ICON_ROOT.resolve() not in target.parents or not target.is_file():
            self.api_error(404, "图标不存在")
            return
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main():
    os.chdir(ROOT)
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"礼物菜单服务已启动: http://127.0.0.1:{PORT}")
    print(f"  配置页: http://127.0.0.1:{PORT}/")
    print(f"  展示页: http://127.0.0.1:{PORT}/index.html")
    print(f"  数据目录: {DATA_ROOT}")
    print("按 Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        server.server_close()


if __name__ == "__main__":
    main()
