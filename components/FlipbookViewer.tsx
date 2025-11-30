import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { renderPageToCanvas, getPdfDocument } from '../services/pdf';
import { Magazine } from '../types';

interface FlipbookViewerProps {
  magazine: Magazine;
  onClose: () => void;
}

const FlipbookViewer: React.FC<FlipbookViewerProps> = ({ magazine, onClose }) => {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1); // The page number on the right
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [bookAspectRatio, setBookAspectRatio] = useState('1.414'); // Default A4 spread

  const [turn, setTurn] = useState({
    isActive: false,
    pageNumber: 0, // front page of turning sheet
    progress: 0, // angle of rotation
    direction: 'next' as 'next' | 'prev',
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const canvasLeftRef = useRef<HTMLCanvasElement>(null);
  const canvasRightRef = useRef<HTMLCanvasElement>(null);
  const canvasTurnFrontRef = useRef<HTMLCanvasElement>(null);
  const canvasTurnBackRef = useRef<HTMLCanvasElement>(null);
  
  const animationRequestRef = useRef<number | null>(null);
  const dragState = useRef<{ isDragging: boolean; startX: number; } | null>(null);

  // Load PDF Document and calculate aspect ratio
  useEffect(() => {
    const loadPdf = async () => {
      try {
        const doc = await getPdfDocument(magazine.pdfUrl);
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        if (doc.numPages > 0) {
            const page = await doc.getPage(1);
            const viewport = page.getViewport({ scale: 1 });
            setBookAspectRatio(String((2 * viewport.width) / viewport.height));
        }
      } catch (error) {
        console.error("Failed to load PDF", error);
      }
    };
    loadPdf();
  }, [magazine.pdfUrl]);

  // Render static pages
  const renderStaticPages = useCallback(async () => {
    if (!pdfDoc || !bookRef.current) return;

    const width = bookRef.current.clientWidth / 2;
    const leftPageNum = currentPage > 1 ? currentPage - 1 : 0;
    const rightPageNum = currentPage;
    
    const clearCanvas = (canvas: HTMLCanvasElement | null) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };

    clearCanvas(canvasLeftRef.current);
    clearCanvas(canvasRightRef.current);
    
    if (leftPageNum > 0 && canvasLeftRef.current) {
      await renderPageToCanvas(pdfDoc, leftPageNum, canvasLeftRef.current, width);
    }
    if (rightPageNum > 0 && rightPageNum <= totalPages && canvasRightRef.current) {
      await renderPageToCanvas(pdfDoc, rightPageNum, canvasRightRef.current, width);
    }
  }, [pdfDoc, currentPage, totalPages]);

  useEffect(() => {
    renderStaticPages();
    window.addEventListener('resize', renderStaticPages);
    return () => window.removeEventListener('resize', renderStaticPages);
  }, [renderStaticPages]);

  // Animation loop
  useEffect(() => {
    if (!turn.isActive) return;
    let frameId: number;
    const animate = () => {
      if (animationRequestRef.current === null) return;
      setTurn(prev => {
        const targetProgress = animationRequestRef.current!;
        const newProgress = prev.progress + (targetProgress - prev.progress) * 0.15;
        
        if (Math.abs(targetProgress - newProgress) < 0.5) {
          if (targetProgress === -180) setCurrentPage(p => p + 2);
          animationRequestRef.current = null;
          return { ...prev, isActive: false, progress: targetProgress };
        }
        return { ...prev, progress: newProgress };
      });
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [turn.isActive]);

  const startTurn = async (direction: 'next' | 'prev') => {
    if (turn.isActive) return;

    const pageToTurn = direction === 'next' ? currentPage : currentPage - 2;
    if (pageToTurn < 1 && direction === 'prev') return;
    if (pageToTurn >= totalPages && direction === 'next') return;

    setTurn({
      isActive: true,
      pageNumber: pageToTurn,
      progress: direction === 'next' ? 0 : -180,
      direction,
    });
    
    if (direction === 'prev') {
        setCurrentPage(p => p - 2);
    }

    if (bookRef.current) {
        const width = bookRef.current.clientWidth / 2;
        // Render front of turning page
        if (canvasTurnFrontRef.current) {
            await renderPageToCanvas(pdfDoc, pageToTurn, canvasTurnFrontRef.current, width);
        }
        // Render back of turning page
        if (pageToTurn + 1 <= totalPages && canvasTurnBackRef.current) {
            await renderPageToCanvas(pdfDoc, pageToTurn + 1, canvasTurnBackRef.current, width);
        } else if (canvasTurnBackRef.current) {
            const ctx = canvasTurnBackRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasTurnBackRef.current.width, canvasTurnBackRef.current.height);
        }
    }
  };

  const onDragStart = (e: React.MouseEvent, direction: 'next' | 'prev') => {
    if (turn.isActive) return;
    dragState.current = { isDragging: true, startX: e.clientX };
    startTurn(direction);
    e.preventDefault();
  };

  useEffect(() => {
    const onDragMove = (e: MouseEvent) => {
      if (!dragState.current?.isDragging || !bookRef.current) return;
      const { startX } = dragState.current;
      const bookWidth = bookRef.current.clientWidth;
      const deltaX = e.clientX - startX;
      
      setTurn(t => {
        const progressRatio = deltaX / (bookWidth / 2);
        let rotation = t.direction === 'next'
          ? Math.max(-180, Math.min(0, progressRatio * 180))
          : Math.max(-180, Math.min(0, -180 + progressRatio * -180));
        return {...t, progress: rotation};
      });
    };

    const onDragEnd = () => {
      if (!dragState.current?.isDragging) return;
      dragState.current = null;
      setTurn(t => {
        if (t.direction === 'next') {
            animationRequestRef.current = t.progress < -90 ? -180 : 0;
        } else {
            animationRequestRef.current = t.progress < -90 ? -180 : 0;
        }
        // if animation snaps back, reset currentPage for prev turn
        if (animationRequestRef.current === 0 && t.direction === 'prev') {
            setCurrentPage(p => p + 2);
        }
        return t;
      });
    };
    
    if (dragState.current?.isDragging) {
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragEnd);
      window.addEventListener('mouseleave', onDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('mouseleave', onDragEnd);
    };
  }, [dragState.current?.isDragging]);

  const changePage = (direction: 'next' | 'prev') => {
    if (turn.isActive) return;
    if (direction === 'next' && currentPage >= totalPages) return;
    if (direction === 'prev' && currentPage <= 1) return;

    animationRequestRef.current = direction === 'next' ? -180 : 0;
    startTurn(direction);
  };

  return (
    <div className="fixed inset-0 z-50 bg-dark-900 flex flex-col h-screen" role="dialog" aria-modal="true" aria-label="Visor de Revistas">
      {/* Viewer Header */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-dark-800 shrink-0">
        <div className="flex items-center gap-4">
            <h1 className="text-white font-medium truncate max-w-xs sm:max-w-sm">{magazine.title}</h1>
            <span className="text-xs text-gray-400 bg-white/5 px-2 py-1 rounded">
                Pág. {Math.min(currentPage, totalPages)} / {totalPages}
            </span>
        </div>
        
        <div className="flex items-center gap-2">
            <button onClick={() => setScale(s => Math.min(s + 0.2, 2))} className="p-2 text-gray-400 hover:text-white" aria-label="Acercar"><ZoomIn className="w-5 h-5"/></button>
            <button onClick={() => setScale(s => Math.max(s - 0.2, 0.5))} className="p-2 text-gray-400 hover:text-white" aria-label="Alejar"><ZoomOut className="w-5 h-5"/></button>
            <div className="w-px h-6 bg-white/10 mx-2"></div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full" aria-label="Cerrar Visor">
                <X className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* Book Container */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center p-4 overflow-hidden relative bg-black/50">
        <button 
            onClick={() => changePage('prev')}
            disabled={currentPage <= 1 || turn.isActive}
            className="absolute left-4 z-20 p-3 rounded-full bg-dark-800/80 text-white hover:bg-brand-600 disabled:opacity-30 disabled:hover:bg-dark-800/80 transition-all backdrop-blur-sm"
            aria-label="Página Anterior"
        > <ChevronLeft className="w-6 h-6" /> </button>
        <button 
            onClick={() => changePage('next')}
            disabled={currentPage >= totalPages || turn.isActive}
            className="absolute right-4 z-20 p-3 rounded-full bg-dark-800/80 text-white hover:bg-brand-600 disabled:opacity-30 disabled:hover:bg-dark-800/80 transition-all backdrop-blur-sm"
            aria-label="Página Siguiente"
        > <ChevronRight className="w-6 h-6" /> </button>

        <div 
            ref={bookRef}
            className="relative flex shadow-2xl transition-transform duration-300 preserve-3d"
            style={{ 
                maxHeight: '85vh', 
                maxWidth: '95vw',
                aspectRatio: bookAspectRatio,
                transform: `scale(${scale})`,
                perspective: '2500px'
            }}
        >
            <div className="absolute left-1/2 top-0 bottom-0 w-8 -ml-4 bg-gradient-to-r from-black/0 via-black/20 to-black/0 z-10 pointer-events-none"></div>

            {/* Static Left Page */}
            <div className="w-1/2 h-full bg-white relative overflow-hidden flex items-center justify-center">
                <canvas ref={canvasLeftRef} className="max-w-full max-h-full object-contain" />
                {currentPage - 1 <= 0 && <div className="absolute inset-0 bg-gray-100" />}
                 {!turn.isActive && currentPage > 1 && (
                    <div className="corner-hotspot corner-hotspot-left" onMouseDown={(e) => onDragStart(e, 'prev')} />
                 )}
            </div>

            {/* Static Right Page */}
            <div className="w-1/2 h-full bg-white relative overflow-hidden flex items-center justify-center">
                <canvas ref={canvasRightRef} className="max-w-full max-h-full object-contain" />
                {currentPage > totalPages && <div className="absolute inset-0 bg-gray-100" />}
                {!turn.isActive && currentPage <= totalPages && (
                    <div className="corner-hotspot corner-hotspot-right" onMouseDown={(e) => onDragStart(e, 'next')} />
                )}
            </div>

            {/* The Turning Page */}
            {turn.isActive && (
                <div 
                  className="absolute top-0 w-1/2 h-full preserve-3d"
                  style={{
                    left: turn.direction === 'next' ? '50%' : 'auto',
                    right: turn.direction === 'prev' ? '50%' : 'auto',
                    transformOrigin: turn.direction === 'next' ? 'left center' : 'right center',
                    transform: `rotateY(${turn.progress}deg)`
                  }}
                >
                    <div className="page-face bg-white flex items-center justify-center">
                        <canvas ref={canvasTurnFrontRef} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="page-face back-face bg-white flex items-center justify-center">
                        <canvas ref={canvasTurnBackRef} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div 
                      className="page-shadow"
                      style={{
                          background: `linear-gradient(to ${turn.direction === 'next' ? 'left' : 'right'}, rgba(0,0,0,0.5), transparent)`,
                          opacity: Math.sin(Math.abs(turn.progress) * (Math.PI / 180))
                      }}
                    />
                    <div 
                      className="page-highlight"
                      style={{
                          background: `linear-gradient(to ${turn.direction === 'next' ? 'right' : 'left'}, rgba(255,255,255,0.2), transparent)`,
                          opacity: Math.sin(Math.abs(turn.progress) * (Math.PI / 180)) * 0.5
                      }}
                    />
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default FlipbookViewer;