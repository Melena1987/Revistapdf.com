import React, { useState, useRef, useEffect } from 'react';
import { FileText, MoreVertical, Eye, Share2, Edit2, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Magazine } from '../types';
import { useAuth } from '../store/auth-context';

interface MagazineCardProps {
  magazine: Magazine;
  onView: (magazine: Magazine) => void;
  onEdit: (magazine: Magazine) => void;
  onShare: (magazine: Magazine) => void;
  onDelete: (magazine: Magazine) => void;
}

const MagazineCard: React.FC<MagazineCardProps> = ({ magazine, onView, onEdit, onShare, onDelete }) => {
  const { user } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="group relative bg-dark-800 rounded-xl overflow-hidden border border-white/5 hover:border-brand-500/50 hover:shadow-xl hover:shadow-brand-900/10 transition-all duration-300 flex flex-col">
      
      {/* Cover Image Container */}
      <div className="relative aspect-[1/1.4] overflow-hidden bg-gray-900 group-hover:brightness-110 transition-all">
        {magazine.coverImage ? (
          <img 
              src={magazine.coverImage} 
              alt={magazine.title} 
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
              <FileText className="w-12 h-12" />
          </div>
        )}
        
        {/* Overlay Actions */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-[1px]">
          <Link 
              to={`/view/${magazine.slug || magazine.id}`}
              className="px-6 py-2 bg-white text-dark-900 rounded-full font-bold text-sm hover:bg-gray-100 transform hover:scale-105 transition-all flex items-center gap-2"
          >
              <Eye className="w-4 h-4" /> Leer
          </Link>
          <div className="flex gap-2">
              <button 
                  onClick={() => onShare(magazine)}
                  className="p-3 bg-dark-900/80 text-white rounded-full hover:bg-brand-600 transition-colors" title="Compartir">
                  <Share2 className="w-4 h-4" />
              </button>
              {user && (
                  <button 
                      onClick={() => onDelete(magazine)}
                      className="p-3 bg-dark-900/80 text-white rounded-full hover:bg-red-600 transition-colors" title="Eliminar">
                      <Trash2 className="w-4 h-4" />
                  </button>
              )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col flex-1 relative">
          <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-semibold text-brand-400 uppercase tracking-wider truncate max-w-[80%]">{magazine.category || 'General'}</span>
              
              {/* Context Menu - ONLY FOR LOGGED IN USERS */}
              {user && (
                  <div className="relative" ref={menuRef}>
                    <button 
                        onClick={() => setShowMenu(!showMenu)}
                        className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                    >
                        <MoreVertical className="w-4 h-4" />
                    </button>
                    
                    {showMenu && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-dark-900 border border-white/10 rounded-lg shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <button 
                                onClick={() => { onEdit(magazine); setShowMenu(false); }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-brand-600/20 hover:text-brand-400 flex items-center gap-2 transition-colors"
                            >
                                <Edit2 className="w-3.5 h-3.5" /> Editar
                            </button>
                            <button 
                                onClick={() => { onDelete(magazine); setShowMenu(false); }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-red-500/20 hover:text-red-400 flex items-center gap-2 transition-colors border-t border-white/5"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </button>
                        </div>
                    )}
                  </div>
              )}
          </div>
          
          <h3 className="text-base font-bold text-white mb-3 line-clamp-2 leading-snug min-h-[3rem]">{magazine.title}</h3>
          
          <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
              <span>{magazine.pageCount ? `${magazine.pageCount} páginas` : 'PDF'}</span>
              <span>{new Date(magazine.createdAt).toLocaleDateString()}</span>
          </div>
      </div>
    </div>
  );
};

export default MagazineCard;