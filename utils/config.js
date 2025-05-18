/**
 * Configuration values for the bot
 * @module utils/config
 */

module.exports = {
    /** Telegram payment provider token for processing payments */
    PAYMENT_PROVIDER_TOKEN: process.env.TELEGRAM_PAYMENT_TOKEN,
    /** Premium subscription price in cents */
    PREMIUM_PRICE: parseInt(process.env.PREMIUM_PRICE, 10) || 399,
    /** Currency code for premium payments */
    PREMIUM_CURRENCY: process.env.PREMIUM_CURRENCY || 'USD',
    /** Maximum number of members allowed in free groups */
    MAX_MEMBERS_FREE: parseInt(process.env.MAX_MEMBERS_FREE, 10) || 4,
    /** Maximum number of expenses allowed in free groups */
    MAX_EXPENSES_FREE: parseInt(process.env.MAX_EXPENSES_FREE, 10) || 20,
    // Add more config as needed
}; 