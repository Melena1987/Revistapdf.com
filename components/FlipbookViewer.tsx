import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { getPdfDocument } from '../services/pdf';
import { Magazine } from '../types';

// --- Sub-componente para renderizar una página individual ---
interface PDFPageProps {
  pdfDoc: any;
  pageNum: number;
  containerWidth: number;
  containerHeight: number;
  scale: number; // Zoom del usuario
  className?: string;
}

const PDFPage: React.FC<PDFPageProps> = React.memo(({ pdfDoc, pageNum, containerWidth, containerHeight, scale, className = "" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(false);
  // Guardamos las dimensiones CSS exactas para centrar el canvas
  const [pageDims, setPageDims] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || pageNum <= 0 || pageNum > pdfDoc.numPages || containerWidth <= 0 || containerHeight <= 0) return;

    const render = async () => {
      try {
        setIsRendering(true);
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
        }

        const page = await pdfDoc.getPage(pageNum);
        
        // 1. Obtener viewport base para conocer las proporciones reales del PDF
        const baseViewport = page.getViewport({ scale: 1 });
        
        // 2. Calcular el factor de escala para que encaje ("contain") en el contenedor disponible
        const widthScale = containerWidth / baseViewport.width;
        const heightScale = containerHeight / baseViewport.height;
        // Elegimos el menor para asegurar que todo el contenido es visible sin deformarse
        const fitScale = Math.min(widthScale, heightScale);
        
        // 3. Aplicar zoom del usuario y densidad de píxeles (Retina display support)
        const dpr = window.devicePixelRatio || 1;
        const totalScale = fitScale * scale; 
        
        // Viewport final para el renderizado
        const scaledViewport = page.getViewport({ scale: totalScale * dpr });

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Dimensiones del buffer (resolución física)
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        // Dimensiones visuales CSS (resolución lógica)
        const cssWidth = scaledViewport.width / dpr;
        const cssHeight = scaledViewport.height / dpr;
        setPageDims({ width: cssWidth, height: cssHeight });

        const context = canvas.getContext('2d');
        if (!context) return;

        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
        };

        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
        setIsRendering(false);
      } catch (error: any) {
        if (error.name !== 'RenderingCancelledException') {
            console.error(`Error rendering page ${pageNum}:`, error);
        }
        setIsRendering(false);
      }
    };

    render();

    return () => {
        if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
        }
    };
  }, [pdfDoc, pageNum, containerWidth, containerHeight, scale]);

  if (pageNum <= 0 || (pdfDoc && pageNum > pdfDoc.numPages)) {
    return <div className={`w-full h-full ${className}`} />;
  }

  return (
    <div className={`relative flex items-center ${className}`} style={{ width: '100%', height: '100%' }}>
      {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
          </div>
      )}
      <canvas 
        ref={canvasRef} 
        className="shadow-xl bg-white block select-none transition-transform duration-200"
        style={{
            // Aplicamos dimensiones explícitas para respetar aspect ratio
            width: pageDims ? `${pageDims.width}px` : 'auto',
            height: pageDims ? `${pageDims.height}px` : 'auto',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain'
        }}
      />
    </div>
  );
});

// --- Componente Principal ---

interface FlipbookViewerProps {
  magazine: Magazine;
  onClose: () => void;
}

