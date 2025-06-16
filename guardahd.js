const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const { extractDirectLink } = require('./utils/streamproviders');

const STREAM_SITE = process.env.GHD_DOMAIN;

/**
 * Search for the video link on GuardaHD.
 */
async function search(cleanId) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    };

    const response = await axios.get(`${STREAM_SITE}/movie/${cleanId}`, {
      headers,
      maxRedirects: 10,
      timeout: 30000,
      
    });

    if (response.status !== 200) {
      console.error(`GuardaHD Failed to fetch search results: ${response.status}`);
      return null;
    }

    const $ = cheerio.load(response.data);

    // Get all data-link attributes from <li> elements
    const playerLinks = [];
    $('li[data-link]').each((i, el) => {
      const link = $(el).attr('data-link');
      if (link && link.trim() !== '') {
        playerLinks.push(link.startsWith('//') ? 'https:' + link : link);
      }
    });
    //console.log('GuardaHD player links:', playerLinks);
   
    return playerLinks.length > 0 ? playerLinks : null;
  } catch (error) {
    console.error('Error in search:', error.message);
    return null;
  }
}

/**
 * Main GuardaHD scraper function.
 */
async function scrapeGuardaHD(imdbId, showName, type, season, episode) {
  try {

    if (type != 'movie') {
      console.error('❌ GuardaHD only supports movies, skipping...');
      return null;
    }

    const playerLinks = await search(imdbId);

    let streams = [];

    if (!playerLinks || playerLinks.length === 0) {
      console.error('❌ GuardaHD No player links found');
      return null;
    }else{
      //console.log('✅ GuardaHD Player Links:', playerLinks);
      for (const link of playerLinks) {
        try {
          const streamObj = await extractDirectLink(link);
          if (streamObj) streams.push(streamObj);
        } catch (error) {
          console.error(`⚠️ Failed to extract stream from ${link}:`, error.message);
          // Continue with next link instead of crashing
          continue;
        }
      }
      
      // Only return if we found at least one valid stream
      if (streams.length === 0) {
        console.error('❌ GuardaHD: No valid streams found');
        return null;
      }
    }
    
    console.log('✅ GuardaHD Stream URLs:', streams);
    return { streams };
  } catch (error) {
    console.error('❌ GuardaHD Error:', error.message);
    return null;
  }
}

module.exports = { scrapeGuardaHD };

/*
(async () => {
  const movie = await scrapeGuardaHD('tt28309594', 'Nonnas', 'movie');

})();
*/