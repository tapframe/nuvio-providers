// VidSrc Scraper for Nuvio Local Scrapers
// React Native compatible version - Standalone (no external dependencies)
// Converted to Promise-based syntax for sandbox compatibility

// Import cheerio-without-node-native for React Native
const cheerio = require('cheerio-without-node-native');
console.log('[VidSrc] Using cheerio-without-node-native for DOM parsing');

// Constants
const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const VIDSRC_PROXY_URL = process.env.VIDSRC_PROXY_URL;
let BASEDOM = "https://cloudnestra.com"; // This can be updated by serversLoad
const SOURCE_URL = "https://vidsrc.xyz/embed";

// --- Helper: Conditional Proxied Fetch ---
// This function wraps the native fetch. If VIDSRC_PROXY_URL is set in the environment,
// it routes requests through the proxy. Otherwise, it makes a direct request.
function fetchWrapper(url, options) {
    if (VIDSRC_PROXY_URL) {
        const proxiedUrl = `${VIDSRC_PROXY_URL}${encodeURIComponent(url)}`;
        console.log(`[VidSrc Proxy] Fetching: ${url} via proxy`);
        // Note: The proxy will handle the actual fetching, so we send the request to the proxy URL.
        // We pass the original headers in the options, the proxy should forward them.
        return fetch(proxiedUrl, options);
    }
    // If no proxy is set, fetch directly.
    console.log(`[VidSrc Direct] Fetching: ${url}`);
    return fetch(url, options);
}

// Helper function to make HTTP requests with default headers
function makeRequest(url, options = {}) {
    const defaultHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive'
    };

    return fetchWrapper(url, {
        method: options.method || 'GET',
        headers: { ...defaultHeaders, ...options.headers },
        ...options
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    })
    .catch(error => {
        console.error(`[VidSrc] Request failed for ${url}: ${error.message}`);
        throw error;
    });
}

// --- Helper Functions (copied and adapted from vidsrcextractor.js) ---
function serversLoad(html) {
    const $ = cheerio.load(html);
    const servers = [];
    const title = $("title").text() ?? "";
    const baseFrameSrc = $("iframe").attr("src") ?? "";
    if (baseFrameSrc) {
        try {
            const fullUrl = baseFrameSrc.startsWith("//") ? "https:" + baseFrameSrc : baseFrameSrc;
            BASEDOM = new URL(fullUrl).origin;
        }
        catch (e) {
            console.warn(`(Attempt 1) Failed to parse base URL from iframe src: ${baseFrameSrc} using new URL(), error: ${e.message}`);
            // Attempt 2: Regex fallback for origin
            const originMatch = (baseFrameSrc.startsWith("//") ? "https:" + baseFrameSrc : baseFrameSrc).match(/^(https?:\/\/[^/]+)/);
            if (originMatch && originMatch[1]) {
                BASEDOM = originMatch[1];
                console.log(`(Attempt 2) Successfully extracted origin using regex: ${BASEDOM}`);
            } else {
                console.error(`(Attempt 2) Failed to extract origin using regex from: ${baseFrameSrc}. Using default: ${BASEDOM}`);
                // Keep the default BASEDOM = "https://cloudnestra.com" if all fails
            }
        }
    }
    $(".serversList .server").each((index, element) => {
        const server = $(element);
        servers.push({
            name: server.text().trim(),
            dataHash: server.attr("data-hash") ?? null,
        });
    });
    return {
        servers: servers,
        title: title,
    };
}

