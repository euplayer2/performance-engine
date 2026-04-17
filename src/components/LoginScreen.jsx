import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function LoginScreen() {
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const reset = () => { setError(null); setMessage(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    reset();

    if (activeTab === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      // em caso de sucesso, onAuthStateChange no AuthGate cuida do resto
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else if (data?.user && !data?.session) {
        // Email precisa de confirmação
        setMessage('Verifique seu email para confirmar o cadastro.');
      }
      // se session foi retornada, onAuthStateChange entra automaticamente
    }

    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(165deg, #0D0D0F 0%, #1A1A2E 40%, #16213E 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: "'Outfit', sans-serif",
      color: '#E8E8ED',
    }}>
      {/* Ambient blur */}
      <div style={{
        position: 'fixed', top: -200, right: -200,
        width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(232,93,58,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%',
        maxWidth: 400,
        background: 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20,
        padding: '32px 28px',
        backdropFilter: 'blur(12px)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>⚡</div>
          <div style={{
            fontSize: 10,
            fontFamily: "'Space Mono', monospace",
            color: '#E85D3A',
            letterSpacing: 4,
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>Performance Engine</div>
          <div style={{ fontSize: 12, color: 'rgba(232,232,237,0.3)' }}>
            Organize seu dia, maximize sua performance.
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 10,
          padding: 3,
          marginBottom: 24,
        }}>
          {[
            { key: 'login', label: 'Entrar' },
            { key: 'signup', label: 'Criar conta' },
          ].map(({ key, label }) => (
            <button
              key={key}
              id={`auth-tab-${key}`}
              onClick={() => { setActiveTab(key); reset(); }}
              style={{
                flex: 1,
                padding: '8px 0',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: activeTab === key ? 'rgba(232,93,58,0.2)' : 'transparent',
                color: activeTab === key ? '#E85D3A' : 'rgba(232,232,237,0.4)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Mensagem de confirmação de email */}
        {message && (
          <div style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(46,189,107,0.08)',
            border: '1px solid rgba(46,189,107,0.2)',
            fontSize: 13,
            color: '#2EBD6B',
            lineHeight: 1.5,
          }}>
            {message}
          </div>
        )}

        {/* Erro */}
        {error && (
          <div style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(232,93,58,0.08)',
            border: '1px solid rgba(232,93,58,0.2)',
            fontSize: 13,
            color: '#E85D3A',
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: 'rgba(232,232,237,0.45)',
              marginBottom: 6,
            }}>
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="seu@email.com"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: '#E8E8ED',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(232,93,58,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={{
              display: 'block',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: 'rgba(232,232,237,0.45)',
              marginBottom: 6,
            }}>
              Senha
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
              placeholder={activeTab === 'signup' ? 'Mínimo 6 caracteres' : '••••••••'}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.04)',
                color: '#E8E8ED',
                fontSize: 14,
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(232,93,58,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          <button
            id="auth-submit"
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px 0',
              borderRadius: 12,
              border: 'none',
              background: loading ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #E85D3A, #E88A3A)',
              color: loading ? 'rgba(232,232,237,0.3)' : '#fff',
              fontSize: 15,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: loading ? 'default' : 'pointer',
              transition: 'all 0.3s',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(232,93,58,0.3)',
            }}
          >
            {loading ? 'Aguarde...' : activeTab === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </div>

      <style>{`
        ::placeholder { color: rgba(232,232,237,0.2); }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
