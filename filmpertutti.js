const axios = require('axios');
const cheerio = require('cheerio');
const { getTMDbIdFromIMDb, getShowInfo } = require('./info');
require('dotenv').config();

const FT_DOMAIN = process.env.FT_DOMAIN || 'https://filmpertutti.be';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.10; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
    'Accept-Language': 'en-US,en;q=0.5'
};

async function getStreamtape(link) {
    const res = await axios.get(link, { headers });
    const matches = [...res.data.matchAll(/id=.*?(?=')/g)].map(m => m[0]);
    let finalUrl = null;
    for (let i = 0; i < matches.length - 1; i++) {
        if (matches[i] === matches[i + 1]) {
            finalUrl = `https://streamtape.com/get_video?${matches[i + 1]}`;
            break;
        }
    }
    return finalUrl;
}

async function search(query, imdbId, season, isMovie) {
    const { data } = await axios.get(query, { headers });
    for (const json of data) {
        const link = json.link;
        const tid = json.id;
        const seriesRes = await axios.get(link, { headers, maxRedirects: 5, timeout: 30000 });
        const $ = cheerio.load(seriesRes.data);
        const imdbMatch = seriesRes.data.match(/'imdb_id':\s*'([^']+)'/);
        if (imdbMatch && imdbMatch[1] === imdbId) {
            if (!isMovie) {
                const seasons = $('span.season-name').toArray();
                for (let i = 0; i < seasons.length; i++) {
                    const seasonText = $(seasons[i]).text().trim();
                    if (seasonText.includes(season) && !seasonText.includes('SUB')) {
                        return { url: link, tid, actualSeason: i };
                    }
                }
            } else {
                return { url: link, tid, actualSeason: null };
            }
        }
    }
    throw new Error("No matching IMDB_ID found");
}

function getEpisodeLink(actualSeason, episode, tid, url) {
    return `${url}?show_video=true&post_id=${tid}&season_id=${actualSeason}&episode_id=${episode - 1}`;
}

function getFilm(url) {
    return `${url}?show_video=true`;
}

async function getRealLink(tlink) {
    try {
        const page = await axios.get(tlink, { headers, maxRedirects: 5 });
        const $ = cheerio.load(page.data);
        const iframeSrc = $('iframe').attr('src');
        if (!iframeSrc) return null;
        const iframePage = await axios.get(iframeSrc, { headers, maxRedirects: 5, timeout: 30000 });
        const $$ = cheerio.load(iframePage.data);
        let realLink = null;
        // Try MIXDROP first
        $$('.megaButton[rel="nofollow"]').each((_, el) => {
            const btn = $$(el);
            if (btn.text().trim() === 'MIXDROP') {
                realLink = btn.attr('meta-link');
            }
            if (btn.text().trim() === 'STREAMTAPE') {
                realLink = btn.attr('meta-link');
            }
        });
        return realLink;
    } catch (e) {
        console.error("getRealLink error:", e.message);
        return null;
    }
}

async function getTrueLink(realLink) {
    const res = await axios.get(realLink, { headers, maxRedirects: 5, timeout: 30000 });
    const match = res.data.match(/\}\('(.+)',.+,'(.+)'\.split/);
    if (!match) return null;
    const [s1, s2] = [match[1], match[2]];
    const schema = s1.split(";")[2].slice(5, -1);
    const terms = s2.split("|");
    const charset = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const d = {};
    for (let i = 0; i < terms.length; i++) d[charset[i]] = terms[i] || charset[i];
    let s = 'https:';
    for (const c of schema) s += d[c] || c;
    return s;
}

/**
 * Main function: filmpertutti
 * @param {string} imdb - IMDb or TMDb id
 * @param {string} MFP - "1" to return host, else returns streaming link
 * @param {object} opts - { season, episode } for series
 * @returns {Promise<{stream: string, host: string|null}>}
 */
async function filmpertutti(imdb, MFP = "1", opts = {}) {
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
        }
        // Get show name
        const { showName } = await getShowInfo(imdbId, isMovie);
        const shownameQ = encodeURIComponent(showName.replace(/[\s–—]/g, '+'));
        const query = `${FT_DOMAIN}/wp-json/wp/v2/posts?search=${shownameQ}&page=1&_fields=link,id`;
        let url, tid, actualSeason;
        try {
            const res = await search(query, imdbId, season, isMovie);
            url = res.url;
            tid = res.tid;
            actualSeason = res.actualSeason;
        } catch (e) {
            console.error("No results found for Filmpertutti");
            return { stream: null, host: null };
        }
        let realLink, streamingLink, host = null;
        if (!isMovie) {
            const episodeLink = getEpisodeLink(actualSeason, episode, tid, url);
            realLink = await getRealLink(episodeLink);
            if (MFP === "1") {
                if (realLink && realLink.includes('mixdrop')) host = "Mixdrop";
                else if (realLink && realLink.includes('streamtape')) host = "Streamtape";
                return { stream: realLink, host };
            }
            if (realLink && realLink.includes('mixdrop')) {
                streamingLink = await getTrueLink(realLink);
            } else if (realLink && realLink.includes('streamtape')) {
                streamingLink = await getStreamtape(realLink);
            }
            return { stream: streamingLink, host: null };
        } else {
            const filmLink = getFilm(url);
            realLink = await getRealLink(filmLink);
            if (MFP === "1") {
                if (realLink && realLink.includes('mixdrop')) host = "Mixdrop";
                else if (realLink && realLink.includes('streamtape')) host = "Streamtape";
                return { stream: realLink, host };
            }
            if (realLink && realLink.includes('mixdrop')) {
                streamingLink = await getTrueLink(realLink);
            } else if (realLink && realLink.includes('streamtape')) {
                streamingLink = await getStreamtape(realLink);
            }
            return { stream: streamingLink, host: null };
        }
    } catch (e) {
        console.error("Filmpertutti failed:", e.message);
        return { stream: null, host: null };
    }
}

module.exports = { filmpertutti };

/*
(async () => {
    const result = await filmpertutti('tt18412256');
    console.log(result);
})();
*/