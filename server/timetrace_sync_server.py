#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
时光待办 (TimeTrace Todo) · 轻量级私有云同步与多端 Web 托管服务
零第三方依赖（仅使用 Python 3 标准库），可直接运行在：
  1. 你的 Mac / 电脑上（局域网 iPhone / iPad / 安卓立即可连）
  2. 任何 68~99 元/年的轻量云服务器 / NAS 上（全网 24 小时多端实时同步）

启动方式：
  python3 server/timetrace_sync_server.py --port 8765 --token my-secret-key
"""

import argparse
import json
import os
import tempfile
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
DATA_FILE = DATA_DIR / "timetrace_cloud_store.json"


def default_store():
    return {
        "schemaVersion": 1,
        "updatedAt": int(time.time() * 1000),
        "tasks": [],
        "categories": []
    }


def load_store():
    if not DATA_FILE.exists():
        return default_store()
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                return default_store()
            data.setdefault("tasks", [])
            data.setdefault("categories", [])
            data.setdefault("schemaVersion", 1)
            return data
    except Exception:
        return default_store()


def save_store(data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=str(DATA_DIR), prefix="sync_", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, DATA_FILE)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def merge_items_by_id(server_list, client_list):
    merged = {}
    for item in server_list or []:
        if isinstance(item, dict) and item.get("id"):
            merged[item["id"]] = item
    for item in client_list or []:
        if isinstance(item, dict) and item.get("id"):
            item_id = item["id"]
            existing = merged.get(item_id)
            if not existing or int(item.get("updatedAt", 0)) >= int(existing.get("updatedAt", 0)):
                merged[item_id] = item
    return list(merged.values())


class TimeTraceHandler(SimpleHTTPRequestHandler):
    sync_token = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Sync-Token")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def _check_auth(self):
        if not self.sync_token:
            return True
        auth = self.headers.get("Authorization", "")
        x_token = self.headers.get("X-Sync-Token", "")
        bearer = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        if bearer == self.sync_token or x_token == self.sync_token:
            return True
        self._send_json(401, {"ok": False, "error": "同步密钥不匹配 (Unauthorized)"})
        return False

    def _send_json(self, status_code, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._send_json(200, {"ok": True, "service": "TimeTrace Sync Server", "ts": int(time.time() * 1000)})
            return
        if parsed.path == "/api/sync":
            if not self._check_auth():
                return
            store = load_store()
            self._send_json(200, {"ok": True, "data": store})
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/sync":
            self._send_json(404, {"ok": False, "error": "Not Found"})
            return
        if not self._check_auth():
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
            incoming = json.loads(body)
        except Exception as e:
            self._send_json(400, {"ok": False, "error": f"Invalid JSON: {e}"})
            return

        current = load_store()
        merged_tasks = merge_items_by_id(current.get("tasks", []), incoming.get("tasks", []))
        merged_categories = merge_items_by_id(current.get("categories", []), incoming.get("categories", []))
        now_ms = int(time.time() * 1000)
        updated_store = {
            "schemaVersion": 1,
            "updatedAt": now_ms,
            "tasks": merged_tasks,
            "categories": merged_categories
        }
        save_store(updated_store)
        self._send_json(200, {"ok": True, "data": updated_store})


def main():
    parser = argparse.ArgumentParser(description="时光待办私有云同步服务")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址 (默认 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8765, help="监听端口 (默认 8765)")
    parser.add_argument("--token", default="", help="可选：访问同步接口所需的密钥")
    args = parser.parse_args()

    TimeTraceHandler.sync_token = args.token.strip()
    server = ThreadingHTTPServer((args.host, args.port), TimeTraceHandler)
    print(f"✨ 时光待办同步服务已启动: http://{args.host}:{args.port}")
    print(f"📂 数据持久化文件: {DATA_FILE}")
    if TimeTraceHandler.sync_token:
        print("🔒 已启用同步密钥保护")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止。")


if __name__ == "__main__":
    main()
