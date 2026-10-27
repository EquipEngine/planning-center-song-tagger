#!/usr/bin/env python3
"""
Horizontal-Vertical Tagger for Planning Center Services
=======================================================

Most people should double-click one of these instead of running this file:

    Start Tagger (Mac).command
    Start Tagger (Windows).bat

That opens a simple menu. Technical users can also run steps directly:

    python3 hv_tagger.py setup      Save and test your Planning Center key
    python3 hv_tagger.py prepare    Make a scoring sheet from a Songs export
    python3 hv_tagger.py check      Check a filled-in scoring sheet
    python3 hv_tagger.py apply      Send scores to Planning Center
    python3 hv_tagger.py demo       Practice with sample songs (changes nothing)
    python3 hv_tagger.py discover   List every song tag group in your account

Uses only the Python standard library. There is nothing to install.
"""
import argparse
import base64
import csv
import getpass
import io
import json
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime
from pathlib import Path

if sys.version_info < (3, 8):
    print("This tool needs Python 3.8 or newer. Download it from https://www.python.org/downloads/")
    sys.exit(1)

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass

csv.field_size_limit(100_000_000)  # chord charts can be long

HERE = Path(__file__).resolve().parent
CONFIG_PATH = HERE / "config.env"
LOG_DIR = HERE / "logs"
EXAMPLES = HERE / "examples"
DEMO_OUT = EXAMPLES / "practice_output"

API_BASE = "https://api.planningcenteronline.com/services/v2"
PAT_URL = "https://api.planningcenteronline.com/oauth/applications"
DEFAULT_GROUP = "Horizontal Vertical Scale"
SCORE_NAMES = {1: "Horizontal", 2: "Mostly Horizontal", 3: "Blend",
               4: "Mostly Vertical", 5: "Vertical"}
SHEET_FIELDS = ["song_id", "title", "tags", "current_score", "score", "confidence", "notes"]
LOW_CONFIDENCE = {"low", "?", "unsure", "check"}

PAUSES = True  # turned off by `demo --no-pause`


# ======================================================================
# Friendly input / output
# ======================================================================

class UserError(Exception):
    """A problem we can explain in plain language."""


class NotFound(UserError):
    """Planning Center says this item doesn't exist."""


def ok(msg):
    print(f"  [OK] {msg}")


def warn(msg):
    print(f"  [!]  {msg}")


def heading(msg):
    print()
    print("=" * 64)
    print(f"  {msg}")
    print("=" * 64)


def ask(prompt, default=""):
    suffix = f" [{default}]" if default else ""
    try:
        answer = input(f"{prompt}{suffix}: ").strip()
    except EOFError:
        answer = ""
    return answer or default


def ask_yes(prompt, default="no"):
    while True:
        answer = ask(f"{prompt} (yes/no)", default).lower()
        if answer in ("y", "yes"):
            return True
        if answer in ("n", "no"):
            return False
        print("  Please type yes or no.")


def pause(msg="Press Enter to continue..."):
    if PAUSES and sys.stdin.isatty():
        try:
            input(msg)
        except EOFError:
            pass


def clean_path(raw):
    """Turn a dragged-in or pasted file path into a Path."""
    s = raw.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "'\"":
        s = s[1:-1]
    if sys.platform != "win32":
        s = re.sub(r"\\(.)", r"\1", s)  # Mac Terminal escapes spaces when you drag a file in
    return Path(s).expanduser()


def plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"


def stamp():
    return datetime.now().strftime("%Y-%m-%d_%H%M%S")


# ======================================================================
# Settings file (config.env)
# ======================================================================

def load_config():
    cfg = {}
    if CONFIG_PATH.exists():
        for line in CONFIG_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                cfg[key.strip()] = value.strip()
    return cfg


def save_config(cfg):
    lines = [
        "# Planning Center key used by hv_tagger.py.",
        "# Treat this file like a password: don't email it or share it.",
        f"# You can turn the key off any time at {PAT_URL}",
        "",
    ]
    for key in ("PC_APP_ID", "PC_SECRET", "SCALE_GROUP"):
        if cfg.get(key):
            lines.append(f"{key} = {cfg[key]}")
    CONFIG_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        CONFIG_PATH.chmod(0o600)
    except Exception:
        pass


# ======================================================================
# Planning Center connection
# ======================================================================

