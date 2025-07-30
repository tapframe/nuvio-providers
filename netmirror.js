// NetMirror Scraper for Nuvio Local Scrapers
// React Native compatible version

// Constants
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const MAIN_URL = 'https://a.net2025.cc';

// Global variables for authentication
let cookieValue = '';
let cookieTimestamp = 0;
const COOKIE_TTL = 15 * 60 * 60 * 1000; // 15 hours

// Helper function to make HTTP requests
async function makeRequest(url, options = {}) {
  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response;
}

// Get current Unix timestamp
function getUnixTime() {
  return Math.floor(Date.now() / 1000);
}

// Bypass authentication and get valid cookie
async function bypass() {
  const now = Date.now();
  if (cookieValue && (now - cookieTimestamp) < COOKIE_TTL) {
    return cookieValue;
  }

  console.log('[NetMirror] Bypassing authentication...');
  
  try {
    let verifyResponse;
    let responseText;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      if (attempts >= maxAttempts) {
        throw new Error('Max bypass attempts reached');
      }
      
      verifyResponse = await makeRequest(`${MAIN_URL}/tv/p.php`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      attempts++;
      
      // Convert response data to string for checking
      responseText = await verifyResponse.text();
        
    } while (!responseText.includes('"r":"n"'));

    // Extract cookie from response headers
    const setCookieHeader = verifyResponse.headers.get('set-cookie');
    console.log('[NetMirror] Set-Cookie header:', setCookieHeader);
    
    // Handle both string and array formats
    let cookieString = '';
    if (Array.isArray(setCookieHeader)) {
      cookieString = setCookieHeader.join('; ');
    } else if (typeof setCookieHeader === 'string') {
      cookieString = setCookieHeader;
    }
    
    if (cookieString) {
      const cookieMatch = cookieString.match(/t_hash_t=([^;]+)/);
      if (cookieMatch) {
        cookieValue = cookieMatch[1];
        cookieTimestamp = now;
        console.log('[NetMirror] Authentication successful');
        return cookieValue;
      } else {
        console.log('[NetMirror] t_hash_t cookie not found in header');
      }
    } else {
      console.log('[NetMirror] No valid set-cookie header found');
    }

    throw new Error('Failed to extract authentication cookie');
  } catch (error) {
    console.error(`[NetMirror] Authentication failed: ${error.message}`);
    throw error;
  }
}

// Get movie/TV show details from TMDB
async function getTMDBDetails(tmdbId, mediaType) {
  const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
  
  try {
    const response = await makeRequest(url);
    const data = await response.json();
    
    const title = mediaType === 'tv' ? data.name : data.title;
    const releaseDate = mediaType === 'tv' ? data.first_air_date : data.release_date;
    const year = releaseDate ? parseInt(releaseDate.split('-')[0]) : null;
    
    return {
      title: title,
      year: year,
      imdbId: data.external_ids?.imdb_id || null
    };
  } catch (error) {
    console.error(`[NetMirror] TMDB API error: ${error.message}`);
    throw error;
  }
}

// Search for content
async function searchContent(query, platform = 'netflix') {
  console.log(`[NetMirror] Searching for "${query}" on ${platform}...`);
  
  await bypass();
  
  const ottMap = {
    'netflix': 'nf',
    'primevideo': 'pv', 
    'disney': 'hs'
  };
  
  const ott = ottMap[platform.toLowerCase()] || 'nf';
  
  const cookieString = `t_hash_t=${cookieValue}; hd=on; ott=${ott}`;
  
  try {
    const response = await makeRequest(
      `${MAIN_URL}/search.php?s=${encodeURIComponent(query)}&t=${getUnixTime()}`,
      {
        headers: {
          'Cookie': cookieString,
          'Referer': `${MAIN_URL}/tv/home`
        }
      }
    );
    
    const searchData = await response.json();
    
    if (searchData.searchResult && searchData.searchResult.length > 0) {
      console.log(`[NetMirror] Found ${searchData.searchResult.length} results`);
      return searchData.searchResult.map(item => ({
        id: item.id,
        title: item.t,
        posterUrl: `https://imgcdn.media/poster/v/${item.id}.jpg`
      }));
    } else {
      console.log('[NetMirror] No results found');
      return [];
    }
  } catch (error) {
    console.error(`[NetMirror] Search failed: ${error.message}`);
    throw error;
  }
}

