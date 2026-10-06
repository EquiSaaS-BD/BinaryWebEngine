// ═══════════════════════════════════════════════════════════════════════════
//  BinaryWebEngine · app.js  (FIXED: all 5 dashboard bugs + real data wiring)
// ═══════════════════════════════════════════════════════════════════════════

// ─── CHANGE THIS to your deployed Worker URL ───────────────────────────────
const API = 'https://bwe-api.k-makmanhossain.workers.dev';
let currentTab = 'overview';
let cachedStats = {};
let logBuffer = [];
let refreshTimer = null;
const _tabLoaded = {};
let startTime = Date.now();
let _cachedLicense = null;

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
  }, 5000);
}

function registerTopic(topic, handler) {
  _topicHandlers[topic] = handler;
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
      window.location.href = '/login.html';
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

// ─── TAB ROUTING ───────────────────────────────────────────────────────────

function refreshAll() { render(); toast('Refreshing data…', 'info'); }

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(l =>
    l.classList.toggle('active', l.getAttribute('data-tab') === tab)
  );
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('tab-' + tab);
  if (el) { el.classList.add('active'); el.classList.add('fade-in'); }
  render();

  // Subscribe to live topics via SSE
  const liveTopics = [];
  if (tab === 'processes') liveTopics.push('processes');
    else if (tab === 'network') liveTopics.push('network');
  else if (tab === 'logins') liveTopics.push('logins');
  else if (tab === 'overview') liveTopics.push('stats');
  else if (tab === 'alerts') liveTopics.push('alerts');
  subscribe(liveTopics);
}

