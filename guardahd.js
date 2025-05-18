const axios = require('axios');
const cheerio = require('cheerio');
const { getTMDbIdFromIMDb, getShowInfo } = require('./info');
require('dotenv').config();

const GHD_DOMAIN = process.env.GHD_DOMAIN || 'https://guardahd.stream' || 'https://mostraguarda.stream';

/**
 * Extract the final video link from SuperVideo.
 */
async function getSuperVideoLink(link) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    };

    const response = await axios.get(link, {
      headers,
      maxRedirects: 10,
      timeout: 30000,
    });

    const regex = /\}\('(.+)',.+,'(.+)'\.split/;
    const match = regex.exec(response.data);

    if (!match) {
      throw new Error('Failed to extract SuperVideo terms.');
    }

    const terms = match[2].split('|');
    const fileIndex = terms.indexOf('file');
    let hfs = null;

    for (let i = fileIndex; i < terms.length; i++) {
      if (terms[i].includes('hfs')) {
        hfs = terms[i];
        break;
      }
    }

    const urlsetIndex = terms.indexOf('urlset');
    const hlsIndex = terms.indexOf('hls');
    const result = terms.slice(urlsetIndex + 1, hlsIndex).reverse();

    let baseUrl = `https://${hfs}.serversicuro.cc/hls/`;
    if (result.length === 1) {
      return `${baseUrl},${result[0]}.urlset/master.m3u8`;
    }

    for (let i = 0; i < result.length; i++) {
      baseUrl += result[i] + (i === result.length - 1 ? '.urlset/master.m3u8' : ',');
    }

    return baseUrl;
  } catch (error) {
    console.error('Error in getSuperVideoLink:', error.message);
    return null;
  }
}

async function getTrueLinkMixdrop(realLink) {
    try {
      // HEAD request to resolve any redirects (optional, can be skipped if not needed)
        if (realLink.includes('ag')) {
            realLink = realLink.replace('ag', 'my').split('/2')[0];
        }        
  
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      };
  
      const response = await axios.get(realLink, { headers, maxRedirects: 10, timeout: 30000 });
      const regex = /\}\('(.+)',.+,'(.+)'\.split/;
      const match = regex.exec(response.data);
  
      if (!match) {
        throw new Error('Failed to extract Mixdrop schema and terms.');
      }
  
      const [_, schemaRaw, termsRaw] = match;
      const schema = schemaRaw.split(';')[2].slice(5, -1);
      const terms = termsRaw.split('|');
      const charset = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const mapping = {};
  
      for (let i = 0; i < terms.length; i++) {
        mapping[charset[i]] = terms[i] || charset[i];
      }
  
      let finalUrl = 'https:';
      for (const char of schema) {
        finalUrl += mapping[char] || char;
      }
  
      //console.log(finalUrl);
      return finalUrl;
    } catch (error) {
      console.error('Error in getTrueLinkMixdrop:', error.message);
      return null;
    }
}

async function getTrueLinkDoodstream(protectLink) {
  try {
    // HEAD request to resolve any redirects (optional, can be skipped if not needed)
    let doodstreamUrl = protectLink.replace(/^https:\/\/dood\.to/, 'https://do7go.com');
    
    // GET the protect link page
    const headers = {
      'Range': 'bytes=0-',
      'Referer': 'https://do7go.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    };

    const response = await axios.get(doodstreamUrl, {
      headers, maxRedirects: 10, timeout: 30000
    });

    if (response.status !== 200) {
      console.error('Doodstream: Could not get the response.');
      return null;
    }

    // Regex to extract the pass_md5 and token/expiry
    const pattern = /(\/pass_md5\/.*?)'.*(\?token=.*?expiry=)/s;
    const match = response.data.match(pattern);

    if (match) {
      const url = `https://do7go.com${match[1]}`;
      // GET the pass_md5 URL to get the real URL part
      const rebobo = await axios.get(url, { headers, maxRedirects: 10, timeout: 30000 });
      if (rebobo.data && rebobo.data.length > 2) {
        const realTime = Math.floor(Date.now() / 1000).toString();
        const realUrl = `${rebobo.data}123456789${match[2]}${realTime}`;
        return realUrl;
      }
    } else {
      console.error('Doodstream: No match found in the text.');
      return null;
    }
  } catch (error) {
    console.error('Error in getTrueLinkDoodstream:', error.message);
    return null;
  }
}

/**
 * Search for the video link on GuardaHD.
 */
async function search(cleanId) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    };

    const response = await axios.get(`${GHD_DOMAIN}/movie/${cleanId}`, {
      headers,
      maxRedirects: 10,
      timeout: 30000,
      
    });

    if (response.status !== 200) {
      console.error(`GuardaHD Failed to fetch search results: ${response.status}`);
      return null;
    }

    const $ = cheerio.load(response.data);

    // Get all data-link attributes from <li> elements
    const playerLinks = [];
    $('li[data-link]').each((i, el) => {
      const link = $(el).attr('data-link');
      if (link && link.trim() !== '') {
        playerLinks.push(link.startsWith('//') ? 'https:' + link : link);
      }
    });

    //console.log('GuardaHD player links:', playerLinks);
    let streams = [];

    for (const link of playerLinks) {
      let provider = "supervideo";
      if (link.includes(provider)) {
        let stream = await getSuperVideoLink(link);
        if (stream) {
          streams.push({ url: stream, provider });
        }
        continue;
      }
      provider = "mixdrop";
      if (link.includes(provider)) {
        let stream = await getTrueLinkMixdrop(link);
        if (stream) {
          streams.push({ url: stream, provider });
        }
        continue;
      }
      provider = "dood";
      if (link.includes(provider)) {
        let stream = await getTrueLinkDoodstream(link);
        if (stream) {
          streams.push({ url: stream, provider });
        }
        continue;
      }
      //TODO: dropload (https://dropload.io/embed-ph749ax2fclo.html)
    }
    return streams.length > 0 ? streams : null;
  } catch (error) {
    console.error('Error in search:', error.message);
    return null;
  }
}

/**
 * Main GuardaHD scraper function.
 */
async function guardahd(id) {
  try {
    const { isMovie, tmdbId } = await getTMDbIdFromIMDb(id);

    if (!isMovie) { //this provider is only for movies
      return null;
    }

    const streams = await search(id);
    if (!streams) {
      return null;
    }
    
    console.log('✅ GuardaHD Stream URLs:', streams);
    return { streams };
  } catch (error) {
    console.error('❌ GuardaHD Error:', err.message);
    return null;
  }
}

module.exports = { guardahd };

/*
(async () => {
  const testId = 'tt18412256';
  const result = await guardahd(testId);
  console.log('GuardaHD Result:', result);
})();
*/