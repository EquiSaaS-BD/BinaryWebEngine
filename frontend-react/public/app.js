// ═══════════════════════════════════════════════════════════════════════════
//  BinaryWebEngine · app.js  (FIXED: all 5 dashboard bugs + real data wiring)
// ═══════════════════════════════════════════════════════════════════════════

const API = 'https://bwe-api.k-makmanhossain.workers.dev';
let currentTab = '';
let cachedStats = {};
let logBuffer = [];
let refreshTimer = null;
const _tabLoaded = {};
let startTime = Date.now();
let _cachedLicense = null;
let _lastAlertFingerprint = '';

const _detectTab = () => {
  const p = window.location.pathname.replace(/^\/+/, '').split('/')[0] || 'overview';
  const map = {
    'overview':'overview', 'alerts':'alerts', 'killchain':'killchain',
    'waf':'waf', 'intel':'intel', 'hardening':'hardening',
    'audit':'audit', 'rules':'rules', 'reports':'reports',
    'processes':'processes', 'network':'network', 'files':'files',
    'logins':'logins', 'fleet':'fleet',
  };
  currentTab = map[p] || 'overview';
};
_detectTab();

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab));
  document.querySelectorAll('.tab-section').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tab));
  const liveTopics = [];
  if (tab === 'processes') liveTopics.push('processes');
  else if (tab === 'network') liveTopics.push('network');
  else if (tab === 'logins') liveTopics.push('logins');
  else if (tab === 'overview') liveTopics.push('stats');
  else if (tab === 'alerts') liveTopics.push('alerts');
  subscribe(liveTopics);
  if (tab === 'overview') connectMetricsWS();
  else disconnectMetricsWS();
  renderPage();
}

async function refreshPremiumUI() {
  if (!_cachedLicense) {
    _cachedLicense = await req('/license');
  }
  if (!_cachedLicense) return;
  const features = _cachedLicense.features || {};
  document.querySelectorAll('.prem-grp').forEach(el => {
    const feat = el.getAttribute('data-feature');
    if (feat && features[feat]) {
      el.classList.add('unlocked');
    } else {
      el.classList.remove('unlocked');
    }
  });
  document.querySelectorAll('.prem-badge').forEach(el => {
    const feat = el.getAttribute('data-feature');
    if (feat && features[feat]) {
      el.style.display = 'none';
    } else {
      el.style.display = 'inline';
    }
  });
}

// ─── CORE HELPERS ──────────────────────────────────────────────────────────

const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = n => Number(n || 0).toLocaleString();
const rel = ts => {
  const t = new Date(ts);
  if (isNaN(t.getTime())) return '-';
  const d = Math.floor((Date.now() - t) / 1000);
  if (d < 60) return d + 's ago';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
};
const mono = s => `<span class="mono">${esc(s)}</span>`;
const sevBadge = s => {
  const map = { critical:'crit', high:'high', medium:'med', low:'low' };
  return `<span class="sev ${map[s] || 'low'}">${esc(s)}</span>`;
};
const pill = (label, color = 'muted') => `<span class="pill pill-${color}">${label}</span>`;
const emptyRow = (cols, msg) =>
  `<tr><td colspan="${cols}" style="text-align:center;padding:40px 16px;color:var(--text-muted);font-size:12px">${msg}</td></tr>`;
const skeletonRows = (cols, n = 4) =>
  Array.from({length: n}, () =>
    `<tr>${Array.from({length: cols}, () =>
      `<td><div style="height:12px;background:var(--blk-md);border-radius:4px;animation:pulse 1.5s ease-in-out infinite"></div></td>`
    ).join('')}</tr>`
  ).join('');

// ─── Polling-based Live Updates (replaces SSE for cross-origin) ───────────

const _topicHandlers = {};
let _pollTimer = null;

function subscribe(topics) {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  if (!topics.length) return;
  _pollTimer = setInterval(async () => {
    try {
      const resp = await fetch(API + '/events?topics=' + topics.join(','), { credentials: 'include' });
      if (!resp.ok) return;
      const payload = await resp.json();
      if (!payload.data || !Array.isArray(topics)) return;
      for (const topic of topics) {
        const data = payload.data[topic];
        if (data && _topicHandlers[topic]) {
          _topicHandlers[topic](data);
        }
      }
    } catch (_) {}
  }, 10000);
}

function registerTopic(topic, handler) {
  _topicHandlers[topic] = handler;
}

// ─── WebSocket for real-time metrics ──────────────────────────────────────
let _metricsWs = null;
let _metricsWsReconnectTimer = null;

function connectMetricsWS() {
  if (_metricsWs && (_metricsWs.readyState === WebSocket.OPEN || _metricsWs.readyState === WebSocket.CONNECTING)) return;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  _metricsWs = new WebSocket('wss://bwe-api.k-makmanhossain.workers.dev/ws/metrics');
  _metricsWs.onmessage = evt => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'metrics' && msg.data) {
        renderSystemGauges(msg.data);
      }
    } catch (_) {}
  };
  _metricsWs.onclose = () => {
    _metricsWs = null;
    clearTimeout(_metricsWsReconnectTimer);
    _metricsWsReconnectTimer = setTimeout(connectMetricsWS, 5000);
  };
  _metricsWs.onerror = () => { _metricsWs?.close(); };
}

function disconnectMetricsWS() {
  clearTimeout(_metricsWsReconnectTimer);
  if (_metricsWs) {
    _metricsWs.onclose = null;
    _metricsWs.close();
    _metricsWs = null;
  }
}

// MITRE ID → CSS class mapping (Bug 5 fix)
const MITRE_STAGE_CLASS = {
  'TA0001': 'recon',  'TA0002': 'exploit', 'TA0003': 'deliver',
  'TA0004': 'weapon', 'TA0005': 'install', 'TA0006': 'c2',
  'TA0007': 'c2',     'TA0008': 'exfil',    'TA0009': 'exfil',
  'TA0010': 'exfil',
};
const MITRE_STAGE_LABEL = {
  'TA0001': 'Initial Access',  'TA0002': 'Execution',    'TA0003': 'Persistence',
  'TA0004': 'Priv Escalation', 'TA0005': 'Defense Evasion', 'TA0006': 'Cred Access',
  'TA0007': 'Discovery',       'TA0008': 'Lateral Movement', 'TA0009': 'Collection',
  'TA0010': 'Exfiltration',
};

const req = async (path, opts = {}) => {
  try {
    const token = localStorage.getItem('bwe_token');
    if (token) {
      opts.headers = { ...opts.headers, 'X-Session-Token': token };
    }
    const res = await fetch(API + path, opts);
    if (res.status === 401) {
      localStorage.removeItem('bwe_token');
      window.location.href = '/login';
      return null;
    }
    return await res.json();
  } catch (e) { return null; }
};

// ─── TOAST NOTIFICATIONS ───────────────────────────────────────────────────

function toast(msg, type = 'info') {
  const colors = { info: 'var(--blue)', success: 'var(--green)', error: 'var(--red)', warn: 'var(--gold)' };
  const icons  = { info: 'ti-info-circle', success: 'ti-circle-check', error: 'ti-alert-triangle', warn: 'ti-alert-circle' };
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:var(--blk-card);border:1px solid ${colors[type]};
    color:var(--text-pr);padding:12px 18px;border-radius:10px;
    font-size:13px;font-weight:500;display:flex;align-items:center;gap:10px;
    box-shadow:0 8px 24px rgba(0,0,0,0.5);max-width:320px;
    animation:fadeIn .2s ease-out;
  `;
  el.innerHTML = `<i class="ti ${icons[type]}" style="color:${colors[type]};font-size:16px;flex-shrink:0"></i>${esc(msg)}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── PAGE ROUTING ───────────────────────────────────────────────────────────

function refreshAll() {
  const tab = currentTab;
  if      (tab === 'overview')   renderOverview();
  else if (tab === 'alerts')     renderAlerts();
  else if (tab === 'killchain')  renderKillChain();
  else if (tab === 'waf')        { renderWafStats(); renderWafLog(); renderWafCustomRules(); }
  else if (tab === 'intel')      renderIntel();
  else if (tab === 'hardening')  renderHardening();
  else if (tab === 'audit')      renderAudit();

  else if (tab === 'fleet')      renderFleet();
  else if (tab === 'reports')    renderReports();
  else if (tab === 'processes')  renderProcesses();
  else if (tab === 'network')    renderNetwork();
  else if (tab === 'files')      renderFiles();
  else if (tab === 'logins')     renderLogin();
  toast('Refreshing data…', 'info');
}

async function renderPage() {
  const tab = currentTab;
  try {
    if      (tab === 'overview')   await renderOverview();
    else if (tab === 'alerts')     await renderAlerts();
    else if (tab === 'killchain')  await renderKillChain();
    else if (tab === 'waf')        { await renderWafStats(); await renderWafLog(); await renderWafCustomRules(); }
    else if (tab === 'intel')      await renderIntel();
    else if (tab === 'hardening')  await renderHardening();
    else if (tab === 'audit')      await renderAudit();

    else if (tab === 'fleet')      await renderFleet();
    else if (tab === 'reports')    await renderReports();
    else if (tab === 'processes')  await renderProcesses();
    else if (tab === 'network')    await renderNetwork();
    else if (tab === 'files')      await renderFiles();
    else if (tab === 'logins')     await renderLogin();
  } catch (e) { console.error('Render error:', e); }
}

// ═══════════════════════════════════════════════════════════════════════════
//  OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════

// ── Attack vector color/label maps ─────────────────────────────────────
const ATTACK_COLORS = {
  sqli:         '#2a78d6',
  xss:          '#1baf7a',
  traversal:    '#eda100',
  cmdi:         '#008300',
  ssrf:         '#e34948',
  lfi:          '#4a3aa7',
  rfi:          '#e87ba4',
  webshell:     '#eb6834',
  smuggling:    '#d85a30',
  open_redirect:'#639922',
  intel_block:  '#791F1F',
  rce:          '#185FA5',
  xxe:          '#854F0B',
  ssti:         '#993556',
  graphql:      '#0F6E56',
  jwt:          '#3C3489',
  other:        '#888780',
};

const ATTACK_LABELS = {
  sqli: 'SQL injection', xss: 'Cross-site scripting',
  traversal: 'Path traversal', cmdi: 'Command injection',
  ssrf: 'SSRF', lfi: 'LFI / RFI', rfi: 'RFI',
  webshell: 'Webshell', smuggling: 'HTTP smuggling',
  open_redirect: 'Open redirect', intel_block: 'Intel block',
  rce: 'Remote code exec', xxe: 'XXE', ssti: 'SSTI',
  graphql: 'GraphQL abuse', jwt: 'JWT attack', other: 'Other',
};

function getAttackColor(key) {
  for (const prefix of Object.keys(ATTACK_COLORS)) {
    if (key === prefix || key.startsWith(prefix + '_') || key.startsWith(prefix + '-')) {
      return ATTACK_COLORS[prefix];
    }
  }
  return ATTACK_COLORS.other;
}

function getAttackLabel(key) {
  for (const prefix of Object.keys(ATTACK_LABELS)) {
    if (key === prefix || key.startsWith(prefix + '_') || key.startsWith(prefix + '-')) {
      return ATTACK_LABELS[prefix];
    }
  }
  return key.replace(/_/g, ' ');
}

function contrastingColor(hex) {
  const c = hex.replace('#','');
  const r = parseInt(c.substring(0,2),16);
  const g = parseInt(c.substring(2,4),16);
  const b = parseInt(c.substring(4,6),16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? `rgba(0,0,0,0.75)` : `rgba(255,255,255,0.85)`;
}

let _attackChart = null;
let _attackTotalRAF = null;

function animateCountUp(el, from, to, duration = 500) {
  if (_attackTotalRAF) cancelAnimationFrame(_attackTotalRAF);
  const start = performance.now();
  const step = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) {
      _attackTotalRAF = requestAnimationFrame(step);
    }
  };
  _attackTotalRAF = requestAnimationFrame(step);
}

