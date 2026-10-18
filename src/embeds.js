const {
    ActionRowBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    TextDisplayBuilder
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");
const assetDirectory = path.join(__dirname, "..", "assets");

const colors = Object.freeze({
    gold: 0xC67537,
    red: 0xA63D40,
    green: 0x527A56,
    blue: 0x526C8C,
    gray: 0x60646C
});

function panelPayload(title, description, options = {}) {
    const {
        accentColor = colors.gold,
        sections = [],
        footer = config.serverName,
        timestamp = Date.now(),
        buttons = [],
        extraComponents = [],
        allowedMentions = { parse: [] },
        files = [],
        includeBrandFooter = true,
        headerAsset = null,
        footerAsset = "footer-banner.png",
        showTitle = true
    } = options;
    const attachedFiles = [...files];
    const addAsset = (filename) => {
        const filePath = path.join(assetDirectory, filename);
        if (!fs.existsSync(filePath)) return false;
        if (!attachedFiles.some((attachment) => attachment.name === filename)) {
            attachedFiles.push(new AttachmentBuilder(filePath, { name: filename }));
        }
        return true;
    };
    const hasHeaderAsset = headerAsset ? addAsset(headerAsset) : false;
    const hasFooterAsset = includeBrandFooter && footerAsset ? addAsset(footerAsset) : false;
    const container = new ContainerBuilder()
        .setAccentColor(accentColor);
    if (hasHeaderAsset) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(`attachment://${headerAsset}`).setDescription(title)
            )
        ).addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    }
    const heading = showTitle || (headerAsset && !hasHeaderAsset) ? `# ${title}\n` : "";
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${heading}${description}`));

    for (const section of sections) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${section.title}\n${section.content}`)
            );
    }

    if (buttons.length) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
    }
    if (extraComponents.length) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addActionRowComponents(...extraComponents);
    }

    if (footer || timestamp) {
        const footerText = [footer, timestamp ? `<t:${Math.floor(timestamp / 1000)}:f>` : null]
            .filter(Boolean)
            .join(" • ");
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footerText}`));
    }
    if (hasFooterAsset) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(`attachment://${footerAsset}`).setDescription(`${config.serverName} banner`)
                )
            );
    }

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        allowedMentions,
        ...(attachedFiles.length ? { files: attachedFiles } : {})
    };
}

function sessionPanel(type, session, kind = "regular") {
    const started = type === "start";
    const low = type === "low";
    const whitelist = kind === "whitelist";
    const title = low
        ? "LOW-PLAYER SESSION"
        : whitelist
            ? started ? "WHITELIST SESSION" : "WHITELIST SESSION ENDED"
            : started ? "SESSIONS" : "SESSIONS";
    const description = low
        ? "There are currently fewer players online. Join the server and help bring the roleplay to life."
        : started
            ? `A **${config.serverName}** session is now starting! Join for realistic scenes, active departments, and quality roleplay.`
            : `A **${config.serverName}** session has now ended! Thank you to **everyone** who joined, created realistic scenes, and made today’s **roleplay enjoyable!**`;
    const sections = [];
    if (started) {
        sections.push({
            title: "Server Information",
            content: `**Server:** ${config.serverName}\n**In-Game Code:** ${config.inGameCode}\n**Server Owner:** ${config.serverOwner}`
        });
        if (session?.startedAt) {
            sections.push({
                title: "Session Started",
                content: `<t:${Math.floor(session.startedAt / 1000)}:R>`
            });
        }
    } else if (!low) {
        sections.push({
            title: "Server Status",
            content: `**The server is now closed.** We hope you **enjoyed the session!** Stay tuned for the next session startup!`
        });
    }
    const buttons = [];
    if (type === "start" && config.joinServerUrl) {
        buttons.push(new ButtonBuilder()
            .setLabel("Join Server")
            .setStyle(ButtonStyle.Link)
            .setURL(config.joinServerUrl));
    }
    if ((type === "start" || type === "end") && config.sessionNotificationRoleId) {
        buttons.push(new ButtonBuilder()
            .setCustomId("session:notifications")
            .setLabel("Get Session Notification!")
            .setStyle(ButtonStyle.Secondary));
    }
    const roleMention = type === "start" && config.sessionNotificationRoleId
        ? `<@&${config.sessionNotificationRoleId}>\n\n`
        : "";
    return panelPayload(title, `${roleMention}${description}`, {
        accentColor: started || low ? colors.gold : colors.gray,
        sections,
        buttons,
        headerAsset: "session-header.png",
        showTitle: low || whitelist,
        allowedMentions: roleMention
            ? { roles: [config.sessionNotificationRoleId] }
            : { parse: [] }
    });
}

