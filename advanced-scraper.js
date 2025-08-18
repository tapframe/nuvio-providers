const https = require('https');
const http = require('http');
const { URL } = require('url');
const cheerio = require('cheerio');

// === HubCloud Extractor Functions (embedded) ===

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
        const isHttps = urlObj.protocol === 'https:';
        const httpModule = isHttps ? https : http;
        
        const requestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                ...options.headers
            },
            timeout: 30000
        };
        
        const req = httpModule.request(requestOptions, (res) => {
            if (options.allowRedirects === false && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308)) {
                resolve({ statusCode: res.statusCode, headers: res.headers });
                return;
            }
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (options.parseHTML && data) {
                    const $ = cheerio.load(data);
                    resolve({ $: $, body: data, statusCode: res.statusCode, headers: res.headers });
                } else {
                    resolve({ body: data, statusCode: res.statusCode, headers: res.headers });
                }
            });
        });
        
        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Request timeout')));
        req.end();
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
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const httpModule = isHttps ? https : http;
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'HEAD',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 10000
            };
            
            const req = httpModule.request(requestOptions, (res) => {
                const contentDisposition = res.headers['content-disposition'];
                let filename = null;
                
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i);
                    if (filenameMatch && filenameMatch[1]) {
                        filename = filenameMatch[1].replace(/["']/g, '');
                    }
                }
                
                if (!filename) {
                    const pathParts = urlObj.pathname.split('/');
                    filename = pathParts[pathParts.length - 1];
                    if (filename && filename.includes('.')) {
                        filename = filename.replace(/\.[^.]+$/, '');
                    }
                }
                
                const decodedFilename = decodeFilename(filename);
                resolve(decodedFilename || null);
            });
            
            req.on('error', () => resolve(null));
            req.on('timeout', () => resolve(null));
            req.end();
        } catch (error) {
            resolve(null);
        }
    });
}

