const API = 'http://localhost:3000/api';

const AD_PATTERNS = [
  /\b\d{1,3}\s*%\s*(off|discount)\b/i,
  /\bsale\b/i,
  /\bdiscount\b/i,
  /\bpromo(tion(al)?|code)?\b/i,
  /\boffer(s)?\b/i,
  /\bunsubscribe\b/i,
  /\blimited\s+(time|period|stock)\b/i,
  /\bflash\s+sale\b/i,
  /\b(buy|shop|order)\s+now\b/i,
  /\bfree\s+shipping\b/i,
  /\bcoupon\b/i,
  /\bcash\s?back\b/i,
  /\bdeal(s)?\s*(of\s+the\s+day|alert|zone)?\b/i,
  /\bexclusive\s+(offer|deal|access)\b/i,
  /\bspecial\s+(offer|promotion|price)\b/i,
  /\blast\s+chance\b/i,
  /\bdon'?t\s+miss\b/i,
  /\bexpires?\s+(today|soon|tonight|in\s+\d+)/i,
  /\bhurry\b/i,
  /\bact\s+now\b/i,
  /\bnewsletter\b/i,
  /\bwebinar\b/i,
  /\bnew\s+arrivals?\b/i,
  /\bjust\s+dropped\b/i,
  /\bback\s+in\s+stock\b/i,
  /\bprice\s+drop\b/i,
  /\blowest\s+price\b/i,
  /\bclearance\b/i,
  /\bbest\s+sellers?\b/i,
  /\btop\s+deals\b/i,
  /\bsavings?\b/i,
  /\breward\s+points?\b/i,
  /\bearn\s+rewards?\b/i,
  /\bgift\s+card\b/i,
  /\brefer\s+a\s+friend\b/i,
  /\blucky\s+(draw|winner)\b/i,
  /\byou\s+(have\s+)?won\b/i,
  /\bprize\b/i,
  /\bfree\s+trial\b/i,
  /\bupgrade\s+now\b/i,
  /\brenew(al| your)\s+(now|subscription|plan)\b/i,
  /\bsign\s*up\s+now\b/i,
  /\bsubscribe\s+(now|today)\b/i,
  /\bno[-.]?reply@|noreply@|marketing@|news@|promo@|offers@/i,
  /\bunsubscri(be|ption)\s+(here|link|from)\b/i,
  /\bemail\s+preferences\b/i,
  /\bview\s+in\s+browser\b/i,
  /\bstarted\s+with\s+mailchimp\b/i
];

const SWIPE_OPEN_W = 84;
const SWIPE_FULL_DELETE_W = 150;
const SWIPE_MAX_W = 170;

let currentTab = 'briefing';
let allItems = [];
let calendarEvents = [];
let calendarDate = new Date();
let selectedDay = null;
let isSyncing = false;
let lastWeatherData = null;

async function init() {
  ensureSwipeStyles();
  setGreeting();
  setupPullToRefresh();
  await Promise.all([loadWeather(), loadMetrics()]);
  loadBriefing().then(b => { window._briefingData = b; renderItems(allItems, currentTab); });
}

function ensureSwipeStyles() {
  if (document.getElementById('swipe-styles')) return;
  const style = document.createElement('style');
  style.id = 'swipe-styles';
  style.textContent = `
    .item-card.swipe-card { position: relative; overflow: hidden; padding: 0; }
    .item-card.swipe-card .swipe-content {
      position: relative; z-index: 1;
      background: var(--card);
      border-radius: var(--radius-card);
      padding: 16px;
      transform: translateX(0);
      transition: transform 0.25s ease;
      will-change: transform;
    }
    .item-card.swipe-card.read .swipe-content { opacity: 0.5; }
    .item-card.swiping .swipe-content { transition: none; }
    .item-card .swipe-delete-bg {
      position: absolute; top: 0; right: 0; bottom: 0; left: 0;
      background: linear-gradient(90deg, rgba(239, 68, 68, 0.55), #EF4444);
      display: flex; align-items: center; justify-content: flex-end;
      gap: 8px; padding-right: 24px;
      color: #fff; font-size: 0.72rem; font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase;
      border-radius: var(--radius-card);
      opacity: 0; transition: opacity 0.2s ease;
      pointer-events: none;
    }
    .item-card.swipe-open .swipe-delete-bg { opacity: 1; pointer-events: auto; }
  `;
  document.head.appendChild(style);
}

function condLabel(c) {
  if (!c) return 'N/A';
  const low = c.toLowerCase();
  if (low.includes('sunny')) return 'Sunny';
  if (low.includes('clear')) return 'Clear';
  if (low.includes('partly')) return 'Partly Cloudy';
  if (low.includes('overcast')) return 'Overcast';
  if (low.includes('cloudy')) return 'Cloudy';
  if (low.includes('mist') || low.includes('fog')) return 'Mist';
  if (low.includes('thunder')) return 'Thunderstorm';
  if (low.includes('heavy')) return 'Heavy Rain';
  if (low.includes('light rain') || low.includes('drizzle') || low.includes('light shower')) return 'Light Rain';
  if (low.includes('rain') || low.includes('shower')) return 'Rain';
  if (low.includes('patchy rain')) return 'Patchy Rain';
  return c;
}

async function loadWeather() {
  try {
    const res = await fetch(`${API}/weather`);
    const w = await res.json();
    lastWeatherData = w;
    const el = document.getElementById('weather-section');
    if (!el) return;

    const cond = condLabel(w.condition);
    const icon = weatherIconHtml(cond, '1.6rem');

    const hourlyHtml = (w.hourly || []).slice(0, 8).map(h => {
      const hr = Math.floor(parseInt(h.time) / 100);
      const ampm = hr >= 12 ? 'pm' : 'am';
      const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
      const rain = parseInt(h.chanceOfRain) > 20 ? `<span class="weather-rain">${h.chanceOfRain}%</span>` : '';
      return `<div class="weather-hour"><span class="weather-hour-time">${h12}${ampm}</span><span class="weather-hour-temp">${h.temp}&deg;</span>${rain}</div>`;
    }).join('');

    el.innerHTML = `
      <div class="weather-main" onclick="openDetail('weather', null)" style="cursor:pointer">
        <span class="weather-icon">${icon}</span>
        <div class="weather-temp-block">
          <span class="weather-temp">${w.temp}&deg;</span>
          <span class="weather-cond">${esc(w.condition)}</span>
        </div>
        <div class="weather-details">
          <span class="weather-hi-lo">H:${w.maxTemp}&deg; L:${w.minTemp}&deg;</span>
          <span class="weather-meta">${w.humidity}% humidity &middot; ${w.wind} km/h ${w.windDir || ''}</span>
        </div>
      </div>
      <div class="weather-hourly">${hourlyHtml}</div>
    `;
  } catch (err) {
    console.error('Weather load failed:', err);
  }
}

