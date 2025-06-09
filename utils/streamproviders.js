const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Extract the final video link from SuperVideo.
 */
async function getSuperVideoLink(link) {
  // Example link: https://supervideo.cc/e/jpj130i7zvfb
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    };

    const response = await axios.get(link, { //FIXME: protected by Cloudflare, 403 error
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

async function getMixDropLink(link) {
  // Example link: https://mixdrop.ag/e/el1noo6nc83ngx
    try {

      // Normalize MixDrop domain to .my
      link = link.replace(/mixdrop\.(ag|club)/, 'mixdrop.my').split('/2')[0];;
  
      const headers = {
        'Referer': link,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      };
  
      const response = await axios.get(link, { headers, maxRedirects: 10, timeout: 30000 });
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
      return { url: finalUrl, headers };
    } catch (error) {
      console.error('Error in getMixDropLink:', error.message);
      return null;
    }
}

async function getDroploadLink(link) {
  try {
    console.log('Fetching Dropload link:', link);
    const headers = {
      'Referer': link,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    };

    const res = await axios.get(link, { headers });
    const $ = cheerio.load(res.data); //FIXME: must use cheerio?

    // Find the packed eval script
    const packedScript = $('script').toArray()
      .map(el => $(el).html())
      .find(s => s && s.includes('eval(function(p,a,c,k,e,d)'));

    if (!packedScript) throw new Error('Packed script not found');

    //console.log('Packed Script:', packedScript);

    const unpacker = require("unpacker"); //FIXME: really external libs?
    const result = unpacker.unpack(packedScript);
    //console.log(result);

    const match = result.match(/sources\s*:\s*\[\s*\{\s*[^}]*?\bfile\s*:\s*"([^"]+)"/);
    const fileUrl = match ? match[1] : 'File URL not found';

    return fileUrl;

  } catch (error) {
    console.error('getDroploadLink error:', error.message);
    return null;
  }
}

async function getDoodStreamLink(link) {
  // Example link: https://dood.to/e/i85xl8us8nto
  try {
    // HEAD request to resolve any redirects (optional, can be skipped if not needed)
    link = link.replace(/^https:\/\/dood\.to/, 'https://do7go.com');
    
    // GET the protect link page
    const headers = {
      'Range': 'bytes=0-',
      'Referer': 'https://do7go.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    };

    const response = await axios.get(link, {
      headers, maxRedirects: 10, timeout: 30000
    });

    if (response.status !== 200) {
      console.error('Doodstream: Could not get the response.');
      return null;
    }

    // Regex to extract the pass_md5 and token/expiry
    const pattern = /(\/pass_md5\/.*?)'.*(\?token=.*?expiry=)/s;
    const match = response.data.match(pattern);
    //console.log(response.data); //FIXME: in prod i get no match, but in dev it works fine

    if (match) {
      const url = `https://do7go.com${match[1]}`;
      // GET the pass_md5 URL to get the real URL part
      const rebobo = await axios.get(url, { headers, maxRedirects: 10, timeout: 30000 });
      if (rebobo.data && rebobo.data.length > 2) {
        const realTime = Math.floor(Date.now() / 1000).toString();
        const realUrl = `${rebobo.data}123456789${match[2]}${realTime}`;
        return realUrl; // FIXME: connection error
      }
    } else {
      console.error('Doodstream: No match found in the text.');
      return null;
    }
  } catch (error) {
    console.error('Error in getDoodStreamLink:', error.message);
    return null;
  }
}

async function getMaxStreamLink(link) {
    try {
        const response = await axios.get(link, { headers: { Referer: `${STREAM_SITE}/` } });
        const $ = cheerio.load(response.data);

        const maxStreamUrl = $('a').attr('href');
        return maxStreamUrl;
    } catch (error) {
        console.error('Error in getMaxStreamUrl:', error.message);
    }
    return null;
}

async function getHdPlayerLink(link) {
    try {
        const response = await axios.get(link, { headers: { Referer: link, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', } });
        
        const match = response.data.match(/sources:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/);
        if (match) return match[1];
    } catch (error) {
        console.error('Error in getHdPlayerLink:', error.message);
    }
    return null;
}


async function extractDirectLink(link) {
  //console.log('Extracting direct link for:', link);
  let url = null;
  let headers = null;
  if (link.includes('supervideo')) {
    url = await getSuperVideoLink(link);
    return url ? { url, provider: 'supervideo' } : null;
  }else if (link.includes('mixdrop')) {
    ({ url, headers } = await getMixDropLink(link));
    return { url, provider: 'mixdrop', headers };
  }else if (link.includes('dropload')) {
    url = await getDroploadLink(link);
    return url ? { url, provider: 'dropload' } : null;
  }else if (link.includes('dood')) {
    url = await getDoodStreamLink(link);
    return url ? { url, provider: 'dood' } : null;
  } else if (link.includes('maxstream')) {
    url = await getMaxStreamLink(link);
    return url ? { url, provider: 'maxstream' } : null;
  } else if (link.includes('hdplayer')) {
    url = await getHdPlayerLink(link);
    return url ? { url, provider: 'hdplayer' } : null;
  } else {
    console.error('Unsupported provider for link: ', link);
    return url ? { url, provider: 'unknown' } : null;
  }

}

async function getStayOnlineUrl(link) {
    try {
        const headers = {
            'origin': 'https://stayonline.pro',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0',
            'x-requested-with': 'XMLHttpRequest',
        };
        const response = await axios.post('https://stayonline.pro/ajax/linkEmbedView.php', {
        id: link.split('/').slice(-2, -1)[0],
        ref: ''
        }, { headers: headers });

        return response.data.data.value;
    } catch (error) {
        console.error('Error in getStayOnlineUrl:', error.message);
    }
    return null;
}

async function bypassProtectedLink(protectedLink) {
  if (protectedLink.includes('stayonline')){
    url = await getStayOnlineUrl(protectedLink);
    return url;
  }else if (protectedLink.includes('uprot')) {
    console.error(`⚠️ Uprot link: ${protectedLink} not yet supported (captcha protected)`);
    return null;
  } else {
    console.error(`protected link: ${protectedLink} not yet supported`);
    return null;
  }
}

module.exports = { extractDirectLink, bypassProtectedLink };