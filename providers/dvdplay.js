// DVDPlay scraper for Nuvio
// Scrapes content from dvdplay.forum with HubCloud link extraction

// Import shared HubCloud extractor
const { extractHubCloudLinks, validateVideoUrl } = require('../extractors/hubcloud');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; // This will be replaced by Nuvio
const BASE_URL = 'https://dvdplay.rodeo';

// Helper function for HTTP requests with better error handling
function makeHTTPRequest(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
    };

    return fetch(url, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        },
        redirect: 'follow'
    }).then(response => {
        // Handle different status codes more gracefully
        if (response.status === 500) {
            console.log(`[DVDPlay] Server error (500) for ${url}, this might be temporary`);
            throw new Error(`Server temporarily unavailable (HTTP 500)`);
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
    }).catch(error => {
        console.error(`[DVDPlay] Request failed for ${url}: ${error.message}`);
        throw error;
    });
}

// Search for content on DVDPlay with fallback strategies
function searchContent(title, year, mediaType) {
    const searchQuery = title.trim(); // Remove year from search
    // DVDPlay expects spaces to be encoded as + signs, not %20
    const encodedQuery = searchQuery.replace(/\s+/g, '+');
    const searchUrl = `${BASE_URL}/search.php?q=${encodedQuery}`;
    
    console.log(`[DVDPlay] Searching for: "${searchQuery}" at ${searchUrl}`);
    
    return makeHTTPRequest(searchUrl)
        .then(response => response.text())
        .then(html => {
            const moviePageRegex = /<a href="([^"]+)"><p class="home">/g;
            const results = [];
            let match;
            
            while ((match = moviePageRegex.exec(html)) !== null) {
                const movieUrl = new URL(match[1], BASE_URL).href;
                results.push({
                    title: title, // We'll extract the actual title later
                    url: movieUrl
                });
            }
            
            console.log(`[DVDPlay] Found ${results.length} search results`);
            return results;
        })
        .catch(error => {
            console.log(`[DVDPlay] Search failed: ${error.message}`);
            
            // Fallback strategy: try browsing recent updates on main page
            console.log(`[DVDPlay] Attempting fallback: browsing recent updates`);
            return searchFromMainPage(title, year).catch(fallbackError => {
                console.error(`[DVDPlay] Fallback search also failed: ${fallbackError.message}`);
                return [];
            });
        });
}

// Fallback search strategy: look through recent updates on main page
function searchFromMainPage(title, year) {
    console.log(`[DVDPlay] Searching main page for "${title}"`);
    
    return makeHTTPRequest(BASE_URL)
        .then(response => response.text())
        .then(html => {
            // Look for movie links in the main page
            const movieLinkRegex = /<a href="(\/page-\d+-[^"]+)"[^>]*>([^<]+)</g;
            const results = [];
            let match;
            
            const titleLower = title.toLowerCase();
            
            while ((match = movieLinkRegex.exec(html)) !== null) {
                const pageUrl = new URL(match[1], BASE_URL).href;
                const pageTitle = match[2].trim();
                
                // Simple matching - check if title words appear in the page title
                if (titleLower.split(' ').some(word => 
                    word.length > 2 && pageTitle.toLowerCase().includes(word)
                )) {
                    results.push({
                        title: pageTitle,
                        url: pageUrl
                    });
                    console.log(`[DVDPlay] Found potential match: "${pageTitle}" at ${pageUrl}`);
                }
            }
            
            console.log(`[DVDPlay] Fallback search found ${results.length} potential matches`);
            return results;
        });
}

// Extract download links from movie page
function extractDownloadLinks(pageUrl) {
    console.log(`[DVDPlay] Extracting download links from: ${pageUrl}`);
    
    return makeHTTPRequest(pageUrl)
        .then(response => response.text())
        .then(html => {
            const downloadPageLinks = [];
            const htmlChunks = html.split('<div align="center">');

            for (const chunk of htmlChunks) {
                if (chunk.includes('<a class="touch"')) {
                    const hrefMatch = chunk.match(/href="(\/download\/file\/[^"]+)"/);
                    if (hrefMatch) {
                        const fullLink = new URL(hrefMatch[1], BASE_URL).href;
                        downloadPageLinks.push(fullLink);
                    }
                }
            }
            
            console.log(`[DVDPlay] Found ${downloadPageLinks.length} download pages`);
            return downloadPageLinks;
        });
}

// Process download page to get HubCloud links
function processDownloadLink(downloadPageUrl) {
    console.log(`[DVDPlay] Processing download page: ${downloadPageUrl}`);
    
    return makeHTTPRequest(downloadPageUrl)
        .then(response => response.text())
        .then(downloadPageHtml => {
            const hubCloudUrls = [];
            
            // Only look for HubCloud links
            const hubCloudRegex = /<a href="(https?:\/\/hubcloud\.[^"]+)"/g;
            let hubCloudMatch;
            
            while ((hubCloudMatch = hubCloudRegex.exec(downloadPageHtml)) !== null) {
                hubCloudUrls.push(hubCloudMatch[1]);
            }
            
            console.log(`[DVDPlay] Found ${hubCloudUrls.length} HubCloud links in page`);
            
            // Extract final links from all HubCloud URLs
            const finalLinkPromises = hubCloudUrls.map(hubCloudUrl => {
                return extractHubCloudLinks(hubCloudUrl, 'DVDPlay', 'DVDPlay').catch(err => {
                    console.error(`[DVDPlay] Failed to extract from ${hubCloudUrl}: ${err.message}`);
                    return [];
                });
            });
            
            return Promise.all(finalLinkPromises).then(allFinalLinks => allFinalLinks.flat());
        })
        .catch(error => {
            console.error(`[DVDPlay] Error processing download link ${downloadPageUrl}: ${error.message}`);
            return [];
        });
}

