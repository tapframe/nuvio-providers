/**
 * Vixsrc Extractor Module
 * Handles stream extraction from Vixsrc pages
 */

import { makeRequest, BASE_URL } from './api.js';

/**
 * Extract stream URL from Vixsrc page
 * @param {string} url - Not used (kept for compatibility)
 * @param {string} contentType - 'movie' or 'tv'
 * @param {string} contentId - TMDB ID
 * @param {number} seasonNum - Season number (TV only)
 * @param {number} episodeNum - Episode number (TV only)
 * @returns {Promise<{masterPlaylistUrl: string, subtitleApiUrl: string}|null>}
 */
export function extractStreamFromPage(url, contentType, contentId, seasonNum, episodeNum) {
    let vixsrcUrl;
    let subtitleApiUrl;

    if (contentType === 'movie') {
        vixsrcUrl = `${BASE_URL}/movie/${contentId}`;
        subtitleApiUrl = `https://sub.wyzie.ru/search?id=${contentId}`;
    } else {
        vixsrcUrl = `${BASE_URL}/tv/${contentId}/${seasonNum}/${episodeNum}`;
        subtitleApiUrl = `https://sub.wyzie.ru/search?id=${contentId}&season=${seasonNum}&episode=${episodeNum}`;
    }

    console.log(`[Vixsrc] Fetching: ${vixsrcUrl}`);

    return makeRequest(vixsrcUrl, {
        headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
    })
        .then(response => response.text())
        .then(html => {
            console.log(`[Vixsrc] HTML length: ${html.length} characters`);

            let masterPlaylistUrl = null;

            // Method 1: Look for window.masterPlaylist (primary method)
            if (html.includes('window.masterPlaylist')) {
                console.log('[Vixsrc] Found window.masterPlaylist');

                const urlMatch = html.match(/url:\s*['"]([^'"]+)['"]/);
                const tokenMatch = html.match(/['"]?token['"]?\s*:\s*['"]([^'"]+)['"]/);
                const expiresMatch = html.match(/['"]?expires['"]?\s*:\s*['"]([^'"]+)['"]/);

                if (urlMatch && tokenMatch && expiresMatch) {
                    const baseUrl = urlMatch[1];
                    const token = tokenMatch[1];
                    const expires = expiresMatch[1];

                    console.log('[Vixsrc] Extracted tokens:');
                    console.log(`  - Base URL: ${baseUrl}`);
                    console.log(`  - Token: ${token.substring(0, 20)}...`);
                    console.log(`  - Expires: ${expires}`);

                    // Construct the master playlist URL
                    if (baseUrl.includes('?b=1')) {
                        masterPlaylistUrl = `${baseUrl}&token=${token}&expires=${expires}&h=1&lang=en`;
                    } else {
                        masterPlaylistUrl = `${baseUrl}?token=${token}&expires=${expires}&h=1&lang=en`;
                    }

                    console.log(`[Vixsrc] Constructed master playlist URL: ${masterPlaylistUrl}`);
                }
            }

            // Method 2: Look for direct .m3u8 URLs
            if (!masterPlaylistUrl) {
                const m3u8Match = html.match(/(https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)/);
                if (m3u8Match) {
                    masterPlaylistUrl = m3u8Match[1];
                    console.log('[Vixsrc] Found direct .m3u8 URL:', masterPlaylistUrl);
                }
            }

            // Method 3: Look for stream URLs in script tags
            if (!masterPlaylistUrl) {
                const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gs);
                if (scriptMatches) {
                    for (const script of scriptMatches) {
                        const streamMatch = script.match(/['"]?(https?:\/\/[^'"\s]+(?:\.m3u8|playlist)[^'"\s]*)/);
                        if (streamMatch) {
                            masterPlaylistUrl = streamMatch[1];
                            console.log('[Vixsrc] Found stream in script:', masterPlaylistUrl);
                            break;
                        }
                    }
                }
            }

            if (!masterPlaylistUrl) {
                console.log('[Vixsrc] No master playlist URL found');
                return null;
            }

            return { masterPlaylistUrl, subtitleApiUrl };
        });
}
