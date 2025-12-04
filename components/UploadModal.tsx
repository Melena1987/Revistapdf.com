import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Loader2, Check, RefreshCw } from 'lucide-react';
import { analyzePdf } from '../services/gemini';
import { generateCoverThumbnail, getPdfDocument } from '../services/pdf';
import { useAppStore } from '../store/context';
import { Magazine } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  magazineToEdit?: Magazine | null;
}

const createSlug = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD") // Split accents from letters
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
    .replace(/-+/g, "-"); // Replace multiple hyphens with single
};

const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, magazineToEdit }) => {
  const { addMagazine, updateMagazine } = useAppStore();
  const [step, setStep] = useState<'upload' | 'analyzing' | 'review'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  
  // Metadata state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [isAiSuggested, setIsAiSuggested] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize state when modal opens or editing target changes
  useEffect(() => {
    if (isOpen) {
        if (magazineToEdit) {
            // Edit Mode
            setTitle(magazineToEdit.title);
            setDescription(magazineToEdit.description);
            setCategory(magazineToEdit.category || '');
            setPreviewUrl(magazineToEdit.coverImage || '');
            setStep('review'); // Skip upload step
            setFile(null); // No new file yet
            setIsAiSuggested(false);
        } else {
            // Create Mode
            setStep('upload');
            setFile(null);
            setPreviewUrl('');
            setTitle('');
            setDescription('');
            setCategory('');
            setIsAiSuggested(false);
        }
    }
  }, [isOpen, magazineToEdit]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setStep('analyzing');
      
      try {
        // Parallel execution: Get Cover & Analyze Text
        const [coverUrl, analysis] = await Promise.all([
          generateCoverThumbnail(selectedFile),
          analyzePdf(selectedFile)
        ]);

        setPreviewUrl(coverUrl);
        setTitle(analysis.title);
        setDescription(analysis.description);
        setCategory(analysis.category);
        setIsAiSuggested(!!analysis.isGenerated);
        
      } catch (error) {
        console.error("Error processing file", error);
      } finally {
        setStep('review');
      }
    }
  };

  const handleSave = async () => {
    const slug = createSlug(title);

    if (magazineToEdit) {
        // --- EDIT MODE ---
        const updates: Partial<Magazine> = {
            title,
            description,
            category,
            slug // Update slug if title changes
        };

        // If a new file was uploaded, process PDF details
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            const pdf = await getPdfDocument(objectUrl);
            updates.pdfUrl = objectUrl;
            updates.coverImage = previewUrl;
            updates.pageCount = pdf.numPages;
        }

        updateMagazine(magazineToEdit.id, updates);
    } else {
        // --- CREATE MODE ---
        if (!file) return;

        const objectUrl = URL.createObjectURL(file);
        const pdf = await getPdfDocument(objectUrl);
        
        const newMagazine: Magazine = {
            id: crypto.randomUUID(),
            title,
            description,
            category,
            pdfUrl: objectUrl, // Blob URL
            coverImage: previewUrl,
            createdAt: Date.now(),
            pageCount: pdf.numPages,
            slug
        };
        addMagazine(newMagazine);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-800 w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-dark-900/50">
          <h2 className="text-xl font-semibold text-white">
            {magazineToEdit ? 'Editar Revista' : 'Nueva Revista'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {step === 'upload' && (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-600 rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:border-brand-500 hover:bg-brand-500/5 transition-all group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="application/pdf"
                onChange={handleFileChange}
              />
              <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-4 group-hover:bg-brand-500/20 group-hover:text-brand-400 transition-colors">
                <Upload className="w-8 h-8 text-gray-400 group-hover:text-brand-500" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                {magazineToEdit ? 'Subir nuevo PDF' : 'Sube tu archivo PDF'}
              </h3>
              <p className="text-gray-400 text-sm">Arrastra y suelta o haz clic para actualizar</p>
            </div>
          )}

          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-brand-500 animate-spin mb-4" />
              <h3 className="text-xl font-medium text-white mb-2">Analizando documento...</h3>
              <p className="text-gray-400 text-center max-w-md">
                Nuestra IA está leyendo el contenido para sugerir un título, descripción y categoría automáticamente.
              </p>
            </div>
          )}

          {step === 'review' && (
            <div className="grid md:grid-cols-3 gap-6">
              {/* Preview */}
              <div className="md:col-span-1 space-y-3">
                <div className="aspect-[1/1.4] bg-gray-800 rounded-lg overflow-hidden border border-white/10 shadow-lg relative group">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">No Preview</div>
                  )}
                </div>
                
                <button 
                    onClick={() => { setStep('upload'); }}
                    className="w-full py-2 flex items-center justify-center gap-2 border border-dashed border-gray-600 rounded-lg text-sm text-gray-400 hover:text-white hover:border-brand-500 hover:bg-brand-500/5 transition-all"
                >
                    <RefreshCw className="w-3 h-3" />
                    {file ? 'Cambiar PDF seleccionado' : 'Reemplazar PDF actual'}
                </button>
              </div>

              {/* Form */}
              <div className="md:col-span-2 space-y-4">
                 <div>
                    <div className="flex items-center gap-2 mb-1">
                        <label className="text-sm font-medium text-gray-300">Título</label>
                        {isAiSuggested && (
                            <span className="text-xs text-brand-400 flex items-center gap-1 bg-brand-500/10 px-2 py-0.5 rounded-full">
                                <Check className="w-3 h-3" /> Sugerido por IA
                            </span>
                        )}
                    </div>
                   <input 
                     type="text" 
                     value={title}
                     onChange={(e) => setTitle(e.target.value)}
                     className="w-full bg-dark-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                   />
                 </div>

                 <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Categoría</label>
                   <input 
                     type="text" 
                     value={category}
                     onChange={(e) => setCategory(e.target.value)}
                     className="w-full bg-dark-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
                   />
                 </div>

                 <div>
                   <label className="block text-sm font-medium text-gray-300 mb-1">Descripción</label>
                   <textarea 
                     rows={4}
                     value={description}
                     onChange={(e) => setDescription(e.target.value)}
                     className="w-full bg-dark-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all resize-none"
                     placeholder="Escribe una descripción..."
                   />
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'review' && (
            <div className="p-4 border-t border-white/10 bg-dark-900/50 flex justify-end gap-3">
                <button 
                    onClick={onClose}
                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
                >
                    Cancelar
                </button>
                <button 
                    onClick={handleSave}
                    className="px-6 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium shadow-lg shadow-brand-900/20 transition-all"
                >
                    {magazineToEdit ? 'Guardar Cambios' : 'Publicar Revista'}
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default UploadModal;