// Vanila JS Chatbot Widget
(function() {
  // Inject CSS
  const style = document.createElement('style');
  style.innerHTML = `
    #bwe-chatbot-btn {
      position: fixed; bottom: 30px; right: 30px;
      width: 60px; height: 60px; border-radius: 30px;
      background: linear-gradient(135deg, #8B0000, #A52A2A);
      color: white; border: none; cursor: pointer;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5); z-index: 10000;
      display: flex; align-items: center; justify-content: center;
      font-size: 24px; transition: transform 0.2s;
    }
    #bwe-chatbot-btn:hover { transform: scale(1.05); }
    #bwe-chatbot-modal {
      position: fixed; bottom: 100px; right: 30px;
      width: 350px; height: 500px; background: #161616;
      border-radius: 16px; border: 1px solid #333;
      box-shadow: 0 10px 40px rgba(0,0,0,0.8); z-index: 10000;
      display: none; flex-direction: column; overflow: hidden;
      font-family: 'Inter', sans-serif;
    }
    #bwe-chatbot-header {
      padding: 15px; background: #080808; border-bottom: 1px solid #333;
      font-weight: bold; color: white; display: flex; justify-content: space-between;
    }
    #bwe-chatbot-close { cursor: pointer; color: #888; }
    #bwe-chatbot-close:hover { color: white; }
    #bwe-chatbot-messages {
      flex: 1; padding: 15px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 10px;
    }
    .bwe-msg {
      padding: 10px 14px; border-radius: 12px;
      max-width: 85%; font-size: 14px; white-space: pre-wrap; color: white;
    }
    .bwe-msg.bot { align-self: flex-start; background: #333; }
    .bwe-msg.user { align-self: flex-end; background: #A52A2A; }
    #bwe-chatbot-form {
      display: flex; padding: 10px; background: #080808; border-top: 1px solid #333;
    }
    #bwe-chatbot-input {
      flex: 1; padding: 10px; background: #111; border: 1px solid #333;
      border-radius: 8px; color: white; outline: none;
    }
    #bwe-chatbot-submit {
      margin-left: 10px; padding: 0 15px; background: #A52A2A;
      border: none; border-radius: 8px; color: white; cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  // Inject HTML
  const container = document.createElement('div');
  container.innerHTML = `
    <button id="bwe-chatbot-btn">💬</button>
    <div id="bwe-chatbot-modal">
      <div id="bwe-chatbot-header">
        <span>Live Analyst Support</span>
        <span id="bwe-chatbot-close">✖</span>
      </div>
      <div id="bwe-chatbot-messages">
        <div class="bwe-msg bot">Hi! I am Alex, a Live Support Analyst here at BinaryShielders. How can I help you with the BinaryWebEngine platform today?</div>
      </div>
      <form id="bwe-chatbot-form">
        <input type="text" id="bwe-chatbot-input" placeholder="Ask a question..." autocomplete="off"/>
        <button type="submit" id="bwe-chatbot-submit">Send</button>
      </form>
    </div>
  `;
  document.body.appendChild(container);

  const btn = document.getElementById('bwe-chatbot-btn');
  const modal = document.getElementById('bwe-chatbot-modal');
  const closeBtn = document.getElementById('bwe-chatbot-close');
  const form = document.getElementById('bwe-chatbot-form');
  const input = document.getElementById('bwe-chatbot-input');
  const messagesDiv = document.getElementById('bwe-chatbot-messages');

  let isOpen = false;
  const toggleModal = () => {
    isOpen = !isOpen;
    modal.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) input.focus();
  };

  btn.addEventListener('click', toggleModal);
  closeBtn.addEventListener('click', toggleModal);

  const addMessage = (text, role) => {
    const div = document.createElement('div');
    div.className = 'bwe-msg ' + role;
    div.textContent = text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    
    addMessage(text, 'user');
    input.value = '';
    
    const loadingId = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = loadingId;
    loadingDiv.className = 'bwe-msg bot';
    loadingDiv.textContent = 'Typing...';
    loadingDiv.style.opacity = '0.5';
    messagesDiv.appendChild(loadingDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    try {
      const res = await fetch('https://bwe-api.k-makmanhossain.workers.dev/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      document.getElementById(loadingId).remove();
      addMessage(data.reply || 'Sorry, I encountered an error.', 'bot');
    } catch (err) {
      document.getElementById(loadingId).remove();
      addMessage('Sorry, our support system is currently experiencing issues.', 'bot');
    }
  });
})();
