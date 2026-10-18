const {
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    Client,
    GatewayIntentBits,
    MessageFlags,
    PermissionFlagsBits,
    ActivityType
} = require("discord.js");
const config = require("./src/config");
const commands = require("./src/commands");
const store = require("./src/store");
const { sendPunishmentNotice } = require("./src/notifications");
const {
    ephemeral,
    panelPayload,
    punishmentPanel,
    recordsPanel,
    selfRolePanelPayload,
    reducedActivityRequestPanel,
    hiringAnnouncementPanel,
    sessionPanel,
    ticketPanelPayload,
    ticketFaqPayload,
    ticketWelcomePayload
} = require("./src/embeds");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const ephemeralFlags = {
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
};
const HIRING_ANNOUNCEMENT_INTERVAL_MS = 3 * 60 * 60 * 1000;

async function postHiringAnnouncement() {
    const channel = await client.channels.fetch(config.hiringAnnouncementChannelId);
    if (!getTextChannel(channel) || channel.guildId !== config.guildId) {
        throw new Error("The configured hiring announcement channel is unavailable or is not a text channel in this server.");
    }
    await channel.send(hiringAnnouncementPanel());
    console.log(`Hiring announcement posted in channel ${channel.id}.`);
}

function hasRole(member, roleId) {
    if (!roleId) return false;
    const roles = member?.roles;
    return Array.isArray(roles) ? roles.includes(roleId) : Boolean(roles?.cache?.has(roleId));
}

function isModerator(interaction) {
    return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
        || hasRole(interaction.member, config.moderatorRoleId));
}

function isTicketStaff(interaction) {
    if (isModerator(interaction)) return true;
    const ticketType = interaction.channel?.topic?.match(/(?:^|;)ticket-type:([a-z-]+)(?:;|$)/)?.[1];
    const roleIds = config.ticketTypes[ticketType]?.roleIds
        || [config.ticketStaffRoleId].filter(Boolean);
    return roleIds.some((roleId) => hasRole(interaction.member, roleId));
}

function requireModerator(interaction) {
    if (!isModerator(interaction)) throw new Error("This command requires Administrator permission or the configured moderator role.");
}

function getTextChannel(channel) {
    return channel && channel.isTextBased() && "send" in channel;
}

async function getConfiguredOrCurrentChannel(interaction, channelId, settingName) {
    const channel = channelId
        ? await client.channels.fetch(channelId)
        : interaction.channel;
    if (!getTextChannel(channel) || channel.guildId !== config.guildId) {
        throw new Error(`${settingName} is unavailable. Configure a text channel ID in .env or run this command in a text channel.`);
    }
    return channel;
}

function ticketOwnerId(channel) {
    const match = channel?.topic?.match(/(?:^|;)ticket-owner:(\d{17,20})(?:;|$)/);
    return match?.[1] || null;
}

function requireTicketChannel(channel) {
    const ownerId = ticketOwnerId(channel);
    if (!ownerId) throw new Error("This command can only be used in a bot-created support ticket.");
    return ownerId;
}

async function createTicket(guild, user, typeKey) {
    const ticketType = config.ticketTypes[typeKey];
    if (!ticketType) throw new Error("Choose one of the available ticket types.");
    const channels = await guild.channels.fetch();
    const existing = channels.find((channel) => ticketOwnerId(channel) === user.id);
    if (existing) return { channel: existing, created: false };

    const category = await guild.channels.fetch(ticketType.categoryId);
    if (!category || category.type !== ChannelType.GuildCategory || category.guildId !== guild.id) {
        throw new Error(`The configured ${ticketType.label} ticket category is unavailable or invalid.`);
    }
    for (const roleId of ticketType.roleIds) {
        const role = await guild.roles.fetch(roleId);
        if (!role) throw new Error(`The configured ${ticketType.label} team role ${roleId} was not found.`);
    }

    const me = await guild.members.fetchMe();
    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: user.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
            ]
        },
        {
            id: me.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.AttachFiles
            ]
        }
    ];
    for (const roleId of ticketType.roleIds) {
        overwrites.push({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
            ]
        });
    }

    const ticket = await guild.channels.create({
        name: `ticket-${typeKey}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90),
        type: ChannelType.GuildText,
        topic: `ticket-owner:${user.id};ticket-type:${typeKey}`,
        parent: category.id,
        permissionOverwrites: overwrites,
        reason: `Support ticket opened by ${user.tag}`
    });
    try {
        await ticket.send(ticketWelcomePayload(user.id, ticketType));
    } catch (error) {
        await ticket.delete("Ticket setup failed").catch((deleteError) => {
            console.error("Could not remove incomplete ticket:", deleteError);
        });
        throw error;
    }
    return { channel: ticket, created: true };
}

async function closeTicket(channel, member, interaction) {
    const ownerId = requireTicketChannel(channel);
    if (member.id !== ownerId && !isTicketStaff(interaction)) {
        throw new Error("Only the ticket owner or support staff can close this ticket.");
    }
    if (!config.ticketLogChannelId) {
        throw new Error("Ticket transcripts are enabled, but TICKET_LOG_CHANNEL_ID is not configured. The ticket was not deleted.");
    }
    const logChannel = await client.channels.fetch(config.ticketLogChannelId);
    if (!getTextChannel(logChannel) || logChannel.guildId !== config.guildId) {
        throw new Error("The configured ticket log channel is unavailable. The ticket was not deleted.");
    }

    let before;
    let messages = [];
    for (let page = 0; page < 50; page += 1) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        if (batch.size === 0) break;
        messages = messages.concat([...batch.values()]);
        before = batch.last().id;
        if (batch.size < 100) break;
    }
    const transcript = messages
        .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
        .map((message) => {
            const body = message.content || "";
            const attachments = [...message.attachments.values()].map((file) => file.url).join(" ");
            return `[${new Date(message.createdTimestamp).toISOString()}] ${message.author.tag}: ${body}${attachments ? ` ${attachments}` : ""}`;
        })
        .join("\n")
        .slice(0, 7_500_000);
    const filename = `${channel.name}-transcript.txt`;
    await logChannel.send(panelPayload(
        "Support Ticket Closed",
        `**Channel:** #${channel.name}\n**Opened by:** <@${ownerId}>\n**Closed by:** <@${member.id}>`,
        {
            files: [new AttachmentBuilder(Buffer.from(transcript || "(No messages recorded.)", "utf8"), { name: filename })],
            allowedMentions: { parse: [] }
        }
    ));
    await channel.delete(`Ticket closed by ${member.user?.tag || member.tag || member.id}`);
}

