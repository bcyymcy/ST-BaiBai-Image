import { describe, expect, it } from 'vitest';
import { mossPromptValues } from '@/backends/comfyui';
import { describeEntryForNl, parseConvertedNl } from '@/autoTag/charAnchors';
import { DEFAULT_MOSS_SPEC } from '@/autoTag/mossSpec';
import { backendPromptSpec } from '@/autoTag/prompt';
import { settings, type AutoTagSettings } from '@/state/settings';

/** 【bcy】MOSS 纯自然语言风格 */
describe('MOSS 纯自然语言', () => {
  const base = { prompt: '1girl, cowboy shot, 小雪', nl: 'A cowboy shot of a girl.', negative_prompt: 'bad hands', seed: 1 };

  it('工作流有 %nl% 时 %prompt% 置空、nl 原样', () => {
    expect(mossPromptValues(base, true)).toMatchObject({ prompt: '', nl: 'A cowboy shot of a girl.', negative_prompt: 'bad hands' });
  });

  it('只有 %prompt% 时把 nl 放进 %prompt%', () => {
    expect(mossPromptValues(base, false)).toMatchObject({ prompt: 'A cowboy shot of a girl.', nl: '' });
  });

  it('nl 为空时回落 tag,避免空提示词', () => {
    expect(mossPromptValues({ ...base, nl: '  ' }, true)).toEqual({ ...base, nl: '  ' });
  });

  it('backendPromptSpec:nlOnly 用 MOSS 规范,自定义优先', () => {
    const saved = settings.defaultBackend;
    try {
      settings.defaultBackend = 'comfyui';
      const options = { prompts: { mossSpec: '' } } as unknown as AutoTagSettings;
      expect(backendPromptSpec(options, true, false, true)).toBe(DEFAULT_MOSS_SPEC.trim());
      const custom = { prompts: { mossSpec: '我的 MOSS 规范' } } as unknown as AutoTagSettings;
      expect(backendPromptSpec(custom, true, false, true)).toBe('我的 MOSS 规范');
    } finally {
      settings.defaultBackend = saved;
    }
  });

  it('角色外貌 nl:素材不含服装,解析宽容', () => {
    const line = describeEntryForNl({
      name: '小雪',
      fields: { fandom: '', sex: '1girl', hair: 'long black hair', eyes: 'blue eyes', skin: '', body: '', extra: '', outfit: 'school uniform' },
      raw: '',
      desc: '黑长直',
    });
    expect(line).toContain('hair');
    expect(line).toContain('long black hair');
    expect(line).not.toContain('school uniform');
    expect(line).toContain('黑长直');
    expect(parseConvertedNl('<thinking>x</thinking>```json\n{"小雪":"A girl with long black hair."}\n```')).toEqual({
      小雪: 'A girl with long black hair.',
    });
  });
});
