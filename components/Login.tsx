import React, { useState } from 'react';
import { useAuth } from '../src/store/auth-context';
import { BookOpen, AlertCircle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
  const { signInWithGoogle, loginEmail, signupEmail } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleGoogle = async () => {
    try {
      setLoading(true);
      setError('');
      await signInWithGoogle();
      navigate('/');
    } catch (e: any) {
      console.error(e);
      setError('Error al iniciar sesión con Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        await loginEmail(email, password);
      } else {
        await signupEmail(email, password);
      }
      navigate('/');
    } catch (e: any) {
      console.error(e);
      if (e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password') {
          setError('Email o contraseña incorrectos.');
      } else if (e.code === 'auth/email-already-in-use') {
          setError('El correo ya está registrado.');
      } else if (e.code === 'auth/weak-password') {
          setError('La contraseña debe tener al menos 6 caracteres.');
      } else {
          setError('Ocurrió un error. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-dark-800 rounded-2xl border border-white/10 shadow-2xl p-8">
        <div className="flex flex-col items-center mb-8">
           <div className="w-12 h-12 bg-brand-500/10 rounded-full flex items-center justify-center mb-4">
             <BookOpen className="w-6 h-6 text-brand-500" />
           </div>
           <h1 className="text-2xl font-bold text-white mb-2">REVISTAPDF.COM</h1>
           <p className="text-gray-400 text-center">
             {isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta para comenzar'}
           </p>
        </div>

        {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-6 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
            </div>
        )}

        <button 
          onClick={handleGoogle}
          disabled={loading}
          className="w-full bg-white text-dark-900 font-medium py-2.5 rounded-lg flex items-center justify-center gap-3 hover:bg-gray-100 transition-colors mb-6 disabled:opacity-70 active:scale-[0.98]"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <>
               <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
               <span>Continuar con Google</span>
            </>
          )}
        </button>

        <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-dark-800 text-gray-500">O con email</span>
            </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input 
                    type="email" 
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                    placeholder="ejemplo@correo.com"
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Contraseña</label>
                <input 
                    type="password" 
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                    placeholder="••••••••"
                    minLength={6}
                />
            </div>
            
            <button 
                type="submit"
                disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-lg transition-all shadow-lg shadow-brand-900/20 disabled:opacity-70 disabled:cursor-not-allowed mt-2 active:scale-[0.98]"
            >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (isLogin ? 'Iniciar Sesión' : 'Crear Cuenta')}
            </button>
        </form>

        <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">
                {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
                <button 
                    onClick={() => setIsLogin(!isLogin)} 
                    className="text-brand-400 hover:text-brand-300 font-medium hover:underline focus:outline-none"
                >
                    {isLogin ? "Regístrate" : "Inicia sesión"}
                </button>
            </p>
        </div>
      </div>
    </div>
  );
};
export default Login;