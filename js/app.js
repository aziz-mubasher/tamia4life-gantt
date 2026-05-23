import Storage from "./storage.js";

const APP_NAME = "AZM - Lean Startup Road Map";
const TIMELINE_SCALES = {
  week: { name: "Week", dw: 12, unit: "week" },
  day: { name: "Day", dw: 24, unit: "day" },
};
const TIMELINE_ORDER = ["week", "day"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STAT_DOT = { done: "s-done", "in-progress": "s-prog", overdue: "s-over", upcoming: "s-up" };
const STAT_LAB = { done: "Completed", "in-progress": "In progress", overdue: "Overdue", upcoming: "Upcoming" };

const TODAY = startOfDay(new Date());
const TODAY_ISO = iso(TODAY);

let defaultData = null;
let state = null;
let ui = null;
let didInitScroll = false;
let drag = null;
let editingId = null;

function D(s) {
  const p = s.split("-");
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

function iso(d) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function addDays(s, n) {
  const d = D(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

function dayDiff(a, b) {
  return Math.round((D(b) - D(a)) / 86400000);
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmt(s) {
  const d = D(s);
  return d.getDate() + " " + MON[d.getMonth()];
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function normalizeProject(project) {
  const p = { ...project };
  if (!p.name && p.title) {
    p.name = String(p.title).split(/[—–|-]/)[0].trim() || "My Project";
  }
  if (!p.name) p.name = "My Project";
  delete p.title;
  return p;
}

function normalizeState(data) {
  if (data?.project) data.project = normalizeProject(data.project);
  if (Array.isArray(data?.tasks)) {
    data.tasks.forEach((t) => {
      if (t.link == null) t.link = "";
    });
  }
  return data;
}

function timelineScale() {
  const key = ui.timelineScale || "week";
  return TIMELINE_SCALES[key] || TIMELINE_SCALES.week;
}

function normalizeUI(raw) {
  const uiState = Object.assign({ timelineScale: "week", collapsed: [] }, raw || {});
  if (!TIMELINE_SCALES[uiState.timelineScale] && typeof uiState.zoom === "number") {
    uiState.timelineScale = uiState.zoom >= 3 ? "day" : "week";
  }
  if (uiState.timelineScale === "month") uiState.timelineScale = "week";
  if (!TIMELINE_SCALES[uiState.timelineScale]) uiState.timelineScale = "week";
  delete uiState.zoom;
  if (!Array.isArray(uiState.collapsed)) uiState.collapsed = [];
  return uiState;
}

function projectName() {
  return state?.project?.name || "My Project";
}

function linkBtn(t) {
  if (!t.link) return "";
  return (
    '<a class="task-link" href="' +
    esc(t.link) +
    '" target="_blank" rel="noopener noreferrer" title="Open activity details">↗</a>'
  );
}

function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.round(r + (255 - r) * 0.78);
  g = Math.round(g + (255 - g) * 0.78);
  b = Math.round(b + (255 - b) * 0.78);
  return "rgb(" + r + "," + g + "," + b + ")";
}

function pct(a, b) {
  return b ? Math.round((a / b) * 100) + "%" : "0%";
}

function phaseById(id) {
  return state.phases.find((p) => p.id === id) || state.phases[0];
}

function getTask(id) {
  return state.tasks.find((t) => t.id === id);
}

function duration(t) {
  return dayDiff(t.start, t.end) + 1;
}

function statusOf(t) {
  const end = D(t.end);
  const start = D(t.start);
  if (t.progress >= 100) return "done";
  if (end < TODAY) return "overdue";
  if (start <= TODAY && end >= TODAY) return "in-progress";
  if (t.progress > 0) return "in-progress";
  return "upcoming";
}

function overallProgress() {
  const nonM = state.tasks.filter((t) => !t.milestone);
  let tot = 0;
  let wp = 0;
  nonM.forEach((t) => {
    const d = duration(t);
    tot += d;
    wp += d * t.progress;
  });
  return tot ? Math.round(wp / tot) : 0;
}

function geometry() {
  let minS = state.project.start;
  let maxE = state.project.end;
  state.tasks.forEach((t) => {
    if (t.start < minS) minS = t.start;
    if (t.end > maxE) maxE = t.end;
  });
  const sd = D(minS);
  sd.setDate(sd.getDate() - ((sd.getDay() + 6) % 7));
  const ed = D(maxE);
  ed.setDate(ed.getDate() + ((7 - ed.getDay()) % 7));
  const start = iso(sd);
  const end = iso(ed);
  const totalDays = dayDiff(start, end) + 1;
  const scale = timelineScale();
  const dw = scale.dw;
  return { start, end, totalDays, weeks: Math.ceil(totalDays / 7), dw, tlW: totalDays * dw, labelW: 460, scale };
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 1900);
}

function updateStorageBadge() {
  document.getElementById("storageBadge").textContent = Storage.lastSavedLabel();
}

function render() {
  computeCodes();
  renderHeader();
  renderKPIs();
  renderFilters();
  renderGantt();
  renderLegend();
  Storage.saveData(state);
  Storage.saveUI(ui);
  updateStorageBadge();
}

function computeCodes() {
  state.phases.forEach((ph, pi) => {
    const items = state.tasks
      .filter((t) => t.phase === ph.id)
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    let n = 0;
    items.forEach((t) => {
      if (t.milestone) t._code = "◆";
      else {
        n++;
        t._code = pi + 1 + "." + n;
      }
    });
  });
}

function renderHeader() {
  document.title = APP_NAME + " · " + projectName();
  document.getElementById("projTitle").textContent = projectName();
  const nonM = state.tasks.filter((t) => !t.milestone);
  document.getElementById("projMeta").innerHTML =
    '<span class="pill">Lead &nbsp;<b>' +
    esc(state.project.lead) +
    "</b></span>" +
    '<span class="pill">Window &nbsp;<b>' +
    fmt(state.project.start) +
    " " +
    D(state.project.start).getFullYear() +
    " → " +
    fmt(state.project.end) +
    " " +
    D(state.project.end).getFullYear() +
    "</b></span>" +
    '<span class="pill">Tasks &nbsp;<b>' +
    nonM.length +
    "</b></span>" +
    '<span class="pill">Milestones &nbsp;<b>' +
    state.tasks.filter((t) => t.milestone).length +
    "</b></span>";

  const ov = overallProgress();
  const r = 34;
  const C = 2 * Math.PI * r;
  document.getElementById("ring").innerHTML =
    '<circle cx="48" cy="48" r="' +
    r +
    '" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="9"/>' +
    '<circle cx="48" cy="48" r="' +
    r +
    '" fill="none" stroke="#a5b4fc" stroke-width="9" stroke-linecap="round" ' +
    'stroke-dasharray="' +
    C.toFixed(1) +
    '" stroke-dashoffset="' +
    (C * (1 - ov / 100)).toFixed(1) +
    '" transform="rotate(-90 48 48)"/>' +
    '<text x="48" y="46" text-anchor="middle" font-size="20" font-weight="700" fill="#fff">' +
    ov +
    '%</text>' +
    '<text x="48" y="62" text-anchor="middle" font-size="9" fill="#c7d2fe" letter-spacing=".06em">COMPLETE</text>';
}

function renderKPIs() {
  const nonM = state.tasks.filter((t) => !t.milestone);
  const done = nonM.filter((t) => t.progress >= 100).length;
  const prog = nonM.filter((t) => statusOf(t) === "in-progress").length;
  const over = nonM.filter((t) => statusOf(t) === "overdue").length;
  const wkEnd = addDays(TODAY_ISO, 7);
  const soon = nonM.filter((t) => t.progress < 100 && t.end >= TODAY_ISO && t.end <= wkEnd).length;
  const ms = state.tasks.filter((t) => t.milestone);
  const msHit = ms.filter((t) => t.progress >= 100).length;
  const cards = [
    { cls: "", lab: "Overall progress", val: overallProgress() + "%", sub: nonM.length + " tracked tasks" },
    { cls: "", lab: "Milestones hit", val: msHit + " / " + ms.length, sub: "key checkpoints" },
    { cls: "k-done", lab: "Completed", val: done, sub: pct(done, nonM.length) + " of tasks" },
    { cls: "k-prog", lab: "In progress", val: prog, sub: "active right now" },
    { cls: "k-over", lab: "Overdue", val: over, sub: over ? "need attention" : "all on track" },
    { cls: "k-soon", lab: "Due in 7 days", val: soon, sub: "ending this week" },
  ];
  document.getElementById("kpis").innerHTML = cards
    .map(
      (c) =>
        '<div class="kpi ' +
        c.cls +
        '"><div class="lab">' +
        c.lab +
        '</div><div class="val">' +
        c.val +
        '</div><div class="sub">' +
        c.sub +
        "</div></div>"
    )
    .join("");
}

function renderFilters() {
  const owners = [...new Set(state.tasks.map((t) => t.owner).filter(Boolean))].sort();
  const fO = document.getElementById("fOwner");
  const cur = fO.value;
  fO.innerHTML = '<option value="">All owners</option>' + owners.map((o) => '<option value="' + esc(o) + '">' + esc(o) + "</option>").join("");
  fO.value = cur;
  const fP = document.getElementById("fPhase");
  const curP = fP.value;
  fP.innerHTML =
    '<option value="">All phases</option>' + state.phases.map((p) => '<option value="' + p.id + '">' + esc(p.name) + "</option>").join("");
  fP.value = curP;
  document.querySelectorAll("[data-scale]").forEach((btn) => {
    btn.classList.toggle("on", btn.dataset.scale === (ui.timelineScale || "week"));
  });
}

function passesFilter(t) {
  const q = document.getElementById("search").value.trim().toLowerCase();
  const fp = document.getElementById("fPhase").value;
  const fo = document.getElementById("fOwner").value;
  const fs = document.getElementById("fStatus").value;
  if (q && !((t.name || "").toLowerCase().includes(q) || (t._code || "").includes(q))) return false;
  if (fp && t.phase !== fp) return false;
  if (fo && t.owner !== fo) return false;
  if (fs) {
    if (t.milestone) return false;
    if (statusOf(t) !== fs) return false;
  }
  return true;
}

function renderGantt() {
  const g = geometry();
  const scroll = document.getElementById("ganttScroll");
  const sl = scroll.scrollLeft;
  const st = scroll.scrollTop;
  const inner = document.getElementById("ganttInner");
  inner.style.width = g.labelW + g.tlW + "px";
  inner.style.setProperty("--labelW", g.labelW + "px");
  inner.style.setProperty("--tlW", g.tlW + "px");
  const gridUnit = g.scale.unit === "day" ? g.dw : g.dw * 7;
  inner.style.setProperty("--wk", gridUnit + "px");
  inner.style.setProperty("--weStart", g.scale.unit === "day" ? g.dw * 5 + "px" : g.dw * 5 + "px");
  const xOf = (s) => dayDiff(g.start, s) * g.dw;
  const wOf = (s, e) => (dayDiff(s, e) + 1) * g.dw;
  const msX = (s) => dayDiff(g.start, s) * g.dw + g.dw / 2;

  let months = "";
  let cur = D(g.start);
  const endD = D(g.end);
  while (cur <= endD) {
    const mStart = iso(cur);
    const mEndDate = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const segEnd = mEndDate < endD ? mEndDate : endD;
    const w = (dayDiff(mStart, iso(segEnd)) + 1) * g.dw;
    months += '<div class="month" style="width:' + w + 'px">' + MON[cur.getMonth()] + " " + cur.getFullYear() + "</div>";
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  let weeks = "";
  if (g.scale.unit === "week") {
    for (let w = 0; w < g.weeks; w++) {
      const wStart = addDays(g.start, w * 7);
      const wEnd = addDays(wStart, 6);
      const daysInSeg = Math.min(7, dayDiff(wStart, g.end) + 1);
      if (daysInSeg <= 0) break;
      const isNow = TODAY_ISO >= wStart && TODAY_ISO <= wEnd;
      weeks +=
        '<div class="week' +
        (isNow ? " now" : "") +
        '" style="width:' +
        daysInSeg * g.dw +
        'px"><span class="wn">W' +
        (w + 1) +
        '</span><span class="wd">' +
        fmt(wStart) +
        " – " +
        fmt(wEnd) +
        "</span></div>";
    }
  }

  let days = "";
  if (g.scale.unit === "day") {
    for (let d = 0; d < g.totalDays; d++) {
      const dayStart = addDays(g.start, d);
      const dt = D(dayStart);
      const isToday = dayStart === TODAY_ISO;
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      const showMonth = d === 0 || dt.getDate() === 1;
      days +=
        '<div class="day' +
        (isToday ? " now" : "") +
        (isWeekend ? " weekend" : "") +
        '" style="width:' +
        g.dw +
        'px" title="' +
        DOW[dt.getDay()] +
        " " +
        fmt(dayStart) +
        '"><span class="dn">' +
        dt.getDate() +
        "</span>" +
        (showMonth ? '<span class="dm">' + MON[dt.getMonth()] + "</span>" : '<span class="dd">' + DOW[dt.getDay()].charAt(0) + "</span>") +
        "</div>";
    }
  }

  const head =
    '<div class="ghead"><div class="cell-label"><div class="corner"><div class="ct">ACTIVITY</div><div class="cs">owner · dates · progress</div></div></div>' +
    '<div class="cell-track"><div class="months">' +
    months +
    "</div>" +
    (weeks ? '<div class="weeks">' + weeks + "</div>" : "") +
    (days ? '<div class="days">' + days + "</div>" : "") +
    "</div></div>";

  let body = "";
  let anyVisible = false;
  state.phases.forEach((ph) => {
    const all = state.tasks
      .filter((t) => t.phase === ph.id)
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    const vis = all.filter(passesFilter);
    if (vis.length === 0) return;
    anyVisible = true;
    const collapsed = ui.collapsed.includes(ph.id);
    const nonM = all.filter((t) => !t.milestone);
    let tot = 0;
    let wp = 0;
    nonM.forEach((t) => {
      const d = duration(t);
      tot += d;
      wp += d * t.progress;
    });
    const phProg = tot ? Math.round(wp / tot) : 0;
    let pmin = all[0].start;
    let pmax = all[0].end;
    all.forEach((t) => {
      if (t.start < pmin) pmin = t.start;
      if (t.end > pmax) pmax = t.end;
    });
    body +=
      '<div class="row phase' +
      (collapsed ? " collapsed" : "") +
      '" data-phase="' +
      ph.id +
      '"><div class="cell-label"><span class="caret">▼</span><span class="phase-dot" style="background:' +
      ph.color +
      '"></span><span class="phase-name">' +
      esc(ph.name) +
      '</span><span class="phase-meta">' +
      phProg +
      "% · " +
      nonM.length +
      '</span></div><div class="cell-track"><div class="phase-bar" style="left:' +
      xOf(pmin) +
      "px;width:" +
      wOf(pmin, pmax) +
      "px;background:" +
      ph.color +
      '"></div></div></div>';
    if (collapsed) return;
    vis.forEach((t) => {
      const ph2 = phaseById(t.phase);
      if (t.milestone) {
        const hit = t.progress >= 100;
        body +=
          '<div class="row ms" data-id="' +
          t.id +
          '"><div class="cell-label"><div class="lc" data-edit="' +
          t.id +
          '"><span class="stat-dot ' +
          (hit ? "s-done" : "s-up") +
          '"></span><span class="txt"><div class="t1"><span class="code">M</span>' +
          esc(t.name) +
          linkBtn(t) +
          '</div><div class="t2">' +
          esc(t.owner || "—") +
          " · " +
          fmt(t.start) +
          '</div></span></div></div><div class="cell-track grid"><div class="ms-wrap" data-id="' +
          t.id +
          '" style="left:' +
          msX(t.start) +
          'px"><span class="ms-d' +
          (hit ? " hit" : "") +
          '" style="background:' +
          ph2.color +
          '"></span><span class="ms-cap">' +
          fmt(t.start) +
          "</span></div></div></div>";
      } else {
        const stt = statusOf(t);
        body +=
          '<div class="row task" data-id="' +
          t.id +
          '"><div class="cell-label"><div class="lc" data-edit="' +
          t.id +
          '"><span class="stat-dot ' +
          STAT_DOT[stt] +
          '" title="' +
          STAT_LAB[stt] +
          '"></span><span class="txt"><div class="t1"><span class="code">' +
          t._code +
          "</span>" +
          esc(t.name) +
          linkBtn(t) +
          '</div><div class="t2"><span class="owner-chip">' +
          esc(t.owner || "—") +
          "</span> &nbsp;" +
          fmt(t.start) +
          " → " +
          fmt(t.end) +
          " · " +
          duration(t) +
          'd</div></span></div></div><div class="cell-track grid"><div class="bar ' +
          (stt === "done" ? "done " : "") +
          (stt === "overdue" ? "over " : "") +
          '" data-id="' +
          t.id +
          '" style="left:' +
          xOf(t.start) +
          "px;width:" +
          wOf(t.start, t.end) +
          "px;background:" +
          lighten(ph2.color) +
          '"><div class="fill" style="width:' +
          t.progress +
          "%;background:" +
          ph2.color +
          '"></div><span class="blab">' +
          t.progress +
          '%</span><div class="h l"></div><div class="h r"></div></div></div></div>';
      }
    });
  });

  if (!anyVisible) {
    inner.innerHTML = head + '<div class="empty">No tasks match your filters.</div>';
  } else {
    let today = "";
    if (TODAY_ISO >= g.start && TODAY_ISO <= g.end) {
      const tx = g.labelW + dayDiff(g.start, TODAY_ISO) * g.dw + g.dw / 2;
      today = '<div class="today" style="left:' + tx + 'px;height:100%"><span class="flag">TODAY</span></div>';
    }
    inner.innerHTML = head + '<div class="gbody">' + body + "</div>" + today;
  }

  scroll.scrollLeft = sl;
  scroll.scrollTop = st;
  if (!didInitScroll && TODAY_ISO >= g.start && TODAY_ISO <= g.end) {
    didInitScroll = true;
    scroll.scrollLeft = Math.max(0, dayDiff(g.start, TODAY_ISO) * g.dw - 260);
  }
  wireGantt();
}

function renderLegend() {
  const ph = state.phases
    .map((p) => '<span class="lg"><span class="sw" style="background:' + p.color + '"></span>' + esc(p.name.split("·")[0].trim()) + "</span>")
    .join("");
  document.getElementById("legend").innerHTML =
    ph +
    '<span class="lg"><span class="dia" style="background:#64748b"></span>Milestone</span>' +
    '<span class="hint">Week · Day timeline · click a bar to edit · drag to reschedule</span>';
}

function wireTaskLinks() {
  document.querySelectorAll(".task-link").forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });
}

function wireGantt() {
  document.querySelectorAll(".row.phase").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.phase;
      const i = ui.collapsed.indexOf(id);
      if (i >= 0) ui.collapsed.splice(i, 1);
      else ui.collapsed.push(id);
      Storage.saveUI(ui);
      renderGantt();
    });
  });
  document.querySelectorAll("[data-edit]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditor(el.dataset.edit);
    });
  });
  wireTaskLinks();
}

