const { getStreams } = require('./providers/dvdplay.js');

async function testDVDPlay() {
    console.log('=== DVDPlay Scraper Test ===\n');
    
    const testCases = [
        { name: 'Popular Movie - Fight Club', tmdbId: '550', type: 'movie' },
        { name: 'Recent Movie - Oppenheimer', tmdbId: '872585', type: 'movie' },
        { name: 'TV Show Episode - Breaking Bad S01E01', tmdbId: '1396', type: 'tv', season: 1, episode: 1 },
        { name: 'Popular TV Show - The Office S01E01', tmdbId: '2316', type: 'tv', season: 1, episode: 1 }
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
        
        if (streams.length > 0) {
            streams.forEach((stream, index) => {
                console.log(`${index + 1}. ${stream.name}`);
                console.log(`   Title: ${stream.title}`);
                console.log(`   Quality: ${stream.quality || 'Unknown'}`);
                console.log(`   Size: ${stream.size || 'Unknown'}`);
                console.log(`   Type: ${stream.type || 'direct'}`);
                console.log(`   URL: ${stream.url.substring(0, 80)}${stream.url.length > 80 ? '...' : ''}`);
                console.log('');
            });
        } else {
            console.log('   No streams found for this content.\n');
        }
        
        console.log('==================================================\n');
    }
}

// Function to test individual components
async function testComponents() {
    console.log('=== DVDPlay Component Tests ===\n');
    
    try {
        // Test with a simple search query
        console.log('--- Testing search functionality ---');
        console.log('This test will attempt to search for "Inception" on DVDPlay...\n');
        
        const streams = await getStreams('27205', 'movie'); // Inception TMDB ID
        
        if (streams.length > 0) {
            console.log(`✅ Search successful! Found ${streams.length} streams`);
            console.log('First stream details:');
            console.log(`  Name: ${streams[0].name}`);
            console.log(`  Quality: ${streams[0].quality}`);
            console.log(`  URL Preview: ${streams[0].url.substring(0, 50)}...`);
        } else {
            console.log('❌ Search failed - no streams found');
        }
        
    } catch (error) {
        console.error('❌ Component test failed:', error.message);
    }
    
    console.log('\n==================================================\n');
}

// Main test execution
async function runAllTests() {
    console.log('DVDPlay Scraper - Test Suite');
    console.log('==============================\n');
    
    // Run component tests first
    await testComponents();
    
    // Run full test cases
    await testDVDPlay();
    
    console.log('All tests completed!');
}

// Error handling wrapper
runAllTests().catch(error => {
    console.error('Test suite failed with error:', error.message);
    console.error('Stack trace:', error.stack);
});
