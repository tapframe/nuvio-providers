/**
 * Vixsrc Parser Module
 * Handles M3U8 parsing and URL resolution
 */

/**
 * Get quality string from resolution
 * @param {string} resolution - Resolution string (e.g., "1920x1080")
 * @returns {string} Quality string (e.g., "1080p")
 */
export function getQualityFromResolution(resolution) {
    if (resolution.includes('1920x1080') || resolution.includes('1080')) {
        return '1080p';
    } else if (resolution.includes('1280x720') || resolution.includes('720')) {
        return '720p';
    } else if (resolution.includes('854x480') || resolution.includes('640x480') || resolution.includes('480')) {
        return '480p';
    } else if (resolution.includes('640x360') || resolution.includes('360')) {
        return '360p';
    } else {
        return resolution;
    }
}

/**
 * Resolve relative URL to absolute URL
 * @param {string} url - URL to resolve (can be relative or absolute)
 * @param {string} baseUrl - Base URL for resolution
 * @returns {string} Absolute URL
 */
export function resolveUrl(url, baseUrl) {
    if (url.startsWith('http')) {
        return url;
    }

    // Handle relative URLs
    const baseUrlObj = new URL(baseUrl);
    if (url.startsWith('/')) {
        return `${baseUrlObj.protocol}//${baseUrlObj.host}${url}`;
    } else {
        const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/') + 1);
        return `${baseUrlObj.protocol}//${baseUrlObj.host}${basePath}${url}`;
    }
}

/**
 * Parse M3U8 playlist content
 * @param {string} content - M3U8 playlist content
 * @param {string} baseUrl - Base URL for resolving relative paths
 * @returns {{streams: Array, audioTracks: Array}} Parsed streams and audio tracks
 */
export function parseM3U8Playlist(content, baseUrl) {
    const streams = [];
    const audioTracks = [];
    const lines = content.split('\n');

    let currentStream = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Parse video streams
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            // Parse stream info
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
            const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            const nameMatch = line.match(/NAME="([^"]+)"/) || line.match(/NAME=([^,]+)/);

            if (bandwidthMatch) {
                currentStream = {
                    bandwidth: parseInt(bandwidthMatch[1]),
                    resolution: resolutionMatch ? resolutionMatch[1] : 'Unknown',
                    quality: nameMatch ? nameMatch[1] : getQualityFromResolution(resolutionMatch ? resolutionMatch[1] : 'Unknown'),
                    url: ''
                };
            }
        }
        // Parse audio tracks
        else if (line.startsWith('#EXT-X-MEDIA:')) {
            const typeMatch = line.match(/TYPE=([^,]+)/);
            const nameMatch = line.match(/NAME="([^"]+)"/);
            const groupIdMatch = line.match(/GROUP-ID="([^"]+)"/);
            const languageMatch = line.match(/LANGUAGE="([^"]+)"/);
            const uriMatch = line.match(/URI="([^"]+)"/);

            if (typeMatch && typeMatch[1] === 'AUDIO') {
                const audioTrack = {
                    type: 'audio',
                    name: nameMatch ? nameMatch[1] : 'Unknown Audio',
                    groupId: groupIdMatch ? groupIdMatch[1] : 'unknown',
                    language: languageMatch ? languageMatch[1] : 'unknown',
                    url: uriMatch ? resolveUrl(uriMatch[1], baseUrl) : null
                };
                audioTracks.push(audioTrack);
            }
        }
        // Handle URLs for video streams
        else if (line.startsWith('http') && currentStream) {
            // This is the URL for the current video stream
            currentStream.url = line.startsWith('http') ? line : resolveUrl(line, baseUrl);
            streams.push(currentStream);
            currentStream = null;
        }
    }

    console.log(`[Vixsrc] Found ${audioTracks.length} audio tracks:`);
    audioTracks.forEach((track, index) => {
        console.log(`   ${index + 1}. ${track.name} (${track.language}) - ${track.url ? 'Available' : 'No URL'}`);
    });

    return { streams, audioTracks };
}
