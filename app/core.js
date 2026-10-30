/* Horizontal-Vertical Tagger: the logic, with no page code.
   This mirrors hv_tagger.py so both versions behave the same.
   Runs in the browser (as window.HV) and in Node (for tests). */
(function (root) {
  "use strict";

  var API_BASE = "https://api.planningcenteronline.com/services/v2";
  var DEFAULT_GROUP = "Horizontal Vertical Scale";
  var SCORE_NAMES = { 1: "Horizontal", 2: "Mostly Horizontal", 3: "Blend",
                      4: "Mostly Vertical", 5: "Vertical" };
  var SHEET_FIELDS = ["song_id", "title", "tags", "current_score", "score", "confidence", "notes"];
  var LOW_CONFIDENCE = ["low", "?", "unsure", "check"];

  function UserError(message) {
    var e = new Error(message);
    e.name = "UserError";
    return e;
  }

  function NotFound(path) {
    var e = UserError("Not found: " + path);
    e.notFound = true;
    return e;
  }

  // ====================================================================
  // Reading files
  // ====================================================================

  /** Bytes to text: UTF-8 if it's valid, otherwise Windows-1252 (older Excel). */
  function decodeBytes(buffer) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch (e) {
      return new TextDecoder("windows-1252").decode(buffer);
    }
  }

  /** RFC 4180 CSV, including quoted fields with line breaks (chord charts). */
  function parseCsvRows(text, delimiter) {
    var rows = [], row = [], field = "", i = 0, quoted = false, n = text.length;
    while (i < n) {
      var ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          quoted = false; i++; continue;
        }
        field += ch; i++; continue;
      }
      if (ch === '"' && field === "") { quoted = true; i++; continue; }
      if (ch === delimiter) { row.push(field); field = ""; i++; continue; }
      if (ch === "\r" || ch === "\n") {
        row.push(field); rows.push(row); row = []; field = "";
        i += (ch === "\r" && text[i + 1] === "\n") ? 2 : 1;
        continue;
      }
      field += ch; i++;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /** A CSV file's text to a list of {column: value} objects, like Python's DictReader. */
  function readTable(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    var firstLine = text.split("\n", 1)[0];
    var delimiter = [",", ";", "\t"].reduce(function (best, d) {
      return firstLine.split(d).length > firstLine.split(best).length ? d : best;
    }, ",");
    var grid = parseCsvRows(text, delimiter).filter(function (r) {
      return !(r.length === 1 && r[0] === "");
    });
    if (!grid.length) return [];
    var header = grid[0].map(function (h) { return h.trim(); });
    return grid.slice(1).map(function (r) {
      var obj = {};
      header.forEach(function (h, i) { obj[h] = r[i] === undefined ? "" : r[i]; });
      return obj;
    });
  }

  /** Case-insensitive column lookup. Returns null if the column is missing. */
  function field(row) {
    var keys = Object.keys(row);
    for (var a = 1; a < arguments.length; a++) {
      var want = arguments[a].toLowerCase();
      for (var k = 0; k < keys.length; k++) {
        if (keys[k].toLowerCase() === want) return row[keys[k]];
      }
    }
    return null;
  }

  function normId(value) {
    var s = String(value == null ? "" : value).trim();
    if (/^\d+\.0+$/.test(s)) s = s.split(".")[0];
    else if (/^\d+(\.\d+)?[eE]\+?\d+$/.test(s)) s = BigInt(Math.trunc(Number(s))).toString();
    return s;
  }

  function rowId(row) {
    return normId(field(row, "Id", "ID", "song_id", "Song ID"));
  }

  function songTagsOf(row) {
    var tags = [];
    Object.keys(row).forEach(function (k) {
      var v = row[k];
      if (/^song tag \d+$/.test(k.trim().toLowerCase()) && v && v.trim()) tags.push(v.trim());
    });
    return tags;
  }

  // ====================================================================
  // Lyrics from chord charts (only for the optional file Claude reads)
  // ====================================================================

  var SECTION_RE = new RegExp(
    "^\\s*(intro|outro|verse|chorus|pre[- ]?chorus|bridge|tag|refrain|interlude|vamp|" +
    "coda|ending|instrumental|turnaround|breakdown|hook|misc|v\\d+|c\\d+|b\\d+)\\b.*$", "i");
  var BRACKET_CHORD_RE = /\[[^\]]*\]/g;
  var CHORD_RE = /^[A-G][#b]?(maj|min|m|sus|add|aug|dim)?\d*(\([^)]*\))?(\/[A-G][#b]?)?$/;
  var REPEATS = ["x2", "x3", "x4", "2x", "3x", "4x"];

  function stripChars(s, chars) {
    var a = 0, b = s.length;
    while (a < b && chars.indexOf(s[a]) >= 0) a++;
    while (b > a && chars.indexOf(s[b - 1]) >= 0) b--;
    return s.slice(a, b);
  }

  function chordOnly(line) {
    var tokens = line.replace(BRACKET_CHORD_RE, " ").trim().split(/\s+/).filter(Boolean);
    for (var i = 0; i < tokens.length; i++) {
      var t = stripChars(tokens[i], ",.|()");
      if (t && REPEATS.indexOf(t.toLowerCase()) < 0 && !CHORD_RE.test(t)) return false;
    }
    return true;
  }

  function lyricsFromChart(chart) {
    if (!chart) return "";
    var kept = [], blank = true;
    chart.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").forEach(function (line) {
      if (!line.trim()) {
        if (!blank) kept.push("");
        blank = true;
        return;
      }
      if (SECTION_RE.test(line.trim().replace(/:+$/, "")) || chordOnly(line)) return;
      var text = line.replace(BRACKET_CHORD_RE, "").replace(/\s+$/, "");
      if (text.trim()) {
        kept.push(text);
        blank = false;
      }
    });
    return kept.join("\n").trim();
  }

  function bestLyrics(row) {
    var numbers = [];
    Object.keys(row).forEach(function (k) {
      var m = /^arrangement (\d+) chord chart$/.exec(k.trim().toLowerCase());
      if (m && numbers.indexOf(+m[1]) < 0) numbers.push(+m[1]);
    });
    numbers.sort(function (a, b) { return a - b; });
    for (var i = 0; i < numbers.length; i++) {
      var lyr = lyricsFromChart(field(row, "Arrangement " + numbers[i] + " Chord Chart") || "");
      if (lyr) return lyr;
    }
    return "";
  }

  // ====================================================================
  // Songs export -> songs to score
  // ====================================================================

  /** Read a Planning Center Songs export. Returns {songs, tagOptions}. */
  function loadExport(rows, groupName) {
    if (!rows.length || field(rows[0], "Id") === null || field(rows[0], "Title") === null) {
      throw UserError("This file doesn't look like a Planning Center Songs export (it has no " +
                      "Id and Title columns). Export the song list from Planning Center Services " +
                      "as CSV and try again.");
    }
    return buildSongs(rows.map(function (r) {
      return { song_id: rowId(r), title: (field(r, "Title") || "").trim(), tags: songTagsOf(r), row: r };
    }), groupName);
  }

  /** entries: [{song_id, title, tags: ["Group: Tag", ...], row}]. Splits out the current score. */
  function buildSongs(entries, groupName) {
    var prefix = (groupName || DEFAULT_GROUP).toLowerCase() + ":";
    var counts = {};
    var songs = entries.map(function (e) {
      var current = "", others = [];
      e.tags.forEach(function (t) {
        if (t.toLowerCase().indexOf(prefix) === 0) {
          var m = /:\s*([1-5])/.exec(t);
          if (m && !current) current = m[1];
        } else {
          others.push(t);
          counts[t] = (counts[t] || 0) + 1;
        }
      });
      return { song_id: e.song_id, title: e.title, tags: others, current_score: current, row: e.row || null };
    });
    var tagOptions = Object.keys(counts).sort(function (a, b) {
      a = a.toLowerCase(); b = b.toLowerCase();
      return a < b ? -1 : a > b ? 1 : 0;
    }).map(function (t) { return { tag: t, count: counts[t] }; });
    return { songs: songs, tagOptions: tagOptions };
  }

  /** chosenTags: null for all songs, or a list of tags. */
  function selectSongs(songs, chosenTags, skipScored) {
    var chosen = chosenTags && chosenTags.length
      ? chosenTags.map(function (t) { return t.toLowerCase(); }) : null;
    return songs.filter(function (s) {
      if (skipScored && s.current_score) return false;
      return !chosen || s.tags.some(function (t) { return chosen.indexOf(t.toLowerCase()) >= 0; });
    }).sort(function (a, b) {
      var x = a.title.toLowerCase(), y = b.title.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }

  // ====================================================================
  // Files to download
  // ====================================================================

  /** Stop Excel from running a song title like '=HYPERLINK(...)' as a formula. */
  function safeCell(value) {
    var s = String(value == null ? "" : value);
    return s && "=+-@\t\r".indexOf(s[0]) >= 0 ? "'" + s : s;
  }

  function csvCell(value) {
    var s = String(value == null ? "" : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rows) {
    return "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n") + "\r\n";
  }

  function scoringSheetCsv(songs, scores) {
    var rows = [SHEET_FIELDS];
    songs.forEach(function (s) {
      var sc = (scores && scores[s.song_id]) || {};
      rows.push([s.song_id, safeCell(s.title), safeCell(s.tags.join("; ")), s.current_score,
                 sc.score || "", sc.confidence || "", safeCell(sc.notes || "")]);
    });
    return toCsv(rows);
  }

  function songsForClaudeJson(songs, lyricsById) {
    var list = songs.map(function (s) {
      var lyr = lyricsById ? lyricsById[s.song_id] || "" : bestLyrics(s.row);
      return { song_id: s.song_id, title: s.title, has_lyrics: !!lyr, lyrics: lyr };
    });
    return JSON.stringify({
      about: "Lyrics for scoring on the Horizontal-Vertical scale. Contains copyrighted " +
             "lyrics: keep private, never post or share.",
      count: list.length, songs: list }, null, 2);
  }

  function logCsv(log) {
    var rows = [["time", "song_id", "title", "score", "result", "detail"]];
    log.forEach(function (e) {
      rows.push([e.time, e.song_id, safeCell(e.title), e.score, e.result, safeCell(e.detail)]);
    });
    return toCsv(rows);
  }

  // ====================================================================
  // A filled-in scoring sheet (from Claude, or one made earlier)
  // ====================================================================

  var SCORE_RE = /^([1-5])(?:\.0+)?(?:\s*[-:]?\s*[A-Za-z].*)?$/;

  function checkSheet(rows) {
    if (!rows.length) throw UserError("That scoring sheet is empty.");
    if (field(rows[0], "song_id") === null || field(rows[0], "score") === null) {
      throw UserError("That file is missing the 'song_id' or 'score' column. Please don't " +
                      "rename or delete the columns in the scoring sheet.");
    }
    var good = [], blank = [], bad = [], seen = {};
    rows.forEach(function (r, idx) {
      var line = idx + 2;
      var sid = normId(field(r, "song_id"));
      var title = (field(r, "title") || "").trim();
      var value = String(field(r, "score") || "").trim();
      if (!sid && !title && !value) return;
      if (!sid) { bad.push("row " + line + ": '" + title + "' has no song_id"); return; }
      if (!/^\d+$/.test(sid)) {
        bad.push("row " + line + ": '" + title + "' has song_id '" + sid + "' (it should be only digits)");
        return;
      }
      if (!value) { blank.push(title || sid); return; }
      var m = SCORE_RE.exec(value);
      if (!m) { bad.push("row " + line + ": '" + title + "' has score '" + value + "' (use 1, 2, 3, 4 or 5)"); return; }
      if (seen[sid]) { bad.push("row " + line + ": '" + title + "' is listed twice (also row " + seen[sid] + ")"); return; }
      seen[sid] = line;
      var confidence = String(field(r, "confidence") || "").trim();
      good.push({ song_id: sid, title: title, score: +m[1],
                  flagged: LOW_CONFIDENCE.indexOf(confidence.toLowerCase()) >= 0,
                  confidence: confidence, notes: String(field(r, "notes") || "").trim() });
    });
    return { good: good, blank: blank, bad: bad };
  }

  // ====================================================================
  // Planning Center
  // ====================================================================

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** Talks to the real Planning Center Services API, straight from this browser. */
  /** appId and secret may be null when fetchImpl signs the requests itself (the desktop app). */
  function PlanningCenter(appId, secret, fetchImpl) {
    this.fetch = fetchImpl || root.fetch.bind(root);
    this.inBrowser = !fetchImpl;
    this.isPretend = false;
    this.auth = null;
    if (appId === null) return;
    var token;
    try {
      token = btoa(appId.trim() + ":" + secret.trim());
    } catch (e) {
      throw UserError("The Client ID or Secret has characters that don't belong in a key. " +
                      "Copy them from Planning Center again.");
    }
    this.auth = "Basic " + token;
  }

  PlanningCenter.prototype.request = async function (method, path, params, body) {
    var url = API_BASE + path;
    if (params) url += "?" + new URLSearchParams(params).toString();
    var opts = {
      method: method,
      headers: this.auth ? { Authorization: this.auth } : {},
      redirect: "error",          // never follow a redirect with the key attached
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store"
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
      opts.headers["Content-Type"] = "application/json";
    }
    for (var attempt = 0; attempt < 6; attempt++) {
      var resp;
      try {
        resp = await this.fetch(url, opts);
      } catch (e) {
        if (attempt < 2) { await sleep(2000); continue; }
        // In a browser, a wrong key comes back without the header browsers need, so it looks like this too.
        throw UserError(this.inBrowser
          ? "Planning Center didn't answer. Usually that means the Client ID or Secret is " +
            "wrong, so check those first. If they're right, check your internet connection and try again."
          : "I couldn't reach Planning Center. Check your internet connection and try again.");
      }
      if (resp.status === 429) {
        await sleep((parseInt(resp.headers.get("Retry-After"), 10) || 5) * 1000);
        continue;
      }
      if (resp.status >= 500) { await sleep(3000 * (attempt + 1)); continue; }
      if (resp.status === 401) {
        throw UserError("Planning Center did not accept your key. Check the Client ID " +
                        "and Secret and connect again.");
      }
      if (resp.status === 403) {
        throw UserError("Your Planning Center login doesn't have permission to do this. The key " +
                        "must belong to someone who can edit songs in Services.");
      }
      if (resp.status === 404) throw NotFound(path);
      if (!resp.ok) {
        var detail = (await resp.text()).slice(0, 300);
        throw UserError("Planning Center returned an error (" + resp.status + "): " + detail);
      }
      var text = await resp.text();
      return text ? JSON.parse(text) : {};
    }
    throw UserError("Planning Center is busy right now. Wait a few minutes and try again.");
  };

  PlanningCenter.prototype.allPages = async function (path) {
    var items = [], offset = 0;
    for (;;) {
      var page = await this.request("GET", path, { per_page: 100, offset: offset });
      var data = page.data || [];
      items = items.concat(data);
      if (data.length < 100) return items;
      offset += 100;
    }
  };

  PlanningCenter.prototype.tagGroups = async function () {
    return (await this.allPages("/tag_groups")).filter(function (g) {
      var forWhat = (g.attributes || {}).tags_for;
      return !forWhat || forWhat === "song";  // skip arrangement and other tag groups
    }).map(function (g) {
      return { id: g.id, name: ((g.attributes || {}).name || "").trim() };
    });
  };

  /** Every song: [{id, title, hidden, tagIds}]. tagIds is null when Planning Center
      didn't include them, and loadSongs fetches those one song at a time. */
  PlanningCenter.prototype.songs = async function (onProgress) {
    var out = [], offset = 0, include = true;
    for (;;) {
      var page;
      try {
        page = await this.request("GET", "/songs", include
          ? { per_page: 100, offset: offset, include: "tags", order: "title" }
          : { per_page: 100, offset: offset, order: "title" });
      } catch (e) {
        if (!include || /did not accept|permission|didn't answer|couldn't reach|busy/.test(e.message)) throw e;
        include = false;  // this account's API doesn't take include=tags; ask without it
        continue;
      }
      (page.data || []).forEach(function (s) {
        var a = s.attributes || {}, rel = ((s.relationships || {}).tags || {}).data;
        out.push({ id: String(s.id), title: (a.title || "").trim(), hidden: !!a.hidden,
                   tagIds: include && Array.isArray(rel) ? rel.map(function (t) { return String(t.id); }) : null });
      });
      if (onProgress) onProgress(out.length, (page.meta || {}).total_count);
      if ((page.data || []).length < 100) return out;
      offset += 100;
    }
  };

  /** Lyrics from a song's first arrangement that has any. Only used for the file Claude reads. */
  PlanningCenter.prototype.songLyrics = async function (songId) {
    var arrangements = await this.allPages("/songs/" + songId + "/arrangements");
    for (var i = 0; i < arrangements.length; i++) {
      var a = arrangements[i].attributes || {};
      var lyr = lyricsFromChart(a.lyrics || "") || lyricsFromChart(a.chord_chart || "");
      if (lyr) return lyr;
    }
    return "";
  };

  PlanningCenter.prototype.tagsInGroup = async function (groupId) {
    return (await this.allPages("/tag_groups/" + encodeURIComponent(groupId) + "/tags")).map(function (t) {
      return { id: t.id, name: ((t.attributes || {}).name || "").trim() };
    });
  };

  PlanningCenter.prototype.songTagIds = async function (songId) {
    return (await this.allPages("/songs/" + songId + "/tags")).map(function (t) { return t.id; });
  };

  PlanningCenter.prototype.setSongTags = async function (songId, tagIds) {
    // Planning Center REPLACES a song's whole tag list with this call,
    // so callers must always send the song's other tags too.
    await this.request("POST", "/songs/" + songId + "/assign_tags", undefined, {
      data: { type: "TagAssignment", attributes: {},
              relationships: { tags: { data: tagIds.map(function (t) {
                return { type: "Tag", id: String(t) }; }) } } } });
    await sleep(150);  // be polite to the API
  };

  /** Stands in for Planning Center during practice. Nothing leaves this page. */
  function PretendPlanningCenter(exportRows) {
    this.isPretend = true;
    this.groups = {};    // group_id -> {name, tags: {tag_id: name}}
    this.songTags = {};  // song_id -> [tag_id, ...]
    this.next = 9000;
    this.rows = exportRows;
    for (var n = 1; n <= 5; n++) this.tagId(DEFAULT_GROUP, n + " - " + SCORE_NAMES[n]);
    var self = this;
    exportRows.forEach(function (row) {
      self.songTags[rowId(row)] = songTagsOf(row).map(function (tag) {
        var i = tag.indexOf(":"), name = i < 0 ? "" : tag.slice(i + 1);
        return name ? self.tagId(tag.slice(0, i).trim(), name.trim()) : self.tagId("Other", tag);
      });
    });
  }

  PretendPlanningCenter.prototype.tagId = function (groupName, tagName) {
    var gid = Object.keys(this.groups).find(function (g) { return this.groups[g].name === groupName; }, this);
    if (!gid) { gid = String(++this.next); this.groups[gid] = { name: groupName, tags: {} }; }
    var tags = this.groups[gid].tags;
    var tid = Object.keys(tags).find(function (t) { return tags[t] === tagName; });
    if (!tid) { tid = String(++this.next); tags[tid] = tagName; }
    return tid;
  };

  PretendPlanningCenter.prototype.tagGroups = async function () {
    var g = this.groups;
    return Object.keys(g).map(function (id) { return { id: id, name: g[id].name }; });
  };

  PretendPlanningCenter.prototype.tagsInGroup = async function (groupId) {
    var tags = this.groups[groupId].tags;
    return Object.keys(tags).map(function (id) { return { id: id, name: tags[id] }; });
  };

  PretendPlanningCenter.prototype.songTagIds = async function (songId) {
    if (!this.songTags[songId]) throw NotFound(songId);
    await sleep(120);  // so the progress is visible in practice
    return this.songTags[songId].slice();
  };

  PretendPlanningCenter.prototype.setSongTags = async function (songId, tagIds) {
    this.songTags[songId] = tagIds.slice();
  };

  PretendPlanningCenter.prototype.songs = async function (onProgress) {
    var self = this;
    await sleep(400);
    var list = this.rows.map(function (r) {
      var id = rowId(r);
      return { id: id, title: (field(r, "Title") || "").trim(), hidden: false, tagIds: self.songTags[id].slice() };
    });
    if (onProgress) onProgress(list.length, list.length);
    return list;
  };

  PretendPlanningCenter.prototype.songLyrics = async function (songId) {
    var row = this.rows.find(function (r) { return rowId(r) === songId; });
    return row ? bestLyrics(row) : "";
  };

  PretendPlanningCenter.prototype.describe = function (songId) {
    var names = {}, g = this.groups;
    Object.keys(g).forEach(function (gid) {
      Object.keys(g[gid].tags).forEach(function (tid) { names[tid] = g[gid].name + ": " + g[gid].tags[tid]; });
    });
    return (this.songTags[songId] || []).map(function (t) { return names[t]; });
  };

  /** Returns {1: tag, ... 5: tag} for the scale group, or throws a plain-language error. */
  async function resolveScale(pc, groupName) {
    var groups = await pc.tagGroups();
    var group = groups.find(function (g) { return g.name.toLowerCase() === groupName.toLowerCase(); });
    if (!group) {
      throw UserError("I couldn't find a tag group named '" + groupName + "' in Planning Center. " +
                      "Create it (Admin Guide, Step 3), then connect again.");
    }
    var tags = await pc.tagsInGroup(group.id), scale = {};
    tags.forEach(function (t) {
      var m = /^\s*([1-5])(?!\d)/.exec(t.name);
      if (m && !scale[+m[1]]) scale[+m[1]] = t;
    });
    var missing = [1, 2, 3, 4, 5].filter(function (n) { return !scale[n]; });
    if (missing.length) {
      var found = tags.map(function (t) { return t.name; }).join(", ") || "no tags yet";
      throw UserError("The '" + group.name + "' group needs 5 tags whose names start with the " +
                      "numbers 1 through 5. Missing: " + missing.join(", ") + ". Found: " + found + ".");
    }
    return scale;
  }

  /** {1: tag, ... 5: tag} if the group has a tag starting with each number, otherwise null. */
  function scaleOf(group) {
    var scale = {};
    group.tags.forEach(function (t) {
      var m = /^\s*([1-5])(?!\d)/.exec(t.name);
      if (m && !scale[+m[1]]) scale[+m[1]] = t;
    });
    return [1, 2, 3, 4, 5].every(function (n) { return scale[n]; }) ? scale : null;
  }

  /** All song tag groups, each with its tags. */
  async function readTagGroups(pc) {
    var groups = await pc.tagGroups();
    for (var i = 0; i < groups.length; i++) groups[i].tags = await pc.tagsInGroup(groups[i].id);
    return groups;
  }

  /** Finds the 1-5 score group. Picks one only when it's clearly right:
      {group, scale} when found; otherwise {candidates} to choose from, and
      {incomplete} for groups that look right but don't have all five tags yet. */
  function detectScale(groups, preferredName) {
    var lower = function (s) { return (s || "").toLowerCase(); };
    var looksRight = function (g) { return /horizontal|vertical|\bh\s*[-\/↔]?\s*v\b/i.test(g.name); };
    var complete = groups.filter(scaleOf);
    var pick = complete.find(function (g) { return lower(g.name) === lower(preferredName); }) ||
               complete.find(function (g) { return lower(g.name) === lower(DEFAULT_GROUP); });
    var named = complete.filter(looksRight);
    if (!pick && named.length === 1) pick = named[0];
    return {
      group: pick || null,
      scale: pick ? scaleOf(pick) : null,
      candidates: pick ? [] : complete,
      incomplete: groups.filter(function (g) { return looksRight(g) && !scaleOf(g); })
    };
  }

  /** Songs straight from Planning Center, shaped like loadExport's. Archived songs are left out. */
  async function loadSongs(pc, groups, scaleGroupName, onProgress) {
    var names = {};
    groups.forEach(function (g) { g.tags.forEach(function (t) { names[t.id] = g.name + ": " + t.name; }); });
    var list = (await pc.songs(onProgress)).filter(function (s) { return !s.hidden; });
    var missing = list.filter(function (s) { return !s.tagIds; });
    for (var i = 0; i < missing.length; i++) {
      missing[i].tagIds = await pc.songTagIds(missing[i].id);
      if (onProgress) onProgress(i + 1, missing.length, "tags");
    }
    return buildSongs(list.map(function (s) {
      return { song_id: s.id, title: s.title,
               tags: s.tagIds.map(function (id) { return names[id]; }).filter(Boolean) };
    }), scaleGroupName);
  }

  /** {song_id: lyrics} for the file Claude reads. Export rows already have them. */
  async function gatherLyrics(pc, songs, onProgress) {
    var out = {};
    for (var i = 0; i < songs.length; i++) {
      var s = songs[i];
      out[s.song_id] = s.row ? bestLyrics(s.row) : await pc.songLyrics(s.song_id);
      if (onProgress) onProgress(i + 1, songs.length);
    }
    return out;
  }

  /** One low score, one high score, and one in the middle when possible. */
  function pickTestSongs(songs) {
    var ordered = songs.slice().sort(function (a, b) { return a.score - b.score; });
    var lo = ordered[0], hi = ordered[ordered.length - 1];
    var middle = ordered.filter(function (s) { return s.score !== lo.score && s.score !== hi.score; });
    var picks = [lo, hi, middle.length ? middle[Math.floor(middle.length / 2)]
                                       : ordered[Math.floor(ordered.length / 2)]];
    var unique = [];
    picks.forEach(function (s) {
      if (!unique.some(function (u) { return u.song_id === s.song_id; })) unique.push(s);
    });
    return unique;
  }

  /** Set each song's score tag, keeping its other tags. Calls onResult after every song.
      Stops at the first problem Planning Center reports (other than a missing song). */
  async function send(pc, songs, scale, onResult, shouldStop) {
    var scaleIds = Object.keys(scale).map(function (n) { return scale[n].id; });
    var counts = {};
    for (var i = 0; i < songs.length; i++) {
      if (shouldStop && shouldStop()) break;
      var s = songs[i], target = scale[s.score].id, result, detail = "";
      if (!/^\d+$/.test(s.song_id)) {
        counts.skipped = (counts.skipped || 0) + 1;
        onResult(s, "skipped", "song_id should be only digits", i);
        continue;
      }
      try {
        var current = await pc.songTagIds(s.song_id);
        var others = current.filter(function (t) { return scaleIds.indexOf(t) < 0; });
        if (current.indexOf(target) >= 0 && current.length - others.length === 1) {
          result = "already set";
        } else {
          await pc.setSongTags(s.song_id, others.concat([target]));
          result = "updated";
          detail = "kept " + others.length + " other tag(s)";
        }
      } catch (e) {
        if (!e.notFound) {
          onResult(s, "stopped", e.message, i);
          throw e;
        }
        result = "not found";
        detail = "This song isn't in Planning Center (deleted or merged?)";
      }
      counts[result] = (counts[result] || 0) + 1;
      onResult(s, result, detail, i);
    }
    return counts;
  }

  root.HV = {
    API_BASE: API_BASE, DEFAULT_GROUP: DEFAULT_GROUP, SCORE_NAMES: SCORE_NAMES,
    UserError: UserError, decodeBytes: decodeBytes, readTable: readTable, field: field,
    normId: normId, rowId: rowId, songTagsOf: songTagsOf, lyricsFromChart: lyricsFromChart,
    bestLyrics: bestLyrics, loadExport: loadExport, selectSongs: selectSongs, safeCell: safeCell,
    scoringSheetCsv: scoringSheetCsv, songsForClaudeJson: songsForClaudeJson, logCsv: logCsv,
    checkSheet: checkSheet, PlanningCenter: PlanningCenter,
    PretendPlanningCenter: PretendPlanningCenter, resolveScale: resolveScale,
    scaleOf: scaleOf, readTagGroups: readTagGroups, detectScale: detectScale,
    loadSongs: loadSongs, gatherLyrics: gatherLyrics,
    pickTestSongs: pickTestSongs, send: send
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.HV;
})(typeof window !== "undefined" ? window : globalThis);
