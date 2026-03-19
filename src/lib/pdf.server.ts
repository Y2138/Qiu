import 'pdf-parse/worker';
import { PDFParse, VerbosityLevel } from 'pdf-parse';

interface PDFParseLike {
  new (options: { data: Uint8Array; verbosity?: number }): {
    getText(): Promise<{ text: string }>;
    destroy(): Promise<void>;
  };
}

interface ExtractPdfTextDeps {
  PDFParse: PDFParseLike;
  verbosity: number;
}

const defaultDeps: ExtractPdfTextDeps = {
  PDFParse,
  verbosity: VerbosityLevel.WARNINGS,
};

function normalizePdfText(text: string): string {
  return text.replace(/\s+\n/g, '\n').trim();
}

export async function extractTextFromPdfBuffer(
  buffer: Buffer | Uint8Array | ArrayBuffer,
  deps: ExtractPdfTextDeps = defaultDeps,
): Promise<string | null> {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const parser = new deps.PDFParse({
    data,
    verbosity: deps.verbosity,
  });

  try {
    const result = await parser.getText();
    const text = normalizePdfText(result.text);
    return text || null;
  } finally {
    await parser.destroy();
  }
}
