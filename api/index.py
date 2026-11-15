"""Vercel entry point: runs the dashboard's request handler as a serverless function."""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app  # noqa: E402

if app.STORE is None:
    app.STORE = app.Store()

_last_pull = [0.0]


class handler(app.Handler):
    def do_GET(self):
        # No background thread on serverless: refresh public standings on demand.
        if self.path.startswith("/api/state") and time.time() - _last_pull[0] > 60:
            _last_pull[0] = time.time()
            try:
                app.STORE.pull_standings()
                app.STORE.live_err = None
            except Exception as e:
                app.STORE.live_err = str(e)
        return super().do_GET()