function weatherIconHtml(cond, size) {
  const s = size || '1rem';
  const svgs = {
    'Sunny': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    'Clear': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
    'Partly Cloudy': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="2" stroke-linecap="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
    'Cloudy': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
    'Overcast': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`,
    'Mist': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2" stroke-linecap="round"><line x1="3" y1="10" x2="21" y2="10"/><line x1="5" y1="14" x2="19" y2="14"/><line x1="7" y1="18" x2="17" y2="18"/></svg>`,
    'Rain': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" stroke-width="2" stroke-linecap="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>`,
    'Light Rain': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2" stroke-linecap="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>`,
    'Heavy Rain': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><line x1="20" y1="16" x2="20" y2="18"/><line x1="4" y1="16" x2="4" y2="18"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>`,
    'Thunderstorm': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#FACC15" stroke-width="2" stroke-linecap="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>`,
    'Patchy Rain': `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="#93C5FD" stroke-width="2" stroke-linecap="round"><line x1="16" y1="13" x2="16" y2="17"/><line x1="8" y1="13" x2="8" y2="17"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>`
  };
  return svgs[cond] || svgs['Cloudy'];
}

function setGreeting() {
  const h = new Date().getHours();
  let greet = 'Good evening';
  if (h < 12) greet = 'Good morning';
  else if (h < 17) greet = 'Good afternoon';
  const el = document.getElementById('greeting-text');
  if (el) el.textContent = `${greet}, Nithilan`;
  const dateEl = document.getElementById('current-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function setupPullToRefresh() {
  const feed = document.getElementById('items-list');
  if (!feed) return;
  let startY = 0;
  let pulling = false;

  feed.addEventListener('touchstart', (e) => {
    if (window.scrollY === 0 && !isSyncing) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  feed.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const diff = e.touches[0].clientY - startY;
    if (diff > 0 && diff < 150) {
      const refresh = document.getElementById('pull-refresh');
      const spinner = document.getElementById('pull-spinner');
      if (refresh) {
        refresh.classList.add('visible');
        refresh.style.height = Math.min(diff, 80) + 'px';
        refresh.style.opacity = Math.min(diff / 60, 1);
        if (spinner) spinner.style.transform = `rotate(${diff * 3}deg)`;
      }
    }
  }, { passive: true });

  feed.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    const refresh = document.getElementById('pull-refresh');
    const diff = parseInt(refresh?.style.height || '0');
    if (diff > 60) {
      doSync();
    } else {
      hidePullRefresh();
    }
  });
}

function hidePullRefresh() {
  const refresh = document.getElementById('pull-refresh');
  if (refresh) {
    refresh.classList.remove('visible', 'loading');
    refresh.style.height = '0';
    refresh.style.opacity = '0';
  }
}

async function doSync() {
  if (isSyncing) return;
  isSyncing = true;
  const refresh = document.getElementById('pull-refresh');
  const text = document.getElementById('pull-text');
  if (refresh) { refresh.classList.add('visible', 'loading'); refresh.style.height = '56px'; refresh.style.opacity = '1'; }
  if (text) text.textContent = 'Syncing...';

  try {
    await fetch(`${API}/sync`, { method: 'POST' });
    if (text) text.textContent = 'Analyzing...';
    await fetch(`${API}/whatsapp/analyze`, { method: 'POST' }).catch(() => {});
    if (text) text.textContent = 'Done';
    await loadWeather();
    await loadMetrics();
    loadBriefing().then(b => { window._briefingData = b; renderItems(allItems, currentTab); });
    showToast('Synced');
    setTimeout(hidePullRefresh, 600);
  } catch (err) {
    if (text) text.textContent = 'Sync failed';
    setTimeout(hidePullRefresh, 1500);
  } finally {
    isSyncing = false;
  }
}

function showHideSections(tab) {
  const greeting = document.getElementById('greeting-section');
  const weather = document.getElementById('weather-section');
  const show = tab === 'briefing';
  if (greeting) {
    greeting.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    greeting.style.opacity = show ? '1' : '0';
    greeting.style.transform = show ? 'translateY(0)' : 'translateY(-6px)';
    setTimeout(() => { greeting.style.display = show ? 'flex' : 'none'; }, show ? 0 : 200);
  }
  if (weather) {
    weather.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    weather.style.opacity = show ? '1' : '0';
    weather.style.transform = show ? 'translateY(0)' : 'translateY(-6px)';
    setTimeout(() => { weather.style.display = show ? 'block' : 'none'; }, show ? 0 : 200);
  }
}

async function loadMetrics() {
  try {
    const res = await fetch(`${API}/summaries?limit=200`);
    const data = await res.json();
    allItems = Array.isArray(data) ? data : [];
    renderItems(allItems, currentTab);
  } catch (err) { console.error(err); }
}

async function loadBriefing() {
  try {
    const res = await fetch(`${API}/briefing`);
    return await res.json();
  } catch (err) { console.error('Briefing failed:', err); return null; }
}

function isAd(item) {
  if (!item || item.source !== 'gmail') return false;
  const haystack = `${item.title || ''} ${item.summary || ''} ${item.content || ''}`;
  return AD_PATTERNS.some(p => p.test(haystack));
}

function renderItems(items, tab) {
  const list = document.getElementById('items-list');
  if (!list) return;
  list.innerHTML = '';

  if (tab === 'briefing') {
    renderBriefing(items, list);
  } else if (tab === 'school') {
    renderSchool(items, list);
  } else if (tab === 'email') {
    renderEmail(items, list);
  } else if (tab === 'calendar') {
    renderCalendar(list);
  } else if (tab === 'civic') {
    renderCivic(items.filter(i => i.source === 'politics'), list);
  } else if (tab === 'whatsapp') {
    renderWhatsApp(items.filter(i => i.source === 'whatsapp'), list);
  }

  if (tab === 'briefing' && !window._briefingData) {
    loadBriefing().then(b => { window._briefingData = b; renderItems(items, tab); });
  }
}

