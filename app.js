// Office 50% Tracker (PWA-ready). Data is stored per monthMonth in localStorage.

const $ = (id) => document.getElementById(id);

const monthInput = $("month");
const patternSel = $("workPattern");
const percentSel = $("percent");

const periodLabel = $("periodLabel");
const cal = $("calendar");

const mWorkingTotal = $("mWorkingTotal");
const mRequired = $("mRequired");
const mDone = $("mDone");
const mRemaining = $("mRemaining");
const statusLine = $("statusLine");

const todayBtn = $("todayBtn");
const resetBtn = $("resetBtn");

// day status: "" | "in" | "out"
function keyFor(ym) {
  return `office50:${ym}`;
}

function parseYM(value) {
  // value: "YYYY-MM"
  const [y, m] = value.split("-").map(Number);
  return { y, m }; // m is 1-12
}

function fmtYM(y, m) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function daysInMonth(y, m1to12) {
  return new Date(y, m1to12, 0).getDate();
}

function isWeekend(dateObj) {
  const d = dateObj.getDay(); // 0 Sun ... 6 Sat
  return d === 0 || d === 6;
}

function isWorkingDay(dateObj, pattern) {
  if (pattern === "all") return true;
  // monfri
  return !isWeekend(dateObj);
}

function requiredDays(workingTotal, pct) {
  // default: round up
  return Math.ceil(workingTotal * (pct / 100));
}

function loadState(ym) {
  const raw = localStorage.getItem(keyFor(ym));
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function saveState(ym, state) {
  localStorage.setItem(keyFor(ym), JSON.stringify(state));
}

function render() {
  const ym = monthInput.value;
  if (!ym) return;

  const { y, m } = parseYM(ym);
  const pattern = patternSel.value;
  const pct = Number(percentSel.value);

  const state = loadState(ym); // map dayNum -> ""|"in"|"out"
  const dim = daysInMonth(y, m);

  periodLabel.textContent = new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  // Build header row (days of week)
  cal.innerHTML = "";
  const dows = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  for (const d of dows) {
    const el = document.createElement("div");
    el.className = "dow";
    el.textContent = d;
    cal.appendChild(el);
  }

  // Determine first day offset (Mon-first)
  const first = new Date(y, m - 1, 1);
  const firstDowSun0 = first.getDay(); // 0 Sun..6 Sat
  // Convert to Mon-first index 0..6
  const firstDowMon0 = (firstDowSun0 + 6) % 7;

  // Add blanks before day 1
  for (let i = 0; i < firstDowMon0; i++) {
    const blank = document.createElement("div");
    blank.className = "day muted";
    blank.style.visibility = "hidden";
    cal.appendChild(blank);
  }

  let workingTotal = 0;
  let done = 0;

  // Render days
  for (let day = 1; day <= dim; day++) {
    const dateObj = new Date(y, m - 1, day);
    const working = isWorkingDay(dateObj, pattern);
    if (working) workingTotal++;

    const status = state[day] || ""; // "", "in", "out"
    if (working && status === "in") done++;

    const cell = document.createElement("div");
    cell.className = "day" + (working ? "" : " muted");
    cell.dataset.day = String(day);

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = day;
    cell.appendChild(num);

    if (status) {
      const tag = document.createElement("div");
      tag.className = "tag " + status;
      tag.textContent = status === "in" ? "In" : "Out";
      cell.appendChild(tag);
    } else if (working) {
      const tag = document.createElement("div");
      tag.className = "tag req";
      tag.textContent = "Tap";
      tag.style.opacity = "0.55";
      cell.appendChild(tag);
    }

    cell.addEventListener("click", () => {
      if (!working) return; // ignore weekends in Mon–Fri mode
      const cur = state[day] || "";
      const next = cur === "" ? "in" : (cur === "in" ? "out" : "");
      if (next === "") delete state[day];
      else state[day] = next;
      saveState(ym, state);
      render();
    });

    cal.appendChild(cell);
  }

  const req = requiredDays(workingTotal, pct);
  const remaining = Math.max(0, req - done);

  mWorkingTotal.textContent = String(workingTotal);
  mRequired.textContent = String(req);
  mDone.textContent = String(done);
  mRemaining.textContent = String(remaining);

  // Progress messaging
  const today = new Date();
  const inSameMonth = (today.getFullYear() === y && (today.getMonth() + 1) === m);
  let workingElapsed = 0;
  let workingLeft = 0;

  for (let day = 1; day <= dim; day++) {
    const dateObj = new Date(y, m - 1, day);
    if (!isWorkingDay(dateObj, pattern)) continue;
    if (inSameMonth && day <= today.getDate()) workingElapsed++;
    if (inSameMonth && day > today.getDate()) workingLeft++;
  }

  if (inSameMonth) {
    statusLine.textContent =
      `Working days elapsed: ${workingElapsed}. Working days left: ${workingLeft}. ` +
      (remaining === 0
        ? "You’ve already hit the requirement for this month."
        : `You still need ${remaining} in-office day(s) to meet the target.`);
  } else {
    statusLine.textContent =
      (remaining === 0
        ? "Requirement met for this month based on your entries."
        : `You still need ${remaining} in-office day(s) to meet the target for this month.`);
  }
}

function init() {
  // Default month: current month
  const now = new Date();
  const ym = fmtYM(now.getFullYear(), now.getMonth() + 1);

  // Load last used settings if available
  const settingsRaw = localStorage.getItem("office50:settings");
  if (settingsRaw) {
    try {
      const s = JSON.parse(settingsRaw);
      if (s.month) monthInput.value = s.month;
      else monthInput.value = ym;
      if (s.pattern) patternSel.value = s.pattern;
      if (s.pct) percentSel.value = String(s.pct);
    } catch {
      monthInput.value = ym;
    }
  } else {
    monthInput.value = ym;
  }

  const persistSettings = () => {
    localStorage.setItem("office50:settings", JSON.stringify({
      month: monthInput.value,
      pattern: patternSel.value,
      pct: Number(percentSel.value),
    }));
  };

  monthInput.addEventListener("change", () => { persistSettings(); render(); });
  patternSel.addEventListener("change", () => { persistSettings(); render(); });
  percentSel.addEventListener("change", () => { persistSettings(); render(); });

  todayBtn.addEventListener("click", () => {
    monthInput.value = fmtYM(now.getFullYear(), now.getMonth() + 1);
    persistSettings();
    render();
    // scroll to calendar roughly near today (simple)
    const d = now.getDate();
    const cell = cal.querySelector(`[data-day="${d}"]`);
    if (cell) cell.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  resetBtn.addEventListener("click", () => {
    const ym = monthInput.value;
    if (!ym) return;
    localStorage.removeItem(keyFor(ym));
    render();
  });

  render();

  // Register service worker for offline installability
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();