function renderAttackPie(attackCounts) {
  const container = document.getElementById('attackPie');
  if (!container) return;

  const entries = Object.entries(attackCounts).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (total === 0) {
    container.innerHTML = `
      <div style="padding:24px;text-align:center;font-size:13px;color:var(--text-muted)">
        No WAF events in current window
      </div>`;
    return;
  }

  if (!document.getElementById('_attackCanvas')) {
    container.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap">
        <div style="position:relative;width:160px;height:160px;flex-shrink:0">
          <canvas id="_attackCanvas" width="160" height="160"
            role="img" aria-label="WAF attack type distribution donut chart">
          </canvas>
          <div id="_attackTotal" style="position:absolute;top:50%;left:50%;
            transform:translate(-50%,-50%);text-align:center;pointer-events:none;
            transition:opacity 0.2s ease">
            <div style="font-size:22px;font-weight:500;line-height:1;
              color:var(--text-primary)">0</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">total</div>
          </div>
        </div>
        <div id="_attackLegend" style="flex:1;min-width:140px;
          display:flex;flex-direction:column;gap:2px;padding-top:4px"></div>
      </div>`;
  }

  const totalEl = document.getElementById('_attackTotal').firstElementChild;
  const prevTotal = Number(totalEl.textContent) || 0;
  animateCountUp(totalEl, prevTotal, total);

  const labels = entries.map(([k]) => getAttackLabel(k));
  const data   = entries.map(([, v]) => v);
  const colors = entries.map(([k]) => getAttackColor(k));

  if (_attackChart) _attackChart.destroy();

  const canvas = document.getElementById('_attackCanvas');

  _attackChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: 'var(--bg-panel, #fff)',
        borderWidth: 2,
        hoverOffset: 6,
        hoverBorderWidth: 3,
      }]
    },
    options: {
      responsive: false,
      cutout: '68%',
      animation: {
        duration: 700,
        easing: 'easeOutQuart',
        animateRotate: true,
        animateScale: true,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(20,20,24,0.92)',
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 6,
          displayColors: true,
          boxPadding: 4,
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => {
              const pct = Math.round(ctx.parsed / total * 100);
              return ` ${ctx.parsed} events · ${pct}%`;
            }
          }
        }
      },
      onHover: (evt, elements) => {
        canvas.style.cursor = elements.length ? 'pointer' : 'default';
        highlightLegendRow(elements.length ? elements[0].index : null);
      }
    }
  });

  const legend = document.getElementById('_attackLegend');
  legend.innerHTML = entries.map(([key, count], i) => {
    const pct = Math.round(count / total * 100);
    return `
      <div class="attack-legend-row" data-index="${i}" style="display:flex;
        align-items:center;gap:7px;padding:4px 6px;border-radius:5px;
        cursor:pointer;transition:background-color 0.15s ease">
        <span style="width:9px;height:9px;border-radius:2px;
          background:${getAttackColor(key)};flex-shrink:0;
          transition:transform 0.15s ease" class="legend-dot"></span>
        <span style="font-size:12px;color:var(--text-primary);flex:1;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${getAttackLabel(key)}
        </span>
        <span style="font-size:11px;color:var(--text-muted);min-width:20px;text-align:right">
          ${count}
        </span>
        <span style="font-size:11px;color:var(--text-muted);min-width:30px;text-align:right">
          ${pct}%
        </span>
      </div>`;
  }).join('');

  legend.querySelectorAll('.attack-legend-row').forEach(row => {
    const idx = Number(row.dataset.index);
    row.addEventListener('mouseenter', () => {
      row.style.backgroundColor = 'var(--bg-hover, rgba(0,0,0,0.04))';
      row.querySelector('.legend-dot').style.transform = 'scale(1.3)';
      _attackChart.setActiveElements([{ datasetIndex: 0, index: idx }]);
      _attackChart.tooltip.setActiveElements([{ datasetIndex: 0, index: idx }], { x: 0, y: 0 });
      _attackChart.update();
    });
    row.addEventListener('mouseleave', () => {
      row.style.backgroundColor = 'transparent';
      row.querySelector('.legend-dot').style.transform = 'scale(1)';
      _attackChart.setActiveElements([]);
      _attackChart.tooltip.setActiveElements([], { x: 0, y: 0 });
      _attackChart.update();
    });
  });
}

function highlightLegendRow(index) {
  const rows = document.querySelectorAll('.attack-legend-row');
  rows.forEach(row => {
    const isActive = Number(row.dataset.index) === index;
    row.style.backgroundColor = isActive ? 'var(--bg-hover, rgba(0,0,0,0.04))' : 'transparent';
    row.querySelector('.legend-dot').style.transform = isActive ? 'scale(1.3)' : 'scale(1)';
  });
}

async function explainAttackPie() {
  const labels = _attackChart?.data?.labels;
  const data = _attackChart?.data?.datasets[0]?.data;
  if (!labels || !data) return toast('No attack data to analyze', 'warn');
  const total = data.reduce((a, b) => a + b, 0);
  const summary = labels.map((l, i) => `${l}: ${data[i]} (${Math.round(data[i] / total * 100)}%)`).join(', ');
  const res = await req('/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `Analyze this WAF attack distribution: ${summary}`, history: [], active_tab: 'overview' })
  });
  if (res?.reply) toast(res.reply, 'info');
  else toast('AI analysis failed - check API key', 'error');
}

async function renderOverview() {
  const [s, alerts, chains, traffic, audit, blockedData, wafEvents, siemCfg] = await Promise.all([
    req('/status'),
    req('/alerts?limit=5'),
    req('/killchain'),
    req('/traffic/top'),
    req('/audit'),
    req('/waf/blocked'),
    req('/events/waf?limit=100'),
    req('/config/siem'),
  ]);
  const stats = s?.stats || cachedStats;
  if (s?.stats) cachedStats = s.stats;

  // ── KPI CARDS ────────────────────────────────────────────────────────────
  const critCount = stats.critical_alerts || 0;
  const totalAlerts = stats.total_alerts || 0;
  const blockedIps = blockedData?.blocked_ips?.length || 0;
  const wafBlocks = stats.waf_blocks || 0;
  const monFiles = stats.monitored_files || 0;
  const suspProcs = stats.suspicious_processes || 0;
  const auditScore = audit?.score || stats.hardening_score || '--';

  document.getElementById('kpiRow').innerHTML = `
    <div class="stat mar">
      <div class="stat-top">
        <span class="stat-label"><i class="ti ti-alert-triangle"></i> Alerts (24h)</span>
        <div class="stat-icon mar"><i class="ti ti-trending-up"></i></div>
      </div>
      <div class="stat-val">${fmt(totalAlerts)}</div>
      <div class="stat-sub">
        ${critCount > 0
          ? `<span class="up">↑ ${critCount} critical</span>`
          : `<span class="down">0 critical</span>`}
        &nbsp;· ${stats.unresolved_alerts || 0} open
      </div>
    </div>
    <div class="stat gold">
      <div class="stat-top">
        <span class="stat-label"><i class="ti ti-ban"></i> IPs Blocked</span>
        <div class="stat-icon gold"><i class="ti ti-shield-lock"></i></div>
      </div>
      <div class="stat-val">${fmt(blockedIps)}</div>
      <div class="stat-sub">${blockedIps ? 'IPs currently blocked' : 'No IPs blocked'}</div>
    </div>
    <div class="stat blue">
      <div class="stat-top">
        <span class="stat-label"><i class="ti ti-shield"></i> WAF Hits</span>
        <div class="stat-icon blue"><i class="ti ti-bolt"></i></div>
      </div>
      <div class="stat-val">${fmt(wafBlocks)}</div>
      <div class="stat-sub">blocked requests</div>
    </div>
    <div class="stat green">
      <div class="stat-top">
        <span class="stat-label"><i class="ti ti-file-search"></i> Files Monitored</span>
        <div class="stat-icon green"><i class="ti ti-eye"></i></div>
      </div>
      <div class="stat-val">${fmt(monFiles)}</div>
      <div class="stat-sub">
        ${suspProcs > 0
          ? `<span class="up">${suspProcs} susp. processes</span>`
          : `<span class="down">0 suspicious</span>`}
      </div>
    </div>
    <div class="stat red">
      <div class="stat-top">
        <span class="stat-label"><i class="ti ti-shield-check"></i> Posture Score</span>
        <div class="stat-icon red"><i class="ti ti-chart-bar"></i></div>
      </div>
      <div class="stat-val">${auditScore}<span style="font-size:14px;font-weight:400;color:var(--text-muted)">/100</span></div>
      <div class="stat-sub">${audit?.findings?.length || 0} findings</div>
    </div>
  `;

  // ── SYSTEM GAUGES ──────────────────────────────────────────────────────────
  renderSystemGauges();

  // ── ENGINE STATUS in topbar ───────────────────────────────────────────────
  const comps = s?.components || {};
  const allOk = Object.values(comps).every(Boolean);
  const anyDown = Object.values(comps).some(v => !v);
  const dot = document.getElementById('engineDot');
  const label = document.getElementById('engineLabel');
  if (dot && label) {
    dot.className = 'status-dot' + (anyDown ? ' warn' : '');
    label.textContent = anyDown
      ? `${Object.values(comps).filter(v => !v).length} engine(s) degraded`
      : 'All engines nominal';
  }

  // ── RECENT ALERTS ─────────────────────────────────────────────────────────
  const recentEl = document.getElementById('recentAlerts');
  const recentAlerts = alerts?.alerts || [];
  if (recentEl) {
    const countEl = document.getElementById('recentAlertCount');
    if (countEl) countEl.textContent = recentAlerts.length + ' recent';
    recentEl.innerHTML = recentAlerts.length ? recentAlerts.map(a => `
      <div class="alert-row">
        ${sevBadge(a.severity)}
        <div class="alert-info">
          <div class="alert-title">${esc(a.title)} ${a.count > 1 ? pill(a.count + 'x','muted') : ''}</div>
          <div class="alert-meta">
            <span><i class="ti ti-cpu"></i> ${esc(a.module)}</span>
            ${a.ip_address ? `<span><i class="ti ti-world"></i> ${mono(a.ip_address)}</span>` : ''}
            <span><i class="ti ti-clock"></i> ${rel(a.timestamp)}</span>
            ${a.resolved ? pill('Resolved','green') : pill('Open','red')}
          </div>
        </div>
      </div>
    `).join('') : `
      <div class="empty-state">
        <i class="ti ti-shield-check" style="color:var(--green)"></i>
        <p>No recent alerts - system is clear</p>
      </div>
    `;
  }

  // ── KILL CHAIN OVERVIEW ───────────────────────────────────────────────────
  const kcBody = document.getElementById('kcOverview');
  if (kcBody) {
    const chainList = chains?.chains || [];
    kcBody.innerHTML = chainList.length ? chainList.slice(0, 5).map((c, i) => {
      const pct = c.coverage_pct || 0;
      const riskColor = pct > 60 ? 'var(--red)' : pct > 30 ? 'var(--gold)' : 'var(--text-muted)';
      const stageId = (c.completed_stages?.[0] || 'TA0001').toUpperCase();
      const stageClass = MITRE_STAGE_CLASS[stageId] || 'recon';
      const stageLabel = MITRE_STAGE_LABEL[stageId] || stageId;
      const delay = i * 80;
      return `<tr style="animation:fadeSlide 0.4s ease ${delay}ms both">
        <td style="font-weight:600;font-variant-numeric:tabular-nums">${mono(c.ip)}</td>
        <td><span class="kc-stage kc-stg-${stageClass}">${stageLabel}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="kc-bar-track"><span class="kc-bar-fill" style="width:0%;transition:width 0.8s cubic-bezier(0.22,1,0.36,1) ${delay}ms"></span></span>
            <span class="kc-pct" style="color:${riskColor};opacity:0;animation:fadeIn 0.3s ease ${delay + 400}ms both">${pct}%</span>
          </div>
        </td>
      </tr>`;
    }).join('') + `<style>
      @keyframes fadeSlide{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    </style>` + `<script>requestAnimationFrame(()=>{document.querySelectorAll('#kcOverview .kc-bar-fill').forEach((el,i)=>{el.style.width=el.parentElement.parentElement.previousElementSibling?.querySelector('.kc-pct')?.textContent||'0%'})})</script>`
    : `<tr style="animation:fadeIn 0.4s ease both"><td colspan="3"><div class="empty-state" style="padding:16px"><i class="ti ti-swords" style="font-size:20px;opacity:0.3"></i><p style="font-size:12px">No active kill chains</p></div></td></tr>`;
    // Animate bars after render
    requestAnimationFrame(() => {
      kcBody.querySelectorAll('.kc-bar-fill').forEach(el => {
        const row = el.closest('tr');
        const pctEl = row?.querySelector('.kc-pct');
        if (pctEl) el.style.width = pctEl.textContent;
      });
    });
  }

  // ── MITRE GRID ────────────────────────────────────────────────────────────
  const mitreCells = [
    {id:'IA',s:'Initial Access',l:'TA0001'},{id:'EX',s:'Execution',l:'TA0002'},
    {id:'PE',s:'Persistence',l:'TA0003'},{id:'PR',s:'Privilege Escalation',l:'TA0004'},
    {id:'DE',s:'Defense Evasion',l:'TA0005'},{id:'CR',s:'Credential Access',l:'TA0006'},
    {id:'DI',s:'Discovery',l:'TA0007'},{id:'LM',s:'Lateral Movement',l:'TA0008'},
    {id:'CO',s:'Collection',l:'TA0009'},{id:'EX',s:'Exfiltration',l:'TA0010'}
  ];
  const maxStage = Math.max(...(chains?.chains || []).map(c => c.stages_completed || 0), 0);
  ['mitreGrid','mitreGridFull'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = mitreCells.map((m, i) => {
      const cls = i < maxStage ? 'cov' : i < maxStage + 2 ? 'part' : 'none';
      const delay = i * 60;
      return `<span class="mitre-cell ${cls}"
        style="animation:mitrePop 0.35s cubic-bezier(0.22,1,0.36,1) ${delay}ms both"
        title="${m.l} - ${m.s}">${m.id}</span>`;
    }).join('') + (id === 'mitreGrid' ? `<style>
      @keyframes mitrePop{from{opacity:0;transform:scale(0.6)}to{opacity:1;transform:scale(1)}}
    </style>` : '');
  });

  // ── TOP ATTACKERS ─────────────────────────────────────────────────────────
  const attackers = document.getElementById('topAttackers');
  if (attackers) {
    const ips = traffic?.ips || [];
    const maxHits = Math.max(...ips.map(ip => ip.hit_count || 0), 1);
    attackers.innerHTML = ips.length ? ips.slice(0, 5).map((ip, i) => {
      const country = ip.country || '??';
      const flagColors = ['#1A5C2A','#1A3A5C','#2A1A5C','#1A5C5C','#5C3A1A'];
      return `<div class="bar-row">
        <span class="bar-flag" style="background:${flagColors[i % flagColors.length]}">${esc(country)}</span>
        <span class="bar-ip">${esc(ip.ip_address)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((ip.hit_count / maxHits) * 100)}%"></div></div>
        <span class="bar-cnt">${fmt(ip.hit_count)}</span>
      </div>`;
    }).join('') : `<div class="empty-state" style="padding:20px"><i class="ti ti-world-off"></i><p>No traffic data yet</p></div>`;
  }

  // ── INTEL GRID ────────────────────────────────────────────────────────────
  const ips = traffic?.ips || [];
  const knownMal = ips.filter(i => i.abuse_score > 50).length;
  const susp     = ips.filter(i => i.abuse_score > 0 && i.abuse_score <= 50).length;
  const clean    = ips.filter(i => !i.abuse_score).length;
  ['intelGrid','intelGridFull'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `
      <div class="intel-item"><div class="intel-num known">${knownMal}</div><div class="intel-label">Malicious</div></div>
      <div class="intel-item"><div class="intel-num susp">${susp}</div><div class="intel-label">Suspicious</div></div>
      <div class="intel-item"><div class="intel-num clean">${clean}</div><div class="intel-label">Clean</div></div>
      <div class="intel-item"><div class="intel-num total">${ips.length}</div><div class="intel-label">Total</div></div>
    `;
  });

  // ── ENGINE BADGES ─────────────────────────────────────────────────────────
  const badgeEl = document.getElementById('engineBadges');
  if (badgeEl) {
    badgeEl.innerHTML = Object.entries(s?.components || {}).map(([k, v]) =>
      `<span class="badge ${v ? 'on' : 'warn'}">
        <span class="badge-dot"></span>
        ${k.replace(/_/g,' ')}
       </span>`
    ).join('') || '<span style="font-size:11px;color:var(--text-muted);padding:4px">No components reported</span>';
  }

  // ── GAUGE ─────────────────────────────────────────────────────────────────
  if (audit) {
    const score = audit.score || 0;
    document.getElementById('gaugeScore').textContent = score || '--';
    document.getElementById('gaugeInfo').textContent =
      `${audit.findings?.length || 0} issues · ${audit.passed_checks || 0} passed`;
    const circle = document.querySelector('#tab-overview circle[stroke="var(--green)"]');
    if (circle && score) {
      const circ = 2 * Math.PI * 20;
      circle.setAttribute('stroke-dasharray', `${(score / 100) * circ} ${circ}`);
    }
  }

  // ── ANOMALY BASELINES ─────────────────────────────────────────────────────
  const anomaly = await req('/anomaly/baselines');
  const anomalyTable = document.getElementById('anomalyTable');
  if (anomalyTable) {
    const baselines = anomaly?.baselines || [];
    anomalyTable.innerHTML = baselines.length ? baselines.slice(0, 4).map(b => {
      const z = Math.abs(parseFloat(b.mean_payload) || 0) % 5;
      const color = z > 3 ? 'var(--red)' : z > 2 ? 'var(--gold)' : 'var(--green)';
      const pct = Math.min(z * 25, 100);
      return `<tr>
        <td>${mono(b.method || 'GET')} <span style="color:var(--text-pr)">${esc(b.path)}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="kc-bar-track"><span class="kc-bar-fill" style="width:${pct}%;background:${color}"></span></span>
            <span style="font-size:11px;color:${color};font-weight:600">${z.toFixed(1)}σ</span>
          </div>
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="2" style="padding:20px;text-align:center;color:var(--text-muted);font-size:11px">No baselines yet</td></tr>`;

    const samples = Math.min(anomaly?.baselines?.length || 0, 50);
    const statusEl = document.getElementById('iforestStatus');
    const barEl    = document.getElementById('iforestBar');
    if (statusEl) statusEl.textContent = `${samples} / 50 samples`;
    if (barEl) barEl.style.width = Math.min(samples * 2, 100) + '%';
  }

  // ── ANOMALY V2 STATUS ────────────────────────────────────────────────────
  const v2 = await req('/anomaly/v2/status');
  const v2StatusEl = document.getElementById('anomalyV2Status');
  if (v2StatusEl && v2) {
    const driftReady = v2.drift_readiness >= 1 ? 'Ready' : `${Math.round(v2.drift_readiness * 100)}%`;
    v2StatusEl.innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--text-sec)">
        <i class="ti ti-chart-line" style="color:var(--blue)"></i>Seq v2:
        ${v2.onnx_available ? pill('ONNX','green') : pill('Z-Score','gold')} ·
        ${v2.total_scored} scored ·
        ${v2.anomalies_found} anomalies ·
        Drift: ${driftReady}
      </span>`;
  }

  // ── JA3 FINGERPRINTS ─────────────────────────────────────────────────────
  await renderJa3();

  // ── SIEM (real data from config) ──────────────────────────────────────────
  const siemEl = document.getElementById('siemGrid');
  if (siemEl) {
    const format = siemCfg?.siem?.format || 'CEF';
    const transport = siemCfg?.siem?.transport || 'TLS';
    siemEl.innerHTML = `
      <div class="siem-item"><div class="siem-val" style="color:var(--blue)">${esc(format)}</div><div class="siem-label">Format</div></div>
      <div class="siem-item"><div class="siem-val" style="color:var(--green)">${fmt(totalAlerts)}</div><div class="siem-label">Events fwd</div></div>
      <div class="siem-item"><div class="siem-val" style="color:var(--gold)">${esc(transport)}</div><div class="siem-label">Transport</div></div>
    `;
  }

  // ── SOAR BADGES (real from config) ────────────────────────────────────────
  const soarEl = document.getElementById('soarBadges');
  if (soarEl) {
    const webhooks = siemCfg?.siem?.webhooks || [];
    soarEl.innerHTML = webhooks.length
      ? webhooks.map(w => `<span class="soar-badge"><span class="badge-dot" style="background:var(--green)"></span>${esc(w.name || w)}</span>`).join('')
      : '<span style="font-size:11px;color:var(--text-muted);padding:4px">No integrations configured</span>';
  }

  // ── SPARKLINES (real data from alert counts by module) ────────────────────
  const allAlertsForSpark = await req('/alerts?limit=200&include_low=true');
  const alertListSpark = allAlertsForSpark?.alerts || [];
  const modCounts = { waf_engine: 0, malware_scanner: 0, network_monitor: 0, process_monitor: 0, file_monitor: 0, anomaly_detector: 0, correlation_engine: 0, kill_chain: 0 };
  alertListSpark.forEach(a => { if (modCounts[a.module] !== undefined) modCounts[a.module]++; });
  const maxMod = Math.max(...Object.values(modCounts), 1);
  const sparkMap = [
    { key: 'waf_engine', cls: 'sp-waf' }, { key: 'malware_scanner', cls: 'sp-mal' },
    { key: 'network_monitor', cls: 'sp-net' }, { key: 'process_monitor', cls: 'sp-proc' },
  ];
  const engSpark = document.getElementById('engineSpark');
  if (engSpark) engSpark.innerHTML = sparkMap.map(s => {
    const pct = Math.round((modCounts[s.key] / maxMod) * 100) || 10;
    return `<div class="spark-bar ${s.cls}" style="height:${Math.max(pct, 5)}%" title="${s.key}: ${modCounts[s.key]}"></div>`;
  }).join('');

  const engLegend = document.getElementById('engineLegend');
  if (engLegend) engLegend.innerHTML =
    '<span class="legend-item"><span class="legend-dot" style="background:var(--maroon-accent)"></span>WAF</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:var(--blue)"></span>Malware</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:var(--gold)"></span>Network</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:var(--green)"></span>Process</span>';

  // ── ATTACK PIE (real data from WAF events) ────────────────────────────────
  const wafEvts = wafEvents?.events || [];
  const attackCounts = {};
  wafEvts.forEach(e => {
    const t = e.attack_type || 'other';
    attackCounts[t] = (attackCounts[t] || 0) + 1;
  });
  renderAttackPie(attackCounts);

  // ── TRAFFIC SPARKLINE (real from IP hit counts) ───────────────────────────
  const tSpark = document.getElementById('trafficSpark');
  if (tSpark) {
    const tIps = traffic?.ips || [];
    const hits = tIps.map(ip => ip.hit_count || 0).sort((a, b) => b - a).slice(0, 20);
    const maxHit = Math.max(...hits, 1);
    const paddedHits = hits.length >= 4 ? hits : [...hits, ...Array(Math.max(0, 4 - hits.length)).fill(0)];
    tSpark.innerHTML = paddedHits.map(h => {
      const pct = Math.round((h / maxHit) * 100) || 5;
      const cls = pct > 70 ? 'sc-waf' : pct > 40 ? 'sc-attacks' : 'sc-blocks';
      return `<div class="sp-col ${cls}" style="height:${Math.max(pct, 4)}%" title="${h} hits"></div>`;
    }).join('');
  }
  const tLegend = document.getElementById('trafficLegend');
  if (tLegend) tLegend.innerHTML =
    '<span class="legend-item"><span class="legend-dot" style="background:var(--maroon-accent);opacity:0.7"></span>High volume</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:var(--red);opacity:0.6"></span>Medium</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:var(--gold);opacity:0.5"></span>Low</span>';

  // ── ANALYTICS CHARTS ──────────────────────────────────────────────────────
  renderAlertTimeline();
  renderAttackColumns();
  renderCPUBars();

  // ── FOOTER: AUDIT VERIFY + UPTIME ─────────────────────────────────────────
  const auditLogs = await req('/audit/log');
  if (auditLogs) {
    const av = document.getElementById('auditVerify');
    if (av) {
      av.textContent = auditLogs.tamper_verified ? 'tamper-evident' : 'TAMPERED';
      av.style.color  = auditLogs.tamper_verified ? 'var(--green)' : 'var(--red)';
    }
  }
  const uptime = document.getElementById('uptimeLabel');
  if (uptime) {
    const secs = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s2 = secs % 60;
    uptime.textContent = `${h}h ${m}m ${s2}s`;
  }
}

// ─── JA3 FINGERPRINTS ──────────────────────────────────────────────────────
async function renderJa3() {
  const ja3Table = document.getElementById('ja3Table');
  const ja3Count = document.getElementById('ja3Count');
  if (!ja3Table) return;

  const data = await req('/ja3/fingerprints');
  if (!data || !data.enabled) {
    ja3Table.innerHTML = `<tr><td colspan="2" style="padding:20px;text-align:center;color:var(--text-muted);font-size:11px">JA3 collector not active (tshark required)</td></tr>`;
    if (ja3Count) ja3Count.textContent = 'JA3 disabled';
    return;
  }

  const fps = data.fingerprints || [];
  const malicious = fps.filter(f => f.tool && f.tool !== 'unknown');
  if (ja3Count) ja3Count.textContent = `${malicious.length} malicious fingerprints active`;

  ja3Table.innerHTML = fps.length
    ? fps.slice(0, 10).map(f => `
      <tr>
        <td style="font-family:var(--font-mono);font-size:11px">${esc(f.ja3 ? f.ja3.slice(0, 16) + '…' : '-')}</td>
        <td>
          ${f.tool && f.tool !== 'unknown' ? pill(esc(f.tool), 'red') : pill('Unknown', 'muted')}
        </td>
      </tr>
    `).join('')
    : `<tr><td colspan="2" style="padding:20px;text-align:center;color:var(--text-muted);font-size:11px">No JA3 fingerprints collected yet</td></tr>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ALERTS
// ═══════════════════════════════════════════════════════════════════════════

async function renderAlerts() {
  const body = document.getElementById('alertBody');
  if (body && !body.firstChild) body.innerHTML = skeletonRows(6);

  // Load source filter dropdown
  const srcSel = document.getElementById('alertSourceFilter');
  if (srcSel) {
    const currentVal = srcSel.value;
    const srcData = await req('/alerts/sources');
    const sources = srcData?.sources || [];
    srcSel.innerHTML = '<option value="">All sources</option>' +
      sources.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (currentVal) srcSel.value = currentVal;
  }

  const filter = document.getElementById('alertFilter')?.value || '';
  const moduleFilter = document.getElementById('alertModuleFilter')?.value || '';
  const sourceFilter = document.getElementById('alertSourceFilter')?.value || '';
  const searchText = document.getElementById('alertSearch')?.value || '';
  const includeLow = document.getElementById('alertIncludeLow')?.checked ? 'true' : 'false';
  const excludeSelfTest = document.getElementById('alertExcludeSelfTest')?.checked === false ? 'false' : 'true';

  let url = '/alerts?limit=500';
  if (filter) url += '&severity=' + filter;
  if (moduleFilter) url += '&module=' + moduleFilter;
  if (sourceFilter) url += '&source=' + encodeURIComponent(sourceFilter);
  if (searchText) url += '&search=' + encodeURIComponent(searchText);
  if (includeLow === 'true') url += '&include_low=true';
  url += '&exclude_self_test=' + excludeSelfTest;

  // Detect filter changes - reset to page 1 when filters change
  const filterSig = [filter, moduleFilter, sourceFilter, searchText, includeLow, excludeSelfTest].join('|');
  if (filterSig !== _lastAlertFilters) {
    _lastAlertFilters = filterSig;
    alertPage = 1;
  }

  const data = await req(url);
  const allAlerts = data?.alerts || [];

  const totalPages = Math.max(1, Math.ceil(allAlerts.length / ALERTS_PER_PAGE));
  if (alertPage > totalPages) alertPage = totalPages;
  const start = (alertPage - 1) * ALERTS_PER_PAGE;
  const alertList = allAlerts.slice(start, start + ALERTS_PER_PAGE);

  const totalEl = document.getElementById('alertTotal');
  if (totalEl) totalEl.textContent = 'Page ' + alertPage + ' of ' + totalPages + ' (' + allAlerts.length + ' total)';

  const pageInfo = document.getElementById('alertPageInfo');
  const prevBtn = document.getElementById('alertPrevBtn');
  const nextBtn = document.getElementById('alertNextBtn');
  if (pageInfo) pageInfo.textContent = alertPage + ' / ' + totalPages;
  if (prevBtn) prevBtn.disabled = alertPage <= 1;
  if (nextBtn) nextBtn.disabled = alertPage >= totalPages;

  // Skip full re-render if data hasn't changed (prevents flicker on poll)
  const dataFingerprint = alertList.map(function(a) { return a.id + ':' + a.resolved + ':' + a.severity; }).join(',');
  if (dataFingerprint === _lastAlertFingerprint && body && body.innerHTML) {
    // Data unchanged - just restore any expanded state that was lost
    return;
  }
  _lastAlertFingerprint = dataFingerprint;

  // Save expanded state before re-render to prevent flicker
  const openEvidence = new Set();
  document.querySelectorAll('[id^="evidence-row-"]').forEach(function(r) {
    if (r.style.display !== 'none') openEvidence.add(r.id.replace('evidence-row-', ''));
  });
  const openExplain = new Set();
  document.querySelectorAll('[id^="explain-row-"]').forEach(function(r) {
    if (r.style.display !== 'none') openExplain.add(r.id.replace('explain-row-', ''));
  });

  if (body) body.innerHTML = alertList.length ? alertList.map(a => `
    <tr>
      <td>${sevBadge(a.severity)}</td>
      <td>
        <div style="font-weight:600;font-size:13px;color:var(--text-pr)">${esc(a.title)}
          ${a.count > 1 ? ' ' + pill(a.count + 'x','muted') : ''}
        </div>
        ${a.reason ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px">${esc(a.reason)}</div>` : ''}
      </td>
      <td>${mono(a.module)}</td>
      <td>${a.ip_address ? mono(a.ip_address) : '<span style="color:var(--text-muted)">-</span>'}</td>
      <td style="color:var(--text-muted);font-size:12px;white-space:nowrap" title="${new Date(a.timestamp).toLocaleString('en-US', { hour12: true, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}">${rel(a.timestamp)}</td>
      <td style="white-space:nowrap">
        <span style="display:inline-flex;gap:2px">
        ${a.resolved
          ? pill('<i class="ti ti-check"></i> Resolved', 'green')
          : `<button class="btn btn-outline btn-xs" onclick="resolveAlert(${a.id})">
               <i class="ti ti-check"></i> Resolve
             </button>`
        }
        <button class="btn btn-outline btn-xs" onclick="toggleEvidence(${a.id})" title="View evidence details" style="font-size:10px;padding:2px 6px">
          <i class="ti ti-info-circle"></i>
        </button>
        <span class="prem-grp" data-feature="ai">
          <button class="btn btn-outline btn-xs" onclick="toggleExplain(${a.id}, this)" title="Explain with AI" style="font-size:10px;padding:2px 6px">
            <i class="ti ti-sparkles"></i>
          </button>
          <button class="btn btn-outline btn-xs" onclick="scoreFP(${a.id}, this)" title="False positive score" style="font-size:10px;padding:2px 6px">
            FP
            </button>
          </span>
        </span>
        <span id="fp-badge-${a.id}"></span>
      </td>
    </tr>
    <tr id="explain-row-${a.id}" style="display:none;background:var(--blk)">
      <td colspan="6" style="padding:0;border:none">
        <div id="explain-content-${a.id}" style="padding:14px 20px;font-size:12px;line-height:1.7;color:var(--text-sec);border-top:1px solid var(--blk-brd)">
          <div style="display:flex;align-items:center;gap:8px;color:var(--text-muted)"><i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Analyzing with AI…</div>
        </div>
      </td>
    </tr>
    <tr id="evidence-row-${a.id}" style="display:none;background:var(--bg-card)">
      <td colspan="6" style="padding:0;border:none">
        <div id="evidence-content-${a.id}" style="padding:14px 20px;font-size:12px;line-height:1.6;color:var(--text-sec);border-top:1px solid var(--blk-brd);font-family:var(--font-mono);white-space:pre-wrap;word-break:break-all">${fmtEvidence(a.evidence)}</div>
      </td>
    </tr>
  `).join('') : emptyRow(6, '<i class="ti ti-shield-check" style="color:var(--green);font-size:18px;display:block;margin-bottom:6px"></i>SYSTEM SECURE - No alerts matching filter');

  updateAlertCount(alertList);

  // Restore any cached AI explanations that were open before re-render
  Object.keys(explainCache).forEach(function(aid) {
    var existingRow = document.getElementById('explain-row-' + aid);
    var existingContent = document.getElementById('explain-content-' + aid);
    if (existingRow && existingContent && explainCache[aid]) {
      existingRow.style.display = 'table-row';
      existingContent.innerHTML = markedExplanation(explainCache[aid]);
    }
  });
  // Restore any cached FP scores
  Object.keys(fpCache).forEach(function(aid) {
    var badge = document.getElementById('fp-badge-' + aid);
    if (badge && fpCache[aid]) {
      showFPBadge(aid, fpCache[aid]);
    }
  });

  // Restore expanded evidence rows after re-render
  openEvidence.forEach(function(aid) {
    var row = document.getElementById('evidence-row-' + aid);
    if (row) row.style.display = 'table-row';
  });
  // Restore expanded AI explanation rows
  openExplain.forEach(function(aid) {
    var row = document.getElementById('explain-row-' + aid);
    if (row) row.style.display = 'table-row';
  });

  refreshPremiumUI();
}

function updateAlertCount(alerts) {
  const critical = alerts.filter(a => a.severity === 'critical' && !a.resolved).length;
  const badge = document.getElementById('alertCount');
  if (badge) {
    badge.textContent = critical;
    badge.style.display = critical > 0 ? 'inline-flex' : 'none';
  }
}

function alertPageChange(delta) {
  alertPage = Math.max(1, alertPage + delta);
  renderAlerts();
}

async function resolveAlert(id) {
  const res = await req('/alerts/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alert_id: id })
  });
  if (res?.success) { toast('Alert resolved', 'success'); renderAlerts(); }
  else toast('Failed to resolve alert', 'error');
}

// ─── False Positive Advisor ──────────────────────────────────────────────

const fpCache = {};

async function scoreFP(alertId, btn) {
  const badge = document.getElementById('fp-badge-' + alertId);
  if (!badge) return;

  if (btn) btn.disabled = true;

  if (fpCache[alertId]) {
    showFPBadge(alertId, fpCache[alertId]);
    if (btn) btn.disabled = false;
    return;
  }

  badge.innerHTML = '<span style="color:var(--text-muted);font-size:11px">...</span>';
  const data = await req('/ai/fp/' + alertId);
  if (data && data.score !== undefined) {
    fpCache[alertId] = data;
    showFPBadge(alertId, data);
  } else {
    const errMsg = data?.error || 'unknown error';
    badge.innerHTML = `<span style="color:var(--red);font-size:11px" title="${esc(errMsg)}">FP: err</span>`;
  }
  if (btn) btn.disabled = false;
}

function showFPBadge(alertId, data) {
  const badge = document.getElementById('fp-badge-' + alertId);
  if (!badge) return;

  const score = data.score || 0;
  let color, label;
  if (data.verdict === 'false_positive') {
    color = 'var(--green)';
    label = 'FP';
  } else if (data.verdict === 'likely_legitimate') {
    color = 'var(--red)';
    label = 'Real';
  } else {
    color = 'var(--gold)';
    label = '?';
  }
  const factors = (data.fp_factors||[]).join(', ');
  const gc = data.grounding_context ? ` │ context: ${data.grounding_context}` : '';
  badge.innerHTML = `<span style="display:inline-flex;align-items:center;gap:2px;margin-left:4px;color:${color};font-size:11px;font-weight:600;padding:1px 5px;border-radius:4px;background:color-mix(in srgb, ${color} 15%, transparent);border:1px solid color-mix(in srgb, ${color} 30%, transparent)" title="FP score: ${score}% - ${factors}${gc}">${label} ${score}%</span>`;
}

async function batchScoreFP() {
  const status = document.getElementById('fpBatchStatus');
  if (status) {
    status.style.display = 'inline';
    status.innerHTML = 'Scoring...';
  }
  const data = await req('/ai/fp/batch', { method: 'POST' });
  if (data && data.scored !== undefined) {
    if (status) {
      status.innerHTML = `${data.scored} alerts scored`;
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    }
    renderAlerts();
    toast(`FP Advisor: ${data.scored} alerts scored`, 'success');
  } else {
    if (status) {
      status.innerHTML = 'Batch score failed';
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    }
  }
}

// ─── AI Alert Explanation ─────────────────────────────────────────────────

const explainCache = {};

async function toggleExplain(alertId, btn) {
  const row = document.getElementById('explain-row-' + alertId);
  const content = document.getElementById('explain-content-' + alertId);
  if (!row || !content) return;

  const isVisible = row.style.display !== 'none';
  if (isVisible) {
    row.style.display = 'none';
    btn.classList.remove('active');
    return;
  }

  row.style.display = 'table-row';
  btn.classList.add('active');

  if (explainCache[alertId]) {
    content.innerHTML = markedExplanation(explainCache[alertId]);
    return;
  }

  // Check cache first
  const cached = await req('/ai/explain/' + alertId);
  if (cached?.explanation) {
    explainCache[alertId] = cached.explanation;
    content.innerHTML = markedExplanation(cached.explanation);
    return;
  }

  // Generate new explanation
  content.innerHTML = '<div style="color:var(--text-muted);font-style:italic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite;vertical-align:middle;margin-right:6px"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg> AI analyzing alert…</div>';
  const result = await req('/ai/explain/' + alertId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (result?.explanation) {
    explainCache[alertId] = result.explanation;
    content.innerHTML = markedExplanation(result.explanation);
  } else if (result?.error) {
    content.innerHTML = `<div style="color:var(--red)"><i class="ti ti-alert-triangle"></i> ${esc(result.error)}</div>`;
  } else {
    content.innerHTML = `<div style="color:var(--text-muted)"><i class="ti ti-sparkles"></i> AI analysis unavailable - set GEMINI_API_KEY to enable</div>`;
  }
}

function markedExplanation(text) {
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-pr)">$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/(#{1,3})\s+(.*)/g, '<div style="font-weight:700;font-size:13px;color:var(--text-pr);margin-top:8px">$2</div>');
  return html;
}

function fmtEvidence(evidence) {
  if (!evidence) return 'No evidence available';
  try {
    const obj = typeof evidence === 'string' ? JSON.parse(evidence) : evidence;
    const lines = [];
    for (const [k, v] of Object.entries(obj)) {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (v !== null && typeof v === 'object') {
        if (Array.isArray(v)) {
          lines.push(`${label}: ${v.join(', ')}`);
        } else {
          lines.push(`${label}:\n${JSON.stringify(v, null, 2)}`);
        }
      } else {
        lines.push(`${label}: ${v}`);
      }
    }
    return esc(lines.join('\n'));
  } catch {
    return esc(String(evidence));
  }
}

function toggleEvidence(alertId) {
  const row = document.getElementById('evidence-row-' + alertId);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

// ─── Floating Chat Widget ─────────────────────────────────────────────────

const chatHistory = [];

function toggleChat() {
  const panel = document.getElementById('chatWidgetPanel');
  const btn = document.getElementById('chatWidgetBtn');
  const isOpen = panel.classList.toggle('open');
  btn.style.display = isOpen ? 'none' : 'flex';
  if (isOpen && !chatHistory.length) initChatPanel();
}

function initChatPanel() {
  const msgs = document.getElementById('chatMessages');
  if (!msgs) return;
  msgs.innerHTML = `<div style="text-align:center;padding:30px 20px;color:var(--text-muted);font-size:13px;line-height:1.8">
    <div style="font-weight:700;color:var(--text-pr);font-size:16px;margin-bottom:6px;letter-spacing:-0.01em">Security Assistant</div>
    <div style="font-size:12px;color:var(--text-sec)">Ask about your security posture, alerts, config, or threats.</div>
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:6px;align-items:center">
      <button class="btn btn-mar btn-xs" style="width:220px;padding:7px 14px" onclick="quickChat('How many alerts?')">How many alerts?</button>
      <button class="btn btn-mar btn-xs" style="width:220px;padding:7px 14px" onclick="quickChat('System health?')">System health?</button>
      <button class="btn btn-mar btn-xs" style="width:220px;padding:7px 14px" onclick="quickChat('What to check first?')">What to check first?</button>
    </div>
  </div>`;
}

function renderMarkdown(text) {
  // Escape HTML entities to prevent injection
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Code blocks (triple backticks)
  text = text.replace(/`{3}(\w*)\n([\s\S]*?)`{3}/g, '<pre style="background:var(--blk);border:1px solid var(--blk-brd);padding:10px;border-radius:6px;overflow-x:auto;font-family:var(--font-mono);font-size:11px;margin:8px 0;color:var(--text-sec)"><code>$2</code></pre>');
  
  // Inline code (single backticks)
  text = text.replace(/`([^`\n]+)`/g, '<code style="background:var(--blk);border:1px solid var(--blk-brd);padding:2px 5px;border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--maroon-accent)">$1</code>');
  
  // Bold (**bold**)
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Bold (__bold__)
  text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic (*italic*)
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Italic (_italic_)
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Headers
  text = text.replace(/^### (.*?)$/gm, '<div style="font-size:13px;font-weight:700;margin:10px 0 4px;color:var(--text-pr)">$1</div>');
  text = text.replace(/^## (.*?)$/gm, '<div style="font-size:14px;font-weight:700;margin:12px 0 6px;color:var(--text-pr)">$1</div>');
  text = text.replace(/^# (.*?)$/gm, '<div style="font-size:15px;font-weight:700;margin:14px 0 6px;color:var(--text-pr)">$1</div>');
  
  // Blockquotes
  text = text.replace(/^> (.*?)$/gm, '<div style="border-left:3px solid var(--maroon-accent);padding-left:10px;margin:6px 0;color:var(--text-sec);font-style:italic">$1</div>');
  
  // Unordered Lists (grouping - to avoid stray list styles and spacing)
  let inList = false;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('- ') || line.startsWith('* ')) {
      let content = line.substring(2);
      if (!inList) {
        lines[i] = '<ul style="margin:6px 0;padding-left:18px;list-style:disc;display:flex;flex-direction:column;gap:3px"><li style="font-size:13px;line-height:1.5;color:var(--text-sec)">' + content + '</li>';
        inList = true;
      } else {
        lines[i] = '<li style="font-size:13px;line-height:1.5;color:var(--text-sec)">' + content + '</li>';
      }
    } else {
      if (inList) {
        lines[i - 1] += '</ul>';
        inList = false;
      }
    }
  }
  if (inList) {
    lines[lines.length - 1] += '</ul>';
  }
  text = lines.join('\n');

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--maroon-accent);text-decoration:underline;font-weight:500">$1</a>');
  
  // Replace remaining newlines with break tags, except inside layout containers
  text = text.split('\n').map(line => {
    if (line.includes('<ul') || line.includes('<li') || line.includes('</ul') || line.includes('<pre') || line.includes('</pre') || line.includes('<code') || line.includes('</code')) {
      return line;
    }
    return line + '<br>';
  }).join('\n');
  
  // Clean up double br tags
  text = text.replace(/(<br>\s*)+$/g, '');
  return text;
}

function addChatMessage(role, content, actions) {
  const msgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  const isUser = role === 'user';
  div.style.cssText = `max-width:88%;padding:10px 14px;border-radius:8px;font-size:14px;line-height:1.7;overflow-wrap:break-word;word-break:break-word;align-self:${isUser ? 'flex-end' : 'flex-start'};background:${isUser ? 'var(--maroon)' : 'var(--blk-md)'};color:${isUser ? '#fff' : 'var(--text-pr)'}`;
  let html = isUser ? content.replace(/\n/g, '<br>') : renderMarkdown(content);

  // Render action buttons
  if (actions && actions.length) {
    html += '<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">';
    for (const a of actions) {
      const labelMap = { block_ip: '🚫 Block', unblock_ip: '🔓 Unblock', resolve_alert: '✅ Resolve', add_directory: '📁 Add Dir', view_file: '📄 View' };
      const colorMap = { block_ip: 'var(--red)', unblock_ip: 'var(--green)', resolve_alert: 'var(--maroon-accent)', add_directory: 'var(--blue)', view_file: 'var(--gold)' };
      const label = labelMap[a.type] || '▶ ' + a.type;
      const color = colorMap[a.type] || 'var(--blue)';
      const handler = actionHandlers[a.type];
      html += `<button class="btn btn-xs" style="background:${color};color:#fff;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600" onclick="executeAction('${esc(a.type)}','${esc(a.target)}',this)">${label} ${esc(a.target)}</button>`;
    }
    html += '</div>';
  }

  div.innerHTML = html;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

const actionHandlers = {};

async function executeAction(type, target, btn) {
  btn.disabled = true;
  const label = btn.textContent.trim();
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>';
  try {
    const handler = actionHandlers[type];
    if (handler) {
      await handler(target, btn);
    } else {
      toast(`No handler for action: ${type}`, 'warn');
      btn.disabled = false;
      btn.textContent = label;
    }
  } catch (e) {
    btn.disabled = false;
    btn.textContent = label;
    toast(`Action failed: ${e}`, 'error');
  }
}

// Register action handlers
actionHandlers.block_ip = async (ip, btn) => {
  const res = await req('/traffic/block', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) });
  if (res?.success) { btn.innerHTML = '<i class="ti ti-check"></i> Blocked'; toast(`Blocked ${ip}`, 'warn'); } else { btn.innerHTML = '<i class="ti ti-alert-triangle"></i> Failed'; toast('Block failed', 'error'); }
};
actionHandlers.unblock_ip = async (ip, btn) => {
  const res = await req('/traffic/unblock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) });
  if (res?.success) { btn.innerHTML = '<i class="ti ti-check"></i> Unblocked'; toast(`Unblocked ${ip}`, 'success'); } else { btn.innerHTML = '<i class="ti ti-alert-triangle"></i> Failed'; toast('Unblock failed', 'error'); }
};
actionHandlers.resolve_alert = async (id, btn) => {
  const res = await req('/alerts/' + id + '/resolve', { method: 'POST' });
  if (res?.success) { btn.innerHTML = '<i class="ti ti-check"></i> Resolved'; toast(`Resolved alert #${id}`, 'success'); } else { btn.innerHTML = '<i class="ti ti-alert-triangle"></i> Failed'; toast('Resolve failed', 'error'); }
};
actionHandlers.add_directory = async (path, btn) => {
  const res = await req('/monitor/directories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
  if (res?.success) { btn.innerHTML = '<i class="ti ti-check"></i> Added'; toast(`Monitoring ${path}`, 'success'); } else { btn.innerHTML = '<i class="ti ti-alert-triangle"></i> Failed'; toast('Add directory failed', 'error'); }
};
actionHandlers.view_file = async (path, btn) => {
  const res = await req('/files/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
  if (res && res.content !== undefined) {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center';
    modal.innerHTML = `<div style="background:var(--bg-card);border:1px solid var(--blk-brd);border-radius:8px;max-width:800px;width:90%;max-height:80vh;display:flex;flex-direction:column">
      <div style="padding:12px 16px;border-bottom:1px solid var(--blk-brd);display:flex;justify-content:space-between;align-items:center">
        <strong style="color:var(--text-pr);font-size:14px">${esc(res.path)}</strong>
        <span style="color:var(--text-muted);font-size:12px">${res.total_lines} lines</span>
      </div>
      <pre style="padding:16px;overflow:auto;flex:1;margin:0;font-size:12px;line-height:1.6;color:var(--text-sec);white-space:pre-wrap;word-break:break-all">${esc(res.content)}</pre>
      <div style="padding:8px 16px;border-top:1px solid var(--blk-brd);text-align:right">
        <button onclick="this.closest('div[style*=fixed]').remove()" class="btn btn-outline btn-xs" style="color:var(--text-muted)">Close</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  } else {
    toast('Failed to read file: ' + (res?.detail || 'unknown error'), 'error');
  }
};

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  addChatMessage('user', msg);
  chatHistory.push({ role: 'user', content: msg });

  const loadingDiv = document.createElement('div');
  loadingDiv.style.cssText = 'max-width:88%;padding:10px 14px;border-radius:8px;font-size:14px;align-self:flex-start;background:var(--blk-md);color:var(--text-muted)';
  loadingDiv.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Thinking...';
  document.getElementById('chatMessages').appendChild(loadingDiv);

  const res = await req('/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, history: chatHistory.slice(-20), active_tab: currentTab })
  });

  loadingDiv.remove();
  if (res?.reply) {
    addChatMessage('assistant', res.reply, res.actions);
    chatHistory.push({ role: 'assistant', content: res.reply });
  } else {
    addChatMessage('assistant', 'AI unavailable - check API key or try again later.');
  }
}

async function quickChat(msg) {
  const panel = document.getElementById('chatWidgetPanel');
  if (!panel.classList.contains('open')) {
    panel.classList.add('open');
    document.getElementById('chatWidgetBtn').style.display = 'none';
    if (!chatHistory.length) initChatPanel();
  }
  document.getElementById('chatInput').value = msg;
  await sendChatMessage();
}

// ═══════════════════════════════════════════════════════════════════════════
//  KILL CHAIN
// ═══════════════════════════════════════════════════════════════════════════

async function renderKillChain() {
  const body = document.getElementById('kcBody');
  if (body) body.innerHTML = skeletonRows(4);

  const data = await req('/killchain');
  const chains = data?.chains || [];

  if (body) body.innerHTML = chains.length ? chains.map(c => {
    const pct = c.coverage_pct || 0;
    const riskColor = pct > 60 ? 'var(--red)' : pct > 30 ? 'var(--gold)' : 'var(--text-muted)';
    const sevColor = c.severity === 'critical' ? 'var(--red)' : c.severity === 'high' ? 'var(--maroon-accent)' : c.severity === 'medium' ? 'var(--gold)' : 'var(--text-muted)';
    return `<tr onclick="showChainDetail('${c.ip}')" style="cursor:pointer">
      <td>${mono(c.ip)}</td>
      <td>
        <div style="font-size:13px;font-weight:600;color:var(--text-pr)">${c.stages_completed || 0}<span style="color:var(--text-muted);font-weight:400">/${c.total_stages || 10}</span></div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="kc-bar-track" style="width:130px"><span class="kc-bar-fill" style="width:${pct}%"></span></span>
        </div>
      </td>
      <td>
        <span style="font-weight:700;color:${riskColor};font-variant-numeric:tabular-nums">${pct}%</span>
      </td>
      <td><span class="pill" style="background:color-mix(in srgb, ${sevColor} 20%, transparent);color:${sevColor};font-weight:600">${c.severity}</span></td>
    </tr>`;
  }).join('') : emptyRow(5, 'No active kill chains detected');
}

async function showChainDetail(ip) {
  const content = document.getElementById('chainDetailContent');
  if (!content) return;
  document.getElementById('chainDetailLabel').textContent = 'Inspecting: ' + ip;
  content.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)"><i class="ti ti-loader" style="animation:spin 1s linear infinite;font-size:18px;display:block;margin-bottom:8px"></i>Loading chain detail...</div>';

  const data = await req('/killchain/' + encodeURIComponent(ip));
  const chain = data?.chain;
  if (!chain) {
    content.innerHTML = '<div style="padding:40px;text-align:center;color:var(--red)">No chain data found</div>';
    return;
  }

  const sevColor = chain.severity === 'critical' ? 'var(--red)' : chain.severity === 'high' ? 'var(--maroon-accent)' : chain.severity === 'medium' ? 'var(--gold)' : 'var(--text-muted)';

  let html = `
    <div style="padding:16px 20px;border-bottom:1px solid var(--blk-brd)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:700;font-size:15px;color:var(--text-pr)">${mono(chain.ip)}</span>
        <span class="pill" style="background:color-mix(in srgb, ${sevColor} 20%, transparent);color:${sevColor}">${chain.severity}</span>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-sec)">
        <span>Duration: <strong style="color:var(--text-pr)">${chain.duration_hours}h</strong></span>
        <span>Events: <strong style="color:var(--text-pr)">${chain.event_count}</strong></span>
        <span>Stages: <strong style="color:var(--text-pr)">${chain.stages_completed}/${chain.total_stages}</strong></span>
        <span>Coverage: <strong style="color:${sevColor}">${chain.coverage_pct}%</strong></span>
      </div>
    </div>
    <div style="padding:14px 20px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:10px">Stage Timeline</div>`;

  // Stage timeline rows
  const stageOrder = ["TA0001","TA0002","TA0003","TA0004","TA0005","TA0006","TA0007","TA0008","TA0009","TA0010"];
  for (const sid of stageOrder) {
    const stage = chain.stages?.[sid];
    const isComplete = !!stage;
    const name = stage?.name || sid;
    html += `
      <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--blk-brd);opacity:${isComplete ? 1 : 0.35}">
        <span style="width:14px;height:14px;border-radius:50%;flex-shrink:0;background:${isComplete ? 'var(--green)' : 'var(--blk-md)'};border:2px solid ${isComplete ? 'rgba(61,186,82,0.4)' : 'var(--blk-brd)'}"></span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:${isComplete ? 'var(--text-pr)' : 'var(--text-muted)'}">${esc(name)}</div>
          <div style="font-size:10px;color:var(--text-muted)">
            ${isComplete ? `<span style="color:var(--green)">Detected: ${rel(stage.first_detected)}</span>` : 'Not yet observed'}
            ${stage?.technique ? `&nbsp;·&nbsp;MITRE: ${stage.technique}` : ''}
          </div>
        </div>
      </div>`;
  }

  // Events section
  if (chain.events && chain.events.length) {
    html += `
      <div style="padding:14px 0 0">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:8px">Recent Events (${chain.events.length})</div>`;
    for (const ev of chain.events.slice(0, 15)) {
      html += `<div style="display:flex;gap:8px;padding:4px 0;font-size:11px;border-bottom:1px solid var(--blk-brd)">
        <span class="pill" style="font-size:9px;padding:1px 5px">${esc(ev.module||'?')}</span>
        <span style="flex:1;color:var(--text-pr)">${esc(ev.title||'')}</span>
        <span style="color:var(--text-muted)">${rel(ev.timestamp)}</span>
      </div>`;
    }
    html += `</div>`;
  }

  // MITRE coverage mini grid at bottom
  const maxStage = chain.stages_completed || 0;
  html += `
    <div style="padding:16px 20px;border-top:1px solid var(--blk-brd)">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:8px">MITRE ATT&CK Coverage</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">`;
  const mitreLabels = ['IA','EX','PE','PR','DE','CR','DI','LM','CO','EX'];
  for (let i = 0; i < 10; i++) {
    const covClass = i < maxStage ? '' : 'none';
    html += `<span class="mitre-cell ${covClass}" style="width:36px;height:36px;font-size:10px;display:inline-flex;align-items:center;justify-content:center">${mitreLabels[i]||''}</span>`;
  }
  html += `</div></div>`;

  content.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WAF
// ═══════════════════════════════════════════════════════════════════════════

async function renderWafStats() {
  const row = document.getElementById('wafStatsRow');
  if (!row) return;
  const data = await req('/waf/stats');
  if (!data) {
    row.innerHTML = '';
    return;
  }

  let html = '';
  const cards = [
    { label: 'Total Events', value: data.total_events, icon: 'ti ti-shield', color: 'var(--blue)' },
    { label: 'Blocked', value: data.total_blocked, icon: 'ti ti-shield-off', color: 'var(--red)' },
    { label: 'Block Rate', value: data.block_rate + '%', icon: 'ti ti-percentage', color: 'var(--maroon-accent)' },
  ];
  for (const c of cards) {
    html += `
      <div class="stat-card">
        <div class="stat-icon" style="background:color-mix(in srgb, ${c.color} 15%, transparent);color:${c.color}"><i class="${c.icon}"></i></div>
        <div>
          <div class="stat-value" style="color:${c.color}">${c.value}</div>
          <div class="stat-label">${c.label}</div>
        </div>
      </div>`;
  }

  // Attack type breakdown as pills
  if (data.attack_types && data.attack_types.length) {
    html += `
      <div class="stat-card" style="flex:2;min-width:200px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:8px">By Attack Type</div>
        <div style="display:flex;gap:4px;flex-wrap:wrap">`;
    for (const at of data.attack_types) {
      html += `<span class="pill" style="background:color-mix(in srgb, var(--maroon-accent) 15%, transparent);color:var(--maroon-accent)">${esc(at.type)}: ${at.count}</span>`;
    }
    html += `</div></div>`;
  }

  // Top blocked IPs
  if (data.top_blocked_ips && data.top_blocked_ips.length) {
    html += `
      <div class="stat-card" style="flex:1;min-width:160px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:8px">Top Blocked IPs</div>
        <div style="display:flex;flex-direction:column;gap:3px">`;
    for (const ip of data.top_blocked_ips.slice(0, 5)) {
      html += `<div style="display:flex;justify-content:space-between;font-size:11px"><span style="font-family:var(--font-mono);color:var(--text-pr)">${esc(ip.ip)}</span><span style="color:var(--red)">${ip.blocks}</span></div>`;
    }
    html += `</div></div>`;
  }

  row.innerHTML = html;
}

async function renderWafLog() {
  const body = document.getElementById('wafLogBody');
  if (body) body.innerHTML = skeletonRows(4);
  const data = await req('/events/waf');
  if (body) body.innerHTML = (data?.events || []).slice(0, 25).map(e => `
    <tr onclick="showWafEventDetail(this)" style="cursor:pointer">
      <td>${mono(e.ip_address)}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.path)}</td>
      <td>${pill(esc(e.attack_type || e.pattern_matched || 'INTEL'), 'red')}</td>
      <td style="color:var(--text-muted);font-size:12px;white-space:nowrap" title="${new Date(e.timestamp).toLocaleString('en-US', { hour12: true, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}">${rel(e.timestamp)}</td>
    </tr>
    <tr class="waf-detail-row" style="display:none;background:var(--blk)">
      <td colspan="4" style="padding:10px 20px;font-size:11px;border-top:1px solid var(--blk-brd)">
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          <span>Method: <strong style="color:var(--text-pr)">${e.method || '?'}</strong></span>
          <span>Query: <strong style="color:var(--text-pr)">${esc(e.query_string || '-')}</strong></span>
          <span>UA: <strong style="color:var(--text-pr)">${esc((e.user_agent||'').substring(0,40))}</strong></span>
        </div>
        ${e.pattern_matched ? '<div style="margin-top:6px">Pattern: <code style="color:var(--maroon-accent);font-size:10px">' + esc(e.pattern_matched) + '</code></div>' : ''}
        ${e.abuse_score ? '<div style="margin-top:4px">AbuseIPDB score: ' + e.abuse_score + '%</div>' : ''}
      </td>
    </tr>
  `).join('') || emptyRow(4, 'No WAF events logged');
}

// Expand/collapse WAF event detail
document.addEventListener('click', function(e) {
  const detailRow = e.target.closest('.waf-detail-row');
  if (!detailRow) {
    document.querySelectorAll('.waf-detail-row').forEach(function(r) {
      if (r.style.display !== 'none' && !r.contains(e.target)) r.style.display = 'none';
    });
  }
});
function showWafEventDetail(tr) {
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('waf-detail-row')) {
    next.style.display = next.style.display === 'none' ? 'table-row' : 'none';
  }
}

function setWafPayload(t) {
  const q = document.getElementById('wafQuery');
  const b = document.getElementById('wafBody');
  const m = document.getElementById('wafMethod');
  const p = document.getElementById('wafPath');
  const payloads = {
    sqli:     { m:'GET',  p:'/api/users',    q:"id=1' OR 1=1--",                           b:'' },
    xss:      { m:'POST', p:'/api/comments', q:'',                                          b:'{"text":"<script>alert(1)<\/script>"}' },
    cmdi:     { m:'GET',  p:'/cgi-bin/test', q:'cmd=; whoami',                             b:'' },
    traversal:{ m:'GET',  p:'/api/files',    q:'file=../../../etc/passwd',                 b:'' },
    ssrf:     { m:'GET',  p:'/api/proxy',    q:'url=http://169.254.169.254/latest/meta-data/', b:'' },
    webshell: { m:'POST', p:'/shell.php',    q:'',                                          b:'<?php system($_GET["cmd"]); ?>' }
  };
  const pl = payloads[t] || payloads.sqli;
  m.value = pl.m; p.value = pl.p; q.value = pl.q; b.value = pl.b;
}

async function testWaf() {
  const btn = document.querySelector('[onclick="testWaf()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Inspecting…'; }

  const res = await req('/waf/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ip_address:   document.getElementById('wafIp').value,
      method:       document.getElementById('wafMethod').value,
      path:         document.getElementById('wafPath').value,
      query_string: document.getElementById('wafQuery').value,
      body:         document.getElementById('wafBody').value
    })
  });

  const out = document.getElementById('wafResult');
  out.style.display = 'block';
  if (res?.blocked) {
    out.style.color = 'var(--red)';
    out.innerHTML = `<div style="color:var(--red);font-weight:700;font-size:14px;margin-bottom:8px"><i class="ti ti-shield-off"></i> BLOCKED</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px">
        <span>Attack Type: <strong style="color:var(--text-pr)">${esc(res.attack_type || '?')}</strong></span>
        <span>Severity: <strong style="color:var(--text-pr)">${esc(res.severity || '?')}</strong></span>
        <span>Reason: <strong style="color:var(--text-pr)">${esc(res.reason || '')}</strong></span>
        ${res.country ? '<span>Country: <strong style="color:var(--text-pr)">' + esc(res.country) + '</strong></span>' : ''}
        ${res.abuse_score ? '<span>Abuse Score: <strong style="color:var(--red)">' + res.abuse_score + '%</strong></span>' : ''}
      </div>`;
  } else {
    out.style.color = 'var(--green)';
    out.innerHTML = `<div style="color:var(--green);font-weight:700;font-size:14px"><i class="ti ti-shield-check"></i> PASSED - No malicious content detected</div>`;
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Execute Inspection'; }
  if (res?.blocked) toast(`BLOCKED - ${res.attack_type || 'Attack detected'}`, 'error');
  else toast('Request passed WAF inspection', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════
//  WAF CUSTOM RULES
// ═══════════════════════════════════════════════════════════════════════════
let wafRulesCurrentPage = 1;
let trafficPage = 1;
let alertPage = 1;
let loginPage = 1;
const TRAFFIC_PER_PAGE = 25;
const ALERTS_PER_PAGE = 25;
const LOGIN_PER_PAGE = 25;
let _lastAlertFilters = '';
let _lastLoginFilters = '';

async function renderWafCustomRules() {
  const body = document.getElementById('wafCustomRulesBody');
  const countEl = document.getElementById('wafCustomRuleCount');
  const pageInfo = document.getElementById('wafRulePageInfo');
  const prevBtn = document.getElementById('wafRulesPrevBtn');
  const nextBtn = document.getElementById('wafRulesNextBtn');
  if (body) body.innerHTML = skeletonRows(10);
  const data = await req('/api/waf/custom-rules?page=' + wafRulesCurrentPage + '&per_page=100');
  const rules = data?.rules || [];
  const total = data?.total || 0;
  const totalPages = data?.total_pages || 1;
  if (countEl) countEl.textContent = total + ' rules';
  if (pageInfo) pageInfo.textContent = 'Page ' + wafRulesCurrentPage + ' of ' + totalPages + ' (' + total + ' rules)';
  if (prevBtn) prevBtn.disabled = wafRulesCurrentPage <= 1;
  if (nextBtn) nextBtn.disabled = wafRulesCurrentPage >= totalPages;
  if (body) body.innerHTML = rules.length ? rules.map(r => `
    <tr>
      <td style="font-weight:600;color:var(--text-pr)">${esc(r.name)}</td>
      <td>${pill(esc(r.attack_type), 'muted')}</td>
      <td>${sevBadge(r.severity)}</td>
      <td>${r.contexts ? pill(esc(r.contexts), 'blue') : pill('ALL','muted')}</td>
      <td style="text-align:center;font-weight:600">${r.score != null ? r.score : 3}</td>
      <td style="font-family:var(--font-mono);font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.pattern)}">${esc(r.pattern)}</td>
      <td>${pill(esc(r.action), r.action === 'block' ? 'red' : 'gold')}</td>
      <td>${r.enabled ? pill('Active','green') : pill('Disabled','muted')}</td>
      <td>${r.is_default ? pill('Built-in','muted') : pill('Custom','blue')}</td>
      <td style="white-space:nowrap">
        ${r.is_default ? `
          <button class="btn btn-outline btn-xs" onclick="toggleWafCustomRule(${r.id}, ${r.enabled ? 0 : 1})">
            <i class="ti ${r.enabled ? 'ti-player-pause' : 'ti-player-play'}"></i>
            ${r.enabled ? 'Disable' : 'Enable'}
          </button>
        ` : `
          <button class="btn btn-outline btn-xs" onclick="editWafCustomRule(${r.id})">
            <i class="ti ti-edit"></i> Edit
          </button>
          <button class="btn btn-danger btn-xs" onclick="deleteWafCustomRule(${r.id})">
            <i class="ti ti-trash"></i>
          </button>
        `}
      </td>
    </tr>
  `).join('') : emptyRow(10, '<i class="ti ti-shield-off" style="color:var(--text-muted);display:block;margin-bottom:6px;font-size:18px"></i>No custom WAF rules - add one above');
}

function wafRulesPage(delta) {
  wafRulesCurrentPage = Math.max(1, wafRulesCurrentPage + delta);
  renderWafCustomRules();
}

async function toggleWafCustomRule(id, enabled) {
  const res = await req('/api/waf/custom-rules/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: !!enabled }),
  });
  if (res?.success) {
    toast(enabled ? 'Rule enabled' : 'Rule disabled', 'success');
    renderWafCustomRules();
  } else {
    toast('Failed to update rule', 'error');
  }
}

async function deleteWafCustomRule(id) {
  if (!confirm('Delete this WAF custom rule?')) return;
  const res = await req('/api/waf/custom-rules/' + id, { method: 'DELETE' });
  if (res?.success) {
    toast('Rule deleted', 'warn');
    renderWafCustomRules();
  } else {
    toast('Failed to delete rule', 'error');
  }
}

async function restoreDefaultWafRules() {
  if (!confirm('This will delete ALL custom rules and re-enable all built-in defaults. Continue?')) return;
  const res = await req('/api/waf/custom-rules/restore-defaults', { method: 'POST' });
  if (res?.success) {
    toast('Default rules restored', 'success');
    renderWafCustomRules();
  } else {
    toast('Failed to restore defaults', 'error');
  }
}

function showAddWafRuleModal() {
  document.getElementById('addWafRulePanel').classList.add('open');
  document.getElementById('wafRuleName').value = '';
  document.getElementById('wafRuleDescription').value = '';
  document.getElementById('wafRulePattern').value = '';
  document.getElementById('wafRuleAttackType').value = 'custom';
  document.getElementById('wafRuleSeverity').value = 'medium';
  document.getElementById('wafRuleAction').value = 'block';
  document.getElementById('wafRuleContexts').value = 'ALL';
  document.getElementById('wafRuleScore').value = '3';
  document.getElementById('wafRuleKeywords').value = '';
  document.getElementById('wafRuleEnabled').checked = true;
  document.getElementById('wafRuleName').focus();
}

function closeAddWafRuleModal() {
  document.getElementById('addWafRulePanel').classList.remove('open');
}

async function createWafCustomRule() {
  const name = document.getElementById('wafRuleName').value.trim();
  const pattern = document.getElementById('wafRulePattern').value.trim();
  if (!name) { toast('Rule name is required', 'warn'); return; }
  if (!pattern) { toast('Regex pattern is required', 'warn'); return; }
  const res = await req('/api/waf/custom-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: document.getElementById('wafRuleDescription').value.trim(),
      attack_type: document.getElementById('wafRuleAttackType').value,
      severity: document.getElementById('wafRuleSeverity').value,
      pattern: pattern,
      action: document.getElementById('wafRuleAction').value,
      enabled: document.getElementById('wafRuleEnabled').checked,
      contexts: document.getElementById('wafRuleContexts').value,
      score: parseInt(document.getElementById('wafRuleScore').value) || 3,
      keywords: document.getElementById('wafRuleKeywords').value.trim(),
    }),
  });
  if (res?.success) {
    toast('WAF custom rule created', 'success');
    closeAddWafRuleModal();
    renderWafCustomRules();
  } else {
    const detail = res?.detail || 'Failed to create rule';
    toast(detail, 'error');
  }
}

