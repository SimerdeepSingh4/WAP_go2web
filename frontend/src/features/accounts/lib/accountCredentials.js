const PASSWORD_SETS = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnpqrstuvwxyz",
  digits: "23456789",
};
const ALL_CHARS = PASSWORD_SETS.upper + PASSWORD_SETS.lower + PASSWORD_SETS.digits;

function pickChar(pool) {
  const bytes = new Uint32Array(1);
  window.crypto.getRandomValues(bytes);
  return pool[bytes[0] % pool.length];
}

export function generateTemporaryPassword(length = 12) {
  const chars = [
    pickChar(PASSWORD_SETS.upper),
    pickChar(PASSWORD_SETS.lower),
    pickChar(PASSWORD_SETS.digits),
  ];
  while (chars.length < length) {
    chars.push(pickChar(ALL_CHARS));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const bytes = new Uint32Array(1);
    window.crypto.getRandomValues(bytes);
    const j = bytes[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function buildCredentialsShareText({ brandName = "Promotion", loginUrl, username, email, password, isReset }) {
  const heading = isReset ? `Your ${brandName} password has been updated:` : `Your ${brandName} account is ready:`;
  return [
    heading,
    `Login URL: ${loginUrl}`,
    `Username: ${username}`,
    email ? `Email: ${email}` : null,
    `Password: ${password}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildWhatsAppShareUrl(phone, text) {
  const digits = String(phone || "").replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export const accountCreationPlaceholders = {
  username: "Enter name",
  email: "Enter email",
  companyName: "Enter company name",
  phone: "Enter phone number",
  password: "Enter password",
  dailyCampaignLimit: "Enter daily limit",
  ratePerMsg: "Enter rate",
};
