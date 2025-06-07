const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const STREAM_SITE = process.env.AW_DOMAIN || 'https://www.animeworld.ac';

async function parsePlayerPage(anime_url, type, season, episode) {
    try {

        let response = await axios.get(`${STREAM_SITE}${anime_url}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        let $ = cheerio.load(response.data);
        //console.log('Parsed player page', response.data);

        const links = [];

        if (type !== "movie") {
            const episodeLink = $(`a[data-episode-num="${episode}"]`).attr('href');
            if (!episodeLink) return null;
            response = await axios.get(`${STREAM_SITE}${episodeLink}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            $ = cheerio.load(response.data);
            //console.log('Parsed episode page',`${STREAM_SITE}${episodeLink}`, response.data);

            /* comment out because player are simply embeds of download links
            const playerEpId = $('#player').attr('data-id');
            console.log('Player found:', playerEpId);
            links.push(`${STREAM_SITE}/api/episode/serverPlayerAnimeWorld?id=${playerEpId}`);
            links.push(`${STREAM_SITE}/api/episode/serverPlayerAnimeWorld?alt=1&id=${playerEpId}`);
            */
            const downloadUrl = $('#download #downloadLink').attr('href');
            if (downloadUrl) links.push(downloadUrl);
            const alternativeDownloadUrl = $('#download #alternativeDownloadLink').attr('href');
            if (alternativeDownloadUrl) links.push(alternativeDownloadUrl);

        }

        return links;

    } catch (error) {
        console.error('❌ AnimeWorld Error parsing player page:', error.message);
        return null;
    }

}

async function search(showname, type, episode) {
    try {
        const keyword = encodeURIComponent(showname.replace(/\+/g, ' '));
        //const url = `${STREAM_SITE}/api/search/v2?keyword=${keyword}`; //TODO:FIXME: axios post tls error, would be better because returns json
        const url = `${STREAM_SITE}/filter?sort=2&keyword=${keyword}`;

        const headers = {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Referer': `${STREAM_SITE}/search?keyword=${keyword}`,
            'Origin': STREAM_SITE,
            'X-Requested-With': 'XMLHttpRequest'
        };

        const response = await axios.get(url, {}, { headers });
        //console.log(response.data);
        const $ = cheerio.load(response.data);

        const firstLink = $('.film-list .item .inner a').first().attr('href'); //FIXME: parse correct link
        //console.log('First link found:', firstLink);
        return firstLink;
    } catch (error) {
        console.error('❌ AnimeWorld search error:', error.message);
        return null;
    }
}

async function scrapeAnimeWorld(kitsuId, showName, type, season, episode) {
    try {
        console.log(`AnimeWorld: Fetching streams for ${showName} (Type: ${type}, Season: ${season}, Episode: ${episode})`);
        const results = await search(showName);  //FIXME: some showName may not be found because of language differences and search engine
        if (!results) {
            console.error(`❌ AnimeWorld: No results found for "${showName}"`);
            return null;
        }   

        let streams = [];
        let playerLinks = [];

        playerLinks = await parsePlayerPage(results, type, season, episode);
        if (!playerLinks?.length) {
            console.error('❌ AnimeWorld: No links found in player page');
            return null;
        } else {
      //console.log('✅ AnimeWorld Player Links:', playerLinks);
      for (const link of playerLinks) {
          const streamObj = { url: link, provider: 'Unknown', dub: 'Unknown' };
          if (streamObj) streams.push(streamObj);
        
      }
    }

    console.log('✅ AnimeWorld Stream URLs:', streams);
    return { streams };

    } catch (e) {
        console.error("AnimeWorld failed", e);
        return null;
    }
}

module.exports = { scrapeAnimeWorld };

(async () => { 
    //const serie = await scrapeAnimeWorld("7442", "Shingeki no Kyojin", "series", 1, 1);

})();

