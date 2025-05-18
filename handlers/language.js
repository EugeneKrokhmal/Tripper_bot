const User = require('../models/User');

async function showLanguageSelection(bot, msg, t, languageNames) {
    const user = await User.findOne({ userId: msg.from.id });
    const currentLang = user?.language || 'en';

    const keyboard = {
        inline_keyboard: Object.entries(languageNames).map(([code, name]) => [{
            text: `${name} ${code === currentLang ? '✓' : ''}`,
            callback_data: `lang_${code}`
        }])
    };

    await bot.sendMessage(msg.from.id, t('select_language'), { reply_markup: keyboard });
}

module.exports = { showLanguageSelection };