function parseMasterM3U8(m3u8Content, masterM3U8Url) {
    const lines = m3u8Content.split('\n').map(line => line.trim());
    const streams = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
            const infoLine = lines[i];
            let quality = "unknown";
            const resolutionMatch = infoLine.match(/RESOLUTION=(\d+x\d+)/);
            if (resolutionMatch && resolutionMatch[1]) {
                quality = resolutionMatch[1];
            }
            else {
                const bandwidthMatch = infoLine.match(/BANDWIDTH=(\d+)/);
                if (bandwidthMatch && bandwidthMatch[1]) {
                    quality = `${Math.round(parseInt(bandwidthMatch[1]) / 1000)}kbps`;
                }
            }
            if (i + 1 < lines.length && lines[i + 1] && !lines[i + 1].startsWith("#")) {
                const streamUrlPart = lines[i + 1];
                try {
                    const fullStreamUrl = new URL(streamUrlPart, masterM3U8Url).href;
                    streams.push({ quality: quality, url: fullStreamUrl });
                }
                catch (e) {
                    console.error(`Error constructing URL for stream part: ${streamUrlPart} with base: ${masterM3U8Url}`, e);
                    streams.push({ quality: quality, url: streamUrlPart }); // Store partial URL as a fallback
                }
                i++;
            }
        }
    }
    
    // Sort streams by quality (highest first)
    streams.sort((a, b) => {
        // Extract resolution height from quality (e.g., "1280x720" -> 720)
        const getHeight = (quality) => {
            const match = quality.match(/(\d+)x(\d+)/);
            return match ? parseInt(match[2], 10) : 0;
        };
        
        const heightA = getHeight(a.quality);
        const heightB = getHeight(b.quality);
        
        // Higher resolution comes first
        return heightB - heightA;
    });
    
    return streams;
}

function PRORCPhandler(prorcp) {
    const prorcpUrl = `${BASEDOM}/prorcp/${prorcp}`;
    return fetchWrapper(prorcpUrl, {
        headers: {
            "accept": "*/*", "accept-language": "en-US,en;q=0.9", "priority": "u=1",
            "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
            "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "script", "sec-fetch-mode": "no-cors", "sec-fetch-site": "same-origin",
            'Sec-Fetch-Dest': 'iframe', "Referer": `${BASEDOM}/`, "Referrer-Policy": "origin",
        },
        timeout: 10000
    })
    .then(prorcpFetch => {
        if (!prorcpFetch.ok) {
            console.error(`Failed to fetch prorcp: ${prorcpUrl}, status: ${prorcpFetch.status}`);
            return null;
        }
        return prorcpFetch.text();
    })
    .then(prorcpResponse => {
        if (!prorcpResponse) return null;
        
        const regex = /file:\s*'([^']*)'/gm;
        const match = regex.exec(prorcpResponse);
        if (match && match[1]) {
            const masterM3U8Url = match[1];
            return fetchWrapper(masterM3U8Url, {
                headers: { "Referer": prorcpUrl, "Accept": "*/*" },
                timeout: 10000
            })
            .then(m3u8FileFetch => {
                if (!m3u8FileFetch.ok) {
                    console.error(`Failed to fetch master M3U8: ${masterM3U8Url}, status: ${m3u8FileFetch.status}`);
                    return null;
                }
                return m3u8FileFetch.text();
            })
            .then(m3u8Content => {
                if (!m3u8Content) return null;
                return parseMasterM3U8(m3u8Content, masterM3U8Url);
            });
        }
        console.warn("No master M3U8 URL found in prorcp response for:", prorcpUrl);
        return null;
    })
    .catch(error => {
        console.error(`Error in PRORCPhandler for ${BASEDOM}/prorcp/${prorcp}:`, error);
        return null;
    });
}

