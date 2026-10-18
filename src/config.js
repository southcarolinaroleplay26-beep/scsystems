require("dotenv").config();

const ticketStaffRoleId = process.env.TICKET_STAFF_ROLE_ID || "1532111365370806333";

const config = Object.freeze({
    token: process.env.BOT_TOKEN || "",
    guildId: process.env.DISCORD_GUILD_ID || "",
    moderatorRoleId: process.env.MODERATOR_ROLE_ID || "",
    staffRoleId: process.env.STAFF_ROLE_ID || "",
    memberRoleId: process.env.MEMBER_ROLE_ID || "",
    sessionNotificationRoleId: process.env.SESSION_NOTIFICATION_ROLE_ID || "",
    announcementChannelId: process.env.ANNOUNCEMENT_CHANNEL_ID || "",
    sessionChannelId: process.env.SESSION_CHANNEL_ID || "",
    punishmentChannelId: process.env.PUNISHMENT_CHANNEL_ID || "",
    reducedActivityRoleId: process.env.RA_ROLE_ID || "",
    reducedActivityChannelId: process.env.RA_REQUEST_CHANNEL_ID || "1561239693344120893",
    hiringAnnouncementChannelId: process.env.HIRING_ANNOUNCEMENT_CHANNEL_ID || "1530781043479543918",
    applicationsChannelUrl: process.env.APPLICATIONS_CHANNEL_URL
        || "https://discord.com/channels/1530706479349502003/1530712619860627647",
    ticketStaffRoleId,
    ticketTypes: Object.freeze({
        "general-support": Object.freeze({
            label: "General Support",
            description: "Get help from the Support Team.",
            categoryId: "1532112428324884731",
            roleIds: Object.freeze([ticketStaffRoleId])
        }),
        "community-support": Object.freeze({
            label: "Community Support",
            description: "Get help with the community.",
            categoryId: "1532112366202912839",
            roleIds: Object.freeze(["1551098535427047455", "1551098623696306206"])
        }),
        "staff-report": Object.freeze({
            label: "Staff Report",
            description: "Privately report a staff-related concern.",
            categoryId: "1532112504929648843",
            roleIds: Object.freeze(["1530786131292197004"])
        }),
        partnership: Object.freeze({
            label: "Partnership",
            description: "Ask about a server partnership.",
            categoryId: "1532112647607029970",
            roleIds: Object.freeze(["1551098535427047455"])
        })
    }),
    ticketLogChannelId: process.env.TICKET_LOG_CHANNEL_ID || "",
    shopUrl: process.env.SHOP_URL || "",
    joinServerUrl: process.env.JOIN_SERVER_URL || "",
    serverName: process.env.SERVER_NAME || "South Carolina State Roleplay | VC Only",
    serverMode: process.env.SERVER_MODE || "VC Only",
    inGameCode: process.env.IN_GAME_CODE || "RichlandSC",
    serverOwner: process.env.SERVER_OWNER || "boogs0522",
    selfRoles: (process.env.SELF_ROLES || "")
        .split(",")
        .map((entry) => {
            const [id, ...labelParts] = entry.split(":");
            return { id: id?.trim(), label: labelParts.join(":").trim() };
        })
        .filter((role) => role.id && role.label)
});

module.exports = config;
