// multiprovider_all59_singlefile.js
// Single-file multiprovider: 59 providers registry + utilities + YFlix implementation.
// Promise-based; compatible with Nuvio local scrapers (cheerio allowed if needed).

(function () {
  // If cheerio is available in the sandbox, providers can require it.
  const cheerio = (typeof require !== 'undefined') ? (function tryReq(){ try { return require('cheerio-without-node-native'); } catch(e){ return null; } })() : (global.cheerio || null);

  // -----------------------
  // Config & Defaults
  // -----------------------
  const DEFAULT_REMOTE_CONFIG_URL = null; // set your default raw GitHub config URL here if desired
  const DEFAULT_FETCH_TIMEOUT = 3500; // ms

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity'
  };

  // -----------------------
  // Utilities
  // -----------------------
  function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 10000;
    var controller = null;
    try {
      // Not all sandboxes support AbortController; ignore if not present.
      controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    } catch (e) {
      controller = null;
    }
    var fetchOpts = Object.assign({}, options || {});
    if (controller) fetchOpts.signal = controller.signal;
    var timer = null;
    return new Promise(function (resolve, reject) {
      if (controller) {
        timer = setTimeout(function () {
          try { controller.abort(); } catch (e) {}
          reject(new Error('Fetch timeout'));
        }, timeoutMs);
      } else {
        // no abort support: rely on fetch's internal timeout (if any)
      }
      fetch(url, fetchOpts).then(function (res) {
        if (timer) clearTimeout(timer);
        resolve(res);
      }).catch(function (err) {
        if (timer) clearTimeout(timer);
        reject(err);
      });
    });
  }

  function getText(url, options) {
    return fetchWithTimeout(url, Object.assign({ headers: HEADERS }, options || {}), 10000)
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); });
  }
  function getJson(url, options) {
    return fetchWithTimeout(url, Object.assign({ headers: HEADERS }, options || {}), 10000)
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
  }
  function postJson(url, body, extraHeaders) {
    var headers = Object.assign({ 'Content-Type': 'application/json' }, HEADERS, extraHeaders || {});
    return fetchWithTimeout(url, { method: 'POST', headers: headers, body: JSON.stringify(body) }, 15000)
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); });
  }

  function toAbsolute(base, href) {
    try { return new URL(href, base).toString(); } catch (e) { return href || ''; }
  }

  function parseQualityFromM3u8(m3u8Text, baseUrl) {
    var streams = [];
    var lines = m3u8Text.split(/\r?\n/);
    var current = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        var resMatch = line.match(/RESOLUTION=\s*(\d+)x(\d+)/i);
        var bandMatch = line.match(/BANDWIDTH=\s*(\d+)/i);
        var height = (resMatch && parseInt(resMatch[2])) || null;
        var bandwidth = (bandMatch && parseInt(bandMatch[1])) || null;
        var quality = null;
        if (height) quality = (height + 'p');
        else if (bandwidth) {
          var b = bandwidth;
          if (b >= 6000000) quality = '2160p';
          else if (b >= 4000000) quality = '1440p';
          else if (b >= 2500000) quality = '1080p';
          else if (b >= 1500000) quality = '720p';
          else if (b >= 800000) quality = '480p';
          else quality = '360p';
        } else quality = 'adaptive';
        current = { quality: quality, url: null, bandwidth: bandwidth, height: height };
      } else if (!line.startsWith('#') && current) {
        var streamUrl = line;
        try { if (!/^https?:\/\//i.test(streamUrl) && baseUrl) streamUrl = new URL(streamUrl, baseUrl).href; } catch(e){}
        current.url = streamUrl;
        streams.push(current);
        current = null;
      }
    }
    return { isMaster: streams.length > 0, streams: streams.sort(function(a,b){ return (b.height||0)-(a.height||0); }) };
  }

  function enhanceStreamsWithQuality(streams) {
    // For each stream that points to m3u8, fetch and parse (parallel)
    var enhanced = [];
    var tasks = (streams || []).map(function (s) {
      if (!s || !s.url) { return Promise.resolve(); }
      if (s.url.indexOf('.m3u8') !== -1) {
        return getText(s.url).then(function (txt) {
          try {
            var info = parseQualityFromM3u8(txt, s.url);
            if (info.isMaster && info.streams.length) {
              info.streams.forEach(function (q) {
                enhanced.push(Object.assign({}, s, { url: q.url, quality: q.quality, bandwidth: q.bandwidth, height: q.height, masterUrl: s.url }));
              });
            } else {
              enhanced.push(Object.assign({}, s, { quality: s.quality || 'Adaptive' }));
            }
          } catch (e) {
            enhanced.push(Object.assign({}, s, { quality: s.quality || 'Adaptive' }));
          }
        }).catch(function () {
          enhanced.push(Object.assign({}, s, { quality: s.quality || 'Adaptive' }));
        });
      } else {
        enhanced.push(s);
        return Promise.resolve();
      }
    });
    return Promise.all(tasks).then(function () { return enhanced; });
  }

  // Remote config loader
  function loadRemoteConfig(configUrl, timeoutMs) {
    timeoutMs = timeoutMs || DEFAULT_FETCH_TIMEOUT;
    if (!configUrl) return Promise.resolve(null);
    // try fetch with timeout
    return new Promise(function (resolve) {
      var didTimeout = false;
      var timer = setTimeout(function () { didTimeout = true; console.warn('[multiprovider] config fetch timeout'); resolve(null); }, timeoutMs);
      fetch(configUrl).then(function (res) {
        if (didTimeout) return;
        clearTimeout(timer);
        if (!res.ok) return resolve(null);
        return res.text();
      }).then(function (text) {
        if (didTimeout) return;
        if (!text) return resolve(null);
        try {
          var cfg = JSON.parse(text);
          resolve(cfg);
        } catch (e) {
          console.warn('[multiprovider] invalid config json', e && e.message);
          resolve(null);
        }
      }).catch(function (err) {
        if (!didTimeout) clearTimeout(timer);
        console.warn('[multiprovider] config fetch failed', err && err.message);
        resolve(null);
      });
    });
  }

  function applyConfigOverrides(registry, config) {
    if (!config) return registry;
    var enabledMap = (config.enabled) || {};
    var priorityMap = (config.priority) || {};
    return registry.map(function (p) {
      var copy = Object.assign({}, p);
      if (enabledMap.hasOwnProperty(copy.id)) copy.enabled = !!enabledMap[copy.id];
      if (priorityMap.hasOwnProperty(copy.id)) copy.priority = Number(priorityMap[copy.id]) || 0;
      return copy;
    }).sort(function (a,b){ return (b.priority||0)-(a.priority||0); });
  }

  // -----------------------
  // Registry of 59 providers
  // -----------------------
  // Note: Most providers are stubs (safe, return []). YFlix is implemented below as 'yflix'.
  var PROVIDERS = [
    // Implemented provider: yflix (full implementation based on your code)
    { id: 'yflix', name: 'YFlix', supports: ['movie','tv','anime'], enabled: true, priority: 20, fn: null }, // fn replaced later

    // The rest are stubs (replace functions with real implementations as you convert them)
    { id: 'vegamovies', name: 'VegaMovies', supports: ['movie','tv'], enabled: true, priority: 10, fn: null },
    { id: 'vidsrccc', name: 'Vidsrccc', supports: ['movie','tv'], enabled: true, priority: 9, fn: null },
    { id: 'vidzee', name: 'Vidzee', supports: ['movie','tv'], enabled: true, priority: 9, fn: null },
    { id: 'kisskh', name: 'Kisskh', supports: ['movie','tv'], enabled: true, priority: 8, fn: null },
    { id: 'animepahe', name: 'AnimePahe', supports: ['anime','tv'], enabled: true, priority: 8, fn: null },
    { id: 'multimovies', name: 'Multimovies', supports: ['movie','tv'], enabled: true, priority: 8, fn: null },
    { id: 'uhdmovies', name: 'UHDMovies', supports: ['movie','tv'], enabled: true, priority: 7, fn: null },
    { id: 'anime', name: 'AllAnimeSources', supports: ['anime','tv'], enabled: true, priority: 7, fn: null },
    { id: 'player4u', name: 'Player4U', supports: ['movie','tv'], enabled: true, priority: 7, fn: null },
    { id: 'player4u2', name: 'Player4U-Alt', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: 'vidnest', name: 'Vidnest', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: 'vidfast', name: 'VidFastPro', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: 'vidplus', name: 'VidPlus', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: 'ridomovies', name: 'RidoMovies', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: 'emovies', name: 'Emovies', supports: ['movie','tv'], enabled: true, priority: 6, fn: null },
    { id: '2embed', name: 'TwoEmbed', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'zshow', name: 'ZShow', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'showflix', name: 'Showflix', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'zoechip', name: 'Zoechip', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'nepu', name: 'Nepu', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'watch32', name: 'Watch32APIHQ', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'riverse', name: 'RiveStream', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'superstream', name: 'SuperStream', supports: ['movie','tv'], enabled: true, priority: 5, fn: null },
    { id: 'streamplay', name: 'StreamPlayInternal', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'animetosho', name: 'Animetosho', supports: ['anime'], enabled: true, priority: 4, fn: null },
    { id: 'hianime', name: 'HiAnime', supports: ['anime'], enabled: true, priority: 4, fn: null },
    { id: 'anizone', name: 'Anizone', supports: ['anime'], enabled: true, priority: 4, fn: null },
    { id: 'kickassanime', name: 'KickAssAnime', supports: ['anime'], enabled: true, priority: 4, fn: null },
    { id: 'zoro', name: 'ZoroLike', supports: ['anime'], enabled: true, priority: 4, fn: null },
    { id: 'playm4u', name: 'Playm4u', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'm4ufree', name: 'M4ufree', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'vcloud', name: 'VCloud', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'vcloudgd', name: 'VCloudGD', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'filemoon', name: 'FileMoon', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'mixdrop', name: 'MixDrop', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'mp4upload', name: 'Mp4Upload', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'streamsb', name: 'StreamSB', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'streamsb8', name: 'StreamSB8', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'streamtape', name: 'StreamTape', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'voe', name: 'Voe', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'dood', name: 'Dood', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'doodre', name: 'DoodRe', supports: ['movie','tv'], enabled: true, priority: 4, fn: null },
    { id: 'vidstack', name: 'VidStack', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'pixelDrain', name: 'PixelDrain', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'film1k', name: 'Film1k', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'mwish', name: 'MWish', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'vidhide', name: 'Vidhide', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'embedrise', name: 'EmbedRise', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'vidfastpro', name: 'VidFastProAlt', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'vidplusapi', name: 'VidPlusAPI', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'xdmovies', name: 'XDmovies', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'vidnest_api', name: 'VidnestAPI', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'moflix', name: 'Moflix', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'moflix2', name: 'MoflixAlt', supports: ['movie','tv'], enabled: true, priority: 3, fn: null },
    { id: 'vhideo', name: 'VHideGMPlayer', supports: ['movie','tv'], enabled: true, priority: 3, fn: null }
  ];

  // Helper: stub provider function generator
  function makeStubProvider(id) {
    return function (input) {
      return new Promise(function (resolve) {
        // Log for debugging; safe no-op
        try { console.log('[multiprovider][stub] ' + id + ' called for', input.tmdbId, input.mediaType); } catch(e){}
        resolve([]);
      });
    };
  }

  // Assign stub fns for providers (except yflix)
  for (var i = 0; i < PROVIDERS.length; i++) {
    if (PROVIDERS[i].id !== 'yflix') PROVIDERS[i].fn = makeStubProvider(PROVIDERS[i].id);
  }

  // -----------------------
  // YFlix provider implementation (based on your shared code)
  // -----------------------
  (function defineYFlix() {
    var API = 'https://enc-dec.app/api';
    var YFLIX_AJAX = 'https://yflix.to/ajax';
    var TMDB_API_KEY = null; // not used inside provider; main getStreams will call TMDB if needed
    // reuse HEADERS and helpers above

    function createRequestId() {
      try {
        var rand = Math.random().toString(36).slice(2,8);
        var ts = Date.now().toString(36).slice(-6);
        return rand + ts;
      } catch (e) { return String(Date.now()); }
    }
    function logRid(rid, msg, extra) {
      try { if (extra !== undefined) console.log('[YFlix][rid:' + rid + '] ' + msg, extra); else console.log('[YFlix][rid:' + rid + '] ' + msg); } catch(e){}
    }

    function encryptRemote(text) {
      return getJson(API + '/enc-movies-flix?text=' + encodeURIComponent(text)).then(function (j) { return j && j.result; });
    }
    function decryptRemote(text) {
      return postJson(API + '/dec-movies-flix', { text: text }).then(function (j) { return j && j.result; });
    }
    function parseHtmlRemote(html) {
      return postJson(API + '/parse-html', { text: html }).then(function (j) { return j && j.result; });
    }
    function decryptRapidMedia(embedUrl) {
      var media = embedUrl.replace('/e/', '/media/').replace('/e2/', '/media/');
      return getJson(media).then(function (mediaJson) {
        var encrypted = mediaJson && mediaJson.result;
        if (!encrypted) throw new Error('No encrypted media result from RapidShare media endpoint');
        return postJson(API + '/dec-rapid', { text: encrypted, agent: HEADERS['User-Agent'] }).then(function (j) { return j && j.result; });
      });
    }

    function parseQualityFromM3u8Local(m3u8Text, baseUrl) { return parseQualityFromM3u8(m3u8Text, baseUrl); }
    function enhanceLocal(streams) { return enhanceStreamsWithQuality(streams); }

    function runStreamFetch(contentId, specificEid, title, year, mediaType, seasonNum, episodeNum, rid) {
      logRid(rid, 'runStreamFetch start for contentId=' + contentId);
      return encryptRemote(contentId)
        .then(function(encId){
          logRid(rid, 'episodes/list enc ready');
          return getJson(YFLIX_AJAX + '/episodes/list?id=' + contentId + '&_=' + encId);
        })
        .then(function(episodesResp){
          return parseHtmlRemote(episodesResp.result);
        })
        .then(function(episodes){
          var episodeKeys = Object.keys(episodes || {});
          var eid = null;
          if (specificEid) eid = specificEid;
          else {
            var seasons = Object.keys(episodes || {});
            if (seasons.length > 0) {
              var firstSeason = seasons[0];
              var eps = Object.keys(episodes[firstSeason] || {});
              if (eps.length > 0) eid = episodes[firstSeason][eps[0]].eid;
            }
          }
          if (!eid) { logRid(rid, 'no eid found'); }
          return encryptRemote(eid).then(function(encEid){ return { eid: eid, encEid: encEid }; });
        })
        .then(function(obj){
          return getJson(YFLIX_AJAX + '/links/list?eid=' + obj.eid + '&_=' + obj.encEid);
        })
        .then(function(serversResp){
          return parseHtmlRemote(serversResp.result);
        })
        .then(function(servers){
          var allStreams = [];
          var allSubtitles = [];
          var allThumbs = [];
          var serverPromises = [];
          var lids = [];
          Object.keys(servers || {}).forEach(function(serverType){
            Object.keys(servers[serverType] || {}).forEach(function(serverKey){
              var lid = servers[serverType][serverKey].lid;
              lids.push(lid);
              var p = encryptRemote(lid)
                .then(function(encLid){
                  return getJson(YFLIX_AJAX + '/links/view?id=' + lid + '&_=' + encLid);
                })
                .then(function(embedResp){
                  return decryptRemote(embedResp.result);
                })
                .then(function(decrypted){
                  if (decrypted && typeof decrypted === 'object' && decrypted.url && decrypted.url.indexOf('rapidshare.cc') !== -1) {
                    return decryptRapidMedia(decrypted.url).then(function(rapidData){
                      var formatted = (function formatRapid(rapidResult){
                        var streams = []; var subs = []; var thumbs = [];
                        if (rapidResult && typeof rapidResult === 'object') {
                          (rapidResult.sources || []).forEach(function(src){ if (src && src.file) streams.push({ url: src.file, quality: src.file.indexOf('.m3u8') !== -1 ? 'Adaptive' : 'unknown', type: src.file.indexOf('.m3u8') !== -1 ? 'hls' : 'file', provider: 'rapidshare' }); });
                          (rapidResult.tracks || []).forEach(function(tr){ if (tr && tr.kind === 'thumbnails' && tr.file) thumbs.push({ url: tr.file, type: 'vtt' });
                            else if (tr && (tr.kind === 'captions' || tr.kind === 'subtitles') && tr.file) subs.push({ url: tr.file, language: tr.label || '', default: !!tr.default }); });
                        }
                        return { streams: streams, subtitles: subs, thumbnails: thumbs };
                      })(rapidData);
                      return enhanceLocal(formatted.streams).then(function(enh){
                        enh.forEach(function(s){
                          s.serverType = serverType; s.serverKey = serverKey; s.serverLid = lid; allStreams.push(s);
                        });
                        allSubtitles.push.apply(allSubtitles, formatted.subtitles || []);
                        allThumbs.push.apply(allThumbs, formatted.thumbnails || []);
                        return null;
                      });
                    });
                  }
                  return null;
                })
                .catch(function(){ return null; });
              serverPromises.push(p);
            });
          });
          return Promise.all(serverPromises).then(function(){
            var seen = {};
            var dedup = [];
            (allStreams || []).forEach(function(s){
              if (!s || !s.url) return;
              if (seen[s.url]) return;
              seen[s.url] = true; dedup.push(s);
            });
            var nuvio = dedup.map(function(stream){
              return {
                name: 'YFlix ' + (stream.serverType || 'Server') + ' - ' + (stream.quality || 'Unknown'),
                title: (stream.title || '') + (stream.quality ? ' - ' + stream.quality : ''),
                url: stream.url,
                quality: stream.quality || 'Unknown',
                size: 'Unknown',
                headers: HEADERS,
                provider: 'yflix'
              };
            });
            return nuvio;
          });
        });
    }

    // helper to extract contentId and title from watch page
    function getContentInfoFromYflixUrl(yflixUrl) {
      return getText(yflixUrl).then(function(html){
        var contentId = null;
        var idMatch = html.match(/<div[^>]*class="[^"]*rating[^"]*"[^>]*data-id="([^"]*)"[^>]*>/);
        if (idMatch) contentId = idMatch[1];
        else {
          var alt = html.match(/data-id="([^"]*)"[^>]*id="movie-rating/);
          if (alt) contentId = alt[1];
        }
        var titleMatch = html.match(/<h1[^>]*itemprop="name"[^>]*class="title"[^>]*>([^<]+)<\/h1>/);
        var title = titleMatch ? titleMatch[1].trim() : 'Unknown Title';
        var yearMatch = html.match(/<div[^>]*class="[^"]*metadata[^"]*set[^"]*"[^>]*>[\s\S]*?<span[^>]*>(\d{4})<\/span>/);
        var year = yearMatch ? parseInt(yearMatch[1]) : null;
        return { contentId: contentId, title: title, year: year };
      });
    }

    // TV handler
    function handleTvShow(yflixUrl, contentId, title, year, seasonNum, episodeNum, rid) {
      var selectedSeason = seasonNum || 1;
      var selectedEpisode = episodeNum || 1;
      var episodeUrl = yflixUrl + '#ep=' + selectedSeason + ',' + selectedEpisode;
      return getText(episodeUrl).then(function(html){
        var epMatch = html.match(/data-episode="([^"]*)"/) || html.match(/episode["\\s]*:[\\s]*["']([^"']+)["']/);
        if (epMatch) return epMatch[1];
        return contentId;
      }).then(function(episodeId){
        return runStreamFetch(contentId, episodeId, title, year, 'tv', selectedSeason, selectedEpisode, rid);
      });
    }

    // TMDB details helper (lightweight)
    function getTMDBDetails(tmdbId, mediaType) {
      // Note: We don't call TMDB here for YFlix; getStreams main will provide title/year to search
      return Promise.resolve({ title: null, year: null });
    }

    // public function for YFlix provider
    function providerYFlix(input) {
      return new Promise(function (resolve) {
        var rid = createRequestId();
        var tmdbId = input.tmdbId;
        var mediaType = input.mediaType;
        // If input contains title/year already use them, otherwise we do a best-effort by fetching YFlix search results
        // Here we'll implement matching using TMDB lookup if input.tmdbProvided (caller may fetch TMDB first)
        // For simplicity: if input.title present use it; otherwise we'll treat tmdbId as tmdb id and attempt TMDB lookup externally.
        // But since Nuvio calls usually provide only tmdbId, the multiprovider master will run TMDB lookup and pass title/year via input.title/year if desired.
        // To keep it self-contained, we'll attempt to fetch the page by id search using tmdbId as string queries.
        // For robustness, accept input.title/year if provided.
        var providedTitle = input.title || null;
        var providedYear = input.year || null;

        // If providedTitle exists, search YFlix with it; else try to build a query from tmdbId (caller should prefer providing title/year)
        var searchQueries = [];
        if (providedTitle) {
          if (providedYear) searchQueries.push(providedTitle + ' ' + providedYear);
          searchQueries.push(providedTitle);
        } else {
          // As fallback, use tmdbId as query (some repos use numeric id inside search; not ideal)
          searchQueries.push(String(tmdbId));
        }

        var qIndex = 0;
        function tryNext() {
          if (qIndex >= searchQueries.length) { resolve([]); return; }
          var q = searchQueries[qIndex++];
          var searchUrl = (YFLIX_AJAX.replace('/ajax','')) + '/browser?keyword=' + encodeURIComponent(q);
          getText(searchUrl).then(function(html){
            // regex-based parsing (robustness: look for watch/ path)
            var results = [];
            var infoRegex = /<div[^>]*class="[^"]*info[^"]*"[^>]*>[\\s\\S]*?<a[^>]*href="([^"]*watch\\/[^\"]*)"[^>]*class="[^"]*title[^"]*"[^>]*>([^<]*)<\\/a>[\\s\\S]*?<div[^>]*class="[^"]*metadata[^"]*"[^>]*>([\\s\\S]*?)<\\/div>/g;
            var m;
            while ((m = infoRegex.exec(html)) !== null) {
              var url = m[1], title = m[2], metadata = m[3];
              var cleanUrl = url && (url.indexOf('http') === 0 ? url : (YFLIX_AJAX.replace('/ajax','') + url));
              var typeMatch = (metadata.match(/<span[^>]*>([^<]*)<\\/span>/g) || []).map(function(s){ return s.replace(/<[^>]*>/g,''); });
              results.push({ url: cleanUrl, title: (title||'').trim(), metadata: typeMatch, year: (typeMatch[1] && /^\d{4}$/.test(typeMatch[1])? parseInt(typeMatch[1]) : null) });
            }
            if (!results || results.length === 0) return tryNext();
            // choose first reasonable match (caller can supply better matching criteria)
            var sel = results[0];
            return getContentInfoFromYflixUrl(sel.url).then(function(info){
              if (mediaType === 'tv') return handleTvShow(sel.url, info.contentId, info.title, info.year, input.seasonNum, input.episodeNum, rid);
              return runStreamFetch(info.contentId, null, info.title, info.year, mediaType, input.seasonNum, input.episodeNum, rid);
            });
          }).then(function(out){
            if (out && out.length) resolve(out); else tryNext();
          }).catch(function(err){
            console.warn('[YFlix] search error', err && err.message);
            tryNext();
          });
        }
        tryNext();
      });
    }

    // Assign to registry entry
    for (var i=0;i<PROVIDERS.length;i++){
      if (PROVIDERS[i].id === 'yflix') { PROVIDERS[i].fn = providerYFlix; break; }
    }
  })();

  // -----------------------
  // Master getStreams
  // - supports remote config via:
  //    1) tmdbId override: "TMDBID::config=https://raw.../config.json"
  //    2) global variable: global.MULTIPROVIDER_CONFIG_URL (if host allows)
  // -----------------------
  function parseTmdbIdForConfig(raw) {
    if (!raw) return { tmdbId: raw, configUrl: null };
    var parts = raw.split('::config=');
    if (parts.length === 2) return { tmdbId: parts[0], configUrl: parts[1] };
    return { tmdbId: raw, configUrl: null };
  }

  function master_getStreams(rawTmdbId, mediaType, seasonNum, episodeNum) {
    return new Promise(function (resolve) {
      var parsed = parseTmdbIdForConfig(rawTmdbId || '');
      var tmdbId = parsed.tmdbId;
      var remoteUrl = parsed.configUrl || (typeof global !== 'undefined' && global.MULTIPROVIDER_CONFIG_URL) || DEFAULT_REMOTE_CONFIG_URL;

      loadRemoteConfig(remoteUrl, DEFAULT_FETCH_TIMEOUT).then(function (cfg) {
        var registry = applyConfigOverrides(PROVIDERS, cfg);
        // prepare input: enrich with optional title/year? master doesn't call TMDB to avoid extra quota.
        // If you prefer TMDB lookup, implement here and add input.title/input.year to pass to providers.
        var input = { tmdbId: tmdbId, mediaType: mediaType, seasonNum: seasonNum, episodeNum: episodeNum };

        // filter by mediaType & enabled
        var chosen = registry.filter(function (p) { return p.enabled && p.supports && p.supports.indexOf(mediaType) !== -1; });
        if (chosen.length === 0) return resolve([]);

        // invoke providers with limited concurrency (3)
        var concurrency = 3;
        var index = 0, running = 0;
        var results = new Array(chosen.length);
        function next() {
          if (index >= chosen.length && running === 0) {
            // flatten & sort
            var flat = [].concat.apply([], results.filter(function(r){ return Array.isArray(r); }));
            flat.sort(function(a,b){
              var qa = parseInt((a.quality||'').toString().replace('p',''))||0;
              var qb = parseInt((b.quality||'').toString().replace('p',''))||0;
              return qb - qa;
            });
            resolve(flat);
            return;
          }
          while (running < concurrency && index < chosen.length) {
            (function(iLocal){
              var prov = chosen[iLocal];
              running++;
              index++;
              try {
                prov.fn(input).then(function (res) {
                  results[iLocal] = res || [];
                }).catch(function (e) {
                  console.warn('[multiprovider] provider error', prov.id, e && e.message);
                  results[iLocal] = [];
                }).finally(function(){
                  running--; next();
                });
              } catch (err) {
                console.warn('[multiprovider] provider sync error', prov.id, err && err.message);
                results[iLocal] = [];
                running--; next();
              }
            })(index);
          }
        }
        next();
      }).catch(function(err){
        console.warn('[multiprovider] config load failed', err && err.message);
        resolve([]); // fail safe
      });
    });
  }

  // Export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: master_getStreams };
  } else {
    global.getStreams = master_getStreams;
  }
