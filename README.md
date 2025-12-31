# Nuvio Local Scrapers

A collection of local scrapers for the Nuvio streaming application. These scrapers allow you to fetch streams from various sources directly within the app.

## Installation

1. Open Nuvio app
2. Go to Settings → Local Scrapers
3. Add this repository URL:
   ```
   https://raw.githubusercontent.com/tapframe/nuvio-providers/refs/heads/main/
   ```
4. Enable the scrapers you want to use

## Scraper Development

**💡 Tip:** Check existing scrapers in the `providers/` directory for real working examples before starting your own.

### Core Function
**⚠️ IMPORTANT:** Your scraper must use Promise-based approach only. **async/await is NOT supported** in this sandboxed environment.

Your scraper must export a `getStreams` function that returns a Promise:

```javascript
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise((resolve, reject) => {
    // Your scraping logic here - NO async/await allowed
    // Use .then() and .catch() for all async operations
    // Return array of stream objects or empty array on error
    resolve(streams);
  });
}

// Export for React Native compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
```

**Parameters:**
- `tmdbId` (string): TMDB ID
- `mediaType` (string): "movie" or "tv"
- `seasonNum` (number): Season number (TV only)
- `episodeNum` (number): Episode number (TV only)

### Stream Object Format
Each stream must return this exact format (see `providers/xprime.js` for real examples):

```javascript
{
  name: "XPrime Primebox - 1080p",  // Provider + server name
  title: "Movie Title (2024)",       // Media title with year
  url: "https://stream.url",         // Direct stream URL
  quality: "1080p",                  // Quality (720p, 1080p, 4K, etc.)
  size: "Unknown",                   // Optional file size
  headers: WORKING_HEADERS,          // Required headers for playback
  provider: "xprime"                 // Provider identifier
}
```

### Headers (When Needed)
Include headers if the stream requires them for playback. Check `providers/xprime.js` for real WORKING_HEADERS example:

```javascript
// From providers/xprime.js - real working headers
const WORKING_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Origin': 'https://xprime.tv',
    'Referer': 'https://xprime.tv/',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
    'DNT': '1'
};
```

### React Native Compatibility
- **❌ async/await is NOT supported** in this sandboxed environment
- **✅ Promise-based approach is COMPULSORY** - use `.then()` and `.catch()`
- Use `fetch()` for HTTP requests (no axios)
- Use `cheerio-without-node-native` for HTML parsing
- Avoid Node.js modules (fs, path, crypto)

### Modular Scrapers (Import Support)

Nuvio supports **importing shared modules** across scrapers, allowing you to:
- Split large scrapers into smaller, maintainable files
- Share common utilities across multiple providers
- Organize code with proper separation of concerns

#### Supported Import Styles

```javascript
// ES Module Imports
import { decrypt, encode } from './shared/crypto.js';
import * as utils from './shared/utils.js';
import VideoExtractor from './extractors/base.js';

// CommonJS Imports  
const { decrypt, encode } = require('./shared/crypto.js');
const utils = require('./shared/utils.js');
```

#### Example: Modular Provider Structure

```
repository/
├── manifest.json
├── shared/
│   ├── crypto.js           # Shared encryption utilities
│   ├── extractors.js       # Common video extractors
│   └── utils.js            # Helper functions
└── providers/
    ├── showbox/
    │   ├── index.js        # Main entry (referenced in manifest)
    │   ├── api.js          # API calls
    │   └── parser.js       # Response parsing
    └── moviebox/
        ├── index.js        # Main entry
        └── helpers.js      # Provider-specific helpers
```

**manifest.json:**
```json
{
  "scrapers": [
    {
      "id": "showbox",
      "name": "ShowBox",
      "filename": "providers/showbox/index.js",
      "supportedTypes": ["movie", "tv"]
    }
  ]
}
```

**providers/showbox/index.js:**
```javascript
import { decrypt } from '../../shared/crypto.js';
import { fetchData } from './api.js';
import { parseStreams } from './parser.js';

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise((resolve, reject) => {
    fetchData(tmdbId, mediaType, seasonNum, episodeNum)
      .then(data => decrypt(data))
      .then(decrypted => parseStreams(decrypted))
      .then(streams => resolve(streams))
      .catch(error => {
        console.error('[ShowBox] Error:', error);
        resolve([]);
      });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
```

**shared/crypto.js:**
```javascript
export function decrypt(data) {
  // Decryption logic
  return decryptedData;
}

export function encode(str) {
  // Encoding logic
  return encodedStr;
}
```

