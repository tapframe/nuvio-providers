// HDHub4u - Full implementation (robust, RN-safe, Promise-based)
// Implements Hubdrive, Hubcdn, Hblinks, Hubstream, BuzzServer & 10Gbps redirect chasing
// Based on your Kotlin sources and previous JS patch.
// Requires: cheerio-without-node-native

const cheerio = require('cheerio-without-node-native');

const DEBUG = false;
function log(...args) { if (DEBUG) console.log('[HDHub4u]', ...args); }

// TMDB
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Domain fetch config
let MAIN_URL = "https://hdhub4u.frl";
const DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000;
let domainCacheTimestamp = 0;

const BASE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Cookie": "xla=s4t"
};

function makeHeaders(referer) {
    const h = Object.assign({}, BASE_HEADERS);
    if (referer) h.Referer = referer;
    return h;
}

// ---------------- Utilities ----------------
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return 'Unknown';
    const k = 1024;
    const sizes = ['Bytes','KB','MB','GB','TB'];
    const i = Math.floor(Math.log(bytes)/Math.log(k));
    return parseFloat((bytes/Math.pow(k,i)).toFixed(1)) + ' ' + sizes[i];
}

function extractServerName(source) {
    if (!source) return 'Unknown';
    if (source.startsWith('HubCloud')) {
        const m = source.match(/HubCloud(?:\s*-\s*([^[\]]+))?/);
        return m ? (m[1] || 'Download') : 'HubCloud';
    }
    if (source.startsWith('Pixeldrain')) return 'Pixeldrain';
    if (source.startsWith('StreamTape')) return 'StreamTape';
    if (source.startsWith('HubCdn')) return 'HubCdn';
    if (source.startsWith('HbLinks')) return 'HbLinks';
    if (source.startsWith('Hubstream')) return 'Hubstream';
    return source.replace(/^www\./,'').split('.')[0];
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function atobPoly(input) {
    try {
        if (!input) return '';
        let str = String(input).replace(/=+$/,'');
        let output='', bc=0, bs, buffer, idx=0;
        while ((buffer = str.charAt(idx++))) {
            buffer = BASE64_CHARS.indexOf(buffer);
            if (~buffer) {
                bs = bc % 4 ? bs*64 + buffer : buffer;
                if (bc++ % 4) {
                    output += String.fromCharCode(255 & (bs >> ((-2*bc)&6)));
                }
            }
        }
        return output;
    } catch (e) { return ''; }
}
function btoaPoly(value) {
    if (value == null) return '';
    let str = String(value), output='', i=0;
    while (i < str.length) {
        const chr1 = str.charCodeAt(i++), chr2 = str.charCodeAt(i++), chr3 = str.charCodeAt(i++);
        const enc1 = chr1 >> 2;
        const enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        let enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
        let enc4 = chr3 & 63;
        if (isNaN(chr2)) { enc3 = 64; enc4 = 64; }
        else if (isNaN(chr3)) { enc4 = 64; }
        output += BASE64_CHARS.charAt(enc1) + BASE64_CHARS.charAt(enc2) +
                  BASE64_CHARS.charAt(enc3) + BASE64_CHARS.charAt(enc4);
    }
    return output;
}
function rot13(value) {
    return (value || '').replace(/[a-zA-Z]/g, function(c){
        return String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26);
    });
}

function cleanTitle(title) {
    if (!title) return '';
    const parts = title.split(/[.\-_]/);
    const qualityTags = ["WEBRip","WEB-DL","WEB","BluRay","HDRip","DVDRip","HDTV","CAM","TS","R5","DVDScr","BRRip","BDRip","DVD","PDTV","HD"];
    const audioTags = ["AAC","AC3","DTS","MP3","FLAC","DD5","EAC3","Atmos"];
    const subTags = ["ESub","ESubs","Subs","MultiSub","NoSub","EnglishSub","HindiSub"];
    const codecTags = ["x264","x265","H264","HEVC","AVC"];
    const startIndex = parts.findIndex(part => qualityTags.some(tag => part.toLowerCase().includes(tag.toLowerCase())));
    const endIndex = parts.map((p,i)=>i).reverse().find(i =>
        subTags.some(tag => parts[i].toLowerCase().includes(tag.toLowerCase())) ||
        audioTags.some(tag => parts[i].toLowerCase().includes(tag.toLowerCase())) ||
        codecTags.some(tag => parts[i].toLowerCase().includes(tag.toLowerCase()))
    );
    if (startIndex !== -1 && endIndex !== undefined && endIndex >= startIndex) {
        return parts.slice(startIndex, endIndex+1).join('.');
    } else if (startIndex !== -1) {
        return parts.slice(startIndex).join('.');
    } else {
        return parts.slice(-3).join('.');
    }
}

