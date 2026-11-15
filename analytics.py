"""Hand-history analytics for the Imperial AI Hack pokerbots dashboard.

Input: the JSON that fetch_hands.py downloads for one round, e.g.
  {"ref": "saturday/r009", "seat": 7, "players": [...8 names...],
   "hands": [{"n", "button", "sb", "bb", "start_stacks", "hole": {seat: [c1, c2]},
              "showdown": {seat: hand_name}, "board": [...],
              "events": [["post", seat, amt], ["act", seat, action, amt],
                         ["board", street, cards], ["refund", seat, amt],
                         ["win", seat, amt, hand_name|None]],
              "results": [chips per seat], "result": our chips}]}

Everything here is pure Python standard library.
"""
import itertools
import random
import re
from collections import Counter, defaultdict

ANALYZER_VERSION = 3

# --------------------------------------------------------------------------- hand evaluator
_RANK = {r: i for i, r in enumerate("23456789TJQKA", start=2)}
DECK = [(r, s) for r in range(2, 15) for s in "cdhs"]


def card(c):
    return (_RANK[c[0]], c[1])


def _straight_high(rset):
    if 14 in rset:
        rset = rset | {1}
    for hi in range(14, 4, -1):
        if hi in rset and hi - 1 in rset and hi - 2 in rset and hi - 3 in rset and hi - 4 in rset:
            return hi
    return 0


def eval7(cards):
    """Comparable strength tuple of the best 5-card hand among 5-7 cards."""
    ranks = [r for r, _ in cards]
    suits = Counter(s for _, s in cards)
    fs = None
    for s, c in suits.items():
        if c >= 5:
            fs = s
    fr = None
    if fs:
        fr = sorted((r for r, s in cards if s == fs), reverse=True)
        sf = _straight_high(set(fr))
        if sf:
            return (8, sf)
    cnt = Counter(ranks)
    quads = [r for r, c in cnt.items() if c == 4]
    if quads:
        q = max(quads)
        return (7, q, max(r for r in ranks if r != q))
    trips = sorted((r for r, c in cnt.items() if c == 3), reverse=True)
    pairs = sorted((r for r, c in cnt.items() if c == 2), reverse=True)
    if trips and (len(trips) > 1 or pairs):
        return (6, trips[0], max(trips[1:] + pairs))
    if fr:
        return (5,) + tuple(fr[:5])
    st = _straight_high(set(ranks))
    if st:
        return (4, st)
    singles = sorted(set(ranks), reverse=True)
    if trips:
        t = trips[0]
        return (3, t) + tuple(r for r in singles if r != t)[:2]
    if len(pairs) >= 2:
        p1, p2 = pairs[0], pairs[1]
        return (2, p1, p2, max(r for r in singles if r != p1 and r != p2))
    if pairs:
        p = pairs[0]
        return (1, p) + tuple(r for r in singles if r != p)[:3]
    return (0,) + tuple(singles[:5])


def equities(hands, board, samples=1500, seed=7):
    """Share of the pot each hand wins over the remaining runouts (exact if <=2 cards to come)."""
    used = set(board)
    for h in hands:
        used.update(h)
    deck = [c for c in DECK if c not in used]
    need = 5 - len(board)
    if need <= 0:
        runs = [()]
    elif need <= 2:
        runs = itertools.combinations(deck, need)
    else:
        rng = random.Random(seed)
        runs = (tuple(rng.sample(deck, need)) for _ in range(samples))
    share = [0.0] * len(hands)
    tot = 0
    for run in runs:
        b = list(board) + list(run)
        vals = [eval7(h + b) for h in hands]
        best = max(vals)
        winners = [i for i, v in enumerate(vals) if v == best]
        for i in winners:
            share[i] += 1.0 / len(winners)
        tot += 1
    return [s / tot for s in share] if tot else [1.0 / len(hands)] * len(hands)


# --------------------------------------------------------------------------- helpers
_POS_AFTER_BB = {
    0: [], 1: ["UTG"], 2: ["UTG", "CO"], 3: ["UTG", "HJ", "CO"], 4: ["UTG", "MP", "HJ", "CO"],
    5: ["UTG", "UTG+1", "MP", "HJ", "CO"], 6: ["UTG", "UTG+1", "UTG+2", "MP", "HJ", "CO"],
}
POS_ORDER = ["UTG", "UTG+1", "UTG+2", "MP", "HJ", "CO", "BTN", "SB", "BB"]
STREETS = ["preflop", "flop", "turn", "river"]


