// Xprime Scraper for Nuvio Local Scrapers
// React Native compatible version - Standalone (no external dependencies)

// Working headers for Cloudflare Workers URLs
const WORKING_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Origin': 'https://xprime.tv',
    'Referer': 'https://xprime.tv/',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
    'DNT': '1'
};

// M3U8 Resolver Functions (inlined to remove external dependency)

// Parse M3U8 content and extract quality streams
function parseM3U8(content, baseUrl) {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const streams = [];
    
    let currentStream = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            // Parse stream info
            currentStream = {
                bandwidth: null,
                resolution: null,
                codecs: null,
                url: null
            };
            
            // Extract bandwidth
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
            if (bandwidthMatch) {
                currentStream.bandwidth = parseInt(bandwidthMatch[1]);
            }
            
            // Extract resolution
            const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            if (resolutionMatch) {
                currentStream.resolution = resolutionMatch[1];
            }
            
            // Extract codecs
            const codecsMatch = line.match(/CODECS="([^"]+)"/);
            if (codecsMatch) {
                currentStream.codecs = codecsMatch[1];
            }
            
        } else if (currentStream && !line.startsWith('#')) {
            // This is the URL for the current stream
            currentStream.url = resolveUrl(line, baseUrl);
            streams.push(currentStream);
            currentStream = null;
        }
    }
    
    return streams;
}

// Resolve relative URLs against base URL
function resolveUrl(url, baseUrl) {
    if (url.startsWith('http')) {
        return url;
    }
    
    try {
        return new URL(url, baseUrl).toString();
    } catch (error) {
        console.log(`⚠️ Could not resolve URL: ${url} against ${baseUrl}`);
        return url;
    }
}

// Determine quality from resolution or bandwidth
function getQualityFromStream(stream) {
    if (stream.resolution) {
        const [width, height] = stream.resolution.split('x').map(Number);
        
        if (height >= 2160) return '4K';
        if (height >= 1440) return '1440p';
        if (height >= 1080) return '1080p';
        if (height >= 720) return '720p';
        if (height >= 480) return '480p';
        if (height >= 360) return '360p';
        return '240p';
    }
    
    if (stream.bandwidth) {
        const mbps = stream.bandwidth / 1000000;
        
        if (mbps >= 15) return '4K';
        if (mbps >= 8) return '1440p';
        if (mbps >= 5) return '1080p';
        if (mbps >= 3) return '720p';
        if (mbps >= 1.5) return '480p';
        if (mbps >= 0.8) return '360p';
        return '240p';
    }
    
    return 'Unknown';
}

// Fetch and resolve M3U8 playlist
function resolveM3U8(url, sourceName = 'Unknown') {
    console.log(`🔍 Resolving M3U8 playlist for ${sourceName}...`);
    console.log(`📡 URL: ${url.substring(0, 80)}...`);
    
    return fetch(url, {
        method: 'GET',
        headers: WORKING_HEADERS,
        timeout: 15000
    }).then(function(response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return response.text().then(function(content) {
             console.log(`✅ Fetched M3U8 content (${content.length} bytes)`);
            
            // Check if it's a master playlist (contains #EXT-X-STREAM-INF)
            if (content.includes('#EXT-X-STREAM-INF:')) {
                console.log(`📋 Master playlist detected - parsing quality streams...`);
                
                const streams = parseM3U8(content, url);
                console.log(`🎬 Found ${streams.length} quality streams`);
                
                const resolvedStreams = [];
                
                for (const stream of streams) {
                    const quality = getQualityFromStream(stream);
                    
                    resolvedStreams.push({
                        source: sourceName,
                        name: `${sourceName} [${quality}]`,
                        url: stream.url,
                        quality: quality,
                        resolution: stream.resolution,
                        bandwidth: stream.bandwidth,
                        codecs: stream.codecs,
                        type: 'M3U8',
                        headers: WORKING_HEADERS,
                        referer: 'https://xprime.tv'
                    });
                    
                    console.log(`  📊 ${quality} (${stream.resolution || 'Unknown resolution'}) - ${Math.round((stream.bandwidth || 0) / 1000000 * 10) / 10} Mbps`);
                }
                
                // Sort by quality (highest first)
                resolvedStreams.sort((a, b) => {
                    const qualityOrder = { '4K': 4, '1440p': 3, '1080p': 2, '720p': 1, '480p': 0, '360p': -1, '240p': -2, 'Unknown': -3 };
                    return (qualityOrder[b.quality] || -3) - (qualityOrder[a.quality] || -3);
                });
                
                return {
                    success: true,
                    type: 'master',
                    streams: resolvedStreams,
                    originalUrl: url
                };
                
            } else if (content.includes('#EXTINF:')) {
                console.log(`📺 Media playlist detected - single quality stream`);
                
                return {
                    success: true,
                    type: 'media',
                    streams: [{
                        source: sourceName,
                        name: sourceName,
                        url: url,
                        quality: 'Unknown',
                        type: 'M3U8',
                        headers: WORKING_HEADERS,
                        referer: 'https://xprime.tv'
                    }],
                    originalUrl: url
                };
                
            } else {
                throw new Error('Invalid M3U8 content - no playlist markers found');
            }
        });
    }).catch(function(error) {
        console.log(`❌ Failed to resolve M3U8: ${error.message}`);
        
        return {
            success: false,
            error: error.message,
            streams: [],
            originalUrl: url
        };
    });
}

