import { BadRequestException } from "@nestjs/common";

export const cryptoAssets = ["USDT", "BTC", "ETH"] as const;
export type CryptoAsset = typeof cryptoAssets[number];
export function validateCryptoMethod(key: string, network: string, address: string, rate: number) {
  const asset = key.replace("crypto_", "").toUpperCase();
  const networks = asset === "USDT" ? ["TRON (TRC20)", "Ethereum (ERC20)"] : asset === "BTC" ? ["Bitcoin"] : ["Ethereum"];
  if (!networks.includes(network)) throw new BadRequestException("Select a supported network for this coin.");
  const format = network.startsWith("Ethereum") ? /^0x[0-9a-fA-F]{40}$/ : network.startsWith("TRON") ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/ : /^(bc1[ac-hj-np-z02-9]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/;
  if (!format.test(address)) throw new BadRequestException("Enter a wallet address in the selected network's format.");
  if (rate <= 0) throw new BadRequestException("Set the USD value of one coin before enabling it.");
}
// Round up to the asset's smallest supported unit using integer arithmetic.
export function quoteCrypto(cents: number, rateCents: number, asset: CryptoAsset) {
  const decimals = asset === "USDT" ? 6 : asset === "BTC" ? 8 : 18;
  const scale = 10n ** BigInt(decimals); const rate = BigInt(rateCents);
  const units = (BigInt(cents) * scale + rate - 1n) / rate;
  return `${units / scale}.${(units % scale).toString().padStart(decimals, "0")}`;
}
