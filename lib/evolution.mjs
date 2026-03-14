import crypto from 'crypto';
import { fetchCached } from './cache.mjs';

const TOTAL_CHAINS = 541;
const DEFAULT_EVOLVE_LEVEL = 20;
const RELEASE_LEVEL = 30;
const POST_FINAL_LEVELS = 30;
const MAX_LEVEL_CAP = 60;
const TOKENS_PER_XP = 25000;

export function computeLevel(xp) {
  return Math.floor(xp / 3) + 1;
}

export function tokensToXp(totalTokens, prevTokens) {
  return Math.floor((totalTokens - prevTokens) / TOKENS_PER_XP);
}

export function flattenChain(chainData) {
  const stages = [];
  function walk(node) {
    const speciesId = parseInt(node.species.url.split('/').filter(Boolean).pop(), 10);
    let minLevel = null;
    if (node.evolution_details && node.evolution_details.length > 0) {
      minLevel = node.evolution_details[0].min_level || DEFAULT_EVOLVE_LEVEL;
    }
    stages.push({ species: node.species.name, speciesId, minLevel });
    if (node.evolves_to && node.evolves_to.length > 0) {
      walk(node.evolves_to[0]);
    }
  }
  walk(chainData.chain);
  return stages;
}

export function findCurrentStageIndex(stages, species) {
  return stages.findIndex((s) => s.species === species);
}

export function checkEvolution(state, stages) {
  const idx = findCurrentStageIndex(stages, state.species);
  if (idx < 0 || idx >= stages.length - 1) return null;
  const nextStage = stages[idx + 1];
  return state.level >= nextStage.minLevel ? nextStage : null;
}

export function shouldRelease(state, stages) {
  const idx = findCurrentStageIndex(stages, state.species);
  const isFinalForm = idx === stages.length - 1;
  const canEvolve = stages.length > 1;

  if (!canEvolve && state.level >= RELEASE_LEVEL) return true;
  if (isFinalForm) {
    const finalMinLevel = stages[stages.length - 1].minLevel || 0;
    if (state.level >= finalMinLevel + POST_FINAL_LEVELS || state.level >= MAX_LEVEL_CAP) return true;
  }
  return false;
}

export function randomChainId() {
  return crypto.randomInt(TOTAL_CHAINS) + 1;
}

export async function newEncounter() {
  const chainId = randomChainId();
  const chainData = await fetchCached(`evolution-chain/${chainId}`);
  const stages = flattenChain(chainData);
  const base = stages[0];
  return { chainId, stages, species: base.species, speciesId: base.speciesId };
}

export async function getStages(chainId) {
  const chainData = await fetchCached(`evolution-chain/${chainId}`);
  return flattenChain(chainData);
}

// Resolve denormalized metadata for a species (types, genus, evolution target)
export async function resolveSpeciesMeta(speciesId, chainId, speciesName) {
  let types = ['normal'];
  let genus = 'Pokémon';
  let targetLevel = RELEASE_LEVEL;
  let isFinal = false;

  try {
    const pokemon = await fetchCached(`pokemon/${speciesId}`);
    types = pokemon.types.map((t) => t.type.name);
  } catch {}
  try {
    const species = await fetchCached(`pokemon-species/${speciesId}`);
    const g = species.genera.find((e) => e.language.name === 'en');
    if (g) genus = g.genus;
  } catch {}
  try {
    const stages = await getStages(chainId);
    const idx = findCurrentStageIndex(stages, speciesName);
    if (idx >= 0 && idx < stages.length - 1) {
      targetLevel = stages[idx + 1].minLevel;
    } else if (stages.length > 1) {
      isFinal = true;
    }
  } catch {}

  return { types, genus, targetLevel, isFinal };
}

export { RELEASE_LEVEL, TOKENS_PER_XP };
