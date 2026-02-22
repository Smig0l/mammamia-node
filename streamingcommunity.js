require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { getTmdbId } = require('./utils/mediainfo');

const STREAM_SITE = process.env.SC_DOMAIN;
const USER_AGENT = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";

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

async function getSeasonEpisodeId(tid, slug, season, episode) {
  try {
    const headers = {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'X-Inertia': 'true',
      'X-Inertia-Version': await getVersion()
    };

    const resp = await axios.get(`${STREAM_SITE}/it/titles/${tid}-${slug}/season-${season}`, {
      headers  
    });
    //console.log('getSeasonEpisodeId response:', resp.data);
    if (resp.data.props?.loadedSeason?.episodes) {
      const foundEpisode = resp.data.props.loadedSeason.episodes.find(
        ep => ep.number === episode
      );
      if (foundEpisode) {
        return foundEpisode.id;
      }
    }
  } catch (error) {
    console.error('❌ Error in getSeasonEpisodeId:', error.message);
  }
}

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
      let version = await getVersion();

      return { tid, slug, version };
    }
    return null;
  } catch (error) {
    console.error('❌ Search error:', error.message);
    return null;
  }
}

async function parsePlayerPage(playerPage, version) {
  try {

    const headers = {
      'User-Agent': USER_AGENT,
      'x-inertia': 'true',
      'x-inertia-version': version,
      'Referer': `${STREAM_SITE}/`,
      'Origin': `${STREAM_SITE}`
    };

    const embedResp = await axios.get(playerPage, { headers });
    
    const script = cheerio.load(embedResp.data)('body script').text();
    //console.log('Extracted script content:', script);
    
    const token = /'token':\s*'([\w-]+)'/.exec(script)[1];
    const expires = /'expires':\s*'(\d+)'/.exec(script)[1];
    //const quality = /"quality":(\d+)/.exec(script)[1];
    const canplayfhdMatch = /window\.canPlayFHD\s*=\s*(true|false)/.exec(script);
    const canplayfhd = canplayfhdMatch ? canplayfhdMatch[1] === 'true' : false;
    const id = /id:\s*'(\d+)'/.exec(script)[1];
    const m3u8 = `https://vixcloud.co/playlist/${id}.m3u8?token=${token}&expires=${expires}&h=${canplayfhd ? 1 : 0}`;
    //console.log('Extracted m3u8 URL:', m3u8);

    const results = [];
    if (m3u8) {
        results.push({
            url: m3u8,
            description: 'HLS Stream (m3u8)',
        });
    }
    
    return results; //FIXME: some videos do not play? like tmdb 1168190

  } catch (error) {
    console.error('❌ Error in parsePlayerPage:', error.message);
    return null;
  }
}

async function scrapeStreamingCommunity(imdbId, showName, type, season = null, episode = null) {
  try {

    let playerPage = '';

    const tmdbid = await getTmdbId(imdbId);
    if (tmdbid != null) {
      console.log(`Found TMDB ID for ${showName} (${imdbId}): ${tmdbid}`);
      if (type === 'movie') {
        playerPage = `${STREAM_SITE}/movie/${tmdbid}?lang=it`;
      } else if (type === 'series' && season && episode) {
        playerPage = `${STREAM_SITE}/tv/${tmdbid}/${season}/${episode}?lang=it`;
      }
    }

    let streams = [];

    let version = await getVersion();

    let streamUrls = await parsePlayerPage(playerPage, version);
    for (const streamObj of streamUrls) {
    if (streamObj) {
        streams.push({
            url: streamObj.url,
            provider: 'vixcloud',
            description: streamObj.description
        });
      }
    }

    console.log('✅ StreamingCommunity Stream URLs:', streams);
    return { streams };

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
  const movie = await scrapeStreamingCommunity('tt28309594', 'Nonnas', 'movie');
  const series = await scrapeStreamingCommunity('tt3581920', 'The Last of Us', 'series', 1, 1);
})();
*/