class PlanningCenter:
    """Talks to the real Planning Center Services API."""

    is_pretend = False

    def __init__(self, app_id, secret):
        token = base64.b64encode(f"{app_id}:{secret}".encode()).decode()
        self.headers = {"Authorization": f"Basic {token}",
                        "User-Agent": "hv-tagger/1.0"}

    def _request(self, method, path, params=None, body=None):
        url = API_BASE + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = None
        headers = dict(self.headers)
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        for attempt in range(6):
            req = urllib.request.Request(url, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    raw = resp.read()
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as e:
                if e.code == 429:  # too many requests: wait and retry
                    time.sleep(int(e.headers.get("Retry-After") or 5))
                    continue
                if e.code >= 500:
                    time.sleep(3 * (attempt + 1))
                    continue
                if e.code == 401:
                    raise UserError(
                        "Planning Center did not accept your key. Choose 'Set up' and "
                        "paste the Application ID and Secret again.")
                if e.code == 403:
                    raise UserError(
                        "Your Planning Center login doesn't have permission to do this. "
                        "The key must belong to someone who can edit songs in Services.")
                if e.code == 404:
                    raise NotFound(path)
                detail = e.read().decode("utf-8", "replace")[:300]
                raise UserError(f"Planning Center returned an error ({e.code}): {detail}")
            except urllib.error.URLError:
                if attempt < 2:
                    time.sleep(2)
                    continue
                raise UserError("I couldn't reach Planning Center. Check your internet "
                                "connection and try again.")
        raise UserError("Planning Center is busy right now. Wait a few minutes and try again.")

    def _all_pages(self, path, params=None):
        offset = 0
        while True:
            page = self._request("GET", path, {**(params or {}), "per_page": 100, "offset": offset})
            items = page.get("data", [])
            yield from items
            if len(items) < 100:
                return
            offset += 100

    def tag_groups(self):
        return [{"id": g["id"], "name": (g["attributes"].get("name") or "").strip()}
                for g in self._all_pages("/tag_groups")]

    def tags_in_group(self, group_id):
        return [{"id": t["id"], "name": (t["attributes"].get("name") or "").strip()}
                for t in self._all_pages(f"/tag_groups/{group_id}/tags")]

    def song_tag_ids(self, song_id):
        return [t["id"] for t in self._all_pages(f"/songs/{song_id}/tags")]

    def set_song_tags(self, song_id, tag_ids):
        # NOTE: Planning Center REPLACES a song's whole tag list with this call,
        # so callers must always send the song's other tags too.
        body = {"data": {"type": "TagAssignment", "attributes": {},
                         "relationships": {"tags": {"data": [
                             {"type": "Tag", "id": str(t)} for t in tag_ids]}}}}
        self._request("POST", f"/songs/{song_id}/assign_tags", body=body)
        time.sleep(0.15)  # be polite to the API


class PretendPlanningCenter:
    """Stands in for Planning Center during practice runs.
    Nothing leaves your computer."""

    is_pretend = True

    def __init__(self, export_rows):
        self.groups = {}      # group_id -> {"name": str, "tags": {tag_id: name}}
        self.song_tags = {}   # song_id -> [tag_id, ...]
        self._next = 9000
        for n in range(1, 6):
            self._tag_id(DEFAULT_GROUP, f"{n} - {SCORE_NAMES[n]}")
        for row in export_rows:
            ids = []
            for tag in song_tags_of(row):
                group, _, name = tag.partition(":")
                if not name:
                    group, name = "Other", tag
                ids.append(self._tag_id(group.strip(), name.strip()))
            self.song_tags[row_id(row)] = ids

    def _new_id(self):
        self._next += 1
        return str(self._next)

    def _tag_id(self, group_name, tag_name):
        gid = next((g for g, v in self.groups.items() if v["name"] == group_name), None)
        if gid is None:
            gid = self._new_id()
            self.groups[gid] = {"name": group_name, "tags": {}}
        for tid, name in self.groups[gid]["tags"].items():
            if name == tag_name:
                return tid
        tid = self._new_id()
        self.groups[gid]["tags"][tid] = tag_name
        return tid

    def tag_groups(self):
        return [{"id": gid, "name": g["name"]} for gid, g in self.groups.items()]

    def tags_in_group(self, group_id):
        return [{"id": t, "name": n} for t, n in self.groups[group_id]["tags"].items()]

    def song_tag_ids(self, song_id):
        if song_id not in self.song_tags:
            raise NotFound(song_id)
        return list(self.song_tags[song_id])

    def set_song_tags(self, song_id, tag_ids):
        self.song_tags[song_id] = list(tag_ids)

    def describe(self, song_id):
        names = {}
        for g in self.groups.values():
            for tid, name in g["tags"].items():
                names[tid] = f"{g['name']}: {name}"
        return [names[t] for t in self.song_tags.get(song_id, [])]


def connect():
    cfg = load_config()
    if not cfg.get("PC_APP_ID") or not cfg.get("PC_SECRET"):
        raise UserError("You haven't connected to Planning Center yet. "
                        "Choose option 1 (Set up) first.")
    return PlanningCenter(cfg["PC_APP_ID"], cfg["PC_SECRET"]), cfg


def resolve_scale(pc, group_name):
    """Return {1: tag, 2: tag, ... 5: tag} for the scale tag group."""
    groups = pc.tag_groups()
    group = next((g for g in groups if g["name"].lower() == group_name.lower()), None)
    if not group:
        raise UserError(
            f"I couldn't find a tag group named '{group_name}' in Planning Center. "
            "Create it (Admin Guide, Step 3), or choose 'Set up' to pick the right group.")
    tags = pc.tags_in_group(group["id"])
    scale = {}
    for tag in tags:
        m = re.match(r"\s*([1-5])(?!\d)", tag["name"])
        if m and int(m.group(1)) not in scale:
            scale[int(m.group(1))] = tag
    missing = [str(n) for n in range(1, 6) if n not in scale]
    if missing:
        found = ", ".join(t["name"] for t in tags) or "no tags yet"
        raise UserError(
            f"The '{group['name']}' group needs 5 tags whose names start with the numbers "
            f"1 through 5. Missing: {', '.join(missing)}. Found: {found}.")
    return scale


# ======================================================================
# Reading CSV and Excel files
# ======================================================================

def read_table(path):
    """Read a .csv or .xlsx file into a list of dicts (one per row)."""
    path = Path(path)
    if not path.exists():
        raise UserError(f"I can't find this file: {path}")
    suffix = path.suffix.lower()
    if suffix == ".numbers":
        raise UserError("That's a Numbers file. In Numbers choose File > Export To > CSV, "
                        "then use the .csv file it creates.")
    if suffix == ".xls":
        raise UserError("That's an older Excel format. In Excel choose File > Save As and "
                        "pick 'CSV UTF-8' or 'Excel Workbook (.xlsx)'.")
    if suffix in (".xlsx", ".xlsm"):
        return _read_xlsx(path)

    raw = path.read_bytes()
    text = None
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    first_line = text.split("\n", 1)[0]
    delimiter = max([",", ";", "\t"], key=first_line.count)
    reader = csv.DictReader(io.StringIO(text, newline=""), delimiter=delimiter)
    rows = []
    for row in reader:
        rows.append({(k or "").strip(): (v or "") for k, v in row.items() if k is not None})
    return rows


def _col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _read_xlsx(path):
    M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    try:
        z = zipfile.ZipFile(path)
    except zipfile.BadZipFile:
        raise UserError("That Excel file couldn't be opened. Try saving it again as .xlsx or CSV.")
    with z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{M}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{M}t")))
        sheets = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))
        if not sheets:
            raise UserError("That Excel file has no sheets I can read.")
        name = "xl/worksheets/sheet1.xml" if "xl/worksheets/sheet1.xml" in sheets else sheets[0]
        root = ET.fromstring(z.read(name))
    grid = []
    for r in root.iter(f"{M}row"):
        values = {}
        for i, c in enumerate(r.iter(f"{M}c")):
            ref = re.match(r"[A-Z]+", c.get("r", "") or "")
            col = _col_index(ref.group()) if ref else i
            kind = c.get("t")
            v = c.find(f"{M}v")
            if kind == "s" and v is not None:
                val = shared[int(v.text)]
            elif kind == "inlineStr":
                val = "".join(t.text or "" for t in c.iter(f"{M}t"))
            else:
                val = v.text if (v is not None and v.text is not None) else ""
            values[col] = val
        if values:
            grid.append([values.get(i, "") for i in range(max(values) + 1)])
    if not grid:
        return []
    header = [h.strip() for h in grid[0]]
    return [{header[i]: (row[i] if i < len(row) else "") for i in range(len(header)) if header[i]}
            for row in grid[1:]]


