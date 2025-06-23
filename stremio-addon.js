require('dotenv').config();
const axios = require('axios');
const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { getShowNameFromCinemeta, getShowNameFromKitsu } = require('./utils/mediainfo');

const { scrapeStreamingCommunity } =  require('./streamingcommunity');
const { scrapeStreamingWatch } = require('./streamingwatch');
const { scrapeCb01 } = require('./cb01');
const { scrapeGuardaHD } = require('./guardahd');
const { scrapeTantiFilm } = require('./tantifilm'); //FIXME: protected by Cloudflare
const { scrapeAnimeWorld } = require('./animeworld');
const { scrapeAnimeUnity } = require('./animeunity');


const builder = new addonBuilder({
  id: 'org.node.mammamia',
  version: '1.0.0',
  name: 'MammaMia Node',
  description: 'Fetches streams from Italian stream sites',
  catalogs: [],
  resources: ['stream'],
  types: ['movie', 'series'],
  idPrefixes: ['tt', 'kitsu']
});

builder.defineStreamHandler(async ({ type, id, season, episode }) => {
    let imdbId = id;
    let kitsuId = null;

    if (id.startsWith('tt')) { // Handle IMDb IDs (e.g., id: "tt1234567")
      if (type === 'series' && (!season || !episode) && id.includes(':')) {
        const parts = id.split(':');
        imdbId = parts[0];
        season = parts[1] ? parseInt(parts[1], 10) : undefined;
        episode = parts[2] ? parseInt(parts[2], 10) : undefined;
      }
      showName = await getShowNameFromCinemeta(type, imdbId);
      console.log(`Cinemeta found show: ${showName} (${type}) with ID: ${imdbId}`);
    } else if (id.startsWith('kitsu')) {  // Handle Kitsu IDs (e.g., id: "kitsu:10740:1") (requires Anime Kitsu Addon)
      const parts = id.split(':');
      kitsuId = parts[1];
      season = 1; // Kitsu addon do not return season info, so we default to 1
      episode = parts[2] ? parseInt(parts[2], 10) : undefined;
      
      showName = await getShowNameFromKitsu(kitsuId);
      console.log(`Kitsu found show: ${showName.en} (${type}) with ID: ${kitsuId}`);
    } else {
      console.error(`Invalid ID format: ${id}. Expected 'tt' or 'kitsu' prefix.`);
      return { streams: [] };
    }

    const streams = [];
  
    // Try StreamingCommunity
    try {
      const streamUrls = await scrapeStreamingCommunity(imdbId, showName, type, season, episode);
       if (streamUrls && Array.isArray(streamUrls.streams)) {
        streamUrls.streams.forEach(({ url, provider, headers }) => {
          const stream = {
            title: `StreamingCommunity: ${type} [${provider}]`,
            url,
            quality: 'Unknown',
          };
          if (headers) { // If headers are provided, set them as behavior hints
            stream.behaviorHints = {
              notWebReady: true, // stream is not web-ready, so not playable in browser
              proxyHeaders: {
                request: headers,
              },
            };
            stream.title += " (not playable in browser)"
          }
          streams.push(stream);
        });
      }
    } catch (err) {
      console.error('StreamingCommunity error:', err.message);
    }
    // Try StreamingWatch
    try {
      const streamUrls = await scrapeStreamingWatch(imdbId, showName, type, season, episode);
      if (streamUrls && Array.isArray(streamUrls.streams)) {
        streamUrls.streams.forEach(({ url, provider }) => {
          streams.push({
            title: `StreamingWatch: ${type} [${provider}]`,
            url,
            quality: 'Unknown'
          });
        });
      }
    } catch (err) {
      console.error('StreamingWatch error:', err.message);
    }
    // Try CB01
    try {
      const streamUrls = await scrapeCb01(imdbId, showName, type, season, episode);
       if (streamUrls && Array.isArray(streamUrls.streams)) {
        streamUrls.streams.forEach(({ url, provider, headers }) => {
          const stream = {
            title: `CB01: ${type} [${provider}]`,
            url,
            quality: 'Unknown',
          };
          if (headers) { // If headers are provided, set them as behavior hints
            stream.behaviorHints = {
              notWebReady: true, // stream is not web-ready, so not playable in browser
              proxyHeaders: {
                request: headers,
              },
            };
            stream.title += " (not playable in browser)"
          }
          streams.push(stream);
        });
      }
    } catch (err) {
      console.error('CB01 error:', err.message);
    }
    // Try GuardaHD 
    try {
      const streamUrls = await scrapeGuardaHD(imdbId, showName, type, season, episode);
      if (streamUrls && Array.isArray(streamUrls.streams)) {
        streamUrls.streams.forEach(({ url, provider, headers }) => {
          const stream = {
            title: `GuardaHD: ${type} [${provider}]`,
            url,
            quality: 'Unknown',
          };
          if (headers) { // If headers are provided, set them as behavior hints
            stream.behaviorHints = {
              notWebReady: true, // stream is not web-ready, so not playable in browser
              proxyHeaders: {
                request: headers,
              },
            };
            stream.title += " (not playable in browser)"
          }
          streams.push(stream);
        });
      }
    } catch (err) {
      console.error('GuardaHD error:', err.message);
    }
    // Try TantiFilm
    try {
      const streamUrls = await scrapeTantiFilm(imdbId, showName, type, season, episode);
      if (streamUrls && Array.isArray(streamUrls.streams)) {
        streamUrls.streams.forEach(({ url, provider }) => {
          streams.push({
            title: `TantiFilm: ${type} [${provider}]`,
            url,
            quality: 'Unknown'
          });
        });
      }
    } catch (err) {
      console.error('TantiFilm error:', err.message);
    }
    if (id.startsWith('kitsu')) {
      // Try AnimeUnity
      try {
        const streamUrls = await scrapeAnimeUnity(kitsuId, showName.en, type, season, episode);
        if (streamUrls && Array.isArray(streamUrls.streams)) {
          streamUrls.streams.forEach(({ url, provider, dub }) => {
            streams.push({
              title: `AnimeUnity: ${type} - ${dub} [${provider}]`,
              url,
              quality: 'Unknown'
            });
          });
        }
      } catch (err) {
        console.error('AnimeUnity error:', err.message);
      }
      // Try AnimeWorld
      try {
        const streamUrls = await scrapeAnimeWorld(kitsuId, showName.en_jp, type, season, episode);
        if (streamUrls && Array.isArray(streamUrls.streams)) {
          streamUrls.streams.forEach(({ url, provider, dub }) => {
            streams.push({
              title: `AnimeWorld: ${type} - ${dub} [${provider}]`,
              url,
              quality: 'Unknown'
            });
          });
        }
      } catch (err) {
        console.error('AnimeWorld error:', err.message);
      }
    }
  
    return { streams };
  });

// Start HTTP server (HTTP on localhost allowed by Stremio SDK)
serveHTTP(builder.getInterface(), { port: 7000 }).then(() => {
  console.log('✅ MammaMia-Node Stremio add-on available at http://127.0.0.1:7000/manifest.json');
  //open('https://staging.strem.io#?addonOpen=http://127.0.0.1:7000/manifest.json'); //FIXME: 'npm start -- --launch' should do this automatically
});