function formatHistory(records) {
    return records.sort((left, right) => right.issuedAt - left.issuedAt);
}

async function publishPunishment(interaction, record) {
    const channel = await getConfiguredOrCurrentChannel(interaction, config.punishmentChannelId, "PUNISHMENT_CHANNEL_ID");
    const message = await channel.send(punishmentPanel(record, { pingTarget: true }));
    store.update((state) => {
        const stored = state.punishments.find((entry) => entry.id === record.id);
        if (stored) Object.assign(stored, { channelId: channel.id, messageId: message.id });
    });
}

async function syncPunishment(record) {
    if (!record.channelId || !record.messageId) return false;
    const channel = await client.channels.fetch(record.channelId);
    if (!getTextChannel(channel)) return false;
    const message = await channel.messages.fetch(record.messageId).catch((error) => {
        if (error.code === 10008) return null;
        throw error;
    });
    if (!message) return false;
    await message.edit({
        ...punishmentPanel(record),
        content: null,
        embeds: []
    });
    return true;
}

function requireSnowflake(id) {
    if (!/^\d{17,20}$/.test(id)) throw new Error("Enter a valid Discord user ID.");
}

async function runGlobalBan(userId, reason, ban) {
    requireSnowflake(userId);
    const results = { succeeded: [], failed: [] };
    for (const guild of client.guilds.cache.values()) {
        try {
            const me = await guild.members.fetchMe();
            if (!me.permissions.has(PermissionFlagsBits.BanMembers)) {
                throw new Error("Bot lacks Ban Members permission.");
            }
            if (ban) {
                await guild.members.ban(userId, { reason });
            } else {
                await guild.bans.remove(userId, reason);
            }
            results.succeeded.push(guild.name);
        } catch (error) {
            if (!ban && error.code === 10026) continue;
            results.failed.push(`${guild.name}: ${error.message}`);
        }
    }
    return results;
}

