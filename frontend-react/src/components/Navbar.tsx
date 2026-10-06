import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <>
      <nav>
        <div className="nav-container">
          <Link to="/" className="nav-brand">
            <img src="/static/White_background_logo.png" alt="Logo" />
            BinaryWebEngine
          </Link>
          <div className="nav-links">
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Home</Link>
            <Link to="/about" className={location.pathname === '/about' ? 'active' : ''}>About</Link>
            <Link to="/faq" className={location.pathname === '/faq' ? 'active' : ''}>FAQ</Link>
            <Link to="/docs" className={location.pathname === '/docs' ? 'active' : ''}>Docs</Link>
            <Link to="/contact" className={location.pathname === '/contact' ? 'active' : ''}>Contact</Link>
          </div>
          
          <div className="desktop-nav-actions">
             <a href="/dashboard" className="btn-primary">View Demo</a>
          </div>
          
          <button 
            className="mobile-menu-btn" 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            className="mobile-menu"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <Link to="/" onClick={closeMenu}>Home</Link>
            <Link to="/about" onClick={closeMenu}>About</Link>
            <Link to="/faq" onClick={closeMenu}>FAQ</Link>
            <Link to="/docs" onClick={closeMenu}>Docs</Link>
            <Link to="/contact" onClick={closeMenu}>Contact</Link>
            <a href="/dashboard" className="btn-primary" style={{ marginTop: '10px' }}>View Demo</a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
