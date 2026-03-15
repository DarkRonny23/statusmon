import { describe, it, expect } from 'vitest';
import { computeLevel, tokensToXp, TOKENS_PER_XP } from '../lib/evolution.mjs';

describe('XP banking model', () => {
  it('session XP computed from total tokens', () => {
    // 100K tokens at 10K per XP = 10 XP
    expect(tokensToXp(100000)).toBe(10);
  });

  it('banked + session XP gives correct level', () => {
    const banked = 30; // from previous sessions
    const sessionTokens = 50000;
    const sessionXp = tokensToXp(sessionTokens); // 5
    const level = computeLevel(banked + sessionXp); // floor(35/3)+1 = 12
    expect(level).toBe(12);
  });

  it('zero tokens gives zero session XP', () => {
    expect(tokensToXp(0)).toBe(0);
  });

  it('tokens below threshold give zero XP', () => {
    expect(tokensToXp(TOKENS_PER_XP - 1)).toBe(0);
  });

  it('exactly one threshold gives 1 XP', () => {
    expect(tokensToXp(TOKENS_PER_XP)).toBe(1);
  });

  it('level 1 at zero total XP', () => {
    expect(computeLevel(0)).toBe(1);
  });

  it('level progresses correctly through evolution thresholds', () => {
    // Charmander evolves at 16: need xp where floor(xp/3)+1 >= 16 → xp >= 45
    const xpNeeded = 45;
    expect(computeLevel(xpNeeded)).toBe(16);
    expect(computeLevel(xpNeeded - 1)).toBe(15);
  });

  it('heavy session gives meaningful progress', () => {
    // 500K tokens = 50 XP = level 17
    const level = computeLevel(tokensToXp(500000));
    expect(level).toBe(17);
    expect(level).toBeGreaterThanOrEqual(16); // should trigger Charmander evolution
  });
});
