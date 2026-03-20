import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProviderSwitcherMenu } from '@/components/ProviderSwitcher';
import type { ApiKeyConfig } from '@/types/model';

test('ProviderSwitcherMenu keeps dropdown available when no api key config exists', () => {
  const html = renderToStaticMarkup(
    <ProviderSwitcherMenu
      apiKeyConfigs={[]}
      activeApiKeyId={null}
      loading={false}
      onSelect={() => {}}
      onManage={() => {}}
    />,
  );

  assert.match(html, /未配置厂商/);
  assert.match(html, /添加 API Key/);
});

test('ProviderSwitcherMenu renders current api key config when available', () => {
  const configs: ApiKeyConfig[] = [
    {
      id: 'key_1',
      name: 'OpenAI 主 Key',
      apiType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      models: ['gpt-4o'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const html = renderToStaticMarkup(
    <ProviderSwitcherMenu
      apiKeyConfigs={configs}
      activeApiKeyId="key_1"
      loading={false}
      onSelect={() => {}}
      onManage={() => {}}
    />,
  );

  assert.match(html, /OpenAI 主 Key/);
  assert.match(html, /切换厂商/);
});
