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

function formatDate(date) {
    if (!date) return 'Unknown';
    const d = new Date(date);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${day} ${month} ${hours}:${minutes}`;
}

module.exports = {
    showHistory: async (bot, msg, t) => {
        const chatId = msg.chat.id;
        try {
            const groupExpense = await GroupExpense.findOne({ chatId });
            if (!groupExpense || (!groupExpense.expenses.length && !groupExpense.settlements.length)) {
                return bot.sendMessage(chatId, t('no_expenses_settlements_group'));
            }

            // Combine expenses and settlements into a single timeline
            const timeline = [
                ...(groupExpense.expenses || []).map(exp => ({
                    type: 'expense',
                    data: exp,
                    timestamp: exp.timestamp
                })),
                ...(groupExpense.settlements || []).map(set => ({
                    type: 'settlement',
                    data: set,
                    timestamp: set.timestamp
                }))
            ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
             .slice(0, 20);

            let text = t('expense_history') + '\n\n';
            const nameCache = {};

            for (const item of timeline) {
                const timeStr = formatDate(item.timestamp);
                if (item.type === 'expense') {
                    const exp = item.data;
                    const paidByName = exp.paidBy
                        ? await getUserName(bot, chatId, exp.paidBy, nameCache)
                        : t('unknown');
                    const participantNames = [];
                    if (Array.isArray(exp.participants)) {
                        for (const pid of exp.participants) {
                            participantNames.push(await getUserName(bot, chatId, pid, nameCache));
                        }
                    }
                    text += t('history_expense_line', {
                        time: timeStr,
                        amount: exp.amount || '?',
                        description: exp.description || '',
                        paidBy: paidByName,
                        participants: participantNames.join(', ')
                    }) + '\n\n';
                } else {
                    const set = item.data;
                    const fromName = await getUserName(bot, chatId, set.from, nameCache);
                    const toName = await getUserName(bot, chatId, set.to, nameCache);
                    text += t('history_settlement_line', {
                        time: timeStr,
                        amount: set.amount,
                        from: fromName,
                        to: toName
                    }) + '\n\n';
                }
            }
            await bot.sendMessage(chatId, text);
        } catch (err) {
            console.error('Error in /history:', err);
            await bot.sendMessage(chatId, t('error_fetching_history'));
        }
    }
};
