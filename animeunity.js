const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const { getMappingsFromKitsu } = require('./utils/mediainfo');

const STREAM_SITE = process.env.AU_DOMAIN;

async function search(showName) {
    const mainPage = await axios.get(STREAM_SITE, {
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    });
    const $ = cheerio.load(mainPage.data);
    const csrfToken = $('meta[name="csrf-token"]').attr('content');
    const cookies = mainPage.headers['set-cookie'] || [];
    const sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');

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
    const response = await axios.post(url, { title: showName }, { headers });
    //console.log(response.data);
    /*INFO: returns an array json with dub = 0 for sub and dub = 1 for dub, also they share the same anilist_id -> response:
    {
    "records": [
        {
            "id": 12,
            "user_id": 2,
            "title": null,
            "imageurl": "https:\/\/cdn.myanimelist.net\/images\/anime\/1810\/139965.jpg",
            "plot": "Monkey D. Rufy \u00e8 un giovane pirata sognatore che da piccolo ha inavvertitamente mangiato il frutto del diavolo Gom Gom che lo rende \"elastico\", permettendogli di allungarsi e deformarsi a piacimento, a scapito, per\u00f2, della capacit\u00e0 di nuotare. L'obiettivo che lo ha spinto in mare \u00e8 quello ambizioso di diventare il Re dei pirati. Dovr\u00e0, dunque, ritrovare il leggendario \"One Piece\", il magnifico tesoro lasciato dal mitico pirata Gol D. Roger probabilmente sull'isola di Raftel, alla fine della Rotta Maggiore, mai ritrovato e sogno di ogni pirata.Nella sua avventura, Rufy riunir\u00e0 intorno a lui una ciurma e si trover\u00e0 in mezzo a situazioni bizzarre e stravaganti, tanto almeno quanto lo sono i personaggi, amici o nemici, presenti nell'universo che lo circonda, che raggiungono spesso livelli assurdi e grotteschi e che donano all'opera un'atmosfera surreale e divertente.",
            "date": "1999",
            "episodes_count": 0,
            "episodes_length": 24,
            "author": " ",
            "created_at": "2020-07-04 02:46:59",
            "status": "In Corso",
            "imageurl_cover": "https:\/\/s4.anilist.co\/file\/anilistcdn\/media\/anime\/banner\/21-wf37VakJmZqs.jpg",
            "type": "TV",
            "slug": "one-piece",
            "title_eng": "One Piece",
            "day": "Indeterminato",
            "favorites": 8128,
            "score": "9.41",
            "visite": 92985893,
            "studio": "Toei Animation",
            "dub": 0,
            "always_home": 1,
            "members": 23234,
            "cover": "https:\/\/img.animeworld.so\/copertine\/qzG-LE.jpg",
            "anilist_id": 21,
            "season": "Autunno",
            "title_it": null,
            "mal_id": 21,
            "crunchy_id": null,
            "netflix_id": null,
            "prime_id": "0QN6GA8OASZY2UYU67FDBYSVNX",
            "disney_id": null,
            "real_episodes_count": 1155
        },
        {
            "id": 2998,
            "user_id": 2,
            "title": null,
            "imageurl": "https:\/\/img.animeworld.so\/locandine\/d5nahE.png",
            "plot": "Monkey D. Rufy \u00e8 un giovane pirata sognatore che da piccolo ha inavvertitamente mangiato il frutto del diavolo Gom Gom che lo rende \"elastico\", permettendogli di allungarsi e deformarsi a piacimento, a scapito, per\u00f2, della capacit\u00e0  di nuotare. L'obiettivo che lo ha spinto in mare \u00e8 quello ambizioso di diventare il Re dei pirati. Dovr\u00e0 , dunque, ritrovare il leggendario \"One Piece\", il magnifico tesoro lasciato dal mitico pirata Gol D. Roger probabilmente sull'isola di Raftel, alla fine della Rotta Maggiore, mai ritrovato e sogno di ogni pirata.Nella sua avventura, Rufy riunir\u00e0  intorno a lui una ciurma e si trover\u00e0  in mezzo a situazioni bizzarre e stravaganti, tanto almeno quanto lo sono i personaggi, amici o nemici, presenti nell'universo che lo circonda, che raggiungono spesso livelli assurdi e grotteschi e che donano all'opera un'atmosfera surreale e divertente.",
            "date": "1999",
            "episodes_count": 0,
            "episodes_length": 24,
            "author": " ",
            "created_at": "2021-03-27 17:54:21",
            "status": "In Corso",
            "imageurl_cover": "https:\/\/s4.anilist.co\/file\/anilistcdn\/media\/anime\/banner\/21-wf37VakJmZqs.jpg",
            "type": "TV",
            "slug": "one-piece-ita",
            "title_eng": "One Piece (ITA)",
            "day": "Indeterminato",
            "favorites": 3444,
            "score": "9.23",
            "visite": 65365961,
            "studio": "Toei Animation",
            "dub": 1,
            "always_home": 0,
            "members": 9812,
            "cover": "https:\/\/img.animeworld.so\/copertine\/d5nah.png",
            "anilist_id": 21,
            "season": "Autunno",
            "title_it": null,
            "mal_id": 21,
            "crunchy_id": null,
            "netflix_id": null,
            "prime_id": "0N07MEA8EDPFAETQQTQ3NRKMS3",
            "disney_id": null,
            "real_episodes_count": 889
        }
    ]
    }

    the interesting field is id that we can use to get the links from the api endpoint /info_api/${id} -> /info_api/2998/${episode_number}?start_range=1&end_range=120 divides in 120 range max -> response:
        {"episodes_count":889,"current_episode":401,"episodes":
          [
          {"id":50935,"anime_id":2998,"user_id":2,"number":"361","created_at":"2021-03-27 20:26:21","link":"OnePiece_Ep_361_ITA.mp4","visite":82104,"hidden":0,"public":1,"scws_id":331587,"file_name":"OnePiece_Ep_361_ITA.mp4","tg_post":0},
          {"id":50936,"anime_id":2998,"user_id":2,"number":"362","created_at":"2021-03-27 20:26:24","link":"OnePiece_Ep_362_ITA.mp4","visite":68903,"hidden":0,"public":1,"scws_id":331591,"file_name":"OnePiece_Ep_362_ITA.mp4","tg_post":0}
          ]
        }

    so then we can use the id field to get the player page /anime/${id}-${slug}/${episode-id}
    */

    return response.data;
}

