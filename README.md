# South Carolina Systems Bot

A Discord.js v14 slash-command bot for South Carolina State Roleplay. Bot panels use Discord Components V2 with separators. Session announcements are text-only by default; optional session-end artwork can be placed in `assets/`.

Server details shown by the bot:

- **Server:** South Carolina State Roleplay | VC Only
- **In-game code:** `RichlandSC`
- **Server owner:** `boogs0522`

## Setup

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env`, add your bot token and Discord server ID, and set the role/channel IDs for the features you plan to use.
3. Invite the bot with the `bot` and `applications.commands` OAuth scopes. Grant only the permissions it needs: View Channels, Send Messages, Embed Links, Read Message History, Manage Channels, Manage Roles, and Ban Members if global ban commands are enabled.
4. Put manageable roles below the bot's highest role. The bot needs access to the configured ticket category, ticket log, session channel, and punishment channel.
5. Run `npm install`, then `npm start`. Guild slash commands register when the bot connects.

Keep `.env` private. Do not commit or share your bot token.

## Commands

- **Sessions:** `/session-start`, `/session-end`, `/session-low`, `/wl-session-start`, `/wl-session-end`
- **Tickets:** `/ticket-panel`, `/claim`, `/add`, `/remove`, `/close`
- **Punishments:** `/punish`, `/punishment-edit`, `/punishment-history`, `/punishment-void`, `/my-punishments`, `/appeal`, `/suspension-view`
- **Staff:** `/interview-pass`, `/staff-accept`, `/staff-deny`, `/reinstate`, `/resign`, `/ra`, `/request-ra`, `/ra-admin`
- **Community and utilities:** `/ban`, `/unban`, `/queue-add`, `/queue-remove`, `/say`, `/self-roles`, `/shop`, `/tweet`, `/twitter`, `/help`, `/ping`, `/serverinfo`

Staff management commands require Administrator permission or `MODERATOR_ROLE_ID`, except `/resign`, `/appeal`, `/my-punishments`, and Reduced Activity requests, which are member-facing. `/ra` and `/request-ra` post requests to channel `1561239693344120893` by default with staff-only Accept/Deny buttons. Decisions are saved and DMed to the requester; accepting also assigns the role configured by `RA_ROLE_ID`. Set that role ID in `.env` before accepting requests. `/ra-admin` ends an accepted request and removes its role. Global ban/unban attempts each server the bot is in and reports partial failures rather than claiming an all-server success.

`/ticket-panel` posts a Components V2 support panel with an FAQ button and an embedded ticket selector. Choosing a ticket type creates the ticket directly. Staff on the assigned team can use the Claim Ticket button in its V2 welcome panel or `/claim`. General Support routes to category `1532112428324884731` and pings the Support Team (`TICKET_STAFF_ROLE_ID`, default `1532111365370806333`); Community Support routes to `1532112366202912839` and pings Management (`1551098535427047455`) and Directorship (`1551098623696306206`); Staff Report routes to `1532112504929648843` and pings Internal Affairs (`1530786131292197004`); Partnership routes to `1532112647607029970` and pings Management (`1551098535427047455`). Each ticket is private to its owner, its assigned team, and moderators. `/close` requires `TICKET_LOG_CHANNEL_ID`; it saves a text transcript before deleting the ticket. The panel uses `assets/support-header.png` at the top and the shared `assets/footer-banner.png` at the bottom. `SESSION_CHANNEL_ID` and `PUNISHMENT_CHANNEL_ID` choose announcement destinations; when unset, those commands post in the channel where they were run.

`SELF_ROLES` is a comma-separated list of `role-id:Display name` entries, up to 25 roles. `/shop` requires `SHOP_URL`. `JOIN_SERVER_URL` adds a join link to session-start announcements. Session notifications require `SESSION_NOTIFICATION_ROLE_ID`. Reduced Activity requests use `RA_REQUEST_CHANNEL_ID` (defaults to `1561239693344120893`) and approvals require `RA_ROLE_ID`. The staff-hiring announcement is posted on startup and every 3 hours to `HIRING_ANNOUNCEMENT_CHANNEL_ID` (defaults to `1530781043479543918`) with a button linking to `APPLICATIONS_CHANNEL_URL`.

Punishment records, appeals, queue entries, Reduced Activity requests, and session status are saved in `data/records.json`, created automatically at runtime and ignored by Git.

Run `npm test` to validate JavaScript syntax.

## Artwork

The supplied support, session, and punishment banners plus the shared footer banner are in `assets/`. Public Components V2 panels attach and display the footer at the bottom, session panels use the session banner at the top, punishment panels use the punishment banner, and the ticket panel uses the supplied support banner. See [assets/README.md](./assets/README.md).
