const GroupExpense = require('../models/GroupExpense');

const PAYMENT_PROVIDER_TOKEN = process.env.TELEGRAM_PAYMENT_TOKEN;
const PREMIUM_PRICE = process.env.PREMIUM_PRICE; // in cents
const PREMIUM_CURRENCY = process.env.PREMIUM_CURRENCY;
const MAX_MEMBERS_FREE = parseInt(process.env.MAX_MEMBERS_FREE, 10) || 4;

module.exports = (bot) => async (msg, t) => {
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
                limit: MAX_MEMBERS_FREE,
                price: (PREMIUM_PRICE / 100).toFixed(2)
            }),
            `premium_group_${chatId}`,
            PAYMENT_PROVIDER_TOKEN,
            PREMIUM_CURRENCY,
            JSON.stringify([{
                label: t('premium_invoice_label'),
                amount: PREMIUM_PRICE
            }]),
            {
                photo_url: 'https://telegram.org/img/t_logo.png',
                need_name: true,
                need_email: false
            }
        );
    }
};
