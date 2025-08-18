// Test file for ShowBox (OG) provider
// Usage examples:
//   node test_showboxog.js                     # default movie (550) and TV (1396 S1E1)
//   node test_showboxog.js --tmdb=550 --type=movie --region=USA7 --all
//   node test_showboxog.js --tmdb=1396 --type=tv --season=1 --episode=1 --region=UK3

/* eslint-disable no-console */

const provider = require('./providers/showboxog.js');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  args.forEach((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) {
      opts[m[1]] = m[2];
    } else if (a === '--all') {
      opts.all = true;
    } else if (a === '--allRegions') {
      opts.allRegions = true;
    }
  });
  return opts;
}

function printStreams(label, streams, printAll) {
  console.log(`\n=== ${label} ===`);
  console.log(`Found ${streams.length} streams`);
  const list = printAll ? streams : streams.slice(0, 10);
  list.forEach((s, i) => {
    console.log(`${i + 1}. ${s.name} | ${s.quality} | ${String(s.title).split('\n')[0]}`);
    console.log(`   size: ${s.size || 'N/A'} | file: ${s.fileName || 'N/A'}`);
    console.log(`   URL: ${s.url}`);
  });
}

async function runSingle(tmdbId, type, season, episode, region, printAll) {
  if (region) {
    const streams = await provider.getStreamsByRegion(tmdbId, type, season, episode, region);
    printStreams(`${type} ${tmdbId}${type === 'tv' ? ` S${season}E${episode}` : ''} [${region}]`, streams, printAll);
  } else {
    const streams = await provider.getStreams(tmdbId, type, season, episode);
    printStreams(`${type} ${tmdbId}${type === 'tv' ? ` S${season}E${episode}` : ''}`, streams, printAll);
  }
}

async function main() {
  const opts = parseArgs();
  const tmdbId = opts.tmdb || null;
  const type = (opts.type || '').toLowerCase();
  const season = opts.season ? parseInt(opts.season, 10) : null;
  const episode = opts.episode ? parseInt(opts.episode, 10) : null;
  const region = opts.region || null;
  const printAll = !!opts.all;

  if (opts.allRegions) {
    const regions = ['USA7','USA6','USA5','UK3','CA1','FR1','DE2','HK1','IN1','AU1','SZ'];
    for (const r of regions) {
      await runSingle('550', 'movie', null, null, r, printAll);
      await runSingle('1396', 'tv', 1, 1, r, printAll);
    }
    return;
  }

  if (tmdbId && (type === 'movie' || type === 'tv')) {
    await runSingle(tmdbId, type, season, episode, region, printAll);
    return;
  }

  // Default demo set
  await runSingle('550', 'movie', null, null, region, printAll);
  await runSingle('1396', 'tv', 1, 1, region, printAll);
}

main().catch((e) => {
  console.error('Test failed:', e && e.message);
});


