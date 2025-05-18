/**
 * Formats a group name with premium status indicator
 * @param {Object} group - The group object
 * @param {Function} t - Translation function
 * @returns {string} Formatted group name with premium status
 */
function formatGroupName(group, t) {
    return `${group.groupName || t('group_id', { id: group.chatId })}${group.premium ? ' ⭐️' : ''}`;
}

module.exports = { formatGroupName };
