import { loadTrainer, saveTrainer } from '../lib/trainer.mjs';
import {
  computeLevel,
  tokensToXp,
  checkEvolution,
  shouldRelease,
  newEncounter,
  resolveSpeciesMeta,
  GEN_CAPS,
} from '../lib/evolution.mjs';
import {
  renderSprite,
  inlineSprite,
  supportsInlineImages,
} from '../lib/sprite.mjs';
import { recordPokemon } from '../lib/pokedex.mjs';

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
  main().catch((e) => process.stderr.write(`statusmon: ${e.message}\n`));
});

async function main() {
  const state = loadTrainer();
  if (!state || !state.species) {
    console.log(' ❓ MissingNo. Lv.???');
    console.log('    ??? · Run /pokemon to get started');
    process.exit(0);
    return;
  }

  // Compute level from banked XP + live session tokens
  let session = {};
  try {
    session = JSON.parse(input);
  } catch {}
  const totalTokens =
    (session.context_window?.total_input_tokens || 0) +
    (session.context_window?.total_output_tokens || 0);

  const sessionXp = tokensToXp(totalTokens);
  const level = computeLevel((state.banked_xp || 0) + sessionXp);

  // Persist session tokens periodically so session-start can bank them
  if (totalTokens - (state.last_session_tokens || 0) >= 10000) {
    state.last_session_tokens = totalTokens;
    saveTrainer(state);
  }

  // Check evolution/release when level crosses threshold
  const stages = state.stages || [];
  if (stages.length > 0 && level >= (state.target_level || 30)) {
    try {
      const evolved = checkEvolution(state.species, level, stages);
      if (evolved) {
        const oldName = capitalize(state.species);
        const meta = await resolveSpeciesMeta(
          evolved.speciesId,
          evolved.species,
          stages,
        );
        Object.assign(state, {
          species: evolved.species,
          species_id: evolved.speciesId,
          just_evolved: true,
          types: meta.types,
          genus: meta.genus,
          target_level: meta.targetLevel,
          release_level: meta.releaseLevel,
          is_final: meta.isFinal,
        });
        saveTrainer(state);

        try {
          const sprite = await renderSprite(evolved.speciesId);
          console.log(
            `\n  What? ${oldName} is evolving!\n\n${sprite}\n\n  Congratulations! ${oldName} evolved into ${capitalize(evolved.species)}!\n`,
          );
        } catch {
          console.log(
            `\n  What? ${oldName} is evolving!\n\n  Congratulations! ${oldName} evolved into ${capitalize(evolved.species)}!\n`,
          );
        }
        await render(state, level);
        process.exit(0);
        return;
      }

      if (shouldRelease(state.species, level, stages)) {
        recordPokemon({ ...state, level });
        const gen = state.generation || 1;
        const maxSpecies = GEN_CAPS[Math.min(gen, GEN_CAPS.length) - 1];
        const encounter = await newEncounter(maxSpecies);
        const newState = {
          ...state,
          chain_id: encounter.chainId,
          species: encounter.species,
          species_id: encounter.speciesId,
          started_species: encounter.species,
          started_species_id: encounter.speciesId,
          banked_xp: 0,
          last_session_tokens: 0,
          just_evolved: false,
          types: encounter.types,
          genus: encounter.genus,
          target_level: encounter.targetLevel,
          release_level: encounter.releaseLevel,
          is_final: encounter.isFinal,
          stages: encounter.stages,
          dex_count: (state.dex_count || 0) + 1,
        };
        saveTrainer(newState);

        try {
          const sprite = await renderSprite(encounter.speciesId);
          console.log(
            `\n  A wild ${capitalize(encounter.species)} appeared!\n\n${sprite}\n\n  Your new companion awaits...\n`,
          );
        } catch {
          console.log(
            `\n  A wild ${capitalize(encounter.species)} appeared!\n\n  Your new companion awaits...\n`,
          );
        }
        await render(newState, 1);
        process.exit(0);
        return;
      }
    } catch (e) {
      process.stderr.write(`statusmon evolution: ${e.message}\n`);
    }
  }

  // Clear sparkle after one render
  if (state.just_evolved) {
    state.just_evolved = false;
    saveTrainer(state);
  }

  await render(state, level);
  process.exit(0);
}

