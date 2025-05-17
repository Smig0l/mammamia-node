const axios = require('axios');
const cheerio = require('cheerio');
const { getTMDbIdFromIMDb, getShowInfo } = require('./info');
require('dotenv').config();

const TF_DOMAIN = process.env.TF_DOMAIN || 'https://tantifilm.living';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

async function extractDataLinks(html) {
    const $ = cheerio.load(html);
    //console.log(html); //TODO: does not contains data-link...hidden
    const links = [];
    $('li[data-link]').each((i, el) => {
        const dataLink = $(el).attr('data-link');
        if (dataLink && dataLink.trim() !== '') {
            links.push(dataLink.startsWith('//') ? 'https:' + dataLink : dataLink);
        }
    });
    console.log(links);
    return links;
}

// Example usage inside your code after fetching the movie page:
async function search(showname, isMovie, date) {
    const shownameQuery = showname.replace(/ /g, '+');
    const url = `${TF_DOMAIN}/?story=${shownameQuery}&do=search&subaction=search`;
    const { data } = await axios.get(url, { headers });
    const $ = cheerio.load(data);

    // Extract all result links
    const links = [];
    $('.title-film.title-film-2 a').each((i, el) => {
        const href = $(el).attr('href');
        if (href) links.push(href);
    });

    for (const link of links) {
        const res = await axios.get(link, { headers });
        // Extract all data-link values from <li> elements
        const dataLinks = await extractDataLinks(res.data);
        console.log(dataLinks); // Array of all streaming links
        // ...your logic to select the right one, or return them all
        return { url: link, streams: dataLinks };
    }
    throw new Error("No matching result found");
}
async function fastSearch(showname, isMovie) {
    const shownameQuery = showname.replace(/ /g, '%20');
    const url = `${TF_DOMAIN}/search/${shownameQuery}`;
    const res = await axios.get(url, { headers });
    console.log(res.data); 
    const $ = cheerio.load(res.data);
    if (isMovie) {
        const firstLink = $('#movies .col .list-media').attr('href');
        const tid = firstLink.split('-')[1];
        return { tid, url: firstLink };
    } else {
        const firstLink = $('#series .col .list-media').attr('href');
        const urlFull = `${firstLink}-1-season-1-episode`;
        const res2 = await axios.get(urlFull, { headers });
        const $$ = cheerio.load(res2.data);
        const embedId = $$('a.dropdown-toggle.btn-service.selected').attr('data-embed');
        return { url: urlFull, embedId };
    }
}

async function getProtectLink(id, url) {
    // 1. Try the main iframe
    const res = await axios.get(`https://p.hdplayer.casa/myadmin/play.php?id=${id}`, { headers: { 'User-Agent': headers['User-Agent'] } });
    //console.log(res.data);
    const $ = cheerio.load(res.data);
    const protectLink = $('iframe').attr('src');
    if (protectLink && protectLink.includes('protect')) {
        return protectLink;
    } else {
        // 2. Fallback: get embed_id from the main page
        const res2 = await axios.get(url, { headers: { 'User-Agent': headers['User-Agent'] } });
        const $$ = cheerio.load(res2.data);
        const aTag = $$('a.dropdown-toggle.btn-service.selected');
        const embedId = aTag.attr('data-embed');
        const headersPost = {
            'User-Agent': headers['User-Agent'],
            'Referer': url,
        };
        const data = new URLSearchParams({ id: embedId });
        const ajaxUrl = `${TF_DOMAIN}/ajax/embed`;
        const res3 = await axios.post(ajaxUrl, data, { headers: headersPost });
        const hdplayer = res3.data.slice(43, -27);
        const res4 = await axios.get(hdplayer, { headers: { 'User-Agent': headers['User-Agent'] } });
        const $$$ = cheerio.load(res4.data);
        const linksDict = {};
        const liTags = $$$('ul.nav.navbar-nav li.dropdown').toArray();
        for (const liTag of liTags) {
            const a = $$$('a', liTag);
            if (a.length) {
                const title = a.text().trim();
                if (title === "1" || title.includes("Tantifilm")) continue;
                const href = a.attr('href');
                const res5 = await axios.get(href, { headers: { 'User-Agent': headers['User-Agent'] } });
                const $$$$ = cheerio.load(res5.data);
                const protectLink2 = $$$$('iframe').attr('src');
                if (protectLink2 && protectLink2.includes('protect')) {
                    // trueUrl should be implemented and imported
                    const realUrl = await trueUrl(protectLink2);
                    linksDict[title] = realUrl;
                }
            }
        }
        return linksDict;
    }
}

