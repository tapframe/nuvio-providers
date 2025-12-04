// file: streamplay_full_nuvio.js
// StreamPlay -> Nuvio mega scraper (Promise-only)
// Best-effort port of StreamPlay Kotlin extension to a Nuvio-compatible JS provider.
// Uses cheerio-without-node-native for HTML parsing.

const cheerio = require('cheerio-without-node-native');

// TMDB API (replace if you have your own key)
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Domain JSON used by StreamPlay plugin (keeps domains up-to-date)
const DOMAINS_URL = "https://raw.githubusercontent.com/phisher98/TVVVV/refs/heads/main/domains.json";

// Default base (fallback)
let MAIN_URL = "https://hdhub4u.frl";
const DOMAIN_CACHE_TTL = 4 * 60 * 60 * 1000;
let domainCacheTimestamp = 0;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "Cookie": "xla=s4t",
  "Referer": `${MAIN_URL}/`
};

// ------------------ Utilities ------------------
function formatBytes(bytes){
  if(!bytes || bytes === 0) return 'Unknown';
  const k = 1024; const sizes = ['Bytes','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes)/Math.log(k));
  return parseFloat((bytes/Math.pow(k,i)).toFixed(1)) + ' ' + sizes[i];
}
function extractServerName(source){
  if(!source) return 'Unknown';
  const s = String(source).trim();
  if(s.startsWith('HubCloud')) {
    const m = s.match(/HubCloud(?:\s*-\s*([^[\]]+))?/);
    return m ? (m[1] ? m[1].trim() : 'Download') : 'HubCloud';
  }
  if(s.startsWith('Pixeldrain')) return 'Pixeldrain';
  if(s.startsWith('StreamTape')) return 'StreamTape';
  if(s.startsWith('HubCdn')) return 'HubCdn';
  if(s.startsWith('HbLinks')) return 'HbLinks';
  if(s.startsWith('Hubstream')) return 'Hubstream';
  return s.replace(/^www\./,'').split('.')[0];
}
function normalizeTitle(t){ if(!t) return ''; return String(t).toLowerCase().replace(/\b(the|a|an)\b/g,'').replace(/[:\-_]/g,' ').replace(/\s+/g,' ').replace(/[^\w\s]/g,'').trim(); }
function calculateTitleSimilarity(a,b){
  const A = normalizeTitle(a), B = normalizeTitle(b);
  if(!A || !B) return 0;
  if(A === B) return 1.0;
  if(A.includes(B) || B.includes(A)) return 0.9;
  const s1 = new Set(A.split(/\s+/).filter(w=>w.length>2));
  const s2 = new Set(B.split(/\s+/).filter(w=>w.length>2));
  if(s1.size === 0 || s2.size === 0) return 0;
  const inter = [...s1].filter(x=>s2.has(x)).length;
  const union = new Set([...s1, ...s2]).size;
  return inter/union;
}
function getQualityLabel(q){
  if(typeof q === 'number'){
    if(q >= 2160) return '4K';
    if(q >= 1440) return '1440p';
    if(q >= 1080) return '1080p';
    if(q >= 720) return '720p';
    if(q >= 480) return '480p';
    return 'Unknown';
  }
  if(typeof q === 'string'){
    const s = q.toLowerCase();
    if(s.includes('2160') || s.includes('4k')) return '4K';
    if(s.includes('1440')) return '1440p';
    if(s.includes('1080')) return '1080p';
    if(s.includes('720')) return '720p';
    if(s.includes('480')) return '480p';
  }
  return 'Unknown';
}

// rot13 + basic base64 helpers (RN-safe)
function rot13(v){ if(!v) return ''; return String(v).replace(/[a-zA-Z]/g, function(c){ const code=c.charCodeAt(0); const base = (code>=97)?97:65; return String.fromCharCode(((code-base+13)%26)+base); }); }
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function atobPoly(input){ if(typeof atob !== 'undefined') return atob(input); if(!input) return ''; let str=String(input).replace(/=+$/,''); let out=''; let bc=0, bs, buffer, idx=0; while((buffer=str.charAt(idx++))){ buffer = BASE64_CHARS.indexOf(buffer); if(~buffer){ bs = bc % 4 ? bs*64 + buffer : buffer; if(bc++ % 4) out += String.fromCharCode(255 & (bs >> ((-2*bc)&6))); } } return out; }
function btoaPoly(value){ if(typeof btoa !== 'undefined') return btoa(value); if(value == null) return ''; let str = String(value); let out=''; let i=0; while(i<str.length){ const chr1=str.charCodeAt(i++); const chr2 = i<str.length ? str.charCodeAt(i++) : NaN; const chr3 = i<str.length ? str.charCodeAt(i++) : NaN; const enc1 = chr1>>2; const enc2 = ((chr1 & 3) << 4) | (isNaN(chr2) ? 0 : (chr2>>4)); let enc3 = isNaN(chr2) ? 64 : (((chr2 & 15) << 2) | (isNaN(chr3) ? 0 : (chr3>>6))); let enc4 = isNaN(chr3) ? 64 : (chr3 & 63); out += BASE64_CHARS.charAt(enc1)+BASE64_CHARS.charAt(enc2)+BASE64_CHARS.charAt(enc3)+BASE64_CHARS.charAt(enc4); } return out; }

// ------------------ Domain management ------------------
function fetchAndUpdateDomain(){
  const now = Date.now();
  if(now - domainCacheTimestamp < DOMAIN_CACHE_TTL) return Promise.resolve();
  return fetch(DOMAINS_URL, { headers: { 'User-Agent': HEADERS['User-Agent'] } })
    .then(function(r){ if(!r.ok) return; return r.json().catch(function(){ return null; }); })
    .then(function(data){
      if(!data) return;
      if(data.StreamPlay) MAIN_URL = data.StreamPlay;
      else if(data.HDHUB4u) MAIN_URL = data.HDHUB4u;
      HEADERS.Referer = `${MAIN_URL}/`;
      domainCacheTimestamp = Date.now();
    }).catch(function(){ /* ignore */ });
}
function getCurrentDomain(){ return fetchAndUpdateDomain().then(function(){ return MAIN_URL; }); }

// ------------------ Redirect resolver (nested decode) ------------------
function getRedirectLinks(url){
  return fetch(url, { headers: HEADERS }).then(function(resp){
    if(!resp.ok) return url;
    return resp.text();
  }).then(function(doc){
    if(!doc) return url;
    const regex = /s\('o','([A-Za-z0-9+/=]+)'|ck\('_wp_http_\d+','([^']+)'/g;
    let match; let combined = '';
    while((match = regex.exec(doc)) !== null){
      combined += (match[1] || match[2] || '');
    }
    if(!combined) return url;
    try {
      // attempt nested decode
      const step1 = atobPoly(combined);
      const step2 = rot13(step1);
      const step3 = atobPoly(step2);
      const decoded = atobPoly(step3);
      const json = JSON.parse(decoded);
      const encodedUrl = (json.o && atobPoly(json.o).trim()) || '';
      if(encodedUrl) return encodedUrl;
      const data = (json.data && btoaPoly(json.data).trim()) || '';
      const blog = (json.blog_url || '').trim();
      if(blog && data){
        return fetch(`${blog}?re=${data}`, { headers: HEADERS }).then(function(r){ return r.ok ? r.text().then(function(t){ return t.trim() || url; }) : url; });
      }
    } catch(e){
      try { const one = atobPoly(combined); if(one) return one; } catch(e2){ return url; }
    }
    return url;
  }).catch(function(){ return url; });
}

// ------------------ Extractors (many, Promise-only) ------------------

// PixelDrain
function pixelDrainExtractor(link){
  return new Promise(function(resolve){
    try {
      const m = link.match(/(?:file|u)\/([A-Za-z0-9]+)/);
      const fileId = m ? m[1] : String(link).split('/').filter(Boolean).pop();
      if(!fileId) return resolve([{ source: 'Pixeldrain', quality: 'Unknown', url: link }]);
      const infoUrl = `https://pixeldrain.com/api/file/${fileId}/info`;
      fetch(infoUrl, { headers: HEADERS })
        .then(function(r){ return r.ok ? r.json().catch(function(){ return {}; }) : {}; })
        .then(function(info){
          const name = info && info.name ? info.name : '';
          const size = info && info.size ? info.size : 0;
          const qmatch = name.match(/(\d{3,4})p/);
          const quality = qmatch ? qmatch[0] : 'Unknown';
          resolve([{ source: 'Pixeldrain', quality: quality, url: `https://pixeldrain.com/api/file/${fileId}?download`, name: name, size: size }]);
        }).catch(function(){ resolve([{ source:'Pixeldrain', quality:'Unknown', url: `https://pixeldrain.com/api/file/${fileId}?download` }]); });
    } catch(e){ resolve([{ source:'Pixeldrain', quality:'Unknown', url: link }]); }
  });
}

// StreamTape
function streamTapeExtractor(link){
  return fetch(link, { headers: HEADERS }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(data){
    if(!data) return [];
    let m = data.match(/document\.getElementById\('videolink'\)\.innerHTML\s*=\s*(.*?);/s);
    if(m && m[1]) {
      const script = m[1];
      const urlPart = script.match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
      if(urlPart && urlPart[1]) return [{ source: 'StreamTape', quality: 'Stream', url: 'https:' + urlPart[1] }];
    }
    m = data.match(/'(\/\/streamtape\.com\/get_video[^']+)'/);
    if(m && m[1]) return [{ source: 'StreamTape', quality: 'Stream', url: 'https:' + m[1] }];
    const fb = data.match(/https?:\/\/[^\s'"]+\.(m3u8|mp4)(\?[^'"]*)?/i);
    if(fb) return [{ source:'StreamTape', quality:'Stream', url: fb[0] }];
    return [];
  }).catch(function(){ return []; });
}

// HubCdn (m3u8 encoded)
function hubCdnExtractor(url, referer){
  return fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer || HEADERS.Referer }) }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(html){
    if(!html) return [];
    const m = html.match(/r=([A-Za-z0-9+/=]+)/);
    if(m && m[1]) {
      try {
        const decoded = atobPoly(m[1]);
        const idx = decoded.lastIndexOf('link=');
        if(idx !== -1) {
          const link = decoded.substring(idx + 5);
          return [{ source: 'HubCdn', quality: 'M3U8', url: link }];
        }
      } catch(e){ /* ignore */ }
    }
    return [];
  }).catch(function(){ return []; });
}