// Extract quality-specific playlist URLs from master playlist
async function extractQualityPlaylists(masterPlaylistUrl) {
  try {
    const response = await makeRequest(masterPlaylistUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Referer': 'https://net2025.cc/',
        'Origin': 'https://net2025.cc',
        'Accept': 'application/vnd.apple.mpegurl, video/mp4, */*'
      }
    });
    
    const content = await response.text();
    const lines = content.split('\n');
    const qualityPlaylists = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        // Parse quality info
        const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
        
        // Get the next line which should be the playlist URL
        if (i + 1 < lines.length) {
          const playlistUrl = lines[i + 1].trim();
          if (playlistUrl && !playlistUrl.startsWith('#')) {
            // Handle relative URLs
            let fullUrl = playlistUrl;
            if (playlistUrl.startsWith('/')) {
              const baseUrl = new URL(masterPlaylistUrl);
              fullUrl = `${baseUrl.protocol}//${baseUrl.host}${playlistUrl}`;
            } else if (!playlistUrl.startsWith('http')) {
              const baseUrl = masterPlaylistUrl.substring(0, masterPlaylistUrl.lastIndexOf('/') + 1);
              fullUrl = baseUrl + playlistUrl;
            }
            
            const resolution = resolutionMatch ? resolutionMatch[1] : 'Unknown';
            const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
            
            let quality = 'Unknown';
            if (resolution.includes('1920x1080')) quality = '1080p';
            else if (resolution.includes('1280x720')) quality = '720p';
            else if (resolution.includes('854x480')) quality = '480p';
            
            qualityPlaylists.push({
              url: fullUrl,
              quality: quality,
              resolution: resolution,
              bandwidth: bandwidth
            });
          }
        }
      }
    }
    
    return qualityPlaylists;
  } catch (error) {
    console.log(`[NetMirror] Could not extract quality playlists: ${error.message}`);
    return [];
  }
}

// Get streaming links for content
async function getStreamingLinks(contentId, title, platform = 'netflix') {
  console.log(`[NetMirror] Getting streaming links for: ${title}`);
  
  await bypass();
  
  const ottMap = {
    'netflix': 'nf',
    'primevideo': 'pv',
    'disney': 'hs'
  };
  
  const ott = ottMap[platform.toLowerCase()] || 'nf';
  const cookieString = `t_hash_t=${cookieValue}; ott=${ott}; hd=on`;
  
  try {
    const response = await makeRequest(
      `${MAIN_URL}/tv/playlist.php?id=${contentId}&t=${encodeURIComponent(title)}&tm=${getUnixTime()}`,
      {
        headers: {
          'Cookie': cookieString,
          'Referer': `${MAIN_URL}/tv/home`
        }
      }
    );
    
    const playlist = await response.json();
    
    if (!Array.isArray(playlist) || playlist.length === 0) {
      console.log('[NetMirror] No streaming links found');
      return { sources: [], subtitles: [] };
    }
    
    const sources = [];
    const subtitles = [];
    
    for (const item of playlist) {
      if (item.sources) {
        for (const source of item.sources) {
          // Convert relative URLs to absolute URLs
          let fullUrl = source.file;
          if (source.file.startsWith('/') && !source.file.startsWith('//')) {
            fullUrl = MAIN_URL + source.file;
          } else if (source.file.startsWith('//')) {
            fullUrl = 'https:' + source.file;
          }
          
          sources.push({
            url: fullUrl,
            quality: source.label,
            type: source.type || 'application/x-mpegURL'
          });
        }
      }

      if (item.tracks) {
        for (const track of item.tracks) {
          if (track.kind === 'captions') {
            // Convert relative URLs to absolute URLs for subtitles
            let fullSubUrl = track.file;
            if (track.file.startsWith('/') && !track.file.startsWith('//')) {
              fullSubUrl = MAIN_URL + track.file;
            } else if (track.file.startsWith('//')) {
              fullSubUrl = 'https:' + track.file;
            }
            
            subtitles.push({
              url: fullSubUrl,
              language: track.label
            });
          }
        }
      }
    }
    
    // Extract quality-specific playlist URLs from the first HLS source
    if (sources.length > 0) {
      console.log('[NetMirror] Extracting quality-specific playlist URLs...');
      const qualityPlaylists = await extractQualityPlaylists(sources[0].url);
      
      // Replace the master playlist sources with quality-specific ones
      if (qualityPlaylists.length > 0) {
        sources.length = 0; // Clear existing sources
        for (const playlist of qualityPlaylists) {
          sources.push({
            url: playlist.url,
            quality: playlist.quality,
            type: 'application/vnd.apple.mpegurl',
            resolution: playlist.resolution,
            bandwidth: playlist.bandwidth,
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
              'Referer': 'https://net2025.cc/',
              'Origin': 'https://net2025.cc',
              'Accept': 'application/vnd.apple.mpegurl, video/mp4, */*'
            }
          });
        }
      }
    }
    
    console.log(`[NetMirror] Found ${sources.length} quality-specific streaming sources and ${subtitles.length} subtitle tracks`);
    
    return { sources, subtitles };
  } catch (error) {
    console.error(`[NetMirror] Failed to get streaming links: ${error.message}`);
    throw error;
  }
}

