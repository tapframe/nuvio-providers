/**
 * Vixsrc Scraper for Nuvio Local Scrapers
 * Modular version - Main entry point
 * 
 * This scraper is split into multiple files for better maintainability:
 * - api.js: HTTP requests, TMDB API, subtitles
 * - parser.js: M3U8 parsing, quality detection
 * - extractor.js: Stream extraction from pages
 */

import { getTmdbInfo, getSubtitles, BASE_URL } from './api.js';
import { extractStreamFromPage } from './extractor.js';

/**
 * Main function to get streams - Nuvio provider format
 * @param {string} tmdbId - TMDB ID
 * @param {string} mediaType - 'movie' or 'tv'
 * @param {number} seasonNum - Season number (TV only)
 * @param {number} episodeNum - Episode number (TV only)
 * @returns {Promise<Array>} Array of stream objects
 */
function getStreams(tmdbId, mediaType = 'movie', seasonNum = null, episodeNum = null) {
    console.log(`[Vixsrc] Fetching streams for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

    return getTmdbInfo(tmdbId, mediaType)
        .then(tmdbInfo => {
            const { title, year } = tmdbInfo;

            // Extract stream from Vixsrc page
            return extractStreamFromPage(null, mediaType, tmdbId, seasonNum, episodeNum);
        })
        .then(streamData => {
            if (!streamData) {
                console.log('[Vixsrc] No stream data found');
                return [];
            }

            const { masterPlaylistUrl, subtitleApiUrl } = streamData;

            // Return single master playlist with Auto quality
            console.log('[Vixsrc] Returning master playlist with Auto quality...');

            // Get subtitles
            return getSubtitles(subtitleApiUrl)
                .then(subtitles => {
                    // Return single stream with master playlist
                    const nuvioStreams = [{
                        name: "Vixsrc",
                        title: "Auto Quality Stream",
                        url: masterPlaylistUrl,
                        quality: 'Auto',
                        type: 'direct',
                        headers: {
                            'Referer': BASE_URL,
                            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                        }
                    }];

                    console.log('[Vixsrc] Successfully processed 1 stream with Auto quality');
                    return nuvioStreams;
                });
        })
        .catch(error => {
            console.error(`[Vixsrc] Error in getStreams: ${error.message}`);
            return [];
        });
}

// Export for React Native
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.VixsrcScraperModule = { getStreams };
}
