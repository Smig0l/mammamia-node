require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { getTMDbIdFromIMDb, getShowInfo } = require('./info');

const SW_DOMAIN = process.env.SW_DOMAIN

// Helper: fetch wponce token
async function wponceGet() {
  const res = await axios.get(`${SW_DOMAIN}/contatto`);
  const match = res.data.match(/var live_search_ajax\s*=\s*{[^}]*"admin_ajax_nonce":"(\w+)"[^}]*}/);
  //console.log(match)
  return match?.[1];
}

// Helper: extract video iframe src
function extractIframeSrc(html) {
  const $ = cheerio.load(html);
  const iframe = $('iframe');
  return iframe.attr('data-lazy-src') || iframe.attr('src');
}

// Search movies or series
async function search(showname, season, episode, date, isMovie) {
  if (isMovie) {
    const wponce = await wponceGet();
    const formData = new URLSearchParams({
      action: 'data_fetch',
      keyword: showname,
      _wpnonce: wponce,
    });

    const headers = {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'x-requested-with': 'XMLHttpRequest',
      };
  
      const res = await axios.post(`${SW_DOMAIN}/wp-admin/admin-ajax.php`, formData, { headers });
    //console.log(res.data);
    const $ = cheerio.load(res.data);
    const allDates = $('#search-cat-year').map((_, el) => $(el).text().trim()).get();
    const allHrefs = $('a').map((_, el) => $(el).attr('href')).get();

    for (let i = 0; i < allDates.length; i++) {
      if (allDates[i] === date) {
        const moviePage = await axios.get(allHrefs[i]);
        const src = extractIframeSrc(moviePage.data);
        return src;
      }
    }
  } else {
    // For series
    const catRes = await axios.get(`${SW_DOMAIN}/wp-json/wp/v2/categories?search=${showname}&_fields=id`);
    const categoryId = catRes.data[0]?.id;
    if (!categoryId) return null;

    const postsRes = await axios.get(`${SW_DOMAIN}/wp-json/wp/v2/posts?categories=${categoryId}&per_page=100`);
    const entries = postsRes.data;

    for (const entry of entries) {
      const slug = entry.slug;
      const validSlug = [`stagione-${season}-episodio-${episode}`, `stagione-${season}-episode-${episode}`];
      if (validSlug.some(s => slug.includes(s)) && !slug.includes(`${episode}0`)) {
        const content = entry.content.rendered;
        const match = content.match(/src="([^"]+)"/);
        return match?.[1];
      }
    }
  }
  return null;
}

async function isMovieFn(imdbId) {
  const isSeries = /s(\d+)e(\d+)/i.exec(imdbId); // e.g., tt1234567s01e05
  if (isSeries) {
    return [false, imdbId.replace(/s\d+e\d+/, ''), parseInt(isSeries[1]), parseInt(isSeries[2])];
  }
  return [true, imdbId, null, null];
}

async function getM3U8(url) {
  const { data } = await axios.get(url);
  //console.log(data);
  const match = data.match(/sources:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/);
  if (match) return match[1];
  throw new Error('No .m3u8 link found');
}

async function streamingwatch(imdb) {
  try {
    const [isMovie, imdbId, season, episode] = await isMovieFn(imdb);
    const { isMovie: confirmedMovie, tmdbId } = await getTMDbIdFromIMDb(imdbId);
    const { showName, year } = await getShowInfo(tmdbId, confirmedMovie);

    const formattedName = showName
      .replace(/ /g, '+')
      .replace(/[–—]/g, '+')
      .replace(/&/g, '');
    
    const player = await search(formattedName, season, episode, year, isMovie);
    let stream = await getM3U8(player);
    //console.log(stream)
    stream = stream + ".m3u8";
    console.log('✅ StreamingWatch Stream URL:', stream);
    return { stream };
  } catch (err) {
    console.error('❌ StreamingWatch Error:', err.message);
    return null;
  }
}

module.exports = { streamingwatch };

/* 
// Example test:
(async () => {
  await streamingwatch('tt27911000');
})();  
  */