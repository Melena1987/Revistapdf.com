import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  updateDoc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';
import { db, storage } from '../src/firebase';
import { Magazine } from '../types';

interface AppContextType {
  magazines: Magazine[];
  addMagazine: (mag: Magazine) => Promise<void>;
  updateMagazine: (id: string, updates: Partial<Magazine>) => Promise<void>;
  getMagazine: (id: string) => Magazine | undefined;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [magazines, setMagazines] = useState<Magazine[]>([]);

  // Listen to Firestore changes in real-time
  useEffect(() => {
    const q = query(collection(db, "magazines"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mags = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Magazine));
      setMagazines(mags);
    }, (error) => {
      console.error("Error fetching magazines:", error);
    });

    return () => unsubscribe();
  }, []);

  // Helper to upload Blob URLs to Firebase Storage
  const uploadAsset = async (blobUrl: string, folder: string, id: string): Promise<string> => {
    // If it's already a remote URL or empty, return as is
    if (!blobUrl || !blobUrl.startsWith('blob:')) return blobUrl;

    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const fileRef = ref(storage, `${folder}/${id}/${Date.now()}`);
      await uploadBytes(fileRef, blob);
      return await getDownloadURL(fileRef);
    } catch (error) {
      console.error(`Error uploading asset for ${id}:`, error);
      throw error;
    }
  };

  const addMagazine = async (mag: Magazine) => {
    try {
      // 1. Upload PDF and Cover Image if they are local blob URLs
      const remotePdfUrl = await uploadAsset(mag.pdfUrl, 'pdfs', mag.id);
      const remoteCoverUrl = mag.coverImage 
        ? await uploadAsset(mag.coverImage, 'covers', mag.id) 
        : undefined;

      // 2. Prepare the object for Firestore
      const newMagazine: Magazine = {
        ...mag,
        pdfUrl: remotePdfUrl,
        coverImage: remoteCoverUrl
      };

      // 3. Save to Firestore
      await setDoc(doc(db, "magazines", mag.id), newMagazine);
    } catch (error) {
      console.error("Error adding magazine:", error);
      alert("Error al subir la revista. Por favor intenta de nuevo.");
    }
  };

  const updateMagazine = async (id: string, updates: Partial<Magazine>) => {
    try {
      let finalUpdates = { ...updates };

      // Handle PDF update if changed
      if (updates.pdfUrl && updates.pdfUrl.startsWith('blob:')) {
        finalUpdates.pdfUrl = await uploadAsset(updates.pdfUrl, 'pdfs', id);
      }

      // Handle Cover update if changed
      if (updates.coverImage && updates.coverImage.startsWith('blob:')) {
        finalUpdates.coverImage = await uploadAsset(updates.coverImage, 'covers', id);
      }

      const magRef = doc(db, "magazines", id);
      await updateDoc(magRef, finalUpdates);
    } catch (error) {
      console.error("Error updating magazine:", error);
    }
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