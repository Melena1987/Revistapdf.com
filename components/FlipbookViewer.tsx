
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HTMLFlipBook from 'react-pageflip';
import { getPdfDocument } from '../services/pdf';
import { Magazine } from '../types';
import { PDFPage } from './PDFPage';
import { useAuth } from '../store/auth-context';

// Wrapper component required by react-pageflip (Must use forwardRef)
const Page = React.forwardRef<HTMLDivElement, any>((props, ref) => {
    return (
        <div ref={ref} className="bg-white shadow-sm overflow-hidden" style={{ padding: 0 }}>
            <div className="w-full h-full relative">
                 {props.children}
                 {/* Page Number Footer */}
                 <div className="absolute bottom-2 right-4 text-[10px] text-gray-400 z-30 font-sans">
                    {props.number}
                 </div>
            </div>
        </div>
    );
});

const FlipbookViewer: React.FC<FlipbookViewerProps> = ({ magazine, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPageIndex, setCurrentPageIndex] = useState(0); // 0-based index
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  
  // Dimensions for the flipbook
  const [bookDimensions, setBookDimensions] = useState({ width: 0, height: 0 });
  // PDF Aspect Ratio (width / height)
  const [pdfAspectRatio, setPdfAspectRatio] = useState(0.7071);
  const [isMobileMode, setIsMobileMode] = useState(window.innerWidth < 768);

  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<any>(null); // React-pageflip ref

  // Dragging logic for Pan (when zoomed)
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // Pinch to Zoom Ref
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);

  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      try {
        const doc = await getPdfDocument(magazine.pdfUrl);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        
        // Detect Aspect Ratio from Page 1 to ensure fit
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        if (viewport.width && viewport.height) {
            setPdfAspectRatio(viewport.width / viewport.height);
        }

      } catch (err: any) {
        console.error("Error loading PDF", err);
        setError("No se pudo cargar el documento.");
      } finally {
        setLoading(false);
      }
    };
    loadPdf();
  }, [magazine.pdfUrl]);

  // Enhanced Responsive Resizing Logic
  useEffect(() => {
    const handleResize = () => {
        if (!containerRef.current) return;
        
        const maxWidth = window.innerWidth;
        const maxHeight = window.innerHeight - 80; // Subtract UI/margins
        
        const isSmallHeight = window.innerHeight < 500;
        const isSmallWidth = window.innerWidth < 768;
        const mobile = isSmallWidth || isSmallHeight;
        setIsMobileMode(mobile);
        
        let pageW, pageH;

        if (mobile) {
            // Single Page Layout: Strictly bounded by available width AND height
            const availableW = maxWidth - 40;
            const availableH = maxHeight - 20;

            pageW = availableW;
            pageH = pageW / pdfAspectRatio;

            if (pageH > availableH) {
                pageH = availableH;
                pageW = pageH * pdfAspectRatio;
            }
        } else {
            // Double Page Layout (Side by Side)
            const availableW = (maxWidth - 100) / 2; 
            const availableH = maxHeight - 40;

            pageW = availableW;
            pageH = pageW / pdfAspectRatio;

            if (pageH > availableH) {
                pageH = availableH;
                pageW = pageH * pdfAspectRatio;
            }
        }

        setBookDimensions({ 
            width: Math.floor(Math.max(pageW, 100)), 
            height: Math.floor(Math.max(pageH, 150)) 
        });
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
    };
  }, [pdfAspectRatio]);

  const handleFlip = useCallback((e: any) => {
      setCurrentPageIndex(e.data);
  }, []);

  const handlePageJump = useCallback((pageIndex: number) => {
    if (bookRef.current) {
        bookRef.current.pageFlip().flip(pageIndex);
    }
  }, []);

  const updateZoom = (val: number) => {
      const newZoom = Math.min(Math.max(1, val), 4);
      setZoom(newZoom);
      if (newZoom === 1) setPan({ x: 0, y: 0 });
  };

  const onNext = () => {
      if (bookRef.current && zoom === 1) {
          bookRef.current.pageFlip().flipNext();
      }
  };

  const onPrev = () => {
      if (bookRef.current && zoom === 1) {
          bookRef.current.pageFlip().flipPrev();
      }
  };

  useEffect(() => {
      const handleKey = (e: KeyboardEvent) => {
          if (e.key === 'ArrowRight') onNext();
          if (e.key === 'ArrowLeft') onPrev();
          if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKey);
      return () => window.removeEventListener('keydown', handleKey);
  }, [zoom]);

  // Mouse/Touch Pan Logic
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

  const handleEnd = () => setIsDragging(false);

  // Pinch to Zoom Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchDistanceRef.current = dist;
      initialZoomRef.current = zoom;
    } else if (e.touches.length === 1) {
      handleStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistanceRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = dist / initialPinchDistanceRef.current;
      const newZoom = initialZoomRef.current * delta;
      updateZoom(newZoom);
    } else if (e.touches.length === 1) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => {
    initialPinchDistanceRef.current = null;
    handleEnd();
  };

  return (
    <div className="fixed inset-0 z-50 bg-dark-900 flex flex-col h-screen overflow-hidden animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="h-16 border-b border-white/10 flex items-center justify-between px-4 bg-dark-800 shrink-0 shadow-md z-50">
        <div className="flex items-center gap-4">
            <h1 className="text-white font-medium truncate max-w-[150px] sm:max-w-md text-sm sm:text-base">{magazine.title}</h1>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
             {!user && (
                <button 
                    onClick={() => navigate('/login')}
                    className="hidden sm:flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-brand-600 to-blue-600 hover:from-brand-500 hover:to-blue-500 text-white text-xs sm:text-sm font-medium rounded-full shadow-lg transition-transform hover:scale-105 mr-2"
                >
                    <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-300" />
                    <span>Crea tu revista</span>
                </button>
            )}

            <div className="flex items-center bg-dark-900/50 rounded-lg p-1 border border-white/5">
                <button onClick={() => updateZoom(zoom - 0.5)} className="p-1.5 text-gray-400 hover:text-white"><ZoomOut className="w-4 h-4"/></button>
                <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => updateZoom(zoom + 0.5)} className="p-1.5 text-gray-400 hover:text-white"><ZoomIn className="w-4 h-4"/></button>
            </div>

            <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block"></div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full">
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Viewer Area */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-[#2b2e33] flex items-center justify-center overflow-hidden touch-none"
        onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {loading && <div className="flex flex-col items-center"><Loader2 className="w-10 h-10 text-brand-500 animate-spin mb-4" /><span className="text-white">Cargando Libro...</span></div>}
        
        {error && (
             <div className="text-center p-8 bg-dark-800 rounded-xl border border-white/10 max-w-md mx-4">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-xl text-white font-bold mb-2">Error</h3>
                <p className="text-gray-400">{error}</p>
             </div>
        )}

        {/* Flipbook Container */}
        {!loading && !error && totalPages > 0 && bookDimensions.width > 0 && (
            <div 
                className="transition-transform duration-100 ease-out"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: 'center center'
                }}
            >
                <HTMLFlipBook
                    width={bookDimensions.width}
                    height={bookDimensions.height}
                    size="fixed"
                    showCover={true}
                    maxShadowOpacity={0.5}
                    mobileScrollSupport={zoom === 1}
                    showSwipeHint={zoom === 1}
                    onFlip={handleFlip}
                    ref={bookRef}
                    className="shadow-2xl"
                    style={{ margin: '0 auto' }}
                    usePortrait={isMobileMode}
                    startPage={0}
                    drawShadow={true}
                    flippingTime={1000}
                    swipeDistance={30}
                    clickEventForward={zoom === 1}
                    useMouseEvents={zoom === 1}
                >
                    {/* Render Pages */}
                    {Array.from({ length: totalPages }).map((_, index) => (
                        <Page key={index} number={index + 1}>
                            <PDFPage 
                                pdfDoc={pdfDoc}
                                pageNum={index + 1}
                                width={bookDimensions.width}
                                height={bookDimensions.height}
                                priority={Math.abs(currentPageIndex - index) <= 2}
                                onPageJump={handlePageJump}
                            />
                        </Page>
                    ))}
                </HTMLFlipBook>
            </div>
        )}

        {/* Navigation Arrows (Visible only when not zoomed) */}
        {!loading && !error && zoom === 1 && (
            <>
                <button 
                    onClick={onPrev}
                    className="absolute left-2 sm:left-4 md:left-8 top-1/2 -translate-y-1/2 z-40 p-2 sm:p-3 rounded-full bg-dark-900/60 text-white hover:bg-brand-600 transition-all shadow-xl backdrop-blur-sm border border-white/10 active:scale-95"
                >
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <button 
                    onClick={onNext}
                    className="absolute right-2 sm:right-4 md:right-8 top-1/2 -translate-y-1/2 z-40 p-2 sm:p-3 rounded-full bg-dark-900/60 text-white hover:bg-brand-600 transition-all shadow-xl backdrop-blur-sm border border-white/10 active:scale-95"
                >
                    <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
            </>
        )}
      </div>
    </div>
  );
};

export default FlipbookViewer;
interface FlipbookViewerProps {
  magazine: Magazine;
  onClose: () => void;
}
