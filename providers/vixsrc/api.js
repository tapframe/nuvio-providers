/**
 * Vixsrc API Module
 * Handles TMDB API calls and HTTP requests
 */

// Constants
export const TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
export const BASE_URL = 'https://vixsrc.to';

// Default headers for requests
export const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json,*/*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive'
};

/**
 * Make HTTP request with default headers
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
export function makeRequest(url, options = {}) {
    const headers = {
        ...DEFAULT_HEADERS,
        ...options.headers
    };

    return fetch(url, {
        method: options.method || 'GET',
        headers: headers,
        ...options
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response;
        })
        .catch(error => {
            console.error(`[Vixsrc] Request failed for ${url}: ${error.message}`);
            throw error;
        });
}

/**
 * Get TMDB info for a title
 * @param {string} tmdbId - TMDB ID
 * @param {string} mediaType - 'movie' or 'tv'
 * @returns {Promise<{title: string, year: string, data: Object}>}
 */
export function getTmdbInfo(tmdbId, mediaType) {
    const url = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    return makeRequest(url)
        .then(response => response.json())
        .then(data => {
            const title = mediaType === 'tv' ? data.name : data.title;
            const year = mediaType === 'tv' ? data.first_air_date?.substring(0, 4) : data.release_date?.substring(0, 4);

            if (!title) {
                throw new Error('Could not extract title from TMDB response');
            }

            console.log(`[Vixsrc] TMDB Info: "${title}" (${year})`);
            return { title, year, data };
        });
}

/**
 * Get subtitles from subtitle API
 * @param {string} subtitleApiUrl - Subtitle API URL
 * @returns {Promise<string>} Subtitle URL or empty string
 */
export function getSubtitles(subtitleApiUrl) {
    return makeRequest(subtitleApiUrl)
        .then(response => response.json())
        .then(subtitleData => {
            // Find English subtitle track
            let subtitleTrack = subtitleData.find(track =>
                track.display.includes('English') && (track.encoding === 'ASCII' || track.encoding === 'UTF-8')
            );

            if (!subtitleTrack) {
                subtitleTrack = subtitleData.find(track => track.display.includes('English') && track.encoding === 'CP1252');
            }

            if (!subtitleTrack) {
                subtitleTrack = subtitleData.find(track => track.display.includes('English') && track.encoding === 'CP1250');
            }

            if (!subtitleTrack) {
                subtitleTrack = subtitleData.find(track => track.display.includes('English') && track.encoding === 'CP850');
            }

            const subtitles = subtitleTrack ? subtitleTrack.url : '';
            console.log(subtitles ? `[Vixsrc] Found subtitles: ${subtitles}` : '[Vixsrc] No English subtitles found');
            return subtitles;
        })
        .catch(error => {
            console.log('[Vixsrc] Subtitle fetch failed:', error.message);
            return '';
        });
}
