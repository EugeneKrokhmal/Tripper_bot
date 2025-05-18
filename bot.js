require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const connectDB = require('./db');
const ExpenseHandler = require('./handlers/expense');
const { calculateDebts } = require('./handlers/calculate');
const { showHistory } = require('./handlers/history');
const { editExpense, handleEditCallback } = require('./handlers/edit');
const { clearExpenses, handleClearCallback } = require('./handlers/clear');
const { settleDebt, handleSettleCallback, handleSettleMessage } = require('./handlers/settle');
const { handleEditMessage } = require('./handlers/edit');
const GroupExpense = require('./models/GroupExpense');
const User = require('./models/User');
const cron = require('node-cron');
const { sendDailyReminders } = require('./handlers/remind');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const path = require('path');

// Initialize language support
const languageNames = {
    en: '🇬🇧 English',
    uk: '🇺🇦 Ukrainian',
    be: '🇧🇾 Belarusian',
    hi: '🇮🇳 Hindi',
    id: '🇮🇩 Indonesian',
    es: '🇪🇸 Spanish',
    pt: '🇵🇹 Portuguese',
    he: '🇮🇱 עברית'
};

i18next.use(Backend).init({
    lng: 'en',
    fallbackLng: 'en',
    preload: ['en', 'uk', 'be', 'hi', 'id', 'es', 'pt', 'he'],
    backend: {
        loadPath: path.join(__dirname, 'locales/{{lng}}/translation.json')
    },
    ns: ['translation'],
    defaultNS: 'translation'
});

// Initialize bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Initialize handlers
const expenseHandler = new ExpenseHandler(bot);

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
    { command: 'settle', description: 'Mark a debt as settled' },
    { command: 'language', description: 'Change language' }
], { scope: { type: 'all_private_chats' } });

// Command handlers
async function getT(msgOrQuery, userId) {
    const id = userId || msgOrQuery.from?.id;
    try {
        let user = await User.findOne({ userId: id });
        if (!user) {
            user = await User.findOneAndUpdate(
                { userId: id },
                {
                    userId: id,
                    username: msgOrQuery.from?.username,
                    firstName: msgOrQuery.from?.first_name,
                    language: msgOrQuery.from?.language_code || 'en'
                },
                { upsert: true, new: true }
            );
        }
        return i18next.getFixedT(user.language);
    } catch (error) {
        console.error('Error getting user language:', error);
        return i18next.getFixedT('en');
    }
}

bot.onText(/\/pay/, (msg) => expenseHandler.startExpenseFlow(msg));
bot.onText(/\/edit/, async (msg) => {
    const t = await getT(msg);
    editExpense(bot, msg, t);
});
bot.onText(/\/debts/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, t('group_only'));
    }
    calculateDebts(bot, msg, t);
});
bot.onText(/\/history/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, t('group_only'));
    }
    showHistory(bot, msg, t);
});
bot.onText(/\/clear/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, t('group_only'));
    }
    clearExpenses(bot, msg, t);
});
bot.onText(/\/settle/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type !== 'private') {
        return bot.sendMessage(msg.chat.id, t('private_only'));
    }
    settleDebt(bot, msg, t);
});

bot.onText(/\/language/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, t('group_only'));
    }
    showLanguageSelection(bot, msg, t);
});

bot.onText(/\/syncmembers/, async (msg) => {
    const t = await getT(msg);
    if (msg.chat.type === 'private') {
        return bot.sendMessage(msg.chat.id, t('group_only'));
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
                await bot.sendMessage(chatId, t('synced_admins'));
            } else {
                await bot.sendMessage(chatId, t('no_new_admins'));
            }
        } catch (err) {
            console.error('Error syncing members:', err);
            await bot.sendMessage(chatId, t('error_syncing_members'));
        }
    })();
});

// Handle callback queries (inline keyboard buttons)
bot.on('callback_query', async (query) => {
    const t = await getT(query, query.from.id);
    if (query.data && query.data.startsWith('lang_')) {
        const lang = query.data.replace('lang_', '');
        try {
            await User.findOneAndUpdate(
                { userId: query.from.id },
                { 
                    $set: { 
                        language: lang,
                        username: query.from.username,
                        firstName: query.from.first_name
                    }
                },
                { upsert: true }
            );
            
            const t = i18next.getFixedT(lang);
            const langName = languageNames[lang] || lang;
            
            await bot.answerCallbackQuery(query.id, { text: t('language_updated') });
            await bot.sendMessage(query.message.chat.id, t('language_set', { lang: langName }));
            
            // Update the language selection message
            const keyboard = {
                inline_keyboard: Object.entries(languageNames).map(([code, name]) => [{
                    text: `${name} ${code === lang ? '✓' : ''}`,
                    callback_data: `lang_${code}`
                }])
            };
            
            await bot.editMessageReplyMarkup(keyboard, {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id
            });
        } catch (error) {
            console.error('Error updating user language:', error);
            const t = i18next.getFixedT('en');
            await bot.answerCallbackQuery(query.id, { text: t('error_updating_language') });
        }
    } else {
        expenseHandler.handleCallbackQuery(query);
        handleClearCallback(bot, query, t);
        handleEditCallback(bot, query, t);
        handleSettleCallback(bot, query, t);
    }
});

// Handle text messages (for expense flow)
bot.on('message', async (msg) => {
    const t = await getT(msg, msg.from?.id);
    if (msg.text && !msg.text.startsWith('/')) {
        expenseHandler.handleExpenseInput(msg);
        handleEditMessage(bot, msg, t);
        handleSettleMessage(bot, msg, t);
    }
});

// Track new members
bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id;
    try {
        let groupExpense = await GroupExpense.findOne({ chatId });
        if (!groupExpense) {
            groupExpense = new GroupExpense({ chatId, expenses: [], members: [] });
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

// Schedule daily reminders
cron.schedule('0 9 * * *', () => {
    sendDailyReminders(bot, i18next.getFixedT('en'));
});

bot.onText(/\/language/, async (msg) => {
    const chatId = msg.chat.id;
    const t = await getT(msg);
    
    try {
        const user = await User.findOne({ userId: msg.from.id });
        const currentLang = user?.language || 'en';
        
        const keyboard = {
            inline_keyboard: Object.entries(languageNames).map(([code, name]) => [{
                text: `${name} ${code === currentLang ? '✓' : ''}`,
                callback_data: `lang_${code}`
            }])
        };
        
        await bot.sendMessage(chatId, t('select_language'), { reply_markup: keyboard });
    } catch (error) {
        console.error('Error showing language selection:', error);
        await bot.sendMessage(chatId, t('error_showing_languages'));
    }
});