def field(row, *names):
    """Case-insensitive column lookup. Returns None if the column is missing."""
    lower = {k.lower(): k for k in row}
    for n in names:
        if n.lower() in lower:
            return row[lower[n.lower()]]
    return None


def norm_id(value):
    s = str(value or "").strip()
    if re.fullmatch(r"\d+\.0+", s):
        s = s.split(".")[0]
    elif re.fullmatch(r"\d+(\.\d+)?[eE]\+?\d+", s):
        s = str(int(float(s)))
    return s


def row_id(row):
    return norm_id(field(row, "Id", "ID", "song_id", "Song ID"))


def song_tags_of(row):
    return [v.strip() for k, v in row.items()
            if re.fullmatch(r"song tag \d+", k.strip().lower()) and v and v.strip()]


# ======================================================================
# Lyrics from chord charts
# ======================================================================

SECTION_RE = re.compile(
    r"^\s*(intro|outro|verse|chorus|pre[- ]?chorus|bridge|tag|refrain|interlude|vamp|"
    r"coda|ending|instrumental|turnaround|breakdown|hook|misc|v\d+|c\d+|b\d+)\b.*$",
    re.IGNORECASE)
BRACKET_CHORD_RE = re.compile(r"\[[^\]]*\]")
CHORD_RE = re.compile(r"^[A-G][#b]?(maj|min|m|sus|add|aug|dim)?\d*(\([^)]*\))?(/[A-G][#b]?)?$")


def _chord_only(line):
    tokens = [t for t in re.split(r"\s+", BRACKET_CHORD_RE.sub(" ", line).strip()) if t]
    for t in tokens:
        t = t.strip(",.|()")
        if t and t.lower() not in ("x2", "x3", "x4", "2x", "3x", "4x") and not CHORD_RE.match(t):
            return False
    return True


def lyrics_from_chart(chart):
    if not chart:
        return ""
    kept, blank = [], True
    for line in chart.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if not line.strip():
            if not blank:
                kept.append("")
            blank = True
            continue
        if SECTION_RE.match(line.strip().rstrip(":")) or _chord_only(line):
            continue
        text = BRACKET_CHORD_RE.sub("", line).rstrip()
        if text.strip():
            kept.append(text)
            blank = False
    return "\n".join(kept).strip()


