const Payment = require('../models/Payment');
const GroupExpense = require('../models/GroupExpense');
const { getJarTransactions } = require('../utils/monobank');

module.exports = (bot) => async (msg, t) => {
    const userId = msg.from.id;
    const jarId = process.env.MONOBANK_JAR_ID;
    let txs = [];
    if (jarId) {
        try {
            txs = await getJarTransactions(jarId);
            console.log('Found transactions:', JSON.stringify(txs, null, 2));
        } catch (err) {
            console.error('Error fetching Monobank transactions:', err.message);
            return bot.sendMessage(msg.chat.id, 'Error fetching payment info. Please try again later.');
        }
    }
    // Find a transaction with the exact comment format
    const found = txs.find(tx => {
        if (!tx.comment) return false;
        const commentPattern = new RegExp(`Tripper-${userId}-\\d+`);
        return commentPattern.test(tx.comment);
    });

    if (found) {
        console.log('Found matching transaction:', JSON.stringify(found, null, 2));

        // Find the corresponding payment in our database
        const payment = await Payment.findOne({
            userId,
            comment: found.comment,
            provider: 'monobank'
        });
        console.log('Found payment in database:', payment ? JSON.stringify(payment, null, 2) : 'No payment found');

        if (payment) {
            // Always try to activate premium, even if payment was already completed
            console.log('Looking for group with chatId:', payment.chatId);
            const groupExpense = await GroupExpense.findOne({ chatId: payment.chatId });
            console.log('Found group:', groupExpense ? JSON.stringify(groupExpense, null, 2) : 'No group found');

            if (groupExpense) {
                if (!groupExpense.premium) {
                    console.log('Activating premium for group');
                    groupExpense.premium = true;
                    await groupExpense.save();
                    console.log('Group premium status updated:', groupExpense.premium);

                    // Notify both the user and the group
                    await bot.sendMessage(msg.chat.id, `✅ Payment found and premium activated for your group!`);
                    await bot.sendMessage(payment.chatId, `🎉 Premium has been activated for this group! Enjoy unlimited members, expenses, and more features!`);
                } else {
                    console.log('Group already has premium status');
                }
            } else {
                console.log('Group not found for chatId:', payment.chatId);
            }

            // Update payment status if needed
            if (payment.status !== 'completed') {
                console.log('Updating payment status to completed');
                payment.status = 'completed';
                payment.completedAt = new Date();
                await payment.save();
            }
        }

        await bot.sendMessage(msg.chat.id, `✅ Payment found for your user ID!
Amount: ${found.amount / 100} UAH
Comment: ${found.comment}
Status: ${payment ? 'Activated' : 'Found but not in database'}`);
    } else {
        console.log('No matching transaction found for user:', userId);
        await bot.sendMessage(msg.chat.id, 'No payment found for your user ID.');
    }
};
