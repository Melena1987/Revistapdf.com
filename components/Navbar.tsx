import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, PlusCircle, LogOut, LogIn, Crown, Zap } from 'lucide-react';
import { useAuth } from '../store/auth-context';

interface NavbarProps {
  onUploadClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onUploadClick }) => {
  const { logout, user, userProfile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isPremium = userProfile?.role === 'premium';

  // Dynamic Stripe URL with user reference for webhook automation
  const stripeUrl = user 
    ? `https://buy.stripe.com/8x24gz2yW6dzfwsgyH8Zq0A?client_reference_id=${user.uid}&prefilled_email=${encodeURIComponent(user.email || '')}`
    : 'https://buy.stripe.com/8x24gz2yW6dzfwsgyH8Zq0A';

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-dark-900/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-brand-500 hover:text-brand-400 transition-colors">
          <BookOpen className="w-8 h-8" />
          <span className="text-xl font-bold tracking-tight text-white">REVISTAPDF.COM</span>
        </Link>
        
        {user ? (
          <div className="flex items-center gap-2 sm:gap-4">
            
            {/* Premium Badge or Upsell Button */}
            {isPremium ? (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full text-yellow-400 text-[10px] sm:text-xs font-bold uppercase tracking-wider animate-in fade-in duration-500">
                    <Crown className="w-3.5 h-3.5 fill-current" />
                    <span>Premium</span>
                </div>
             ) : (
                <a 
                   href={stripeUrl}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider shadow-lg shadow-yellow-900/20 transition-all hover:scale-105"
                >
                    <Zap className="w-3.5 h-3.5 fill-white" />
                    <span className="hidden min-[380px]:inline">Hazte Premium</span>
                    <span className="min-[380px]:hidden">Premium</span>
                </a>
             )}

            <button 
              onClick={onUploadClick}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-full font-medium transition-all shadow-lg shadow-brand-900/20 active:scale-95"
            >
              <PlusCircle className="w-5 h-5" />
              <span className="hidden sm:inline">Subir PDF</span>
            </button>
            
            <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block"></div>
            
            <button 
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        ) : (
            <div className="flex items-center gap-4">
                 <Link 
                    to="/login"
                    className="flex items-center gap-2 px-6 py-2 bg-white text-dark-900 hover:bg-gray-100 rounded-full font-bold transition-all shadow-lg"
                 >
                    <LogIn className="w-4 h-4" />
                    <span>Iniciar Sesión</span>
                 </Link>
            </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;