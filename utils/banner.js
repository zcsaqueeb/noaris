import chalk from "chalk";

const banner = () => {
  const text = `Tool được phát triển bởi nhóm tele Airdrop Hunter Siêu Tốc (https://t.me/airdrophuntersieutoc)`;

  const separator = "═".repeat(60);
  return `${chalk.cyan(text)}\n${chalk.white(separator)}`;
};

export default banner;