// HubDrive
function hubDriveExtractor(url, referer){
  return fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer || HEADERS.Referer }) }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(html){
    if(!html) return [];
    const $ = cheerio.load(html);
    const href = $('.btn.btn-primary.btn-user.btn-success1.m-1').attr('href');
    if(href) return loadExtractor(href, url);
    return [];
  }).catch(function(){ return []; });
}

// HubCloud (complex)
function hubCloudExtractor(url, referer){
  return fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer || HEADERS.Referer }) }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(html){
    if(!html) return [];
    const $ = cheerio.load(html);
    const sizeStr = $('i#size').text().trim();
    const header = $('div.card-header').text().trim();
    const getIndexQuality = function(str){ const m = (str||'').match(/(\d{3,4})[pP]/); return m ? parseInt(m[1]) : 2160; };
    const quality = getIndexQuality(header);
    const headerDetails = header || '';
    const labelExtras = (headerDetails ? `[${headerDetails}]` : '') + (sizeStr ? `[${sizeStr}]` : '');
    const parseSize = (function(){
      if(!sizeStr) return 0;
      const sm = sizeStr.match(/([\d.]+)\s*(GB|MB|KB)/i);
      if(!sm) return 0;
      const val = parseFloat(sm[1]); const unit = sm[2].toUpperCase();
      if(unit==='GB') return Math.round(val*1024*1024*1024);
      if(unit==='MB') return Math.round(val*1024*1024);
      if(unit==='KB') return Math.round(val*1024);
      return 0;
    })();
    const links = [];
    const buttons = $('div.card-body h2 a.btn').get();
    const buttonPromises = buttons.map(function(btn){
      return new Promise(function(resBtn){
        try {
          const link = $(btn).attr('href');
          const text = $(btn).text();
          const fileName = header || headerDetails || 'Unknown';
          if(!link) return resBtn();
          if(text.includes('Download File')) { links.push({ source: `HubCloud ${labelExtras}`, quality, url: link, size: parseSize, fileName }); return resBtn(); }
          if(text.includes('FSL Server')) { links.push({ source: `HubCloud - FSL Server ${labelExtras}`, quality, url: link, size: parseSize, fileName }); return resBtn(); }
          if(text.includes('S3 Server')) { links.push({ source: `HubCloud - S3 Server ${labelExtras}`, quality, url: link, size: parseSize, fileName }); return resBtn(); }
          if(text.includes('BuzzServer')) {
            // try fetch /download and inspect redirect hx-redirect param
            fetch(link + '/download', { method: 'GET', headers: Object.assign({}, HEADERS, { Referer: link }), redirect: 'manual' })
              .then(function(resp){
                if(resp && resp.status >= 300 && resp.status < 400){
                  const loc = (resp.headers && resp.headers.get) ? resp.headers.get('location') : null;
                  if(loc && loc.includes('hx-redirect=')){
                    const mm = loc.match(/hx-redirect=([^&]+)/);
                    if(mm && mm[1]) {
                      links.push({ source: `HubCloud - BuzzServer ${labelExtras}`, quality, url: decodeURIComponent(mm[1]), size: parseSize, fileName });
                    }
                  }
                }
                resBtn();
              }).catch(function(){ resBtn(); });
            return;
          }
          if(link.includes('pixeldra')) { links.push({ source: `Pixeldrain ${labelExtras}`, quality, url: link, size: parseSize, fileName }); return resBtn(); }
          if(text.includes('10Gbps')) {
            // follow redirects up to 6 times to find link=
            let current = link; let attempts = 0;
            (function follow(){
              if(attempts++ >= 6) return resBtn();
              fetch(current, { method: 'GET', redirect: 'manual' }).then(function(r2){
                if(r2 && r2.status >= 300 && r2.status < 400){
                  const loc = (r2.headers && r2.headers.get) ? r2.headers.get('location') : null;
                  if(loc) {
                    if(loc.includes('link=')){
                      const finalLink = loc.substring(loc.indexOf('link=') + 5);
                      links.push({ source: `HubCloud - 10Gbps ${labelExtras}`, quality, url: finalLink, size: parseSize, fileName });
                      return resBtn();
                    } else {
                      current = new URL(loc, current).toString();
                      return follow();
                    }
                  }
                }
                resBtn();
              }).catch(function(){ resBtn(); });
            })();
            return;
          }
          // fallback: nested extractor
          loadExtractor(link, url).then(function(nested){ if(Array.isArray(nested) && nested.length) links.push.apply(links, nested); resBtn(); }).catch(function(){ resBtn(); });
        } catch(e){ resBtn(); }
      });
    });
    return Promise.all(buttonPromises).then(function(){ return links; });
  }).catch(function(){ return []; });
}

