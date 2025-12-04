import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  updateDoc, 
  deleteDoc,
  query, 
  orderBy,
  where,
  getDocs,
  limit,
  getDoc
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { db, storage } from '../firebase';
import { Magazine } from '../types';
import { useAuth } from './auth-context';

interface AppContextType {
  magazines: Magazine[];
  addMagazine: (mag: Magazine) => Promise<void>;
  updateMagazine: (id: string, updates: Partial<Magazine>) => Promise<void>;
  deleteMagazine: (id: string) => Promise<void>;
  getMagazine: (id: string) => Magazine | undefined;
  getMagazineBySlug: (slugOrId: string) => Promise<Magazine | null>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [magazines, setMagazines] = useState<Magazine[]>([]);

  // Listen to Firestore changes in real-time, filtered by User
  useEffect(() => {
    if (!user) {
        setMagazines([]);
        return;
    }

    // QUERY FIX: Removed orderBy("createdAt", "desc") to avoid "Index Required" error.
    // We filter by userId and sort in memory.
    const q = query(
        collection(db, "magazines"), 
        where("userId", "==", user.uid)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mags = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Magazine));
      // Client-side sort: Newest first
      mags.sort((a, b) => b.createdAt - a.createdAt);
      setMagazines(mags);
    }, (error: any) => {
      console.error("Error fetching magazines:", error);
      if (error.code === 'permission-denied') {
        console.warn("Permiso denegado. Verifica las reglas de Firestore.");
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Helper to upload Blob URLs to Firebase Storage
  const uploadAsset = async (blobUrl: string, folder: string, id: string): Promise<string> => {
    // If it's already a remote URL or empty, return as is
    if (!blobUrl || !blobUrl.startsWith('blob:')) return blobUrl;
    
    // Security: Ensure user is logged in
    if (!user) throw new Error("Debes iniciar sesión para subir archivos.");

    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      
      // STORAGE PATH FIX: Store files in users/{uid}/{folder}/{id}
      // This matches the new storage.rules structure for security.
      const path = `users/${user.uid}/${folder}/${id}/${Date.now()}`;
      const fileRef = ref(storage, path);
      
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
    } catch (error: any) {
      console.error("Error adding magazine:", error);
      alert("Error al subir la revista. Verifica permisos o conexión.");
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
    } catch (error: any) {
      console.error("Error updating magazine:", error);
      alert("Error al actualizar.");
    }
  };

  const deleteMagazine = async (id: string) => {
    try {
      const mag = magazines.find(m => m.id === id);
      
      if (mag) {
        if (mag.pdfUrl && mag.pdfUrl.includes('firebasestorage')) {
          try {
            const pdfRef = ref(storage, mag.pdfUrl);
            await deleteObject(pdfRef);
          } catch (e) {
            console.warn(`Could not delete PDF for ${id}`, e);
          }
        }

        if (mag.coverImage && mag.coverImage.includes('firebasestorage')) {
          try {
            const coverRef = ref(storage, mag.coverImage);
            await deleteObject(coverRef);
          } catch (e) {
            console.warn(`Could not delete cover for ${id}`, e);
          }
        }
      }

      await deleteDoc(doc(db, "magazines", id));
    } catch (error) {
       console.error("Error deleting magazine:", error);
       alert("Error al eliminar la revista.");
    }
  };

  const getMagazine = (id: string) => magazines.find(m => m.id === id);

  // New method to fetch ANY magazine by slug or ID (Public Access)
  const getMagazineBySlug = async (slugOrId: string): Promise<Magazine | null> => {
      try {
        // 1. Try to find by Slug
        const q = query(collection(db, "magazines"), where("slug", "==", slugOrId), limit(1));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const d = snapshot.docs[0];
            return { id: d.id, ...d.data() } as Magazine;
        }

        // 2. Fallback: Try to find by ID (Direct Fetch)
        const docRef = doc(db, "magazines", slugOrId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() } as Magazine;
        }

        return null;
      } catch (e) {
          console.error("Error fetching public magazine", e);
          return null;
      }
  };

  return (
    <AppContext.Provider value={{ magazines, addMagazine, updateMagazine, deleteMagazine, getMagazine, getMagazineBySlug }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppStore must be used within AppProvider");
  return context;
};