/* Horizontal-Vertical Tagger: the page. The logic lives in core.js.
   Every song title and tag is shown with textContent, never as HTML. */
(function () {
  "use strict";
  var HV = window.HV;
  var $ = function (id) { return document.getElementById(id); };

  // Inside the desktop app (desktop/), Planning Center requests, saving files, and
  // opening links go through the app's native side instead of the browser.
  var desktop = window.__TAURI__ && window.__TAURI__.core;
  var SITE = "https://3cordguy.github.io/planning-center-hv-tagger/";
  var REPO = "https://github.com/3CordGuy/planning-center-hv-tagger/";

  var state = {
    pc: null, practice: false, scale: null, groups: [],
    groupName: HV.DEFAULT_GROUP,
    songs: [], tagOptions: [], selected: [],
    scores: {},          // song_id -> {score, flagged, confidence, notes}
    mode: "self", view: "all", query: "",
    log: [], totals: {}, results: {}, sending: false,
    savedKey: false      // the desktop app has a key in the Keychain / Credential Manager
  };

  /** Looks enough like fetch() for core.js, but the request is made by the app. */
  async function nativeFetch(url, opts) {
    var r = await desktop.invoke("pco_request", { method: opts.method, url: url, body: opts.body || null });
    return { status: r.status, ok: r.status >= 200 && r.status < 300,
             headers: { get: function (h) { return h.toLowerCase() === "retry-after" ? r.retry_after : null; } },
             text: async function () { return r.body; } };
  }

  // ==================================================================
  // Small helpers
  // ==================================================================

  function el(tag, props, children) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "text") e.textContent = props[k];
      else if (k === "className") e.className = props[k];
      else if (k.indexOf("data-") === 0 || k.indexOf("aria-") === 0) e.setAttribute(k, props[k]);
      else e[k] = props[k];
    });
    (children || []).forEach(function (c) {
      if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  }

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function store(key, value) {
    if (state.practice) return;  // practice runs leave nothing behind
    try { localStorage.setItem("hv." + key, JSON.stringify(value)); } catch (e) { /* private window */ }
  }

  function recall(key, fallback) {
    try {
      var v = localStorage.getItem("hv." + key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }

  function showError(message) {
    var box = $("error");
    box.textContent = message;
    box.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearError() { $("error").hidden = true; }

  function status(id, kind, content) {
    var box = $(id);
    box.className = "status" + (kind ? " " + kind : "");
    box.textContent = "";
    (Array.isArray(content) ? content : [content]).forEach(function (c) {
      box.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    box.hidden = false;
  }

  /** Saves a file: a Save dialog in the app, a download in a browser.
      Resolves to false only if the person cancelled the dialog. */
  async function download(name, text, type) {
    if (desktop) return (await desktop.invoke("save_file", { name: name, contents: text })) !== null;
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = el("a", { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    return true;
  }

  async function readFile(file) {
    if (!/\.csv$/i.test(file.name)) {
      throw HV.UserError(/\.(xlsx|xls|numbers)$/i.test(file.name)
        ? "Please save that file as CSV first (in Excel: File > Save As > CSV UTF-8; in Numbers: " +
          "File > Export To > CSV), then choose the .csv file."
        : "Please choose a .csv file.");
    }
    return HV.readTable(HV.decodeBytes(await file.arrayBuffer()));
  }

  function guard(fn) {
    return async function () {
      clearError();
      try {
        await fn.apply(this, arguments);
      } catch (e) {
        showError(e.name === "UserError" ? e.message : "Something went wrong: " + (e.message || e));
        if (e.name !== "UserError") console.error(e);
      }
    };
  }

  /** In the app, help links open in the default browser and the wording says "app". */
  function setUpDesktop() {
    document.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href");
      if (/\.md$/.test(href)) a.href = REPO + "blob/main/" + href.replace(/^\.\.\//, "");
      else if (href.indexOf("../") === 0) a.href = SITE + href.slice(3);
    });
    document.addEventListener("click", function (e) {
      var a = e.target.closest("a[href^='https://']");
      if (!a) return;
      e.preventDefault();
      desktop.invoke("open_url", { url: a.href }).catch(function (err) { showError(String(err)); });
    });
    $("key-where").textContent = "It's sent only to Planning Center, straight from this app. Nothing else can see it.";
    var store = /Windows/.test(navigator.userAgent) ? "Windows Credential Manager" : "your Mac's Keychain";
    $("key-store").textContent = store;
    $("remember-line").hidden = false;
    $("key-forget").textContent = "If you tick “Remember”, it's kept in " + store + ", which only you can open. " +
      "Otherwise quitting the app forgets it.";
    $("foot-text").textContent = "Open source under the MIT License. Runs entirely on your computer: no account, no server, no tracking.";
  }

  /** On GitHub Pages, point the doc links at the repo (Pages serves .md as plain text). */
  function linkDocs() {
    var host = location.hostname;
    if (!/\.github\.io$/i.test(host)) return;
    var repo = host.split(".")[0] + "/" + (location.pathname.split("/").filter(Boolean)[0] || host);
    document.querySelectorAll('a[href$=".md"]').forEach(function (a) {
      a.href = "https://github.com/" + repo + "/blob/main/" + a.getAttribute("href").replace(/^\.\.\//, "");
    });
  }

  /** Each how-to picture or video shows only once it has loaded. */
  function showMediaWhenLoaded() {
    document.querySelectorAll("figure.media").forEach(function (fig) {
      var img = fig.querySelector("img"), video = fig.querySelector("video");
      var reveal = function () { fig.hidden = false; };
      if (img) {
        img.addEventListener("load", reveal);
        if (img.complete && img.naturalWidth) reveal();
      }
      if (video) {
        video.addEventListener("loadedmetadata", reveal);
        if (video.readyState >= 1) reveal();  // already loaded before this script ran
      }
    });
  }

  // ==================================================================
  // Steps
  // ==================================================================

  function show(step) {
    [1, 2, 3, 4].forEach(function (n) { $("step" + n).hidden = n !== step; });
    document.querySelectorAll("#stepper li").forEach(function (li) {
      var n = +li.getAttribute("data-step");
      li.className = n === step ? "current" : n < step ? "done" : "";
      if (n === step) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  }

  // ---------------------------------------------------------------- 1
  async function connect() {
    var clientId = $("client-id").value, secret = $("secret").value;
    if (!clientId.trim() || !secret.trim()) throw HV.UserError("Paste both the Client ID and the Secret.");
    $("connect-btn").disabled = true;
    $("group-picker").hidden = true;
    status("connect-status", "", "Connecting to Planning Center…");
    try {
      var pc;
      if (desktop) {
        await desktop.invoke("set_key", { clientId: clientId, secret: secret });  // the app signs requests
        pc = new HV.PlanningCenter(null, null, nativeFetch);
      } else {
        pc = new HV.PlanningCenter(clientId, secret);
      }
      var groups = await HV.readTagGroups(pc);
      state.pc = pc;
      $("secret").value = "";
      if (desktop && $("remember-key").checked) {
        try {
          await desktop.invoke("remember_key");
          setSavedKey(true);
        } catch (err) {
          showError("Connected, but the key couldn't be saved on this computer (" + err + "). " +
                    "You'll need to paste it again next time.");
        }
      }
      chooseScaleGroup(groups);
    } catch (e) {
      $("connect-status").hidden = true;
      throw e;
    } finally {
      $("connect-btn").disabled = false;
    }
  }

  function setSavedKey(on) {
    state.savedKey = on;
    $("forget-key").hidden = !on;
  }

  /** At startup in the app: reconnect with a remembered key, if there is one. */
  async function connectWithSavedKey() {
    var saved = false;
    try { saved = await desktop.invoke("use_saved_key"); } catch (e) { /* Keychain declined; paste instead */ }
    if (!saved) return;
    setSavedKey(true);
    $("connect-form").hidden = true;
    $("connect-howto").hidden = true;
    status("connect-status", "", "Connecting with the key saved on this computer…");
    try {
      var pc = new HV.PlanningCenter(null, null, nativeFetch);
      var groups = await HV.readTagGroups(pc);
      state.pc = pc;
      chooseScaleGroup(groups);
    } catch (e) {
      $("connect-status").hidden = true;
      $("connect-form").hidden = false;
      $("connect-howto").hidden = false;
      if (/did not accept/.test(e.message)) {
        await forgetKey(true);
        showError("The key saved on this computer doesn't work anymore (it may have been deleted in " +
                  "Planning Center). Create a new one and paste it below.");
      } else {
        showError(e.message);
      }
    }
  }

  /** Removes the remembered key. Without `quiet`, starts over at the Connect step. */
  async function forgetKey(quiet) {
    await desktop.invoke("forget_key");
    setSavedKey(false);
    if (!quiet) location.reload();
  }

  function chooseScaleGroup(groups) {
    state.groups = groups;
    var found = HV.detectScale(groups, recall("group", HV.DEFAULT_GROUP));
    if (found.group) return useScaleGroup(found.group);
    if (found.candidates.length) return offerGroups(found.candidates);
    showSetup(found.incomplete);
  }

  function useScaleGroup(group) {
    state.scale = HV.scaleOf(group);
    state.groupName = group.name;
    store("group", group.name);
    $("setup-view").hidden = true;
    $("connect-view").hidden = false;
    $("group-picker").hidden = true;
    status("connect-status", "ok", [el("b", { text: "Connected." }),
      " Directions go in the '" + group.name + "' tag group."]);
    setTimeout(loadSongsFromPlanningCenter, 600);
  }

  function offerGroups(groups) {
    $("connect-status").hidden = true;
    var list = $("group-list");
    list.textContent = "";
    groups.forEach(function (g) {
      var b = el("button", { type: "button", className: "btn ghost" }, [el("b", { text: g.name }),
        el("span", { text: g.tags.map(function (t) { return t.name; }).slice(0, 5).join(" · ") })]);
      b.addEventListener("click", function () { useScaleGroup(g); });
      list.appendChild(b);
    });
    $("group-picker").hidden = false;
  }

  function showSetup(incomplete) {
    $("connect-view").hidden = true;
    $("setup-view").hidden = false;
    var note = $("setup-incomplete");
    note.hidden = !incomplete.length;
    if (incomplete.length) {
      var g = incomplete[0];
      var have = g.tags.map(function (t) { var m = /^\s*([1-5])(?!\d)/.exec(t.name); return m && +m[1]; });
      var missing = [1, 2, 3, 4, 5].filter(function (n) { return have.indexOf(n) < 0; });
      status("setup-incomplete", "warn", ["I found the '" + g.name + "' group, but it still needs a tag " +
        "starting with " + (missing.length === 1 ? "the number " : "each of the numbers ") +
        missing.join(", ") + ". Add " + (missing.length === 1 ? "it" : "them") + " in step 2 below, then check again."]);
    }
    window.scrollTo(0, 0);
  }

  async function checkAgain() {
    $("check-again").disabled = true;
    status("check-status", "", "Checking Planning Center…");
    try {
      var groups = await HV.readTagGroups(state.pc);
      var found = HV.detectScale(groups, recall("group", HV.DEFAULT_GROUP));
      $("check-status").hidden = true;
      if (!found.group && !found.candidates.length) {
        showSetup(found.incomplete);
        status("check-status", "warn", "I still don't see a group with tags starting 1 through 5. " +
          "Planning Center can take a moment to save; wait a few seconds and check again.");
        return;
      }
      state.groups = groups;
      $("setup-view").hidden = true;
      $("connect-view").hidden = false;
      if (found.group) useScaleGroup(found.group); else offerGroups(found.candidates);
    } finally {
      $("check-again").disabled = false;
    }
  }

  async function startPractice() {
    var resp = await fetch("../examples/sample_songs_export.csv", { cache: "no-store" });
    if (!resp.ok) throw HV.UserError("The sample songs couldn't be loaded. Try reloading the page.");
    var rows = HV.readTable(await resp.text());
    state.practice = true;
    state.scores = {};
    $("practice-badge").hidden = false;
    state.pc = new HV.PretendPlanningCenter(rows);
    chooseScaleGroup(await HV.readTagGroups(state.pc));
  }

  // ---------------------------------------------------------------- 2
  async function loadSongsFromPlanningCenter() {
    show(2);
    clearError();
    $("scope").hidden = true;
    $("next-bar").hidden = true;
    $("refresh-songs").hidden = true;
    $("load-progress").hidden = false;
    $("load-bar").style.width = "5%";
    status("load-status", "", state.practice ? "Loading the sample songs…" : "Loading your songs from Planning Center…");
    try {
      var loaded = await HV.loadSongs(state.pc, state.groups, state.groupName, function (n, total, what) {
        if (total) $("load-bar").style.width = Math.max(5, Math.round((n / total) * 100)) + "%";
        $("load-status").textContent = what === "tags"
          ? "Reading song tags… " + n + " of " + total
          : "Loading your songs from Planning Center… " + n + (total ? " of " + total : "");
      });
      useSongs(loaded, state.practice ? "the 9 sample songs" : plural(loaded.songs.length, "song") + " from Planning Center", true);
    } catch (e) {
      $("load-status").hidden = true;
      $("export-alt").open = true;
      showError((e.name === "UserError" ? e.message : "Something went wrong: " + e.message) +
        " You can also use a Songs export file instead (below).");
    } finally {
      $("load-progress").hidden = true;
    }
  }

  function useSongs(loaded, label, fromPlanningCenter) {
    var keep = $("tag-all") ? chosenTags() : null;  // keep the tag choices across a refresh
    $("refresh-songs").hidden = !fromPlanningCenter;
    state.songs = loaded.songs;
    state.tagOptions = loaded.tagOptions;
    status("load-status", "ok", ["Loaded ", el("b", { text: label }), "."]);

    var box = $("tag-options");
    box.textContent = "";
    var all = el("input", { type: "checkbox", checked: true, id: "tag-all" });
    box.appendChild(el("label", { className: "check-line" }, [all, el("span", { text: "All songs" }),
      el("span", { className: "count", text: String(loaded.songs.length) })]));
    loaded.tagOptions.forEach(function (o) {
      var cb = el("input", { type: "checkbox", "data-tag": o.tag, checked: !!keep && keep.indexOf(o.tag) >= 0 });
      box.appendChild(el("label", { className: "check-line" }, [cb, el("span", { text: "Songs tagged ‘" + o.tag + "’" }),
        el("span", { className: "count", text: String(o.count) })]));
    });
    if (keep && keep.length) $("tag-all").checked = !document.querySelectorAll("#tag-options input[data-tag]:checked").length;
    $("scope").hidden = false;
    $("next-bar").hidden = false;
    updateScope();
  }

  /** The "Next" bar stays pinned while the how-to-tag choice is out of view. */
  function watchHowPanel() {
    if (!("IntersectionObserver" in window)) return;
    new IntersectionObserver(function (entries) {
      $("next-bar").classList.toggle("away", entries[0].isIntersecting);
    }, { threshold: 0.35 }).observe($("how-panel"));
  }

  function goToHowPanel() {
    var panel = $("how-panel");
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
    panel.classList.remove("pulse");
    void panel.offsetWidth;  // restart the highlight
    panel.classList.add("pulse");
  }

  function chosenTags() {
    if ($("tag-all").checked) return null;
    return Array.prototype.map.call(document.querySelectorAll("#tag-options input[data-tag]:checked"),
      function (cb) { return cb.getAttribute("data-tag"); });
  }

  function updateScope() {
    var tags = chosenTags();
    var inScope = HV.selectSongs(state.songs, tags, false);
    var scored = inScope.filter(function (s) { return s.current_score; }).length;
    $("skip-line").hidden = !scored;
    $("skip-label").textContent = "Leave out the " + plural(scored, "song") +
      " that already " + (scored === 1 ? "has" : "have") + " a direction in Planning Center";
    var n = HV.selectSongs(state.songs, tags, $("skip-scored").checked).length;
    $("scope-count").textContent = n ? plural(n, "song") + " will be on your list." : "No songs match what you picked.";
    $("how-count").textContent = n ? "For the " + plural(n, "song") + " you picked:" : "Pick at least one song first.";
    $("next-count").textContent = plural(n, "song") + " picked";
    $("to-how").disabled = !n;
    $("mode-self").disabled = $("mode-claude").disabled = !n;
  }

  function onTagChange(e) {
    var cb = e.target;
    if (cb.id === "tag-all") {
      if (cb.checked) document.querySelectorAll("#tag-options input[data-tag]").forEach(function (x) { x.checked = false; });
    } else {
      var any = document.querySelectorAll("#tag-options input[data-tag]:checked").length > 0;
      $("tag-all").checked = !any;
    }
    updateScope();
  }

  function startScoring(mode) {
    state.mode = mode;
    state.selected = HV.selectSongs(state.songs, chosenTags(), $("skip-scored").checked);
    if (!state.practice) state.scores = Object.assign(recall("scores", {}), state.scores);
    $("claude-panel").open = mode === "claude";
    $("claude-panel").querySelector("summary").textContent =
      mode === "claude" ? "Get Claude's suggestions" : "Want Claude to suggest directions instead?";
    renderSongs();
    show(3);
  }

  // ---------------------------------------------------------------- 3
  function setScore(id, patch) {
    var cur = state.scores[id] || {};
    var next = Object.assign({}, cur, patch);
    if (!next.score && !next.flagged && !next.notes) delete state.scores[id];
    else state.scores[id] = next;
    store("scores", state.scores);
  }

  function matchesView(s) {
    var sc = state.scores[s.song_id] || {};
    if (state.view === "todo" && sc.score) return false;
    if (state.view === "flagged" && !sc.flagged) return false;
    return !state.query || s.title.toLowerCase().indexOf(state.query) >= 0;
  }

  function songRow(s) {
    var sc = state.scores[s.song_id] || {};
    var metaEl = el("div", { className: "meta", text: s.tags.join(" · ") });
    if (s.current_score) {
      metaEl.appendChild(document.createTextNode(s.tags.length ? " · " : ""));
      metaEl.appendChild(el("span", { className: "was",
        text: "Now " + s.current_score + " " + HV.SCORE_NAMES[s.current_score] + " in Planning Center" }));
    }
    var title = el("div", { className: "title", text: s.title || "(no title)" });
    if (sc.flagged) title.appendChild(el("span", { className: "unsure", text: "Unsure" }));

    var picker = el("div", { className: "picker", "data-id": s.song_id });
    [1, 2, 3, 4, 5].forEach(function (n) {
      var on = sc.score === n;
      picker.appendChild(el("button", { type: "button", className: (on ? "on c" + n : ""), text: String(n),
        "data-score": String(n), "aria-pressed": String(on), "aria-label": n + " " + HV.SCORE_NAMES[n],
        title: n + " " + HV.SCORE_NAMES[n] }));
    });
    picker.appendChild(el("button", { type: "button", className: "flag" + (sc.flagged ? " on" : ""), text: "Unsure",
      "data-flag": "1", "aria-pressed": String(!!sc.flagged), title: "Mark this song for someone to double-check" }));

    var li = el("li", { className: "song" + (sc.flagged ? " flagged" : "") },
      [el("div", {}, [title, metaEl]), picker]);
    if (sc.notes) li.appendChild(el("div", { className: "note-text", text: "Note: " + sc.notes }));
    li.hidden = !matchesView(s);
    return li;
  }

  function renderSongs() {
    var list = $("song-list");
    var frag = document.createDocumentFragment();
    state.selected.forEach(function (s) { frag.appendChild(songRow(s)); });
    list.textContent = "";
    list.appendChild(frag);
    updateProgress();
  }

  function updateProgress() {
    var total = state.selected.length;
    var done = state.selected.filter(function (s) { return (state.scores[s.song_id] || {}).score; }).length;
    $("score-progress").textContent = done + " of " + total + " tagged";
    $("score-bar").style.width = (total ? (done / total) * 100 : 0) + "%";
    var visible = 0;
    Array.prototype.forEach.call($("song-list").children, function (li, i) {
      li.hidden = !matchesView(state.selected[i]);
      if (!li.hidden) visible++;
    });
    $("empty-list").hidden = visible > 0;
    $("to-send").disabled = done === 0;
  }

  function setView(view) {
    state.view = view;
    $("view-filter").querySelectorAll("button").forEach(function (x) {
      x.classList.toggle("on", x.getAttribute("data-view") === view);
    });
    updateProgress();
  }

  function onPick(e) {
    var btn = e.target.closest("button");
    var picker = btn && btn.closest(".picker");
    if (!picker) return;
    var id = picker.getAttribute("data-id");
    var cur = state.scores[id] || {};
    if (btn.hasAttribute("data-flag")) {
      setScore(id, { flagged: !cur.flagged, confidence: cur.flagged ? "reviewed" : "low" });
    } else {
      var n = +btn.getAttribute("data-score");
      setScore(id, { score: cur.score === n ? 0 : n });
    }
    var i = state.selected.findIndex(function (s) { return s.song_id === id; });
    $("song-list").children[i].replaceWith(songRow(state.selected[i]));
    var again = $("song-list").children[i].querySelector(
      btn.hasAttribute("data-flag") ? "[data-flag]" : '[data-score="' + btn.getAttribute("data-score") + '"]');
    if (again) again.focus();
    updateProgress();
  }

  async function saveClaudeFiles() {
    var btn = $("save-claude");
    btn.disabled = true;
    try {
      status("claude-files-status", "", "Getting the lyrics…");
      var lyrics = await HV.gatherLyrics(state.pc, state.selected, function (n, total) {
        $("claude-files-status").textContent = "Getting the lyrics… " + n + " of " + total;
      });
      var withLyrics = state.selected.filter(function (s) { return lyrics[s.song_id]; }).length;
      $("claude-files-status").textContent = "Saving…";
      if (!await download("songs_for_claude.json", HV.songsForClaudeJson(state.selected, lyrics), "application/json") ||
          !await download("scoring_sheet.csv", HV.scoringSheetCsv(state.selected, state.scores), "text/csv")) {
        status("claude-files-status", "warn", "Saving was cancelled. Click the button again when you're ready.");
        return;
      }
      var missing = state.selected.length - withLyrics;
      status("claude-files-status", "ok", ["Saved both files. ",
        missing ? plural(missing, "song") + " had no lyrics in Planning Center (often older hymns); " +
                  "Claude will suggest " + (missing === 1 ? "its direction" : "their directions") + " from what it knows of the song." : ""]);
    } finally {
      btn.disabled = false;
    }
  }

  async function importSheet(file) {
    var result = HV.checkSheet(await readFile(file));
    var byId = {};
    state.songs.forEach(function (s) { byId[s.song_id] = s; });
    var onList = {};
    state.selected.forEach(function (s) { onList[s.song_id] = true; });
    var added = 0;
    result.good.forEach(function (g) {
      setScore(g.song_id, { score: g.score, flagged: g.flagged, confidence: g.confidence, notes: g.notes });
      if (!onList[g.song_id]) {
        state.selected.push(byId[g.song_id] || { song_id: g.song_id, title: g.title, tags: [], current_score: "" });
        onList[g.song_id] = true;
        added++;
      }
    });
    var flagged = result.good.filter(function (g) { return g.flagged; }).length;
    var parts = [el("b", { text: "Imported " + plural(result.good.length, "direction") + "." })];
    if (flagged) parts.push(" " + plural(flagged, "song") + " " + (flagged === 1 ? "is" : "are") +
                            " marked Unsure and shown below; check those before sending.");
    if (added) parts.push(" " + plural(added, "song") + " from the sheet " + (added === 1 ? "was" : "were") + " added to your list.");
    if (result.blank.length) parts.push(" " + plural(result.blank.length, "row") + " had no direction.");
    if (result.bad.length) {
      parts.push(" These rows were skipped:");
      parts.push(el("ul", {}, result.bad.slice(0, 10).map(function (b) { return el("li", { text: b }); })));
    }
    status("import-status", result.bad.length || flagged ? "warn" : "ok", parts);
    renderSongs();
    if (flagged) setView("flagged");
  }

  // ---------------------------------------------------------------- 4
  function scoredSongs() {
    return state.selected.filter(function (s) { return (state.scores[s.song_id] || {}).score; })
      .map(function (s) {
        var sc = state.scores[s.song_id];
        return { song_id: s.song_id, title: s.title, score: sc.score, flagged: !!sc.flagged };
      });
  }

  function toSend() {
    var include = $("include-flagged").checked;
    return scoredSongs().filter(function (s) { return include || !s.flagged; });
  }

  function renderSendSummary() {
    var scored = scoredSongs();
    var counts = [0, 0, 0, 0, 0, 0];
    scored.forEach(function (s) { counts[s.score]++; });
    var biggest = Math.max.apply(null, counts) || 1;
    var dist = $("dist");
    dist.textContent = "";
    [1, 2, 3, 4, 5].forEach(function (n) {
      var bar = el("i", { className: "c" + n });
      bar.style.width = (counts[n] / biggest) * 100 + "%";
      dist.appendChild(el("div", { className: "row" }, [el("span", { text: n + " " + HV.SCORE_NAMES[n] }),
        el("div", { className: "track" }, [bar]), el("span", { className: "n", text: String(counts[n]) })]));
    });
    var warn = $("send-warnings");
    warn.textContent = "";
    var unscored = state.selected.length - scored.length;
    if (unscored) warn.appendChild(el("p", { className: "muted",
      text: plural(unscored, "song") + " without a direction will be left alone." }));
    var flagged = scored.filter(function (s) { return s.flagged; }).length;
    $("flagged-line").hidden = !flagged;
    $("flagged-label").textContent = "Also send the " + plural(flagged, "song") + " marked Unsure. " +
      "(Leave this unchecked until someone has double-checked.)";
    updateSendButtons();
  }

  function updateSendButtons() {
    var n = toSend().length;
    $("send-test").disabled = state.sending || !n;
    $("send-test").textContent = n <= 3 ? "Send " + plural(n, "song") : "Send 3 test songs";
    if (!Object.keys(state.totals).length) {
      $("send-counts").textContent = n ? plural(n, "song") + " ready to send." : "Nothing to send yet.";
    }
  }

  function logResult(s, result, detail, i, total) {
    var entry = { time: new Date().toISOString().slice(0, 19), song_id: s.song_id, title: s.title,
                  score: s.score, result: result, detail: detail };
    state.log.push(entry);
    state.results[s.song_id] = result;
    if (result !== "stopped") state.totals[result] = (state.totals[result] || 0) + 1;
    var cls = result === "updated" ? "r-updated" : result === "already set" ? "r-already" : "r-bad";
    var log = $("send-log");
    log.insertBefore(el("li", {}, [el("span", { className: cls, text: result }),
      el("span", { text: s.score + " " + HV.SCORE_NAMES[s.score] + " · " + s.title })]), log.firstChild);
    $("send-bar").style.width = ((i + 1) / total) * 100 + "%";
    if (result === "updated" || result === "already set") {
      var song = state.songs.find(function (x) { return x.song_id === s.song_id; });
      if (song) song.current_score = String(s.score);
    }
  }

  function countsText(c) {
    var parts = ["Updated: " + (c.updated || 0), "Already set: " + (c["already set"] || 0)];
    if (c["not found"]) parts.push("Not found: " + c["not found"]);
    if (c.skipped) parts.push("Skipped: " + c.skipped);
    return parts.join(" · ");
  }

  async function runSend(songs) {
    state.sending = true;
    updateSendButtons();
    $("send-bar").style.width = "0%";
    try {
      return await HV.send(state.pc, songs, state.scale, function (s, r, d, i) {
        logResult(s, r, d, i, songs.length);
      });
    } finally {
      state.sending = false;
      $("send-counts").textContent = countsText(state.totals);
    }
  }

  async function sendTest() {
    var all = toSend();
    $("phase-test").hidden = true;
    if (all.length <= 3) {
      try {
        await runSend(all);
      } catch (e) {
        stopped(e);
        return;
      }
      finish(all.length);
      return;
    }
    state.batch = HV.pickTestSongs(all);
    state.rest = all.filter(function (s) { return !state.batch.some(function (b) { return b.song_id === s.song_id; }); });
    try {
      await runSend(state.batch);
    } catch (e) {
      stopped(e);
      return;
    }
    var list = $("check-list");
    list.textContent = "";
    state.batch.forEach(function (s) {
      var tag = state.scale[s.score].name;
      var item = el("li", {}, [el("b", { text: s.title }), el("div", { className: "tags", text: "Should show: " + tag })]);
      if (state.results[s.song_id] === "not found") {
        item.appendChild(el("div", { className: "tags",
          text: "Not found in Planning Center (deleted or merged?), so nothing was changed." }));
      } else if (state.pc.isPretend) {
        item.appendChild(el("div", { className: "tags", text: "Pretend Planning Center now has: " +
          state.pc.describe(s.song_id).join(", ") }));
      } else {
        item.appendChild(el("a", { href: "https://services.planningcenteronline.com/songs/" + s.song_id,
          target: "_blank", rel: "noopener noreferrer", text: "Open in Planning Center" }));
      }
      list.appendChild(item);
    });
    $("check-intro").textContent = state.pc.isPretend
      ? "In real use you'd open each song in Planning Center now. Here's what the pretend Planning Center shows:"
      : "Open each song in Planning Center. Check that it shows the right direction AND still has its other tags.";
    $("send-rest").textContent = "They look right. Send the other " + plural(state.rest.length, "song");
    $("phase-check").hidden = false;
  }

  async function sendRest() {
    $("phase-check").hidden = true;
    try {
      await runSend(state.rest);
    } catch (e) {
      stopped(e);
      return;
    }
    finish(state.batch.length + state.rest.length);
  }

  function stopped(e) {
    showError(e.name === "UserError" ? e.message : "Something went wrong: " + e.message);
    $("done-title").textContent = "Stopped";
    $("done-text").textContent = "Sending stopped because of the problem above. Songs already sent keep their " +
      "new direction. When it's fixed, send again: songs that are already right are skipped.";
    $("phase-done").hidden = false;
  }

  function finish(n) {
    $("done-title").textContent = "All done!";
    $("done-text").textContent = state.pc.isPretend
      ? "That's the whole process. In real use, every tagged song now has its direction tag in Planning Center, " +
        "and all its other tags are unchanged. When you're ready, " +
        (desktop ? "quit and reopen the app" : "reload this page") + " and connect with your real key."
      : plural(n, "song") + " checked. Every tagged song now has its direction tag, and all other tags were kept. " +
        "If you're finished, delete your key on the Planning Center developer page" +
        (state.savedKey ? " and click “Forget saved key” at the top." : ".");
    $("phase-done").hidden = false;
    document.querySelectorAll("#whats-next .group-name").forEach(function (b) { b.textContent = state.groupName; });
    $("whats-next").hidden = false;
  }

  function enterSend() {
    state.totals = {};
    state.results = {};
    $("phase-test").hidden = false;
    $("phase-check").hidden = true;
    $("phase-done").hidden = true;
    $("whats-next").hidden = true;
    $("send-log").textContent = "";
    $("send-bar").style.width = "0%";
    $("include-flagged").checked = false;
    renderSendSummary();
    show(4);
  }

  // ==================================================================
  // Wiring
  // ==================================================================

  $("connect-form").addEventListener("submit", function (e) {
    e.preventDefault();
    guard(connect)();
  });
  $("practice-btn").addEventListener("click", guard(startPractice));
  $("none-of-these").addEventListener("click", function () { showSetup([]); });
  $("check-again").addEventListener("click", guard(checkAgain));
  $("forget-key").addEventListener("click", guard(function () { return forgetKey(false); }));
  $("refresh-songs").addEventListener("click", guard(loadSongsFromPlanningCenter));

  $("export-file").addEventListener("change", guard(async function (e) {
    var file = e.target.files[0];
    e.target.value = "";
    if (file) useSongs(HV.loadExport(await readFile(file), state.groupName), file.name);
  }));
  var drop = $("drop");
  drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", function () { drop.classList.remove("over"); });
  drop.addEventListener("drop", guard(async function (e) {
    e.preventDefault();
    drop.classList.remove("over");
    var file = e.dataTransfer.files[0];
    if (file) useSongs(HV.loadExport(await readFile(file), state.groupName), file.name);
  }));
  $("tag-options").addEventListener("change", onTagChange);
  $("skip-scored").addEventListener("change", updateScope);
  $("to-how").addEventListener("click", goToHowPanel);
  $("mode-self").addEventListener("click", function () { startScoring("self"); });
  $("mode-claude").addEventListener("click", function () { startScoring("claude"); });

  $("song-list").addEventListener("click", onPick);
  $("search").addEventListener("input", function (e) { state.query = e.target.value.trim().toLowerCase(); updateProgress(); });
  $("view-filter").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (b) setView(b.getAttribute("data-view"));
  });
  $("save-claude").addEventListener("click", guard(saveClaudeFiles));
  $("import-file").addEventListener("change", guard(async function (e) {
    var file = e.target.files[0];
    e.target.value = "";
    if (file) await importSheet(file);
  }));
  $("back-to-2").addEventListener("click", function () { show(2); });
  $("to-send").addEventListener("click", enterSend);

  $("include-flagged").addEventListener("change", updateSendButtons);
  $("send-test").addEventListener("click", guard(sendTest));
  $("send-rest").addEventListener("click", guard(sendRest));
  $("stop-here").addEventListener("click", function () {
    $("phase-check").hidden = true;
    $("done-title").textContent = "Stopped after the test songs";
    $("done-text").textContent = "Nothing else was changed. When you're ready, come back and send again. " +
      "Songs that are already right are skipped.";
    $("phase-done").hidden = false;
  });
  $("back-to-3").addEventListener("click", function () { show(3); });
  $("dl-log").addEventListener("click", guard(async function () {
    var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    await download("sent_" + stamp + ".csv", HV.logCsv(state.log), "text/csv");
  }));
  $("score-more").addEventListener("click", function () {
    updateScope();
    show(2);
  });

  window.addEventListener("beforeunload", function (e) {
    if (state.sending) { e.preventDefault(); e.returnValue = ""; }
  });

  showMediaWhenLoaded();
  watchHowPanel();
  if (desktop) {
    setUpDesktop();
    guard(connectWithSavedKey)();
  } else {
    // Planning Center's API doesn't send browsers the header they need to read a reply
    // made with a Personal Access Token, so a web page can only run the practice.
    linkDocs();
    $("connect-howto").hidden = true;
    $("connect-form").hidden = true;
    $("web-note").hidden = false;
  }
  show(1);
})();
