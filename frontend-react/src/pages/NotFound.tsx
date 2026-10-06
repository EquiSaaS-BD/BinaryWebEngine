import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
      <Helmet><title>404 Not Found | BinaryWebEngine</title></Helmet>
      
      <motion.h1 
        style={{ fontSize: '80px', margin: 0, background: 'linear-gradient(135deg, var(--maroon-bright), var(--maroon-lt))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        404
      </motion.h1>
      <motion.p 
        style={{ color: 'var(--text-sec)', fontSize: '20px', marginBottom: '30px' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        The page you are looking for does not exist.
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Link to="/" className="btn-primary" style={{ textDecoration: 'none' }}>
          Return Home
        </Link>
      </motion.div>
    </section>
  );
}
