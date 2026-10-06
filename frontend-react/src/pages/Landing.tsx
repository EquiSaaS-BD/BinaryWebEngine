import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';

export default function Landing() {
  const staggerContainer = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } }
  };

  const features = [
    {
      icon: '🛡',
      title: 'Web Application Firewall',
      desc: '186 regex signatures across 25 attack categories with real-time payload inspection, rate limiting, and automatic IP blocking.',
    },
    {
      icon: '📁',
      title: 'File Integrity Monitor',
      desc: 'SHA-256 baselines with inotify real-time change detection. Automatic webshell scanning on every file modification.',
    },
    {
      icon: '🔬',
      title: 'ML Anomaly Detection',
      desc: 'Isolation Forest, Welford rolling statistics, LSTM sequence profiling, and Page-Hinkley concept drift detection.',
    },
    {
      icon: '🗺',
      title: 'Kill Chain & MITRE',
      desc: 'Lockheed Martin 7-stage kill chain reconstruction with full MITRE ATT&CK mapping (TA0001-TA0010) per IP.',
    },
    {
      icon: '🌐',
      title: 'Threat Intelligence',
      desc: 'AbuseIPDB reputation lookups with CIDR suppression and configurable automatic blocking thresholds.',
    },
    {
      icon: '🖥',
      title: 'Process & Network Monitor',
      desc: 'Live connection tables with cryptominer detection, reverse shell identification, and suspicious process trees.',
    },
    {
      icon: '🔗',
      title: 'Fleet Management',
      desc: 'Hub & Spoke architecture with mutual TLS. Centrally monitor a fleet of Linux servers from a single dashboard.',
    },
    {
      icon: '📊',
      title: 'Compliance Reports',
      desc: 'Auto-generated executive reports with 8 sections, PDF export, CIS benchmark hardening audits, and SOAR webhook notifications.',
    },
  ];

  return (
    <>
      <Helmet>
        <title>BinaryWebEngine | Enterprise Linux Security Monitoring Platform</title>
        <meta name="description" content="BinaryWebEngine is an all-in-one enterprise security monitoring platform for Linux. WAF, HIDS, NIDS, ML anomaly detection, kill chain reconstruction, fleet management and threat intelligence in a single engine." />
        <meta property="og:title" content="BinaryWebEngine | Enterprise Linux Security Monitoring" />
        <meta property="og:description" content="All-in-one security monitoring: WAF, HIDS, NIDS, ML anomaly detection, MITRE ATT&CK kill chain, fleet management and threat intelligence for Linux servers." />
        <meta property="og:image" content="https://binarywebengine.web.app/static/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="BinaryWebEngine | Enterprise Linux Security Monitoring" />
        <meta name="twitter:description" content="All-in-one security monitoring: WAF, HIDS, NIDS, ML anomaly detection, MITRE ATT&CK kill chain, fleet management and threat intelligence for Linux servers." />
        <meta name="twitter:image" content="https://binarywebengine.web.app/static/og-image.png" />
      </Helmet>

      {/* ── Hero ── */}
      <motion.header
        className="hero"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={fadeInUp} className="tag">Closed Source &middot; Enterprise &middot; v1.0</motion.div>
        <motion.h1 variants={fadeInUp}>
          All-in-One Enterprise Security Monitoring for Linux
        </motion.h1>
        <motion.p variants={fadeInUp}>
          WAF, HIDS, NIDS, ML anomaly detection, kill chain reconstruction, and threat intelligence - bundled into a single deployable engine with a real-time dashboard. No SIEM appliance. No third-party connectors.
        </motion.p>
        <motion.div variants={fadeInUp} className="hero-actions">
          <a href="/dashboard" className="btn-primary">View Live Demo</a>
          <a href="/docs" className="btn-outline">Read Documentation</a>
        </motion.div>
      </motion.header>

      {/* ── Dashboard preview ── */}
      <motion.div
        className="dashboard-preview"
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <div className="preview-inner"></div>
      </motion.div>

      {/* ── Key stats ── */}
      <section id="stats" style={{ borderTop: '1px solid var(--blk-brd)', borderBottom: '1px solid var(--blk-brd)', background: 'rgba(255,255,255,0.01)' }}>
        <motion.div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0', textAlign: 'center' }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          {[
            { value: '186', label: 'WAF Signatures' },
            { value: '25', label: 'Attack Categories' },
            { value: '9', label: 'Login Services' },
            { value: '14', label: 'Dashboard Tabs' },
            { value: '7', label: 'Kill Chain Stages' },
            { value: '2-tier', label: 'ML Detection' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '28px 20px', borderRight: i < 5 ? '1px solid var(--blk-brd)' : 'none' }}>
              <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--maroon-accent)', letterSpacing: '-0.02em' }}>{s.value}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Features ── */}
      <section id="features">
        <motion.h2
          className="section-title"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Complete Security Coverage
        </motion.h2>
        <motion.p
          className="section-desc"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          BinaryWebEngine replaces an entire security stack with a single Linux executable. Deploy in minutes, monitor in real time.
        </motion.p>
        <motion.div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ staggerChildren: 0.06 }}
        >
          {features.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--blk-brd)',
                borderRadius: '12px',
                padding: '24px',
                transition: 'all 0.3s',
              }}
              whileHover={{ borderColor: 'var(--maroon-accent)', y: -4 } as never}
            >
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>{f.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-pr)', marginBottom: '8px' }}>{f.title}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-sec)', lineHeight: 1.6 }}>{f.desc}</div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Deployment ── */}
      <section id="deploy" style={{ background: 'rgba(255,255,255,0.01)', borderTop: '1px solid var(--blk-brd)', borderBottom: '1px solid var(--blk-brd)' }}>
        <motion.h2
          className="section-title"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          Deploy in Seconds
        </motion.h2>
        <motion.p
          className="section-desc"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          A single self-contained executable. Python, dependencies, dashboard, and vault binary - all bundled. Nothing extra to install.
        </motion.p>
        <motion.div
          style={{ maxWidth: '640px', margin: '0 auto' }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div style={{ background: '#0d1117', border: '1px solid #1c2333', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1c2333', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></div>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308' }}></div>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e' }}></div>
              <span style={{ marginLeft: '8px', fontSize: '11px', color: '#4a5568', fontFamily: 'monospace' }}>bash</span>
            </div>
            <pre style={{ margin: 0, padding: '20px', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: '#94a3b8', lineHeight: 1.8, overflowX: 'auto' }}>
              <span style={{ color: '#4a5568' }}># Extract the package from BinaryShielders</span>{'\n'}
              <span style={{ color: '#4a5568' }}>{'# and deploy to your Linux server'}</span>{'\n\n'}
              <span style={{ color: '#22c55e' }}>chmod</span> +x bwe{'\n'}
              <span style={{ color: '#22c55e' }}>./bwe</span> --demo{'\n\n'}
              <span style={{ color: '#4a5568' }}># Dashboard: http://localhost:8000</span>{'\n'}
              <span style={{ color: '#4a5568' }}># Credentials: credentials.txt</span>
            </pre>
          </div>
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/docs#quickstart" className="btn-primary">Quick Start Guide</a>
            <a href="/docs#deployment" className="btn-outline">Deployment Options</a>
          </div>
        </motion.div>
      </section>

      {/* ── System Requirements ── */}
      <section id="requirements">
        <motion.h2
          className="section-title"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          System Requirements
        </motion.h2>
        <motion.div
          style={{ maxWidth: '700px', margin: '0 auto', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--blk-brd)', borderRadius: '12px', overflow: 'hidden' }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          {[
            { label: 'Operating System', value: 'Linux (Ubuntu 20.04+, Debian 11+, RHEL 8+)' },
            { label: 'CPU', value: '1 vCPU minimum, 2+ vCPU recommended' },
            { label: 'RAM', value: '512 MB minimum, 2 GB+ recommended' },
            { label: 'Disk', value: '500 MB free minimum, 5 GB+ for logs and reports' },
            { label: 'Python', value: '3.10+ (3.11+ recommended)' },
            { label: 'Database', value: 'SQLite embedded (PostgreSQL 14+ for fleet deployments)' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', padding: '14px 20px', borderBottom: i < 5 ? '1px solid var(--blk-brd)' : 'none', gap: '16px' }}>
              <div style={{ width: '160px', flexShrink: 0, fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>{r.label}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-sec)' }}>{r.value}</div>
            </div>
          ))}
        </motion.div>
      </section>
    </>
  );
}
