import { hashPassword } from "../src/lib/password-utils.js";

const passwords: any = {
  "WH-1001": "admin123",
  "WH-1002": "ops123",
  "WH-1003": "lead123",
  "WH-1004": "lead123",
  "WH-1005": "recv123",
  "WH-1006": "pick123",
  "WH-1007": "bill123",
};

for (const [badgeId, password] of Object.entries(passwords)) {
  hashPassword(password).then((hash) => {
    console.log(`${badgeId}: ${hash}`);
  });
}
