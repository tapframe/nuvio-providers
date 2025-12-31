/**
 * Shared utility functions for Nuvio scrapers.
 * Import these in your scraper files:
 * 
 *   import { parseQuality, parseSize, createStream } from '../shared/utils.js';
 */

/**
 * Parse quality string from various formats
 * @param {string} str - String containing quality info
 * @returns {string} Normalized quality string
 */
export function parseQuality(str) {
    if (!str) return 'Unknown';

    const qualityPatterns = [
        { pattern: /4k|2160p|uhd/i, quality: '4K' },
        { pattern: /1080p|fhd|full\s*hd/i, quality: '1080p' },
        { pattern: /720p|hd/i, quality: '720p' },
        { pattern: /480p|sd/i, quality: '480p' },
        { pattern: /360p/i, quality: '360p' },
    ];

    for (const { pattern, quality } of qualityPatterns) {
        if (pattern.test(str)) {
            return quality;
        }
    }

    return 'Unknown';
}

/**
 * Parse file size from various formats
 * @param {string} str - String containing size info (e.g., "1.5 GB", "500MB")
 * @returns {string} Normalized size string
 */
export function parseSize(str) {
    if (!str) return 'Unknown';

    const match = str.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB|TB)/i);
    if (match) {
        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        return `${value} ${unit}`;
    }

    return str;
}

/**
 * Create a standardized stream object
 * @param {Object} options - Stream options
 * @param {string} options.name - Stream name/title
 * @param {string} options.url - Stream URL
 * @param {string} options.quality - Quality (720p, 1080p, etc.)
 * @param {string} [options.size] - File size
 * @param {string} options.provider - Provider name
 * @param {Object} [options.headers] - Optional headers for playback
 * @returns {Object} Standardized stream object
 */
export function createStream({ name, url, quality, size, provider, headers }) {
    return {
        name: name || `${provider} - ${quality}`,
        title: name,
        url: url,
        quality: quality || 'Unknown',
        size: size || 'Unknown',
        provider: provider,
        headers: headers || undefined
    };
}

/**
 * Delay execution for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string} Domain name
 */
export function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch (e) {
        return '';
    }
}

/**
 * Clean and normalize title
 * @param {string} title - Original title
 * @returns {string} Cleaned title
 */
export function cleanTitle(title) {
    if (!title) return '';

    return title
        .replace(/\[.*?\]/g, '')  // Remove brackets
        .replace(/\(.*?\)/g, '')  // Remove parentheses
        .replace(/\s+/g, ' ')     // Normalize spaces
        .trim();
}

/**
 * Check if URL is valid
 * @param {string} url - URL to validate
 * @returns {boolean} Whether URL is valid
 */
export function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;

    try {
        new URL(url);
        return url.startsWith('http://') || url.startsWith('https://');
    } catch (e) {
        return false;
    }
}

/**
 * Generate user agent string
 * @returns {string} User agent string
 */
export function getUserAgent() {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}

/**
 * Default headers for requests
 */
export const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive'
};
