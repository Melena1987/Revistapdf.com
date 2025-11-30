import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Magazine } from '../types';

interface AppContextType {
  magazines: Magazine[];
  addMagazine: (mag: Magazine) => void;
  updateMagazine: (id: string, updates: Partial<Magazine>) => void;
  getMagazine: (id: string) => Magazine | undefined;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Mock initial data
  const [magazines, setMagazines] = useState<Magazine[]>([
    {
      id: 'demo-1',
      title: 'Revista de Diseño Digital',
      description: 'Tendencias en UI/UX para el año 2025. Incluye entrevistas con expertos.',
      category: 'Diseño',
      pdfUrl: 'https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf', // Demo PDF
      createdAt: Date.now(),
      pageCount: 14,
      coverImage: 'https://picsum.photos/400/565'
    }
  ]);

  const addMagazine = (mag: Magazine) => {
    setMagazines(prev => [mag, ...prev]);
  };

  const updateMagazine = (id: string, updates: Partial<Magazine>) => {
    setMagazines(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const getMagazine = (id: string) => magazines.find(m => m.id === id);

  return (
    <AppContext.Provider value={{ magazines, addMagazine, updateMagazine, getMagazine }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppStore must be used within AppProvider");
  return context;
};
