require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { getTMDbIdFromIMDb, getShowInfo } = require('./info');

const STREAM_SITE = process.env.SC_DOMAIN;
const FAST_SEARCH = '1';
const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";

/**
 * Get the inertia version token from main site
 */
async function getVersion() {
  try {
    const resp = await axios.get(`${STREAM_SITE}/richiedi-un-titolo`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    const $ = cheerio.load(resp.data);
    const dataPage = JSON.parse($('#app').attr('data-page'));
    return dataPage.version;
  } catch (e) {
    console.warn('❌ getVersion failed, using default');
    return '65e52dcf34d64173542cd2dc6b8bb75b';
  }
}

/**
 * Generic search function for both movies and series
 */
async function search(showName, imdbId) {
  try {
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    };
    
    const query = `${STREAM_SITE}/api/search?q=${encodeURIComponent(showName)}`;
    const resp = await axios.get(query, { headers });

    //console.log(resp.data);

    for (const item of resp.data.data || []) {
      const tid = item.id;
      const slug = item.slug;
      let version;

      if (FAST_SEARCH === '0') { //TODO:
        const pageUrl = `${STREAM_SITE}/it/titles/${tid}-${slug}`;
        const page = await axios.get(pageUrl, { headers });
        const $ = cheerio.load(page.data);
        const pdata = JSON.parse($('#app').attr('data-page'));
        version = pdata.version;
        
        if (imdbId.startsWith('tt')) {
          const conv = await getTMDbIdFromIMDb(imdbId);
          imdbId = String(conv.tmdbId);
        }
        const tmdbId = String(pdata.props.title.tmdb_id);
        
        if (tmdbId !== imdbId) continue;
      } else {
        version = await getVersion();
      }

      return { tid, slug, version };
    }
    return null;
  } catch (error) {
    console.error('❌ Search error:', error.message);
    return null;
  }
}

/**
 * Extract player page links for both movies and series
 */
async function parsePlayerPage(tid, version, episodeId = null) {
  try {
    const headers = {
      'User-Agent': USER_AGENT,
      'x-inertia': 'true',
      'x-inertia-version': version,
      'Referer': `${STREAM_SITE}/`,
      'Origin': `${STREAM_SITE}`
    };

    // Build iframe URL based on content type
    let iframeUrl = `${STREAM_SITE}/it/iframe/${tid}`;
    if (episodeId) {
      iframeUrl += `?episode_id=${episodeId}&next_episode=1`;
    }

    const resp = await axios.get(iframeUrl, { headers });
    const $ = cheerio.load(resp.data);
    let iframeSrc = $('iframe').attr('src');
    
    if (!iframeSrc.match(/^https?:\/\//)) {
      iframeSrc = `${STREAM_SITE}${iframeSrc}`;
    }

    const embedResp = await axios.get(iframeSrc, { headers });
    const script = cheerio.load(embedResp.data)('body script').text();

    // Extract stream info
    const token = /'token':\s*'([\w-]+)'/.exec(script)?.[1];
    const expires = /'expires':\s*'(\d+)'/.exec(script)?.[1];
    const quality = /"quality":(\d+)/.exec(script)?.[1] || "unknown";
    const id = iframeSrc.split('/embed/')[1].split('?')[0];

    if (token && expires && id) {
      const stream = `https://vixcloud.co/playlist/${id}.m3u8?token=${token}&expires=${expires}`;
      console.log('✅ StreamingCommunity Stream URL:', stream, '📺 Quality:', quality);
      return { stream, quality };
    }

    console.error('❌ StreamingCommunity: Could not extract stream info');
    return null;

  } catch (error) {
    console.error('❌ Error in parsePlayerPage:', error.message);
    return null;
  }
}

/**
 * Main StreamingCommunity scraper function
 */
async function scrapeStreamingCommunity(imdbId, showName, type, season = null, episode = null) {
  try {
    const searchResult = await search(showName, imdbId);
    if (!searchResult) {
      console.error(`❌ StreamingCommunity: No ${type} found for "${showName}"`);
      return null;
    }

    const { tid, slug, version } = searchResult;
    let episodeId = null;

    if (type === 'series' && season && episode) {
      episodeId = await getSeasonEpisodeId(tid, slug, season, episode); //TODO:
      if (!episodeId) {
        console.error(`❌ StreamingCommunity: Episode not found - S${season}E${episode}`);
        return null;
      }
    }

    const result = await parsePlayerPage(tid, version, episodeId);
    return result;

  } catch (error) {
    console.error('❌ StreamingCommunity Error:', error.message);
    return null;
  }
}

// Update exports
module.exports = { scrapeStreamingCommunity };

/*
// Test the code
(async () => {
  // Uncomment to test:
  //const movie = await scrapeStreamingCommunity('tt28309594', 'Nonnas', 'movie');
  //const series = await scrapeStreamingCommunity('tt3581920', 'The Last of Us', 'series', 1, 1);
})();
*/