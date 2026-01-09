const $ = (id) => document.getElementById(id);

const monthInput = $("month");
const patternSel = $("workPattern");
const percentSel = $("percent");
const ukHolsChk = $("ukHols");

const periodLabel = $("periodLabel");
const cal = $("calendar");

const mWorkingTotal = $("mWorkingTotal");
const mRequired = $("mRequired");
const mDone = $("mDone");
const mRemaining = $("mRemaining");
const statusLine = $("statusLine");
const holidayHint = $("holidayHint");

const todayBtn = $("todayBtn");
const resetBtn = $("resetBtn");

// status values: "" | "in" | "out" | "pto"
function keyFor(ym) {
  return `office50:${ym}`;
}

function parseYM(value) {
  const [y, m] = value.split("-").map(Number);
  return { y, m }; // m is 1-12
}

function fmtYM(y, m) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function daysInMonth(y, m1to12) {
  return new Date(y, m1to12, 0).getDate();
}

function pad2(n){ return String(n).padStart(2, "0"); }

function ymd(y, m1to12, d){
  return `${y}-${pad2(m1to12)}-${pad2(d)}`;
}

function addDays(dateObj, days){
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

function isWeekend(dateObj) {
  const d = dateObj.getDay(); // 0 Sun ... 6 Sat
  return d === 0 || d === 6;
}

function isWorkingDayByPattern(dateObj, pattern) {
  if (pattern === "all") return true;
  return !isWeekend(dateObj);
}

// ===== UK Bank Holidays (England & Wales) =====
// Note: This covers the standard recurring holidays. One-off specials (e.g., royal events) are not included.
function easterSunday(year){
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const month = Math.floor((h + l - 7*m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function firstMondayOfMonth(year, monthIndex0){
  const d = new Date(year, monthIndex0, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

function lastMondayOfMonth(year, monthIndex0){
  const d = new Date(year, monthIndex0 + 1, 0); // last day of month
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  return d;
}

function observedNewYear(year){
  const d = new Date(year, 0, 1);
  const dow = d.getDay();
  if (dow === 6) return new Date(year, 0, 3); // Sat -> Mon 3rd
  if (dow === 0) return new Date(year, 0, 2); // Sun -> Mon 2nd
  return d;
}

function observedChristmasAndBoxing(year){
  const xmas = new Date(year, 11, 25);
  const boxing = new Date(year, 11, 26);

  const xDow = xmas.getDay();
  // Cases:
  // - Xmas Sat (25) => observed Mon 27; Boxing Sun (26) => observed Tue 28
  if (xDow === 6) {
    return {
      christmas: new Date(year, 11, 27),
      boxing: new Date(year, 11, 28),
    };
  }
  // - Xmas Sun (25) => observed Tue 27; Boxing Mon (26) stays Mon 26
  if (xDow === 0) {
    return {
      christmas: new Date(year, 11, 27),
      boxing: boxing,
    };
  }

  // Otherwise Christmas is weekday (Mon–Fri)
  // Boxing day might still be Sat in some years (when Xmas is Fri).
  const bDow = boxing.getDay();
  if (bDow === 6) {
    return {
      christmas: xmas,
      boxing: new Date(year, 11, 28), // Sat -> Mon 28
    };
  }
  return {
    christmas: xmas,
    boxing: boxing,
  };
}

function getUKBankHolidaysEW(year){
  const set = new Set();

  // New Year (observed)
  set.add(dateToYMD(observedNewYear(year)));

  // Easter-related
  const easter = easterSunday(year);
  const goodFriday = addDays(easter, -2);
  const easterMon = addDays(easter, 1);
  set.add(dateToYMD(goodFriday));
  set.add(dateToYMD(easterMon));

  // Early May: first Monday in May
  set.add(dateToYMD(firstMondayOfMonth(year, 4))); // May (0=Jan)

  // Spring: last Monday in May
  set.add(dateToYMD(lastMondayOfMonth(year, 4)));

  // Summer: last Monday in August
  set.add(dateToYMD(lastMondayOfMonth(year, 7))); // Aug

  // Christmas + Boxing (observed rules)
  const cx = observedChristmasAndBoxing(year);
  set.add(dateToYMD(cx.christmas));
  set.add(dateToYMD(cx.boxing));

  return set;
}

function dateToYMD(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

// ===== Required days =====
function requiredDays(workingTotal, pct) {
  // Round up so 21 * 0.5 = 10.5 -> 11
  return Math.ceil(workingTotal * (pct / 100));
}

// ===== Storage =====
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
  const excludeUKHols = !!ukHolsChk.checked;

  const bankHols = excludeUKHols ? getUKBankHolidaysEW(y) : new Set();

  const state = loadState(ym); // map dayNum -> ""|"in"|"out"|"pto"
  const dim = daysInMonth(y, m);

  periodLabel.textContent = new Date(y, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  holidayHint.textContent = excludeUKHols
    ? "UK bank holidays are excluded automatically (England & Wales standard holidays)."
    : "UK bank holidays are currently NOT excluded.";

  // Build header row (Mon-first)
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
  const firstDowMon0 = (first.getDay() + 6) % 7;

  // Add blanks
  for (let i = 0; i < firstDowMon0; i++) {
    const blank = document.createElement("div");
    blank.className = "day muted";
    blank.style.visibility = "hidden";
    cal.appendChild(blank);
  }

  // Count totals
  let workingTotal = 0; // eligible working days AFTER excluding bank hols and PTO
  let done = 0;

  // For status line
  const today = new Date();
  const inSameMonth = (today.getFullYear() === y && (today.getMonth() + 1) === m);
  let workingElapsed = 0;
  let workingLeft = 0;

  for (let day = 1; day <= dim; day++) {
    const dateObj = new Date(y, m - 1, day);
    const dateKey = ymd(y, m, day);

    const baseWorking = isWorkingDayByPattern(dateObj, pattern);
    const isBankHol = excludeUKHols && bankHols.has(dateKey);

    const status = state[day] || ""; // "", "in", "out", "pto"

    // Eligible working day: base working AND not a bank holiday AND not PTO
    const eligibleWorking = baseWorking && !isBankHol && status !== "pto";

    if (eligibleWorking) workingTotal++;
    if (eligibleWorking && status === "in") done++;

    if (inSameMonth) {
      if (eligibleWorking && day <= today.getDate()) workingElapsed++;
      if (eligibleWorking && day > today.getDate()) workingLeft++;
    }

    // Render cell
    const cell = document.createElement("div");
    cell.className = "day" + (baseWorking ? "" : " muted");
    cell.dataset.day = String(day);

    // Day number
    const num = document.createElement("div");
    num.className = "num";
    num.textContent = day;
    cell.appendChild(num);

    // Determine tag
    if (isBankHol && baseWorking) {
      const tag = document.createElement("div");
      tag.className = "tag bh";
      tag.textContent = "Bank hol";
      cell.appendChild(tag);
      // Bank holiday treated as non-working when excluded; disable clicking
      cell.classList.add("muted");
    } else if (status) {
      const tag = document.createElement("div");
      tag.className = "tag " + status;
      tag.textContent = status === "in" ? "In" : (status === "out" ? "Out" : "PTO");
      cell.appendChild(tag);
      if (status === "pto") cell.classList.add("muted"); // visually indicate removed from working days
    } else if (baseWorking) {
      const tag = document.createElement("div");
      tag.className = "tag tap";
      tag.textContent = "Tap";
      cell.appendChild(tag);
    }

    // Click logic:
    // - If baseWorking false: ignore (weekends in Mon–Fri)
    // - If bank holiday excluded: ignore
    cell.addEventListener("click", () => {
      if (!baseWorking) return;
      if (isBankHol) return;

      const cur = state[day] || "";
      // cycle: "" -> in -> out -> pto -> ""
      const next = cur === "" ? "in" : (cur === "in" ? "out" : (cur === "out" ? "pto" : ""));
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

  if (inSameMonth) {
    statusLine.textContent =
      `Eligible working days elapsed: ${workingElapsed}. Eligible working days left: ${workingLeft}. ` +
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
  const now = new Date();
  const ym = fmtYM(now.getFullYear(), now.getMonth() + 1);

  // Load settings
  const settingsRaw = localStorage.getItem("office50:settings");
  if (settingsRaw) {
    try {
      const s = JSON.parse(settingsRaw);
      monthInput.value = s.month || ym;
      if (s.pattern) patternSel.value = s.pattern;
      if (s.pct) percentSel.value = String(s.pct);
      ukHolsChk.checked = !!s.ukHols;
    } catch {
      monthInput.value = ym;
      ukHolsChk.checked = true;
    }
  } else {
    monthInput.value = ym;
    ukHolsChk.checked = true; // default ON for UK holidays
  }

  const persistSettings = () => {
    localStorage.setItem("office50:settings", JSON.stringify({
      month: monthInput.value,
      pattern: patternSel.value,
      pct: Number(percentSel.value),
      ukHols: !!ukHolsChk.checked
    }));
  };

  monthInput.addEventListener("change", () => { persistSettings(); render(); });
  patternSel.addEventListener("change", () => { persistSettings(); render(); });
  percentSel.addEventListener("change", () => { persistSettings(); render(); });
  ukHolsChk.addEventListener("change", () => { persistSettings(); render(); });

  todayBtn.addEventListener("click", () => {
    monthInput.value = fmtYM(now.getFullYear(), now.getMonth() + 1);
    persistSettings();
    render();
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

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
