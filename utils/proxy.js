const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const USE_PROXY = process.env.USE_PROXY === 'true';
const PROXY_API_URL = process.env.PROXY_API_URL;

let cachedProxy = {
    agent: null,
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

async function testProxy(agent, STREAM_SITE) {
    try {
        //console.log('Testing proxy...');
        const response = await axios.get(`${STREAM_SITE}/`, {
            httpsAgent: agent,
            timeout: 1500
        });
        //console.log('Proxy test successful');
        return true;
    } catch (error) {
        //console.error('Proxy test failed:', error.message);
        return false;
    }
}

async function getProxyAgent(STREAM_SITE) {
    if (!USE_PROXY) {
        return null;
    }

    // Check if cached proxy is still valid
    if (cachedProxy.agent && !cachedProxy.error) {
        console.log('Using cached proxy agent');
        return cachedProxy.agent;
    }

    // Cache expired or had error, fetch new proxy
    try {
        //console.log('Fetching new proxy...');
        let proxies = await fetchProxies();
        if (proxies.length > 0) {
            for (const proxy of proxies) {
                console.log(`Using fetched proxy: ${proxy.address}:${proxy.port}`);
                cachedProxy = {
                    agent: new HttpsProxyAgent({ host: proxy.address, port: proxy.port }),
                    error: null
                };
                const isValid = await testProxy(cachedProxy.agent, STREAM_SITE);
                if (isValid) {
                    return cachedProxy.agent;
                } else {
                    console.error('Fetched proxy is not working');
                }
            }
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