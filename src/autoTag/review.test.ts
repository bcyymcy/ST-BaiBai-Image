import { describe, expect, it } from 'vitest';

import { parseCharFix } from '@/autoTag/charAnchors';
import { DEFAULT_REVIEW_PROMPT, reviewPrompt } from '@/autoTag/reviewPrompt';
import { emptyCharFields } from '@/state/charTags';
import type { AutoTagPrompts } from '@/state/settings';

const prompts = (review = '') => ({ review } as unknown as AutoTagPrompts);

describe('成稿前自查', () => {
  it('默认开启,用内置清单', () => {
    expect(reviewPrompt({ prompts: prompts() })).toBe(DEFAULT_REVIEW_PROMPT);
    expect(DEFAULT_REVIEW_PROMPT).toContain('barefoot');
  });
  it('自定义内容优先,关闭时为空', () => {
    expect(reviewPrompt({ prompts: prompts('我的清单') })).toBe('我的清单');
    expect(reviewPrompt({ prompts: prompts('我的清单'), selfReview: false })).toBe('');
  });
});

describe('AI 修正外貌解析', () => {
  it('缺字段保留原值,解析 nl 与修改说明', () => {
    const current = { ...emptyCharFields(), hair: 'short brown hair', eyes: 'brown eyes' };
    const raw = '<thinking>x</thinking>```json\n{"fields":{"hair":"long silver hair"},"nl":"A girl with long silver hair and brown eyes.","changes":["发色 浅棕 → 银白"]}\n```';
    const r = parseCharFix(raw, current);
    expect(r?.fields.hair).toBe('long silver hair');
    expect(r?.fields.eyes).toBe('brown eyes');
    expect(r?.nl).toContain('silver');
    expect(r?.changes).toEqual(['发色 浅棕 → 银白']);
  });
  it('无法解析返回 null', () => {
    expect(parseCharFix('no json', emptyCharFields())).toBeNull();
  });
});
