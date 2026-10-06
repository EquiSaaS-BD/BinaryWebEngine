import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import About from './pages/About';
import FAQ from './pages/FAQ';
import Contact from './pages/Contact';
import Docs from './pages/Docs';
import NotFound from './pages/NotFound';
import Admin from './pages/Admin';
import Layout from './components/Layout';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout><Landing /></Layout>} />
      <Route path="/about" element={<Layout><About /></Layout>} />
      <Route path="/faq" element={<Layout><FAQ /></Layout>} />
      <Route path="/contact" element={<Layout><Contact /></Layout>} />
      <Route path="/docs" element={<Layout><Docs /></Layout>} />
      <Route path="/admin" element={<Admin />} />
      <Route path="*" element={<Layout><NotFound /></Layout>} />
    </Routes>
  );
}

export default App;
