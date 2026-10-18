const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "data");
const dataFile = path.join(dataDirectory, "records.json");

function emptyState() {
    return {
        sessions: { regular: null, whitelist: null },
        punishments: [],
        reducedActivity: [],
        queue: []
    };
}

function load() {
    try {
        const saved = JSON.parse(fs.readFileSync(dataFile, "utf8"));
        const initial = emptyState();
        return {
            ...initial,
            ...saved,
            sessions: { ...initial.sessions, ...saved.sessions },
            punishments: Array.isArray(saved.punishments) ? saved.punishments : [],
            reducedActivity: Array.isArray(saved.reducedActivity) ? saved.reducedActivity : [],
            queue: Array.isArray(saved.queue) ? saved.queue : []
        };
    } catch (error) {
        if (error.code === "ENOENT") return emptyState();
        throw new Error(`Could not load bot records: ${error.message}`);
    }
}

function save(state) {
    fs.mkdirSync(dataDirectory, { recursive: true });
    const temporaryFile = `${dataFile}.tmp`;
    fs.writeFileSync(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryFile, dataFile);
}

function update(callback) {
    const state = load();
    const result = callback(state);
    save(state);
    return result;
}

function createId(prefix) {
    return `${prefix}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

module.exports = { createId, load, save, update };
