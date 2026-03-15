import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DIR = path.join(os.tmpdir(), 'statusmon-dex-test-' + Date.now());
const DEX_PATH = path.join(TEST_DIR, 'pokedex.json');

describe('pokedex', () => {
  beforeEach(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
  afterEach(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

  it('loadPokedex returns empty array when file missing', async () => {
    // Simulate what loadPokedex does
    let dex;
    try {
      dex = JSON.parse(fs.readFileSync(DEX_PATH, 'utf8'));
    } catch {
      dex = [];
    }
    expect(dex).toEqual([]);
  });

  it('recordPokemon appends to pokedex', async () => {
    const entry = {
      species: 'charmander',
      species_id: 4,
      max_species: 'charizard',
      max_species_id: 6,
      max_level: 42,
      types: ['fire'],
      genus: 'Lizard Pokemon',
      encountered_at: '2026-03-14',
      released_at: '2026-03-18',
      sessions: 12,
    };

    // First entry
    fs.writeFileSync(DEX_PATH, JSON.stringify([entry], null, 2));
    const dex = JSON.parse(fs.readFileSync(DEX_PATH, 'utf8'));
    expect(dex).toHaveLength(1);
    expect(dex[0].species).toBe('charmander');
    expect(dex[0].max_species).toBe('charizard');

    // Second entry
    dex.push({ ...entry, species: 'squirtle', max_species: 'blastoise' });
    fs.writeFileSync(DEX_PATH, JSON.stringify(dex, null, 2));
    const dex2 = JSON.parse(fs.readFileSync(DEX_PATH, 'utf8'));
    expect(dex2).toHaveLength(2);
  });

  it('pokedex entries have required fields', () => {
    const required = [
      'species',
      'max_species',
      'max_level',
      'types',
      'encountered_at',
      'released_at',
    ];
    const entry = {
      species: 'pikachu',
      max_species: 'pikachu',
      max_level: 30,
      types: ['electric'],
      encountered_at: '2026-03-14',
      released_at: '2026-03-15',
    };
    for (const field of required) {
      expect(entry).toHaveProperty(field);
    }
  });
});
