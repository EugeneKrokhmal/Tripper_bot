const Payment = require('../models/Payment');

module.exports = (bot) => async (msg, t) => {
    const userId = msg.from.id;
    const amount = process.env.PREMIUM_PRICE; // in UAH
    const jarId = process.env.MONOBANK_JAR_ID;
    if (!jarId) {
        await bot.sendMessage(msg.chat.id, 'Monobank jar ID is not configured. Please contact support.');
        return;
    }
    const comment = `Tripper-${userId}-${Date.now()}`;
    const monobankLink = `https://send.monobank.ua/jar/${jarId}?amount=${amount}&comment=${encodeURIComponent(comment)}`;

    // Store this payment request in your DB
    const payment = new Payment({
        chatId: msg.chat.id,
        userId,
        address: jarId,
        amount,
        status: 'pending',
        comment,
        provider: 'monobank',
        currency: 'UAH'
    });
    await payment.save();

    await bot.sendMessage(msg.chat.id, t('monobank_pay_caption', { amount, comment }), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: t('pay_with_monobank'), url: monobankLink }]
            ]
        }
    });
};
