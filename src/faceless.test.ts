import { describe, expect, it } from 'vitest';
import { applyFaceless, applyNlRules, applyTagRules, facelessDefaults, normalizeFaceless } from './faceless';

const on = () => ({ ...facelessDefaults(), enabled: true });

describe('faceless', () => {
  it('replaces whole tags only and dedupes', () => {
    const [out, hit] = applyTagRules('1girl, 1boy, 1boy_focus, faceless male, male focus', on().rules);
    expect(hit).toBe(true);
    expect(out).toBe('1girl, 1boy, faceless male, 1boy_focus');
  });

  it('replaces nl phrases as whole words, longest first, keeping case', () => {
    const [out, hit] = applyNlRules('A man and the young man look at a manly statue; his face hidden.', on().rules);
    expect(hit).toBe(true);
    expect(out).toBe('A faceless man and the faceless young man look at a manly statue; his blank featureless face hidden.');
  });

  it('leaves images without men untouched', () => {
    const input = { prompt: '1girl, solo', nl: 'A girl smiles.', negative: 'lowres' };
    const out = applyFaceless(input, on());
    expect(out.hit).toBe(false);
    expect(out.value).toBe(input);
  });

  it('adds negative on hit and does nothing when disabled', () => {
    const input = { prompt: '1girl, 1boy', nl: '', negative: 'lowres' };
    expect(applyFaceless(input, facelessDefaults()).value).toBe(input);
    const out = applyFaceless(input, on());
    expect(out.value.prompt).toBe('1girl, 1boy, faceless male');
    expect(out.value.negative).toBe('lowres, male face, detailed male face, male eyes');
  });

  it('normalizes missing settings to disabled defaults', () => {
    const n = normalizeFaceless(undefined);
    expect(n.enabled).toBe(false);
    expect(n.rules.length).toBeGreaterThan(5);
    expect(normalizeFaceless({ enabled: true, rules: [] }).rules).toEqual([]);
  });
});