def best_lyrics(row):
    numbers = sorted({int(m.group(1)) for k in row
                      for m in [re.fullmatch(r"arrangement (\d+) chord chart", k.strip().lower())] if m})
    for n in numbers:
        lyr = lyrics_from_chart(field(row, f"Arrangement {n} Chord Chart") or "")
        if lyr:
            return lyr
    return ""


# ======================================================================
# Step: setup
# ======================================================================

def prompt_for_key(cfg):
    print()
    print("To connect, you need a Planning Center 'Personal Access Token'.")
    print("It's two codes: an Application ID and a Secret.")
    print()
    print(f"  1. Open this page in your web browser and sign in:\n     {PAT_URL}")
    print("  2. Find 'Personal Access Tokens' and create a new one.")
    print("     Name it something like 'Song tagging'.")
    print("  3. Copy the Application ID, paste it below, and press Enter.")
    print("  4. Copy the Secret, paste it below, and press Enter.")
    print("     (The Secret is only shown once, so keep that page open until you finish.)")
    print()
    app_id = ask("Application ID")
    print("Secret: for privacy, nothing will appear on screen as you paste it. That's normal.")
    try:
        secret = getpass.getpass("Secret: ").strip()
    except (EOFError, KeyboardInterrupt):
        secret = ""
    if not app_id or not secret:
        raise UserError("Both the Application ID and the Secret are needed. Nothing was saved.")
    cfg.update(PC_APP_ID=app_id, PC_SECRET=secret)
    save_config(cfg)
    ok("Saved to config.env on this computer.")
    return cfg


def cmd_setup():
    heading("Step 1: Connect to Planning Center")
    cfg = load_config()
    if cfg.get("PC_APP_ID") and cfg.get("PC_SECRET"):
        print(f"You're already connected (Application ID ending in ...{cfg['PC_APP_ID'][-4:]}).")
        if ask_yes("Do you want to enter a different key?", "no"):
            cfg = prompt_for_key(cfg)
    else:
        cfg = prompt_for_key(cfg)

    print("\nTesting the connection...")
    pc = PlanningCenter(cfg["PC_APP_ID"], cfg["PC_SECRET"])
    groups = pc.tag_groups()
    ok(f"Connected! Your account has {len(groups)} song tag groups.")

    wanted = cfg.get("SCALE_GROUP") or DEFAULT_GROUP
    match = next((g for g in groups if g["name"].lower() == wanted.lower()), None)
    if not match:
        warn(f"I don't see a tag group named '{wanted}'.")
        if groups:
            print("\nThese are the tag groups I can see:")
            for i, g in enumerate(groups, 1):
                print(f"   {i:2d}) {g['name']}")
            pick = ask("\nIf one of these is your 1-5 scale group, type its number. "
                       "Otherwise just press Enter")
            if pick.isdigit() and 1 <= int(pick) <= len(groups):
                match = groups[int(pick) - 1]
        if not match:
            print()
            print("Next, create the scale group in Planning Center (Admin Guide, Step 3):")
            print(f"  - Tag group name: {DEFAULT_GROUP}")
            print("  - Five tags: 1 - Horizontal, 2 - Mostly Horizontal, 3 - Blend,")
            print("               4 - Mostly Vertical, 5 - Vertical")
            print("Then choose 'Set up' again to finish.")
            return

    cfg["SCALE_GROUP"] = match["name"]
    save_config(cfg)
    scale = resolve_scale(pc, match["name"])
    ok(f"Found '{match['name']}' with all five score tags:")
    for n in range(1, 6):
        print(f"         {n}  ->  {scale[n]['name']}")
    print("\nSetup is complete. You won't need to do this step again on this computer.")


# ======================================================================
# Step: prepare a scoring sheet
# ======================================================================

def find_recent_exports():
    found = set()
    for folder in (HERE, Path.home() / "Downloads", Path.home() / "Desktop", Path.home() / "Documents"):
        try:
            for p in folder.glob("*.csv"):
                name = p.name.lower()
                if "song" in name and "export" in name:
                    found.add(p)
        except Exception:
            pass
    return sorted(found, key=lambda p: p.stat().st_mtime, reverse=True)


def choose_file(given, kind, finder):
    if given:
        return clean_path(str(given))
    found = finder() if finder else []
    if found:
        print(f"I found this {kind}:")
        print(f"   {found[0].name}")
        print(f"   (in {found[0].parent})")
        if ask_yes("Use this file?", "yes"):
            return found[0]
    print(f"\nDrag the {kind} into this window, then press Enter.")
    print("(You can also type or paste the full path to the file.)")
    raw = ask("File")
    if not raw:
        raise UserError("No file was chosen.")
    return clean_path(raw)


