require('dotenv').config();
const axios = require('axios');
const MONOBANK_TOKEN = process.env.MONOBANK_TOKEN;

async function getJarTransactions(jarId) {
    console.log('MONOBANK_JAR_ID from env:', JSON.stringify(jarId));
    // First get client info to get the account ID
    const clientInfoUrl = 'https://api.monobank.ua/personal/client-info';
    try {
        const clientInfo = await axios.get(clientInfoUrl, {
            headers: { 'X-Token': MONOBANK_TOKEN }
        });

        // Find the jar account - match against sendId (public URL ID)
        const jarAccount = clientInfo.data.jars.find(jar =>
            jar.sendId === `jar/${jarId}`
        );

        if (!jarAccount) {
            console.log('Available jars:', JSON.stringify(clientInfo.data.jars, null, 2));
            throw new Error('Jar not found');
        }
        console.log('Found jar object:', JSON.stringify(jarAccount, null, 2));

        // Get transactions for the last 24 hours
        const now = Math.floor(Date.now() / 1000);
        const dayAgo = now - 86400;
        const statementUrl = `https://api.monobank.ua/personal/statement/${jarAccount.id}/${dayAgo}`;

        const statement = await axios.get(statementUrl, {
            headers: { 'X-Token': MONOBANK_TOKEN }
        });

        return statement.data;
    } catch (error) {
        if (error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
            console.error('Error response headers:', error.response.headers);
        }
        throw error;
    }
}

async function printAllJars() {
    const clientInfoUrl = 'https://api.monobank.ua/personal/client-info';
    try {
        const clientInfo = await axios.get(clientInfoUrl, {
            headers: { 'X-Token': MONOBANK_TOKEN }
        });
        if (!clientInfo.data.jars || clientInfo.data.jars.length === 0) {
            console.log('No jars found for this token.');
            return;
        }
        console.log('Jars for this token:');
        for (const jar of clientInfo.data.jars) {
            console.log(`ID: ${jar.id}, Name: ${jar.title || jar.name || 'No name'}`);
        }
    } catch (error) {
        if (error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
            console.error('Error response headers:', error.response.headers);
        }
        throw error;
    }
}

// Standalone script to log all completed jar transactions
if (require.main === module) {
    (async () => {
        const jarId = process.env.MONOBANK_JAR_ID;
        if (!jarId) {
            console.error('MONOBANK_JAR_ID is not set in environment.');
            process.exit(1);
        }
        if (!MONOBANK_TOKEN) {
            console.error('MONOBANK_TOKEN is not set in environment.');
            process.exit(1);
        }
        try {
            const txs = await getJarTransactions(jarId);
            console.log('All completed jar transactions:');
            for (const tx of txs) {
                if (tx.status === 'success' || tx.operationAmount > 0) { // Monobank API: positive amount means incoming
                    console.log(JSON.stringify(tx, null, 2));
                }
            }
        } catch (err) {
            console.error('Error fetching jar transactions:', err.message);
        }
    })();
}

if (require.main === module && process.argv[2] === 'list-jars') {
    printAllJars();
}

module.exports = { getJarTransactions };
