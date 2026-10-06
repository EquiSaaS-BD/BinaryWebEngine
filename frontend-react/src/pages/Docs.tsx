import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import './Docs.css';

// ── Navigation structure ──────────────────────────────────────────────────────
const NAV = [
  {
    label: 'Getting Started',
    items: [
      { id: 'overview', title: 'Overview' },
      { id: 'requirements', title: 'System Requirements' },
      { id: 'quickstart', title: 'Quick Start' },
      { id: 'cli', title: 'CLI Reference' },
    ],
  },
  {
    label: 'Dashboard',
    items: [
      { id: 'dashboard-overview', title: 'Overview Tab' },
      { id: 'dashboard-alerts', title: 'Alerts & Incidents' },
      { id: 'dashboard-killchain', title: 'Kill Chain' },
      { id: 'dashboard-waf', title: 'WAF Dashboard' },
      { id: 'dashboard-intel', title: 'Threat Intelligence' },
      { id: 'dashboard-hardening', title: 'Hardening' },
      { id: 'dashboard-audit', title: 'Audit Trail' },
      { id: 'dashboard-rules', title: 'Alert Rules' },
      { id: 'dashboard-reports', title: 'Reports' },
      { id: 'dashboard-processes', title: 'Processes' },
      { id: 'dashboard-network', title: 'Network' },
      { id: 'dashboard-files', title: 'File Monitor' },
      { id: 'dashboard-logins', title: 'Login Monitor' },
      { id: 'dashboard-fleet', title: 'Fleet' },
    ],
  },
  {
    label: 'Detection Modules',
    items: [
      { id: 'waf', title: 'Web Application Firewall' },
      { id: 'file-monitor', title: 'File Integrity Monitor' },
      { id: 'process-monitor', title: 'Process Monitor' },
      { id: 'network-monitor', title: 'Network Monitor' },
      { id: 'malware-scanner', title: 'Malware Scanner' },
      { id: 'login-monitor', title: 'Login Monitor' },
      { id: 'anomaly', title: 'Anomaly Detection' },
      { id: 'killchain', title: 'Kill Chain & MITRE' },
      { id: 'correlation', title: 'Correlation Engine' },
    ],
  },
  {
    label: 'Intelligence & Analysis',
    items: [
      { id: 'intel', title: 'Threat Intelligence' },
      { id: 'ai-assistant', title: 'Analysis Assistant' },
      { id: 'false-positive', title: 'False Positive Advisor' },
      { id: 'ja3', title: 'JA3 Fingerprinting' },
    ],
  },
  {
    label: 'Management',
    items: [
      { id: 'fleet', title: 'Fleet Management' },
      { id: 'siem', title: 'SIEM Forwarding' },
      { id: 'soar', title: 'SOAR & Notifications' },
      { id: 'compliance', title: 'Compliance Reports' },
      { id: 'config', title: 'Configuration' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'api', title: 'API Reference' },
      { id: 'env', title: 'Environment Variables' },
      { id: 'deployment', title: 'Deployment' },
      { id: 'troubleshooting', title: 'Troubleshooting' },
      { id: 'license-system', title: 'Licensing' },
    ],
  },
];

// ── Reusable UI components ────────────────────────────────────────────────────
const Note = ({ children }: { children: React.ReactNode }) => (
  <div className="docs-note"><strong>Note: </strong>{children}</div>
);
const Tip = ({ children }: { children: React.ReactNode }) => (
  <div className="docs-tip"><strong>Tip: </strong>{children}</div>
);
const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="docs-code">{children}</code>
);
const Pre = ({ lang, children }: { lang?: string; children: React.ReactNode }) => (
  <div className="docs-pre">
    <div className="docs-pre-label">
      <span className="docs-pre-lang">{lang ?? 'bash'}</span>
      <div className="docs-pre-dots">
        <span style={{ background: '#ff5f56' }} />
        <span style={{ background: '#ffbd2e' }} />
        <span style={{ background: '#27c93f' }} />
      </div>
    </div>
    <code>{children}</code>
  </div>
);
const ProTag = () => <span className="docs-pro-tag">PRO</span>;
const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <div className="docs-section-card">{children}</div>
);
const Table = ({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) => (
  <div className="docs-table-wrap">
    <table className="docs-table">
      <thead>
        <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);
const FeatureGrid = ({ features }: { features: { title: string; desc: React.ReactNode }[] }) => (
  <div className="docs-feature-grid">
    {features.map((f, i) => (
      <div key={i} className="docs-feature-card">
        <div className="docs-feature-card-title">{f.title}</div>
        <div className="docs-feature-card-desc">{f.desc}</div>
      </div>
    ))}
  </div>
);
const H2 = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <h2 id={id} className="docs-h2">{children}</h2>
);
const H3 = ({ id, children }: { id?: string; children: React.ReactNode }) => (
  <h3 id={id} className="docs-h3">{children}</h3>
);
const H4 = ({ children }: { children: React.ReactNode }) => (
  <h4 className="docs-h4">{children}</h4>
);
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="docs-p">{children}</p>
);
const UL = ({ items }: { items: React.ReactNode[] }) => (
  <ul className="docs-ul">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
);
const OL = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="docs-ol">{items.map((item, i) => <li key={i}>{item}</li>)}</ol>
);
const Strong = ({ children }: { children: React.ReactNode }) => (
  <strong className="docs-strong">{children}</strong>
);

