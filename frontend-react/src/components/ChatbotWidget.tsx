import { useState } from 'react';


export default function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user' | 'bot', text: string}[]>([
    { role: 'bot', text: 'Hi! I am Alex, a Live Support Analyst here at BinaryShielders. How can I help you with the BinaryWebEngine platform today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (e: any) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('https://bwe-api.k-makmanhossain.workers.dev/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', text: data.reply || 'Sorry, I am having trouble connecting to our systems right now.' }]);
    } catch (err: any) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'bot', text: 'Sorry, our support system is currently experiencing issues. Please try again later.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed', bottom: '30px', right: '30px',
          width: '60px', height: '60px', borderRadius: '30px',
          background: 'linear-gradient(135deg, #8B0000, #A52A2A)',
          color: 'white', border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '24px'
        }}
      >
        💬
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed', bottom: '100px', right: '30px',
          width: '350px', height: '500px', background: '#161616',
          borderRadius: '16px', border: '1px solid #333',
          boxShadow: '0 10px 40px rgba(0,0,0,0.8)', zIndex: 1000,
          display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ padding: '15px', background: '#080808', borderBottom: '1px solid #333', fontWeight: 'bold' }}>
            Live Analyst Support
          </div>
          <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ 
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? '#A52A2A' : '#333',
                padding: '10px 14px', borderRadius: '12px',
                maxWidth: '85%', fontSize: '14px', whiteSpace: 'pre-wrap'
              }}>
                {m.text}
              </div>
            ))}
            {isLoading && <div style={{ alignSelf: 'flex-start', color: '#888', fontSize: '12px' }}>Typing...</div>}
          </div>
          <form onSubmit={handleSend} style={{ display: 'flex', padding: '10px', background: '#080808', borderTop: '1px solid #333' }}>
            <input 
              type="text" 
              value={input} 
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a question..."
              style={{ flex: 1, padding: '10px', background: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }}
            />
            <button type="submit" style={{ marginLeft: '10px', padding: '0 15px', background: '#A52A2A', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer' }}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