function safeHostname(url) {
    if (!url) return '';
    try {
        const u = new URL(url);
        return u.hostname || '';
    } catch (e) {
        const m = url.match(/\/\/([^\/]+)/);
        return m ? m[1] : (url.indexOf('/') === -1 ? url : '');
    }
}

// ---------------- Domain updater ----------------
function fetchAndUpdateDomain() {
    const now = Date.now();
    if (now - domainCacheTimestamp < DOMAIN_CACHE_TTL) return Promise.resolve();
    log('Fetching domains...');
    return fetch(DOMAINS_URL, { method:'GET', headers: makeHeaders() })
    .then(r => {
        if (!r.ok) return;
        return r.json().then(data => {
            if (data && data.HDHUB4u) {
                const newDomain = data.HDHUB4u;
                if (newDomain && newDomain !== MAIN_URL) {
                    log('Domain update', MAIN_URL, '->', newDomain);
                    MAIN_URL = newDomain;
                    domainCacheTimestamp = now;
                }
            }
        }).catch(()=>{});
    }).catch(()=>{});
}
function getCurrentDomain() {
    return fetchAndUpdateDomain().then(()=>MAIN_URL);
}

// ---------------- Redirect decoder (Kotlin-accurate) ----------------
function getRedirectLinks(url) {
    if (!url) return Promise.resolve(url);
    return fetch(url, { headers: makeHeaders(MAIN_URL) })
    .then(r => r.text().catch(()=>null))
    .then(doc => {
        try {
            if (!doc) return url;
            const regex = /s\('o','([A-Za-z0-9+/=]+)'|ck\('_wp_http_\d+','([^']+)'/g;
            let combined = '', match;
            while ((match = regex.exec(doc)) !== null) {
                combined += (match[1] || match[2] || '');
            }
            if (!combined) return url;
            // replicate Kotlin: base64Decode(pen(base64Decode(base64Decode(combinedString))))
            // try robust decode with fallbacks
            let decoded = '';
            try {
                const stepA = atobPoly(atobPoly(combined));
                const stepB = rot13(atobPoly(atobPoly(combined)));
                decoded = atobPoly(stepB) || stepA || atobPoly(atobPoly(combined));
            } catch (e) {
                decoded = atobPoly(atobPoly(combined)) || '';
            }
            if (!decoded) return url;
            let json = null;
            try { json = JSON.parse(decoded); } catch (e) { return url; }
            const encodedUrl = atobPoly(json.o || '');
            if (encodedUrl) return encodedUrl.trim();
            const data = btoaPoly(json.data || '');
            const wpHttp = (json.blog_url || '').trim();
            if (wpHttp && data) {
                return fetch(wpHttp + '?re=' + data, { headers: makeHeaders(url) })
                    .then(rr => rr.text().catch(()=>url));
            }
            return url;
        } catch (e) {
            log('getRedirectLinks decode error', e && e.message);
            return url;
        }
    }).catch(e => {
        log('getRedirectLinks fetch error', e && e.message);
        return url;
    });
}

// ---------------- Extractors ----------------

// Pixeldrain - robust
function pixelDrainExtractor(link) {
    return Promise.resolve().then(function(){
        if (!link) return [{ source:'Pixeldrain', quality:'Unknown', url:link }];
        const match = link.match(/(?:file|u)\/([A-Za-z0-9]+)/);
        const fileId = match ? match[1] : link.split('/').pop();
        if (!fileId) return [{ source:'Pixeldrain', quality:'Unknown', url:link }];
        const infoUrl = 'https://pixeldrain.com/api/file/' + fileId + '/info';
        return fetch(infoUrl, { headers: makeHeaders(link) })
        .then(r => r.json().catch(()=>({})))
        .then(info => {
            const name = info && info.name ? info.name : '';
            const size = info && info.size ? info.size : 0;
            let quality = 'Unknown';
            if (name) {
                const m = name.match(/(\d{3,4})p/);
                if (m) quality = m[0];
            }
            const direct = 'https://pixeldrain.com/api/file/' + fileId + '?download';
            return [{ source:'Pixeldrain', quality: quality, url: direct, name: name, size: size }];
        }).catch(()=>[{ source:'Pixeldrain', quality:'Unknown', url:link }]);
    }).catch(()=>[{ source:'Pixeldrain', quality:'Unknown', url:link }]);
}

