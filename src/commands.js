const {
    ChannelType,
    SlashCommandBuilder
} = require("discord.js");

const user = (name = "member", description = "Choose a server member.", required = true) =>
    (option) => option.setName(name).setDescription(description).setRequired(required);
const text = (name, description, required = true, maxLength = 1000) =>
    (option) => option.setName(name).setDescription(description).setRequired(required).setMaxLength(maxLength);
const role = (name = "role", description = "Choose a role.", required = true) =>
    (option) => option.setName(name).setDescription(description).setRequired(required);
const channel = (name = "channel", description = "Choose a text channel.") =>
    (option) => option.setName(name).setDescription(description)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
const command = (name, description) => new SlashCommandBuilder().setName(name).setDescription(description);

const commands = [
    command("help", "Show bot commands and setup guidance."),
    command("ping", "Check the bot connection."),
    command("serverinfo", "Show the South Carolina roleplay server details."),
    command("add", "Add a member or role to the current support ticket.")
        .addUserOption(user("member", "Member to add.", false))
        .addRoleOption(role("role", "Role to add.", false)),
    command("remove", "Remove a member or role from the current support ticket.")
        .addUserOption(user("member", "Member to remove.", false))
        .addRoleOption(role("role", "Role to remove.", false)),
    command("claim", "Claim the current support ticket."),
    command("close", "Close the current support ticket and save its transcript."),
    command("ticket-panel", "Post the support ticket panel.")
        .addChannelOption(channel()),
    command("appeal", "Appeal one of your staff punishments.")
        .addStringOption(text("infraction_id", "ID of the punishment to appeal.", true, 40))
        .addStringOption(text("reason", "Explain why you are appealing.", true, 1000)),
    command("ban", "Ban a Discord user from every server this bot can moderate.")
        .addStringOption(text("user_id", "Discord user ID to ban.", true, 25))
        .addStringOption(text("reason", "Reason for the global ban.", true, 500)),
    command("unban", "Unban a Discord user from every server this bot can moderate.")
        .addStringOption(text("user_id", "Discord user ID to unban.", true, 25))
        .addStringOption(text("reason", "Reason for the global unban.", false, 500)),
    command("interview-pass", "Pass an interview and assign the staff role.")
        .addUserOption(user())
        .addRoleOption(role("role", "Staff role to assign.", false)),
    command("my-punishments", "View your own staff punishment history."),
    command("punish", "Issue a staff punishment.")
        .addUserOption(user())
        .addStringOption((option) => option.setName("type").setDescription("Punishment type.")
            .setRequired(true).addChoices(
                { name: "Warning", value: "Warning" },
                { name: "Strike", value: "Strike" },
                { name: "Suspension", value: "Suspension" },
                { name: "Termination", value: "Termination" }
            ))
        .addStringOption(text("reason", "Reason for the punishment.", true, 1000))
        .addStringOption(text("expiration", "Expiration date or 'Never'.", false, 100)),
    command("punishment-edit", "Edit an existing punishment.")
        .addStringOption(text("infraction_id", "ID of the punishment.", true, 40))
        .addStringOption(text("type", "Replacement punishment type.", false, 100))
        .addStringOption(text("reason", "Replacement reason.", false, 1000)),
    command("punishment-history", "View a staff member's punishment history.")
        .addUserOption(user()),
    command("punishment-void", "Void an existing punishment.")
        .addStringOption(text("infraction_id", "ID of the punishment to void.", true, 40))
        .addStringOption(text("reason", "Reason the record is voided.", true, 500)),
    command("queue-add", "Add a member to the advertising queue.")
        .addUserOption(user())
        .addStringOption(text("note", "Optional queue note.", false, 300)),
    command("queue-remove", "Remove a member from the advertising queue.")
        .addUserOption(user()),
    command("ra", "Request Reduced Activity.")
        .addStringOption(text("reason", "Reason for your request.", true, 1000))
        .addStringOption(text("until", "Expected return date.", false, 100)),
    command("request-ra", "Request Reduced Activity.")
        .addStringOption(text("reason", "Reason for your request.", true, 1000))
        .addStringOption(text("until", "Expected return date.", false, 100)),
    command("ra-admin", "End a staff member's active Reduced Activity.")
        .addUserOption(user())
        .addStringOption(text("reason", "Reason for ending Reduced Activity.", false, 500)),
    command("reinstate", "Reinstate a former staff member at a selected rank.")
        .addUserOption(user())
        .addRoleOption(role("rank", "Role representing the rank to assign.")),
    command("resign", "Announce your resignation and remove your staff role.")
        .addStringOption(text("reason", "Optional resignation message.", false, 500)),
    command("say", "Send a message through the bot in this channel.")
        .addStringOption(text("message", "Message to send.", true, 1800)),
    command("self-roles", "Post a self-service role selection panel."),
    command("session-end", "End the current South Carolina roleplay session."),
    command("session-low", "Post a low-player session announcement."),
    command("session-start", "Start a South Carolina roleplay session."),
    command("shop", "Post the configured server shop panel."),
    command("staff-accept", "Accept a staff application and assign the staff role.")
        .addUserOption(user())
        .addRoleOption(role("role", "Staff role to assign.", false)),
    command("staff-deny", "Deny a staff application and notify the applicant.")
        .addUserOption(user())
        .addStringOption(text("reason", "Reason or feedback for the applicant.", true, 1000)),
    command("suspension-view", "View or end active staff suspensions.")
        .addStringOption((option) => option.setName("action").setDescription("View records or end a suspension.")
            .setRequired(false).addChoices(
                { name: "View active suspensions", value: "view" },
                { name: "End a suspension", value: "end" }
            ))
        .addStringOption(text("infraction_id", "Suspension record ID when ending one.", false, 40))
        .addUserOption(user("member", "Filter the list to a staff member.", false)),
    command("tweet", "Post a roleplay tweet in this channel.")
        .addStringOption(text("message", "Tweet text.", true, 1000))
        .addStringOption(text("author", "Display name for the poster.", false, 80)),
    command("twitter", "Post a roleplay tweet in this channel.")
        .addStringOption(text("message", "Tweet text.", true, 1000))
        .addStringOption(text("author", "Display name for the poster.", false, 80)),
    command("wl-session-end", "End the current whitelist session."),
    command("wl-session-start", "Start a whitelist session.")
];

module.exports = commands.map((entry) => entry.toJSON());
