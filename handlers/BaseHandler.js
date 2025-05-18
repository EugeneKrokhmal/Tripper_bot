const GroupExpense = require('../models/GroupExpense');
const User = require('../models/User');
const i18next = require('i18next');

/**
 * Base handler class providing common functionality for all handlers
 */
class BaseHandler {
    /**
     * @param {Object} bot - Telegram bot instance
     */
    constructor(bot) {
        this.bot = bot;
    }

    /**
     * Gets translation function and currency for a user
     * @param {Object} msgOrQuery - Message or callback query object
     * @param {number} [userId] - Optional user ID
     * @returns {Promise<{t: Function, currency: string}>} Translation function and currency
     */
    async getT(msgOrQuery, userId) {
        const id = userId || msgOrQuery.from?.id;
        try {
            // First try to find the user
            let user = await User.findOne({ userId: id });
            
            // If user doesn't exist, create them
            if (!user) {
                user = await User.create({
                    userId: id,
                    username: msgOrQuery.from?.username,
                    firstName: msgOrQuery.from?.first_name,
                    language: msgOrQuery.from?.language_code || 'en',
                    currency: 'usd'
                });
            } else {
                // Update user info if it has changed
                const updates = {};
                if (msgOrQuery.from?.username && msgOrQuery.from.username !== user.username) {
                    updates.username = msgOrQuery.from.username;
                }
                if (msgOrQuery.from?.first_name && msgOrQuery.from.first_name !== user.firstName) {
                    updates.firstName = msgOrQuery.from.first_name;
                }
                if (Object.keys(updates).length > 0) {
                    user = await User.findOneAndUpdate(
                        { userId: id },
                        { $set: updates },
                        { new: true }
                    );
                }
            }
            
            return {
                t: i18next.getFixedT(user.language, 'translation'),
                currency: user.currency || 'usd'
            };
        } catch (error) {
            console.error('Error getting user language:', error);
            return {
                t: i18next.getFixedT('en', 'translation'),
                currency: 'usd'
            };
        }
    }

    /**
     * Gets or creates a group expense document
     * @param {string} chatId - Telegram chat ID
     * @returns {Promise<Object>} Group expense document
     */
    async getGroupExpense(chatId) {
        try {
            let groupExpense = await GroupExpense.findOne({ chatId });
            if (!groupExpense) {
                groupExpense = new GroupExpense({ chatId, expenses: [] });
            }
            return groupExpense;
        } catch (error) {
            console.error('Error getting group expense:', error);
            throw error;
        }
    }

    /**
     * Sends a message to a chat
     * @param {string} chatId - Telegram chat ID
     * @param {string} text - Message text
     * @param {Object} [options] - Additional options for sendMessage
     * @returns {Promise<Object>} Sent message object
     */
    async sendMessage(chatId, text, options = {}) {
        try {
            return await this.bot.sendMessage(chatId, text, options);
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    /**
     * Answers a callback query
     * @param {string} queryId - Callback query ID
     * @param {Object} [options] - Additional options for answerCallbackQuery
     * @returns {Promise<Object>} Result of answerCallbackQuery
     */
    async answerCallbackQuery(queryId, options = {}) {
        try {
            return await this.bot.answerCallbackQuery(queryId, options);
        } catch (error) {
            console.error('Error answering callback query:', error);
            throw error;
        }
    }

    /**
     * Gets a chat member
     * @param {string} chatId - Telegram chat ID
     * @param {number} userId - Telegram user ID
     * @returns {Promise<Object>} Chat member object
     */
    async getChatMember(chatId, userId) {
        try {
            return await this.bot.getChatMember(chatId, userId);
        } catch (error) {
            console.error('Error getting chat member:', error);
            throw error;
        }
    }

    /**
     * Gets currency symbol
     * @param {string} currency - Currency code
     * @param {Function} t - Translation function
     * @returns {string} Currency symbol
     */
    getCurrencySymbol(currency, t) {
        const map = {
            usd: '$',
            eur: '€',
            uah: '₴',
            pln: 'zł',
            rub: '₽',
            gbp: '£',
            ils: '₪',
            inr: '₹',
            idr: 'Rp',
            byn: 'Br',
            try: '₺',
            czk: 'Kč',
            huf: 'Ft',
            ron: 'lei',
            ars: '$',
            brl: 'R$',
            mxn: '$',
            egp: 'E£',
            uzs: 'soʻm',
            azn: '₼',
            kzt: '₸'
        };
        return map[currency] || '$';
    }

    /**
     * Formats an amount with currency symbol
     * @param {number} amount - Amount to format
     * @param {string} currency - Currency code
     * @param {Function} t - Translation function
     * @returns {string} Formatted amount
     */
    formatAmount(amount, currency, t) {
        return `${this.getCurrencySymbol(currency, t)}${amount.toFixed(2)}`;
    }

    /**
     * Handles errors and sends error message to user
     * @param {string} chatId - Telegram chat ID
     * @param {Error} error - Error object
     * @param {Function} t - Translation function
     * @returns {Promise<void>}
     */
    async handleError(chatId, error, t) {
        console.error('Error:', error);
        await this.sendMessage(chatId, t('error_occurred'));
    }
}

module.exports = BaseHandler;
