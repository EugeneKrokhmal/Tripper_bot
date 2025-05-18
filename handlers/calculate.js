const GroupExpense = require('../models/GroupExpense');
const BaseHandler = require('./BaseHandler');
const baseHandler = new BaseHandler();

const calculateDebts = async (bot, msg, t) => {
    const chatId = msg.chat.id;

    try {
        const groupExpense = await GroupExpense.findOne({ chatId });
        if (!groupExpense || !groupExpense.expenses.length) {
            return bot.sendMessage(chatId, t('no_expenses_group'));
        }
        const currency = groupExpense.currency || 'usd';

        const debts = new Map(); // Map to store net amounts for each user

        // Calculate net amounts for each user
        for (const expense of groupExpense.expenses) {
            const amountPerPerson = expense.amount / expense.participants.length;

            // Add amount to payer's balance
            debts.set(expense.paidBy, (debts.get(expense.paidBy) || 0) + expense.amount);

            // Subtract amount from each participant's balance
            for (const participantId of expense.participants) {
                debts.set(participantId, (debts.get(participantId) || 0) - amountPerPerson);
            }
        }

        // Subtract settlements
        if (groupExpense.settlements && groupExpense.settlements.length) {
            for (const s of groupExpense.settlements) {
                debts.set(s.from, (debts.get(s.from) || 0) + s.amount);
                debts.set(s.to, (debts.get(s.to) || 0) - s.amount);
            }
        }

        // Calculate final debts between users
        const debtMessages = [];
        const debtors = Array.from(debts.entries())
            .filter(([_, amount]) => amount < 0)
            .sort((a, b) => a[1] - b[1]);

        const creditors = Array.from(debts.entries())
            .filter(([_, amount]) => amount > 0)
            .sort((a, b) => b[1] - a[1]);

        for (const [debtorId, debtAmount] of debtors) {
            let remainingDebt = Math.abs(debtAmount);

            for (const [creditorId, creditAmount] of creditors) {
                if (remainingDebt <= 0) break;

                const transferAmount = Math.min(remainingDebt, creditAmount);
                if (transferAmount > 0) {
                    const debtor = await bot.getChatMember(chatId, debtorId);
                    const creditor = await bot.getChatMember(chatId, creditorId);

                    debtMessages.push(
                        t('debt_line', {
                            debtor: debtor.user.first_name,
                            creditor: creditor.user.first_name,
                            amount: baseHandler.formatAmount(transferAmount, currency, t)
                        })
                    );

                    remainingDebt -= transferAmount;
                    debts.set(creditorId, creditAmount - transferAmount);
                }
            }
        }

        if (debtMessages.length === 0) {
            return bot.sendMessage(chatId, t('no_debts'));
        }

        const message = t('debt_summary') + '\n\n' + debtMessages.join('\n');
        return bot.sendMessage(chatId, message);
    } catch (error) {
        console.error('Error calculating debts:', error);
        return bot.sendMessage(chatId, t('error_calculating_debts'));
    }
};

module.exports = {
    calculateDebts
};