function SRCRCPhandler(srcrcpPath, refererForSrcrcp) {
    const srcrcpUrl = BASEDOM + srcrcpPath;
    console.log(`[VidSrc - SRCRCP] Fetching: ${srcrcpUrl} (Referer: ${refererForSrcrcp})`);
    
    return fetchWrapper(srcrcpUrl, {
        headers: {
            "accept": "*/*",
            "accept-language": "en-US,en;q=0.9",
            "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "iframe",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "same-origin",
            "Referer": refererForSrcrcp,
            "Referrer-Policy": "origin",
        },
        timeout: 10000
    })
    .then(response => {
        if (!response.ok) {
            console.error(`[VidSrc - SRCRCP] Failed to fetch ${srcrcpUrl}, status: ${response.status}`);
            return null;
        }
        return response.text();
    })
    .then(responseText => {
        if (!responseText) return null;
        
        console.log(`[VidSrc - SRCRCP] Response from ${srcrcpUrl} (first 500 chars): ${responseText.substring(0, 500)}`);

        // Attempt 1: Check for "file: '...'" like in PRORCP
        const fileRegex = /file:\s*'([^']*)'/gm;
        const fileMatch = fileRegex.exec(responseText);
        if (fileMatch && fileMatch[1]) {
            const masterM3U8Url = fileMatch[1];
            console.log(`[VidSrc - SRCRCP] Found M3U8 URL (via fileMatch): ${masterM3U8Url}`);
            return fetchWrapper(masterM3U8Url, {
                headers: { "Referer": srcrcpUrl, "Accept": "*/*" },
                timeout: 10000
            })
            .then(m3u8FileFetch => {
                if (!m3u8FileFetch.ok) {
                    console.error(`[VidSrc - SRCRCP] Failed to fetch master M3U8: ${masterM3U8Url}, status: ${m3u8FileFetch.status}`);
                    return null;
                }
                return m3u8FileFetch.text();
            })
            .then(m3u8Content => {
                if (!m3u8Content) return null;
                return parseMasterM3U8(m3u8Content, masterM3U8Url);
            });
        }

        // Attempt 2: Check if the responseText itself is an M3U8 playlist
        if (responseText.trim().startsWith("#EXTM3U")) {
            console.log(`[VidSrc - SRCRCP] Response from ${srcrcpUrl} appears to be an M3U8 playlist directly.`);
            return parseMasterM3U8(responseText, srcrcpUrl);
        }
        
        // Attempt 3: Look for sources = [...] or sources: [...] in script tags or in JSON-like structures
        const $ = cheerio.load(responseText);
        let sourcesFound = null;
        $('script').each((i, script) => {
            const scriptContent = $(script).html();
            if (scriptContent) {
                // Regex for various ways sources might be defined
                const sourcesRegexes = [
                    /sources\s*[:=]\s*(\[[^\]]*\{(?:\s*|.*?)file\s*:\s*['"]([^'"]+)['"](?:\s*|.*?)\}[^\]]*\])/si, // extracts the URL from sources: [{file: "URL"}]
                    /playerInstance\.setup\s*\(\s*\{\s*sources\s*:\s*(\[[^\]]*\{(?:\s*|.*?)file\s*:\s*['"]([^'"]+)['"](?:\s*|.*?)\}[^\]]*\])/si, // for playerInstance.setup({sources: [{file: "URL"}]})
                    /file\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i, // Direct M3U8 link in a var or object e.g. file: "URL.m3u8"
                    /src\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i, // Direct M3U8 link e.g. src: "URL.m3u8"
                    /loadSource\(['"]([^'"]+\.m3u8[^'"]*)['"]\)/i, // For .loadSource("URL.m3u8")
                    /new\s+Player\([^)]*\{\s*src\s*:\s*['"]([^'"]+)['"]\s*\}\s*\)/i // For new Player({src: "URL"})
                ];
                for (const regex of sourcesRegexes) {
                    const sourcesMatch = scriptContent.match(regex);
                    // For regexes that capture a JSON array-like structure in group 1 and then the URL in group 2 (first two regexes)
                    if (regex.source.includes('file\\s*:\\s*[\'\"([\'\"]]+)[\'\"')) { // Heuristic to identify these complex regexes
                        if (sourcesMatch && sourcesMatch[2]) { // URL is in group 2
                            console.log(`[VidSrc - SRCRCP] Found M3U8 URL (script complex): ${sourcesMatch[2]}`);
                            sourcesFound = [{ quality: 'default', url: sourcesMatch[2] }];
                            return false; // break cheerio loop
                        }
                    } 
                    // For simpler regexes where URL is in group 1
                    else if (sourcesMatch && sourcesMatch[1]) {
                        console.log(`[VidSrc - SRCRCP] Found M3U8 URL (script simple): ${sourcesMatch[1]}`);
                        sourcesFound = [{ quality: 'default', url: sourcesMatch[1] }];
                        return false; // break cheerio loop
                    }
                }
                 // Fallback: Look for any absolute .m3u8 URL within the script tag
                 if (!sourcesFound) {
                    const m3u8GenericMatch = scriptContent.match(/['"](https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)['"]/i);
                    if (m3u8GenericMatch && m3u8GenericMatch[1]) {
                        console.log(`[VidSrc - SRCRCP] Found M3U8 URL (script generic fallback): ${m3u8GenericMatch[1]}`);
                        sourcesFound = [{ quality: 'default', url: m3u8GenericMatch[1] }];
                        return false; // break cheerio loop
                    }
                }
            }
        });

        if (sourcesFound && sourcesFound.length > 0) {
            // Process the first valid M3U8 URL found, or return direct links
            const m3u8Source = sourcesFound.find(s => s.url && s.url.includes('.m3u8'));
            if (m3u8Source) {
                 console.log(`[VidSrc - SRCRCP] First M3U8 source from script: ${m3u8Source.url}`);
                 // Ensure URL is absolute
                 const absoluteM3u8Url = m3u8Source.url.startsWith('http') ? m3u8Source.url : new URL(m3u8Source.url, srcrcpUrl).href;
                 return fetchWrapper(absoluteM3u8Url, {
                    headers: { "Referer": srcrcpUrl, "Accept": "*/*" },
                    timeout: 10000
                 })
                 .then(m3u8FileFetch => {
                     if (!m3u8FileFetch.ok) {
                         console.error(`[VidSrc - SRCRCP] Failed to fetch M3U8 from script source: ${absoluteM3u8Url}, status: ${m3u8FileFetch.status}`);
                         return null;
                     }
                     return m3u8FileFetch.text();
                 })
                 .then(m3u8Content => {
                     if (!m3u8Content) return null;
                     return parseMasterM3U8(m3u8Content, absoluteM3u8Url);
                 });
            } else {
                // Assuming direct links if no .m3u8 found in the sources array
                console.log(`[VidSrc - SRCRCP] Assuming direct links from script sources:`, sourcesFound);
                return sourcesFound.map(s => ({
                    quality: s.quality || s.label || 'auto',
                    url: s.url.startsWith('http') ? s.url : new URL(s.url, srcrcpUrl).href
                }));
            }
        }

        console.warn(`[VidSrc - SRCRCP] No stream extraction method succeeded for ${srcrcpUrl}`);
        return null;
    })
    .catch(error => {
        console.error(`[VidSrc - SRCRCP] Error in SRCRCPhandler for ${srcrcpPath}:`, error);
        return null;
    });
}

