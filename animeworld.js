const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const { getMappingsFromKitsu } = require('./utils/mediainfo');

const STREAM_SITE = process.env.AW_DOMAIN;

async function parsePlayerPage(pageUrl, type, season, episode) {
    try {

        let response = await axios.get(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
            //const downloadUrl = $('#download #downloadLink').attr('href');
            //if (downloadUrl) links.push(downloadUrl); //FIXME: not web ready
            const alternativeDownloadUrl = $('#download #alternativeDownloadLink').attr('href');
            if (alternativeDownloadUrl) links.push(alternativeDownloadUrl);

        }

        return links;

    } catch (error) {
        console.error('❌ AnimeWorld Error parsing player page:', error.message);
        return null;
    }

}

async function search(showname, sessionCookie, csrfToken) {
    try {
        const keyword = encodeURIComponent(showname.replace(/\+/g, ' '));
        const url = `${STREAM_SITE}/api/search/v2?keyword=${keyword}`;
        //const url = `${STREAM_SITE}/filter?sort=2&keyword=${keyword}`; //FIXME: harder to parse

        const headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:148.0) Gecko/20100101 Firefox/148.0',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'X-Requested-With': 'XMLHttpRequest',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Sec-GPC': '1',
            'Connection': 'keep-alive',
            'Referer': `${STREAM_SITE}/search?keyword=${keyword}`,
            'Origin': STREAM_SITE,
            'CSRF-Token': csrfToken,
            'Cookie': sessionCookie
        };

        const response = await axios.post(url, {  
            timeout: 1500,
            signal: AbortSignal.timeout(5000)
        }, { headers });
        //console.log(response.data);

        return response.data;
    } catch (error) {
        console.error('❌ AnimeWorld search error:', error.message);
        return null;
    }
}

async function scrapeAnimeWorld(kitsuId, showName, type, season, episode) {
    try {
        //console.log(`AnimeWorld: Fetching streams for ${showName} (Type: ${type}, Season: ${season}, Episode: ${episode})`);

        mainPage = await axios.get(`${STREAM_SITE}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });             

        const $ = cheerio.load(mainPage.data);
        const csrfToken = $('meta[name="csrf-token"]').attr('content');
        const cookies = mainPage.headers['set-cookie'] || [];
        const sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');

        const results = await search(showName, sessionCookie, csrfToken);
        if (!results) {
            console.error(`❌ AnimeWorld: No results found for "${showName}"`);
            return null;
        }   

        const anilistId = await getMappingsFromKitsu(kitsuId);

        let filteredRecords = [];
        let playerLinks = [];
        let streams = [];
        if (type === "series") {
            filteredRecords = results.animes.filter(animes => animes.anilistId == anilistId.anilistId);
            //console.log(`Found ${filteredRecords.length} matching records for Anilist ID ${anilistId.anilistId}`);

            for (const record of filteredRecords) {
                //console.log(`record: ${record.name} ${record.link} ${record.dub} ${record.language} ${record.identifier}`);
                let pageUrl = `${STREAM_SITE}/play/${record.link}.${record.identifier}`;
                playerLinks = await parsePlayerPage(pageUrl, type, season, episode);
                if (!playerLinks?.length) {
                    console.error('❌ AnimeWorld: No links found in player page');
                    return null;
                } else {
                    //console.log('✅ AnimeWorld Player Links:', playerLinks);
                    for (const streamObj of playerLinks) {
                        if (streamObj) {streams.push({ 
                            url: streamObj, 
                            provider: 'Unknown', 
                            dub: record.dub == 1 ? 'ITA' : 'SUB', });
                        }
                        
                    }
                }
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
    //const serie = await scrapeAnimeWorld("48108", "Dragon Ball Daima", "series", 1, 2);
    const serie = await scrapeAnimeWorld("12", "One Piece", "series", 1, 400);
})();

