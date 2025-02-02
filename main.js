import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import cloudscraper from "cloudscraper";
import banner from "./utils/banner.js";

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

    if (proxyConfig) {
      console.log(chalk.blue(`[📡] Running with proxy: ${proxyConfig}`));
    } else {
      console.log(chalk.yellow(`[⚠️] Running without proxy`));
    }
  }

  static async loadAccounts(configPath = path.join(process.cwd(), "accounts.json")) {
    try {
      const configData = await fs.readFile(configPath, "utf8");
      return JSON.parse(configData);
    } catch (error) {
      console.error(chalk.red("Failed to load accounts:"), error.message);
      process.exit(1);
    }
  }

  static async loadProxies(proxyPath = path.join(process.cwd(), "proxy.txt")) {
    try {
      const proxyData = await fs.readFile(proxyPath, "utf8");
      return proxyData.split("\n").filter((line) => line.trim());
    } catch (error) {
      console.error(chalk.red("Failed to load proxies:"), error.message);
      return [];
    }
  }

  getRequestConfig() {
    const config = {
      headers: {
        Authorization: `Bearer ${this.account.token}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
        Referer: this.baseUrls.secApi,
        "Content-Type": "application/json",
      },
    };

    if (this.proxyConfig) {
      config.proxy = this.proxyConfig;
    }

    return config;
  }

  async toggleDevice(state = "ON") {
    try {
      console.log(`Toggle state (${state}) sending to backend...`);
      const payload = {
        walletAddress: this.account.walletAddress,
        state: state,
        deviceHash: this.deviceHash,
      };

      const response = await cloudscraper.post(`${this.baseUrls.secApi}/toggle`, {
        json: payload,
        headers: this.getRequestConfig().headers,
        proxy: this.proxyConfig,
      });

      this.toggleState = state === "ON";
      this.logSuccess("Device Toggle", response);
      console.log(`Toggle state (${state}) sent to backend.`);
    } catch (error) {
      // this.logError("Toggle Error", error);
    }
  }

  async sendHeartbeat() {
    try {
      console.log("Message production initiated");
      const payload = {
        topic: "device-heartbeat",
        inputData: {
          walletAddress: this.account.walletAddress,
          deviceHash: this.deviceHash.toString(),
          isInstalled: this.isInstalled,
          toggleState: this.toggleState,
          whitelistedUrls: this.whitelistedUrls,
        },
      };

      const response = await cloudscraper.post(`${this.baseUrls.secApi}/produce-to-kafka`, {
        json: payload,
        headers: this.getRequestConfig().headers,
        proxy: this.proxyConfig,
      });

      console.log("Heartbeat sent to backend.");
      this.logSuccess("Heartbeat", response);
    } catch (error) {
      // this.logError("Heartbeat Error", error.message);
    }
  }

  async getWalletDetails() {
    try {
      const payload = {
        walletAddress: this.account.walletAddress,
      };

      const response = await cloudscraper.post(`${this.baseUrls.testnetApi}/walletDetails`, {
        json: payload,
        headers: this.getRequestConfig().headers,
        proxy: this.proxyConfig,
      });

      if (!response.error) {
        const details = response.details;
        this.logWalletDetails(details);
      } else {
        this.logError("Wallet Details", response);
      }
    } catch (error) {
      this.logError("Wallet Details Fetch", error.message);
    }
  }

  async startHeartbeatCycle() {
    try {
      await this.toggleDevice("ON");
      console.log("Installed script executed successfully!");
      await this.sendHeartbeat();

      let cycleCount = 0;
      const timer = setInterval(async () => {
        try {
          cycleCount++;
          this.uptimeMinutes++;

          if (cycleCount % 5 === 0) {
            console.log("Service worker wake-up alarm triggered.");
          }

          if (!this.toggleState) {
            await this.toggleDevice("ON");
          }

          await this.sendHeartbeat();
          await this.getWalletDetails();
          console.log(chalk.green(`[${new Date().toLocaleTimeString()}] Minute ${this.uptimeMinutes} completed`));
        } catch (cycleError) {
          console.log("Heartbeat stopped.");
          this.logError("Heartbeat Cycle", cycleError);
          this.toggleState = false;
        }
      }, 60000);

      process.on("SIGINT", async () => {
        clearInterval(timer);
        await this.toggleDevice("OFF");
        console.log(chalk.yellow("\nBot stopped. Final uptime:", this.uptimeMinutes, "minutes"));
        process.exit();
      });
    } catch (error) {
      this.logError("Heartbeat Cycle Start", error.message);
    }
  }

  logSuccess(action, data) {
    console.log(chalk.green(`[✔] ${action} Success:`), data);
  }

  logError(action, error) {
    console.error(chalk.red(`[✖] ${action} Error:`), error.message || error);
  }

  logWalletDetails(details) {
    const earnings = this.uptimeMinutes * (details.activeRatePerMinute || 0);
    console.log("\n" + chalk.green(`📊 Wallet ${this.account.walletAddress} | Points: ${earnings.toFixed(4)} | Rank: ${details.rank} | Uptime: ${this.uptimeMinutes}`));
  }
}

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

async function main() {
  try {
    console.log(banner());
    const useProxy = false; // Automatically select "n" for proxy usage
    let accounts = await DeviceHeartbeatBot.loadAccounts();
    accounts = Object.values(accounts);
    let proxies = [];
    if (useProxy) {
      proxies = await DeviceHeartbeatBot.loadProxies();
      if (proxies.length === 0) {
        console.log(chalk.yellow("[⚠️] No proxies found in proxy.txt, running without proxy"));
      }
    }

    const bots = accounts.map((acc, index) => {
      const account = decodeJWT(acc.token);
      if (account.payload) {
        if (Date.now() < Math.floor(account.payload.exp)) {
          console.log(chalk.yellow(`[Account ${index + 1}] Token expired for account ${account.payload.wallet_address}, skipping...`));
          return null;
        }
        const proxy = proxies.length > 0 ? proxies[index % proxies.length] : null;
        return new DeviceHeartbeatBot(acc, proxy);
      }
    });

    for (const bot of bots) {
      if (bot) {
        bot.startHeartbeatCycle();
      }
    }
  } catch (error) {
    console.error(chalk.red("Initialization Error:"), error);
  }
}

main();

export default DeviceHeartbeatBot;
