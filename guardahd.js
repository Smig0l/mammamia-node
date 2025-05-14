const axios = require('axios');
const cheerio = require('cheerio');
const { getTMDbIdFromIMDb, getShowInfo } = require('./info');
require('dotenv').config();

const GHD_DOMAIN = process.env.GHD_DOMAIN || 'https://mostraguarda.stream';

/**
 * Extract the final video link from SuperVideo.
 */
async function getSuperVideoLink(link) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    };

    const response = await axios.get(link, {
      headers,
      maxRedirects: 10,
      timeout: 30000,
    });

    const regex = /\}\('(.+)',.+,'(.+)'\.split/;
    const match = regex.exec(response.data);

    if (!match) {
      throw new Error('Failed to extract SuperVideo terms.');
    }

    const terms = match[2].split('|');
    const fileIndex = terms.indexOf('file');
    let hfs = null;

    for (let i = fileIndex; i < terms.length; i++) {
      if (terms[i].includes('hfs')) {
        hfs = terms[i];
        break;
      }
    }

    const urlsetIndex = terms.indexOf('urlset');
    const hlsIndex = terms.indexOf('hls');
    const result = terms.slice(urlsetIndex + 1, hlsIndex).reverse();

    let baseUrl = `https://${hfs}.serversicuro.cc/hls/`;
    if (result.length === 1) {
      return `${baseUrl},${result[0]}.urlset/master.m3u8`;
    }

    for (let i = 0; i < result.length; i++) {
      baseUrl += result[i] + (i === result.length - 1 ? '.urlset/master.m3u8' : ',');
    }

    return baseUrl;
  } catch (error) {
    console.error('Error in getSuperVideoLink:', error.message);
    return null;
  }
}

/**
 * Search for the video link on GuardaHD.
 */
async function search(cleanId) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    };
    console.log(cleanId);

    const response = await axios.get(`${GHD_DOMAIN}/set-movie-a/${cleanId}`, {
      headers,
      maxRedirects: 10,
      timeout: 30000,
      
    });

    if (response.status !== 200) {
      console.error(`GuardaHD Failed to fetch search results: ${response.status}`);
      return null;
    }

    const $ = cheerio.load(response.data);
    const liTag = $('li').first();
    const href = `https:${liTag.attr('data-link')}`;
    return href;
  } catch (error) {
    console.error('Error in search:', error.message);
    return null;
  }
}

/**
 * Main GuardaHD scraper function.
 */
async function guardahd(id) {
  try {
    const { isMovie, tmdbId } = await getTMDbIdFromIMDb(id);

    if (!isMovie) {
      return null;
    }

    const superVideoLink = await search(tmdbId);
    if (!superVideoLink) {
      return null;
    }

    const finalUrl = await getSuperVideoLink(superVideoLink);
    return finalUrl;
  } catch (error) {
    console.error('MammaMia: GuardaHD Failed', error.message);
    return null;
  }
}

module.exports = { guardahd };

/*
(async () => {
  const testId = 'tt18412256';
  const result = await guardahd(testId);
  console.log('GuardaHD Result:', result);
})();
*/