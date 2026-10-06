import { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setStatus('submitting');
    try {
      await addDoc(collection(db, 'contact_messages'), {
        name,
        email,
        message,
        createdAt: serverTimestamp(),
        read: false
      });
      setStatus('success');
      setName('');
      setEmail('');
      setMessage('');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', background: 'rgba(20,20,20,0.8)', padding: '30px', borderRadius: '12px', border: '1px solid #333' }}>
      {status === 'success' ? (
        <div style={{ color: '#4CAF50', textAlign: 'center', padding: '20px' }}>
          <h3>Message Sent!</h3>
          <p>We will get back to you soon.</p>
          <button onClick={() => setStatus('idle')} className="btn-outline" style={{ marginTop: '15px' }}>Send Another</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input
            type="text"
            placeholder="Your Name"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: '#fff' }}
          />
          <input
            type="email"
            placeholder="Your Email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: '#fff' }}
          />
          <textarea
            placeholder="Your Message"
            required
            rows={5}
            value={message}
            onChange={e => setMessage(e.target.value)}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: '#fff', resize: 'vertical' }}
          ></textarea>
          <button type="submit" disabled={status === 'submitting'} className="btn-primary" style={{ marginTop: '10px' }}>
            {status === 'submitting' ? 'Sending...' : 'Send Message'}
          </button>
          {status === 'error' && <p style={{ color: 'red', marginTop: '10px' }}>Error sending message. Please try again.</p>}
        </form>
      )}
    </div>
  );
}
