require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { getTMDbIdFromIMDb, getShowInfo } = require('./info');

// Ensure SC_DOMAIN includes protocol
let rawDomain = process.env.SC_DOMAIN || '';
// Trim surrounding quotes
rawDomain = rawDomain.replace(/^"|"$/g, '');
let SC_DOMAIN = rawDomain;

if (!SC_DOMAIN.match(/^https?:\/\//)) {
  SC_DOMAIN = 'https://' + SC_DOMAIN.replace(/\/+$/, '');
}
const SC_FAST_SEARCH = process.env.SC_FAST_SEARCH || '0';
const MFP = process.env.MFP || '0';
const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";

/**
 * Get the inertia "version" token from main site
 */
async function getVersion() {
  try {
    const resp = await axios.get(`${SC_DOMAIN}/richiedi-un-titolo`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    const $ = cheerio.load(resp.data);
    const dataPage = JSON.parse($('#app').attr('data-page'));
    return dataPage.version;
  } catch (e) {
    console.warn('getVersion failed, using default');
    return '65e52dcf34d64173542cd2dc6b8bb75b';
  }
}

/**
 * Search for show/movie and return tid, slug, version
 */
async function search(queryUrl, date, isMovie, imdbId) {
  const headers = {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json'
  };
  // Ensure query URL is absolute
  let url = queryUrl;
  if (!url.match(/^https?:\/\//)) url = `${SC_DOMAIN}${queryUrl.startsWith('/') ? '' : '/'}${queryUrl}`;

  const resp = await axios.get(url, { headers });

  for (const item of resp.data.data || []) {
    const tid = item.id;
    const slug = item.slug;
    const type = item.type === 'tv' ? 0 : 1;
    //console.log(tid, slug, type);
    //if (type !== isMovie) co
    let version;

    if (SC_FAST_SEARCH === '0') {
      const pageUrl = `${SC_DOMAIN}/titles/${tid}-${slug}`;
      //console.log(pageUrl);
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
  throw new Error('No matching result');
}

/**
 * Get m3u8 link from VixCloud for movie
 */
async function getFilm(tid, version) {
  if (MFP === '1') {
    return { url: `${SC_DOMAIN}/iframe/${tid}`, quality: 'Unknown' };
  }
  const headers = {
    'User-Agent': USER_AGENT,
    'user-agent': USER_AGENT,
    'x-inertia': 'true',
    'x-inertia-version': version,
    'Referer': `${SC_DOMAIN}/`,
    'Origin': `${SC_DOMAIN}`
  };
  const resp = await axios.get(`${SC_DOMAIN}/iframe/${tid}`, { headers });
  //console.log(resp.data);
  const $ = cheerio.load(resp.data);
  let iframeSrc = $('iframe').attr('src');
  if (!iframeSrc.match(/^https?:\/\//)) iframeSrc = `${SC_DOMAIN}${iframeSrc}`;
  //console.log(iframeSrc);
  const embedResp = await axios.get(iframeSrc, { headers });
  //console.log("EMBED", embedResp.data);
  const script = cheerio.load(embedResp.data)('body script').text();
  //console.log("SCRIPT",script);
  const token = /'token':\s*'([\w-]+)'/.exec(script)[1];
  const expires = /'expires':\s*'(\d+)'/.exec(script)[1];
  const quality = /"quality":(\d+)/.exec(script)[1];
  const id = iframeSrc.split('/embed/')[1].split('?')[0];
  const m3u8 = `https://vixcloud.co/playlist/${id}.m3u8?token=${token}&expires=${expires}`;
  //console.log("M3U8", m3u8, quality);
  console.log('✅ StreamingCommunity Stream URL:', m3u8, '📺 Quality:', quality);
  return { url: m3u8, quality };
}

/**
 * Get specific episode ID for TV shows
 */
async function getSeasonEpisodeId(tid, slug, season, episode) {
  const headers = {
    'User-Agent': USER_AGENT,
    'x-inertia': 'true'
  };
  const resp = await axios.get(`${SC_DOMAIN}/titles/${tid}-${slug}/stagione-${season}`, { headers });
  const episodes = resp.data.props.loadedSeason.episodes || [];
  const found = episodes.find(e => e.number === episode);
  return found ? found.id : null;
}

/**
 * Get m3u8 link for a series episode
 */
async function getEpisodeLink(episodeId, tid, version) {
  if (MFP === '1') {
    return { url: `${SC_DOMAIN}/iframe/${tid}?episode_id=${episodeId}&next_episode=1`, quality: 'Unknown' };
  }
  const headers = {
    'User-Agent': USER_AGENT,
    'x-inertia': 'true',
    'x-inertia-version': version
  };
  let iframeUrl = `${SC_DOMAIN}/iframe/${tid}?episode_id=${episodeId}&next_episode=1`;
  const resp = await axios.get(iframeUrl, { headers });
  const $ = cheerio.load(resp.data);
  let iframeSrc = $('iframe').attr('src');
  if (!iframeSrc.match(/^https?:\/\//)) iframeSrc = `${SC_DOMAIN}${iframeSrc}`;
  const embedResp = await axios.get(iframeSrc, { headers });
  const script = cheerio.load(embedResp.data)('body script').text();
  const token = /'token':\s*'([\w-]+)'/.exec(script)[1];
  const expires = /'expires':\s*'(\d+)'/.exec(script)[1];
  const quality = /"quality":(\d+)/.exec(script)[1];
  const id = iframeSrc.split('/embed/')[1].split('?')[0];
  const m3u8 = `https://vixcloud.co/playlist/${id}.m3u8?token=${token}&expires=${expires}`;
  return { url: m3u8, quality };
}

/**
 * Main export: streamingCommunity(imdbId) -> [url, quality]
 */
async function streamingcommunity(imdbId) {
  const info = await getTMDbIdFromIMDb(imdbId);
  const { isMovie, tmdbId } = info;
  const showInfo = await getShowInfo(tmdbId, isMovie);
  const showName = encodeURIComponent(showInfo.showName.replace(/\s+/g, '+'));
  const queryPath = `/api/search?q=${showName}`;
  const { tid, slug, version } = await search(queryPath, showInfo.year, isMovie, imdbId);
  if (isMovie) {
    const { url, quality } = await getFilm(tid, version);
    return [url, quality];
  } else {
    const episodeId = await getSeasonEpisodeId(tid, slug, showInfo.season, showInfo.episode);
    const { url, quality } = await getEpisodeLink(episodeId, tid, version);
    return [url, quality];
  }
}

module.exports = { streamingcommunity };


/* 
// Example test:
(async () => {
  await streamingcommunity('tt6857112');
})(); 
 */