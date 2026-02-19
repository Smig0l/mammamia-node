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
      //console.log('Kitsu response:', resp.data.data.attributes);
      return resp.data.data.attributes.titles ;
    }
  } catch (err) {
    console.error('Kitsu fetch error:', err.message);
  }
  return 'Unknown';
}

async function getMappingsFromKitsu(kitsuId) {
  try {
    const resp = await axios.get(`https://kitsu.io/api/edge/anime/${kitsuId}?include=mappings`);
    if (resp.data && resp.data.included) {
      let anilistId = null, malId = null, tvdbId = null;
      for (const mapping of resp.data.included) {
        if (mapping.type === 'mappings') {
          if (mapping.attributes.externalSite === 'anilist/anime') {
            anilistId = mapping.attributes.externalId;
          }
          if (mapping.attributes.externalSite === 'myanimelist/anime') {
            malId = mapping.attributes.externalId;
          }
          if (mapping.attributes.externalSite === 'thetvdb') {
            tvdbId = mapping.attributes.externalId;
          }
        }
      }
      return { anilistId, malId, tvdbId };
    }
  } catch (err) {
    console.error('Kitsu fetch error:', err.message);
  }
  return null;
}

async function getAniListInfo(anilistId) {
    const query = `
        query ($id: Int) {
            Media(id: $id, type: ANIME) {
                id
                idMal
                title {
                    romaji
                    english
                    native
                }
                startDate { year }
                season
                seasonYear
                episodes
                relations {
                    edges {
                        node {
                            id
                            title { romaji english native }
                            startDate { year }
                            season
                            seasonYear
                            episodes
                        }
                        relationType
                    }
                }
            }
        }
    `;
    const variables = { id: parseInt(anilistId) };
    const response = await axios.post('https://graphql.anilist.co', {
        query,
        variables
    }, {
        headers: { 'Content-Type': 'application/json' }
    });
    const media = response.data.data.Media;
    console.log('Anilist response:', media);
    return {
        id: media.id,
        id_mal: media.idMal,
        title: media.title.english || media.title.romaji || media.title.native,
        year: media.startDate.year,
        season: media.season,
        seasonYear: media.seasonYear,
        episodes: media.episodes,
        relations: media.relations ? media.relations.edges.map(e => ({
            id: e.node.id,
            title: e.node.title.english || e.node.title.romaji || e.node.title.native,
            year: e.node.startDate.year,
            season: e.node.season,
            seasonYear: e.node.seasonYear,
            episodes: e.node.episodes,
            relationType: e.relationType
        })) : []
    };
}

module.exports = { getShowNameFromCinemeta, getShowNameFromKitsu, getMappingsFromKitsu, getAniListInfo };

/*
(async () => {
    const info = await getAniListInfo("21");
    console.log('Fetched Anilist info:', info);
})();
*/