def positions(n, button, sb_seat, bb_seat):
    """Seat -> position label for one hand."""
    out = {}
    if n == 2:
        out[sb_seat] = "BTN"
        out[bb_seat] = "BB"
        return out
    out[button] = "BTN"
    out[sb_seat] = "SB"
    out[bb_seat] = "BB"
    rest = [(bb_seat + k) % n for k in range(1, n)]
    rest = [s for s in rest if s not in out]
    for s, lab in zip(rest, _POS_AFTER_BB.get(len(rest), ["P%d" % i for i in range(len(rest))])):
        out[s] = lab
    return out


def ref_key(ref):
    """Sort key for refs like 'saturday/r009', 'sunday/b2/r003', 'final'."""
    r = ref.lower()
    day = 0 if ("fri" in r or "prac" in r) else 1 if "sat" in r else 2 if "sun" in r else 3
    if "final" in r:
        day = 4
    nums = [int(x) for x in re.findall(r"\d+", r)]
    return (day, nums, r)


def ref_label(ref):
    m = re.search(r"r0*(\d+)", ref)
    head = ref.split("/")[0].lower() if "/" in ref else ""
    day = {"saturday": "Sat", "sunday": "Sun", "practice": "Practice", "final": "Final"}.get(head, head[:3].capitalize())
    if m:
        return ("%s R%s" % (day, m.group(1))).strip()
    return ref


def style_label(st):
    """Rough style tag from aggregated counters."""
    h = st.get("hands", 0)
    if h < 30:
        return "Unknown"
    vpip = st["vpip"] / h
    pfr = st["pfr"] / h
    af = st["post_raise"] / max(1, st["post_call"])
    if pfr > 0.35:
        return "Maniac"
    if vpip >= 0.32:
        return "Loose-aggressive" if af >= 1.5 else "Calling station"
    if vpip <= 0.18:
        return "Tight-aggressive" if af >= 1.5 else "Tight-passive"
    return "Balanced"


STAT_KEYS = ("hands", "vpip", "pfr", "tb_opp", "tb", "fcb_opp", "fcb", "saw_flop", "wtsd", "wsd",
             "post_raise", "post_call")


def _new_stats():
    return {k: 0 for k in STAT_KEYS}