function renderBriefing(items, list) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayItems = items.filter(i => !isAd(i) && new Date(i.createdAt) >= today);

  const newsItems = todayItems.filter(i => i.source === 'politics');
  const npsItems = todayItems.filter(i => i.source === 'nps');
  const aakashItems = items.filter(i => i.source === 'whatsapp' && (i.metadata?.aiSubject || i.metadata?.aiActionable));
  const emailItems = todayItems.filter(i => i.source === 'gmail');

  // Smart Daily Brief
  const brief = window._briefingData;
  if (brief) {
    const briefEl = document.createElement('div');
    briefEl.className = 'daily-brief';

    let briefLines = [];

    if (brief.todaySchedule && brief.todaySchedule.length > 0) {
      const schedHtml = brief.todaySchedule.map(s => {
        const typeBadge = s.type === 'test' ? '<span class="brief-badge brief-test">TEST</span>' : s.type === 'assignment' ? '<span class="brief-badge brief-assignment">HW</span>' : '';
        return `<div class="brief-line">${typeBadge}<span class="brief-subject">${esc(s.subject)}</span><span class="brief-time">${esc(s.time || '')}</span></div>`;
      }).join('');
      briefLines.push(`<div class="brief-section"><div class="brief-section-label">Today</div>${schedHtml}</div>`);
    }

    if (brief.dueSoon && brief.dueSoon.length > 0) {
      const dueHtml = brief.dueSoon.map(d => {
        const dueDate = new Date(d.dueDate + 'T00:00:00');
        const diffMs = dueDate - today;
        const daysUntil = Math.round(diffMs / 86400000);
        const urgency = daysUntil <= 0 ? 'brief-urgent' : daysUntil === 1 ? 'brief-soon' : '';
        const dueText = daysUntil < 0 ? 'OVERDUE' : daysUntil === 0 ? 'DUE TODAY' : daysUntil === 1 ? 'Due tomorrow' : `Due in ${daysUntil}d`;
        return `<div class="brief-line ${urgency}"><span class="brief-badge brief-test">TEST</span><span class="brief-subject">${esc(d.subject || d.title)}</span><span class="brief-due">${dueText}</span></div>`;
      }).join('');
      briefLines.push(`<div class="brief-section"><div class="brief-section-label">Due Soon</div>${dueHtml}</div>`);
    }

    if (brief.attachments && brief.attachments.length > 0) {
      const attachHtml = brief.attachments.map(a => `<div class="brief-line"><span class="brief-badge brief-doc">PDF</span><span class="brief-subject">${esc(a.filename || a.title)}</span></div>`).join('');
      briefLines.push(`<div class="brief-section"><div class="brief-section-label">Aakash Notes</div>${attachHtml}</div>`);
    }

    if (briefLines.length === 0) {
      briefLines = ['<div class="brief-empty">All clear for today</div>'];
    }

    briefEl.innerHTML = `
      <div class="brief-header">
        <span class="brief-day">${brief.dayOfWeek || today.toLocaleDateString('en-US', { weekday: 'long' })}</span>
        <span class="brief-date">${brief.date}</span>
      </div>
      ${briefLines.join('')}
    `;
    list.appendChild(briefEl);
  }

  const boxes = document.createElement('div');
  boxes.className = 'summary-boxes';
  boxes.appendChild(makeSummaryBox('Civic News', newsItems.length, newsItems.slice(0, 3), 'politics'));
  boxes.appendChild(makeSummaryBox('NPS', npsItems.length, npsItems.slice(0, 3), 'nps'));
  boxes.appendChild(makeSummaryBox('Aakash', aakashItems.length, aakashItems.slice(0, 3), 'aakash'));
  list.appendChild(boxes);

  if (emailItems.length > 0) {
    const emailSection = document.createElement('div');
    emailSection.className = 'briefing-email-section';
    emailSection.innerHTML = `<div class="section-header"><h2>Inbox</h2><span class="count-badge">${emailItems.length}</span></div>`;
    emailItems.slice(0, 5).forEach(item => emailSection.appendChild(createCompactCard(item)));
    if (emailItems.length > 5) {
      const more = document.createElement('button');
      more.className = 'see-all-btn';
      more.textContent = `See all ${emailItems.length} emails`;
      more.onclick = () => switchTab('email', document.querySelector('[data-tab="email"]'));
      emailSection.appendChild(more);
    }
    list.appendChild(emailSection);
  }
}

function makeSummaryBox(title, count, items, source) {
  const box = document.createElement('div');
  box.className = 'summary-box';
  box.onclick = () => {
    if (source === 'politics') switchTab('civic', document.querySelector('[data-tab="civic"]'));
    else switchTab('school', document.querySelector('[data-tab="school"]'));
  };

  let itemsHtml = '';
  if (items.length === 0) {
    itemsHtml = '<div class="summary-empty">Nothing new today</div>';
  } else {
    itemsHtml = items.map(i => `<div class="summary-item">${esc(i.title)}</div>`).join('');
  }

  box.innerHTML = `
    <div class="summary-box-header">
      <span class="summary-box-title">${title}</span>
      ${count > 0 ? `<span class="summary-box-count">${count}</span>` : ''}
    </div>
    <div class="summary-box-items">${itemsHtml}</div>
  `;
  return box;
}

function createCompactCard(item) {
  const card = document.createElement('div');
  card.className = 'item-card compact-card stagger-in';
  const body = (item.summary || item.content || '').substring(0, 120);
  card.innerHTML = `
    <div class="compact-card-inner">
      <div class="compact-card-dot"></div>
      <div class="compact-card-content">
        <h4>${esc(item.title)}</h4>
        <p>${esc(body)}</p>
      </div>
      <span class="compact-card-time">${fmtTime(item.createdAt)}</span>
    </div>
  `;
  card.onclick = () => openDetail('email', item);
  return card;
}

