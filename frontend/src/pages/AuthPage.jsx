import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function AuthPage() {
  const [mode, setMode]     = useState('login');
  const [email, setEmail]   = useState('');
  const [password, setPass] = useState('');
  const [err, setErr]       = useState('');
  const [busy, setBusy]     = useState(false);
  const { signIn, signUp }  = useAuth();
  const nav                 = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const fn = mode === 'login' ? signIn : signUp;
    const { error } = await fn(email, password);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    nav('/dashboard');
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',
      justifyContent:'center',background:'#0f0f0f'}}>
      <div style={{background:'#1a1a1a',border:'1px solid #333',
        borderRadius:12,padding:'2rem',width:340}}>
        <h1 style={{color:'#fff',fontSize:20,marginBottom:4}}>Claudable</h1>
        <p style={{color:'#888',fontSize:13,marginBottom:24}}>
          {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
        </p>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email" required
            value={email} onChange={e => setEmail(e.target.value)} style={inp} />
          <input type="password" placeholder="Password" required
            value={password} onChange={e => setPass(e.target.value)}
            style={{...inp, marginTop:10}} />
          {err && <p style={{color:'#f87171',fontSize:12,marginTop:8}}>{err}</p>}
          <button type="submit" disabled={busy} style={btn}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <p style={{color:'#888',fontSize:12,marginTop:16,textAlign:'center'}}>
          {mode === 'login' ? 'No account? ' : 'Have an account? '}
          <span style={{color:'#a78bfa',cursor:'pointer'}}
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </span>
        </p>
      </div>
    </div>
  );
}

const inp = {width:'100%',padding:'10px 12px',background:'#111',border:'1px solid #333',
  borderRadius:8,color:'#fff',fontSize:14,boxSizing:'border-box'};
const btn = {width:'100%',marginTop:16,padding:'10px',background:'#7c3aed',color:'#fff',
  border:'none',borderRadius:8,fontSize:14,cursor:'pointer',fontWeight:500};
