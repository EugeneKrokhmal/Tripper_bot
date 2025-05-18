const GroupExpense = require('../models/GroupExpense');
const { formatGroupName } = require('../utils/format');

module.exports = (bot) => async (msg, t, currencyOptions, languageNames) => {
    try {
        const userId = msg.from.id;
        if (msg.chat.type === 'private') {
            // Show group selection if user is in multiple groups
            const groups = await GroupExpense.find({ 'members.userId': userId });
            if (!groups.length) {
                return bot.sendMessage(msg.chat.id, t('no_groups_found'));
            }
            if (groups.length === 1) {
                const group = groups[0];
                if (!group.premium) {
                    return bot.sendMessage(msg.chat.id, t('premium_feature_locked'));
                }
                const keyboard = {
                    inline_keyboard: currencyOptions.map(opt => [{
                        text: `${t(opt.key)}${opt.code === (group.currency || 'usd') ? ' ✓' : ''}`,
                        callback_data: `currency_${opt.code}_group_${group.chatId}`
                    }])
                };
                return bot.sendMessage(msg.chat.id, t('select_currency'), { reply_markup: keyboard });
            }
            // Multiple groups: ask which group to set
            const keyboard = {
                inline_keyboard: groups.map(g => [{
                    text: formatGroupName(g, t),
                    callback_data: `currency_select_group_${g.chatId}`
                }])
            };
            return bot.sendMessage(msg.chat.id, t('select_group'), { reply_markup: keyboard });
        } else {
            // In group chat: set currency for this group
            const chatId = msg.chat.id;
            const groupExpense = await GroupExpense.findOne({ chatId });
            if (!groupExpense) {
                await bot.sendMessage(chatId, t('no_expenses_group'));
                return;
            }
            if (!groupExpense.premium) {
                await bot.sendMessage(chatId, t('premium_feature_locked'));
                return;
            }
            const keyboard = {
                inline_keyboard: currencyOptions.map(opt => [{
                    text: `${t(opt.key)}${opt.code === (groupExpense.currency || 'usd') ? ' ✓' : ''}`,
                    callback_data: `currency_${opt.code}_group_${chatId}`
                }])
            };
            await bot.sendMessage(chatId, t('select_currency'), { reply_markup: keyboard });
        }
    } catch (error) {
        console.error('Error in currency command:', error);
        await bot.sendMessage(msg.chat.id, t('error_occurred'));
    }
};
