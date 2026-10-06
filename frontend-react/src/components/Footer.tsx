import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer>
      <p>&copy; 2026 <a href="https://equisaas-bd.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>Team EquiSaaS BD</a>. Built for the International Builders Congress.</p>
      <div style={{ marginTop: '10px' }}>
        <Link to="/docs">Documentation</Link>
        <a href="/dashboard">View Demo</a>
      </div>
    </footer>
  );
}
