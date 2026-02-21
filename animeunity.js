const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const { getMappingsFromKitsu } = require('./utils/mediainfo');
const { HttpsProxyAgent } = require('https-proxy-agent');

const STREAM_SITE = process.env.AU_DOMAIN;
let USE_PROXY = false;
let httpsAgent = null;

async function fetchProxies() {
    const resp = await axios.get('https://free.redscrape.com/api/proxies?protocol=http&max_timeout=1500&format=json');
    return resp.data.filter(p => p.is_working).sort((a, b) => a.last_checked - b.last_checked);
}

async function search(showName, sessionCookie, csrfToken) {
    
    const url = `${STREAM_SITE}/livesearch`;
    const headers = { 
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Referer': STREAM_SITE,
        'Origin': STREAM_SITE,
        'x-requested-with': 'XMLHttpRequest',
        'X-CSRF-TOKEN': csrfToken,
        'Cookie': sessionCookie
    };   
    const response = await axios.post(url, { title: showName }, { headers, httpsAgent: USE_PROXY ? httpsAgent : undefined });
    //console.log(response.data);
    return response.data;
}

async function extractStreamUrl(animePageUrl, sessionCookie) {
    const headers = {
        'User-Agent': 'Mozilla/5.0',
        'Cookie': sessionCookie
    };
    const response = await axios.get(animePageUrl, { headers, httpsAgent: USE_PROXY ? httpsAgent : undefined });
    const $ = cheerio.load(response.data);
    //console.log(response.data);
    const iframeSrc = $('video-player').attr('embed_url');
    //console.log('Extracted iframe source:', iframeSrc);
    // extract m3u8 playlist from embed url
    const embedResp = await axios.get(iframeSrc, { headers, httpsAgent: USE_PROXY ? httpsAgent : undefined });
    const script = cheerio.load(embedResp.data)('body script').text();
    //console.log('Extracted script content:', script);
    
    const token = /'token':\s*'([\w-]+)'/.exec(script)[1];
    const expires = /'expires':\s*'(\d+)'/.exec(script)[1];
    //const quality = /"quality":(\d+)/.exec(script)[1];
    const canplayfhdMatch = /window\.canPlayFHD\s*=\s*(true|false)/.exec(script);
    const canplayfhd = canplayfhdMatch ? canplayfhdMatch[1] === 'true' : false;
    const id = iframeSrc.split('/embed/')[1].split('?')[0];
    const m3u8 = `https://vixcloud.co/playlist/${id}.m3u8?token=${token}&expires=${expires}&h=${canplayfhd ? 1 : 0}`;
    //console.log('Extracted m3u8 URL:', m3u8);
    
    const mp4Match = /window\.downloadUrl\s*=\s*'([^']+)'/.exec(script);
    const mp4 = mp4Match ? mp4Match[1] : null;
    //console.log('Extracted MP4 URL:', mp4);

    const results = [];
    if (m3u8) {
        results.push({
            url: m3u8,
            type: 'm3u8',
            description: 'HLS Stream (m3u8)',
            name: 'HLS',
            filename: `${id}.m3u8`
        });
    }
    if (mp4) {
        results.push({
            url: mp4,
            type: 'mp4',
            description: 'Direct MP4 Download',
            name: 'MP4',
            filename: mp4.split('/').pop()
        });
    }
    return results;
}

async function scrapeAnimeUnity(kitsuId, showName, type, season, episode) {
    try {

        // Get session cookie for subsequent requests
        let mainPage = await axios.get(STREAM_SITE, {
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
        });
        if (mainPage.status == 403) { //TODO: change 403 in prod
            console.error(`Failed to access ${STREAM_SITE}. Block detected. Attempting to use proxies...`);
            USE_PROXY = true;
            let proxies = await fetchProxies();
            if (proxies.length === 0) {
                    proxies = await fetchProxies();
                    if (proxies.length === 0) {
                        throw new Error('No working proxies available');
                    }
                }
                
            const proxy = proxies[0]; // Use the most recently checked working proxy //FIXME: implement retry with multiple proxies if the first one fails
            console.log(`Using proxy: ${proxy.address}:${proxy.port}`);
            httpsAgent = new HttpsProxyAgent({host: proxy.address, port: proxy.port });

            mainPage = await axios.get(STREAM_SITE, {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                httpsAgent
            });
            
        }

        const $ = cheerio.load(mainPage.data);
        const csrfToken = $('meta[name="csrf-token"]').attr('content');
        const cookies = mainPage.headers['set-cookie'] || [];
        const sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');

        const searchResult = await search(showName, sessionCookie, csrfToken);
        
        const anilistId = await getMappingsFromKitsu(kitsuId);
        
        let filteredRecords = [];
        let streams = [];
        if (type === "series") {
            filteredRecords = searchResult.records.filter(record => record.anilist_id == anilistId.anilistId);
            //console.log(`Found ${filteredRecords.length} matching records for Anilist ID ${anilistId.anilistId}`);

            for (const record of filteredRecords) {
                //console.log(`record: ${record.title_eng}`);
                let episodeId = null;
                let episodeFileName = null;
                let block = null;
                let start_range = null;
                let end_range = null;
                if (record.real_episodes_count > 120 || record.episodes_count > 120){
                    block = Math.floor((episode - 1) / 120);
                    start_range = block * 120 + 1;
                    end_range = (block + 1) * 120;
                } else {
                    start_range = 1;
                    end_range = record.real_episodes_count || record.episodes_count;
                }
                const infoUrl = `${STREAM_SITE}/info_api/${record.id}/${episode}?start_range=${start_range}&end_range=${end_range}`;
                const infoResp = await axios.get(infoUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Cookie': sessionCookie
                    },
                    httpsAgent: USE_PROXY ? httpsAgent : undefined
                });
                //console.log(`Info API response for ${record.title_eng} episode ${episode}:`, infoResp.data);
                episodeId = infoResp.data.episodes.find(ep => ep.number === String(episode))?.id;
                episodeFileName = infoResp.data.episodes.find(ep => ep.number === String(episode))?.file_name;
                //console.log(`Found episode ID for ${record.title_eng} episode ${episode}:`, episodeId);
                
                const animePageUrl = `${STREAM_SITE}/anime/${record.id}-${record.slug}/${episodeId}`;
                //console.log(`Constructed anime page URL for ${record.title_eng} episode ${episode}:`, animePageUrl);
                let streamUrls = await extractStreamUrl(animePageUrl, sessionCookie);
                for (const streamObj of streamUrls) {
                    if (streamObj) {
                        streams.push({
                            url: streamObj.url,
                            provider: 'vixcloud',
                            dub: record.dub === 1 ? 'ITA' : 'SUB',
                            filename: streamObj.filename,
                            description: streamObj.description,
                            name: streamObj.name,
                            type: streamObj.type
                        });
                    }
                }
                    
            }
        }

        console.log('✅ Animeunity Stream URLs:', streams);
        return { streams };
    } catch (error) {
        console.error('❌ Animeunity Error:', error.message);
        return null;
    }
}

module.exports = { scrapeAnimeUnity };

/*
(async () => {
    const serie = await scrapeAnimeUnity("48108", "Dragon Ball Daima", "series", 1, 2);
    console.log(serie);
})();
*/