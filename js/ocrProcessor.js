/**
 * OCRProcessor
 * Renders a PDF page (or an uploaded image) to a canvas and runs
 * Tesseract.js with Hindi+English trained data. Used only when
 * TextIntegrityChecker flags the embedded text layer as corrupted,
 * or when the source file is an image (JPG).
 */
const OCRProcessor = (() => {

  async function renderPdfPageToCanvas(page, scale = 2.0) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  async function imageFileToCanvas(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return canvas;
  }

  async function recognize(canvas, onProgress) {
    const { data } = await Tesseract.recognize(canvas, 'hin+eng', {
      logger: m => {
        if (onProgress && m.status === 'recognizing text') {
          onProgress(Math.round(m.progress * 100));
        }
      }
    });
    return {
      text: data.text,
      confidence: data.confidence, // 0-100, Tesseract's own estimate
      words: (data.words || []).map(w => ({
        text: w.text,
        confidence: w.confidence,
        bbox: w.bbox
      }))
    };
  }

  return { renderPdfPageToCanvas, imageFileToCanvas, recognize };
})();
