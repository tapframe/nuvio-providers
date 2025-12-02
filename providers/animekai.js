// AnimeKai Scraper for Nuvio Local Scrapers
// FIXED VERSION: Movies+TV, Subtitles (Type/Title Fix), Cloudflare Bypass

// TMDB API Configuration
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// CONFIGURATION
const BASE_DOMAIN = 'https://anikai.to'; 

// CRITICAL HEADERS: Mobile UA + Referer required for access
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36',
    'Referer': BASE_DOMAIN + '/',
    'Origin': BASE_DOMAIN,
    'Connection': 'keep-alive'
};

const API = 'https://enc-dec.app/api';
const KAI_AJAX = BASE_DOMAIN + '/ajax';

// Kitsu API (for better title mapping)
const KITSU_BASE_URL = 'https://kitsu.io/api/edge';
const KITSU_HEADERS = {
    'Accept': 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json'
};

// --- Helpers ---

function fetchRequest(url, options) {
    const merged = Object.assign({ method: 'GET', headers: HEADERS }, options || {});
    return fetch(url, merged).then(function(response) {
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + response.statusText);
        }
        return response;
    });
}

// Helper to determine subtitle type for Nuvio player
function getSubType(url) {
    if (url.indexOf('.srt') !== -1) return 'srt';
    return 'vtt'; // Default to vtt as it's most common on web
}

// --- Encryption/Decryption Middleware ---

function encryptKai(text) {
    return fetchRequest(API + '/enc-kai?text=' + encodeURIComponent(text))
        .then(function(res) { return res.json(); })
        .then(function(json) { return json.result; });
}

function decryptKai(text) {
    return fetchRequest(API + '/dec-kai', {
        method: 'POST',
        headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: text })
    })
        .then(function(res) { return res.json(); })
        .then(function(json) { return json.result; });
}

function parseHtmlViaApi(html) {
    return fetchRequest(API + '/parse-html', {
        method: 'POST',
        headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: html })
    }).then(function(res) { return res.json(); })
      .then(function(json) { return json.result; });
}

// FIX: Improved MegaUp logic with Loosened Subtitle Filter & Title/Type properties
function decryptMegaMedia(embedUrl) {
    var mediaUrl;
    if (embedUrl.indexOf('/e/') !== -1) {
        mediaUrl = embedUrl.replace('/e/', '/media/');
    } else {
        mediaUrl = embedUrl + (embedUrl.indexOf('?') === -1 ? '?' : '&') + 'mode=media';
    }

    return fetchRequest(mediaUrl)
        .then(function(res) { return res.json(); })
        .then(function(mediaResp) { return mediaResp.result; })
        .then(function(encrypted) {
            return fetchRequest(API + '/dec-mega', {
                method: 'POST',
                headers: Object.assign({}, HEADERS, { 'Content-Type': 'application/json' }),
                body: JSON.stringify({ text: encrypted, agent: HEADERS['User-Agent'] })
            }).then(function(res) { return res.json(); });
        })
        .then(function(json) {
            var result = json.result;
            
            // Extract sources
            var srcs = [];
            if (result && result.sources) {
                for (var i = 0; i < result.sources.length; i++) {
                    var s = result.sources[i];
                    srcs.push({ 
                        url: s.file, 
                        quality: extractQualityFromUrl(s.file) 
                    });
                }
            }

            // FILTER SUBTITLES
            // Fixes: 
            // 1. Accepts 'subtitles' OR 'captions' (Loosened filter)
            // 2. Adds 'title' property for Nuvio UI
            // 3. Adds 'type' property (vtt/srt)
            var subs = [];
            if (result && result.tracks) {
                subs = result.tracks
                    .filter(function(t) { 
                        return (t.kind === 'captions' || t.kind === 'subtitles');
                    })
                    .map(function(t) {
                        var label = t.label || 'English';
                        return { 
                            title: label,       // Display Name
                            language: label,    // Lang code/name
                            url: t.file, 
                            type: getSubType(t.file) // vtt or srt
                        };
                    });
            }
            
            return { streams: srcs, subtitles: subs };
        });
}

