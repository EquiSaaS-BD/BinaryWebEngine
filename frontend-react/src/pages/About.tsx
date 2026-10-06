import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';

export default function About() {
  const staggerContainer = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  
  const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } }
  };

  return (
    <section id="team" style={{ minHeight: '80vh' }}>
      <Helmet><title>About Us | BinaryWebEngine</title></Helmet>
      
      <motion.h2 
        className="section-title"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Team EquiSaaS BD
      </motion.h2>
      <motion.p 
        className="section-desc"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        The masterminds behind BinaryWebEngine, bringing diverse expertise in engineering, infrastructure, and user experience.
      </motion.p>
      
      <motion.div 
        className="team-grid"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {[
          { role: "Team Lead", name: "Kholipha Ahmmad Al-Amin" },
          { role: "Full-Stack Developer", name: "K4z1 SABBIR" },
          { role: "Product/UX Designer", name: "Md Mushfiqur Rahman" },
          { role: "Product/UX Designer", name: "Abu Hurayra" },
          { role: "Domain Expert", name: "Khadija Tull Khushbu" }
        ].map((member, i) => (
          <motion.div key={i} className="team-card" variants={fadeInUp}>
            <div className="team-role">{member.role}</div>
            <div className="team-name">{member.name}</div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
