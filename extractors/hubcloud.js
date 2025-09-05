// HubCloud Extractor for Nuvio Local Scrapers
// Shared functionality for extracting HubCloud links
// Used by DVDPlay, 4KHDHub, and other providers

// Constants
const DEFAULT_HEADERS = {
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

// Polyfill atob/btoa for Node test environments if missing (kept lightweight, no imports)
if (typeof atob === 'undefined') {
    try {
        // eslint-disable-next-line no-undef
        global.atob = function (b64) { return Buffer.from(b64, 'base64').toString('binary'); };
    } catch (e) {
        // ignore for RN
    }
}
if (typeof btoa === 'undefined') {
    try {
        // eslint-disable-next-line no-undef
        global.btoa = function (str) { return Buffer.from(str, 'binary').toString('base64'); };
    } catch (e) {
        // ignore for RN
    }
}

// Utility functions
function getBaseUrl(url) {
    try {
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.host}`;
    } catch (e) {
        return '';
    }
}

function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const fetchOptions = {
            method: options.method || 'GET',
            headers: {
                ...DEFAULT_HEADERS,
                ...options.headers
            },
            timeout: 30000
        };

        fetch(url, fetchOptions)
            .then(response => {
                if (options.allowRedirects === false && (response.status === 301 || response.status === 302 || response.status === 303 || response.status === 307 || response.status === 308)) {
                    resolve({ statusCode: response.status, headers: Object.fromEntries(response.headers) });
                    return;
                }
                
                return response.text().then(data => {
                    if (options.parseHTML && data) {
                        const cheerio = require('cheerio-without-node-native');
                        const $ = cheerio.load(data);
                        resolve({ $: $, body: data, statusCode: response.status, headers: Object.fromEntries(response.headers) });
                    } else {
                        resolve({ body: data, statusCode: response.status, headers: Object.fromEntries(response.headers) });
                    }
                });
            })
            .catch(reject);
    });
}

function getIndexQuality(str) {
    const match = (str || '').match(/(\d{3,4})[pP]/);
    return match ? parseInt(match[1]) : 2160;
}

function decodeFilename(filename) {
    if (!filename) return filename;
    
    try {
        let decoded = filename;
        
        if (decoded.startsWith('UTF-8')) {
            decoded = decoded.substring(5);
        }
        
        decoded = decodeURIComponent(decoded);
        
        return decoded;
    } catch (error) {
        return filename;
    }
}

function cleanTitle(title) {
    const decodedTitle = decodeFilename(title);
    const parts = decodedTitle.split(/[.\-_]/);
    
    const qualityTags = ['WEBRip', 'WEB-DL', 'WEB', 'BluRay', 'HDRip', 'DVDRip', 'HDTV', 'CAM', 'TS', 'R5', 'DVDScr', 'BRRip', 'BDRip', 'DVD', 'PDTV', 'HD'];
    const audioTags = ['AAC', 'AC3', 'DTS', 'MP3', 'FLAC', 'DD5', 'EAC3', 'Atmos'];
    const subTags = ['ESub', 'ESubs', 'Subs', 'MultiSub', 'NoSub', 'EnglishSub', 'HindiSub'];
    const codecTags = ['x264', 'x265', 'H264', 'HEVC', 'AVC'];
    
    const startIndex = parts.findIndex(part => 
        qualityTags.some(tag => part.toLowerCase().includes(tag.toLowerCase()))
    );
    
    const endIndex = parts.map((part, index) => {
        const hasTag = [...subTags, ...audioTags, ...codecTags].some(tag => 
            part.toLowerCase().includes(tag.toLowerCase())
        );
        return hasTag ? index : -1;
    }).filter(index => index !== -1).pop() || -1;
    
    if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
        return parts.slice(startIndex, endIndex + 1).join('.');
    } else if (startIndex !== -1) {
        return parts.slice(startIndex).join('.');
    } else {
        return parts.slice(-3).join('.');
    }
}

function getFilenameFromUrl(url) {
    return new Promise((resolve) => {
        try {
            fetch(url, { method: 'HEAD', timeout: 10000 })
                .then(response => {
                    const contentDisposition = response.headers.get('content-disposition');
                    let filename = null;
                    
                    if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
                        if (filenameMatch && filenameMatch[1]) {
                            filename = filenameMatch[1].replace(/["']/g, '');
                        }
                    }
                    
                    if (!filename) {
                        const urlObj = new URL(url);
                        const pathParts = urlObj.pathname.split('/');
                        filename = pathParts[pathParts.length - 1];
                        if (filename && filename.includes('.')) {
                            filename = filename.replace(/\.[^.]+$/, '');
                        }
                    }
                    
                    const decodedFilename = decodeFilename(filename);
                    resolve(decodedFilename || null);
                })
                .catch(() => resolve(null));
        } catch (error) {
            resolve(null);
        }
    });
}

// Base64 and misc helpers (RN-safe)
function base64Decode(str) {
    try {
        // Convert base64 -> binary string -> UTF-8
        // escape/unescape is deprecated but works in RN environments for this use case
        // eslint-disable-next-line no-undef
        return decodeURIComponent(escape(atob(str)));
    } catch (e) {
        return '';
    }
}

function base64Encode(str) {
    try {
        // eslint-disable-next-line no-undef
        return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
        return '';
    }
}

function rot13(str) {
    return (str || '').replace(/[A-Za-z]/g, function (char) {
        var start = char <= 'Z' ? 65 : 97;
        return String.fromCharCode(((char.charCodeAt(0) - start + 13) % 26) + start);
    });
}

// Validate if a video URL is working (not 404 or broken)
function validateVideoUrl(url, timeout = 10000) {
    console.log(`[HubCloud] Validating URL: ${url.substring(0, 100)}...`);
    
    return fetch(url, {
        method: 'HEAD',
        headers: {
            'Range': 'bytes=0-1',
            'User-Agent': DEFAULT_HEADERS['User-Agent']
        },
        signal: AbortSignal.timeout(timeout)
    }).then(response => {
        if (response.ok || response.status === 206) {
            console.log(`[HubCloud] ✓ URL validation successful (${response.status})`);
            return true;
        } else {
            console.log(`[HubCloud] ✗ URL validation failed with status: ${response.status}`);
            return false;
        }
    }).catch(error => {
        console.log(`[HubCloud] ✗ URL validation failed: ${error.message}`);
        return false;
    });
}

// Resolve redirect link style used by 4KHDHub
function getRedirectLinks(url) {
    return makeRequest(url).then(function (res) { return res.text(); }).then(function (html) {
        var regex = /s\('o','([A-Za-z0-9+/=]+)'|ck\('_wp_http_\d+','([^']+)'/g;
        var combined = '';
        var m;
        while ((m = regex.exec(html)) !== null) {
            var val = m[1] || m[2];
            if (val) combined += val;
        }
        try {
            var decoded = base64Decode(rot13(base64Decode(base64Decode(combined))));
            var obj = JSON.parse(decoded);
            var encodedurl = base64Decode(obj.o || '').trim();
            var data = base64Decode(obj.data || '').trim();
            var blog = (obj.blog_url || '').trim();
            if (encodedurl) return encodedurl;
            if (blog && data) {
                return makeRequest(blog + '?re=' + data).then(function (r) { return r.text(); }).then(function (txt) { return (txt || '').trim(); }).catch(function () { return ''; });
            }
            return '';
        } catch (e) {
            return '';
        }
    }).catch(function () { return ''; });
}

// Resolve BuzzServer links
function resolveBuzzServer(buttonLink) {
    var baseOrigin = (function () { try { return new URL(buttonLink).origin; } catch (e) { return ''; } })();
    var dlUrl = buttonLink.replace(/\/?$/, '') + '/download';
    return fetch(dlUrl, { headers: { 'Referer': buttonLink, 'User-Agent': DEFAULT_HEADERS['User-Agent'] }, redirect: 'manual' })
        .then(function (res) {
            var hx = res.headers.get('hx-redirect') || res.headers.get('location');
            if (hx) return new URL(hx, baseOrigin).href;
            // Fallback: if manual redirect unsupported, use final response URL
            return res.url || buttonLink;
        }).catch(function () { return buttonLink; });
}

// Resolve 10Gbps links
function resolveTenGbps(initialLink, headerDetails, size, qualityLabel, quality) {
    var current = initialLink;
    var baseOrigin = (function () { try { return new URL(initialLink).origin; } catch (e) { return ''; } })();
    var maxHops = 6;
    function step() {
        return fetch(current, { redirect: 'manual', headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] } })
            .then(function (res) {
                var loc = res.headers.get('location');
                if (!loc) {
                    // Try current as final
                    return null;
                }
                if (loc.indexOf('id=') !== -1) {
                    var linkParam = (loc.split('link=')[1] || '').trim();
                    if (linkParam) {
                        try { linkParam = decodeURIComponent(linkParam); } catch (e) { /* ignore */ }
                        return linkParam;
                    }
                    return null;
                } else {
                    current = new URL(loc, baseOrigin).href;
                    return step();
                }
            });
    }
    return step().then(function (finalUrl) {
        if (!finalUrl) return null;
        return getFilenameFromUrl(finalUrl).then(function (actualFilename) {
            var displayFilename = actualFilename || headerDetails || 'Unknown';
            var titleParts = [];
            if (displayFilename) titleParts.push(displayFilename);
            if (size) titleParts.push(size);
            var finalTitle = titleParts.join('\n');
            return { name: 'HubCloud - 10Gbps Server' + qualityLabel, title: finalTitle, url: finalUrl, quality: quality, size: size };
        }).catch(function () {
            var displayFilename = headerDetails || 'Unknown';
            var titleParts = [];
            if (displayFilename) titleParts.push(displayFilename);
            if (size) titleParts.push(size);
            var finalTitle = titleParts.join('\n');
            return { name: 'HubCloud - 10Gbps Server' + qualityLabel, title: finalTitle, url: finalUrl, quality: quality, size: size };
        });
    }).catch(function () { return null; });
}

// Main HubCloud extraction function
function extractHubCloudLinks(url, referer = 'HubCloud', providerName = 'HubCloud') {
    const baseUrl = getBaseUrl(url);
    
    return makeRequest(url, { parseHTML: true })
        .then(response => {
            const $ = response.$;
            
            let href;
            if (url.includes('hubcloud.php')) {
                href = url;
            } else {
                const downloadElement = $('#download');
                if (downloadElement.length === 0) {
                    const alternatives = ['a[href*="hubcloud.php"]', '.download-btn', 'a[href*="download"]'];
                    let found = false;
                    
                    for (const selector of alternatives) {
                        const altElement = $(selector).first();
                        if (altElement.length > 0) {
                            const rawHref = altElement.attr('href');
                            if (rawHref) {
                                href = rawHref.startsWith('http') ? rawHref : `${baseUrl.replace(/\/$/, '')}/${rawHref.replace(/^\//, '')}`;
                                found = true;
                                break;
                            }
                        }
                    }
                    
                    if (!found) {
                        throw new Error('Download element not found with any selector');
                    }
                } else {
                    const rawHref = downloadElement.attr('href');
                    if (!rawHref) {
                        throw new Error('Download href not found');
                    }
                    
                    href = rawHref.startsWith('http') ? rawHref : `${baseUrl.replace(/\/$/, '')}/${rawHref.replace(/^\//, '')}`;
                }
            }
            
            return makeRequest(href, { parseHTML: true });
        })
        .then(response => {
            const $ = response.$;
            const results = [];
            
            const size = $('i#size').text() || '';
            const header = $('div.card-header').text() || '';
            const quality = getIndexQuality(header);
            const headerDetails = cleanTitle(header);
            
            const qualityLabel = quality ? ` - ${quality}p` : '';
            
            const downloadButtons = $('div.card-body h2 a.btn');
            
            const promises = downloadButtons.get().map((button, index) => {
                return new Promise((resolve) => {
                    const $button = $(button);
                    const link = $button.attr('href');
                    const text = $button.text();
                    
                    if (!link) {
                        resolve(null);
                        return;
                    }
                    
                    // Pixeldrain normalization
                    let convertedLink = link;
                    const pixeldrainMatch = link.match(/pixeldrain\.(?:net|dev)\/u\/([a-zA-Z0-9]+)/);
                    if (pixeldrainMatch) {
                        const fileId = pixeldrainMatch[1];
                        convertedLink = `https://pixeldrain.net/api/file/${fileId}`;
                    }
                    
                    if (text.includes('FSL Server')) {
                        getFilenameFromUrl(convertedLink)
                            .then(actualFilename => {
                                const displayFilename = actualFilename || headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `${providerName} - FSL Server${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality + 'p',
                                    size: size,
                                    type: 'direct'
                                });
                            })
                            .catch(() => {
                                const displayFilename = headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `${providerName} - FSL Server${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality + 'p',
                                    size: size,
                                    type: 'direct'
                                });
                            });
                    } else if (text.includes('Download File')) {
                        getFilenameFromUrl(convertedLink)
                            .then(actualFilename => {
                                const displayFilename = actualFilename || headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `${providerName} - HubCloud${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality + 'p',
                                    size: size,
                                    type: 'direct'
                                });
                            })
                            .catch(() => {
                                const displayFilename = headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `${providerName} - HubCloud${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality + 'p',
                                    size: size,
                                    type: 'direct'
                                });
                            });
                    } else if (text.includes('BuzzServer')) {
                        resolveBuzzServer(convertedLink).then(function (finalUrl) {
                            return getFilenameFromUrl(finalUrl).then(function (actualFilename) {
                                var displayFilename = actualFilename || headerDetails || 'Unknown';
                                var titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                var finalTitle = titleParts.join('\n');
                                resolve({ name: providerName + ' - BuzzServer' + qualityLabel, title: finalTitle, url: finalUrl, quality: quality + 'p', size: size, type: 'direct' });
                            }).catch(function () {
                                var displayFilename = headerDetails || 'Unknown';
                                var titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                var finalTitle = titleParts.join('\n');
                                resolve({ name: providerName + ' - BuzzServer' + qualityLabel, title: finalTitle, url: finalUrl, quality: quality + 'p', size: size, type: 'direct' });
                            });
                        }).catch(function () { resolve(null); });
                    } else if (text.includes('10Gbps')) {
                        resolveTenGbps(convertedLink, headerDetails, size, qualityLabel, quality + 'p').then(function (result) {
                            resolve(result);
                        }).catch(function () { resolve(null); });
                    } else if (link.includes('pixeldra')) {
                        getFilenameFromUrl(convertedLink)
                            .then(actualFilename => {
                                const displayFilename = actualFilename || headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `${providerName} - Pixeldrain${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality + 'p',
                                    size: size,
                                    type: 'direct'
                                });
                            })
                            .catch(() => {
                                const displayFilename = headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `${providerName} - Pixeldrain${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality + 'p',
                                    size: size,
                                    type: 'direct'
                                });
                            });
                    } else if (text.includes('S3 Server')) {
                        getFilenameFromUrl(convertedLink)
                            .then(actualFilename => {
                                const displayFilename = actualFilename || headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `${providerName} - S3 Server${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality + 'p',
                                    size: size,
                                    type: 'direct'
                                });
                            })
                            .catch(() => {
                                const displayFilename = headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `${providerName} - S3 Server${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality + 'p',
                                    size: size,
                                    type: 'direct'
                                });
                            });
                    } else {
                        getFilenameFromUrl(convertedLink)
                            .then(actualFilename => {
                                const displayFilename = actualFilename || headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `${providerName} - HubCloud${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality + 'p',
                                    size: size,
                                    type: 'direct'
                                });
                            })
                            .catch(() => {
                                const displayFilename = headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `${providerName} - HubCloud${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality + 'p',
                                    size: size,
                                    type: 'direct'
                                });
                            });
                    }
                });
            });
            
            return Promise.all(promises)
                .then(results => {
                    const validResults = results.filter(result => result !== null);
                    return validResults;
                });
        })
        .catch(error => {
            console.error(`[HubCloud] Extraction error for ${url}:`, error.message);
            return [];
        });
}

// Export for both Node.js and React Native
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        extractHubCloudLinks,
        getIndexQuality,
        cleanTitle,
        decodeFilename,
        getFilenameFromUrl,
        validateVideoUrl,
        getRedirectLinks,
        resolveBuzzServer,
        resolveTenGbps,
        makeRequest,
        base64Decode,
        base64Encode,
        rot13
    };
} else {
    global.extractHubCloudLinks = extractHubCloudLinks;
    global.getIndexQuality = getIndexQuality;
    global.cleanTitle = cleanTitle;
    global.decodeFilename = decodeFilename;
    global.getFilenameFromUrl = getFilenameFromUrl;
    global.validateVideoUrl = validateVideoUrl;
    global.getRedirectLinks = getRedirectLinks;
    global.resolveBuzzServer = resolveBuzzServer;
    global.resolveTenGbps = resolveTenGbps;
    global.makeRequest = makeRequest;
    global.base64Decode = base64Decode;
    global.base64Encode = base64Encode;
    global.rot13 = rot13;
}