async function extractStreamUrl(animePageUrl, sessionCookie) {
    const headers = {
        'User-Agent': 'Mozilla/5.0',
        'Cookie': sessionCookie
    };
    const response = await axios.get(animePageUrl, { headers });
    const $ = cheerio.load(response.data);
    //console.log(response.data);
    const iframeSrc = $('video-player').attr('embed_url');
    //console.log('Extracted iframe source:', iframeSrc);
    // extract m3u8 playlist from embed url
    const embedResp = await axios.get(iframeSrc, { headers });
    const script = cheerio.load(embedResp.data)('body script').text();
    /* FIXME: m3u8 gives 403 error
    const token = /'token':\s*'([\w-]+)'/.exec(script)[1];
    const expires = /'expires':\s*'(\d+)'/.exec(script)[1];
    const quality = /"quality":(\d+)/.exec(script)[1];
    const id = iframeSrc.split('/embed/')[1].split('?')[0];
    return m3u8 = `https://vixcloud.co/playlist/${id}.m3u8?token=${token}&expires=${expires}`;
    */
    const mp4Match = /window\.downloadUrl\s*=\s*'([^']+)'/.exec(script);
    const mp4 = mp4Match ? mp4Match[1] : null;
    return mp4;
}

async function scrapeAnimeUnity(kitsuId, showName, type, season, episode) {
    try {

        // Get session cookie for subsequent requests
        const mainPage = await axios.get(STREAM_SITE, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const cookies = mainPage.headers['set-cookie'] || [];
        const sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');

        const searchResult = await search(showName);
        
        const anilistId = await getMappingsFromKitsu(kitsuId);
        
        let filteredRecords = [];
        let streams = [];
        if (type === "series") {
            filteredRecords = searchResult.records.filter(record => record.anilist_id == anilistId.anilistId);
            //console.log(`Found ${filteredRecords.length} matching records for Anilist ID ${anilistId.anilistId}`);

            for (const record of filteredRecords) {
                //console.log(`record: ${record.title_eng}`);
                let episodeId = record.id; // For anime with less than 120 episodes, the episode ID is the same as the anime ID
                let episodeFileName = null;
                if (record.real_episodes_count > 120 || record.episodes_count > 120){
                    const block = Math.floor((episode - 1) / 120);
                    const start_range = block * 120 + 1;
                    const end_range = (block + 1) * 120;
                    const infoUrl = `${STREAM_SITE}/info_api/${record.id}/${episode}?start_range=${start_range}&end_range=${end_range}`;
                    const infoResp = await axios.get(infoUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0',
                            'Cookie': sessionCookie
                        }
                    });
                    //console.log(`Info API response for ${record.title_eng} episode ${episode}:`, infoResp.data);
                    episodeId = infoResp.data.episodes.find(ep => ep.number === String(episode))?.id;
                    episodeFileName = infoResp.data.episodes.find(ep => ep.number === String(episode))?.file_name;
                    //console.log(`Found episode ID for ${record.title_eng} episode ${episode}:`, episodeId);
                }
                
                const animePageUrl = `${STREAM_SITE}/anime/${record.id}-${record.slug}/${episodeId}`;
                const streamUrl = await extractStreamUrl(animePageUrl, sessionCookie);
                if (streamUrl) {
                    streams.push({
                        url: streamUrl,
                        provider: 'vixcloud',
                        title: episodeFileName,
                        dub: record.dub === 1 ? 'ITA' : 'SUB'
                    });
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
    const serie = await scrapeAnimeUnity("12", "One Piece", "series", 1, 400);
    console.log(serie);
})();
*/