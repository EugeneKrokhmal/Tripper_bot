const GroupExpense = require('../models/GroupExpense');

async function sendDailyReminders(bot, t) {
    const groups = await GroupExpense.find({});
    for (const group of groups) {
        const chatId = group.chatId;
        if (!group.expenses || !group.expenses.length) continue;

        // Calculate debts
        const debts = new Map();
        for (const expense of group.expenses) {
            const amountPerPerson = expense.amount / expense.participants.length;
            debts.set(expense.paidBy, (debts.get(expense.paidBy) || 0) + expense.amount);
            for (const participantId of expense.participants) {
                debts.set(participantId, (debts.get(participantId) || 0) - amountPerPerson);
            }
        }
        if (group.settlements && group.settlements.length) {
            for (const s of group.settlements) {
                debts.set(s.from, (debts.get(s.from) || 0) + s.amount);
                debts.set(s.to, (debts.get(s.to) || 0) - s.amount);
            }
        }

        // Prepare reminders for each debtor
        for (const [debtorId, debtAmount] of debts.entries()) {
            if (debtAmount >= 0) continue; // Only those who owe
            let remainingDebt = Math.abs(debtAmount);
            let message = t('reminder_header', { group: group.groupName || chatId }) + '\n';
            for (const [creditorId, creditAmount] of debts.entries()) {
                if (creditAmount <= 0 || debtorId === creditorId) continue;
                const transferAmount = Math.min(remainingDebt, creditAmount);
                if (transferAmount > 0) {
                    const creditor = group.members.find(m => m.userId === creditorId);
                    const creditorName = creditor?.username ? `@${creditor.username}` : (creditor?.firstName || creditorId);
                    message += t('reminder_line', { amount: transferAmount.toFixed(2), to: creditorName }) + '\n';
                    remainingDebt -= transferAmount;
                }
                if (remainingDebt <= 0) break;
            }
            if (message.trim() !== '') {
                try {
                    await bot.sendMessage(debtorId, message);
                } catch (e) {
                    // User may have not started the bot in private
                }
            }
        }
    }
}

module.exports = { sendDailyReminders };
