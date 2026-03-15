import { loadTrainer, saveTrainer } from '../lib/trainer.mjs';
import {
  computeLevel,
  tokensToXp,
  checkEvolution,
  shouldRelease,
  newEncounter,
  resolveSpeciesMeta,
  GEN_CAPS,
  TOKENS_PER_XP,
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

const DIM = '\x1b[2m',
  BOLD = '\x1b[1m',
  RESET = '\x1b[0m';

// Pokemon game-accurate type colors (RGB)
const TYPE_COLORS = {
  normal: [168, 168, 120],
  fire: [240, 128, 48],
  water: [104, 144, 240],
  grass: [120, 200, 80],
  electric: [248, 208, 48],
  ice: [152, 216, 216],
  fighting: [192, 48, 40],
  poison: [160, 64, 160],
  ground: [224, 192, 104],
  flying: [168, 144, 240],
  psychic: [248, 88, 136],
  bug: [168, 184, 32],
  rock: [184, 160, 56],
  ghost: [112, 88, 152],
  dragon: [112, 56, 248],
  dark: [112, 88, 72],
  steel: [184, 184, 208],
  fairy: [238, 153, 172],
};

function rgb(r, g, b) {
  return `\x1b[38;2;${r};${g};${b}m`;
}
function rgbBg(r, g, b) {
  return `\x1b[48;2;${r};${g};${b}m`;
}
function typeColor(types) {
  const c = TYPE_COLORS[types?.[0]] || TYPE_COLORS.normal;
  return rgb(c[0], c[1], c[2]);
}
function typeColorDim(types) {
  const c = TYPE_COLORS[types?.[0]] || TYPE_COLORS.normal;
  return rgb(
    Math.floor(c[0] * 0.5),
    Math.floor(c[1] * 0.5),
    Math.floor(c[2] * 0.5),
  );
}

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

  await render(state, level, totalTokens);
  process.exit(0);
}

async function render(state, level, totalTokens) {
  const name = capitalize(state.species);
  const emoji = TYPE_EMOJI[state.types?.[0]] || '❓';
  const types = state.types || ['normal'];
  const typeStr = types.map(capitalize).join(' · ');
  const genus = state.genus || 'Pokémon';
  const dexUrl = `https://pokemondb.net/pokedex/${state.species}`;
  const releaseLevel = state.release_level || 60;
  const tc = typeColor(types);
  const tcd = typeColorDim(types);
  const gen = state.generation || 1;
  const dexCount = state.dex_count || 0;
  const dexNum = state.species_id || '?';

  // XP bar shows progress toward NEXT level, not release level
  // Fills up, resets on level-up, fills again — every level feels like progress
  const banked = state.banked_xp || 0;
  const totalXpRaw = banked + totalTokens / TOKENS_PER_XP;
  const currentLevelXp = (level - 1) * 3; // XP at start of current level
  const nextLevelXp = level * 3; // XP needed for next level
  const pct = Math.min(
    1,
    (totalXpRaw - currentLevelXp) / (nextLevelXp - currentLevelXp),
  );
  const barW = 50;
  const filled = Math.round(pct * barW);
  const barFill = `${tc}${'━'.repeat(filled)}${RESET}`;
  const barEmpty = `${tcd}${'─'.repeat(barW - filled)}${RESET}`;

  // 2 lines above sprite
  const dexLink = `\x1b]8;;${dexUrl}\x07#${dexNum}\x1b]8;;\x07`;
  console.log(
    ` ${emoji} ${tc}${BOLD}${name.toUpperCase()}${RESET} ${DIM}LV${RESET}${BOLD}${level}${RESET} ${DIM}· ${dexLink} · ${genus} · Gen ${gen}${RESET}`,
  );
  console.log(` ${barFill}${barEmpty}`);

  // Sprite below
  try {
    const spriteRows = await miniSprite(
      state.species_id,
      state.sprite_size || 48,
    );
    spriteRows.forEach((line) => console.log(` ${line}`));
  } catch {}
}

async function miniSprite(pokemonId, size = 48) {
  const { PNG } = await import('pngjs');
  const { fetchSprite } = await import('../lib/cache.mjs');
  const buf = await fetchSprite(pokemonId);
  const src = PNG.sync.read(buf);
  const w = size,
    h = size;

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
  // No trimming — fixed 24-row canvas ensures consistent alignment
  return rows;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
