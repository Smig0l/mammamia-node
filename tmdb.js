// tmdb.js
require('dotenv').config();
const { MovieDb } = require('moviedb-promise');
const moviedb = new MovieDb(process.env.TMDB_API_KEY);
module.exports = moviedb;