function rcpGrabber(html) {
    const regex = /src:\s*'([^']*)'/;
    const match = html.match(regex);
    if (!match || !match[1])
        return null;
    return { metadata: { image: "" }, data: match[1] };
}

function getObject(id) {
    const arr = id.split(':');
    return { id: arr[0], season: arr[1], episode: arr[2] };
}

function getUrl(id, type) {
    if (type === "movie") {
        return `${SOURCE_URL}/movie/${id}`;
    }
    else {
        const obj = getObject(id);
        return `${SOURCE_URL}/tv/${obj.id}/${obj.season}-${obj.episode}`;
    }
}

// Main function to get streams - adapted for Nuvio provider format
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[VidSrc] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);
    
    // Convert to VidSrc format
    let id = tmdbId;
    let type = mediaType;
    
    if (mediaType === 'tv' && seasonNum && episodeNum) {
        id = `${tmdbId}:${seasonNum}:${episodeNum}`;
        type = 'series';
    }
    
    const url = getUrl(id, type === 'series' ? 'tv' : 'movie');
    
    return fetchWrapper(url, { headers: { "Referer": SOURCE_URL } })
    .then(embedRes => {
        if (!embedRes.ok) {
            console.error(`Failed to fetch embed page ${url}: ${embedRes.status}`);
            return [];
        }
        return embedRes.text();
    })
    .then(embedResp => {
        if (!embedResp) return [];
        
        const { servers, title } = serversLoad(embedResp);
        const streams = [];

        // Process servers sequentially to avoid Promise.all with async functions
        const processServer = (serverIndex) => {
            if (serverIndex >= servers.length) {
                // All servers processed, sort and return results
                streams.sort((a, b) => {
                    const getHeight = (quality) => {
                        const match = quality.match(/(\d+)x(\d+)/);
                        return match ? parseInt(match[2], 10) : 0;
                    };
                    
                    const heightA = getHeight(a.quality);
                    const heightB = getHeight(b.quality);
                    
                    return heightB - heightA;
                });

                console.log(`[VidSrc] Successfully processed ${streams.length} streams`);
                return streams;
            }
            
            const server = servers[serverIndex];
            if (!server.dataHash) {
                return processServer(serverIndex + 1); // Skip servers without dataHash
            }

            const rcpUrl = `${BASEDOM}/rcp/${server.dataHash}`;
            return fetchWrapper(rcpUrl, {
                headers: { 'Sec-Fetch-Dest': 'iframe', "Referer": url }
            })
            .then(rcpRes => {
                if (!rcpRes.ok) {
                    console.warn(`RCP fetch failed for server ${server.name}: ${rcpRes.status}`);
                    return processServer(serverIndex + 1); // Failed to fetch RCP
                }
                return rcpRes.text();
            })
            .then(rcpHtml => {
                if (!rcpHtml) return processServer(serverIndex + 1);
                
                const rcpData = rcpGrabber(rcpHtml);
                if (!rcpData || !rcpData.data) {
                    console.warn(`Skipping server ${server.name} due to missing rcp data.`);
                    return processServer(serverIndex + 1); // Missing RCP data
                }

                let streamDetailsPromise;
                if (rcpData.data.startsWith("/prorcp/")) {
                    streamDetailsPromise = PRORCPhandler(rcpData.data.replace("/prorcp/", ""));
                } else if (rcpData.data.startsWith("/srcrcp/")) {
                    if (server.name === "Superembed" || server.name === "2Embed") {
                        console.warn(`[VidSrc] Skipping SRCRCP for known problematic server: ${server.name}`);
                        return processServer(serverIndex + 1);
                    }
                    streamDetailsPromise = SRCRCPhandler(rcpData.data, rcpUrl); // Pass rcpUrl as referer
                } else {
                    console.warn(`Unhandled rcp data type for server ${server.name}: ${rcpData.data.substring(0, 50)}`);
                    return processServer(serverIndex + 1); // Unhandled type
                }

                return Promise.resolve(streamDetailsPromise)
                .then(streamDetails => {
                    if (streamDetails && streamDetails.length > 0) {
                        // Convert to Nuvio format
                        const nuvioStreams = streamDetails.map(stream => ({
                            name: "VidSrc",
                            title: `${title || 'Unknown'} - ${stream.quality}`,
                            url: stream.url,
                            quality: stream.quality,
                            type: 'direct'
                        }));
                        streams.push(...nuvioStreams);
                    } else {
                        console.warn(`No stream details from handler for server ${server.name} (${rcpData.data})`);
                    }
                    return processServer(serverIndex + 1);
                })
                .catch(e => {
                    console.error(`Error processing server ${server.name} (${server.dataHash}):`, e);
                    return processServer(serverIndex + 1); // Error during server processing
                });
            })
            .catch(e => {
                console.error(`Error fetching RCP for server ${server.name}:`, e);
                return processServer(serverIndex + 1);
            });
        };

        return processServer(0);
    })
    .catch(error => {
        console.error(`[VidSrc] Error in getStreams: ${error.message}`);
        return [];
    });
}

// Export for React Native
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.VidSrcScraperModule = { getStreams };
}