async function handlePunishment(interaction) {
    if (interaction.commandName !== "my-punishments") requireModerator(interaction);
    const state = store.load();
    const name = interaction.commandName;

    if (name === "my-punishments" || name === "punishment-history") {
        const memberId = name === "my-punishments"
            ? interaction.user.id
            : interaction.options.getUser("member", true).id;
        const records = formatHistory(state.punishments.filter((entry) => entry.memberId === memberId));
        return interaction.editReply(recordsPanel(
            name === "my-punishments" ? "My Punishments" : "Punishment History",
            memberId,
            records
        ));
    }

    if (name === "punish") {
        const member = interaction.options.getUser("member", true);
        const record = {
            id: store.createId("SC"),
            memberId: member.id,
            memberName: member.username,
            issuedBy: interaction.user.id,
            issuedAt: Date.now(),
            type: interaction.options.getString("type", true),
            reason: interaction.options.getString("reason", true).trim(),
            expiration: interaction.options.getString("expiration")?.trim() || "Never",
            voided: false,
            appeals: []
        };
        store.update((data) => data.punishments.push(record));
        try {
            await publishPunishment(interaction, record);
        } catch (error) {
            store.update((data) => {
                data.punishments = data.punishments.filter((entry) => entry.id !== record.id);
            });
            throw error;
        }
        const notification = await sendPunishmentNotice(member, punishmentPanel(record));
        const dmStatus = notification.sent
            ? "A DM with the punishment details was sent."
            : notification.reason === "closed"
                ? "They have DMs closed, so the punishment was recorded but the DM could not be delivered."
                : "The punishment was recorded, but the DM failed to send; check the bot log.";
        return interaction.editReply(ephemeral(
            `Punishment recorded for <@${member.id}>. Infraction ID: \`${record.id}\`. ${dmStatus}`
        ));
    }

    const id = interaction.options.getString("infraction_id", true).trim().toUpperCase();
    const record = state.punishments.find((entry) => entry.id === id);
    if (!record) throw new Error(`No punishment was found with ID \`${id}\`.`);

    if (name === "punishment-edit") {
        const type = interaction.options.getString("type")?.trim();
        const reason = interaction.options.getString("reason")?.trim();
        if (!type && !reason) throw new Error("Provide a replacement type, reason, or both.");
        const updated = {
            ...record,
            ...(type ? { type } : {}),
            ...(reason ? { reason } : {}),
            updatedAt: Date.now()
        };
        if (!await syncPunishment(updated)) {
            throw new Error("The original punishment post could not be found. The record was not changed.");
        }
        store.update((data) => {
            const index = data.punishments.findIndex((entry) => entry.id === id);
            data.punishments[index] = updated;
        });
        return interaction.editReply(ephemeral(`Punishment \`${id}\` updated.`));
    }

    if (record.voided) throw new Error(`Punishment \`${id}\` is already voided.`);
    const updated = {
        ...record,
        voided: true,
        voidReason: interaction.options.getString("reason", true).trim(),
        updatedAt: Date.now()
    };
    if (!await syncPunishment(updated)) {
        throw new Error("The original punishment post could not be found. The record was not voided.");
    }
    store.update((data) => {
        const index = data.punishments.findIndex((entry) => entry.id === id);
        data.punishments[index] = updated;
    });
    return interaction.editReply(ephemeral(`Punishment \`${id}\` has been voided.`));
}

async function handleAppeal(interaction) {
    const id = interaction.options.getString("infraction_id", true).trim().toUpperCase();
    const reason = interaction.options.getString("reason", true).trim();
    let appealRecord;
    let appealError;
    store.update((state) => {
        appealRecord = state.punishments.find((entry) => entry.id === id);
        if (!appealRecord) return;
        if (appealRecord.memberId !== interaction.user.id) {
            appealError = "You can only appeal your own punishment.";
            return;
        }
        if (appealRecord.voided) {
            appealError = "A voided punishment cannot be appealed.";
            return;
        }
        if (!Array.isArray(appealRecord.appeals)) appealRecord.appeals = [];
        if (appealRecord.appeals.some((appeal) => appeal.status === "Pending")) {
            appealError = "You already have a pending appeal for this punishment.";
            return;
        }
        appealRecord.appeals.push({
            reason,
            status: "Pending",
            submittedAt: Date.now()
        });
    });
    if (!appealRecord) throw new Error(`No punishment was found with ID \`${id}\`.`);
    if (appealError) throw new Error(appealError);
    const updated = await syncPunishment(appealRecord);
    return interaction.editReply(ephemeral(
        updated
            ? `Your appeal for \`${id}\` has been recorded for staff review.`
            : `Your appeal for \`${id}\` has been recorded, but the original punishment post could not be updated.`
    ));
}

async function handleTicketCommand(interaction) {
    const name = interaction.commandName;
    if (name === "ticket-panel") {
        requireModerator(interaction);
        const channel = interaction.options.getChannel("channel") || interaction.channel;
        if (!getTextChannel(channel) || channel.guildId !== config.guildId) {
            throw new Error("Choose a text channel in this server.");
        }
        await channel.send(ticketPanelPayload());
        return interaction.editReply(ephemeral(`Ticket panel posted in <#${channel.id}>.`));
    }
    if (name === "claim") {
        requireTicketChannel(interaction.channel);
        if (!isTicketStaff(interaction)) throw new Error("Only support staff can claim a ticket.");
        if (interaction.channel.topic.includes(";claimed:")) throw new Error("This ticket has already been claimed.");
        await interaction.channel.setTopic(`${interaction.channel.topic};claimed:${interaction.user.id}`);
        return interaction.editReply(ephemeral(`Ticket claimed by <@${interaction.user.id}>.`));
    }
    if (name === "close") {
        await closeTicket(interaction.channel, interaction.member, interaction);
        return interaction.editReply(ephemeral("Ticket closed. Its transcript was saved to the staff log."));
    }
    const ownerId = requireTicketChannel(interaction.channel);
    if (!isTicketStaff(interaction) && interaction.user.id !== ownerId) {
        throw new Error("Only the ticket owner or support staff can manage ticket access.");
    }
    const member = interaction.options.getUser("member");
    const role = interaction.options.getRole("role");
    if (Boolean(member) === Boolean(role)) {
        throw new Error("Choose exactly one member or role.");
    }
    if (name === "remove" && member?.id === ownerId) {
        throw new Error("The ticket owner cannot be removed from their own ticket.");
    }
    const target = member ? member.id : role.id;
    await interaction.channel.permissionOverwrites.edit(target, name === "add"
        ? { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }
        : { ViewChannel: false });
    return interaction.editReply(ephemeral(`${member ? `<@${member.id}>` : `<@&${role.id}>`} ${name === "add" ? "added to" : "removed from"} this ticket.`));
}

