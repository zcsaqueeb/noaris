import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import axios from "axios";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class DeviceHeartbeatBot {
  constructor(account) {
    this.account = account;
    this.baseUrls = {
      secApi: "https://naorisprotocol.network/sec-api/api",
      testnetApi: "https://naorisprotocol.network/testnet-api/api/testnet",
    };
    this.deviceHash = account.deviceHash;
    this.toggleState = true;
  }

  static async loadAccounts(configPath = path.join(__dirname, "accounts.json")) {
    try {
      const configData = await fs.readFile(configPath, "utf8");
      return JSON.parse(configData);
    } catch (error) {
      console.error(chalk.red("Failed to load accounts:"), error.message);
      process.exit(1);
    }
  }

  async sendRequest(url, method, payload) {
    try {
      const response = await axios({
        method,
        url,
        data: payload,
        headers: {
          Authorization: `Bearer ${this.account.token}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          "Content-Type": "application/json",
        },
      });

      return response.data;
    } catch (error) {
      console.error(chalk.red(`Error in ${method} request to ${url}:`), error.message);
    }
  }

  async toggleDevice(state = "ON") {
    console.log(`Toggling device state to ${state}...`);
    const payload = { walletAddress: this.account.walletAddress, state, deviceHash: this.deviceHash };
    await this.sendRequest(`${this.baseUrls.secApi}/toggle`, "POST", payload);
    this.toggleState = state === "ON";
  }

  async sendHeartbeat() {
    console.log("Sending heartbeat...");
    const payload = {
      topic: "device-heartbeat",
      inputData: {
        walletAddress: this.account.walletAddress,
        deviceHash: this.deviceHash,
        isInstalled: true,
        toggleState: this.toggleState,
        whitelistedUrls: ["naorisprotocol.network", "google.com"],
      },
    };

    await this.sendRequest(`${this.baseUrls.secApi}/produce-to-kafka`, "POST", payload);
  }

  async getWalletDetails() {
    const payload = { walletAddress: this.account.walletAddress };
    const data = await this.sendRequest(`${this.baseUrls.testnetApi}/walletDetails`, "POST", payload);
    if (data) {
      console.log(chalk.green(`📊 Wallet: ${this.account.walletAddress} | Points: ${data.points} | Rank: ${data.rank}`));
    }
  }

  async startHeartbeatCycle() {
    await this.toggleDevice("ON");
    await this.sendHeartbeat();

    let cycleCount = 0;
    setInterval(async () => {
      try {
        cycleCount++;
        if (cycleCount % 5 === 0) console.log("Service worker wake-up alarm triggered.");
        if (!this.toggleState) await this.toggleDevice("ON");

        await this.sendHeartbeat();
        await this.getWalletDetails();
        console.log(chalk.green(`[${new Date().toLocaleTimeString()}] Heartbeat cycle complete.`));
      } catch (error) {
        console.error(chalk.red("Heartbeat error:"), error.message);
        this.toggleState = false;
      }
    }, 60000);
  }
}

async function main() {
  console.log(chalk.cyan("Starting Naoris Auto-Bot..."));

  let accounts = await DeviceHeartbeatBot.loadAccounts();
  const bots = Object.values(accounts).map((acc) => new DeviceHeartbeatBot(acc));

  for (const bot of bots) bot.startHeartbeatCycle();
}

main();