// Find best match from search results
function findBestMatch(target, candidates) {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    
    // Simple matching - return first result for now
    // Could be enhanced with better string similarity matching
    return candidates[0];
}

// Parse quality for sorting
function parseQualityForSort(qualityString) {
    const match = (qualityString || '').match(/(\d{3,4})p/i);
    return match ? parseInt(match[1], 10) : 0;
}

// Extract quality from text
function extractQuality(text) {
    const match = (text || '').match(/(480p|720p|1080p|2160p|4k)/i);
    return match ? match[1] : 'Unknown';
}

// Extract size from text
function extractSize(text) {
    const match = (text || '').match(/\[([^\]]+)\]/);
    return match ? match[1] : null;
}

// Get service name from URL
function getServiceName(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        
        if (hostname.includes('gofile')) return 'GoFile';
        if (hostname.includes('gdflix')) return 'GdFlix';
        if (hostname.includes('filepress')) return 'FilePress';
        if (hostname.includes('fpgo')) return 'FpGo';
        if (hostname.includes('hubcloud')) return 'HubCloud';
        
        // Extract domain name for unknown services
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1);
        }
        
        return 'Unknown Service';
    } catch (error) {
        return 'Unknown Service';
    }
}


// Main function that Nuvio will call
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[DVDPlay] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
    
    // 1. Get TMDB info
    const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    
    return makeHTTPRequest(tmdbUrl)
        .then(response => response.json())
        .then(tmdbData => {
            const title = mediaType === 'tv' ? tmdbData.name : tmdbData.title;
            const year = mediaType === 'tv' ? tmdbData.first_air_date?.substring(0, 4) : tmdbData.release_date?.substring(0, 4);

            if (!title) {
                throw new Error('Could not extract title from TMDB response');
            }

            console.log(`[DVDPlay] TMDB Info: "${title}" (${year})`);

            // 2. Search for content
            return searchContent(title, year, mediaType).then(searchResults => {
                if (searchResults.length === 0) {
                    console.log(`[DVDPlay] No search results found`);
                    return [];
                }

                // 3. Extract download links from best match
                const selectedResult = findBestMatch(title, searchResults);
                return extractDownloadLinks(selectedResult.url).then(downloadLinks => {
                    if (downloadLinks.length === 0) {
                        console.log(`[DVDPlay] No download pages found`);
                        return [];
                    }

                    // 4. Process download links to get final streams
                    const streamPromises = downloadLinks.map(link => processDownloadLink(link));
                    return Promise.all(streamPromises).then(nestedStreams => {
                        let allStreams = nestedStreams.flat();

                        // 5. Filter out unwanted links (e.g., Google AMP links)
                        allStreams = allStreams.filter(stream => !stream.url.includes('cdn.ampproject.org'));

                        // 6. Remove duplicates based on URL
                        const uniqueStreams = Array.from(new Map(allStreams.map(stream => [stream.url, stream])).values());

                        // 7. Validate URLs in parallel (optional, can be disabled for speed)
                        console.log(`[DVDPlay] Validating ${uniqueStreams.length} stream URLs...`);
                        const validationPromises = uniqueStreams.map(stream => {
                            try {
                                // Check if URL validation is enabled (can be disabled for faster results)
                                if (typeof URL_VALIDATION_ENABLED !== 'undefined' && !URL_VALIDATION_ENABLED) {
                                    console.log(`[DVDPlay] ✓ URL validation disabled, accepting stream`);
                                    return Promise.resolve(stream);
                                }
                                
                                return validateVideoUrl(stream.url, 8000).then(isValid => {
                                    if (isValid) {
                                        return stream;
                                    } else {
                                        console.log(`[DVDPlay] ✗ Filtering out invalid stream: ${stream.name}`);
                                        return null;
                                    }
                                }).catch(error => {
                                    console.log(`[DVDPlay] ✗ Validation error for ${stream.name}: ${error.message}`);
                                    return null; // Filter out streams that fail validation
                                });
                            } catch (error) {
                                console.log(`[DVDPlay] ✗ Validation error for ${stream.name}: ${error.message}`);
                                return Promise.resolve(null); // Filter out streams that fail validation
                            }
                        });

                        return Promise.all(validationPromises).then(validatedStreams => {
                            const validStreams = validatedStreams.filter(stream => stream !== null);

                            // 8. Sort by quality (highest first)
                            validStreams.sort((a, b) => {
                                const qualityA = parseQualityForSort(a.quality);
                                const qualityB = parseQualityForSort(b.quality);
                                return qualityB - qualityA;
                            });

                            console.log(`[DVDPlay] Successfully processed ${validStreams.length} valid streams (${uniqueStreams.length - validStreams.length} filtered out)`);
                            return validStreams;
                        });
                    });
                });
            });
        })
        .catch(error => {
            console.error(`[DVDPlay] Error in getStreams: ${error.message}`);
            return [];
        });
}

// Export for React Native
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams, extractHubCloudLinks };
} else {
    global.getStreams = getStreams;
    global.extractHubCloudLinks = extractHubCloudLinks;
}