// Debug helpers
function createRequestId() {
    try {
        var rand = Math.random().toString(36).slice(2, 8);
        return rand;
    } catch (e) { return String(Date.now()); }
}

function logRid(rid, msg, extra) {
    try {
        if (typeof extra !== 'undefined') console.log('[AnimeKai][rid:' + rid + '] ' + msg, extra);
        else console.log('[AnimeKai][rid:' + rid + '] ' + msg);
    } catch(e) {}
}

// --- Search Logic (Movies + TV) ---

function searchKitsu(animeTitle) {
    const searchUrl = KITSU_BASE_URL + '/anime?filter[text]=' + encodeURIComponent(animeTitle);
    return fetchRequest(searchUrl, { headers: KITSU_HEADERS })
        .then(function(res) { return res.json(); })
        .then(function(response) {
            var results = response.data || [];
            var normalizedQuery = animeTitle.toLowerCase().replace(/[^\w\s]/g, '').trim();
            return results.filter(function(entry) {
                var canonical = (entry.attributes.canonicalTitle || '').toLowerCase().replace(/[^\w\s]/g, '');
                var english = (entry.attributes.titles && entry.attributes.titles.en || '').toLowerCase().replace(/[^\w\s]/g, '');
                return canonical.includes(normalizedQuery) || english.includes(normalizedQuery) || normalizedQuery.includes(canonical);
            });
        });
}

function searchAnimeByName(animeName, type) {
    var searchUrl = BASE_DOMAIN + '/browser?keyword=' + encodeURIComponent(animeName);
    
    // Add Kotlin-style filter
    if (type === 'movie') {
        searchUrl += '&type[]=movie';
    } else {
        searchUrl += '&type[]=tv';
    }

    return fetchRequest(searchUrl)
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var results = [];
            var pattern = /href="(\/watch\/[^\"]*)"[^>]*>[\s\S]*?<a[^>]*class="[^"]*title[^"]*"[^>]*>([^<]*)<\/a>/g;
            var m;
            while ((m = pattern.exec(html)) !== null) {
                var href = m[1];
                var title = (m[2] || '').trim();
                if (href && title) {
                    results.push({
                        title: title,
                        url: (href.indexOf('http') === 0 ? href : BASE_DOMAIN + href),
                        type: type || 'tv'
                    });
                }
            }
            return results;
        });
}

function getAccurateAnimeKaiEntry(animeTitle, season, episode, tmdbId, type) {
    return searchKitsu(animeTitle).then(function(kitsuResults) {
        if (kitsuResults && kitsuResults.length > 0) {
            var kitsuEntry = kitsuResults[0];
            var kitsuTitle = kitsuEntry.attributes.titles && kitsuEntry.attributes.titles.en ||
                            kitsuEntry.attributes.canonicalTitle;
            return searchAnimeByName(kitsuTitle, type).then(function(animeKaiResults) {
                return pickResult(animeKaiResults, type, season, tmdbId);
            });
        }
        return searchAnimeByName(animeTitle, type).then(function(results) {
            return pickResult(results, type, season, tmdbId);
        });
    }).catch(function() {
        return searchAnimeByName(animeTitle, type).then(function(results) {
            return pickResult(results, type, season, tmdbId);
        });
    });
}

