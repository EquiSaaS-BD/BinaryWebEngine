import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
  {
    q: "How does the Live Analyst Support work?",
    a: "Our embedded live analysts have real-time access to your system data to provide intelligent answers and explain complex security alerts."
  },
  {
    q: "What is the tech stack?",
    a: "We use React for the frontend, Cloudflare Workers for the serverless API, and D1 for edge-distributed relational database storage."
  },
  {
    q: "How does the kill chain work?",
    a: "We automatically map correlated events and alerts to the MITRE ATT&CK framework, showing you the exact progression of a threat actor."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    if (openIndex === index) {
      setOpenIndex(null);
    } else {
      setOpenIndex(index);
    }
  };

  return (
    <section id="faq" style={{ minHeight: '80vh', maxWidth: '800px', margin: '0 auto' }}>
      <Helmet><title>FAQ | BinaryWebEngine</title></Helmet>
      
      <motion.h2 
        className="section-title"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Frequently Asked Questions
      </motion.h2>
      <motion.p 
        className="section-desc"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Everything you need to know about the platform and how it works.
      </motion.p>
      
      <div style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {faqs.map((faq, i) => (
          <motion.div 
            key={i} 
            className="faq-item"
            style={{ cursor: 'pointer', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '20px', borderRadius: '12px' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => toggle(i)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="faq-q" style={{ marginBottom: 0, fontSize: '18px', fontWeight: 600 }}>{faq.q}</div>
              <div style={{ color: 'var(--maroon-lt)', fontSize: '24px' }}>
                {openIndex === i ? '−' : '+'}
              </div>
            </div>
            
            <AnimatePresence>
              {openIndex === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0, marginTop: 0 }}
                  animate={{ height: 'auto', opacity: 1, marginTop: '16px' }}
                  exit={{ height: 0, opacity: 0, marginTop: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="faq-a" style={{ color: 'var(--text-sec)', lineHeight: '1.6' }}>{faq.a}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
