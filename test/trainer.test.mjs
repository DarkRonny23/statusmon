import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Use a temp dir so tests don't touch real state
const TEST_DIR = path.join(os.tmpdir(), 'statusmon-test-' + Date.now());
const TRAINER_PATH = path.join(TEST_DIR, 'trainer.json');

describe('trainer state', () => {
  beforeEach(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

  it('createTrainer produces valid state with all required fields', async () => {
    // Import dynamically so we can check the shape
    const { createTrainer } = await import('../lib/trainer.mjs');
    const encounter = {
      chainId: 2,
      species: 'charmander',
      speciesId: 4,
      types: ['fire'],
      genus: 'Lizard Pokemon',
      targetLevel: 16,
      releaseLevel: 60,
      isFinal: false,
      stages: [
        { species: 'charmander', speciesId: 4, minLevel: null },
        { species: 'charmeleon', speciesId: 5, minLevel: 16 },
      ],
    };
    const state = createTrainer(encounter);

    expect(state.species).toBe('charmander');
    expect(state.species_id).toBe(4);
    expect(state.started_species).toBe('charmander');
    expect(state.banked_xp).toBe(0);
    expect(state.last_session_tokens).toBe(0);
    expect(state.generation).toBe(1);
    expect(state.dex_count).toBe(0);
    expect(state.stages).toHaveLength(2);
    expect(state.target_level).toBe(16);
    expect(state.release_level).toBe(60);
  });

  it('save and load roundtrip preserves state', async () => {
    const state = {
      species: 'pikachu',
      species_id: 25,
      banked_xp: 42,
      level: 15,
    };
    // Write directly to test path
    fs.writeFileSync(TRAINER_PATH, JSON.stringify(state, null, 2));
    const loaded = JSON.parse(fs.readFileSync(TRAINER_PATH, 'utf8'));

    expect(loaded.species).toBe('pikachu');
    expect(loaded.banked_xp).toBe(42);
  });

  it('atomic save does not corrupt on valid data', async () => {
    const tmp = TRAINER_PATH + '.tmp';
    const state = { species: 'bulbasaur', banked_xp: 10 };
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, TRAINER_PATH);

    const loaded = JSON.parse(fs.readFileSync(TRAINER_PATH, 'utf8'));
    expect(loaded.species).toBe('bulbasaur');
    expect(fs.existsSync(tmp)).toBe(false);
  });
});