// Streamtape extraction
function streamTapeExtractor(link) {
    let normalized = link;
    try {
        const u = new URL(link);
        u.hostname = 'streamtape.com';
        normalized = u.toString();
    } catch (e) {}
    return fetch(normalized, { headers: makeHeaders(normalized) })
    .then(r => r.text())
    .then(data => {
        if (!data) return [];
        let m = data.match(/document\.getElementById\('videolink'\)\.innerHTML\s*=\s*(.*?);/);
        if (m && m[1]) {
            const s = m[1];
            const p = s.match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
            if (p && p[1]) return [{ source:'StreamTape', quality:'Stream', url:'https:' + p[1] }];
        }
        const simple = data.match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
        if (simple && simple[1]) return [{ source:'StreamTape', quality:'Stream', url:'https:' + simple[1] }];
        return [];
    }).catch(e => { log('streamTape error', e && e.message); return []; });
}

// Hubstream - try to extract video sources if present, else return URL
function hubStreamExtractor(url, referer) {
    if (!url) return Promise.resolve([]);
    return fetch(url, { headers: makeHeaders(referer) })
        .then(r => r.text())
        .then(data => {
            if (!data) return [{ source:'Hubstream', quality:'Unknown', url }];
            // try to find m3u8 or direct video src
            const m3 = data.match(/(https?:\/\/[^'"]+\.m3u8[^'"]*)/);
            if (m3 && m3[1]) return [{ source:'Hubstream', quality:'M3U8', url: m3[1] }];
            const video = data.match(/source\s+src=['"]([^'"]+)['"]/i) || data.match(/<video[^>]*>\s*<source[^>]*src=['"]([^'"]+)['"]/i);
            if (video && video[1]) return [{ source:'Hubstream', quality:'Stream', url: video[1] }];
            return [{ source:'Hubstream', quality:'Unknown', url }];
        })
        .catch(e => { log('[Hubstream] error', e && e.message); return [{ source:'Hubstream', quality:'Unknown', url }]; });
}

// Hubcdn - decode r=... base64 then find link=
function hubCdnExtractor(url, referer) {
    return fetch(url, { headers: makeHeaders(referer) })
        .then(r => r.text())
        .then(data => {
            if (!data) return [];
            const encodedMatch = data.match(/r=([A-Za-z0-9+/=]+)/);
            if (encodedMatch && encodedMatch[1]) {
                const decoded = atobPoly(encodedMatch[1]);
                const idx = decoded.lastIndexOf('link=');
                if (idx !== -1) {
                    const m3u8Link = decoded.substring(idx + 5);
                    return [{ source: 'HubCdn', quality: 'M3U8', url: m3u8Link }];
                }
            }
            // fallback: try scripts with reurl or var link
            const reurlMatch = data.match(/reurl\s*=\s*['"]([A-Za-z0-9+/=]+)['"]/i);
            if (reurlMatch && reurlMatch[1]) {
                const decoded = atobPoly(reurlMatch[1]);
                const linkIdx = decoded.lastIndexOf('link=');
                if (linkIdx !== -1) {
                    return [{ source: 'HubCdn', quality: 'M3U8', url: decoded.substring(linkIdx + 5) }];
                }
            }
            return [];
        })
        .catch(e => { log('[HubCdn] error', e && e.message); return []; });
}

// Hubdrive - grab specific button and either go to hubcloud or follow link
function hubDriveExtractor(url, referer) {
    return fetch(url, { headers: makeHeaders(referer) })
        .then(r => r.text())
        .then(html => {
            const $ = cheerio.load(html || '');
            const href = $('.btn.btn-primary.btn-user.btn-success1.m-1').attr('href') || $('a.btn-primary').attr('href') || null;
            if (!href) return [];
            // If href points to a hubcloud-like page, call hubCloudExtractor, else use loadExtractor
            const host = safeHostname(href).toLowerCase();
            if (host.includes('hubcloud')) return hubCloudExtractor(href, url);
            return loadExtractor(href, url);
        })
        .catch(e => { log('[HubDrive] error', e && e.message); return []; });
}

// Hblinks - collect many links and route them to appropriate extractors
function hbLinksExtractor(url, referer) {
    return fetch(url, { headers: makeHeaders(referer) })
        .then(r => r.text())
        .then(html => {
            const $ = cheerio.load(html || '');
            const anchors = [];
            // Gathering selectors as in Kotlin: h3 a, h5 a, div.entry-content p a
            $('h3 a, h5 a, div.entry-content p a').each(function(i, el){
                const href = $(el).attr('href');
                if (href) anchors.push(href);
            });
            // Also look in article content for other links
            $('a').each(function(i, el){
                const href = $(el).attr('href');
                if (href && href.includes('hub')) anchors.push(href);
            });
            // unique
            const uniq = Array.from(new Set(anchors));
            const promises = uniq.map(link => loadExtractor(link, url));
            return Promise.all(promises).then(results => [].concat.apply([], results));
        })
        .catch(e => { log('[HbLinks] error', e && e.message); return []; });
}

// Helper: chase redirects up to max and extract link= param if present (10Gbps style)
function chaseRedirectsForLink(initialUrl, maxAttempts = 5) {
    let current = initialUrl;
    let attempts = 0;
    function step() {
        return fetch(current, { method: 'GET', redirect: 'manual' })
            .then(resp => {
                attempts++;
                const loc = (resp && resp.headers && resp.headers.get) ? resp.headers.get('location') : null;
                if (!loc) return null;
                if (loc.includes('link=')) {
                    try {
                        return decodeURIComponent(loc.split('link=')[1]);
                    } catch (e) {
                        return loc;
                    }
                }
                if (attempts >= maxAttempts) return null;
                // resolve relative
                try { current = new URL(loc, current).toString(); } catch (e) { current = loc; }
                return step();
            })
            .catch(e => {
                log('chaseRedirectsForLink error', e && e.message);
                return null;
            });
    }
    return step();
}

// Generic load extractor dispatcher
function loadExtractor(url, referer = MAIN_URL) {
    if (!url) return Promise.resolve([]);
    const hostname = safeHostname(url).toLowerCase();

    // redirectors
    if (url.includes('?id=') || hostname.includes('techyboy4u')) {
        return getRedirectLinks(url)
            .then(finalLink => {
                if (!finalLink) return [];
                return loadExtractor(finalLink, url);
            });
    }

    if (hostname.includes('hubcloud')) return hubCloudExtractor(url, referer);
    if (hostname.includes('hubdrive')) return hubDriveExtractor(url, referer);
    if (hostname.includes('hubcdn')) return hubCdnExtractor(url, referer);
    if (hostname.includes('hblinks')) return hbLinksExtractor(url, referer);
    if (hostname.includes('hubstream')) return hubStreamExtractor(url, referer);
    if (hostname.includes('pixeldrain')) return pixelDrainExtractor(url);
    if (hostname.includes('streamtape')) return streamTapeExtractor(url);
    if (hostname.includes('hdstream4u')) return Promise.resolve([{ source: 'HdStream4u', quality: 'Unknown', url }]);
    if (hostname.includes('linkrit')) return Promise.resolve([]);
    return Promise.resolve([{ source: hostname.replace(/^www\./,''), quality: 'Unknown', url }]);
}

// HubCloud extractor - full: header, size, buttons, BuzzServer and 10Gbps handling (maps to Kotlin)
function hubCloudExtractor(url, referer) {
    if (!url) return Promise.resolve([]);
    // ensure domain swap if needed
    let currentUrl = url.replace('hubcloud.ink','hubcloud.dad');
    return fetch(currentUrl, { headers: makeHeaders(referer) })
        .then(pageResp => pageResp.text().catch(()=>'')) // first response
        .then(pageData => {
            // If the page contains a '#download' or a script var with a second URL, follow it (Kotlin behavior)
            if (!currentUrl.includes('hubcloud.php')) {
                const match = (pageData || '').match(/var url\s*=\s*'([^']+)'/);
                if (match && match[1]) {
                    // resolve relative
                    try { currentUrl = new URL(match[1], currentUrl).toString(); }
                    catch (e) { currentUrl = match[1]; }
                    // fetch the final page
                    return fetch(currentUrl, { headers: makeHeaders(url) }).then(r => r.text().catch(()=>'' )).then(secondData => ({ pageData: secondData, finalUrl: currentUrl }));
                }
            }
            return { pageData, finalUrl: currentUrl };
        })
        .then(({ pageData, finalUrl }) => {
            const $ = cheerio.load(pageData || '');
            const size = $('i#size').text().trim();
            const header = $('div.card-header').text().trim() || '';
            const getIndexQuality = (str) => {
                const m = (str || '').match(/(\d{3,4})[pP]/);
                return m ? parseInt(m[1]) : 2160;
            };
            const quality = getIndexQuality(header);
            const headerDetails = cleanTitle(header);
            const labelExtras = ((headerDetails ? '['+headerDetails+']' : '') + (size ? '['+size+']' : '')) || '';
            const sizeInBytes = (function(){
                if (!size) return 0;
                const mm = size.match(/([\d.]+)\s*(GB|MB|KB)/i);
                if (!mm) return 0;
                const v = parseFloat(mm[1]); const u = mm[2].toUpperCase();
                if (u === 'GB') return v * 1024 * 1024 * 1024;
                if (u === 'MB') return v * 1024 * 1024;
                if (u === 'KB') return v * 1024;
                return 0;
            })();

            const links = [];
            const promises = [];

            // iterate buttons (use robust selector)
            $('div.card-body').find('h2 a.btn, a.btn').each(function(i, el){
                const a = $(el);
                const link = a.attr('href');
                const text = (a.text() || '').trim();
                const fileName = header || headerDetails || 'Unknown';

                if (!link) return;

                if (text.includes('Download File')) {
                    links.push({ source: `HubCloud ${labelExtras}`, quality, url: link, size: sizeInBytes, fileName });
                    return;
                } else if (text.includes('FSL Server')) {
                    links.push({ source: `HubCloud - FSL Server ${labelExtras}`, quality, url: link, size: sizeInBytes, fileName });
                    return;
                } else if (text.includes('S3 Server')) {
                    links.push({ source: `HubCloud - S3 Server ${labelExtras}`, quality, url: link, size: sizeInBytes, fileName });
                    return;
                } else if (text.includes('BuzzServer')) {
                    // Kotlin: fetch `${link}/download` with allowRedirects=false, then inspect hx-redirect header or location.
                    const buzzDownload = (link.endsWith('/') ? link + 'download' : link + '/download');
                    promises.push(fetch(buzzDownload, { method: 'GET', headers: makeHeaders(link), redirect: 'manual' })
                        .then(buzzResp => {
                            const hx = buzzResp.headers && buzzResp.headers.get ? buzzResp.headers.get('hx-redirect') : null;
                            const loc = buzzResp.headers && buzzResp.headers.get ? buzzResp.headers.get('location') : null;
                            const chosen = hx || loc;
                            if (chosen) {
                                // if hx contains hx-redirect=..., try to extract param
                                try {
                                    if (chosen.indexOf('hx-redirect=') !== -1) {
                                        const m = chosen.match(/hx-redirect=([^&]+)/i);
                                        if (m && m[1]) {
                                            const dlink = decodeURIComponent(m[1]);
                                            links.push({ source: `HubCloud - BuzzServer ${labelExtras}`, quality, url: dlink, size: sizeInBytes, fileName });
                                            return;
                                        }
                                    }
                                    // otherwise just use chosen
                                    links.push({ source: `HubCloud - BuzzServer ${labelExtras}`, quality, url: chosen, size: sizeInBytes, fileName });
                                } catch (e) { log('BuzzServer parsing failed', e && e.message); }
                            } else {
                                // try follow the link normally and parse
                                return fetch(link, { headers: makeHeaders(finalUrl) }).then(rr => rr.text()).then(body => {
                                    // try to find m3u8 or direct link in body
                                    const m = (body || '').match(/(https?:\/\/[^'"]+\.m3u8[^'"]*)/);
                                    if (m && m[1]) links.push({ source: `HubCloud - BuzzServer ${labelExtras}`, quality, url: m[1], size: sizeInBytes, fileName });
                                }).catch(()=>{});
                            }
                        }).catch(e => { log('BuzzServer fetch error', e && e.message); }));
                    return;
                } else if (link.includes('pixeldra')) {
                    links.push({ source: `Pixeldrain ${labelExtras}`, quality, url: link, size: sizeInBytes, fileName });
                    return;
                } else if (text.includes('10Gbps') || link.includes('10gbps')) {
                    // chase redirects like Kotlin
                    promises.push(chaseRedirectsForLink(link, 5).then(finalLink => {
                        if (finalLink) links.push({ source: `HubCloud - 10Gbps ${labelExtras}`, quality, url: finalLink, size: sizeInBytes, fileName });
                    }));
                    return;
                } else {
                    // generic: try to extract with loadExtractor
                    promises.push(loadExtractor(link, finalUrl).then(extracted => {
                        extracted.forEach(e => links.push(e));
                    }).catch(()=>{}));
                }
            });

            // wait for any async promises (buzzserver redirects, 10gbps chase)
            return Promise.all(promises).then(() => {
                // dedupe by URL and filter zip
                const seen = new Set();
                const final = links.filter(l => {
                    if (!l || !l.url) return false;
                    if (l.url.includes('.zip') || (l.name && l.name.toLowerCase().includes('.zip'))) return false;
                    if (seen.has(l.url)) return false;
                    seen.add(l.url);
                    return true;
                });
                return final;
            });
        })
        .catch(e => { log('[HubCloud] error', e && e.message); return []; });
}

// ---------------- Search, TMDB helpers, matching ----------------
function normalizeTitle(t) {
    if (!t) return '';
    return t.toLowerCase().replace(/\b(the|a|an)\b/g,'').replace(/[:\-_]/g,' ').replace(/\s+/g,' ').replace(/[^\w\s]/g,'').trim();
}
function calculateTitleSimilarity(a,b) {
    const n1 = normalizeTitle(a), n2 = normalizeTitle(b);
    if (n1 === n2) return 1.0;
    if (n1.includes(n2) || n2.includes(n1)) return 0.9;
    const w1 = new Set(n1.split(/\s+/).filter(Boolean));
    const w2 = new Set(n2.split(/\s+/).filter(Boolean));
    if (w1.size === 0 || w2.size === 0) return 0;
    const inter = new Set([...w1].filter(x=>w2.has(x)));
    const union = new Set([...w1,...w2]);
    return inter.size / union.size;
}
function findBestTitleMatch(mediaInfo, searchResults, mediaType, season) {
    if (!searchResults || !searchResults.length) return null;
    let best=null, bestScore=0;
    for (let i=0;i<searchResults.length;i++){
        const r = searchResults[i];
        let score = calculateTitleSimilarity(mediaInfo.title, r.title || '');
        if (mediaInfo.year && r.year) {
            const diff = Math.abs(mediaInfo.year - r.year);
            if (diff===0) score += 0.2;
            else if (diff<=1) score += 0.1;
            else if (diff>5) score -= 0.3;
        }
        if (mediaType==='tv' && season) {
            const titleLower = (r.title||'').toLowerCase();
            const hasSeason = titleLower.includes('season ' + season) || titleLower.includes(' s' + season);
            if (hasSeason) score += 0.3; else score -= 0.2;
        }
        if ((r.title||'').toLowerCase().includes('2160p') || (r.title||'').toLowerCase().includes('4k')) score += 0.05;
        if (score > bestScore && score > 0.3) { bestScore = score; best = r; }
    }
    if (best) log('Best match:', best.title);
    return best;
}

function search(query) {
    return getCurrentDomain().then(function(domain){
        const searchUrl = domain + '/?s=' + encodeURIComponent(query);
        log('Searching', searchUrl);
        return fetch(searchUrl, { headers: makeHeaders(domain) })
        .then(r => r.text())
        .then(html => {
            const $ = cheerio.load(html || '');
            const out = [];
            $('.recent-movies li.thumb').each(function(i,el){
                try {
                    const el$ = $(el);
                    const title = el$.find('figcaption a p').first().text().trim() || el$.find('figcaption').text().trim();
                    const url = el$.find('figure a').attr('href') || el$.find('a').attr('href');
                    const poster = el$.find('img').attr('src') || el$.find('img').attr('data-src');
                    const yearMatch = title && title.match(/\((\d{4})\)|\b(\d{4})\b/);
                    const year = yearMatch ? parseInt(yearMatch[1] || yearMatch[2]) : null;
                    if (title && url) out.push({ title, url, poster, year });
                } catch(e){}
            });
            if (out.length === 0) {
                $('article').each(function(i,el){
                    try {
                        const t = $(el).find('h2 a').text().trim();
                        const u = $(el).find('h2 a').attr('href');
                        if (t && u) out.push({ title: t, url: u, poster: null, year: null });
                    } catch(e){}
                });
            }
            return out;
        });
    });
}

function getTMDBDetails(tmdbId, mediaType) {
    if (!tmdbId) return Promise.resolve(null);
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = TMDB_BASE_URL + '/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids';
    return fetch(url, { headers: makeHeaders() })
    .then(r => { if (!r.ok) throw new Error('TMDB error ' + r.status); return r.json(); })
    .then(data => {
        const title = mediaType === 'tv' ? data.name : data.title;
        const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
        const year = releaseDate ? parseInt(releaseDate.split('-')[0]) : null;
        return { title: title, year: year, imdbId: data.external_ids && data.external_ids.imdb_id || null };
    })
    .catch(e => { log('TMDB fetch failed', e && e.message); return null; });
}

// convert quality values to label
function normalizeQuality(q) {
    if (!q) return { num: 0, label: 'Unknown' };
    if (typeof q === 'number') {
        const n = q;
        if (n >= 2160) return { num: 2160, label: '4K' };
        if (n >= 1440) return { num: 1440, label: '1440p' };
        if (n >= 1080) return { num:1080, label:'1080p' };
        if (n >= 720) return { num:720, label:'720p' };
        if (n >= 480) return { num:480, label:'480p' };
        return { num:360, label:'360p' };
    }
    const m = (''+q).match(/(\d{3,4})/);
    if (m) return normalizeQuality(parseInt(m[1]));
    return { num:0, label: String(q||'Unknown') };
}

// getDownloadLinks - handles movie and TV flows, uses all extractors above
function getDownloadLinks(mediaUrl) {
    if (!mediaUrl) return Promise.resolve({ finalLinks: [], isMovie: true });
    return getCurrentDomain()
    .then(function(domain){
        return fetch(mediaUrl, { headers: makeHeaders(domain) });
    })
    .then(r => r.text())
    .then(html => {
        const $ = cheerio.load(html || '');
        const typeRaw = $('h1.page-title span').text() || '';
        const isMovie = typeRaw.toLowerCase().includes('movie');
        const title = $('.page-body h2').first().text() || $('h1').first().text() || '';
        const seasonMatch = title.match(/\bSeason\s*(\d+)\b/i);
        const seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : null;

        let initialLinks = [];

        if (isMovie) {
            $('h3 a, h4 a').each(function(i,el){
                const t = $(el).text() || '';
                const href = $(el).attr('href');
                if (href && t.match(/480|720|1080|2160|4K/i)) {
                    initialLinks.push({ url: href });
                }
            });
            initialLinks = initialLinks.filter((v,i,self)=> self.findIndex(x=>x.url===v.url)===i);
            const promises = initialLinks.map(li => loadExtractor(li.url, mediaUrl).catch(()=>[]));
            return Promise.all(promises).then(results => {
                const all = [].concat.apply([], results);
                const seen = new Set();
                const unique = all.filter(l => {
                    if (!l.url) return false;
                    if (l.url.includes('.zip') || (l.name && l.name.toLowerCase().includes('.zip'))) return false;
                    if (seen.has(l.url)) return false;
                    seen.add(l.url);
                    return true;
                });
                return { finalLinks: unique, isMovie: true };
            });
        } else {
            const episodeLinksMap = new Map();
            $('h4').each(function(i,el){
                const text = $(el).text() || '';
                const epMatch = text.match(/(?:EPiSODE\s*(\d+)|E(\d+))/i);
                if (epMatch) {
                    const epNum = parseInt(epMatch[1] || epMatch[2]);
                    if (!episodeLinksMap.has(epNum)) episodeLinksMap.set(epNum, []);
                    const links = $(el).find('a').map(function(i,a){ return $(a).attr('href'); }).get().filter(Boolean);
                    episodeLinksMap.set(epNum, episodeLinksMap.get(epNum).concat(links));
                }
            });

            if (episodeLinksMap.size === 0) {
                $('h3, h4').each(function(i,el){
                    const $el = $(el);
                    const titleText = $el.text() || '';
                    const epMatch = titleText.match(/(?:EPiSODE\s*(\d+)|E(\d+))/i);
                    const epNum = epMatch ? parseInt(epMatch[1] || epMatch[2]) : null;
                    const links = $el.find('a').map(function(i,a){ return $(a).attr('href'); }).get().filter(Boolean);
                    if (links.length && epNum) {
                        if (!episodeLinksMap.has(epNum)) episodeLinksMap.set(epNum, []);
                        episodeLinksMap.set(epNum, episodeLinksMap.get(epNum).concat(links));
                    }
                });
            }

            episodeLinksMap.forEach(function(links, epNum){
                const uniq = Array.from(new Set(links));
                uniq.forEach(function(u){ initialLinks.push({ url: u, episode: epNum }); });
            });

            const promises = initialLinks.map(function(linkInfo){
                if (linkInfo.url && linkInfo.url.includes('techyboy4u')) {
                    return getRedirectLinks(linkInfo.url)
                        .then(resolved => {
                            if (!resolved) return [];
                            return fetch(resolved, { headers: makeHeaders(linkInfo.url) })
                                .then(r => r.text())
                                .then(page => {
                                    const $$ = cheerio.load(page || '');
                                    const episodeLinks = [];
                                    $$('h5 a').each(function(i, linkEl){
                                        const linkText = $$(linkEl).text();
                                        const linkHref = $$(linkEl).attr('href');
                                        const episodeMatch = linkText.match(/Episode\s*(\d+)/i);
                                        if (episodeMatch && linkHref) {
                                            episodeLinks.push({ url: linkHref, episode: parseInt(episodeMatch[1]) });
                                        }
                                    });
                                    const episodePromises = episodeLinks.map(epLink =>
                                        loadExtractor(epLink.url, resolved).then(ex => ex.map(f => { f.episode = epLink.episode; return f; })).catch(()=>[])
                                    );
                                    return Promise.all(episodePromises).then(res => [].concat.apply([], res));
                                }).catch(()=>[]);
                        }).catch(()=>[]);
                } else {
                    return loadExtractor(linkInfo.url, mediaUrl).then(extracted => extracted.map(f => { f.episode = linkInfo.episode; return f; })).catch(()=>[]);
                }
            });

            return Promise.all(promises).then(results => {
                const all = [].concat.apply([], results);
                const seen = new Set();
                const unique = all.filter(link => {
                    if (!link.url) return false;
                    if (link.url.includes('.zip') || (link.name && link.name.toLowerCase().includes('.zip'))) return false;
                    if (seen.has(link.url)) return false;
                    seen.add(link.url);
                    return true;
                });
                return { finalLinks: unique, isMovie: false };
            });
        }
    }).catch(e => { log('getDownloadLinks error', e && e.message); return { finalLinks: [], isMovie: true }; });
}

// ---------------- Main: getStreams ----------------
function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    log('getStreams', tmdbId, mediaType, season, episode);
    return getTMDBDetails(tmdbId, mediaType).then(function(mediaInfo){
        if (!mediaInfo || !mediaInfo.title) return [];
        const searchQuery = (mediaType === 'tv' && season) ? (mediaInfo.title + ' season ' + season) : mediaInfo.title;
        return search(searchQuery).then(function(searchResults){
            if (!searchResults || searchResults.length === 0) return [];
            const bestMatch = findBestTitleMatch(mediaInfo, searchResults, mediaType, season);
            const selected = bestMatch || searchResults[0];
            return getDownloadLinks(selected.url).then(function(result){
                const { finalLinks } = result;
                let filtered = finalLinks;
                if (mediaType === 'tv' && episode != null) {
                    filtered = finalLinks.filter(l => l.episode === episode);
                }
                const streams = filtered.map(link => {
                    const q = normalizeQuality(link.quality);
                    const mediaTitle = link.fileName && link.fileName !== 'Unknown' ? link.fileName : (mediaInfo.title + (mediaInfo.year ? ' ('+mediaInfo.year+')' : ''));
                    return {
                        name: 'HDHub4u ' + extractServerName(link.source || ''),
                        title: mediaTitle,
                        url: link.url,
                        quality: q.label,
                        size: link.size ? formatBytes(link.size) : 'Unknown',
                        headers: makeHeaders(MAIN_URL),
                        provider: 'hdhub4u'
                    };
                }).filter(s => s && s.url);
                const order = {'4K':4,'2160p':4,'1440p':3,'1080p':2,'720p':1,'480p':0,'360p':-1,'Unknown':-2};
                streams.sort((a,b) => (order[b.quality] || -3) - (order[a.quality] || -3));
                log('streams count', streams.length);
                return streams;
            });
        });
    }).catch(e => { log('getStreams error', e && e.message); return []; });
}

// exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.HDHub4uScraperModule = { getStreams };
}
