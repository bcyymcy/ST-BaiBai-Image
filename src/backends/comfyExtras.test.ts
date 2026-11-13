import { describe, expect, it } from 'vitest';

import {
  applyExtras,
  extractTextOutputs,
  extrasDefaults,
  importExtrasFromWorkflow,
  locatePromptInputs,
  normalizeExtras,
  readInputs,
  syncSnippets,
} from '@/backends/comfyExtras';
import { renderWorkflowTemplate, type ComfyWorkflow } from '@/backends/comfyui';
import fixture from './__fixtures__/moss_workflow.json';

const load = () => JSON.parse(JSON.stringify(fixture)) as ComfyWorkflow;
const inputs = (wf: ComfyWorkflow, id: string) => wf[id].inputs as Record<string, unknown>;

describe('comfyExtras', () => {
  it('normalize: 老配置没有 extras → 全关', () => {
    expect(normalizeExtras(undefined)).toEqual(extrasDefaults());
  });

  it('从工作流导入前缀/后缀与 LoRA', () => {
    const imported = importExtrasFromWorkflow(load());
    expect(imported.prefixes.map(p => p.text)).toEqual([
      'masterpiece, best quality, very aesthetic, ultra-detailed, high contrast',
      'detailed fabric folds, wet skin texture, soft natural blush and subtle wet highlights',
    ]);
    expect(imported.suffixes).toEqual([]);
    expect(imported.loras.length).toBe(6);
    expect(imported.loras.find(l => l.name === 'Moss-光泽皮肤')).toMatchObject({ enabled: true, strength: 0.8 });
    expect(imported.loras.find(l => l.name === 'Moss-画风-高光湿润渲染（nai5其九）V2')?.enabled).toBe(false);
  });

  it('全关时工作流不变', () => {
    const wf = load();
    applyExtras(wf, extrasDefaults());
    expect(wf).toEqual(load());
  });

  it('接管后:前缀/后缀/触发词包住主提示词,词库清空,LoRA 改写,触发词节点断开', () => {
    const wf = load();
    const extras = normalizeExtras({
      snippetsEnabled: true,
      prefixes: [{ name: 'a', text: 'PRE1', enabled: true }, { name: 'b', text: 'OFF', enabled: false }],
      suffixes: [{ name: 'c', text: 'SUF', enabled: true }],
      lorasEnabled: true,
      loras: [
        { name: 'Moss-光泽皮肤', strength: 0.7, enabled: true, trigger: '@gloss' },
        { name: 'clean2Dskin_w', strength: 0.6, enabled: false, trigger: 'nope' },
      ],
    });
    applyExtras(wf, extras);
    expect(inputs(wf, '18').value).toBe('@gloss\nPRE1\n%nl%\n%prompt%\nSUF');
    expect(JSON.parse(String(inputs(wf, '16').selection_payload_json)).selections).toEqual([]);
    const loras = (inputs(wf, '12').loras as { __value__: { name: string; active: boolean; strength: string }[] }).__value__;
    expect(loras).toEqual([
      expect.objectContaining({ name: 'Moss-光泽皮肤', active: true, strength: '0.70' }),
      expect.objectContaining({ name: 'clean2Dskin_w', active: false, strength: '0.60' }),
    ]);
    // 21 = concat(13 触发词, 20) → 13 的连线被换成空串
    expect(inputs(wf, '21').string_a).toBe('');

    const refs = locatePromptInputs(wf);
    const rendered = renderWorkflowTemplate(wf, { prompt: '1girl', nl: 'A girl.', negative_prompt: 'bad', seed: 1, width: 832, height: 1216 });
    expect(readInputs(rendered, refs.positive)).toBe('@gloss\nPRE1\nA girl.\n1girl\nSUF');
    expect(readInputs(rendered, refs.negative)).toContain('shiny hair, bad');
  });

  it('从 history 取 PreviewAny 文本', () => {
    const item = { outputs: { '22': { text: ['FINAL'] }, '10': { images: [{ filename: 'a.png' }] } } };
    expect(extractTextOutputs(item, load())).toEqual([
      { nodeId: '22', title: '最终正向提示词（含前后缀及触发词）', text: 'FINAL' },
    ]);
  });
});

describe('syncSnippets', () => {
  const library = {
    categories: [
      { id: 'cp', name: '前缀' },
      { id: 'cs', name: '后缀' },
    ],
    entries: [
      { id: 'p1', title: '年份', text: 'year2025', categoryId: 'cp', position: 0 },
      { id: 's1', title: '柔光', text: 'soft lighting', categoryId: 'cs', position: 1 },
      { id: 'de409f98-6e36-416a-a07e-29935725e3a2', title: 'ob', text: 'OB TEXT', categoryId: 'cp', position: 5 },
      { id: 'e4b88b97-53bf-4fb1-a1b6-03a57548c421', title: '光润肌肤', text: 'WET', categoryId: 'cp', position: 7 },
      { id: 'x', title: '别的', text: 'other', categoryId: null, position: 9 },
    ],
  };

  it('列出全部前后缀，选中的打开且排前，其余关闭', () => {
    const r = syncSnippets(load(), library, { prefixes: [], suffixes: [] });
    expect(r.prefixes.map(s => [s.name, s.enabled])).toEqual([
      ['ob', true],
      ['光润肌肤', true],
      ['年份', false],
    ]);
    expect(r.suffixes.map(s => [s.name, s.enabled])).toEqual([['柔光', false]]);
  });

  it('重复同步不会重复添加，保留 id；清掉旧版重复导入，保留手动条目', () => {
    const first = syncSnippets(load(), library, { prefixes: [], suffixes: [] });
    const manual = { id: 'm', name: '手动', text: 'MANUAL', enabled: true };
    const legacy = { id: 'l', name: 'x', text: 'OB TEXT', enabled: true };
    const again = syncSnippets(load(), library, {
      prefixes: [...first.prefixes, legacy, legacy, manual, { ...manual, id: 'm2' }],
      suffixes: first.suffixes,
    });
    expect(again.prefixes.map(s => s.name)).toEqual(['ob', '光润肌肤', '年份', '手动']);
    expect(again.prefixes[0].id).toBe(first.prefixes[0].id);
  });

  it('连不上词库时只同步选中的', () => {
    const r = syncSnippets(load(), null, { prefixes: [], suffixes: [] });
    expect(r.prefixes.every(s => s.enabled)).toBe(true);
    expect(r.prefixes.length).toBe(2);
    expect(r.fromLibrary).toBe(false);
  });
});
