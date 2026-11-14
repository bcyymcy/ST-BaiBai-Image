import { describe, expect, it } from 'vitest';

import { buildFreeGenMessages, parseFreeGenPlan } from '@/freeGen/expand';

const profile = { naiCharPrompts: false, nl: true, lockedSize: null };

describe('buildFreeGenMessages', () => {
  it('规范在协议之前、想法放最后的 user 消息', () => {
    const messages = buildFreeGenMessages(
      { idea: 'user和小雪在房间里睡觉', count: 2, useCard: true, useLibrary: true },
      {
        spec: 'MOSS 规范',
        profile,
        negativeOn: true,
        jailbreak: 'JB',
        charCard: '',
        persona: '',
        library: '【角色固定外貌库】小雪: long silver hair',
        userName: '阿明',
        charName: '小雪',
      },
    );
    expect(messages[0].content).toBe('JB');
    expect(messages[1].content).toBe('MOSS 规范');
    expect(messages[2].content).toContain('共 2 张');
    expect(messages[2].content).toContain('阿明');
    expect(messages[2].content).toContain('negative');
    const last = messages[messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('小雪: long silver hair');
    expect(last.content.endsWith('user和小雪在房间里睡觉')).toBe(true);
  });
});

describe('parseFreeGenPlan', () => {
  it('解析、截断张数、只有 nl 时拿 nl 顶 tag', () => {
    const raw = `<thinking>想一想</thinking>${JSON.stringify({
      images: [
        { summary: '相拥而睡', tag: '1girl, 1boy, sleeping', nl: 'They sleep.', size: 'landscape' },
        { summary: '只有描述', nl: 'A girl sleeps.' },
        { summary: '多余', tag: 'x' },
      ],
    })}`;
    const plan = parseFreeGenPlan(raw, profile, 2);
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ summary: '相拥而睡', tag: '1girl, 1boy, sleeping', size: 'landscape' });
    expect(plan[1]).toMatchObject({ tag: 'A girl sleeps.', nl: '', size: 'portrait' });
  });

  it('画幅锁定时一律按锁定方向', () => {
    const plan = parseFreeGenPlan('{"images":[{"tag":"a","size":"landscape"}]}', { ...profile, lockedSize: 'portrait' }, 1);
    expect(plan[0].size).toBe('portrait');
  });

  it('没有可用画面时抛错', () => {
    expect(() => parseFreeGenPlan('{"images":[]}', profile, 1)).toThrow();
    expect(() => parseFreeGenPlan('不是 JSON', profile, 1)).toThrow();
  });
});
