import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useParams, useNavigate, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { AppProvider, useAppStore } from './store/context';
import { AuthProvider, useAuth } from './src/store/auth-context';
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
  const { magazines, getMagazine } = useAppStore();
  const [selectedMagazine, setSelectedMagazine] = useState<Magazine | null>(null);
  const [editingMagazine, setEditingMagazine] = useState<Magazine | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [sharingMagazine, setSharingMagazine] = useState<Magazine | null>(null);

  const { id } = useParams();
  const navigate = useNavigate();

  // Effect to handle direct URL access
  useEffect(() => {
    if (id && magazines.length > 0 && !selectedMagazine) {
      const mag = getMagazine(id);
      if (mag) {
        setSelectedMagazine(mag);
      } else {
        navigate('/'); // magazine not found, redirect to home
      }
    }
  }, [id, magazines, getMagazine, navigate, selectedMagazine]);

  // Handlers
  const handleOpenUpload = () => {
    setEditingMagazine(null);
    setUploadModalOpen(true);
  };

  const handleEdit = (mag: Magazine) => {
    setEditingMagazine(mag);
    setUploadModalOpen(true);
  };

  const handleCloseViewer = () => {
    setSelectedMagazine(null);
    navigate('/');
  };

  return (
    <>
        <Navbar onUploadClick={handleOpenUpload} />
        
        <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="mb-12 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            Tus Revistas Digitales
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Convierte documentos PDF en experiencias de lectura inmersivas. Comparte con el mundo mediante enlaces cortos inteligentes.
            </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {magazines.map((mag) => (
                <MagazineCard 
                    key={mag.id} 
                    magazine={mag} 
                    onView={setSelectedMagazine}
                    onEdit={handleEdit}
                    onShare={setSharingMagazine}
                />
            ))}
            
            {magazines.length === 0 && (
                <div className="col-span-full py-20 text-center text-gray-500">
                    <p className="text-lg">No hay revistas publicadas aún. ¡Sube la primera!</p>
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
                <Route path="/view/:id" element={
                    <ProtectedRoute>
                        <MainLayout />
                    </ProtectedRoute>
                } />
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