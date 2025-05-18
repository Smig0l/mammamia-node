require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { lordchannel } = require('./lordchannel');
const { streamingcommunity } =  require('./streamingcommunity');
const { streamingwatch } = require('./streamingwatch');
const { cb01 } = require('./cb01');
const { guardahd } = require('./guardahd');
const { filmpertutti } = require('./filmpertutti');
const { tantifilm } = require('./tantifilm');


const builder = new addonBuilder({
  id: 'org.node.mammamia',
  version: '1.0.0',
  name: 'Italian Streams',
  description: 'Fetches m3u8 HLS streams from Italian stream sites via TMDb lookup',
  catalogs: [],
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt']
});

/**
 * Stream handler: attempts both providers and aggregates available streams
 */
builder.defineStreamHandler(async ({ type, id, season, episode }) => {
    const streams = [];
  
    const imdbId = id;
  
    // Try LordChannel first
    try {
      const streamUrls = await lordchannel(imdbId, season, episode);
      if (streamUrls && streamUrls.stream) {
        streams.push({
          title: `LordChannel: ${type} ${imdbId}`,
          url: streamUrls.stream,
          quality: streamUrls.quality || 'Unknown',
          isFree: true
        });
      }
    } catch (err) {
      console.error('LordChannel error:', err.message);
    }
  
    // Try StreamingCommunity
    try {
      const streamUrls = await streamingcommunity(imdbId);
      if (streamUrls && streamUrls.stream) {
        streams.push({
          title: `StreamingCommunity: ${type} ${imdbId}`,
          url: streamUrls.stream,
          quality: streamUrls.quality || 'Unknown',
          isFree: true
        });
      }
    } catch (err) {
      console.error('StreamingCommunity error:', err.message);
    }

    // Try StreamingWatch
    try {
        const streamUrls = await streamingwatch(imdbId);
        if (streamUrls && streamUrls.stream) {
          streams.push({
            title: `StreamingWatch: ${type} ${imdbId}`,
            url: streamUrls.stream,
            quality: 'Unknown',
            isFree: true
          });
        }
      } catch (err) {
        console.error('StreamingWatch error:', err.message);
      }

     // Try CB01
     try {
      const streamUrls = await cb01(imdbId);
      if (streamUrls && streamUrls.stream) {
        streams.push({
          title: `CB01: ${type} ${imdbId}`,
          url: streamUrls.stream,
          quality: 'Unknown',
          isFree: true
        });
      }
    } catch (err) {
      console.error('CB01 error:', err.message);
    }
    // Try GuardaHD 
    try {
      const streamUrls = await guardahd(imdbId);
      if (streamUrls && Array.isArray(streamUrls.streams)) {
        streamUrls.streams.forEach(({ url, provider }) => {
          streams.push({
            title: `GuardaHD: ${type} [${provider}]`,
            url,
            quality: 'Unknown',
            isFree: true
          });
        });
      }
    } catch (err) {
      console.error('GuardaHD error:', err.message);
    }
  
    return { streams };
  });

// Start HTTP server (HTTP on localhost allowed by Stremio SDK)
serveHTTP(builder.getInterface(), { port: 7000 }).then(() => {
  console.log('✅ MammaMia-Node Stremio add-on available at http://127.0.0.1:7000/manifest.json');
});
