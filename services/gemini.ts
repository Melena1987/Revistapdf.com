
import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysisResult } from "../types";

// Helper to convert File to Base64
const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:application/pdf;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const analyzePdf = async (file: File): Promise<AIAnalysisResult> => {
  try {
    const apiKey = typeof process !== 'undefined' ? process.env.API_KEY : undefined;

    if (!apiKey) {
      console.warn("API Key not found, returning mock data");
      return {
        title: file.name.replace('.pdf', ''),
        description: "",
        category: "General",
        isGenerated: false
      };
    }

    const ai = new GoogleGenAI({ apiKey });
    const base64Data = await fileToGenerativePart(file);

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.type,
              data: base64Data
            }
          },
          {
            text: "Analiza este documento PDF. Genera un título atractivo para una revista, una descripción corta optimizada para SEO (máximo 2 párrafos) y una categoría adecuada. Responde estrictamente en JSON."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING },
          },
          required: ["title", "description", "category"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const result = JSON.parse(text);
    return { ...result, isGenerated: true };

  } catch (error) {
    console.error("Error analyzing PDF:", error);
    return {
      title: file.name.replace('.pdf', ''),
      description: "",
      category: "General",
      isGenerated: false
    };
  }
};
