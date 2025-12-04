// Vidsrc.cc Scraper for Nuvio
// Ported from StreamPlay (Kotlin)

const VIDSRC_API = "https://vidsrc.cc"; //

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    return new Promise((resolve, reject) => {
        // 1. Construct Embed URL
        // Source: StreamPlayExtractor.kt line 994
        let url;
        if (mediaType === 'movie') {
            url = `${VIDSRC_API}/v2/embed/movie/${tmdbId}?autoPlay=false`;
        } else {
            url = `${VIDSRC_API}/v2/embed/tv/${tmdbId}/${seasonNum}/${episodeNum}?autoPlay=false`;
        }

        fetch(url)
        .then(res => res.text())
        .then(html => {
            // 2. Extract Config Variables
            // Source: StreamPlayExtractor.kt line 996 (Regex extraction)
            const extract = (name) => {
                const regex = new RegExp(`var\\s+${name}\\s*=\\s*["']([^"']+)["']`);
                const match = html.match(regex);
                return match ? match[1] : "";
            };

            const dataId = extract("id"); // internal ID, not TMDB ID
            const v = extract("v");
            const vrf = extract("vrf"); // Note: Kotlin generates this, but web usually provides it in headers or script
            
            if (!dataId) { resolve([]); return; }

            // 3. Call Servers API
            // Source: StreamPlayExtractor.kt line 998
            const typeStr = mediaType === 'movie' ? 'movie' : 'tv';
            let api = `${VIDSRC_API}/api/${dataId}/servers?id=${dataId}&type=${typeStr}`;
            if (mediaType === 'tv') api += `&season=${seasonNum}&episode=${episodeNum}`;
            
            return fetch(api);
        })
        .then(res => res ? res.json() : {})
        .then(json => {
            const data = json.data || [];
            const streams = [];
            
            // 4. Process Servers
            // Source: StreamPlayExtractor.kt line 999
            const promises = data.map(server => {
                return fetch(`${VIDSRC_API}/api/source/${server.hash}`)
                    .then(r => r.json())
                    .then(srcJson => {
                        if (srcJson.data && srcJson.data.source) {
                            streams.push({
                                name: `Vidsrc.cc - ${server.name}`,
                                title: server.name,
                                url: srcJson.data.source,
                                quality: server.name.includes("4K") ? "4K" : "1080p",
                                provider: "vidsrccc"
                            });
                        }
                    })
                    .catch(() => {});
            });

            return Promise.all(promises).then(() => resolve(streams));
        })
        .catch(err => {
            console.error("Vidsrc Error", err);
            resolve([]);
        });
    });
}

if (typeof module !== 'undefined') module.exports = { getStreams };
else global.getStreams = getStreams;
