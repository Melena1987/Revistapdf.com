
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Loader2, AlertCircle, Download, Share2, Maximize2 } from 'lucide-react';
import HTMLFlipBook from 'react-pageflip';
import { getPdfDocument } from '../services/pdf';
import { Magazine } from '../types';
import { PDFPage } from './PDFPage';
import { useAuth } from '../store/auth-context';
import ShareModal from './ShareModal';

const Page = React.forwardRef<HTMLDivElement, any>((props, ref) => {
    return (
        <div ref={ref} className="bg-white shadow-sm overflow-hidden" style={{ padding: 0 }}>
            <div className="w-full h-full relative">
                 {props.children}
                 <div className="absolute bottom-2 right-4 text-[10px] text-gray-400 z-30 font-sans">
                    {props.number}
                 </div>
            </div>
        </div>
    );
});

interface FlipbookViewerProps {
  magazine: Magazine;
  onClose: () => void;
}

const FlipbookViewer: React.FC<FlipbookViewerProps> = ({ magazine, onClose }) => {
  const { user } = useAuth();
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  
  const [bookDimensions, setBookDimensions] = useState({ width: 0, height: 0 });
  const [pdfAspectRatio, setPdfAspectRatio] = useState(0.7071);
  const [isMobileMode, setIsMobileMode] = useState(window.innerWidth < 768);

  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      try {
        const doc = await getPdfDocument(magazine.pdfUrl);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        if (viewport.width && viewport.height) setPdfAspectRatio(viewport.width / viewport.height);
      } catch (err) {
        setError("No se pudo cargar el documento.");
      } finally {
        setLoading(false);
      }
    };
    loadPdf();
  }, [magazine.pdfUrl]);

  useEffect(() => {
    const handleResize = () => {
        if (!containerRef.current) return;
        
        const mobile = window.innerWidth < 768;
        setIsMobileMode(mobile);
        
        const maxWidth = window.innerWidth;
        // Altura disponible: Total - Header (56px) - Footer (80px en movil, 64px en pc)
        const footerHeight = mobile ? 80 : 64;
        const headerHeight = 56;
        const maxHeight = window.innerHeight - headerHeight - footerHeight - 40; // 40px padding extra
        
        let pageW, pageH;
        if (mobile) {
            pageW = maxWidth - 32;
            pageH = pageW / pdfAspectRatio;
            if (pageH > maxHeight) {
                pageH = maxHeight;
                pageW = pageH * pdfAspectRatio;
            }
        } else {
            pageW = (maxWidth - 120) / 2;
            pageH = pageW / pdfAspectRatio;
            if (pageH > maxHeight) {
                pageH = maxHeight;
                pageW = pageH * pdfAspectRatio;
            }
        }
        setBookDimensions({ width: Math.floor(pageW), height: Math.floor(pageH) });
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [pdfAspectRatio]);

  const handleFlip = useCallback((e: any) => {
    setCurrentPageIndex(e.data);
  }, []);

  const updateZoom = (val: number) => {
      const newZoom = Math.min(Math.max(1, val), 4);
      setZoom(newZoom);
      if (newZoom === 1) setPan({ x: 0, y: 0 });
  };

  const handleShare = async () => {
    const identifier = magazine.slug || magazine.id;
    const shareUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}#/view/${identifier}`;
    
    if (navigator.share) {
        try {
            await navigator.share({
                title: magazine.title,
                text: `Lee "${magazine.title}" en formato revista digital`,
                url: shareUrl,
            });
        } catch (err) {
            if ((err as Error).name !== 'AbortError') setIsShareModalOpen(true);
        }
    } else {
        setIsShareModalOpen(true);
    }
  };

  const handleDownload = () => {
      const link = document.createElement('a');
      link.href = magazine.pdfUrl;
      link.target = '_blank';
      link.download = `${magazine.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleStart = (clientX: number, clientY: number) => {
    if (zoom > 1) {
        setIsDragging(true);
        dragStartRef.current = { x: clientX, y: clientY };
        panStartRef.current = { ...pan };
    }
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (isDragging && zoom > 1) {
        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;
        setPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0d0e10] flex flex-col h-[100dvh] overflow-hidden select-none">
      
      {/* HEADER FIJO */}
      <header className="h-14 shrink-0 flex items-center justify-between px-4 bg-black/40 border-b border-white/5 backdrop-blur-md z-[60]">
        <div className="flex-1 min-w-0">
            <h1 className="text-white font-medium truncate text-sm">
                {magazine.title}
            </h1>
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
            <div className="bg-white/10 px-2 py-0.5 rounded text-[10px] text-white/70 font-bold uppercase mr-2">
                Pág {currentPageIndex + 1} / {totalPages}
            </div>
            <button onClick={onClose} className="p-2 text-white/50 hover:text-white bg-white/5 rounded-full">
                <X className="w-5 h-5" />
            </button>
        </div>
      </header>

      {/* ÁREA CENTRAL DE LECTURA */}
      <main 
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center overflow-hidden touch-none"
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={() => setIsDragging(false)}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            <span className="text-[10px] text-white/20 tracking-[0.2em] uppercase font-bold">Cargando...</span>
          </div>
        )}
        
        {!loading && !error && (
            <div 
                className="transition-transform duration-200 ease-out"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
                <HTMLFlipBook
                    width={bookDimensions.width}
                    height={bookDimensions.height}
                    size="fixed"
                    showCover={true}
                    onFlip={handleFlip}
                    ref={bookRef}
                    className="shadow-[0_40px_100px_rgba(0,0,0,1)]"
                    usePortrait={isMobileMode}
                    drawShadow={true}
                    flippingTime={800}
                    swipeDistance={40}
                    clickEventForward={zoom === 1}
                >
                    {Array.from({ length: totalPages }).map((_, index) => (
                        <Page key={index} number={index + 1}>
                            <PDFPage 
                                pdfDoc={pdfDoc}
                                pageNum={index + 1}
                                width={bookDimensions.width}
                                height={bookDimensions.height}
                                priority={Math.abs(currentPageIndex - index) <= 1}
                                onPageJump={(idx) => bookRef.current.pageFlip().flip(idx)}
                            />
                        </Page>
                    ))}
                </HTMLFlipBook>
            </div>
        )}

        {/* Flechas Navegación PC */}
        {!isMobileMode && zoom === 1 && !loading && (
            <>
                <button onClick={() => bookRef.current.pageFlip().flipPrev()} className="absolute left-6 p-4 rounded-full bg-black/40 text-white/50 hover:text-white backdrop-blur-md transition-all">
                    <ChevronLeft className="w-8 h-8" />
                </button>
                <button onClick={() => bookRef.current.pageFlip().flipNext()} className="absolute right-6 p-4 rounded-full bg-black/40 text-white/50 hover:text-white backdrop-blur-md transition-all">
                    <ChevronRight className="w-8 h-8" />
                </button>
            </>
        )}
      </main>

      {/* LÍNEA DE PROGRESO */}
      <div className="h-1 bg-white/5 w-full relative shrink-0">
          <div 
            className="absolute top-0 left-0 h-full bg-brand-500 transition-all duration-500 shadow-[0_0_15px_rgba(14,165,233,0.8)]" 
            style={{ width: `${((currentPageIndex + (isMobileMode ? 1 : 2)) / totalPages) * 100}%` }}
          />
      </div>

      {/* BARRA DE ACCIÓN INFERIOR FIJA (ESTILO APP) */}
      <nav className="h-16 sm:h-16 shrink-0 bg-black/80 border-t border-white/10 flex items-center justify-around px-4 pb-[env(safe-area-inset-bottom)] z-[60] backdrop-blur-xl">
          
          {/* Zoom Control */}
          <button 
            onClick={() => updateZoom(zoom === 1 ? 2 : 1)}
            className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${zoom > 1 ? 'text-brand-400' : 'text-white/40 hover:text-white'}`}
          >
              {zoom > 1 ? <Maximize2 className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
              <span className="text-[8px] font-bold uppercase tracking-widest">{zoom > 1 ? '1x' : 'Zoom'}</span>
          </button>

          {/* ACCIÓN PRINCIPAL: COMPARTIR */}
          <button 
            onClick={handleShare}
            className="flex items-center gap-3 px-8 py-3 bg-gradient-to-r from-brand-600 to-blue-600 text-white rounded-full shadow-lg shadow-brand-900/40 active:scale-95 transition-transform"
          >
              <Share2 className="w-5 h-5" />
              <span className="text-xs font-black uppercase tracking-widest">
                  Compartir vía...
              </span>
          </button>

          {/* Descargar */}
          <button 
            onClick={handleDownload}
            className="p-3 rounded-xl flex flex-col items-center gap-1 text-white/40 hover:text-white transition-all"
          >
              <Download className="w-5 h-5" />
              <span className="text-[8px] font-bold uppercase tracking-widest">PDF</span>
          </button>
      </nav>

      {isShareModalOpen && (
          <ShareModal 
            magazine={magazine} 
            onClose={() => setIsShareModalOpen(false)} 
          />
      )}
    </div>
  );
};

export default FlipbookViewer;