function pickResult(results, mediaType, season, tmdbId) {
    if (!results || results.length === 0) return Promise.resolve(null);
    
    // For movies, accept first match
    if (mediaType === 'movie') {
        return Promise.resolve(results[0]);
    }

    // TV Season Logic
    if (!season || !Number.isFinite(season)) return Promise.resolve(results[0]);

    var seasonStr = String(season);
    var candidates = [];

    // Title match
    for (var i = 0; i < results.length; i++) {
        var r = results[i];
        var t = (r.title || '').toLowerCase();
        if (t.indexOf('season ' + seasonStr) !== -1 || t.indexOf('s' + seasonStr) !== -1) {
            candidates.push({ r: r, score: 3 });
        }
    }

    // URL match
    for (var j = 0; j < results.length; j++) {
        var r2 = results[j];
        var u = (r2.url || '').toLowerCase();
        if (u.indexOf('season-' + seasonStr) !== -1 || u.indexOf('-s' + seasonStr) !== -1) {
            candidates.push({ r: r2, score: 2 });
        }
    }

    if (tmdbId && season > 1) {
        return getTMDBSeasonInfo(tmdbId, season).then(function(seasonInfo) {
            if (candidates.length > 0) return candidates.sort(function(a,b){ return b.score - a.score; })[0].r;
            return results[0];
        }).catch(function() {
             if (candidates.length > 0) return candidates.sort(function(a,b){ return b.score - a.score; })[0].r;
             return results[0];
        });
    }

    return Promise.resolve(candidates.length > 0 ? candidates.sort(function(a,b){ return b.score - a.score; })[0].r : results[0]);
}

// --- Quality & M3U8 Logic (With M3U8 Subtitle Extraction) ---

function extractQualityFromUrl(url) {
    var patterns = [
        /(\d{3,4})p/i, /(\d{3,4})k/i, /quality[_-]?(\d{3,4})/i,
        /res[_-]?(\d{3,4})/i, /(\d{3,4})x\d{3,4}/i
    ];
    for (var i = 0; i < patterns.length; i++) {
        var m = url.match(patterns[i]);
        if (m) {
            var q = parseInt(m[1]);
            if (q >= 240 && q <= 4320) return q + 'p';
        }
    }
    return 'Unknown';
}

function resolveUrlRelative(url, baseUrl) {
    if (url.indexOf('http') === 0) return url;
    try { return new URL(url, baseUrl).toString(); } catch (e) { return url; }
}

// FIX: Extracts BOTH streams and subtitles from master playlist
function resolveM3U8(url, serverType) {
    return fetchRequest(url, { headers: Object.assign({}, HEADERS, { 'Accept': '*/*' }) })
        .then(function(res) { return res.text(); })
        .then(function(content) {
            var streams = [];
            var subtitles = [];

            if (content.indexOf('#EXT-X-STREAM-INF') !== -1 || content.indexOf('#EXT-X-MEDIA') !== -1) {
                var lines = content.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    
                    // 1. Video Streams
                    if (line.indexOf('#EXT-X-STREAM-INF') === 0 && lines[i+1]) {
                        var resMatch = line.match(/RESOLUTION=\d+x(\d+)/);
                        var bwMatch = line.match(/BANDWIDTH=(\d+)/);
                        var q = 'Unknown';
                        
                        if (resMatch) q = resMatch[1] + 'p';
                        else if (bwMatch) {
                            var mbps = parseInt(bwMatch[1]) / 1000000;
                            if (mbps >= 4) q = '1080p';
                            else if (mbps >= 2.5) q = '720p';
                            else if (mbps >= 1) q = '480p';
                            else q = '360p';
                        }

                        var u = lines[i+1].trim();
                        if (u && u.indexOf('#') !== 0) {
                            if (u.indexOf('http') !== 0) u = resolveUrlRelative(u, url);
                            streams.push({ url: u, quality: q, serverType: serverType });
                        }
                    }
                    
                    // 2. Subtitles inside M3U8
                    // Regex scan for URI, NAME, LANGUAGE
                    if (line.indexOf('#EXT-X-MEDIA:TYPE=SUBTITLES') === 0) {
                        var uriMatch = line.match(/URI="([^"]+)"/);
                        var nameMatch = line.match(/NAME="([^"]+)"/);
                        var langMatch = line.match(/LANGUAGE="([^"]+)"/);
                        
                        if (uriMatch) {
                            var subUrl = resolveUrlRelative(uriMatch[1], url);
                            var label = (nameMatch ? nameMatch[1] : null) || (langMatch ? langMatch[1] : 'Unknown');
                            
                            subtitles.push({
                                url: subUrl,
                                title: label,    // Added title
                                language: label,
                                type: getSubType(subUrl) // Added type
                            });
                        }
                    }
                }
                return { success: true, streams: streams, subtitles: subtitles };
            }
            
            // Fallback for simple m3u8
            return { success: true, streams: [{ url: url, quality: 'Unknown', serverType: serverType }], subtitles: [] };
        })
        .catch(function(){ return { success: false, streams: [{ url: url, quality: 'Unknown', serverType: serverType }], subtitles: [] }; });
}

