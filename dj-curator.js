// dj-curator.js — AI Playlist Engine for Boxing Classes
// ESM module
// Generates playlists matched to class energy curves + taste map preferences
// Works immediately with taste map seed data. Spotify API is optional upgrade.

import fs from 'fs';
import path from 'path';
import { getTasteProfile, checkRejection, addAnchor } from './taste-map-api.js';

const HOME = process.env.HOME;
const DJ_DIR = path.join(HOME, 'nanoclaw', 'dj-curator');
const PROFILES_PATH = path.join(DJ_DIR, 'class-profiles.json');
const HISTORY_PATH = path.join(DJ_DIR, 'playlist-history.json');
const SPOTIFY_CACHE_PATH = path.join(DJ_DIR, 'spotify-cache.json');

// ── Genre → Taste Map Anchor Mapping ────────────────────────────────────────

const GENRE_MAP = {
  drill: { context: 'boxing_class', filter: a => a.energy >= 0.85, artists: ['6ix9ine', 'Pop Smoke', 'Bobby Shmurda', 'King Von', '21 Savage'] },
  trap: { context: 'boxing_class', filter: a => a.energy >= 0.75 && a.energy < 0.95, artists: ['Travis Scott', 'DaBaby', 'Gunna', 'Lil Baby', 'Roddy Ricch', 'Lil Pump', 'Desiigner', 'NLE Choppa'] },
  hip_hop: { context: 'boxing_class', filter: a => a.energy >= 0.6 && a.energy < 0.85, artists: ['Drake', 'Tyga', 'Jack Harlow', 'Post Malone', 'A$AP Rocky', 'Cardi B', 'CJ', 'Masked Wolf'] },
  pop_rap: { context: 'boxing_class', filter: a => a.energy >= 0.5 && a.energy < 0.8, artists: ['24kGoldn', 'Saweetie', 'Lil Tjay', 'Juice WRLD'] },
  old_school_rnb: { context: 'cooldown', filter: a => a.energy <= 0.6, artists: ['Ashanti', 'Ja Rule', 'Usher', 'Tevin Campbell', 'Mariah Carey', 'TLC', 'Tamia', 'Keith Sweat', 'Blackstreet', 'Next', 'Lloyd', 'Fantasia', 'Jaheim', 'Bow Wow', 'Chris Brown', 'Fabolous'] },
  classic_hip_hop: { context: 'cooldown', filter: a => a.energy >= 0.5, artists: ['2Pac', 'Notorious B.I.G.', '50 Cent', 'Dr. Dre', 'Big Pun', 'Fat Joe / Terror Squad', 'Mark Morrison', 'Kanye West'] },
  reggaeton: { context: null, filter: () => true, artists: [] }, // broader anchors
  latin_trap: { context: null, filter: () => true, artists: [] },
  afrobeats: { context: null, filter: () => true, artists: [] },
  funky_reggae: { context: null, filter: () => true, artists: [] },
  pump_up: { context: null, filter: () => true, artists: ['Snap!'], extra: ['Rocky themes', 'Michael Jackson'] },
  broader: { context: null, filter: () => true, artists: ['Massive Attack', 'Moby', 'Michael Jackson', 'Kanye West'] },
  wildcard: { context: null, filter: () => true, artists: ['Lynyrd Skynyrd'], note: 'Unexpected picks that land — genre rules bend when energy + surprise is right' }
};

// ── Load Data ───────────────────────────────────────────────────────────────

function loadProfiles() {
  return JSON.parse(fs.readFileSync(PROFILES_PATH, 'utf8'));
}

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch {
    return { playlists: [], ratings: [] };
  }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

// ── Track Selection ─────────────────────────────────────────────────────────

/**
 * Build track pool from taste map anchors for a genre
 */
function getTracksForGenre(genre) {
  const mapping = GENRE_MAP[genre];
  if (!mapping) return [];

  const tracks = [];

  // Get from taste map anchors
  const allAnchors = [];
  if (mapping.context) {
    const profile = getTasteProfile('music', mapping.context);
    if (profile?.anchors) allAnchors.push(...profile.anchors);
  }
  // Also check broader
  const allMusic = getTasteProfile('music');
  if (allMusic?.anchors) allAnchors.push(...allMusic.anchors);

  // Filter by artist list for this genre
  for (const anchor of allAnchors) {
    const artistName = anchor.artist || anchor.name || '';
    if (mapping.artists.some(a => artistName.toLowerCase().includes(a.toLowerCase()))) {
      const anchorTracks = anchor.tracks || [artistName];
      for (const track of anchorTracks) {
        tracks.push({
          artist: artistName,
          title: track,
          energy: anchor.energy || 0.7,
          genre,
          source: 'taste_map'
        });
      }
    }
  }

  // Add extra items if defined
  if (mapping.extra) {
    for (const item of mapping.extra) {
      tracks.push({ artist: item, title: item, energy: 0.9, genre, source: 'genre_map' });
    }
  }

  return tracks;
}

