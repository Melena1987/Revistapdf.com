export interface Magazine {
  id: string;
  userId: string;
  title: string;
  description: string;
  pdfUrl: string; // In a real app this is a remote URL, here likely a blob URL
  coverImage?: string;
  createdAt: number;
  category?: string;
  pageCount: number;
  slug?: string;
  originalFilename?: string;
}

export interface UserProfile {
  role?: string;
}

export interface UploadState {
  isUploading: boolean;
  progress: number;
  isAnalyzing: boolean;
  error?: string;
}

export interface AIAnalysisResult {
  title: string;
  description: string;
  category: string;
  isGenerated?: boolean;
}