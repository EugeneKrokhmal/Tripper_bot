const GroupExpense = require('../models/GroupExpense');
const User = require('../models/User');
const i18next = require('i18next');

class BaseHandler {
    constructor(bot) {
        this.bot = bot;
    }

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
                    language: msgOrQuery.from?.language_code || 'en'
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
            
            return i18next.getFixedT(user.language, 'translation');
        } catch (error) {
            console.error('Error getting user language:', error);
            return i18next.getFixedT('en', 'translation');
        }
    }

    async getGroupExpense(chatId) {
        let groupExpense = await GroupExpense.findOne({ chatId });
        if (!groupExpense) {
            groupExpense = new GroupExpense({ chatId, expenses: [] });
        }
        return groupExpense;
    }

    async sendMessage(chatId, text, options = {}) {
        try {
            return await this.bot.sendMessage(chatId, text, options);
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    async answerCallbackQuery(queryId, options = {}) {
        try {
            return await this.bot.answerCallbackQuery(queryId, options);
        } catch (error) {
            console.error('Error answering callback query:', error);
            throw error;
        }
    }

    async getChatMember(chatId, userId) {
        try {
            return await this.bot.getChatMember(chatId, userId);
        } catch (error) {
            console.error('Error getting chat member:', error);
            throw error;
        }
    }

    formatAmount(amount) {
        return `$${amount.toFixed(2)}`;
    }

    async handleError(chatId, error, t) {
        console.error('Error:', error);
        await this.sendMessage(chatId, t('error_occurred'));
    }
}

module.exports = BaseHandler;
