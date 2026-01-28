import { useState } from 'react';
import Login from './Login';
import Register from './Register';

export default function AuthPage() {
  const [view, setView] = useState<'login' | 'register'>('login');

  return view === 'login' ? (
    <Login onSwitchToRegister={() => setView('register')} />
  ) : (
    <Register onSwitchToLogin={() => setView('login')} />
  );
}