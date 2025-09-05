// Test file for VidSrc Scraper
const { getStreams } = require('./providers/vidsrc.js');

async function testVidSrcScraper() {
    console.log('=== VidSrc Scraper Test ===\n');
    
    const testCases = [
        {
            name: 'Popular Movie - Fight Club',
            tmdbId: '550',
            type: 'movie'
        },
        {
            name: 'Popular Movie - The Shawshank Redemption',
            tmdbId: '278',
            type: 'movie'
        },
        {
            name: 'TV Show Episode - Breaking Bad S1E1',
            tmdbId: '1396',
            type: 'tv',
            season: 1,
            episode: 1
        },
        {
            name: 'TV Show Episode - Game of Thrones S1E1',
            tmdbId: '1399',
            type: 'tv',
            season: 1,
            episode: 1
        }
    ];

    for (const testCase of testCases) {
        console.log(`--- Testing: ${testCase.name} ---`);
        console.log(`TMDB ID: ${testCase.tmdbId}, Type: ${testCase.type}`);
        if (testCase.season && testCase.episode) {
            console.log(`Season: ${testCase.season}, Episode: ${testCase.episode}`);
        }
        
        const startTime = Date.now();
        
        try {
            const streams = await getStreams(
                testCase.tmdbId,
                testCase.type,
                testCase.season,
                testCase.episode
            );
            
            const endTime = Date.now();
            console.log(`Test completed in ${((endTime - startTime) / 1000).toFixed(3)}s`);
            console.log(`Found ${streams.length} streams:\n`);
            
            if (streams.length > 0) {
                streams.forEach((stream, index) => {
                    console.log(`${index + 1}. ${stream.name}`);
                    console.log(`   Title: ${stream.title}`);
                    console.log(`   Quality: ${stream.quality}`);
                    console.log(`   Type: ${stream.type}`);
                    console.log(`   URL: ${stream.url.substring(0, 80)}...`);
                    if (stream.headers) {
                        console.log(`   Headers: ${Object.keys(stream.headers).join(', ')}`);
                    }
                    console.log('');
                });
            } else {
                console.log('   No streams found for this content.');
            }
            
        } catch (error) {
            const endTime = Date.now();
            console.log(`Test failed in ${((endTime - startTime) / 1000).toFixed(3)}s`);
            console.error(`   Error: ${error.message}`);
        }
        
        console.log('==================================================\n');
        
        // Add a small delay between tests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('=== VidSrc Scraper Test Complete ===');
}

// Run the test
testVidSrcScraper().catch(error => {
    console.error('Unhandled error in test:', error);
    process.exit(1);
});