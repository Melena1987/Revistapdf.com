import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Loader2, AlertCircle, ExternalLink, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getPdfDocument } from '../services/pdf';
import { Magazine } from '../types';
import { PDFPage } from './PDFPage';
import { useAuth } from '../store/auth-context';

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
  
  // Navigation State
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  
  // Pan/Drag State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false); // To distinguish click vs drag

  // Dimension Calculation
  const [layoutDims, setLayoutDims] = useState({ 
      singleWidth: 0, 
      doubleWidth: 0, 
      height: 0 
  });
  const [isMobile, setIsMobile] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Layout Logic
  const isCover = currentPage === 1;
  const isBackCover = totalPages > 1 && currentPage === totalPages;
  const useSingleView = isMobile || (totalPages === 1) || isCover || isBackCover;

  // Load PDF
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

  // Resize Observer
  useEffect(() => {
    if (!containerRef.current) return;

    const measure = (entries: ResizeObserverEntry[]) => {
      const entry = entries[0];
      if (!entry) return;

      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;

      const mobile = width < 768;
      setIsMobile(mobile);

      const paddingX = mobile ? 20 : 40; 
      const paddingY = 40;
      
      const safeWidth = width - paddingX;
      const safeHeight = height - paddingY;

      setLayoutDims({
          singleWidth: safeWidth,
          doubleWidth: safeWidth / 2,
          height: safeHeight
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Reset Zoom/Pan on page change
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [currentPage]);

  // Navigation Logic
  const goToPrev = useCallback(() => {
    setCurrentPage(p => {
        if (isMobile) return Math.max(1, p - 1);
        if (p === 1) return 1;
        
        if (p === totalPages && totalPages > 1) {
            if (p % 2 !== 0) return Math.max(1, p - 1);
            return Math.max(1, p - 2);
        }

        if (p <= 3) return 1;
        
        const target = p - 2; 
        return Math.max(1, target % 2 === 0 ? target : target - 1); 
    });
  }, [isMobile, totalPages]);

  const goToNext = useCallback(() => {
    setCurrentPage(p => {
        if (isMobile) return Math.min(totalPages, p + 1);
        
        if (p === 1) return 2;
        
        const target = p % 2 === 0 ? p + 2 : p + 1;
        
        if (target >= totalPages) {
            return totalPages;
        }

        return target;
    });
  }, [isMobile, totalPages]);

  // Handle Page Turn Click (Prevents turning if user was dragging)
  const handlePageClick = useCallback((direction: 'prev' | 'next') => {
      // If zoomed in and moved significantly, assume drag, do not turn page
      if (zoom > 1 && hasMovedRef.current) {
          return;
      }
      if (direction === 'prev') goToPrev();
      else goToNext();
  }, [zoom, goToPrev, goToNext]);

  // Keyboard Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, onClose]);

  // Mouse Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
        setIsDragging(true);
        hasMovedRef.current = false;
        dragStartRef.current = { x: e.clientX, y: e.clientY };
        panStartRef.current = { ...pan };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
        e.preventDefault();
        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        
        // Threshold to distinguish click from drag
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            hasMovedRef.current = true;
        }

        setPan({
            x: panStartRef.current.x + dx,
            y: panStartRef.current.y + dy
        });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  // Calculate pages
  let leftPageNum = -1;
  let rightPageNum = -1;

  if (useSingleView) {
    leftPageNum = currentPage; 
    rightPageNum = -1;
  } else {
    const startSpread = currentPage % 2 === 0 ? currentPage : currentPage - 1;
    leftPageNum = startSpread;
    rightPageNum = startSpread + 1;
  }

  const isFirst = currentPage === 1;
  const isLast = currentPage === totalPages;
  const currentSlotWidth = useSingleView ? layoutDims.singleWidth : layoutDims.doubleWidth;

  const getPageLabel = () => {
    if (totalPages === 0) return 'Cargando...';
    if (useSingleView) {
        if (currentPage === 1) return 'Portada';
        if (currentPage === totalPages && totalPages > 1) return 'Contraportada';
        return `Pág ${currentPage}`;
    }
    const endPage = rightPageNum > totalPages ? '-' : rightPageNum;
    return `Págs ${leftPageNum} - ${endPage}`;
  };

  // Zoom control helper
  const updateZoom = (newZoom: number) => {
      setZoom(newZoom);
      if (newZoom <= 1) setPan({ x: 0, y: 0 }); // Reset pan if zoomed out
  };

  return (
    <div className="fixed inset-0 z-50 bg-dark-900 flex flex-col h-screen overflow-hidden animate-in fade-in duration-200">
      
      {/* Header */}
      <div className="h-16 border-b border-white/10 flex items-center justify-between px-4 bg-dark-800 shrink-0 shadow-md z-50">
        <div className="flex items-center gap-4">
            <h1 className="text-white font-medium truncate max-w-[100px] sm:max-w-md text-sm sm:text-base">{magazine.title}</h1>
            <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded border border-white/5 whitespace-nowrap hidden md:inline-block">
                {getPageLabel()} 
                {totalPages > 0 && ` / ${totalPages}`}
            </span>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
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
                <button onClick={() => updateZoom(Math.max(1, zoom - 0.5))} className="p-1.5 text-gray-400 hover:text-white transition-colors" aria-label="Alejar"><ZoomOut className="w-4 h-4"/></button>
                <span className="text-xs text-gray-500 w-10 text-center hidden sm:inline-block">{Math.round(zoom * 100)}%</span>
                <button onClick={() => updateZoom(Math.min(3, zoom + 0.5))} className="p-1.5 text-gray-400 hover:text-white transition-colors" aria-label="Acercar"><ZoomIn className="w-4 h-4"/></button>
            </div>

            <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block"></div>
            
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" aria-label="Cerrar">
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Area Principal */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-[#1a1d21] flex items-center justify-center overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
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
                     <button onClick={() => window.location.reload()} className="px-6 py-2 bg-dark-800 border border-white/10 text-white rounded-full font-medium hover:bg-dark-700 transition-colors">Recargar</button>
                     <a href={magazine.pdfUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-2 bg-brand-600 text-white rounded-full font-medium hover:bg-brand-500 transition-colors flex items-center gap-2"><ExternalLink className="w-4 h-4" /> Abrir Original</a>
                    <button onClick={onClose} className="px-6 py-2 bg-white text-dark-900 rounded-full font-medium hover:bg-gray-200 transition-colors">Cerrar</button>
                </div>
            </div>
        )}

        {!error && totalPages > 0 && zoom === 1 && (
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
            </>
        )}

        {/* Contenedor del Libro */}
        {!error && totalPages > 0 && layoutDims.height > 0 && (
            <div 
                className="flex items-center justify-center w-full h-full transition-transform duration-100 ease-out gap-0"
                style={{ 
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, 
                    transformOrigin: 'center center',
                    willChange: 'transform'
                }}
            >
                 {useSingleView ? (
                    // --- VISTA SIMPLE (CENTRADA) ---
                    <div 
                        style={{ width: currentSlotWidth, height: layoutDims.height }} 
                        className="flex justify-center items-center relative flex-shrink-0 animate-in fade-in duration-300"
                    >
                        {/* Page Overlay Click Handlers for Single View - Only trigger if not dragging */}
                        <div className="absolute inset-0 z-20 flex">
                            <div className="w-1/2 h-full cursor-pointer" onClick={(e) => { e.stopPropagation(); handlePageClick('prev'); }} title="Anterior"></div>
                            <div className="w-1/2 h-full cursor-pointer" onClick={(e) => { e.stopPropagation(); handlePageClick('next'); }} title="Siguiente"></div>
                        </div>

                        <PDFPage 
                            pdfDoc={pdfDoc} 
                            pageNum={leftPageNum} // En single view, leftPageNum contiene la página actual
                            containerWidth={currentSlotWidth} 
                            containerHeight={layoutDims.height}
                            scale={1}
                            variant="single"
                        />
                    </div>
                 ) : (
                    // --- VISTA DOBLE (LIBRO) ---
                    <>
                         {/* Página Izquierda */}
                         <div 
                            style={{ width: currentSlotWidth, height: layoutDims.height }} 
                            className="flex justify-end items-center relative flex-shrink-0 cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); handlePageClick('prev'); }}
                            title="Página Anterior"
                         >
                            {leftPageNum > 0 && leftPageNum <= totalPages && (
                                <PDFPage 
                                    pdfDoc={pdfDoc} 
                                    pageNum={leftPageNum} 
                                    containerWidth={currentSlotWidth} 
                                    containerHeight={layoutDims.height} 
                                    scale={1} 
                                    variant="left"
                                />
                            )}
                         </div>

                         {/* Lomo / Sombra central */}
                         {leftPageNum > 0 && rightPageNum > 0 && rightPageNum <= totalPages && (
                             <div className="absolute h-[95%] w-px bg-gradient-to-b from-transparent via-black/40 to-transparent z-10 left-1/2 -ml-px" />
                         )}

                         {/* Página Derecha */}
                         <div 
                            style={{ width: currentSlotWidth, height: layoutDims.height }} 
                            className="flex justify-start items-center relative flex-shrink-0 cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); handlePageClick('next'); }}
                            title="Siguiente Página"
                         >
                            {rightPageNum > 0 && rightPageNum <= totalPages && (
                                 <PDFPage 
                                    pdfDoc={pdfDoc} 
                                    pageNum={rightPageNum} 
                                    containerWidth={currentSlotWidth} 
                                    containerHeight={layoutDims.height}
                                    scale={1}
                                    variant="right"
                                 />
                            )}
                         </div>
                    </>
                 )}
            </div>
        )}

      </div>
    </div>
  );
};

export default FlipbookViewer;