async function handleSession(interaction) {
    requireModerator(interaction);
    const state = store.load();
    const kind = interaction.commandName.startsWith("wl-") ? "whitelist" : "regular";
    const current = state.sessions[kind];
    const starting = interaction.commandName.endsWith("start");
    const ending = interaction.commandName.endsWith("end");
    const channel = await getConfiguredOrCurrentChannel(
        interaction,
        config.sessionChannelId || config.announcementChannelId,
        "SESSION_CHANNEL_ID"
    );

    if (starting && current?.active) throw new Error("A session is already active.");
    if (ending && !current?.active) throw new Error("There is no active session to end.");
    const now = Date.now();
    const type = starting ? "start" : interaction.commandName === "session-low" ? "low" : "end";
    const next = type === "low"
        ? current
        : starting
            ? { active: true, startedAt: now, startedBy: interaction.user.id }
            : { active: false, durationMs: now - current.startedAt, endedAt: now, endedBy: interaction.user.id };
    const previous = current;
    if (type !== "low") {
        store.update((data) => {
            data.sessions[kind] = next;
        });
    }
    try {
        await channel.send(sessionPanel(type, next, kind));
    } catch (error) {
        if (type !== "low") {
            store.update((data) => {
                data.sessions[kind] = previous;
            });
        }
        throw error;
    }
    return interaction.editReply(ephemeral(
        type === "low"
            ? `Low-player announcement posted in <#${channel.id}>.`
            : `Session ${starting ? "started" : "ended"} in <#${channel.id}>.`
    ));
}

async function handleStaffRoles(interaction) {
    requireModerator(interaction);
    const name = interaction.commandName;
    if (name === "staff-deny") {
        const member = interaction.options.getUser("member", true);
        const reason = interaction.options.getString("reason", true).trim();
        try {
            await member.send({
                ...panelPayload("Staff Application Update",
                    `Your application for ${config.serverName} was not accepted at this time.`,
                    { sections: [{ title: "Feedback", content: reason }] })
            });
            return interaction.editReply(ephemeral(`Application denial sent to <@${member.id}>.`));
        } catch (error) {
            if (error.code === 50007) {
                return interaction.editReply(ephemeral(`Application denied for <@${member.id}>, but their DMs are closed. Let them know another way.`));
            }
            throw error;
        }
    }

    const user = interaction.options.getUser("member", true);
    const member = await interaction.guild.members.fetch(user.id);
    const role = interaction.options.getRole(name === "reinstate" ? "rank" : "role")
        || interaction.guild.roles.cache.get(config.staffRoleId);
    if (!role) throw new Error("No staff/rank role was selected or configured. Choose a role or set STAFF_ROLE_ID in .env.");
    if (role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
        throw new Error("The selected role is managed or is not below the bot's highest role.");
    }
    await member.roles.add(role, `Staff action by ${interaction.user.tag}: ${name}`);
    return interaction.editReply(ephemeral(`<@${user.id}> was assigned <@&${role.id}>.`));
}