// HbLinks extractor
function hbLinksExtractor(url, referer){
  return fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer || HEADERS.Referer }) }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(html){
    if(!html) return [];
    const $ = cheerio.load(html);
    const links = $('h3 a, div.entry-content p a').map(function(i, el){ return $(el).attr('href'); }).get();
    const promises = links.map(function(l){ return loadExtractor(l, url).then(function(res){ return res || []; }).catch(function(){ return []; }); });
    return Promise.all(promises).then(function(arr){ return arr.flat(); });
  }).catch(function(){ return []; });
}

// HubStream simple
function hubStreamExtractor(url, referer){ return Promise.resolve([{ source: 'Hubstream', quality: 'Unknown', url: url }]); }

// HdStream4u
function hdstream4uExtractor(url, referer){ return Promise.resolve([{ source: 'HdStream4u', quality: 'Unknown', url: url }]); }

// Vidsrc (basic pattern handling for /api/source and iframe variations)
function vidsrcExtractor(url, referer){
  return fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer || HEADERS.Referer }) })
    .then(function(r){ return r.ok ? r.text() : ''; })
    .then(function(html){
      if(!html) return [];
      // detect /api/source patterns or iframe embed with data-src
      const apiMatch = html.match(/src:\s*'(\/api\/source\/[^']+)'/i) || html.match(/src:\s*"(\/api\/source\/[^"]+)"/i);
      if(apiMatch && apiMatch[1]) {
        const base = (new URL(url)).origin;
        return fetch(base + apiMatch[1], { method: 'POST', headers: Object.assign({}, HEADERS, { Referer: url, 'Content-Type': 'application/x-www-form-urlencoded' }), body: '' })
          .then(function(r2){ return r2.ok ? r2.json().catch(function(){ return null; }) : null; })
          .then(function(j){ if(!j) return []; if(j.data && Array.isArray(j.data)) return j.data.map(function(it){ return { source: 'Vidsrc', quality: it.label || 'Stream', url: it.file }; }); return []; })
          .catch(function(){ return []; });
      }
      // fallback: try to parse iframe src containing vidsrc
      const $ = cheerio.load(html);
      const iframeSrc = $('iframe').attr('src') || '';
      if(iframeSrc && iframeSrc.includes('vidsrc')) return vidsrcExtractor(iframeSrc, url);
      return [];
    }).catch(function(){ return []; });
}