#### How It Works

1. When Nuvio downloads your scraper, it automatically detects `import`/`require` statements
2. Referenced files are downloaded from your repository
3. Imports are recursively resolved (nested imports work too!)
4. All modules are bundled together before execution
5. Circular imports are detected and handled gracefully

#### Import Rules

- ✅ **Relative imports only**: `./file.js`, `../shared/utils.js`
- ✅ **Built-in modules**: `crypto-js`, `cheerio-without-node-native`
- ❌ **Absolute URLs**: Not supported
- ❌ **Node.js modules**: `fs`, `path`, etc. are not available

### Testing
Create a test file to verify your scraper (see existing scrapers for examples):

```javascript
const { getStreams } = require('./providers/xprime.js');

getStreams('550', 'movie').then(streams => {
  console.log('Found', streams.length, 'streams');
  streams.forEach(stream => console.log(`${stream.name}: ${stream.quality}`));
}).catch(console.error);
```

### Manifest Entry
Add your scraper to `manifest.json` (see existing entries for examples):

```json
{
  "id": "yourscraper",
  "name": "Your Scraper",
  "description": "Brief description of what your scraper does",
  "version": "1.0.0",
  "author": "Your Name",
  "supportedTypes": ["movie", "tv"],
  "filename": "providers/yourscraper.js",
  "enabled": true,
  "formats": ["mkv"],
  "logo": "https://your-logo-url.com/logo.png",
  "contentLanguage": ["en"]
}
```

## Publishing to GitHub

1. **Create a new repository on GitHub:**
   - Go to github.com
   - Click "New repository"
   - Name it `nuvio-local-scrapers`
   - Make it public
   - Don't initialize with README (we already have one)

2. **Upload files:**
   ```bash
   cd /path/to/local-scrapers-repo
   git init
   git add .
   git commit -m "Initial commit with UHD Movies scraper"
   git branch -M main
   git remote add origin https://github.com/tapframe/nuvio-local-scrapers.git
   git push -u origin main
   ```

3. **Get the raw URL:**
   ```
   https://raw.githubusercontent.com/tapframe/nuvio-local-scrapers/main/
   ```

## Contributing

### Development Workflow

1. **Fork this repository**
   ```bash
   # Clone your fork
   git clone https://github.com/tapframe/nuvio-local-scrapers.git
   cd nuvio-local-scrapers
   ```

2. **Create a new branch**
   ```bash
   git checkout -b add-newscraper
   ```

3. **Develop your scraper**
   - Create `newscraper.js`
   - Update `manifest.json`
   - Create `test_newscraper.js`
   - Test thoroughly

4. **Test your scraper**
   ```bash
   # Run tests
   node test_newscraper.js
   
   # Test with different content types
   # Verify stream URLs work
   # Check error handling
   ```

5. **Commit and push**
   ```bash
   git add .
   git commit -m "Add NewScraper with support for movies and TV shows"
   git push origin add-newscraper
   ```

6. **Submit a pull request**
   - Include description of the scraper
   - List supported features
   - Provide test results
   - Mention any limitations

### Code Review Checklist

Before submitting, ensure your scraper:

- [ ] **Follows naming conventions** (camelCase, descriptive names)
- [ ] **Has proper error handling** (try-catch blocks, graceful failures)
- [ ] **Includes comprehensive logging** (with scraper name prefix)
- [ ] **Is React Native compatible** (no Node.js modules, uses fetch())
- [ ] **Has a working test file** (tests movies and TV shows)
- [ ] **Updates manifest.json** (correct metadata and version)
- [ ] **Respects rate limits** (reasonable delays between requests)
- [ ] **Handles edge cases** (missing content, network errors)
- [ ] **Returns proper stream objects** (correct format and required fields)
- [ ] **Is well-documented** (comments explaining complex logic)

### Scraper Quality Standards

#### Performance
- Response time < 15 seconds for most requests
- Handles concurrent requests gracefully
- Minimal memory usage
- Efficient DOM parsing

#### Reliability
- Success rate > 80% for popular content
- Graceful degradation when source is unavailable
- Proper timeout handling
- Retry logic for transient failures

#### User Experience
- Clear, descriptive stream titles
- Accurate quality and size information
- Sorted results (highest quality first)
- Consistent naming conventions

### Debugging Tips

#### 1. Network Issues
```javascript
// Add request/response logging
console.log(`[YourScraper] Requesting: ${url}`);
console.log(`[YourScraper] Response status: ${response.status}`);
console.log(`[YourScraper] Response headers:`, response.headers);
```