function renderSchool(items, list) {
  const npsItems = items.filter(i => i.source === 'nps');

  const npsHeader = document.createElement('div');
  npsHeader.className = 'section-header';
  npsHeader.innerHTML = `<h2>NPS</h2>`;
  list.appendChild(npsHeader);

  if (npsItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state small';
    empty.innerHTML = `<h3>No assignments</h3><p>Sync to fetch from the portal.</p>`;
    list.appendChild(empty);
  } else {
    npsItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'item-card swipe-card stagger-in' + (item.isRead ? ' read' : '');
      card.dataset.id = item._id;

      const delBg = document.createElement('div');
      delBg.className = 'swipe-delete-bg';
      delBg.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg><span>Delete</span>`;
      delBg.addEventListener('click', (e) => {
        e.stopPropagation();
        if (card.classList.contains('swipe-open')) deleteItem(item._id, card);
      });

      const content = document.createElement('div');
      content.className = 'swipe-content';

      const dueHtml = item.dueDate ? `<span class="meta-due">Due ${new Date(item.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>` : '';
      const teacherHtml = item.metadata?.teacher ? `<span class="meta-teacher">${esc(item.metadata.teacher)}</span>` : '';
      const subjectHtml = item.metadata?.subject ? `<span class="subject-tag">${esc(item.metadata.subject)}</span>` : '';

      content.innerHTML = `
        <div class="school-card-row">
          <div class="school-card-left">
            <h3>${esc(item.title)}</h3>
            <div class="school-card-meta">${subjectHtml}${teacherHtml}${dueHtml}</div>
          </div>
          ${item.metadata?.downloadUrl ? `<button class="download-btn" onclick="event.stopPropagation(); handleDownload(event, '${item._id}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>` : ''}
        </div>
      `;

      content.addEventListener('click', () => {
        if (suppressNextClick) { suppressNextClick = false; return; }
        if (card.classList.contains('swipe-open')) { setSwipe(card, 0); return; }
        openDetail('nps', item);
      });

      attachSwipeHandlers(card, content);
      card.appendChild(delBg);
      card.appendChild(content);
      list.appendChild(card);
    });
  }

  const aakashDivider = document.createElement('div');
  aakashDivider.className = 'section-divider';
  aakashDivider.innerHTML = `<h2>Aakash</h2>`;
  list.appendChild(aakashDivider);

  const aakashItems = [
    { title: 'JEE Mock Test \u2014 Physics', subject: 'Physics' },
    { title: 'JEE Mock Test \u2014 Chemistry', subject: 'Chemistry' },
    { title: 'JEE Mock Test \u2014 Mathematics', subject: 'Mathematics' },
    { title: 'Weekly Study Plan', subject: 'All Subjects' },
    { title: 'DPP / Worksheets', subject: 'All Subjects' }
  ];

  aakashItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card placeholder-card stagger-in';
    card.innerHTML = `
      <div class="school-card-row">
        <div class="school-card-left">
          <h3>${esc(item.title)}</h3>
          <div class="school-card-meta"><span class="subject-tag">${esc(item.subject)}</span></div>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

function renderEmail(items, list) {
  const gmailItems = items.filter(i => i.source === 'gmail' && !isAd(i));
  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<h2>Inbox</h2>`;
  list.appendChild(header);
  if (gmailItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state small';
    empty.innerHTML = `<h3>No emails</h3><p>Your inbox is clean.</p>`;
    list.appendChild(empty);
  } else {
    gmailItems.forEach(item => list.appendChild(createCard(item)));
  }
}

function renderCivic(items, list) {
  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<h2>Civic News</h2>`;
  list.appendChild(header);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayItems = items.filter(i => new Date(i.createdAt) >= today);
  if (todayItems.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state small';
    empty.innerHTML = `<h3>No news yet</h3><p>Today's stories will appear here after sync.</p>`;
    list.appendChild(empty);
  } else {
    todayItems.forEach(item => list.appendChild(createCard(item)));
  }
}

function renderWhatsApp(items, list) {
  const header = document.createElement('div');
  header.className = 'section-header';
  header.innerHTML = `<h2>WhatsApp</h2>`;
  list.appendChild(header);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state small';
    empty.innerHTML = `<h3>No messages</h3><p>Sync to fetch from your groups.</p>`;
    list.appendChild(empty);
    return;
  }

  const important = items.filter(i => {
    const t = i.metadata?.aiType;
    if (t && ['timetable', 'test', 'assignment', 'worksheet', 'announcement', 'class_update'].includes(t)) return true;
    if (i.metadata?.aiActionable) return true;
    if (i.metadata?.aiSchedule?.length > 0) return true;
    if (i.metadata?.aiDueDate) return true;
    if (i.metadata?.aiAttachment) return true;
    return false;
  });

  const groups = {};
  important.forEach(item => {
    const grp = item.metadata?.groupName || 'Unknown Group';
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(item);
  });

  Object.entries(groups).forEach(([groupName, msgs]) => {
    const grpHeader = document.createElement('div');
    grpHeader.className = 'section-label';
    grpHeader.textContent = groupName;
    list.appendChild(grpHeader);

    msgs.forEach(item => {
      const card = document.createElement('div');
      card.className = 'item-card compact-card stagger-in';

      const author = item.metadata?.author || 'Unknown';
      const aiType = item.metadata?.aiType || 'other';
      const aiSubject = item.metadata?.aiSubject;
      const aiActionable = item.metadata?.aiActionable;
      const aiSummary = item.metadata?.aiSummary;
      const aiDueDate = item.metadata?.aiDueDate;
      const body = aiSummary || item.content || item.summary || '';
      const screenshot = item.metadata?.screenshotFile;
      const attachment = item.metadata?.aiAttachment;

      let typeBadge = '';
      if (screenshot) typeBadge = `<span class="whatsapp-type-badge">image</span>`;
      else if (attachment) typeBadge = `<span class="whatsapp-type-badge">PDF</span>`;
      else if (aiType === 'timetable') typeBadge = `<span class="whatsapp-type-badge" style="background:rgba(250,204,21,0.15);color:#FACC15">timetable</span>`;
      else if (aiType === 'test') typeBadge = `<span class="whatsapp-type-badge" style="background:rgba(239,68,68,0.15);color:#EF4444">test</span>`;
      else if (aiType === 'assignment') typeBadge = `<span class="whatsapp-type-badge" style="background:rgba(59,130,246,0.15);color:#3B82F6">assignment</span>`;
      else if (aiType === 'worksheet') typeBadge = `<span class="whatsapp-type-badge" style="background:rgba(34,197,94,0.15);color:#22C55E">worksheet</span>`;
      else if (aiType === 'announcement') typeBadge = `<span class="whatsapp-type-badge" style="background:rgba(168,85,247,0.15);color:#A855F7">announcement</span>`;
      else if (aiType === 'class_update') typeBadge = `<span class="whatsapp-type-badge" style="background:rgba(196,164,132,0.15);color:var(--gold)">info</span>`;
      else if (aiActionable) typeBadge = `<span class="whatsapp-type-badge" style="background:rgba(196,164,132,0.15);color:var(--gold)">action</span>`;

      let subjectTag = aiSubject ? `<span class="subject-tag">${esc(aiSubject)}</span>` : '';
      let dueTag = aiDueDate ? `<span class="meta-due">Due ${new Date(aiDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>` : '';

      let screenshotHtml = '';
      if (screenshot) {
        screenshotHtml = `<img src="${API}/media/${screenshot}" class="wa-thumb" loading="lazy" />`;
      }

      card.innerHTML = `
        <div class="compact-card-inner">
          <div class="compact-card-dot" style="background:#25D366"></div>
          <div class="compact-card-content">
            <h4>${esc(author.split('@')[0])} ${typeBadge} ${subjectTag} ${dueTag}</h4>
            <p>${esc(body.substring(0, 160))}</p>
            ${attachment ? `<span class="wa-attachment-badge">${esc(attachment)}</span>` : ''}
            ${screenshotHtml}
          </div>
          <span class="compact-card-time">${fmtTime(item.createdAt)}</span>
        </div>
      `;
      card.onclick = () => openDetail('whatsapp', item);
      list.appendChild(card);
    });
  });

  const junkCount = items.length - important.length;
  if (junkCount > 0) {
    const junkLabel = document.createElement('div');
    junkLabel.className = 'section-label';
    junkLabel.style.color = 'var(--text-dark)';
    junkLabel.style.fontSize = '0.55rem';
    junkLabel.textContent = `${junkCount} other messages hidden`;
    list.appendChild(junkLabel);
  }
}

function createCard(item) {
  const card = document.createElement('div');
  card.className = `item-card swipe-card stagger-in${item.isRead ? ' read' : ''}`;
  card.dataset.id = item._id;

  const delBg = document.createElement('div');
  delBg.className = 'swipe-delete-bg';
  delBg.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg><span>Delete</span>`;
  delBg.addEventListener('click', (e) => {
    e.stopPropagation();
    if (card.classList.contains('swipe-open')) deleteItem(item._id, card);
  });

  const content = document.createElement('div');
  content.className = 'swipe-content';

  let tagsHtml = `<span class="source-tag ${item.source}">${srcLabel(item.source)}</span>`;
  if (item.metadata?.subject) tagsHtml += `<span class="subject-tag">${esc(item.metadata.subject)}</span>`;

  let metaParts = [];
  if (item.metadata?.politician) metaParts.push(`<span class="meta-politician">${esc(item.metadata.politician)}</span>`);
  if (item.metadata?.teacher) metaParts.push(`<span class="meta-teacher">${esc(item.metadata.teacher)}</span>`);
  if (item.dueDate) metaParts.push(`<span class="meta-due">Due ${new Date(item.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`);

  const body = item.summary || item.content || '';
  content.innerHTML = `
    <div class="item-card-top">${tagsHtml}<span class="timestamp">${fmtTime(item.createdAt)}</span></div>
    <h3>${esc(item.title)}</h3>
    <div class="card-body">${esc(body)}</div>
    ${(metaParts.length || item.metadata?.downloadUrl) ? `<div class="card-meta">${metaParts.join('')}</div>` : ''}
  `;

  if (item.metadata?.downloadUrl) {
    const metaRow = content.querySelector('.card-meta') || (() => {
      const row = document.createElement('div');
      row.className = 'card-meta';
      content.appendChild(row);
      return row;
    })();
    const dlBtn = document.createElement('button');
    dlBtn.className = 'download-btn';
    dlBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download`;
    dlBtn.addEventListener('click', (e) => handleDownload(e, item._id));
    metaRow.appendChild(dlBtn);
  }

  content.addEventListener('click', () => {
    if (suppressNextClick) { suppressNextClick = false; return; }
    if (card.classList.contains('swipe-open')) { setSwipe(card, 0); return; }
    if (item.source === 'politics') openDetail('news', item);
    else if (item.source === 'gmail') openDetail('email', item);
    else openDetail('nps', item);
  });

  attachSwipeHandlers(card, content);
  card.appendChild(delBg);
  card.appendChild(content);
  return card;
}

let suppressNextClick = false;

function getTranslateX(el) {
  const t = window.getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  const m = t.match(/matrix\(([^)]+)\)/);
  return m ? parseFloat(m[1].split(',')[4]) || 0 : 0;
}

function setSwipe(card, x) {
  const content = card.querySelector('.swipe-content');
  if (!content) return;
  content.style.transform = `translateX(${x}px)`;
  card.classList.toggle('swipe-open', x < -10);
}

function closeOtherSwipes(exceptCard) {
  document.querySelectorAll('.item-card.swipe-open').forEach(c => {
    if (c !== exceptCard) setSwipe(c, 0);
  });
}

function attachSwipeHandlers(card, content) {
  let startX = 0, startY = 0, startT = 0, startTime = 0;
  let mode = null;
  let cur = 0;

  card.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    closeOtherSwipes(card);
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startT = getTranslateX(content);
    startTime = Date.now();
    cur = startT;
    mode = null;
  }, { passive: true });

  card.addEventListener('touchmove', (e) => {
    if (mode === 'y') return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!mode) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      mode = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (mode === 'x') card.classList.add('swiping');
    }
    if (mode !== 'x') return;

    cur = Math.max(-SWIPE_MAX_W, Math.min(0, startT + dx));
    content.style.transform = `translateX(${cur}px)`;
    card.classList.toggle('swipe-open', cur < -SWIPE_OPEN_W / 2);
  }, { passive: true });

  const onTouchEnd = () => {
    if (mode !== 'x') { mode = null; return; }
    card.classList.remove('swiping');
    const dt = Math.max(Date.now() - startTime, 1);
    const velocity = (cur - startT) / dt;
    const flickLeft = velocity < -0.45 && cur < startT - 10;

    if (cur <= -SWIPE_FULL_DELETE_W) {
      suppressNextClick = true;
      deleteItem(card.dataset.id, card);
    } else if (cur < -SWIPE_OPEN_W / 2 || flickLeft) {
      suppressNextClick = true;
      setSwipe(card, -SWIPE_OPEN_W);
    } else {
      suppressNextClick = cur !== startT;
      setSwipe(card, 0);
    }
    mode = null;
  };

  card.addEventListener('touchend', onTouchEnd);
  card.addEventListener('touchcancel', onTouchEnd);
}