async function handleReducedActivity(interaction) {
    if (interaction.commandName === "ra" || interaction.commandName === "request-ra") {
        const state = store.load();
        if (state.reducedActivity.some((entry) =>
            entry.memberId === interaction.user.id && entry.status === "pending")) {
            throw new Error("You already have a Reduced Activity request awaiting staff review.");
        }
        const channel = await client.channels.fetch(config.reducedActivityChannelId);
        if (!getTextChannel(channel) || channel.guildId !== config.guildId) {
            throw new Error("The configured Reduced Activity request channel is unavailable.");
        }
        const request = {
            id: store.createId("RA"),
            memberId: interaction.user.id,
            reason: interaction.options.getString("reason", true).trim(),
            until: interaction.options.getString("until")?.trim() || null,
            requestedAt: Date.now(),
            active: false,
            status: "pending"
        };
        const message = await channel.send(reducedActivityRequestPanel(request));
        request.channelId = channel.id;
        request.messageId = message.id;
        store.update((data) => {
            data.reducedActivity.push(request);
        });
        return interaction.editReply(ephemeral(`Your Reduced Activity request was sent to staff for review. Request ID: \`${request.id}\`.`));
    }

    requireModerator(interaction);
    const member = interaction.options.getUser("member", true);
    const request = [...store.load().reducedActivity].reverse()
        .find((entry) => entry.memberId === member.id && entry.status === "accepted" && entry.active);
    if (!request) throw new Error("No active Reduced Activity record was found for that member.");
    if (!config.reducedActivityRoleId) {
        throw new Error("RA_ROLE_ID is not configured, so the Reduced Activity role cannot be removed.");
    }
    const role = await interaction.guild.roles.fetch(config.reducedActivityRoleId);
    if (!role) throw new Error("The configured Reduced Activity role was not found.");
    const guildMember = await interaction.guild.members.fetch(member.id);
    if (guildMember.roles.cache.has(role.id)) {
        await guildMember.roles.remove(role, `Reduced Activity ended by ${interaction.user.tag}`);
    }
    store.update((data) => {
        const current = data.reducedActivity.find((entry) => entry.id === request.id);
        current.active = false;
        current.endedAt = Date.now();
        current.endedBy = interaction.user.id;
        current.endReason = interaction.options.getString("reason")?.trim() || null;
    });
    return interaction.editReply(ephemeral(`Reduced Activity ended for <@${member.id}>.`));
}

async function handleReducedActivityReview(interaction, action, requestId) {
    if (!isModerator(interaction)) throw new Error("Only administrators and configured moderators can review Reduced Activity requests.");
    const state = store.load();
    const request = state.reducedActivity.find((entry) => entry.id === requestId);
    if (!request) throw new Error(`Reduced Activity request \`${requestId}\` was not found.`);
    if (request.status !== "pending") throw new Error(`Request \`${requestId}\` has already been ${request.status}.`);
    if (!request.channelId || request.channelId !== interaction.channelId) {
        throw new Error("This request button is not in its original review channel.");
    }
    const reviewChannel = await client.channels.fetch(request.channelId);
    if (!getTextChannel(reviewChannel)) throw new Error("The Reduced Activity review channel is unavailable.");
    const requestMessage = await reviewChannel.messages.fetch(request.messageId);

    let member;
    let role;
    if (action === "accept") {
        if (!config.reducedActivityRoleId) {
            throw new Error("RA_ROLE_ID is not configured. Add the Reduced Activity role ID before accepting requests.");
        }
        role = await interaction.guild.roles.fetch(config.reducedActivityRoleId);
        if (!role) throw new Error("The configured Reduced Activity role was not found.");
        const botMember = await interaction.guild.members.fetchMe();
        if (role.managed || role.position >= botMember.roles.highest.position) {
            throw new Error("The Reduced Activity role is managed or not below the bot's highest role.");
        }
        member = await interaction.guild.members.fetch(request.memberId);
        if (!member.roles.cache.has(role.id)) {
            await member.roles.add(role, `Reduced Activity request ${request.id} accepted by ${interaction.user.tag}`);
        }
    } else if (action !== "deny") {
        throw new Error("Unknown Reduced Activity decision.");
    }

    const updated = {
        ...request,
        status: action === "accept" ? "accepted" : "denied",
        active: action === "accept",
        decidedBy: interaction.user.id,
        decidedAt: Date.now()
    };
    store.update((data) => {
        const index = data.reducedActivity.findIndex((entry) => entry.id === requestId);
        data.reducedActivity[index] = updated;
    });

    let panelUpdated = true;
    try {
        await requestMessage.edit(reducedActivityRequestPanel(updated));
    } catch (error) {
        panelUpdated = false;
        console.error(`Could not update Reduced Activity request ${requestId} panel:`, error);
    }

    let dmSent = true;
    try {
        const requester = await client.users.fetch(request.memberId);
        await requester.send(ephemeral(
            action === "accept"
                ? `Your Reduced Activity request was accepted. The Reduced Activity role has been added to your account.${request.until ? ` Expected return: ${request.until}.` : ""}`
                : "Your Reduced Activity request was denied. Please contact staff if you have questions."
        ));
    } catch (error) {
        dmSent = false;
        if (error.code !== 50007) {
            console.error(`Could not DM Reduced Activity decision to ${request.memberId}:`, error);
        }
    }

    const outcome = [
        `Request \`${requestId}\` ${updated.status}.`,
        action === "accept" ? `<@${request.memberId}> was given <@&${config.reducedActivityRoleId}>.` : "",
        dmSent ? "The requester was notified by DM." : "The decision is saved, but the requester could not be DM'd.",
        panelUpdated ? "" : "The request post could not be updated."
    ].filter(Boolean).join(" ");
    return interaction.editReply(ephemeral(outcome));
}