function fillPhaseSelect(sel, val) {
  sel.innerHTML = state.phases.map((p) => '<option value="' + p.id + '">' + esc(p.name) + "</option>").join("");
  if (val) sel.value = val;
}

function syncMilestoneUI() {
  const isM = document.getElementById("mMile").checked;
  document.getElementById("endWrap").style.display = isM ? "none" : "flex";
  document.querySelector("#progWrap label").textContent = isM ? "Reached?" : "% complete";
}

function openEditor(id) {
  editingId = id;
  const t = id ? getTask(id) : null;
  document.getElementById("modalTitle").textContent = t ? "Edit task" : "Add task";
  document.getElementById("delBtn").style.display = t ? "inline-flex" : "none";
  fillPhaseSelect(document.getElementById("mPhase"), t ? t.phase : state.phases[0].id);
  document.getElementById("mName").value = t ? t.name : "";
  document.getElementById("mOwner").value = t ? t.owner || "" : "Founder";
  document.getElementById("mLink").value = t ? t.link || "" : "";
  document.getElementById("mStart").value = t ? t.start : TODAY_ISO;
  document.getElementById("mEnd").value = t ? t.end : addDays(TODAY_ISO, 6);
  document.getElementById("mProg").value = t ? t.progress : 0;
  document.getElementById("mProgV").textContent = (t ? t.progress : 0) + "%";
  document.getElementById("mMile").checked = t ? !!t.milestone : false;
  syncMilestoneUI();
  document.getElementById("overlay").classList.add("show");
  setTimeout(() => document.getElementById("mName").focus(), 30);
}

