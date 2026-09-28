"""Tiny ComfyUI-shaped HTTP fixture. No GPU, third-party packages, or generation."""
import argparse
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

parser = argparse.ArgumentParser()
parser.add_argument("--listen", required=True)
parser.add_argument("--port", required=True, type=int)
parser.add_argument("--disable-auto-launch", action="store_true")
parser.add_argument("--windows-standalone-build", action="store_true")
parser.add_argument("--output-directory")
args = parser.parse_args()
assert args.disable_auto_launch

# Exercise stopping an owned tree on Windows, without touching an unrelated process.
helper = subprocess.Popen(
    [sys.executable, "-c", "import time; time.sleep(120)"],
    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
)
print("FIXTURE_HELPER_PID=" + str(helper.pid), flush=True)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200 if self.path == "/system_stats" else 404)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"system": {"os": "fixture"}, "devices": []}).encode())

    def log_message(self, *_):
        pass


server = HTTPServer((args.listen, args.port), Handler)
# Even if OS permissions prevent test cleanup, no fixture server stays alive.
expiry = threading.Timer(30, server.shutdown)
expiry.daemon = True
expiry.start()
try:
    server.serve_forever()
finally:
    expiry.cancel()
    server.server_close()
    helper.terminate()
    helper.wait(timeout=5)