function extractHubCloudLinks(url, referer = 'HubCloud') {
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
                    
                    if (text.includes('FSL Server')) {
                        getFilenameFromUrl(link)
                            .then(actualFilename => {
                                const displayFilename = actualFilename || headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `HubCloud - FSL Server${qualityLabel}`,
                                    title: finalTitle,
                                    url: link,
                                    quality: quality
                                });
                            })
                            .catch(() => {
                                const displayFilename = headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `HubCloud - FSL Server${qualityLabel}`,
                                    title: finalTitle,
                                    url: link,
                                    quality: quality
                                });
                            });
                    } else if (text.includes('Download File')) {
                        getFilenameFromUrl(link)
                            .then(actualFilename => {
                                const displayFilename = actualFilename || headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `HubCloud - HubCloud${qualityLabel}`,
                                    title: finalTitle,
                                    url: link,
                                    quality: quality
                                });
                            })
                            .catch(() => {
                                const displayFilename = headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `HubCloud - HubCloud${qualityLabel}`,
                                    title: finalTitle,
                                    url: link,
                                    quality: quality
                                });
                            });
                    } else if (link.includes('pixeldra')) {
                        let convertedLink = link;
                        const pixeldrainMatch = link.match(/pixeldrain\.net\/u\/([a-zA-Z0-9]+)/);
                        if (pixeldrainMatch) {
                            const fileId = pixeldrainMatch[1];
                            convertedLink = `https://pixeldrain.net/api/file/${fileId}`;
                        }
                        
                        getFilenameFromUrl(convertedLink)
                            .then(actualFilename => {
                                const displayFilename = actualFilename || headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `HubCloud - Pixeldrain${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality
                                });
                            })
                            .catch(() => {
                                const displayFilename = headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `HubCloud - Pixeldrain${qualityLabel}`,
                                    title: finalTitle,
                                    url: convertedLink,
                                    quality: quality
                                });
                            });
                    } else if (text.includes('S3 Server')) {
                        getFilenameFromUrl(link)
                            .then(actualFilename => {
                                const displayFilename = actualFilename || headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `HubCloud - S3 Server${qualityLabel}`,
                                    title: finalTitle,
                                    url: link,
                                    quality: quality
                                });
                            })
                            .catch(() => {
                                const displayFilename = headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `HubCloud - S3 Server${qualityLabel}`,
                                    title: finalTitle,
                                    url: link,
                                    quality: quality
                                });
                            });
                    } else {
                        getFilenameFromUrl(link)
                            .then(actualFilename => {
                                const displayFilename = actualFilename || headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `HubCloud - HubCloud${qualityLabel}`,
                                    title: finalTitle,
                                    url: link,
                                    quality: quality
                                });
                            })
                            .catch(() => {
                                const displayFilename = headerDetails || 'Unknown';
                                const titleParts = [];
                                if (displayFilename) titleParts.push(displayFilename);
                                if (size) titleParts.push(size);
                                const finalTitle = titleParts.join('\n');
                                
                                resolve({
                                    name: `HubCloud - HubCloud${qualityLabel}`,
                                    title: finalTitle,
                                    url: link,
                                    quality: quality
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
            console.error(`[HubCloud] HubCloud extraction error for ${url}:`, error.message);
            return [];
        });
}

// === End of HubCloud Extractor Functions ===

// Promisified function to perform an HTTPS GET request
function getHtml(urlString) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };
        https.get(urlString, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, urlString).href;
                resolve(getHtml(redirectUrl)); // Recursively follow redirect
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to load page, status code: ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => reject(err));
    });
}

// Main scraping function
async function scrape(movieName) {
    if (!movieName) {
        console.error('Usage: node advanced-scraper.js "Movie Name"');
        return;
    }

    try {
        const baseUrl = 'https://dvdplay.forum';
        const searchUrl = `${baseUrl}/search.php?q=${encodeURIComponent(movieName)}`;
        console.log(`Searching for "${movieName}" at ${searchUrl}`);

        const searchHtml = await getHtml(searchUrl);

        const moviePageRegex = /<a href="([^"]+)"><p class="home">/;
        const movieMatch = searchHtml.match(moviePageRegex);
        if (!movieMatch || !movieMatch[1]) {
            console.error(`Could not find a movie page for "${movieName}".`);
            return;
        }

        const moviePageUrl = new URL(movieMatch[1], baseUrl).href;
        console.log(`Found movie page: ${moviePageUrl}`);

        const movieHtml = await getHtml(moviePageUrl);

        console.log('\n--- Found Download Pages ---');
        const downloadPageLinks = [];
        const htmlChunks = movieHtml.split('<div align="center">');

        for (const chunk of htmlChunks) {
            if (chunk.includes('<a class="touch"')) {
                const hrefMatch = chunk.match(/href="(\/download\/file\/[^"]+)"/);
                if (hrefMatch) {
                    const fullLink = new URL(hrefMatch[1], baseUrl).href;
                    downloadPageLinks.push(fullLink);
                    console.log(`- ${fullLink}`);
                }
            }
        }

        if (downloadPageLinks.length === 0) {
            console.log('No download pages found.');
            return;
        }

        console.log('\n--- Extracting Final Links (this may take a moment)... ---');
        
        // Fetch all download pages in parallel and extract HubCloud URLs from each
        const hubCloudUrlPromises = downloadPageLinks.map(pageLink =>
            getHtml(pageLink).then(downloadPageHtml => {
                const hubCloudUrls = [];
                const hubCloudRegex = /<a href="(https?:\/\/hubcloud\.one[^"]+)"/g;
                let hubCloudMatch;
                while ((hubCloudMatch = hubCloudRegex.exec(downloadPageHtml)) !== null) {
                    hubCloudUrls.push(hubCloudMatch[1]);
                }
                return hubCloudUrls;
            }).catch(err => {
                console.error(`Failed to fetch or parse download page ${pageLink}: ${err.message}`);
                return []; // Return empty array on error to avoid breaking Promise.all
            })
        );

        const nestedHubCloudUrls = await Promise.all(hubCloudUrlPromises);
        const allHubCloudUrls = nestedHubCloudUrls.flat();

        console.log(`Found ${allHubCloudUrls.length} HubCloud links to process.`);

        // Extract final links from all HubCloud URLs in parallel
        const finalLinkPromises = allHubCloudUrls.map(hubCloudUrl => {
            console.log(`Processing HubCloud link: ${hubCloudUrl}`);
            return extractHubCloudLinks(hubCloudUrl).catch(err => {
                console.error(`Failed to extract from ${hubCloudUrl}: ${err.message}`);
                return []; // Return empty on error to avoid breaking Promise.all
            });
        });

        let allFinalLinks = (await Promise.all(finalLinkPromises)).flat();

        // Filter out unwanted links (e.g., Google AMP links)
        allFinalLinks = allFinalLinks.filter(link => !link.url.includes('cdn.ampproject.org'));

        // Remove duplicates based on URL
        const uniqueLinks = Array.from(new Map(allFinalLinks.map(link => [link.url, link])).values());

        // Sort by quality (descending)
        uniqueLinks.sort((a, b) => (b.quality || 0) - (a.quality || 0));

        if (uniqueLinks.length > 0) {
            console.log('\n--- Sorted Final Streaming Links ---');
            uniqueLinks.forEach(link => {
                console.log(`- [${link.quality || 'N/A'}p] ${link.name}: ${link.url}`);
            });
        } else {
            console.log('\nNo final streaming links were found.');
        }

    } catch (error) {
        console.error('An error occurred during scraping:', error.message);
    }
}

// --- Script Entry Point ---
const movieNameToSearch = process.argv[2];
scrape(movieNameToSearch);
