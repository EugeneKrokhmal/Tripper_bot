const GroupExpense = require('../models/GroupExpense');

async function getUserName(bot, chatId, userId, cache) {
    if (cache[userId]) return cache[userId];
    try {
        const member = await bot.getChatMember(chatId, userId);
        const name = member.user.username
            ? `@${member.user.username}`
            : member.user.first_name || member.user.id;
        cache[userId] = name;
        return name;
    } catch {
        return userId.toString();
    }
}

module.exports = {
    showHistory: async (bot, msg) => {
        const chatId = msg.chat.id;
        try {
            const groupExpense = await GroupExpense.findOne({ chatId });
            if (!groupExpense || !groupExpense.expenses.length) {
                return bot.sendMessage(chatId, 'No expenses found for this group.');
            }
            const expenses = groupExpense.expenses
                .slice()
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 20); // Show up to 20 most recent
            let text = '🧾 *Expense History*\n\n';
            const nameCache = {};
            for (let idx = 0; idx < expenses.length; idx++) {
                const exp = expenses[idx];
                const paidByName = await getUserName(bot, chatId, exp.paidBy, nameCache);
                const participantNames = [];
                for (const pid of exp.participants) {
                    participantNames.push(await getUserName(bot, chatId, pid, nameCache));
                }
                text += `${idx + 1}. $${exp.amount} — ${exp.description}\nPaid by: ${paidByName}\nParticipants: ${participantNames.join(', ')}\nDate: ${new Date(exp.timestamp).toLocaleString()}\n\n`;
            }
            await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('Error in /history:', err);
            await bot.sendMessage(chatId, 'Error fetching expense history.');
        }
    }
};