async function render(state, level) {
  const name = capitalize(state.species);
  const emoji = TYPE_EMOJI[state.types?.[0]] || '❓';
  const typeStr = (state.types || ['normal']).map(capitalize).join('/');
  const genus = state.genus || 'Pokémon';
  const indicator = state.just_evolved ? ' ✨' : state.is_final ? ' ★' : '';
  const releaseLevel = state.release_level || 60;

  const pct = Math.min(1, level / releaseLevel);
  const barW = 12;
  const filled = Math.round(pct * barW);
  const barColor = pct > 0.5 ? G : pct > 0.25 ? Y : C;
  const barStr = `${barColor}${'█'.repeat(filled)}${'░'.repeat(barW - filled)}${RESET} → Lv.${releaseLevel}`;
  const dexStr = state.dex_count > 0 ? ` · #${state.dex_count}` : '';

  // Render sprite alongside info
  let spriteRows = [];
  try {
    spriteRows = await miniSprite(state.species_id);
  } catch {}

  if (spriteRows.length > 0) {
    const totalXp =
      (state.banked_xp || 0) + tokensToXp(state.last_session_tokens || 0);
    const gen = state.generation || 1;
    const sessions = state.sessions || 0;

    // Build info panel lines
    const info = [
      '',
      `  ${emoji} ${name}${indicator}`,
      '',
      `  ${DIM}Lv.${RESET}${level}`,
      `  ${barStr}`,
      '',
      `  ${DIM}${typeStr}${RESET}`,
      `  ${DIM}${genus}${RESET}`,
      '',
      `  ${DIM}XP ${totalXp} · Gen ${gen}${dexStr}${RESET}`,
    ];

    // Center info vertically against sprite
    const offset = Math.max(
      0,
      Math.floor((spriteRows.length - info.length) / 2),
    );
    for (let i = 0; i < spriteRows.length; i++) {
      const infoIdx = i - offset;
      const infoLine =
        infoIdx >= 0 && infoIdx < info.length ? info[infoIdx] : '';
      console.log(` ${spriteRows[i]}${infoLine}`);
    }
  } else {
    console.log(` ${emoji} ${name}${indicator} Lv.${level}  ${barStr}`);
    console.log(`    ${DIM}${typeStr} · ${genus}${dexStr}${RESET}`);
  }
}

async function miniSprite(pokemonId) {
  const { PNG } = await import('pngjs');
  const { fetchSprite } = await import('../lib/cache.mjs');
  const buf = await fetchSprite(pokemonId);
  const src = PNG.sync.read(buf);
  const w = 48,
    h = 48;

  // Bilinear interpolation for smoother downscaling
  function sample(fx, fy) {
    const x0 = Math.floor(fx),
      y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, src.width - 1),
      y1 = Math.min(y0 + 1, src.height - 1);
    const dx = fx - x0,
      dy = fy - y0;
    const mix = (a, b, t) => Math.round(a + (b - a) * t);
    const px = (px, py) => {
      const i = (py * src.width + px) * 4;
      return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
    };
    const [r00, g00, b00, a00] = px(x0, y0);
    const [r10, g10, b10, a10] = px(x1, y0);
    const [r01, g01, b01, a01] = px(x0, y1);
    const [r11, g11, b11, a11] = px(x1, y1);
    return {
      r: mix(mix(r00, r10, dx), mix(r01, r11, dx), dy),
      g: mix(mix(g00, g10, dx), mix(g01, g11, dx), dy),
      b: mix(mix(b00, b10, dx), mix(b01, b11, dx), dy),
      a: mix(mix(a00, a10, dx), mix(a01, a11, dx), dy),
    };
  }

  const sx = src.width / w,
    sy = src.height / h;
  const rows = [];
  for (let y = 0; y < h; y += 2) {
    let line = '';
    for (let x = 0; x < w; x++) {
      const top = sample(x * sx, y * sy);
      const bot = sample(x * sx, (y + 1) * sy);
      if (top.a < 64 && bot.a < 64) {
        line += ' ';
        continue;
      }
      if (top.a < 64) {
        line += `\x1b[38;2;${bot.r};${bot.g};${bot.b}m▄\x1b[0m`;
        continue;
      }
      if (bot.a < 64) {
        line += `\x1b[38;2;${top.r};${top.g};${top.b}m▀\x1b[0m`;
        continue;
      }
      line += `\x1b[38;2;${top.r};${top.g};${top.b};48;2;${bot.r};${bot.g};${bot.b}m▀\x1b[0m`;
    }
    rows.push(line);
  }
  while (rows.length > 0 && rows[0].trim() === '') rows.shift();
  while (rows.length > 0 && rows[rows.length - 1].trim() === '') rows.pop();
  return rows;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
