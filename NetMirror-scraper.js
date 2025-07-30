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
        this.mainUrl = 'https://a.net2025.cc';
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
        
        // Platform-specific search endpoints
        const searchEndpoints = {
            'netflix': `${this.mainUrl}/search.php`,
            'primevideo': `${this.mainUrl}/pv/search.php`,
            'disney': `${this.mainUrl}/mobile/hs/search.php`
        };
        
        const searchUrl = searchEndpoints[platform.toLowerCase()] || searchEndpoints['netflix'];
        
        try {
            const response = await axios.get(
                `${searchUrl}?s=${encodeURIComponent(query)}&t=${this.getUnixTime()}`,
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
    /**
     * Get episodes from specific season
     */
    async getEpisodesFromSeason(seriesId, seasonId, platform = 'netflix', page = 1) {
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
        
        const episodes = [];
        let currentPage = page;
        
        // Platform-specific episodes endpoints
        const episodesEndpoints = {
            'netflix': `${this.mainUrl}/episodes.php`,
            'primevideo': `${this.mainUrl}/pv/episodes.php`,
            'disney': `${this.mainUrl}/mobile/hs/episodes.php`
        };
        
        const episodesUrl = episodesEndpoints[platform.toLowerCase()] || episodesEndpoints['netflix'];
        
        while (true) {
            try {
                const response = await axios.get(
                    `${episodesUrl}?s=${seasonId}&series=${seriesId}&t=${this.getUnixTime()}&page=${currentPage}`,
                    {
                        headers: {
                            ...this.headers,
                            'Cookie': cookieString,
                            'Referer': `${this.mainUrl}/tv/home`
                        },
                        timeout: 10000
                    }
                );
                
                const episodeData = response.data;
                
                if (episodeData.episodes) {
                    episodes.push(...episodeData.episodes);
                }
                
                if (episodeData.nextPageShow === 0) break;
                currentPage++;
            } catch (error) {
                console.log(`⚠️ Failed to load episodes from season ${seasonId}, page ${currentPage}`);
                break;
            }
        }
        
        return episodes;
    }

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
        
        // Platform-specific post endpoints
        const postEndpoints = {
            'netflix': `${this.mainUrl}/post.php`,
            'primevideo': `${this.mainUrl}/pv/post.php`,
            'disney': `${this.mainUrl}/mobile/hs/post.php`
        };
        
        const postUrl = postEndpoints[platform.toLowerCase()] || postEndpoints['netflix'];
        
        try {
            const response = await axios.get(
                `${postUrl}?id=${contentId}&t=${this.getUnixTime()}`,
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
            
            let allEpisodes = postData.episodes || [];
            
            // If this is a TV series, fetch episodes from all seasons
            if (postData.episodes && postData.episodes.length > 0 && postData.episodes[0] !== null) {
                console.log('🔍 Loading episodes from all seasons...');
                
                // Add episodes from current season if nextPageShow indicates more pages
                if (postData.nextPageShow === 1 && postData.nextPageSeason) {
                    const additionalEpisodes = await this.getEpisodesFromSeason(contentId, postData.nextPageSeason, platform, 2);
                    allEpisodes.push(...additionalEpisodes);
                }
                
                // Add episodes from other seasons (excluding the last one which is current)
                if (postData.season && postData.season.length > 1) {
                    const otherSeasons = postData.season.slice(0, -1); // Remove last season
                    for (const season of otherSeasons) {
                        const seasonEpisodes = await this.getEpisodesFromSeason(contentId, season.id, platform, 1);
                        allEpisodes.push(...seasonEpisodes);
                    }
                }
                
                console.log(`✓ Loaded ${allEpisodes.filter(ep => ep !== null).length} total episodes`);
            }
            
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
                episodes: allEpisodes,
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
     * Extract actual video segment URLs from HLS playlist
     */
    async extractSegmentUrls(playlistUrl, maxSegments = 5) {
        try {
            const response = await axios.get(playlistUrl, {
                headers: this.headers,
                timeout: 10000
            });
            
            const content = response.data;
            const lines = content.split('\n');
            const segments = [];
            
            for (let i = 0; i < lines.length && segments.length < maxSegments; i++) {
                const line = lines[i].trim();
                if (line && !line.startsWith('#')) {
                    // Handle relative URLs
                    let segmentUrl = line;
                    if (line.startsWith('/')) {
                        const baseUrl = new URL(playlistUrl);
                        segmentUrl = `${baseUrl.protocol}//${baseUrl.host}${line}`;
                    } else if (!line.startsWith('http')) {
                        const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
                        segmentUrl = baseUrl + line;
                    }
                    segments.push(segmentUrl);
                }
            }
            
            return segments;
        } catch (error) {
            console.log(`⚠️ Could not extract segments from ${playlistUrl}: ${error.message}`);
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
        
        // Platform-specific playlist endpoints
        const playlistEndpoints = {
            'netflix': `${this.mainUrl}/tv/playlist.php`,
            'primevideo': `${this.mainUrl}/tv/pv/playlist.php`,
            'disney': `${this.mainUrl}/mobile/hs/playlist.php`
        };
        
        const playlistUrl = playlistEndpoints[platform.toLowerCase()] || playlistEndpoints['netflix'];
        
        try {
            const response = await axios.get(
                `${playlistUrl}?id=${contentId}&t=${encodeURIComponent(title)}&tm=${this.getUnixTime()}`,
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
                return { sources: [], subtitles: [], segments: [] };
            }
            
            const sources = [];
            const subtitles = [];
            const segments = [];
            
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
            
            // Extract segment URLs from the first HLS source
            if (sources.length > 0) {
                console.log('🔍 Extracting actual video segment URLs...');
                const segmentUrls = await this.extractSegmentUrls(sources[0].url);
                segments.push(...segmentUrls);
            }
            
            console.log(`✓ Found ${sources.length} streaming sources and ${subtitles.length} subtitle tracks`);
            if (segments.length > 0) {
                console.log(`✓ Extracted ${segments.length} video segment URLs`);
            }
            
            return { sources, subtitles, segments };
        } catch (error) {
            console.error('❌ Failed to get streaming links:', error.message);
            throw error;
        }
    }

    /**
     * Parse episode notation (e.g., "S01E01", "s1e1") with optional year
     */
    parseEpisodeNotation(query) {
        // Match patterns like "The Boys 2019 S01E01" or "The Boys S01E01"
        const episodeWithYearMatch = query.match(/(.+?)\s+(\d{4})\s+s(\d+)e(\d+)/i);
        if (episodeWithYearMatch) {
            return {
                seriesName: episodeWithYearMatch[1].trim(),
                year: episodeWithYearMatch[2],
                season: parseInt(episodeWithYearMatch[3]),
                episode: parseInt(episodeWithYearMatch[4]),
                isEpisodeQuery: true
            };
        }
        
        const episodeMatch = query.match(/(.+?)\s+s(\d+)e(\d+)/i);
        if (episodeMatch) {
            return {
                seriesName: episodeMatch[1].trim(),
                season: parseInt(episodeMatch[2]),
                episode: parseInt(episodeMatch[3]),
                isEpisodeQuery: true
            };
        }
        return {
            seriesName: query,
            isEpisodeQuery: false
        };
    }

    /**
     * Find specific episode ID from series data
     */
    findEpisodeId(seriesData, season, episode) {
        if (!seriesData.episodes || seriesData.episodes.length === 0) {
            return null;
        }
        
        const validEpisodes = seriesData.episodes.filter(ep => ep !== null);
        const targetEpisode = validEpisodes.find(ep => {
            const epSeason = parseInt(ep.s.replace('S', ''));
            const epNumber = parseInt(ep.ep.replace('E', ''));
            return epSeason === season && epNumber === episode;
        });
        
        return targetEpisode ? targetEpisode.id : null;
    }

    /**
     * Get content for specific episode
     */
    async getEpisodeContent(query, platform = null) {
        const parsed = this.parseEpisodeNotation(query);
        
        if (!parsed.isEpisodeQuery) {
            throw new Error('Invalid episode format. Use format like "Stranger Things S01E01"');
        }
        
        const yearInfo = parsed.year ? ` (${parsed.year})` : '';
            console.log(`🔍 Searching for ${parsed.seriesName}${yearInfo} Season ${parsed.season} Episode ${parsed.episode}...`);
            
            let targetPlatform = platform;
            let searchResults;
            
            if (!platform) {
                // Auto-search across all platforms
                const result = await this.searchAllPlatforms(parsed.seriesName);
                targetPlatform = result.platform;
                searchResults = result.searchResults;
            } else {
                // Use specified platform
                searchResults = await this.search(parsed.seriesName, platform);
                if (searchResults.length === 0) {
                    throw new Error('No series found');
                }
            }
            
            // Try each search result to find one with the episode
            let episodeId = null;
            let seriesData = null;
            let seriesResult = null;
            let candidateResults = [];
            
            // First pass: collect all valid candidates with their details
            for (const result of searchResults) {
                try {
                    console.log(`🔍 Checking: ${result.title}`);
                    const tempSeriesData = await this.loadContent(result.id, targetPlatform);
                    
                    // Skip if it's a movie
                    if (tempSeriesData.isMovie) {
                        console.log(`⏭️  Skipping movie: ${result.title} (${tempSeriesData.year})`);
                        continue;
                    }
                    
                    const tempEpisodeId = this.findEpisodeId(tempSeriesData, parsed.season, parsed.episode);
                    
                    if (tempEpisodeId) {
                        candidateResults.push({
                            result,
                            seriesData: tempSeriesData,
                            episodeId: tempEpisodeId,
                            year: tempSeriesData.year
                        });
                        console.log(`✓ Found candidate: ${result.title} (${tempSeriesData.year})`);
                    }
                } catch (error) {
                    console.log(`⚠️  Error checking ${result.title}: ${error.message}`);
                    continue;
                }
            }
            
            // Second pass: prioritize by year if specified
            if (candidateResults.length > 0) {
                if (parsed.year) {
                    // Look for exact year match first
                    const yearMatch = candidateResults.find(candidate => candidate.year === parsed.year);
                    if (yearMatch) {
                        episodeId = yearMatch.episodeId;
                        seriesData = yearMatch.seriesData;
                        seriesResult = yearMatch.result;
                        console.log(`✓ Using year-matched series: ${seriesResult.title} (${yearMatch.year})`);
                    } else {
                        console.log(`⚠️  No exact year match for ${parsed.year}, using first available`);
                        const firstCandidate = candidateResults[0];
                        episodeId = firstCandidate.episodeId;
                        seriesData = firstCandidate.seriesData;
                        seriesResult = firstCandidate.result;
                    }
                } else {
                    // No year specified, use first candidate
                    const firstCandidate = candidateResults[0];
                    episodeId = firstCandidate.episodeId;
                    seriesData = firstCandidate.seriesData;
                    seriesResult = firstCandidate.result;
                    console.log(`✓ Using first available series: ${seriesResult.title} (${firstCandidate.year})`);
                }
            }
        
        if (!episodeId) {
            throw new Error(`Episode S${parsed.season.toString().padStart(2, '0')}E${parsed.episode.toString().padStart(2, '0')} not found in any search results`);
        }
        
        console.log(`✓ Found episode ID: ${episodeId}`);
        console.log(`🎯 Using ${targetPlatform} for episode`);
        
        // Get streaming links for the specific episode
        const episodeTitle = `${parsed.seriesName} S${parsed.season.toString().padStart(2, '0')}E${parsed.episode.toString().padStart(2, '0')}`;
        const streamingData = await this.getStreamingLinks(episodeId, episodeTitle, targetPlatform);
        
        // Find episode details
        const episodeDetails = seriesData.episodes.find(ep => ep && ep.id === episodeId);
        
        return {
            ...seriesData,
            ...streamingData,
            episodeId,
            episodeTitle,
            episodeDetails,
            isEpisode: true,
            platform: targetPlatform
        };
    }

    /**
     * Calculate similarity between two strings (0-1 scale)
     */
    calculateSimilarity(str1, str2) {
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();
        
        if (s1 === s2) return 1.0;
        
        // Exact match gets highest score
        if (s1 === s2) return 1.0;
        
        // Check for exact word sequence match
        const words1 = s1.split(/\s+/).filter(w => w.length > 0);
        const words2 = s2.split(/\s+/).filter(w => w.length > 0);
        
        // If query is shorter, check if all query words are in title
        if (words2.length <= words1.length) {
            let exactMatches = 0;
            for (const queryWord of words2) {
                if (words1.includes(queryWord)) {
                    exactMatches++;
                }
            }
            
            // All query words must match for high similarity
            if (exactMatches === words2.length) {
                return 0.95 * (exactMatches / words1.length);
            }
        }
        
        // Check if title starts with query
        if (s1.startsWith(s2)) {
            return 0.9;
        }
        
        // Partial word matching with stricter criteria
        let partialMatches = 0;
        for (const word1 of words1) {
            for (const word2 of words2) {
                if (word1 === word2) {
                    partialMatches += 1.0;
                } else if (word1.includes(word2) && word2.length >= 3) {
                    partialMatches += 0.7;
                } else if (word2.includes(word1) && word1.length >= 3) {
                    partialMatches += 0.7;
                }
            }
        }
        
        return Math.min(partialMatches / Math.max(words1.length, words2.length), 0.8);
    }

    /**
     * Filter search results based on relevance
     */
    filterRelevantResults(searchResults, query, minSimilarity = 0.8) {
        const filtered = searchResults.filter(result => {
            const similarity = this.calculateSimilarity(result.title, query);
            return similarity >= minSimilarity;
        });
        
        // Sort by similarity (highest first)
        return filtered.sort((a, b) => {
            const simA = this.calculateSimilarity(a.title, query);
            const simB = this.calculateSimilarity(b.title, query);
            return simB - simA;
        });
    }

    /**
     * Search across all platforms and return the best result
     */
    async searchAllPlatforms(query) {
        const platforms = ['netflix', 'primevideo', 'disney'];
        
        console.log(`🔍 Searching across all platforms for: ${query}`);
        
        for (const platform of platforms) {
            try {
                console.log(`🎬 Trying ${platform}...`);
                const searchResults = await this.search(query, platform);
                
                if (searchResults.length > 0) {
                    // Apply strict filtering
                    const relevantResults = this.filterRelevantResults(searchResults, query);
                    
                    if (relevantResults.length > 0) {
                        console.log(`✓ Found ${relevantResults.length} relevant results on ${platform} (filtered from ${searchResults.length})`);
                        return { platform, searchResults: relevantResults };
                    } else {
                        console.log(`⚠️  Found ${searchResults.length} results on ${platform} but none were relevant enough`);
                    }
                }
            } catch (error) {
                console.log(`⚠️  ${platform} failed: ${error.message}`);
                continue;
            }
        }
        
        throw new Error('No relevant content found on any platform');
    }

    /**
     * Get content from any platform (auto-detect best source)
     */
    async getContent(query, platform = null) {
        try {
            let targetPlatform = platform;
            let searchResults;
            
            if (!platform) {
                // Auto-search across all platforms
                const result = await this.searchAllPlatforms(query);
                targetPlatform = result.platform;
                searchResults = result.searchResults;
            } else {
                // Use specified platform
                const rawResults = await this.search(query, platform);
                if (rawResults.length === 0) {
                    return { error: 'No content found' };
                }
                
                // Apply strict filtering
                searchResults = this.filterRelevantResults(rawResults, query);
                if (searchResults.length === 0) {
                    return { error: `Found ${rawResults.length} results but none were relevant enough` };
                }
                
                console.log(`✓ Found ${searchResults.length} relevant results on ${platform} (filtered from ${rawResults.length})`);
            }
            
            // Use first result
            const firstResult = searchResults[0];
            console.log(`🎯 Using ${targetPlatform} for: ${firstResult.title}`);
            
            // Load detailed content info
            const contentDetails = await this.loadContent(firstResult.id, targetPlatform);
            
            // Get streaming links
            const streamingData = await this.getStreamingLinks(firstResult.id, contentDetails.title, targetPlatform);
            
            return {
                ...contentDetails,
                ...streamingData,
                platform: targetPlatform,
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
🎬 Universal Streaming Scraper CLI

Usage:
  node streaming-scraper.js "<search_query>" [platform]
  node streaming-scraper.js "<series_name> S##E##" [platform]
  node streaming-scraper.js "<series_name> YYYY S##E##" [platform]

Platforms (optional - auto-detects best source if not specified):
  netflix
  primevideo
  disney

Examples:
  node streaming-scraper.js "The Matrix"                    # Auto-detect platform
  node streaming-scraper.js "Stranger Things S01E01"        # Auto-detect platform
  node streaming-scraper.js "The Boys 2019 S01E01"          # Auto-detect platform
  node streaming-scraper.js "Stranger Things" netflix       # Force specific platform
  node streaming-scraper.js "The Boys S02E03" primevideo    # Force specific platform
  node streaming-scraper.js "The Mandalorian S01E01" disney # Force specific platform
`);
        process.exit(1);
    }
    
    const query = args[0];
    const platform = args[1] || null;
    
    const scraper = new StreamingScraper();
    
    // Check if this is an episode query
    const parsed = scraper.parseEpisodeNotation(query);
    const contentPromise = parsed.isEpisodeQuery 
        ? scraper.getEpisodeContent(query, platform)
        : scraper.getContent(query, platform);
    
    contentPromise
        .then(result => {
            if (result.error) {
                console.error('❌ Error:', result.error);
                process.exit(1);
            }
            
            if (result.isEpisode) {
                console.log('\n📋 Episode Details:');
                console.log(`Series: ${result.title}`);
                console.log(`Episode: ${result.episodeTitle}`);
                if (result.episodeDetails) {
                    console.log(`Title: ${result.episodeDetails.t}`);
                    console.log(`Runtime: ${result.episodeDetails.time}`);
                }
                console.log(`Year: ${result.year}`);
                console.log(`Genre: ${result.genre}`);
            } else {
                console.log('\n📋 Content Details:');
                console.log(`Title: ${result.title}`);
                console.log(`Year: ${result.year}`);
                console.log(`Genre: ${result.genre}`);
                console.log(`Type: ${result.isMovie ? 'Movie' : 'TV Series'}`);
                
                if (!result.isMovie && result.episodes && result.episodes.length > 0) {
                    console.log('\n📺 Episodes:');
                    const validEpisodes = result.episodes.filter(ep => ep !== null);
                    console.log(`Total Episodes: ${validEpisodes.length}`);
                    
                    // Show first 5 episodes as examples
                    validEpisodes.slice(0, 5).forEach((episode, index) => {
                        console.log(`${index + 1}. ${episode.s}${episode.ep}: ${episode.t} (${episode.time})`);
                    });
                    
                    if (validEpisodes.length > 5) {
                        console.log(`... and ${validEpisodes.length - 5} more episodes`);
                    }
                    
                    if (result.seasons && result.seasons.length > 0) {
                        console.log(`\nSeasons Available: ${result.seasons.length}`);
                    }
                }
            }
            
            if (result.sources && result.sources.length > 0) {
                console.log('\n🎬 Streaming Sources:');
                result.sources.forEach((source, index) => {
                    console.log(`${index + 1}. Quality: ${source.quality}`);
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
            
            if (result.segments && result.segments.length > 0) {
                console.log('\n🎞️ Actual Video Segment URLs:');
                result.segments.forEach((segment, index) => {
                    console.log(`${index + 1}. ${segment}`);
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