// MDrive / GDRIVE style minimal handler (mirrors mdrive logic)
function mdriveExtractor(url, referer){
  // Usually mdrive is a redirector to google drive or other providers. We'll attempt fetch + parse links.
  return fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer || HEADERS.Referer }) }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(html){
    if(!html) return [];
    const $ = cheerio.load(html);
    // some pages contain direct anchors to drive/pixeldrain/mixdrop etc.
    const anchors = $('a').map(function(i, el){ return $(el).attr('href'); }).get();
    const promises = anchors.map(function(a){ if(!a) return Promise.resolve([]); return loadExtractor(a, url).then(function(r){ return r || []; }).catch(function(){ return []; }); });
    return Promise.all(promises).then(function(arr){ return arr.flat(); });
  }).catch(function(){ return []; });
}

// MixDrop (simple sniff)
function mixdropExtractor(url, referer){
  return fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer || HEADERS.Referer }) }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(html){
    if(!html) return [];
    const m = html.match(/(https?:\/\/(?:www\.)?mixdrop\.[^'"]+\/[^\s'"]+)/i);
    if(m) return [{ source: 'MixDrop', quality: 'Stream', url: m[1] }];
    return [];
  }).catch(function(){ return []; });
}

// Kwik (basic)
function kwikExtractor(url, referer){
  return fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer || HEADERS.Referer }) }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(html){
    if(!html) return [];
    const m = html.match(/source:\s*'([^']+\.m3u8[^']*)'/i) || html.match(/"file":"([^"]+\.m3u8[^"]*)"/i);
    if(m && m[1]) return [{ source: 'Kwik', quality: 'M3U8', url: m[1] }];
    return [];
  }).catch(function(){ return []; });
}