def parse_number_list(text, maximum):
    nums = []
    for part in re.split(r"[,\s]+", text.strip()):
        if not part:
            continue
        if not part.isdigit() or int(part) > maximum:
            raise UserError(f"'{part}' isn't one of the numbers listed.")
        nums.append(int(part))
    return nums


def cmd_prepare(export=None, out_dir=HERE, scope=None, skip_scored=None, group_name=None):
    heading("Step 2: Make a scoring sheet")
    path = choose_file(export, "Planning Center Songs export (.csv)", find_recent_exports)
    rows = read_table(path)
    if not rows or field(rows[0], "Id") is None or field(rows[0], "Title") is None:
        raise UserError(
            "This file doesn't look like a Planning Center Songs export (it has no Id and "
            "Title columns). Export the song list from Planning Center Services as CSV and "
            "try again.")

    group = group_name or load_config().get("SCALE_GROUP") or DEFAULT_GROUP
    prefix = group.lower() + ":"

    def current_score(r):
        for t in song_tags_of(r):
            if t.lower().startswith(prefix):
                m = re.search(r":\s*([1-5])", t)
                if m:
                    return m.group(1)
        return ""

    tag_counts = Counter(t for r in rows for t in song_tags_of(r)
                         if not t.lower().startswith(prefix))
    options = sorted(tag_counts.items(), key=lambda kv: kv[0].lower())
    print(f"\nThis export has {len(rows)} songs.")

    if scope is None:
        print("\nWhich songs do you want to score?")
        print(f"    0) All {len(rows)} songs")
        for i, (tag, count) in enumerate(options, 1):
            print(f"   {i:2d}) Songs tagged '{tag}'  ({count} song{'' if count == 1 else 's'})")
        while True:
            try:
                picks = parse_number_list(ask("\nType a number, or several separated by commas "
                                              "(example: 1,2)", "0"), len(options))
                break
            except UserError as e:
                warn(str(e) + " Please try again.")
        chosen = None if (not picks or 0 in picks) else {options[n - 1][0].lower() for n in picks}
    else:
        chosen = None if scope.strip().lower() in ("", "all") else \
            {s.strip().lower() for s in scope.split(",") if s.strip()}

    selected = [r for r in rows
                if chosen is None or any(t.lower() in chosen for t in song_tags_of(r))]
    scored = [r for r in selected if current_score(r)]
    if scored:
        print(f"\n{plural(len(scored), 'song')} in your selection already {'has' if len(scored) == 1 else 'have'} a score in Planning Center.")
        if skip_scored is None:
            skip_scored = ask_yes("Leave those out, so you only score the new ones?", "yes")
        if skip_scored:
            selected = [r for r in selected if not current_score(r)]
    if not selected:
        raise UserError("No songs matched what you picked, so there's nothing to score.")

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet = out_dir / "scoring_sheet.csv"
    if sheet.exists():
        backup = out_dir / f"scoring_sheet_backup_{stamp()}.csv"
        shutil.copy2(sheet, backup)
        warn(f"You already had a scoring sheet, so I saved a copy as {backup.name}")

    selected.sort(key=lambda r: (field(r, "Title") or "").lower())
    with sheet.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(SHEET_FIELDS)
        for r in selected:
            other_tags = [t for t in song_tags_of(r) if not t.lower().startswith(prefix)]
            w.writerow([row_id(r), (field(r, "Title") or "").strip(), "; ".join(other_tags),
                        current_score(r), "", "", ""])

    songs = []
    for r in selected:
        lyr = best_lyrics(r)
        songs.append({"song_id": row_id(r), "title": (field(r, "Title") or "").strip(),
                      "has_lyrics": bool(lyr), "lyrics": lyr})
    claude_file = out_dir / "songs_for_claude.json"
    claude_file.write_text(json.dumps({
        "about": ("Lyrics for scoring on the Horizontal-Vertical scale. Contains copyrighted "
                  "lyrics: keep private, never post or share."),
        "count": len(songs), "songs": songs}, indent=2, ensure_ascii=False), encoding="utf-8")

    missing = [s["title"] for s in songs if not s["has_lyrics"]]
    print()
    ok(f"Made your scoring sheet with {len(selected)} songs:")
    print(f"       {sheet}")
    ok(f"Saved lyrics for Claude (optional) in {claude_file.name}")
    if missing:
        warn(f"{plural(len(missing), 'song')} {'has' if len(missing) == 1 else 'have'} no lyrics in Planning Center (often older hymns). "
             "Score those from what you know of the song.")
    print("\nNext: open scoring_sheet.csv in Excel, Numbers, or Google Sheets and type a")
    print("number from 1 to 5 in the 'score' column for each song (see the Rubric).")
    print("Keep the file as CSV when you save. Then come back and choose 'Check'.")
    return sheet


# ======================================================================
# Step: check a scoring sheet
# ======================================================================

SCORE_RE = re.compile(r"^([1-5])(?:\.0+)?(?:\s*[-:]?\s*[A-Za-z].*)?$")


