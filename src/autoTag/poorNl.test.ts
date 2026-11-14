import { describe, expect, it } from 'vitest';
import { isPoorNl } from './charAnchors';

describe('isPoorNl', () => {
  it('flags meta / absence wording', () => {
    expect(isPoorNl('The girl whose medium-length light brown hair and brown eyes are her main features has a petite build, and no scars or other permanent marks are noted.')).toBe(true);
  });
  it('accepts plain appearance', () => {
    expect(isPoorNl('A girl with medium-length light brown hair, brown eyes and a petite build.')).toBe(false);
  });
});
