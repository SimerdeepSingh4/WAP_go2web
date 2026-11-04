import fs from "node:fs";
import webpush from "web-push";

const contact = process.argv[2];
const subject = contact?.includes(":") ? contact : `mailto:${contact || ""}`;
if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject) && !/^https:\/\/[^\s]+$/.test(subject)) {
    throw new Error("Provide a contact email or public HTTPS contact URL. Existing keys will be preserved.");
}
let content = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const keys = webpush.generateVAPIDKeys();
const hasPublic = /^VAPID_PUBLIC_KEY=.+$/m.test(content), hasPrivate = /^VAPID_PRIVATE_KEY=.+$/m.test(content);
if (hasPublic !== hasPrivate) throw new Error("Only one VAPID key exists. Restore the matching key before continuing; existing subscriptions must keep their key pair.");
if (!hasPublic) content += `\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`;
content = /^VAPID_SUBJECT=.*$/m.test(content) ? content.replace(/^VAPID_SUBJECT=.*$/m, () => `VAPID_SUBJECT=${subject}`) : content + `\nVAPID_SUBJECT=${subject}\n`;
fs.writeFileSync(".env", content);
console.log("Browser push configured. Existing keys were preserved. Restart the backend to apply contact changes.");