async function handleStaffResignation(interaction) {
    const staffRole = interaction.guild.roles.cache.get(config.staffRoleId);
    if (!staffRole) throw new Error("STAFF_ROLE_ID is not configured. Resignation was not processed.");
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!member.roles.cache.has(staffRole.id)) throw new Error("You do not currently have the configured staff role.");
    await member.roles.remove(staffRole, "Staff resignation");
    const reason = interaction.options.getString("reason")?.trim();
    await interaction.channel.send({
        ...panelPayload(
            "Staff Resignation",
            `<@${member.id}> has resigned from the staff team.`,
            {
                sections: reason ? [{ title: "Message", content: reason }] : [],
                allowedMentions: { parse: [], users: [member.id] }
            }
        )
    });
    return interaction.editReply(ephemeral("Your resignation was announced and your staff role was removed."));
}

async function handleGlobalBan(interaction) {
    requireModerator(interaction);
    const userId = interaction.options.getString("user_id", true).trim();
    const isBan = interaction.commandName === "ban";
    const reason = interaction.options.getString("reason")?.trim() || `Global unban by ${interaction.user.tag}`;
    const result = await runGlobalBan(userId, reason, isBan);
    const failures = result.failed.slice(0, 8).map((entry) => `• ${entry}`);
    if (result.failed.length > failures.length) failures.push(`• And ${result.failed.length - failures.length} more failure(s).`);
    const summary = [
        `Completed in ${result.succeeded.length} server(s).`,
        result.failed.length ? `Failed in ${result.failed.length} server(s):\n${failures.join("\n")}` : ""
    ].filter(Boolean).join("\n");
    return interaction.editReply(ephemeral(`${isBan ? "Global ban" : "Global unban"} for \`${userId}\` finished.\n${summary}`.slice(0, 1800)));
}

