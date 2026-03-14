import fs from 'fs';
import path from 'path';
import os from 'os';

const STATE_DIR = path.join(os.homedir(), '.statusmon');
const TRAINER_PATH = path.join(STATE_DIR, 'trainer.json');
let stateDirReady = false;

export function loadTrainer() {
  try {
    return JSON.parse(fs.readFileSync(TRAINER_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function saveTrainer(state) {
  if (!stateDirReady) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    stateDirReady = true;
  }
  const tmp = TRAINER_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, TRAINER_PATH);
}

export function createTrainer(chainId, species, speciesId, extra = {}) {
  return {
    chain_id: chainId,
    species,
    species_id: speciesId,
    started_species: species,
    started_species_id: speciesId,
    prev_tokens: 0,
    xp: 0,
    level: 1,
    just_evolved: false,
    sessions: 0,
    started_at: new Date().toISOString().slice(0, 10),
    // Denormalized from API — avoids re-fetching in statusline
    types: extra.types || ['normal'],
    genus: extra.genus || 'Pokémon',
    target_level: extra.targetLevel || 30,
    is_final: extra.isFinal || false,
    dex_count: extra.dexCount || 0,
  };
}
