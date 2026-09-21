import { BadRequestException } from "@nestjs/common";

export const cryptoAssets = ["USDT", "BTC", "ETH"] as const;
export type CryptoAsset = typeof cryptoAssets[number];
export const cryptoNetworks: Record<CryptoAsset, readonly string[]> = {
  USDT: ["TRON (TRC20)", "Ethereum (ERC20)"],
  BTC: ["Bitcoin"],
  ETH: ["Ethereum"],
};

function addressPattern(network: string) {
  if (network.startsWith("Ethereum")) return /^0x[0-9a-fA-F]{40}$/;
  if (network.startsWith("TRON")) return /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
  return /^(bc1[ac-hj-np-z02-9]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/;
}

export function validateCryptoMethod(key: string, network: string, address: string, rate: number) {
  const asset = key.replace("crypto_", "").toUpperCase() as CryptoAsset;
  validateCryptoDestination(asset, network, address);
  if (rate <= 0) throw new BadRequestException("Set the USD value of one coin before enabling it.");
}

export function validateCryptoDestination(asset: CryptoAsset, network: string, address: string) {
  if (!cryptoNetworks[asset].includes(network)) throw new BadRequestException("Select a supported network for this coin.");
  if (!addressPattern(network).test(address)) throw new BadRequestException(`Enter a valid ${network} wallet address.`);
}

export function validateCryptoTransaction(network: string, hash: string) {
  const valid = network.startsWith("Ethereum") ? /^0x[0-9a-fA-F]{64}$/.test(hash) : /^[0-9a-fA-F]{64}$/.test(hash);
  if (!valid) throw new BadRequestException(`Enter a valid ${network} transaction hash.`);
  return network.startsWith("Ethereum") ? `0x${hash.slice(2).toLowerCase()}` : hash.toLowerCase();
}

export function cryptoDestination(asset: CryptoAsset, network: string, address: string) {
  validateCryptoDestination(asset, network, address);
  return `${asset} | ${network} | ${address}`;
}

export function parseCryptoDestination(destination: string) {
  const asset = cryptoAssets.find(item => new RegExp(`\\b${item}\\b`, "i").test(destination));
  const network = /TRC20|TRON/i.test(destination) ? "TRON (TRC20)" : /ERC20/i.test(destination) ? "Ethereum (ERC20)" : /BITCOIN/i.test(destination) ? "Bitcoin" : /ETHEREUM/i.test(destination) ? "Ethereum" : "";
  const address = destination.match(/0x[0-9a-fA-F]{40}|T[1-9A-HJ-NP-Za-km-z]{33}|bc1[ac-hj-np-z02-9]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34}/)?.[0];
  if (!asset || !network || !address) throw new BadRequestException("Include USDT, BTC, or ETH; its network; and a valid wallet address.");
  validateCryptoDestination(asset, network, address);
  return { asset, network, address };
}
// Round up to the asset's smallest supported unit using integer arithmetic.
export function quoteCrypto(cents: number, rateCents: number, asset: CryptoAsset) {
  const decimals = asset === "USDT" ? 6 : asset === "BTC" ? 8 : 18;
  const scale = 10n ** BigInt(decimals); const rate = BigInt(rateCents);
  const units = (BigInt(cents) * scale + rate - 1n) / rate;
  return `${units / scale}.${(units % scale).toString().padStart(decimals, "0")}`;
}