function switchTab(tab, btn) {
  if (tab === currentTab) return;
  const feed = document.getElementById('items-list');
  feed.classList.add('tab-exit');

  setTimeout(() => {
    currentTab = tab;
    selectedDay = null;
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    showHideSections(tab);

    if (tab === 'calendar') {
      renderCalendar(feed);
    } else {
      renderItems(allItems, tab);
    }

    feed.classList.remove('tab-exit');
    feed.classList.add('tab-enter');
    setTimeout(() => feed.classList.remove('tab-enter'), 400);
  }, 200);
}

async function renderCalendar(list) {
  if (!list) list = document.getElementById('items-list');
  try {
    const res = await fetch(`${API}/calendar`);
    calendarEvents = await res.json();
  } catch (err) { calendarEvents = []; }

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const monthName = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const today = new Date(); today.setHours(0, 0, 0, 0);

  let html = `<div class="calendar-header"><h2>${monthName}</h2><div class="calendar-nav"><button onclick="calNav(-1)">&lsaquo;</button><button onclick="calNav(1)">&rsaquo;</button></div></div>`;
  html += '<div class="calendar-grid">';
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => html += `<div class="calendar-day-label">${d}</div>`);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventDates = new Map();
  calendarEvents.forEach(ev => {
    const d = new Date(ev.date);
    if (d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate();
      if (!eventDates.has(day)) eventDates.set(day, []);
      eventDates.get(day).push(ev);
    }
  });

  for (let i = 0; i < firstDay; i++) html += '<div class="calendar-day empty"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const thisDate = new Date(year, month, day);
    const cls = ['calendar-day'];
    if (thisDate.getTime() === today.getTime()) cls.push('today');
    if (thisDate < today) cls.push('past');
    if (eventDates.has(day)) cls.push('has-event');
    if (selectedDay === day) cls.push('selected');
    html += `<div class="${cls.join(' ')}" onclick="selectDay(${day})">${day}</div>`;
  }
  html += '</div>';

  if (selectedDay !== null) {
    const dayEvents = eventDates.get(selectedDay) || [];
    html += `<div class="day-detail-header"><button class="day-detail-back" onclick="selectDay(null)">&larr; Back</button><span class="day-detail-date">${new Date(year, month, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span></div>`;

    if (dayEvents.length > 0) {
      html += '<div class="calendar-events">';
      dayEvents.forEach(ev => {
        let icon = '';
        if (ev.type === 'holiday') icon = '<span class="event-icon holiday-icon">Holiday</span>';
        else if (ev.isHalfDay) icon = '<span class="event-icon halfday-icon">Half Day</span>';
        else icon = '<span class="event-icon assignment-icon">Assignment</span>';
        const meta = ev.subject ? `<div class="event-subject">${esc(ev.subject)}</div>` : '';
        const viewBtn = ev.type === 'assignment' ? `<button class="cal-view-btn" onclick="event.stopPropagation(); goToSchool('${esc(ev.title)}')">View assignment</button>` : '';
        html += `<div class="calendar-event"><div class="event-info"><h4>${esc(ev.title)}</h4>${meta}${icon}${viewBtn}</div></div>`;
      });
      html += '</div>';
    } else {
      html += `<div class="empty-state small"><h3>No events</h3><p>Nothing scheduled.</p></div>`;
    }
  } else {
    const upcoming = calendarEvents.filter(ev => ev.type === 'assignment' && new Date(ev.date) >= today);
    if (upcoming.length > 0) {
      html += '<div class="calendar-events"><div class="section-label">Upcoming</div>';
      upcoming.slice(0, 10).forEach(ev => {
        const d = new Date(ev.date);
        const diff = Math.ceil((d - today) / 86400000);
        const daysText = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${diff}d`;
        html += `<div class="calendar-event"><div class="event-date-badge"><span class="event-day">${d.getDate()}</span><span class="event-month">${d.toLocaleDateString('en-US', { month: 'short' })}</span></div><div class="event-info"><h4>${esc(ev.title)}</h4><div class="event-subject">${esc(ev.subject)}</div><div class="event-days-away">${daysText}</div><button class="cal-view-btn" onclick="event.stopPropagation(); goToSchool('${esc(ev.title)}')">View</button></div></div>`;
      });
      html += '</div>';
    }

    const holidays = calendarEvents.filter(ev => ev.type === 'holiday' && new Date(ev.date) >= today);
    if (holidays.length > 0) {
      html += '<div class="calendar-events" style="margin-top:12px"><div class="section-label">Holidays</div>';
      holidays.slice(0, 5).forEach(ev => {
        const d = new Date(ev.date);
        html += `<div class="calendar-event"><div class="event-date-badge"><span class="event-day">${d.getDate()}</span><span class="event-month">${d.toLocaleDateString('en-US', { month: 'short' })}</span></div><div class="event-info"><h4>${esc(ev.title)}</h4></div></div>`;
      });
      html += '</div>';
    }
  }

  list.innerHTML = html;
}

function selectDay(day) { selectedDay = day; renderCalendar(); }
function calNav(dir) { calendarDate.setMonth(calendarDate.getMonth() + dir); selectedDay = null; renderCalendar(); }

function goToSchool(title) {
  switchTab('school', document.querySelector('[data-tab="school"]'));
  setTimeout(() => {
    const cards = document.querySelectorAll('#items-list .item-card h3');
    cards.forEach(h3 => {
      if (h3.textContent === title) {
        h3.closest('.item-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
        h3.closest('.item-card').style.outline = '2px solid var(--gold)';
        setTimeout(() => h3.closest('.item-card').style.outline = '', 2000);
      }
    });
  }, 200);
}

async function markRead(id, card) {
  try {
    await fetch(`${API}/summaries/${id}/read`, { method: 'PATCH' });
    const item = allItems.find(i => i._id === id);
    if (item) item.isRead = true;
    if (card) card.classList.add('read');
  } catch (err) { console.error(err); }
}

async function deleteItem(id, card) {
  try {
    const res = await fetch(`${API}/summaries/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
  } catch (err) {
    showToast('Delete failed');
    if (card) setSwipe(card, 0);
    return;
  }

  allItems = allItems.filter(i => i._id !== id);

  if (card) {
    card.style.transition = 'max-height 0.3s ease, opacity 0.3s ease, transform 0.3s ease, margin 0.3s ease, border-width 0.3s ease';
    card.style.overflow = 'hidden';
    card.style.maxHeight = `${card.scrollHeight}px`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.maxHeight = '0px';
        card.style.opacity = '0';
        card.style.transform = 'translateX(-48px)';
        card.style.borderWidth = '0';
        card.style.marginBottom = '-8px';
      });
    });
    setTimeout(() => card.remove(), 320);
  }

  showToast('Deleted');
}