async function handleCommand(interaction) {
    if (!interaction.inGuild() || interaction.guildId !== config.guildId) {
        return interaction.reply({
            ...ephemeral("This command is only available in the configured South Carolina server."),
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        });
    }
    await interaction.deferReply(ephemeralFlags);
    const name = interaction.commandName;

    if (["punish", "punishment-edit", "punishment-history", "punishment-void", "my-punishments"].includes(name)) {
        return handlePunishment(interaction);
    }
    if (name === "appeal") return handleAppeal(interaction);
    if (["ticket-panel", "claim", "close", "add", "remove"].includes(name)) return handleTicketCommand(interaction);
    if (["session-start", "session-end", "session-low", "wl-session-start", "wl-session-end"].includes(name)) {
        return handleSession(interaction);
    }
    if (["interview-pass", "staff-accept", "staff-deny", "reinstate"].includes(name)) {
        return handleStaffRoles(interaction);
    }
    if (["ra", "request-ra", "ra-admin"].includes(name)) return handleReducedActivity(interaction);
    if (name === "resign") return handleStaffResignation(interaction);
    if (name === "ban" || name === "unban") return handleGlobalBan(interaction);
    if (name === "queue-add" || name === "queue-remove") {
        requireModerator(interaction);
        const member = interaction.options.getUser("member", true);
        let changed = false;
        store.update((state) => {
            if (name === "queue-add") {
                if (!state.queue.some((entry) => entry.memberId === member.id)) {
                    state.queue.push({
                        memberId: member.id,
                        note: interaction.options.getString("note")?.trim() || null,
                        addedBy: interaction.user.id,
                        addedAt: Date.now()
                    });
                    changed = true;
                }
            } else {
                const initialSize = state.queue.length;
                state.queue = state.queue.filter((entry) => entry.memberId !== member.id);
                changed = state.queue.length !== initialSize;
            }
        });
        return interaction.editReply(ephemeral(changed
            ? `<@${member.id}> ${name === "queue-add" ? "added to" : "removed from"} the advertising queue.`
            : name === "queue-add" ? "That member is already in the advertising queue." : "That member was not in the advertising queue."));
    }
    if (name === "say") {
        requireModerator(interaction);
        const message = interaction.options.getString("message", true).trim();
        await interaction.channel.send(panelPayload("South Carolina Systems", message));
        return interaction.editReply(ephemeral("Message sent."));
    }
    if (name === "tweet" || name === "twitter") {
        requireModerator(interaction);
        const author = interaction.options.getString("author")?.trim() || interaction.user.username;
        const message = interaction.options.getString("message", true).trim();
        await interaction.channel.send(panelPayload(`${author} • South Carolina Social`, message));
        return interaction.editReply(ephemeral("Roleplay tweet posted."));
    }
    if (name === "shop") {
        requireModerator(interaction);
        if (!config.shopUrl) throw new Error("SHOP_URL is not configured. Add the server shop URL to .env before posting this panel.");
        await interaction.channel.send(panelPayload(
            "Server Shop",
            "Visit the official South Carolina State Roleplay shop.",
            {
                buttons: [
                    new ButtonBuilder().setLabel("Visit Shop").setStyle(ButtonStyle.Link).setURL(config.shopUrl)
                ]
            }
        ));
        return interaction.editReply(ephemeral("Shop panel posted."));
    }
    if (name === "self-roles") {
        requireModerator(interaction);
        if (config.selfRoles.length === 0) throw new Error("SELF_ROLES is not configured. Add role IDs and labels to .env.");
        if (config.selfRoles.length > 25) throw new Error("SELF_ROLES can contain no more than 25 roles.");
        const missing = config.selfRoles.find((entry) => !interaction.guild.roles.cache.has(entry.id));
        if (missing) throw new Error(`SELF_ROLES references unavailable role ${missing.id}.`);
        await interaction.channel.send(selfRolePanelPayload(config.selfRoles));
        return interaction.editReply(ephemeral("Self-role panel posted."));
    }
    if (name === "suspension-view") {
        requireModerator(interaction);
        const state = store.load();
        const action = interaction.options.getString("action") || "view";
        if (action === "end") {
            const id = interaction.options.getString("infraction_id")?.trim().toUpperCase();
            if (!id) throw new Error("Provide the suspension's infraction ID to end it.");
            const record = state.punishments.find((entry) => entry.id === id);
            if (!record || record.type.toLowerCase() !== "suspension") {
                throw new Error(`No suspension was found with ID \`${id}\`.`);
            }
            if (record.voided) throw new Error(`Suspension \`${id}\` has already ended or been voided.`);
            const updated = {
                ...record,
                voided: true,
                voidReason: `Suspension ended by <@${interaction.user.id}>`,
                updatedAt: Date.now()
            };
            if (!await syncPunishment(updated)) {
                throw new Error("The original suspension post could not be found. The record was not changed.");
            }
            store.update((data) => {
                const index = data.punishments.findIndex((entry) => entry.id === id);
                data.punishments[index] = updated;
            });
            return interaction.editReply(ephemeral(`Suspension \`${id}\` has ended.`));
        }
        const memberId = interaction.options.getUser("member")?.id;
        const suspensions = formatHistory(state.punishments
            .filter((record) => record.type.toLowerCase() === "suspension" && !record.voided
                && (!memberId || record.memberId === memberId)));
        const description = suspensions.length
            ? suspensions.slice(0, 15).map((record) => `<@${record.memberId}> · \`${record.id}\` · ${String(record.reason).slice(0, 120)}`).join("\n")
            : "There are no active staff suspensions.";
        return interaction.editReply(panelPayload("Active Staff Suspensions", description, {
            accentColor: 0xA63D40
        }));
    }
    if (name === "help") {
        return interaction.editReply(panelPayload(
            "South Carolina Systems Bot",
            "Sessions: `/session-start`, `/session-end`, `/session-low`, `/wl-session-start`, `/wl-session-end`\n"
                + "Tickets: `/ticket-panel`, `/claim`, `/add`, `/remove`, `/close`\n"
                + "Staff: `/punish`, `/punishment-edit`, `/punishment-history`, `/punishment-void`, `/my-punishments`, `/appeal`, `/interview-pass`, `/staff-accept`, `/staff-deny`, `/reinstate`, `/resign`, `/ra`, `/ra-admin`, `/suspension-view`\n"
                + "Community: `/queue-add`, `/queue-remove`, `/self-roles`, `/shop`, `/say`, `/tweet`, `/ban`, `/unban`"
        ));
    }
    if (name === "ping") {
        return interaction.editReply(ephemeral(`Pong! WebSocket latency: ${client.ws.ping}ms.`));
    }
    if (name === "serverinfo") {
        const session = store.load().sessions.regular;
        return interaction.editReply(panelPayload(config.serverName, "Official South Carolina roleplay server information.", {
            sections: [
                { title: "Mode", content: config.serverMode },
                { title: "In-Game Code", content: config.inGameCode },
                { title: "Server Owner", content: config.serverOwner },
                { title: "Session", content: session?.active ? "Active" : "Inactive" }
            ]
        }));
    }
    throw new Error(`Unknown command: ${name}`);
}

