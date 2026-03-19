import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadFile } from '@/services/file';

class MockXMLHttpRequest {
  static nextStatus = 200;
  static nextStatusText = 'OK';
  static nextResponseText = '';

  status = 0;
  statusText = '';
  responseText = '';
  withCredentials = false;

  private handlers: Record<string, Array<() => void>> = {};
  upload = {
    addEventListener: (_type: string, _listener: (event: { lengthComputable: boolean; loaded: number; total: number }) => void) => {
      // ignore upload progress in this mock
    },
  };

  addEventListener(type: string, listener: () => void) {
    if (!this.handlers[type]) {
      this.handlers[type] = [];
    }
    this.handlers[type].push(listener);
  }

  open(_method: string, _url: string) {}

  send(_body?: Document | XMLHttpRequestBodyInit | null) {
    this.status = MockXMLHttpRequest.nextStatus;
    this.statusText = MockXMLHttpRequest.nextStatusText;
    this.responseText = MockXMLHttpRequest.nextResponseText;
    for (const listener of this.handlers.load ?? []) {
      listener();
    }
  }
}

test('uploadFile reads wrapped API payload without extracted content', async () => {
  const originalXhr = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;

  MockXMLHttpRequest.nextStatus = 200;
  MockXMLHttpRequest.nextStatusText = 'OK';
  MockXMLHttpRequest.nextResponseText = JSON.stringify({
    success: true,
    data: {
      id: 'file_db_1',
      originalName: '需求文档.pdf',
      fileType: 'application/pdf',
      fileSize: 1234,
    },
  });

  try {
    const uploaded = await uploadFile(
      new File(['pdf'], '需求文档.pdf', { type: 'application/pdf' }),
    );

    assert.equal(uploaded.id, 'file_db_1');
    assert.equal(uploaded.mimeType, 'application/pdf');
    assert.equal(uploaded.size, 1234);
    assert.equal(uploaded.extractedContent, undefined);
  } finally {
    globalThis.XMLHttpRequest = originalXhr;
  }
});
