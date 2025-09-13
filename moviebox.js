#!/usr/bin/env node
const axios = require('axios');
const crypto = require('crypto');
const prompt = require('prompt-sync')({ sigint: true });

const PRIMARY_KEY = '76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O';
const BASE_URL = 'https://api.inmoviebox.com/wefeed-mobile-bff';

function md5Hex(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function signRequest(keyB64, url, method = 'GET', body = '') {
  const timestamp = Date.now();

  const u = new URL(url);
  const path = u.pathname || '';
  const params = [];
  u.searchParams.forEach((value, key) => {
    // decode to mirror Python's unquote
    params.push([decodeURIComponent(key), decodeURIComponent(value)]);
  });
  params.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const qs = params.map(([k, v]) => `${k}=${v}`).join('&');
  const canonicalUrl = qs ? `${path}?${qs}` : path;

  const bodyBytes = body ? Buffer.from(body, 'utf8') : Buffer.alloc(0);
  const bodyHash = bodyBytes.length > 0 ? md5Hex(bodyBytes.subarray(0, 102400)) : '';
  const bodyLength = bodyBytes.length > 0 ? String(bodyBytes.length) : '';

  const canonical = [
    method.toUpperCase(),
    'application/json',
    'application/json; charset=utf-8',
    bodyLength,
    String(timestamp),
    bodyHash,
    canonicalUrl,
  ].join('\n');

  const key = Buffer.from(keyB64, 'base64');
  const sig = crypto.createHmac('md5', key).update(canonical).digest('base64');

  const xTrSignature = `${timestamp}|2|${sig}`;
  const rev = String(timestamp).split('').reverse().join('');
  const xClientToken = `${timestamp},${md5Hex(Buffer.from(rev, 'utf8'))}`;

  return { xTrSignature, xClientToken };
}

async function makeRequest(url, method = 'GET', body = '') {
  const { xTrSignature, xClientToken } = signRequest(PRIMARY_KEY, url, method, body);
  const headers = {
    'User-Agent': 'com.community.mbox.in/50020042 (Linux; Android 16; sdk_gphone64_x86_64; Cronet/133.0.6876.3)',
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'x-client-info': JSON.stringify({ package_name: 'com.community.mbox.in' }),
    'x-client-token': xClientToken,
    'x-tr-signature': xTrSignature,
    'x-client-status': '0',
  };

  try {
    if (method.toUpperCase() === 'POST') {
      return await axios.post(url, body, { headers, validateStatus: () => true });
    } else {
      return await axios.get(url, { headers, validateStatus: () => true });
    }
  } catch (err) {
    return { status: 0, data: null, error: err };
  }
}

async function search(keyword) {
  const url = `${BASE_URL}/subject-api/search/v2`;
  const body = JSON.stringify({ page: 1, perPage: 10, keyword });
  const r = await makeRequest(url, 'POST', body);
  if (r.status !== 200) {
    console.error(`❌ Search failed: ${r.status}`);
    process.exit(1);
  }
  const data = (r.data?.data?.results) || [];
  const subjects = [];
  for (const result of data) {
    subjects.push(...(result.subjects || []));
  }
  return subjects;
}

async function loadSubject(subjectId) {
  const url = `${BASE_URL}/subject-api/get?subjectId=${subjectId}`;
  const r = await makeRequest(url);
  return r.data?.data || {};
}

async function getSeasons(subjectId) {
  const url = `${BASE_URL}/subject-api/season-info?subjectId=${subjectId}`;
  const r = await makeRequest(url);
  return r.data?.data?.seasons || [];
}

async function getPlayInfo(subjectId, season = null, episode = null) {
  let url;
  if (season && episode) {
    url = `${BASE_URL}/subject-api/play-info?subjectId=${subjectId}&se=${season}&ep=${episode}`;
  } else {
    url = `${BASE_URL}/subject-api/play-info?subjectId=${subjectId}`;
  }

  const r = await makeRequest(url);
  if (r.status !== 200) {
    console.error(`❌ Request failed: ${r.status}`);
    console.error(r.data);
    return [];
  }

  const data = r.data?.data || {};
  let streams = data.streams || [];
  if (!streams || streams.length === 0) {
    streams = data.playInfo?.streams || [];
  }
  for (const s of streams) {
    s.audioTracks = Array.isArray(s.audioTracks) ? s.audioTracks : [];
    if (Array.isArray(s.resolutions)) {
      // keep as-is
    } else if (typeof s.resolutions === 'string') {
      s.resolutions = s.resolutions.split(',').map(v => v.trim()).filter(Boolean);
    } else if (s.resolution) {
      s.resolutions = Array.isArray(s.resolution) ? s.resolution : [s.resolution];
    } else {
      s.resolutions = [];
    }
  }
  return streams;
}

function extractQualityFields(stream) {
  const qualities = [];
  // Common fields that might denote quality
  const candidates = [
    stream.quality,
    stream.definition,
    stream.label,
    stream.videoQuality,
    stream.profile,
  ].filter(Boolean);
  qualities.push(...candidates.map(String));
  if (Array.isArray(stream.resolutions) && stream.resolutions.length) {
    qualities.push(...stream.resolutions.map(v => String(v)));
  }
  const width = stream.width || (stream.video && stream.video.width);
  const height = stream.height || (stream.video && stream.video.height);
  if (width && height) {
    qualities.push(`${width}x${height}`);
  }
  // de-duplicate while preserving order
  const seen = new Set();
  return qualities.filter(q => {
    if (seen.has(q)) return false;
    seen.add(q);
    return true;
  });
}

function printStreamsWithAudio(streams, { auto = false } = {}) {
  if (!streams || streams.length === 0) {
    console.log('⚠️ No streams found.');
    return;
  }

  streams.forEach((s, i) => {
    const idx = i + 1;
    const audioTracks = s.audioTracks || [];
    const quality = extractQualityFields(s);
    const url = s.url;
    const fmt = s.format || 'unknown';
    console.log(`\nStream ${idx}: ${fmt} | ${url}`);
    if (audioTracks.length) {
      console.log(`  🎵 Audio Tracks: ${audioTracks.join(', ')}`);
    }
    if (quality.length) {
      console.log(`  📺 Quality: ${quality.join(', ')}`);
    }
  });

  if (!auto && streams.some(s => s.audioTracks && s.audioTracks.length)) {
    console.log('\nSelect a stream number and preferred audio track:');
    const choice = prompt('Stream #: ');
    try {
      const streamIndex = parseInt(choice, 10) - 1;
      const chosenStream = streams[streamIndex];
      if (chosenStream?.audioTracks?.length) {
        console.log('Available audio tracks:');
        chosenStream.audioTracks.forEach((a, j) => console.log(`${j + 1}. ${a}`));
        const audioChoice = parseInt(prompt('Select audio track #: '), 10) - 1;
        const chosenAudio = chosenStream.audioTracks[audioChoice];
        console.log(`✅ Selected: Stream URL ${chosenStream.url} | Audio: ${chosenAudio}`);
      } else if (chosenStream) {
        console.log(`✅ Selected: Stream URL ${chosenStream.url}`);
      }
    } catch (e) {
      console.log(`❌ Invalid selection: ${e}`);
    }
  }
}

async function processSubject(selected, { auto }) {
  const subjectId = selected.subjectId;
  console.log(`\n✅ Selected: ${selected.title} (${subjectId})`);
  const details = await loadSubject(subjectId);
  console.log(`📖 Description: ${details.description || ''}`);
  console.log(`📅 Year: ${details.releaseDate || ''}`);
  console.log(`🎭 Genre: ${details.genre || ''}`);

  if (details.subjectType === 2) {
    const seasons = await getSeasons(subjectId);
    if (!seasons || seasons.length === 0) {
      console.log('⚠️ No season info found.');
      return;
    }
    if (!auto) {
      console.log('\n📺 Seasons available:');
      seasons.forEach((s, i) => {
        console.log(`${i + 1}. Season ${s.se} (Episodes: ${s.maxEp ?? '?'})`);
      });
      const seasonChoice = prompt('Select season number: ');
      let selectedSeason;
      try {
        selectedSeason = parseInt(seasonChoice, 10);
        if (Number.isNaN(selectedSeason)) throw new Error('NaN');
      } catch (e) {
        console.log('Invalid season number.');
        return;
      }
      const maxEp = seasons.find(s => s.se === selectedSeason)?.maxEp ?? 1;
      console.log(`\n▶️ Fetching play info for Season ${selectedSeason}...`);
      for (let ep = 1; ep <= maxEp; ep += 1) {
        const streams = await getPlayInfo(subjectId, selectedSeason, ep);
        console.log(`\n🎬 S${selectedSeason}E${ep}:`);
        printStreamsWithAudio(streams, { auto });
      }
    } else {
      // auto mode: iterate all seasons and episodes
      for (const season of seasons) {
        const seNum = season.se;
        const maxEp = season.maxEp ?? 1;
        console.log(`\n📺 Season ${seNum} (Episodes: ${maxEp})`);
        console.log(`\n▶️ Fetching play info for Season ${seNum}...`);
        for (let ep = 1; ep <= maxEp; ep += 1) {
          const streams = await getPlayInfo(subjectId, seNum, ep);
          console.log(`\n🎬 S${seNum}E${ep}:`);
          printStreamsWithAudio(streams, { auto });
        }
      }
    }
  } else {
    console.log('\n🎬 Movie detected, fetching play info...');
    const streams = await getPlayInfo(subjectId);
    printStreamsWithAudio(streams, { auto });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const auto = args.includes('--auto');
  const all = auto || args.includes('--all');
  const filteredArgs = args.filter(a => a !== '--auto' && a !== '--all');
  if (filteredArgs.length < 1) {
    console.log("Usage: node moviebox.js '<search term>'");
    console.log('Options:');
    console.log('  --auto    Run non-interactively, choose first options by default');
    console.log('  --all     Process all matching results (e.g., multiple languages)');
    process.exit(1);
  }

  const keyword = filteredArgs.join(' ');
  console.log(`🔎 Searching for: ${keyword}`);
  const results = await search(keyword);
  if (!results || results.length === 0) {
    console.log('⚠️ No results found.');
    process.exit(0);
  }

  if (all) {
    // process each matching subject
    for (const r of results) {
      await processSubject(r, { auto });
    }
    return;
  }

  let selected;
  if (!auto && results.length > 1) {
    console.log('\nMultiple results found:');
    results.forEach((r, i) => {
      console.log(`${i + 1}. ${r.title} (${r.subjectType})`);
    });
    const choice = prompt('Select number: ');
    try {
      const index = parseInt(choice, 10) - 1;
      selected = results[index];
      if (!selected) throw new Error('Invalid choice');
    } catch (e) {
      console.log('Invalid choice.');
      process.exit(1);
    }
  } else if (results.length > 0) {
    selected = results[0];
  } else {
    selected = results[0];
  }

  await processSubject(selected, { auto });
}

if (require.main === module) {
  main();
}


