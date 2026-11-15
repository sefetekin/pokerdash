#!/usr/bin/env python3
"""Durahim 1453 pokerbot dashboard: a local website for the Imperial AI Hack pokerbots track.

Run:   python3 app.py            (then open http://localhost:8000)
       python3 app.py --port 8080 --no-browser

Feed it data in any of these ways:
  * drag bot.py, a hands .json (from fetch_hands.py) or copied standings text onto the page
  * drop the same files into the inbox/ folder next to this script (picked up within seconds)
  * set "fetch_command" + "fetch_dir" in config.json and press Sync (or set auto_sync_minutes)

Standard library only. Everything is stored in data/ next to this file.
"""
import argparse
import ast
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
import urllib.error
import urllib.request

import analytics as A

BASE = Path(__file__).resolve().parent
STATIC = BASE / "static"
# On Vercel the code folder is read-only: keep state in /tmp (ephemeral, per instance).
_RW = Path("/tmp/pokerdash") if os.environ.get("VERCEL") else BASE
DATA = _RW / "data"
INBOX = _RW / "inbox"
CONFIG = _RW / "config.json"

DEFAULT_CONFIG = {
    "port": 8000,
    "team": "",
    "site": "https://imperialaihack.com",
    "live_api": "https://poker.imperialaihack.com/pokerbots/api/public",
    "data_token": "",
    "standings_poll_seconds": 60,
    "rounds_poll_minutes": 2,
    "sunday_tables": 4,
    "fetch_command": "",
    "fetch_dir": "",
    "auto_sync_minutes": 0,
    "schedule": [
        {"name": "Practice Rounds", "start": "2026-11-14T12:35", "end": "2026-11-14T13:55"},
        {"name": "Counted Rounds", "start": "2026-11-14T15:00", "end": "2026-11-14T19:25"},
        {"name": "Buckets", "start": "2026-11-14T20:30", "end": "2026-11-14T20:30"},
        {"name": "Bucket Tables", "start": "2026-11-15T09:00", "end": "2026-11-15T11:55"},
        {"name": "Final Table", "start": "2026-11-15T12:05", "end": "2026-11-15T12:35"},
    ],
    "upload_windows": [["2026-11-14T00:00", "2026-11-14T19:30"], ["2026-11-15T00:00", "2026-11-15T12:00"]],
}

LOCK = threading.RLock()


def now_iso():
    return datetime.now().isoformat(timespec="seconds")


def read_json(p, default):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(p, obj):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)


def safe_id(ref):
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", ref).strip("_") or "round"


# --------------------------------------------------------------------------- bot checks
_FALLBACK_STDLIB = set("""abc argparse array ast asyncio base64 binascii bisect builtins bz2 calendar cmath codecs
collections colorsys contextlib copy copyreg csv dataclasses datetime decimal difflib enum errno fnmatch fractions
functools gc getopt glob gzip hashlib heapq hmac html http io itertools json keyword linecache locale logging lzma
marshal math mimetypes numbers operator os pathlib pickle platform pprint queue random re reprlib sched secrets
select shelve shlex shutil signal socket statistics string struct subprocess sys tempfile textwrap threading time
timeit token tokenize traceback types typing unicodedata unittest urllib uuid warnings weakref zlib""".split())
_STDLIB = set(getattr(sys, "stdlib_module_names", ())) or _FALLBACK_STDLIB
_RISKY = {"socket", "subprocess", "urllib", "http", "requests", "multiprocessing", "ctypes", "shutil", "tempfile"}


