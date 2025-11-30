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
  
  // Estado de navegación
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  
  // Dimensiones calculadas para ambos layouts (Single y Double)
  const [layoutDims, setLayoutDims] = useState({ 
      singleWidth: 0, 
      doubleWidth: 0, 
      height: 0 
  });
  const [isMobile, setIsMobile] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Determinamos si debemos usar la vista centrada (Single View)
  // 1. Es Móvil
  // 2. El documento solo tiene 1 página
  // 3. Estamos en la página 1 (Portada)
  // 4. Estamos en la última página (Contraportada)
  const isCover = currentPage === 1;
  const isBackCover = totalPages > 1 && currentPage === totalPages;
  const useSingleView = isMobile || (totalPages === 1) || isCover || isBackCover;

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

  // Resize Observer: Calcula dimensiones disponibles
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

      // Guardamos dimensiones pre-calculadas para evitar saltos al cambiar de página
      setLayoutDims({
          singleWidth: safeWidth,      // Ancho completo para portada/móvil
          doubleWidth: safeWidth / 2,  // Mitad de ancho para vista libro
          height: safeHeight
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Lógica de navegación
  const goToPrev = useCallback(() => {
    setCurrentPage(p => {
        if (isMobile) return Math.max(1, p - 1);
        if (p === 1) return 1;
        
        // Si estamos en la contraportada (vista simple), al volver queremos ver el último spread.
        if (p === totalPages && totalPages > 1) {
            // Si Total es impar (ej: 5). Spread anterior es 4-5? No, queremos 4(Izq)-5(Der) antes de cerrar.
            // Si p=5. Queremos ir al spread donde 4 es la página izquierda.
            // Si Total es par (ej: 4). Spread anterior es 2-3. p=4. Queremos ir a 2.
            
            // Si es impar, el spread anterior comienza en p-1 (ej: ir a 4 para ver 4-5).
            if (p % 2 !== 0) return p - 1;
            // Si es par, el spread anterior comienza en p-2 (ej: ir a 2 para ver 2-3).
            return p - 2;
        }

        // En Desktop standard:
        // Si estamos en página 2 o 3, volver nos lleva a la 1 (Portada centrada)
        if (p <= 3) return 1;
        
        // Si estamos más adelante (ej: 4-5), retrocedemos 2 páginas
        const target = p - 2; 
        // Aseguramos que caiga en el inicio del spread (par)
        return target % 2 === 0 ? target : target - 1; 
    });
  }, [isMobile, totalPages]);

  const goToNext = useCallback(() => {
    setCurrentPage(p => {
        if (isMobile) return Math.min(totalPages, p + 1);
        
        // En Desktop:
        // Si estamos en portada (1), vamos a 2 (que iniciará el spread 2-3)
        if (p === 1) return 2;
        
        // Calculamos el siguiente salto estándar (spread)
        const target = p % 2 === 0 ? p + 2 : p + 1;
        
        // Si el salto nos lleva a la última página o más allá, forzamos ir a la última página (Contraportada centrada)
        if (target >= totalPages) {
            return totalPages;
        }

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

  // Calcular páginas a mostrar
  let leftPageNum = -1;
  let rightPageNum = -1;

  if (useSingleView) {
    // Modo Single: Mostramos la página actual centrada
    // (Portada P1, Contraportada P-Ultima, o cualquier página en móvil)
    leftPageNum = currentPage; 
    rightPageNum = -1;
  } else {
    // Modo Libro (Desktop multipágina intermedio)
    // El spread siempre empieza en par (2, 4, 6...) a la izquierda
    const startSpread = currentPage % 2 === 0 ? currentPage : currentPage - 1;
    leftPageNum = startSpread;
    rightPageNum = startSpread + 1;
  }

  // Estado de botones
  const isFirst = currentPage === 1;
  const isLast = currentPage === totalPages;

  // Slot actual (ancho)
  const currentSlotWidth = useSingleView ? layoutDims.singleWidth : layoutDims.doubleWidth;

  // Helper para el título de la página
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
                     <button onClick={() => window.location.reload()} className="px-6 py-2 bg-dark-800 border border-white/10 text-white rounded-full font-medium hover:bg-dark-700 transition-colors">Recargar</button>
                     <a href={magazine.pdfUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-2 bg-brand-600 text-white rounded-full font-medium hover:bg-brand-500 transition-colors flex items-center gap-2"><ExternalLink className="w-4 h-4" /> Abrir Original</a>
                    <button onClick={onClose} className="px-6 py-2 bg-white text-dark-900 rounded-full font-medium hover:bg-gray-200 transition-colors">Cerrar</button>
                </div>
            </div>
        )}

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

                {!useSingleView && !loading && (
                    <>
                        <div onClick={goToPrev} className="absolute inset-y-0 left-0 w-[10%] z-30 cursor-pointer hover:bg-white/5 transition-colors" title="Página anterior" />
                        <div onClick={goToNext} className="absolute inset-y-0 right-0 w-[10%] z-30 cursor-pointer hover:bg-white/5 transition-colors" title="Página siguiente" />
                    </>
                )}
            </>
        )}

        {/* Contenedor del Libro */}
        {!error && totalPages > 0 && layoutDims.height > 0 && (
            <div 
                className="flex items-center justify-center w-full h-full transition-transform duration-300 gap-0"
                style={{ 
                    transform: `scale(${zoom})`, 
                    transformOrigin: 'center center' 
                }}
            >
                 {/* 
                    LÓGICA DE RENDERIZADO:
                    Si useSingleView es TRUE (Portada, Contraportada, Móvil o PDF de 1 página):
                      - Renderizamos UN solo contenedor centrado.
                    Si es FALSE (Libro abierto en Desktop):
                      - Renderizamos DOS contenedores (Izquierda y Derecha).
                 */}

                 {useSingleView ? (
                    // --- VISTA SIMPLE (CENTRADA) ---
                    <div 
                        style={{ width: currentSlotWidth, height: layoutDims.height }} 
                        className="flex justify-center items-center relative flex-shrink-0 animate-in fade-in duration-300"
                    >
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
                         <div style={{ width: currentSlotWidth, height: layoutDims.height }} className="flex justify-end items-center relative flex-shrink-0">
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
                         <div style={{ width: currentSlotWidth, height: layoutDims.height }} className="flex justify-start items-center relative flex-shrink-0">
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