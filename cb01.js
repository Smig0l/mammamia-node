const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const { extractDirectLink, bypassProtectedLink } = require('./utils/streamproviders');

const STREAM_SITE = process.env.CB_DOMAIN || 'https://cb01net.download' || 'https://cb01.uno';

/**
 * Extract the real movie URL from CB01.
 */
async function parsePlayerPage(link, type, season, episode) {
    try {

      const playerLinks = [];

      if (type === 'movie'){
        const response = await axios.get(link, { headers: { Referer: `${STREAM_SITE}/` } });
        const $ = cheerio.load(response.data);
        //console.log(response.data);

        $('#iframen1, #iframen2').each((i, el) => {
          const link = $(el).data('src');
          if (link && link.trim() !== '') {
            playerLinks.push(link.startsWith('//') ? 'https:' + link : link);
          }
        });
      } else { // For series, we need to handle the season and episode links
        
        // Find the season div (case insensitive search for STAGIONE/Stagione)
        const seasonDiv = $(`.sp-wrap`).filter((_, el) => {
          return $(el).text().match(new RegExp(`STAGION[IE]\\s*${season}\\s*-?\\s*ITA`, 'i'));
        });
        
        // Look for episode link (format: 1×01, 2×02, etc)
        const episodePattern = `${season}×${episode.toString().padStart(2, '0')}`;
        
        // Find all links that contain our episode pattern
        seasonDiv.find('a').each((_, element) => {
          const $parent = $(element).parent('p');
          if ($parent.text().includes(episodePattern)) {
            //const provider = $(element).text().toLowerCase();
            const link = $(element).attr('href');
            playerLinks.push({link});
          }
        });

      }
      //console.log('CB01 Player Links:', playerLinks);
      return playerLinks.length > 0 ? playerLinks : null;

    } catch (error) {
        console.error('Error in parsePlayerPage:', error.message);
    }
    return null;
}

/**
 * Generic search function for both movies and series
 */
async function search(showName, type = 'movie') {
  try {
    const searchPath = type === 'series' ? '/serietv/' : '/';
    const query = `${STREAM_SITE}${searchPath}?s=${encodeURIComponent(showName)}`;
    const response = await axios.get(query, { 
      headers: { 
        Referer: `${STREAM_SITE}${searchPath}` 
      } 
    });

    const $ = cheerio.load(response.data);
    const firstResult = $('.card-content').first();
    const link = firstResult.find('h3.card-title a').attr('href');
    const title = firstResult.find('h3.card-title a').text().trim();
    
    return link || null;
  } catch (error) {
    console.error(`❌ Search error (${type}):`, error.message);
    return null;
  }
}

/**
 * Main CB01 scraper function with unified search
 */
async function scrapeCb01(imdbId, showName, type, season = null, episode = null) {
  try {
    // Use unified search function
    const results = await search(showName, type);
    if (!results) {
      console.error(`❌ CB01: No ${type} found for "${showName}"`); //FIXME: some showName may not be found because of language differences
      return null;
    }

    let streams = [];

    playerLinks = await parsePlayerPage(results, type, season, episode);

    if (!playerLinks?.length) {
      console.error('❌ CB01: No links found in player page');
      return null;
    } else{
      //console.log('✅ CB01 Player Links:', playerLinks);
      for (const link of playerLinks) {
        const protectedstreamlink = await bypassProtectedLink(link);
        if (protectedstreamlink) {
          //console.log('✅ CB01 Protected Stream Link:', protectedstreamlink);
          const streamObj = await extractDirectLink(protectedstreamlink);
          if (streamObj) streams.push(streamObj);
        }
      }
    }

    console.log('✅ CB01 Stream URLs:', streams);
    return { streams };

  } catch (error) {
    console.error('❌ CB01 Error:', error.message);
    return null;
  }
}

module.exports = { scrapeCb01 };

/*
(async () => {
  console.log("TESTING: ", STREAM_SITE);
  // Uncomment to test:
  const movie = await scrapeCb01('tt28309594', 'Nonnas', 'movie');
  const series = await scrapeCb01('tt3581920', 'The Last of Us', 'series', 2, 1);
})();
*/