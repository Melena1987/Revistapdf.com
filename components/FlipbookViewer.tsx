import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Loader2, AlertCircle, ExternalLink, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPdfDocument } from '../services/pdf';
import { Magazine } from '../types';
import { PDFPage } from './PDFPage';
import { useAuth } from '../src/store/auth-context';

interface FlipbookViewerProps {
  magazine: Magazine;
  onClose: () => void;
}

const FlipbookViewer: React.FC<FlipbookViewerProps> = ({ magazine, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estado de navegación: Usamos 'currentPage' (1-based) como referencia principal
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isMobile, setIsMobile] = useState(false);
  
  // Ref movida al contenedor principal que siempre existe para asegurar medición correcta
  const containerRef = useRef<HTMLDivElement>(null);

  // Cargar PDF
  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const doc = await getPdfDocument(magazine.pdfUrl);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
      } catch (err: any) {
        console.error("Error loading PDF", err);
        let msg = "No se pudo cargar el documento.";
        // Detect CORS or Network errors generally wrapped in UnknownErrorException by PDF.js
        if (err.name === 'UnknownErrorException' || err.message?.includes('Network') || err.name === 'MissingPDFException') {
            msg = "Error de acceso al archivo (Posible bloqueo CORS). Verifica la configuración de tu almacenamiento.";
        }
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    loadPdf();
  }, [magazine.pdfUrl]);

  // Resize Observer: Detecta móvil y tamaño disponible para renderizar
  useEffect(() => {
    if (!containerRef.current) return;

    const measure = (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;

      // Detectar móvil (breakpoint 768px)
      const mobile = width < 768;
      setIsMobile(mobile);

      // Calcular espacio para CADA slot de página
      const paddingX = mobile ? 20 : 40; // Margen lateral total reducido para PC
      const paddingY = 40; // Margen vertical total
      
      const safeWidth = width - paddingX;
      const safeHeight = height - paddingY;

      // En móvil, el slot es todo el ancho. En desktop, es la mitad.
      const slotWidth = mobile ? safeWidth : safeWidth / 2;
      
      setContainerSize({ width: slotWidth, height: safeHeight });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Lógica de navegación unificada
  const goToPrev = useCallback(() => {
    setCurrentPage(p => {
        if (isMobile) return Math.max(1, p - 1);
        // Desktop: Retroceder 2 páginas (o ir a portada)
        if (p === 1) return 1;
        const target = p - 2; 
        return Math.max(1, target % 2 === 0 ? target : target - 1); 
    });
  }, [isMobile]);

  const goToNext = useCallback(() => {
    setCurrentPage(p => {
        if (isMobile) return Math.min(totalPages, p + 1);
        // Desktop: Avanzar 2 páginas
        const target = p === 1 ? 2 : (p % 2 === 0 ? p + 2 : p + 1);
        if (target > totalPages) return p;
        return target;
    });
  }, [isMobile, totalPages]);

  // Manejo de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, onClose]);

  // Calcular qué páginas mostrar
  let leftPageNum = -1;
  let rightPageNum = -1;

  if (isMobile) {
    // Móvil: Solo mostramos la página actual
    leftPageNum = currentPage;
    rightPageNum = -1;
  } else {
    // Escritorio: Modo Libro
    if (currentPage === 1) {
        leftPageNum = -1;
        rightPageNum = 1;
    } else {
        const startSpread = currentPage % 2 === 0 ? currentPage : currentPage - 1;
        leftPageNum = startSpread;
        rightPageNum = startSpread + 1;
    }
  }

  // Estado de botones
  const isFirst = currentPage === 1;
  const isLast = isMobile 
    ? currentPage >= totalPages 
    : (rightPageNum >= totalPages || leftPageNum >= totalPages);

  return (
    <div className="fixed inset-0 z-50 bg-dark-900 flex flex-col h-screen overflow-hidden animate-in fade-in duration-200">
      
      {/* Header */}
      <div className="h-16 border-b border-white/10 flex items-center justify-between px-4 bg-dark-800 shrink-0 shadow-md z-50">
        <div className="flex items-center gap-4">
            <h1 className="text-white font-medium truncate max-w-[100px] sm:max-w-md text-sm sm:text-base">{magazine.title}</h1>
            <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded border border-white/5 whitespace-nowrap hidden md:inline-block">
                {totalPages > 0 ? (
                    isMobile 
                    ? `Pág ${leftPageNum}` 
                    : (leftPageNum === -1 ? `Portada (${rightPageNum})` : `Págs ${leftPageNum} - ${rightPageNum > totalPages ? '-' : rightPageNum}`)
                ) : 'Cargando...'} 
                {totalPages > 0 && ` / ${totalPages}`}
            </span>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
            
            {/* CTA for Non-Logged Users */}
            {!user && (
                <button 
                    onClick={() => navigate('/login')}
                    className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white text-xs sm:text-sm font-medium rounded-full shadow-lg shadow-brand-500/20 transition-all transform hover:scale-105 mr-2"
                >
                    <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-300" />
                    <span>¿Quieres crear tu revista PDF?</span>
                </button>
            )}

            <div className="flex items-center bg-dark-900/50 rounded-lg p-1 border border-white/5">
                <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-1.5 text-gray-400 hover:text-white transition-colors" aria-label="Alejar"><ZoomOut className="w-4 h-4"/></button>
                <span className="text-xs text-gray-500 w-10 text-center hidden sm:inline-block">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-1.5 text-gray-400 hover:text-white transition-colors" aria-label="Acercar"><ZoomIn className="w-4 h-4"/></button>
            </div>

            <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block"></div>
            
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" aria-label="Cerrar">
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* CTA Mobile (Sub-header) */}
      {!user && (
         <div className="sm:hidden bg-brand-900/30 border-b border-brand-500/20 py-2 px-4 flex justify-between items-center">
             <span className="text-xs text-brand-100">Crea tu propio flipbook digital</span>
             <button onClick={() => navigate('/login')} className="text-xs font-bold text-brand-400 hover:text-brand-300">Empezar</button>
         </div>
      )}

      {/* Area Principal */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-[#1a1d21] flex items-center justify-center overflow-hidden"
      >
        
        {loading && (
             <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-900/50 backdrop-blur-sm">
                <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-4" />
                <span className="text-white font-medium">Cargando documento...</span>
             </div>
        )}

        {error && (
            <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-dark-900 p-4 text-center animate-in fade-in zoom-in-95 duration-200">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Error de lectura</h3>
                <p className="text-gray-400 max-w-md mb-6">{error}</p>
                <div className="flex gap-4 flex-wrap justify-center">
                     <button 
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 bg-dark-800 border border-white/10 text-white rounded-full font-medium hover:bg-dark-700 transition-colors"
                    >
                        Recargar
                    </button>
                    <a 
                        href={magazine.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-2 bg-brand-600 text-white rounded-full font-medium hover:bg-brand-500 transition-colors flex items-center gap-2"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Abrir Original
                    </a>
                    <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-white text-dark-900 rounded-full font-medium hover:bg-gray-200 transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        )}

        {/* Botones de Navegación (solo si no hay error y hay páginas) */}
        {!error && totalPages > 0 && (
            <>
                <button 
                    onClick={goToPrev}
                    disabled={isFirst}
                    className="absolute left-2 sm:left-6 z-40 p-2 sm:p-3 rounded-full bg-dark-900/90 text-white hover:bg-brand-600 disabled:opacity-0 disabled:pointer-events-none transition-all shadow-xl border border-white/10"
                >
                    <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>

                <button 
                    onClick={goToNext}
                    disabled={isLast}
                    className="absolute right-2 sm:right-6 z-40 p-2 sm:p-3 rounded-full bg-dark-900/90 text-white hover:bg-brand-600 disabled:opacity-0 disabled:pointer-events-none transition-all shadow-xl border border-white/10"
                >
                    <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
                </button>

                {/* Zonas de clic invisibles en los bordes para facilitar navegación en Desktop */}
                {!isMobile && !loading && (
                    <>
                        <div onClick={goToPrev} className="absolute inset-y-0 left-0 w-[10%] z-30 cursor-pointer hover:bg-white/5 transition-colors" title="Página anterior" />
                        <div onClick={goToNext} className="absolute inset-y-0 right-0 w-[10%] z-30 cursor-pointer hover:bg-white/5 transition-colors" title="Página siguiente" />
                    </>
                )}
            </>
        )}

        {/* Contenedor del Libro */}
        {!error && totalPages > 0 && (
            <div 
                className="flex items-center justify-center w-full h-full transition-transform duration-200 gap-0"
                style={{ 
                    transform: `scale(${zoom})`, 
                    transformOrigin: 'center center' 
                }}
            >
                 {/* Renderizado Página Izquierda (Solo Desktop) */}
                 {!isMobile && (
                     <div style={{ width: containerSize.width, height: containerSize.height }} className="flex justify-end items-center relative flex-shrink-0">
                        {leftPageNum > 0 && leftPageNum <= totalPages && (
                            <PDFPage 
                                pdfDoc={pdfDoc} 
                                pageNum={leftPageNum} 
                                containerWidth={containerSize.width} 
                                containerHeight={containerSize.height} 
                                scale={1} 
                                variant="left"
                            />
                        )}
                     </div>
                 )}

                 {/* Renderizado Página Derecha (Desktop) o Principal (Móvil) */}
                 <div 
                    style={{ width: containerSize.width, height: containerSize.height }} 
                    className={`flex ${isMobile ? 'justify-center' : 'justify-start'} items-center relative flex-shrink-0`}
                 >
                    {(isMobile ? leftPageNum : rightPageNum) > 0 && (isMobile ? leftPageNum : rightPageNum) <= totalPages && (
                         <PDFPage 
                            pdfDoc={pdfDoc} 
                            pageNum={isMobile ? leftPageNum : rightPageNum} 
                            containerWidth={containerSize.width} 
                            containerHeight={containerSize.height}
                            scale={1}
                            variant={isMobile ? 'single' : 'right'}
                         />
                    )}
                 </div>

                 {/* Línea central (Solo desktop cuando hay dos páginas visibles) */}
                 {!isMobile && leftPageNum > 0 && rightPageNum > 0 && rightPageNum <= totalPages && (
                     <div className="absolute h-[95%] w-px bg-gradient-to-b from-transparent via-black/40 to-transparent z-10 left-1/2 -ml-px" />
                 )}
            </div>
        )}

      </div>
    </div>
  );
};

export default FlipbookViewer;