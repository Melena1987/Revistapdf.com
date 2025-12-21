
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useParams, useNavigate, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { AppProvider, useAppStore } from './store/context';
import { AuthProvider, useAuth } from './store/auth-context';
import Navbar from './components/Navbar';
import UploadModal from './components/UploadModal';
import FlipbookViewer from './components/FlipbookViewer';
import MagazineCard from './components/MagazineCard';
import ShareModal from './components/ShareModal';
import Login from './components/Login';
import { Magazine } from './types';
import { updateMetaTags, resetMetaTags } from './services/seo';

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    
    if (loading) {
        return (
            <div className="min-h-screen bg-dark-900 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-brand-500 animate-spin"/>
            </div>
        );
    }
    
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    
    return <>{children}</>;
};

// Public Viewer (Standalone)
const PublicViewer: React.FC = () => {
    const { slug } = useParams();
    const navigate = useNavigate();
    const { getMagazineBySlug } = useAppStore();
    const [magazine, setMagazine] = useState<Magazine | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMag = async () => {
            if (!slug) return;
            const mag = await getMagazineBySlug(slug);
            setMagazine(mag);
            setLoading(false);
            
            if (mag) {
                // Update SEO Meta Tags for social sharing
                updateMetaTags(
                    mag.title,
                    mag.description || `Lee "${mag.title}" en formato revista digital en REVISTAPDF.COM`,
                    mag.coverImage || ''
                );
            }
        };
        fetchMag();

        // Cleanup: Reset to original metadata when leaving the viewer
        return () => {
            resetMetaTags();
        };
    }, [slug, getMagazineBySlug]);

    if (loading) {
        return (
            <div className="min-h-screen bg-dark-900 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-brand-500 animate-spin"/>
                <span className="ml-3 text-white">Cargando revista...</span>
            </div>
        );
    }

    if (!magazine) {
        return (
            <div className="min-h-screen bg-dark-900 flex flex-col items-center justify-center text-white">
                <h1 className="text-2xl font-bold mb-2">Revista no encontrada</h1>
                <p className="text-gray-400 mb-6">El enlace puede estar roto o la revista fue eliminada.</p>
                <button onClick={() => navigate('/')} className="px-6 py-2 bg-brand-600 rounded-full">
                    Ir al Inicio
                </button>
            </div>
        );
    }

    return <FlipbookViewer magazine={magazine} onClose={() => navigate('/')} />;
};

// Dashboard Component (Private User Library)
const Dashboard: React.FC = () => {
  const { magazines, deleteMagazine } = useAppStore();
  const [selectedMagazine, setSelectedMagazine] = useState<Magazine | null>(null);
  const [editingMagazine, setEditingMagazine] = useState<Magazine | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [sharingMagazine, setSharingMagazine] = useState<Magazine | null>(null);

  const navigate = useNavigate();
  const { user } = useAuth();

  const handleOpenUpload = () => {
    setEditingMagazine(null);
    setUploadModalOpen(true);
  };

  const handleEdit = (mag: Magazine) => {
    setEditingMagazine(mag);
    setUploadModalOpen(true);
  };

  const handleDelete = async (mag: Magazine) => {
    if (window.confirm(`¿Estás seguro de que quieres eliminar "${mag.title}"? Esta acción no se puede deshacer.`)) {
        await deleteMagazine(mag.id);
    }
  };

  const handleView = (mag: Magazine) => {
      setSelectedMagazine(mag);
  };

  return (
    <>
        <Navbar onUploadClick={handleOpenUpload} />
        
        <div className="container mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Mis Revistas</h2>
            </div>
        
            <div className="grid grid-cols-1 min-[450px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6">
                {magazines.map((mag) => (
                    <MagazineCard 
                        key={mag.id} 
                        magazine={mag} 
                        onView={handleView}
                        onEdit={handleEdit}
                        onShare={setSharingMagazine}
                        onDelete={handleDelete}
                    />
                ))}
                
                {magazines.length === 0 && (
                    <div className="col-span-full py-20 text-center text-gray-500 border-2 border-dashed border-white/5 rounded-xl">
                        <p className="text-lg mb-2">No tienes revistas publicadas.</p>
                        <button onClick={handleOpenUpload} className="text-brand-400 hover:text-brand-300 font-medium">
                            Sube tu primera revista PDF
                        </button>
                    </div>
                )}
            </div>

            {selectedMagazine && (
                <FlipbookViewer magazine={selectedMagazine} onClose={() => setSelectedMagazine(null)} />
            )}

            <UploadModal 
                isOpen={isUploadModalOpen} 
                onClose={() => setUploadModalOpen(false)} 
                magazineToEdit={editingMagazine}
            />

            {sharingMagazine && (
                <ShareModal
                    magazine={sharingMagazine}
                    onClose={() => setSharingMagazine(null)}
                />
            )}
        </div>
    </>
  );
};

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="min-h-screen bg-dark-900 text-white font-sans selection:bg-brand-500/30">
            {children}
        </div>
    );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
        <AppProvider>
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/view/:slug" element={
                    <MainLayout>
                        <PublicViewer />
                    </MainLayout>
                } />
                <Route path="/" element={
                    <ProtectedRoute>
                        <MainLayout>
                            <Dashboard />
                        </MainLayout>
                    </ProtectedRoute>
                } />
            </Routes>
        </Router>
        </AppProvider>
    </AuthProvider>
  );
};

export default App;
