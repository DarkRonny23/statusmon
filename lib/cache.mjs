import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CACHE_DIR = path.join(os.homedir(), '.statusmon', 'cache');
let cacheDirReady = false;

function ensureCacheDir() {
  if (cacheDirReady) return;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  cacheDirReady = true;
}

function cachePathFor(endpoint) {
  return path.join(
    CACHE_DIR,
    endpoint.replace(/\//g, '-').replace(/^-/, '') + '.json',
  );
}

function spritePathFor(pokemonId) {
  return path.join(CACHE_DIR, `sprite-${pokemonId}.png`);
}

export async function fetchCached(endpoint) {
  ensureCacheDir();
  const cachePath = cachePathFor(endpoint);
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  }
  const url = `https://pokeapi.co/api/v2/${endpoint}`;
  const buf = await fetchRaw(url);
  const data = JSON.parse(buf.toString());
  fs.writeFileSync(cachePath, JSON.stringify(data));
  return data;
}

export async function fetchSprite(pokemonId) {
  ensureCacheDir();
  const pngPath = spritePathFor(pokemonId);
  if (fs.existsSync(pngPath)) {
    return fs.readFileSync(pngPath);
  }
  const buf = await fetchRaw(
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemonId}.png`,
  );
  fs.writeFileSync(pngPath, buf);
  return buf;
}

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return fetchRaw(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}
