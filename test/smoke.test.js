const assert = require("node:assert/strict");
const test = require("node:test");

const config = require("../src/config");
const commands = require("../src/commands");
const {
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
} = require("../src/embeds");
const { MessageFlags } = require("discord.js");
const { sendPunishmentNotice } = require("../src/notifications");

const expectedCommands = [
    "add", "appeal", "ban", "claim", "close", "interview-pass", "my-punishments",
    "punish", "punishment-edit", "punishment-history", "punishment-void", "queue-add",
    "queue-remove", "ra", "ra-admin", "reinstate", "remove", "request-ra", "resign",
    "say", "self-roles", "session-end", "session-low", "session-start", "shop",
    "staff-accept", "staff-deny", "suspension-view", "ticket-panel", "tweet", "twitter",
    "unban", "wl-session-end", "wl-session-start"
];

test("all requested slash commands serialize with unique names", () => {
    const names = commands.map((entry) => entry.name);
    assert.equal(new Set(names).size, names.length);
    for (const name of expectedCommands) assert.ok(names.includes(name), `Missing /${name}`);
    assert.ok(names.length <= 100);
});

test("server configuration matches South Carolina State Roleplay", () => {
    assert.equal(config.serverName, "South Carolina State Roleplay | VC Only");
    assert.equal(config.serverMode, "VC Only");
    assert.equal(config.inGameCode, "RichlandSC");
    assert.equal(config.serverOwner, "boogs0522");
    assert.equal(config.reducedActivityChannelId, "1561239693344120893");
    assert.equal(config.reducedActivityRoleId, "1561239853944012861");
    assert.deepEqual(
        Object.fromEntries(Object.entries(config.ticketTypes)
            .map(([key, value]) => [key, { categoryId: value.categoryId, roleIds: value.roleIds }])),
        {
            "general-support": {
                categoryId: "1532112428324884731",
                roleIds: ["1532111365370806333"]
            },
            "community-support": {
                categoryId: "1532112366202912839",
                roleIds: ["1551098535427047455", "1551098623696306206"]
            },
            "staff-report": {
                categoryId: "1532112504929648843",
                roleIds: ["1530786131292197004"]
            },
            partnership: {
                categoryId: "1532112647607029970",
                roleIds: ["1551098535427047455"]
            }
        }
    );
});

function componentText(payload) {
    return payload.components[0].toJSON().components
        .filter((component) => component.type === 10)
        .map((component) => component.content)
        .join("\n");
}

function assertComponentsV2(payload) {
    assert.ok(payload.flags & MessageFlags.IsComponentsV2);
    assert.equal(payload.embeds, undefined);
    assert.equal(payload.content, undefined);
    assert.ok(payload.components.length > 0);
    assert.ok(payload.components[0].toJSON().components.some((component) => component.type === 14));
}

