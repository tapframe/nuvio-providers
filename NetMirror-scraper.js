#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Standalone Node.js Streaming Scraper
 * Mimics the functionality of NetflixMirrorProvider, PrimeVideoMirrorProvider, and DisneyMirrorProvider
 * Fetches streaming links from net2025.cc for Netflix, Prime Video, and Disney+ content
 */

class StreamingScraper {
    constructor() {
        this.mainUrl = 'https://net2025.cc';
        this.cookieValue = '';
        this.cookieFile = path.join(__dirname, '.scraper_cookies.json');
        this.headers = {
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };
        
        // Load saved cookies
        this.loadCookies();
    }

    /**
     * Load cookies from file
     */
    loadCookies() {
        try {
            if (fs.existsSync(this.cookieFile)) {
                const data = JSON.parse(fs.readFileSync(this.cookieFile, 'utf8'));
                const now = Date.now();
                // Check if cookie is still valid (15 hours)
                if (data.cookie && data.timestamp && (now - data.timestamp) < 54000000) {
                    this.cookieValue = data.cookie;
                    console.log('✓ Using cached authentication cookie');
                }
            }
        } catch (error) {
            console.log('No valid cached cookies found');
        }
    }

    /**
     * Save cookies to file
     */
    saveCookies(cookie) {
        try {
            const data = {
                cookie: cookie,
                timestamp: Date.now()
            };
            fs.writeFileSync(this.cookieFile, JSON.stringify(data, null, 2));
            console.log('✓ Authentication cookie saved');
        } catch (error) {
            console.error('Failed to save cookies:', error.message);
        }
    }

    /**
     * Bypass authentication and get valid cookie
     */
    async bypass() {
        if (this.cookieValue) {
            return this.cookieValue;
        }

        console.log('🔐 Bypassing authentication...');
        
        try {
            let verifyResponse;
            let responseText;
            let attempts = 0;
            const maxAttempts = 5;

            do {
                if (attempts >= maxAttempts) {
                    throw new Error('Max bypass attempts reached');
                }
                
                verifyResponse = await axios.post(`${this.mainUrl}/tv/p.php`, {}, {
                    headers: this.headers,
                    timeout: 10000
                });
                
                attempts++;
                
                // Convert response data to string for checking
                responseText = typeof verifyResponse.data === 'string' 
                    ? verifyResponse.data 
                    : JSON.stringify(verifyResponse.data);
                    
            } while (!responseText.includes('"r":"n"'));

            // Extract cookie from response headers
            const setCookieHeader = verifyResponse.headers['set-cookie'];
            if (setCookieHeader) {
                for (const cookie of setCookieHeader) {
                    if (cookie.includes('t_hash_t=')) {
                        this.cookieValue = cookie.split('t_hash_t=')[1].split(';')[0];
                        break;
                    }
                }
            }

            if (this.cookieValue) {
                this.saveCookies(this.cookieValue);
                console.log('✓ Authentication successful');
                return this.cookieValue;
            } else {
                throw new Error('Failed to extract authentication cookie');
            }
        } catch (error) {
            console.error('❌ Authentication failed:', error.message);
            throw error;
        }
    }

    /**
     * Get current Unix timestamp
     */
    getUnixTime() {
        return Math.floor(Date.now() / 1000);
    }

    /**
     * Search for content across all platforms
     */
    async search(query, platform = 'netflix') {
        console.log(`🔍 Searching for "${query}" on ${platform}...`);
        
        await this.bypass();
        
        const ottMap = {
            'netflix': 'nf',
            'primevideo': 'pv', 
            'disney': 'hs'
        };
        
        const ott = ottMap[platform.toLowerCase()] || 'nf';
        
        const cookies = {
            't_hash_t': this.cookieValue,
            'hd': 'on',
            'ott': ott
        };
        
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        
        try {
            const response = await axios.get(
                `${this.mainUrl}/search.php?s=${encodeURIComponent(query)}&t=${this.getUnixTime()}`,
                {
                    headers: {
                        ...this.headers,
                        'Cookie': cookieString,
                        'Referer': `${this.mainUrl}/tv/home`
                    },
                    timeout: 10000
                }
            );
            
            const searchData = response.data;
            
            if (searchData.searchResult && searchData.searchResult.length > 0) {
                console.log(`✓ Found ${searchData.searchResult.length} results`);
                return searchData.searchResult.map(item => ({
                    id: item.id,
                    title: item.t,
                    posterUrl: `https://imgcdn.media/poster/v/${item.id}.jpg`
                }));
            } else {
                console.log('No results found');
                return [];
            }
        } catch (error) {
            console.error('❌ Search failed:', error.message);
            throw error;
        }
    }