def check_bot(src):
    out = {"size": len(src.encode("utf-8")), "lines": src.count("\n") + 1, "syntax": True, "error": None,
           "agent": False, "act": False, "hooks": [], "imports": [], "non_stdlib": [], "risky": [],
           "file_io": False, "title": ""}
    try:
        tree = ast.parse(src)
    except SyntaxError as e:
        out["syntax"] = False
        out["error"] = "line %s: %s" % (e.lineno, e.msg)
        return out
    doc = ast.get_docstring(tree) or ""
    out["title"] = doc.strip().splitlines()[0][:140] if doc.strip() else ""
    mods = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                mods.add(a.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            mods.add(node.module.split(".")[0])
        elif isinstance(node, ast.ClassDef) and node.name == "Agent":
            out["agent"] = True
            names = {b.name for b in node.body if isinstance(b, ast.FunctionDef)}
            out["act"] = "act" in names
            out["hooks"] = sorted(n for n in names if n in ("on_table_start", "on_hand_end"))
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "open":
            out["file_io"] = True
    out["imports"] = sorted(mods)
    out["non_stdlib"] = sorted(m for m in mods if m not in _STDLIB)
    out["risky"] = sorted(m for m in mods if m in _RISKY)
    return out


# --------------------------------------------------------------------------- store
class Store:
    def __init__(self):
        DATA.mkdir(parents=True, exist_ok=True)
        (DATA / "bots").mkdir(exist_ok=True)
        (DATA / "rounds").mkdir(exist_ok=True)
        (DATA / "analysis").mkdir(exist_ok=True)
        INBOX.mkdir(parents=True, exist_ok=True)
        self.cfg = self._load_config()
        self.bots = read_json(DATA / "bots.json", [])
        self.rounds = read_json(DATA / "rounds.json", {})
        self.standings = read_json(DATA / "standings.json", [])
        self.seen = read_json(DATA / "seen.json", {})
        self.last_sync = read_json(DATA / "last_sync.json", None)
        self.live = read_json(DATA / "live.json", None)
        self.live_err = None
        self.rounds_err = None
        self.cache = {}
        self.rev = int(time.time())
        for rid in list(self.rounds):
            self._analysis(rid)

    # ---- config
    def _load_config(self):
        cfg = dict(DEFAULT_CONFIG)
        user = read_json(CONFIG, None)
        if user is None:
            write_json(CONFIG, DEFAULT_CONFIG)
        else:
            cfg.update(user)
        return cfg

    def update_config(self, patch):
        allowed = {"team", "sunday_tables", "fetch_command", "fetch_dir", "auto_sync_minutes", "data_token",
                   "rounds_poll_minutes", "standings_poll_seconds"}
        with LOCK:
            cur = read_json(CONFIG, dict(DEFAULT_CONFIG))
            for k, v in patch.items():
                if k in allowed:
                    cur[k] = v
            write_json(CONFIG, cur)
            self.cfg = self._load_config()
            self.touch()

    def touch(self):
        self.rev += 1

    # ---- bots
    def latest_version(self):
        return self.bots[-1]["version"] if self.bots else None

    def add_bot(self, src, filename="bot.py", source="upload"):
        sha = hashlib.sha256(src.encode("utf-8")).hexdigest()
        with LOCK:
            for b in self.bots:
                if b["sha"] == sha:
                    return {"ok": True, "duplicate": True, "version": b["version"],
                            "message": "Same file as v%d, nothing new saved." % b["version"]}
            v = (self.latest_version() or 0) + 1
            (DATA / "bots" / ("v%d.py" % v)).write_text(src, encoding="utf-8")
            rec = {"version": v, "filename": filename, "uploaded_at": now_iso(), "sha": sha,
                   "source": source, "checks": check_bot(src)}
            self.bots.append(rec)
            write_json(DATA / "bots.json", self.bots)
            self.touch()
            return {"ok": True, "version": v, "checks": rec["checks"], "message": "Saved as v%d." % v}

    # ---- rounds
    def add_round(self, d, version=None, source="upload", name=None):
        if not isinstance(d, dict) or "hands" not in d or "players" not in d or "seat" not in d:
            raise ValueError("Not a fetch_hands.py file (needs 'hands', 'players' and 'seat').")
        ref = d.get("ref") or (name or "round")
        rid = safe_id(ref)
        with LOCK:
            prev = self.rounds.get(rid)
            if version is None:
                version = prev["version"] if prev else self.latest_version()
            write_json(DATA / "rounds" / (rid + ".json"), d)
            self.rounds[rid] = {"ref": ref, "version": version, "ingested_at": now_iso(), "source": source}
            write_json(DATA / "rounds.json", self.rounds)
            self.cache.pop(rid, None)
            a = self._analysis(rid, force=True)
            if a and a.get("team") and not self.cfg.get("team"):
                self.cfg["team"] = a["team"]
            self.touch()
            return {"ok": True, "id": rid, "ref": ref, "version": version, "replaced": bool(prev),
                    "message": "%s %s (%d hands, %+d chips)." % ("Updated" if prev else "Added", ref,
                                                                 a["hands"], a["result"])}

    def set_round_version(self, rid, version):
        with LOCK:
            if rid not in self.rounds:
                raise ValueError("Unknown round")
            self.rounds[rid]["version"] = version
            write_json(DATA / "rounds.json", self.rounds)
            self.cache.pop(rid, None)
            self._analysis(rid, force=True)
            self.touch()

    def _analysis(self, rid, force=False):
        if not force and rid in self.cache:
            return self.cache[rid]
        meta = self.rounds.get(rid)
        if not meta:
            return None
        cpath = DATA / "analysis" / (rid + ".json")
        a = None if force else read_json(cpath, None)
        if not a or a.get("analyzer") != A.ANALYZER_VERSION or a.get("version") != meta["version"]:
            raw = read_json(DATA / "rounds" / (rid + ".json"), None)
            if raw is None:
                return None
            a = A.analyze_round(raw, version=meta["version"], rid=rid)
            write_json(cpath, a)
        a["id"] = rid
        self.cache[rid] = a
        return a

    def ordered_rounds(self, version=None):
        out = []
        for rid in sorted(self.rounds, key=lambda r: A.ref_key(self.rounds[r]["ref"])):
            a = self._analysis(rid)
            if a and (version is None or a["version"] == version):
                out.append(a)
        return out

    # ---- standings
    def add_standings(self, text, source="paste"):
        parsed = A.parse_standings(text)
        if len(parsed["rows"]) < 2:
            raise ValueError("Could not find standings rows. Copy the whole table from the Standings section.")
        stage = {"Practice": "practice", "Counted": "saturday"}.get(parsed["stage"], parsed["stage"].lower())
        return self.add_snapshot(parsed["rows"], parsed["label"], stage, source)

    def add_snapshot(self, rows, label, stage, source):
        with LOCK:
            snap = {"at": now_iso(), "label": label, "stage": stage, "rows": rows, "source": source}
            same = [x for x in self.standings if x.get("stage") == stage]
            if same and same[-1]["rows"] == rows:
                same[-1]["at"] = snap["at"]
                msg = "Standings unchanged (%s)." % label
                changed = False
            else:
                self.standings.append(snap)
                msg = "Saved %s standings (%d teams)." % (label, len(rows))
                changed = True
            self.standings = self.standings[-400:]
            write_json(DATA / "standings.json", self.standings)
            if changed:
                self.touch()
            return {"ok": True, "message": msg, "teams": len(rows), "changed": changed}

    # ---- live tournament API
    STAGE_NAMES = {"practice": "Practice", "saturday": "Counted", "sunday": "Bucket tables",
                   "buckets": "Buckets", "final": "Final"}

    def _get(self, url, token=None):
        headers = {"User-Agent": "pokerdash/1.1", "Accept": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read()).get("error")
            except Exception:
                msg = None
            raise RuntimeError("%s %s" % (e.code, msg or e.reason))

    def pull_standings(self):
        url = (self.cfg.get("live_api") or "").strip()
        if not url:
            return "Live standings off."
        d = self._get(url)
        with LOCK:
            self.live = d
            write_json(DATA / "live.json", d)
        phase = d.get("phase")
        keys = [phase] + [k for k in ("final", "sunday", "buckets", "saturday", "practice") if k != phase]
        blk = key = None
        for k in keys:
            b = d.get(k) if k else None
            if isinstance(b, dict) and isinstance(b.get("standings"), list) and b["standings"] \
                    and isinstance(b["standings"][0], dict) and "name" in b["standings"][0]:
                blk, key = b, k
                break
        if not blk:
            return "No standings published yet."
        rows = []
        for i, r in enumerate(blk["standings"]):
            rows.append({"rank": i + 1, "team": r.get("name"), "bb100": round(float(r.get("bb100") or 0), 2),
                         "rounds": r.get("rounds", 0), "hands": r.get("hands", 0), "version": r.get("version", 0),
                         "chips": r.get("chips"), "timeouts": r.get("timeouts"), "errors": r.get("errors"),
                         "bank_out": r.get("bank_out"), "ranked": r.get("ranked", True)})
        label = "%s R%s" % (self.STAGE_NAMES.get(key, key.capitalize()), blk.get("played", "?"))
        self.live_err = None
        return self.add_snapshot(rows, label, key, "live")["message"]

    def pull_rounds(self):
        tok = (self.cfg.get("data_token") or "").strip()
        if not tok:
            return []
        site = (self.cfg.get("site") or "https://imperialaihack.com").rstrip("/")
        res = self._get(site + "/api/poker/results", tok)
        if res.get("team") and not self.cfg.get("team"):
            self.cfg["team"] = res["team"]
        msgs = []
        rounds = res.get("rounds", [])
        for rd in rounds:
            ref = rd.get("ref")
            if not ref:
                continue
            rid = safe_id(ref)
            if rid in self.rounds and self.rounds[rid].get("source") == "api":
                continue
            data = self._get(site + "/api/poker/hands?ref=" + quote(ref), tok)
            data["round"] = rd
            data.setdefault("ref", ref)
            v = rd.get("version") if isinstance(rd.get("version"), int) else None
            msgs.append(self.add_round(data, version=v, source="api")["message"])
        self.rounds_err = None
        return msgs or ["Rounds up to date (%d played)." % len(rounds)]

    # ---- automatic intake
    def scan_inbox(self):
        msgs = []
        for p in sorted(INBOX.iterdir()):
            if p.is_dir() or p.name.startswith("."):
                continue
            try:
                msgs.append(self.ingest_path(p, source="inbox"))
            except Exception as e:
                msgs.append("%s: %s" % (p.name, e))
            done = INBOX / "processed"
            done.mkdir(exist_ok=True)
            try:
                shutil.move(str(p), str(done / ("%s_%s" % (int(time.time()), p.name))))
            except Exception:
                pass
        return msgs

    def ingest_path(self, p, source="file"):
        name = p.name
        if name.endswith(".py"):
            r = self.add_bot(p.read_text(encoding="utf-8"), filename=name, source=source)
            return "%s: %s" % (name, r["message"])
        if name.endswith(".json"):
            r = self.add_round(read_json(p, None), source=source, name=p.stem)
            return "%s: %s" % (name, r["message"])
        if name.endswith(".txt"):
            r = self.add_standings(p.read_text(encoding="utf-8"), source=source)
            return "%s: %s" % (name, r["message"])
        return "%s: skipped (use .py, .json or .txt)" % name

    def scan_fetch_dir(self):
        d = (self.cfg.get("fetch_dir") or "").strip()
        if not d:
            return []
        root = Path(os.path.expanduser(d))
        if not root.is_dir():
            return ["fetch_dir not found: %s" % root]
        msgs = []
        for p in root.rglob("*.json"):
            if len(p.relative_to(root).parts) > 4 or "node_modules" in p.parts:
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            key = str(p)
            sig = "%d:%d" % (st.st_mtime, st.st_size)
            if self.seen.get(key) == sig:
                continue
            obj = read_json(p, None)
            self.seen[key] = sig
            if isinstance(obj, dict) and "hands" in obj and "players" in obj:
                try:
                    msgs.append("%s: %s" % (p.name, self.add_round(obj, source="fetch", name=p.stem)["message"]))
                except Exception as e:
                    msgs.append("%s: %s" % (p.name, e))
        write_json(DATA / "seen.json", self.seen)
        return msgs

    def sync(self):
        msgs = []
        ok = True
        try:
            msgs.append(self.pull_standings())
        except Exception as e:
            ok = False
            self.live_err = str(e)
            msgs.append("Standings: %s" % e)
        try:
            msgs += self.pull_rounds()
        except Exception as e:
            ok = False
            self.rounds_err = str(e)
            msgs.append("Rounds: %s" % e)
        cmd = (self.cfg.get("fetch_command") or "").strip()
        if cmd:
            cwd = os.path.expanduser(self.cfg.get("fetch_dir") or str(BASE))
            try:
                proc = subprocess.run(shlex.split(cmd), cwd=cwd, capture_output=True, text=True, timeout=240)
                tail = (proc.stdout + proc.stderr).strip().splitlines()[-3:]
                msgs.append("fetch exit %d%s" % (proc.returncode, (": " + " | ".join(tail)) if tail else ""))
                ok = proc.returncode == 0
            except Exception as e:
                ok = False
                msgs.append("fetch failed: %s" % e)
        msgs += self.scan_fetch_dir()
        msgs += self.scan_inbox()
        if not (self.cfg.get("data_token") or "").strip():
            msgs.append("Add your data token in Settings to pull your hands automatically.")
        with LOCK:
            self.last_sync = {"at": now_iso(), "ok": ok, "messages": msgs[-12:]}
            write_json(DATA / "last_sync.json", self.last_sync)
            self.touch()
        return self.last_sync

    # ---- views
    def state(self):
        with LOCK:
            rounds = self.ordered_rounds()
            team = self.cfg.get("team") or (rounds[-1]["team"] if rounds else "") or "Your team"
            light = [{k: r[k] for k in ("id", "ref", "label", "version", "result", "bb100", "finish", "hands", "luck")}
                     for r in rounds]
            return {
                "rev": self.rev,
                "now": now_iso(),
                "team": team,
                "config": dict({k: self.cfg.get(k) for k in ("sunday_tables", "fetch_command", "fetch_dir",
                                                              "auto_sync_minutes", "schedule", "upload_windows",
                                                              "rounds_poll_minutes", "standings_poll_seconds")},
                               has_token=bool((self.cfg.get("data_token") or "").strip())),
                "live": {k: (self.live or {}).get(k) for k in ("phase", "now", "next_round", "submissions_open",
                                                              "schedule", "limits", "teams")} if self.live else None,
                "live_block": self._live_block(),
                "live_err": self.live_err,
                "rounds_err": self.rounds_err,
                "bots": [{k: b[k] for k in ("version", "filename", "uploaded_at", "checks")} for b in self.bots],
                "rounds": light,
                "standings": self.standings[-60:],
                "scouting": A.scouting(rounds),
                "last_sync": self.last_sync,
            }

    def _live_block(self):
        d = self.live or {}
        b = d.get(d.get("phase") or "")
        if isinstance(b, dict):
            return {k: b.get(k) for k in ("played", "total", "min_rounds")}
        return None

    def round_view(self, rid):
        with LOCK:
            if not rid:
                rs = self.ordered_rounds()
                if not rs:
                    return None
                rid = rs[-1]["id"]
            a = self._analysis(rid)
            if not a:
                return None
            out = {k: v for k, v in a.items() if k != "our"}
            return out

    def bot_view(self, version=None):
        with LOCK:
            rs = self.ordered_rounds(version)
            agg = A.aggregate(rs)
            bot = None
            if self.bots:
                bot = next((b for b in self.bots if b["version"] == version), self.bots[-1]) if version else self.bots[-1]
            return {"agg": agg, "bot": bot, "version": version}


STORE = None


# --------------------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "PokerDash/1.0"

    def log_message(self, fmt, *args):
        if "/api/state" not in (args[0] if args else ""):
            sys.stderr.write("%s  %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)) or body is None:
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 50 * 1024 * 1024:
            raise ValueError("File too large")
        return self.rfile.read(n) if n else b""

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        try:
            if u.path in ("/", "/index.html"):
                return self._static("index.html")
            if u.path.startswith("/static/"):
                return self._static(u.path[len("/static/"):])
            if u.path == "/api/state":
                return self._send(200, STORE.state())
            if u.path == "/api/round":
                r = STORE.round_view((q.get("id") or [None])[0])
                return self._send(200 if r else 404, r or {"error": "No rounds yet"})
            if u.path == "/api/bot":
                v = (q.get("version") or ["all"])[0]
                return self._send(200, STORE.bot_view(None if v in ("", "all") else int(v)))
            if u.path == "/api/bot.py":
                v = int((q.get("version") or ["0"])[0])
                p = DATA / "bots" / ("v%d.py" % v)
                if p.exists():
                    return self._send(200, p.read_bytes(), "text/x-python; charset=utf-8")
            return self._send(404, {"error": "not found"})
        except Exception as e:
            traceback.print_exc()
            return self._send(500, {"error": str(e)})

    def _static(self, rel):
        p = (STATIC / rel).resolve()
        if STATIC not in p.parents or not p.is_file():
            return self._send(404, {"error": "not found"})
        ctype = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
                 ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml",
                 ".png": "image/png", ".jpg": "image/jpeg"}.get(p.suffix, "application/octet-stream")
        return self._send(200, p.read_bytes(), ctype)

    def do_POST(self):
        u = urlparse(self.path)
        try:
            body = self._body()
            if u.path == "/api/upload":
                name = self.headers.get("X-Filename") or "upload"
                ver = self.headers.get("X-Version")
                text = body.decode("utf-8", errors="replace")
                if name.endswith(".py"):
                    return self._send(200, STORE.add_bot(text, filename=name))
                stripped = text.lstrip()
                if name.endswith(".json") or stripped.startswith("{"):
                    d = json.loads(text)
                    return self._send(200, STORE.add_round(d, version=int(ver) if ver else None, name=Path(name).stem))
                return self._send(200, STORE.add_standings(text))
            if u.path == "/api/standings":
                return self._send(200, STORE.add_standings(body.decode("utf-8", errors="replace")))
            if u.path == "/api/sync":
                return self._send(200, STORE.sync())
            if u.path == "/api/round-version":
                d = json.loads(body or b"{}")
                STORE.set_round_version(d["id"], int(d["version"]) if d.get("version") else None)
                return self._send(200, {"ok": True})
            if u.path == "/api/config":
                STORE.update_config(json.loads(body or b"{}"))
                return self._send(200, {"ok": True})
            return self._send(404, {"error": "not found"})
        except Exception as e:
            traceback.print_exc()
            return self._send(400, {"ok": False, "error": str(e)})


def background():
    last_full = time.time()
    last_st = 0.0
    last_rd = 0.0
    while True:
        try:
            if any(p.is_file() and not p.name.startswith(".") for p in INBOX.iterdir()):
                STORE.scan_inbox()
            now = time.time()
            msgs = []
            if now - last_st >= float(STORE.cfg.get("standings_poll_seconds") or 60):
                last_st = now
                try:
                    msgs.append(STORE.pull_standings())
                except Exception as e:
                    STORE.live_err = str(e)
            if (STORE.cfg.get("data_token") or "").strip() and \
                    now - last_rd >= float(STORE.cfg.get("rounds_poll_minutes") or 2) * 60:
                last_rd = now
                try:
                    msgs += STORE.pull_rounds()
                except Exception as e:
                    STORE.rounds_err = str(e)
                    msgs.append("Rounds: %s" % e)
            if msgs:
                with LOCK:
                    STORE.last_sync = {"at": now_iso(), "ok": not STORE.rounds_err and not STORE.live_err,
                                       "messages": [m for m in msgs if m][-12:]}
            mins = float(STORE.cfg.get("auto_sync_minutes") or 0)
            if mins > 0 and (STORE.cfg.get("fetch_command") or "").strip() and now - last_full >= mins * 60:
                last_full = now
                STORE.sync()
        except Exception:
            traceback.print_exc()
        time.sleep(5)


def main():
    global STORE
    ap = argparse.ArgumentParser(description="Local pokerbot dashboard")
    ap.add_argument("--port", type=int, default=None)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    STORE = Store()
    port = args.port or int(STORE.cfg.get("port") or 8000)
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError:
        print("Port %d is already in use: an older dashboard is probably still running." % port)
        print("Close that Terminal window (or run: kill $(lsof -ti tcp:%d)) and start this again." % port)
        sys.exit(1)
    threading.Thread(target=background, daemon=True).start()
    url = "http://localhost:%d" % port
    print("Pokerbot dashboard running at %s  (Ctrl+C to stop)" % url)
    print("Inbox folder: %s" % INBOX)
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