#### 2. HTML Parsing Issues
```javascript
// Log HTML content for inspection
console.log(`[YourScraper] HTML length: ${html.length}`);
console.log(`[YourScraper] Page title: ${$('title').text()}`);
console.log(`[YourScraper] Found ${$('.target-selector').length} elements`);
```

#### 3. URL Resolution Issues
```javascript
// Validate URLs before returning
async function validateUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok || response.status === 206; // 206 for partial content
  } catch (error) {
    return false;
  }
}
```

### Real-World Examples

#### UHDMovies Scraper Features
- **Episode-specific extraction** for TV shows
- **Multiple tech domains** (tech.unblockedgames.world, tech.examzculture.in, etc.)
- **SID link resolution** with multi-step form submission
- **Driveleech URL processing** with multiple download methods
- **Quality parsing** with technical details (10-bit, HEVC, HDR)

#### MoviesMod Scraper Features
- **Dynamic domain fetching** from GitHub repository
- **String similarity matching** for content selection
- **Intermediate link resolution** (modrefer.in decoding)
- **Multiple download servers** (Resume Cloud, Worker Bot, Instant Download)
- **Broken link filtering** (report pages, invalid URLs)
- **Parallel processing** of multiple quality options

### Advanced Techniques

#### 1. Multi-Domain Support
```javascript
const TECH_DOMAINS = [
  'tech.unblockedgames.world',
  'tech.examzculture.in',
  'tech.creativeexpressionsblog.com',
  'tech.examdegree.site'
];

function isTechDomain(url) {
  return TECH_DOMAINS.some(domain => url.includes(domain));
}
```

#### 2. Form-Based Authentication
```javascript
async function submitVerificationForm(formUrl, formData) {
  const response = await fetch(formUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': previousUrl
    },
    body: new URLSearchParams(formData).toString()
  });
  return response;
}
```

#### 3. JavaScript Execution Simulation
```javascript
// Extract dynamic values from JavaScript code
function extractFromJavaScript(html) {
  const cookieMatch = html.match(/s_343\('([^']+)',\s*'([^']+)'/);
  const linkMatch = html.match(/c\.setAttribute\("href",\s*"([^"]+)"\)/);
  
  return {
    cookieName: cookieMatch?.[1],
    cookieValue: cookieMatch?.[2],
    linkPath: linkMatch?.[1]
  };
}
```

### Maintenance

#### Updating Existing Scrapers
- Monitor source website changes
- Update selectors and logic as needed
- Test after updates
- Increment version number in manifest

#### Handling Source Changes
- Implement fallback mechanisms
- Use multiple extraction methods
- Add domain rotation support
- Monitor for breaking changes

### Troubleshooting

#### Common Issues

1. **CORS Errors**
   - Use appropriate headers
   - Consider proxy solutions
   - Check source website restrictions

2. **Rate Limiting**
   - Add delays between requests
   - Implement exponential backoff
   - Use different user agents

3. **Captcha/Bot Detection**
   - Rotate user agents
   - Add realistic delays
   - Implement session management

4. **Dynamic Content**
   - Look for API endpoints
   - Parse JavaScript for data
   - Use multiple extraction methods

#### Getting Help

- Check existing scraper implementations
- Review error logs carefully
- Test with different content types
- Ask for help in community discussions

---

## 🧰 Tools & Technologies

<p align="left">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=javascript,nodejs,github,githubactions&theme=light&perline=4" />
  </a>
</p>

---



## 📄 License

[![GNU GPLv3 Image](https://www.gnu.org/graphics/gplv3-127x51.png)](http://www.gnu.org/licenses/gpl-3.0.en.html)

These scrapers are **free software**: you can use, study, share, and modify them as you wish.

They are distributed under the terms of the [GNU General Public License](https://www.gnu.org/licenses/gpl.html) version 3 or later, published by the Free Software Foundation.

---

## ⚖️ DMCA Disclaimer

We hereby issue this notice to clarify that these scrapers function similarly to a standard web browser by fetching video files from the internet.

- **No content is hosted by this repository or the Nuvio application.**
- Any content accessed is hosted by third-party websites.
- Users are solely responsible for their usage and must comply with their local laws.

If you believe content is violating copyright laws, please contact the **actual file hosts**, **not** the developers of this repository or the Nuvio app.

---

## Support

For issues or questions:
- Open an issue on GitHub
- Check the Nuvio app documentation
- Join the community discussions

---

**Thank You for using Nuvio Local Scrapers!**