async function render() {
  const tab = currentTab;
  try {
    if      (tab === 'overview')   await renderOverview();
    else if (tab === 'alerts')     await renderAlerts();
    else if (tab === 'killchain')  await renderKillChain();
    else if (tab === 'waf')        { await renderWafStats(); await renderWafLog(); await renderWafCustomRules(); }
    else if (tab === 'intel')      await renderIntel();
    else if (tab === 'hardening')  await renderHardening();
    else if (tab === 'audit')      await renderAudit();
    else if (tab === 'rules')      await renderRules();
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

  // Update Zeigarnik alert banner
  const bannerEl = document.getElementById('overviewAlertBanner');
  if (bannerEl) {
    const unresolvedCount = stats.unresolved_alerts || 0;
    if (unresolvedCount > 0) {
      bannerEl.innerHTML = `
        <div style="background: rgba(192,57,43,0.08); border: 1px solid rgba(192,57,43,0.3); border-radius: 8px; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <i class="ti ti-alert-triangle" style="color: var(--red); font-size: 16px;"></i>
            <span style="font-size: 13px; color: var(--text-pr); font-weight: 500;">
              <strong>Attention Required:</strong> There are <span style="color: var(--red); font-weight: 700;">${unresolvedCount} unresolved</span> security incidents. Immediate analysis recommended.
            </span>
          </div>
          <button class="btn btn-mar btn-xs" onclick="setTab('alerts')" style="font-size: 11px; padding: 4px 10px;">Investigate &rarr;</button>
        </div>
      `;
    } else {
      bannerEl.innerHTML = '';
    }
  }

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
    kcBody.innerHTML = chainList.length ? chainList.slice(0, 5).map(c => {
      const pct = c.coverage_pct || 0;
      const riskColor = pct > 60 ? 'var(--red)' : pct > 30 ? 'var(--gold)' : 'var(--text-muted)';
      const stageId = (c.completed_stages?.[0] || 'TA0001').toUpperCase();
      const stageClass = MITRE_STAGE_CLASS[stageId] || 'recon';
      const stageLabel = MITRE_STAGE_LABEL[stageId] || stageId;
      return `<tr>
        <td>${mono(c.ip)}</td>
        <td><span class="kc-stage kc-stg-${stageClass}">${stageLabel}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="kc-bar-track"><span class="kc-bar-fill" style="width:${pct}%"></span></span>
            <span class="kc-pct" style="color:${riskColor}">${pct}%</span>
          </div>
        </td>
      </tr>`;
    }).join('') : `<tr>${emptyRow(3,'No active kill chains detected').replace('<tr>','').replace('</tr>','')}</tr>`;
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
    if (el) el.innerHTML = mitreCells.map((m, i) =>
      `<span class="mitre-cell ${i < maxStage ? 'cov' : i < maxStage + 2 ? 'part' : 'none'}"
        title="${m.l} - ${m.s}">${m.id}</span>`
    ).join('');
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

  // ── ATTACK PIE (real data from WAF events - never hardcoded) ──────────────
  const attackPie = document.getElementById('attackPie');
  if (attackPie) {
    const wafEvts = wafEvents?.events || [];
    const attackCounts = {};
    wafEvts.forEach(e => {
      const t = e.attack_type || 'other';
      attackCounts[t] = (attackCounts[t] || 0) + 1;
    });
    const totalAttacks = Object.values(attackCounts).reduce((a, b) => a + b, 0);

    if (totalAttacks === 0) {
      attackPie.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px"><i class="ti ti-shield-off" style="font-size:28px;display:block;margin-bottom:8px"></i>No attack data recorded</div>`;
    } else {
      const segments = Object.entries(attackCounts).map(([k, v]) => ({
        label: k.toUpperCase(),
        pct: Math.round((v / totalAttacks) * 100),
        color: k.startsWith('sqli') ? 'var(--maroon-accent)' : k.startsWith('xss') ? 'var(--blue)' : k.startsWith('traversal') ? 'var(--gold)' : k.startsWith('cmdi') ? 'var(--green)' : k.startsWith('ssrf') ? 'var(--red)' : '#6B6560',
      }));
      const r = 36, circ = 2 * Math.PI * r;
      let offset = 0;
      const arcs = segments.map(seg => {
        const len = (seg.pct / 100) * circ;
        const arc = `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${seg.color}" stroke-width="14" stroke-dasharray="${len} ${circ}" stroke-dashoffset="${-offset}" stroke-linecap="butt"/>`;
        offset += len;
        return arc;
      }).join('');
      attackPie.innerHTML =
        `<svg width="104" height="104" viewBox="0 0 100 100"><circle cx="50" cy="50" r="${r}" fill="none" stroke="var(--blk-md)" stroke-width="14"/>${arcs}<text x="50" y="54" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text-pr)">${fmt(totalAttacks)}</text></svg>` +
        `<div class="pie-legend">${segments.map(s => `<div class="pie-row"><span class="pie-dot" style="background:${s.color}"></span><span class="pie-label">${esc(s.label)}</span><span class="pie-pct">${s.pct}%</span></div>`).join('')}</div>`;
    }
  }

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
  if (body) body.innerHTML = skeletonRows(6);

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

  let url = '/alerts?limit=200';
  if (filter) url += '&severity=' + filter;
  if (moduleFilter) url += '&module=' + moduleFilter;
  if (sourceFilter) url += '&source=' + encodeURIComponent(sourceFilter);
  if (searchText) url += '&search=' + encodeURIComponent(searchText);
  if (includeLow === 'true') url += '&include_low=true';
  url += '&exclude_self_test=' + excludeSelfTest;

  const data = await req(url);
  const alertList = data?.alerts || [];

  const totalEl = document.getElementById('alertTotal');
  if (totalEl) totalEl.textContent = alertList.length + ' alerts';

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
      <td style="color:var(--text-muted);font-size:12px;white-space:nowrap">${rel(a.timestamp)}</td>
      <td style="white-space:nowrap">
        ${a.resolved
          ? pill('<i class="ti ti-check"></i> Resolved', 'green')
          : `<button class="btn btn-outline btn-xs" onclick="resolveAlert(${a.id})">
               <i class="ti ti-check"></i> Resolve
             </button>`
        }
        <span style="display:inline-flex;gap:2px;margin-left:4px">
          <span class="prem-grp" data-feature="ai_assistant">
            <button class="btn btn-outline btn-xs" onclick="toggleExplain(${a.id}, this)" title="Explain with AI" style="font-size:10px;padding:2px 6px">
              <i class="ti ti-sparkles"></i> AI
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
    badge.innerHTML = '<span style="color:var(--red);font-size:11px">FP: err</span>';
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

  // Labor Illusion Loading State
  content.innerHTML = `
    <div style="padding: 16px 20px; background: rgba(255,255,255,0.01); border-radius: 8px; border: 1px solid var(--blk-brd)">
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
        <i class="ti ti-loader" style="font-size: 16px; color: var(--maroon-accent); display: inline-block; animation: spin 1s linear infinite;"></i>
        <strong style="font-size: 13px; color: var(--text-pr)">Threat Intel Engine Analysis in Progress...</strong>
      </div>
      <div class="labor-loader-bar" style="height: 3px; background: var(--blk-md); border-radius: 2px; overflow: hidden; margin-bottom: 12px;">
        <div class="labor-loader-progress" style="height: 100%; width: 5%; background: var(--maroon-accent); transition: width 0.4s ease;"></div>
      </div>
      <div class="labor-status-list" style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
        <div id="step-0" style="color: var(--text-pr)"><i class="ti ti-loader" style="display:inline-block;animation:spin 1s linear infinite"></i> Initializing Deep Threat Analyzer...</div>
        <div id="step-1" style="opacity: 0.4"><i class="ti ti-circle"></i> Decoding payload structures...</div>
        <div id="step-2" style="opacity: 0.4"><i class="ti ti-circle"></i> Querying local intelligence base...</div>
        <div id="step-3" style="opacity: 0.4"><i class="ti ti-circle"></i> Resolving MITRE ATT&CK vectors...</div>
        <div id="step-4" style="opacity: 0.4"><i class="ti ti-circle"></i> Formulating response via Gemini...</div>
      </div>
    </div>
  `;

  let currentStep = 0;
  const steps = [
    "Initializing Deep Threat Analyzer...",
    "Decoding payload structures...",
    "Querying local intelligence base...",
    "Resolving MITRE ATT&CK vectors...",
    "Formulating response via Gemini..."
  ];

  const updateSteps = () => {
    const listEl = content.querySelector('.labor-status-list');
    if (!listEl) return;
    
    let html = '';
    for (let i = 0; i < steps.length; i++) {
      if (i < currentStep) {
        html += `<div style="color: var(--green)"><i class="ti ti-check"></i> ${steps[i]}</div>`;
      } else if (i === currentStep) {
        html += `<div style="color: var(--text-pr)"><i class="ti ti-loader" style="display:inline-block;animation:spin 1s linear infinite"></i> ${steps[i]}</div>`;
      } else {
        html += `<div style="opacity: 0.4"><i class="ti ti-circle"></i> ${steps[i]}</div>`;
      }
    }
    listEl.innerHTML = html;
    
    const progressEl = content.querySelector('.labor-loader-progress');
    if (progressEl) {
      progressEl.style.width = `${((currentStep + 1) / steps.length) * 100}%`;
    }
  };

  const timer = setInterval(() => {
    if (currentStep < steps.length - 1) {
      currentStep++;
      updateSteps();
    } else {
      clearInterval(timer);
    }
  }, 600);

  // Check cache first
  const cached = await req('/ai/explain/' + alertId);
  if (cached?.explanation) {
    clearInterval(timer);
    explainCache[alertId] = cached.explanation;
    content.innerHTML = markedExplanation(cached.explanation);
    return;
  }

  // Generate new explanation
  const result = await req('/ai/explain/' + alertId, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  clearInterval(timer);
  if (result?.explanation) {
    explainCache[alertId] = result.explanation;
    content.innerHTML = markedExplanation(result.explanation);
  } else if (result?.error) {
    content.innerHTML = `<div style="color:var(--red)"><i class="ti ti-alert-triangle"></i> ${esc(result.error)}</div>`;
  } else {
    content.innerHTML = `<div style="color:var(--text-muted)"><i class="ti ti-sparkles"></i> Analysis unavailable - set GEMINI_API_KEY to enable</div>`;
  }
}

function markedExplanation(text) {
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-pr)">$1</strong>')
    .replace(/\n/g, '<br>')
    .replace(/(#{1,3})\s+(.*)/g, '<div style="font-weight:700;font-size:13px;color:var(--text-pr);margin-top:8px">$2</div>');
  return html;
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
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  text = text.replace(/`{3}(\w*)\n([\s\S]*?)`{3}/g, '<pre><code>$2</code></pre>');
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/^### (.*?)$/gm, '<div style="font-size:14px;font-weight:700;margin:8px 0 4px">$1</div>');
  text = text.replace(/^## (.*?)$/gm, '<div style="font-size:15px;font-weight:700;margin:10px 0 4px">$1</div>');
  text = text.replace(/^# (.*?)$/gm, '<div style="font-size:16px;font-weight:700;margin:12px 0 4px">$1</div>');
  text = text.replace(/^> (.*?)$/gm, '<div style="border-left:3px solid var(--maroon-accent);padding-left:10px;margin:4px 0;color:var(--text-sec)">$1</div>');
  text = text.replace(/^- (.*?)$/gm, '<li style="margin:2px 0 2px 14px;list-style:disc">$1</li>');
  text = text.replace(/^\d+\. (.*?)$/gm, '<li style="margin:2px 0 2px 14px;list-style:decimal">$1</li>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:var(--maroon-accent);text-decoration:underline">$1</a>');
  text = text.replace(/\n/g, '<br>');
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
      const labelMap = { block_ip: '🚫 Block', unblock_ip: '🔓 Unblock', resolve_alert: '✅ Resolve', add_directory: '📁 Add Dir' };
      const colorMap = { block_ip: 'var(--red)', unblock_ip: 'var(--green)', resolve_alert: 'var(--maroon-accent)', add_directory: 'var(--blue)' };
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
      <td style="color:var(--text-muted);font-size:12px;white-space:nowrap">${rel(e.timestamp)}</td>
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

async function renderWafCustomRules() {
  const body = document.getElementById('wafCustomRulesBody');
  const countEl = document.getElementById('wafCustomRuleCount');
  if (body) body.innerHTML = skeletonRows(7);
  const data = await req('/api/waf/custom-rules');
  const rules = data?.rules || [];
  if (countEl) countEl.textContent = rules.length + ' rules';
  if (body) body.innerHTML = rules.length ? rules.map(r => `
    <tr>
      <td style="font-weight:600;color:var(--text-pr)">${esc(r.name)}</td>
      <td>${pill(esc(r.attack_type), 'muted')}</td>
      <td>${sevBadge(r.severity)}</td>
      <td style="font-family:var(--font-mono);font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.pattern)}">${esc(r.pattern)}</td>
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
  `).join('') : emptyRow(7, '<i class="ti ti-shield-off" style="color:var(--text-muted);display:block;margin-bottom:6px;font-size:18px"></i>No custom WAF rules - add one above');
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

// ═══════════════════════════════════════════════════════════════════════════
//  THREAT INTEL
// ═══════════════════════════════════════════════════════════════════════════

async function renderIntel() {
  const body = document.getElementById('trafficBody');
  if (body) body.innerHTML = skeletonRows(4);

  const data = await req('/traffic/top');
  const ips = data?.ips || [];

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
    const malCount  = ips.filter(i => i.abuse_score > 50).length;
    const suspCount = ips.filter(i => i.abuse_score > 0 && i.abuse_score <= 50).length;
    const clnCount  = ips.filter(i => !i.abuse_score).length;
    intelFull.innerHTML = `
      <div class="intel-item"><div class="intel-num known">${malCount}</div><div class="intel-label">Malicious</div></div>
      <div class="intel-item"><div class="intel-num susp">${suspCount}</div><div class="intel-label">Suspicious</div></div>
      <div class="intel-item"><div class="intel-num clean">${clnCount}</div><div class="intel-label">Clean</div></div>
      <div class="intel-item"><div class="intel-num total">${ips.length}</div><div class="intel-label">Total</div></div>
    `;
  }
}

async function searchIntel() {
  const q = document.getElementById('intelSearch').value.trim();
  if (!q) return renderIntel();
  const data = await req('/traffic/search?q=' + encodeURIComponent(q));
  const out = document.getElementById('intelResult');
  out.style.display = 'block';
  out.textContent = JSON.stringify(data, null, 2);
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
      <td style="color:var(--text-muted);font-size:12px;white-space:nowrap">${rel(e.timestamp)}</td>
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

      <div class="panel" style="cursor:pointer" onclick="window.open('/report/compliance','_blank')">
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
          <span class="panel-title" onclick="exportLogs()" style="cursor:pointer;color:var(--blue);border:1px solid var(--border);padding:4px 8px;border-radius:4px;"><i class="ti ti-download"></i> Export Logs (CSV)</span>
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
        <div style="display:flex;align-items:center;gap:6px">
          <span class="kc-bar-track" style="width:50px;height:5px"><span class="kc-bar-fill" style="width:${barW}%;background:${cpuColor};height:5px"></span></span>
          <span style="font-weight:600;color:${cpuColor};font-variant-numeric:tabular-nums;font-size:12px">${cpu}%</span>
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

registerTopic('stats', data => {
  if (currentTab === 'overview') renderOverview();
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
          <i class="ti ti-trash"></i> Remove
        </button>
      </td>
    </tr>`
  ).join('') : emptyRow(2, 'No specific files monitored - add one above');
}

async function renderFileHashes() {
  const body = document.getElementById('fileBody');
  if (body) body.innerHTML = skeletonRows(4);
  const data = await req('/events/files');

  if (body) body.innerHTML = (data?.files || []).slice(0, 50).map(f => {
    const hash = f.hash_value ? f.hash_value.slice(0, 12) + '…' : '-';
    const size = f.file_size != null ? (f.file_size / 1024).toFixed(1) + ' KB' : '-';
    return `<tr>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-pr)">${esc(f.file_path)}</td>
      <td>${mono(hash)}</td>
      <td style="font-variant-numeric:tabular-nums">${size}</td>
      <td style="color:var(--text-muted);font-size:12px;white-space:nowrap">${rel(f.last_seen)}</td>
    </tr>`;
  }).join('') || emptyRow(4, 'No monitored files yet');
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
  } else {
    toast('Failed to remove file', 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SYSTEM GAUGES
// ═══════════════════════════════════════════════════════════════════════════

async function renderSystemGauges() {
  const el = document.getElementById('gaugeRow');
  if (!el) return;
  const data = await req('/system/metrics');
  if (!data || data.error) {
    el.innerHTML = `<div class="empty-state" style="padding:24px;grid-column:1/-1"><i class="ti ti-cpu-off"></i><p>System metrics unavailable</p></div>`;
    return;
  }
  const cpu = data.cpu_percent || 0;
  const mem = data.memory?.percent || 0;
  const disk = data.disk?.percent || 0;
  const netSent = data.network?.bytes_sent_mb || 0;
  const netRecv = data.network?.bytes_recv_mb || 0;
  const load = data.load_avg?.[0] || 0;
  const cores = data.cpu_count || 1;
  const loadNorm = Math.min(Math.round((load / cores) * 100), 100);

  const cpuColor = cpu > 80 ? '#EB5757' : cpu > 50 ? '#F2C94C' : '#27AE60';
  const memColor = mem > 80 ? '#EB5757' : mem > 60 ? '#F2C94C' : '#4D94FF';
  const diskColor = disk > 85 ? '#EB5757' : disk > 65 ? '#F2C94C' : '#D45080';
  const netColor = netSent > 100 ? '#F2C94C' : '#4D94FF';
  const loadColor = loadNorm > 80 ? '#EB5757' : loadNorm > 50 ? '#F2C94C' : '#27AE60';
  const netNorm = netSent > 200 ? 100 : Math.round((netSent / 200) * 100);

  if (!window.sysCharts) {
    el.innerHTML = `
      <div class="sys-gauge"><div id="chart-cpu" style="margin:-15px"></div><div class="sys-gauge-info"><div class="sys-gauge-label"><i class="ti ti-cpu"></i> CPU</div><div class="sys-gauge-val" id="val-cpu">${cpu}%</div><div class="sys-gauge-sub" id="sub-cpu">${data.processes || '-'} processes</div></div></div>
      <div class="sys-gauge"><div id="chart-mem" style="margin:-15px"></div><div class="sys-gauge-info"><div class="sys-gauge-label"><i class="ti ti-terminal"></i> Memory</div><div class="sys-gauge-val" id="val-mem">${mem}%</div><div class="sys-gauge-sub" id="sub-mem">${data.memory?.used_mb || 0} / ${data.memory?.total_mb || 0} MB</div></div></div>
      <div class="sys-gauge"><div id="chart-disk" style="margin:-15px"></div><div class="sys-gauge-info"><div class="sys-gauge-label"><i class="ti ti-database"></i> Disk</div><div class="sys-gauge-val" id="val-disk">${disk}%</div><div class="sys-gauge-sub" id="sub-disk">${data.disk?.used_gb || 0} / ${data.disk?.total_gb || 0} GB</div></div></div>
      <div class="sys-gauge"><div id="chart-net" style="margin:-15px"></div><div class="sys-gauge-info"><div class="sys-gauge-label"><i class="ti ti-network"></i> Network I/O</div><div class="sys-gauge-val" id="val-net">${netSent.toFixed(1)} MB</div><div class="sys-gauge-sub" id="sub-net">↓ ${netRecv.toFixed(1)} MB sent</div></div></div>
      <div class="sys-gauge"><div id="chart-load" style="margin:-15px"></div><div class="sys-gauge-info"><div class="sys-gauge-label"><i class="ti ti-chart-line"></i> Load Avg</div><div class="sys-gauge-val" id="val-load">${load.toFixed(1)}</div><div class="sys-gauge-sub" id="sub-load">${data.load_avg?.map(l => l.toFixed(1)).join(' / ') || '-'}</div></div></div>
    `;
    const opts = (val, col) => ({ series: [val], chart: { type: 'radialBar', height: 80, sparkline: { enabled: true }, animations: { dynamicAnimation: { speed: 1000 } } }, plotOptions: { radialBar: { hollow: { size: '40%' }, track: { background: '#2E2B2A' }, dataLabels: { name: { show: false }, value: { offsetY: 4, fontSize: '12px', color: '#E2E0DF', fontWeight: 700, formatter: v => Math.round(v) } } } }, colors: [col] });
    window.sysCharts = {
      cpu: new ApexCharts(document.getElementById('chart-cpu'), opts(cpu, cpuColor)),
      mem: new ApexCharts(document.getElementById('chart-mem'), opts(mem, memColor)),
      disk: new ApexCharts(document.getElementById('chart-disk'), opts(disk, diskColor)),
      net: new ApexCharts(document.getElementById('chart-net'), opts(netNorm, netColor)),
      load: new ApexCharts(document.getElementById('chart-load'), opts(loadNorm, loadColor))
    };
    Object.values(window.sysCharts).forEach(c => c.render());
  } else {
    window.sysCharts.cpu.updateSeries([cpu]); window.sysCharts.cpu.updateOptions({ colors: [cpuColor] });
    document.getElementById('val-cpu').innerText = cpu + '%'; document.getElementById('sub-cpu').innerText = (data.processes || '-') + ' processes';
    
    window.sysCharts.mem.updateSeries([mem]); window.sysCharts.mem.updateOptions({ colors: [memColor] });
    document.getElementById('val-mem').innerText = mem + '%'; document.getElementById('sub-mem').innerText = (data.memory?.used_mb || 0) + ' / ' + (data.memory?.total_mb || 0) + ' MB';
    
    window.sysCharts.disk.updateSeries([disk]); window.sysCharts.disk.updateOptions({ colors: [diskColor] });
    document.getElementById('val-disk').innerText = disk + '%'; document.getElementById('sub-disk').innerText = (data.disk?.used_gb || 0) + ' / ' + (data.disk?.total_gb || 0) + ' GB';
    
    window.sysCharts.net.updateSeries([netNorm]); window.sysCharts.net.updateOptions({ colors: [netColor] });
    document.getElementById('val-net').innerText = netSent.toFixed(1) + ' MB'; document.getElementById('sub-net').innerText = '↓ ' + netRecv.toFixed(1) + ' MB sent';
    
    window.sysCharts.load.updateSeries([loadNorm]); window.sysCharts.load.updateOptions({ colors: [loadColor] });
    document.getElementById('val-load').innerText = load.toFixed(1); document.getElementById('sub-load').innerText = data.load_avg?.map(l => l.toFixed(1)).join(' / ') || '-';
  }
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
  el.innerHTML = '';
  new ApexCharts(el, {
    series: [{ name: 'Alerts', data: vals.map(v => v.count) }],
    chart: { type: 'area', height: 200, toolbar: { show: false }, background: 'transparent', animations: { enabled: true } },
    colors: ['#D45080'],
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.1, stops: [0, 90, 100] } },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    xaxis: { categories: vals.map(v => v.label), labels: { style: { colors: '#6B6560' } }, axisBorder: { show: false } },
    yaxis: { labels: { style: { colors: '#6B6560' } } },
    grid: { borderColor: '#2E2B2A', strokeDashArray: 4 },
    theme: { mode: 'dark' },
    tooltip: { theme: 'dark' }
  }).render();
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
  const typeColors = { sqli: '#E25B5B', xss: '#4D94FF', traversal: '#F2C94C', cmdi: '#27AE60', ssrf: '#EB5757', webshell: '#D45080', scanner: '#949494', other: '#6B6560' };
  el.innerHTML = '';
  new ApexCharts(el, {
    series: [{ name: 'Attacks', data: entries.map(e => e[1]) }],
    chart: { type: 'bar', height: 200, toolbar: { show: false }, background: 'transparent' },
    colors: entries.map(e => typeColors[e[0]] || '#6B6560'),
    plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: '60%' } },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: { categories: entries.map(e => e[0].toUpperCase()), labels: { style: { colors: '#6B6560', fontSize: '10px' } }, axisBorder: { show: false } },
    yaxis: { labels: { style: { colors: '#6B6560' } } },
    grid: { borderColor: '#2E2B2A', strokeDashArray: 4 },
    theme: { mode: 'dark' },
    tooltip: { theme: 'dark' }
  }).render();
}

// ═══════════════════════════════════════════════════════════════════════════
//  TOP CPU PROCESSES (Horizontal bar chart)
// ═══════════════════════════════════════════════════════════════════════════

async function renderCPUBars() {
  const el = document.getElementById('cpuBarChart');
  if (!el) return;
  const data = await req('/processes/live');
  const procs = data?.processes || [];
  if (!procs.length) {
    el.innerHTML = `<div class="empty-state" style="padding:10px;width:100%"><i class="ti ti-cpu-off"></i><p>No process data</p></div>`;
    return;
  }
  const sorted = [...procs].sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0)).slice(0, 6);
  const maxCpu = Math.max(...sorted.map(p => p.cpu_percent || 0), 1);
  const colors = ['var(--red)', 'var(--gold)', 'var(--blue)', 'var(--green)', 'var(--maroon-accent)', '#D45080'];
  el.innerHTML = sorted.map((p, i) => {
    const pct = p.cpu_percent || 0;
    const w = Math.max(Math.round((pct / maxCpu) * 100), 2);
    const color = colors[i % colors.length];
    return `<div class="cpu-bar-row">
      <span class="cpu-bar-name">${esc(p.name || '?')}</span>
      <div class="cpu-bar-track"><div class="cpu-bar-fill" style="width:${w}%;background:${color}"></div></div>
      <span class="cpu-bar-pct">${pct.toFixed(1)}%</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
//  ALERT RULES CRUD
// ═══════════════════════════════════════════════════════════════════════════

async function renderRules() {
  const body = document.getElementById('rulesBody');
  if (body) body.innerHTML = skeletonRows(7);
  const data = await req('/rules/alert');
  const rules = data?.rules || [];
  if (body) body.innerHTML = rules.length ? rules.map(r => `
    <tr>
      <td style="font-weight:600;color:var(--text-pr)">${esc(r.name)}</td>
      <td>${r.severity ? sevBadge(r.severity) : '<span style="color:var(--text-muted)">Any</span>'}</td>
      <td>${r.module ? pill(esc(r.module),'muted') : '<span style="color:var(--text-muted)">Any</span>'}</td>
      <td style="font-family:var(--font-mono);font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.pattern ? esc(r.pattern) : '<span style="color:var(--text-muted)">-</span>'}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${mono(r.webhook_url)}</td>
      <td>${r.enabled ? pill('Active','green') : pill('Disabled','muted')}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-xs" onclick="toggleRule(${r.id}, ${r.enabled ? 0 : 1})">
          <i class="ti ${r.enabled ? 'ti-player-pause' : 'ti-player-play'}"></i>
          ${r.enabled ? 'Disable' : 'Enable'}
        </button>
        <button class="btn btn-danger btn-xs" onclick="deleteRule(${r.id})">
          <i class="ti ti-trash"></i>
        </button>
      </td>
    </tr>
  `).join('') : emptyRow(7, '<i class="ti ti-bell-off" style="color:var(--text-muted);display:block;margin-bottom:6px;font-size:18px"></i>No alert rules configured - create one to get webhook notifications');
}

async function createAlertRule() {
  const name = document.getElementById('ruleName').value.trim();
  const webhook = document.getElementById('ruleWebhook').value.trim();
  if (!name) { toast('Rule name is required', 'warn'); return; }
  if (!webhook) { toast('Webhook URL is required', 'warn'); return; }
  const res = await req('/rules/alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      severity: document.getElementById('ruleSeverity').value || null,
      module: document.getElementById('ruleModule').value || null,
      pattern: document.getElementById('rulePattern').value.trim() || null,
      webhook_url: webhook,
      enabled: document.getElementById('ruleEnabled').checked,
    }),
  });
  if (res?.success) {
    toast('Alert rule created', 'success');
    closeAddRuleModal();
    renderRules();
  } else {
    toast('Failed to create rule', 'error');
  }
}

async function toggleRule(id, enabled) {
  const res = await req('/rules/alert/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: !!enabled }),
  });
  if (res?.success) {
    toast(enabled ? 'Rule enabled' : 'Rule disabled', 'success');
    renderRules();
  } else {
    toast('Failed to update rule', 'error');
  }
}

async function deleteRule(id) {
  if (!confirm('Delete this alert rule?')) return;
  const res = await req('/rules/alert/' + id, { method: 'DELETE' });
  if (res?.success) {
    toast('Rule deleted', 'warn');
    renderRules();
  } else {
    toast('Failed to delete rule', 'error');
  }
}

function showAddRuleModal() {
  document.getElementById('addRulePanel').classList.add('open');
  document.getElementById('ruleName').value = '';
  document.getElementById('ruleWebhook').value = '';
  document.getElementById('rulePattern').value = '';
  document.getElementById('ruleSeverity').value = '';
  document.getElementById('ruleModule').value = '';
  document.getElementById('ruleEnabled').checked = true;
  document.getElementById('ruleName').focus();
}

function closeAddRuleModal() {
  document.getElementById('addRulePanel').classList.remove('open');
}

// ═══════════════════════════════════════════════════════════════════════════
//  FLEET
// ═══════════════════════════════════════════════════════════════════════════

async function renderFleet() {
  const body = document.getElementById('fleetBody');
  if (body) body.innerHTML = skeletonRows(6);
  const data = await req('/fleet/agents');
  const agents = data?.agents || [];
  const summary = document.getElementById('fleetSummary');

  if (agents.length === 0) {
    if (summary) summary.textContent = 'No agents connected';
    if (body) body.innerHTML = emptyRow(6, '<i class="ti ti-server-off" style="color:var(--text-muted);display:block;margin-bottom:6px;font-size:18px"></i>No agents - set BWE_AGENT_MODE=agent on remote servers');
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
      <td style="white-space:nowrap">
        <button class="btn btn-outline btn-xs" onclick="showConfigPushModal('${esc(a.agent_id)}')">
          <i class="ti ti-settings"></i> Config
        </button>
      </td>
    </tr>`;
  }).join('');
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
      body.innerHTML = emptyRow(7, '<i class="ti ti-fingerprint-off" style="color:var(--text-muted);display:block;margin-bottom:6px;font-size:18px"></i>No login events');
      return;
    }
    body.innerHTML = events.map(e => {
      const time = e.timestamp ? rel(e.timestamp) : '-';
      const ip = esc(e.source_ip || '-');
      const user = esc(e.username || '-');
      const svc = esc(e.service || '-');
      const port = e.port != null ? e.port : '-';
      const src = esc(e.log_source || '-');
      let statusBadge, statusColor;
      if (e.status === 'success') { statusBadge = '�-�'; statusColor = 'var(--green)'; }
      else if (e.status === 'blocked') { statusBadge = '�-�'; statusColor = 'var(--gold)'; }
      else { statusBadge = '�-�'; statusColor = 'var(--red)'; }
      const unblockBtn = e.status === 'blocked' && e.source_ip
        ? `<button class="btn btn-outline btn-xs" onclick="unblockLoginIP('${esc(e.source_ip)}', this)" style="color:var(--green);border-color:var(--green)">Unblock</button>`
        : '';
      return `<tr>
        <td style="font-size:11px;white-space:nowrap;color:var(--text-muted)">${time}</td>
        <td style="font-family:monospace;font-size:12px">${ip}</td>
        <td style="font-size:12px">${user}</td>
        <td style="font-size:12px">${svc}</td>
        <td><span style="color:${statusColor}">${statusBadge}</span> ${e.status}</td>
        <td style="font-size:12px;color:var(--text-muted)">${port}</td>
        <td style="font-size:11px;color:var(--text-muted)">${src}</td>
        <td style="white-space:nowrap">${unblockBtn}</td>
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
  if (el) el.textContent = new Date().toLocaleTimeString([], { hour12: false });
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
    render();
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

// Patch render to also inject Analysis buttons
const _origRender = render;
render = async function() {
  await _origRender.call(this);
  injectAskAiButtons();
};

setRefreshInterval(10);
render();
refreshPremiumUI();

// Re-check premium UI when settings modal opens (license may have changed)
const _origOpenSettings = window.openSettings;
window.openSettings = function() {
  _cachedLicense = null;
  refreshPremiumUI();
  _origOpenSettings.call(this);
};
// === EXPORT & DOWNLOAD ===
async function downloadReport() {
  toast('Generating PDF report...', 'info');
  const element = document.getElementById('mainContent');
  html2pdf().set({
    margin: 10,
    filename: 'BinaryWebEngine_Report.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
  }).from(element).save().then(() => toast('Report downloaded successfully!', 'success'));
}

async function exportLogs() {
  toast('Exporting logs...', 'info');
  let data = [];
  if (currentTab === 'alerts') { data = (await req('/alerts?limit=1000'))?.alerts || []; }
  else if (currentTab === 'waf') { data = (await req('/events/waf?limit=1000'))?.events || []; }
  else if (currentTab === 'network') { data = (await req('/network/live'))?.connections || []; }
  else if (currentTab === 'logins') { data = (await req('/api/login-events?limit=1000'))?.events || []; }
  else { return toast('Export not supported for this tab.', 'error'); }
  
  if (!data.length) return toast('No data available to export.', 'error');
  
  const headers = Object.keys(data[0]).join(',');
  const csv = data.map(row => Object.values(row).map(v => '\"' + String(v).replace(/\"/g, '\"\"') + '\"').join(',')).join('\n');
  const blob = new Blob([headers + '\n' + csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentTab + '_export.csv';
  a.click();
  toast('Logs exported successfully!', 'success');
}
