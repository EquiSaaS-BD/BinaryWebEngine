import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import ContactForm from '../components/ContactForm';

export default function Contact() {
  return (
    <section id="contact" style={{ minHeight: '80vh' }}>
      <Helmet><title>Contact | BinaryWebEngine</title></Helmet>
      
      <motion.h2 
        className="section-title"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Get in Touch
      </motion.h2>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <ContactForm />
      </motion.div>
    </section>
  );
}