// Resolve multiple M3U8 URLs
function resolveMultipleM3U8(links) {
    console.log(`🚀 Resolving ${links.length} M3U8 playlists in parallel...`);
    
    const resolvePromises = links.map(function(link) {
        return resolveM3U8(link.url, link.name).then(function(result) {
            return {
                originalLink: link,
                resolution: result
            };
        });
    });
    
    return Promise.allSettled(resolvePromises).then(function(results) {
        const allResolvedStreams = [];
        const failedResolutions = [];
        
        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { originalLink, resolution } = result.value;
                
                if (resolution.success) {
                    allResolvedStreams.push(...resolution.streams);
                } else {
                    failedResolutions.push({
                        link: originalLink,
                        error: resolution.error
                    });
                }
            } else {
                failedResolutions.push({
                    link: 'Unknown',
                    error: result.reason.message
                });
            }
        }
        
        console.log(`\n📊 Resolution Summary:`);
        console.log(`✅ Successfully resolved: ${allResolvedStreams.length} streams`);
        console.log(`❌ Failed resolutions: ${failedResolutions.length}`);
        
        if (failedResolutions.length > 0) {
            console.log(`\n❌ Failed resolutions:`);
            failedResolutions.forEach((failure, index) => {
                console.log(`  ${index + 1}. ${failure.link.name || 'Unknown'}: ${failure.error}`);
            });
        }
        
        return {
            success: allResolvedStreams.length > 0,
            streams: allResolvedStreams,
            failed: failedResolutions,
            summary: {
                total: links.length,
                resolved: allResolvedStreams.length,
                failed: failedResolutions.length
            }
        };
    });
}

// Constants
const FALLBACK_DOMAIN = 'https://xprime.tv';
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// Global variables for domain caching
let xprimeDomain = FALLBACK_DOMAIN;
let domainCacheTimestamp = 0;

// Utility Functions
function getQualityFromName(qualityStr) {
    if (!qualityStr) return 'Unknown';
    
    const quality = qualityStr.toLowerCase();
    const qualityMap = {
        '2160p': 2160, '4k': 2160,
        '1440p': 1440, '2k': 1440,
        '1080p': 1080, 'fhd': 1080, 'full hd': 1080,
        '720p': 720, 'hd': 720,
        '480p': 480, 'sd': 480,
        '360p': 360,
        '240p': 240
    };
    
    for (const [key, value] of Object.entries(qualityMap)) {
        if (quality.includes(key)) return value;
    }
    
    // Try to extract number from string
    const match = qualityStr.match(/(\d{3,4})[pP]?/);
    return match ? parseInt(match[1]) : 'Unknown';
}

// Fetch latest domain from GitHub
function getXprimeDomain() {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) {
        return Promise.resolve(xprimeDomain);
    }

    console.log('[Xprime] Fetching latest domain...');
    return fetch('https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json', {
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    }).then(function(response) {
        if (response.ok) {
            return response.json().then(function(data) {
                if (data && data.xprime) {
                    xprimeDomain = data.xprime;
                    domainCacheTimestamp = now;
                    console.log(`[Xprime] Updated domain to: ${xprimeDomain}`);
                }
                return xprimeDomain;
            });
        }
        return xprimeDomain;
    }).catch(function(error) {
        console.error(`[Xprime] Failed to fetch latest domain: ${error.message}`);
        return xprimeDomain;
    });
}

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br'
    };

    return fetch(url, {
        method: options.method || 'GET',
        headers: { ...defaultHeaders, ...options.headers },
        ...options
    }).then(function(response) {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    }).catch(function(error) {
        console.error(`[Xprime] Request failed for ${url}: ${error.message}`);
        throw error;
    });
}

