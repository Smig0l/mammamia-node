const axios = require('axios');
const cheerio = require('cheerio');
const { getTMDbIdFromIMDb, getShowInfo } = require('./info.js');
require('dotenv').config();

const AU_DOMAIN = process.env.AU_DOMAIN || 'https://www.animeunity.so';

async function search(showName, isMovie) {
    // Step 1: Get CSRF token and session cookie
    const mainPage = await axios.get(AU_DOMAIN, {
        headers: {
            'User-Agent': 'Mozilla/5.0'
        }
    });
    const $ = cheerio.load(mainPage.data);
    const csrfToken = $('meta[name="csrf-token"]').attr('content');
    const cookies = mainPage.headers['set-cookie'] || [];
    const sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');

    // Step 2: Use them in the POST request
    const url = `${AU_DOMAIN}/livesearch`;
    const headers = { 
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Referer': AU_DOMAIN,
        'Origin': AU_DOMAIN,
        'x-requested-with': 'XMLHttpRequest',
        'X-CSRF-TOKEN': csrfToken,
        'Cookie': sessionCookie
    };   
    const response = await axios.post(url, { title: showName }, { headers });
    //console.log(response.data);
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
    return iframeSrc;
}

async function getAniListInfo(anilistId) {
    const query = `
        query ($id: Int) {
            Media(id: $id, type: ANIME) {
                id
                title {
                    romaji
                    english
                    native
                }
                startDate { year }
                season
                seasonYear
                episodes
                relations {
                    edges {
                        node {
                            id
                            title { romaji english native }
                            startDate { year }
                            season
                            seasonYear
                            episodes
                        }
                        relationType
                    }
                }
            }
        }
    `;
    const variables = { id: parseInt(anilistId) };
    const response = await axios.post('https://graphql.anilist.co', {
        query,
        variables
    }, {
        headers: { 'Content-Type': 'application/json' }
    });
    const media = response.data.data.Media;
    // You can log media here for debugging
    console.log(media);
    return {
        id: media.id,
        title: media.title.english || media.title.romaji || media.title.native,
        year: media.startDate.year,
        season: media.season,
        seasonYear: media.seasonYear,
        episodes: media.episodes,
        relations: media.relations ? media.relations.edges.map(e => ({
            id: e.node.id,
            title: e.node.title.english || e.node.title.romaji || e.node.title.native,
            year: e.node.startDate.year,
            season: e.node.season,
            seasonYear: e.node.seasonYear,
            episodes: e.node.episodes,
            relationType: e.relationType
        })) : []
    };
}

// Helper: Recursively collect all seasons/arcs in order from AniList relations
function collectSeasons(mainInfo) {
    // Start with the main entry
    let entries = [{
        id: mainInfo.id,
        title: mainInfo.title,
        year: mainInfo.year,
        season: mainInfo.season,
        seasonYear: mainInfo.seasonYear,
        episodes: mainInfo.episodes
    }];
    // Find sequels/prequels in relations
    if (mainInfo.relations && Array.isArray(mainInfo.relations)) {
        // Only keep direct sequels/prequels
        let sequels = mainInfo.relations.filter(r =>
            r.relationType === "SEQUEL" || r.relationType === "PREQUEL"
        );
        // Sort by year/seasonYear
        sequels = sequels.sort((a, b) => {
            if (a.seasonYear !== b.seasonYear) return a.seasonYear - b.seasonYear;
            if (a.season && b.season) return a.season.localeCompare(b.season);
            return 0;
        });
        entries = entries.concat(sequels);
    }
    // Remove duplicates by id
    const seen = new Set();
    return entries.filter(e => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
    });
}

async function animeunity(id) {
    try {
        const [imdbId, season, episode] = id.split(':');
        const { isMovie, tmdbId } = await getTMDbIdFromIMDb(imdbId);
        const { showName, year: tmdbYear } = await getShowInfo(tmdbId, isMovie);

        // Get session cookie for subsequent requests
        const mainPage = await axios.get(AU_DOMAIN, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const cookies = mainPage.headers['set-cookie'] || [];
        const sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');

        const searchResult = await search(showName, isMovie);

        if (!searchResult || !Array.isArray(searchResult.records)) {
            return null;
        }

        let filteredRecords = [];
        if (!isMovie && season) {
            // Find the AniList ID for the requested TMDb season
            let wantedAniListId = null;
            for (const record of searchResult.records) {
                if (!record.anilist_id) continue;
                try {
                    const aniInfo = await getAniListInfo(record.anilist_id);
                    const allSeasons = collectSeasons(aniInfo);
                    const wanted = allSeasons[parseInt(season) - 1];
                    if (wanted) {
                        wantedAniListId = wanted.id;
                        break;
                    }
                } catch (e) {}
            }
            // Only include records matching the wanted AniList ID
            if (wantedAniListId) {
                filteredRecords = searchResult.records.filter(
                    r => r.anilist_id && parseInt(r.anilist_id) === wantedAniListId
                );
            }
        }

        // Fallback: match by seasonYear
        if (!filteredRecords.length && !isMovie && season) {
            for (const record of searchResult.records) {
                if (!record.anilist_id) continue;
                try {
                    const aniInfo = await getAniListInfo(record.anilist_id);
                    if (aniInfo.seasonYear && tmdbYear && aniInfo.seasonYear.toString() === tmdbYear.toString()) {
                        filteredRecords.push(record);
                    }
                } catch (e) {}
            }
        }

        // Fallback: match by year (movie or series)
        if (!filteredRecords.length) {
            for (const record of searchResult.records) {
                if (!record.anilist_id) continue;
                try {
                    const aniInfo = await getAniListInfo(record.anilist_id);
                    if (aniInfo.year && tmdbYear && aniInfo.year.toString() === tmdbYear.toString()) {
                        filteredRecords.push(record);
                    }
                } catch (e) {}
            }
        }

        // Fallback: use all if still nothing //    FIXME: more precise filtering
        const recordsToUse = filteredRecords.length ? filteredRecords : searchResult.records;

        // For each record, fetch the real stream URL from the player page
        const streams = [];
        for (const record of recordsToUse) {
            const animePageUrl = `${AU_DOMAIN}/anime/${record.id}-${record.slug}`;
            const streamUrl = await extractStreamUrl(animePageUrl, sessionCookie);
            if (streamUrl) {
                streams.push({
                    url: streamUrl,
                    provider: 'vixcloud',
                    title: record.title,
                    year: record.date,
                    dub: record.dub === 1 ? 'ITA' : 'SUB'
                });
            }
        }

        console.log('✅ Animeunity Stream URLs:', streams);
        return { streams };
    } catch (error) {
        console.error('❌ Animeunity Error:', error.message);
        return null;
    }
}

module.exports = { animeunity };

/*
(async () => {
    //const results = await animeunity("tt9335498:1:1");
    const results = await animeunity("tt11032374");
    console.log(results);
})();
*/