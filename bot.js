require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./db');
const { startExpenseFlow, handleExpenseInput, handleCallbackQuery } = require('./handlers/expense');
const { calculateDebts } = require('./handlers/calculate');
const { showHistory } = require('./handlers/history');
const { editExpense, handleEditCallback } = require('./handlers/edit');
const { clearExpenses, handleClearCallback } = require('./handlers/clear');
const { settleDebt, handleSettleCallback, handleSettleMessage } = require('./handlers/settle');
const { handleEditMessage } = require('./handlers/edit');
const GroupExpense = require('./models/GroupExpense');

// Initialize bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Connect to MongoDB
connectDB();

// Group commands
bot.setMyCommands([
    { command: 'pay', description: 'Add an expense' },
    { command: 'debts', description: 'Show who owes whom' },
    { command: 'history', description: 'Show expense history' },
    { command: 'clear', description: 'Clear all expenses' },
    { command: 'syncmembers', description: 'Sync current admins to the group member list' }
], { scope: { type: 'all_group_chats' } });

// Private commands
bot.setMyCommands([
    { command: 'pay', description: 'Add an expense' },
    { command: 'edit', description: 'Edit your expenses' },
    { command: 'settle', description: 'Mark a debt as settled' }
], { scope: { type: 'all_private_chats' } });

// Command handlers
bot.onText(/\/pay/, (msg) => startExpenseFlow(bot, msg));
bot.onText(/\/edit/, (msg) => editExpense(bot, msg));
bot.onText(/\/debts/, (msg) => {
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, 'This command can only be used in a group chat.');
    }
    calculateDebts(bot, msg);
});
bot.onText(/\/history/, (msg) => {
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, 'This command can only be used in a group chat.');
    }
    showHistory(bot, msg);
});
bot.onText(/\/clear/, (msg) => {
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, 'This command can only be used in a group chat.');
    }
    clearExpenses(bot, msg);
});
bot.onText(/\/settle/, (msg) => {
    if (msg.chat.type !== 'private') {
        return bot.sendMessage(msg.chat.id, 'This command can only be used in a private chat with the bot.');
    }
    settleDebt(bot, msg);
});
bot.onText(/\/syncmembers/, (msg) => {
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, 'This command can only be used in a group chat.');
    }
    (async () => {
        const chatId = msg.chat.id;
        const groupName = msg.chat.title || '';
        try {
            const admins = await bot.getChatAdministrators(chatId);
            let groupExpense = await GroupExpense.findOne({ chatId });
            if (!groupExpense) {
                groupExpense = new GroupExpense({ chatId, groupName, expenses: [], members: [] });
            } else if (groupExpense.groupName !== groupName) {
                groupExpense.groupName = groupName;
            }
            let updated = false;
            for (const admin of admins) {
                if (!groupExpense.members.some(m => m.userId === admin.user.id)) {
                    groupExpense.members.push({
                        userId: admin.user.id,
                        username: admin.user.username || '',
                        firstName: admin.user.first_name || ''
                    });
                    updated = true;
                }
            }
            if (updated) {
                await groupExpense.save();
                await bot.sendMessage(chatId, 'Synced admins to group member list.');
            } else {
                await bot.sendMessage(chatId, 'No new admins to sync.');
            }
        } catch (err) {
            console.error('Error syncing members:', err);
            await bot.sendMessage(chatId, 'Error syncing members.');
        }
    })();
});

// Handle callback queries (inline keyboard buttons)
bot.on('callback_query', (query) => {
    handleCallbackQuery(bot, query);
    handleClearCallback(bot, query);
    handleEditCallback(bot, query);
    handleSettleCallback(bot, query);
});

// Handle text messages (for expense flow)
bot.on('message', (msg) => {
    console.log('Received message:', msg.text, msg.from.id, msg.chat.id);
    if (msg.text && !msg.text.startsWith('/')) {
        handleEditMessage(bot, msg);
        handleSettleMessage(bot, msg);
        handleExpenseInput(bot, msg);
    }
});

// Track new members
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    const groupName = msg.chat.title || '';
    try {
        let groupExpense = await GroupExpense.findOne({ chatId });
        if (!groupExpense) {
            groupExpense = new GroupExpense({ chatId, groupName, expenses: [], members: [] });
        } else if (groupExpense.groupName !== groupName) {
            groupExpense.groupName = groupName;
        }
        let updated = false;
        for (const user of msg.new_chat_members) {
            if (!groupExpense.members.some(m => m.userId === user.id)) {
                groupExpense.members.push({
                    userId: user.id,
                    username: user.username || '',
                    firstName: user.first_name || ''
                });
                updated = true;
            }
        }
        if (updated) await groupExpense.save();
    } catch (err) {
        console.error('Error tracking new member:', err);
    }
});

// Track member leaving
bot.on('left_chat_member', async (msg) => {
    const chatId = msg.chat.id;
    try {
        let groupExpense = await GroupExpense.findOne({ chatId });
        if (!groupExpense) return;
        groupExpense.members = groupExpense.members.filter(m => m.userId !== msg.left_chat_member.id);
        await groupExpense.save();
    } catch (err) {
        console.error('Error removing member:', err);
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

console.log('Tripper bot is running...');