// Main scraping function - Updated to match Nuvio interface
async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
  console.log(`[NetMirror] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}${mediaType === 'tv' ? `, S:${season}E:${episode}` : ''}`);
  
  try {
    // Get movie/TV show details from TMDB
    const mediaInfo = await getTMDBDetails(tmdbId, mediaType);
    
    if (!mediaInfo.title) {
      throw new Error('Could not extract title from TMDB response');
    }
    
    console.log(`[NetMirror] TMDB Info: "${mediaInfo.title}" (${mediaInfo.year || 'N/A'})`);
    
    const { title, year } = mediaInfo;
    
    // Determine platform based on content (default to Netflix)
    const platform = 'netflix';
    
    // Search for content
    const searchResults = await searchContent(title, platform);
    
    if (searchResults.length === 0) {
      console.log(`[NetMirror] No search results found for "${title}"`);
      return [];
    }
    
    // Use first result
    const firstResult = searchResults[0];
    console.log(`[NetMirror] Selected: ${firstResult.title}`);
    
    // Get streaming links
    const streamingData = await getStreamingLinks(firstResult.id, firstResult.title, platform);
    
    if (!streamingData.sources || streamingData.sources.length === 0) {
      console.log(`[NetMirror] No streaming sources found`);
      return [];
    }
    
    // Format streams for Nuvio
    const streams = [];
    
    for (const source of streamingData.sources) {
      const mediaTitle = mediaType === 'tv' && season && episode 
        ? `${title} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
        : year ? `${title} (${year})` : title;
      
      // Platform-specific URL handling
          let finalUrl = source.url;
          
          // For iOS, we need to provide alternative URLs since the CDN has compatibility issues
          // For now, keep original URLs for Android compatibility
          // TODO: Implement iOS-specific URL conversion or alternative CDN mapping
          
          console.log(`[NetMirror] Using original URL for compatibility: ${source.url}`);
          
          streams.push({
            name: `NetMirror - ${source.quality}`,
            title: mediaTitle,
            url: finalUrl,
            quality: source.quality,
            size: 'Unknown',
            fileName: `${title.replace(/[^a-zA-Z0-9]/g, '_')}_${source.quality}.m3u8`,
            type: 'M3U8',
            headers: {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
              'Referer': 'https://net2025.cc/',
              'Origin': 'https://net2025.cc',
              'Accept': 'application/vnd.apple.mpegurl, video/mp4, */*'
            }
          });
    }
    
    // Sort by quality (highest first)
    const qualityOrder = { '1080p': 3, '720p': 2, '480p': 1, 'Unknown': 0 };
    streams.sort((a, b) => (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0));
    
    console.log(`[NetMirror] Successfully processed ${streams.length} streams`);
    return streams;
    
  } catch (error) {
    console.error(`[NetMirror] Error in getStreams: ${error.message}`);
    return [];
  }
}

// Export the main function
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  // For React Native environment
  global.getStreams = getStreams;
}