import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTextFromPdfBuffer } from '@/lib/pdf.server';

test('extractTextFromPdfBuffer normalizes text and destroys parser', async () => {
  let destroyed = false;

  class FakePDFParse {
    constructor(_options: unknown) {}

    async getText() {
      return {
        text: '  第一行   \n第二行  \n\n',
      };
    }

    async destroy() {
      destroyed = true;
    }
  }

  const text = await extractTextFromPdfBuffer(Buffer.from('pdf'), {
    PDFParse: FakePDFParse as never,
    verbosity: 0,
  });

  assert.equal(text, '第一行\n第二行');
  assert.equal(destroyed, true);
});

test('extractTextFromPdfBuffer destroys parser even when extraction fails', async () => {
  let destroyed = false;

  class FakePDFParse {
    constructor(_options: unknown) {}

    async getText() {
      throw new Error('boom');
    }

    async destroy() {
      destroyed = true;
    }
  }

  await assert.rejects(
    () => extractTextFromPdfBuffer(Buffer.from('pdf'), {
      PDFParse: FakePDFParse as never,
      verbosity: 0,
    }),
    /boom/,
  );

  assert.equal(destroyed, true);
});
