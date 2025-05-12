require('dotenv').config();
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { lordchannel } = require('./lordchannel');
const { streamingcommunity } =  require('./streamingcommunity');
const { streamingwatch } = require('./streamingwatch');

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
      const lcResult = await lordchannel(imdbId, season, episode);
      if (lcResult && lcResult.stream) {
        streams.push({
          title: `LordChannel: ${type} ${imdbId}`,
          url: lcResult.stream,
          quality: lcResult.quality || 'Unknown',
          isFree: true
        });
      }
    } catch (err) {
      console.error('LordChannel error:', err.message);
    }
  
    // Try StreamingCommunity
    try {
      const [scUrl, scQuality] = await streamingcommunity(imdbId);
      if (scUrl) {
        streams.push({
          title: `StreamingCommunity: ${type} ${imdbId}`,
          url: scUrl,
          quality: scQuality || 'Unknown',
          isFree: true
        });
      }
    } catch (err) {
      console.error('StreamingCommunity error:', err.message);
    }

    // Try StreamingWatch
    try {
        const swUrl = await streamingwatch(imdbId);
        if (swUrl) {
          streams.push({
            title: `StreamingWatch: ${type} ${imdbId}`,
            url: swUrl,
            quality: 'Unknown',
            isFree: true
          });
        }
      } catch (err) {
        console.error('StreamingWatch error:', err.message);
      }
  
    return { streams };
  });

// Start HTTP server (HTTP on localhost allowed by Stremio SDK)
serveHTTP(builder.getInterface(), { port: 7000 }).then(() => {
  console.log('✅ MammaMia-Node Stremio add-on available at http://127.0.0.1:7000/manifest.json');
});