def find_sheets():
    found = []
    for folder in (HERE, Path.home() / "Downloads", Path.home() / "Desktop"):
        try:
            for p in folder.iterdir():
                if p.name.lower().startswith("scoring_sheet") and "backup" not in p.name.lower() \
                        and p.suffix.lower() in (".csv", ".xlsx"):
                    found.append(p)
        except Exception:
            pass
    return sorted(found, key=lambda p: p.stat().st_mtime, reverse=True)


def cmd_check(sheet=None, quiet=False):
    if not quiet:
        heading("Step 3: Check your scoring sheet")
    path = choose_file(sheet, "scoring sheet", find_sheets)
    rows = read_table(path)
    if not rows:
        raise UserError("That scoring sheet is empty.")
    if field(rows[0], "song_id") is None or field(rows[0], "score") is None:
        raise UserError("That file is missing the 'song_id' or 'score' column. Please don't "
                        "rename or delete the columns in the scoring sheet.")

    good, blank, bad, seen = [], [], [], {}
    for line_no, r in enumerate(rows, start=2):
        sid = norm_id(field(r, "song_id"))
        title = (field(r, "title") or "").strip()
        value = str(field(r, "score") or "").strip()
        if not sid and not title and not value:
            continue
        if not sid:
            bad.append(f"row {line_no}: '{title}' has no song_id")
            continue
        if not value:
            blank.append(title or sid)
            continue
        m = SCORE_RE.match(value)
        if not m:
            bad.append(f"row {line_no}: '{title}' has score '{value}' (use 1, 2, 3, 4 or 5)")
            continue
        if sid in seen:
            bad.append(f"row {line_no}: '{title}' is listed twice (also row {seen[sid]})")
            continue
        seen[sid] = line_no
        confidence = str(field(r, "confidence") or "").strip().lower()
        good.append({"song_id": sid, "title": title, "score": int(m.group(1)),
                     "flagged": confidence in LOW_CONFIDENCE})

    print(f"\nScoring sheet: {path.name}")
    ok(f"{plural(len(good), 'song')} with a valid score")
    if blank:
        warn(f"{plural(len(blank), 'song')} without a score yet:")
        for t in blank[:10]:
            print(f"         - {t}")
        if len(blank) > 10:
            print(f"         ...and {len(blank) - 10} more")
    if bad:
        warn(f"{plural(len(bad), 'row')} to fix:")
        for b in bad[:10]:
            print(f"         - {b}")
        if len(bad) > 10:
            print(f"         ...and {len(bad) - 10} more")

    flagged = [g["title"] for g in good if g["flagged"]]
    if flagged:
        warn(f"{plural(len(flagged), 'song')} marked 'low' in the confidence column "
             "(Claude wasn't sure):")
        for t in flagged[:10]:
            print(f"         - {t}")
        if len(flagged) > 10:
            print(f"         ...and {len(flagged) - 10} more")
        print("       Have someone look at these. When a score is confirmed, change 'low'")
        print("       to 'reviewed' (or clear the cell).")

    if good:
        counts = Counter(g["score"] for g in good)
        biggest = max(counts.values())
        print("\nHow your scores are spread out:")
        for n in range(1, 6):
            bar = "#" * round(counts.get(n, 0) / biggest * 30) if biggest else ""
            print(f"   {n} {SCORE_NAMES[n]:<18} {counts.get(n, 0):>4}  {bar}")
    if not blank and not bad and not flagged:
        print("\nEverything looks good. When you're ready, choose 'Send scores'.")
    return path, good, len(blank) + len(bad)


# ======================================================================
# Step: apply scores to Planning Center
# ======================================================================

