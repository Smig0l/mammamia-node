const axios = require('axios');
const cheerio = require('cheerio');
const { getTMDbIdFromIMDb, getShowInfo } = require('./info');
require('dotenv').config();

const CB_DOMAIN = process.env.CB_DOMAIN || 'https://cb01net.icu';

/**
 * Extract the real movie URL from CB01.
 */
async function movieRedirectUrl(link) {
    try {
        const response = await axios.get(link, { headers: { Referer: `${CB_DOMAIN}/` } });
        const $ = cheerio.load(response.data);
        //console.log(response.data);

        const playerLinks = [];
        $('#iframen1, #iframen2').each((i, el) => {
          const link = $(el).data('src');
          if (link && link.trim() !== '') {
            playerLinks.push(link.startsWith('//') ? 'https:' + link : link);
          }
        });

        let streams = [];
        let provider = "";
        for (const link of playerLinks) {
          provider = "mixdrop";
          if (link.includes("stayonline")) {
            let redirectUrl = await getStayOnlineUrl(link);
            if (redirectUrl && redirectUrl.includes(provider)) {
              let stream = await getTrueLinkMixdrop(redirectUrl);
              if (stream) {
                streams.push({ url: stream, provider });
              }
            }
            continue;
          }
          provider = "maxstream";
          if (link.includes("uprot")) {
            //TODO: protected by captcha
            continue;
          }
        }

      return streams.length > 0 ? streams : null;
    } catch (error) {
        console.error('Error in movieRedirectUrl:', error.message);
    }
    return null;
}

/**
 * Extract the real URL from StayOnline links.
 */
async function getStayOnlineUrl(link) {
    try {
        const headers = {
            'origin': 'https://stayonline.pro',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
            'x-requested-with': 'XMLHttpRequest',
        };
        const response = await axios.post('https://stayonline.pro/ajax/linkEmbedView.php', {
        id: link.split('/').slice(-2, -1)[0],
        ref: ''
        }, { headers: headers });

        return response.data.data.value;
    } catch (error) {
        console.error('Error in getStayOnlineUrl:', error.message);
    }
    return null;
}

/**
 * Extract the real URL from Mixdrop links.
 */
async function getTrueLinkMixdrop(realLink) {
    try {

        if (realLink.includes('club')) {
            realLink = realLink.replace('club', 'my').split('/2')[0];
        }        
  
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      };
  
      const response = await axios.get(realLink, { headers, maxRedirects: 10, timeout: 30000 });
      const regex = /\}\('(.+)',.+,'(.+)'\.split/;
      const match = regex.exec(response.data);
  
      if (!match) {
        throw new Error('Failed to extract Mixdrop schema and terms.');
      }
  
      const [_, schemaRaw, termsRaw] = match;
      const schema = schemaRaw.split(';')[2].slice(5, -1);
      const terms = termsRaw.split('|');
      const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const mapping = {};
  
      for (let i = 0; i < terms.length; i++) {
        mapping[charset[i]] = terms[i] || charset[i];
      }
  
      let finalUrl = 'https:';
      for (const char of schema) {
        finalUrl += mapping[char] || char;
      }
  
      //console.log(finalUrl);
      return finalUrl;
    } catch (error) {
      console.error('Error in getTrueLinkMixdrop:', error.message);
      return null;
    }
}

/**
 * Extract the real URL from MaxStream links.
 */
async function getMaxStreamUrl(link) {
    try {
        const response = await axios.get(link, { headers: { Referer: `${CB_DOMAIN}/` } });
        const $ = cheerio.load(response.data);

        const maxStreamUrl = $('a').attr('href');
        return maxStreamUrl;
    } catch (error) {
        console.error('Error in getMaxStreamUrl:', error.message);
    }
    return null;
}

/**
 * Search for a movie on CB01.
 */
async function searchMovie(showName, year) {
  try {
    const query = `${CB_DOMAIN}/?s=${encodeURIComponent(showName)}`;
    const response = await axios.get(query, { headers: { Referer: `${CB_DOMAIN}/` } });
    const $ = cheerio.load(response.data);
    const cards = $('.card-content');

    for (const card of cards) {
      const link = $(card).find('h3.card-title a').attr('href');
      const dateText = link.split('/').slice(-2, -1)[0];
      if (dateText.includes(year)) return link;
    }
  } catch (error) {
    console.error('Error in searchMovie:', error.message);
  }
  return null;
}

/**
 * Search for a series on CB01.
 */
async function searchSeries(showName, year) {
  try {
    const query = `${CB_DOMAIN}/serietv/?s=${encodeURIComponent(showName)}`;
    const response = await axios.get(query, { headers: { Referer: `${CB_DOMAIN}/serietv/` } });
    const $ = cheerio.load(response.data);
    const cards = $('.card-content');

    for (const card of cards) {
      const link = $(card).find('h3.card-title a').attr('href');
      const dateText = $(card).find('span[style*="color"]').text();
      if (dateText.includes(year)) return link;
    }
  } catch (error) {
    console.error('Error in searchSeries:', error.message);
  }
  return null;
}

/**
 * Extract the final series URL.
 */
async function seriesRedirectUrl(link, season, episode) {
  try {
    const response = await axios.get(link);
    const $ = cheerio.load(response.data);
    const seasonDiv = $(`.sp-head:contains('STAGIONE ${season}')`).next('.sp-body');
    const episodeLink = seasonDiv.find(`a:contains('${episode}')`).attr('href');
    return episodeLink;
  } catch (error) {
    console.error('Error in seriesRedirectUrl:', error.message);
  }
  return null;
}

/**
 * Main CB01 scraper function.
 */
async function cb01(id) {
  try {
    const { isMovie, tmdbId } = await getTMDbIdFromIMDb(id);
    const { showName, year } = await getShowInfo(tmdbId, isMovie);

    if (isMovie) {
      const movieLink = await searchMovie(showName, year);
      streams = await movieRedirectUrl(movieLink);
    } else { //FIXME:
      const season = '01'; // Replace with actual season
      const episode = '01'; // Replace with actual episode
      const seriesLink = await searchSeries(showName, year);
      streams = await seriesRedirectUrl(seriesLink, season, episode);
    }

    console.log('✅ CB0l Stream URLs:', streams);
    return { streams };
  } catch (error) {
    console.error('❌ CB0l Error:', err.message);
    return null;
  }
}

module.exports = { cb01 };

/*
(async () => {
    console.log("TESTING: ", `${CB_DOMAIN}`)
    const result = await cb01('tt18412256');
    console.log("RESULT: ", result);
  })();
*/