function punishmentPanel(record, { pingTarget = false } = {}) {
    const active = !record.voided;
    const sections = [
        {
            title: "Staff Information",
            content: `**Target:** <@${record.memberId}>\n**Issuer:** <@${record.issuedBy}>\n**Date Issued:** <t:${Math.floor(record.issuedAt / 1000)}:F>`
        },
        {
            title: "Punishment Details",
            content: `**Type:** ${record.type}\n**Reason:** ${record.reason}\n**Expiration Date:** ${record.expiration || "Never"}`
        }
    ];
    if (record.voided && record.voidReason) {
        sections.push({ title: "Void Reason", content: record.voidReason });
    }
    if (record.appeals?.length) {
        const appeal = record.appeals[record.appeals.length - 1];
        sections.push({
            title: "Latest Appeal",
            content: `${appeal.status}: ${String(appeal.reason).slice(0, 900)}`
        });
    }
    return panelPayload("INFRACTIONS", `## Punishment ${active ? "issued" : "voided"}\n**Infraction ID:** ${record.id}\n**Status:** ${active ? "Active" : "Void"}`, {
        accentColor: active ? colors.red : colors.gray,
        sections,
        headerAsset: "punishment-header.png",
        timestamp: record.updatedAt || record.issuedAt,
        allowedMentions: pingTarget
            ? { users: [record.memberId] }
            : { parse: [] }
    });
}

function recordsPanel(title, memberId, records) {
    const body = records.length
        ? records.slice(0, 10).map((record) => {
            const status = record.voided ? "Void" : "Active";
            const reason = String(record.reason || "").slice(0, 180);
            return `**${record.type}** · \`${record.id}\` · ${status}\n${reason}`;
        }).join("\n\n")
        : "No punishment records found.";
    return panelPayload(title, memberId ? `<@${memberId}>` : "Punishment records", {
        accentColor: colors.red,
        sections: [{ title: "Recent Records", content: body }],
        footer: `${config.serverName} • newest first`
    });
}

function ticketPanelPayload(ticketTypes = config.ticketTypes) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("ticket:type")
        .setPlaceholder("Choose a ticket type")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(Object.entries(ticketTypes).map(([value, type]) => ({
            label: type.label,
            description: type.description,
            value
        })));
    return panelPayload(
        "Support Center",
        "Welcome to South Carolina State Roleplay support. Choose an option below to find answers or contact the right team.",
        {
            sections: [{
                title: "How can we help?",
                content: "Browse the FAQ or choose a ticket type below to open a private ticket with the right team."
            }],
            headerAsset: "support-header.png",
            extraComponents: [new ActionRowBuilder().addComponents(menu)],
            buttons: [
                new ButtonBuilder()
                    .setCustomId("ticket:faq")
                    .setLabel("FAQ")
                    .setStyle(ButtonStyle.Secondary),
            ]
        }
    );
}

function ticketFaqPayload() {
    return panelPayload(
        "Support FAQ",
        "Quick answers to common support questions.",
        {
            timestamp: null,
            includeBrandFooter: false,
            sections: [
                {
                    title: "How do I contact support?",
                    content: "Choose General Support, Community Support, Staff Report, or Partnership from the ticket menu on the Support Center panel."
                },
                {
                    title: "Who can see my ticket?",
                    content: "Only you, the team assigned to your ticket, and server moderators can view it."
                },
                {
                    title: "How long will a response take?",
                    content: "Response times vary depending on staff availability. Please keep your ticket open and avoid creating duplicate requests."
                },
                {
                    title: "Can I add information later?",
                    content: "Yes. Send messages or attach relevant screenshots in your ticket. Never share passwords or other account credentials."
                },
                {
                    title: "How do I close my ticket?",
                    content: "Ask the assigned team to close it, or use `/close` if you are the ticket owner. A transcript is saved for staff."
                }
            ]
        }
    );
}

