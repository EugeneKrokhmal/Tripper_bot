const mongoose = require('mongoose');

/**
 * Schema for user preferences and settings
 * @typedef {Object} UserSchema
 * @property {number} userId - Telegram user ID
 * @property {string} username - Telegram username
 * @property {string} firstName - User's first name
 * @property {string} language - User's preferred language (default: 'en')
 * @property {string} currency - User's preferred currency (default: 'usd')
 * @property {Date} createdAt - When the user was created
 * @property {Date} updatedAt - When the user was last updated
 */
const userSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    unique: true
  },
  username: String,
  firstName: String,
  language: {
    type: String,
    default: 'en'
  },
  currency: {
    type: String,
    default: 'usd'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', userSchema);