/**
 * Select tracks for a phase based on genre weights and energy range
 */
function selectTracksForPhase(phase, trackCount, recentArtists = new Set()) {
  const candidates = [];
  const weights = phase.genre_weight || {};

  for (const [genre, weight] of Object.entries(weights)) {
    if (weight <= 0) continue;
    const genreTracks = getTracksForGenre(genre);
    // Weight by adding multiple times
    const copies = Math.ceil(weight * 10);
    for (let i = 0; i < copies; i++) {
      candidates.push(...genreTracks);
    }
  }

  if (candidates.length === 0) return [];

  // Filter by energy range
  const [minE, maxE] = phase.energy || [0, 1];
  const energyFiltered = candidates.filter(t => {
    const e = t.energy || 0.5;
    // Allow some flexibility (±0.15)
    return e >= (minE - 0.15) && e <= (maxE + 0.15);
  });

  const pool = energyFiltered.length > 0 ? energyFiltered : candidates;

  // Select tracks, avoiding recent artists
  const selected = [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  for (const track of shuffled) {
    if (selected.length >= trackCount) break;
    // Skip if artist was in last 2 selections
    if (recentArtists.has(track.artist) && selected.length < trackCount - 1) continue;
    // Skip duplicates
    if (selected.some(s => s.artist === track.artist && s.title === track.title)) continue;
    // Check taste map rejections
    const rejection = checkRejection('music', track.title + ' ' + track.artist);
    if (rejection.rejected) continue;

    selected.push(track);
    recentArtists.add(track.artist);
  }

  return selected;
}

// ── Playlist Generation ─────────────────────────────────────────────────────

/**
 * Generate a full class playlist
 * @param {string} profileName - 'standard', 'la_habana', 'old_school', 'war_mode', 'wildcard_heavy'
 * @param {object} [options] - { mood: string, wildcardCount: number }
 * @returns {object} playlist with phases, tracks, metadata
 */
export function generatePlaylist(profileName = 'standard', options = {}) {
  const { profiles } = loadProfiles();
  const profile = profiles[profileName];
  if (!profile) {
    const available = Object.keys(profiles).join(', ');
    throw new Error(`Unknown profile: ${profileName}. Available: ${available}`);
  }

  const recentArtists = new Set();
  const playlist = {
    profile: profileName,
    profileName: profile.name,
    description: profile.description,
    duration: profile.duration,
    generatedAt: new Date().toISOString(),
    mood: options.mood || null,
    phases: [],
    totalTracks: 0
  };

  for (const phase of profile.phases) {
    const phaseDuration = phase.minutes[1] - phase.minutes[0];
    // ~3.5 min per track average
    const trackCount = Math.max(1, Math.round(phaseDuration / 3.5));

    const tracks = selectTracksForPhase(phase, trackCount, recentArtists);

    playlist.phases.push({
      name: phase.name,
      minutes: phase.minutes,
      bpm: phase.bpm,
      energy: phase.energy,
      mood: phase.mood,
      tracks
    });

    playlist.totalTracks += tracks.length;
  }

  // Save to history
  const history = loadHistory();
  history.playlists.push({
    id: `pl-${Date.now()}`,
    profile: profileName,
    generatedAt: playlist.generatedAt,
    totalTracks: playlist.totalTracks,
    rated: false
  });
  saveHistory(history);

  return playlist;
}

// ── Spotify Integration (optional, requires credentials) ────────────────────

/**
 * Check if Spotify credentials are configured
 */
export function hasSpotifyCredentials() {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

/**
 * Search Spotify for a track (requires credentials)
 */
export async function searchSpotify(artist, title) {
  if (!hasSpotifyCredentials()) return null;

  try {
    // Get access token
    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
        ).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResp.ok) return null;
    const { access_token } = await tokenResp.json();

    // Search
    const query = encodeURIComponent(`${artist} ${title}`);
    const searchResp = await fetch(
      `https://api.spotify.com/v1/search?q=${query}&type=track&limit=1`,
      { headers: { 'Authorization': `Bearer ${access_token}` } }
    );

    if (!searchResp.ok) return null;
    const data = await searchResp.json();
    const track = data.tracks?.items?.[0];
    if (!track) return null;

    return {
      spotifyId: track.id,
      spotifyUri: track.uri,
      name: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album?.name,
      previewUrl: track.preview_url,
      externalUrl: track.external_urls?.spotify,
      durationMs: track.duration_ms
    };
  } catch {
    return null;
  }
}

/**
 * Get audio features for a Spotify track (BPM, energy, etc)
 */
