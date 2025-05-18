const GroupExpense = require('../models/GroupExpense');

module.exports = {
    clearExpenses: async (bot, msg) => {
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Yes', callback_data: 'clear_yes' },
                        { text: 'No', callback_data: 'clear_no' }
                    ]
                ]
            }
        };
        await bot.sendMessage(msg.chat.id, 'Are you sure you want to clear all expenses?', opts);
    },
    handleClearCallback: async (bot, query) => {
        if (query.data === 'clear_yes') {
            try {
                await GroupExpense.findOneAndUpdate(
                    { chatId: query.message.chat.id },
                    { $set: { expenses: [] } }
                );
                await bot.sendMessage(query.message.chat.id, 'All expenses have been cleared!');
            } catch (err) {
                console.error('Error clearing expenses:', err);
                await bot.sendMessage(query.message.chat.id, 'Error clearing expenses.');
            }
        }
        if (query.data === 'clear_no') {
            await bot.sendMessage(query.message.chat.id, 'Cancelled.');
        }
    }
};