let editingWafRuleId = null;

async function editWafCustomRule(id) {
  const data = await req('/api/waf/custom-rules?page=1&per_page=1000');
  const rule = data?.rules?.find(r => r.id === id);
  if (!rule) { toast('Rule not found', 'error'); return; }
  editingWafRuleId = id;
  document.getElementById('addWafRulePanel').classList.add('open');
  document.getElementById('wafRuleName').value = rule.name || '';
  document.getElementById('wafRuleDescription').value = rule.description || '';
  document.getElementById('wafRulePattern').value = rule.pattern || '';
  document.getElementById('wafRuleAttackType').value = rule.attack_type || 'custom';
  document.getElementById('wafRuleSeverity').value = rule.severity || 'medium';
  document.getElementById('wafRuleAction').value = rule.action || 'block';
  document.getElementById('wafRuleContexts').value = rule.contexts || 'ALL';
  document.getElementById('wafRuleScore').value = rule.score != null ? rule.score : 3;
  document.getElementById('wafRuleKeywords').value = rule.keywords || '';
  document.getElementById('wafRuleEnabled').checked = !!rule.enabled;
  document.getElementById('wafRuleName').focus();
  document.querySelector('#addWafRulePanel .modal-title').innerHTML = '<i class="ti ti-edit"></i> Edit WAF Custom Rule';
  document.querySelector('#addWafRulePanel .btn-mar').innerHTML = '<i class="ti ti-device-floppy"></i> Update Rule';
  document.querySelector('#addWafRulePanel .btn-mar').onclick = updateWafCustomRule;
}