# --------------------------------------------------------------------------- one round
def analyze_round(d, version=None, rid=None):
    seat = int(d["seat"])
    players = list(d["players"])
    n = len(players)
    hands = d.get("hands") or []
    ref = d.get("ref") or rid or "round"
    bb = hands[0].get("bb", 20) if hands else 20

    totals = [0] * n
    cum = [[0] for _ in range(n)]
    cum_ev = [[0.0] for _ in range(n)]
    ev_tot = [0.0] * n
    stats = [_new_stats() for _ in range(n)]
    transfers = [0.0] * n              # net chips we took from each seat (+ = they paid us)
    our = []                           # compact per-hand records for aggregation
    sd_went = sd_won = 0
    allin_hands = 0
    table_sd_went = table_sd_won = 0

    for h in hands:
        ev = h.get("events") or []
        res = list(h.get("results") or [0] * n)
        posts = [e for e in ev if e[0] == "post"]
        sb_seat = posts[0][1] if posts else (h["button"] + 1) % n
        bb_seat = posts[1][1] if len(posts) > 1 else (sb_seat + 1) % n
        pos = positions(n, h.get("button", 0), sb_seat, bb_seat)

        # ---- action replay for style counters
        street = "preflop"
        nr = 0
        raiser = None
        pfa = None
        vpip = set()
        pfr = set()
        tb_done = set()
        folded = set()
        saw_flop = None
        flop_raised = False
        cbet_live = False
        cbet_by = None
        cbet_faced = set()
        last_act_i = -1
        boards_seen = []           # (event index, street, cards)
        for i, e in enumerate(ev):
            t = e[0]
            if t == "board":
                street = e[1]
                boards_seen.append((i, e[1], e[2]))
                if street == "flop" and saw_flop is None:
                    saw_flop = [s for s in range(n) if s not in folded]
                continue
            if t != "act":
                continue
            last_act_i = i
            s, a = e[1], e[2]
            if street == "preflop":
                if a in ("call", "raise"):
                    vpip.add(s)
                if nr == 1 and s != raiser and s not in tb_done:
                    tb_done.add(s)
                    stats[s]["tb_opp"] += 1
                    if a == "raise":
                        stats[s]["tb"] += 1
                if a == "raise":
                    pfr.add(s)
                    nr += 1
                    raiser = s
                    pfa = s
            else:
                if a == "raise":
                    stats[s]["post_raise"] += 1
                elif a == "call":
                    stats[s]["post_call"] += 1
                if street == "flop":
                    if not flop_raised:
                        if a == "raise":
                            flop_raised = True
                            if s == pfa:
                                cbet_live = True
                                cbet_by = s
                    elif cbet_live:
                        if s != cbet_by and s not in cbet_faced:
                            cbet_faced.add(s)
                            stats[s]["fcb_opp"] += 1
                            if a == "fold":
                                stats[s]["fcb"] += 1
                        if a == "raise":
                            cbet_live = False
            if a == "fold":
                folded.add(s)

        sd = {int(k) for k in (h.get("showdown") or {})}
        for s in range(n):
            st = stats[s]
            st["hands"] += 1
            if s in vpip:
                st["vpip"] += 1
            if s in pfr:
                st["pfr"] += 1
        if saw_flop:
            for s in saw_flop:
                stats[s]["saw_flop"] += 1
                if s in sd:
                    stats[s]["wtsd"] += 1
                    if res[s] > 0:
                        stats[s]["wsd"] += 1
        for s in sd:
            if s != seat:
                table_sd_went += 1
                if res[s] > 0:
                    table_sd_won += 1

        # ---- luck: all-in before the river with every showdown hand known
        evr = [float(x) for x in res]
        luck_us = 0.0
        allin_eq_us = None
        hole = {int(k): v for k, v in (h.get("hole") or {}).items()}
        later_boards = [b for b in boards_seen if b[0] > last_act_i]
        if sd and len(sd) >= 2 and later_boards and all(s in hole for s in sd):
            prior = [b for b in boards_seen if b[0] < last_act_i]
            board_at = prior[-1][2] if prior else []
            seats_sd = sorted(sd)
            eqs = equities([[card(c) for c in hole[s]] for s in seats_sd], [card(c) for c in board_at])
            won = defaultdict(float)
            for e in ev:
                if e[0] == "win":
                    won[e[1]] += e[2]
            pot = sum(won.values())
            for s, q in zip(seats_sd, eqs):
                contrib = won.get(s, 0.0) - res[s]
                evr[s] = q * pot - contrib
            # seats that did not reach showdown keep their actual result (the split stays zero-sum)
            if seat in sd:
                allin_eq_us = eqs[seats_sd.index(seat)]
                allin_hands += 1
            luck_us = res[seat] - evr[seat]

        for s in range(n):
            totals[s] += res[s]
            ev_tot[s] += evr[s]
            cum[s].append(totals[s])
            cum_ev[s].append(ev_tot[s])

        # ---- who paid whom (zero-sum split of each hand)
        pos_sum = sum(r for r in res if r > 0)
        if pos_sum > 0:
            for s in range(n):
                if s == seat:
                    continue
                if res[seat] > 0 and res[s] < 0:
                    transfers[s] += -res[s] * res[seat] / pos_sum
                elif res[seat] < 0 and res[s] > 0:
                    transfers[s] -= -res[seat] * res[s] / pos_sum

        end_street = boards_seen[-1][1] if boards_seen and last_act_i > boards_seen[-1][0] else (
            boards_seen[-1][1] if boards_seen else "preflop")
        # street where the last decision happened (runouts after an all-in do not count)
        dec_boards = [b for b in boards_seen if b[0] < last_act_i]
        dec_street = dec_boards[-1][1] if dec_boards else "preflop"

        if seat in sd:
            sd_went += 1
            if res[seat] > 0:
                sd_won += 1

        # counterpart: the opponent with the largest chip flow with us in this hand
        cp = None
        if res[seat] != 0 and pos_sum > 0:
            best = 0.0
            for s in range(n):
                if s == seat:
                    continue
                if res[seat] > 0 and res[s] < 0:
                    f = -res[s] * res[seat] / pos_sum
                elif res[seat] < 0 and res[s] > 0:
                    f = -res[seat] * res[s] / pos_sum
                else:
                    f = 0.0
                if f > best:
                    best, cp = f, s
        our.append({
            "n": h.get("n"),
            "r": res[seat],
            "luck": round(luck_us, 1),
            "pos": pos.get(seat, "?"),
            "st": dec_street,
            "end": end_street,
            "sd": seat in sd,
            "eq": None if allin_eq_us is None else round(allin_eq_us, 3),
            "hole": (h.get("hole") or {}).get(str(seat)),
            "board": h.get("board") or [],
            "cp": players[cp] if cp is not None else None,
            "folded": seat in folded,
        })

    hands_n = len(hands)
    us_total = totals[seat] if hands else 0
    order = sorted(range(n), key=lambda s: -totals[s])
    finish = order.index(seat) + 1 if hands else None

    # key hands: the three biggest swings for us
    key = sorted(our, key=lambda r: -abs(r["r"]))[:3]
    key_out = []
    for r in key:
        if r["r"] > 0:
            tag, tone = ("Value" if r["sd"] else "Took it down"), "good"
            how = "showdown" if r["sd"] else "no showdown"
        else:
            tone = "bad"
            if r["eq"] is not None and r["eq"] >= 0.6:
                tag, how = "Bad beat", "all-in at %d%%" % round(r["eq"] * 100)
            elif r["sd"]:
                tag, how = "Lost showdown", "showdown"
            else:
                tag, how = "Folded", "folded on the %s" % r["st"]
        key_out.append({"n": r["n"], "r": r["r"], "tag": tag, "tone": tone, "hole": r["hole"],
                        "board": r["board"], "desc": ("vs %s · %s" % (r["cp"], how)) if r["cp"] else how})

    step = max(1, hands_n // 200)
    def ds(arr):
        out = arr[::step]
        if out[-1] != arr[-1]:
            out.append(arr[-1])
        return out

    luck_total = sum(r["luck"] for r in our)
    table_wsd = (table_sd_won / table_sd_went) if table_sd_went else None
    return {
        "analyzer": ANALYZER_VERSION,
        "ref": ref,
        "label": ref_label(ref),
        "version": version,
        "seat": seat,
        "players": players,
        "team": players[seat] if 0 <= seat < n else None,
        "hands": hands_n,
        "bb": bb,
        "result": us_total,
        "bb100": (us_total / bb / hands_n * 100.0) if hands_n else 0.0,
        "finish": finish,
        "totals": totals,
        "ev_totals": [round(x, 1) for x in ev_tot],
        "cum": [ds(c) for c in cum],
        "cum_ev": [[round(x) for x in ds(c)] for c in cum_ev],
        "cum_x": ds(list(range(hands_n + 1))) if hands_n else [0],
        "transfers": {players[s]: round(transfers[s]) for s in range(n) if s != seat},
        "showdowns": {"went": sd_went, "won": sd_won, "table_wsd": table_wsd},
        "luck": round(luck_total),
        "allin_hands": allin_hands,
        "key_hands": key_out,
        "stats": {players[s]: stats[s] for s in range(n)},
        "styles": {players[s]: style_label(stats[s]) for s in range(n)},
        "our": our,
    }


# --------------------------------------------------------------------------- many rounds
def _ratio(a, b):
    return (a / b) if b else None


def style_summary(st):
    return {
        "vpip": _ratio(st["vpip"], st["hands"]),
        "pfr": _ratio(st["pfr"], st["hands"]),
        "tb": _ratio(st["tb"], st["tb_opp"]),
        "fcb": _ratio(st["fcb"], st["fcb_opp"]),
        "wtsd": _ratio(st["wtsd"], st["saw_flop"]),
        "wsd": _ratio(st["wsd"], st["wtsd"]),
    }


def aggregate(rounds):
    """Combine analysed rounds (already ordered) into the Our Bot view."""
    if not rounds:
        return None
    bb = rounds[0]["bb"]
    hands = sum(r["hands"] for r in rounds)
    chips = sum(r["result"] for r in rounds)
    luck = sum(r["luck"] for r in rounds)
    cum = [0]
    cum_adj = [0]
    markers = []
    per_round = []
    prev_v = None
    tot = adj = 0.0
    for r in rounds:
        if r["version"] != prev_v and prev_v is not None:
            markers.append({"at": len(cum) - 1, "label": "v%s" % r["version"]})
        prev_v = r["version"]
        for h in r["our"]:
            tot += h["r"]
            adj += h["r"] - h["luck"]
            cum.append(tot)
            cum_adj.append(adj)
        per_round.append({"label": r["label"], "ref": r["ref"], "bb100": r["bb100"],
                          "adj100": (r["result"] - r["luck"]) / bb / max(1, r["hands"]) * 100.0,
                          "version": r["version"]})
    step = max(1, len(cum) // 240)
    idx = list(range(0, len(cum), step))
    if idx[-1] != len(cum) - 1:
        idx.append(len(cum) - 1)

    by_pos = defaultdict(lambda: [0, 0])
    by_street = defaultdict(float)
    for r in rounds:
        for h in r["our"]:
            p = by_pos[h["pos"]]
            p[0] += h["r"]
            p[1] += 1
            by_street[h["st"]] += h["r"]
    pos_out = []
    for p in POS_ORDER:
        if p in by_pos:
            s, c = by_pos[p]
            pos_out.append({"pos": p, "bb100": s / bb / c * 100.0, "hands": c})
    street_out = [{"street": s, "bb100": by_street.get(s, 0.0) / bb / hands * 100.0} for s in STREETS]

    ours = _new_stats()
    table = _new_stats()
    vs = defaultdict(lambda: {"chips": 0.0, "hands": 0, "rounds": 0})
    for r in rounds:
        me = r["team"]
        for name, st in r["stats"].items():
            tgt = ours if name == me else table
            for k in STAT_KEYS:
                tgt[k] += st[k]
        for name, c in r["transfers"].items():
            v = vs[name]
            v["chips"] += c
            v["hands"] += r["hands"]
            v["rounds"] += 1
    vs_out = sorted(({"team": k, "chips": round(v["chips"]), "hands": v["hands"], "rounds": v["rounds"],
                      "bb100": v["chips"] / bb / max(1, v["hands"]) * 100.0} for k, v in vs.items()),
                    key=lambda x: -x["bb100"])
    sd_went = sum(r["showdowns"]["went"] for r in rounds)
    sd_won = sum(r["showdowns"]["won"] for r in rounds)
    return {
        "rounds": len(rounds),
        "hands": hands,
        "chips": chips,
        "bb100": chips / bb / hands * 100.0 if hands else 0.0,
        "adj100": (chips - luck) / bb / hands * 100.0 if hands else 0.0,
        "luck": luck,
        "cum": [cum[i] for i in idx],
        "cum_adj": [round(cum_adj[i]) for i in idx],
        "cum_x": idx,
        "markers": [{"x": m["at"], "label": m["label"]} for m in markers],
        "per_round": per_round,
        "positions": pos_out,
        "streets": street_out,
        "style": style_summary(ours),
        "table_style": style_summary(table),
        "vs": vs_out,
        "showdowns": {"went": sd_went, "won": sd_won},
    }


def scouting(rounds):
    """Per opponent: hands seen at our tables and a style tag."""
    agg = defaultdict(_new_stats)
    me = None
    for r in rounds:
        me = r["team"]
        for name, st in r["stats"].items():
            a = agg[name]
            for k in STAT_KEYS:
                a[k] += st[k]
    out = {}
    for name, st in agg.items():
        if name == me:
            continue
        s = style_summary(st)
        s.update({"hands": st["hands"], "style": style_label(st)})
        out[name] = s
    return out


# --------------------------------------------------------------------------- standings text
_ROW = re.compile(r"(?m)^\s*(\d{1,3})\s+(.+?)\s+([+\-−]\s?\d+(?:\.\d+)?)\s+(\d+)\s+([\d,]+)\s+v(\d+)\s*$")
_ROW_LOOSE = re.compile(r"(\d{1,3})\s+(.+?)\s+([+\-−]\s?\d+(?:\.\d+)?)\s+(\d+)\s+([\d,]+)\s+v(\d+)\b", re.S)


def parse_standings(text):
    """Parse the standings table copied from imperialaihack.com/pokerbots (any whitespace layout)."""
    rows = []
    t = text.replace("\r", "")
    # one row per line (tab or space separated)
    for m in _ROW.finditer(t.replace("\t", " ")):
        rows.append(m)
    if len(rows) < 2:
        # each cell on its own line: collapse whitespace and scan
        flat = re.sub(r"\s+", " ", t)
        flat = re.sub(r"(?i)^.*?#\s*team\s*average\s*\(bb/100\)\s*rounds\s*hands\s*bot", "", flat)
        rows = list(_ROW_LOOSE.finditer(flat))
    out = []
    seen = set()
    for m in rows:
        rank = int(m.group(1))
        if rank in seen:
            continue
        seen.add(rank)
        out.append({
            "rank": rank,
            "team": m.group(2).strip(),
            "bb100": float(m.group(3).replace("−", "-").replace(" ", "")),
            "rounds": int(m.group(4)),
            "hands": int(m.group(5).replace(",", "")),
            "version": int(m.group(6)),
        })
    out.sort(key=lambda r: r["rank"])
    stage = "Counted" if re.search(r"(?i)counted standings|ranked standings", text) else (
        "Practice" if re.search(r"(?i)practice", text) else "Standings")
    rm = re.search(r"(?i)round\s+(\d+)\s+of\s+(\d+)", text)
    label = "%s R%s" % (stage, rm.group(1)) if rm else stage
    return {"rows": out, "stage": stage, "label": label}
