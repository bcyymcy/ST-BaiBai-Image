import { describe, expect, it } from 'vitest';
import { isNewer } from './update';

describe('isNewer', () => {
  it('compares numeric version segments', () => {
    expect(isNewer('0.1.3', '0.1.2')).toBe(true);
    expect(isNewer('0.3.2-bcy.4', '0.3.2-bcy.3')).toBe(true);
    expect(isNewer('0.3.2-bcy.1', '0.3.2')).toBe(true);
    expect(isNewer('0.3.2-bcy.3', '0.3.2-bcy.3')).toBe(false);
    expect(isNewer('0.1', '0.1.0')).toBe(false);
    expect(isNewer('1.0.0', '1.0.1')).toBe(false);
  });
});
