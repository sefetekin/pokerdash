"""Vercel entry point: runs the dashboard's request handler as a serverless function."""
import sys
import time
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import importlib  # noqa: E402

_dash = importlib.import_module("app")  # not bound as "app": Vercel would treat that name as the entry point

if _dash.STORE is None:
    _dash.STORE = _dash.Store()

_last_pull = [0.0]


class handler(_dash.Handler):
    def _restore_path(self):
        # vercel.json rewrites /<path> to /api/index?__p=/<path>; put the original path back.
        u = urlparse(self.path)
        q = parse_qsl(u.query, keep_blank_values=True)
        orig = next((v for k, v in q if k == "__p"), None)
        if orig is not None:
            rest = urlencode([(k, v) for k, v in q if k != "__p"])
            self.path = (orig or "/") + ("?" + rest if rest else "")

    def do_POST(self):
        self._restore_path()
        return super().do_POST()

    def do_GET(self):
        self._restore_path()
        # No background thread on serverless: refresh public standings on demand.
        if self.path.startswith("/api/state") and time.time() - _last_pull[0] > 60:
            _last_pull[0] = time.time()
            try:
                _dash.STORE.pull_standings()
                _dash.STORE.live_err = None
            except Exception as e:
                _dash.STORE.live_err = str(e)
        return super().do_GET()
