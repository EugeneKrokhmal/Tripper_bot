const GroupExpense = require('../models/GroupExpense');
const { formatGroupName } = require('../utils/format');
const config = require('../utils/config');

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
        } else {
            // In group chat: show this group's premium status or send invoice
            const chatId = msg.chat.id;
            const groupExpense = await GroupExpense.findOne({ chatId });
            if (!groupExpense) {
                await bot.sendMessage(chatId, t('no_expenses_group'));
                return;
            }
            if (groupExpense.premium) {
                await bot.sendMessage(chatId, t('premium_active_group'));
            } else {
                // Send Telegram payment invoice
                await bot.sendInvoice(
                    chatId,
                    t('premium_invoice_title'),
                    t('premium_invoice_description', {
                        limit: config.MAX_MEMBERS_FREE,
                        price: (config.PREMIUM_PRICE / 100).toFixed(2)
                    }),
                    `premium_group_${chatId}`,
                    config.PAYMENT_PROVIDER_TOKEN,
                    config.PREMIUM_CURRENCY,
                    JSON.stringify([{
                        label: t('premium_invoice_label'),
                        amount: config.PREMIUM_PRICE
                    }]),
                    {
                        photo_url: 'https://telegram.org/img/t_logo.png',
                        need_name: true,
                        need_email: false
                    }
                );
            }
        }
    } catch (error) {
        console.error('Error in premium command:', error);
        await bot.sendMessage(msg.chat.id, t('error_occurred'));
    }
};
