
import React from 'react';
import { Heart } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="w-full py-8 mt-auto border-t border-white/5 flex justify-center items-center">
      <p className="flex items-center gap-1.5 text-gray-500 text-sm font-medium">
        <span>Plataforma creada con</span>
        <Heart className="w-4 h-4 text-red-500 fill-current animate-pulse" />
        <span>por</span>
        <a 
          href="https://melenamarketing.com" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-brand-400 hover:text-brand-300 transition-colors border-b border-brand-400/20 hover:border-brand-300"
        >
          Melena Marketing
        </a>
      </p>
    </footer>
  );
};

export default Footer;
