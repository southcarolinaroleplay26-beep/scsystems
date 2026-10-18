async function sendPunishmentNotice(user, payload) {
    try {
        await user.send(payload);
        return { sent: true };
    } catch (error) {
        if (error.code === 50007) {
            return { sent: false, reason: "closed" };
        }
        console.error(`Failed to DM punishment notice to ${user.id}:`, error);
        return { sent: false, reason: "failed" };
    }
}

module.exports = { sendPunishmentNotice };