    /**
     * Load detailed content information
     */
    async loadContent(contentId, platform = 'netflix') {
        console.log(`📺 Loading content details for ID: ${contentId}`);
        
        await this.bypass();
        
        const ottMap = {
            'netflix': 'nf',
            'primevideo': 'pv',
            'disney': 'hs'
        };
        
        const ott = ottMap[platform.toLowerCase()] || 'nf';
        
        const cookies = {
            't_hash_t': this.cookieValue,
            'ott': ott,
            'hd': 'on'
        };
        
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        
        try {
            const response = await axios.get(
                `${this.mainUrl}/post.php?id=${contentId}&t=${this.getUnixTime()}`,
                {
                    headers: {
                        ...this.headers,
                        'Cookie': cookieString,
                        'Referer': `${this.mainUrl}/tv/home`
                    },
                    timeout: 10000
                }
            );
            
            const postData = response.data;
            
            console.log(`✓ Loaded: ${postData.title}`);
            
            return {
                id: contentId,
                title: postData.title,
                description: postData.desc,
                year: postData.year,
                genre: postData.genre,
                cast: postData.cast,
                director: postData.director,
                runtime: postData.runtime,
                rating: postData.match,
                episodes: postData.episodes || [],
                seasons: postData.season || [],
                isMovie: !postData.episodes || postData.episodes.length === 0 || postData.episodes[0] === null
            };
        } catch (error) {
            console.error('❌ Failed to load content:', error.message);
            throw error;
        }
    }

    /**
     * Get streaming links for content
     */
    /**
     * Extract quality-specific playlist URLs from master playlist
     */
    async extractQualityPlaylists(masterPlaylistUrl) {
        try {
            const response = await axios.get(masterPlaylistUrl, {
                headers: {
                    ...this.headers,
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                    'Referer': 'https://net2025.cc/',
                    'Origin': 'https://net2025.cc',
                    'Accept': 'application/vnd.apple.mpegurl, video/mp4, */*'
                },
                timeout: 10000
            });
            
            const content = response.data;
            const lines = content.split('\n');
            const qualityPlaylists = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith('#EXT-X-STREAM-INF:')) {
                    // Parse quality info
                    const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
                    
                    // Get the next line which should be the playlist URL
                    if (i + 1 < lines.length) {
                        const playlistUrl = lines[i + 1].trim();
                        if (playlistUrl && !playlistUrl.startsWith('#')) {
                            // Handle relative URLs
                            let fullUrl = playlistUrl;
                            if (playlistUrl.startsWith('/')) {
                                const baseUrl = new URL(masterPlaylistUrl);
                                fullUrl = `${baseUrl.protocol}//${baseUrl.host}${playlistUrl}`;
                            } else if (!playlistUrl.startsWith('http')) {
                                const baseUrl = masterPlaylistUrl.substring(0, masterPlaylistUrl.lastIndexOf('/') + 1);
                                fullUrl = baseUrl + playlistUrl;
                            }
                            
                            const resolution = resolutionMatch ? resolutionMatch[1] : 'Unknown';
                            const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
                            
                            let quality = 'Unknown';
                            if (resolution.includes('1920x1080')) quality = 'Full HD (1080p)';
                            else if (resolution.includes('1280x720')) quality = 'Mid HD (720p)';
                            else if (resolution.includes('854x480')) quality = 'Low HD (480p)';
                            
                            qualityPlaylists.push({
                                url: fullUrl,
                                quality: quality,
                                resolution: resolution,
                                bandwidth: bandwidth
                            });
                        }
                    }
                }
            }
            
