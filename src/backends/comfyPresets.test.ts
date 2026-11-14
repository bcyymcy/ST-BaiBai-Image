import { describe, expect, it } from 'vitest';

import {
  applyExtras,
  applyPreset,
  extrasDefaults,
  insertCoreLoras,
  loraMode,
  normalizeExtras,
  presetMatches,
  snapshotPreset,
  type ComfyExtras,
} from '@/backends/comfyExtras';
import type { ComfyWorkflow } from '@/backends/comfyui';

const ckptWorkflow = (): ComfyWorkflow => ({
  '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'a.safetensors' } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: '%prompt%', clip: ['4', 1] } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: 'bad', clip: ['4', 1] } },
  '3': { class_type: 'KSampler', inputs: { model: ['4', 0], positive: ['6', 0], negative: ['7', 0] } },
  '8': { class_type: 'VAEDecode', inputs: { vae: ['4', 2], samples: ['3', 0] } },
});

const extrasWith = (patch: Partial<ComfyExtras>): ComfyExtras => ({ ...extrasDefaults(), ...patch });

describe('画风预设', () => {
  it('旧 LoRA 组合迁移成预设（前后缀不动）', () => {
    const n = normalizeExtras({ combos: [{ id: 'c1', name: '少女', loras: [{ name: 'x', strength: 0.6, enabled: true }] }] });
    expect(n.presets).toHaveLength(1);
    expect(n.presets[0]).toMatchObject({ id: 'c1', name: '少女', lorasEnabled: true, snippets: null });
  });

  it('保存后切换会一起套用前后缀与 LoRA，未记录的一律关', () => {
    const extras = extrasWith({
      snippetsEnabled: true,
      lorasEnabled: true,
      prefixes: [{ id: 'p1', name: '', text: 'a', enabled: true }, { id: 'p2', name: '', text: 'b', enabled: false }],
      suffixes: [{ id: 's1', name: '', text: 'c', enabled: true }],
      loras: [{ name: 'mature', strength: 0.8, enabled: true, trigger: 't' }, { name: 'loli', strength: 1, enabled: false, trigger: '' }],
    });
    const mature = snapshotPreset(extras, '成熟');
    extras.prefixes[0]!.enabled = false;
    extras.prefixes[1]!.enabled = true;
    extras.loras[0]!.enabled = false;
    extras.loras[1]!.enabled = true;
    extras.prefixes.push({ id: 'p3', name: '', text: 'new', enabled: true });
    expect(presetMatches(extras, mature)).toBe(false);

    applyPreset(extras, mature);
    expect(extras.prefixes.map(p => p.enabled)).toEqual([true, false, false]);
    expect(extras.loras.map(l => l.enabled)).toEqual([true, false]);
    expect(extras.activePresetId).toBe(mature.id);
    expect(presetMatches(extras, mature)).toBe(true);
    extras.loras[0]!.strength = 0.5;
    expect(presetMatches(extras, mature)).toBe(false);
  });
});

describe('无 LoRA 管理器时自动插入 LoRA', () => {
  it('Checkpoint 加载器后串联 LoraLoader，改接 model 与 clip', () => {
    const wf = ckptWorkflow();
    expect(loraMode(wf)).toBe('insert');
    const extras = extrasWith({
      lorasEnabled: true,
      loras: [
        { name: 'a.safetensors', strength: 0.8, enabled: true, trigger: '' },
        { name: 'off.safetensors', strength: 1, enabled: false, trigger: '' },
        { name: 'b.safetensors', strength: 0.5, enabled: true, trigger: '' },
      ],
    });
    applyExtras(wf, extras);
    const added = Object.entries(wf).filter(([, n]) => n.class_type === 'LoraLoader');
    expect(added).toHaveLength(2);
    const [[firstId, first], [lastId, last]] = added as [string, { inputs: Record<string, unknown> }][];
    expect(first.inputs).toMatchObject({ lora_name: 'a.safetensors', strength_model: 0.8, model: ['4', 0], clip: ['4', 1] });
    expect(last.inputs).toMatchObject({ lora_name: 'b.safetensors', model: [firstId, 0], clip: [firstId, 1] });
    expect((wf['3']!.inputs as Record<string, unknown>).model).toEqual([lastId, 0]);
    expect((wf['6']!.inputs as Record<string, unknown>).clip).toEqual([lastId, 1]);
    expect((wf['7']!.inputs as Record<string, unknown>).clip).toEqual([lastId, 1]);
    expect((wf['8']!.inputs as Record<string, unknown>).vae).toEqual(['4', 2]);
  });

  it('UNET 加载器用 LoraLoaderModelOnly', () => {
    const wf: ComfyWorkflow = {
      '1': { class_type: 'UNETLoader', inputs: { unet_name: 'u' } },
      '2': { class_type: 'KSampler', inputs: { model: ['1', 0] } },
    };
    expect(insertCoreLoras(wf, [{ name: 'x', strength: 1, enabled: true, trigger: '' }])).toBe(1);
    const id = Object.keys(wf).find(k => wf[k]!.class_type === 'LoraLoaderModelOnly')!;
    expect((wf['2']!.inputs as Record<string, unknown>).model).toEqual([id, 0]);
  });

  it('没有开着的 LoRA 不动；找不到模型加载节点报错', () => {
    const wf = ckptWorkflow();
    expect(insertCoreLoras(wf, [{ name: 'x', strength: 1, enabled: false, trigger: '' }])).toBe(0);
    expect(Object.keys(wf)).toHaveLength(5);
    expect(() => insertCoreLoras({ '1': { class_type: 'KSampler', inputs: {} } }, [{ name: 'x', strength: 1, enabled: true, trigger: '' }])).toThrow(/找不到模型加载节点/);
  });
});
