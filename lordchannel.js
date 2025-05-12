// lordchannel.js
require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { getTMDbIdFromIMDb, getShowInfo } = require('./info');

const LC_DOMAIN = process.env.LC_DOMAIN;

/** 
 * Search lordchannel for the correct show/year, return the streaming page URL + quality 
 */
async function search(showName, year, season, episode, isMovie) {
  const headers = {
    referer: `https://${LC_DOMAIN}/anime/anime-ita/`,
    'x-requested-with': 'XMLHttpRequest',
    'user-agent': 'Mozilla/5.0'
  };
  const resp = await axios.get(`https://${LC_DOMAIN}/live_search/`, {
    params: { media: showName, _: Date.now() },
    headers
  });
  //console.log(resp.data);
  for (const entry of resp.data.data || []) {
    if (!entry) continue;
    const page = await axios.get(`https://${LC_DOMAIN}${entry.url}`, { headers });
    const $ = cheerio.load(page.data);
    const cardYear = $('ul.card__meta li:nth-of-type(2)').text().slice(-4);
    if (cardYear !== year) continue;
    const quality = entry['qualità_video'];
    if (isMovie) {
      return { videoUrl: $('a.btn-streaming').attr('href'), quality };
    } else {
      const row = $(`#collapse${season} tr`).eq(episode);
      return { videoUrl: row.find('a').attr('href'), quality };
    }
  }
  throw new Error('No matching entry found');
}

/**
 * Extract the direct .m3u8 stream URL from the player page.
 */
async function getM3U8(url) {
  const { data } = await axios.get(url);
  const match = data.match(/https?:\/\/[^\s"]+\.m3u8/);
  if (match) return match[0];
  throw new Error('No .m3u8 link found');
}

/**
 * Main entry: take an IMDb ID, resolve it, search LordChannel, and return the stream.
 */
async function lordchannel(imdbId, season = null, episode = null) {
  try {
    const { isMovie, tmdbId } = await getTMDbIdFromIMDb(imdbId);
    const { showName, year } = await getShowInfo(tmdbId, isMovie);
    const { videoUrl, quality } = await search(showName, year, season, episode, isMovie);
    const stream = await getM3U8(videoUrl);
    console.log('✅ Stream URL:', stream);
    console.log('📺 Quality:', quality);
    return { stream, quality };
  } catch (err) {
    console.error('❌ LordChannel Error:', err.message);
    return null;
  }
}

module.exports = { lordchannel };

/*
// Example test:
(async () => {
  await lordchannel('tt18412256');
})(); 
*/