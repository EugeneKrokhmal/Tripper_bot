const GroupExpense = require('../models/GroupExpense');
const config = require('../utils/config');

module.exports = (bot) => async (msg, t) => {
    try {
        if (msg.chat.type === 'private') {
            return bot.sendMessage(msg.chat.id, t('upgrade_in_group'));
        }
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
    } catch (error) {
        console.error('Error in upgrade command:', error);
        await bot.sendMessage(msg.chat.id, t('error_occurred'));
    }
};