function closeEditor() {
  document.getElementById("overlay").classList.remove("show");
  editingId = null;
}

function bindEvents() {
  const ov = document.getElementById("overlay");

  document.getElementById("ganttInner").addEventListener("mousedown", (e) => {
    const bar = e.target.closest(".bar");
    const ms = e.target.closest(".ms-wrap");
    const el = bar || ms;
    if (!el) return;
    const id = el.dataset.id;
    const t = getTask(id);
    if (!t) return;
    let mode = "move";
    if (bar) {
      if (e.target.classList.contains("l")) mode = "resize-l";
      else if (e.target.classList.contains("r")) mode = "resize-r";
    }
    const dw = timelineScale().dw;
    drag = { id, mode, el, bar: !!bar, startX: e.clientX, os: t.start, oe: t.end, dw, moved: false, ns: t.start, ne: t.end };
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const g = geometry();
    const dd = Math.round((e.clientX - drag.startX) / drag.dw);
    if (dd !== 0) drag.moved = true;
    let ns = drag.os;
    let ne = drag.oe;
    if (drag.mode === "move") {
      ns = addDays(drag.os, dd);
      ne = addDays(drag.oe, dd);
    } else if (drag.mode === "resize-l") {
      ns = addDays(drag.os, dd);
      if (ns > drag.oe) ns = drag.oe;
    } else {
      ne = addDays(drag.oe, dd);
      if (ne < drag.os) ne = drag.os;
    }
    drag.ns = ns;
    drag.ne = ne;
    const xOf = (s) => dayDiff(g.start, s) * g.dw;
    if (drag.bar) {
      drag.el.style.left = xOf(ns) + "px";
      drag.el.style.width = (dayDiff(ns, ne) + 1) * g.dw + "px";
    } else {
      drag.el.style.left = dayDiff(g.start, ns) * g.dw + g.dw / 2 + "px";
    }
  });

  document.addEventListener("mouseup", () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    document.body.style.userSelect = "";
    if (d.moved) {
      const t = getTask(d.id);
      t.start = d.ns;
      t.end = d.bar ? d.ne : d.ns;
      if (t.milestone) t.end = t.start;
      render();
      toast("Rescheduled · " + fmt(t.start) + (t.milestone ? "" : " → " + fmt(t.end)));
    } else {
      openEditor(d.id);
    }
  });

  document.getElementById("mProg").addEventListener("input", (e) => {
    document.getElementById("mProgV").textContent = e.target.value + "%";
  });
  document.getElementById("mMile").addEventListener("change", syncMilestoneUI);

  document.getElementById("saveBtn").addEventListener("click", () => {
    const name = document.getElementById("mName").value.trim();
    if (!name) {
      toast("Please enter a task name");
      return;
    }
    const isM = document.getElementById("mMile").checked;
    let start = document.getElementById("mStart").value;
    let end = isM ? start : document.getElementById("mEnd").value;
    if (!start) {
      toast("Please set a start date");
      return;
    }
    if (!end) end = start;
    if (end < start) end = start;
    const rec = {
      phase: document.getElementById("mPhase").value,
      name,
      link: document.getElementById("mLink").value.trim(),
      owner: document.getElementById("mOwner").value.trim(),
      start,
      end,
      progress: +document.getElementById("mProg").value,
      milestone: isM,
    };
    if (editingId) {
      Object.assign(getTask(editingId), rec);
      toast("Task updated");
    } else {
      rec.id = "x" + Date.now().toString(36);
      state.tasks.push(rec);
      toast("Task added");
    }
    closeEditor();
    render();
  });

  document.getElementById("delBtn").addEventListener("click", () => {
    if (!editingId) return;
    if (!confirm("Delete this task? This cannot be undone.")) return;
    state.tasks = state.tasks.filter((t) => t.id !== editingId);
    closeEditor();
    render();
    toast("Task deleted");
  });

  document.getElementById("cancelBtn").addEventListener("click", closeEditor);
  ov.addEventListener("click", (e) => {
    if (e.target === ov) closeEditor();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ov.classList.contains("show")) closeEditor();
  });

  document.getElementById("addBtn").addEventListener("click", () => openEditor(null));
  ["search", "fPhase", "fOwner", "fStatus"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderGantt);
    document.getElementById(id).addEventListener("change", renderGantt);
  });

  document.querySelectorAll("[data-scale]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ui.timelineScale = btn.dataset.scale;
      Storage.saveUI(ui);
      renderFilters();
      renderGantt();
    });
  });

  document.getElementById("zIn")?.addEventListener("click", () => {
    const i = TIMELINE_ORDER.indexOf(ui.timelineScale || "week");
    if (i < TIMELINE_ORDER.length - 1) {
      ui.timelineScale = TIMELINE_ORDER[i + 1];
      Storage.saveUI(ui);
      renderFilters();
      renderGantt();
    }
  });
  document.getElementById("zOut")?.addEventListener("click", () => {
    const i = TIMELINE_ORDER.indexOf(ui.timelineScale || "week");
    if (i > 0) {
      ui.timelineScale = TIMELINE_ORDER[i - 1];
      Storage.saveUI(ui);
      renderFilters();
      renderGantt();
    }
  });

  document.getElementById("expBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "AZM-Roadmap-" + projectName().replace(/\s+/g, "-") + "-" + TODAY_ISO + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup downloaded");
  });

  document.getElementById("impBtn").addEventListener("click", () => document.getElementById("impFile").click());
  document.getElementById("impFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!Array.isArray(d.tasks) || !Array.isArray(d.phases)) throw new Error("bad file");
        if (!d.project) d.project = structuredClone(defaultData.project);
        state = normalizeState(d);
        didInitScroll = false;
        render();
        toast("Backup loaded");
      } catch (_) {
        toast("Could not read that file");
      }
    };
    rd.readAsText(f);
    e.target.value = "";
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("Reset to the default lean roadmap? Your current changes will be lost.")) return;
    state = structuredClone(defaultData);
    ui = normalizeUI({ timelineScale: "week", collapsed: [] });
    Storage.clearAll();
    didInitScroll = false;
    render();
    toast("Roadmap reset to default");
  });

  bindShareUI();
  bindProjectUI();
}

