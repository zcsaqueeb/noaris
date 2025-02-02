import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import axios from "axios";
import { fileURLToPath } from "url";
import readline from "readline";
import { HttpsProxyAgent } from "https-proxy-agent";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class DeviceHeartbeatBot {
  constructor(account, proxyConfig = null) {
    this.account = account;
    this.proxyConfig = proxyConfig ? new HttpsProxyAgent(proxyConfig) : null;
    this.baseUrls = {
      secApi: "https://naorisprotocol.network/sec-api/api",
      testnetApi: "https://naorisprotocol.network/testnet-api/api/testnet",
    };
    this.deviceHash = account.deviceHash;
    this.toggleState = true;

    if (proxyConfig) {
      console.log(chalk.blue(`[📡] Running with proxy: ${proxyConfig}`));
    } else {
      console.log(chalk.yellow(`[⚠️] Running without proxy`));
    }
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

  static async loadProxies(proxyPath = path.join(__dirname, "proxy.txt")) {
    try {
      const proxyData = await fs.readFile(proxyPath, "utf8");
      return proxyData.split("\n").filter((line) => line.trim());
    } catch (error) {
      console.error(chalk.red("Failed to load proxies:"), error.message);
      return [];
    }
  }

  async sendRequest(url, method, payload) {
    try {
      const config = {
        method,
        url,
        data: payload,
        headers: {
          Authorization: `Bearer ${this.account.token}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          "Content-Type": "application/json",
        },
        httpsAgent: this.proxyConfig,
      };

      const response = await axios(config);
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

async function askForProxyUsage() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.white("Use proxies? (y/n): "), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

async function main() {
  console.log(chalk.cyan("Starting Naoris Auto-Bot..."));

  const useProxy = await askForProxyUsage();
  let accounts = await DeviceHeartbeatBot.loadAccounts();
  let proxies = useProxy ? await DeviceHeartbeatBot.loadProxies() : [];

  const bots = Object.values(accounts).map((acc, index) => {
    const proxy = proxies.length > 0 ? proxies[index % proxies.length] : null;
    return new DeviceHeartbeatBot(acc, proxy);
  });

  for (const bot of bots) bot.startHeartbeatCycle();
}

main();
