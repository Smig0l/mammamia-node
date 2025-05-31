const axios = require('axios');

async function getShowNameFromCinemeta(type, imdbId) {
  try {
    const resp = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`);
    if (resp.data && resp.data.meta) {
      //console.log('Cinemeta response:', resp.data.meta);
      return resp.data.meta.name || resp.data.meta.originalTitle || 'Unknown';
    }
  } catch (err) {
    console.error('Cinemeta fetch error:', err.message);
  }
  return 'Unknown';
}

async function getShowNameFromKitsu(kitsuId) {
  try {
    const resp = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}`);
    if (resp.data && resp.data.data && resp.data.data.attributes) {
      return resp.data.data.attributes.canonicalTitle || 'Unknown';
    }
  } catch (err) {
    console.error('Kitsu fetch error:', err.message);
  }
  return 'Unknown';
}

module.exports = { getShowNameFromCinemeta, getShowNameFromKitsu };