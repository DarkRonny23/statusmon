import { loadTrainer, saveTrainer } from '../lib/trainer.mjs';
import {
  computeLevel,
  tokensToXp,
  checkEvolution,
  shouldRelease,
  getStages,
  findCurrentStageIndex,
  newEncounter,
  resolveSpeciesMeta,
} from '../lib/evolution.mjs';
import { renderSprite } from '../lib/sprite.mjs';
import { recordPokemon, loadPokedex } from '../lib/pokedex.mjs';

const TYPE_EMOJI = {
  normal: '⬜',
  fire: '🔥',
  water: '💧',
  grass: '🌿',
  electric: '⚡',
  ice: '❄️',
  fighting: '🥊',
  poison: '☠️',
  ground: '🌍',
  flying: '🪽',
  psychic: '🔮',
  bug: '🐛',
  rock: '🪨',
  ghost: '👻',
  dragon: '🐉',
  dark: '🌑',
  steel: '⚙️',
  fairy: '🧚',
};

const G = '\x1b[32m',
  Y = '\x1b[33m',
  C = '\x1b[36m',
  DIM = '\x1b[2m',
  RESET = '\x1b[0m';

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  main().catch(() => {});
});

async function main() {
  const state = loadTrainer();
  if (!state || !state.species) {
    console.log(' ❓ MissingNo. Lv.???');
    console.log('    ??? · Run /pokemon to get started');
    process.exit(0);
    return;
  }

  // Derive XP from session token counts
  let session = {};
  try {
    session = JSON.parse(input);
  } catch {}
  const totalTokens =
    (session.context_window?.total_input_tokens || 0) +
    (session.context_window?.total_output_tokens || 0);

  // New session detection: token counts reset to 0 each session
  let dirty = false;
  if (totalTokens < (state.prev_tokens || 0)) {
    state.prev_tokens = 0;
    dirty = true;
  }

  const newXp = tokensToXp(totalTokens, state.prev_tokens || 0);

  if (newXp > 0) {
    state.xp = (state.xp || 0) + newXp;
    state.prev_tokens = totalTokens;
    state.level = computeLevel(state.xp);
    dirty = true;
  }

  // Check evolution (uses denormalized data first, falls back to API)
  if (dirty && !state.is_final) {
    try {
      const stages = await getStages(state.chain_id);
      const evolved = checkEvolution(state, stages);
      if (evolved) {
        const oldName = capitalize(state.species);
        state.species = evolved.species;
        state.species_id = evolved.speciesId;
        state.just_evolved = true;
        const meta = await resolveSpeciesMeta(
          evolved.speciesId,
          state.chain_id,
          evolved.species,
        );
        Object.assign(state, {
          types: meta.types,
          genus: meta.genus,
          target_level: meta.targetLevel,
          is_final: meta.isFinal,
        });
        dirty = true;

        // Queue announcement for Stop hook to deliver
        try {
          const sprite = await renderSprite(evolved.speciesId);
          state.pending_announcement = `\n  What? ${oldName} is evolving!\n\n${sprite}\n\n  Congratulations! ${oldName} evolved into ${capitalize(evolved.species)}!\n`;
        } catch {
          state.pending_announcement = `\n  What? ${oldName} is evolving!\n\n  Congratulations! ${oldName} evolved into ${capitalize(evolved.species)}!\n`;
        }
      } else if (shouldRelease(state, stages)) {
        recordPokemon(state);
        const encounter = await newEncounter();
        const meta = await resolveSpeciesMeta(
          encounter.speciesId,
          encounter.chainId,
          encounter.species,
        );
        Object.assign(state, {
          chain_id: encounter.chainId,
          species: encounter.species,
          species_id: encounter.speciesId,
          started_species: encounter.species,
          started_species_id: encounter.speciesId,
          xp: 0,
          level: 1,
          prev_tokens: totalTokens,
          just_evolved: false,
          types: meta.types,
          genus: meta.genus,
          target_level: meta.targetLevel,
          is_final: meta.isFinal,
        });
        dirty = true;
        try {
          const sprite = await renderSprite(encounter.speciesId);
          state.pending_announcement = `\n  A wild ${capitalize(encounter.species)} appeared!\n\n${sprite}\n\n  Your new companion awaits...\n`;
        } catch {
          state.pending_announcement = `\n  A wild ${capitalize(encounter.species)} appeared!\n\n  Your new companion awaits...\n`;
        }
      }
    } catch {}
  }

  if (dirty) saveTrainer(state);

  // Clear sparkle after first render
  if (state.just_evolved && !dirty) {
    state.just_evolved = false;
    saveTrainer(state);
  }

  // Render statusline from denormalized state — no API calls needed
  const name = capitalize(state.species);
  const emoji = TYPE_EMOJI[state.types?.[0]] || '❓';
  const typeStr = (state.types || ['normal']).map(capitalize).join('/');
  const genus = state.genus || 'Pokémon';
  const indicator = state.just_evolved ? ' ✨' : state.is_final ? ' ★' : '';
  const targetLevel = state.target_level || 30;

  const releaseLevel = state.is_final ? 60 : targetLevel;
  const pct = Math.min(1, state.level / releaseLevel);
  const barW = 12;
  const filled = Math.round(pct * barW);
  const barColor = pct > 0.5 ? G : pct > 0.25 ? Y : C;
  const barStr = `  ${barColor}${'█'.repeat(filled)}${'░'.repeat(barW - filled)}${RESET} → Lv.${releaseLevel}`;

  const dexCount = loadPokedex().length;
  const dexStr = dexCount > 0 ? ` · #${dexCount}` : '';

  console.log(` ${emoji} ${name}${indicator} Lv.${state.level}${barStr}`);
  console.log(`    ${DIM}${typeStr} · ${genus}${dexStr}${RESET}`);
  process.exit(0);
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
