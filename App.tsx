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

// Dashboard Component
const Dashboard: React.FC = () => {
  const { magazines, deleteMagazine } = useAppStore();
  const [selectedMagazine, setSelectedMagazine] = useState<Magazine | null>(null);
  const [editingMagazine, setEditingMagazine] = useState<Magazine | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [sharingMagazine, setSharingMagazine] = useState<Magazine | null>(null);

  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Effect to handle direct URL access via slug or ID
  useEffect(() => {
    if (slug && magazines.length > 0) {
      // Find by slug OR by ID
      const mag = magazines.find(m => m.slug === slug || m.id === slug);
      if (mag) {
        setSelectedMagazine(mag);
      } else {
        // If not found, stay on dashboard
        if (user) navigate('/');
      }
    } else if (!slug) {
        setSelectedMagazine(null);
    }
  }, [slug, magazines, navigate, user]);

  // Handlers
  const handleOpenUpload = () => {
    if (!user) {
        navigate('/login');
        return;
    }
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

  const handleCloseViewer = () => {
    setSelectedMagazine(null);
    // Remove slug/ID from URL without refreshing
    navigate('/');
  };

  // Navigate to view view URL
  const handleView = (mag: Magazine) => {
      navigate(`/view/${mag.slug || mag.id}`);
  };

  return (
    <>
        <Navbar onUploadClick={handleOpenUpload} />
        
        <div className="container mx-auto px-4 py-8">
        
        {/* Grid: Columns adjusted for larger cards (roughly double size) */}
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
                <div className="col-span-full py-20 text-center text-gray-500">
                    <p className="text-lg">No hay revistas disponibles.</p>
                </div>
            )}
        </div>

        {/* Viewer Modal Overlay */}
        {selectedMagazine && (
            <FlipbookViewer magazine={selectedMagazine} onClose={handleCloseViewer} />
        )}

        {/* Upload/Edit Modal */}
        <UploadModal 
            isOpen={isUploadModalOpen} 
            onClose={() => setUploadModalOpen(false)} 
            magazineToEdit={editingMagazine}
        />

        {/* Share Modal */}
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

const MainLayout: React.FC = () => {
    return (
        <div className="min-h-screen bg-dark-900 text-white font-sans selection:bg-brand-500/30">
            <Dashboard />
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
                {/* Public Access to View specific ID or Slug */}
                <Route path="/view/:slug" element={
                    <MainLayout />
                } />
                {/* Protected Dashboard */}
                <Route path="/" element={
                    <ProtectedRoute>
                        <MainLayout />
                    </ProtectedRoute>
                } />
            </Routes>
        </Router>
        </AppProvider>
    </AuthProvider>
  );
};

export default App;