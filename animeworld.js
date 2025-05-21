const axios = require('axios');
const cheerio = require('cheerio');
const { getKitsuInfo, getTMDbIdFromIMDb, getShowInfo } = require('./info.js');
require('dotenv').config();

const AW_DOMAIN = process.env.AW_DOMAIN || 'https://www.animeworld.ac';
const months = {
    "Gennaio": "January", "Febbraio": "February", "Marzo": "March",
    "Aprile": "April", "Maggio": "May", "Giugno": "June",
    "Luglio": "July", "Agosto": "August", "Settembre": "September",
    "Ottobre": "October", "Novembre": "November", "Dicembre": "December"
};
const showname_replace = {
    "Attack on Titan": "L'attacco dei Giganti",
    "Season": "",
    "  ": " ",
    "Shippuuden": "Shippuden",
    " ": "+",
    "Solo+Leveling+2": "Solo+Leveling+2:",
    "-": ""
};

// --- Get MP4 Link ---
async function get_mp4(anime_url, ismovie, episode) {
    let response = await axios.get(anime_url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    let $ = cheerio.load(response.data);

    if (!ismovie) {
        // Find episode page
        const episodeLink = $(`a[data-episode-num="${episode}"]`).attr('href');
        if (!episodeLink) return null;
        response = await axios.get(`${AW_DOMAIN}${episodeLink}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        $ = cheerio.load(response.data);
    }

    const a_tag = $('a#alternativeDownloadLink.m-1.btn.btn-sm.btn-primary');
    if (!a_tag.length) return null;
    let url = a_tag.attr('href');
    // Optionally, check if the link is valid (HEAD request)
    try {
        const head = await axios.head(url);
        if (head.status === 404) url = null;
    } catch {
        url = null;
    }
    return url;
}

// --- Search Anime ---
async function search(showname, date, ismovie, episode) {
    const search_year = date.slice(0, 4);
    const keyword = encodeURIComponent(showname.replace(/\+/g, ' '));
    const url = `${AW_DOMAIN}/api/search/v2?keyword=${keyword}`; //FIXME: search keyword does not correspond to tmdb showname

    // Required headers for the API
    const headers = {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Referer': `${AW_DOMAIN}/search?keyword=${keyword}`,
        'Origin': AW_DOMAIN,
        'X-Requested-With': 'XMLHttpRequest'
    };

    // POST request (even if no body)
    console.log(showname, url);
    const response = await axios.post(url, {}, { headers });
    console.log(response.data);
    const animes = response.data.animes || [];
    const final_urls = [];

    for (const anime of animes) {
        // Parse and normalize release date
        let release_date = anime.release;
        for (const [ita, eng] of Object.entries(months)) {
            release_date = release_date.replace(ita, eng);
        }
        const release_date_object = new Date(Date.parse(release_date));
        const date_object = new Date(Date.parse(date));
        const release_date_str = release_date_object.toISOString().slice(0, 10);
        const date_str = date_object.toISOString().slice(0, 10);

        // Accept ±1 day difference
        const plusOne = new Date(date_object); plusOne.setDate(plusOne.getDate() + 1);
        const minusOne = new Date(date_object); minusOne.setDate(minusOne.getDate() - 1);
        const plusOneStr = plusOne.toISOString().slice(0, 10);
        const minusOneStr = minusOne.toISOString().slice(0, 10);

        if ([date_str, plusOneStr, minusOneStr].includes(release_date_str)) {
            // Build anime info URL
            const anime_url = `${AW_DOMAIN}/${anime.link}`;
            const final_url = await get_mp4(anime_url, ismovie, episode);
            if (final_url) final_urls.push(final_url);
        }
    }
    return final_urls;
}

// --- Main AnimeWorld Function ---
async function animeworld(id) {
    try {
            const { isMovie, tmdbId } = await getTMDbIdFromIMDb(id);
            const { showName, year } = await getShowInfo(tmdbId, isMovie);
            const episode = null;
        
        const final_urls = await search(showName, year, isMovie, episode);
        return final_urls;
    } catch (e) {
        console.error("Animeworld failed", e);
        return null;
    }
}

module.exports = { animeworld };

/*
(async () => {
    const results = await animeworld("tt11032374");
    console.log(results);
})();
*/