// Server Discovery
function getXprimeServers(api) {
    console.log('[Xprime] Discovering servers...');
    return makeRequest(`${api}/servers`).then(function(response) {
        return response.json().then(function(data) {
            if (data && data.servers) {
                const activeServers = data.servers.filter(server => server.status === 'ok');
                console.log(`[Xprime] Found ${activeServers.length} active servers: ${activeServers.map(s => s.name).join(', ')}`);
                return activeServers;
            }
            return [];
        });
    }).catch(function(error) {
        console.error(`[Xprime] Failed to fetch servers: ${error.message}`);
        return [];
    });
}

// Build Query Parameters
function buildQueryParams(serverName, title, year, id, season, episode) {
    const params = new URLSearchParams();
    params.append('name', title || '');
    
    if (serverName === 'primebox') {
        if (year) params.append('fallback_year', year.toString());
        if (season && episode) {
            params.append('season', season.toString());
            params.append('episode', episode.toString());
        }
    } else {
        if (year) params.append('year', year.toString());
        if (id) {
            params.append('id', id);
            params.append('imdb', id);
        }
        if (season && episode) {
            params.append('season', season.toString());
            params.append('episode', episode.toString());
        }
    }
    
    return params.toString();
}

// Process PrimeBox Response
function processPrimeBoxResponse(data, serverLabel) {
    const links = [];
    const subtitles = [];
    
    try {
        if (data.streams) {
            // Process quality streams
            if (data.qualities && Array.isArray(data.qualities)) {
                data.qualities.forEach(quality => {
                    const url = data.streams[quality];
                    if (url) {
                        links.push({
                            source: serverLabel,
                            name: `${serverLabel} [${quality}]`,
                            url: url,
                            quality: getQualityFromName(quality),
                            type: 'VIDEO',
                            headers: WORKING_HEADERS,
                            referer: 'https://xprime.tv'
                        });
                    }
                });
            }
        }
        
        // Process subtitles
        if (data.has_subtitles && data.subtitles && Array.isArray(data.subtitles)) {
            data.subtitles.forEach(sub => {
                if (sub.file) {
                    subtitles.push({
                        language: sub.label || 'Unknown',
                        url: sub.file
                    });
                }
            });
        }
    } catch (error) {
        console.error(`[Xprime] Error parsing PrimeBox response: ${error.message}`);
    }
    
    return { links, subtitles };
}

// Process Other Server Response
function processOtherServerResponse(data, serverLabel) {
    const links = [];
    
    try {
        if (data.url) {
            links.push({
                source: serverLabel,
                name: serverLabel,
                url: data.url,
                quality: 'Unknown',
                type: 'M3U8',
                headers: WORKING_HEADERS,
                referer: 'https://xprime.tv'
            });
        }
    } catch (error) {
        console.error(`[Xprime] Error parsing server response: ${error.message}`);
    }
    
    return { links, subtitles: [] };
}