async function updateWafCustomRule() {
  const id = editingWafRuleId;
  if (!id) { toast('No rule selected', 'error'); return; }
  const name = document.getElementById('wafRuleName').value.trim();
  const pattern = document.getElementById('wafRulePattern').value.trim();
  if (!name) { toast('Rule name is required', 'warn'); return; }
  if (!pattern) { toast('Regex pattern is required', 'warn'); return; }
  const res = await req('/api/waf/custom-rules/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description: document.getElementById('wafRuleDescription').value.trim(),
      attack_type: document.getElementById('wafRuleAttackType').value,
      severity: document.getElementById('wafRuleSeverity').value,
      pattern: pattern,
      action: document.getElementById('wafRuleAction').value,
      enabled: document.getElementById('wafRuleEnabled').checked,
      contexts: document.getElementById('wafRuleContexts').value,
      score: parseInt(document.getElementById('wafRuleScore').value) || 3,
      keywords: document.getElementById('wafRuleKeywords').value.trim(),
    }),
  });
  if (res?.success) {
    toast('WAF custom rule updated', 'success');
    closeAddWafRuleModal();
    renderWafCustomRules();
  } else {
    const detail = res?.detail || 'Failed to update rule';
    toast(detail, 'error');
  }
}

// Override closeAddWafRuleModal to reset to create mode
const _origClose = closeAddWafRuleModal;
closeAddWafRuleModal = function() {
  _origClose();
  editingWafRuleId = null;
  const title = document.querySelector('#addWafRulePanel .modal-title');
  const btn = document.querySelector('#addWafRulePanel .btn-mar');
  if (title) title.innerHTML = '<i class="ti ti-shield-plus"></i> New WAF Custom Rule';
  if (btn) { btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Rule'; btn.onclick = createWafCustomRule; }
};

async function importCrsRules() {
  const btn = document.querySelector('[onclick*="importCrsRules"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i> Importing...'; }
  try {
    const res = await req('/api/waf/rules/import-crs', { method: 'POST' });
    if (res?.success) {
      toast(res.message || `Imported ${res.imported} CRS rules`, 'success');
      renderWafCustomRules();
    } else {
      toast(res?.detail || 'Failed to import CRS rules', 'error');
    }
  } catch (e) {
    toast('Import failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-cloud-download"></i> Import CRS'; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  THREAT INTEL
// ═══════════════════════════════════════════════════════════════════════════

async function renderIntel() {
  const body = document.getElementById('trafficBody');
  if (body) body.innerHTML = skeletonRows(4);

  const pageInfo = document.getElementById('trafficPageInfo');
  const prevBtn = document.getElementById('trafficPrevBtn');
  const nextBtn = document.getElementById('trafficNextBtn');

  const data = await req('/traffic/top?limit=500');
  const allIps = data?.ips || [];

  const totalPages = Math.max(1, Math.ceil(allIps.length / TRAFFIC_PER_PAGE));
  if (trafficPage > totalPages) trafficPage = totalPages;
  const start = (trafficPage - 1) * TRAFFIC_PER_PAGE;
  const ips = allIps.slice(start, start + TRAFFIC_PER_PAGE);

  if (pageInfo) pageInfo.textContent = trafficPage + ' / ' + totalPages + ' (' + allIps.length + ' total)';
  if (prevBtn) prevBtn.disabled = trafficPage <= 1;
  if (nextBtn) nextBtn.disabled = trafficPage >= totalPages;

  if (body) body.innerHTML = ips.length ? ips.map(ip => {
    const score = ip.abuse_score || 0;
    const scoreColor = score > 50 ? 'var(--red)' : score > 10 ? 'var(--gold)' : 'var(--green)';
    return `<tr>
      <td>${mono(ip.ip_address)}</td>
      <td style="font-weight:700;font-variant-numeric:tabular-nums">${fmt(ip.hit_count)}</td>
      <td>
        <span style="font-size:11px;font-weight:600;color:${scoreColor}">${score}%</span>
        <span style="font-size:11px;color:var(--text-muted);margin-left:6px">${esc(ip.country || '??')}</span>
        ${ip.is_blocked ? pill('Blocked','red') : ''}
      </td>
      <td>
        <button class="btn btn-xs ${ip.is_blocked ? 'btn-green' : 'btn-danger'}"
          onclick="toggleBlock('${esc(ip.ip_address)}', ${ip.is_blocked})">
          <i class="ti ${ip.is_blocked ? 'ti-lock-open' : 'ti-ban'}"></i>
          ${ip.is_blocked ? 'Unblock' : 'Block'}
        </button>
      </td>
    </tr>`;
  }).join('') : emptyRow(4, 'No traffic data available');

  const intelFull = document.getElementById('intelGridFull');
  if (intelFull) {
    const malCount  = allIps.filter(i => i.abuse_score > 50).length;
    const suspCount = allIps.filter(i => i.abuse_score > 0 && i.abuse_score <= 50).length;
    const clnCount  = allIps.filter(i => !i.abuse_score).length;
    intelFull.innerHTML = `
      <div class="intel-item"><div class="intel-num known">${malCount}</div><div class="intel-label">Malicious</div></div>
      <div class="intel-item"><div class="intel-num susp">${suspCount}</div><div class="intel-label">Suspicious</div></div>
      <div class="intel-item"><div class="intel-num clean">${clnCount}</div><div class="intel-label">Clean</div></div>
      <div class="intel-item"><div class="intel-num total">${allIps.length}</div><div class="intel-label">Total</div></div>
    `;
  }
}

async function renderTopTrafficIps() {
  const body = document.getElementById('topTrafficBody');
  if (!body) return;
  body.innerHTML = skeletonRows(8);
  const data = await req('/traffic/top');
  const ips = data?.ips || [];
  if (body) body.innerHTML = ips.length ? ips.slice(0, 50).map((ip, i) => {
    const score = ip.abuse_score || 0;
    const scoreColor = score > 50 ? 'var(--red)' : score > 10 ? 'var(--gold)' : 'var(--green)';
    return `<tr>
      <td style="color:var(--text-muted);font-size:11px">${i + 1}</td>
      <td>${mono(ip.ip_address)}</td>
      <td style="font-weight:700;font-variant-numeric:tabular-nums">${fmt(ip.hit_count)}</td>
      <td>${esc(ip.country || '??')}</td>
      <td><span style="font-weight:600;color:${scoreColor}">${score}%</span></td>
      <td>${ip.is_blocked ? pill('Blocked','red') : pill('Allowed','green')}</td>
    </tr>`;
  }).join('') : emptyRow(6, 'No traffic data available');
}

async function searchIntel() {
  const q = document.getElementById('intelSearch').value.trim();
  if (!q) return renderIntel();
  const data = await req('/traffic/search?q=' + encodeURIComponent(q));
  const ips = data?.ips || [];
  const out = document.getElementById('intelResult');
  if (!ips.length) {
    out.style.display = 'block';
    out.innerHTML = `<div class="empty-state"><i class="ti ti-world-off"></i><p>No data for "${esc(q)}"</p></div>`;
    return;
  }
  out.style.display = 'block';
  out.innerHTML = ips.map(ip => {
    const score = ip.abuse_score || 0;
    const scoreColor = score > 50 ? 'var(--red)' : score > 10 ? 'var(--gold)' : 'var(--green)';
    const rows = [
      ['IP Address', mono(ip.ip_address)],
      ['Country', ip.country || '-'],
      ['City', ip.city || '-'],
      ['Region', ip.region || '-'],
      ['Coordinates', ip.loc || '-'],
      ['ISP', ip.isp || '-'],
      ['Organization', ip.org || '-'],
      ['ASN', ip.asn || '-'],
      ['Timezone', ip.timezone || '-'],
      ['Hostname', ip.hostname || '-'],
      ['Abuse Score', `<span style="font-weight:700;color:${scoreColor}">${score}%</span>`],
      ['Hit Count', fmt(ip.hit_count)],
      ['First Seen', ip.first_seen ? new Date(ip.first_seen).toLocaleString() : '-'],
      ['Last Seen', ip.last_seen ? new Date(ip.last_seen).toLocaleString() : '-'],
      ['Status', ip.is_blocked ? pill('Blocked','red') : pill('Allowed','green')],
      ['Last Notes', ip.last_notes || '-'],
    ];
    return `<div class="ip-card">
      <div class="ip-card-hd">
        <span><i class="ti ti-world" style="color:var(--maroon-accent)"></i> ${mono(ip.ip_address)}</span>
        <span class="ip-card-score" style="background:${scoreColor};color:#fff">${score}%</span>
      </div>
      <div class="ip-card-body">${rows.map(([label, val]) => `
        <div class="ip-card-row">
          <span class="ip-card-label">${label}</span>
          <span class="ip-card-value">${val}</span>
        </div>
      `).join('')}</div>
    </div>`;
  }).join('');
}

async function toggleBlock(ip, isBlocked) {
  const action = isBlocked ? 'unblock' : 'block';
  const res = await req('/traffic/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip })
  });
  if (res?.success) { toast(`${ip} ${action}ed`, isBlocked ? 'success' : 'warn'); renderIntel(); }
  else toast('Action failed', 'error');
}

function trafficPageChange(delta) {
  trafficPage = Math.max(1, trafficPage + delta);
  renderIntel();
}

// ═══════════════════════════════════════════════════════════════════════════
//  HARDENING
// ═══════════════════════════════════════════════════════════════════════════

async function renderHardening() {
  const data = await req('/audit');
  if (!data) return;

  const score = data.score || 0;
  document.getElementById('hardScore').textContent = score || '--';
  document.getElementById('hardInfo').textContent =
    `${data.findings?.length || 0} findings · ${data.passed_checks || 0} checks passed`;

  const circle = document.querySelector('#tab-hardening circle[stroke="var(--green)"]');
  if (circle && score) {
    const circ = 2 * Math.PI * 35;
    circle.setAttribute('stroke-dasharray', `${(score / 100) * circ} ${circ}`);
    circle.setAttribute('stroke', score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--gold)' : 'var(--red)');
  }

  const body = document.getElementById('hardBody');
  if (body) body.innerHTML = (data.findings || []).length ? (data.findings || []).map(f =>
    `<tr>
      <td>${sevBadge(f.severity || 'low')}</td>
      <td>
        <div style="font-weight:600;font-size:13px;color:var(--text-pr)">${esc(f.msg || f.title || '-')}</div>
        ${f.description ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px">${esc(f.description)}</div>` : ''}
      </td>
      <td>${mono(f.id || '-')}</td>
    </tr>`
  ).join('') : emptyRow(3, '<i class="ti ti-shield-check" style="color:var(--green);display:block;margin-bottom:6px;font-size:18px"></i>No findings - system is hardened');
}

// ═══════════════════════════════════════════════════════════════════════════
//  AUDIT
// ═══════════════════════════════════════════════════════════════════════════

async function renderAudit() {
  const body = document.getElementById('auditBody');
  if (body) body.innerHTML = skeletonRows(4);
  const data = await req('/audit/log');

  if (body) body.innerHTML = (data?.entries || []).slice(0, 50).map(e => {
    const summary = e.data?.type || e.data?.module || e.data?.attack_type || e.data?.title || e.data?.ip || '-';
    return `<tr>
      <td style="font-weight:600;color:var(--text-pr)">${esc(e.event_type)}</td>
      <td>${mono(e.actor)}</td>
      <td>${pill(esc(summary),'muted')}</td>
      <td style="color:var(--text-muted);font-size:12px;white-space:nowrap" title="${new Date(e.timestamp).toLocaleString('en-US', { hour12: true, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}">${rel(e.timestamp)}</td>
    </tr>`;
  }).join('') || emptyRow(4, 'No audit entries');

  const ok = data?.tamper_verified;
  const tamperEl = document.getElementById('tamperStatus');
  const countEl  = document.getElementById('auditEntryCount');
  if (tamperEl) {
    tamperEl.textContent = ok ? 'Verified' : 'Failed';
    tamperEl.style.color = ok ? 'var(--green)' : 'var(--red)';
  }
  if (countEl) countEl.textContent = (data?.entries?.length || 0) + ' entries';

  const chainEl = document.querySelector('#tab-audit .pill-green');
  if (chainEl) { chainEl.textContent = ok ? 'Chain intact' : 'Tampered'; chainEl.className = 'pill pill-' + (ok ? 'green' : 'red'); }
}

// ═══════════════════════════════════════════════════════════════════════════
//  REPORTS
// ═══════════════════════════════════════════════════════════════════════════

async function renderReports() {
  const el = document.getElementById('reportsContent');
  if (!el) return;
  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:24px;color:var(--text-muted);font-size:13px"><i class="ti ti-loader" style="animation:spin 1s linear infinite"></i> Loading report data…</div>`;

  const ts = await req('/report/threat-summary');

  el.innerHTML = `
    <div class="row3 fade-in">

      <div class="panel" style="cursor:pointer" onclick="loadComplianceReport()">
        <div class="panel-hd">
          <span class="panel-title"><i class="ti ti-file-certificate" style="color:var(--maroon-accent)"></i> Compliance Report</span>
        </div>
        <div style="padding:24px;text-align:center">
          <i class="ti ti-file-text" style="font-size:44px;color:var(--maroon-accent);opacity:0.7"></i>
          <div style="font-size:15px;font-weight:700;margin:14px 0 6px;color:var(--text-pr)">SOC 2 / ISO 27001</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:18px">Executive summary report</div>
          <span class="btn btn-mar btn-sm"><i class="ti ti-eye"></i> View Report</span>
        </div>
      </div>

      <div class="panel">
        <div class="panel-hd">
          <span class="panel-title"><i class="ti ti-chart-bar" style="color:var(--gold)"></i> Threat Summary</span>
          <span class="panel-action" onclick="loadThreatSummary()"><i class="ti ti-refresh"></i> Refresh</span>
        </div>
        <div style="padding:16px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
            <div class="intel-item"><div class="intel-num known">${ts?.by_severity?.critical || 0}</div><div class="intel-label">Critical</div></div>
            <div class="intel-item"><div class="intel-num susp">${ts?.by_severity?.high || 0}</div><div class="intel-label">High</div></div>
            <div class="intel-item" style="grid-column:1/3"><div class="intel-num total">${ts?.total || 0}</div><div class="intel-label">Total alerts (7 days)</div></div>
          </div>
          ${ts?.critical_ips?.length
            ? `<div style="font-size:11px;color:var(--text-muted);padding:10px;background:var(--blk);border-radius:7px;border:1px solid var(--blk-brd)">
                 <div style="font-weight:700;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Top Critical IPs</div>
                 ${ts.critical_ips.slice(0,5).map(ip =>
                   `<div style="font-family:var(--font-mono);color:var(--red);margin-bottom:3px">${esc(ip)}</div>`
                 ).join('')}
               </div>`
            : ''
          }
        </div>
      </div>

      <div class="panel">
        <div class="panel-hd">
          <span class="panel-title"><i class="ti ti-download" style="color:var(--blue)"></i> Export Logs</span>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:8px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:4px">CSV Format</div>
          <a href="/report/export/alerts?fmt=csv" class="btn btn-outline btn-sm" style="text-decoration:none;justify-content:center"><i class="ti ti-file-spreadsheet"></i> Alerts CSV</a>
          <a href="/report/export/waf?fmt=csv"    class="btn btn-outline btn-sm" style="text-decoration:none;justify-content:center"><i class="ti ti-file-spreadsheet"></i> WAF Events CSV</a>
          <a href="/report/export/files?fmt=csv"  class="btn btn-outline btn-sm" style="text-decoration:none;justify-content:center"><i class="ti ti-file-spreadsheet"></i> File Monitor CSV</a>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-top:8px;margin-bottom:4px">JSON Format</div>
          <a href="/report/export/alerts?fmt=json" class="btn btn-outline btn-sm" style="text-decoration:none;justify-content:center"><i class="ti ti-file-code"></i> Alerts JSON</a>
        </div>
      </div>

    </div>
  `;
}

function loadThreatSummary() { renderReports(); }

async function loadComplianceReport() {
  const el = document.getElementById('reportsContent');
  if (!el) return;
  el.innerHTML = '<div style="margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
    '<button class="btn btn-outline btn-sm" onclick="renderReports()"><i class="ti ti-arrow-left"></i> Back</button>' +
    '<span style="flex:1"></span>' +
    '<button class="btn btn-outline btn-sm" onclick="downloadPDF()"><i class="ti ti-file-text"></i> PDF</button>' +
    '<a href="/report/compliance/docx" class="btn btn-outline btn-sm" style="text-decoration:none" target="_blank"><i class="ti ti-file-text"></i> DOCX</a>' +
    '</div>' +
    '<iframe src="/report/compliance" style="width:100%;height:calc(100vh - 200px);border:none;border-radius:8px;background:#fff"></iframe>';
}

function downloadPDF() {
  toast('Generating PDF report...', 'info');
  const element = document.getElementById('mainContent') || document.body;
  html2pdf().set({
    margin: 10,
    filename: 'BinaryWebEngine_Report.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#0d0d0d' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  }).from(element).save().then(() => toast('Report downloaded successfully!', 'success'));
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROCESSES
// ═══════════════════════════════════════════════════════════════════════════

async function renderProcesses() {
  const body = document.getElementById('procBody');
  if (body && !body.querySelector('tr[data-real]')) body.innerHTML = skeletonRows(6);
  const data = await req('/processes/live');
  _renderProcessesData((data?.processes || []));
}

function _renderProcessesData(procs) {
  const body = document.getElementById('procBody');

  // Update summary
  const summaryEl = document.querySelector('#tab-processes .panel-actions');
  if (summaryEl) {
    const running = procs.filter(p => p.status === 'running').length;
    summaryEl.innerHTML = `<span style="font-size:11px;color:var(--text-muted);margin-right:8px">${procs.length} processes · ${running} running</span>
      <button class="btn btn-outline btn-sm" onclick="renderProcesses()"><i class="ti ti-refresh"></i> Refresh</button>`;
  }

  if (body) body.innerHTML = procs.slice(0, 80).map(p => {
    const cpu = p.cpu_percent != null ? Number(p.cpu_percent).toFixed(1) : '-';
    const rss = p.memory_mb != null ? Number(p.memory_mb).toFixed(1) + ' MB' : '-';
    const isRunning = p.status === 'running';
    const cpuVal = p.cpu_percent || 0;
    const cpuColor = cpuVal > 50 ? 'var(--red)' : cpuVal > 20 ? 'var(--gold)' : 'var(--green)';
    const barW = Math.min(cpuVal, 100);
    return `<tr data-real="1">
      <td>${mono(p.pid)}</td>
      <td style="font-weight:600;color:var(--text-pr)">${esc(p.name)}</td>
      <td style="color:var(--text-muted)">${esc(p.username)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="kc-bar-track" style="width:60px;height:12px;display:inline-block"><span class="kc-bar-fill" style="width:${barW}%;height:12px;background:${cpuColor};display:block;border-radius:3px"></span></span>
          <span style="color:var(--text-muted);font-size:11px">|</span>
          <span style="font-weight:700;color:${cpuColor};font-variant-numeric:tabular-nums;font-size:12px">${cpu}%</span>
        </div>
      </td>
      <td style="font-variant-numeric:tabular-nums">${rss}</td>
      <td>${pill(
        `<i class="ti ${isRunning ? 'ti-player-play' : 'ti-player-pause'}"></i> ${p.status || 'running'}`,
        isRunning ? 'green' : 'muted'
      )}</td>
    </tr>`;
  }).join('') || emptyRow(6, 'No process data - psutil may not be installed');
}

registerTopic('processes', data => {
  if (currentTab === 'processes') _renderProcessesData(data);
});

// ═══════════════════════════════════════════════════════════════════════════
//  NETWORK
// ═══════════════════════════════════════════════════════════════════════════

async function renderNetwork() {
  const body = document.getElementById('netBody');
  if (body && !body.querySelector('tr[data-real]')) body.innerHTML = skeletonRows(5);
  const data = await req('/network/live');
  _renderNetworkData((data?.connections || []));
}

function _renderNetworkData(conns) {
  const body = document.getElementById('netBody');

  // Update summary
  const estab = conns.filter(c => c.status === 'ESTABLISHED').length;
  const total = conns.length;
  const summaryEl = document.querySelector('#tab-network .panel-actions');
  if (summaryEl) {
    summaryEl.innerHTML = `<span style="font-size:11px;color:var(--text-muted);margin-right:8px">${total} connections · ${estab} established</span>
      <button class="btn btn-outline btn-sm" onclick="renderNetwork()"><i class="ti ti-refresh"></i> Refresh</button>`;
  }

  if (body) body.innerHTML = conns.slice(0, 80).map(c => {
    const isEstab = c.status === 'ESTABLISHED';
    const localAddr  = `${c.local_addr || '*'}:${c.local_port || '*'}`;
    const remoteAddr = `${c.remote_addr || '*'}:${c.remote_port || '*'}`;
    return `<tr data-real="1">
      <td style="font-weight:600;color:var(--text-pr)">${esc(c.process_name || c.pid || '-')}</td>
      <td>${mono(localAddr)}</td>
      <td>${mono(remoteAddr)}</td>
      <td>${mono(c.remote_port || '*')}</td>
      <td>${pill(c.status || 'unknown', isEstab ? 'green' : 'muted')}</td>
    </tr>`;
  }).join('') || emptyRow(5, 'No network connections - psutil may not be installed');
}

registerTopic('network', data => {
  if (currentTab === 'network') _renderNetworkData(data);
});

registerTopic('alerts', data => {
  if (currentTab === 'alerts') renderAlerts();
});

// Updates KPI cards in-place from poll data instead of full re-render
registerTopic('stats', data => {
  if (currentTab !== 'overview' || !data) return;
  cachedStats = data;
  const kpiRow = document.getElementById('kpiRow');
  if (!kpiRow) return;
  const cards = kpiRow.querySelectorAll('.stat');
  if (cards.length < 5) return;

  // Alert card (index 0) - total, critical, unresolved
  const val0 = cards[0].querySelector('.stat-val');
  const sub0 = cards[0].querySelector('.stat-sub');
  if (val0) val0.textContent = fmt(data.total_alerts || 0);
  if (sub0) {
    const crit = data.critical_alerts || 0;
    const unresolved = data.unresolved_alerts || 0;
    sub0.innerHTML = (crit > 0
      ? `<span class="up">↑ ${crit} critical</span>`
      : `<span class="down">0 critical</span>`)
      + ` · ${unresolved} open`;
  }

  // WAF hits card (index 2)
  const val2 = cards[2].querySelector('.stat-val');
  if (val2) val2.textContent = fmt(data.waf_blocks || 0);

  // Files monitored card (index 3)
  const val3 = cards[3].querySelector('.stat-val');
  const sub3 = cards[3].querySelector('.stat-sub');
  if (val3) val3.textContent = fmt(data.monitored_files || 0);
  if (sub3) {
    const sp = data.suspicious_processes || 0;
    sub3.innerHTML = sp > 0
      ? `<span class="up">${sp} susp. processes</span>`
      : `<span class="down">0 suspicious</span>`;
  }

  // Refresh process list alongside KPI gauges
  renderCPUBars();
});

// ═══════════════════════════════════════════════════════════════════════════
//  FILES + DIRECTORY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function renderFiles() {
  await Promise.all([renderMonitoredDirs(), renderSpecificFiles(), renderFileHashes()]);
}

async function renderMonitoredDirs() {
  const body = document.getElementById('dirBody');
  if (!body) return;
  body.innerHTML = skeletonRows(2);

  const data = await req('/monitor/directories');
  const dirs = data?.directories || [];

  if (body) body.innerHTML = dirs.length ? dirs.map(d =>
    `<tr>
      <td style="font-family:var(--font-mono);font-size:13px;color:var(--text-pr)">${esc(d)}</td>
      <td>
        <button class="btn btn-danger btn-xs" onclick="removeMonitoredDir('${esc(d)}')">
          <i class="ti ti-trash"></i> Remove
        </button>
      </td>
    </tr>`
  ).join('') : emptyRow(2, 'No directories monitored - add one above');
}

async function renderSpecificFiles() {
  const body = document.getElementById('fileSpecBody');
  if (!body) return;
  body.innerHTML = skeletonRows(2);

  const data = await req('/monitor/files');
  const files = data?.files || [];

  if (body) body.innerHTML = files.length ? files.map(f =>
    `<tr>
      <td style="font-family:var(--font-mono);font-size:13px;color:var(--text-pr);max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f)}</td>
      <td>
        <button class="btn btn-danger btn-xs" onclick="removeSpecificFile('${esc(f)}')">
          <i class="ti ti-trash"></i>
        </button>
      </td>
    </tr>`
  ).join('') : emptyRow(2, 'No specific files monitored - add one above');
}

async function renderFileHashes() {
  const body = document.getElementById('fileBody');
  if (body) body.innerHTML = skeletonRows(5);
  const data = await req('/events/files');

  if (body) body.innerHTML = (data?.files || []).slice(0, 50).map(f => {
    const hash = f.hash_value ? f.hash_value.slice(0, 12) + '…' : '-';
    const size = f.file_size != null ? (f.file_size / 1024).toFixed(1) + ' KB' : '-';
    return `<tr>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-pr)">${esc(f.file_path)}</td>
      <td>${mono(hash)}</td>
      <td style="font-variant-numeric:tabular-nums">${size}</td>
      <td style="color:var(--text-muted);font-size:12px;white-space:nowrap" title="${new Date(f.last_seen).toLocaleString('en-US', { hour12: true, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}">${rel(f.last_seen)}</td>
      <td>
        <button class="btn btn-danger btn-xs" onclick="removeMonitoredFile('${esc(f.file_path)}')">
          <i class="ti ti-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join('') || emptyRow(5, 'No monitored files yet');
}

function showAddDirModal() {
  document.getElementById('addDirPanel').classList.add('open');
  document.getElementById('newDirPath').value = '';
  document.getElementById('newDirPath').focus();
}

function closeAddDirModal() {
  document.getElementById('addDirPanel').classList.remove('open');
}

async function addMonitoredDir() {
  const path = document.getElementById('newDirPath').value.trim();
  if (!path) { toast('Enter a directory path', 'warn'); return; }

  const res = await req('/monitor/directories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });

  if (res?.success) {
    toast(`Now monitoring: ${path}`, 'success');
    closeAddDirModal();
    renderMonitoredDirs();
  } else {
    toast('Failed to add directory', 'error');
  }
}

async function removeMonitoredDir(path) {
  if (!confirm(`Remove ${path} from monitoring?`)) return;

  const res = await req('/monitor/directories', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });

  if (res?.success) {
    toast(`Stopped monitoring: ${path}`, 'warn');
    renderMonitoredDirs();
  } else {
    toast('Failed to remove directory', 'error');
  }
}

// ─── Specific File Modals ─────────────────────────────────────────────────

function showAddFileModal() {
  document.getElementById('addFilePanel').classList.add('open');
  document.getElementById('newFilePath').value = '';
  document.getElementById('newFilePath').focus();
}

function closeAddFileModal() {
  document.getElementById('addFilePanel').classList.remove('open');
}

async function addSpecificFile() {
  const filePath = document.getElementById('newFilePath').value.trim();
  if (!filePath) { toast('Enter a file path', 'warn'); return; }

  const res = await req('/monitor/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath })
  });

  if (res?.success) {
    toast(`Now monitoring file: ${filePath}`, 'success');
    closeAddFileModal();
    renderSpecificFiles();
    renderFileHashes();
  } else {
    toast('Failed to add file', 'error');
  }
}

async function removeSpecificFile(filePath) {
  if (!confirm(`Remove ${filePath} from monitoring?`)) return;

  const res = await req('/monitor/files', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath })
  });

  if (res?.success) {
    toast(`Stopped monitoring: ${filePath}`, 'warn');
    renderSpecificFiles();
    renderFileHashes();
  } else {
    toast('Failed to remove file', 'error');
  }
}

async function removeMonitoredFile(filePath) {
  if (!confirm(`Remove ${filePath} from monitoring?`)) return;

  const res = await req('/monitor/files', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath })
  });

  if (res?.success) {
    toast(`Removed: ${filePath}`, 'warn');
    renderFileHashes();
    renderSpecificFiles();
  } else {
    toast('Failed to remove file', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SYSTEM GAUGES
// ═══════════════════════════════════════════════════════════════════════════

function renderSystemGauges(data) {
  const el = document.getElementById('gaugeRow');
  if (!el) return;

  // If data not provided, fetch it (initial load only)
  if (!data) {
    req('/system/metrics').then(d => { if (d && !d.error) renderSystemGauges(d); });
    return;
  }

  const cpu = data.cpu?.percent || 0;
  const mem = data.memory?.percent || 0;
  const disk = data.disk_primary?.percent || 0;
  const netRecv = data.network?.mb_recv_per_sec || 0;
  const netSent = data.network?.mb_sent_per_sec || 0;
  const load = data.load?.load_1 || 0;
  const cores = data.cpu?.count_logical || 1;
  const loadNorm = Math.min(Math.round((load / cores) * 100), 100);

  const gaugeSvg = (pct, color) => {
    const r = 18, circ = 2 * Math.PI * r;
    const len = (Math.min(pct, 100) / 100) * circ;
    return `<svg width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--blk-md)" stroke-width="4"/>
      <circle cx="22" cy="22" r="${r}" fill="none" stroke="${color}" stroke-width="4"
        stroke-dasharray="${len} ${circ}" stroke-linecap="round" transform="rotate(-90 22 22)"/>
      <text x="22" y="27" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text-pr)">${Math.round(pct)}</text>
    </svg>`;
  };

  const cpuColor = cpu > 80 ? 'var(--red)' : cpu > 50 ? 'var(--gold)' : 'var(--green)';
  const memColor = mem > 80 ? 'var(--red)' : mem > 60 ? 'var(--gold)' : 'var(--blue)';
  const diskColor = disk > 85 ? 'var(--red)' : disk > 65 ? 'var(--gold)' : 'var(--maroon-accent)';
  const netColor = netRecv > 100 ? 'var(--gold)' : 'var(--blue)';
  const loadColor = loadNorm > 80 ? 'var(--red)' : loadNorm > 50 ? 'var(--gold)' : 'var(--green)';

  const usedMem = data.memory?.used_gb || 0;
  const totalMem = data.memory?.total_gb || 0;
  const usedDisk = data.disk_primary?.used_gb || 0;
  const totalDisk = data.disk_primary?.total_gb || 0;
  const procCount = data.processes?.total || '-';

  el.innerHTML = `
    <div class="sys-gauge">
      ${gaugeSvg(cpu, cpuColor)}
      <div class="sys-gauge-info">
        <div class="sys-gauge-label"><i class="ti ti-cpu"></i> CPU</div>
        <div class="sys-gauge-val">${cpu}%</div>
        <div class="sys-gauge-sub">${procCount} processes</div>
      </div>
    </div>
    <div class="sys-gauge">
      ${gaugeSvg(mem, memColor)}
      <div class="sys-gauge-info">
        <div class="sys-gauge-label"><i class="ti ti-terminal"></i> Memory</div>
        <div class="sys-gauge-val">${mem}%</div>
        <div class="sys-gauge-sub">${usedMem.toFixed(1)} / ${totalMem.toFixed(1)} GB</div>
      </div>
    </div>
    <div class="sys-gauge">
      ${gaugeSvg(disk, diskColor)}
      <div class="sys-gauge-info">
        <div class="sys-gauge-label"><i class="ti ti-database"></i> Disk</div>
        <div class="sys-gauge-val">${disk}%</div>
        <div class="sys-gauge-sub">${usedDisk.toFixed(1)} / ${totalDisk.toFixed(1)} GB</div>
      </div>
    </div>
    <div class="sys-gauge">
      ${gaugeSvg(Math.min(netRecv + netSent, 1000) / 10, netColor)}
      <div class="sys-gauge-info">
        <div class="sys-gauge-label"><i class="ti ti-network"></i> Network I/O</div>
        <div class="sys-gauge-val">${netRecv.toFixed(2)} MB/s</div>
        <div class="sys-gauge-sub">↑ ${netSent.toFixed(2)} MB/s sent</div>
      </div>
    </div>
    <div class="sys-gauge">
      ${gaugeSvg(loadNorm, loadColor)}
      <div class="sys-gauge-info">
        <div class="sys-gauge-label"><i class="ti ti-chart-line"></i> Load Avg</div>
        <div class="sys-gauge-val">${load.toFixed(1)}</div>
        <div class="sys-gauge-sub">${data.load ? data.load.load_1.toFixed(1) + ' / ' + data.load.load_5.toFixed(1) + ' / ' + data.load.load_15.toFixed(1) : '-'}</div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ALERT TIMELINE (Bar chart - alerts per hour, last 24h)
// ═══════════════════════════════════════════════════════════════════════════

async function renderAlertTimeline() {
  const el = document.getElementById('alertTimelineChart');
  if (!el) return;
  const data = await req('/alerts?limit=500&include_low=true&exclude_self_test=true');
  const alerts = data?.alerts || [];
  if (!alerts.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px;width:100%"><i class="ti ti-chart-bar-off"></i><p>No alert data</p></div>`;
    return;
  }
  // Bucket by hour over last 24h
  const now = Date.now();
  const buckets = {};
  for (let i = 23; i >= 0; i--) {
    const h = new Date(now - i * 3600000);
    const key = h.toISOString().slice(0, 13);
    buckets[key] = { count: 0, label: i === 0 ? 'now' : h.getHours().toString().padStart(2, '0') + ':00' };
  }
  alerts.forEach(a => {
    const ts = a.timestamp || a.created_at;
    if (!ts) return;
    const key = ts.slice(0, 13);
    if (buckets[key]) buckets[key].count++;
  });
  const vals = Object.values(buckets);
  const maxCount = Math.max(...vals.map(v => v.count), 1);
  const colors = ['var(--maroon-accent)', 'var(--blue)', 'var(--gold)', 'var(--green)'];
  el.innerHTML = vals.map((v, i) => {
    const h = Math.max(Math.round((v.count / maxCount) * 140), 2);
    const color = v.count > maxCount * 0.7 ? colors[0] : v.count > maxCount * 0.4 ? colors[1] : v.count > maxCount * 0.15 ? colors[2] : colors[3];
    return `<div class="col-bar" title="${v.count} alerts">
      <div class="col-bar-fill" style="height:${h}px;background:${color}"></div>
      <div class="col-bar-label">${v.label}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
//  ATTACK COLUMNS (WAF event attack types)
// ═══════════════════════════════════════════════════════════════════════════

async function renderAttackColumns() {
  const el = document.getElementById('attackColumnChart');
  if (!el) return;
  const data = await req('/events/waf?limit=500');
  const events = data?.events || [];
  if (!events.length) {
    el.innerHTML = `<div class="empty-state" style="padding:20px;width:100%"><i class="ti ti-shield-off"></i><p>No WAF events recorded</p></div>`;
    return;
  }
  const counts = {};
  events.forEach(e => {
    const t = e.attack_type || 'other';
    counts[t] = (counts[t] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxCount = Math.max(...entries.map(([, c]) => c), 1);
  el.innerHTML = entries.map(([type, count]) => {
    const h = Math.max(Math.round((count / maxCount) * 150), 4);
    const color = getAttackColor(type);
    const label = getAttackLabel(type);
    const pct = Math.round((count / entries.reduce((s, [, c]) => s + c, 0)) * 100);
    return `<div class="col-bar" style="position:relative" title="${label}: ${count} events (${pct}%)">
      <span style="font-size:9px;color:var(--text-muted);margin-bottom:2px;font-variant-numeric:tabular-nums;font-weight:600">${count}</span>
      <span style="font-size:9px;color:rgba(255,255,255,0.3);margin-bottom:2px">${pct}%</span>
      <div class="col-bar-fill" style="height:${h}px;background:${color};width:100%;border-radius:4px 4px 0 0;transition:height 0.6s cubic-bezier(0.22,1,0.36,1);box-shadow:0 0 0 1px rgba(255,255,255,0.06)"></div>
      <div class="col-bar-label" style="color:${contrastingColor(color)}">${esc(label.toUpperCase())}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOP PROCESSES BY MEMORY
async function renderCPUBars() {
  const el = document.getElementById('cpuBarChart');
  if (!el) return;
  const data = await req('/processes/live');
  const procs = data?.processes || [];
  if (!procs.length) {
    el.innerHTML = `<div class="empty-state" style="padding:10px;width:100%"><i class="ti ti-cpu-off"></i><p>No process data</p></div>`;
    return;
  }
  const sorted = [...procs].sort((a, b) => (b.memory_mb || 0) - (a.memory_mb || 0)).slice(0, 6);
  const maxMem = Math.max(...sorted.map(p => p.memory_mb || 0), 1);
  const colors = ['var(--red)', 'var(--gold)', 'var(--blue)', 'var(--green)', 'var(--maroon-accent)', '#D45080'];
  el.innerHTML = sorted.map((p, i) => {
    const mem = p.memory_mb || 0;
    const w = Math.max(Math.round((mem / maxMem) * 100), 2);
    const color = colors[i % colors.length];
    return `<div class="cpu-bar-row">
      <span class="cpu-bar-name">${esc(p.name || '?')}</span>
      <div class="cpu-bar-track"><div class="cpu-bar-fill" style="width:${w}%;background:${color}"></div></div>
      <span class="cpu-bar-pct">${mem.toFixed(1)} MB</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
//  ALERT RULES CRUD
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
//  FLEET
// ═══════════════════════════════════════════════════════════════════════════

async function renderFleet() {
  const body = document.getElementById('fleetBody');
  if (body) body.innerHTML = skeletonRows(7);
  const data = await req('/fleet/agents');
  const agents = data?.agents || [];
  const summary = document.getElementById('fleetSummary');

  if (agents.length === 0) {
    if (summary) summary.textContent = 'No agents connected';
    if (body) body.innerHTML = emptyRow(7, '<i class="ti ti-server-off" style="color:var(--text-muted);display:block;margin-bottom:6px;font-size:18px"></i>No agents - set BWE_AGENT_MODE=agent on remote servers');
    return;
  }

  if (summary) {
    const online = agents.filter(a => a.status === 'online').length;
    const degraded = agents.filter(a => a.status === 'degraded').length;
    const offline = agents.filter(a => a.status === 'offline').length;
    summary.textContent = `${agents.length} agents · ${online} online · ${degraded} degraded · ${offline} offline`;
  }

  if (body) body.innerHTML = agents.map(a => {
    const statusColors = { online: 'var(--green)', degraded: 'var(--gold)', offline: 'var(--red)' };
    const color = statusColors[a.status] || 'var(--text-muted)';
    const uptime = a.connected_since ? rel(a.connected_since * 1000) : '-';
    const lastHb = a.last_heartbeat_delta != null
      ? `${a.last_heartbeat_delta}s ago`
      : '-';
    return `<tr>
      <td style="font-weight:600;color:var(--text-pr);font-family:var(--font-mono);font-size:12px">${esc(a.agent_id)}</td>
      <td><span class="pill" style="background:${color}20;color:${color};border:1px solid ${color}40">${esc(a.status)}</span></td>
      <td style="color:var(--text-muted);font-size:11px">${esc(a.version || '-')}</td>
      <td style="color:var(--text-muted);font-size:12px">${lastHb}</td>
      <td style="color:var(--text-muted);font-size:12px">${uptime}</td>
      <td style="color:var(--text-muted);font-size:12px;font-family:var(--font-mono)">${a.events_count || 0}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-xs" onclick="showAgentEvents('${esc(a.agent_id)}')" title="View events from this agent">
          <i class="ti ti-list"></i> Events
        </button>
        <button class="btn btn-outline btn-xs" onclick="showConfigPushModal('${esc(a.agent_id)}')">
          <i class="ti ti-settings"></i> Config
        </button>
      </td>
    </tr>`;
  }).join('');
}

async function showAgentEvents(agentId) {
  const panel = document.getElementById('agentEventsPanel');
  document.getElementById('agentEventsName').textContent = agentId;
  document.getElementById('agentEventsBody').innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:30px"><i class="ti ti-loader" style="animation:spin 1s linear infinite;font-size:18px;display:block;margin-bottom:6px"></i>Loading...</td></tr>';
  panel.classList.add('open');
  const res = await req('/fleet/agent/' + encodeURIComponent(agentId) + '/events?limit=50');
  const events = res?.events || [];
  const body = document.getElementById('agentEventsBody');
  if (events.length === 0) {
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:30px"><i class="ti ti-inbox-off" style="font-size:18px;display:block;margin-bottom:6px"></i>No events yet</td></tr>';
    return;
  }
  body.innerHTML = events.map(e => {
    let dataPreview = '';
    try {
      const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      dataPreview = esc(JSON.stringify(d).substring(0, 200));
    } catch { dataPreview = esc(String(e.data || '')); }
    return `<tr>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${esc(e.event_type)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${esc(e.timestamp || '-')}</td>
      <td style="font-size:11px;color:var(--text-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${dataPreview}</td>
    </tr>`;
  }).join('');
}

function closeAgentEvents() {
  document.getElementById('agentEventsPanel').classList.remove('open');
}

let configPushTarget = '';

function showConfigPushModal(agentId) {
  configPushTarget = agentId;
  document.getElementById('configPushAgentName').textContent = agentId;
  document.getElementById('configPushPanel').classList.add('open');
}

function closeConfigPushModal() {
  document.getElementById('configPushPanel').classList.remove('open');
}

async function pushAgentConfig() {
  const data = document.getElementById('configPushData').value.trim();
  if (!data) { toast('Enter config JSON', 'warn'); return; }
  try { JSON.parse(data); } catch (e) { toast('Invalid JSON', 'error'); return; }
  const res = await req('/fleet/agent/' + encodeURIComponent(configPushTarget) + '/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: data,
  });
  if (res?.success) {
    toast(`Config pushed to ${configPushTarget}`, 'success');
    closeConfigPushModal();
  } else {
    toast('Config push failed', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOGIN MONITOR
// ═══════════════════════════════════════════════════════════════════════════

async function unblockLoginIP(ip, btn) {
  if (!confirm(`Unblock ${ip}?`)) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>';
  const res = await req('/login-monitor/unblock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'ip=' + encodeURIComponent(ip),
  });
  if (res?.success) {
    btn.innerHTML = '<i class="ti ti-check"></i> Unblocked';
    btn.style.cssText = 'color:var(--green);border-color:var(--green);font-size:10px;padding:2px 6px';
    setTimeout(() => renderLogin(), 2000);
  } else {
    btn.innerHTML = '<i class="ti ti-alert-triangle"></i> Failed';
    btn.style.color = 'var(--red)';
    setTimeout(() => renderLogin(), 2000);
  }
}

async function blockLoginIP(ip, btn) {
  if (!confirm(`Block ${ip}? This will block all traffic from this IP.`)) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader" style="animation:spin 1s linear infinite"></i>';
  const res = await req('/waf/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, duration: 3600 }),
  });
  if (res?.success) {
    btn.innerHTML = '<i class="ti ti-lock"></i> Blocked';
    btn.style.cssText = 'color:var(--gold);border-color:var(--gold);font-size:10px;padding:2px 6px';
    setTimeout(() => renderLogin(), 2000);
  } else {
    btn.innerHTML = '<i class="ti ti-alert-triangle"></i> Failed';
    btn.style.color = 'var(--red)';
    setTimeout(() => renderLogin(), 2000);
  }
}

function loginPageChange(delta) {
  loginPage = Math.max(1, loginPage + delta);
  renderLogin();
}

async function renderLogin() {
  const body = document.getElementById('loginBody');
  const summary = document.getElementById('loginSummary');
  const cards = document.getElementById('loginStatsCards');
  if (body) body.innerHTML = skeletonRows(8);
  if (cards) cards.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Loading stats…</span>';

  const service = document.getElementById('loginServiceFilter')?.value || '';
  const status = document.getElementById('loginStatusFilter')?.value || '';
  const params = new URLSearchParams({ limit: '200' });
  if (service) params.set('service', service);
  if (status) params.set('status', status);

  const filterSig = [service, status].join('|');
  if (filterSig !== _lastLoginFilters) {
    _lastLoginFilters = filterSig;
    loginPage = 1;
  }

  const [eventsRes, statsRes] = await Promise.all([
    req('/api/login-events?' + params.toString()),
    req('/api/login-stats'),
  ]);

  const events = eventsRes?.events || [];
  const stats = statsRes?.stats || [];

  // Summary
  if (summary) {
    const total = events.length;
    const failed = events.filter(e => e.status === 'failure').length;
    const blocked = events.filter(e => e.status === 'blocked').length;
    const uniqueIps = new Set(events.map(e => e.source_ip).filter(Boolean)).size;
    summary.textContent = `${total} events · ${failed} failures · ${blocked} blocked · ${uniqueIps} unique IPs`;
  }

  // Stats cards
  if (cards) {
    if (stats.length === 0) {
      cards.innerHTML = '<span style="color:var(--text-muted);font-size:12px">No login data yet</span>';
    } else {
      cards.innerHTML = stats.map(s => `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:140px;flex:1">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${esc(s.service)}</div>
          <div style="display:flex;gap:10px;font-size:12px">
            <span><span style="color:var(--green)">${s.success_count}</span> ok</span>
            <span><span style="color:var(--red)">${s.failure_count}</span> fail</span>
            <span><span style="color:var(--gold)">${s.blocked_count}</span> blk</span>
          </div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${s.unique_ips} IPs · ${s.success_rate}% success</div>
        </div>
      `).join('');
    }
  }

  // Events table
  if (body) {
    if (events.length === 0) {
      body.innerHTML = emptyRow(8, '<i class="ti ti-fingerprint-off" style="color:var(--text-muted);display:block;margin-bottom:6px;font-size:18px"></i>No login events');
      const pageInfo = document.getElementById('loginPageInfo');
      const prevBtn = document.getElementById('loginPrevBtn');
      const nextBtn = document.getElementById('loginNextBtn');
      if (pageInfo) pageInfo.textContent = '1 / 1';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const totalPages = Math.max(1, Math.ceil(events.length / LOGIN_PER_PAGE));
    if (loginPage > totalPages) loginPage = totalPages;
    const start = (loginPage - 1) * LOGIN_PER_PAGE;
    const pageEvents = events.slice(start, start + LOGIN_PER_PAGE);

    const pageInfo = document.getElementById('loginPageInfo');
    const prevBtn = document.getElementById('loginPrevBtn');
    const nextBtn = document.getElementById('loginNextBtn');
    if (pageInfo) pageInfo.textContent = loginPage + ' / ' + totalPages;
    if (prevBtn) prevBtn.disabled = loginPage <= 1;
    if (nextBtn) nextBtn.disabled = loginPage >= totalPages;

    body.innerHTML = pageEvents.map(e => {
      const time = e.timestamp ? rel(e.timestamp) : '-';
      const ip = esc(e.source_ip || '-');
      const user = esc(e.username || '-');
      const svc = esc(e.service || '-');
      const port = e.port != null ? e.port : '-';
      const src = esc(e.log_source || '-');
      let statusBadge, statusColor;
      if (e.status === 'success') { statusBadge = '●'; statusColor = 'var(--green)'; }
      else if (e.status === 'blocked') { statusBadge = '●'; statusColor = 'var(--gold)'; }
      else { statusBadge = '●'; statusColor = 'var(--red)'; }
      const ipVal = e.source_ip || '';
      const actions = [];
      if (e.status === 'blocked' && ipVal) {
        actions.push(`<button class="btn btn-outline btn-xs" onclick="unblockLoginIP('${esc(ipVal)}', this)" style="color:var(--green);border-color:var(--green);font-size:10px;padding:2px 6px"><i class="ti ti-unlock"></i></button>`);
      }
      if (e.status !== 'blocked' && ipVal) {
        actions.push(`<button class="btn btn-outline btn-xs" onclick="blockLoginIP('${esc(ipVal)}', this)" style="color:var(--red);border-color:var(--red);font-size:10px;padding:2px 6px"><i class="ti ti-lock"></i></button>`);
      }
      return `<tr>
        <td style="font-size:11px;white-space:nowrap;color:var(--text-muted)">${time}</td>
        <td style="font-family:monospace;font-size:12px">${ip}</td>
        <td style="font-size:12px">${user}</td>
        <td style="font-size:12px">${svc}</td>
        <td><span style="color:${statusColor}">${statusBadge}</span> ${e.status}</td>
        <td style="font-size:12px;color:var(--text-muted)">${port}</td>
        <td style="font-size:11px;color:var(--text-muted)">${src}</td>
        <td style="white-space:nowrap">${actions.join(' ')}</td>
      </tr>`;
    }).join('');
  }
}

registerTopic('logins', data => {
  if (currentTab === 'logins') renderLogin();
});

// ═══════════════════════════════════════════════════════════════════════════
//  CLOCK · UPTIME · SETTINGS · INIT
// ═══════════════════════════════════════════════════════════════════════════

setInterval(() => {
  const el = document.getElementById('liveClock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}, 1000);

setInterval(() => {
  const uptime = document.getElementById('uptimeLabel');
  if (uptime && currentTab === 'overview') {
    const secs = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    uptime.textContent = `${h}h ${m}m ${s}s`;
  }
}, 5000);

const spinStyle = document.createElement('style');
spinStyle.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
document.head.appendChild(spinStyle);

function setRefreshInterval(sec) {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    renderPage();
  }, Number(sec) * 1000);
}

function setTheme(t) {
  localStorage.setItem('bwe-theme', t);
}

// ═══════════════════════════════════════════════════════════════════════════
//  TAB-SPECIFIC AI BUTTON
// ═══════════════════════════════════════════════════════════════════════════

function injectAskAiButtons() {
  document.querySelectorAll('.panel-hd:not(.ai-injected)').forEach(hd => {
    hd.classList.add('ai-injected');
    const actions = hd.querySelector('.panel-actions');
    const target = actions || hd;
    const btn = document.createElement('button');
    btn.className = 'btn-ghost-ai';
    btn.title = 'Ask AI about this panel';
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4c0 2-2 3-2 5h-4c0-2-2-3-2-5a4 4 0 0 1 4-4Z"/><path d="M12 17v2"/><path d="M8 21h8"/></svg> AI';
    btn.style.cssText = 'background:rgba(128,0,32,0.1);border:1px solid rgba(128,0,32,0.3);border-radius:5px;padding:2px 7px;cursor:pointer;color:var(--maroon-accent);display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;transition:.15s;white-space:nowrap';
    btn.onmouseover = () => btn.style.cssText = 'background:var(--maroon);border:1px solid var(--maroon);border-radius:5px;padding:2px 7px;cursor:pointer;color:#fff;display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;transition:.15s;white-space:nowrap';
    btn.onmouseout = () => btn.style.cssText = 'background:rgba(128,0,32,0.1);border:1px solid rgba(128,0,32,0.3);border-radius:5px;padding:2px 7px;cursor:pointer;color:var(--maroon-accent);display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:600;transition:.15s;white-space:nowrap';
    const title = hd.querySelector('.panel-title')?.textContent?.trim() || 'this data';
    btn.onclick = () => quickChat(`Explain "${title}" in detail - what should I look for?`);
    target.appendChild(btn);
    const spacer = document.createElement('span');
    spacer.style.cssText = 'width:6px;display:inline-block';
    target.insertBefore(spacer, btn);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SETTINGS MODAL (dynamic creation for multi-page support)
// ═══════════════════════════════════════════════════════════════════════════

function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.settings-pane').forEach(p => p.style.display = 'none');
  const btn = document.querySelector(`[data-settings-tab="${tab}"]`);
  if (btn) btn.classList.add('active');
  const pane = document.getElementById('settings-' + tab);
  if (pane) pane.style.display = 'block';
  if (tab === 'ai') loadAiProviders();
}

function closeSettings() {
  const panel = document.getElementById('settingsPanel');
  if (panel) panel.style.display = 'none';
}

function openSettings() {
  let panel = document.getElementById('settingsPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'settingsPanel';
    panel.className = 'modal-overlay';
    panel.onclick = function(e) { if (e.target === this) closeSettings(); };
    panel.innerHTML = `<div class="modal" style="max-width:780px">
      <div class="modal-header">
        <span class="modal-title"><i class="ti ti-settings"></i> Settings</span>
        <button class="modal-close" onclick="closeSettings()"><i class="ti ti-x"></i></button>
      </div>
      <div style="padding:4px 0;display:flex;gap:0;border-bottom:1px solid var(--blk-brd)">
        <button class="settings-tab active" data-settings-tab="general" onclick="switchSettingsTab('general')">General</button>
        <button class="settings-tab" data-settings-tab="keys" onclick="switchSettingsTab('keys')">API Keys</button>
        <button class="settings-tab" data-settings-tab="engine" onclick="switchSettingsTab('engine')">Engine</button>
        <button class="settings-tab" data-settings-tab="ai" onclick="switchSettingsTab('ai')">AI Providers</button>
        <button class="settings-tab" data-settings-tab="intel" onclick="switchSettingsTab('intel')">Intel</button>
        <button class="settings-tab" data-settings-tab="license" onclick="switchSettingsTab('license')">License</button>
      </div>
      <div class="settings-pane" id="settings-general">
        <div style="padding:20px 24px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
            <div class="form-group" style="padding:0;margin:0">
              <span class="form-label">Refresh Interval</span>
              <div style="display:flex;align-items:center;gap:8px">
                <input id="refreshInterval" type="number" value="15" min="5" max="120" onchange="setRefreshInterval(this.value)">
                <span style="font-size:12px;color:var(--text-muted);white-space:nowrap">seconds</span>
              </div>
            </div>
            <div class="form-group" style="padding:0;margin:0">
              <span class="form-label">Theme</span>
              <select id="themeSelect" onchange="setTheme(this.value)"><option value="maroon">Maroon Dark</option><option value="classic">Classic Dark</option></select>
            </div>
          </div>
        </div>
      </div>
      <div class="settings-pane" id="settings-keys" style="display:none">
        <div style="padding:20px 24px">
          <div style="display:flex;flex-direction:column;gap:14px">
            <div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><span class="form-label" style="margin:0;padding:0">AbuseIPDB</span><span class="pill-svc" data-service="abuseipdb" style="font-size:10px">unset</span></div><input id="apiKeyAbuseIPDB" type="password" placeholder="AbuseIPDB API key..." spellcheck="false"></div>
            <div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><span class="form-label" style="margin:0;padding:0">VirusTotal</span><span class="pill-svc" data-service="virustotal" style="font-size:10px">unset</span></div><input id="apiKeyVT" type="password" placeholder="VirusTotal API key..." spellcheck="false"></div>
            <button class="btn btn-mar btn-sm" onclick="saveApiKeys()" style="width:100%;margin-top:4px"><i class="ti ti-device-floppy"></i> Save API Keys</button>
            <div id="apiKeysResult" style="font-size:11px;min-height:0"></div>
          </div>
        </div>
      </div>
      <div class="settings-pane" id="settings-engine" style="display:none"><div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">Engine settings coming soon</div></div>
      <div class="settings-pane" id="settings-ai" style="display:none">
        <div style="padding:20px 24px">
          <div id="aiProviderList"></div>
          <button class="btn btn-mar btn-sm" onclick="showAddProviderForm()" style="width:100%;margin-top:8px"><i class="ti ti-plus"></i> Add Provider</button>
        </div>
      </div>
      <div class="settings-pane" id="settings-intel" style="display:none"><div style="padding:40px;text-align:center;color:var(--text-muted);font-size:13px">Intel settings coming soon</div></div>
      <div class="settings-pane" id="settings-license" style="display:none">
        <div style="padding:20px 24px">
          <div class="form-label" style="padding:0;margin-bottom:6px">License Key</div>
          <input id="licenseKeyInput" placeholder="Enter license key..." style="width:100%">
          <button class="btn btn-mar btn-sm" onclick="activateLicense()" style="width:100%;margin-top:12px"><i class="ti ti-key"></i> Activate License</button>
          <div id="licenseStatus" style="margin-top:8px;font-size:11px"></div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(panel);
  }
  panel.style.display = 'flex';
  switchSettingsTab('general');
  _cachedLicense = null;
  refreshPremiumUI();
}

async function saveApiKeys() {
  const keys = {};
  document.querySelectorAll('#settings-keys input[type="password"]').forEach(inp => {
    if (inp.value) keys[inp.id.replace('apiKey', '').toLowerCase()] = inp.value;
  });
  if (!Object.keys(keys).length) { toast('No keys to save', 'warn'); return; }
  const res = await req('/config/apikeys', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({keys}) });
  if (res?.status === 'ok') { toast('API keys saved', 'success'); document.querySelectorAll('#settings-keys input[type="password"]').forEach(i => i.value = ''); }
  else toast('Failed to save API keys', 'error');
}

async function activateLicense() {
  const input = document.getElementById('licenseKeyInput');
  if (!input || !input.value.trim()) { toast('Enter a license key', 'warn'); return; }
  const res = await req('/license/apply', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({key: input.value.trim()}) });
  if (res?.success) { toast('License activated!', 'success'); _cachedLicense = null; refreshPremiumUI(); closeSettings(); }
  else toast('License activation failed: ' + (res?.reason || 'Invalid key'), 'error');
}

// ─── AI Providers ──────────────────────────────────────────────────────────

let aiProviders = [];

async function loadAiProviders() {
  const data = await req('/config/ai/providers');
  aiProviders = data?.providers || [];
  renderAiProviders();
}

function renderAiProviders() {
  const container = document.getElementById('aiProviderList');
  if (!container) return;
  if (aiProviders.length === 0) {
    container.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:12px 0">No AI providers configured. Add one above.</div>';
    return;
  }
  container.innerHTML = aiProviders.map((p, i) => {
    const masked = p.api_key ? p.api_key.slice(0, 8) + '…' : '';
    const statusClass = p.enabled ? 'on' : 'off';
    return `<div class="provider-card">
      <span class="p-status ${statusClass}"></span>
      <div class="p-info">
        <div class="p-name">${esc(p.name || 'Unnamed')}</div>
        <div class="p-detail">${esc(p.model || '')} · ${esc(masked)} · priority ${p.priority ?? i}</div>
      </div>
      <span class="p-type">${esc(p.provider_type || '')}</span>
      <div class="p-actions">
        <button onclick="toggleAiProvider(${i})" title="Toggle">${p.enabled ? '<i class="ti ti-player-pause"></i>' : '<i class="ti ti-player-play"></i>'}</button>
        <button onclick="editAiProvider(${i})" title="Edit"><i class="ti ti-edit"></i></button>
        <button onclick="testAiProvider(${i})" title="Test"><i class="ti ti-player-play"></i></button>
        <button onclick="removeAiProvider(${i})" title="Delete"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function showAddProviderForm(idx) {
  const existing = idx !== undefined ? aiProviders[idx] : null;
  const pane = document.getElementById('settings-ai');
  const form = document.createElement('div');
  form.id = 'aiProviderForm';
  form.style.cssText = 'margin-top:12px;padding:16px;background:var(--blk);border-radius:8px;border:1px solid var(--blk-brd)';
  const ptype = existing ? existing.provider_type : 'openai';
  const presets = {
    openai: { name: 'OpenAI', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    gemini: { name: 'Google Gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
    ollama: { name: 'Ollama', base_url: 'http://localhost:11434', model: 'llama3' },
    anthropic: { name: 'Anthropic', base_url: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
    nvidia: { name: 'NVIDIA', base_url: 'https://integrate.api.nvidia.com/v1', model: 'meta/llama-3.1-70b-instruct' },
    openrouter: { name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' },
    custom: { name: 'Custom', base_url: '', model: '' },
  };
  form.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--text-pr);margin-bottom:12px">${existing ? 'Edit' : 'Add'} AI Provider</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="form-group" style="padding:0;margin:0">
        <span class="form-label">Type</span>
        <select id="f-provider_type" onchange="updateProviderPreset()">
          ${Object.keys(presets).map(k => `<option value="${k}" ${k === ptype ? 'selected' : ''}>${presets[k].name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="padding:0;margin:0">
        <span class="form-label">Name</span>
        <input id="f-name" value="${esc(existing ? existing.name : presets[ptype].name)}">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div class="form-group" style="padding:0;margin:0">
        <span class="form-label">Base URL</span>
        <input id="f-base_url" value="${esc(existing ? existing.base_url : presets[ptype].base_url)}">
      </div>
      <div class="form-group" style="padding:0;margin:0">
        <span class="form-label">Model</span>
        <input id="f-model" value="${esc(existing ? existing.model : presets[ptype].model)}">
      </div>
    </div>
    <div class="form-group" style="padding:0;margin:0;margin-bottom:12px">
      <span class="form-label">API Key</span>
      <input id="f-api_key" type="password" placeholder="${existing ? 'Leave blank to keep current' : 'Enter API key...'}" value="">
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-outline btn-sm" onclick="cancelProviderForm()">Cancel</button>
      <button class="btn btn-mar btn-sm" onclick="saveProviderForm(${idx !== undefined ? idx : -1})"><i class="ti ti-device-floppy"></i> ${existing ? 'Update' : 'Add'}</button>
    </div>
  `;
  const existingForm = document.getElementById('aiProviderForm');
  if (existingForm) existingForm.remove();
  pane.appendChild(form);
}

function updateProviderPreset() {
  const ptype = document.getElementById('f-provider_type').value;
  const presets = {
    openai: { name: 'OpenAI', base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    gemini: { name: 'Google Gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash' },
    ollama: { name: 'Ollama', base_url: 'http://localhost:11434', model: 'llama3' },
    anthropic: { name: 'Anthropic', base_url: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
    nvidia: { name: 'NVIDIA', base_url: 'https://integrate.api.nvidia.com/v1', model: 'meta/llama-3.1-70b-instruct' },
    openrouter: { name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' },
    custom: { name: 'Custom', base_url: '', model: '' },
  };
  const d = presets[ptype] || presets.custom;
  const nameEl = document.getElementById('f-name');
  const urlEl = document.getElementById('f-base_url');
  const modelEl = document.getElementById('f-model');
  if (nameEl && !nameEl.dataset.userEdited) nameEl.value = d.name;
  if (urlEl) urlEl.value = d.base_url;
  if (modelEl) modelEl.value = d.model;
}

function cancelProviderForm() {
  const form = document.getElementById('aiProviderForm');
  if (form) form.remove();
}

function saveProviderForm(idx) {
  const name = document.getElementById('f-name').value.trim();
  const ptype = document.getElementById('f-provider_type').value;
  const baseUrl = document.getElementById('f-base_url').value.trim();
  const model = document.getElementById('f-model').value.trim();
  const apiKey = document.getElementById('f-api_key').value.trim();
  if (!name) { toast('Provider name is required', 'warn'); return; }
  const provider = {
    name,
    provider_type: ptype,
    base_url: baseUrl,
    model: model,
    api_key: apiKey,
    enabled: true,
    priority: idx >= 0 ? aiProviders[idx].priority : aiProviders.length,
  };
  if (idx >= 0) {
    if (!apiKey) provider.api_key = aiProviders[idx].api_key;
    aiProviders[idx] = provider;
  } else {
    aiProviders.push(provider);
  }
  cancelProviderForm();
  saveAiProviders();
}

function removeAiProvider(idx) {
  if (!confirm('Remove this provider?')) return;
  aiProviders.splice(idx, 1);
  aiProviders.forEach((p, i) => p.priority = i);
  saveAiProviders();
}

function toggleAiProvider(idx) {
  aiProviders[idx].enabled = !aiProviders[idx].enabled;
  saveAiProviders();
}

function editAiProvider(idx) {
  showAddProviderForm(idx);
}

async function saveAiProviders() {
  const data = await req('/config/ai/providers', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({providers: aiProviders}),
  });
  if (data?.success) renderAiProviders();
}

async function testAiProvider(idx) {
  const p = aiProviders[idx];
  toast('Testing provider ' + p.name + '...', 'info');
  const data = await req('/config/ai/providers/test', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({provider: p}),
  });
  toast(data?.success ? 'Response: ' + (data.response || 'OK') : 'Error: ' + (data?.error || 'request failed'), data?.success ? 'success' : 'error');
}

// Subscribe to live topics based on current page
  const liveTopics = [];
  if (currentTab === 'processes') liveTopics.push('processes');
  else if (currentTab === 'network') liveTopics.push('network');
  else if (currentTab === 'logins') liveTopics.push('logins');
  else if (currentTab === 'overview') liveTopics.push('stats');
  else if (currentTab === 'alerts') liveTopics.push('alerts');
  subscribe(liveTopics);

  if (currentTab === 'overview') connectMetricsWS();

setRefreshInterval(30);

// Patch render to also inject AI buttons
const _origRender = renderPage;
renderPage = async function() {
  await _origRender.call(this);
  injectAskAiButtons();
};

renderPage();
refreshPremiumUI();


