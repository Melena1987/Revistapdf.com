import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, PlusCircle } from 'lucide-react';

interface NavbarProps {
  onUploadClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onUploadClick }) => {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-dark-900/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-brand-500 hover:text-brand-400 transition-colors">
          <BookOpen className="w-8 h-8" />
          <span className="text-xl font-bold tracking-tight text-white">REVISTAPDF.COM</span>
        </Link>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={onUploadClick}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-full font-medium transition-all shadow-lg shadow-brand-900/20 active:scale-95"
          >
            <PlusCircle className="w-5 h-5" />
            <span className="hidden sm:inline">Subir PDF</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
