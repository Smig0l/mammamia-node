const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const USE_PROXY = process.env.USE_PROXY === 'true';
const PROXY_API_URL = process.env.PROXY_API_URL;

let cachedProxyAgent = null;

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

    // Return cached proxy if available
    if (cachedProxyAgent) {
        return cachedProxyAgent;
    }

    // Try to get proxy from API first
    let proxies = await fetchProxies();
    if (proxies.length > 0) {
        const proxy = proxies[0];
        console.log(`Using fetched proxy: ${proxy.address}:${proxy.port}`);
        cachedProxyAgent = new HttpsProxyAgent({ host: proxy.address, port: proxy.port });
        return cachedProxyAgent;
    }

    throw new Error('No proxy available');
}

module.exports = {
    getProxyAgent,
    fetchProxies
};