async function handleButton(interaction) {
    if (!interaction.inGuild() || interaction.guildId !== config.guildId) {
        return interaction.reply({
            ...ephemeral("This button is only available in the configured server."),
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        });
    }
    await interaction.deferReply(ephemeralFlags);
    const raReview = interaction.customId.match(/^ra-review:(accept|deny):(RA-[A-F0-9]{8})$/);
    if (raReview) {
        return handleReducedActivityReview(interaction, raReview[1], raReview[2]);
    }
    if (interaction.customId === "ticket:open") {
        return interaction.editReply(ephemeral("Choose a ticket type from the menu on the Support Center panel."));
    }
    if (interaction.customId === "ticket:faq") {
        return interaction.editReply(ticketFaqPayload());
    }
    if (interaction.customId === "ticket:type" && interaction.isStringSelectMenu()) {
        const typeKey = interaction.values[0];
        const result = await createTicket(interaction.guild, interaction.user, typeKey);
        return interaction.editReply(ephemeral(
            result.created
                ? `Your ${config.ticketTypes[typeKey].label} ticket is ready: <#${result.channel.id}>.`
                : `You already have an open ticket: <#${result.channel.id}>.`
        ));
    }
    if (interaction.customId === "ticket:claim") {
        const ownerId = requireTicketChannel(interaction.channel);
        if (!isTicketStaff(interaction)) {
            throw new Error("Only the team assigned to this ticket or a moderator can claim it.");
        }
        if (interaction.channel.topic.includes(";claimed:")) {
            throw new Error("This ticket has already been claimed.");
        }
        const typeKey = interaction.channel.topic.match(/(?:^|;)ticket-type:([a-z-]+)(?:;|$)/)?.[1];
        const ticketType = config.ticketTypes[typeKey];
        if (!ticketType) throw new Error("This ticket does not have a recognized support team.");
        await interaction.channel.setTopic(`${interaction.channel.topic};claimed:${interaction.user.id}`);
        await interaction.message.edit(ticketWelcomePayload(ownerId, ticketType, interaction.user.id));
        return interaction.editReply(ephemeral(`Ticket claimed by <@${interaction.user.id}>.`));
    }
    if (interaction.customId === "session:notifications") {
        if (!config.sessionNotificationRoleId) throw new Error("SESSION_NOTIFICATION_ROLE_ID is not configured.");
        const role = await interaction.guild.roles.fetch(config.sessionNotificationRoleId);
        if (!role) throw new Error("The configured session notification role was not found.");
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const has = member.roles.cache.has(role.id);
        await member.roles[has ? "remove" : "add"](role, "Session notification preference changed.");
        return interaction.editReply(ephemeral(has ? "Session notifications disabled." : "Session notifications enabled."));
    }
    if (interaction.customId === "self-roles:select" && interaction.isStringSelectMenu()) {
        const selected = new Set(interaction.values);
        const unknown = [...selected].filter((id) => !config.selfRoles.some((entry) => entry.id === id));
        if (unknown.length) throw new Error("This role menu contains a role that is not configured.");
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const changed = [];
        for (const id of selected) {
            const role = interaction.guild.roles.cache.get(id);
            if (!role || role.managed || role.position >= interaction.guild.members.me.roles.highest.position) {
                throw new Error(`Role ${id} is not manageable by the bot.`);
            }
            const alreadyHas = member.roles.cache.has(id);
            await member.roles[alreadyHas ? "remove" : "add"](role, "Self-role menu selection.");
            changed.push(`${alreadyHas ? "removed" : "added"} ${role.name}`);
        }
        return interaction.editReply(ephemeral(`Updated your roles: ${changed.join(", ")}.`));
    }
    throw new Error("Unknown interaction button.");
}

client.on("interactionCreate", (interaction) => {
    const operation = interaction.isButton()
        || (interaction.isStringSelectMenu()
            && ["self-roles:select", "ticket:type"].includes(interaction.customId))
        ? handleButton(interaction)
        : interaction.isChatInputCommand()
            ? handleCommand(interaction)
            : Promise.resolve();
    operation.catch(async (error) => {
        console.error("Interaction failed:", error);
        if (!interaction.isRepliable()) return;
        const message = error.message || "The request failed. Check the bot log for details.";
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(ephemeral(message));
            } else {
                await interaction.reply(ephemeral(message));
            }
        } catch (replyError) {
            console.error("Could not send the interaction error response:", replyError);
        }
    });
});

client.once("ready", async () => {
    console.log(`Connected as ${client.user.tag}`);
    client.user.setActivity("South Carolina State Roleplay", { type: ActivityType.Playing });
    console.log("Discord activity set to Playing South Carolina State Roleplay.");
    try {
        await client.application.commands.set(commands, config.guildId);
        console.log(`Registered ${commands.length} guild slash commands.`);
        try {
            await postHiringAnnouncement();
        } catch (error) {
            console.error("Could not post the initial hiring announcement:", error);
        }
        const hiringInterval = setInterval(() => {
            postHiringAnnouncement().catch((error) => {
                console.error("Could not post the scheduled hiring announcement:", error);
            });
        }, HIRING_ANNOUNCEMENT_INTERVAL_MS);
        hiringInterval.unref();
    } catch (error) {
        console.error("Could not register slash commands:", error);
        client.destroy();
        process.exitCode = 1;
    }
});

client.on("error", (error) => console.error("Discord client error:", error));

async function start() {
    if (!config.token) throw new Error("BOT_TOKEN is missing. Copy .env.example to .env and add your bot token.");
    if (!config.guildId || !/^\d{17,20}$/.test(config.guildId)) {
        throw new Error("DISCORD_GUILD_ID is missing or invalid. Add your server ID to .env.");
    }
    store.load();
    await client.login(config.token);
}

start().catch((error) => {
    console.error("Bot startup failed:", error);
    process.exitCode = 1;
});