// Filemoon (simple)
function filemoonExtractor(url, referer){
  return fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer || HEADERS.Referer }) }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(html){
    if(!html) return [];
    const m = html.match(/file:\s*'([^']+)'/i) || html.match(/"file":"([^"]+)"/i);
    if(m && m[1]) return [{ source: 'FileMoon', quality: 'Stream', url: m[1] }];
    return [];
  }).catch(function(){ return []; });
}

// Dood / Streamlare / others (generic m3u8/mp4 sniff)
function genericStreamSniffer(url, referer){
  return fetch(url, { headers: Object.assign({}, HEADERS, { Referer: referer || HEADERS.Referer }) }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(html){
    if(!html) return [];
    const m = html.match(/https?:\/\/[^\s'"]+\.(m3u8|mp4)(\?[^'"]*)?/i);
    if(m) return [{ source: 'StreamSniffer', quality: 'Stream', url: m[0] }];
    return [];
  }).catch(function(){ return []; });
}

// Default extractor
function defaultExtractor(url){ try { const hostname = (new URL(url)).hostname.replace(/^www\./,''); return Promise.resolve([{ source: hostname, quality: 'Unknown', url: url }]); } catch(e){ return Promise.resolve([]); } }

// ------------------ Extractor registry ------------------
// Map matched hostname substrings to extractor functions. Add new extractors here.
const EXTRACTOR_REGISTRY = [
  { match: h => h.includes('pixeldrain'), fn: pixelDrainExtractor },
  { match: h => h.includes('streamtape'), fn: streamTapeExtractor },
  { match: h => h.includes('hubcdn') || h.includes('hub-cdn'), fn: hubCdnExtractor },
  { match: h => h.includes('hubdrive') || h.includes('hub-drive'), fn: hubDriveExtractor },
  { match: h => h.includes('hubcloud') || h.includes('hub-cloud'), fn: hubCloudExtractor },
  { match: h => h.includes('hblinks') || h.includes('hblinks.'), fn: hbLinksExtractor },
  { match: h => h.includes('hubstream'), fn: hubStreamExtractor },
  { match: h => h.includes('hdstream4u') || h.includes('hdstream'), fn: hdstream4uExtractor },
  { match: h => h.includes('vidsrc'), fn: vidsrcExtractor },
  { match: h => h.includes('mdrive') || h.includes('moviesdrive') || h.includes('mdrive'), fn: mdriveExtractor },
  { match: h => h.includes('mixdrop'), fn: mixdropExtractor },
  { match: h => h.includes('kwik'), fn: kwikExtractor },
  { match: h => h.includes('filemoon') || h.includes('filemoon.'), fn: filemoonExtractor },
  // generic sniff as fallback for many hosts (dood, streamlare, mp4upload, voe, gofile, etc.)
  { match: h => true, fn: genericStreamSniffer }
];

// loadExtractor dispatcher
function loadExtractor(url, referer){
  return new Promise(function(resolve){
    if(!url) return resolve([]);
    try {
      // handle possible redirectors
      const hostname = (new URL(url)).hostname;
      if(url.includes('?id=') || hostname.includes('techyboy4u') || hostname.includes('techyboy')){
        return getRedirectLinks(url).then(function(final){ if(!final) return resolve([]); return loadExtractor(final, url).then(resolve).catch(function(){ resolve([]); }); }).catch(function(){ return resolve([]); });
      }
      // find first registry match
      for(let i=0;i<EXTRACTOR_REGISTRY.length;i++){
        try {
          if(EXTRACTOR_REGISTRY[i].match(hostname)) {
            return EXTRACTOR_REGISTRY[i].fn(url, referer).then(function(res){ resolve(res || []); }).catch(function(){ resolve([]); });
          }
        } catch(e){ /* skip */ }
      }
      // default
      return defaultExtractor(url).then(resolve).catch(function(){ resolve([]); });
    } catch(e){ resolve([]); }
  });
}

// ------------------ Search & download link collection ------------------
function search(query){
  return getCurrentDomain().then(function(current){
    const searchUrl = `${current}/?s=${encodeURIComponent(query)}`;
    return fetch(searchUrl, { headers: HEADERS }).then(function(r){ return r.ok ? r.text() : ''; }).then(function(html){
      if(!html) return [];
      const $ = cheerio.load(html);
      return $('.recent-movies > li.thumb').map(function(i, el){
        const e = $(el);
        const title = e.find('figcaption:nth-child(2) > a:nth-child(1) > p:nth-child(1)').text().trim() || e.find('figcaption').text().trim();
        const url = e.find('figure:nth-child(1) > a:nth-child(2)').attr('href') || e.find('a').attr('href');
        const poster = e.find('figure img').attr('src') || '';
        const yearMatch = title ? title.match(/\((\d{4})\)|\b(\d{4})\b/) : null;
        const year = yearMatch ? parseInt(yearMatch[1] || yearMatch[2]) : null;
        return { title, url, poster, year };
      }).get();
    }).catch(function(){ return []; });
  });
}

function getDownloadLinks(mediaUrl){
  return getCurrentDomain().then(function(currentDomain){
    HEADERS.Referer = `${currentDomain}/`;
    return fetch(mediaUrl, { headers: HEADERS }).then(function(resp){ return resp.ok ? resp.text() : ''; }).then(function(html){
      if(!html) return { finalLinks: [], isMovie: false };
      const $ = cheerio.load(html);
      const typeRaw = $('h1.page-title span').text();
      const isMovie = String(typeRaw || '').toLowerCase().includes('movie');
      const title = $('.page-body h2').first().text();
      const seasonMatch = title.match(/\bSeason\s*(\d+)\b/i);
      const seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : null;

      if(isMovie){
        const qualityAnchors = $('h3 a, h4 a').filter(function(){ const t = $(this).text(); return /480|720|1080|2160|4K/i.test(t); });
        let initialLinks = qualityAnchors.map(function(i, el){ return { url: $(el).attr('href') }; }).get();
        // dedupe
        const seen = new Set(); initialLinks = initialLinks.filter(function(l){ if(!l.url) return false; if(seen.has(l.url)) return false; seen.add(l.url); return true; });
        const promises = initialLinks.map(function(li){ return loadExtractor(li.url, mediaUrl).then(function(res){ return res || []; }).catch(function(){ return []; }); });
        return Promise.all(promises).then(function(results){ const all = results.flat(); const seenUrls = new Set(); const unique = all.filter(function(link){ if(!link || !link.url) return false; if(link.url.includes('.zip') || (link.name && link.name.toLowerCase().includes('.zip'))) return false; if(seenUrls.has(link.url)) return false; seenUrls.add(link.url); return true; }); return { finalLinks: unique, isMovie: true }; });
      } else {
        // TV logic (episodes + techy redirects)
        const episodeLinksMap = new Map();
        const initialLinks = [];
        $('h4').each(function(i, el){
          const txt = $(el).text();
          const ep = txt.match(/(?:EPiSODE\s*(\d+)|E(\d+))/i);
          if(ep){
            const epNum = parseInt(ep[1] || ep[2]);
            if(!episodeLinksMap.has(epNum)) episodeLinksMap.set(epNum, []);
            const links = $(el).find('a').map(function(i,a){ return $(a).attr('href'); }).get();
            episodeLinksMap.set(epNum, [...new Set([...(episodeLinksMap.get(epNum)||[]), ...links])]);
          }
        });
        if(episodeLinksMap.size === 0){
          // fallback: scan h3/h4
          const blocks = $('h3, h4').get();
          const blockPromises = blocks.map(function(block){
            const $b = $(block); const titleBlock = $b.text();
            const epMatch = titleBlock.match(/(?:EPiSODE\s*(\d+)|E(\d+))/i); const epNum = epMatch ? parseInt(epMatch[1] || epMatch[2]) : null;
            const isDirectBlock = /1080|720|4K|2160/i.test($b.find('a').text());
            if(isDirectBlock){
              const redirectLinks = $b.find('a').map(function(i,a){ return $(a).attr('href'); }).get();
              const rProms = redirectLinks.map(function(rl){ return getRedirectLinks(rl).then(function(resolved){ if(!resolved) return; return fetch(resolved, { headers: HEADERS }).then(function(r2){ return r2.ok ? r2.text() : ''; }).then(function(pageData){ if(!pageData) return; const $$ = cheerio.load(pageData); $$('.h5 a, h5 a').each(function(i, linkEl){ const linkText = $$(linkEl).text(); const linkHref = $$(linkEl).attr('href'); const innerEpMatch = linkText.match(/Episode\s*(\d+)/i); if(innerEpMatch && linkHref){ const inner = parseInt(innerEpMatch[1]); if(!episodeLinksMap.has(inner)) episodeLinksMap.set(inner, []); episodeLinksMap.set(inner, [...new Set([...(episodeLinksMap.get(inner)||[]), linkHref])]); } }); }).catch(function(){}); }).catch(function(){}); });
              return Promise.all(rProms);
            } else if(epNum){
              if(!episodeLinksMap.has(epNum)) episodeLinksMap.set(epNum, []);
              const baseLinks = $b.find('a').map(function(i,a){ return $(a).attr('href'); }).get();
              episodeLinksMap.set(epNum, [...new Set([...(episodeLinksMap.get(epNum)||[]), ...baseLinks])]);
              let next = $b.next();
              while(next && next.length && !['hr','h3','h4'].includes(next.get(0).tagName)){
                const siblingLinks = next.find('a').map(function(i,a){ return $(a).attr('href'); }).get();
                episodeLinksMap.set(epNum, [...new Set([...(episodeLinksMap.get(epNum)||[]), ...siblingLinks])]);
                next = next.next();
              }
              return Promise.resolve();
            } else {
              return Promise.resolve();
            }
          });
          return Promise.all(blockPromises).then(function(){
            episodeLinksMap.forEach(function(links, epNum){
              links.forEach(function(l){ initialLinks.push({ url: l, episode: epNum }); });
            });
            const extractPromises = initialLinks.map(function(li){
              if(li.url && /techyboy4u|techyboy/.test(li.url)){
                return getRedirectLinks(li.url).then(function(resolved){ if(!resolved) return []; return fetch(resolved, { headers: HEADERS }).then(function(r2){ return r2.ok ? r2.text() : ''; }).then(function(pageData){ if(!pageData) return []; const $$ = cheerio.load(pageData); const epLinks = []; $$('h5 a').each(function(i, a){ const text = $$(a).text(); const href = $$(a).attr('href'); const epm = text.match(/Episode\s*(\d+)/i); if(epm && href) epLinks.push({ url: href, episode: parseInt(epm[1]) }); }); $$('h3 a').each(function(i,a){ const href = $$(a).attr('href'); const txt = $$(a).text(); if(href && !href.includes('magnet:') && !href.includes('.zip') && !/pack/i.test(txt)) epLinks.push({ url: href, episode: null }); }); const epPromises = epLinks.map(function(epLink){ return loadExtractor(epLink.url, resolved).then(function(extracted){ return extracted.map(function(f){ return Object.assign({}, f, { episode: epLink.episode }); }); }).catch(function(){ return []; }); }); return Promise.all(epPromises).then(function(rr){ return rr.flat(); }); }).catch(function(){ return []; }); }).catch(function(){ return []; });
              } else {
                return loadExtractor(li.url, mediaUrl).then(function(extracted){ return extracted.map(function(f){ return Object.assign({}, f, { episode: li.episode }); }); }).catch(function(){ return []; });
              }
            });
            return Promise.all(extractPromises).then(function(results){ const all = results.flat(); const seenUrls = new Set(); const unique = all.filter(function(link){ if(!link || !link.url) return false; if(link.url.includes('.zip') || (link.name && link.name.toLowerCase().includes('.zip'))) return false; if(seenUrls.has(link.url)) return false; seenUrls.add(link.url); return true; }); return { finalLinks: unique, isMovie: false }; });
          });
        } else {
          episodeLinksMap.forEach(function(links, epNum){ links.forEach(function(l){ initialLinks.push({ url: l, episode: epNum }); }); });
          const promises = initialLinks.map(function(li){
            if(li.url && /techyboy4u|techyboy/.test(li.url)){
              return getRedirectLinks(li.url).then(function(resolved){ if(!resolved) return []; return fetch(resolved, { headers: HEADERS }).then(function(r2){ return r2.ok ? r2.text() : ''; }).then(function(pageData){ if(!pageData) return []; const $$ = cheerio.load(pageData); const epLinks=[]; $$('h5 a').each(function(i,a){ const text = $$(a).text(); const href = $$(a).attr('href'); const epm = text.match(/Episode\s*(\d+)/i); if(epm && href) epLinks.push({ url: href, episode: parseInt(epm[1]) }); }); $$('h3 a').each(function(i,a){ const href = $$(a).attr('href'); const txt = $$(a).text(); if(href && !href.includes('magnet:') && !href.includes('.zip') && !/pack/i.test(txt)) epLinks.push({ url: href, episode: null }); }); const epPromises = epLinks.map(function(epLink){ return loadExtractor(epLink.url, resolved).then(function(extracted){ return extracted.map(function(f){ return Object.assign({}, f, { episode: epLink.episode }); }); }).catch(function(){ return []; }); }); return Promise.all(epPromises).then(function(rr){ return rr.flat(); }); }).catch(function(){ return []; }); }).catch(function(){ return []; });
            } else {
              return loadExtractor(li.url, mediaUrl).then(function(extracted){ return extracted.map(function(f){ return Object.assign({}, f, { episode: li.episode }); }); }).catch(function(){ return []; });
            }
          });
          return Promise.all(promises).then(function(results){ const all = results.flat(); const seenUrls = new Set(); const unique = all.filter(function(link){ if(!link || !link.url) return false; if(link.url.includes('.zip') || (link.name && link.name.toLowerCase().includes('.zip'))) return false; if(seenUrls.has(link.url)) return false; seenUrls.add(link.url); return true; }); return { finalLinks: unique, isMovie: false }; });
        }
      }
    });
  });
}

// ------------------ TMDB helpers ------------------
function getTMDBDetails(tmdbId, mediaType){
  return new Promise(function(resolve){
    if(!tmdbId) return resolve(null);
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
    fetch(url, { method: 'GET', headers: { 'Accept':'application/json', 'User-Agent': HEADERS['User-Agent'] } })
      .then(function(r){ if(!r.ok) return resolve(null); return r.json().then(function(data){ const title = mediaType === 'tv' ? data.name : data.title; const release = mediaType === 'tv' ? data.first_air_date : data.release_date; const year = release ? parseInt(release.split('-')[0]) : null; resolve({ title, year, imdbId: data.external_ids ? data.external_ids.imdb_id : null }); }).catch(function(){ resolve(null); }); }).catch(function(){ resolve(null); });
  });
}
function findBestTitleMatch(mediaInfo, searchResults, mediaType, season){
  if(!searchResults || searchResults.length===0) return null;
  let best=null,bestScore=0;
  for(let i=0;i<searchResults.length;i++){
    const r = searchResults[i];
    let score = calculateTitleSimilarity(mediaInfo.title, r.title);
    if(mediaInfo.year && r.year){ const d=Math.abs(mediaInfo.year - r.year); if(d===0) score += 0.2; else if(d<=1) score += 0.1; else if(d>5) score -= 0.3; }
    if(mediaType==='tv' && season){ const tl = (r.title||'').toLowerCase(); if(tl.includes(`season ${season}`) || tl.includes(`s${season}`)) score += 0.3; else score -= 0.2; }
    if((r.title||'').toLowerCase().includes('2160p') || (r.title||'').toLowerCase().includes('4k')) score += 0.05;
    if(score > bestScore && score > 0.3){ bestScore = score; best = r; }
  }
  return best;
}

// ------------------ Main getStreams (Promise-only) ------------------
function getStreams(tmdbId, mediaType, season, episode){
  return new Promise(function(resolve){
    getTMDBDetails(tmdbId, mediaType)
      .then(function(mediaInfo){
        if(!mediaInfo) return Promise.resolve(null);
        const searchQuery = (mediaType==='tv' && season) ? `${mediaInfo.title} season ${season}` : mediaInfo.title;
        return fetchAndUpdateDomain().then(function(){ return search(searchQuery).then(function(searchResults){ return { mediaInfo, searchResults }; }); });
      })
      .then(function(ctx){
        if(!ctx) return Promise.resolve([]);
        const mediaInfo = ctx.mediaInfo; const searchResults = ctx.searchResults;
        if(!searchResults || searchResults.length===0) return Promise.resolve([]);
        const best = findBestTitleMatch(mediaInfo, searchResults, mediaType, season) || searchResults[0];
        if(!best || !best.url) return Promise.resolve([]);
        return getDownloadLinks(best.url).then(function(result){
          if(!result || !result.finalLinks) return [];
          let links = result.finalLinks;
          if(mediaType==='tv' && episode != null){ links = links.filter(function(l){ return l.episode == null || l.episode === episode; }); }
          const streams = links.map(function(link){
            const serverName = extractServerName(link.source || link.name || '');
            const quality = getQualityLabel(link.quality || link.name || link.source || '');
            let mediaTitle = (link.fileName && link.fileName !== 'Unknown') ? link.fileName : (mediaInfo.title + (mediaInfo.year ? ` (${mediaInfo.year})` : ''));
            if(mediaType==='tv' && season && episode && link.episode && !link.fileName){
              mediaTitle = `${mediaInfo.title} S${String(season).padStart(2,'0')}E${String(link.episode).padStart(2,'0')}`;
            }
            return {
              name: `StreamPlay ${serverName}`,
              title: mediaTitle,
              url: link.url,
              quality: quality,
              size: link.size ? formatBytes(link.size) : (link.sizeText || 'Unknown'),
              headers: HEADERS,
              provider: 'streamplay'
            };
          }).filter(function(s){ return s.url; });
          const order = { '4K':4, '2160p':4, '1440p':3, '1080p':2, '720p':1, '480p':0, '360p':-1, 'Unknown': -2 };
          streams.sort(function(a,b){ return (order[b.quality] || -3) - (order[a.quality] || -3); });
          return streams;
        });
      })
      .then(function(res){ resolve(res || []); })
      .catch(function(err){ try{ console.error('[streamplay_full_nuvio] Error', err && err.message ? err.message : err); }catch(e){}; resolve([]); });
  });
}

// Export
if(typeof module !== 'undefined' && module.exports) module.exports = { getStreams }; else global.StreamPlayFull = { getStreams };