// ── Main Component ────────────────────────────────────────────────────────────
export default function Docs() {
  const [activeId, setActiveId] = useState('overview');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showBackTop, setShowBackTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Apply docs-page-active class to body on mount
  useEffect(() => {
    document.body.classList.add('docs-page-active');
    return () => {
      document.body.classList.remove('docs-page-active');
    };
  }, []);

  // Active section via IntersectionObserver using contentRef container as root
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const allIds = NAV.flatMap(g => g.items.map(i => i.id));
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            setActiveId(e.target.id);
          }
        });
      },
      {
        root: container,
        rootMargin: '-5% 0px -70% 0px'
      }
    );

    allIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Reading progress bar + back-to-top visibility inside container scroll
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onScroll = () => {
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight - el.clientHeight;
      setProgress(scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0);
      setShowBackTop(scrollTop > 450);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Prevent body scroll when drawer is open (for mobile navigation drawer)
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  const scrollTo = (id: string) => {
    const container = contentRef.current;
    const el = document.getElementById(id);
    if (container && el) {
      const containerTop = container.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      const scrollTarget = container.scrollTop + (elTop - containerTop) - 40;
      container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      setActiveId(id);
    }
    setDrawerOpen(false);
  };

  // Find active section title for mobile bar
  const activeTitle = NAV.flatMap(g => g.items).find(i => i.id === activeId)?.title ?? 'Overview';

  // Shared sidebar nav markup
  const SidebarNav = () => (
    <>
      {NAV.map(group => (
        <div key={group.label} className="docs-nav-group">
          <div className="docs-nav-group-label">{group.label}</div>
          {group.items.map(item => (
            <button
              key={item.id}
              className={`docs-nav-item${activeId === item.id ? ' active' : ''}`}
              onClick={() => scrollTo(item.id)}
            >
              {item.title}
            </button>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <>
      <Helmet>
        <title>Documentation | BinaryWebEngine</title>
        <meta name="description" content="Complete documentation for BinaryWebEngine: WAF, HIDS, NIDS, ML anomaly detection, kill chain, fleet management and more." />
        <meta property="og:title" content="Documentation | BinaryWebEngine" />
        <meta property="og:description" content="Complete documentation for BinaryWebEngine: WAF, HIDS, NIDS, ML anomaly detection, kill chain, fleet management and more." />
        <meta property="og:image" content="https://binarywebengine.web.app/static/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Documentation | BinaryWebEngine" />
        <meta name="twitter:description" content="Complete documentation for BinaryWebEngine: WAF, HIDS, NIDS, ML anomaly detection, kill chain, fleet management and more." />
        <meta name="twitter:image" content="https://binarywebengine.web.app/static/og-image.png" />
      </Helmet>

      {/* Reading progress bar */}
      <div className="docs-progress" style={{ width: `${progress}%` }} />

      {/* ── Mobile sticky bar (tablet + mobile only) ── */}
      <div className="docs-mobile-bar">
        <span className="docs-mobile-bar-section">{activeTitle}</span>
        <button className="docs-mobile-bar-btn" onClick={() => setDrawerOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
          Sections
        </button>
      </div>

      {/* ── Mobile drawer overlay ── */}
      <div
        className={`docs-drawer-overlay${drawerOpen ? ' open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      >
        <div className="docs-drawer" onClick={e => e.stopPropagation()}>
          <div className="docs-drawer-handle-bar" />
          <div className="docs-drawer-header">
            <span className="docs-drawer-title">Documentation Sections</span>
            <button className="docs-drawer-close" onClick={() => setDrawerOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="docs-drawer-body">
            <SidebarNav />
          </div>
        </div>
      </div>

      {/* ── Main layout: sidebar + content ── */}
      <div className="docs-root">

        {/* Desktop sidebar */}
        <aside className="docs-sidebar">
          <div className="docs-sidebar-header">
            <a href="/" className="docs-sidebar-brand">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#800020" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              <span>BinaryWebEngine</span>
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <span className="docs-sidebar-badge">Closed Source</span>
              <span className="docs-sidebar-version">v1.0</span>
            </div>
          </div>
          <SidebarNav />
        </aside>

        {/* Content area */}
        <main className="docs-content" ref={contentRef}>

          {/* ═══════════════════ OVERVIEW ═══════════════════ */}
          <div style={{ marginBottom: '32px' }}>
            <div className="docs-intro-meta">
              <span>v1.0.0</span>
              <span>Linux Only</span>
              <span>Open API</span>
            </div>
            <h1 className="docs-h1">BinaryWebEngine Documentation</h1>
            <p className="docs-p" style={{ fontSize: '16px', color: '#64748b' }}>
              Complete reference for the all-in-one enterprise Linux security monitoring platform.
              WAF, HIDS, NIDS, ML anomaly detection, kill chain, fleet management, and analysis assistant.
            </p>
          </div>

          <H2 id="overview">Overview</H2>
          <P><Strong>BinaryWebEngine</Strong> is an all-in-one security monitoring platform for Linux. It bundles WAF, HIDS, NIDS, file integrity monitoring, malware scanning, ML anomaly detection, kill chain reconstruction, and threat intelligence into a single engine with a real-time dashboard.</P>
          <P>Monitor one server or a fleet of machines from a single dashboard. No separate SIEM appliance, no third-party connectors, no complex integrations.</P>
          <FeatureGrid features={[
            { title: 'Web Application Firewall', desc: '186 regex signatures across 25 attack categories. Real-time payload inspection with rate limiting and auto-block.' },
            { title: 'File Integrity Monitor', desc: 'SHA-256 baseline, inotify real-time change detection, webshell scanning on modification events.' },
            { title: 'Process & Network Monitoring', desc: 'Suspicious process trees, cryptominer detection, reverse shell identification, live connection tables.' },
            { title: 'Kill Chain Reconstruction', desc: 'Lockheed Martin 7-stage + MITRE ATT&CK mapping. Composites low-severity events into high-severity chain alerts.' },
            { title: 'ML Anomaly Detection', desc: 'Isolation Forest, rolling statistics, LSTM sequence profiling, Page-Hinkley concept drift detection.' },
            { title: 'Threat Intelligence', desc: 'AbuseIPDB reputation lookups with CIDR suppression, automatic blocking by abuse score threshold.' },
            { title: 'Analysis Assistant', desc: 'NVIDIA/Gemini/OpenAI-powered alert explanations, conversational chat with full system context, false positive scoring.' },
            { title: 'Fleet Management', desc: <><span>Hub & Spoke architecture with mTLS. Centrally monitor multiple servers from a single dashboard.</span> <ProTag /></> },
          ]} />

          <H3 id="requirements">System Requirements</H3>
          <Table
            headers={['Component', 'Minimum', 'Recommended']}
            rows={[
              ['OS', 'Linux (Ubuntu 20.04+, Debian 11+, RHEL 8+)', 'Ubuntu 22.04 LTS'],
              ['CPU', '1 vCPU', '2+ vCPU'],
              ['RAM', '512 MB', '2 GB+'],
              ['Disk', '500 MB free', '5 GB+ (for logs, quarantine, reports)'],
              ['Python', '3.10+', '3.11+'],
              ['Database', 'SQLite (embedded)', 'PostgreSQL 14+ (production fleets)'],
            ]}
          />

          <H3 id="quickstart">Quick Start</H3>
          <P>The fastest way to evaluate BinaryWebEngine is with the single-file executable:</P>
          <Pre lang="bash">{`# Download the executable
chmod +x bwe

# Start with demo data
./bwe --demo

# Open browser to http://localhost:8000
# Login credentials displayed on first run
# and saved to credentials.txt`}</Pre>
          <P>For development or custom deployments, use the Python source:</P>
          <Pre lang="bash">{`python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Edit config/config.yaml to set API keys
nano config/config.yaml

# Run with demo data
python3 main.py --demo`}</Pre>
          <Note>On first run, a random admin password is generated and written to <Code>credentials.txt</Code> in the working directory.</Note>

          <H3 id="cli">CLI Reference</H3>
          <Table
            headers={['Flag', 'Description']}
            rows={[
              [<Code>(no flag)</Code>, 'Start server on port 8000'],
              [<Code>--demo</Code>, 'Inject demo events and self-test all detection modules on startup'],
              [<Code>--clean</Code>, 'Wipe all data (database, logs, audit trail, quarantine, reports)'],
              [<Code>--scan &lt;path&gt;</Code>, 'One-shot file scan with JSON output'],
              [<Code>--config &lt;path&gt;</Code>, 'Use a custom configuration YAML file'],
              [<Code>--help</Code>, 'Display usage information'],
            ]}
          />

          {/* ═══════════════════ DASHBOARD ═══════════════════ */}
          <H2 id="dashboard">Command Center Dashboard</H2>
          <P>Single-page app with 14 tabs. Auto-refreshes every 10 seconds, with SSE pushing live updates for critical data.</P>

          <H3 id="dashboard-overview">Overview Tab</H3>
          <P>The default landing page provides a high-level security posture summary:</P>
          <UL items={[
            <><Strong>Security Posture Banner</Strong> - Overall risk level (Secure, Elevated, High, Critical) based on active alert severity</>,
            <><Strong>Stat Cards</Strong> - Alerts (24h), WAF Blocks, Blocked IPs, Quarantined Files, Processes, Connections, Hardening Score</>,
            <><Strong>Recent Alerts</Strong> - Last 5 alerts with severity badges, module, IP, and resolution status</>,
            <><Strong>Alerts by Engine (24h)</Strong> - Bar chart breakdown of alerts by detection module</>,
            <><Strong>Kill Chain Status</Strong> - Active multi-stage attack chains with stage completion</>,
            <><Strong>MITRE ATT&CK Matrix</Strong> - Tactics heatmap (Initial Access through Exfiltration)</>,
            <><Strong>Alerts Timeline (24h)</Strong> - Hourly alert volume line chart</>,
            <><Strong>Blocked IPs</Strong> - Currently blocked IP addresses with country and abuse score</>,
            <><Strong>Recent Events</Strong> - Live feed of WAF blocks, file changes, process and network detections</>,
            <><Strong>System Health</Strong> - CPU, memory, disk, and uptime gauges</>,
            <><Strong>Threat Intelligence Summary</Strong> - Top source countries, attack types, and recent AbuseIPDB lookups</>,
          ]} />

          <H3 id="dashboard-alerts">Alerts & Incidents Tab</H3>
          <P>Centralised alert management console:</P>
          <UL items={[
            <><Strong>Filter Controls</Strong> - Search by text, filter by module, source (VPS hostname), severity, include/exclude low severity, hide self-test events</>,
            <><Strong>Alert Table</Strong> - Columns: Severity badge, Title (with reason tooltip), Module, IP Address, Timestamp, Actions</>,
            <><Strong>Resolve</Strong> - Mark individual alerts as resolved with one click</>,
            <><Strong>Analysis</Strong> - Click the <Strong>Explain</Strong> button to generate an LLM-powered explanation of each alert <ProTag /></>,
            <><Strong>False Positive Scoring</Strong> - Click <Strong>FP</Strong> to score an alert's likelihood of being benign. Bulk score all visible alerts with "Score All" <ProTag /></>,
            <><Strong>Alert Count Badge</Strong> - Unresolved critical alert count shown in the navigation bar</>,
            <><Strong>Deduplication</Strong> - Alerts with the same title, IP, and module within a 1-hour window are automatically grouped</>,
          ]} />

          <H3 id="dashboard-killchain">Kill Chain Tab</H3>
          <P>Visualise multi-stage attack chains mapped to the Lockheed Martin framework:</P>
          <UL items={[
            <>Each IP's activity is tracked across 7 stages: Reconnaissance &rarr; Weaponisation &rarr; Delivery &rarr; Exploitation &rarr; Installation &rarr; Command &amp; Control &rarr; Actions on Objectives</>,
            <>Alerts are mapped to MITRE ATT&amp;CK tactics (TA0001-TA0010)</>,
            <>Composite alerts fire when multiple stages are completed by the same IP</>,
            <>Click any chain to drill into detailed event timeline</>,
            <>Chains auto-expire after a configurable TTL</>,
            <>See the MITRE heatmap on the Overview tab for organisational tactical trends</>,
          ]} />

          <H3 id="dashboard-waf">WAF Dashboard Tab</H3>
          <P>Comprehensive Web Application Firewall analytics:</P>
          <UL items={[
            <><Strong>Stats Bar</Strong> - Total blocked requests, active blocked IPs, rate-limited requests, attack type distribution</>,
            <><Strong>Attack Timeline</Strong> - Hourly block volume chart</>,
            <><Strong>WAF Event Log</Strong> - Filterable table (search by IP, attack type, path) with payload preview</>,
            <><Strong>Blocked IPs</Strong> - List of currently blocked addresses with expiry and reason</>,
            <><Strong>Custom Rules</Strong> - Create, edit, enable/disable custom WAF rules with regex patterns. Restore defaults. <ProTag /></>,
            <><Strong>Test Console</Strong> - Send sample requests against the WAF engine and see which signatures fire</>,
          ]} />

          <H3 id="dashboard-intel">Threat Intelligence Tab</H3>
          <P>IP reputation and threat landscape overview:</P>
          <UL items={[
            <><Strong>Top Source Countries</Strong> - Choropleth-style breakdown of traffic origins</>,
            <><Strong>Attack Type Distribution</Strong> - Pie chart of WAF attack categories</>,
            <><Strong>Recent AbuseIPDB Lookups</Strong> - Live feed of IP reputation queries with abuse score, country, ISP, and category</>,
            <><Strong>Top Traffic IPs</Strong> - Ranked by hit count with abuse scores, country, and block status</>,
            <><Strong>IP Search</Strong> - Look up any IP address for reputation data and historical events</>,
            <><Strong>Auto-Block Settings</Strong> - Configure abuse score threshold and enable/disable automatic IP blocking</>,
          ]} />

          <H3 id="dashboard-hardening">Hardening Tab</H3>
          <P>CIS benchmark-inspired security audit with actionable recommendations:</P>
          <UL items={[
            <><Strong>Overall Score</Strong> - 0-100% security posture rating with color-coded indicator</>,
            <><Strong>Category Cards</Strong> - SSH configuration, file permissions, kernel parameters, password policy, firewall rules</>,
            <><Strong>Findings Table</Strong> - Each check shows: status (pass/fail), description, current value, expected value, and remediation command</>,
            <><Strong>Export</Strong> - Download audit results as JSON for compliance evidence</>,
            <>Run the audit on demand or view the last cached result</>,
          ]} />

          <H3 id="dashboard-audit">Audit Trail Tab</H3>
          <P>Tamper-evident, cryptographically chained audit log:</P>
          <UL items={[
            <>Append-only JSONL format with HMAC-SHA256 chaining between entries</>,
            <>Each entry contains: timestamp, event type, actor, details, and a hash linking it to the previous entry</>,
            <><Strong>Verification Status</Strong> - "Chain Verified" or "Tamper Detected" indicator</>,
            <><Strong>Event Table</Strong> - Filterable by event type (config change, login, license apply, alert action, etc.)</>,
            <><Strong>Export</Strong> - Download the full audit log</>,
            <>The first entry's <Code>prev_hash</Code> is 64 zeros - any modification to an entry breaks the chain</>,
          ]} />

          <H3 id="dashboard-rules">Alert Rules Tab</H3>
          <P>Create automated notification rules:</P>
          <UL items={[
            <><Strong>Rule Table</Strong> - Name, Severity, Module, Pattern, Webhook URL, Enabled status</>,
            <><Strong>Create Rule</Strong> - Specify name, severity filter, module filter, regex pattern (matched against alert title), and optional webhook URL</>,
            <><Strong>Webhook Integration</Strong> - Each rule can POST JSON payloads to an external endpoint (Telegram, Discord, Slack, custom SOAR)</>,
            <><Strong>Enable/Disable</Strong> - Toggle rules on and off without deleting them</>,
            <>Rules are evaluated in real-time as alerts fire</>,
          ]} />

          <H3 id="dashboard-reports">Reports Tab</H3>
          <P>Generate and download executive security reports:</P>
          <UL items={[
            <><Strong>Compliance Report</Strong> - Executive summary HTML report with 8 sections: Executive Summary, Security Scorecard, Incident Breakdown, WAF Analysis, Top Threat Actors, Critical/High Alerts, Recommendations, Methodology. PDF export available. <ProTag /></>,
            <><Strong>Threat Summary</Strong> - Lightweight threat landscape overview</>,
            <><Strong>Data Export</Strong> - Export alerts, WAF events, or traffic data as CSV or JSON</>,
            <>Scheduled reports (configurable interval, default 7 days)</>,
          ]} />

          <H3 id="dashboard-processes">Processes Tab</H3>
          <P>Live system process monitoring with suspicion scoring:</P>
          <UL items={[
            <><Strong>Process Table</Strong> - PID, Name, CPU%, Memory, Suspicious flag, Command line</>,
            <><Strong>Summary Bar</Strong> - Total processes, suspicious detections, resource usage</>,
            <><Strong>Auto-Refresh</Strong> - Live updates via SSE every 5 seconds</>,
            <><Strong>Detection Heuristics</Strong>: cryptominer patterns, parent-child anomalies (e.g., php-fpm spawning bash), resource hijacking with sustained CPU/memory spikes</>,
            <><Strong>Exclusion List</Strong> - Configured in settings to whitelist known processes</>,
          ]} />

          <H3 id="dashboard-network">Network Tab</H3>
          <P>Live network connection monitoring:</P>
          <UL items={[
            <><Strong>Connection Table</Strong> - Process, Local Address, Remote Address, Remote Port, Status (ESTABLISHED/TIME_WAIT/etc.)</>,
            <><Strong>Summary Bar</Strong> - Total connections, established count, suspicious detections</>,
            <><Strong>Auto-Refresh</Strong> - Live updates via SSE every 5 seconds</>,
            <><Strong>Detection Heuristics</Strong>: non-standard port connections, reverse shell port patterns, Tor exit node connections, excessive outbound connections</>,
            <>Trusted CIDR ranges configurable in settings</>,
          ]} />

          <H3 id="dashboard-files">Files Tab</H3>
          <P>File integrity monitoring management:</P>
          <UL items={[
            <><Strong>Monitored Directories</Strong> - List of directories under watch with add/remove controls</>,
            <><Strong>File Hash Table</Strong> - Each monitored file shows: path, SHA-256 hash, file size, last verified timestamp</>,
            <><Strong>Scan on Modify</Strong> - When enabled, modified files are automatically scanned by the malware scanner</>,
            <><Strong>Add Directory</Strong> - Add any path to the monitoring set (changes are tracked via inotify/watchdog)</>,
            <><Strong>Whitelist Paths</Strong> - Exclude paths matching patterns (e.g., /proc, /sys, /dev)</>,
          ]} />

          <H3 id="dashboard-logins">Login Monitor Tab</H3>
          <P>Multi-source authentication monitoring across 9 services:</P>
          <UL items={[
            <><Strong>Summary Cards</Strong> - Total events, failed logins, successful logins, blocked IPs</>,
            <><Strong>Event Table</Strong> - Timestamp, Source IP, Username, Service (SSH/FTP/MySQL/PostgreSQL/Nginx/Apache/sudo/cron/web), Status, Port, Log Source</>,
            <><Strong>Filters</Strong> - By service, status, search, and date range</>,
            <><Strong>Auto-Blocking</Strong> - Brute force detection triggers automatic WAF and UFW blocking <ProTag /></>,
            <><Strong>Distributed Credential Stuffing</Strong> - Same username from 3+ unique IPs within a configurable window triggers a high-severity alert</>,
            <><Strong>Non-Standard Port Detection</Strong> - Auth failures on uncommon ports are flagged</>,
            <><Strong>Unblock</Strong> - Release blocked IPs directly from the table</>,
          ]} />

          <H3 id="dashboard-fleet">Fleet Tab</H3>
          <P>Centralised multi-server management (Hub & Spoke): <ProTag /></P>
          <UL items={[
            <><Strong>Fleet Map</Strong> - Visual representation of all connected agents with connection status</>,
            <><Strong>Agent Table</Strong> - Agent ID, Hostname, IP Address, Status (Online/Offline/Degraded), Last Heartbeat, Version</>,
            <><Strong>Status Indicators</Strong>: <span style={{ color: '#22c55e' }}>Green</span> (Online, heartbeat received within 30s), <span style={{ color: '#eab308' }}>Amber</span> (Degraded, 1 heartbeat missed), <span style={{ color: '#ef4444' }}>Red</span> (Offline, 3+ heartbeats missed)</>,
            <><Strong>Config Push</Strong> - Push configuration updates to individual agents over the mTLS channel</>,
            <><Strong>Source Filter</Strong> - The Alerts tab includes a source dropdown to filter events by agent hostname</>,
            <><Strong>Communication secured with mutual TLS (mTLS)</Strong> - fallback to plain TCP with startup warning if not configured</>,
          ]} />

          {/* ═══════════════════ DETECTION MODULES ═══════════════════ */}
          <H2 id="detection">Detection Modules</H2>

          <H3 id="waf">Web Application Firewall</H3>
          <P>BinaryWebEngine's WAF engine performs real-time HTTP request inspection using 186 regex signatures across 25 attack categories. It operates as a reverse-proxy-level filter, scoring each request against all signatures and applying configurable thresholds for blocking.</P>
          <H4>Attack Categories Covered</H4>
          <Table
            headers={['Category', 'Description', 'Signatures']}
            rows={[
              ['SQL Injection', 'SQLi payloads, blind SQLi, UNION-based, time-based', '18'],
              ['Cross-Site Scripting', 'Reflected, stored, DOM-based XSS vectors', '14'],
              ['Local/Remote File Inclusion', 'LFI/RFI path traversal and inclusion attempts', '10'],
              ['Remote Code Execution', 'RCE payloads, PHP/Java/JS code injection', '12'],
              ['Command Injection', 'OS command injection via common vectors', '9'],
              ['SSRF', 'Server-side request forgery attempts', '6'],
              ['Webshells', 'PHP/ASP/JSP/Perl/Python webshell patterns', '8'],
              ['Path Traversal', 'Directory traversal encoded and decoded', '8'],
              ['SSTI', 'Server-side template injection (Jinja2, Twig, etc.)', '6'],
              ['XXE', 'XML external entity injection', '4'],
              ['LDAP Injection', 'LDAP query manipulation', '4'],
              ['NoSQL Injection', 'MongoDB query injection patterns', '4'],
              ['HTTP Parameter Pollution', 'Parameter pollution in query strings and POST bodies', '3'],
              ['CRLF Injection', 'HTTP response splitting and log injection', '3'],
              ['Prototype Pollution', 'JavaScript prototype chain pollution', '3'],
              ['Deserialisation', 'Java/PHP/Python insecure deserialisation', '4'],
              ['JWT Attacks', 'JWT manipulation, none algorithm, key confusion', '4'],
              ['GraphQL Abuse', 'GraphQL introspection, depth attacks, batching', '4'],
              ['Open Redirect', 'Unvalidated redirect parameters', '3'],
              ['Cache Poisoning', 'Web cache poisoning via header manipulation', '3'],
              ['User Agent Anomaly', 'Suspicious user-agent strings (curl, wget, mass scanners)', '6'],
            ]}
          />
          <H4>Inspection Pipeline</H4>
          <OL items={[
            <><Strong>Blacklist Check</Strong> - IP checked against blocked list (in-memory with expiry)</>,
            <><Strong>Dynamic Block</Strong> - Intel engine auto-block check</>,
            <><Strong>AbuseIPDB Reputation</Strong> - Real-time or cached reputation lookup</>,
            <><Strong>Rate Limiting</Strong> - Per-IP request rate check (default: 60 req/min)</>,
            <><Strong>Anomaly Detection</Strong> - Payload size, request frequency, response code deviation</>,
            <><Strong>Signature Inspection</Strong> - Request URI, headers, and body matched against all 186 signatures</>,
            <><Strong>Custom Rules</Strong> - User-defined regex rules evaluated last</>,
          ]} />
          <H4>Configuration</H4>
          <Pre lang="yaml">{`waf:
  enabled: true
  rate_limit:
    requests_per_minute: 60
    block_duration: 300
  auto_block_firewall: true`}</Pre>
          <Tip>Use the <Strong>Test Console</Strong> on the WAF dashboard tab to evaluate how the engine responds to any request before deploying rule changes.</Tip>

          <H3 id="file-monitor">File Integrity Monitor</H3>
          <P>The File Monitor provides real-time and periodic file integrity verification using the Linux inotify API (via the watchdog library). It establishes SHA-256 baselines for all monitored files and detects any modification, deletion, or permission change.</P>
          <UL items={[
            <><Strong>Real-Time Detection</Strong> - Uses watchdog's inotify observer for immediate notification of file system events</>,
            <><Strong>SHA-256 Baseline</Strong> - Each file's hash, size, and permissions are stored on initial scan and compared on every change</>,
            <><Strong>Webshell Scanning</Strong> - Modified files are automatically passed to the malware scanner for webshell pattern matching</>,
            <><Strong>Specific File Monitoring</Strong> - High-value files (e.g., /etc/shadow, /etc/passwd, SSH keys) are polled on a separate schedule</>,
            <><Strong>Whitelist Support</Strong> - Exclude paths matching glob patterns</>,
          ]} />

          <H3 id="process-monitor">Process Monitor</H3>
          <P>Continuously polls the system process table (via psutil) and applies heuristic-based suspicion scoring. Detects cryptominers, reverse shells, resource hijacking, and anomalous parent-child process relationships.</P>
          <UL items={[
            <>Suspicion scoring based on: parent-child relationships, resource consumption, known malicious patterns</>,
            <>Sustained CPU/memory spikes tracked with strike counters (3 strikes = alert)</>,
            <>Cryptominer detection via command-line pattern matching (xmrig, miner, etc.)</>,
            <>Auto-kill option for high-usage processes (configurable in settings)</>,
            <>Exclusion list for trusted system processes</>,
          ]} />
          <H4>Configuration</H4>
          <Pre lang="yaml">{`processes:
  cpu_limit: 90.0
  mem_limit_mb: 1024
  auto_kill_high_usage: false
  excluded:
    - systemd
    - kthreadd
  suspicious_parents:
    - nginx
    - apache2
    - php-fpm
  suspicious_children:
    - bash
    - sh
    - nc
    - python`}</Pre>

          <H3 id="network-monitor">Network Monitor</H3>
          <P>Monitors live network connections via psutil, classifying each connection for suspicious characteristics and alerting on anomalies.</P>
          <UL items={[
            <>Real-time connection table with process-level attribution</>,
            <>Detection of: non-standard port connections, reverse shell ports, Tor exit nodes, excessive outbound connections</>,
            <>CIDR-based trust filtering for private and known-good ranges</>,
            <>Optional Scapy-based packet capture for deep inspection</>,
            <>Connection history with suspicion scoring</>,
          ]} />

          <H3 id="malware-scanner">Malware Scanner</H3>
          <P>Multi-layered file analysis engine combining regex pattern matching, YARA rules, and VirusTotal hash lookups.</P>
          <UL items={[
            <><Strong>Webshell Detection</Strong> - Regex patterns targeting PHP, ASP, JSP, Perl, and Python obfuscation techniques (base64, hex, gzinflate, etc.)</>,
            <><Strong>YARA Rules</Strong> - Loaded from <Code>config/malware_rules.yar</Code>, matching on file content and metadata</>,
            <><Strong>VirusTotal</Strong> - File hash lookup against the VirusTotal database <ProTag /></>,
            <><Strong>Quarantine</Strong> - Suspicious files are moved to the quarantine directory with cryptographic hash mapping. Quarantine supports restore and permanent deletion</>,
          ]} />

          <H3 id="login-monitor">Login Monitor</H3>
          <P>Parses log files from 9 services to detect brute force attacks, credential stuffing, and authentication anomalies in real time.</P>
          <Table
            headers={['Service', 'Log Source', 'Detection']}
            rows={[
              ['SSH', <Code>/var/log/auth.log</Code>, 'Failed/successful login attempts'],
              ['FTP', <Code>/var/log/vsftpd.log</Code>, 'Failed authentication'],
              ['MySQL', <Code>/var/log/mysql/error.log</Code>, 'Access denied events'],
              ['PostgreSQL', <Code>/var/log/postgresql/*.log</Code>, 'Password authentication failures'],
              ['Nginx', <Code>/var/log/nginx/access.log</Code>, 'POST to login paths with 401'],
              ['Apache', <Code>/var/log/apache2/access.log</Code>, 'POST to login paths with 401'],
              ['sudo', <Code>/var/log/auth.log</Code>, 'Failed sudo authentication'],
              ['cron', <Code>/var/log/syslog</Code>, 'Cron authentication errors'],
              ['Web', 'API callback', <>Web application login failures recorded via <Code>record_web_login()</Code></>],
            ]}
          />

          <H3 id="anomaly">Anomaly Detection</H3>
          <P>Two-tier machine learning system for behavioural anomaly detection:</P>
          <H4>Anomaly Detector v1 (Production)</H4>
          <UL items={[
            <><Strong>Welford's Online Algorithm</Strong> - Per-endpoint rolling mean and variance without storing all data points</>,
            <><Strong>Z-Score Detection</Strong> - Flags requests with payload size, frequency, or response code deviation beyond configurable threshold</>,
            <><Strong>Isolation Forest</Strong> - Unsupervised ML trained on feature vectors (payload size, response code, request rate). Warmup period of 100 samples before inference</>,
            <>Configurable contamination rate and warmup period</>,
          ]} />
          <H4>Anomaly Detector v2 (Advanced)</H4>
          <UL items={[
            <><Strong>LSTM Sequence Profiling</Strong> - ONNX Runtime neural network inference for per-IP request sequence analysis</>,
            <><Strong>Page-Hinkley Concept Drift</Strong> - Detects distribution shifts in request patterns over time</>,
            <>Falls back to z-score if ONNX model is unavailable</>,
          ]} />

          <H3 id="killchain">Kill Chain & MITRE ATT&CK</H3>
          <P>The Kill Chain engine maps every alert to the Lockheed Martin 7-stage intrusion kill chain and MITRE ATT&amp;CK framework (TA0001-TA0010).</P>
          <Table
            headers={['Stage', 'MITRE ID', 'Description']}
            rows={[
              ['1. Reconnaissance', 'TA0001', 'Probing, scanning, directory enumeration'],
              ['2. Weaponisation', 'TA0002', 'Payload preparation, exploit kits'],
              ['3. Delivery', 'TA0003', 'Phishing, drive-by download, WAF-evasion delivery'],
              ['4. Exploitation', 'TA0004', 'Vulnerability exploitation, code execution'],
              ['5. Installation', 'TA0005', 'Webshell upload, backdoor installation, persistence'],
              ['6. Command & Control', 'TA0006/7', 'C2 beaconing, reverse shell, tunnel setup'],
              ['7. Actions on Objectives', 'TA0008-10', 'Data exfiltration, lateral movement, destruction'],
            ]}
          />

          <H3 id="correlation">Correlation Engine</H3>
          <P>Cross-module signal correlation combines indicators from file, process, network, and WAF monitoring to detect multi-vector attacks:</P>
          <UL items={[
            <>File modification + suspicious process spawn + outbound network connection</>,
            <>WAF SQLi alert + subsequent process injection attempt</>,
            <>Multiple login failures + successful login from different IP + file access</>,
          ]} />
          <P>Correlated events fire composite alerts with higher severity than individual signals.</P>

          {/* ═══════════════════ INTELLIGENCE ═══════════════════ */}
          <H2 id="intelligence">Threat Intelligence & Analysis</H2>

          <H3 id="intel">Threat Intelligence (AbuseIPDB)</H3>
          <P>BinaryWebEngine integrates with AbuseIPDB for real-time IP reputation lookups. Every request is checked against a local cache (24-hour TTL) and the AbuseIPDB API for abuse score, category, country, ISP, and domain information.</P>
          <UL items={[
            <><Strong>CIDR Suppression</Strong> - Configure CIDR ranges to skip (trusted partners) or always look up (critical infrastructure)</>,
            <><Strong>Auto-Blocking</Strong> - When enabled, IPs exceeding the abuse score threshold are automatically blocked at the WAF and firewall level <ProTag /></>,
            <><Strong>Threshold Configuration</Strong> - Set the abuse score percentage (1-100) that triggers blocking</>,
            <><Strong>24-Hour Cache</Strong> - Reputation data is cached per IP to reduce API calls and improve response time</>,
            <><Strong>Geo/ISP Enrichment</Strong> - Each lookup provides country, ISP, domain, and abuse type categories</>,
          ]} />
          <H4>Setup</H4>
          <OL items={[
            <>Obtain an API key from <a href="https://www.abuseipdb.com" target="_blank" rel="noreferrer" style={{ color: '#800020' }}>AbuseIPDB</a></>,
            <>In the dashboard, go to <Strong>Settings &rarr; API Keys</Strong> and enter the key</>,
            <>Or set <Code>ABUSEIPDB_API_KEY</Code> as an environment variable</>,
            <>Configure auto-block threshold in <Strong>Settings &rarr; Intel</Strong></>,
          ]} />

          <H3 id="ai-assistant">Analysis Assistant <ProTag /></H3>
          <P>The Analysis Assistant provides LLM-powered security analysis using NVIDIA, Google Gemini, or OpenAI models. All responses are grounded in real engine data to prevent hallucinations.</P>
          <H4>Capabilities</H4>
          <UL items={[
            <><Strong>Alert Explanation</Strong> - One-click analysis of any alert with context from related events, kill chain status, process trees, and known WAF signatures</>,
            <><Strong>Conversational Chat</Strong> - Full-system chat that can query live data: alerts, blocked IPs, WAF events, traffic statistics, intelligence data, process/network state</>,
            <><Strong>Tool Calling</Strong> - Supported tools: get_alerts, get_login_events, get_waf_events, get_traffic, get_intel, get_processes, get_network, get_hardening, get_audit, get_custom_rules, get_fleet</>,
            <><Strong>Action Suggestions</Strong> - The assistant can suggest actions (block IP, resolve alert, unblock IP, add directory) rendered as clickable buttons</>,
            <><Strong>Grounding Verification</Strong> - All responses are post-processed to verify that any IPs, file paths, or timestamps mentioned exist in the provided context data</>,
          ]} />
          <H4>Provider Configuration</H4>
          <Table
            headers={['Provider', 'API Key Config', 'Models']}
            rows={[
              ['NVIDIA', <><Code>ai.api_key</Code> or <Code>AI_API_KEY</Code></>, 'llama-3.2-3b-instruct (fast), mistral-small-4-119b (heavy)'],
              ['Google Gemini', <><Code>ai.gemini_api_keys</Code> or <Code>GEMINI_API_KEY</Code></>, 'gemini-2.0-flash (fast), gemini-2.0-pro (heavy)'],
              ['OpenAI', <><Code>ai.api_key</Code> or <Code>AI_API_KEY</Code></>, 'gpt-4o-mini (fast), gpt-4o (heavy)'],
            ]}
          />
          <Note>The Analysis Assistant requires a valid license feature key (<Code>ai_assistant</Code>) and a configured API key. All API keys are stored encrypted in the database and can be updated at runtime without restarting the engine.</Note>

          <H3 id="false-positive">False Positive Advisor <ProTag /></H3>
          <P>Reduces alert fatigue by scoring each alert for false positive likelihood:</P>
          <UL items={[
            <><Strong>Heuristic Scoring</Strong> - Considers: same-IP alert frequency, known scanner ASNs, safe port usage, process whitelist matches, WAF signature false-positive reputation</>,
            <><Strong>LLM Enhancement</Strong> - When the Analysis Assistant is active, a full LLM analysis is performed for each alert with natural-language explanation of the score</>,
            <><Strong>Batch Scoring</Strong> - Score all unresolved alerts at once from the Alerts tab</>,
            <><Strong>Score Persistence</Strong> - Scores are cached in the database so they are not recalculated</>,
          ]} />

          <H3 id="ja3">JA3 Fingerprinting</H3>
          <P>Passive TLS fingerprinting captures JA3 hashes from network traffic to identify known malicious TLS clients, C2 frameworks, and automated attack tools.</P>
          <UL items={[
            <>Captures JA3 hashes via Scapy or tshark packet capture</>,
            <>Matches against a built-in database of known C2 profiles</>,
            <>Alerts on previously unseen or suspicious fingerprints</>,
          ]} />

          {/* ═══════════════════ MANAGEMENT ═══════════════════ */}
          <H2 id="management">Enterprise Management</H2>

          <H3 id="fleet">Fleet Management <ProTag /></H3>
          <P>The Hub & Spoke fleet architecture enables centralised monitoring of multiple servers from a single BinaryWebEngine dashboard.</P>
          <H4>Setup Guide</H4>
          <P><Strong>Hub (one per fleet):</Strong></P>
          <Pre lang="bash">{`# Generate certificates (first time only)
./scripts/gen_fleet_certs.sh --agents web-01,db-01,api-01

# Start hub
export BWE_AGENT_MODE=hub
./bwe`}</Pre>
          <P><Strong>Agent (each worker):</Strong></P>
          <Pre lang="bash">{`export BWE_AGENT_MODE=agent
export BWE_HUB_HOST=10.0.0.1
export BWE_AGENT_CERT=certs/web-01.pem
./bwe`}</Pre>
          <UL items={[
            <><Strong>Heartbeat</Strong> - Agents send signed heartbeats every 30s. The hub marks agents offline after 3 missed heartbeats (90s)</>,
            <><Strong>Config Push</Strong> - Push configuration diffs to individual agents from the Fleet tab. Agents apply changes live or queue restart-required flags</>,
            <><Strong>Security</Strong> - Mutual TLS with per-agent client certificates. Falls back to plain TCP with a warning if <Code>fleet.mtls_enabled: false</Code></>,
            <><Strong>Source Filter</Strong> - The Alerts tab "All sources" dropdown lets you filter by agent hostname</>,
          ]} />

          <H3 id="siem">SIEM Forwarding <ProTag /></H3>
          <P>Forward alerts to external SIEM platforms in standard formats:</P>
          <UL items={[
            <><Strong>Formats</Strong> - CEF (Common Event Format), JSON, LEEF</>,
            <><Strong>Transports</Strong> - TLS, UDP, TCP</>,
            <><Strong>Compatibility</Strong> - Splunk, ELK Stack, QRadar, ArcSight, Sumo Logic</>,
            <>Configure in <Strong>Settings &rarr; Engine</Strong> or via the API</>,
          ]} />

          <H3 id="soar">SOAR & Notifications <ProTag /></H3>
          <P>Multi-channel alert notifications with HMAC-signed webhook verification:</P>
          <UL items={[
            <><Strong>Channels</Strong> - Discord (rich embeds), Telegram (HTML messages), Slack</>,
            <><Strong>SOAR Platforms</Strong> - Tines, Shuffle, n8n, PagerDuty, Splunk SOAR</>,
            <><Strong>Verification</Strong> - Webhook payloads are signed with <Code>X-BWE-Signature</Code> header using HMAC-SHA256</>,
            <><Strong>Severity Filtering</Strong> - Configurable minimum severity threshold for notifications</>,
            <><Strong>Per-Rule Webhooks</Strong> - Alert Rules tab allows custom webhook URLs per rule</>,
          ]} />

          <H3 id="compliance">Compliance Reports <ProTag /></H3>
          <P>Auto-generated executive reports for CISOs, auditors, and compliance reviews:</P>
          <UL items={[
            <><Strong>HTML Reports</Strong> - Professional dark-themed layout with 8 sections</>,
            <><Strong>PDF Export</Strong> - High-quality PDF via WeasyPrint engine</>,
            <><Strong>Report Sections</Strong>: Executive Summary, Security Scorecard (8 metrics), Incident Breakdown by Severity and Module, WAF Analysis with attack type distribution, Top Threat Actors by IP, Critical and High Severity Alerts table, Recommendations, Methodology</>,
            <><Strong>Scheduling</Strong> - Auto-generate on configurable interval (default 7 days)</>,
            <>Access from the Reports tab or <Code>GET /report/compliance</Code></>,
          ]} />

          <H3 id="config">Configuration</H3>
          <P>BinaryWebEngine is configured via a central YAML file. All settings can be modified at runtime through the Settings modal or API endpoints.</P>
          <Pre lang="yaml">{`engine:
  name: BinaryWebEngine
  version: 1.0.0
  log_level: INFO

api:
  host: 0.0.0.0
  port: 8000
  auth:
    admin_user: admin
    admin_password: ""
    secret_key: change-in-production

database:
  path: security_engine.db
  retention_days: 90

waf:
  enabled: true
  rate_limit:
    requests_per_minute: 60
    block_duration: 300
  auto_block_firewall: true

intel:
  enabled: true
  abuse_threshold: 25
  auto_block_enabled: false
  auto_block_threshold: 75

monitoring:
  directories:
    - uploads
    - tmp
  hash_algorithm: sha256
  scan_on_modify: true

login_monitor:
  brute_force_threshold: 5
  brute_force_window_seconds: 60
  block_duration_seconds: 3600
  poll_interval: 10`}</Pre>

          {/* ═══════════════════ OPERATIONS ═══════════════════ */}
          <H2 id="operations">Operations</H2>

          <H3 id="api">API Reference</H3>
          <P>BinaryWebEngine exposes a REST API for integration with existing tools and workflows. All endpoints require authentication (session cookie or API key).</P>

          <H4>Authentication & System</H4>
          <Table headers={['Method', 'Path', 'Purpose']} rows={[
            [<Code>GET</Code>, <Code>/status</Code>, 'Engine status, component health, uptime'],
            [<Code>GET</Code>, <Code>/health</Code>, 'Liveness check (returns 200)'],
            [<Code>GET</Code>, <Code>/license</Code>, 'License status and enabled features'],
            [<Code>POST</Code>, <Code>/license/apply</Code>, 'Apply a license key'],
            [<Code>GET</Code>, <Code>/auth/me</Code>, 'Current user info and role'],
            [<Code>GET</Code>, <Code>/auth/users</Code>, 'List users (admin only)'],
          ]} />

          <H4>Alerts & Incidents</H4>
          <Table headers={['Method', 'Path', 'Purpose']} rows={[
            [<Code>GET</Code>, <Code>/alerts</Code>, 'List alerts (filterable: severity, module, source, search, limit)'],
            [<Code>GET</Code>, <Code>/alerts/sources</Code>, 'Distinct VPS/agent hostnames'],
            [<Code>POST</Code>, <Code>/alerts/resolve</Code>, 'Resolve an alert by ID'],
            [<Code>POST</Code>, <Code>/alerts/silence</Code>, 'Silence alerts matching rules'],
            [<Code>DELETE</Code>, <Code>{'/alerts/silence/{id}'}</Code>, 'Remove silence rule'],
          ]} />

          <H4>WAF</H4>
          <Table headers={['Method', 'Path', 'Purpose']} rows={[
            [<Code>GET</Code>, <Code>/waf/stats</Code>, 'WAF statistics and metrics'],
            [<Code>GET</Code>, <Code>/waf/blocked</Code>, 'List currently blocked IPs'],
            [<Code>POST</Code>, <Code>/waf/block</Code>, 'Block an IP address'],
            [<Code>DELETE</Code>, <Code>{'/waf/block/{ip}'}</Code>, 'Unblock an IP'],
            [<Code>POST</Code>, <Code>/waf/inspect</Code>, 'Test a request against WAF signatures'],
            [<Code>GET</Code>, <Code>/waf/custom-rules</Code>, 'List custom WAF rules'],
            [<Code>POST</Code>, <Code>/waf/custom-rules</Code>, 'Create custom WAF rule'],
          ]} />

          <H4>Analysis</H4>
          <Table headers={['Method', 'Path', 'Purpose']} rows={[
            [<Code>GET</Code>, <Code>/ai/status</Code>, 'Analysis assistant readiness and model info'],
            [<Code>POST</Code>, <Code>{'/ai/explain/{id}'}</Code>, 'Generate an explanation for an alert'],
            [<Code>GET</Code>, <Code>{'/ai/explain/{id}'}</Code>, 'Retrieve cached explanation'],
            [<Code>POST</Code>, <Code>/ai/chat</Code>, 'Conversational chat with system context'],
            [<Code>GET</Code>, <Code>{'/ai/fp/{id}'}</Code>, 'False positive score for an alert'],
            [<Code>POST</Code>, <Code>/ai/fp/batch</Code>, 'Batch score unscored alerts'],
          ]} />

          <H4>Real-Time</H4>
          <Table headers={['Method', 'Path', 'Purpose']} rows={[
            [<Code>GET</Code>, <Code>/events</Code>, 'Server-Sent Events stream (?topics=alerts,stats,processes,network,logins)'],
            [<Code>WS</Code>, <Code>/ws</Code>, 'WebSocket real-time push (stats every 15s)'],
          ]} />

          <H4>Fleet</H4>
          <Table headers={['Method', 'Path', 'Purpose']} rows={[
            [<Code>GET</Code>, <Code>/fleet/status</Code>, <><span>Fleet status summary</span><ProTag /></>],
            [<Code>GET</Code>, <Code>/fleet/agents</Code>, <><span>List connected agents</span><ProTag /></>],
            [<Code>PUT</Code>, <Code>{'/fleet/agent/{id}/config'}</Code>, <><span>Push config to agent</span><ProTag /></>],
          ]} />

          <H3 id="env">Environment Variables</H3>
          <Table
            headers={['Variable', 'Purpose', 'Default']}
            rows={[
              [<Code>BWE_ADMIN_PASSWORD</Code>, 'Admin login password', 'Auto-generated (random)'],
              [<Code>BWE_SECRET_KEY</Code>, 'Session signing key', 'Auto-generated (ephemeral)'],
              [<Code>BWE_DB_TYPE</Code>, 'Database backend', <Code>sqlite</Code>],
              [<Code>BWE_PG_DSN</Code>, 'PostgreSQL connection string', 'Not set'],
              [<Code>BWE_AGENT_MODE</Code>, 'Fleet mode: standalone, agent, hub', <Code>standalone</Code>],
              [<Code>BWE_HUB_HOST</Code>, 'Hub IP address (agent mode)', 'Not set'],
              [<Code>BWE_AUDIT_HMAC_KEY</Code>, 'Audit log HMAC signing key', <Code>change-me-in-production</Code>],
              [<Code>AI_API_KEY</Code>, 'NVIDIA/OpenAI API key', 'Not set'],
              [<Code>GEMINI_API_KEY</Code>, 'Google Gemini API key', 'Not set'],
              [<Code>ABUSEIPDB_API_KEY</Code>, 'AbuseIPDB API key', 'Not set'],
              [<Code>VT_API_KEY</Code>, 'VirusTotal API key', 'Not set'],
              [<Code>BWE_FREE_BUILD</Code>, 'Bypass all license gates (public build)', 'Not set'],
            ]}
          />

          <H3 id="deployment">Deployment</H3>
          <H4>Single-File Executable (Recommended)</H4>
          <Pre lang="bash">{`# Run directly (no dependencies needed)
./bwe

# Run with demo data
./bwe --demo

# Run with custom config
./bwe --config /path/to/custom.yaml`}</Pre>
          <Tip>The executable contains Python, all dependencies, the dashboard, and the vault binary. Nothing else needs to be installed on the target machine.</Tip>

          <H4>systemd Service</H4>
          <Pre lang="bash">{`sudo cp scripts/bwe-deploy /etc/systemd/system/binarywebengine.service
sudo systemctl daemon-reload
sudo systemctl enable --now binarywebengine`}</Pre>

          <H4>Docker Compose</H4>
          <Pre lang="yaml">{`version: '3.8'
services:
  bwe:
    image: binaryshielders/bwe:latest
    ports:
      - "8000:8000"
      - "9001:9001"
    volumes:
      - ./data:/data
      - ./config:/config
    environment:
      - BWE_ADMIN_PASSWORD=your-secure-password
      - BWE_SECRET_KEY=your-secret-key
    restart: unless-stopped`}</Pre>

          <H4>Nginx Reverse Proxy (SSL)</H4>
          <Pre lang="nginx">{`server {
    listen 443 ssl;
    server_name security.example.com;
    ssl_certificate /etc/letsencrypt/live/security.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/security.example.com/privkey.pem;
    location / { proxy_pass http://127.0.0.1:8000; }
    location /ws {
        proxy_pass http://127.0.0.1:8000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}`}</Pre>

          <H3 id="troubleshooting">Troubleshooting</H3>
          {[
            {
              q: 'Dashboard shows "SYSTEM SECURE No alerts"',
              a: <><P>Normal empty state. Run <Code>./bwe --demo</Code> to inject demo events. Check that detection modules are enabled in Settings &rarr; Engine.</P></>,
            },
            {
              q: 'Analysis Assistant returns "analysis unavailable"',
              a: <><P>Ensure: (1) an analysis provider API key is configured in Settings &rarr; API Keys, (2) a license key with the <Code>ai</Code> feature is applied in Settings &rarr; Subscription. Verify API key validity against the provider's endpoint.</P></>,
            },
            {
              q: 'WAF not blocking requests',
              a: <><P>Check: (1) WAF is enabled in config/Settings, (2) the attack type is covered by the signature database, (3) rate limiting is not masking the issue. Use the Test Console on the WAF tab to verify signature matching.</P></>,
            },
            {
              q: 'Fleet agent shows as offline',
              a: <><P>Check: (1) agent process is running, (2) network connectivity between agent and hub (port 9001), (3) mTLS certificates are valid. Heartbeat timeout is 90s (3 missed intervals).</P></>,
            },
            {
              q: 'Login monitor not detecting events',
              a: <><P>Verify: (1) log files exist at the configured paths, (2) the bwe process has read permission on those files, (3) the service's log format matches the expected regex patterns. Enable debug logging (<Code>BWE_ENV=development</Code>) to see raw log parsing output.</P></>,
            },
            {
              q: 'Forgot admin password',
              a: <><P>Check <Code>credentials.txt</Code> in the working directory. If deleted, stop the engine, delete <Code>security_engine.db</Code>, and restart. Alternatively, set the <Code>BWE_ADMIN_PASSWORD</Code> environment variable before starting.</P></>,
            },
          ].map((item, i) => (
            <SectionCard key={i}>
              <H4>{item.q}</H4>
              {item.a}
            </SectionCard>
          ))}

          <H3 id="license-system">Licensing System</H3>
          <P>BinaryWebEngine uses an HMAC-SHA256 signed license key system to gate premium features. The public build includes all features unlocked. The licensed build requires a valid key for premium functionality.</P>
          <H4>Premium Features</H4>
          <Table
            headers={['Code', 'Feature', 'Gated Endpoints']}
            rows={[
              [<Code>ai</Code>, 'Analysis Assistant', 'Alert explanations, chat, false positive scoring, chat widget'],
              [<Code>blk</Code>, 'Auto IP Block', 'Firewall-level automated blocking based on abuse score'],
              [<Code>rep</Code>, 'IP Reputation', 'AbuseIPDB lookups, threat intelligence dashboard'],
              [<Code>vt</Code>, 'VirusTotal', 'File hash lookups via VirusTotal API'],
              [<Code>siem</Code>, 'SIEM Forwarding', 'CEF/JSON/LEEF log forwarding'],
              [<Code>soar</Code>, 'SOAR Webhook', 'SOAR platform notifications'],
              [<Code>mh</Code>, 'Multi-Host Fleet', 'Hub & Spoke fleet management'],
            ]}
          />
          <H4>Key Format</H4>
          <Pre lang="text">{`BWE-XXXXXXXX-features-days-HMAC`}</Pre>
          <UL items={[
            <><Code>XXXXXXXX</Code> = 8-char random hex UID (unique per key)</>,
            <><Code>features</Code> = comma-separated codes (e.g., <Code>ai,siem,soar,mh</Code>)</>,
            <><Code>days</Code> = validity in days (1-3650)</>,
            <><Code>HMAC</Code> = first 16 hex chars of SHA256-HMAC of payload</>,
          ]} />
          <Note>License keys are validated using an embedded vault binary. The signing secret is compiled into the vault binary, not the main engine executable. This prevents key forgery even if the main executable is decompiled.</Note>

          {/* Bottom spacer so last section scrolls into view cleanly */}
          <div style={{ height: '80px' }} />

        </main>
      </div>

      {/* Back-to-top button */}
      <button
        className={`docs-backtop${showBackTop ? ' visible' : ''}`}
        onClick={() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 15l-6-6-6 6"/>
        </svg>
      </button>
    </>
  );
}
