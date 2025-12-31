/**
 * Shared video extractor utilities for Nuvio scrapers.
 * Import these in your scraper files:
 * 
 *   import { extractM3U8, extractMP4, Extractor } from '../shared/extractors.js';
 */

import { isValidUrl, DEFAULT_HEADERS } from './utils.js';

/**
 * Base Extractor class - extend this for custom extractors
 */
export class Extractor {
    constructor(name) {
        this.name = name;
    }

    /**
     * Extract streams from a URL
     * @param {string} url - Source URL
     * @returns {Promise<Array>} Array of stream objects
     */
    extract(url) {
        return Promise.resolve([]);
    }

    /**
     * Check if this extractor can handle the URL
     * @param {string} url - URL to check
     * @returns {boolean}
     */
    canHandle(url) {
        return false;
    }
}

/**
 * Extract M3U8 stream URL from page
 * @param {string} html - HTML content
 * @returns {string|null} M3U8 URL if found
 */
export function extractM3U8(html) {
    if (!html) return null;

    const patterns = [
        /"file"\s*:\s*"([^"]+\.m3u8[^"]*)"/i,
        /'file'\s*:\s*'([^']+\.m3u8[^']*)'/i,
        /source\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i,
        /src\s*=\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i,
        /https?:\/\/[^\s'"<>]+\.m3u8[^\s'"<>]*/i
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
            const url = match[1] || match[0];
            if (isValidUrl(url)) {
                return url;
            }
        }
    }

    return null;
}

/**
 * Extract MP4 stream URL from page
 * @param {string} html - HTML content
 * @returns {string|null} MP4 URL if found
 */
export function extractMP4(html) {
    if (!html) return null;

    const patterns = [
        /"file"\s*:\s*"([^"]+\.mp4[^"]*)"/i,
        /'file'\s*:\s*'([^']+\.mp4[^']*)'/i,
        /source\s*:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i,
        /src\s*=\s*['"]([^'"]+\.mp4[^'"]*)['"]/i,
        /https?:\/\/[^\s'"<>]+\.mp4[^\s'"<>]*/i
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
            const url = match[1] || match[0];
            if (isValidUrl(url)) {
                return url;
            }
        }
    }

    return null;
}

/**
 * Extract all video sources from HTML
 * @param {string} html - HTML content
 * @returns {Array<{url: string, type: string}>} Array of video sources
 */
export function extractAllSources(html) {
    const sources = [];

    // M3U8
    const m3u8 = extractM3U8(html);
    if (m3u8) {
        sources.push({ url: m3u8, type: 'm3u8' });
    }

    // MP4
    const mp4 = extractMP4(html);
    if (mp4) {
        sources.push({ url: mp4, type: 'mp4' });
    }

    return sources;
}

/**
 * Decode packed JavaScript (basic p,a,c,k,e,d)
 * @param {string} packed - Packed JavaScript
 * @returns {string} Decoded JavaScript
 */
export function decodePacked(packed) {
    if (!packed) return '';

    const match = packed.match(/}\('(.+)',(\d+),(\d+),'([^']+)'\.split/);
    if (!match) return packed;

    const [, p, a, c, k] = match;
    const keywords = k.split('|');

    return p.replace(/\b\w+\b/g, (word) => {
        const index = parseInt(word, parseInt(a));
        return keywords[index] || word;
    });
}

/**
 * Common embed extractors
 */
export const embedExtractors = {
    /**
     * Check if URL is a known embed type
     * @param {string} url - URL to check
     * @returns {string|null} Embed type or null
     */
    getType(url) {
        if (!url) return null;

        const types = {
            filemoon: /filemoon|moonplayer/i,
            vidmoly: /vidmoly/i,
            streamwish: /streamwish|wishstream/i,
            doodstream: /dood|doodstream/i,
            mixdrop: /mixdrop/i,
            mp4upload: /mp4upload/i,
            streamtape: /streamtape/i,
            vidcloud: /vidcloud|rabbitstream/i
        };

        for (const [type, pattern] of Object.entries(types)) {
            if (pattern.test(url)) {
                return type;
            }
        }

        return null;
    }
};