const FlipbookViewer: React.FC<FlipbookViewerProps> = ({ magazine, onClose }) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Estado de navegación: Usamos 'currentPage' (1-based) como referencia principal
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isMobile, setIsMobile] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Cargar PDF
  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      try {
        const doc = await getPdfDocument(magazine.pdfUrl);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
      } catch (error) {
        console.error("Error loading PDF", error);
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
      const paddingX = mobile ? 20 : 60; // Margen lateral total
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
        // Si estamos en 3 (Spread 2-3), ir a 1.
        // Si estamos en 1, quedarse en 1.
        if (p === 1) return 1;
        const target = p - 2; // Retroceder un spread
        // Si el target cae en par (2), queremos que sea el inicio del spread (2,3).
        // Si el target cae en 0 o 1, ir a 1.
        return Math.max(1, target % 2 === 0 ? target : target - 1); 
    });
  }, [isMobile]);

  const goToNext = useCallback(() => {
    setCurrentPage(p => {
        if (isMobile) return Math.min(totalPages, p + 1);
        // Desktop: Avanzar 2 páginas
        // Si estamos en 1 (Portada), ir a 2 (Spread 2-3).
        // Si estamos en 2 (Spread 2-3), ir a 4 (Spread 4-5).
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
    // Si currentPage es 1 -> Portada (L: null, R: 1)
    // Si currentPage > 1 -> Asumimos spreads estándar (2-3, 4-5, etc)
    // Ajustamos currentPage para que apunte al inicio del spread correcto
    
    if (currentPage === 1) {
        leftPageNum = -1;
        rightPageNum = 1;
    } else {
        // Asegurar que empezamos en par. Si estamos en 3, realmente estamos viendo spread 2-3.
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
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-dark-800 shrink-0 shadow-md z-50">
        <div className="flex items-center gap-4">
            <h1 className="text-white font-medium truncate max-w-[150px] sm:max-w-md text-sm sm:text-base">{magazine.title}</h1>
            <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded border border-white/5 whitespace-nowrap hidden sm:inline-block">
                {isMobile 
                  ? `Pág ${leftPageNum}` 
                  : (leftPageNum === -1 ? `Portada (${rightPageNum})` : `Págs ${leftPageNum} - ${rightPageNum > totalPages ? '-' : rightPageNum}`)
                } / {totalPages}
            </span>
        </div>
        
        <div className="flex items-center gap-2">
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="p-2 text-gray-400 hover:text-white" aria-label="Alejar"><ZoomOut className="w-5 h-5"/></button>
            <span className="text-xs text-gray-500 w-12 text-center hidden sm:inline-block">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="p-2 text-gray-400 hover:text-white" aria-label="Acercar"><ZoomIn className="w-5 h-5"/></button>
            <div className="w-px h-6 bg-white/10 mx-2"></div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full" aria-label="Cerrar">
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Area Principal */}
      <div className="flex-1 relative bg-[#1a1d21] flex items-center justify-center overflow-hidden">
        
        {loading && (
             <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-dark-900/50 backdrop-blur-sm">
                <Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-4" />
                <span className="text-white font-medium">Cargando revista...</span>
             </div>
        )}

        {/* Botones de Navegación */}
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

        {/* Contenedor del Libro */}
        <div 
            ref={containerRef}
            className="flex items-center justify-center w-full h-full transition-transform duration-200"
            style={{ 
                // Aplicamos zoom al contenedor
                transform: `scale(${zoom})`, 
                transformOrigin: 'center center' 
            }}
        >
             {/* Renderizado Página Izquierda (Solo Desktop) */}
             {!isMobile && (
                 <div style={{ width: containerSize.width, height: containerSize.height }} className="flex justify-end items-center relative">
                    {leftPageNum > 0 && leftPageNum <= totalPages && (
                        <PDFPage 
                            pdfDoc={pdfDoc} 
                            pageNum={leftPageNum} 
                            containerWidth={containerSize.width} 
                            containerHeight={containerSize.height} 
                            scale={1} // El zoom ya se aplica al padre, pasamos 1 para cálculo relativo
                            className="origin-right justify-end"
                        />
                    )}
                 </div>
             )}

             {/* Renderizado Página Derecha (Desktop) o Principal (Móvil) */}
             <div 
                style={{ width: containerSize.width, height: containerSize.height }} 
                className={`flex ${isMobile ? 'justify-center' : 'justify-start'} items-center relative`}
             >
                {(isMobile ? leftPageNum : rightPageNum) > 0 && (isMobile ? leftPageNum : rightPageNum) <= totalPages && (
                     <PDFPage 
                        pdfDoc={pdfDoc} 
                        pageNum={isMobile ? leftPageNum : rightPageNum} 
                        containerWidth={containerSize.width} 
                        containerHeight={containerSize.height}
                        scale={1}
                        className={isMobile ? "origin-center justify-center" : "origin-left justify-start"}
                     />
                )}
             </div>

             {/* Línea central (Solo desktop cuando hay dos páginas visibles) */}
             {!isMobile && leftPageNum > 0 && rightPageNum > 0 && rightPageNum <= totalPages && (
                 <div className="absolute h-[95%] w-px bg-gradient-to-b from-transparent via-black/40 to-transparent z-10" />
             )}
        </div>

      </div>
    </div>
  );
};

export default FlipbookViewer;