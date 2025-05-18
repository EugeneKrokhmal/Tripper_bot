const GroupExpense = require('../models/GroupExpense');
const { formatGroupName } = require('../utils/format');

module.exports = (bot) => async (msg, t) => {
    try {
        const userId = msg.from.id;
        if (msg.chat.type === 'private') {
            // List all groups and their premium status
            const groups = await GroupExpense.find({ 'members.userId': userId });
            if (!groups.length) {
                return bot.sendMessage(msg.chat.id, t('no_groups_found'));
            }
            let text = t('your_groups_status') + '\n\n';
            for (const group of groups) {
                text += `${formatGroupName(group, t)}: ` +
                    (group.premium ? t('premium_active') : t('premium_inactive')) + '\n';
            }
            return bot.sendMessage(msg.chat.id, text);
        }
        // In group chat: show this group's premium status
        const chatId = msg.chat.id;
        const groupExpense = await GroupExpense.findOne({ chatId });
        if (!groupExpense) {
            await bot.sendMessage(chatId, t('no_expenses_group'));
            return;
        }
        if (groupExpense.premium) {
            await bot.sendMessage(chatId, t('premium_active_group'));
        } else {
            await bot.sendMessage(chatId, t('premium_inactive_group'));
        }
    } catch (error) {
        console.error('Error in premium command:', error);
        await bot.sendMessage(msg.chat.id, t('error_occurred'));
    }
};
