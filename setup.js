import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
const generateDeviceHash = () => {
  // Generates a unique device hash
  return parseInt(uuidv4().replace(/-/g, "").slice(0, 8), 16).toString();
};

function decodeJWT(token) {
  const [header, payload, signature] = token.split(".");

  // Decode Base64 URL
  const decodeBase64Url = (str) => {
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(str));
  };

  const decodedHeader = decodeBase64Url(header);
  const decodedPayload = decodeBase64Url(payload);

  return {
    header: decodedHeader,
    payload: decodedPayload,
    signature: signature, // You might not need to decode the signature  jZZc-E5AZ6S8Y6vO-I-Oj2a296AaOWeeCElkN9FTk08
  };
}

async function loadAccounts(configPath = path.join(process.cwd(), "accounts.json")) {
  try {
    const configData = await fs.readFile(configPath, "utf8");
    return JSON.parse(configData);
  } catch (error) {
    console.error(chalk.red("Failed to load accounts:"), error.message);
    process.exit(1);
  }
}

async function loadTokens(filePath = path.join(process.cwd(), "tokens.txt")) {
  try {
    const tokenData = await fs.readFile(filePath, "utf8");
    return tokenData.split("\n").filter((token) => token.trim() !== ""); // Split and filter empty lines
  } catch (error) {
    console.error(chalk.red("Failed to load tokens:"), error.message);
    process.exit(1);
  }
}

const saveData = async (id, data) => {
  try {
    // Read and parse the existing data
    const fileData = await fs.readFile("accounts.json", "utf8");
    const datas = JSON.parse(fileData);

    // Update the data
    datas[id] = data;

    // Write the updated data to token.json
    await fs.writeFile("accounts.json", JSON.stringify(datas, null, 4));
    console.log("Data saved successfully.");
  } catch (error) {
    console.error("Failed to save data:", error.message);
  }
};

const main = async () => {
  const accounts = await loadAccounts();
  const tokens = await loadTokens();
  for (let i = 0; i < tokens.length; i++) {
    const account = decodeJWT(tokens[i]);
    if (account.payload) {
      const walletAddress = account.payload.wallet_address;
      if (Date.now() < Math.floor(account.payload.exp)) {
        console.log(chalk.yellow(`[Account ${index + 1}] Token expired for account ${walletAddress}, skipping...`));
        continue;
      }
      const deviceHash = accounts[walletAddress]?.deviceHash || generateDeviceHash();
      const payload = {
        walletAddress,
        token: tokens[i],
        deviceHash,
      };
      await saveData(walletAddress, payload);
    }
  }
};

main();
