import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import cloudscraper from "cloudscraper";
import banner from "./utils/banner.js";
import readline from "readline";

class DeviceHeartbeatBot {
  constructor(account, proxyConfig = null) {
    this.account = account;
    this.proxyConfig = proxyConfig;
    this.baseUrls = {
      secApi: "https://naorisprotocol.network/sec-api/api",
      testnetApi: "https://naorisprotocol.network/testnet-api/api/testnet",
    };
    this.uptimeMinutes = 0;
    this.deviceHash = account.deviceHash;
    this.toggleState = true;
    this.whitelistedUrls = ["naorisprotocol.network", "google.com"];
    this.isInstalled = true;

    console.log(chalk.blue(`[📡] Running with ${proxyConfig ? "proxy" : "no proxy"}: ${proxyConfig || "None"}`));
  }

  static async loadAccounts() {
    try {
      return JSON.parse(await fs.readFile("accounts.json", "utf8"));
    } catch {
      return [];
    }
  }

  static async loadProxies() {
    try {
      return (await fs.readFile("proxy.txt", "utf8")).split("\n").map((p) => p.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  getRequestConfig() {
    return {
      headers: {
        Authorization: `Bearer ${this.account.token}`,
        "User-Agent": "Mozilla/5.0",
        Referer: this.baseUrls.secApi,
        "Content-Type": "application/json",
      },
      proxy: this.proxyConfig,
    };
  }

  async toggleDevice(state = "ON") {
    return cloudscraper.post(`${this.baseUrls.secApi}/toggle`, {
      json: { walletAddress: this.account.walletAddress, state, deviceHash: this.deviceHash },
      headers: this.getRequestConfig().headers,
      proxy: this.proxyConfig,
    }).catch(() => {});
  }

  async sendHeartbeat() {
    return cloudscraper.post(`${this.baseUrls.secApi}/produce-to-kafka`, {
      json: {
        topic: "device-heartbeat",
        inputData: {
          walletAddress: this.account.walletAddress,
          deviceHash: this.deviceHash,
          isInstalled: this.isInstalled,
          toggleState: this.toggleState,
          whitelistedUrls: this.whitelistedUrls,
        },
      },
      headers: this.getRequestConfig().headers,
      proxy: this.proxyConfig,
    }).catch(() => {});
  }

  async getWalletDetails() {
    return cloudscraper.post(`${this.baseUrls.testnetApi}/walletDetails`, {
      json: { walletAddress: this.account.walletAddress },
      headers: this.getRequestConfig().headers,
      proxy: this.proxyConfig,
    }).catch(() => {});
  }

  async startHeartbeatCycle() {
    await this.toggleDevice("ON");
    await this.sendHeartbeat();

    const interval = setInterval(async () => {
      this.uptimeMinutes++;
      await Promise.all([this.sendHeartbeat(), this.getWalletDetails()]);
      console.log(chalk.green(`[✔] Minute ${this.uptimeMinutes} complete`));
    }, 60000);

    process.on("SIGINT", async () => {
      clearInterval(interval);
      await this.toggleDevice("OFF");
      console.log(chalk.yellow(`\nBot stopped. Final uptime: ${this.uptimeMinutes} min`));
      process.exit();
    });
  }
}

async function main() {
  console.log(banner());
  const useProxy = await new Promise((resolve) => {
    readline.createInterface({ input: process.stdin, output: process.stdout })
      .question(chalk.white("Use proxies? (y/n) > "), (answer) => resolve(answer.toLowerCase() === "y"));
  });

  const [accounts, proxies] = await Promise.all([DeviceHeartbeatBot.loadAccounts(), useProxy ? DeviceHeartbeatBot.loadProxies() : []]);
  const bots = accounts.map((acc, i) => new DeviceHeartbeatBot(acc, proxies[i % proxies.length]));

  await Promise.all(bots.map((bot) => bot.startHeartbeatCycle()));
}

main();
export default DeviceHeartbeatBot;
