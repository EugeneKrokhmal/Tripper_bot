const GroupExpense = require('../models/GroupExpense');

const states = {
    AMOUNT: 'amount',
    DESCRIPTION: 'description',
    PARTICIPANTS: 'participants'
};

const userStates = new Map();
const getStateKey = (chatId, userId) => `${chatId}:${userId}`;

const startExpenseFlow = async (bot, msg) => {
    if (msg.chat.type === 'private') {
        userStates.set(getStateKey(msg.chat.id, msg.from.id), {
            state: states.AMOUNT,
            data: {} // Don't set groupChatId initially
        });
        // Check if user is in multiple groups
        const groups = await GroupExpense.find({ 'members.userId': msg.from.id });
        if (!groups.length) {
            return bot.sendMessage(msg.chat.id, 'No groups found where you are a member.');
        }
        if (groups.length === 1) {
            userStates.get(getStateKey(msg.chat.id, msg.from.id)).data.groupChatId = groups[0].chatId;
            return bot.sendMessage(msg.chat.id, 'Please enter the expense amount:');
        } else {
            const keyboard = {
                inline_keyboard: groups.map(g => [{
                    text: g.groupName ? g.groupName : `Group ${g.chatId}`,
                    callback_data: `expense_group_${g.chatId}`
                }])
            };
            return bot.sendMessage(msg.chat.id, 'Select the group to add an expense in:', { reply_markup: keyboard });
        }
    } else {
        await bot.sendMessage(msg.chat.id, 'Check your private chat with me to add an expense.');
        userStates.set(getStateKey(msg.from.id, msg.from.id), {
            state: states.AMOUNT,
            data: { groupChatId: msg.chat.id }
        });
        return bot.sendMessage(msg.from.id, 'Please enter the expense amount:');
    }
};

const handleExpenseInput = async (bot, msg) => {
    const userId = msg.from.id;
    const stateKey = getStateKey(userId, userId);
    const userState = userStates.get(stateKey);
    if (!userState) return;

    // If no groupChatId is set, check if user is in multiple groups
    if (!userState.data.groupChatId) {
        const groups = await GroupExpense.find({ 'members.userId': userId });
        if (!groups.length) {
            return bot.sendMessage(userId, 'No groups found where you are a member.');
        }
        if (groups.length === 1) {
            userState.data.groupChatId = groups[0].chatId;
        } else {
            const keyboard = {
                inline_keyboard: groups.map(g => [{
                    text: g.groupName ? g.groupName : `Group ${g.chatId}`,
                    callback_data: `expense_group_${g.chatId}`
                }])
            };
            return bot.sendMessage(userId, 'Select the group to add an expense in:', { reply_markup: keyboard });
        }
    }

    const chatId = userState.data.groupChatId;

    switch (userState.state) {
        case states.AMOUNT:
            const amount = parseFloat(msg.text);
            if (isNaN(amount) || amount <= 0) {
                return bot.sendMessage(userId, 'Please enter a valid amount:');
            }
            userState.data.amount = amount;
            userState.state = states.DESCRIPTION;
            return bot.sendMessage(userId, 'Please enter a description for the expense:');

        case states.DESCRIPTION:
            userState.data.description = msg.text;
            userState.data.paidBy = userId;
            userState.state = states.PARTICIPANTS;
            // Use tracked group members
            const groupExpense = await GroupExpense.findOne({ chatId });
            let members = groupExpense ? groupExpense.members : [];
            // Remove bot from the list
            const botInfo = await bot.getMe();
            members = members.filter(m => m.userId !== botInfo.id);
            if (!members.length) {
                return bot.sendMessage(userId, 'No group members found. Add members to the group first.');
            }
            userState.data.participants = userState.data.participants || [];
            await sendParticipantSelection(bot, userId, members, userState.data.participants);
            break;
        case states.PARTICIPANTS:
            const expense = userState.data;
            try {
                let groupExpense = await GroupExpense.findOne({ chatId: userState.data.groupChatId });
                if (!groupExpense) {
                    groupExpense = new GroupExpense({ chatId: userState.data.groupChatId, expenses: [] });
                }
                groupExpense.expenses.push(expense);
                await groupExpense.save();
                userStates.delete(stateKey);
                await bot.sendMessage(userId, 'Expense saved successfully!');
                return bot.sendMessage(userState.data.groupChatId, `A new expense was added! $${expense.amount} - ${expense.description}`);
            } catch (error) {
                console.error('Error saving expense:', error);
                await bot.sendMessage(userId, 'Error saving expense. Please try again.');
            }
    }
};

