declare global {
  interface Window {
    Tesseract?: {
      recognize: (
        image: string,
        langs?: string,
        options?: any,
      ) => Promise<{ data: { words?: any[]; text?: string } }>;
    };
  }
}

export {};
