// =====================================================
// HIANIME SCRAPER - WORKING VERSION
// Based on yahyaMomin/hianime-API (tested & working)
// Promise-based for Nuvio compatibility
// =====================================================

var CONFIG = {
  TMDB_API_KEY: '439c478a771f35c05022f9feabcca01c',
  TMDB_BASE: 'https://api.themoviedb.org/3',
  HIANIME_API: 'https://hianime-api-rouge.vercel.app/api/v1',
  HEADERS: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json'
  }
};

function log(msg, data) {
  console.log('[HiAnime] ' + msg, data || '');
}

function sleep(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

function fetchJSON(url) {
  return fetch(url, {
    method: 'GET',
    headers: CONFIG.HEADERS
  }).then(function(response) {
    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }
    return response.json();
  });
}

function normalizeTitle(title) {
  return title.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateSimilarity(str1, str2) {
  var s1 = normalizeTitle(str1);
  var s2 = normalizeTitle(str2);
  
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  var words1 = s1.split(' ');
  var words2 = s2.split(' ');
  var matches = 0;
  
  for (var i = 0; i < words1.length; i++) {
    if (words2.indexOf(words1[i]) >= 0 && words1[i].length > 2) {
      matches++;
    }
  }
  
  return matches / Math.max(words1.length, words2.length);
}

// Get TMDB info
function getTMDBInfo(tmdbId) {
  var url = CONFIG.TMDB_BASE + '/tv/' + tmdbId + '?api_key=' + CONFIG.TMDB_API_KEY;
  log('Fetching TMDB...');
  
  return fetchJSON(url).then(function(data) {
    log('TMDB:', data.name);
    return {
      title: data.name,
      originalTitle: data.original_name,
      year: (data.first_air_date || '').split('-')[0]
    };
  });
}

// Search anime
function searchAnime(query) {
  var url = CONFIG.HIANIME_API + '/search?keyword=' + encodeURIComponent(query);
  log('Searching:', query);
  
  return fetchJSON(url).then(function(data) {
    if (!data.success || !data.data || !data.data.response) {
      throw new Error('Invalid search response');
    }
    
    var results = data.data.response;
    log('Found:', results.length + ' results');
    return results;
  });
}

// Get episodes
function getEpisodes(animeId) {
  var cleanId = animeId.replace('?ref=search', '');
  var url = CONFIG.HIANIME_API + '/episodes/' + cleanId;
  log('Getting episodes for:', cleanId);
  
  return fetchJSON(url).then(function(data) {
    if (!data.success || !data.data) {
      throw new Error('Invalid episodes response');
    }
    
    var episodes = data.data;
    log('Found episodes:', episodes.length);
    return episodes;
  });
}

// Get servers
function getServers(episodeId) {
  var url = CONFIG.HIANIME_API + '/servers?id=' + episodeId;
  log('Getting servers...');
  
  return fetchJSON(url).then(function(data) {
    if (!data.success || !data.data) {
      throw new Error('Invalid servers response');
    }
    
    var servers = data.data;
    log('Found servers:', servers.sub ? servers.sub.length : 0);
    return servers;
  });
}

// Get stream
function getStream(episodeId, serverId, type) {
  var url = CONFIG.HIANIME_API + '/stream?id=' + episodeId + '&server=' + serverId + '&type=' + type;
  log('Getting stream from:', serverId);
  
  return fetchJSON(url).then(function(data) {
    if (!data.success || !data.data || !data.data.streamingLink) {
      throw new Error('Invalid stream response');
    }
    
    var streamData = data.data.streamingLink;
    log('Stream extracted:', streamData.link ? 'yes' : 'no');
    return streamData;
  });
}

// Main function
function getStreams(tmdbId, mediaType, season, episode) {
  return new Promise(function(resolve, reject) {
    if (mediaType !== 'tv') {
      log('Only TV shows supported');
      resolve([]);
      return;
    }
    
    log('START - TMDB:' + tmdbId + ' S' + season + 'E' + episode);
    
    var tmdbInfo;
    var bestMatch;
    var targetEpisode;
    var allStreams = [];
    
    // Step 1: Get TMDB info
    getTMDBInfo(tmdbId).then(function(info) {
      tmdbInfo = info;
      return sleep(300);
      
    }).then(function() {
      // Step 2: Search anime
      return searchAnime(tmdbInfo.title);
      
    }).then(function(searchResults) {
      if (searchResults.length === 0) {
        throw new Error('No search results');
      }
      
      // Find best match
      bestMatch = searchResults[0];
      var bestScore = calculateSimilarity(bestMatch.title, tmdbInfo.title);
      
      for (var i = 1; i < searchResults.length; i++) {
        var score = calculateSimilarity(searchResults[i].title, tmdbInfo.title);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = searchResults[i];
        }
      }
      
      log('Best match:', bestMatch.title);
      return sleep(300);
      
    }).then(function() {
      // Step 3: Get episodes
      return getEpisodes(bestMatch.id);
      
    }).then(function(episodes) {
      if (episodes.length === 0) {
        throw new Error('No episodes found');
      }
      
      // Find target episode (episode number is 1-based)
      if (episode > episodes.length) {
        throw new Error('Episode ' + episode + ' not found (total: ' + episodes.length + ')');
      }
      
      targetEpisode = episodes[episode - 1];
      log('Found episode:', episode);
      return sleep(300);
      
    }).then(function() {
      // Step 4: Get servers
      // Extract episode ID from URL like "/watch/anime-id?ep=123"
      var episodeId = targetEpisode.id.replace('/watch/', '').replace('?', '::');
      return getServers(episodeId);
      
    }).then(function(servers) {
      if (!servers.sub || servers.sub.length === 0) {
        throw new Error('No servers found');
      }
      
      // Use first 2 sub servers
      var subServers = servers.sub.slice(0, 2);
      log('Using servers:', subServers.length);
      
      // Step 5: Get streams from servers
      var promises = [];
      var episodeId = targetEpisode.id.replace('/watch/', '').replace('?', '::');
      
      for (var i = 0; i < subServers.length; i++) {
        promises.push(
          getStream(episodeId, subServers[i].name, 'sub')
            .then(function(streamData) {
              return {
                server: streamData.server || 'Unknown',
                data: streamData
              };
            })
            .catch(function(err) {
              log('Server failed:', err.message);
              return null;
            })
        );
      }
      
      return Promise.all(promises);
      
    }).then(function(streamResults) {
      // Step 6: Format streams
      var mediaTitle = tmdbInfo.title + ' S' + 
        ('0' + season).slice(-2) + 'E' + 
        ('0' + episode).slice(-2);
      
      for (var i = 0; i < streamResults.length; i++) {
        var result = streamResults[i];
        if (!result || !result.data || !result.data.link) continue;
        
        var streamData = result.data;
        var serverName = result.server;
        
        // Check if we have actual M3U8 link
        if (!streamData.link.file) continue;
        
        var quality = 'auto';
        if (streamData.link.file.indexOf('1080') >= 0) quality = '1080p';
        else if (streamData.link.file.indexOf('720') >= 0) quality = '720p';
        else if (streamData.link.file.indexOf('480') >= 0) quality = '480p';
        
        allStreams.push({
          name: 'HIANIME ' + serverName.toUpperCase() + ' - ' + quality,
          title: mediaTitle,
          url: streamData.link.file,
          quality: quality,
          size: 'Unknown',
          headers: {
            'User-Agent': CONFIG.HEADERS['User-Agent'],
            'Referer': 'https://hianime.to/',
            'Origin': 'https://hianime.to',
            'Accept': '*/*'
          },
          subtitles: streamData.tracks || [],
          provider: 'hianime',
          type: 'hls',
          intro: streamData.intro,
          outro: streamData.outro
        });
      }
      
      log('COMPLETE - Streams:', allStreams.length);
      
      if (allStreams.length === 0) {
        log('WARNING: No streams extracted, trying alternative method...');
      }
      
      resolve(allStreams);
      
    }).catch(function(err) {
      log('ERROR:', err.message);
      resolve([]);
    });
  });
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
}

log('HiAnime scraper loaded (API-based)');