function ticketWelcomePayload(ownerId, ticketType, claimedBy = null) {
    const roleMentions = ticketType.roleIds.map((roleId) => `<@&${roleId}>`).join(" ");
    return panelPayload(
        `${ticketType.label} Ticket`,
        `${roleMentions}\n<@${ownerId}> please describe what you need help with. Do not share passwords or other account credentials.${claimedBy ? `\n\n**Claimed by:** <@${claimedBy}>` : ""}`,
        {
            sections: [{
                title: "What Happens Next",
                content: `Your request has been sent to the ${ticketType.label} team. Staff will reply here. You can use \`/close\` when your request is resolved.`
            }],
            buttons: [
                new ButtonBuilder()
                    .setCustomId("ticket:claim")
                    .setLabel(claimedBy ? "Ticket Claimed" : "Claim Ticket")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(Boolean(claimedBy))
            ],
            allowedMentions: claimedBy
                ? { parse: [] }
                : { users: [ownerId], roles: ticketType.roleIds }
        }
    );
}

function reducedActivityRequestPanel(request) {
    const pending = request.status === "pending";
    return panelPayload(
        `Reduced Activity Request • ${request.id}`,
        `**Member:** <@${request.memberId}>\n**Requested:** <t:${Math.floor(request.requestedAt / 1000)}:F>`,
        {
            accentColor: pending ? colors.gold : request.status === "accepted" ? colors.green : colors.red,
            sections: [
                { title: "Reason", content: request.reason },
                ...(request.until ? [{ title: "Expected Return", content: request.until }] : []),
                {
                    title: "Decision",
                    content: pending
                        ? "Awaiting staff review."
                        : `**${request.status.toUpperCase()}** by <@${request.decidedBy}> • <t:${Math.floor(request.decidedAt / 1000)}:F>`
                }
            ],
            buttons: pending ? [
                new ButtonBuilder()
                    .setCustomId(`ra-review:accept:${request.id}`)
                    .setLabel("Accept")
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`ra-review:deny:${request.id}`)
                    .setLabel("Deny")
                    .setStyle(ButtonStyle.Danger)
            ] : [],
            allowedMentions: { parse: [] }
        }
    );
}

function hiringAnnouncementPanel() {
    return panelPayload(
        "We’re Hiring Staff!",
        `**${config.serverName}** is currently hiring staff members. If you’re responsible, active, and ready to help our community, we’d love to hear from you.`,
        {
            accentColor: colors.gold,
            sections: [{
                title: "Apply Now",
                content: "Open an application and tell us why you’d be a great fit for the team."
            }],
            buttons: [
                new ButtonBuilder()
                    .setLabel("Staff Applications")
                    .setStyle(ButtonStyle.Link)
                    .setURL(config.applicationsChannelUrl)
            ],
            allowedMentions: { parse: [] }
        }
    );
}

function selfRolePanelPayload(roles) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("self-roles:select")
        .setPlaceholder("Choose roles to toggle")
        .setMinValues(1)
        .setMaxValues(Math.min(roles.length, 25))
        .addOptions(roles.map((entry) => ({ label: entry.label, value: entry.id })));
    return panelPayload(
        "Choose Your Roles",
        "Select or deselect roles from the menu. Selecting a role you already have removes it.",
        {
            accentColor: colors.blue,
            extraComponents: [new ActionRowBuilder().addComponents(menu)]
        }
    );
}

function ephemeral(content) {
    return panelPayload("South Carolina Systems", content, {
        footer: config.serverName,
        timestamp: null,
        includeBrandFooter: false
    });
}

module.exports = {
    colors,
    ephemeral,
    hiringAnnouncementPanel,
    panelPayload,
    punishmentPanel,
    reducedActivityRequestPanel,
    recordsPanel,
    selfRolePanelPayload,
    sessionPanel,
    ticketPanelPayload,
    ticketFaqPayload,
    ticketWelcomePayload
};