function bindProjectUI() {
  const overlay = document.getElementById("projectOverlay");
  const open = () => {
    document.getElementById("pName").value = state.project.name || "";
    document.getElementById("pLead").value = state.project.lead || "";
    document.getElementById("pStart").value = state.project.start || "";
    document.getElementById("pEnd").value = state.project.end || "";
    overlay.classList.add("show");
    setTimeout(() => document.getElementById("pName").focus(), 30);
  };
  document.getElementById("editProjectBtn").addEventListener("click", open);
  document.getElementById("projectCancelBtn").addEventListener("click", () => overlay.classList.remove("show"));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  });
  document.getElementById("projectSaveBtn").addEventListener("click", () => {
    const name = document.getElementById("pName").value.trim();
    if (!name) {
      toast("Please enter a project name");
      return;
    }
    state.project.name = name;
    state.project.lead = document.getElementById("pLead").value.trim();
    state.project.start = document.getElementById("pStart").value || state.project.start;
    state.project.end = document.getElementById("pEnd").value || state.project.end;
    overlay.classList.remove("show");
    render();
    toast("Project updated");
  });
}

function bindShareUI() {
  const cloud = Storage.cloud;
  const overlay = document.getElementById("shareOverlay");
  const cloudUrl = document.getElementById("cloudUrl");
  const boardId = document.getElementById("boardId");
  const shareLink = document.getElementById("shareLink");
  const shareStatus = document.getElementById("shareStatus");

  function refreshShareFields() {
    cloudUrl.value = cloud.getCloudUrl();
    boardId.value = cloud.getBoardId() || "tamia4life-team";
    shareLink.value = cloud.shareLink(boardId.value) || "";
    shareStatus.textContent = cloud.isShared()
      ? `Connected to shared board "${cloud.getBoardId()}".`
      : "Not connected to a shared board.";
  }

  document.getElementById("shareBtn").addEventListener("click", () => {
    refreshShareFields();
    overlay.classList.add("show");
  });

  document.getElementById("shareCancelBtn").addEventListener("click", () => overlay.classList.remove("show"));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("show");
  });

  boardId.addEventListener("input", () => {
    shareLink.value = cloud.shareLink(boardId.value) || "";
  });
  cloudUrl.addEventListener("input", () => {
    cloud.setCloudUrl(cloudUrl.value);
    shareLink.value = cloud.shareLink(boardId.value) || "";
  });

  document.getElementById("copyLinkBtn").addEventListener("click", async () => {
    refreshShareFields();
    if (!shareLink.value) {
      toast("Set a board name first");
      return;
    }
    try {
      await navigator.clipboard.writeText(shareLink.value);
      toast("Share link copied");
    } catch (_) {
      shareLink.select();
      toast("Copy the link manually");
    }
  });

  document.getElementById("connectShareBtn").addEventListener("click", async () => {
    const url = cloud.setCloudUrl(cloudUrl.value);
    const id = cloud.setBoardId(boardId.value);
    if (!url || !id) {
      toast("Enter a cloud URL and board name");
      return;
    }
    try {
      const existing = await cloud.loadBoard();
      if (existing) {
        state = normalizeState(existing);
        didInitScroll = false;
        render();
      } else {
        const created = await cloud.createBoard(id, state);
        if (!created) throw new Error("save failed");
        render();
      }
      cloud.markSynced();
      cloud.startPolling(onRemoteBoardUpdate);
      overlay.classList.remove("show");
      updateStorageBadge();
      toast(existing ? "Joined shared board" : "Created shared board");
    } catch (_) {
      toast("Could not connect. Check the cloud URL.");
    }
  });

  document.getElementById("disconnectShareBtn").addEventListener("click", () => {
    cloud.disconnect();
    overlay.classList.remove("show");
    updateStorageBadge();
    toast("Disconnected from shared board");
  });
}

function onRemoteBoardUpdate(data) {
  state = normalizeState(data);
  didInitScroll = false;
  renderGantt();
  renderHeader();
  renderKPIs();
  toast("Board updated by teammate");
}

async function boot() {
  defaultData = normalizeState(await Storage.fetchDefault());
  await Storage.fetchStorageInfo();
  const serverData = await Storage.loadFromServer();
  state = normalizeState(serverData || Storage.loadData(defaultData));
  ui = normalizeUI(Storage.loadUI());
  bindEvents();
  render();
  if (Storage.cloud.isShared()) {
    Storage.cloud.startPolling(onRemoteBoardUpdate);
  }
}

boot();
