import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import ChatbotWidget from './ChatbotWidget';
import '../pages/Landing.css'; // Global styling shared across pages

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="landing-page">
      <div className="bg-grid"></div>
      <div className="bg-glow"></div>
      
      <Navbar />
      
      <main style={{ minHeight: '100vh', paddingTop: '80px', paddingBottom: '40px' }}>
        {children}
      </main>

      <Footer />
      <ChatbotWidget />
    </div>
  );
}