export async function getAudioFeatures(spotifyId) {
  if (!hasSpotifyCredentials()) return null;

  try {
    const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(
          process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
        ).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResp.ok) return null;
    const { access_token } = await tokenResp.json();

    const resp = await fetch(
      `https://api.spotify.com/v1/audio-features/${spotifyId}`,
      { headers: { 'Authorization': `Bearer ${access_token}` } }
    );

    if (!resp.ok) return null;
    const features = await resp.json();

    return {
      bpm: Math.round(features.tempo),
      energy: features.energy,
      danceability: features.danceability,
      valence: features.valence, // positivity
      loudness: features.loudness
    };
  } catch {
    return null;
  }
}

/**
 * Enrich playlist tracks with Spotify links (batch)
 */
export async function enrichWithSpotify(playlist) {
  if (!hasSpotifyCredentials()) {
    console.log('[dj-curator] No Spotify credentials — skipping enrichment');
    return playlist;
  }

  for (const phase of playlist.phases) {
    for (const track of phase.tracks) {
      const spotifyData = await searchSpotify(track.artist, track.title);
      if (spotifyData) {
        track.spotify = spotifyData;
        // Get audio features for BPM
        const features = await getAudioFeatures(spotifyData.spotifyId);
        if (features) {
          track.bpm = features.bpm;
          track.spotifyEnergy = features.energy;
          track.danceability = features.danceability;
        }
      }
    }
  }

  return playlist;
}

// ── Rating / Feedback ───────────────────────────────────────────────────────

/**
 * Rate the most recent playlist
 * @param {number} rating - 1-5
 * @param {string} [notes] - optional feedback
 */
export function rateLastPlaylist(rating, notes = '') {
  const history = loadHistory();
  const last = history.playlists[history.playlists.length - 1];
  if (!last) return 'No playlists to rate.';

  last.rated = true;
  last.rating = rating;
  last.notes = notes;
  last.ratedAt = new Date().toISOString();

  history.ratings.push({
    playlistId: last.id,
    profile: last.profile,
    rating,
    notes,
    ratedAt: last.ratedAt
  });

  saveHistory(history);

  // Feed good ratings back to taste map
  if (rating >= 4) {
    addAnchor('class_energy', 'anchors', {
      item: `${last.profile} playlist rated ${rating}/5`,
      context: 'class playlist',
      rating,
      notes,
      added: new Date().toISOString()
    });
  }

  return `Rated ${last.profile} playlist: ${rating}/5${notes ? ` — "${notes}"` : ''}`;
}

// ── Format for Telegram ─────────────────────────────────────────────────────

/**
 * Format playlist for Telegram display
 */
export function formatPlaylistTelegram(playlist) {
  let msg = `🎵 *DJ Curator: ${playlist.profileName}*\n`;
  if (playlist.description) msg += `_${playlist.description}_\n`;
  msg += `📊 ${playlist.totalTracks} tracks · ${playlist.duration} min\n\n`;

  for (const phase of playlist.phases) {
    const energyBar = '█'.repeat(Math.round((phase.energy[1] || phase.energy) * 5));
    const energyEmpty = '░'.repeat(5 - Math.round((phase.energy[1] || phase.energy) * 5));
    msg += `*${phase.name}* [${energyBar}${energyEmpty}] ${phase.minutes[0]}-${phase.minutes[1]}min\n`;
    msg += `_${phase.mood}_ · BPM ${phase.bpm[0]}-${phase.bpm[1]}\n`;

    for (const track of phase.tracks) {
      const spotifyLink = track.spotify?.externalUrl ? ` [▶️](${track.spotify.externalUrl})` : '';
      msg += `  🎶 ${track.artist} — ${track.title}${spotifyLink}\n`;
    }
    msg += '\n';
  }

  msg += `_Rate after class: /playlist rate <1-5>_`;
  return msg;
}

/**
 * Format playlist history summary
 */
export function formatHistoryTelegram() {
  const history = loadHistory();
  if (history.playlists.length === 0) return '🎵 No playlists generated yet.';

  let msg = '🎵 *Playlist History*\n\n';
  const recent = history.playlists.slice(-10).reverse();
  for (const pl of recent) {
    const date = pl.generatedAt.split('T')[0];
    const rating = pl.rated ? `⭐${pl.rating}/5` : '⏳ unrated';
    msg += `• *${pl.profile}* (${date}) — ${pl.totalTracks} tracks ${rating}\n`;
  }

  // Stats
  const rated = history.ratings;
  if (rated.length > 0) {
    const avg = (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1);
    msg += `\n📊 ${rated.length} rated · avg ${avg}/5`;
  }

  return msg;
}

/**
 * List available profiles
 */
export function listProfiles() {
  const { profiles } = loadProfiles();
  let msg = '🎵 *Class Profiles*\n\n';
  for (const [key, profile] of Object.entries(profiles)) {
    msg += `• \`${key}\` — ${profile.name}\n  _${profile.description}_\n`;
  }
  return msg;
}

export default {
  generatePlaylist,
  enrichWithSpotify,
  hasSpotifyCredentials,
  rateLastPlaylist,
  formatPlaylistTelegram,
  formatHistoryTelegram,
  listProfiles,
  searchSpotify,
  getAudioFeatures
};
