import { useState } from 'react';
import { auth } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { OAUTH_SCOPES } from '../lib/permissions';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';

type AuthView = 'register' | 'login' | 'reset';

export default function AuthPage() {
  const [view, setView] = useState<AuthView>('register');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const resetForm = () => {
    setError('');
    setSubmitting(false);
    setSent(false);
  };

  const switchView = (v: AuthView) => {
    resetForm();
    setView(v);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) { setError('Please enter your full name'); return; }
    if (!email.trim()) { setError('Please enter your email'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setSubmitting(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email'); return; }
    if (!password) { setError('Please enter your password'); return; }
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setSubmitting(true);
    try {
      const provider = new GoogleAuthProvider();
      const scopes = OAUTH_SCOPES.filter((s) => s.scope).map((s) => s.scope!);
      for (const scope of scopes) {
        provider.addScope(scope);
      }
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed');
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email'); return; }
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
      setSubmitting(false);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full bg-[#141414] border border-[#262626] rounded-2xl py-3.5 pl-12 pr-4 text-sm text-white placeholder-[#737373] focus:outline-none focus:border-[#caff33] transition-colors';
  const submitBtn = 'w-full bg-[#caff33] hover:bg-[#bceb22] text-black font-semibold rounded-full py-3.5 mt-2 transition-colors duration-200 disabled:opacity-50';
  const googleBtn = 'w-full bg-[#141414] hover:bg-[#1a1a1a] border border-[#262626] text-white text-sm font-semibold rounded-full py-3.5 flex items-center justify-center gap-3 transition-colors duration-200';

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center relative overflow-hidden font-sans">
      <div className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(202,255,51,0.08) 0%, rgba(10,10,10,0) 70%)' }} />

      <div className="w-full max-w-[400px] px-6 z-10 relative">

        <div className="flex flex-col items-center mb-8">
          <div className="w-[72px] h-[72px] bg-[#111111] rounded-full flex items-center justify-center mb-5 border border-[#262626] shadow-[0_0_30px_rgba(0,0,0,0.8)]">
            <img src="https://eburon.ai/icon-eburon.svg" alt="Eburon AI" className="w-8 h-8 opacity-90" />
          </div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight">
            {view === 'register' ? 'Register' : view === 'login' ? 'Login' : 'Reset Password'}
          </h1>
          <p className="text-[#737373] text-sm text-center">
            {view === 'register' ? 'Create your new account' : view === 'login' ? 'Sign in to your account' : 'Enter your email to receive a reset link'}
          </p>
        </div>

        <motion.div
          key={view}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {view === 'register' && (
            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-[#737373]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} type="text" placeholder="Full name" className={inputClass} />
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-[#737373]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className={inputClass} />
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-[#737373]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className={inputClass} />
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-[#737373]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" placeholder="Confirm password" className={inputClass} />
              </div>
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              <button type="submit" disabled={submitting} className={submitBtn}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Sign up'}
              </button>
            </form>
          )}

          {view === 'login' && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-[#737373]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className={inputClass} />
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-[#737373]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className={inputClass} />
              </div>
              <div className="flex justify-end -mt-1">
                <button type="button" onClick={() => switchView('reset')} className="text-sm text-[#737373] hover:text-white transition-colors font-medium">Forgot password?</button>
              </div>
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              <button type="submit" disabled={submitting} className={submitBtn}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Sign in'}
              </button>
            </form>
          )}

          {view === 'reset' && (
            <form onSubmit={handleReset} className="flex flex-col gap-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <svg className="w-5 h-5 text-[#737373]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email address" className={inputClass} />
              </div>
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              {sent && <p className="text-[#caff33] text-xs text-center">Reset link sent! Check your email.</p>}
              <button type="submit" disabled={submitting} className={submitBtn}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Send Reset Link'}
              </button>
              <div className="flex justify-center mt-2">
                <button type="button" onClick={() => switchView('login')} className="text-sm text-[#737373] hover:text-white transition-colors flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                  Back to login
                </button>
              </div>
            </form>
          )}
        </motion.div>

        {(view === 'register' || view === 'login') && (
          <>
            <div className="flex items-center my-6">
              <div className="flex-grow border-t border-[#262626]" />
              <span className="px-4 text-[#737373] text-sm">or</span>
              <div className="flex-grow border-t border-[#262626]" />
            </div>

            <button onClick={handleGoogle} disabled={submitting} className={googleBtn}>
              <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#000000" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#000000" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#000000" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#000000" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </div>
              Continue with Google
            </button>

            <p className="text-center text-sm text-[#737373] mt-6">
              {view === 'register' ? (
                <>Already have an account? <button onClick={() => switchView('login')} className="text-[#caff33] hover:underline font-medium">Log in</button></>
              ) : (
                <>Don't have an account? <button onClick={() => switchView('register')} className="text-[#caff33] hover:underline font-medium">Sign up</button></>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
