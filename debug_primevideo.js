// Debug script to test Prime Video stream headers and responses
const https = require('https');
const http = require('http');
const url = require('url');

// Test function to make a request and log the response
function testStreamUrl(streamUrl, headers = {}) {
    console.log('\n=== Testing Stream URL ===');
    console.log('URL:', streamUrl);
    console.log('Headers:', JSON.stringify(headers, null, 2));
    
    const parsedUrl = url.parse(streamUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.path,
        method: 'HEAD', // Use HEAD to avoid downloading the entire file
        headers: headers
    };
    
    return new Promise((resolve, reject) => {
        const req = client.request(options, (res) => {
            console.log('\n=== Response ===');
            console.log('Status Code:', res.statusCode);
            console.log('Status Message:', res.statusMessage);
            console.log('Response Headers:', JSON.stringify(res.headers, null, 2));
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log('✅ SUCCESS: Stream URL is accessible');
                resolve({ success: true, statusCode: res.statusCode, headers: res.headers });
            } else {
                console.log('❌ FAILED: Stream URL returned error');
                resolve({ success: false, statusCode: res.statusCode, headers: res.headers });
            }
        });
        
        req.on('error', (error) => {
            console.log('❌ REQUEST ERROR:', error.message);
            reject(error);
        });
        
        req.setTimeout(10000, () => {
            console.log('❌ REQUEST TIMEOUT');
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.end();
    });
}

// Test different header combinations
async function runTests() {
    // You'll need to replace this with an actual Prime Video stream URL from NetMirror
    const testUrl = 'REPLACE_WITH_ACTUAL_PRIMEVIDEO_STREAM_URL';
    
    console.log('🔍 Testing Prime Video Stream Headers');
    console.log('=====================================');
    
    // Test 1: No headers
    console.log('\n📋 Test 1: No headers');
    try {
        await testStreamUrl(testUrl, {});
    } catch (error) {
        console.log('Error:', error.message);
    }
    
    // Test 2: NetMirror headers (current implementation)
    console.log('\n📋 Test 2: NetMirror headers (current)');
    const netmirrorHeaders = {
        "Accept": "application/vnd.apple.mpegurl, video/mp4, */*",
        "Origin": "https://net2025.cc",
        "Referer": "https://net2025.cc/",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    };
    try {
        await testStreamUrl(testUrl, netmirrorHeaders);
    } catch (error) {
        console.log('Error:', error.message);
    }
    
    // Test 3: Browser-like headers
    console.log('\n📋 Test 3: Browser-like headers');
    const browserHeaders = {
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Origin": "https://a.net2025.cc",
        "Referer": "https://a.net2025.cc/",
        "Sec-Fetch-Dest": "video",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    };
    try {
        await testStreamUrl(testUrl, browserHeaders);
    } catch (error) {
        console.log('Error:', error.message);
    }
    
    // Test 4: Updated NetMirror base URL
    console.log('\n📋 Test 4: Updated NetMirror base URL headers');
    const updatedHeaders = {
        "Accept": "application/vnd.apple.mpegurl, video/mp4, */*",
        "Origin": "https://a.net2025.cc",
        "Referer": "https://a.net2025.cc/",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"
    };
    try {
        await testStreamUrl(testUrl, updatedHeaders);
    } catch (error) {
        console.log('Error:', error.message);
    }
}

// Instructions for usage
console.log('🚀 Prime Video Stream Debug Tool');
console.log('================================');
console.log('\n📝 Instructions:');
console.log('1. Get a Prime Video stream URL from NetMirror scraper');
console.log('2. Replace REPLACE_WITH_ACTUAL_PRIMEVIDEO_STREAM_URL with the actual URL');
console.log('3. Run: node debug_primevideo.js');
console.log('\n⚠️  Note: You need to replace the test URL before running tests');

if (process.argv.length > 2) {
    const streamUrl = process.argv[2];
    console.log(`\n🔗 Testing provided URL: ${streamUrl}`);
    
    // Update the test URL and run tests
    runTests().then(() => {
        console.log('\n✅ All tests completed');
    }).catch((error) => {
        console.log('\n❌ Test suite failed:', error.message);
    });
} else {
    console.log('\n💡 Usage: node debug_primevideo.js <stream_url>');
    console.log('   Example: node debug_primevideo.js "https://example.com/stream.m3u8"');
}