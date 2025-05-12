// info.js
const moviedb = require('./tmdb');

/**
 * Given an IMDb ID (e.g. "tt18412256"), find the corresponding TMDb ID.
 */
async function getTMDbIdFromIMDb(imdbId) {
  const { movie_results, tv_results } = await moviedb.find({
    id: imdbId,
    external_source: 'imdb_id'
  });
  if (movie_results.length) return { isMovie: true, tmdbId: movie_results[0].id };
  if (tv_results.length)    return { isMovie: false, tmdbId: tv_results[0].id };
  throw new Error(`No TMDb entry for IMDb ID ${imdbId}`);
}

/**
 * Fetch the title and year (or first air date year) for a movie or TV show.
 */
async function getShowInfo(tmdbId, isMovie) {
  if (isMovie) {
    const { title, release_date } = await moviedb.movieInfo({ id: tmdbId });
    return { showName: title, year: release_date.slice(0,4) };
  } else {
    const { name, first_air_date } = await moviedb.tvInfo({ id: tmdbId });
    return { showName: name, year: first_air_date.slice(0,4) };
  }
}

module.exports = { getTMDbIdFromIMDb, getShowInfo };