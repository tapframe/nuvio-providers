#!/usr/bin/env node

// Test script for NetMirror scraper
const { getStreams } = require('./netmirror.js');

// Test configurations
const testConfigs = {
  movie: {
    tmdbId: 550, // Fight Club
    mediaType: 'movie',
    title: 'Fight Club (1999)'
  },
  tvShow: {
    tmdbId: 1399, // Game of Thrones
    mediaType: 'tv',
    season: 1,
    episode: 1,
    title: 'Game of Thrones S01E01'
  }
};

// Helper function to format and display results
function displayResults(streams, testName) {
  console.log(`\n📊 ${testName} Results:`);
  console.log(`Found ${streams.length} streams\n`);
  
  streams.slice(0, 3).forEach((stream, index) => {
    console.log(`📺 Stream ${index + 1}:`);
    console.log(`   Name: ${stream.name}`);
    console.log(`   Title: ${stream.title}`);
    console.log(`   Quality: ${stream.quality}`);
    console.log(`   URL: ${stream.url.substring(0, 80)}...`);
    console.log(`   Type: ${stream.type}`);
    console.log(`   Size: ${stream.size}`);
    if (stream.headers) {
      console.log(`   Headers: ${JSON.stringify(stream.headers, null, 2)}`);
    }
    console.log('');
  });
  
  if (streams.length > 3) {
    console.log(`   ... and ${streams.length - 3} more streams\n`);
  }
}

// Test movie
async function testMovie() {
  console.log('🎬 Testing NetMirror with Movie...');
  console.log(`Testing: ${testConfigs.movie.title}`);
  
  try {
    const streams = await getStreams(
      testConfigs.movie.tmdbId,
      testConfigs.movie.mediaType
    );
    
    displayResults(streams, 'Movie Test');
    return streams;
  } catch (error) {
    console.error(`❌ Movie test failed: ${error.message}`);
    return [];
  }
}

// Test TV show
async function testTVShow() {
  console.log('📺 Testing NetMirror with TV Show...');
  console.log(`Testing: ${testConfigs.tvShow.title}`);
  
  try {
    const streams = await getStreams(
      testConfigs.tvShow.tmdbId,
      testConfigs.tvShow.mediaType,
      testConfigs.tvShow.season,
      testConfigs.tvShow.episode
    );
    
    displayResults(streams, 'TV Show Test');
    return streams;
  } catch (error) {
    console.error(`❌ TV show test failed: ${error.message}`);
    return [];
  }
}

// Test specific movie by TMDB ID
async function testSpecificMovie(tmdbId, title) {
  console.log(`🎬 Testing NetMirror with specific movie: ${title}`);
  
  try {
    const streams = await getStreams(tmdbId, 'movie');
    displayResults(streams, `${title} Test`);
    return streams;
  } catch (error) {
    console.error(`❌ ${title} test failed: ${error.message}`);
    return [];
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting NetMirror Scraper Tests\n');
  
  const movieStreams = await testMovie();
  const tvStreams = await testTVShow();
  
  console.log('\n📈 Test Summary:');
  console.log(`Movie streams found: ${movieStreams.length}`);
  console.log(`TV show streams found: ${tvStreams.length}`);
  console.log(`Total streams: ${movieStreams.length + tvStreams.length}`);
  
  if (movieStreams.length > 0 || tvStreams.length > 0) {
    console.log('\n✅ NetMirror scraper is working!');
  } else {
    console.log('\n❌ NetMirror scraper needs attention.');
  }
}

// Quick test with just one movie
async function quickTest() {
  console.log('⚡ Quick NetMirror Test\n');
  const streams = await testMovie();
  
  if (streams.length > 0) {
    console.log('\n✅ Quick test passed!');
  } else {
    console.log('\n❌ Quick test failed.');
  }
}

// Export functions for manual testing
module.exports = {
  testMovie,
  testTVShow,
  testSpecificMovie,
  runAllTests,
  quickTest
};

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--quick')) {
    quickTest();
  } else if (args.includes('--movie') && args[1]) {
    const tmdbId = parseInt(args[1]);
    const title = args[2] || `Movie ${tmdbId}`;
    testSpecificMovie(tmdbId, title);
  } else {
    runAllTests();
  }
}

console.log('NetMirror test script loaded. Available functions:');
console.log('- testMovie()');
console.log('- testTVShow()');
console.log('- testSpecificMovie(tmdbId, title)');
console.log('- runAllTests()');
console.log('- quickTest()');
console.log('\nRun with: node test_netmirror.js [--quick] [--movie tmdbId title]');