// Test HubCloud extraction for Ponman movie
const { extractHubCloudLinks } = require('./providers/dvdplay.js');

async function testHubCloudExtraction() {
    console.log('=== Testing HubCloud Extraction for Ponman ===\n');
    
    const hubCloudUrl = 'https://hubcloud.ink/video/sic_r2bqkhi36h3';
    console.log(`Testing HubCloud URL: ${hubCloudUrl}\n`);
    
    try {
        const results = await extractHubCloudLinks(hubCloudUrl);
        
        console.log(`✅ HubCloud extraction completed successfully!`);
        console.log(`Found ${results.length} final download links:\n`);
        
        if (results.length > 0) {
            results.forEach((result, index) => {
                console.log(`${index + 1}. ${result.name}`);
                console.log(`   Title: ${result.title}`);
                console.log(`   URL: ${result.url}`);
                console.log(`   Quality: ${result.quality}`);
                console.log(`   Type: ${result.type}`);
                console.log('');
            });
        } else {
            console.log('❌ No final download links found');
        }
        
    } catch (error) {
        console.error('❌ HubCloud extraction failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

testHubCloudExtraction();