// Main scraping function
function getStreams(title, year, season, episode, type, imdbId) {
    console.log(`[Xprime] Searching for: ${title} (${year})`);
    
    return getXprimeDomain().then(function(api) {
        return getXprimeServers(api).then(function(servers) {
            if (servers.length === 0) {
                console.log('[Xprime] No active servers found');
                return [];
            }
            
            console.log(`[Xprime] Processing ${servers.length} servers in parallel`);
            
            const allLinks = [];
            const allSubtitles = [];
            
            // Process servers in parallel for better performance
            const serverPromises = servers.map(function(server) {
                console.log(`[Xprime] Processing server: ${server.name}`);
                
                const queryParams = buildQueryParams(server.name, title, year, imdbId, season, episode);
                const serverUrl = `${api}/${server.name}?${queryParams}`;
                
                console.log(`[Xprime] Request URL: ${serverUrl}`);
                
                return makeRequest(serverUrl, {
                    headers: {
                        'Origin': api,
                        'Referer': api
                    }
                }).then(function(response) {
                    return response.json().then(function(data) {
                        const serverLabel = `Xprime ${server.name.charAt(0).toUpperCase() + server.name.slice(1)}`;
                        let result;
                        
                        if (server.name === 'primebox') {
                            result = processPrimeBoxResponse(data, serverLabel);
                        } else {
                            result = processOtherServerResponse(data, serverLabel);
                        }
                        
                        console.log(`[Xprime] Server ${server.name}: Found ${result.links.length} links, ${result.subtitles.length} subtitles`);
                        return result;
                    });
                }).catch(function(error) {
                    console.error(`[Xprime] Error on server ${server.name}: ${error.message}`);
                    return { links: [], subtitles: [] };
                });
            });

            // Wait for all server requests to complete
            return Promise.allSettled(serverPromises).then(function(results) {
                // Process results
                for (const result of results) {
                    if (result.status === 'fulfilled') {
                        const { links, subtitles } = result.value;
                        allLinks.push(...links);
                        allSubtitles.push(...subtitles);
                    }
                }
                
                console.log(`[Xprime] Total found: ${allLinks.length} links, ${allSubtitles.length} subtitles`);
                
                // Separate M3U8 links from direct video links
                const m3u8Links = allLinks.filter(link => link.type === 'M3U8');
                const directLinks = allLinks.filter(link => link.type !== 'M3U8');
                
                let resolvedStreams = [];
                
                // Resolve M3U8 playlists to extract individual quality streams
                if (m3u8Links.length > 0) {
                    console.log(`[Xprime] Resolving ${m3u8Links.length} M3U8 playlists...`);
                    
                    return resolveMultipleM3U8(m3u8Links).then(function(resolutionResult) {
                        if (resolutionResult.success && resolutionResult.streams.length > 0) {
                            console.log(`[Xprime] Successfully resolved ${resolutionResult.streams.length} quality streams`);
                            resolvedStreams = resolutionResult.streams;
                        } else {
                            console.log(`[Xprime] M3U8 resolution failed, using master playlist URLs`);
                            resolvedStreams = m3u8Links;
                        }
                        
                        // Combine resolved streams with direct links
                        const finalLinks = [...directLinks, ...resolvedStreams];
                        
                        console.log(`[Xprime] Final result: ${finalLinks.length} total streams (${resolvedStreams.length} from M3U8, ${directLinks.length} direct)`);
                        
                        // Format links for Nuvio
                        const formattedLinks = finalLinks.map(link => ({
                            name: link.name,
                            url: link.url,
                            quality: typeof link.quality === 'number' ? `${link.quality}p` : link.quality,
                            size: link.size || 'Unknown',
                            headers: link.headers || WORKING_HEADERS,
                            subtitles: allSubtitles
                        }));
                        
                        return formattedLinks;
                    }).catch(function(error) {
                        console.error(`[Xprime] M3U8 resolution error: ${error.message}`);
                        resolvedStreams = m3u8Links;
                        
                        // Combine resolved streams with direct links
                        const finalLinks = [...directLinks, ...resolvedStreams];
                        
                        console.log(`[Xprime] Final result: ${finalLinks.length} total streams (${resolvedStreams.length} from M3U8, ${directLinks.length} direct)`);
                        
                        // Format links for Nuvio
                        const formattedLinks = finalLinks.map(link => ({
                            name: link.name,
                            url: link.url,
                            quality: typeof link.quality === 'number' ? `${link.quality}p` : link.quality,
                            size: link.size || 'Unknown',
                            headers: link.headers || WORKING_HEADERS,
                            subtitles: allSubtitles
                        }));
                        
                        return formattedLinks;
                    });
                } else {
                    // No M3U8 links, just return direct links
                    const finalLinks = [...directLinks, ...resolvedStreams];
                    
                    console.log(`[Xprime] Final result: ${finalLinks.length} total streams (${resolvedStreams.length} from M3U8, ${directLinks.length} direct)`);
                    
                    // Format links for Nuvio
                    const formattedLinks = finalLinks.map(link => ({
                        name: link.name,
                        url: link.url,
                        quality: typeof link.quality === 'number' ? `${link.quality}p` : link.quality,
                        size: link.size || 'Unknown',
                        headers: link.headers || WORKING_HEADERS,
                        subtitles: allSubtitles
                    }));
                    
                    return formattedLinks;
                }
            });
        });
    }).catch(function(error) {
        console.error(`[Xprime] Scraping error: ${error.message}`);
        return [];
    });
}

// Export the main function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    // For React Native environment
    global.XprimeScraperModule = { getStreams };
}