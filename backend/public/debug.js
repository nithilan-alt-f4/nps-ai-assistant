const $ = sel => document.querySelector(sel);

document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`#tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'logs') loadLogs();
    if (btn.dataset.tab === 'items') loadItems();
  });
});

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(s) {
  if (!s) return '-';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  let body;
  try { body = await res.json(); } catch { body = await res.text(); }
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return body;
}

async function loadHealth() {
  const el = $('#health-bar');
  try {
    const h = await api('/api/health');
    const parts = [
      `db: <span class="${h.db === 'connected' ? 'ok' : 'err'}">${h.db}</span>`,
      `nps: <span class="${h.nps?.loggedIn ? 'ok' : 'warn'}">${h.nps?.loggedIn ? 'logged-in' : 'not-logged-in'}</span>`,
      `gmail: <span class="${h.gmail === 'connected' ? 'ok' : 'warn'}">${h.gmail}</span>`,
      `calendar: <span class="${h.calendar === 'connected' ? 'ok' : 'warn'}">${h.calendar}</span>`,
      `groq: <span class="${h.summarizer === 'enabled' ? 'ok' : 'warn'}">${h.summarizer}</span>`,
    ];
    if (h.problems?.length) parts.push(`<span class="err">config: ${h.problems.join(', ')}</span>`);
    if (h.nps?.lastError) parts.push(`<span class="err">nps error: ${escapeHtml(h.nps.lastError)}</span>`);
    el.innerHTML = parts.join(' &nbsp;|&nbsp; ');
  } catch (err) {
    el.innerHTML = `<span class="err">server unreachable: ${escapeHtml(err.message)}</span>`;
  }
}

async function loadItems() {
  const list = $('#items-list');
  const status = $('#items-status');
  status.textContent = 'loading...';
  try {
    const source = $('#items-filter').value;
    const type = $('#items-type').value;
    const unread = $('#items-unread').checked;
    const params = new URLSearchParams();
    if (source) params.set('source', source);
    if (type) params.set('type', type);
    if (unread) params.set('unread', 'true');
    const items = await api(`/api/items?${params}`);

    status.textContent = `${items.length} items`;
    list.innerHTML = items.map(i => `
      <div class="item-card" onclick="viewItem('${i._id}')">
        <div class="head">
          <span class="type">${i.source} / ${i.type}</span>
          <span class="badge ${i.priority}">${i.priority}</span>
        </div>
        <div class="title">${escapeHtml(i.title || '')}</div>
        ${i.summary ? `<div class="ai"><b>Summary:</b> ${escapeHtml(i.summary)}</div>` : ''}
        <div class="body">${escapeHtml((i.content || '').substring(0, 250))}${(i.content || '').length > 250 ? '...' : ''}</div>
        <div class="meta">
          <span>posted: ${fmtDateTime(i.postedDate)}</span>
          <span>created: ${fmtDateTime(i.createdAt)}</span>
        </div>
      </div>
    `).join('') || '<p class="muted">No items. Run a sync first.</p>';
  } catch (err) {
    list.innerHTML = `<div class="item-card"><div class="title" style="color:var(--err)">Failed to load items</div><div class="body">${escapeHtml(err.message)}</div></div>`;
    status.textContent = 'error';
  }
}

async function viewItem(id) {
  try {
    const i = await api(`/api/items/${id}`);
    const meta = i.metadata || {};
    const attachments = [];
    if (i.type === 'assignment' && meta.downloadUrl) {
      attachments.push(`<button onclick="window.open('/api/attachments/assignment/${i._id}')">Download assignment file</button>`);
      attachments.push(`<button onclick="window.open('${escapeHtml(meta.downloadUrl)}','_blank')">Open on NPS portal</button>`);
    }
    if (i.type === 'circular' && meta.circularId) {
      attachments.push(`<button onclick="window.open('/api/attachments/circular/${i._id}')">Download circular PDF</button>`);
    }
    if (i.type === 'news' && meta.url) {
      attachments.push(`<button onclick="window.open('${escapeHtml(meta.url)}','_blank')">Open news article</button>`);
    }

    $('#modal-content').innerHTML = `
      <span class="type-badge">${i.source} / ${i.type}</span>
      <h3>${escapeHtml(i.title || '')}</h3>
      <div class="kv"><b>Priority</b> <span class="badge ${i.priority}">${i.priority}</span></div>
      <div class="kv"><b>Posted</b> ${fmtDateTime(i.postedDate)}</div>
      <div class="kv"><b>ID</b> ${i._id}</div>
      ${meta.subject ? `<div class="kv"><b>Subject</b> ${escapeHtml(meta.subject)}</div>` : ''}
      ${meta.teacher ? `<div class="kv"><b>Teacher</b> ${escapeHtml(meta.teacher)}</div>` : ''}
      ${meta.from ? `<div class="kv"><b>From</b> ${escapeHtml(meta.from)}</div>` : ''}
      ${meta.sourceName ? `<div class="kv"><b>News source</b> ${escapeHtml(meta.sourceName)}</div>` : ''}
      ${meta.category ? `<div class="kv"><b>Category</b> ${escapeHtml(meta.category)}</div>` : ''}
      ${meta.rawTitle ? `<div class="kv"><b>Raw title</b> ${escapeHtml(meta.rawTitle)}</div>` : ''}
      ${meta.startDate ? `<div class="kv"><b>Event date</b> ${fmtDate(meta.startDate)}</div>` : ''}
      ${i.summary ? `<h2>Summary</h2><div class="content-block">${escapeHtml(i.summary)}</div>` : ''}
      <h2>Content</h2>
      <div class="content-block">${escapeHtml(i.content || '(empty)')}</div>
      ${meta ? `<div class="kv"><b>Metadata</b> <pre style="white-space:pre-wrap;font-size:11px">${escapeHtml(JSON.stringify(meta, null, 1))}</pre></div>` : ''}
      ${attachments.length ? `<div class="btn-row">${attachments.join('')}</div>` : ''}
      <div class="btn-row">
        <button onclick="markItem('${i._id}','read')">Mark read</button>
        <button onclick="markItem('${i._id}','complete')">Mark done</button>
        <button class="danger" onclick="deleteItem('${i._id}')">Delete</button>
      </div>
    `;
    $('#modal').classList.remove('hidden');
  } catch (err) {
    alert(err.message);
  }
}

function closeModal() {
  $('#modal').classList.add('hidden');
}

async function markItem(id, action) {
  try {
    await api(`/api/items/${id}/${action}`, { method: 'PATCH' });
    closeModal();
    loadItems();
  } catch (err) {
    alert(err.message);
  }
}

async function deleteItem(id) {
  if (!confirm('Delete this item?')) return;
  try {
    await api(`/api/items/${id}`, { method: 'DELETE' });
    closeModal();
    loadItems();
  } catch (err) {
    alert(err.message);
  }
}

async function doSync(path, outSel) {
  const el = $(outSel);
  el.innerHTML = '<div class="ok-line">running...</div>';
  try {
    const isPost = path.includes('sync') || path.includes('relogin') || path.includes('summarize');
    const result = await api(path, isPost ? { method: 'POST' } : {});
    const pretty = JSON.stringify(result, null, 2);
    if (pretty.length > 3000) {
      el.innerHTML = `<div class="ok-line">done</div><pre>${escapeHtml(pretty.substring(0, 3000))}\n... (truncated)</pre>`;
    } else {
      el.innerHTML = `<div class="ok-line">done</div><pre>${escapeHtml(pretty)}</pre>`;
    }
    loadHealth();
  } catch (err) {
    el.innerHTML = `<div class="err-box">${escapeHtml(err.message)}</div>`;
  }
}

let logsTimer = null;
async function loadLogs() {
  const el = $('#logs-out');
  try {
    const { logs } = await api('/api/logs?n=300');
    el.textContent = logs.join('\n') || '(no logs yet)';
    el.scrollTop = el.scrollHeight;
  } catch (err) {
    el.textContent = 'failed to load logs: ' + err.message;
  }
}

$('#logs-auto').addEventListener('change', e => {
  clearInterval(logsTimer);
  if (e.target.checked) logsTimer = setInterval(loadLogs, 2000);
});

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
loadHealth();
setInterval(loadHealth, 10000);
loadItems();

// ---- Aakash WhatsApp sync ----
async function doAakashSync() {
  const el = $('#aakash-out');
  const status = $('#aakash-status');
  el.innerHTML = '<div class="ok-line">connecting WhatsApp and syncing…</div>';
  status.textContent = 'running';
  try {
    const result = await api('/api/aakash/sync', { method: 'POST' });
    const pretty = JSON.stringify(result, null, 2);
    if (result.needsReauth) {
      el.innerHTML = `<div class="err-box">Session expired. Run START.bat in the aakash-cal-bot folder, scan the QR code, then try again.</div><pre>${escapeHtml(pretty)}</pre>`;
      status.textContent = 'needs re-auth';
    } else if (result.success) {
      el.innerHTML = `<div class="ok-line">sync complete</div><pre>${escapeHtml(pretty)}</pre>`;
      status.textContent = 'done';
    } else {
      el.innerHTML = `<pre>${escapeHtml(pretty)}</pre>`;
      status.textContent = result.running ? 'still running' : 'failed';
    }
    loadHealth();
  } catch (err) {
    el.innerHTML = `<div class="err-box">${escapeHtml(err.message)}</div>`;
    status.textContent = 'error';
  }
}
window.doAakashSync = doAakashSync;
