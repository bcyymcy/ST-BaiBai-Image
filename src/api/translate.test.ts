import { describe, expect, it } from 'vitest';

import { stripThinking } from '@/api/translate';

describe('stripThinking', () => {
  it('去掉思考段和代码围栏', () => {
    expect(stripThinking('<think>嗯</think>杰作，最佳质量').trim()).toBe('杰作，最佳质量');
    expect(stripThinking('```\nmasterpiece\n```')).toBe('masterpiece');
  });
});
