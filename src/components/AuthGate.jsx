import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import LoginScreen from './LoginScreen.jsx';
import App from '../App.jsx';

export default function AuthGate() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    // Verifica sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Reage a login / logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Loading
  if (session === undefined) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(165deg, #0D0D0F 0%, #1A1A2E 40%, #16213E 100%)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
          <div style={{
            width: 32, height: 32, border: '3px solid rgba(232,93,58,0.2)',
            borderTopColor: '#E85D3A', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange cuida de resetar session para null
  };

  return <App user={session.user} onSignOut={handleSignOut} />;
}