            return qualityPlaylists;
        } catch (error) {
            console.log(`⚠️ Could not extract quality playlists from ${masterPlaylistUrl}: ${error.message}`);
            return [];
        }
    }

    async getStreamingLinks(contentId, title, platform = 'netflix') {
        console.log(`🎬 Getting streaming links for: ${title}`);
        
        await this.bypass();
        
        const ottMap = {
            'netflix': 'nf',
            'primevideo': 'pv',
            'disney': 'hs'
        };
        
        const ott = ottMap[platform.toLowerCase()] || 'nf';
        
        const cookies = {
            't_hash_t': this.cookieValue,
            'ott': ott,
            'hd': 'on'
        };
        
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        
        try {
            const response = await axios.get(
                `${this.mainUrl}/tv/playlist.php?id=${contentId}&t=${encodeURIComponent(title)}&tm=${this.getUnixTime()}`,
                {
                    headers: {
                        ...this.headers,
                        'Cookie': cookieString,
                        'Referer': `${this.mainUrl}/tv/home`
                    },
                    timeout: 10000
                }
            );
            
            const playlist = response.data;
            
            if (!Array.isArray(playlist) || playlist.length === 0) {
                console.log('No streaming links found');
                return { sources: [], subtitles: [] };
            }
            
            const sources = [];
            const subtitles = [];
            
            playlist.forEach(item => {
                if (item.sources) {
                    item.sources.forEach(source => {
                        // Convert relative URLs to absolute URLs
                        let fullUrl = source.file;
                        if (source.file.startsWith('/') && !source.file.startsWith('//')) {
                            fullUrl = this.mainUrl + source.file;
                        } else if (source.file.startsWith('//')) {
                            fullUrl = 'https:' + source.file;
                        }
                        
                        sources.push({
                            url: fullUrl,
                            quality: source.label,
                            type: source.type || 'application/x-mpegURL'
                        });
                    });
                }

                if (item.tracks) {
                    item.tracks
                        .filter(track => track.kind === 'captions')
                        .forEach(track => {
                            // Convert relative URLs to absolute URLs for subtitles
                            let fullSubUrl = track.file;
                            if (track.file.startsWith('/') && !track.file.startsWith('//')) {
                                fullSubUrl = this.mainUrl + track.file;
                            } else if (track.file.startsWith('//')) {
                                fullSubUrl = 'https:' + track.file;
                            }
                            
                            subtitles.push({
                                url: fullSubUrl,
                                language: track.label
                            });
                        });
                }
            });
            
            // Extract quality-specific playlist URLs from the first HLS source
            if (sources.length > 0) {
                console.log('🔍 Extracting quality-specific playlist URLs...');
                const qualityPlaylists = await this.extractQualityPlaylists(sources[0].url);
                
                // Replace the master playlist sources with quality-specific ones
                if (qualityPlaylists.length > 0) {
                    sources.length = 0; // Clear existing sources
                    qualityPlaylists.forEach(playlist => {
                        sources.push({
                            url: playlist.url,
                            quality: playlist.quality,
                            type: 'application/vnd.apple.mpegurl',
                            resolution: playlist.resolution,
                            bandwidth: playlist.bandwidth
                        });
                    });
                }
            }
            
            console.log(`✓ Found ${sources.length} quality-specific streaming sources and ${subtitles.length} subtitle tracks`);
            
            return { sources, subtitles };
        } catch (error) {
            console.error('❌ Failed to get streaming links:', error.message);
            throw error;
        }
    }

    /**
     * Complete workflow: search and get streaming links
     */
    async getContent(query, platform = 'netflix') {
        try {
            // Search for content
            const searchResults = await this.search(query, platform);
            
            if (searchResults.length === 0) {
                return { error: 'No content found' };
            }
            
            // Use first result
            const firstResult = searchResults[0];
            
            // Load detailed content info
            const contentDetails = await this.loadContent(firstResult.id, platform);
            
            // Get streaming links
            const streamingData = await this.getStreamingLinks(firstResult.id, contentDetails.title, platform);
            
            return {
                ...contentDetails,
                ...streamingData,
                searchResults: searchResults
            };
        } catch (error) {
            console.error('❌ Complete workflow failed:', error.message);
            return { error: error.message };
        }
    }
}

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
🎬 Streaming Scraper CLI

Usage:
  node streaming-scraper.js "<search_query>" [platform]

Platforms:
  netflix (default)
  primevideo
  disney

Examples:
  node streaming-scraper.js "The Matrix"
  node streaming-scraper.js "Stranger Things" netflix
  node streaming-scraper.js "The Boys" primevideo
  node streaming-scraper.js "The Mandalorian" disney
`);
        process.exit(1);
    }
    
    const query = args[0];
    const platform = args[1] || 'netflix';
    
    const scraper = new StreamingScraper();
    
    scraper.getContent(query, platform)
        .then(result => {
            if (result.error) {
                console.error('❌ Error:', result.error);
                process.exit(1);
            }
            
            console.log('\n📋 Content Details:');
            console.log(`Title: ${result.title}`);
            console.log(`Year: ${result.year}`);
            console.log(`Genre: ${result.genre}`);
            console.log(`Type: ${result.isMovie ? 'Movie' : 'TV Series'}`);
            
            if (result.sources && result.sources.length > 0) {
                console.log('\n🎬 Quality-Specific Streaming Sources:');
                result.sources.forEach((source, index) => {
                    console.log(`${index + 1}. Quality: ${source.quality}`);
                    if (source.resolution) console.log(`   Resolution: ${source.resolution}`);
                    if (source.bandwidth) console.log(`   Bandwidth: ${source.bandwidth} bps`);
                    console.log(`   URL: ${source.url}`);
                    console.log(`   Type: ${source.type}`);
                });
            }
            
            if (result.subtitles && result.subtitles.length > 0) {
                console.log('\n📝 Subtitles:');
                result.subtitles.forEach((sub, index) => {
                    console.log(`${index + 1}. ${sub.language}: ${sub.url}`);
                });
            }
            
            if (result.searchResults && result.searchResults.length > 1) {
                console.log('\n🔍 Other Search Results:');
                result.searchResults.slice(1, 6).forEach((item, index) => {
                    console.log(`${index + 2}. ${item.title} (ID: ${item.id})`);
                });
            }
        })
        .catch(error => {
            console.error('❌ Unexpected error:', error.message);
            process.exit(1);
        });
}

module.exports = StreamingScraper;