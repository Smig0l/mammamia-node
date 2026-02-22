const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const USE_PROXY = process.env.USE_PROXY === 'true';
const PROXY_API_URL = process.env.PROXY_API_URL;
const PROXY_CACHE_TTL = parseInt(process.env.PROXY_CACHE_TTL) || 300000; // 5 minutes default

let cachedProxy = {
    agent: null,
    timestamp: 0,
    error: null
};

async function fetchProxies() {
    try {
        const resp = await axios.get(PROXY_API_URL);
        return resp.data.filter(p => p.is_working).sort((a, b) => a.last_checked - b.last_checked);
    } catch (error) {
        console.error('Failed to fetch proxies:', error.message);
        return [];
    }
}

async function getProxyAgent() {
    if (!USE_PROXY) {
        return null;
    }

    // Check if cached proxy is still valid
    const now = Date.now();
    if (cachedProxy.agent && (now - cachedProxy.timestamp) < PROXY_CACHE_TTL && !cachedProxy.error) {
        console.log('Using cached proxy agent');
        return cachedProxy.agent;
    }

    // Cache expired or had error, fetch new proxy
    try {
        console.log('Fetching new proxy...');
        let proxies = await fetchProxies();
        if (proxies.length > 0) {
            const proxy = proxies[0];
            console.log(`Using fetched proxy: ${proxy.address}:${proxy.port}`);
            cachedProxy = {
                agent: new HttpsProxyAgent({ host: proxy.address, port: proxy.port }),
                timestamp: now,
                error: null
            };
            return cachedProxy.agent;
        }
        throw new Error('No proxy available');
    } catch (error) {
        console.error('Error getting new proxy:', error.message);
        cachedProxy.error = error.message;
        throw error;
    }
}

module.exports = {
    getProxyAgent,
    fetchProxies
};