function resolveMultipleM3U8(m3u8Links) {
    var promises = m3u8Links.map(function(link){ return resolveM3U8(link.url, link.serverType); });
    return Promise.allSettled(promises).then(function(results){
        var outStreams = [];
        var outSubs = [];
        for (var i = 0; i < results.length; i++) {
            if (results[i].status === 'fulfilled' && results[i].value) {
                if (results[i].value.streams) outStreams = outStreams.concat(results[i].value.streams);
                if (results[i].value.subtitles) outSubs = outSubs.concat(results[i].value.subtitles);
            }
        }
        return { streams: outStreams, subtitles: outSubs };
    });
}

// --- Metadata & Formatting ---

function buildMediaTitle(info, mediaType, season, episode, episodeInfo) {
    if (episodeInfo && episodeInfo.seasonName) {
        var e = String(episodeInfo.episode || episode).padStart(2, '0');
        return episodeInfo.seasonName + ' E' + e;
    }
    if (!info || !info.title) return '';
    if (mediaType === 'tv' && season && episode) {
        var s = String(season).padStart(2, '0');
        var e = String(episode).padStart(2, '0');
        return info.title + ' S' + s + 'E' + e;
    }
    if (info.year) return info.title + ' (' + info.year + ')';
    return info.title;
}

function getTMDBDetails(tmdbId, mediaType) {
    var endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    var url = TMDB_BASE_URL + '/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&append_to_response=external_ids';
    return fetchRequest(url)
        .then(function(res) { return res.json(); })
        .then(function(data) {
            var title = mediaType === 'tv' ? data.name : data.title;
            var releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
            var year = releaseDate ? parseInt(releaseDate.split('-')[0]) : null;
            return { title: title, year: year };
        })
        .catch(function() { return { title: null, year: null }; });
}

function getTMDBSeasonInfo(tmdbId, season) {
    var url = TMDB_BASE_URL + '/tv/' + tmdbId + '/season/' + season + '?api_key=' + TMDB_API_KEY;
    return fetchRequest(url)
        .then(function(res) { return res.json(); })
        .then(function(seasonData) {
            return {
                name: seasonData.name,
                episodeCount: seasonData.episodes ? seasonData.episodes.length : 0,
                seasonNumber: seasonData.season_number
            };
        })
        .catch(function() {
            return { name: null, episodeCount: 0, seasonNumber: season };
        });
}

function extractEpisodeAndTitleFromHtml(html) {
    var episodeInfo = { episode: null, title: null, seasonName: null };
    var episodeMatch = html.match(/You are watching <b>Episode (\d+)<\/b>/i) || html.match(/Episode (\d+)/i);
    if (episodeMatch) episodeInfo.episode = parseInt(episodeMatch[1]);
    
    var titleMatch = html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) {
        var title = titleMatch[1].trim().replace(/\s+/g, ' ').replace(/&[^;]+;/g, '');
        if (title.length > 3) episodeInfo.seasonName = title;
    }
    return episodeInfo;
}

function extractContentIdFromSlug(slugUrl) {
    return fetchRequest(slugUrl)
        .then(function(res) { return res.text(); })
        .then(function(html) {
            var m1 = html.match(/<div[^>]*class="[^"]*rate-box[^"]*"[^>]*data-id="([^"]*)"/);
            var contentId = m1 ? m1[1] : null;
            if (!contentId) {
                var m2 = html.match(/data-id="([^"]*)"/);
                if (m2) contentId = m2[1];
            }
            if (!contentId) throw new Error('Could not find content ID');
            return {
                contentId: contentId,
                episodeInfo: extractEpisodeAndTitleFromHtml(html)
            };
        });
}

