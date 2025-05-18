const GroupExpense = require('../models/GroupExpense');

module.exports = {
    clearExpenses: async (bot, msg, t) => {
        try {
            const opts = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: t('yes'), callback_data: 'clear_yes' },
                            { text: t('no'), callback_data: 'clear_no' }
                        ]
                    ]
                }
            };
            await bot.sendMessage(msg.chat.id, t('confirm_clear_expenses'), opts);
        } catch (error) {
            console.error('Error in clearExpenses:', error);
            await bot.sendMessage(msg.chat.id, t('error_occurred'));
        }
    },
    handleClearCallback: async (bot, query, t) => {
        try {
            if (query.data === 'clear_yes') {
                await GroupExpense.findOneAndUpdate(
                    { chatId: query.message.chat.id },
                    { $set: { expenses: [] } }
                );
                await bot.sendMessage(query.message.chat.id, t('expenses_cleared'));
            }
            if (query.data === 'clear_no') {
                await bot.sendMessage(query.message.chat.id, t('clear_cancelled'));
            }
        } catch (error) {
            console.error('Error in handleClearCallback:', error);
            await bot.sendMessage(query.message.chat.id, t('error_occurred'));
        }
    }
};