async function getNuovoIndirizzoAndProtectLink(url, embedId, season, episode) {
    const data = new URLSearchParams({ id: embedId });
    const ajaxUrl = `${TF_DOMAIN}/ajax/embed`;
    const res = await axios.post(ajaxUrl, data, { headers });
    const nuovoIndirizzo = res.data.slice(43, -27);
    const res2 = await axios.get(nuovoIndirizzo, { headers });
    const $ = cheerio.load(res2.data);
    const liTags = $('ul.nav.navbar-nav > li.dropdown');
    let link;
    if (liTags.length !== 1) {
        link = $(liTags[season - 1]).find('a').attr('href');
        const res3 = await axios.get(link, { headers });
        const $$ = cheerio.load(res3.data);
        link = $$(`select[name="ep_select"] > option:nth-of-type(${episode})`).attr('value');
    } else {
        link = $('select.dynamic_select > option').eq(episode).attr('value');
    }
    const res4 = await axios.get(link, { headers });
    const $$$ = cheerio.load(res4.data);
    const protectLink = $$$('iframe').attr('src');
    return protectLink;
}

async function trueUrl(protectLink) {
    // This is a simplified version; proxy logic omitted
    const res = await axios.get(protectLink, { headers });
    if (res.status === 200) {
        const realTime = Math.floor(Date.now() / 1000).toString();
        const match = res.data.match(/(\/pass_md5\/.*?)'.*(\?token=.*?expiry=)/s);
        if (match) {
            const url = `https://d000d.com${match[1]}`;
            const rebobo = await axios.get(url, { headers });
            if (rebobo.data.length > 2) {
                const realUrl = `${rebobo.data}123456789${match[2]}${realTime}`;
                return realUrl;
            }
        }
    }
    return null;
}

/**
 * Main function: tantifilm
 * @param {string} imdb - IMDb or TMDb id
 * @param {string} TF_FAST_SEARCH - "1" for fast search, "0" for normal
 * @param {object} opts - { season, episode } for series
 * @returns {Promise<string|null>}
 */
async function tantifilm(imdb, TF_FAST_SEARCH = "0", opts = {}) {
    try {
        // Determine if movie or series
        let isMovie, imdbId, season, episode;
        if (imdb.startsWith('tt')) {
            const { isMovie: isMov, tmdbId } = await getTMDbIdFromIMDb(imdb);
            isMovie = isMov;
            imdbId = imdb;
        } else if (imdb.startsWith('tmdb:')) {
            const tmdbId = imdb.replace('tmdb:', '');
            const { isMovie: isMov, tmdbId: realTmdbId } = await getTMDbIdFromIMDb(tmdbId);
            isMovie = isMov;
            imdbId = (await getTMDbIdFromIMDb(tmdbId)).imdbId;
        } else {
            throw new Error("Unknown id format");
        }
        if (!isMovie) {
            season = opts.season || 1;
            episode = opts.episode || 1;
            let showname, date, url, embedId;
            if (TF_FAST_SEARCH === "0") {
                const info = await getShowInfo(imdbId, isMovie);
                showname = info.showName;
                date = info.year;
                ({ url, embedId } = await search(showname, isMovie, date));
            } else {
                const info = await getShowInfo(imdbId, isMovie);
                showname = info.showName;
                ({ url, embedId } = await fastSearch(showname, isMovie));
            }
            const protectLink = await getNuovoIndirizzoAndProtectLink(url, embedId, season, episode);
            const realUrl = await trueUrl(protectLink);
            return realUrl;
        } else {
            let showname, date, tid, url;
            if (TF_FAST_SEARCH === "0") {
                const info = await getShowInfo(imdbId, isMovie);
                console.log(info);
                showname = info.showName;
                date = info.year;
                ({ tid, url } = await search(showname, isMovie, date));
            } else {
                const info = await getShowInfo(imdbId, isMovie);
                showname = info.showName;
                ({ tid, url } = await fastSearch(showname, isMovie));
            }
            const protectLink = await getProtectLink(tid, url);
            if (typeof protectLink !== 'string') {
                // fallback logic omitted for brevity
                return null;
            } else {
                const realUrl = await trueUrl(protectLink);
                return realUrl;
            }
        }
    } catch (e) {
        console.error("Tantifilm Error:", e.message);
        return null;
    }
}

module.exports = { tantifilm };

/*
(async () => {
    const result = await tantifilm('tt18412256');
    console.log(result);
})();
*/