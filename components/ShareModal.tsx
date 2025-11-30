import React, { useState, useEffect } from 'react';
import { X, Copy, Check, QrCode as QrCodeIcon, Download, Share2 } from 'lucide-react';
import { Magazine } from '../types';
import QRCode from 'qrcode';

interface ShareModalProps {
  magazine: Magazine;
  onClose: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ magazine, onClose }) => {
  const shareUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}#/view/${magazine.id}`;
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [copyButtonText, setCopyButtonText] = useState('Copiar');

  useEffect(() => {
    // Generate QR Code using the imported library
    QRCode.toDataURL(shareUrl, { width: 256, margin: 1 })
      .then((url: string) => {
        setQrCodeUrl(url);
      })
      .catch((err: any) => {
        console.error("Error generating QR code:", err);
      });
  }, [shareUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopyButtonText('Copiado!');
      setTimeout(() => setCopyButtonText('Copiar'), 2000);
    });
  };

  const handleDownloadQR = () => {
    if(!qrCodeUrl) return;
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `qr-code-${magazine.title.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-dark-800 w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-dark-900/50">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-brand-400" />
            Compartir Revista
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* QR Code */}
          <div className="bg-white p-4 rounded-lg flex items-center justify-center">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
            ) : (
              <div className="w-48 h-48 bg-gray-200 flex items-center justify-center text-gray-500">
                <QrCodeIcon className="w-12 h-12 animate-pulse" />
              </div>
            )}
          </div>
          
          {/* URL Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Enlace para compartir</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly
                value={shareUrl}
                className="w-full bg-dark-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-300 select-all"
              />
              <button 
                onClick={handleCopy}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 w-32 justify-center ${copyButtonText === 'Copiar' ? 'bg-brand-600 hover:bg-brand-500 text-white' : 'bg-green-600 text-white'}`}
              >
                {copyButtonText === 'Copiar' ? <Copy className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                {copyButtonText}
              </button>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-dark-900/50 flex justify-end gap-3">
          <button 
            onClick={handleDownloadQR}
            disabled={!qrCodeUrl}
            className="w-full px-6 py-2 bg-dark-900 hover:bg-dark-900/70 border border-white/10 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Descargar QR
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;