function formatToNuvioStreams(formattedData, mediaTitle) {
    var links = [];
    var subs = formattedData && formattedData.subtitles ? formattedData.subtitles : [];
    var streams = formattedData && formattedData.streams ? formattedData.streams : [];
    
    var headers = {
        'User-Agent': HEADERS['User-Agent'],
        'Referer': HEADERS['Referer'], // Important for playback
        'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
    };

    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        var quality = s.quality || extractQualityFromUrl(s.url) || 'Unknown';
        var server = (s.serverType || 'server').toUpperCase();
        links.push({
            name: 'ANIMEKAI ' + server + ' - ' + quality,
            title: mediaTitle || '',
            url: s.url,
            quality: quality,
            size: 'Unknown',
            headers: headers,
            subtitles: subs,
            provider: 'animekai'
        });
    }
    return links;
}

// --- MAIN ENTRY POINT ---

function getStreams(tmdbId, mediaType, season, episode) {
    // FIX: Accept both 'tv' and 'movie'
    if (mediaType !== 'tv' && mediaType !== 'movie') return Promise.resolve([]);

    // Normalize input for movies (treat as Season 1 Episode 1)
    var targetSeason = (mediaType === 'movie') ? 1 : season;
    var targetEpisode = (mediaType === 'movie') ? 1 : episode;

    var mediaInfo = null;
    var selectedEpisodeKey = null;
    var token = null;
    var rid = createRequestId();
    
    logRid(rid, 'getStreams start', { tmdbId: tmdbId, type: mediaType });

    return getTMDBDetails(tmdbId, mediaType)
        .then(function(info) {
            mediaInfo = info || { title: null, year: null };
            var titleToSearch = mediaInfo.title || '';
            
            // For TV with seasons, try accurate mapping
            if (mediaType === 'tv' && targetSeason > 1) {
                return getTMDBSeasonInfo(tmdbId, targetSeason).then(function(seasonInfo) {
                    var searchTitle = titleToSearch;
                    if (seasonInfo.name && seasonInfo.name !== `Season ${targetSeason}`) {
                        searchTitle = titleToSearch + ' ' + seasonInfo.name;
                    }
                    return getAccurateAnimeKaiEntry(searchTitle, targetSeason, targetEpisode, tmdbId, mediaType);
                });
            }
            // For Movies or Season 1
            return getAccurateAnimeKaiEntry(titleToSearch, targetSeason, targetEpisode, tmdbId, mediaType);
        })
        .then(function(chosen) {
            if (!chosen || !chosen.url) throw new Error('No AnimeKai entry found');
            logRid(rid, 'Chosen', chosen);
            
            return extractContentIdFromSlug(chosen.url).then(function(result) {
                return {
                    contentId: result.contentId,
                    episodeInfo: result.episodeInfo
                };
            });
        })
        .then(function(result) {
            var contentId = result.contentId;
            
            return encryptKai(contentId).then(function(encId) {
                var url = KAI_AJAX + '/episodes/list?ani_id=' + contentId + '&_=' + encId;
                return fetchRequest(url).then(function(res) { return res.json(); });
            })
            .then(function(episodesResp) {
                return parseHtmlViaApi(episodesResp.result);
            })
            .then(function(episodes) {
                var keys = Object.keys(episodes || {}).sort(function(a,b){ return parseInt(a) - parseInt(b); });
                if (keys.length === 0) throw new Error('No episodes');
                
                var epStr = String(targetEpisode);
                var foundToken = null;
                
                // Find Token Logic
                // 1. Try direct match
                for (var k in episodes) {
                    if (episodes[k][epStr] && episodes[k][epStr].token) {
                        foundToken = episodes[k][epStr].token;
                        selectedEpisodeKey = epStr;
                        break;
                    }
                }
                
                // 2. Fallback for Movies (first available)
                if (!foundToken && mediaType === 'movie') {
                    var firstOuter = keys[0];
                    var innerKeys = Object.keys(episodes[firstOuter] || {});
                    if (innerKeys.length > 0) {
                        foundToken = episodes[firstOuter][innerKeys[0]].token;
                        selectedEpisodeKey = innerKeys[0];
                    }
                }

                if (!foundToken) throw new Error('Episode not found');
                token = foundToken;
                return encryptKai(token);
            })
            .then(function(encToken) {
                var url = KAI_AJAX + '/links/list?token=' + token + '&_=' + encToken;
                return fetchRequest(url).then(function(res) { return res.json(); });
            })
            .then(function(serversResp) { return parseHtmlViaApi(serversResp.result); })
            .then(function(servers) {
                var serverPromises = [];
                Object.keys(servers || {}).forEach(function(serverType) {
                    Object.keys(servers[serverType] || {}).forEach(function(serverKey) {
                        var lid = servers[serverType][serverKey].lid;
                        var p = encryptKai(lid)
                            .then(function(encLid) {
                                var url = KAI_AJAX + '/links/view?id=' + lid + '&_=' + encLid;
                                return fetchRequest(url).then(function(res) { return res.json(); });
                            })
                            .then(function(embedResp) { return decryptKai(embedResp.result); })
                            .then(function(decrypted) {
                                if (decrypted && decrypted.url) {
                                    return decryptMegaMedia(decrypted.url);
                                }
                                return { streams: [], subtitles: [] };
                            })
                            .then(function(decryptedData) {
                                // Add serverType to streams for naming
                                if (decryptedData.streams) {
                                    decryptedData.streams.forEach(function(s) { s.serverType = serverType; });
                                }
                                return decryptedData;
                            })
                            .catch(function(){ return { streams: [], subtitles: [] }; });
                        serverPromises.push(p);
                    });
                });

                return Promise.allSettled(serverPromises).then(function(results) {
                    var allStreams = [];
                    var apiSubs = [];

                    for (var i = 0; i < results.length; i++) {
                        if (results[i].status === 'fulfilled') {
                            var val = results[i].value || { streams: [], subtitles: [] };
                            allStreams = allStreams.concat(val.streams || []);
                            apiSubs = apiSubs.concat(val.subtitles || []);
                        }
                    }

                    var m3u8Links = allStreams.filter(function(s){ return s && s.url && s.url.indexOf('.m3u8') !== -1; });
                    var directLinks = allStreams.filter(function(s){ return !(s && s.url && s.url.indexOf('.m3u8') !== -1); });

                    // Resolve M3U8 links for more streams AND subtitles
                    return resolveMultipleM3U8(m3u8Links).then(function(resolutionResult) {
                        var combinedStreams = directLinks.concat(resolutionResult.streams);
                        var combinedSubs = apiSubs.concat(resolutionResult.subtitles);

                        // Deduplicate subs by URL
                        var uniqueSubs = [];
                        var seen = {};
                        for (var j = 0; j < combinedSubs.length; j++) {
                            var su = combinedSubs[j];
                            if (su && su.url && !seen[su.url]) { 
                                seen[su.url] = true; 
                                uniqueSubs.push(su); 
                            }
                        }
                        
                        var mediaTitle = buildMediaTitle(mediaInfo, mediaType, targetSeason, targetEpisode, result.episodeInfo);
                        var formatted = formatToNuvioStreams({ streams: combinedStreams, subtitles: uniqueSubs }, mediaTitle);
                        
                        // Rough Sort
                        var order = { '1080p': 5, '720p': 4, '480p': 3, '360p': 2, '240p': 1, 'Unknown': 0 };
                        formatted.sort(function(a, b) { return (order[b.quality] || 0) - (order[a.quality] || 0); });
                        return formatted;
                    });
                });
            });
        })
        .catch(function(err) {
            logRid(rid, 'ERROR', err);
            return [];
        });
}

// Export for Nuvio
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.AnimeKaiScraperModule = { getStreams };
}
