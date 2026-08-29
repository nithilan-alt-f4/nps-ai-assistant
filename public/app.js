const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function fmtDateTime(s) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function dayLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - t) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// ---------- Rich text: **bold** + [[News:/Mail:]] jump links ----------
const itemRegistry = {
  news: [], emails: [],
  find(kind, title) {
    const t = title.toLowerCase().replace(/\.\.\.$/, '');
    const list = kind === 'news' ? this.news : this.emails;
    return list.find(i => i.titleLower.includes(t) || t.includes(i.titleLower)) || null;
  },
  add(kind, id, title) {
    this[kind === 'news' ? 'news' : 'emails'].push({ id, titleLower: (title || '').toLowerCase() });
  }
};

function renderRichText(text, registry) {
  let html = escapeHtml(text || '');
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\[\[(News|Mail):\s*(.+?)\]\]/g, (m, kind, title) => {
    const target = registry.find(kind, title.trim());
    if (target) {
      return `<span class="jump-link" onclick="jumpTo('${kind.toLowerCase()}', '${target.id}')">${escapeHtml(title.trim())}</span>`;
    }
    return `<b>${escapeHtml(title.trim())}</b>`;
  });
  html = html.replace(/\s*[—–]\s*/g, ', ');
  return html;
}

function jumpTo(kind, id) {
  switchTab(kind === 'news' ? 'world' : 'inbox');
  setTimeout(() => {
    const el = document.querySelector(`[data-item-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }, 350);
}

async function getJSON(path) {
  const res = await fetch(path, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- Static data cache ----------
let briefingData = null;
let itemsById = new Map();
let holidaysList = [];
let calEvents = [];

async function loadStaticData() {
  briefingData = await getJSON('data/briefing.json').catch(() => null);
  try {
    const items = await getJSON('data/items.json');
    itemsById = new Map((items || []).map(i => [i.id, i]));
  } catch { itemsById = new Map(); }
  try { holidaysList = await getJSON('data/holidays.json').catch(() => []); } catch { holidaysList = []; }
  try {
    const cal = await getJSON('data/calendar.json');
    calEvents = (cal && cal.events) || [];
  } catch { calEvents = []; }
}

// ---------- Tabs ----------
function switchTab(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $$('.tabbar-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $(`#view-${name}`).classList.add('active');
  window.scrollTo({ top: 0 });
  if (name === 'weather') loadWeatherFull();
}
window.switchTab = switchTab;

// ---------- Toast ----------
function toast(msg, ms = 2500) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- Masthead ----------
function setDateline() {
  $('#dateline').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
}

// ---------- Schedule (computed from calendar.json + holidays.json) ----------
function computeSchedule() {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(now.getTime() + 86400000);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  const isExam = t => /exam|test|akats|quiz/i.test(t || '');
  const startDate = e => String(e.start || '').slice(0, 10);

  const classes = calEvents
    .filter(e => startDate(e) === todayKey && !isExam(e.title))
    .map(e => e.title);

  const tomorrowClasses = calEvents
    .filter(e => startDate(e) === tomorrowKey && !isExam(e.title))
    .map(e => e.title);

  const exams = calEvents
    .filter(e => isExam(e.title) && new Date(e.start) >= now)
    .map(e => ({ title: e.title, date: e.start }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const saturday = new Date(now);
  saturday.setDate(saturday.getDate() + ((6 - saturday.getDay() + 7) % 7 || 7));
  const satKey = `${saturday.getFullYear()}-${String(saturday.getMonth() + 1).padStart(2, '0')}-${String(saturday.getDate()).padStart(2, '0')}`;
  const saturdayHoliday = holidaysList.find(h => String(h.date || '').slice(0, 10) === satKey);

  const day = now.toLocaleDateString(undefined, { weekday: 'long' });

  let showClasses = classes;
  let showTomorrow = false;
  let classesPlaceholder = classes.length === 0;
  if (classes.length === 0 && now.getHours() >= 17) {
    showClasses = tomorrowClasses;
    showTomorrow = true;
    classesPlaceholder = showClasses.length === 0;
  }

  return {
    day,
    classes: showClasses,
    showTomorrow,
    tomorrowDay: tomorrowKey,
    classesPlaceholder,
    exams,
    saturday: {
      date: satKey,
      isHoliday: !!saturdayHoliday,
      reason: saturdayHoliday?.title || null
    }
  };
}

// ---------- Classes + exam strip + Saturday ----------
function renderSchedule(sched) {
  const classes = (sched.classes && sched.classes.length) ? sched.classes : [];
  const tomorrowLabel = sched.showTomorrow
    ? `<div class="class-subhead">Tomorrow${sched.tomorrowDay ? ' · ' + dayLabel(sched.tomorrowDay) : ''}</div>`
    : '';
  $('#classes-body').innerHTML = classes.length
    ? tomorrowLabel + classes.map(c => `<div class="class-card"><span class="class-name">${escapeHtml(c)}</span></div>`).join('')
    : (sched.classesPlaceholder
        ? '<p class="class-empty">No classes on the calendar yet. Once Aakash entries land on your School calendar, they show up here.</p>'
        : '<p class="class-empty">No classes today.</p>');

  const exam = sched.exams?.[0];
  $('#exam-strip').innerHTML = exam
    ? `<div class="exam-strip"><span class="ex-date">${dayLabel(exam.date)}</span><span>${escapeHtml(exam.title)}</span></div>`
    : '';

  const sat = sched.saturday;
  $('#saturday-line').innerHTML = sat
    ? (sat.isHoliday
        ? `Saturday ${fmtDate(sat.date)}: <span class="hol">holiday</span> (${escapeHtml(sat.reason)})`
        : `Saturday ${fmtDate(sat.date)}: <b>regular school day</b>`)
    : '';
}

// ---------- Weather (fetched directly from Open-Meteo, mirrored backend shape) ----------
let weatherCache = null;
const WMO = code => ({
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Storm with hail', 99: 'Storm with hail'
})[code] || 'Unknown';

const dirName = deg => ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(deg / 22.5) % 16];

async function fetchWeather() {
  if (weatherCache) return weatherCache;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=13.1007&longitude=77.5963' +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m' +
    '&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,uv_index,visibility' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max' +
    '&timezone=Asia%2FKolkata';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.current) throw new Error('bad response from open-meteo');

  const nowIso = new Date().toISOString().slice(0, 13);
  const hourly = data.hourly.time.map((t, i) => ({
    time: t,
    temp: Math.round(data.hourly.temperature_2m[i]),
    feels: Math.round(data.hourly.apparent_temperature[i]),
    humidity: data.hourly.relative_humidity_2m[i],
    rainChance: data.hourly.precipitation_probability[i],
    rain: data.hourly.precipitation[i],
    code: data.hourly.weather_code[i],
    condition: WMO(data.hourly.weather_code[i]),
    wind: Math.round(data.hourly.wind_speed_10m[i]),
    gusts: Math.round(data.hourly.wind_gusts_10m[i]),
    uv: data.hourly.uv_index[i],
    visibility: data.hourly.visibility[i]
  }));
  const next24 = hourly.filter(h => h.time >= nowIso).slice(0, 24);

  const daily = data.daily.time.map((t, i) => ({
    date: t,
    code: data.daily.weather_code[i],
    condition: WMO(data.daily.weather_code[i]),
    max: Math.round(data.daily.temperature_2m_max[i]),
    min: Math.round(data.daily.temperature_2m_min[i]),
    feelsMax: Math.round(data.daily.apparent_temperature_max[i]),
    feelsMin: Math.round(data.daily.apparent_temperature_min[i]),
    sunrise: data.daily.sunrise[i],
    sunset: data.daily.sunset[i],
    uvMax: Math.round(data.daily.uv_index_max[i]),
    rainSum: data.daily.precipitation_sum[i],
    rainChance: data.daily.precipitation_probability_max[i],
    windMax: Math.round(data.daily.wind_speed_10m_max[i])
  }));

  const c = data.current;
  weatherCache = {
    location: 'Yelahanka, Bangalore',
    updated: new Date().toISOString(),
    current: {
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      humidity: c.relative_humidity_2m,
      condition: WMO(c.weather_code),
      code: c.weather_code,
      isDay: c.is_day === 1,
      rain: c.precipitation,
      cloud: c.cloud_cover,
      pressure: Math.round(c.pressure_msl),
      wind: Math.round(c.wind_speed_10m),
      windDir: dirName(c.wind_direction_10m),
      windDeg: c.wind_direction_10m,
      gusts: Math.round(c.wind_gusts_10m)
    },
    today: daily[0],
    hourly: next24,
    daily
  };
  return weatherCache;
}

// ---------- Weather strip ----------
async function loadWeatherStrip() {
  try {
    const w = await fetchWeather();
    if (w.error) { $('#w-cond').textContent = 'unavailable'; return; }
    $('#w-temp').textContent = `${w.current.temp}°`;
    $('#w-cond').textContent = w.current.condition;
    $('#w-range').textContent = `H ${w.today.max}° · L ${w.today.min}° · ${w.today.rainChance}% rain`;
  } catch {
    $('#w-cond').textContent = 'unavailable';
  }
}

// ---------- Stories ----------
function assignmentStory(a) {
  const meta = [a.subject, a.teacher].filter(Boolean).join('<span class="sep"></span>');
  const body = (a.content || a.summary || '');
  const firstLine = body.split('\n')[0].substring(0, 180);
  return `
    <article class="story" data-item-id="${a.id}" onclick="viewItem('${a.id}')">
      <h3 class="story-title">${escapeHtml(a.title)}</h3>
      ${meta ? `<div class="story-meta">${meta}</div>` : ''}
      ${firstLine ? `<p class="story-body">${escapeHtml(firstLine)}${body.length > 180 ? '…' : ''}</p>` : ''}
    </article>`;
}

const ACTION_WORDS = /\b(wear|uniform|dress|bring|carry|submit|attend|report|reach|assemble|leave|deadline|must|required|instructions?)\b/i;

function notificationStory(n) {
  const isAction = ACTION_WORDS.test(n.content || '');
  return `
    <article class="story ${isAction ? 'action-item' : ''}" data-item-id="${n.id}" onclick="viewItem('${n.id}')">
      <h3 class="story-title">${escapeHtml(n.title)}${isAction ? '<span class="exam-tag">action</span>' : ''}</h3>
      <div class="story-meta">${fmtDateTime(n.postedDate)}</div>
      <p class="story-body">${escapeHtml((n.content || '').substring(0, 220))}${(n.content || '').length > 220 ? '…' : ''}</p>
    </article>`;
}

function circularStory(c) {
  return `
    <article class="story" data-item-id="${c.id}" onclick="viewItem('${c.id}')">
      <h3 class="story-title">${escapeHtml(c.title)}${c.hasPdf ? '<span class="pdf-tag">PDF</span>' : ''}</h3>
      <div class="story-meta">${escapeHtml(c.category || '')}<span class="sep"></span>${fmtDate(c.postedDate)}</div>
    </article>`;
}

function renderBriefing(b) {
  const assignments = b.assignments || [];
  const notifs = b.notifications || [];
  const circs = b.circulars || [];
  const emails = b.emails || [];
  const news = b.news || [];

  itemRegistry.news = [];
  itemRegistry.emails = [];
  news.forEach(n => itemRegistry.add('news', n.id, n.title));
  emails.forEach(e => itemRegistry.add('emails', e.id, e.title));

  const narr = $('#sec-narrative');
  const today = new Date().toISOString().slice(0, 10);
  const todaysNotifs = notifs.filter(n => (n.postedDate || '').slice(0, 10) === today);
  const shown = todaysNotifs.length ? todaysNotifs : notifs.slice(0, 2);

  if (b.narrative) {
    narr.innerHTML = `<p class="narrative-text">${renderRichText(b.narrative, itemRegistry)}${b.narrativeStale ? ' <span class="muted" style="font-size:0.75em">(from earlier today)</span>' : ''}</p>`;
  } else {
    narr.innerHTML = `<p class="narrative-text muted">Briefing is being written. Check back after the next sync.</p>`;
  }

  $('#list-notifications').innerHTML = shown.length
    ? shown.slice(0, 3).map(n => wrapSwipe(notificationStory(n))).join('')
    : '<p class="empty-note">No notifications today. Older ones are in the School tab.</p>';

  $('#list-notifications-full').innerHTML = notifs.length
    ? notifs.map(n => wrapSwipe(notificationStory(n))).join('')
    : '<p class="empty-note">No notifications.</p>';

  $('#list-assignments').innerHTML = assignments.length
    ? assignments.map(a => wrapSwipe(assignmentStory(a))).join('')
    : '<p class="empty-note">No assignments on record.</p>';

  $('#list-circulars').innerHTML = circs.length
    ? circs.map(c => wrapSwipe(circularStory(c))).join('')
    : '<p class="empty-note">No circulars.</p>';

  $('#list-emails').innerHTML = emails.length
    ? emails.map(e => `
        <div class="rail-item" data-item-id="${e.id}">
          ${wrapSwipeInner(`
            <p class="rail-title">${escapeHtml(e.title)}</p>
            <p class="rail-sub">${escapeHtml(e.from || '')}</p>
            ${e.summary ? `<p class="rail-sub">${renderRichText(e.summary, itemRegistry)}</p>` : ''}
            ${e.gmailUrl ? `<p class="rail-sub"><a class="gmail-link" href="${e.gmailUrl}" target="_blank" rel="noopener">Open in Gmail ↗</a></p>` : ''}
          `, e.id)}
        </div>
      `).join('')
    : '<p class="empty-note">Inbox quiet.</p>';

  $('#list-news').innerHTML = news.length
    ? news.map(n => `
        <div class="rail-item" data-item-id="${n.id}">
          ${wrapSwipeInner(`
            <p class="rail-title"><a href="${escapeHtml(n.url || '#')}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${escapeHtml(n.title)}</a></p>
            <p class="rail-sub">${escapeHtml(n.sourceName || '')} · ${fmtDate(n.postedDate)}</p>
            ${n.summary ? `<p class="rail-sub">${renderRichText(n.summary, itemRegistry)}</p>` : ''}
          `, n.id)}
        </div>
      `).join('')
    : '<p class="empty-note">No stories today.</p>';

  initSwipe();
}

function wrapSwipe(html) {
  const idMatch = html.match(/data-item-id="([^"]+)"/);
  const id = idMatch ? idMatch[1] : '';
  return wrapSwipeInner(html, id);
}

function wrapSwipeInner(html, id) {
  return `
    <div class="swipe-wrap" data-del-id="${id}">
      <div class="swipe-del" onclick="swipeDelete('${id}')">Delete</div>
      <div class="swipe-content">${html}</div>
    </div>
  `;
}

// ---------- Swipe to delete (touch + mouse) ----------
function initSwipe() {
  $$('.swipe-wrap').forEach(wrap => {
    const content = wrap.querySelector('.swipe-content');
    if (!content || content.dataset.swipeInit) return;
    content.dataset.swipeInit = '1';

    let startX = 0, startY = 0, dx = 0, dragging = false, locked = null;
    const THRESHOLD = -90;

    const onStart = e => {
      if (e.target.closest('a, button')) return;
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX; startY = touch.clientY;
      dx = 0; locked = null; dragging = true;
      wrap.classList.add('swipe-ready');
      content.style.transition = 'none';
    };
    const onMove = e => {
      if (!dragging) return;
      const touch = e.touches ? e.touches[0] : e;
      const mx = touch.clientX - startX;
      const my = touch.clientY - startY;
      if (locked === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
        locked = Math.abs(mx) > Math.abs(my) ? 'x' : 'y';
      }
      if (locked !== 'x') return;
      dx = Math.min(0, mx);
      content.style.transform = `translateX(${dx}px)`;
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      content.style.transition = '';
      if (dx < THRESHOLD) {
        swipeDelete(wrap.dataset.delId, wrap);
      } else {
        content.style.transform = '';
        setTimeout(() => wrap.classList.remove('swipe-ready'), 250);
      }
    };

    content.addEventListener('touchstart', onStart, { passive: true });
    content.addEventListener('touchmove', onMove, { passive: false });
    content.addEventListener('touchend', onEnd);
    content.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  });
}

// Static site: no backend, so deletion just restores the row.
async function swipeDelete(id, wrapEl) {
  if (!id) return;
  wrapEl = wrapEl || document.querySelector(`.swipe-wrap[data-del-id="${id}"]`);
  if (!wrapEl) return;
  const content = wrapEl.querySelector('.swipe-content');
  if (content) {
    content.style.transition = '';
    content.style.transform = '';
  }
  setTimeout(() => wrapEl.classList.remove('swipe-ready'), 250);
  toast('Read-only (static site)');
}
window.swipeDelete = swipeDelete;

// ---------- Month calendar ----------
let monthEvents = [];
let selectedDay = null;

function computeMonthEvents() {
  const merged = [];
  for (const e of calEvents) {
    const isExam = /exam|test|akats|quiz/i.test(e.title);
    merged.push({ title: e.title, date: e.start, kind: isExam ? 'exam' : 'class' });
  }
  for (const h of holidaysList) {
    merged.push({ title: h.title, date: h.date, kind: 'holiday' });
  }
  const seen = new Set();
  return merged.filter(e => {
    const key = `${e.date}|${e.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadMonth() {
  monthEvents = computeMonthEvents();
  renderCalendar();
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  selectDay(todayKey);
}

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayNum = now.getDate();

  const eventsByDay = {};
  for (const e of monthEvents) {
    const key = (e.date || '').slice(0, 10);
    if (!eventsByDay[key]) eventsByDay[key] = [];
    eventsByDay[key].push(e);
  }

  const dows = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  let html = dows.map(d => `<span class="cal-dow">${d}</span>`).join('');
  for (let i = 0; i < startDow; i++) html += '<span class="cal-cell other"></span>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const evs = eventsByDay[key] || [];
    const kinds = [...new Set(evs.map(e => e.kind))];
    const dots = kinds.map(k => `<span class="cal-dot ${k}"></span>`).join('');
    html += `
      <button class="cal-cell ${d === todayNum ? 'today' : ''} ${selectedDay === key ? 'selected' : ''}"
              onclick="selectDay('${key}')">${d}${dots ? `<span class="cal-dots">${dots}</span>` : ''}</button>`;
  }
  $('#cal-grid').innerHTML = html;

  $('#cal-list').innerHTML = monthEvents.length
    ? monthEvents.map(e => `
        <div class="rail-item">
          <p class="rail-title">
            <span class="kind-badge ${e.kind}">${e.kind}</span>${escapeHtml(e.title)}
            ${/exam|test|akats/i.test(e.title) ? '<span class="exam-tag">exam</span>' : ''}
          </p>
          <p class="rail-sub">${dayLabel(e.date)}${e.location ? ' · ' + escapeHtml(e.location) : ''}</p>
        </div>
      `).join('')
    : '<p class="empty-note">Nothing scheduled.</p>';
}

function selectDay(key) {
  selectedDay = key;
  renderCalendar();
  const evs = monthEvents.filter(e => (e.date || '').slice(0, 10) === key);
  $('#cal-day-events').innerHTML = `
    <p class="cde-title">${new Date(key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    ${evs.length
      ? evs.map(e => `<div class="cde-item"><span class="kind-badge ${e.kind}">${e.kind}</span>${escapeHtml(e.title)}</div>`).join('')
      : '<p class="cde-empty">Nothing on this day.</p>'}
  `;
}
window.selectDay = selectDay;

// ---------- Accordions ----------
function toggleAcc(id) {
  const acc = $(`#${id}`);
  const wasOpen = acc.classList.contains('open');
  $$('.acc').forEach(a => a.classList.remove('open'));
  if (!wasOpen) acc.classList.add('open');
}
window.toggleAcc = toggleAcc;

// ---------- Pull to refresh (static: just reloads data) ----------
function initPullToRefresh() {
  const ptr = $('#ptr');
  const paper = document.querySelector('.paper');
  let startY = 0, pulling = false, distance = 0;
  const THRESHOLD = 80;

  window.addEventListener('touchstart', e => {
    if (window.scrollY > 2) return;
    startY = e.touches[0].clientY;
    pulling = true;
    paper.classList.add('pulling');
  }, { passive: true });

  window.addEventListener('touchmove', e => {
    if (!pulling) return;
    distance = e.touches[0].clientY - startY;
    if (distance > 0 && window.scrollY <= 2) {
      const clamped = Math.min(distance * 0.5, 100);
      paper.style.transform = `translateY(${clamped}px)`;
      ptr.style.transform = `translateY(${Math.max(0, clamped)}px)`;
      ptr.querySelector('.ptr-label').textContent = distance > THRESHOLD * 2 ? 'Release to refresh' : 'Pull to refresh';
    }
  }, { passive: true });

  window.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    paper.classList.remove('pulling');
    if (distance > THRESHOLD) {
      ptr.classList.add('loading');
      ptr.querySelector('.ptr-label').textContent = 'Refreshing…';
      toast('Refreshing…');
      window.location.reload();
      ptr.style.transform = '';
      paper.style.transform = '';
    } else {
      ptr.style.transform = '';
      paper.style.transform = '';
    }
  });
}

// ---------- Full weather tab ----------
async function loadWeatherFull() {
  const el = $('#weather-full');
  try {
    const w = await fetchWeather();
    if (w.error) { el.innerHTML = '<p class="empty-note">Weather unavailable.</p>'; return; }

    const c = w.current;
    const hours = w.hourly || [];
    const nowHour = new Date().toISOString().slice(0, 13);

    el.innerHTML = `
      <div class="wx-hero">
        <div class="wx-hero-temp">${c.temp}°</div>
        <div class="wx-hero-cond">${c.condition}</div>
        <div class="wx-hero-sub">Feels like ${c.feels}° · H ${w.today.max}° L ${w.today.min}° · ${w.location}</div>
      </div>
      <div class="wx-grid">
        <div class="wx-cell"><span class="lbl">Humidity</span><span class="val">${c.humidity}%</span></div>
        <div class="wx-cell"><span class="lbl">Wind</span><span class="val">${c.wind} ${c.windDir}</span></div>
        <div class="wx-cell"><span class="lbl">Gusts</span><span class="val">${c.gusts}</span></div>
        <div class="wx-cell"><span class="lbl">Pressure</span><span class="val">${c.pressure}</span></div>
        <div class="wx-cell"><span class="lbl">Cloud</span><span class="val">${c.cloud}%</span></div>
        <div class="wx-cell"><span class="lbl">UV max</span><span class="val">${w.today.uvMax}</span></div>
        <div class="wx-cell"><span class="lbl">Rain today</span><span class="val">${w.today.rainSum ?? 0} mm</span></div>
        <div class="wx-cell"><span class="lbl">Rain chance</span><span class="val">${w.today.rainChance}%</span></div>
        <div class="wx-cell"><span class="lbl">Sunrise</span><span class="val">${w.today.sunrise?.slice(11, 16)}</span></div>
        <div class="wx-cell"><span class="lbl">Sunset</span><span class="val">${w.today.sunset?.slice(11, 16)}</span></div>
      </div>
      <h2 class="section-head">Next 24 Hours</h2>
      <div class="rule-light"></div>
      <div class="wx-h-scroll">
        ${hours.map(h => `
          <div class="wx-hour ${h.time.startsWith(nowHour) ? 'now' : ''}">
            <div class="h-time">${h.time.slice(11, 16)}</div>
            <div class="h-temp">${h.temp}°</div>
            <div class="h-rain">${h.rainChance}%</div>
          </div>
        `).join('')}
      </div>
      <h2 class="section-head">7 Day Forecast</h2>
      <div class="rule-light"></div>
      <div>
        ${(w.daily || []).map((d, i) => `
          <div class="wx-day">
            <span class="d-name">${i === 0 ? 'Today' : new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span>
            <span class="d-cond">${d.condition}</span>
            <span class="d-rain">${d.rainChance}%</span>
            <span class="d-range">${d.max}° <span class="lo">${d.min}°</span></span>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="empty-note">Weather failed: ${escapeHtml(err.message)}</p>`;
  }
}

// ---------- Load ----------
async function loadAll() {
  setDateline();

  try {
    await loadStaticData();
  } catch (err) {
    $('#list-notifications').innerHTML = `<p class="empty-note" style="color:var(--accent)">Could not load briefing data.</p>`;
    return;
  }

  try {
    renderSchedule(computeSchedule());
  } catch {
    $('#classes-body').innerHTML = '<p class="class-empty">Schedule unavailable.</p>';
  }

  if (briefingData) {
    renderBriefing(briefingData);
  } else {
    $('#list-notifications').innerHTML = `<p class="empty-note" style="color:var(--accent)">Edition unavailable.</p>`;
  }

  loadMonth();
  loadWeatherStrip();

  try {
    const when = briefingData?.generatedAt
      ? new Date(briefingData.generatedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
      : '';
    $('#footer-status').textContent = when ? `data from ${when} · static site` : 'static site';
  } catch {
    $('#footer-status').textContent = 'static site';
  }
}

// ---------- Modal ----------
async function viewItem(id) {
  const i = itemsById.get(id);
  if (!i) { toast('Item not found'); return; }
  const meta = i.metadata || {};
  let extra = '';

  const attachments = [];
  if (i.type === 'email' && meta.gmailUrl) {
    attachments.push(`<button class="btn" onclick="window.open('${escapeHtml(meta.gmailUrl)}','_blank')">Open in Gmail</button>`);
  }
  if (i.type === 'news' && meta.url) {
    attachments.push(`<button class="btn" onclick="window.open('${escapeHtml(meta.url)}','_blank')">Read article</button>`);
  }

  const isNps = i.source === 'nps';
  const bodyHtml = i.type === 'email'
    ? ''
    : `${!isNps && i.summary ? `<h2 class="rail-head">Summary</h2><div class="rule-light"></div><div class="content-block">${renderRichText(i.summary, itemRegistry)}</div>` : ''}
       <h2 class="rail-head">Content</h2><div class="rule-light"></div>
       <div class="content-block">${escapeHtml(i.content || '(empty)')}</div>`;

  $('#modal-content').innerHTML = `
    <span class="type-tag">${i.source} / ${i.type}</span>
    <h3>${escapeHtml(i.title || '')}</h3>
    <div class="kv"><b>Posted</b> ${fmtDateTime(i.postedDate)}</div>
    ${meta.subject ? `<div class="kv"><b>Subject</b> ${escapeHtml(meta.subject)}</div>` : ''}
    ${meta.teacher ? `<div class="kv"><b>Teacher</b> ${escapeHtml(meta.teacher)}</div>` : ''}
    ${meta.from ? `<div class="kv"><b>From</b> ${escapeHtml(meta.from)}</div>` : ''}
    ${meta.sourceName ? `<div class="kv"><b>Source</b> ${escapeHtml(meta.sourceName)}</div>` : ''}
    ${meta.category ? `<div class="kv"><b>Category</b> ${escapeHtml(meta.category)}</div>` : ''}
    ${bodyHtml}
    ${extra}
    ${attachments.length ? `<div class="btn-row">${attachments.join('')}</div>` : ''}
  `;
  openModal();
}
window.viewItem = viewItem;
window.jumpTo = jumpTo;
window.closeModal = closeModal;

function openModal() {
  const m = $('#modal');
  m.classList.remove('hidden');
  void m.offsetWidth;
  m.classList.add('opening');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const m = $('#modal');
  m.classList.remove('opening');
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
initPullToRefresh();
loadAll();