async function sendParticipantSelection(bot, userId, members, selected) {
    const keyboard = {
        inline_keyboard: [
            ...members.map(member => [{
                text:
                    (selected.includes(member.userId) ? '✅ ' : '') +
                    (member.username ? `@${member.username}` : member.firstName || member.userId),
                callback_data: `participant_${member.userId}`
            }]),
            [{ text: 'Done', callback_data: 'participants_done' }]
        ]
    };
    const summary = selected.length
        ? 'Selected: ' + members.filter(m => selected.includes(m.userId)).map(m => m.username ? `@${m.username}` : m.firstName || m.userId).join(', ')
        : 'No participants selected yet.';
    await bot.sendMessage(userId, `Select participants (click to toggle):\n${summary}`, { reply_markup: keyboard });
}

const handleCallbackQuery = async (bot, query) => {
    const userId = query.from.id;
    const stateKey = getStateKey(userId, userId);
    const userState = userStates.get(stateKey);
    if (!userState) return;

    if (query.data && query.data.startsWith('expense_group_')) {
        const groupChatId = query.data.replace('expense_group_', '');
        userState.data.groupChatId = groupChatId;
        userState.state = states.AMOUNT;
        userStates.set(stateKey, userState);
        return bot.sendMessage(userId, 'Please enter the amount:');
    }

    if (query.data.startsWith('participant_')) {
        const participantId = parseInt(query.data.split('_')[1]);
        userState.data.participants = userState.data.participants || [];
        const idx = userState.data.participants.indexOf(participantId);
        if (idx === -1) {
            userState.data.participants.push(participantId);
        } else {
            userState.data.participants.splice(idx, 1);
        }
        // Get group members for the UI update
        const groupExpense = await GroupExpense.findOne({ chatId: userState.data.groupChatId });
        let members = groupExpense ? groupExpense.members : [];
        const botInfo = await bot.getMe();
        members = members.filter(m => m.userId !== botInfo.id);
        // Update the selection UI
        await sendParticipantSelection(bot, userId, members, userState.data.participants);
        return bot.answerCallbackQuery(query.id, { text: idx === -1 ? 'Participant added!' : 'Participant removed!' });
    }

    if (query.data === 'participants_done') {
        if (!userState.data.participants || userState.data.participants.length === 0) {
            return bot.answerCallbackQuery(query.id, { text: 'Select at least one participant.' });
        }
        // Save the expense
        try {
            let groupExpense = await GroupExpense.findOne({ chatId: userState.data.groupChatId });
            if (!groupExpense) {
                groupExpense = new GroupExpense({ chatId: userState.data.groupChatId, expenses: [] });
            }
            groupExpense.expenses.push(userState.data);
            await groupExpense.save();
            userStates.delete(stateKey);
            await bot.sendMessage(userId, 'Expense saved successfully!');
            await bot.sendMessage(userState.data.groupChatId, `A new expense was added! $${userState.data.amount} - ${userState.data.description}`);
            return bot.answerCallbackQuery(query.id, { text: 'Expense saved!' });
        } catch (error) {
            console.error('Error saving expense:', error);
            await bot.sendMessage(userId, 'Error saving expense. Please try again.');
            return bot.answerCallbackQuery(query.id, { text: 'Error saving expense.' });
        }
    }
};

module.exports = {
    startExpenseFlow,
    handleExpenseInput,
    handleCallbackQuery
};