test("session start uses Components V2, separators, and the configured server identity", () => {
    const payload = sessionPanel("start", { active: true, startedAt: 1_800_000_000_000 });
    assertComponentsV2(payload);
    const container = payload.components[0].toJSON();
    const text = componentText(payload);
    assert.equal(container.components[0].type, 12);
    assert.equal(container.components[0].items[0].media.url, "attachment://session-header.png");
    assert.doesNotMatch(text, /^# SESSION/m);
    assert.match(text, new RegExp(config.serverName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(text, /RichlandSC/);
    assert.match(text, /boogs0522/);
    assert.ok(payload.files.some((file) => file.name === "session-header.png"));
    assert.ok(payload.files.some((file) => file.name === "footer-banner.png"));
});

test("whitelist sessions use a distinct announcement heading", () => {
    const payload = sessionPanel("start", { active: true, startedAt: 1_800_000_000_000 }, "whitelist");
    assertComponentsV2(payload);
    assert.match(componentText(payload), /# WHITELIST SESSION/);
});

test("session end matches the closed-session copy and includes the notification button", () => {
    const payload = sessionPanel("end", { active: false, durationMs: 3_600_000 });
    assertComponentsV2(payload);
    const container = payload.components[0].toJSON();
    const text = componentText(payload);
    assert.equal(container.components[0].items[0].media.url, "attachment://session-header.png");
    assert.doesNotMatch(text, /^# SESSIONS/m);
    assert.match(text, /South Carolina State Roleplay \| VC Only/);
    assert.match(text, /session has now ended/);
    assert.match(text, /The server is now closed/);
    assert.match(text, /Stay tuned for the next session startup/);
    assert.ok(container.components.some((component) => component.type === 1
        && component.components.some((button) => button.custom_id === "session:notifications"
            && button.label === "Get Session Notification!")));
    assert.equal(container.components.at(-1).type, 12);
    assert.equal(container.components.at(-1).items[0].media.url, "attachment://footer-banner.png");
    assert.ok(payload.files.some((file) => file.name === "session-header.png"));
    assert.ok(payload.files.some((file) => file.name === "footer-banner.png"));
});

test("punishment panel uses Components V2 separators and the infraction layout", () => {
    const payload = punishmentPanel({
        id: "SC-TEST1234",
        memberId: "100000000000000001",
        issuedBy: "100000000000000002",
        issuedAt: 1_800_000_000_000,
        type: "Strike",
        reason: "Test reason",
        expiration: "Never",
        voided: false
    });
    assertComponentsV2(payload);
    const text = componentText(payload);
    assert.match(text, /# INFRACTIONS/);
    assert.match(text, /Infraction ID/);
    assert.match(text, /## Staff Information/);
    assert.match(text, /## Punishment Details/);
    const container = payload.components[0].toJSON();
    assert.equal(container.components[0].items[0].media.url, "attachment://punishment-header.png");
    assert.equal(container.components.at(-1).items[0].media.url, "attachment://footer-banner.png");
    assert.ok(payload.files.some((file) => file.name === "punishment-header.png"));
    assert.ok(payload.files.some((file) => file.name === "footer-banner.png"));
    assert.deepEqual(payload.allowedMentions, { parse: [] });
    const issuedPayload = punishmentPanel({
        id: "SC-TEST1234",
        memberId: "100000000000000001",
        issuedBy: "100000000000000002",
        issuedAt: 1_800_000_000_000,
        type: "Strike",
        reason: "Test reason",
        expiration: "Never",
        voided: false
    }, { pingTarget: true });
    assert.deepEqual(issuedPayload.allowedMentions, { users: ["100000000000000001"] });
});

test("punishment notice is DMed and failed DMs are reported without throwing", async () => {
    const payload = punishmentPanel({
        id: "SC-TEST1234",
        memberId: "100000000000000001",
        issuedBy: "100000000000000002",
        issuedAt: 1_800_000_000_000,
        type: "Strike",
        reason: "Test reason",
        expiration: "Never",
        voided: false
    });
    let received;
    const success = await sendPunishmentNotice({
        id: "100000000000000001",
        send: async (message) => { received = message; }
    }, payload);
    assert.deepEqual(success, { sent: true });
    assert.equal(received, payload);

    const closed = await sendPunishmentNotice({
        id: "100000000000000001",
        send: async () => { throw Object.assign(new Error("DMs closed"), { code: 50007 }); }
    }, payload);
    assert.deepEqual(closed, { sent: false, reason: "closed" });
});

test("all reusable message panel payloads use Components V2", () => {
    const payloads = [
        ephemeral("Done."),
        panelPayload("Panel", "Text", { sections: [{ title: "Details", content: "More" }] }),
        recordsPanel("History", "100000000000000001", []),
        selfRolePanelPayload([{ id: "100000000000000001", label: "Member" }]),
        ticketPanelPayload(),
        ticketFaqPayload(),
        ticketWelcomePayload("100000000000000001", config.ticketTypes["general-support"])
    ];
    for (const payload of payloads) assertComponentsV2(payload);
});

test("ticket panel includes supplied header/footer artwork and both actions", () => {
    const payload = ticketPanelPayload();
    const container = payload.components[0].toJSON();
    assertComponentsV2(payload);
    assert.equal(container.components[0].items[0].media.url, "attachment://support-header.png");
    assert.equal(container.components.at(-1).items[0].media.url, "attachment://footer-banner.png");
    assert.ok(payload.files.some((file) => file.name === "support-header.png"));
    assert.ok(payload.files.some((file) => file.name === "footer-banner.png"));
    const buttons = container.components.find((component) => component.type === 1).components;
    const menu = container.components.find((component) => component.type === 1
        && component.components[0].type === 3).components[0];
    assert.deepEqual(buttons.map((button) => button.custom_id), ["ticket:faq"]);
    assert.equal(menu.custom_id, "ticket:type");
    assert.deepEqual(menu.options.map((option) => option.value), Object.keys(config.ticketTypes));
});

test("ticket FAQ, embedded selector, and pings are sent only as Components V2 content", () => {
    const faq = ticketFaqPayload();
    const panel = ticketPanelPayload();
    const welcome = ticketWelcomePayload(
        "100000000000000001",
        config.ticketTypes["community-support"]
    );
    assertComponentsV2(faq);
    assert.match(componentText(faq), /FAQ/);
    assertComponentsV2(panel);
    const selectorMenu = panel.components[0].toJSON().components
        .find((component) => component.type === 1 && component.components[0].type === 3)
        .components[0];
    assert.deepEqual(selectorMenu.options.map((option) => option.value), Object.keys(config.ticketTypes));
    assertComponentsV2(welcome);
    assert.equal(welcome.content, undefined);
    assert.match(componentText(welcome), /<@&1551098535427047455>/);
    assert.match(componentText(welcome), /<@&1551098623696306206>/);
    assert.deepEqual(welcome.allowedMentions, {
        users: ["100000000000000001"],
        roles: ["1551098535427047455", "1551098623696306206"]
    });
    const claimed = ticketWelcomePayload(
        "100000000000000001",
        config.ticketTypes["community-support"],
        "100000000000000099"
    );
    assertComponentsV2(claimed);
    assert.deepEqual(claimed.allowedMentions, { parse: [] });
    assert.match(componentText(claimed), /Claimed by/);
    const claimButton = claimed.components[0].toJSON().components
        .find((component) => component.type === 1).components[0];
    assert.equal(claimButton.custom_id, "ticket:claim");
    assert.equal(claimButton.disabled, true);
});

test("Reduced Activity requests post a review panel with decision buttons", () => {
    const payload = reducedActivityRequestPanel({
        id: "RA-ABCDEF12",
        memberId: "100000000000000001",
        reason: "Exams this week",
        until: "2026-11-01",
        requestedAt: 1_800_000_000_000,
        status: "pending"
    });

    test("hiring panel links to the supplied applications channel", () => {
        const payload = hiringAnnouncementPanel();
        assertComponentsV2(payload);
        assert.match(componentText(payload), /currently hiring staff/i);
        const button = payload.components[0].toJSON().components
            .flatMap((component) => component.components || [])
            .find((component) => component.type === 2);
        assert.equal(button.label, "Staff Applications");
        assert.equal(button.url, "https://discord.com/channels/1530706479349502003/1530712619860627647");
    });
    assertComponentsV2(payload);
    assert.match(componentText(payload), /RA-ABCDEF12/);
    assert.match(componentText(payload), /Exams this week/);
    const buttons = payload.components[0].toJSON().components
        .flatMap((component) => component.components || [])
        .filter((component) => component.type === 2);
    assert.deepEqual(buttons.map((button) => button.custom_id), [
        "ra-review:accept:RA-ABCDEF12",
        "ra-review:deny:RA-ABCDEF12"
    ]);
});
