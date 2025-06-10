require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { extractDirectLink } = require('./utils/streamproviders');

const STREAM_SITE = process.env.SW_DOMAIN;

const headers = {
    'Referer': STREAM_SITE,
    'Origin': STREAM_SITE,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
};

async function parsePlayerPage(link, type, season, episode) {
    try {
      let playerLinks = [];
      //console.log(link)
      const response = await axios.get(link, { headers });
      //console.log(response.data);
      const $ = cheerio.load(response.data);
      const playerLink = $('.video-container iframe').attr('data-lazy-src');
      //console.log(playerLink)
      if (playerLink) {
          playerLinks.push(playerLink);
      }
      return playerLinks;

  } catch (error) {
        console.error('❌ StreamingWatch Error parsing player page:', error.message);
        return null;
    }
}

async function search(showName, type, season, episode ) {
  try{
    if (type === "movie" ) {
      const res = await axios.get(`${STREAM_SITE}/contatto`);
      const match = res.data.match(/var live_search_ajax\s*=\s*{[^}]*"admin_ajax_nonce":"(\w+)"[^}]*}/);
      const wponce = match?.[1];
      //console.log(wponce);

      const headers = {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'x-requested-with': 'XMLHttpRequest',
        };
    
      const res2 = await axios.post(`${STREAM_SITE}/wp-admin/admin-ajax.php`, { action: 'data_fetch', keyword: showName, _wpnonce: wponce, }, { headers });
      //console.log(res2.data);
      const $ = cheerio.load(res2.data);
      const firstLink = $('.searchelement a').first().attr('href');
      //console.log(firstLink)

      return firstLink;

    } else {
      // For series
      const catRes = await axios.get(`${STREAM_SITE}/wp-json/wp/v2/categories?search=${showName}&_fields=id`);
      const categoryId = catRes.data[0]?.id;
      if (!categoryId) return null;

      const postsRes = await axios.get(`${STREAM_SITE}/wp-json/wp/v2/posts?categories=${categoryId}&per_page=100`);
      const entries = postsRes.data;

      for (const entry of entries) {
        const slug = entry.slug;
        const validSlug = [`stagione-${season}-episodio-${episode}`, `stagione-${season}-episode-${episode}`];
        if (validSlug.some(s => slug.includes(s)) && !slug.includes(`${episode}0`)) {
          return `${STREAM_SITE}/`+slug;
          //else fetch direct player link:
          const content = entry.content.rendered;
          const match = content.match(/src="([^"]+)"/);
          return match?.[1];
        }
      }
    }
  } catch (error) {
    console.error(`❌ StreamingWatch Search error:`, error.message);
  }   
}

async function scrapeStreamingWatch(imdbId, showName, type, season = null, episode = null) {

    const results = await search(showName, type, season, episode);
    if (!results) {
        console.error(`❌ StreamingWatch: No results found for "${showName}"`);
        return null;
    }   

    let streams = [];

    playerLinks = await parsePlayerPage(results, type, season, episode);
    if (!playerLinks?.length) {
      console.error('❌ StreamingWatch: No links found in player page');
      return null;
    } else {
      //console.log('✅ StreamingWatch Player Links:', playerLinks);
      for (const link of playerLinks) {
          const streamObj = await extractDirectLink(link);
          if (streamObj) streams.push(streamObj);
        
      }
    }

    console.log('✅ StreamingWatch Stream URLs:', streams);
    return { streams };
    
}

module.exports = { scrapeStreamingWatch };

/*
(async () => {
    //const movie = await scrapeStreamingWatch('tt28309594', 'Nonnas', 'movie');
    //const series = await scrapeStreamingWatch('tt31510819', 'The last of us', 'series', 1, 1);
})();
*/