def pick_test_songs(songs):
    """One low score, one high score, and one in the middle when possible."""
    ordered = sorted(songs, key=lambda s: s["score"])
    picks = [ordered[0], ordered[-1]]
    middle = [s for s in ordered if s["score"] not in (ordered[0]["score"], ordered[-1]["score"])]
    picks.append(middle[len(middle) // 2] if middle else ordered[len(ordered) // 2])
    unique = []
    for s in picks:
        if s["song_id"] not in {u["song_id"] for u in unique}:
            unique.append(s)
    return unique


def send(pc, songs, scale, log_path):
    scale_ids = {t["id"] for t in scale.values()}
    counts = Counter()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    new_file = not log_path.exists()
    with log_path.open("a", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        if new_file:
            w.writerow(["time", "song_id", "title", "score", "result", "detail"])
        for i, s in enumerate(songs, 1):
            target = scale[s["score"]]["id"]
            try:
                current = pc.song_tag_ids(s["song_id"])
                others = [t for t in current if t not in scale_ids]
                if target in current and len(current) - len(others) == 1:
                    result, detail = "already set", ""
                else:
                    pc.set_song_tags(s["song_id"], others + [target])
                    result, detail = "updated", f"kept {len(others)} other tag(s)"
            except NotFound:
                result, detail = "not found", "This song isn't in Planning Center (deleted or merged?)"
            except UserError as e:
                w.writerow([datetime.now().isoformat(timespec="seconds"), s["song_id"],
                            s["title"], s["score"], "stopped", str(e)])
                raise
            counts[result] += 1
            w.writerow([datetime.now().isoformat(timespec="seconds"), s["song_id"],
                        s["title"], s["score"], result, detail])
            f.flush()
            print(f"  {i:>4}/{len(songs)}  {result:<12} {s['score']} {SCORE_NAMES[s['score']]:<18} "
                  f"{s['title'][:34]}")
    return counts


def report(counts, log_path):
    print()
    ok(f"Updated: {counts.get('updated', 0)}   Already set: {counts.get('already set', 0)}   "
       f"Not found: {counts.get('not found', 0)}")
    print(f"       A record of every song is saved in: {log_path}")


def cmd_apply(sheet=None, mode=None, pc=None, group_name=None, log_dir=LOG_DIR, assume_yes=False):
    heading("Step 4: Send scores to Planning Center")
    path, good, problems = cmd_check(sheet, quiet=True)
    if not good:
        raise UserError("There are no scores to send yet. Fill in the 'score' column first.")
    if problems and not assume_yes:
        if not ask_yes(f"\nSend the {len(good)} songs that do have valid scores and skip the rest?",
                       "yes"):
            print("OK, nothing was sent.")
            return

    flagged = [g for g in good if g["flagged"]]
    if flagged and not assume_yes:
        if not ask_yes(f"\n{plural(len(flagged), 'song')} still marked 'low' confidence. "
                       "Send anyway?", "no"):
            print("OK, nothing was sent. Review those songs, then try again.")
            return

    cfg = load_config()
    if pc is None:
        pc, cfg = connect()
    group = group_name or cfg.get("SCALE_GROUP") or DEFAULT_GROUP
    print("\nChecking the scale tags in Planning Center...")
    scale = resolve_scale(pc, group)
    ok(f"Using tag group '{group}'")
    log_path = Path(log_dir) / f"sent_{stamp()}.csv"

    print("\nThis only changes the score tag on each song. All other tags are kept.")
    if mode is None:
        mode = "test"
    if mode == "test":
        batch = pick_test_songs(good)
        print(f"\nFirst, let's send just {len(batch)} songs so you can check them:\n")
        counts = send(pc, batch, scale, log_path)
        report(counts, log_path)
        print("\nNow open Planning Center > Services > Songs and look at these songs:")
        for s in batch:
            print(f"   - {s['title']}  (should show: {scale[s['score']]['name']})")
        print("Check that each one shows the right score AND still has its other tags.")
        if not assume_yes and not ask_yes("\nDid they look right? Send the rest now?", "no"):
            print("\nNo problem. Nothing else was changed. When you're ready, choose")
            print("'Send scores' again. Songs that are already right are skipped.")
            return
        done = {s["song_id"] for s in batch}
        rest = [s for s in good if s["song_id"] not in done]
        if rest:
            print(f"\nSending the other {len(rest)} songs...\n")
            counts = send(pc, rest, scale, log_path)
            report(counts, log_path)
    else:
        if not assume_yes and not ask_yes(f"This will update up to {len(good)} songs. Continue?",
                                          "no"):
            print("OK, nothing was sent.")
            return
        counts = send(pc, good, scale, log_path)
        report(counts, log_path)
    print("\nAll done!")


# ======================================================================
# Practice run with sample songs
# ======================================================================

def cmd_demo(no_pause=False):
    global PAUSES
    if no_pause:
        PAUSES = False
    export = EXAMPLES / "sample_songs_export.csv"
    filled = EXAMPLES / "sample_scoring_sheet.csv"
    if not export.exists() or not filled.exists():
        raise UserError("The examples folder is missing. Download the tool again.")

    heading("Practice run (nothing real is changed)")
    print("This walks through every step using 9 made-up songs and a pretend")
    print("Planning Center that lives only on this computer.")
    pause()

    cmd_prepare(export=export, out_dir=DEMO_OUT, scope="all", skip_scored=True,
                group_name=DEFAULT_GROUP)
    print("\n(One sample song already had a score, so it was left out.)")
    pause()

    heading("Scoring (done for you in this practice run)")
    print("Normally you'd now type a 1-5 score for each song. For practice, we'll use")
    print("a sheet that's already filled in:")
    print(f"   {filled}")
    print("\nA few rows from it:")
    for r in read_table(filled)[:3]:
        print(f"   {r['score']}  {r['title']:<30} {r['notes'][:60]}")
    pause()

    cmd_check(filled)
    pause()

    pretend = PretendPlanningCenter(read_table(export))
    sample = read_table(filled)[0]
    print(f"\nBefore: '{sample['title']}' has these tags in the pretend Planning Center:")
    for t in pretend.describe(sample["song_id"]):
        print(f"   - {t}")
    pause()

    cmd_apply(sheet=filled, mode="test", pc=pretend, group_name=DEFAULT_GROUP,
              log_dir=DEMO_OUT / "logs", assume_yes=True)
    print(f"\nAfter: '{sample['title']}' now has:")
    for t in pretend.describe(sample["song_id"]):
        print(f"   - {t}")
    print("\nIts other tags were kept and the score tag was added.")
    pause()

    heading("Running it a second time")
    print("Sending again is safe. Songs that are already correct are skipped:\n")
    good = cmd_check(filled, quiet=True)[1]
    scale = resolve_scale(pretend, DEFAULT_GROUP)
    counts = send(pretend, good, scale, DEMO_OUT / "logs" / f"sent_again_{stamp()}.csv")
    report(counts, DEMO_OUT / "logs")
    print("\nPractice run complete. The files it made are in:")
    print(f"   {DEMO_OUT}")


# ======================================================================
# Other commands
# ======================================================================

def cmd_discover():
    pc, _ = connect()
    for g in pc.tag_groups():
        print(f"[{g['id']}] {g['name']}")
        for t in pc.tags_in_group(g["id"]):
            print(f"    [{t['id']}] {t['name']}")


def cmd_where():
    heading("Where your files are")
    print(f"This tool's folder:\n   {HERE}\n")
    items = [
        ("config.env", "your Planning Center key (keep private)"),
        ("scoring_sheet.csv", "the sheet you fill in with 1-5 scores"),
        ("songs_for_claude.json", "lyrics, only for letting Claude suggest scores (keep private)"),
        ("logs/", "a record of every song sent to Planning Center"),
        ("RUBRIC.md / docs/", "how to choose a score, plus a printable one-page version"),
    ]
    for name, desc in items:
        mark = "   " if (HERE / name.split(" ")[0].rstrip("/")).exists() else "(not yet) "
        print(f"   {mark}{name:<24} {desc}")


MENU = [
    ("1", "Set up / test my Planning Center connection", cmd_setup),
    ("2", "Make a scoring sheet from a Songs export", cmd_prepare),
    ("3", "Check my scoring sheet", cmd_check),
    ("4", "Send scores to Planning Center", cmd_apply),
    ("5", "Practice with sample songs (changes nothing)", cmd_demo),
    ("6", "Where are my files?", cmd_where),
]


def menu():
    while True:
        print()
        print("=" * 64)
        print("   Horizontal-Vertical Song Tagger for Planning Center")
        print("=" * 64)
        for key, label, _ in MENU:
            print(f"   {key})  {label}")
        print("   0)  Quit")
        try:
            choice = input("\nType a number and press Enter: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if choice in ("0", "q", "quit", "exit"):
            return
        action = next((fn for key, _, fn in MENU if key == choice), None)
        if not action:
            print("  Please type one of the numbers shown.")
            continue
        try:
            action()
        except UserError as e:
            print()
            warn(str(e))
        except KeyboardInterrupt:
            print("\n  Stopped.")
        pause("\nPress Enter to go back to the menu...")


def main():
    ap = argparse.ArgumentParser(
        description="Score Planning Center songs on a 1-5 Horizontal-Vertical scale.",
        epilog="Run with no arguments for the menu.")
    sub = ap.add_subparsers(dest="cmd")
    sub.add_parser("setup", help="Save and test your Planning Center key")
    p = sub.add_parser("prepare", help="Make a scoring sheet from a Songs export")
    p.add_argument("--export", help="Path to the Planning Center Songs export CSV")
    p.add_argument("--scope", help='"all" or comma-separated song tags, e.g. "List: A,List: B"')
    g = p.add_mutually_exclusive_group()
    g.add_argument("--skip-scored", dest="skip_scored", action="store_true", default=None,
                   help="Leave out songs that already have a score")
    g.add_argument("--include-scored", dest="skip_scored", action="store_false",
                   help="Include songs that already have a score")
    c = sub.add_parser("check", help="Check a filled-in scoring sheet")
    c.add_argument("--sheet", help="Path to the scoring sheet (.csv or .xlsx)")
    a = sub.add_parser("apply", help="Send scores to Planning Center")
    a.add_argument("--sheet", help="Path to the scoring sheet (.csv or .xlsx)")
    m = a.add_mutually_exclusive_group()
    m.add_argument("--test", dest="mode", action="store_const", const="test",
                   help="Send 3 songs first, then ask before the rest (default)")
    m.add_argument("--all", dest="mode", action="store_const", const="all",
                   help="Send every song")
    a.add_argument("--yes", action="store_true", help="Don't ask for confirmation")
    d = sub.add_parser("demo", help="Practice with sample songs (changes nothing)")
    d.add_argument("--no-pause", action="store_true")
    sub.add_parser("discover", help="List every song tag group and tag")
    args = ap.parse_args()

    try:
        if args.cmd is None:
            menu()
        elif args.cmd == "setup":
            cmd_setup()
        elif args.cmd == "prepare":
            cmd_prepare(export=args.export, scope=args.scope, skip_scored=args.skip_scored)
        elif args.cmd == "check":
            cmd_check(args.sheet)
        elif args.cmd == "apply":
            cmd_apply(args.sheet, mode=args.mode, assume_yes=args.yes)
        elif args.cmd == "demo":
            cmd_demo(no_pause=args.no_pause)
        elif args.cmd == "discover":
            cmd_discover()
    except UserError as e:
        print()
        warn(str(e))
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n  Stopped.")
        sys.exit(130)


if __name__ == "__main__":
    main()
