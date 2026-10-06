import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { auth, googleProvider, db } from '../firebase';
import { signInWithPopup, onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

export default function Admin() {
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (user && user.email === 'k.makmanhossain@gmail.com') {
      const q = query(collection(db, 'contact_messages'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMessages(msgs);
      });
      return () => unsub();
    }
  }, [user]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      alert('Login failed');
    }
  };

  if (loading) return <div style={{ color: 'white', padding: '50px' }}>Loading...</div>;

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 20px', color: 'white', background: '#080808', minHeight: '100vh' }}>
        <Helmet><title>Admin Login | BinaryWebEngine</title></Helmet>
        <h2>Admin Access Required</h2>
        <p style={{ color: '#aaa', margin: '20px 0' }}>Please log in to view the dashboard.</p>
        <button onClick={login} style={{ padding: '12px 24px', background: '#4285F4', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}>
          Sign in with Google
        </button>
      </div>
    );
  }

  if (user.email !== 'k.makmanhossain@gmail.com') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 20px', color: 'white', background: '#080808', minHeight: '100vh' }}>
        <Helmet><title>Access Denied</title></Helmet>
        <h2 style={{ color: '#E74C3C' }}>Access Denied</h2>
        <p style={{ margin: '20px 0' }}>Your email ({user.email}) is not authorized to access the admin dashboard.</p>
        <button onClick={() => signOut(auth)} style={{ padding: '10px 20px', background: '#333', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: '#080808', color: 'white', minHeight: '100vh', padding: '40px' }}>
      <Helmet><title>Admin Dashboard | BinaryWebEngine</title></Helmet>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid #333', paddingBottom: '20px' }}>
        <h2>Admin Dashboard</h2>
        <div>
          <span style={{ marginRight: '20px', color: '#aaa' }}>{user.email}</span>
          <button onClick={() => signOut(auth)} style={{ padding: '8px 16px', background: '#C0392B', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
      </div>

      <h3>Contact Messages</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
        {messages.length === 0 ? (
          <p style={{ color: '#aaa' }}>No messages yet.</p>
        ) : (
          messages.map(m => (
            <div key={m.id} style={{ background: '#161616', padding: '20px', borderRadius: '12px', border: '1px solid #333' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong>{m.name} ({m.email})</strong>
                <span style={{ color: '#888', fontSize: '12px' }}>
                  {m.createdAt?.toDate ? m.createdAt.toDate().toLocaleString() : 'Just now'}
                </span>
              </div>
              <p style={{ color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{m.message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
