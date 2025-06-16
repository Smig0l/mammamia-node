const axios = require('axios');
const cheerio = require('cheerio');
const { extractDirectLink } = require('./utils/streamproviders');
require('dotenv').config();

const STREAM_SITE = process.env.TF_DOMAIN;

const headers = {
    'Referer': STREAM_SITE,
    'Origin': STREAM_SITE,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

async function parsePlayerPage(link, type, season, episode) {
    try {
        if (type === 'movie') {
            const response = await axios.get(link, { headers });
            
            // Look for src containing ldl/tt pattern using regex
            const hrefRegex = /src="([^"]*ldl\/tt\d+[^"]*)"/;
            const match = response.data.match(hrefRegex);
            
            if (match) {
                //console.log('Found player URL:', match[1]);
                //return match[1];
                //TODO: it just embeds the GuardaHD page...
            }
            
            return null;
        } else { // handle series
            const response = await axios.get(link, { headers });
            const $ = cheerio.load(response.data);
            
            // Find the specified season container
            const seasonId = `season-${season}`;
            const links = [];
            
            // Find the specific episode within that season
            $(`#${seasonId} ul li`).each((_, epEl) => {
                const epNum = $(epEl).find('a').first().attr('data-num');
                if (epNum === `${season}x${episode}`) {
                    // Get all mirror links for this episode
                    $(epEl).find('.mirrors a.mr').each((_, mirrorEl) => {
                        const mirrorLink = $(mirrorEl).attr('data-link');
                        if (mirrorLink) {
                            links.push(mirrorLink);
                        }
                    });
                }
            });

            return links;
        }
    } catch (error) {
        console.error('❌ TantiFilm Error parsing player page:', error.message);
        return null;
    }
}

async function search(showname) {
    try {
        const shownameQuery = showname.replace(/ /g, '+');
        const url = `${STREAM_SITE}/?story=${shownameQuery}&do=search&subaction=search`;
        
        const response = await axios.get(url, { headers });
        const $ = cheerio.load(response.data);
        //console.log(response.data)

        const firstLink = $('.title-film.title-film-2 a').first().attr('href');

        return firstLink;

    } catch (error) {
        console.error(`❌ TantiFilm Search error:`, error.message);
    }   
}

async function scrapeTantiFilm(imdbId, showName, type, season = null, episode = null) {

    const results = await search(imdbId);  //FIXME: some showName may not be found because of language differences and search engine
    if (!results) {
        console.error(`❌ TantiFilm: No results found for "${showName}"`);
        return null;
    }   

    let streams = [];

    playerLinks = await parsePlayerPage(results, type, season, episode);
    if (!playerLinks?.length) {
      console.error('❌ TantiFilm: No links found in player page');
      return null;
    } else {
      //console.log('✅ TantiFilm Player Links:', playerLinks);
      for (const link of playerLinks) {
          const streamObj = await extractDirectLink(link);
          if (streamObj) streams.push(streamObj);
        
      }
    }

    console.log('✅ TantiFilm Stream URLs:', streams);
    return { streams };
    
}

module.exports = { scrapeTantiFilm };

/*
(async () => {
    //const movie = await scrapeTantiFilm('tt28309594', 'Nonnas', 'movie');
    //const series = await scrapeTantiFilm('tt31510819', 'MobLand', 'series', 1, 1);
})();
*/