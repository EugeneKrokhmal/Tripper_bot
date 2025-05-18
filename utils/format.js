function formatGroupName(group, t) {
    return `${group.groupName || t('group_id', { id: group.chatId })}${group.premium ? ' ⭐️' : ''}`;
}

module.exports = { formatGroupName };
