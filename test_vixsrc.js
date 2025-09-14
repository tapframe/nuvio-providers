const { getStreams } = require('./providers/vixsrc.js');

async function testVixsrc() {
  console.log('=== Vixsrc Provider Test ===\n');
  
  const testCases = [
    { name: 'Popular Movie - The Matrix', tmdbId: '603', type: 'movie' },
    { name: 'TV Show Episode - Breaking Bad S01E01', tmdbId: '1396', type: 'tv', season: 1, episode: 1 },
    { name: 'Another Movie - Inception', tmdbId: '27205', type: 'movie' },
    { name: 'TV Show Episode - The Office S01E01', tmdbId: '2316', type: 'tv', season: 1, episode: 1 }
  ];

  for (const testCase of testCases) {
    console.log(`--- Testing: ${testCase.name} ---`);
    console.log(`TMDB ID: ${testCase.tmdbId}, Type: ${testCase.type}`);
    if (testCase.season && testCase.episode) {
      console.log(`Season: ${testCase.season}, Episode: ${testCase.episode}`);
    }
    
    const startTime = Date.now();
    const streams = await getStreams(testCase.tmdbId, testCase.type, testCase.season, testCase.episode);
    const endTime = Date.now();
    
    console.log(`Test completed in ${((endTime - startTime) / 1000).toFixed(3)}s`);
    console.log(`Found ${streams.length} streams:\n`);
    
    streams.forEach((stream, index) => {
      console.log(`${index + 1}. ${stream.name}`);
      console.log(`   Title: ${stream.title}`);
      console.log(`   Quality: ${stream.quality}`);
      console.log(`   Type: ${stream.type}`);
      console.log(`   URL: ${stream.url.substring(0, 80)}...`);
      if (stream.headers) {
        console.log(`   Headers: ${JSON.stringify(stream.headers)}`);
      }
      if (stream.audioTracks) {
        console.log(`   Audio Tracks: ${stream.audioTracks.length} available`);
        stream.audioTracks.forEach((track, trackIndex) => {
          console.log(`     ${trackIndex + 1}. ${track.name} (${track.language}) - ${track.url ? 'Available' : 'No URL'}`);
        });
      }
      if (stream.audioTrack) {
        console.log(`   Audio Track Info: ${stream.audioTrack.name} (${stream.audioTrack.language})`);
      }
      console.log('');
    });
    
    console.log('==================================================\n');
  }
}

testVixsrc().catch(console.error);