function handleDownload(e, id) {
  e.stopPropagation();
  window.open(`${API}/downloads/${id}`, '_blank');
  showToast('Download started');
}

function srcLabel(s) {
  return { nps: 'School', gmail: 'Inbox', politics: 'Civic', whatsapp: 'Chat', aakash: 'Aakash' }[s] || s;
}

function fmtTime(dateStr) {
  const d = new Date(dateStr);
  const diff = Date.now() - d;
  const h = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (h < 1) return 'now';
  if (h < 24) return `${h}h`;
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function openDetail(type, item) {
  const overlay = document.getElementById('detail-overlay');
  const content = document.getElementById('detail-content');
  if (!overlay || !content) return;

  content.innerHTML = '';
  if (type === 'weather') content.innerHTML = buildWeatherDetail();
  else if (type === 'news') content.innerHTML = buildNewsDetail(item);
  else if (type === 'email') content.innerHTML = buildEmailDetail(item);
  else if (type === 'nps') content.innerHTML = buildNpsDetail(item);
  else if (type === 'whatsapp') content.innerHTML = buildWhatsAppDetail(item);

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDetail(e, force) {
  if (force || (e && e.target === e.currentTarget)) {
    const overlay = document.getElementById('detail-overlay');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function uvLabel(uv) {
  const n = parseInt(uv);
  if (isNaN(n)) return uv;
  if (n <= 2) return `${uv} (Low)`;
  if (n <= 5) return `${uv} (Moderate)`;
  if (n <= 7) return `${uv} (High)`;
  if (n <= 10) return `${uv} (Very High)`;
  return `${uv} (Extreme)`;
}

function buildWeatherDetail() {
  const w = lastWeatherData;
  if (!w) return '<div class="empty-state small"><h3>No weather data</h3></div>';

  const cond = condLabel(w.condition);
  const feelsLike = w.feelsLike || w.temp;
  const windDir = w.windDir || '--';
  const windDeg = w.windDeg || '--';
  const uvIndex = w.uvIndex || '--';
  const visibility = w.visibility || '--';
  const pressure = w.pressure || '--';
  const sunrise = w.sunrise || '--';
  const sunset = w.sunset || '--';
  const moonPhase = w.moonPhase || '--';
  const moonIllum = w.moonIllumination || '--';
  const description = w.description || w.condition || '';

  const hourlyHtml = (w.hourly || []).map((h, i) => {
    const hr = Math.floor(parseInt(h.time) / 100);
    const ampm = hr >= 12 ? 'pm' : 'am';
    const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
    const now = new Date().getHours();
    const isNow = Math.abs(hr - now) <= 1;
    const icon = weatherIconHtml(condLabel(h.condition), '0.9rem');
    const rainVal = parseInt(h.chanceOfRain) || 0;
    const rain = rainVal > 20 ? `<span class="detail-hour-rain">${rainVal}%</span>` : '';
    const thunder = parseInt(h.chanceOfThunder) > 10 ? `<span class="detail-hour-rain" style="color:#FACC15">${h.chanceOfThunder}%</span>` : '';

    return `<div class="detail-hour-item${isNow ? ' now' : ''}">
      <span class="detail-hour-time">${isNow ? 'Now' : h12 + ampm}</span>
      <span class="detail-hour-icon">${icon}</span>
      <span class="detail-hour-temp">${h.temp}&deg;</span>
      <span class="detail-hour-sub" style="font-size:0.55rem;color:var(--text-muted)">F:${h.feelsLike || h.temp}&deg;</span>
      ${rain}${thunder}
    </div>`;
  }).join('');

  const rainNow = (w.hourly || []).find(h => Math.abs(Math.floor(parseInt(h.time) / 100) - new Date().getHours()) <= 1);

  return `
    <h2>Weather</h2>
    <div class="detail-source-link">Yelahanka, Bengaluru</div>

    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
      <span style="display:flex">${weatherIconHtml(cond, '2.6rem')}</span>
      <div>
        <div style="font-size:2.6rem;font-weight:700;color:var(--text-primary);line-height:1">${w.temp}&deg;C</div>
        <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:2px">${esc(description)}</div>
      </div>
    </div>

    <div class="detail-meta-grid">
      <div class="detail-meta-item">
        <div class="detail-meta-label">Feels Like</div>
        <div class="detail-meta-value">${feelsLike}&deg;C</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">High / Low</div>
        <div class="detail-meta-value">${w.maxTemp}&deg; / ${w.minTemp}&deg;</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Humidity</div>
        <div class="detail-meta-value">${w.humidity}%</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Wind</div>
        <div class="detail-meta-value">${w.wind} km/h ${windDir}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Wind Bearing</div>
        <div class="detail-meta-value">${windDeg}&deg;</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">UV Index</div>
        <div class="detail-meta-value">${uvLabel(uvIndex)}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Visibility</div>
        <div class="detail-meta-value">${visibility} km</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Pressure</div>
        <div class="detail-meta-value">${pressure} mb</div>
      </div>
    </div>

    <div class="detail-section-title">Hourly Forecast</div>
    <div class="detail-hourly">${hourlyHtml}</div>

    <div class="detail-divider"></div>

    <div class="detail-section-title">Sun &amp; Moon</div>
    <div class="detail-meta-grid">
      <div class="detail-meta-item">
        <div class="detail-meta-label">Sunrise</div>
        <div class="detail-meta-value gold">${sunrise}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Sunset</div>
        <div class="detail-meta-value gold">${sunset}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Moon Phase</div>
        <div class="detail-meta-value">${esc(moonPhase)}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Moon Illumination</div>
        <div class="detail-meta-value">${moonIllum}%</div>
      </div>
    </div>

    <div class="detail-divider"></div>

    <div class="detail-section-title">Rain Probability</div>
    <div class="detail-meta-grid">
      <div class="detail-meta-item">
        <div class="detail-meta-label">Current Rain</div>
        <div class="detail-meta-value">${rainNow ? rainNow.chanceOfRain + '%' : '--'}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Thunder Chance</div>
        <div class="detail-meta-value">${rainNow ? (rainNow.chanceOfThunder || '0') + '%' : '--'}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Sunshine</div>
        <div class="detail-meta-value">${rainNow ? (rainNow.chanceOfSunshine || '--') + '%' : '--'}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Overcast</div>
        <div class="detail-meta-value">${rainNow ? (rainNow.chanceOfOvercast || '--') + '%' : '--'}</div>
      </div>
    </div>
  `;
}

function buildNewsDetail(item) {
  if (!item) return '';
  const tags = [`<span class="source-tag politics">${srcLabel('politics')}</span>`];
  if (item.metadata?.politician) tags.push(`<span class="source-tag" style="background:rgba(196,164,132,0.12);color:var(--gold)">${esc(item.metadata.politician)}</span>`);
  const url = item.metadata?.url || item.metadata?.link;
  const source = item.metadata?.source || item.metadata?.provider || '';
  const publishedAt = item.metadata?.publishedAt || item.createdAt;
  return `
    <h2>${esc(item.title)}</h2>
    <div class="detail-tags">${tags.join('')}</div>
    ${source ? `<div class="detail-source-link">${esc(source)} &middot; ${fmtTime(publishedAt)}</div>` : ''}
    <div class="detail-body">${esc(item.summary || item.content || '')}</div>
    ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" class="detail-btn primary" style="text-decoration:none">Read Full Article</a>` : ''}
  `;
}

function buildEmailDetail(item) {
  if (!item) return '';
  const sender = item.metadata?.from || item.metadata?.sender || '';
  const to = item.metadata?.to || '';
  const subject = item.metadata?.subject || item.title || '';
  const date = item.createdAt;
  return `
    <h2>${esc(item.title)}</h2>
    <div class="detail-tags"><span class="source-tag gmail">${srcLabel('gmail')}</span></div>
    <div class="detail-meta-grid">
      <div class="detail-meta-item" style="grid-column:1/-1">
        <div class="detail-meta-label">From</div>
        <div class="detail-meta-value">${esc(sender)}</div>
      </div>
      ${to ? `<div class="detail-meta-item" style="grid-column:1/-1">
        <div class="detail-meta-label">To</div>
        <div class="detail-meta-value">${esc(to)}</div>
      </div>` : ''}
      <div class="detail-meta-item">
        <div class="detail-meta-label">Subject</div>
        <div class="detail-meta-value">${esc(subject)}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Received</div>
        <div class="detail-meta-value">${new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
      </div>
    </div>
    <div class="detail-divider"></div>
    <div class="detail-body">${esc(item.content || item.summary || 'No content available.')}</div>
  `;
}

function buildNpsDetail(item) {
  if (!item) return '';
  const teacher = item.metadata?.teacher || '';
  const subject = item.metadata?.subject || '';
  const dueDate = item.dueDate;
  const downloadUrl = item.metadata?.downloadUrl;
  const portalUrl = item.metadata?.portalUrl || item.metadata?.url;
  return `
    <h2>${esc(item.title)}</h2>
    <div class="detail-tags">
      <span class="source-tag nps">${srcLabel('nps')}</span>
      ${subject ? `<span class="subject-tag">${esc(subject)}</span>` : ''}
    </div>
    <div class="detail-meta-grid">
      ${teacher ? `<div class="detail-meta-item">
        <div class="detail-meta-label">Teacher</div>
        <div class="detail-meta-value">${esc(teacher)}</div>
      </div>` : ''}
      ${subject ? `<div class="detail-meta-item">
        <div class="detail-meta-label">Subject</div>
        <div class="detail-meta-value">${esc(subject)}</div>
      </div>` : ''}
      ${dueDate ? `<div class="detail-meta-item">
        <div class="detail-meta-label">Due Date</div>
        <div class="detail-meta-value crimson">${new Date(dueDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </div>` : ''}
      <div class="detail-meta-item">
        <div class="detail-meta-label">Source</div>
        <div class="detail-meta-value">NPS Portal</div>
      </div>
    </div>
    <div class="detail-divider"></div>
    <div class="detail-body">${esc(item.summary || item.content || 'No description available.')}</div>
    ${downloadUrl ? `<button class="detail-btn primary" onclick="handleDownload(event, '${item._id}')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download Attachment
    </button>` : ''}
    ${portalUrl ? `<a href="${esc(portalUrl)}" target="_blank" rel="noopener" class="detail-btn secondary" style="text-decoration:none">Open in Portal</a>` : ''}
  `;
}

function buildWhatsAppDetail(item) {
  if (!item) return '';
  const author = item.metadata?.author || 'Unknown';
  const groupName = item.metadata?.groupName || 'Unknown Group';
  const aiType = item.metadata?.aiType || 'other';
  const aiSubject = item.metadata?.aiSubject;
  const aiSummary = item.metadata?.aiSummary;
  const aiDueDate = item.metadata?.aiDueDate;
  const aiSchedule = item.metadata?.aiSchedule;
  const screenshot = item.metadata?.screenshotFile;
  const attachment = item.metadata?.aiAttachment;
  const body = item.content || item.summary || '';
  const date = item.createdAt;

  let tagsHtml = `<span class="source-tag whatsapp">Chat</span>`;
  if (aiType !== 'other') {
    const typeColors = { timetable: '#FACC15', test: '#EF4444', assignment: '#3B82F6', worksheet: '#22C55E', announcement: '#A855F7' };
    tagsHtml += `<span class="whatsapp-type-badge" style="background:rgba(${aiType === 'timetable' ? '250,204,21' : aiType === 'test' ? '239,68,68' : aiType === 'assignment' ? '59,130,246' : aiType === 'worksheet' ? '34,197,94' : '168,85,247'},0.15);color:${typeColors[aiType] || 'var(--text-secondary)'}">${aiType}</span>`;
  }
  if (aiSubject) tagsHtml += `<span class="subject-tag">${esc(aiSubject)}</span>`;

  let scheduleHtml = '';
  if (aiSchedule && aiSchedule.length > 0) {
    scheduleHtml = `<div class="detail-divider"></div><div class="detail-section-title">Schedule</div><div class="detail-meta-grid">` +
      aiSchedule.map(s => `<div class="detail-meta-item"><div class="detail-meta-label">${esc(s.day)}</div><div class="detail-meta-value">${esc(s.subject)} ${s.time ? '@ ' + esc(s.time) : ''}</div></div>`).join('') +
      '</div>';
  }

  let screenshotHtml = '';
  if (screenshot) {
    screenshotHtml = `<div class="detail-divider"></div><div class="detail-section-title">Image</div><img src="${API}/media/${screenshot}" style="width:100%;border-radius:8px;cursor:pointer" onclick="window.open('${API}/media/${screenshot}', '_blank')" />`;
  }

  return `
    <h2>${esc(aiSummary || body.substring(0, 80))}</h2>
    <div class="detail-tags">${tagsHtml}</div>
    <div class="detail-meta-grid">
      <div class="detail-meta-item" style="grid-column:1/-1">
        <div class="detail-meta-label">From</div>
        <div class="detail-meta-value">${esc(author.split('@')[0])}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Group</div>
        <div class="detail-meta-value">${esc(groupName)}</div>
      </div>
      <div class="detail-meta-item">
        <div class="detail-meta-label">Received</div>
        <div class="detail-meta-value">${new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
      </div>
      ${aiDueDate ? `<div class="detail-meta-item"><div class="detail-meta-label">Due Date</div><div class="detail-meta-value crimson">${new Date(aiDueDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div></div>` : ''}
    </div>
    ${scheduleHtml}
    ${attachment ? `<div class="detail-divider"></div><div class="detail-section-title">Attachment</div><div class="brief-line"><span class="brief-badge brief-doc">PDF</span><span>${esc(attachment)}</span></div>` : ''}
    ${item.metadata?.attachmentFile ? `<a href="${API}/media/${item.metadata.attachmentFile}" target="_blank" class="detail-btn primary" style="text-decoration:none;margin-top:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download PDF</a>` : ''}
    ${screenshotHtml}
    <div class="detail-divider"></div>
    <div class="detail-body" style="white-space:pre-wrap">${esc(body)}</div>
  `;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

init();
