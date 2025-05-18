const GroupExpense = require('../models/GroupExpense');
const Payment = require('../models/Payment');

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
            const userId = msg.from.id;
            const amount = process.env.PREMIUM_PRICE; // in UAH
            const jarId = process.env.MONOBANK_JAR_ID;
            if (!jarId) {
                await bot.sendMessage(chatId, 'Monobank jar ID is not configured. Please contact support.');
                return;
            }
            const comment = `Tripper-${userId}-${Date.now()}`;
            const monobankLink = `https://send.monobank.ua/jar/${jarId}?amount=${amount}&comment=${encodeURIComponent(comment)}`;

            // Store this payment request in your DB
            const payment = new Payment({
                chatId,
                userId,
                address: jarId,
                amount,
                status: 'pending',
                comment,
                provider: 'monobank',
                currency: 'UAH'
            });
            await payment.save();

            await bot.sendMessage(chatId, t('monobank_pay_caption', { amount, comment }), {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: t('pay_with_monobank'), url: monobankLink },
                            { text: '📋 Copy Comment', callback_data: `copy_comment:${comment}` }
                        ]
                    ]
                }
            });

            await bot.sendMessage(chatId, `Long-press (or right-click) to copy the comment below and paste it into the Monobank payment page:

↓↓↓ ADD THIS COMMENT TO THE PAYMENT PAGE ↓↓↓



${comment}



↑↑↑ ADD THIS COMMENT TO THE PAYMENT PAGE ↑↑↑

`);
        }
    } catch (error) {
        console.error('Error in upgrade command:', error);
        await bot.sendMessage(msg.chat.id, t('error_occurred'));
    }
};
