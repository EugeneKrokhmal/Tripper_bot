const { showLanguageSelection } = require('../handlers/language');

module.exports = (bot) => async (msg, t, languageNames) => {
    showLanguageSelection(bot, msg, t, languageNames);
};
